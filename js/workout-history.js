// workout-history.js — Workout History records: the Finished Workout screen (and, later, the history list)
//
// Plan: WorkoutsPlan.md §5   Data: `workoutSessions` (personal — always userCol, never the shared library)
//
// The Finished Workout screen (#workout-done/:id) is where you land right after a workout ends:
// enter the calories from your watch, then fix up any set (edit / delete / add / reorder).
// Saving also pushes calories, duration and date to the linked Activity, so the two never disagree.

var _woD = null;   // {id, data, sets[], dirty, activityOk}

function _woLocalHHMM(ms) {
    var d = new Date(ms);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function _woISOFromLocal(dateISO, hhmm) { return new Date(dateISO + 'T' + (hhmm || '12:00') + ':00').toISOString(); }

async function loadWorkoutDonePage(id) {
    var el = document.getElementById('page-workout-done');
    _woSetChrome([['Workout History', '#workout-history'], ['Workout']]);
    el.innerHTML = '<div class="page-header"><h2>Finished workout</h2></div><div class="ex-status">Loading…</div>';
    try {
        await woLoadMuscles();
        await woLoadExercises();
        var doc = await userCol('workoutSessions').doc(id).get();
        if (!doc.exists) { el.innerHTML = '<div class="ex-status">Workout record not found.</div>'; return; }
        var data = doc.data();
        if (data.status === 'in-progress') { location.hash = '#workout-day/' + id; return; }   // still being done today
        var activityOk = false;
        if (data.activityId) {
            var a = await userCol('exerciseActivities').doc(data.activityId).get();
            activityOk = a.exists;
        }
        _woD = { id: doc.id, data: data, sets: JSON.parse(JSON.stringify(data.sets || [])), dirty: false, activityOk: activityOk };
    } catch (err) {
        console.error('Workouts: failed to load finished workout:', err);
        el.innerHTML = '<div class="ex-status">Could not load this record.</div>';
        return;
    }
    _woRenderDonePage();
}

// ─── computed bits ────────────────────────────────────────────────────────────

/** "🏆 New personal records" banner for a record's prs[] (empty string when there are none). */
function woPRsHtml(prs) {
    if (!prs || !prs.length) return '';
    var unit = { weight: ' lb', reps: ' reps', time: ' sec' };
    return '<div class="wo-banner wo-banner--pr"><strong>🏆 New personal record' + (prs.length === 1 ? '' : 's') + '!</strong><ul class="wo-ro-list">' +
        prs.map(function(p) {
            var what = p.kind === 'weight' ? 'heaviest' : (p.kind === 'reps' ? 'most reps' : 'longest');
            return '<li><strong>' + _woEsc(p.exerciseName) + '</strong> — ' + what + ': ' + p.value + unit[p.kind] + ' (was ' + p.previous + unit[p.kind] + ')</li>';
        }).join('') + '</ul></div>';
}

/**
 * Set numbers are not stored — they follow line order. Each exercise counts its own sets;
 * the right-hand line of a left/right pair belongs to the same set as the left one.
 */
function woSetNumbers(sets) {
    var counts = {}, out = [], firstSide = {};
    sets.forEach(function(s, i) {
        var prev = sets[i - 1];
        if (s.side && !firstSide[s.exerciseId]) firstSide[s.exerciseId] = s.side;       // the side this exercise starts with
        // the second line of a pair: same exercise, previous line was the starting side, this one is the other side
        var secondSide = prev && prev.exerciseId === s.exerciseId && prev.side && prev.side === firstSide[s.exerciseId] && s.side && s.side !== prev.side;
        if (secondSide) { out.push(out[i - 1]); return; }
        counts[s.exerciseId] = (counts[s.exerciseId] || 0) + 1;
        out.push(counts[s.exerciseId]);
    });
    return out;
}

function _woDoneTotals(sets) {
    var t = { done: 0, total: sets.length, skipped: 0, reps: 0, volume: 0 };
    sets.forEach(function(s) {
        if (s.skipped || s.actualAmount == null) { t.skipped++; return; }
        t.done++;
        if (s.measure !== 'time') {
            t.reps += s.actualAmount;
            if (s.actualWeight != null) t.volume += s.actualAmount * s.actualWeight;
        }
    });
    return t;
}

// ─── rendering ────────────────────────────────────────────────────────────────

function _woRenderDonePage() {
    var d = _woD.data, el = document.getElementById('page-workout-done');
    var startMs = d.startedAt ? Date.parse(d.startedAt) : Date.now();
    var rating = d.rating || 0;

    el.innerHTML =
        '<div class="page-header"><h2>' + _woEsc(d.workoutName) + '</h2></div>' +
        '<div class="ex-form">' +
            '<div id="wodSaved" class="wo-banner hidden">✓ Saved</div>' +
            woPRsHtml(d.prs) +

            '<div class="ex-form-group">' +
                '<label class="ex-label" for="wodCal">Calories burned <span class="wo-hint">from your watch</span></label>' +
                '<input type="number" id="wodCal" min="0" step="1" placeholder="e.g. 245" value="' + (d.calories != null ? d.calories : '') + '">' +
            '</div>' +

            '<div class="ex-form-group"><label class="ex-label">Date &amp; time</label>' +
                '<div class="ex-datetime-row">' +
                    '<input type="date" id="wodDate" value="' + _woEsc(d.date) + '" max="' + _woTodayISO() + '">' +
                    '<input type="time" id="wodTime" value="' + _woLocalHHMM(startMs) + '">' +
                '</div></div>' +

            '<div class="ex-form-group"><label class="ex-label" for="wodDur">Duration (minutes)</label>' +
                '<input type="number" id="wodDur" min="0" step="0.1" value="' + (d.durationMinutes != null ? d.durationMinutes : '') + '"></div>' +

            '<div class="ex-form-group"><label class="ex-label">How hard was it?</label>' +
                '<div class="wo-rating" id="wodRating">' +
                    [1, 2, 3, 4, 5].map(function(n) {
                        return '<button type="button" class="wo-rate-btn' + (n <= rating ? ' wo-rate-btn--on' : '') + '" data-rating="' + n + '">' + n + '</button>';
                    }).join('') +
                '</div></div>' +

            '<div class="ex-form-group"><label class="ex-label" for="wodNotes">Notes</label>' +
                '<textarea id="wodNotes" rows="2" placeholder="felt strong, left shoulder tight…">' + _woEsc(d.notes) + '</textarea></div>' +

            '<div class="ex-form-group"><label class="ex-label">Sets <span class="wo-hint">change any number, remove a line, or add one</span></label>' +
                '<div id="wodTotals" class="wo-builder-summary"></div>' +
                '<div id="wodLines"></div>' +
                '<button type="button" class="btn btn-secondary" id="wodAddLine">+ Add line</button>' +
            '</div>' +

            '<div class="ex-form-actions">' +
                '<button type="button" class="btn btn-primary" id="wodSave">Save</button>' +
                '<button type="button" class="btn btn-secondary" id="wodBack">Back to Workouts</button>' +
                (_woD.activityOk ? '' : '<button type="button" class="btn btn-secondary" id="wodMakeAct">Create Activity</button>') +
                '<button type="button" class="btn btn-danger" id="wodDelete">Delete</button>' +
            '</div>' +
        '</div>';

    // simple fields mark the page as changed
    ['wodCal', 'wodDate', 'wodTime', 'wodDur', 'wodNotes'].forEach(function(id) {
        document.getElementById(id).addEventListener('input', function() { _woD.dirty = true; });
    });
    document.getElementById('wodRating').addEventListener('click', function(ev) {
        var b = ev.target.closest('[data-rating]');
        if (!b) return;
        var n = parseInt(b.getAttribute('data-rating'), 10);
        _woD.data.rating = (_woD.data.rating === n) ? null : n;     // tap the same number again to clear
        _woD.dirty = true;
        this.querySelectorAll('.wo-rate-btn').forEach(function(x) {
            x.classList.toggle('wo-rate-btn--on', parseInt(x.getAttribute('data-rating'), 10) <= (_woD.data.rating || 0));
        });
    });

    var lines = document.getElementById('wodLines');
    lines.addEventListener('click', _woDoneLineClick);
    lines.addEventListener('input', _woDoneLineInput);
    lines.addEventListener('change', _woDoneLineInput);
    document.getElementById('wodAddLine').addEventListener('click', _woDoneAddLine);
    document.getElementById('wodSave').addEventListener('click', _woDoneSave);
    document.getElementById('wodBack').addEventListener('click', _woDoneBack);
    document.getElementById('wodDelete').addEventListener('click', _woDoneDelete);
    var mk = document.getElementById('wodMakeAct');
    if (mk) mk.addEventListener('click', _woDoneMakeActivity);

    _woRenderDoneLines();
}

function _woRenderDoneLines() {
    var box = document.getElementById('wodLines');
    if (!box) return;
    var sets = _woD.sets, nums = woSetNumbers(sets);
    if (!sets.length) {
        box.innerHTML = '<p class="wo-hint">No sets recorded. Use <strong>+ Add line</strong>.</p>';
    } else {
        box.innerHTML = sets.map(function(s, i) {
            var ex = _woExMap[s.exerciseId];
            var unit = s.measure === 'time' ? 'sec' : 'reps';
            var showWeight = s.measure !== 'time' && (s.targetWeight != null || s.actualWeight != null || (ex && ex.usesWeight));
            var skipped = !!s.skipped || s.actualAmount == null;
            var label = _woEsc(s.exerciseName) + ' <span class="wo-line-set">Set ' + nums[i] + (s.side ? ' · ' + s.side : '') + '</span>';
            return '<div class="wo-line' + (skipped ? ' wo-line--skipped' : '') + '" data-i="' + i + '">' +
                '<span class="wo-step-btns wo-line-btns">' +
                    '<button type="button" class="wo-frame-btn" data-act="up" title="Move up"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
                    '<button type="button" class="wo-frame-btn" data-act="down" title="Move down"' + (i === sets.length - 1 ? ' disabled' : '') + '>↓</button>' +
                '</span>' +
                '<span class="wo-line-name">' + label + (skipped ? ' <span class="wo-badge wo-badge--neither">skipped</span>' : '') + (s.manual ? ' <span class="wo-badge wo-badge--both">added</span>' : '') + '</span>' +
                '<span class="wo-line-vals">' +
                    '<input type="number" min="0" data-f="amount" value="' + (s.actualAmount != null ? s.actualAmount : '') + '" placeholder="' + (s.targetAmount != null ? s.targetAmount : '') + '"> ' + unit +
                    (showWeight ? ' @ <input type="number" min="0" step="0.5" data-f="weight" value="' + (s.actualWeight != null ? s.actualWeight : '') + '" placeholder="' + (s.targetWeight != null ? s.targetWeight : '') + '"> lb' : '') +
                '</span>' +
                '<button type="button" class="wo-frame-btn wo-frame-btn--del" data-act="del" title="Delete this line">🗑</button>' +
            '</div>';
        }).join('');
    }
    _woUpdateDoneTotals();
}

function _woUpdateDoneTotals() {
    var el = document.getElementById('wodTotals');
    if (!el) return;
    var t = _woDoneTotals(_woD.sets);
    var bits = [t.done + ' of ' + t.total + ' sets done'];
    if (t.skipped) bits.push(t.skipped + ' skipped');
    if (t.reps) bits.push(t.reps + ' reps');
    if (t.volume) bits.push(Math.round(t.volume).toLocaleString() + ' lb lifted');
    el.textContent = bits.join('   |   ');
}

// ─── editing lines ────────────────────────────────────────────────────────────

function _woDoneLineClick(ev) {
    var btn = ev.target.closest('[data-act]');
    if (!btn) return;
    var row = btn.closest('[data-i]');
    var i = parseInt(row.getAttribute('data-i'), 10), act = btn.getAttribute('data-act'), sets = _woD.sets;
    if (act === 'up'   && i > 0)               { var t = sets[i]; sets[i] = sets[i - 1]; sets[i - 1] = t; }
    if (act === 'down' && i < sets.length - 1) { var u = sets[i]; sets[i] = sets[i + 1]; sets[i + 1] = u; }
    if (act === 'del') sets.splice(i, 1);
    _woD.dirty = true;
    _woRenderDoneLines();
}

function _woDoneLineInput(ev) {
    var inp = ev.target.closest('[data-f]');
    if (!inp) return;
    var row = inp.closest('[data-i]');
    var s = _woD.sets[parseInt(row.getAttribute('data-i'), 10)];
    if (!s) return;
    var f = inp.getAttribute('data-f');
    if (f === 'amount') {
        var a = parseFloat(inp.value);
        s.actualAmount = isNaN(a) ? null : a;
        s.skipped = s.actualAmount == null;       // a number fills in a skipped set; clearing it marks it skipped again
        if (s.actualAmount != null && !s.doneAt) s.doneAt = new Date().toISOString();
    } else {
        s.actualWeight = inp.value !== '' ? parseFloat(inp.value) : null;
    }
    _woD.dirty = true;
    _woUpdateDoneTotals();
    if (ev.type === 'change') _woRenderDoneLines();   // refresh greying / skipped tags once the box loses focus
}

function _woDoneAddLine() {
    _woOpenExercisePicker(null, function(ex) {
        _woD.sets.push({
            exerciseId: ex.id, exerciseName: ex.name, measure: ex.measure,
            section: 'main', side: null,
            targetAmount: null, targetWeight: null,
            actualAmount: ex.defaultAmount != null ? ex.defaultAmount : (ex.measure === 'time' ? 30 : 10),
            actualWeight: ex.usesWeight && ex.defaultWeight != null ? ex.defaultWeight : null,
            doneAt: new Date().toISOString(), skipped: false, manual: true
        });
        _woD.dirty = true;
        _woRenderDoneLines();
        var rows = document.querySelectorAll('.wo-line');
        if (rows.length) rows[rows.length - 1].scrollIntoView({ block: 'center' });
    });
}

// ─── save / activity / delete ─────────────────────────────────────────────────

/** Reads the top form into a plain object (also validates). Returns null if something is invalid. */
function _woDoneReadForm() {
    var date = document.getElementById('wodDate').value;
    if (!date) { alert('Please enter a date.'); return null; }
    var time = document.getElementById('wodTime').value || '12:00';
    var calRaw = document.getElementById('wodCal').value;
    var durRaw = document.getElementById('wodDur').value;
    return {
        date: date,
        time: time,
        calories: calRaw !== '' ? Math.max(0, parseInt(calRaw, 10) || 0) : null,
        durationMinutes: durRaw !== '' ? Math.max(0, parseFloat(durRaw) || 0) : null,   // blank stays blank (e.g. a day workout)
        notes: document.getElementById('wodNotes').value.trim(),
        rating: _woD.data.rating || null
    };
}

function _woDoneActivityFields(f) {
    return {
        calories:        f.calories,
        durationMinutes: f.durationMinutes,
        activityDate:    f.date + 'T' + f.time + ':00'
    };
}

async function _woDoneSave() {
    var f = _woDoneReadForm();
    if (!f) return;
    var btn = document.getElementById('wodSave');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
        var startedAt = _woISOFromLocal(f.date, f.time);
        var finishedAt = new Date(Date.parse(startedAt) + (f.durationMinutes || 0) * 60000).toISOString();
        var sets = JSON.parse(JSON.stringify(_woD.sets));
        sets.forEach(function(s) { s.skipped = (s.actualAmount == null); });
        await userCol('workoutSessions').doc(_woD.id).update({
            date: f.date, startedAt: startedAt, finishedAt: finishedAt,
            durationMinutes: f.durationMinutes, calories: f.calories,
            notes: f.notes, rating: f.rating, sets: sets
        });
        // keep the linked Activity in step (calories flow on into Daily Metrics and the Summary grids)
        if (_woD.data.activityId && _woD.activityOk) {
            await userCol('exerciseActivities').doc(_woD.data.activityId).update(_woDoneActivityFields(f));
        }
        _woD.dirty = false;
        var banner = document.getElementById('wodSaved');
        if (banner) { banner.classList.remove('hidden'); banner.scrollIntoView({ block: 'center' }); }
    } catch (err) {
        console.error('Workouts: save finished workout failed:', err);
        alert('Failed to save. Please try again.');
    }
    btn.disabled = false; btn.textContent = 'Save';
}

