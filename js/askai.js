// ============================================================
// askai.js — "Ask AI" for any record in the app
//
// One shared dialog (#askAiModal) that shows a ready-made prompt with buttons to Copy it or open
// ChatGPT, Claude or Google AI Mode with it already filled in. Each kind of record builds its own
// prompt from everything the app knows about it; the shared loaders below collect the records
// every entity can have (facts, problems, quick tasks, activities, calendar events, photos).
//
// Used by: plants (askAiForPlant), Bucket List items (bucketlist-links.js), and house / garage /
// structure things, sub-things and items, vehicles, weeds and products (askAiForKind, via buttons
// with class="ask-ai-btn" data-askai="<kind>").
// ============================================================

// Longest prompt (after URL-encoding) we put in a web address. Longer prompts are copied instead and
// the chat app is opened empty, because very long addresses get cut off or rejected.
var ASK_AI_MAX_URL_CHARS = 7000;

var ASK_AI_TARGETS = {
    chatgpt: { label: 'ChatGPT',        withPrompt: 'https://chatgpt.com/?q=',                    empty: 'https://chatgpt.com/' },
    claude : { label: 'Claude',         withPrompt: 'https://claude.ai/new?q=',                   empty: 'https://claude.ai/new' },
    google : { label: 'Google AI Mode', withPrompt: 'https://www.google.com/search?udm=50&q=',    empty: 'https://www.google.com/search?udm=50' }
};

// ============================================================
// The dialog
// ============================================================

/**
 * Open the Ask AI dialog. `promptOrPromise` may be the prompt text or a Promise for it (the dialog
 * opens straight away with "Building the prompt…" while the records load).
 * `pictureOrPromise` (optional) is the record's picture as a data URL (or a Promise for one, or
 * null): the "Send picture" checkbox copies it to the clipboard when a chat app is opened, because
 * a web link can only carry text.
 * `fileOrPromise` (optional) is { name, text } — a data file to attach in the chat (e.g. a whole trip
 * as JSON). The dialog offers "Download" and "Copy file contents" for it.
 */
async function openAskAiModal(title, promptOrPromise, pictureOrPromise, fileOrPromise) {
    var box = document.getElementById('askAiText');
    var status = document.getElementById('askAiStatus');
    var picRow = document.getElementById('askAiPictureRow');
    var picCheck = document.getElementById('askAiSendPicture');
    var picThumb = document.getElementById('askAiPictureThumb');
    var picBtn = document.getElementById('askAiCopyPictureBtn');
    document.getElementById('askAiTitle').textContent = title || 'Ask an AI';
    box.value = 'Building the prompt…';
    status.textContent = '';

    // "Send picture" starts off every time; hidden until we know the record has a picture
    _askAiPicture = null;
    picCheck.checked = false;
    picRow.classList.add('hidden');
    picBtn.classList.add('hidden');
    picCheck.onchange = function() { picBtn.classList.toggle('hidden', !picCheck.checked); };
    picBtn.onclick = async function() {
        status.textContent = (await _askAiCopyPicture())
            ? 'Picture copied. In the chat, press and hold (or right-click) the message box and choose Paste.'
            : 'Could not copy the picture on this device. Save it from the record’s Photos and attach it in the chat instead.';
    };

    // The action buttons stay disabled until the prompt is ready, so nothing half-built is copied
    var actionIds = ['askAiCopyBtn'].concat(Object.keys(ASK_AI_TARGETS).map(function(k) { return 'askAi_' + k; }));
    function setEnabled(on) { actionIds.forEach(function(id) { var b = document.getElementById(id); if (b) b.disabled = !on; }); }
    setEnabled(false);

    document.getElementById('askAiCloseBtn').onclick = function() { closeModal('askAiModal'); };
    document.getElementById('askAiCopyBtn').onclick = async function() {
        if (await _askAiCopy(box.value)) {
            status.textContent = 'Copied. Paste it into any AI chat app.';
        } else {
            box.focus();
            box.select();
            status.textContent = 'Could not copy automatically. The text is selected, so copy it by hand.';
        }
    };
    Object.keys(ASK_AI_TARGETS).forEach(function(key) {
        var btn = document.getElementById('askAi_' + key);
        if (btn) btn.onclick = function() { _askAiOpenIn(key, box.value, status, picCheck.checked && !!_askAiPicture); };
    });

    openModal('askAiModal');

    // Data file to attach (if any)
    var fileRow = document.getElementById('askAiFileRow');
    _askAiFile = null;
    fileRow.classList.add('hidden');
    Promise.resolve(fileOrPromise).then(function(file) {
        if (!file || !file.text) return;
        _askAiFile = file;
        var kb = file.text.length / 1024;
        document.getElementById('askAiFileName').textContent = file.name + ' (' + (kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(kb)) + ' KB') + ')';
        fileRow.classList.remove('hidden');
    }).catch(function() { /* the prompt reports build errors */ });
    document.getElementById('askAiFileDownloadBtn').onclick = function() {
        if (!_askAiFile) return;
        _askAiDownload(_askAiFile.name, _askAiFile.text);
        status.textContent = 'Downloaded ' + _askAiFile.name + '. In the chat app, use the attach button (paperclip or +) to add it, along with the question.';
    };
    document.getElementById('askAiFileCopyBtn').onclick = async function() {
        if (!_askAiFile) return;
        status.textContent = (await _askAiCopy(_askAiFile.text))
            ? 'File contents copied. If attaching the file doesn’t work, paste this into the chat after the question.'
            : 'Could not copy the file contents. Use Download instead.';
    };

    // Picture (if any) loads alongside the prompt
    Promise.resolve(pictureOrPromise).then(function(pic) {
        _askAiPicture = pic || null;
        if (_askAiPicture) {
            picRow.classList.remove('hidden');
            picThumb.src = _askAiPicture;
        }
    }).catch(function() { /* no picture */ });

    try {
        box.value = await promptOrPromise;
        setEnabled(true);
    } catch (err) {
        console.error('Could not build the AI prompt:', err);
        box.value = '';
        status.textContent = 'Could not gather the information for the prompt: ' + err.message;
    }
}

