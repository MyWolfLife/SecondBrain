// workout-import.js — Fitness → Exercises → ⬆ Import (ImportPlan.md)
//
// Reads a JSON file of exercises from the person's own computer (format 'bishop-exercises-v1', see ImportPlan.md),
// shows a REVIEW list (tick what to import; muscles mapped to the person's own muscle list; new equipment marked;
// exercises they already have flagged; levels counted), and only then writes exercises, new equipment and levels —
// exactly as if they had been typed in. Every imported exercise is stamped with the file's `source`, and a second section
// removes everything imported from one source again (exercises that a workout uses are left alone).
//
// The file itself is never uploaded or stored by the app, and book-derived files are kept out of the repository.

var _woImp = null;    // { source, rows: [{ raw, doc, include, issues[], unmapped[], newEquip[], dupId }], newEquip: {name→description} }

/** Book / common muscle names → this app's muscle ids (workoutMuscles doc ids). */
var WO_IMPORT_MUSCLES = {
    'pectorals': 'chest', 'pecs': 'chest', 'chest': 'chest', 'pectoralis': 'chest',
    'deltoids': 'shoulders', 'shoulders': 'shoulders', 'delts': 'shoulders',
    'front deltoids': 'front-shoulders', 'anterior deltoids': 'front-shoulders', 'front shoulders': 'front-shoulders', 'front delts': 'front-shoulders',
    'rear deltoids': 'rear-shoulders', 'posterior deltoids': 'rear-shoulders', 'rear shoulders': 'rear-shoulders', 'rear delts': 'rear-shoulders',
    'triceps': 'triceps', 'biceps': 'biceps', 'forearms': 'forearms', 'forearm': 'forearms', 'grip': 'forearms', 'wrist flexors': 'forearms', 'wrist extensors': 'forearms',
    'lats': 'lats', 'latissimus dorsi': 'lats', 'upper back': 'upper-back', 'back': 'upper-back', 'rhomboids': 'upper-back', 'traps': 'traps', 'trapezius': 'traps',
    'abs': 'abs', 'abdominals': 'abs', 'rectus abdominis': 'abs', 'core': 'abs', 'core stability': 'abs', 'stabilizers': 'abs', 'obliques': 'obliques',
    'lower back': 'lower-back', 'spinal erectors': 'lower-back', 'erector spinae': 'lower-back', 'erectors': 'lower-back',
    'glutes': 'glutes', 'gluteus': 'glutes', 'gluteus maximus': 'glutes', 'hips': 'hips', 'hip flexors': 'hips', 'adductors': 'hips', 'abductors': 'hips', 'groin': 'hips', 'inner thighs': 'hips',
    'quads': 'quads', 'quadriceps': 'quads', 'thighs': 'quads', 'hamstrings': 'hamstrings', 'calves': 'calves', 'calf': 'calves', 'cardio': 'cardio', 'heart': 'cardio'
};

