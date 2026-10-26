// ─── Fitness → Programs → Import (ProgramsPlan.md, chunk P6) ───────────────────
//
// Reads a `bishop-programs-v1` file (made from the book's program tables, one program per file) and creates
//   • one WORKOUT per program day (built with the workout formats the book names), and
//   • the PROGRAM that lists those workouts week by week.
// Exercises and levels are looked up by name in YOUR library (nothing is invented): an item that can't be
// matched is left out of its workout and shown in the review.
//
// File shape (see import-data/PromptProgram-*.md):
//   { format, source, programs: [ { name, description, weeks: [ { from, to, block, days: [ { label, workout } ] } ] } ] }
//   workout = { name, format: 'ladder'|'interval'|'tabata'|'superset'|'stapper', items[] | pairs[] | cycle[] }
//   item    = { exercise, level?, levelFromBook?, pauseBottomSec?, pauseTopSec?, note }  or  { exerciseMissing, note }
//
// Everything is stamped with the file's `source` (as the exercise import does), so it can be removed again.

var _pimp = null;     // {source, programs: [built], fileName}

// The book's four programs follow each other; the finished card offers the next one (resolved by name when it is needed).
var _PIMP_NEXT_LEVEL = { 'yayog basic': 'YAYOG 1st Class', 'yayog 1st class': 'YAYOG Master', 'yayog master': 'YAYOG Chief' };

function _pimpFindExercise(name) {
    var n = String(name || '').trim().toLowerCase();
    if (!n) return null;
    return _woExercises.filter(function(e) { return !e.archived && (e.name || '').trim().toLowerCase() === n; })[0] || null;
}

/** The level of `ex` whose label equals `label` (case-insensitive), or null. */
function _pimpFindLevel(ex, label) {
    var l = String(label || '').trim().toLowerCase();
    if (!l || !woIsMultiLevel(ex)) return null;
    return woLevelsOf(ex).filter(function(lv) { return !lv.archived && String(lv.label || '').trim().toLowerCase() === l; })[0] || null;
}

/**
 * Builds one exercise step from an item. `issues` collects problems; returns null when the exercise can't be found.
 * A level is PINNED only when the book itself named the variation (levelFromBook); otherwise the step follows "my level".
 */
function _pimpStep(item, inCircuit, issues) {
    if (!item || item.exerciseMissing || !item.exercise) {
        issues.push('not in your library: ' + (item && (item.exerciseMissing || item.note) || '(unnamed)'));
        return null;
    }
    var ex = _pimpFindExercise(item.exercise);
    if (!ex) { issues.push('exercise not found: ' + item.exercise); return null; }
    var st = _woNewStep(ex, inCircuit);
    if (woIsMultiLevel(ex) && item.level) {
        var lv = _pimpFindLevel(ex, item.level);
        if (!lv) issues.push('level not found: ' + ex.name + ' / ' + item.level + ' (uses your level)');
        else if (item.levelFromBook) { st.levelMode = 'pinned'; st.levelId = lv.id; }
    }
    var t = {};
    if (item.pauseBottomSec > 0) t.pauseBottom = Number(item.pauseBottomSec);
    if (item.pauseTopSec > 0) t.pauseTop = Number(item.pauseTopSec);
    if (Object.keys(t).length) st.tempo = t;
    return st;
}

function _pimpSyncBase(st) { st.baseSets = _woCloneSets(st.sets); st.successStreak = 0; }

