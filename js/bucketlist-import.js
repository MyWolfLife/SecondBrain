// ============================================================
// bucketlist-import.js — Bucket List: import places from a screenshot with an LLM
//
// Flow: stage screenshot(s) (paste / gallery / camera) + optional caption text
//       → LLM returns JSON {items:[...]} → REVIEW screen (always) → save selected items.
//
// Alternate path (no LLM key needed): "Copy prompt" → run it in any chat app with the
// screenshot → paste the JSON it returns → same review screen.
//
// Depends on bucketlist.js (BL_KINDS, _blCanonPlace, _blPrecision, _blTimingText, _blLoadItems...),
// blLoadLlm/blCallLlm/blKindGuide/blPlaceRules (bucketlist.js) and photos.js (compressImage).
// Plan document: saveplacesPlan.md §6
// ============================================================

var BL_IMPORT_MAX_IMAGES = 6;

var _blimpImages = [];       // staged screenshots: [{ file, llmData }]  (llmData = base64 sized for the LLM)
var _blimpItems  = [];       // normalized records awaiting review
var _blimpSource = 'llm-image';
var _blimpRaw    = '';       // raw LLM text, shown in the review screen for prompt tuning
var _blimpBusy   = false;
var _blimpSharedUrl = '';   // link shared from the phone share sheet; saved on each imported item
var _blimpLinks  = [];      // every link to save on each imported item: the shared link + any URLs found in the caption box

// ============================================================
// Prompt
// ============================================================

/** A worked example of the reply format. The prompt says its content is illustrative only. */
var BL_IMPORT_EXAMPLE = JSON.stringify({
    items: [
        {
            name: 'Amicalola Falls', kind: 'waterfall', country: 'United States', region: 'Georgia', city: 'Dawsonville',
            venue: null, lat: null, lng: null,
            timing: { type: 'months', months: [3, 4, 5], startDate: null, endDate: null, yearly: false, label: 'strongest flow in spring' },
            why: 'Tallest cascading waterfall in the Southeast, with a short walk to the viewing platform.',
            notes: 'State park parking fee.', website: null, tags: ['waterfall', 'hike'],
            confidence: 'high', evidence: 'Overlay text: "Amicalola Falls - go in spring"'
        },
        {
            name: 'Magical Nights of Lights', kind: 'event', country: 'United States', region: 'Georgia', city: 'Buford',
            venue: 'Lake Lanier Islands', lat: null, lng: null,
            timing: { type: 'range', months: [], startDate: '2026-11-20', endDate: '2026-12-31', yearly: true, label: 'drive-through light show' },
            why: 'Drive-through holiday light show along the lake.',
            notes: null, website: null, tags: ['christmas', 'lights'],
            confidence: 'medium', evidence: 'Caption: "Nights of Lights at Lanier Islands, Nov 20 - Dec 31"'
        }
    ],
    unreadable: false,
    message: null
});

/**
 * Build the prompt as two parts: `system` (the instructions) and `user` (the user's own text).
 * The screenshots are attached to the user message by the caller.
 * `hint` is optional caption/comment/hint text typed or pasted by the user.
 */
