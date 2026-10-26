// ─── Fitness → Programs (ProgramsPlan.md, chunk P2) ───────────────────────────
//
// A program is a TEMPLATE made of workouts you already have: weeks → days → one workout (or a rest day).
// Programs never hold exercise logic of their own, so everything a workout can do works inside a program.
//
//   programs/{id} = { name, description, source, tags[], archived, createdAt, updatedAt,
//                     weeks: [ { from, to, block, note, days: [ { label, workoutId | null } ] } ] }
//
// `from..to` lets one definition cover several weeks (the book repeats weeks 1–2 and 3–4 and 5–6).
// A day with workoutId null is a rest day. Following a program (runs) comes in a later chunk.

var _progs = [];            // list page: all programs
var _progFilter = { text: '', archived: false };
var _prog = null;           // editor: working copy of the program being edited
var _progWorkouts = [];     // editor: the workouts that can be chosen for a day

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
    } catch (err) {
        console.error('Programs: could not load:', err);
        el.innerHTML = '<div class="page-header"><h2>Programs</h2></div><div class="ex-status">Could not load programs.</div>';
        return;
    }
    el.innerHTML =
        '<div class="page-header"><h2>Programs</h2>' +
            '<div class="page-header-actions"><a href="#program/new" class="btn btn-primary">+ New Program</a></div></div>' +
        '<div class="ex-toolbar"><div class="ex-toolbar-row">' +
            '<input type="search" id="progText" class="filter-input" placeholder="Search programs…" value="' + _woEsc(_progFilter.text) + '">' +
            '<label class="wo-inline-check"><input type="checkbox" id="progArchived"' + (_progFilter.archived ? ' checked' : '') + '> Show archived</label>' +
        '</div><div id="progTagBar"></div></div>' +
        '<div id="progList"></div>';
    document.getElementById('progText').addEventListener('input', function() { _progFilter.text = this.value; _progRenderList(); });
    document.getElementById('progArchived').addEventListener('change', function() { _progFilter.archived = this.checked; _progRenderList(); });
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
        return '<a href="#program/' + p.id + '" class="wo-card' + (p.archived ? ' wo-card--archived' : '') + '">' +
                   '<div class="wo-thumb">📅</div>' +
                   '<div class="wo-card-main">' +
                       '<div class="wo-card-name">' + _woEsc(p.name) + '</div>' +
                       ((p.archived || tags.length) ? '<div class="wo-badges">' + (p.archived ? '<span class="wo-badge wo-badge--archived">Archived</span> ' : '') +
                           tags.map(function(t) { return '<span class="wo-badge wo-badge--tag">' + _woEsc(t) + '</span>'; }).join(' ') + '</div>' : '') +
                       '<div class="wo-card-meta">' + _woEsc(meta) + '</div>' +
                       (p.description ? '<div class="wo-card-meta">' + _woEsc(p.description) + '</div>' : '') +
                   '</div>' +
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