/** Steps for one day, in the shape the workout builder's "format" buttons produce. Returns {steps, notes, issues}. */
function _pimpBuildWorkoutSteps(wk, issues) {
    var steps = [], notes = [];
    var note = function(it) { if (it && it.note) notes.push(it.note); };
    var fmt = wk.format;

    if (fmt === 'ladder' || fmt === 'interval' || fmt === 'tabata') {
        (wk.items || []).forEach(function(it) {
            note(it);
            var st = _pimpStep(it, false, issues);
            if (!st) return;
            var first = (st.sets && st.sets[0]) || {}, wt = first.weight != null ? first.weight : null;
            if (fmt === 'ladder') {
                if (st.measure !== 'time') {
                    st.ladder = { minutes: WO_LADDER_DEFAULT.minutes, maxRung: WO_LADDER_DEFAULT.maxRung };
                    st.sets = [{ amount: 1, weight: wt }];
                }
            } else if (fmt === 'interval') {
                st.sets = [0, 1, 2].map(function() {
                    return st.measure === 'time' ? { amount: first.amount || 30, weight: wt, failure: true } : { amount: 6, amountMax: 12, weight: wt };
                });
                st.interval = { seconds: WO_INTERVAL_DEFAULT.seconds, capSec: WO_INTERVAL_DEFAULT.capSec };
            } else {
                st.timed = { workSec: WO_TIMED_PRESETS.tabata.workSec, restSec: WO_TIMED_PRESETS.tabata.restSec, rounds: WO_TIMED_PRESETS.tabata.rounds };
                if (st.measure !== 'time') st.sets = [{ amount: 1, weight: wt, failure: true }];
                st.restAfter = { mode: 'timed', seconds: 120 };
            }
            _pimpSyncBase(st);
            steps.push(st);
        });
    } else if (fmt === 'superset') {
        (wk.pairs || []).forEach(function(pr) {
            note(pr.first); note(pr.second);
            var a = _pimpStep(pr.first, true, issues), b = _pimpStep(pr.second, true, issues);
            var its = [];
            [a, b].forEach(function(st, i) {
                if (!st) return;
                var w0 = st.sets && st.sets[0] && st.sets[0].weight != null ? st.sets[0].weight : null;
                if (st.measure === 'time') st.sets = [{ amount: (st.sets && st.sets[0] && st.sets[0].amount) || 30, weight: w0 }];
                else st.sets = [i === 0 ? { amount: 1, amountMax: 5, weight: w0 } : { amount: 6, amountMax: 12, weight: w0 }];
                // the first exercise is slow and controlled (the book's recipe); any pause the book names replaces that part
                if (i === 0) st.tempo = Object.assign({ down: 3, pauseBottom: 1, up: 1, pauseTop: 1 }, st.tempo || {});
                _pimpSyncBase(st);
                its.push(st);
            });
            if (!its.length) return;
            var c = _woNewCircuit();
            c.items = its;
            c.interval = { seconds: WO_SUPERSET_DEFAULT.seconds, capSec: null };
            c.rounds = WO_SUPERSET_DEFAULT.rounds;
            c.restBetweenItems = _woBlankRest(0);
            steps.push(c);
        });
    } else if (fmt === 'stapper') {
        var its2 = [];
        (wk.cycle || []).forEach(function(c) {
            note(c.item);
            var st = _pimpStep(c.item, true, issues);
            if (!st) return;
            var w0 = st.sets && st.sets[0] && st.sets[0].weight != null ? st.sets[0].weight : null;
            if (st.measure !== 'time' && c.reps > 0) st.sets = [{ amount: Number(c.reps), weight: w0 }];
            _pimpSyncBase(st);
            its2.push(st);
        });
        if (its2.length) {
            var circ = _woNewCircuit();
            circ.items = its2;
            circ.rounds = 1;
            circ.stapper = { minutes: WO_STAPPER_DEFAULT.minutes };
            circ.restBetweenItems = _woBlankRest(0);
            steps.push(circ);
        }
    } else {
        issues.push('unknown format: ' + fmt);
    }
    return { steps: steps, notes: notes };
}

var _PIMP_FORMAT_LABEL = { ladder: 'Ladders', interval: 'Interval Sets', tabata: 'Tabatas', superset: 'Supersets', stapper: 'Stapper' };