async function _blimpBuildPromptParts(hint) {
    var home = '';
    try {
        var main = await userCol('settings').doc('main').get();
        home = (main.exists && main.data().cityState) ? main.data().cityState.trim() : '';
    } catch (e) { /* optional context only */ }

    var system = [
        'You extract travel ideas for a personal bucket list from screenshots of social media posts, reels, articles, maps and comments.',
        "Today's date: " + _blTodayIso() + '.' + (home ? ' The user lives near ' + home + '.' : ''),
        '',
        'OUTPUT',
        'Return ONLY one JSON object, with no prose and no markdown fences, in exactly this shape:',
        '{',
        '  "items": [',
        '    {',
        '      "name": string,',
        '      "kind": one of [' + Object.keys(BL_KINDS).join(', ') + '],',
        '      "country": string or null,',
        '      "region": string or null,',
        '      "city": string or null,',
        '      "venue": string or null,',
        '      "lat": number or null,',
        '      "lng": number or null,',
        '      "timing": { "type": "none" | "months" | "date" | "range", "months": [integers 1-12],',
        '                  "startDate": "YYYY-MM-DD" or null, "endDate": "YYYY-MM-DD" or null,',
        '                  "yearly": boolean, "label": string or null },',
        '      "why": string or null,',
        '      "notes": string or null,',
        '      "website": string or null,',
        '      "tags": [string],',
        '      "confidence": "high" | "medium" | "low",',
        '      "evidence": string',
        '    }',
        '  ],',
        '  "unreadable": boolean,',
        '  "message": string or null',
        '}',
        '',
        'READING THE IMAGES',
        '- Several images may be parts of the same post (video frames, the caption, the comments). Combine them and never list the same place twice.',
        '- Useful: on-screen text, the caption, the location tag (the pin line under the account name), signs and recognizable landmarks, and comments that name or correct the location.',
        '- Ignore: account names and handles, like and follower counts, "Follow", "Sponsored", music or audio credits, hashtags that are not places, and app buttons.',
        '- If commenters disagree about where it is, go with the clear majority and use confidence "medium" or "low".',
        '- Text typed by the user (in the user message) is the most reliable source and overrides unclear image text.',
        '',
        'WHAT COUNTS AS AN ITEM',
        '- One item per distinct place or event. A "top 10 waterfalls" post is ten items, but only the ones actually named or clearly identifiable.',
        '- Never invent a place. If nothing identifiable is present, return "items": [], "unreadable": true, and say why in "message".',
        '- "name" is the place or event itself (e.g. "Amicalola Falls", "Magical Nights of Lights").',
        '- "venue": only when the name is not the site itself, e.g. an event held at a park (name = the event, venue = the park). Otherwise null.',
        '',
        'KIND (use exactly one of these keys)',
        blKindGuide(),
        '',
        'LOCATION',
        blPlaceRules(),
        '- "lat" and "lng": only when coordinates are actually shown (e.g. a map screenshot). Otherwise null.',
        '',
        'TIMING',
        '- "months" when the content gives a time of year. Use the season as it applies at that place: fall color in New England is [9,10] but in the Smoky Mountains [10,11]; spring wildflowers in the US South are [3,4,5]; seasons are reversed in the southern hemisphere (fall in New Zealand is [3,4,5]). "In May" is [5].',
        '- "date" or "range" for events with specific dates. Use today\'s date to choose the year (the next upcoming occurrence). Set "yearly": true for annual events such as festivals and holiday lights.',
        '- Otherwise "type": "none". Do not make up a best time, except a widely known peak season for that kind of sight (e.g. cherry blossoms in Kyoto are [3,4]).',
        '- "label": a short phrase such as "peak fall color" or "drive-through light show".',
        '',
        'OTHER FIELDS',
        '- "why": one sentence, based on the content, on why it is worth visiting.',
        '- "notes": practical details that are shown (cost, hours, difficulty, parking, tips), otherwise null.',
        '- "website": only a web address that is actually visible in the images or text. Never guess one.',
        '- "tags": 1 to 4 short lowercase words.',
        '- "confidence": "high" when the place is clearly named; "medium" when you relied on general knowledge or partial text; "low" when it is blurry, ambiguous, or recognized from scenery alone.',
        '- "evidence": a short quote or description of what in the images supports the item.',
        '',
        'EXAMPLE of the format (the content is illustrative only; do not copy it):',
        BL_IMPORT_EXAMPLE
    ].join('\n');

    var user = hint
        ? 'Text from the user (caption, comments or a hint):\n' + hint + '\n\nExtract the bucket list places from this text and any attached screenshots.'
        : 'Extract the bucket list places from the attached screenshots.';

    return { system: system, user: user };
}

/** The whole prompt as one block of text, for "Copy prompt" (pasting into any chat app). */
async function _blimpBuildPrompt(hint) {
    var parts = await _blimpBuildPromptParts(hint);
    return parts.system + '\n\n' + parts.user;
}

// ============================================================
// Links typed or pasted into the caption box
// ============================================================