/** For a record whose Activity is missing (deleted, or it could not be created). */
async function _woDoneMakeActivity() {
    var f = _woDoneReadForm();
    if (!f) return;
    try {
        var typeId = await _woWorkoutTypeId();
        if (!typeId) throw new Error('Workout activity type not found');
        var fields = _woDoneActivityFields(f);
        var ref = await userCol('exerciseActivities').add({
            typeId: typeId, activityDate: fields.activityDate, durationMinutes: fields.durationMinutes,
            miles: null, runMiles: null, withDogs: null, calories: fields.calories, comment: '',
            workoutSessionId: _woD.id, workoutName: _woD.data.workoutName,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await userCol('workoutSessions').doc(_woD.id).update({ activityId: ref.id });
        _woD.data.activityId = ref.id;
        _woD.activityOk = true;
        var b = document.getElementById('wodMakeAct');
        if (b) b.remove();
        var banner = document.getElementById('wodSaved');
        if (banner) { banner.textContent = '✓ Activity created'; banner.classList.remove('hidden'); }
    } catch (err) {
        console.error('Workouts: create activity failed:', err);
        alert('Could not create the Activity. Please try again.');
    }
}

function _woDoneBack() {
    if (_woD && _woD.dirty && !confirm('You have unsaved changes. Leave without saving?')) return;
    location.hash = '#workouts';
}

/** Delete with a choice: also delete the linked Activity, or keep it as an ordinary Activity. */
function _woDoneDelete() {
    if (!_woD.activityOk) {
        if (!confirm('Delete this workout record? This cannot be undone.')) return;
        _woDoneDoDelete(false);
        return;
    }
    var ov = _woGrabOverlay(
        '<h3>Delete this workout record?</h3>' +
        '<p>It is linked to an entry in your Activities. Also delete that Activity?</p>' +
        '<div class="ex-form-actions">' +
            '<button type="button" class="btn btn-danger" id="wodDelBoth">Delete both</button>' +
            '<button type="button" class="btn btn-secondary" id="wodDelOne">Only the workout record</button>' +
            '<button type="button" class="btn btn-secondary" id="wodDelCancel">Cancel</button>' +
        '</div>' +
        '<p class="wo-hint">“Only the workout record” keeps the Activity as an ordinary one — with its calories, duration, date and “Workout: name” label — that you can still edit.</p>');
    ov.querySelector('#wodDelBoth').addEventListener('click', function() { _woCloseGrabber(); _woDoneDoDelete(true); });
    ov.querySelector('#wodDelOne').addEventListener('click',  function() { _woCloseGrabber(); _woDoneDoDelete(false); });
    ov.querySelector('#wodDelCancel').addEventListener('click', _woCloseGrabber);
}

async function _woDoneDoDelete(alsoActivity) {
    try {
        var aid = _woD.data.activityId;
        if (aid && _woD.activityOk) {
            if (alsoActivity) await userCol('exerciseActivities').doc(aid).delete();
            else await userCol('exerciseActivities').doc(aid).update({ workoutSessionId: firebase.firestore.FieldValue.delete() });
        }
        await userCol('workoutSessions').doc(_woD.id).delete();
        _woD.dirty = false;
        location.hash = '#workouts';
    } catch (err) {
        console.error('Workouts: delete finished workout failed:', err);
        alert('Failed to delete. Please try again.');
    }
}

// ─── Workout History list (#workout-history, chunk 3.3) ───────────────────────

var _woHist = [];
var _woHistFilter = { text: '' };

async function loadWorkoutHistoryPage() {
    window.scrollTo(0, 0);
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#life">Life</a><span class="separator">&rsaquo;</span><a href="#exercise">Fitness</a>' +
        '<span class="separator">&rsaquo;</span><span>Workout History</span>';
    document.getElementById('headerTitle').innerHTML = '<a href="#main" class="home-link">' + (window.appName || 'My Life') + '</a>';
    var el = document.getElementById('page-workout-history');
    el.innerHTML = '<div class="page-header"><h2>Workout History</h2></div><div class="ex-status">Loading…</div>';
    try {
        var snap = await userCol('workoutSessions').get();
        _woHist = snap.docs.map(function(d) { var w = d.data(); w.id = d.id; return w; });
    } catch (err) {
        console.error('Workouts: failed to load history:', err);
        el.innerHTML = '<div class="page-header"><h2>Workout History</h2></div><div class="ex-status">Could not load your workout history.</div>';
        return;
    }
    // newest first (date, then start time)
    _woHist.sort(function(a, b) {
        return (b.date || '').localeCompare(a.date || '') || (b.startedAt || '').localeCompare(a.startedAt || '');
    });
    el.innerHTML =
        '<div class="page-header"><h2>Workout History</h2></div>' +
        '<div class="ex-toolbar"><div class="ex-toolbar-row">' +
            '<input type="search" id="whText" class="filter-input" placeholder="Search by workout name…" value="' + _woEsc(_woHistFilter.text) + '">' +
        '</div></div>' +
        '<div id="whCount" class="wo-count"></div>' +
        '<div id="whList"></div>';
    document.getElementById('whText').addEventListener('input', function() { _woHistFilter.text = this.value; _woRenderHistList(); });
    _woRenderHistList();
}

function _woFmtLongDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function _woRenderHistList() {
    var text = _woHistFilter.text.trim().toLowerCase();
    var rows = _woHist.filter(function(w) { return !text || (w.workoutName || '').toLowerCase().indexOf(text) !== -1; });
    document.getElementById('whCount').textContent = rows.length + ' workout' + (rows.length === 1 ? '' : 's');
    var list = document.getElementById('whList');
    if (!rows.length) {
        list.innerHTML = '<div class="ex-status">' + (_woHist.length ? 'No workouts match.' : 'No workouts yet — finish one with <strong>▶ Start</strong> and it will show up here.') + '</div>';
        return;
    }
    var html = '', lastMonth = '';
    rows.forEach(function(w) {
        var month = (w.date || '').slice(0, 7);
        if (month !== lastMonth) {
            lastMonth = month;
            var p = month.split('-');
            html += '<div class="wo-month-head">' + new Date(+p[0], +p[1] - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) + '</div>';
        }
        var sets = w.sets || [];
        var done = sets.filter(function(s) { return !s.skipped && s.actualAmount != null; }).length;
        var bits = [_woFmtLongDate(w.date)];
        if (w.durationMinutes) bits.push(w.durationMinutes + ' min');
        bits.push(done + ' of ' + sets.length + ' sets');
        var open = w.status === 'in-progress';
        html += '<a href="#' + (open ? 'workout-day/' : 'workout-done/') + w.id + '" class="wo-card">' +
                    '<div class="wo-thumb">📋</div>' +
                    '<div class="wo-card-main">' +
                        '<div class="wo-card-name">' + _woEsc(w.workoutName) + '</div>' +
                        '<div class="wo-badges">' +
                            (open ? '<span class="wo-badge wo-badge--both">In progress</span>' : '') +
                            (open ? '' : w.calories != null ? '<span class="wo-badge wo-badge--push">' + w.calories + ' cal</span>'
                                                : '<span class="wo-badge wo-badge--pull">No calories</span>') +
                            (w.rating ? '<span class="wo-badge wo-badge--neither">Effort ' + w.rating + '/5</span>' : '') +
                            ((w.prs && w.prs.length) ? '<span class="wo-badge wo-badge--both">🏆 ' + w.prs.length + ' PR' + (w.prs.length === 1 ? '' : 's') + '</span>' : '') +
                        '</div>' +
                        '<div class="wo-card-meta">' + _woEsc(bits.join(' · ')) + '</div>' +
                    '</div>' +
                '</a>';
    });
    list.innerHTML = html;
}

// ─── Activity screen for workout-created activities (chunks 3.4 + 3.5) ────────
//
// An Activity that came from a finished workout (it carries workoutSessionId) is not edited
// here — the workout record is the source of truth for calories, duration and date. This
// read-only summary offers "Edit Workout" and a delete that asks about the linked record.
// Called by loadExerciseActivityPage(); returns false when the record is gone, so the normal
// Activity form shows instead (an ordinary activity).

async function woRenderActivityWorkoutSummary(el, activityId, act) {
    var doc = await userCol('workoutSessions').doc(act.workoutSessionId).get();
    if (!doc.exists) return false;
    var w = doc.data();

    // Compact list: each exercise once (in order) with the sets that were done
    var order = [], byEx = {};
    (w.sets || []).forEach(function(s) {
        if (!byEx[s.exerciseId]) { byEx[s.exerciseId] = { name: s.exerciseName, parts: [] }; order.push(s.exerciseId); }
        if (s.skipped || s.actualAmount == null) return;
        byEx[s.exerciseId].parts.push(woFmtAmount(s.measure, s.actualAmount, s.actualWeight) + (s.side ? ' (' + s.side + ')' : ''));
    });
    var list = order.map(function(id) {
        var e = byEx[id];
        return '<li><strong>' + _woEsc(e.name) + '</strong> — ' + (e.parts.length ? _woEsc(e.parts.join(', ')) : '<em>skipped</em>') + '</li>';
    }).join('');

    var date = (act.activityDate || '').substring(0, 10), time = (act.activityDate || '').substring(11, 16);
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#life">Life</a><span class="separator">&rsaquo;</span><a href="#exercise">Fitness</a>' +
        '<span class="separator">&rsaquo;</span><a href="#exercise-activities">Activities</a>' +
        '<span class="separator">&rsaquo;</span><span>Workout</span>';

    el.innerHTML =
        '<div class="page-header"><h2>Workout: ' + _woEsc(w.workoutName) + '</h2></div>' +
        '<div class="ex-form">' +
            '<div class="wo-banner">This activity comes from a workout. Calories, time and date are edited on the workout — tap <strong>Edit Workout</strong>.</div>' +
            '<div class="wo-readonly">' +
                '<div><span class="wo-ro-label">Date</span> ' + _woEsc(_woFmtLongDate(date)) + (time ? ' · ' + _woEsc(time) : '') + '</div>' +
                '<div><span class="wo-ro-label">Duration</span> ' + (act.durationMinutes != null ? _woEsc(act.durationMinutes) + ' min' : '—') + '</div>' +
                '<div><span class="wo-ro-label">Calories</span> ' + (act.calories != null ? _woEsc(act.calories) : '<em>not entered yet</em>') + '</div>' +
            '</div>' +
            '<div class="ex-form-group"><label class="ex-label">What you did</label><ul class="wo-ro-list">' + (list || '<li><em>No sets recorded</em></li>') + '</ul></div>' +
            '<div class="ex-form-actions">' +
                '<a href="#workout-done/' + act.workoutSessionId + '" class="btn btn-primary">Edit Workout</a>' +
                '<a href="#exercise-activities" class="btn btn-secondary">Back</a>' +
                '<button type="button" class="btn btn-danger" id="woActDelete">Delete</button>' +
            '</div>' +
        '</div>';

    document.getElementById('woActDelete').addEventListener('click', function() {
        var ov = _woGrabOverlay(
            '<h3>Delete this activity?</h3>' +
            '<p>It is linked to a workout record in your Workout History. Also delete that workout?</p>' +
            '<div class="ex-form-actions">' +
                '<button type="button" class="btn btn-danger" id="woActDelBoth">Delete both</button>' +
                '<button type="button" class="btn btn-secondary" id="woActDelOne">Only the activity</button>' +
                '<button type="button" class="btn btn-secondary" id="woActDelCancel">Cancel</button>' +
            '</div>' +
            '<p class="wo-hint">“Only the activity” keeps the workout in your history (you can use <strong>Create Activity</strong> on it later to link a new one).</p>');
        var go = async function(alsoWorkout) {
            _woCloseGrabber();
            try {
                if (alsoWorkout) await userCol('workoutSessions').doc(act.workoutSessionId).delete();
                else await userCol('workoutSessions').doc(act.workoutSessionId).update({ activityId: null });
                await userCol('exerciseActivities').doc(activityId).delete();
                location.hash = '#exercise-activities';
            } catch (err) {
                console.error('Workouts: delete activity failed:', err);
                alert('Failed to delete. Please try again.');
            }
        };
        ov.querySelector('#woActDelBoth').addEventListener('click', function() { go(true); });
        ov.querySelector('#woActDelOne').addEventListener('click',  function() { go(false); });
        ov.querySelector('#woActDelCancel').addEventListener('click', _woCloseGrabber);
    });
    return true;
}

// ─── Per-exercise history + records chart (#workout-exercise-history/:id, chunk 5.4) ──
//
// One point per finished workout that included the exercise. The metric follows the exercise:
// weighted → heaviest weight, unweighted reps → most reps in a set, timed → longest time.
// A point is a record (🏆) when it beats every earlier session; the first session isn't one.

var _woExChart = null;

/** Chronological [{date, workoutName, value, sets (lines), pr}] for one exercise; plus {kind, unit}. */
function woExerciseHistory(sessions, exerciseId) {
    var rows = [];
    sessions.forEach(function(s) {
        if (s.status === 'in-progress') return;
        var lines = (s.sets || []).filter(function(l) { return l.exerciseId === exerciseId && !l.skipped && l.actualAmount != null; });
        if (lines.length) rows.push({ date: s.date, startedAt: s.startedAt || '', workoutName: s.workoutName, lines: lines });
    });
    rows.sort(function(a, b) { return (a.date || '').localeCompare(b.date || '') || a.startedAt.localeCompare(b.startedAt); });
    var last = rows.length ? rows[rows.length - 1].lines[0] : null;
    var kind = !last ? 'reps' : (last.measure === 'time' ? 'time' : (rows.some(function(r) { return r.lines.some(function(l) { return l.actualWeight != null; }); }) ? 'weight' : 'reps'));
    var best = null;
    rows.forEach(function(r) {
        r.value = Math.max.apply(null, r.lines.map(function(l) {
            return kind === 'weight' ? (l.actualWeight != null ? l.actualWeight : 0) : l.actualAmount;
        }));
        r.pr = best != null && r.value > best;
        if (best == null || r.value > best) best = r.value;
    });
    return { rows: rows, kind: kind, unit: kind === 'weight' ? 'lb' : (kind === 'time' ? 'sec' : 'reps') };
}

async function loadWorkoutExerciseHistoryPage(id) {
    var el = document.getElementById('page-workout-exercise-history');
    window.scrollTo(0, 0);
    _woSetChrome([['Exercises', '#workout-exercises'], ['History']]);
    el.innerHTML = '<div class="page-header"><h2>History</h2></div><div class="ex-status">Loading…</div>';
    var ex, sessions;
    try {
        var doc = await woLibCol('workoutExercises').doc(id).get();
        if (!doc.exists) { el.innerHTML = '<div class="ex-status">Exercise not found.</div>'; return; }
        ex = doc.data();
        var snap = await userCol('workoutSessions').get();
        sessions = snap.docs.map(function(d) { return d.data(); });
    } catch (err) {
        console.error('Workouts: failed to load exercise history:', err);
        el.innerHTML = '<div class="ex-status">Could not load the history.</div>';
        return;
    }
    var H = woExerciseHistory(sessions, id);
    var rows = H.rows;
    var label = H.kind === 'weight' ? 'Heaviest weight' : (H.kind === 'time' ? 'Longest time' : 'Most reps in a set');
    var best = rows.length ? rows.reduce(function(m, r) { return r.value > m.value ? r : m; }, rows[0]) : null;
    var prCount = rows.filter(function(r) { return r.pr; }).length;

    el.innerHTML =
        '<div class="page-header"><h2>' + _woEsc(ex.name) + ' — history</h2>' +
            '<div class="page-header-actions"><a href="#workout-exercise/' + id + '" class="btn btn-secondary">Edit exercise</a></div></div>' +
        (rows.length ?
            '<div class="wo-stats">' +
                '<div><strong>' + rows.length + '</strong><span>session' + (rows.length === 1 ? '' : 's') + '</span></div>' +
                '<div><strong>' + best.value + ' ' + H.unit + '</strong><span>' + label + ' · ' + _woEsc(_woFmtLongDate(best.date)) + '</span></div>' +
                '<div><strong>' + prCount + '</strong><span>🏆 record' + (prCount === 1 ? '' : 's') + '</span></div>' +
                '<div><strong>' + _woEsc(_woFmtLongDate(rows[rows.length - 1].date)) + '</strong><span>last done</span></div>' +
            '</div>' +
            '<div class="wo-chart-wrap"><canvas id="woExChart" height="220"></canvas></div>' +
            '<div class="ex-form-group" style="padding:0 16px;"><label class="ex-label">Every session</label>' +
            '<table class="ex-table"><thead><tr><th>Date</th><th>Workout</th><th>Sets</th><th>' + label + '</th></tr></thead><tbody>' +
                rows.slice().reverse().map(function(r) {
                    return '<tr><td>' + _woEsc(_woFmtLongDate(r.date)) + '</td><td>' + _woEsc(r.workoutName) + '</td><td>' + _woEsc(woFmtLastSets(r.lines.filter(function(l) { return l.side !== 'right'; }))) +
                           '</td><td>' + r.value + ' ' + H.unit + (r.pr ? ' 🏆' : '') + '</td></tr>';
                }).join('') + '</tbody></table></div>'
        : '<div class="ex-status">You haven\'t done this exercise in a finished workout yet.</div>');

    if (rows.length && typeof Chart !== 'undefined') {
        if (_woExChart) { _woExChart.destroy(); _woExChart = null; }
        _woExChart = new Chart(document.getElementById('woExChart'), {
            type: 'line',
            data: {
                labels: rows.map(function(r) { return r.date; }),
                datasets: [{
                    label: label + ' (' + H.unit + ')',
                    data: rows.map(function(r) { return r.value; }),
                    borderColor: '#0d9488', backgroundColor: 'rgba(13,148,136,0.15)', tension: 0.2, fill: true,
                    pointRadius: rows.map(function(r) { return r.pr ? 7 : 4; }),
                    pointBackgroundColor: rows.map(function(r) { return r.pr ? '#f59e0b' : '#0d9488'; })
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: function(c) { return rows[c.dataIndex].pr ? '🏆 new record' : ''; } } } },
                scales: { y: { beginAtZero: false, title: { display: true, text: H.unit } } }
            }
        });
    }
}
