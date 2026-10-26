// ─── Fitness → Programs (ProgramsPlan.md, chunk P2) ───────────────────────────
//
// A program is a TEMPLATE made of workouts you already have: weeks → days → one workout (or a rest day).
// Programs never hold exercise logic of their own, so everything a workout can do works inside a program.
//
//   programs/{id} = { name, description, source, tags[], archived, createdAt, updatedAt,
//                     weeks: [ { from, to, block, note, days: [ { label, workoutId | null } ] } ] }
//
// `from..to` lets one definition cover several weeks (the book repeats weeks 1–2 and 3–4 and 5–6).
// A day with workoutId null is a rest day.
//
// Following a program (chunk P3): a RUN is one pass through a program.
//   programRuns/{id} = { programId, programName (snapshot), status 'active'|'paused'|'finished'|'ended',
//                        startedAt, updatedAt, finishedAt?, position {week, day}, log: [ {week, day, label, workoutId, kind, date, at} ] }
// `position` is the NEXT-UP day (week number + index of the day inside that week's block). `kind` in the log is
// 'done' | 'skipped' | 'rest'. Only one run is active (or paused) at a time. Marking days done from a finished
// workout is automatic (chunk P4: progMatchWorkout / progCompleteFromSession, called when a workout is saved); the run
// card also keeps a manual "Mark done" button.

var _progs = [];            // list page: all programs
var _progFilter = { text: '', archived: false };
var _prog = null;           // editor: working copy of the program being edited
var _progWorkouts = [];     // the workouts that can be chosen for a day (and shown by name on run cards)
var _progRuns = [];         // all runs, newest first

// ── helpers ───────────────────────────────────────────────────────────────────

function _progTotalWeeks(p) {
    var max = 0;
    (p.weeks || []).forEach(function(w) { if (w.to > max) max = w.to; });
    return max;
}

function _progDayCount(p) {
    var n = 0;
    (p.weeks || []).forEach(function(w) { var len = Math.max(0, (w.to - w.from + 1)); n += len * (w.days || []).length; });
    return n;
}

function _progWeeksLabel(w) { return w.from === w.to ? 'Week ' + w.from : 'Weeks ' + w.from + '–' + w.to; }

function _progBlankWeek(from) {
    return { from: from, to: from, block: '', note: '', days: [{ label: 'Day 1', workoutId: null }] };
}

// ── Programs list (#programs) ─────────────────────────────────────────────────

async function loadProgramsPage() {
    _woSetChrome([['Programs']]);
    var el = document.getElementById('page-programs');
    el.innerHTML = '<div class="page-header"><h2>Programs</h2></div><div class="ex-status">Loading…</div>';
    try {
        var snap = await woLibCol('programs').get();
        _progs = snap.docs.map(function(d) { var p = d.data(); p.id = d.id; return p; });
        await _progLoadRunsAndWorkouts();
    } catch (err) {
        console.error('Programs: could not load:', err);
        el.innerHTML = '<div class="page-header"><h2>Programs</h2></div><div class="ex-status">Could not load programs.</div>';
        return;
    }
    el.innerHTML =
        '<div class="page-header"><h2>Programs</h2>' +
            '<div class="page-header-actions"><a href="#program/new" class="btn btn-primary">+ New Program</a></div></div>' +
        '<div id="progRun"></div>' +
        '<div class="ex-toolbar"><div class="ex-toolbar-row">' +
            '<input type="search" id="progText" class="filter-input" placeholder="Search programs…" value="' + _woEsc(_progFilter.text) + '">' +
            '<label class="wo-inline-check"><input type="checkbox" id="progArchived"' + (_progFilter.archived ? ' checked' : '') + '> Show archived</label>' +
        '</div><div id="progTagBar"></div></div>' +
        '<div id="progList"></div>';
    document.getElementById('progText').addEventListener('input', function() { _progFilter.text = this.value; _progRenderList(); });
    document.getElementById('progArchived').addEventListener('change', function() { _progFilter.archived = this.checked; _progRenderList(); });
    document.getElementById('progList').addEventListener('click', function(ev) {
        var b = ev.target.closest('[data-pstart]');
        if (!b) return;
        ev.preventDefault();
        _progStart(b.getAttribute('data-pstart'));
    });
    document.getElementById('progRun').addEventListener('click', _progRunClick);
    _progRenderRunCard();
    _progRenderTagBar();
    _progRenderList();
}

function _progRenderTagBar() {
    var bar = document.getElementById('progTagBar');
    if (!bar) return;
    bar.innerHTML = woTagChipsHtml(_progs);
    woTagChipsWire(bar, function() { _progRenderTagBar(); _progRenderList(); });
}