/** All http(s) links in a piece of text (trailing punctuation trimmed, duplicates removed). */
function _blimpExtractUrls(text) {
    var found = (text || '').match(/https?:\/\/[^\s<>"')]+/gi) || [];
    var seen = {};
    return found.map(function(u) { return u.replace(/[.,;:!?]+$/, ''); }).filter(function(u) {
        var key = u.toLowerCase().replace(/\/$/, '');
        if (!u || seen[key]) return false;
        seen[key] = true;
        return true;
    });
}

/** The text with its links removed (the AI can't open links, so it never needs to see them). */
function _blimpStripUrls(text) {
    return (text || '').replace(/https?:\/\/[^\s<>"')]+/gi, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
}

/** Gather the links to keep: the one from the share sheet first, then any pasted into the caption box. */
function _blimpCollectLinks() {
    var links = [];
    var seen = {};
    function add(url, label) {
        var key = url.toLowerCase().replace(/\/$/, '');
        if (!url || seen[key]) return;
        seen[key] = true;
        links.push({ url: url, label: label });
    }
    if (_blimpSharedUrl) add(_blimpSharedUrl, 'Shared link');
    _blimpExtractUrls(document.getElementById('blImportHint').value).forEach(function(u) { add(u, 'Link'); });
    _blimpLinks = links;
}

// ============================================================
// Parsing and normalization
// ============================================================

/** Parse the LLM's reply into {items, unreadable, message}. Tolerates fences and chatter around the JSON. */
function _blimpParseResponse(text) {
    var clean = (text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    var parsed;
    try {
        parsed = JSON.parse(clean);
    } catch (e) {
        // Fall back to the outermost {...} or [...] in the text
        var o1 = clean.indexOf('{'), o2 = clean.lastIndexOf('}');
        var a1 = clean.indexOf('['), a2 = clean.lastIndexOf(']');
        var slice = (o1 !== -1 && o2 > o1) ? clean.slice(o1, o2 + 1) : ((a1 !== -1 && a2 > a1) ? clean.slice(a1, a2 + 1) : null);
        if (!slice) throw new Error('The reply did not contain JSON.');
        parsed = JSON.parse(slice);
    }
    if (Array.isArray(parsed)) parsed = { items: parsed };
    if (!parsed || !Array.isArray(parsed.items)) throw new Error('The JSON had no "items" list.');
    return { items: parsed.items, unreadable: !!parsed.unreadable, message: parsed.message || null };
}

function _blimpStr(v) {
    return (typeof v === 'string' && v.trim()) ? v.trim() : null;
}

function _blimpIsoDate(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    var p = _blParseIso(v);
    var d = new Date(p.y, p.m - 1, p.d);
    return (d.getFullYear() === p.y && d.getMonth() === p.m - 1 && d.getDate() === p.d) ? v : null;
}

/** Season name when the months exactly match one, else null. */
function _blimpSeason(months) {
    var sorted = months.slice().sort(function(a, b) { return a - b; }).join(',');
    var found = null;
    Object.keys(BL_SEASONS).forEach(function(s) {
        if (BL_SEASONS[s].slice().sort(function(a, b) { return a - b; }).join(',') === sorted) found = s;
    });
    return found;
}

/** Clean up whatever timing the LLM returned into the stored shape. */
function _blimpTiming(t) {
    var out = { type: 'none', months: [], season: null, startDate: null, endDate: null, yearly: false, label: null };
    if (!t || typeof t !== 'object') return out;
    if (t.type === 'months') {
        var seen = {};
        (Array.isArray(t.months) ? t.months : []).forEach(function(m) {
            m = Number(m);
            if (Number.isInteger(m) && m >= 1 && m <= 12) seen[m] = true;
        });
        var months = Object.keys(seen).map(Number).sort(function(a, b) { return a - b; });
        if (months.length) { out.type = 'months'; out.months = months; out.season = _blimpSeason(months); }
    } else if (t.type === 'date' || t.type === 'range') {
        var start = _blimpIsoDate(t.startDate);
        if (start) {
            out.type = 'date';
            out.startDate = start;
            out.yearly = !!t.yearly;
            var end = _blimpIsoDate(t.endDate);
            if (t.type === 'range' && end && end >= start) { out.type = 'range'; out.endDate = end; }
        }
    }
    if (out.type !== 'none') out.label = _blimpStr(t.label);
    return out;
}

/** Turn one raw LLM item into a clean record (or null if it has no usable name). */
function _blimpNormalizeItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var name = _blimpStr(raw.name);
    if (!name) return null;

    var lat = (typeof raw.lat === 'number' && raw.lat >= -90 && raw.lat <= 90) ? raw.lat : null;
    var lng = (typeof raw.lng === 'number' && raw.lng >= -180 && raw.lng <= 180) ? raw.lng : null;
    if (lat == null || lng == null) { lat = null; lng = null; }

    var website = _blNormalizeUrl(_blimpStr(raw.website) || '');
    if (website && !/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(website)) website = '';   // drop things that aren't URLs

    var tags = (Array.isArray(raw.tags) ? raw.tags : []).map(function(t) { return String(t).trim().toLowerCase(); })
        .filter(function(t, i, arr) { return t && arr.indexOf(t) === i; }).slice(0, 6);

    var confidence = ['high', 'medium', 'low'].indexOf(raw.confidence) !== -1 ? raw.confidence : 'medium';

    return {
        name      : name,
        kind      : BL_KINDS[raw.kind] ? raw.kind : 'other',
        country   : _blimpStr(raw.country),
        region    : _blimpStr(raw.region),
        city      : _blimpStr(raw.city),
        venue     : _blimpStr(raw.venue),
        lat       : lat,
        lng       : lng,
        timing    : _blimpTiming(raw.timing),
        why       : _blimpStr(raw.why),
        notes     : _blimpStr(raw.notes),
        website   : website || null,
        tags      : tags,
        confidence: confidence,
        evidence  : _blimpStr(raw.evidence)
    };
}

// ============================================================
// Modal: staging images and starting the import
// ============================================================

/** Open the import modal fresh (called by the Import button on the list page). */
function openBucketImportModal() {
    _blimpImages = [];
    _blimpItems = [];
    _blimpRaw = '';
    _blimpBusy = false;
    _blimpSharedUrl = '';
    _blimpLinks = [];

    document.getElementById('blImportHint').value = '';
    document.getElementById('blImportJson').value = '';
    document.getElementById('blImportPromptBox').classList.add('hidden');
    document.getElementById('blImportJsonWrap').classList.add('hidden');
    document.getElementById('blImportStatus').textContent = '';
    _blimpShowPane('input');
    _blimpRenderThumbs();

    document.getElementById('blImportCancelBtn').onclick = function() { closeModal('blImportModal'); };
    document.getElementById('blImportPasteBtn').onclick = _blimpPasteFromClipboard;
    document.getElementById('blImportGalleryBtn').onclick = function() {
        var inp = document.getElementById('blImportFileInput');
        inp.value = '';
        inp.removeAttribute('capture');
        inp.click();
    };
    document.getElementById('blImportCameraBtn').onclick = function() {
        var inp = document.getElementById('blImportFileInput');
        inp.value = '';
        inp.setAttribute('capture', 'environment');
        inp.click();
    };
    document.getElementById('blImportFileInput').onchange = function() { _blimpAddFiles(this.files); };
    document.getElementById('blImportRunBtn').onclick = _blimpRunAi;
    document.getElementById('blImportCopyPromptBtn').onclick = _blimpCopyPrompt;
    document.getElementById('blImportToggleJsonBtn').onclick = function() {
        document.getElementById('blImportJsonWrap').classList.toggle('hidden');
    };
    document.getElementById('blImportUseJsonBtn').onclick = _blimpUsePastedJson;
    document.getElementById('blImportBackBtn').onclick = function() { _blimpShowPane('input'); };
    document.getElementById('blImportSaveBtn').onclick = _blimpSaveSelected;

    // Make sure existing items are loaded so duplicates can be spotted on the review screen
    if (_blItems.length === 0) _blLoadItems().catch(function() {});

    openModal('blImportModal');
}

/** Show the 'input' or 'review' half of the modal. */
function _blimpShowPane(which) {
    document.getElementById('blImportInputPane').classList.toggle('hidden', which !== 'input');
    document.getElementById('blImportReviewPane').classList.toggle('hidden', which !== 'review');
    document.getElementById('blImportTitle').textContent = which === 'input' ? 'Import from Screenshot' : 'Review Imported Places';
}

/** Shortcut for the status line. */
function _blimpStatus(msg) {
    document.getElementById('blImportStatus').textContent = msg || '';
}

/** Compress and stage image files (up to the limit). */
async function _blimpAddFiles(files) {
    files = Array.from(files || []).filter(function(f) { return f.type && f.type.indexOf('image/') === 0; });
    if (!files.length) return;
    var room = BL_IMPORT_MAX_IMAGES - _blimpImages.length;
    if (room <= 0) { _blimpStatus('Up to ' + BL_IMPORT_MAX_IMAGES + ' screenshots at a time.'); return; }
    _blimpStatus('Preparing image' + (files.length > 1 ? 's' : '') + '…');
    for (var i = 0; i < files.length && i < room; i++) {
        try {
            // Larger/clearer than the stored-photo size: reel screenshots are mostly small overlay text
            var llmData = await compressImage(files[i], { maxDimension: 1400, maxBase64: 450000 });
            _blimpImages.push({ file: files[i], llmData: llmData });
        } catch (e) {
            console.error('Import image error:', e);
        }
    }
    _blimpStatus('');
    _blimpRenderThumbs();
}

/** Thumbnails of staged images, each with a remove button. */
function _blimpRenderThumbs() {
    var wrap = document.getElementById('blImportThumbs');
    wrap.innerHTML = '';
    _blimpImages.forEach(function(img, i) {
        var box = document.createElement('div');
        box.className = 'bl-thumb';
        var im = document.createElement('img');
        im.src = img.llmData;
        im.alt = 'Screenshot ' + (i + 1);
        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'bl-thumb-remove';
        rm.title = 'Remove';
        rm.innerHTML = '&times;';
        rm.onclick = function() { _blimpImages.splice(i, 1); _blimpRenderThumbs(); };
        box.appendChild(im);
        box.appendChild(rm);
        wrap.appendChild(box);
    });
}

/** Paste button: read an image from the clipboard (same approach as the prescription scanner). */
async function _blimpPasteFromClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.read) {
        _blimpStatus('Clipboard paste is not supported here. Use Gallery instead, or press Ctrl+V.');
        return;
    }
    try {
        var items = await navigator.clipboard.read();
        var blob = null;
        for (var i = 0; i < items.length && !blob; i++) {
            var type = items[i].types.find(function(t) { return t.indexOf('image/') === 0; });
            if (type) blob = await items[i].getType(type);
        }
        if (!blob) { _blimpStatus('No image on the clipboard. Copy an image first, then tap Paste.'); return; }
        await _blimpAddFiles([new File([blob], 'pasted' + (blob.type === 'image/png' ? '.png' : '.jpg'), { type: blob.type })]);
    } catch (err) {
        _blimpStatus(err.name === 'NotAllowedError'
            ? 'Clipboard access was denied. Allow it when the browser asks, or press Ctrl+V.'
            : 'Could not read the clipboard: ' + err.message);
    }
}

// Ctrl+V anywhere while the import modal's first screen is open
document.addEventListener('paste', function(e) {
    var modal = document.getElementById('blImportModal');
    if (!modal || !modal.classList.contains('open')) return;
    if (document.getElementById('blImportInputPane').classList.contains('hidden')) return;
    var files = [];
    Array.from((e.clipboardData && e.clipboardData.items) || []).forEach(function(it) {
        if (it.kind === 'file' && it.type.indexOf('image/') === 0) files.push(it.getAsFile());
    });
    if (files.length) { e.preventDefault(); _blimpAddFiles(files); }
});

/** Copy the prompt so it can be used in any chat app. Falls back to showing it for manual copy. */
async function _blimpCopyPrompt() {
    var prompt = await _blimpBuildPrompt(document.getElementById('blImportHint').value.trim());
    var box = document.getElementById('blImportPromptBox');
    try {
        await navigator.clipboard.writeText(prompt);
        _blimpStatus('Prompt copied. Paste it into your chat app with the screenshot, then paste the JSON it returns under "Paste JSON".');
        box.classList.add('hidden');
    } catch (e) {
        box.value = prompt;
        box.classList.remove('hidden');
        box.select();
        _blimpStatus('Could not copy automatically. The prompt is shown below, so copy it by hand.');
    }
}

// ============================================================
// Calling the LLM
// ============================================================

/** "Read with AI": send the staged screenshot(s) and any caption text to the configured LLM. */
async function _blimpRunAi() {
    if (_blimpBusy) return;
    var rawHint = document.getElementById('blImportHint').value.trim();
    var hint = _blimpStripUrls(rawHint);   // the AI can't open links; they are saved on the items instead
    if (_blimpImages.length === 0 && !hint) {
        _blimpStatus(_blimpExtractUrls(rawHint).length
            ? 'The AI cannot open links. Add a screenshot, or paste the caption text as well (the link will be kept).'
            : 'Add a screenshot (or type some text about the place) first.');
        return;
    }

    var runBtn = document.getElementById('blImportRunBtn');
    _blimpBusy = true;
    runBtn.disabled = true;
    _blimpStatus('Reading with AI… this can take 10–20 seconds.');
    try {
        var conf = await blLoadLlm();
        if (!conf) {
            _blimpStatus('No AI is configured (Settings). You can still use "Copy prompt" and "Paste JSON" below.');
            return;
        }

        // Instructions go in the system message; the user's text and the screenshots in the user message
        var parts = await _blimpBuildPromptParts(hint);
        var content = [{ type: 'text', text: parts.user }];
        _blimpImages.forEach(function(img) {
            content.push({ type: 'image_url', image_url: { url: img.llmData } });
        });

        _blimpRaw = await blCallLlm(conf, parts.system, content, true);   // JSON mode, retried without if unsupported
        var parsed = _blimpParseResponse(_blimpRaw);
        _blimpSource = _blimpImages.length ? 'llm-image' : 'llm-text';
        _blimpStartReview(parsed);
    } catch (err) {
        console.error('Bucket list import error:', err);
        _blimpStatus('Something went wrong: ' + err.message);
    } finally {
        _blimpBusy = false;
        runBtn.disabled = false;
    }
}

/** "Review pasted JSON": same review screen, JSON supplied by the user. */
function _blimpUsePastedJson() {
    var text = document.getElementById('blImportJson').value.trim();
    if (!text) { _blimpStatus('Paste the JSON first.'); return; }
    try {
        _blimpRaw = text;
        _blimpSource = 'json-paste';
        _blimpStartReview(_blimpParseResponse(text));
    } catch (err) {
        _blimpStatus('That JSON could not be read: ' + err.message);
    }
}

// ============================================================
// Review screen
// ============================================================

/** Normalize the parsed response and show the review cards (or explain why there are none). */
function _blimpStartReview(parsed) {
    _blimpCollectLinks();
    _blimpItems = parsed.items.map(_blimpNormalizeItem).filter(Boolean);
    if (_blimpItems.length === 0) {
        _blimpStatus(parsed.message || 'No identifiable places were found. Try a clearer screenshot or add the place name as text.');
        return;
    }
    _blimpStatus('');
    _blimpRenderReview(parsed.message);
    _blimpShowPane('review');
}

/** One <option> list for the kind dropdown. */
function _blimpKindOptions(selected) {
    return Object.keys(BL_KINDS).map(function(k) {
        return '<option value="' + k + '"' + (k === selected ? ' selected' : '') + '>' + escapeHtml(BL_KINDS[k].label) + '</option>';
    }).join('');
}

/** Existing item with the same name (case-insensitive), or null. */
function _blimpFindDuplicate(name) {
    var key = _blNorm(name);
    for (var i = 0; i < _blItems.length; i++) {
        if (_blNorm(_blItems[i].data.name) === key) return _blItems[i].data.name;
    }
    return null;
}

/** Build the editable review cards. */
function _blimpRenderReview(message) {
    var list = document.getElementById('blImportReviewList');
    list.innerHTML = '';

    var note = document.getElementById('blImportReviewNote');
    note.textContent = message || '';
    note.classList.toggle('hidden', !message);

    var seenInBatch = {};
    _blimpItems.forEach(function(it, idx) {
        // Duplicate = already on the list, or repeated earlier in this same import
        var dup = _blimpFindDuplicate(it.name) ? 'Already on your list' : (seenInBatch[_blNorm(it.name)] ? 'Repeated in this import' : null);
        seenInBatch[_blNorm(it.name)] = true;
        var checked = it.confidence !== 'low' && !dup;   // low confidence and duplicates start unchecked
        var timing = _blTimingText(it.timing);

        var card = document.createElement('div');
        card.className = 'bl-rev-card';
        card.dataset.idx = idx;
        card.innerHTML =
            '<div class="bl-rev-head">' +
                '<label class="bl-rev-check"><input type="checkbox" class="bl-rev-include"' + (checked ? ' checked' : '') + '> Add</label>' +
                '<span class="bl-badge bl-conf-' + it.confidence + '">' + escapeHtml(it.confidence) + ' confidence</span>' +
                (dup ? '<span class="bl-badge bl-badge--expired">' + dup + '</span>' : '') +
            '</div>' +
            '<div class="form-group"><label>Name</label><input type="text" class="bl-rev-name"></div>' +
            '<div class="bl-two-col">' +
                '<div class="form-group"><label>Type</label><select class="bl-rev-kind">' + _blimpKindOptions(it.kind) + '</select></div>' +
                '<div class="form-group"><label>Country</label><input type="text" class="bl-rev-country"></div>' +
            '</div>' +
            '<div class="bl-two-col">' +
                '<div class="form-group"><label>State / Region</label><input type="text" class="bl-rev-region"></div>' +
                '<div class="form-group"><label>City / Town</label><input type="text" class="bl-rev-city"></div>' +
            '</div>' +
            '<div class="form-group"><label>Why</label><textarea class="settings-textarea bl-rev-why" rows="2"></textarea></div>' +
            '<div class="bl-rev-meta">' +
                (timing ? '<div>🗓️ ' + escapeHtml(timing) + ' <span class="bl-rev-hint">(editable after saving)</span></div>' : '') +
                (it.notes ? '<div>📝 ' + escapeHtml(it.notes) + '</div>' : '') +
                (it.website ? '<div>🔗 ' + escapeHtml(it.website) + '</div>' : '') +
                (it.tags.length ? '<div>🏷️ ' + escapeHtml(it.tags.join(', ')) + '</div>' : '') +
                (it.evidence ? '<div class="bl-rev-evidence">Seen in image: ' + escapeHtml(it.evidence) + '</div>' : '') +
            '</div>';
        // Set values via properties (not HTML) so quotes in the text can't break the markup
        card.querySelector('.bl-rev-name').value = it.name;
        card.querySelector('.bl-rev-country').value = it.country || '';
        card.querySelector('.bl-rev-region').value = it.region || '';
        card.querySelector('.bl-rev-city').value = it.city || '';
        card.querySelector('.bl-rev-why').value = it.why || '';
        list.appendChild(card);
    });

    // Tell the user which links will be saved on each item
    var linksNote = document.getElementById('blImportLinksNote');
    linksNote.textContent = _blimpLinks.length ? 'Links saved with each item: ' + _blimpLinks.map(function(l) { return l.url; }).join(', ') : '';
    linksNote.classList.toggle('hidden', !_blimpLinks.length);

    // Photos option only makes sense when screenshots are staged
    var photoRow = document.getElementById('blImportPhotoRow');
    photoRow.classList.toggle('hidden', _blimpImages.length === 0);
    document.getElementById('blImportKeepPhotos').checked = true;

    document.getElementById('blImportRawText').textContent = _blimpRaw;
}


/**
 * Build a bucketList document from a cleaned-up item (the shape _blimpNormalizeItem returns).
 * Shared by the screenshot import and the QuickLog "Add to Bucket List" action.
 * Country/region/city take the spelling already used by existing items (_blCanonPlace).
 */
function _blBuildDocFromItem(it, source, importNote) {
    var geo = {
        country    : it.country || null,
        countryCode: null,
        region     : it.region || null,
        city       : it.city || null,
        venue      : it.venue || null,
        address    : null,
        lat        : it.lat != null ? it.lat : null,
        lng        : it.lng != null ? it.lng : null
    };
    geo.country = _blCanonPlace(geo.country, 'country');
    geo.region  = _blCanonPlace(geo.region,  'region');
    geo.city    = _blCanonPlace(geo.city,    'city');
    geo.precision = _blPrecision(geo);

    return {
        name       : it.name,
        kind       : it.kind,
        why        : it.why || null,
        notes      : it.notes || null,
        tags       : it.tags || [],
        geo        : geo,
        timing     : it.timing,
        website    : it.website || null,
        links      : [],
        status     : 'want',
        priority   : 2,
        visitedDate: null,
        source     : source,
        importNote : importNote || null,
        createdAt  : firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt  : firebase.firestore.FieldValue.serverTimestamp()
    };
}

// ============================================================
// Saving
// ============================================================

/** Create a bucketList document for each checked review card. */
async function _blimpSaveSelected() {
    var cards = Array.from(document.querySelectorAll('#blImportReviewList .bl-rev-card'))
        .filter(function(c) { return c.querySelector('.bl-rev-include').checked; });
    if (cards.length === 0) { alert('Check at least one place to add.'); return; }

    var saveBtn = document.getElementById('blImportSaveBtn');
    var status = document.getElementById('blImportReviewStatus');
    saveBtn.disabled = true;
    _blEditId = null;   // so _blCanonPlace doesn't skip any existing item

    try {
        if (_blItems.length === 0) await _blLoadItems();

        // Stored-photo version of each screenshot (smaller than the LLM version), made once
        var photoData = [];
        if (document.getElementById('blImportKeepPhotos').checked && _blimpImages.length) {
            status.textContent = 'Preparing screenshots…';
            for (var p = 0; p < _blimpImages.length; p++) photoData.push(await compressImage(_blimpImages[p].file));
        }

        for (var i = 0; i < cards.length; i++) {
            status.textContent = 'Saving ' + (i + 1) + ' of ' + cards.length + '…';
            var card = cards[i];
            var it = _blimpItems[parseInt(card.dataset.idx, 10)];

            // Apply the user's edits from the card on top of the cleaned-up LLM item
            var edited = Object.assign({}, it, {
                name   : card.querySelector('.bl-rev-name').value.trim() || it.name,
                kind   : card.querySelector('.bl-rev-kind').value,
                country: card.querySelector('.bl-rev-country').value.trim() || null,
                region : card.querySelector('.bl-rev-region').value.trim() || null,
                city   : card.querySelector('.bl-rev-city').value.trim() || null,
                why    : card.querySelector('.bl-rev-why').value.trim() || null
            });
            var doc = _blBuildDocFromItem(edited, _blimpSource,
                (it.confidence + ' confidence' + (it.evidence ? ': ' + it.evidence : '')).slice(0, 300));
            // Links shared or pasted with the screenshot (e.g. the reel's URL) are kept on the item
            if (_blimpLinks.length) doc.links = _blimpLinks.map(function(l) { return { url: l.url, label: l.label }; });
            var ref = await userCol('bucketList').add(doc);

            // Keep the screenshot(s) on each saved item
            for (var k = 0; k < photoData.length; k++) {
                await userCol('photos').add({
                    targetType: 'bucketItem',
                    targetId  : ref.id,
                    imageData : photoData[k],
                    caption   : 'Imported screenshot',
                    takenAt   : new Date().toISOString(),
                    createdAt : firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            // Refresh our local copy so the next card's spelling matches this one
            await _blLoadItems();
        }

        status.textContent = '';
        closeModal('blImportModal');
        if (window.location.hash === '#bucketlist') loadBucketListPage();
        else window.location.hash = '#bucketlist';
    } catch (err) {
        console.error('Bucket list import save error:', err);
        status.textContent = 'Error saving: ' + err.message;
    } finally {
        saveBtn.disabled = false;
    }
}