var _askAiPicture = null;   // data URL of the picture offered by "Send picture" (or null)
var _askAiFile    = null;   // { name, text } data file offered for attaching (or null)

/** Save text as a file (browser download). */
function _askAiDownload(filename, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function() { URL.revokeObjectURL(url); }, 2000);
}

/** Copy text to the clipboard. Returns true on success. */
async function _askAiCopy(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) { return false; }
}

/** Convert a stored picture (usually JPEG) to a PNG blob — the image format clipboards accept. */
function _askAiPngBlob(dataUrl) {
    return new Promise(function(resolve, reject) {
        var img = new Image();
        img.onload = function() {
            var canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext('2d').drawImage(img, 0, 0);
            canvas.toBlob(function(blob) { blob ? resolve(blob) : reject(new Error('Could not convert the picture')); }, 'image/png');
        };
        img.onerror = reject;
        img.src = dataUrl;
    });
}

/**
 * Put the picture on the clipboard. Must be called straight from a tap: the PNG is passed as a
 * promise so the browser still treats the copy as part of that tap while the conversion finishes.
 * Returns true on success.
 */
async function _askAiCopyPicture() {
    if (!_askAiPicture || !navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') return false;
    try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': _askAiPngBlob(_askAiPicture) })]);
        return true;
    } catch (e) {
        console.warn('Could not copy the picture:', e);
        return false;
    }
}

/**
 * Open a chat app in a new tab with the prompt filled in.
 * Without a picture the prompt is also copied. With "Send picture" ticked the clipboard gets the
 * picture instead (the question is already in the link), for the user to paste into the chat.
 * When the prompt is too long for a web address the app opens empty and the prompt is copied; the
 * picture can then be copied afterwards with "Copy picture".
 */
function _askAiOpenIn(key, text, statusEl, withPicture) {
    var t = ASK_AI_TARGETS[key];
    var encoded = encodeURIComponent(text);
    var fits = encoded.length <= ASK_AI_MAX_URL_CHARS;

    if (fits && withPicture) {
        var copying = _askAiCopyPicture();   // started inside the tap, before the new tab opens
        window.open(t.withPrompt + encoded, '_blank', 'noopener');
        copying.then(function(ok) {
            statusEl.textContent = ok
                ? t.label + ' opened with your question, and the picture is copied. In ' + t.label + ', press and hold (or right-click) the message box and choose Paste to add it.'
                : t.label + ' opened with your question, but the picture could not be copied on this device. Attach it from your photos in the chat instead.';
        });
        return;
    }

    _askAiCopy(text);   // best effort, so the prompt is on the clipboard either way
    if (fits) {
        window.open(t.withPrompt + encoded, '_blank', 'noopener');
        statusEl.textContent = _askAiFile
            ? t.label + ' opened with your question. Now attach ' + _askAiFile.name + ' there (paperclip or + button). Tap Download file first if you haven’t.'
            : '';
    } else {
        window.open(t.empty, '_blank', 'noopener');
        statusEl.textContent = 'This prompt is too long to pass straight to ' + t.label + ', so it was copied. Paste it into the chat box there.' +
            (withPicture ? ' Then come back and tap Copy picture, and paste that too.' : '');
    }
}

/**
 * The picture to offer with "Send picture": the record's main picture (the one set with "Use as
 * Profile"), otherwise its newest photo; for a Bucket List item also a screenshot shared from the
 * same import. Returns a data URL or null.
 */
async function askAiFirstPicture(targetType, targetId, profilePhotoData) {
    if (profilePhotoData) return profilePhotoData;
    try {
        var snap = await userCol('photos').where('targetType', '==', targetType).where('targetId', '==', targetId).get();
        var photos = snap.docs.map(function(d) { return d.data(); });
        if (!photos.length && targetType === 'bucketItem') {
            var shared = await userCol('photos').where('alsoTargetIds', 'array-contains', targetId).get();
            photos = shared.docs.map(function(d) { return d.data(); });
        }
        photos.sort(function(a, b) { return (b.takenAt || '').localeCompare(a.takenAt || ''); });   // newest first, as the photo viewer shows them
        return photos.length ? photos[0].imageData : null;
    } catch (e) {
        return null;
    }
}

// ============================================================
// Prompt-building helpers
// ============================================================