function _progRenderList() {
    var text = _progFilter.text.trim().toLowerCase();
    var rows = _progs.filter(function(p) {
        if (p.archived && !_progFilter.archived) return false;
        if (!woTagPass(p)) return false;
        return !text || (p.name || '').toLowerCase().indexOf(text) !== -1;
    }).sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });

    var list = document.getElementById('progList');
    if (!rows.length) {
        list.innerHTML = '<div class="ex-status">' + (_progs.length ? 'No programs match.'
            : 'No programs yet. Tap <strong>+ New Program</strong> to build one from your workouts.') + '</div>';
        return;
    }
    list.innerHTML = rows.map(function(p) {
        var weeks = _progTotalWeeks(p), days = _progDayCount(p);
        var meta = weeks + ' week' + (weeks === 1 ? '' : 's') + ' · ' + days + ' training/rest day' + (days === 1 ? '' : 's');
        var tags = woExTags(p);
        return '<a href="#program-view/' + p.id + '" class="wo-card' + (p.archived ? ' wo-card--archived' : '') + '">' +
                   '<div class="wo-thumb">📅</div>' +
                   '<div class="wo-card-main">' +
                       '<div class="wo-card-name">' + _woEsc(p.name) + '</div>' +
                       ((p.archived || tags.length) ? '<div class="wo-badges">' + (p.archived ? '<span class="wo-badge wo-badge--archived">Archived</span> ' : '') +
                           tags.map(function(t) { return '<span class="wo-badge wo-badge--tag">' + _woEsc(t) + '</span>'; }).join(' ') + '</div>' : '') +
                       '<div class="wo-card-meta">' + _woEsc(meta) + '</div>' +
                       (p.description ? '<div class="wo-card-meta">' + _woEsc(p.description) + '</div>' : '') +
                   '</div>' +
                   (p.archived || !_progSlots(p).length ? '' : '<span class="wo-card-start" data-pstart="' + p.id + '">▶ Start</span>') +
               '</a>';
    }).join('');
}

// ── Program editor (#program/new, #program/:id) ───────────────────────────────

async function loadProgramPage(id) {
    var isNew = (id === 'new');
    _woSetChrome([['Programs', '#programs'], [isNew ? 'New Program' : 'Edit Program']]);
    var el = document.getElementById('page-program');
    el.innerHTML = '<div class="page-header"><h2>' + (isNew ? 'New Program' : 'Edit Program') + '</h2></div><div class="ex-status">Loading…</div>';
    try {
        var snap = await woLibCol('workouts').get();
        _progWorkouts = snap.docs.map(function(d) { var w = d.data(); w.id = d.id; return w; })
            .sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
        if (isNew) {
            _prog = { id: null, name: '', description: '', tags: [], weeks: [_progBlankWeek(1)], archived: false };
        } else {
            var doc = await woLibCol('programs').doc(id).get();
            if (!doc.exists) { el.innerHTML = '<div class="ex-status">Program not found.</div>'; return; }
            _prog = doc.data();
            _prog.id = doc.id;
            _prog.weeks = JSON.parse(JSON.stringify(_prog.weeks || []));   // edits stay local until Save
        }
    } catch (err) {
        console.error('Programs: could not open the editor:', err);
        el.innerHTML = '<div class="ex-status">Could not load this program.</div>';
        return;
    }
    _progRenderEditor();
}

function _progRenderEditor() {
    var p = _prog, isNew = !p.id;
    var el = document.getElementById('page-program');
    el.innerHTML =
        '<div class="page-header"><h2>' + (isNew ? 'New Program' : 'Edit Program') + '</h2></div>' +
        '<div class="ex-form">' +
            '<div class="ex-form-group"><label class="ex-label" for="pgName">Name <span class="ex-required">*</span></label>' +
                '<input type="text" id="pgName" maxlength="80" value="' + _woEsc(p.name) + '" placeholder="e.g. Summer build"></div>' +
            '<div class="ex-form-group"><label class="ex-label" for="pgDesc">Notes (optional)</label>' +
                '<textarea id="pgDesc" rows="2" placeholder="What this program is for…">' + _woEsc(p.description) + '</textarea></div>' +
            '<div class="ex-form-group"><label class="ex-label" for="pgTags">Tags (optional)</label>' +
                '<input type="text" id="pgTags" maxlength="120" value="' + _woEsc((p.tags || []).join(', ')) + '" placeholder="e.g. strength, summer — separate with commas">' +
                (p.source ? '<p class="wo-hint">This program also counts as “' + _woEsc(String(p.source).toLowerCase()) + '” (its source).</p>' : '') + '</div>' +
            '<div class="ex-form-group"><label class="ex-label">Weeks and days</label>' +
                '<p class="wo-hint">Each block of weeks lists its training days in order. A block can cover several weeks (the same days repeat). A day is one of your workouts, or a rest day.</p>' +
                '<div id="pgWeeks"></div>' +
                '<div class="wo-frame-actions"><button type="button" class="btn btn-secondary" id="pgAddWeek">+ Add weeks</button></div></div>' +
            '<div class="ex-form-actions">' +
                '<button type="button" class="btn btn-primary" id="pgSave">' + (isNew ? 'Create Program' : 'Save') + '</button>' +
                '<a href="#programs" class="btn btn-secondary">Cancel</a>' +
                (isNew ? '' : '<a href="#program-view/' + p.id + '" class="btn btn-secondary">📅 Overview</a>') +
                (isNew || p.archived ? '' : '<button type="button" class="btn btn-secondary" id="pgStart" title="Follow the saved version of this program">▶ Start program</button>') +
                (isNew ? '' : '<button type="button" class="btn btn-secondary" id="pgArchive">' + (p.archived ? 'Unarchive' : 'Archive') + '</button>' +
                              '<button type="button" class="btn btn-danger" id="pgDelete">Delete</button>') +
            '</div>' +
        '</div>';

    document.getElementById('pgName').addEventListener('input', function() { _prog.name = this.value; });
    document.getElementById('pgDesc').addEventListener('input', function() { _prog.description = this.value; });
    document.getElementById('pgTags').addEventListener('input', function() { _prog.tags = woParseTags(this.value); });
    document.getElementById('pgAddWeek').addEventListener('click', function() {
        _prog.weeks.push(_progBlankWeek(_progTotalWeeks(_prog) + 1));
        _progRenderWeeks();
    });
    document.getElementById('pgSave').addEventListener('click', _progSave);
    var st = document.getElementById('pgStart');      if (st) st.addEventListener('click', function() { _progStart(_prog.id); });
    var arch = document.getElementById('pgArchive');  if (arch) arch.addEventListener('click', _progToggleArchive);
    var del  = document.getElementById('pgDelete');   if (del)  del.addEventListener('click', _progDelete);
    _progRenderWeeks();
}