/** One raw program → the built structure used by the review and the writer. */
function _pimpBuild(raw, source) {
    var out = { name: String(raw.name || '').trim().slice(0, 80), description: String(raw.description || '').trim().slice(0, 300), source: source,
                weeks: [], workouts: 0, items: 0, issues: [], include: true, dup: false };
    if (!out.name) { out.name = '(unnamed program)'; out.issues.push('no name'); }
    out.dup = (_pimp && _pimp.existingNames || {})[out.name.toLowerCase()] === true;
    out.nextProgramName = (source === 'YAYOG' && _PIMP_NEXT_LEVEL[out.name.toLowerCase()]) || '';
    out.include = !out.dup;
    (raw.weeks || []).forEach(function(w) {
        var bw = { from: w.from, to: w.to, block: String(w.block || '').trim(), days: [] };
        (w.days || []).forEach(function(d) {
            var wk = d.workout || {}, issues = [];
            var built = _pimpBuildWorkoutSteps(wk, issues);
            var ids = [];
            _woFlatExercises(built.steps).forEach(function(s) { if (s.exerciseId && ids.indexOf(s.exerciseId) === -1) ids.push(s.exerciseId); });
            var count = _woFlatExercises(built.steps).length;
            if (!count) issues.push('no exercises could be built for this day');
            var wname = String(wk.name || (out.name + ' ' + (d.label || ''))).trim().slice(0, 80);
            var desc = (_PIMP_FORMAT_LABEL[wk.format] || wk.format || '') + ' — ' + built.notes.join('; ');
            bw.days.push({ label: String(d.label || '').trim(), format: wk.format, name: wname, description: desc.slice(0, 600), steps: built.steps,
                           exerciseIds: ids, count: count, issues: issues });
            out.workouts++; out.items += count;
            issues.forEach(function(x) { out.issues.push(String(w.from) + (w.to !== w.from ? '–' + w.to : '') + ' · ' + (d.label || '') + ': ' + x); });
        });
        out.weeks.push(bw);
    });
    return out;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

async function loadProgramImportPage() {
    _woSetChrome([['Programs', '#programs'], ['Import']]);
    var el = document.getElementById('page-program-import');
    el.innerHTML = '<div class="page-header"><h2>Import programs</h2></div><div class="ex-status">Loading…</div>';
    try { await woLoadMuscles(); await woLoadExercises(); }
    catch (err) { console.error('Programs: could not open import:', err); el.innerHTML = '<div class="ex-status">Could not load your library.</div>'; return; }
    _pimp = null;
    await _pimpRender();
}

async function _pimpSources() {
    var s = {};
    var ps = await woLibCol('programs').get();
    ps.docs.forEach(function(d) { var x = d.data(); if (x.source) { s[x.source] = s[x.source] || { programs: 0, workouts: 0 }; s[x.source].programs++; } });
    var ws = await woLibCol('workouts').get();
    ws.docs.forEach(function(d) { var x = d.data(); if (x.source) { s[x.source] = s[x.source] || { programs: 0, workouts: 0 }; s[x.source].workouts++; } });
    return s;
}

async function _pimpRender(resultHtml) {
    var el = document.getElementById('page-program-import');
    var sources = await _pimpSources(), srcKeys = Object.keys(sources);
    var review = '';
    if (_pimp) {
        var inc = _pimp.programs.filter(function(p) { return p.include; });
        var totalW = inc.reduce(function(n, p) { return n + p.workouts; }, 0);
        review = '<div class="ex-form-group"><label class="ex-label">Review — ' + _pimp.programs.length + ' program' + (_pimp.programs.length === 1 ? '' : 's') + ' in the file' +
            (_pimp.source ? ' (source “' + _woEsc(_pimp.source) + '”)' : '') + '</label>' +
            '<div class="wo-hint">Each program day becomes a workout in your Workouts list, and the program lists them week by week. Anything the app could not match to your exercises is listed — it is left out of that workout.</div>' +
            _pimp.programs.map(function(p, i) {
                var matched = p.items;
                return '<div class="wo-imp-row"><label class="wo-imp-main"><input type="checkbox" data-pimp="' + i + '"' + (p.include ? ' checked' : '') + '> <strong>' + _woEsc(p.name) + '</strong></label>' +
                    '<div class="wo-hint">' + p.weeks.length + ' week block' + (p.weeks.length === 1 ? '' : 's') + ' · ' + p.workouts + ' workouts · ' + matched + ' exercises matched' + '</div>' +
                    '<div class="wo-imp-flags">' + (p.dup ? '<span class="wo-badge wo-badge--archived">already have a program with this name</span> ' : '') +
                        (p.issues.length ? '<span class="wo-badge wo-badge--pull">' + p.issues.length + ' problem' + (p.issues.length === 1 ? '' : 's') + '</span> ' : '<span class="wo-badge wo-badge--neither">everything matched</span> ') +
                        '<button type="button" class="wo-link-btn" data-pimp-prev="' + i + '">Preview</button></div></div>';
            }).join('') +
            '<div class="ex-form-actions"><button type="button" class="btn btn-primary" id="pimpGo"' + (inc.length ? '' : ' disabled') + '>Import ' + inc.length + ' program' + (inc.length === 1 ? '' : 's') +
                ' (' + totalW + ' workouts)</button><button type="button" class="btn btn-secondary" id="pimpCancel">Cancel</button></div></div>';
    }
    el.innerHTML =
        '<div class="page-header"><h2>Import programs</h2></div><div class="ex-form">' +
            (resultHtml ? '<div class="wo-banner">' + resultHtml + '</div>' : '') +
            '<div class="ex-form-group"><label class="ex-label" for="pimpFile">Choose a program file (.json)</label>' +
                '<input type="file" id="pimpFile" accept=".json,application/json">' +
                '<p class="wo-hint">The file stays on your computer. Import the exercises first — a program is built from exercises that are already in your library. You see a review before anything is added.</p></div>' +
            '<div id="pimpMsg" class="wo-hint"></div>' + review +
            (srcKeys.length ? '<div class="ex-form-group wo-imp-remove"><label class="ex-label">Remove an import</label>' +
                '<p class="wo-hint">Removes every program and workout tagged with a source (and any run of those programs). Your own programs and workouts stay.</p>' +
                srcKeys.map(function(k) { return '<div><button type="button" class="btn btn-danger btn-small" data-prm="' + _woEsc(k) + '">Remove all “' + _woEsc(k) + '” (' + sources[k].programs + ' programs, ' + sources[k].workouts + ' workouts)</button></div>'; }).join('') + '</div>' : '') +
        '</div>';
    document.getElementById('pimpFile').addEventListener('change', _pimpFileChosen);
    el.querySelectorAll('[data-prm]').forEach(function(b) { b.addEventListener('click', function() { _pimpRemove(this.getAttribute('data-prm')); }); });
    if (!_pimp) return;
    el.querySelectorAll('[data-pimp]').forEach(function(cb) {
        cb.addEventListener('change', function() { _pimp.programs[parseInt(this.getAttribute('data-pimp'), 10)].include = this.checked; _pimpRender(); });
    });
    el.querySelectorAll('[data-pimp-prev]').forEach(function(b) { b.addEventListener('click', function() { _pimpPreview(parseInt(this.getAttribute('data-pimp-prev'), 10)); }); });
    document.getElementById('pimpGo').addEventListener('click', _pimpGo);
    document.getElementById('pimpCancel').addEventListener('click', function() { _pimp = null; _pimpRender(); });
}

function _pimpMsg(t) { var m = document.getElementById('pimpMsg'); if (m) m.textContent = t || ''; }

async function _pimpFileChosen() {
    var file = this.files && this.files[0];
    if (!file) return;
    var data;
    try { data = JSON.parse(await file.text()); } catch (err) { _pimpMsg('That file is not valid JSON, so nothing was read.'); return; }
    if (!data || data.format !== 'bishop-programs-v1' || !Array.isArray(data.programs) || !data.programs.length) {
        _pimpMsg('That is not a program file (it needs "format": "bishop-programs-v1" and a "programs" list).'); return;
    }
    var existing = {};
    try { (await woLibCol('programs').get()).docs.forEach(function(d) { existing[(d.data().name || '').toLowerCase()] = true; }); } catch (err) { console.error(err); }
    _pimp = { source: String(data.source || '').slice(0, 60), existingNames: existing, programs: [], fileName: file.name };
    _pimp.programs = data.programs.map(function(p) { return _pimpBuild(p || {}, _pimp.source); });
    await _pimpRender();
}

function _pimpPreview(i) {
    var p = _pimp.programs[i];
    var body = p.weeks.map(function(w) {
        return '<div class="wo-view-row"><strong>' + (w.from === w.to ? 'Week ' + w.from : 'Weeks ' + w.from + '–' + w.to) + (w.block ? ' · ' + _woEsc(w.block) : '') + '</strong>' +
            '<ul class="wo-view-cues">' + w.days.map(function(d) {
                var names = _woFlatExercises(d.steps).map(function(s) {
                    var ex = _woExMap && _woExMap[s.exerciseId]; var lv = s.levelMode === 'pinned' && ex ? woLevelLabel(ex, s.levelId) : '';
                    return _woEsc(s.exerciseName) + (lv ? ' [' + _woEsc(lv) + ']' : '');
                }).join(', ');
                return '<li><strong>' + _woEsc(d.label) + '</strong> · ' + _woEsc(_PIMP_FORMAT_LABEL[d.format] || d.format) + ' — ' + names +
                       (d.issues.length ? '<br><span class="wo-hint">⚠ ' + d.issues.map(_woEsc).join(' · ') + '</span>' : '') + '</li>';
            }).join('') + '</ul></div>';
    }).join('');
    var ov = _woGrabOverlay('<h3>' + _woEsc(p.name) + '</h3>' + (p.description ? '<p class="wo-hint">' + _woEsc(p.description) + '</p>' : '') +
        '<p class="wo-hint">Exercises in [brackets] use a fixed level named by the book; the others use your own level.</p>' + body +
        '<div class="ex-form-actions"><button type="button" class="btn btn-primary" id="pimpPrevClose">Close</button></div>');
    ov.querySelector('#pimpPrevClose').addEventListener('click', _woCloseGrabber);
}

async function _pimpGo() {
    var inc = _pimp.programs.filter(function(p) { return p.include; });
    if (!inc.length) return;
    var btn = document.getElementById('pimpGo');
    btn.disabled = true; btn.textContent = 'Importing…';
    try {
        var ts = firebase.firestore.FieldValue.serverTimestamp();
        var nWorkouts = 0;
        for (var pi = 0; pi < inc.length; pi++) {
            var p = inc[pi], ops = [], weeks = [];
            // one workout per day (400-op batches), then the program that points at them
            p.weeks.forEach(function(w) {
                var days = w.days.map(function(d, j) {
                    if (!d.steps.length) return { label: d.label || ('Day ' + (j + 1)), workoutId: null };      // nothing to run: a rest day, flagged in the review
                    var ref = woLibCol('workouts').doc();
                    ops.push({ ref: ref, data: {
                        name: d.name, description: d.description, steps: _woCleanSteps(d.steps), exerciseIds: d.exerciseIds,
                        estimatedSeconds: woEstimateSeconds(d.steps), archived: false, source: p.source || '', tags: [],
                        createdAt: ts, updatedAt: ts } });
                    nWorkouts++;
                    return { label: d.label || ('Day ' + (j + 1)), workoutId: ref.id };
                });
                weeks.push({ from: w.from, to: w.to, block: w.block, note: '', days: days });
            });
            for (var i = 0; i < ops.length; i += 400) {
                var batch = db.batch();
                ops.slice(i, i + 400).forEach(function(o) { batch.set(o.ref, o.data); });
                await batch.commit();
            }
            await woLibCol('programs').add({ name: p.name, description: p.description, source: p.source || '', tags: [], archived: false, nextProgramName: p.nextProgramName || '', weeks: weeks, createdAt: ts, updatedAt: ts });
        }
        _pimp = null;
        await _pimpRender('✓ Imported ' + inc.length + ' program' + (inc.length === 1 ? '' : 's') + ' and ' + nWorkouts + ' workouts. <a href="#programs">See them in Programs</a>.');
    } catch (err) {
        console.error('Programs: import failed:', err);
        alert('The import failed part-way. Use "Remove an import" below to clear what was added, then try again.');
        await _pimpRender();
    }
}

async function _pimpRemove(source) {
    try {
        var progs = (await woLibCol('programs').get()).docs.filter(function(d) { return d.data().source === source; });
        var works = (await woLibCol('workouts').get()).docs.filter(function(d) { return d.data().source === source; });
        if (!progs.length && !works.length) return;
        if (!confirm('Remove ' + progs.length + ' program' + (progs.length === 1 ? '' : 's') + ' and ' + works.length + ' workout' + (works.length === 1 ? '' : 's') +
                     ' imported from “' + source + '”, and any run of those programs? Your own programs and workouts are not touched. This cannot be undone.')) return;
        var ids = {};
        progs.forEach(function(d) { ids[d.id] = true; });
        var runs = (await woLibCol('programRuns').get()).docs.filter(function(d) { return ids[d.data().programId]; });
        var all = runs.concat(progs).concat(works);
        for (var i = 0; i < all.length; i += 400) {
            var batch = db.batch();
            all.slice(i, i + 400).forEach(function(d) { batch.delete(d.ref); });
            await batch.commit();
        }
        await _pimpRender('✓ Removed ' + progs.length + ' program' + (progs.length === 1 ? '' : 's') + ' and ' + works.length + ' workout' + (works.length === 1 ? '' : 's') + '.');
    } catch (err) {
        console.error('Programs: removing the import failed:', err);
        alert('Could not finish removing. Please try again.');
        await _pimpRender();
    }
}