/** A titled block of "- line" bullets, or '' when there are no lines. */
function askAiSection(title, lines) {
    lines = (lines || []).filter(Boolean);
    if (!lines.length) return '';
    return title + '\n' + lines.map(function(l) { return '- ' + l; }).join('\n');
}

/** "label: value" when value is non-empty, else null (so it drops out of askAiSection). */
function askAiField(label, value) {
    if (value === null || value === undefined) return null;
    var v = String(value).trim();
    return v ? label + ': ' + v : null;
}

/** Firestore Timestamp / ISO string / Date → "Mar 4, 2025" (or '' if unknown). */
function askAiDate(v) {
    if (!v) return '';
    var d = null;
    if (v.toDate) d = v.toDate();
    else if (v instanceof Date) d = v;
    else if (typeof v === 'string') {
        var m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
        d = m ? new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)) : new Date(v);
    }
    if (!d || isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Sort key for a date-ish value (newest first sorting). */
function _askAiDateKey(v) {
    if (!v) return '';
    if (v.toDate) return v.toDate().toISOString();
    return String(v);
}

/** The user's home city/state from Settings (or ''). */
async function askAiHome() {
    try {
        var main = await userCol('settings').doc('main').get();
        return (main.exists && main.data().cityState) ? main.data().cityState.trim() : '';
    } catch (e) { return ''; }
}

/** Map of chemical/product id → name (for activities that list products used). */
async function askAiChemicalNames() {
    var map = {};
    try {
        var snap = await userCol('chemicals').get();
        snap.forEach(function(d) { map[d.id] = d.data().name || ''; });
    } catch (e) { /* product names are optional detail */ }
    return map;
}

/**
 * Everything attached to one record through the shared targetType/targetId pattern.
 * Each part fails independently (a missing collection never blocks the prompt).
 * Returns { facts[], problems[], projects[], activities[], events[], photos[] } of plain data objects.
 */
async function askAiRelatedRecords(targetType, targetId) {
    async function load(col) {
        try {
            var snap = await userCol(col).where('targetType', '==', targetType).where('targetId', '==', targetId).get();
            return snap.docs.map(function(d) { return d.data(); });
        } catch (e) {
            console.warn('Ask AI: could not load ' + col + ':', e);
            return [];
        }
    }
    var results = await Promise.all([load('facts'), load('problems'), load('projects'), load('activities'), load('calendarEvents'), load('photos')]);
    return {
        facts     : results[0],
        problems  : results[1],
        projects  : results[2],
        activities: results[3].sort(function(a, b) { return _askAiDateKey(b.date || b.createdAt).localeCompare(_askAiDateKey(a.date || a.createdAt)); }),
        events    : results[4],
        photos    : results[5]
    };
}

/**
 * Turn askAiRelatedRecords() output into prompt sections.
 * opts.maxActivities (default 60) caps the activity history; opts.chemicals is an id → name map.
 */
function askAiRelatedSections(rel, opts) {
    opts = opts || {};
    var chem = opts.chemicals || {};
    var maxActs = opts.maxActivities || 60;
    var sections = [];

    sections.push(askAiSection('FACTS I RECORDED', rel.facts.map(function(f) {
        return [f.label, f.value].filter(Boolean).join(': ');
    })));

    var open = rel.problems.filter(function(p) { return p.status !== 'resolved'; });
    var resolved = rel.problems.filter(function(p) { return p.status === 'resolved'; });
    sections.push(askAiSection('OPEN PROBLEMS', open.map(function(p) {
        return (p.dateLogged ? askAiDate(p.dateLogged) + ' — ' : '') + (p.description || '') + (p.notes ? ' (' + p.notes + ')' : '');
    })));
    sections.push(askAiSection('PAST PROBLEMS (resolved)', resolved.map(function(p) {
        return (p.dateLogged ? askAiDate(p.dateLogged) + ' — ' : '') + (p.description || '') +
               (p.resolvedAt ? ' (resolved ' + askAiDate(p.resolvedAt) + ')' : '') + (p.notes ? ' — ' + p.notes : '');
    })));

    sections.push(askAiSection('TASKS / PROJECTS', rel.projects.map(function(p) {
        var items = (p.items || []).map(function(i) { return (i.done ? '[done] ' : '[ ] ') + (i.text || ''); }).join('; ');
        return (p.title || '') + (p.status === 'completed' ? ' (completed)' : '') + (p.notes ? ' — ' + p.notes : '') + (items ? ' — checklist: ' + items : '');
    })));

    sections.push(askAiSection('SCHEDULED ON MY CALENDAR', rel.events.map(function(e) {
        var r = e.recurring;
        var repeat = !r ? '' : r.type === 'weekly' ? ', repeats weekly' : r.type === 'monthly' ? ', repeats monthly'
                   : r.type === 'intervalDays' ? ', repeats every ' + r.intervalDays + ' days' : ', repeats';
        var lastDone = (e.completedDates || []).slice().sort().pop();
        return (e.title || '') + ' — ' + askAiDate(e.date) + repeat + (e.description ? ' — ' + e.description : '') +
               (lastDone ? ' (last done ' + askAiDate(lastDone) + ')' : '');
    })));

    var acts = rel.activities.slice(0, maxActs);
    var actLines = acts.map(function(a) {
        var products = (a.chemicalIds || []).map(function(id) { return chem[id]; }).filter(Boolean);
        return askAiDate(a.date || a.createdAt) + ' — ' + (a.description || '') +
               (products.length ? ' (products: ' + products.join(', ') + ')' : '') + (a.notes ? ' — ' + a.notes : '');
    });
    if (rel.activities.length > maxActs) actLines.push('(' + (rel.activities.length - maxActs) + ' older entries not shown)');
    sections.push(askAiSection('ACTIVITY HISTORY (newest first)', actLines));

    if (rel.photos.length) {
        var captions = rel.photos.map(function(p) { return p.caption; }).filter(Boolean);
        sections.push('PHOTOS\n- I have ' + rel.photos.length + ' photo' + (rel.photos.length > 1 ? 's' : '') +
                      ' of it (not included here)' + (captions.length ? '; captions: ' + captions.join('; ') : '') + '.');
    }
    return sections.filter(Boolean);
}

/** The closing instructions shared by every "let's talk about this" prompt. */
function askAiConversationRules(thing, extraFirstSteps, summaryLine) {
    var steps = [
        summaryLine || ('Start with a short summary of what this ' + thing + ' is and how it seems to be doing based on my records.')
    ].concat(extraFirstSteps || []).concat([
        'Then ask me what I would like to know, and keep all of this information in mind for my follow-up questions.',
        'If something in my records looks wrong (a misidentified name, details that don\'t fit), tell me.',
        'Be specific to my location and today\'s date. If you are unsure about something, say so rather than guessing.'
    ]);
    return 'HOW TO HELP ME\n' + steps.map(function(s) { return '- ' + s; }).join('\n');
}

// ============================================================
// Plants
// ============================================================

var ASK_AI_PLANT_META = [
    ['heatTolerance', 'Heat tolerance'],
    ['coldTolerance', 'Cold tolerance'],
    ['wateringNeeds', 'Watering needs'],
    ['sunShade',      'Sun / shade'],
    ['bloomMonth',    'Blooms in'],
    ['dormantMonth',  'Dormant in']
];

/** "🤖 Ask AI" on a plant's page. */
function askAiForPlant(plantId) {
    var plant = window.currentPlant || {};
    openAskAiModal('Ask an AI About ' + (plant.alias || plant.name || 'This Plant'), askAiPlantPrompt(plantId),
                   askAiFirstPicture('plant', plantId, plant.profilePhotoData));
}

/**
 * Build the plant prompt: the plant itself, where it is, its care info and notes, plus every related
 * record (facts, problems, tasks, scheduled care, activity history with products, photos), recent work
 * on the zones it sits in, and weeds recorded in those zones.
 */
async function askAiPlantPrompt(plantId) {
    var doc = await userCol('plants').doc(plantId).get();
    if (!doc.exists) throw new Error('Plant not found');
    var plant = doc.data();
    var meta = plant.metadata || {};

    // Zone chain (Front Yard › By Mailbox › Left Bed), innermost last
    var zones = [];
    var zid = plant.zoneId;
    while (zid) {
        var z = await userCol('zones').doc(zid).get();
        if (!z.exists) break;
        zones.unshift({ id: z.id, name: z.data().name || '' });
        zid = z.data().parentId;
    }

    var results = await Promise.all([
        askAiHome(),
        askAiChemicalNames(),
        askAiRelatedRecords('plant', plantId),
        _askAiZoneActivities(zones),
        _askAiZoneWeeds(zones)
    ]);
    var home = results[0], chemicals = results[1], rel = results[2], zoneActs = results[3], weeds = results[4];

    var HEALTH = { healthy: 'Healthy', struggling: 'Struggling', dormant: 'Dormant', dead: 'Dead' };
    var about = askAiSection('THE PLANT', [
        askAiField('Name', plant.name),
        askAiField('Common name I use', plant.alias),
        askAiField('Where it is in my yard', zones.map(function(z) { return z.name; }).join(' > ')),
        askAiField('Health status', HEALTH[plant.healthStatus] || ''),
        askAiField('In my records since', askAiDate(plant.createdAt))
    ]);
    var care = askAiSection('CARE INFO I RECORDED', ASK_AI_PLANT_META.map(function(m) { return askAiField(m[1], meta[m[0]]); })
        .concat([askAiField('My notes', meta.notes)]));
    var me = askAiSection('ABOUT ME', [
        askAiField('I live near', home),
        askAiField("Today's date", askAiDate(new Date()))
    ]);

    var zoneLines = zoneActs.map(function(a) {
        var products = (a.chemicalIds || []).map(function(id) { return chemicals[id]; }).filter(Boolean);
        return askAiDate(a.date || a.createdAt) + ' — ' + a._zone + ': ' + (a.description || '') +
               (products.length ? ' (products: ' + products.join(', ') + ')' : '') + (a.notes ? ' — ' + a.notes : '');
    });
    var zoneSection = askAiSection('RECENT WORK ON THE AREA AROUND IT (whole-zone activities, newest first)', zoneLines);
    var weedSection = askAiSection('WEEDS I HAVE RECORDED IN THIS AREA', weeds.map(function(w) {
        return [w.name, w.treatmentMethod ? 'treated by ' + w.treatmentMethod : '', w.applicationTiming ? 'timing: ' + w.applicationTiming : '']
            .filter(Boolean).join(', ');
    }));

    return [
        'I want to talk with you about one of my plants and ask you some questions about it. Below is everything I have recorded about it in my yard-tracking app. Use it as background for our whole conversation.',
        about,
        care,
        me
    ].concat(askAiRelatedSections(rel, { chemicals: chemicals }))
     .concat([zoneSection, weedSection,
        askAiConversationRules('plant', [
            'Point out anything that looks due or worth attention for this time of year: seasonal care, pruning or feeding windows, recurring problems, or products applied too often.'
        ])])
     .filter(Boolean).join('\n\n');
}

/** Whole-zone activities for the plant's zones (most recent 10 per zone), newest first. */
async function _askAiZoneActivities(zones) {
    var all = [];
    for (var i = 0; i < zones.length; i++) {
        try {
            var snap = await userCol('activities').where('targetType', '==', 'zone').where('targetId', '==', zones[i].id).get();
            var acts = snap.docs.map(function(d) { return Object.assign({ _zone: zones[i].name }, d.data()); })
                .sort(function(a, b) { return _askAiDateKey(b.date || b.createdAt).localeCompare(_askAiDateKey(a.date || a.createdAt)); })
                .slice(0, 10);
            all = all.concat(acts);
        } catch (e) { /* optional context */ }
    }
    return all.sort(function(a, b) { return _askAiDateKey(b.date || b.createdAt).localeCompare(_askAiDateKey(a.date || a.createdAt)); });
}

/** Weeds recorded in any of the plant's zones. */
async function _askAiZoneWeeds(zones) {
    if (!zones.length) return [];
    try {
        var ids = zones.map(function(z) { return z.id; }).slice(0, 10);   // array-contains-any allows up to 10 values
        var snap = await userCol('weeds').where('zoneIds', 'array-contains-any', ids).get();
        return snap.docs.map(function(d) { return d.data(); });
    } catch (e) { return []; }
}

// ============================================================
// Things (house / garage / structures) and vehicles
// ============================================================

/**
 * Every page that has an Ask AI button marked class="ask-ai-btn" data-askai="<kind>".
 * col: Firestore collection; targetType: key used by facts/problems/activities/photos;
 * current: the window.current* object the detail page keeps for the record on screen.
 */
var ASK_AI_KINDS = {
    thing            : { col: 'things',             targetType: 'thing',             area: 'House',      current: 'currentThing' },
    subthing         : { col: 'subThings',          targetType: 'subthing',          area: 'House',      current: 'currentSubThing' },
    item             : { col: 'subThingItems',      targetType: 'item',              area: 'House',      current: 'currentItem' },
    garagething      : { col: 'garageThings',       targetType: 'garagething',       area: 'Garage',     current: 'currentGarageThing' },
    garagesubthing   : { col: 'garageSubThings',    targetType: 'garagesubthing',    area: 'Garage',     current: 'currentGarageSubThing' },
    structurething   : { col: 'structureThings',    targetType: 'structurething',    area: 'Structures', current: 'currentStructureThing' },
    structuresubthing: { col: 'structureSubThings', targetType: 'structuresubthing', area: 'Structures', current: 'currentStructureSubThing' },
    vehicle          : { col: 'vehicles',           targetType: 'vehicle',                               current: 'currentVehicle' },
    weed             : { col: 'weeds',              targetType: 'weed',                                  current: 'currentWeed' },
    chemical         : { col: 'chemicals',          targetType: 'chemical',                              current: 'currentChemical' }
};

// How each kind of record points at what it sits in (walked upward to say where it is)
var ASK_AI_PARENTS = {
    things            : { field: 'roomId',      col: 'rooms' },
    rooms             : { field: 'floorId',     col: 'floors' },
    subThings         : { field: 'thingId',     col: 'things' },
    subThingItems     : { field: 'subThingId',  col: 'subThings' },
    garageThings      : { field: 'roomId',      col: 'garageRooms' },
    garageSubThings   : { field: 'thingId',     col: 'garageThings' },
    structureThings   : { field: 'structureId', col: 'structures' },
    structureSubThings: { field: 'thingId',     col: 'structureThings' }
};

// What sits inside a record (listed by name so the AI knows its parts/contents)
var ASK_AI_CHILDREN = {
    things         : { col: 'subThings',          field: 'thingId' },
    subThings      : { col: 'subThingItems',      field: 'subThingId' },
    garageThings   : { col: 'garageSubThings',    field: 'thingId' },
    structureThings: { col: 'structureSubThings', field: 'thingId' }
};

// Fields shown with friendly labels, in this order; any other simple field is listed after them
var ASK_AI_THING_FIELDS = [
    ['name', 'Name'], ['category', 'Category'], ['description', 'Description'], ['worth', 'Value I recorded'],
    ['notes', 'My notes'], ['tags', 'Tags']
];
// Never sent: internal links, images and bookkeeping
var ASK_AI_SKIP_FIELDS = ['profilePhotoData', 'createdAt', 'updatedAt', 'sortOrder', 'order', 'beneficiaryContactId',
                          'archived', 'archivedAt', 'archivedReason', 'licensePlate'];

// Any button with class "ask-ai-btn" and data-askai="<kind>" opens Ask AI for the record on screen
document.addEventListener('click', function(e) {
    var btn = e.target.closest && e.target.closest('.ask-ai-btn[data-askai]');
    if (btn) askAiForKind(btn.dataset.askai);
});

/** Open Ask AI for the record currently shown on a thing/sub-thing/item/vehicle page. */
function askAiForKind(kind) {
    var k = ASK_AI_KINDS[kind];
    var rec = k ? window[k.current] : null;
    if (!rec || !rec.id) return;
    var picture = askAiFirstPicture(k.targetType, rec.id, rec.profilePhotoData);
    if (kind === 'vehicle') {
        openAskAiModal('Ask an AI About ' + _askAiVehicleName(rec), askAiVehiclePrompt(rec.id), picture);
    } else if (kind === 'weed') {
        openAskAiModal('Ask an AI About ' + (rec.name || 'This Weed'), askAiWeedPrompt(rec.id), picture);
    } else if (kind === 'chemical') {
        openAskAiModal('Ask an AI About ' + (rec.name || 'This Product'), askAiChemicalPrompt(rec.id), picture);
    } else {
        openAskAiModal('Ask an AI About ' + (rec.name || 'This Item'), askAiThingPrompt(kind, rec.id), picture);
    }
}

/** "TV" from "tags" / "beneficiary" style keys → "Some field" style labels for leftover fields. */
function _askAiHumanize(key) {
    var s = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim().toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Leftover simple fields (strings, numbers, true/false, short lists) not already shown. */
function _askAiOtherFields(data, shownKeys) {
    var lines = [];
    Object.keys(data).sort().forEach(function(key) {
        if (shownKeys.indexOf(key) !== -1 || ASK_AI_SKIP_FIELDS.indexOf(key) !== -1) return;
        if (/Id$|Ids$/.test(key)) return;   // links to other records
        var v = data[key];
        if (v === null || v === undefined || v === '') return;
        if (Array.isArray(v)) {
            if (!v.length || typeof v[0] === 'object') return;
            v = v.join(', ');
        } else if (typeof v === 'object') {
            return;   // nested data / timestamps
        } else if (typeof v === 'boolean') {
            v = v ? 'yes' : 'no';
        }
        lines.push(askAiField(_askAiHumanize(key), v));
    });
    return lines;
}

/** "House > 1st Floor > Office > Desk" — walks up from the record to its top-level area. */
async function _askAiLocationPath(col, data, area) {
    var parts = [];
    var curCol = col, cur = data, guard = 0;
    while (ASK_AI_PARENTS[curCol] && guard++ < 6) {
        var link = ASK_AI_PARENTS[curCol];
        var pid = cur[link.field];
        if (!pid) break;
        var snap = await userCol(link.col).doc(pid).get();
        if (!snap.exists) break;
        cur = snap.data();
        parts.unshift(cur.name + (link.col === 'structures' && cur.type ? ' (' + cur.type + ')' : ''));
        curCol = link.col;
    }
    if (area) parts.unshift(area);
    return parts.join(' > ');
}

/**
 * Prompt for a thing / sub-thing / item (house, garage or structure): its details, where it is,
 * what is inside it, who it is set aside for, and every related record.
 */
async function askAiThingPrompt(kind, id) {
    var k = ASK_AI_KINDS[kind];
    var snap = await userCol(k.col).doc(id).get();
    if (!snap.exists) throw new Error('Record not found');
    var data = snap.data();

    var childDef = ASK_AI_CHILDREN[k.col];
    var results = await Promise.all([
        _askAiLocationPath(k.col, data, k.area),
        askAiHome(),
        askAiRelatedRecords(k.targetType, id),
        childDef ? userCol(childDef.col).where(childDef.field, '==', id).get().catch(function() { return null; }) : null,
        data.beneficiaryContactId ? userCol('people').doc(data.beneficiaryContactId).get().catch(function() { return null; }) : null
    ]);
    var where = results[0], home = results[1], rel = results[2], children = results[3], beneficiary = results[4];

    var details = ASK_AI_THING_FIELDS.map(function(f) {
        var v = data[f[0]];
        if (Array.isArray(v)) v = v.join(', ');
        if (f[0] === 'worth' && v !== undefined && v !== null && v !== '' && !isNaN(Number(v))) v = '$' + Number(v).toLocaleString();
        return askAiField(f[1], v);
    });
    details.push(askAiField('Where it is', where));
    if (beneficiary && beneficiary.exists) details.push(askAiField('Set aside for (beneficiary)', beneficiary.data().name));
    details = details.concat(_askAiOtherFields(data, ASK_AI_THING_FIELDS.map(function(f) { return f[0]; })));

    var inside = [];
    if (children) {
        children.forEach(function(c) {
            var d = c.data();
            inside.push([d.name, d.description].filter(Boolean).join(' — '));
        });
    }

    return [
        'I want to talk with you about something I own and ask you some questions about it. Below is everything I have recorded about it in my home-tracking app. Use it as background for our whole conversation.',
        askAiSection('THE ITEM', details),
        askAiSection('WHAT IS INSIDE IT / ITS PARTS', inside),
        askAiSection('ABOUT ME', [askAiField('I live near', home), askAiField("Today's date", askAiDate(new Date()))])
    ].concat(askAiRelatedSections(rel))
     .concat([askAiConversationRules('item', [
        'If my notes or photos captions give a brand or model, identify it and tell me the main specs, the maintenance it needs, common problems, and its typical lifespan.',
        'If I recorded a value, tell me whether it seems reasonable today, and anything that affects it.'
     ])]).filter(Boolean).join('\n\n');
}

// ---------- Vehicles ----------

function _askAiVehicleName(v) {
    return [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') || 'This Vehicle';
}

/**
 * Prompt for a vehicle: its details (including VIN, which identifies the exact build), the mileage
 * log, and every related record (service history, problems, tasks, scheduled maintenance).
 */
async function askAiVehiclePrompt(id) {
    var snap = await userCol('vehicles').doc(id).get();
    if (!snap.exists) throw new Error('Vehicle not found');
    var v = snap.data();

    var results = await Promise.all([
        askAiHome(),
        askAiRelatedRecords('vehicle', id),
        userCol('mileageLogs').where('vehicleId', '==', id).get().catch(function() { return null; })
    ]);
    var home = results[0], rel = results[1], mileSnap = results[2];

    var logs = mileSnap ? mileSnap.docs.map(function(d) { return d.data(); }) : [];
    logs.sort(function(a, b) { return _askAiDateKey(b.date).localeCompare(_askAiDateKey(a.date)); });
    var latest = logs[0];

    var known = ['year', 'make', 'model', 'trim', 'color', 'vin', 'purchaseDate', 'purchasePrice', 'notes'];
    var details = [
        askAiField('Vehicle', _askAiVehicleName(v)),
        askAiField('Color', v.color),
        askAiField('VIN', v.vin),
        askAiField('Bought', askAiDate(v.purchaseDate)),
        askAiField('Purchase price', v.purchasePrice ? '$' + Number(v.purchasePrice).toLocaleString() : ''),
        askAiField('Current mileage (latest reading)', latest ? Number(latest.mileage).toLocaleString() + ' miles on ' + askAiDate(latest.date) : ''),
        askAiField('Status', v.archived ? 'No longer have it' + (v.archivedReason ? ' (' + v.archivedReason + ')' : '') : ''),
        askAiField('My notes', v.notes)
    ].concat(_askAiOtherFields(v, known));

    var mileLines = logs.slice(0, 30).map(function(l) {
        return askAiDate(l.date) + ' — ' + Number(l.mileage).toLocaleString() + ' miles' + (l.notes ? ' (' + l.notes + ')' : '');
    });
    if (logs.length > 30) mileLines.push('(' + (logs.length - 30) + ' older readings not shown)');

    return [
        'I want to talk with you about one of my vehicles and ask you some questions about it. Below is everything I have recorded about it in my tracking app. Use it as background for our whole conversation.',
        askAiSection('THE VEHICLE', details),
        askAiSection('MILEAGE LOG (newest first)', mileLines),
        askAiSection('ABOUT ME', [askAiField('I live near', home), askAiField("Today's date", askAiDate(new Date()))])
    ].concat(askAiRelatedSections(rel))
     .concat([askAiConversationRules('vehicle', [
        'Use the year, make, model and VIN to identify the exact version (engine, generation) if you can.',
        'Based on the mileage and my service history, tell me which maintenance is likely due or overdue (oil, tires, brakes, fluids, filters, timing belt, battery and so on), and mention well-known problems or recalls for this model.'
     ])]).filter(Boolean).join('\n\n');
}

// ---------- Weeds ----------

/** "Front Yard > By Mailbox" for a zone id (or '' if missing). */
async function _askAiZonePath(zoneId) {
    var parts = [], id = zoneId, guard = 0;
    while (id && guard++ < 5) {
        var z = await userCol('zones').doc(id).get();
        if (!z.exists) break;
        parts.unshift(z.data().name || '');
        id = z.data().parentId;
    }
    return parts.join(' > ');
}

/**
 * Prompt for a weed: what I call it, how and when I treat it, where it grows, the AI-identification
 * notes saved with it, and every related record (treatments logged, facts, photos...).
 */
async function askAiWeedPrompt(id) {
    var snap = await userCol('weeds').doc(id).get();
    if (!snap.exists) throw new Error('Weed not found');
    var w = snap.data();

    var results = await Promise.all([
        Promise.all((w.zoneIds || []).map(_askAiZonePath)),
        askAiHome(),
        askAiChemicalNames(),
        askAiRelatedRecords('weed', id)
    ]);
    var zonePaths = results[0].filter(Boolean), home = results[1], chemicals = results[2], rel = results[3];

    var known = ['name', 'treatmentMethod', 'applicationTiming', 'notes', 'whatToLookFor', 'urlMoreInfo', 'zones'];
    var details = [
        askAiField('Name', w.name),
        askAiField('How I treat it', w.treatmentMethod),
        askAiField('When I treat it', w.applicationTiming),
        askAiField('What to look for (identification notes)', w.whatToLookFor),
        askAiField('More info link I saved', w.urlMoreInfo),
        askAiField('My notes', w.notes)
    ].concat(_askAiOtherFields(w, known));

    return [
        'I want to talk with you about a weed in my yard and ask you some questions about it. Below is everything I have recorded about it in my yard-tracking app. Use it as background for our whole conversation.',
        askAiSection('THE WEED', details),
        askAiSection('WHERE IT GROWS IN MY YARD', zonePaths),
        askAiSection('ABOUT ME', [askAiField('I live near', home), askAiField("Today's date", askAiDate(new Date()))])
    ].concat(askAiRelatedSections(rel, { chemicals: chemicals }))
     .concat([askAiConversationRules('weed', [
        'Confirm whether my identification seems right, and how to tell it apart from look-alikes.',
        'Tell me whether my treatment method and timing are effective for my area and this time of year, what the next treatment window is (including pre-emergent timing), and how to keep it from coming back.',
        'Mention safety for nearby plants, lawn, pets and children for the products involved.'
     ])]).filter(Boolean).join('\n\n');
}

// ---------- Products (chemicals) ----------

// Collection + display-name rule for each kind of record an activity can be logged against
var ASK_AI_TARGET_NAMES = {
    plant: 'plants', zone: 'zones', weed: 'weeds', room: 'rooms', thing: 'things', subthing: 'subThings',
    item: 'subThingItems', garageroom: 'garageRooms', garagething: 'garageThings', garagesubthing: 'garageSubThings',
    structure: 'structures', structurething: 'structureThings', structuresubthing: 'structureSubThings', vehicle: 'vehicles'
};

/** Name of the record an activity was logged against ("Azalea by mailbox", "Front Yard"...). */
async function _askAiTargetName(targetType, targetId, cache) {
    var key = targetType + '/' + targetId;
    if (cache[key] !== undefined) return cache[key];
    var col = ASK_AI_TARGET_NAMES[targetType];
    var name = '';
    if (col && targetId) {
        try {
            var d = await userCol(col).doc(targetId).get();
            if (d.exists) {
                var data = d.data();
                name = targetType === 'vehicle' ? _askAiVehicleName(data) : (data.alias || data.name || '');
            }
        } catch (e) { /* unnamed */ }
    }
    cache[key] = name;
    return name;
}

/**
 * Prompt for a product: its notes and facts, every logged use (date, what it was applied to, notes),
 * and the saved actions that use it.
 */
async function askAiChemicalPrompt(id) {
    var snap = await userCol('chemicals').doc(id).get();
    if (!snap.exists) throw new Error('Product not found');
    var c = snap.data();

    var results = await Promise.all([
        askAiHome(),
        askAiRelatedRecords('chemical', id),
        userCol('activities').where('chemicalIds', 'array-contains', id).get().catch(function() { return null; }),
        userCol('savedActions').where('chemicalIds', 'array-contains', id).get().catch(function() { return null; })
    ]);
    var home = results[0], rel = results[1], usesSnap = results[2], actionsSnap = results[3];

    var uses = usesSnap ? usesSnap.docs.map(function(d) { return d.data(); }) : [];
    uses.sort(function(a, b) { return _askAiDateKey(b.date || b.createdAt).localeCompare(_askAiDateKey(a.date || a.createdAt)); });
    var nameCache = {};
    var useLines = [];
    for (var i = 0; i < uses.length && i < 60; i++) {
        var u = uses[i];
        var target = await _askAiTargetName(u.targetType, u.targetId, nameCache);
        useLines.push(askAiDate(u.date || u.createdAt) + ' — ' + (u.description || '') +
                      (target ? ' on ' + target + ' (' + u.targetType + ')' : '') + (u.notes ? ' — ' + u.notes : ''));
    }
    if (uses.length > 60) useLines.push('(' + (uses.length - 60) + ' older uses not shown)');

    var actionLines = actionsSnap ? actionsSnap.docs.map(function(d) {
        var a = d.data();
        return [a.name, a.description, a.notes].filter(Boolean).join(' — ');
    }) : [];

    var details = [askAiField('Name', c.name), askAiField('My notes', c.notes)].concat(_askAiOtherFields(c, ['name', 'notes']));

    return [
        'I want to talk with you about a lawn/garden product I use and ask you some questions about it. Below is everything I have recorded about it in my yard-tracking app, including every time I logged using it. Use it as background for our whole conversation.',
        askAiSection('THE PRODUCT', details),
        askAiSection('EVERY TIME I LOGGED USING IT (newest first)', useLines),
        askAiSection('SAVED ACTIONS THAT USE IT', actionLines),
        askAiSection('ABOUT ME', [askAiField('I live near', home), askAiField("Today's date", askAiDate(new Date()))])
    ].concat(askAiRelatedSections(rel))
     .concat([askAiConversationRules('product', [
        'Identify the product if you can: active ingredient(s), what it is for, and how it works.',
        'Compare how often and when I have used it with typical label directions (rates, intervals, yearly maximums, temperature or season limits), and tell me if anything looks too frequent or mistimed. Remind me to follow the actual label.',
        'Cover safety: pets and children, rain-free and re-entry times, nearby plants, storage and shelf life.'
     ], 'Start with a short summary of what this product is and how I have been using it.')]).filter(Boolean).join('\n\n');
}