/** The week blocks and their days. Re-drawn after every structural change; typed text is stored as you type. */
function _progRenderWeeks() {
    var box = document.getElementById('pgWeeks');
    var wkOpts = function(sel) {
        return '<option value="">— Rest day —</option>' + _progWorkouts.map(function(w) {
            return '<option value="' + w.id + '"' + (w.id === sel ? ' selected' : '') + '>' + _woEsc(w.name) + (w.archived ? ' (archived)' : '') + '</option>';
        }).join('');
    };
    box.innerHTML = _prog.weeks.map(function(wk, i) {
        var missing = wk.days.some(function(d) { return d.workoutId && !_progWorkouts.some(function(w) { return w.id === d.workoutId; }); });
        return '<div class="wo-card-static pg-week" data-week="' + i + '">' +
            '<div class="pg-week-head"><strong>' + _woEsc(_progWeeksLabel(wk)) + '</strong>' +
                '<span class="pg-week-btns">' +
                    '<button type="button" class="btn btn-secondary btn-small" data-wact="up" title="Move earlier"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
                    '<button type="button" class="btn btn-secondary btn-small" data-wact="down" title="Move later"' + (i === _prog.weeks.length - 1 ? ' disabled' : '') + '>↓</button>' +
                    '<button type="button" class="btn btn-secondary btn-small" data-wact="dup" title="Duplicate this block">⧉</button>' +
                    '<button type="button" class="btn btn-danger btn-small" data-wact="del" title="Remove this block">✕</button></span></div>' +
            '<div class="pg-row">' +
                '<label>From week <input type="number" min="1" max="104" class="pg-num" data-wfield="from" value="' + wk.from + '"></label>' +
                '<label>to week <input type="number" min="1" max="104" class="pg-num" data-wfield="to" value="' + wk.to + '"></label>' +
                '<label class="pg-grow">Block name <input type="text" maxlength="60" data-wfield="block" value="' + _woEsc(wk.block || '') + '" placeholder="e.g. Strength block"></label>' +
            '</div>' +
            (missing ? '<div class="wo-banner">A day points at a workout that no longer exists. Pick another or make it a rest day.</div>' : '') +
            wk.days.map(function(d, j) {
                return '<div class="pg-row pg-day" data-day="' + j + '">' +
                    '<input type="text" maxlength="40" class="pg-label" data-dfield="label" value="' + _woEsc(d.label || '') + '" placeholder="Day ' + (j + 1) + '">' +
                    '<select data-dfield="workoutId" class="pg-grow">' + wkOpts(d.workoutId) + '</select>' +
                    '<button type="button" class="btn btn-secondary btn-small" data-dact="up" title="Move up"' + (j === 0 ? ' disabled' : '') + '>↑</button>' +
                    '<button type="button" class="btn btn-secondary btn-small" data-dact="down" title="Move down"' + (j === wk.days.length - 1 ? ' disabled' : '') + '>↓</button>' +
                    '<button type="button" class="btn btn-danger btn-small" data-dact="del" title="Remove this day">✕</button></div>';
            }).join('') +
            '<div><button type="button" class="btn btn-secondary btn-small" data-wact="addday">+ Add day</button></div>' +
        '</div>';
    }).join('');

    box.querySelectorAll('.pg-week').forEach(function(card) {
        var wi = parseInt(card.getAttribute('data-week'), 10), wk = _prog.weeks[wi];
        card.querySelectorAll('[data-wfield]').forEach(function(inp) {
            inp.addEventListener('input', function() {
                var f = this.getAttribute('data-wfield');
                wk[f] = (f === 'from' || f === 'to') ? (parseInt(this.value, 10) || 0) : this.value;
            });
            inp.addEventListener('change', function() { _progRenderWeeks(); });   // refresh the heading once typing is done
        });
        card.querySelectorAll('[data-wact]').forEach(function(b) {
            b.addEventListener('click', function() {
                var a = this.getAttribute('data-wact'), ws = _prog.weeks;
                if (a === 'up' && wi > 0)               { ws.splice(wi - 1, 0, ws.splice(wi, 1)[0]); }
                else if (a === 'down' && wi < ws.length - 1) { ws.splice(wi + 1, 0, ws.splice(wi, 1)[0]); }
                else if (a === 'dup') {
                    var c = JSON.parse(JSON.stringify(wk)), len = wk.to - wk.from + 1;
                    c.from = _progTotalWeeks(_prog) + 1; c.to = c.from + len - 1;
                    ws.splice(wi + 1, 0, c);
                }
                else if (a === 'del') { if (!confirm('Remove ' + _progWeeksLabel(wk) + ' and its days from this program?')) return; ws.splice(wi, 1); }
                else if (a === 'addday') { wk.days.push({ label: 'Day ' + (wk.days.length + 1), workoutId: null }); }
                _progRenderWeeks();
            });
        });
        card.querySelectorAll('.pg-day').forEach(function(row) {
            var di = parseInt(row.getAttribute('data-day'), 10), day = wk.days[di];
            row.querySelectorAll('[data-dfield]').forEach(function(inp) {
                inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', function() {
                    var f = this.getAttribute('data-dfield');
                    day[f] = f === 'workoutId' ? (this.value || null) : this.value;
                });
            });
            row.querySelectorAll('[data-dact]').forEach(function(b) {
                b.addEventListener('click', function() {
                    var a = this.getAttribute('data-dact'), ds = wk.days;
                    if (a === 'up' && di > 0) ds.splice(di - 1, 0, ds.splice(di, 1)[0]);
                    else if (a === 'down' && di < ds.length - 1) ds.splice(di + 1, 0, ds.splice(di, 1)[0]);
                    else if (a === 'del') ds.splice(di, 1);
                    _progRenderWeeks();
                });
            });
        });
    });
}

