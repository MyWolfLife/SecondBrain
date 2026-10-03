// ============================================================
// askai.js — "Ask AI" for any record in the app
//
// One shared dialog (#askAiModal) that shows a ready-made prompt with buttons to Copy it or open
// ChatGPT, Claude or Google AI Mode with it already filled in. Each kind of record builds its own
// prompt from everything the app knows about it; the shared loaders below collect the records
// every entity can have (facts, problems, quick tasks, activities, calendar events, photos).
//
// Used by: plants (askAiForPlant), Bucket List items (bucketlist-links.js).
// Planned next: things, vehicles.
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
 */
async function openAskAiModal(title, promptOrPromise) {
    var box = document.getElementById('askAiText');
    var status = document.getElementById('askAiStatus');
    document.getElementById('askAiTitle').textContent = title || 'Ask an AI';
    box.value = 'Building the prompt…';
    status.textContent = '';

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
        if (btn) btn.onclick = function() { _askAiOpenIn(key, box.value, status); };
    });

    openModal('askAiModal');
    try {
        box.value = await promptOrPromise;
        setEnabled(true);
    } catch (err) {
        console.error('Could not build the AI prompt:', err);
        box.value = '';
        status.textContent = 'Could not gather the information for the prompt: ' + err.message;
    }
}

/** Copy text to the clipboard. Returns true on success. */
async function _askAiCopy(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) { return false; }
}

/**
 * Open a chat app in a new tab with the prompt filled in. The prompt is always copied too; when it
 * is too long for a web address the app opens empty and the user pastes it.
 */
function _askAiOpenIn(key, text, statusEl) {
    var t = ASK_AI_TARGETS[key];
    var encoded = encodeURIComponent(text);
    _askAiCopy(text);   // best effort, so the prompt is on the clipboard either way
    if (encoded.length <= ASK_AI_MAX_URL_CHARS) {
        window.open(t.withPrompt + encoded, '_blank', 'noopener');
        statusEl.textContent = '';
    } else {
        window.open(t.empty, '_blank', 'noopener');
        statusEl.textContent = 'This prompt is too long to pass straight to ' + t.label + ', so it was copied. Paste it into the chat box there.';
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
function askAiConversationRules(thing, extraFirstSteps) {
    var steps = [
        'Start with a short summary of what this ' + thing + ' is and how it seems to be doing based on my records.',
    ].concat(extraFirstSteps || []).concat([
        'Then ask me what I would like to know, and keep all of this information in mind for my follow-up questions.',
        'If something in my records looks wrong (a misidentified name, care details that don\'t fit), tell me.',
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
    openAskAiModal('Ask an AI About ' + (plant.alias || plant.name || 'This Plant'), askAiPlantPrompt(plantId));
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
