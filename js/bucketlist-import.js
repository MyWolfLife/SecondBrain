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
// chat.js (LLM_PROVIDERS, chatCallOpenAICompat) and photos.js (compressImage).
// Plan document: saveplacesPlan.md §6
// ============================================================

var BL_IMPORT_MAX_IMAGES = 6;

var _blimpImages = [];       // staged screenshots: [{ file, llmData }]  (llmData = base64 sized for the LLM)
var _blimpItems  = [];       // normalized records awaiting review
var _blimpSource = 'llm-image';
var _blimpRaw    = '';       // raw LLM text, shown in the review screen for prompt tuning
var _blimpBusy   = false;
var _blimpSharedUrl = '';   // link shared from the phone share sheet; saved on each imported item

// ============================================================
// Prompt
// ============================================================

/**
 * Build the full prompt text. `hint` is optional caption/hashtag text the user typed.
 * Also used by "Copy prompt" so any chat app can produce the same JSON.
 */
async function _blimpBuildPrompt(hint) {
    var home = '';
    try {
        var main = await userCol('settings').doc('main').get();
        home = (main.exists && main.data().cityState) ? main.data().cityState.trim() : '';
    } catch (e) { /* optional context only */ }

    var kinds = Object.keys(BL_KINDS).join(', ');
    var p =
        'You read screenshots of social media posts, reels, articles and maps, and extract PLACES THE USER ' +
        'MIGHT WANT TO VISIT for a personal bucket list.\n\n' +
        "Today's date: " + _blTodayIso() + '.' + (home ? ' The user lives near: ' + home + '.' : '') + '\n\n' +
        'Return ONLY one JSON object (no prose, no markdown fences) in exactly this shape:\n' +
        '{\n' +
        '  "items": [\n' +
        '    {\n' +
        '      "name": string,\n' +
        '      "kind": one of [' + kinds + '],\n' +
        '      "country": string or null,\n' +
        '      "region": string or null,\n' +
        '      "city": string or null,\n' +
        '      "venue": string or null,\n' +
        '      "lat": number or null,\n' +
        '      "lng": number or null,\n' +
        '      "timing": { "type": "none" | "months" | "date" | "range", "months": [integers 1-12],\n' +
        '                  "startDate": "YYYY-MM-DD" or null, "endDate": "YYYY-MM-DD" or null,\n' +
        '                  "yearly": boolean, "label": string or null },\n' +
        '      "why": string or null,\n' +
        '      "notes": string or null,\n' +
        '      "website": string or null,\n' +
        '      "tags": [string],\n' +
        '      "confidence": "high" | "medium" | "low",\n' +
        '      "evidence": string\n' +
        '    }\n' +
        '  ],\n' +
        '  "unreadable": boolean,\n' +
        '  "message": string or null\n' +
        '}\n\n' +
        'Rules:\n' +
        '- One item per distinct place. A "top 10 waterfalls" post means ten items.\n' +
        '- Only include places that are named or clearly identifiable in the image or text. Never invent a place.\n' +
        '- Use null for anything not visible or not reliably known. NEVER guess a website, coordinates, dates or an address.\n' +
        '- "name" is the place itself (e.g. "Amicalola Falls"). It is NOT the account/creator handle, a caption slogan, or app interface text.\n' +
        '- "kind": the best fit. Use "country", "region" (state/province/area) or "town" when the place is a whole country, region or town.\n' +
        '- "country", "region", "city": full English names (e.g. "United States", "Georgia", "Dawsonville"). Fill them when confident; otherwise null.\n' +
        '- "timing": use "months" when the content says a time of year (fall foliage = [10,11], spring wildflowers = [3,4,5], "in May" = [5]). ' +
        'Use "date" or "range" for events with dates (use today\'s date to choose the year; set yearly true if it is clearly an annual event). ' +
        'Otherwise type "none". "label" is a short phrase such as "peak fall color".\n' +
        '- "why": one sentence on why it is worth visiting, based on the content. "notes": practical details shown (cost, hours, difficulty, tips).\n' +
        '- "tags": 1 to 4 short lowercase words.\n' +
        '- "confidence": "low" if the text is blurry, ambiguous or you are inferring. "evidence": a short quote or description of what in the image supports the item.\n' +
        '- If nothing identifiable is present: "items": [], "unreadable": true, and explain in "message".';

    if (hint) p += '\n\nCaption / hint typed by the user (may contain the place name, location or hashtags):\n' + hint;
    return p;
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
    var hint = document.getElementById('blImportHint').value.trim();
    if (_blimpImages.length === 0 && !hint) {
        _blimpStatus('Add a screenshot (or type some text about the place) first.');
        return;
    }

    var runBtn = document.getElementById('blImportRunBtn');
    _blimpBusy = true;
    runBtn.disabled = true;
    _blimpStatus('Reading with AI… this can take 10–20 seconds.');
    try {
        var cfgDoc = await userCol('settings').doc('llm').get();
        var cfg = cfgDoc.exists ? cfgDoc.data() : null;
        if (!cfg || !cfg.provider || !cfg.apiKey) {
            _blimpStatus('No LLM is configured (Settings). You can still use "Copy prompt" and "Paste JSON" below.');
            return;
        }
        var llm = LLM_PROVIDERS[cfg.provider];
        if (!llm) { _blimpStatus('Unknown LLM provider in Settings.'); return; }

        var prompt = await _blimpBuildPrompt(hint);
        var content = [{ type: 'text', text: prompt }];
        _blimpImages.forEach(function(img) {
            content.push({ type: 'image_url', image_url: { url: img.llmData } });
        });

        _blimpRaw = await chatCallOpenAICompat(llm, cfg.apiKey, content, cfg.model || llm.model);
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
            // A link shared along with the screenshot (e.g. the reel's URL) is kept on the item
            if (_blimpSharedUrl) doc.links = [{ url: _blimpSharedUrl, label: 'Shared link' }];
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