/** Returns a problem to show, or '' when the program can be saved. */
function _progProblem() {
    if (!_prog.name.trim()) return 'Please enter a name for the program.';
    if (!_prog.weeks.length) return 'Add at least one block of weeks.';
    for (var i = 0; i < _prog.weeks.length; i++) {
        var w = _prog.weeks[i];
        if (!(w.from >= 1) || !(w.to >= w.from)) return _progWeeksLabel(w) + ': "to week" must be the same as or later than "from week" (and at least 1).';
        if (!w.days.length) return _progWeeksLabel(w) + ' has no days. Add a day or remove the block.';
    }
    var sorted = _prog.weeks.slice().sort(function(a, b) { return a.from - b.from; });
    for (var k = 1; k < sorted.length; k++) {
        if (sorted[k].from <= sorted[k - 1].to) return _progWeeksLabel(sorted[k - 1]) + ' and ' + _progWeeksLabel(sorted[k]) + ' overlap. Each week can belong to only one block.';
    }
    return '';
}

async function _progSave() {
    _prog.name = document.getElementById('pgName').value;
    var problem = _progProblem();
    if (problem) { alert(problem); return; }
    var btn = document.getElementById('pgSave');
    btn.disabled = true; btn.textContent = 'Saving…';
    // keep blocks in week order so the list reads top-down
    var weeks = _prog.weeks.slice().sort(function(a, b) { return a.from - b.from; }).map(function(w) {
        return { from: w.from, to: w.to, block: (w.block || '').trim(), note: (w.note || '').trim(),
                 days: w.days.map(function(d, j) { return { label: (d.label || '').trim() || 'Day ' + (j + 1), workoutId: d.workoutId || null }; }) };
    });
    var data = { name: _prog.name.trim(), description: (_prog.description || '').trim(), tags: woParseTags((_prog.tags || []).join(',')),
                 weeks: weeks, archived: !!_prog.archived, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    try {
        if (_prog.id) await woLibCol('programs').doc(_prog.id).update(data);
        else { data.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await woLibCol('programs').add(data); }
        location.hash = '#programs';
    } catch (err) {
        console.error('Programs: save failed:', err);
        alert('Failed to save. Please try again.');
        btn.disabled = false; btn.textContent = _prog.id ? 'Save' : 'Create Program';
    }
}

async function _progToggleArchive() {
    try {
        await woLibCol('programs').doc(_prog.id).update({ archived: !_prog.archived, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        location.hash = '#programs';
    } catch (err) { console.error('Programs: archive failed:', err); alert('Could not update. Please try again.'); }
}

async function _progDelete() {
    if (!confirm('Delete "' + _prog.name + '"? This cannot be undone. Your workouts are not deleted — only the program that lists them.')) return;
    try {
        await woLibCol('programs').doc(_prog.id).delete();
        location.hash = '#programs';
    } catch (err) { console.error('Programs: delete failed:', err); alert('Could not delete. Please try again.'); }
}


// ── Following a program: runs (chunk P3) ──────────────────────────────────────

/** The program laid out day by day: [{week, day, label, workoutId, block}] in order. */
function _progSlots(p) {
    var out = [];
    (p.weeks || []).slice().sort(function(a, b) { return a.from - b.from; }).forEach(function(w) {
        for (var wk = w.from; wk <= w.to; wk++) {
            (w.days || []).forEach(function(d, j) {
                out.push({ week: wk, day: j, label: d.label || ('Day ' + (j + 1)), workoutId: d.workoutId || null, block: w.block || '' });
            });
        }
    });
    return out;
}

/** Index of the slot a position points at; if the program was edited and it is gone, the next slot after it. */
function _progIndexOf(slots, pos) {
    for (var i = 0; i < slots.length; i++) {
        if (slots[i].week > pos.week || (slots[i].week === pos.week && slots[i].day >= pos.day)) return i;
    }
    return slots.length;
}

function _progActiveRun() {
    return _progRuns.filter(function(r) { return r.status === 'active' || r.status === 'paused'; })[0] || null;
}

async function _progLoadRunsAndWorkouts() {
    var rsnap = await woLibCol('programRuns').get();
    _progRuns = rsnap.docs.map(function(d) { var r = d.data(); r.id = d.id; return r; })
        .sort(function(a, b) { return ((b.startedAt && b.startedAt.seconds) || 0) - ((a.startedAt && a.startedAt.seconds) || 0); });
    var wsnap = await woLibCol('workouts').get();
    _progWorkouts = wsnap.docs.map(function(d) { var w = d.data(); w.id = d.id; return w; })
        .sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
}

function _progWorkoutName(id) {
    var w = _progWorkouts.filter(function(x) { return x.id === id; })[0];
    return w ? w.name : null;
}

/** Start a run of a saved program (asks first if another run is going). */
async function _progStart(programId) {
    var p = _progs.filter(function(x) { return x.id === programId; })[0];
    if (!p) {
        var doc = await woLibCol('programs').doc(programId).get();
        if (!doc.exists) { alert('That program was not found.'); return; }
        p = doc.data(); p.id = doc.id;
    }
    var slots = _progSlots(p);
    if (!slots.length) { alert('This program has no days yet.'); return; }
    try {
        await _progLoadRunsAndWorkouts();
        var cur = _progActiveRun();
        if (cur) {
            if (!confirm('You are already following "' + cur.programName + '". End that run and start "' + p.name + '" instead?')) return;
            await woLibCol('programRuns').doc(cur.id).update({ status: 'ended', finishedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        }
        await woLibCol('programRuns').add({
            programId: p.id, programName: p.name, status: 'active', position: { week: slots[0].week, day: slots[0].day }, log: [],
            startedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        if (location.hash === '#programs') loadProgramsPage(); else location.hash = '#programs';
    } catch (err) {
        console.error('Programs: could not start the run:', err);
        alert('Could not start the program. Please try again.');
    }
}

function _progRenderRunCard() {
    var box = document.getElementById('progRun');
    if (!box) return;
    var run = _progActiveRun();
    if (!run) { box.innerHTML = ''; return; }
    var p = _progs.filter(function(x) { return x.id === run.programId; })[0];
    if (!p) {
        box.innerHTML = '<div class="pg-run"><strong>' + _woEsc(run.programName) + '</strong><div class="wo-hint">This run\'s program no longer exists.</div>' +
            '<div class="pg-run-btns"><button type="button" class="btn btn-danger btn-small" data-pract="end">End this run</button></div></div>';
        return;
    }
    var slots = _progSlots(p), idx = _progIndexOf(slots, run.position || { week: 1, day: 0 });
    if (idx >= slots.length) {
        box.innerHTML = '<div class="pg-run"><strong>' + _woEsc(run.programName) + '</strong><div>No days left — you reached the end.</div>' +
            '<div class="pg-run-btns"><button type="button" class="btn btn-primary btn-small" data-pract="finish">🎉 Finish program</button>' +
            (run.log && run.log.length ? '<button type="button" class="btn btn-secondary btn-small" data-pract="back">◀ Back one day</button>' : '') + '</div></div>';
        return;
    }
    var slot = slots[idx], total = _progTotalWeeks(p), paused = run.status === 'paused';
    var wname = slot.workoutId ? _progWorkoutName(slot.workoutId) : null;
    var last = (run.log || []).length ? run.log[run.log.length - 1] : null;
    var bits = ['Week ' + slot.week + ' of ' + total];
    if (slot.block) bits.push(slot.block);
    box.innerHTML =
        '<div class="pg-run' + (paused ? ' pg-run--paused' : '') + '">' +
            '<div class="pg-run-title"><strong>📅 <a href="#program-view/' + run.programId + '">' + _woEsc(run.programName) + '</a></strong>' + (paused ? ' <span class="wo-badge wo-badge--archived">Paused</span>' : '') + '</div>' +
            '<div class="pg-run-next">Next up: <strong>' + _woEsc(slot.label) + '</strong> — ' +
                (slot.workoutId ? (wname ? _woEsc(wname) : '<em>(workout missing)</em>') : 'Rest day') + '</div>' +
            '<div class="wo-hint">' + _woEsc(bits.join(' · ')) + ' · day ' + (idx + 1) + ' of ' + slots.length +
                (last ? ' · last: ' + _woEsc(last.kind === 'skipped' ? 'skipped' : (last.kind === 'rest' ? 'rest day' : 'trained')) + ' ' + _woEsc(last.date || '') : '') + '</div>' +
            '<div class="pg-run-btns">' +
                (paused ? '<button type="button" class="btn btn-primary btn-small" data-pract="resume">▶ Resume</button>' :
                    (slot.workoutId && wname ? '<a class="btn btn-primary btn-small" href="#workout-start/' + slot.workoutId + '">▶ Start workout</a>' : '') +
                    '<button type="button" class="btn btn-secondary btn-small" data-pract="done">✓ ' + (slot.workoutId ? 'Mark done' : 'Rest day done') + '</button>' +
                    '<button type="button" class="btn btn-secondary btn-small" data-pract="skip">Skip</button>') +
                (run.log && run.log.length ? '<button type="button" class="btn btn-secondary btn-small" data-pract="back">◀ Back</button>' : '') +
                (paused ? '' : '<button type="button" class="btn btn-secondary btn-small" data-pract="pause">⏸ Pause</button>') +
                '<button type="button" class="btn btn-danger btn-small" data-pract="end">End</button>' +
            '</div>' +
        '</div>';
}

function _progRunClick(ev) {
    var b = ev.target.closest('[data-pract]');
    if (!b) return;
    ev.preventDefault();
    _progRunAct(b.getAttribute('data-pract'));
}

function _progTodayISO() { return typeof _woTodayISO === 'function' ? _woTodayISO() : new Date().toISOString().slice(0, 10); }

/** done | skip | back | pause | resume | end | finish — updates the active run and redraws the card. */
async function _progRunAct(action) {
    var run = _progActiveRun();
    if (!run) return;
    var p = _progs.filter(function(x) { return x.id === run.programId; })[0];
    var ts = firebase.firestore.FieldValue.serverTimestamp();
    var upd = { updatedAt: ts };
    var log = (run.log || []).slice();
    try {
        if (action === 'end') {
            if (!confirm('End "' + run.programName + '"? Your history stays, but this run is closed.')) return;
            upd.status = 'ended'; upd.finishedAt = ts;
        } else if (action === 'pause') { upd.status = 'paused'; }
        else if (action === 'resume') { upd.status = 'active'; }
        else if (action === 'finish') { upd.status = 'finished'; upd.finishedAt = ts; }
        else if (action === 'back') {
            var prev = log.pop();
            if (!prev) return;
            upd.log = log; upd.position = { week: prev.week, day: prev.day };
        } else if (action === 'done' || action === 'skip') {
            if (!p) return;
            var slots = _progSlots(p), idx = _progIndexOf(slots, run.position || { week: 1, day: 0 });
            if (idx >= slots.length) return;
            var slot = slots[idx];
            log.push({ week: slot.week, day: slot.day, label: slot.label, workoutId: slot.workoutId,
                       kind: action === 'skip' ? 'skipped' : (slot.workoutId ? 'done' : 'rest'), date: _progTodayISO(), at: Date.now() });
            upd.log = log;
            var nxt = slots[idx + 1];
            if (nxt) upd.position = { week: nxt.week, day: nxt.day };
            else upd.position = { week: slot.week, day: slot.day + 1 };   // past the end — the card offers "Finish program"
        }
        await woLibCol('programRuns').doc(run.id).update(upd);
        Object.assign(run, upd);
        _progRenderRunCard();
    } catch (err) {
        console.error('Programs: run update failed:', err);
        alert('Could not update the run. Please try again.');
    }
}

/** A small "program next up" card on a page (the Fitness hub), like the workout-in-progress card. */
async function progShowRunCard(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    try {
        var rsnap = await woLibCol('programRuns').get();
        var run = null;
        rsnap.docs.forEach(function(d) { var r = d.data(); if (!run && (r.status === 'active' || r.status === 'paused')) { run = r; run.id = d.id; } });
        var old = el.querySelector('.pg-card-wrap');
        if (old) old.remove();
        if (!run) return;
        var pdoc = await woLibCol('programs').doc(run.programId).get();
        var line = 'Open your program';
        if (pdoc.exists) {
            var slots = _progSlots(pdoc.data()), idx = _progIndexOf(slots, run.position || { week: 1, day: 0 });
            if (idx >= slots.length) line = 'No days left — open it to finish';
            else {
                var s = slots[idx], wn = '';
                if (s.workoutId) { var wd = await woLibCol('workouts').doc(s.workoutId).get(); wn = wd.exists ? wd.data().name : ''; }
                line = 'Week ' + s.week + ' · ' + s.label + ' — ' + (s.workoutId ? (wn || 'workout missing') : 'Rest day');
            }
        }
        var wrap = document.createElement('div');
        wrap.className = 'wd-card-wrap pg-card-wrap';
        wrap.innerHTML = '<a href="#programs" class="wd-card"><span class="wd-card-icon">📅</span>' +
            '<span class="wd-card-text"><strong>' + _woEsc(run.programName) + (run.status === 'paused' ? ' (paused)' : '') + '</strong><span>' + _woEsc(line) + '</span></span>' +
            '<span class="wd-card-go">Open ›</span></a>';
        var header = el.querySelector('.page-header');
        if (header && header.nextSibling) header.parentNode.insertBefore(wrap, header.nextSibling);
        else el.insertBefore(wrap, el.firstChild);
    } catch (err) {
        console.error('Programs: could not show the program card:', err);
    }
}


// ── Finished workouts count toward the run (chunk P4) ─────────────────────────

/**
 * Is this workout the next-up day of the active (not paused) run? Returns {runId, run, slot, next, programName} or null.
 * Called when a workout is saved; it must never throw into the save, so callers wrap it.
 */
async function progMatchWorkout(workoutId) {
    var rsnap = await woLibCol('programRuns').get(), run = null;
    rsnap.docs.forEach(function(d) { var r = d.data(); if (!run && r.status === 'active') { run = r; run.id = d.id; } });
    if (!run) return null;
    var pdoc = await woLibCol('programs').doc(run.programId).get();
    if (!pdoc.exists) return null;
    var slots = _progSlots(pdoc.data()), idx = _progIndexOf(slots, run.position || { week: 1, day: 0 });
    if (idx >= slots.length || slots[idx].workoutId !== workoutId) return null;
    return { runId: run.id, run: run, slot: slots[idx], next: slots[idx + 1] || null, programName: run.programName };
}

/** Fields stamped on the saved workout session so History can show where it fell in the program. */
function progSessionFields(m) {
    return { programRunId: m.runId, programName: m.programName, programWeek: m.slot.week, programDay: m.slot.label };
}

/** Logs the day as done (with the session id) and moves the run to the next day. */
async function progCompleteFromSession(m, sessionId, dateISO) {
    var log = (m.run.log || []).slice();
    log.push({ week: m.slot.week, day: m.slot.day, label: m.slot.label, workoutId: m.slot.workoutId, kind: 'done',
               date: dateISO || _progTodayISO(), at: Date.now(), sessionId: sessionId });
    await woLibCol('programRuns').doc(m.runId).update({
        log: log,
        position: m.next ? { week: m.next.week, day: m.next.day } : { week: m.slot.week, day: m.slot.day + 1 },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}


// ── Program overview page (#program-view/:id) — chunk P5 ──────────────────────

var _progV = null;   // {p, run}

async function loadProgramViewPage(id) {
    _woSetChrome([['Programs', '#programs'], ['Program']]);
    var el = document.getElementById('page-program-view');
    el.innerHTML = '<div class="page-header"><h2>Program</h2></div><div class="ex-status">Loading…</div>';
    try {
        var doc = await woLibCol('programs').doc(id).get();
        if (!doc.exists) { el.innerHTML = '<div class="ex-status">Program not found.</div>'; return; }
        var p = doc.data(); p.id = doc.id;
        await _progLoadRunsAndWorkouts();
        var mine = _progRuns.filter(function(r) { return r.programId === id; });      // newest first
        var run = mine.filter(function(r) { return r.status === 'active' || r.status === 'paused'; })[0] || mine[0] || null;
        _progV = { p: p, run: run };
    } catch (err) {
        console.error('Programs: could not open the overview:', err);
        el.innerHTML = '<div class="ex-status">Could not load this program.</div>';
        return;
    }
    _progRenderView();
}

/** Status of one day for the run being shown: 'done' | 'rest' | 'skipped' | 'next' | 'upcoming' | 'plain' (no run). */
function _progDayStatus(run, slots, idx) {
    if (!run) return 'plain';
    var s = slots[idx], hit = null;
    (run.log || []).forEach(function(l) { if (l.week === s.week && l.day === s.day) hit = l; });
    if (hit) return hit.kind === 'skipped' ? 'skipped' : (hit.kind === 'rest' ? 'rest' : 'done');
    if (run.status === 'active' || run.status === 'paused') {
        var cur = _progIndexOf(slots, run.position || { week: 1, day: 0 });
        if (idx === cur) return 'next';
    }
    return 'upcoming';
}

function _progRenderView() {
    var p = _progV.p, run = _progV.run, slots = _progSlots(p);
    var el = document.getElementById('page-program-view');
    var live = run && (run.status === 'active' || run.status === 'paused');
    var done = 0;
    slots.forEach(function(s, i) { var st = _progDayStatus(run, slots, i); if (st === 'done' || st === 'rest' || st === 'skipped') done++; });
    var pct = slots.length ? Math.round(done * 100 / slots.length) : 0;

    var status;
    if (live) {
        var idx = _progIndexOf(slots, run.position || { week: 1, day: 0 });
        status = '<div class="pg-run' + (run.status === 'paused' ? ' pg-run--paused' : '') + '">' +
            '<div><strong>' + (run.status === 'paused' ? '⏸ Paused' : '▶ In progress') + '</strong> — ' +
                (idx < slots.length ? 'next up: Week ' + slots[idx].week + ' · ' + _woEsc(slots[idx].label) : 'no days left') + '</div>' +
            '<div class="pg-run-btns"><a class="btn btn-primary btn-small" href="#programs">Open the run card</a></div></div>';
    } else {
        status = '<div class="pg-run pg-run--paused">' +
            (run ? '<div>Last run ' + (run.status === 'finished' ? 'finished' : 'ended') + ' — ' + done + ' of ' + slots.length + ' days logged.</div>' : '<div>You have not started this program.</div>') +
            (p.archived || !slots.length ? '' : '<div class="pg-run-btns"><button type="button" class="btn btn-primary btn-small" id="pvStart">▶ ' + (run ? 'Start again' : 'Start program') + '</button></div>') + '</div>';
    }

    // one row per week, grouped under its block heading
    var blocks = (p.weeks || []).slice().sort(function(a, b) { return a.from - b.from; });
    var grid = blocks.map(function(b) {
        var rows = '';
        for (var wk = b.from; wk <= b.to; wk++) {
            var chips = '';
            slots.forEach(function(s, i) {
                if (s.week !== wk) return;
                var st = _progDayStatus(run, slots, i);
                var mark = st === 'done' ? '✓ ' : st === 'rest' ? '✓ ' : st === 'skipped' ? '⤼ ' : st === 'next' ? '▶ ' : '';
                chips += '<button type="button" class="pg-chip pg-chip--' + st + (s.workoutId ? '' : ' pg-chip--restday') + '" data-pvi="' + i + '" title="' +
                         _woEsc(s.workoutId ? (_progWorkoutName(s.workoutId) || 'workout missing') : 'Rest day') + '">' + mark + _woEsc(s.label) + '</button>';
            });
            rows += '<div class="pg-wkrow"><span class="pg-wklabel">Wk ' + wk + '</span><span class="pg-chips">' + chips + '</span></div>';
        }
        return '<div class="pg-blockhead">' + _woEsc(b.block || (b.from === b.to ? 'Week ' + b.from : 'Weeks ' + b.from + '–' + b.to)) + '</div>' + rows;
    }).join('');

    el.innerHTML =
        '<div class="page-header"><h2>' + _woEsc(p.name) + '</h2>' +
            '<div class="page-header-actions"><a href="#program/' + p.id + '" class="btn btn-secondary">✏ Edit</a></div></div>' +
        (p.description ? '<p class="wo-hint">' + _woEsc(p.description) + '</p>' : '') +
        status +
        '<div class="pg-progress"><div class="pg-progress-bar"><span style="width:' + pct + '%"></span></div>' +
            '<span class="wo-hint">' + done + ' of ' + slots.length + ' days' + (run ? ' logged' : '') + '</span></div>' +
        (grid || '<div class="ex-status">This program has no weeks yet. Tap Edit to add some.</div>') +
        '<p class="wo-hint">Tap a day to see its workout.</p>';

    var st = document.getElementById('pvStart');
    if (st) st.addEventListener('click', function() { _progStart(p.id); });
    el.querySelectorAll('[data-pvi]').forEach(function(b) {
        b.addEventListener('click', function() { _progPreviewDay(slots[parseInt(this.getAttribute('data-pvi'), 10)]); });
    });
}

/** A read-only look at one day's workout: its exercises, circuits and time. */
function _progPreviewDay(slot) {
    var head = '<h3>Week ' + slot.week + ' · ' + _woEsc(slot.label) + '</h3>';
    var close = '<div class="ex-form-actions"><button type="button" class="btn btn-secondary" id="pvClose">Close</button></div>';
    var body, startBtn = '';
    if (!slot.workoutId) {
        body = '<p>Rest day.</p>';
    } else {
        var w = _progWorkouts.filter(function(x) { return x.id === slot.workoutId; })[0];
        if (!w) body = '<p>This day points at a workout that no longer exists. Open Edit to pick another.</p>';
        else {
            var steps = w.steps || [], items = steps.map(function(st) {
                if (st.type === 'circuit') return '<li><strong>Circuit</strong> — ' + (st.items || []).map(function(it) { return _woEsc(it.exerciseName); }).join(', ') + '</li>';
                return '<li>' + _woEsc(st.exerciseName) + '</li>';
            }).join('');
            var est = woFmtMinutes(w.estimatedSeconds != null ? w.estimatedSeconds : woEstimateSeconds(steps));
            body = '<p><strong>' + _woEsc(w.name) + '</strong>' + (est ? ' · ~' + est : '') + '</p>' +
                   (w.description ? '<p class="wo-hint">' + _woEsc(w.description) + '</p>' : '') +
                   (items ? '<ul class="wo-view-cues">' + items + '</ul>' : '<p class="wo-hint">No exercises in this workout yet.</p>');
            startBtn = '<a href="#workout-start/' + w.id + '" class="btn btn-primary" id="pvGo">▶ Start this workout</a> ';
        }
    }
    var ov = _woGrabOverlay(head + body + '<div class="ex-form-actions">' + startBtn + '<button type="button" class="btn btn-secondary" id="pvClose">Close</button></div>');
    ov.querySelector('#pvClose').addEventListener('click', _woCloseGrabber);
    var go = ov.querySelector('#pvGo'); if (go) go.addEventListener('click', _woCloseGrabber);
}