function _woImpMuscleId(name) {
    var key = String(name || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
    var id = WO_IMPORT_MUSCLES[key] || (_woMuscleMap[key.replace(/ /g, '-')] ? key.replace(/ /g, '-') : null);
    return id && _woMuscleMap[id] ? id : null;
}

/** Turns one raw record into a ready-to-save exercise doc (or null if it has no name). Collects problems for the review. */
function _woImpBuild(raw, source, newEquip) {
    var name = String(raw.name || '').trim().slice(0, 80);
    if (!name) return null;
    var issues = [], unmapped = [], newNames = [];

    var eq = function(list) {
        var out = [];
        (list || []).forEach(function(q) {
            var n = String((q && q.name) || q || '').trim(), d = String((q && q.description) || '').trim();
            if (!n) return;
            var have = _woFindEquipment(n), canon = have ? have.name : n;
            if (!have) { if (!(canon in newEquip) || (!newEquip[canon] && d)) newEquip[canon] = d; if (newNames.indexOf(canon) === -1) newNames.push(canon); }
            if (out.indexOf(canon) === -1) out.push(canon);
        });
        return out;
    };
    var cues = function(c) { return (Array.isArray(c) ? c : String(c || '').split('\n')).map(function(x) { return String(x).trim(); }).filter(Boolean).join('\n'); };

    var measure = raw.measure === 'time' ? 'time' : 'reps';
    var amount = parseInt(raw.amount, 10);
    var sideMode = ['both', 'each', 'alternate'].indexOf(raw.sideMode) !== -1 ? raw.sideMode : 'both';
    var doc = {
        name: name, instructions: cues(raw.cues), measure: measure,
        defaultAmount: amount > 0 ? amount : (measure === 'time' ? 30 : 10), usesWeight: !!raw.usesWeight, defaultWeight: null,
        sideMode: sideMode, eachSide: sideMode === 'each',
        startSide: ['left', 'right', 'weaker'].indexOf(raw.startSide) !== -1 ? raw.startSide : 'left', swapStart: sideMode === 'each' && !!raw.swapStart,
        equipment: eq(raw.equipment), targets: [],
        pushPull: WO_PUSHPULL[raw.pushPull] ? raw.pushPull : 'neither',
        category: WO_CATEGORIES[raw.category] ? raw.category : '',
        source: String(raw.source || source || '').slice(0, 60), precaution: String(raw.precaution || '').trim().slice(0, 200),
        videoUrl: '', archived: false, isSeeded: false
    };
    if (!doc.category) issues.push('no category');

    // Muscles: the book lists them by emphasis — the first two become ★ main
    var mainCount = raw.mainCount >= 1 ? raw.mainCount : 2;
    (raw.muscles || []).forEach(function(m) {
        var id = _woImpMuscleId(m);
        if (!id) { unmapped.push(String(m)); return; }
        if (doc.targets.some(function(t) { return t.muscleId === id; })) return;
        doc.targets.push({ muscleId: id, main: doc.targets.length < mainCount });
    });
    if (!doc.targets.length) issues.push('no muscles');

    // Levels (easiest → hardest); the first keeps id 'base'
    var lv = (Array.isArray(raw.levels) ? raw.levels : []).filter(function(l) { return l && (l.label || l.cues); }).slice(0, 8);
    if (lv.length > 1) {
        doc.levels = lv.map(function(l, i) {
            var d = parseInt(l.difficulty, 10), a = parseInt(l.amount, 10);
            return { id: i === 0 ? WO_BASE_LEVEL_ID : woNewLevelId(), label: String(l.label || '').trim().slice(0, 40),
                     difficulty: d >= 1 && d <= 4 ? d : null, instructions: cues(l.cues), equipment: eq(Array.isArray(l.equipment) ? l.equipment : []),
                     videoUrl: '', defaultAmount: a > 0 && a !== doc.defaultAmount ? a : null, defaultWeight: null, archived: false };
        });
        doc.instructions = doc.levels[0].instructions;                               // top-level fields mirror the first level
        var union = [];
        doc.levels.forEach(function(l) { l.equipment.forEach(function(q) { if (union.indexOf(q) === -1) union.push(q); }); });
        doc.equipment = union;
    }
    if (!doc.instructions && !(doc.levels && doc.levels.length)) issues.push('no cues');

    // Pictures: file names only (matched to the folder the person chooses). A level's own picture(s) go to that level;
    // the rest follow the nearest earlier level picture in the list (before any: the first level).
    var pics = [], asList = function(v) { return (Array.isArray(v) ? v : (v ? [v] : [])).map(function(x) { return String(x).split(/[\\/]/).pop().trim(); }).filter(Boolean); };
    var byFile = {};
    (doc.levels || []).forEach(function(l, i) { asList((lv[i] || {}).image).concat(asList((lv[i] || {}).images)).forEach(function(f) { if (byFile[f.toLowerCase()] === undefined) byFile[f.toLowerCase()] = i; }); });
    var cur = 0, seen = {};
    asList(raw.images).concat(asList(raw.image)).forEach(function(f) {
        var k = f.toLowerCase(); if (seen[k]) return; seen[k] = true;
        if (byFile[k] !== undefined) cur = byFile[k];
        pics.push({ file: f, levelIndex: doc.levels ? cur : -1 });
    });
    Object.keys(byFile).forEach(function(k) { if (!seen[k]) { seen[k] = true; pics.push({ file: k, levelIndex: byFile[k] }); } });
    if (doc.levels) pics.sort(function(x, y) { return x.levelIndex - y.levelIndex; });   // stable: keeps list order inside a level

    var dup = _woExercises.filter(function(e) { return e.name.trim().toLowerCase() === name.toLowerCase(); })[0];
    return { raw: raw, doc: doc, include: !dup, issues: issues, unmapped: unmapped, newEquip: newNames, dupId: dup ? dup.id : null, pics: pics };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

async function loadWorkoutImportPage() {
    _woSetChrome([['Exercises', '#workout-exercises'], ['Import']]);
    var el = document.getElementById('page-workout-import');
    el.innerHTML = '<div class="page-header"><h2>Import exercises</h2></div><div class="ex-status">Loading…</div>';
    try { await woLoadMuscles(); await woLoadExercises(); await woLoadEquipment(); }
    catch (err) { console.error('Workouts: could not open import:', err); el.innerHTML = '<div class="ex-status">Could not load your library.</div>'; return; }
    _woImp = null; _woImpFiles = {};
    _woImpRender();
}

var _woImpFiles = {};   // lower-case file name → File, from the chosen pictures folder

function _woImpSources() {
    var s = {};
    _woExercises.forEach(function(e) { if (e.source) s[e.source] = (s[e.source] || 0) + 1; });
    return s;
}

function _woImpRender(resultHtml) {
    var el = document.getElementById('page-workout-import');
    var sources = _woImpSources(), srcKeys = Object.keys(sources);

    var review = '';
    if (_woImp) {
        var inc = _woImp.rows.filter(function(r) { return r.include; });
        var allNew = {};
        inc.forEach(function(r) { r.newEquip.forEach(function(n) { allNew[n] = true; }); });
        review =
            '<div class="ex-form-group"><label class="ex-label">Review — ' + _woImp.rows.length + ' exercise' + (_woImp.rows.length === 1 ? '' : 's') + ' in the file' +
                (_woImp.source ? ' (source “' + _woEsc(_woImp.source) + '”)' : '') + '</label>' +
                '<div class="wo-hint">Untick anything you don\'t want. Exercises you already have are unticked.</div>' +
                '<div class="wo-imp-tools"><button type="button" class="wo-link-btn" id="woImpAll">Tick all</button> · <button type="button" class="wo-link-btn" id="woImpNone">Untick all</button> · ' +
                    '<button type="button" class="wo-link-btn" id="woImpNew">Tick only new ones</button></div>' +
                '<div id="woImpList">' + _woImp.rows.map(function(r, i) {
                    var d = r.doc, mus = d.targets.map(function(t) { return (t.main ? '★ ' : '') + _woEsc(_woMuscleMap[t.muscleId].name); }).join(', ');
                    var flags = [];
                    if (r.dupId) flags.push('<span class="wo-badge wo-badge--archived">already have it</span>');
                    var found = r.pics.filter(function(p) { return _woImpFiles[p.file.toLowerCase()]; }).length;
                    if (r.pics.length) flags.push('<span class="wo-badge wo-badge--' + (found === r.pics.length ? 'neither' : 'pull') + '">🖼 ' + found + (found < r.pics.length ? ' of ' + r.pics.length + ' (' + (Object.keys(_woImpFiles).length ? r.pics.length - found + ' missing' : 'choose the folder') + ')' : ' picture' + (found === 1 ? '' : 's')) + '</span>');
                    if (d.levels) flags.push('<span class="wo-badge wo-badge--neither">' + d.levels.length + ' levels</span>');
                    if (r.newEquip.length) flags.push('<span class="wo-badge wo-badge--both">➕ ' + r.newEquip.map(_woEsc).join(', ') + '</span>');
                    r.issues.forEach(function(x) { flags.push('<span class="wo-badge wo-badge--pull">' + _woEsc(x) + '</span>'); });
                    if (r.unmapped.length) flags.push('<span class="wo-badge wo-badge--pull">skipped muscles: ' + r.unmapped.map(_woEsc).join(', ') + '</span>');
                    return '<div class="wo-imp-row"><label class="wo-imp-main"><input type="checkbox" data-imp="' + i + '"' + (r.include ? ' checked' : '') + '> <strong>' + _woEsc(d.name) + '</strong> ' +
                           (d.category ? '<span class="wo-hint">' + _woEsc(woCategoryLabel(d.category)) + '</span>' : '') + '</label>' +
                           '<div class="wo-hint">' + (mus || 'no muscles') + (d.equipment.length ? ' · ' + d.equipment.map(_woEsc).join(', ') : '') + '</div>' +
                           '<div class="wo-imp-flags">' + flags.join(' ') + ' <button type="button" class="wo-link-btn" data-prev="' + i + '">Preview</button></div></div>';
                }).join('') + '</div>' +
                '<div class="ex-form-actions"><button type="button" class="btn btn-primary" id="woImpGo"' + (inc.length ? '' : ' disabled') + '>Import ' + inc.length + ' exercise' + (inc.length === 1 ? '' : 's') +
                    (Object.keys(allNew).length ? ' + ' + Object.keys(allNew).length + ' new equipment' : '') + '</button>' +
                    '<button type="button" class="btn btn-secondary" id="woImpCancel">Cancel</button></div></div>';
    }

    el.innerHTML =
        '<div class="page-header"><h2>Import exercises</h2></div>' +
        '<div class="ex-form">' +
            (resultHtml ? '<div class="wo-banner">' + resultHtml + '</div>' : '') +
            '<div class="ex-form-group"><label class="ex-label" for="woImpFile">Choose an exercise file (.json)</label>' +
                '<input type="file" id="woImpFile" accept=".json,application/json">' +
                '<p class="wo-hint">The file stays on your computer — the app only reads it. You see a review list before anything is added. Imported exercises are tagged with the file\'s source so they can be removed again below.</p></div>' +
            '<div class="ex-form-group"><label class="ex-label" for="woImpPics">Pictures folder (optional)</label>' +
                '<input type="file" id="woImpPics" webkitdirectory multiple>' +
                '<p class="wo-hint">If the file names pictures, choose the folder that holds them' + (Object.keys(_woImpFiles).length ? ' — ' + Object.keys(_woImpFiles).length + ' picture files found' : '') + '. Pictures are shrunk and saved with each exercise.</p></div>' +
            '<div id="woImpMsg" class="wo-hint"></div>' +
            review +
            (srcKeys.length ? '<div class="ex-form-group wo-imp-remove"><label class="ex-label">Remove an import</label>' +
                '<p class="wo-hint">Removes every exercise tagged with a source (and its pictures). Exercises that are used in one of your workouts are kept.</p>' +
                srcKeys.map(function(k) { return '<div><button type="button" class="btn btn-danger btn-small" data-rm="' + _woEsc(k) + '">Remove all “' + _woEsc(k) + '” (' + sources[k] + ')</button></div>'; }).join('') + '</div>' : '') +
        '</div>';

    document.getElementById('woImpFile').addEventListener('change', _woImpFileChosen);
    document.getElementById('woImpPics').addEventListener('change', function() {
        _woImpFiles = {};
        Array.prototype.forEach.call(this.files || [], function(f) { if (/^image\//.test(f.type)) _woImpFiles[f.name.toLowerCase()] = f; });
        _woImpRender();
    });
    if (!_woImp) { el.querySelectorAll('[data-rm]').forEach(function(b) { b.addEventListener('click', function() { _woImpRemove(this.getAttribute('data-rm')); }); }); return; }
    el.querySelectorAll('[data-imp]').forEach(function(cb) {
        cb.addEventListener('change', function() { _woImp.rows[parseInt(this.getAttribute('data-imp'), 10)].include = this.checked; _woImpRender(); });
    });
    el.querySelectorAll('[data-prev]').forEach(function(b) { b.addEventListener('click', function() { _woImpPreview(parseInt(this.getAttribute('data-prev'), 10)); }); });
    document.getElementById('woImpAll').addEventListener('click', function() { _woImp.rows.forEach(function(r) { r.include = true; }); _woImpRender(); });
    document.getElementById('woImpNone').addEventListener('click', function() { _woImp.rows.forEach(function(r) { r.include = false; }); _woImpRender(); });
    document.getElementById('woImpNew').addEventListener('click', function() { _woImp.rows.forEach(function(r) { r.include = !r.dupId; }); _woImpRender(); });
    document.getElementById('woImpGo').addEventListener('click', _woImpGo);
    document.getElementById('woImpCancel').addEventListener('click', function() { _woImp = null; _woImpRender(); });
    el.querySelectorAll('[data-rm]').forEach(function(b) { b.addEventListener('click', function() { _woImpRemove(this.getAttribute('data-rm')); }); });
}

function _woImpMsg(text) { var m = document.getElementById('woImpMsg'); if (m) m.textContent = text || ''; }

async function _woImpFileChosen() {
    var file = this.files && this.files[0];
    if (!file) return;
    var text;
    try { text = await file.text(); } catch (err) { _woImpMsg('Could not read that file.'); return; }
    var data;
    try { data = JSON.parse(text); } catch (err) { _woImpMsg('That file is not valid JSON, so nothing was read.'); return; }
    var list = Array.isArray(data) ? data : data && data.exercises;
    if (!Array.isArray(list) || !list.length) { _woImpMsg('No exercises found in that file (it needs an "exercises" list).'); return; }
    var source = (!Array.isArray(data) && data.source) || '';
    var newEquip = {}, rows = [];
    list.forEach(function(raw) { var r = _woImpBuild(raw || {}, source, newEquip); if (r) rows.push(r); });
    if (!rows.length) { _woImpMsg('None of the entries had a name.'); return; }
    _woImp = { source: source, rows: rows, newEquip: newEquip };
    _woImpRender();
}

function _woImpPreview(i) {
    var r = _woImp.rows[i], d = r.doc;
    var cuesHtml = function(t) { return '<ul class="wo-view-cues">' + String(t || '').split('\n').filter(Boolean).map(function(c) { return '<li>' + _woEsc(c) + '</li>'; }).join('') + '</ul>'; };
    var body = d.levels
        ? d.levels.map(function(l, k) {
            return '<div class="wo-view-row"><strong>' + (k + 1) + '. ' + _woEsc(woLevelDisplay(l, k)) + '</strong>' + (l.difficulty ? ' · difficulty ' + l.difficulty : '') +
                   (l.equipment.length ? ' · ' + l.equipment.map(_woEsc).join(', ') : '') + cuesHtml(l.instructions) + '</div>'; }).join('')
        : '<div class="wo-view-row"><strong>Cues</strong>' + cuesHtml(d.instructions) + '</div>';
    var ov = _woGrabOverlay('<h3>' + _woEsc(d.name) + '</h3>' +
        '<div class="wo-view-row"><strong>Category:</strong> ' + _woEsc(woCategoryLabel(d.category) || '—') + ' · <strong>Push/Pull:</strong> ' + _woEsc(WO_PUSHPULL[d.pushPull].label) +
            ' · ' + _woEsc(woFmtAmount(d.measure, d.defaultAmount, null)) + ' · ' + (d.sideMode === 'each' ? 'one side then the other' : d.sideMode === 'alternate' ? 'alternating sides' : 'both together') + '</div>' +
        (d.precaution ? '<div class="wo-view-row wo-view-warn">⚠ ' + _woEsc(d.precaution) + '</div>' : '') + body +
        '<div class="ex-form-actions"><button type="button" class="btn btn-primary" id="woImpPrevClose">Close</button></div>');
    ov.querySelector('#woImpPrevClose').addEventListener('click', _woCloseGrabber);
}

async function _woImpGo() {
    var inc = _woImp.rows.filter(function(r) { return r.include; });
    if (!inc.length) return;
    var btn = document.getElementById('woImpGo');
    btn.disabled = true; btn.textContent = 'Importing…';
    try {
        // new equipment first (only what the ticked exercises use)
        var needed = {};
        inc.forEach(function(r) { r.newEquip.forEach(function(n) { needed[n] = _woImp.newEquip[n] || ''; }); });
        var ts = firebase.firestore.FieldValue.serverTimestamp();
        var ops = [];
        Object.keys(needed).forEach(function(n) {
            if (_woFindEquipment(n)) return;
            ops.push({ ref: woLibCol('workoutEquipment').doc(), data: { name: n, description: needed[n], createdAt: ts } });
        });
        inc.forEach(function(r) {
            var data = Object.assign({}, r.doc, { createdAt: ts });
            r.ref = woLibCol('workoutExercises').doc();
            ops.push({ ref: r.ref, data: data });
        });
        for (var i = 0; i < ops.length; i += 400) {
            var batch = db.batch();
            ops.slice(i, i + 400).forEach(function(o) { batch.set(o.ref, o.data); });
            await batch.commit();
        }
        // pictures: one photo doc per file, in order; the exercise thumbnail comes from the first level's first picture
        var picsDone = 0, picsFailed = 0;
        for (var k = 0; k < inc.length; k++) {
            var r2 = inc[k], order = 0, thumbSet = false;
            for (var j = 0; j < r2.pics.length; j++) {
                var pic = r2.pics[j], f = _woImpFiles[pic.file.toLowerCase()];
                if (!f) continue;
                btn.textContent = 'Pictures… ' + (picsDone + picsFailed + 1);
                try {
                    var dataUrl = await compressImage(f, { maxDimension: WO_FRAME_MAX_DIM, maxBase64: WO_FRAME_MAX_BASE64 });
                    var lvlId = r2.doc.levels && pic.levelIndex >= 0 ? r2.doc.levels[pic.levelIndex].id : WO_BASE_LEVEL_ID;
                    await woLibCol('photos').add({ targetType: 'workoutExercise', targetId: r2.ref.id, imageData: dataUrl, caption: '',
                                                   frameOrder: order++, levelId: lvlId, createdAt: ts });
                    var hasFirstLevelPic = !r2.doc.levels || r2.pics.some(function(q) { return q.levelIndex === 0 && _woImpFiles[q.file.toLowerCase()]; });
                    if (!thumbSet && (!hasFirstLevelPic || !r2.doc.levels || pic.levelIndex === 0)) {
                        thumbSet = true;
                        var thumb = await _compressToThumb(dataUrl);
                        if (thumb) await r2.ref.update({ thumbData: thumb });
                    }
                    picsDone++;
                } catch (perr) { console.error('Workouts: picture import failed for ' + pic.file + ':', perr); picsFailed++; }
            }
        }
        var eqCount = Object.keys(needed).length;
        _woImp = null; _woImpFiles = {};
        await woLoadExercises(); await woLoadEquipment();
        _woImpRender('✓ Imported ' + inc.length + ' exercise' + (inc.length === 1 ? '' : 's') + (eqCount ? ' and ' + eqCount + ' new equipment item' + (eqCount === 1 ? '' : 's') : '') +
                     (picsDone ? ', ' + picsDone + ' picture' + (picsDone === 1 ? '' : 's') : '') + (picsFailed ? ' (' + picsFailed + ' picture' + (picsFailed === 1 ? '' : 's') + ' could not be saved)' : '') +
                     '. <a href="#workout-exercises">See them in Exercises</a>.');
    } catch (err) {
        console.error('Workouts: import failed:', err);
        alert('The import failed part-way. Nothing more was written. You can use "Remove an import" below to clear what was added, then try again.');
        _woImpRender();
    }
}

async function _woImpRemove(source) {
    var mine = _woExercises.filter(function(e) { return e.source === source; });
    if (!mine.length) return;
    // which of them does a workout use?
    var used = {};
    try {
        (await woLibCol('workouts').get()).docs.forEach(function(d) { (d.data().exerciseIds || []).forEach(function(id) { used[id] = true; }); });
    } catch (err) { console.error('Workouts: could not check usage:', err); alert('Could not check which exercises your workouts use. Please try again.'); return; }
    var removable = mine.filter(function(e) { return !used[e.id]; });
    var kept = mine.length - removable.length;
    if (!removable.length) { alert('All ' + mine.length + ' of them are used in a workout, so none were removed.'); return; }
    if (!confirm('Remove ' + removable.length + ' exercise' + (removable.length === 1 ? '' : 's') + ' imported from “' + source + '”' +
                 (kept ? ' (' + kept + ' used in a workout will stay)' : '') + '? This cannot be undone.')) return;
    try {
        for (var i = 0; i < removable.length; i++) {
            var e = removable[i];
            var ph = await woLibCol('photos').where('targetType', '==', 'workoutExercise').where('targetId', '==', e.id).get();
            var batch = db.batch();
            ph.docs.forEach(function(d) { batch.delete(d.ref); });
            batch.delete(woLibCol('workoutExercises').doc(e.id));
            await batch.commit();
            if (typeof woClearMyLevel === 'function') woClearMyLevel(e.id);
        }
        await woLoadExercises();
        _woImpRender('✓ Removed ' + removable.length + ' exercise' + (removable.length === 1 ? '' : 's') + (kept ? '; ' + kept + ' kept because a workout uses them' : '') + '.');
    } catch (err) {
        console.error('Workouts: removing the import failed:', err);
        alert('Could not finish removing. Please try again.');
        await woLoadExercises(); _woImpRender();
    }
}
