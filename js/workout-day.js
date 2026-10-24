// workout-day.js — "Throughout the day" workouts (Fitness → Workouts)
//
// Plan: WorkoutsPlan.md §4.3
//
// Instead of running the workout in one go, the whole set list is created up front as an
// OPEN Workout History record (status 'in-progress', mode 'day') and you tick each set off
// whenever you do it — spread across the day, from any device (the record lives in Firestore
// and the checklist listens for changes). Finishing uses the same path as any other workout:
// pending sets are logged as skipped, personal records are checked and a linked Activity is created.
//
// A set line in an in-progress record: pending = {skipped:false, actualAmount:null, doneAt:null};
// done = {actualAmount, actualWeight, doneAt}. (On finish, pending lines become skipped.)

var _woDay = null;   // {id, data, sets[], unsub}

/** One pending set line per work phase of the workout, in timeline order. */
function woPendingLines(workout) {
    var phases = woBuildTimeline(workout, { getReadySec: 0 });
    return woSetLinesFromRun(phases, []).map(function(l) { l.skipped = false; return l; });
}

/** Creates the open record and returns its id. */
async function woStartDaySession(sess) {
    var now = Date.now();
    var ref = await userCol('workoutSessions').add({
        workoutId:       sess.workoutId,
        workoutName:     sess.workoutName,
        date:            sess.date,
        mode:            'day',
        status:          'in-progress',
        startedAt:       _woISODate(now),
        finishedAt:      null,
        durationMinutes: null,
        calories:        null,
        notes:           '',
        rating:          null,
        sets:            woPendingLines(sess.workout),
        prs:             [],
        activityId:      null,
        createdAt:       firebase.firestore.FieldValue.serverTimestamp()
    });
    return ref.id;
}

// ─── The checklist page (#workout-day/:id) ────────────────────────────────────

function _woDayStop() {
    if (_woDay && _woDay.unsub) { try { _woDay.unsub(); } catch (e) {} }
    _woDay = null;
}

async function loadWorkoutDayPage(id) {
    _woDayStop();
    var el = document.getElementById('page-workout-day');
    _woSetChrome([['Workouts', '#workouts'], ['Today’s workout']]);
    el.innerHTML = '<div class="page-header"><h2>Workout</h2></div><div class="ex-status">Loading…</div>';
    try {
        await woLoadMuscles();
        await woLoadExercises();
        var doc = await userCol('workoutSessions').doc(id).get();
        if (!doc.exists) { el.innerHTML = '<div class="ex-status">This workout was not found (it may have been discarded).</div>'; return; }
        if (doc.data().status !== 'in-progress') { location.hash = '#workout-done/' + id; return; }
        _woDay = { id: id, data: doc.data(), sets: JSON.parse(JSON.stringify(doc.data().sets || [])), unsub: null };
    } catch (err) {
        console.error('Workouts: failed to load day workout:', err);
        el.innerHTML = '<div class="ex-status">Could not load this workout.</div>';
        return;
    }
    _woRenderDayPage();

    // Live updates: ticking a set on another device shows up here
    var me = _woDay;
    me.unsub = userCol('workoutSessions').doc(id).onSnapshot(function(snap) {
        if (!_woDay || _woDay !== me || !snap.exists) return;
        if (snap.data().status !== 'in-progress') { location.hash = '#workout-done/' + id; return; }
        var editing = document.activeElement && document.activeElement.closest && document.activeElement.closest('#wdLines') &&
                      document.activeElement.tagName === 'INPUT';
        me.sets = JSON.parse(JSON.stringify(snap.data().sets || []));
        if (!editing) _woRenderDayLines();
    });
    // stop listening when leaving the page
    var onLeave = function() { if (location.hash.indexOf('#workout-day') !== 0) { window.removeEventListener('hashchange', onLeave); if (_woDay === me) _woDayStop(); } };
    window.addEventListener('hashchange', onLeave);
}

function _woRenderDayPage() {
    var d = _woDay.data, el = document.getElementById('page-workout-day');
    el.innerHTML =
        '<div class="page-header"><h2>' + _woEsc(d.workoutName) + '</h2></div>' +
        '<div class="ex-form">' +
            '<div class="wo-banner" id="wdProgress"></div>' +
            '<p class="wo-hint">Do your sets whenever you like today — tick each one off when you finish it. You can change the reps or weight first. Come back from any device.</p>' +
            '<div id="wdLines"></div>' +
            '<div class="ex-form-actions">' +
                '<button type="button" class="btn btn-primary" id="wdFinish">Finish workout</button>' +
                '<a href="#workouts" class="btn btn-secondary">Close (keep going later)</a>' +
                '<button type="button" class="btn btn-danger" id="wdDiscard">Discard</button>' +
            '</div>' +
        '</div>';
    var box = document.getElementById('wdLines');
    box.addEventListener('click', _woDayClick);
    document.getElementById('wdFinish').addEventListener('click', _woDayFinish);
    document.getElementById('wdDiscard').addEventListener('click', _woDayDiscard);
    _woRenderDayLines();
}

function _woDayIsDone(l) { return l.actualAmount != null && !l.skipped; }

function _woRenderDayLines() {
    var box = document.getElementById('wdLines');
    if (!box || !_woDay) return;
    var sets = _woDay.sets, nums = woSetNumbers(sets);
    var done = sets.filter(_woDayIsDone).length;
    document.getElementById('wdProgress').textContent = done + ' of ' + sets.length + ' sets done' +
        (_woDay.data.date !== _woTodayISO() ? ' · started ' + _woFmtLongDate(_woDay.data.date) : '');
    var lastEx = null;
    box.innerHTML = sets.map(function(s, i) {
        var unit = s.measure === 'time' ? 'sec' : 'reps';
        var isDone = _woDayIsDone(s);
        var head = '';
        if (woRecordKey(s) !== lastEx) { head = '<div class="wd-ex-name">' + _woEsc(woLineName(s)) + '</div>'; lastEx = woRecordKey(s); }
        var target = woFmtAmount(s.measure, s.targetAmount, s.targetWeight);
        var when = isDone && s.doneAt ? new Date(s.doneAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
        return head + '<div class="wo-line wd-line' + (isDone ? ' wd-line--done' : '') + '" data-i="' + i + '">' +
            '<button type="button" class="wd-check" data-act="toggle" title="' + (isDone ? 'Undo' : 'Mark done') + '">' + (isDone ? '✓' : '') + '</button>' +
            '<span class="wo-line-name"><span class="wo-line-set">Set ' + nums[i] + (s.side ? ' · ' + s.side : '') + '</span> · target ' + _woEsc(target) + '</span>' +
            '<span class="wo-line-vals">' +
                '<input type="number" min="0" data-f="amount" value="' + (isDone ? s.actualAmount : (s.targetAmount != null ? s.targetAmount : '')) + '"> ' + unit +
                (s.targetWeight != null || s.actualWeight != null ? ' @ <input type="number" min="0" step="0.5" data-f="weight" value="' + (isDone ? (s.actualWeight != null ? s.actualWeight : '') : (s.targetWeight != null ? s.targetWeight : '')) + '"> lb' : '') +
            '</span>' +
            '<span class="wd-when">' + _woEsc(when) + '</span>' +
        '</div>';
    }).join('');
}

async function _woDayClick(ev) {
    var btn = ev.target.closest('[data-act="toggle"]');
    if (!btn) return;
    var row = btn.closest('[data-i]');
    var i = parseInt(row.getAttribute('data-i'), 10), s = _woDay.sets[i];
    if (!s) return;
    if (_woDayIsDone(s)) {                       // undo
        s.actualAmount = null; s.actualWeight = null; s.doneAt = null; s.skipped = false;
    } else {                                     // tick: take whatever is in the boxes (they start at the target)
        var a = parseFloat(row.querySelector('[data-f=amount]').value);
        var wEl = row.querySelector('[data-f=weight]'), w = wEl ? parseFloat(wEl.value) : NaN;
        s.actualAmount = isNaN(a) ? s.targetAmount : a;
        s.actualWeight = isNaN(w) ? (s.targetWeight != null ? s.targetWeight : null) : w;
        s.doneAt = new Date().toISOString(); s.skipped = false;
    }
    _woRenderDayLines();
    try {
        await userCol('workoutSessions').doc(_woDay.id).update({ sets: _woDay.sets });
    } catch (err) {
        console.error('Workouts: could not save the tick:', err);
        alert('Could not save that change. Check your connection and try again.');
    }
}

async function _woDayFinish() {
    var sets = _woDay.sets, pending = sets.filter(function(l) { return !_woDayIsDone(l); }).length;
    if (pending && !confirm(pending + ' set' + (pending === 1 ? ' is' : 's are') + ' not done yet. Finish anyway? They will be logged as skipped.')) return;
    var btn = document.getElementById('wdFinish');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
        var id = _woDay.id, d = _woDay.data;
        var lines = JSON.parse(JSON.stringify(sets));
        lines.forEach(function(l) { if (!_woDayIsDone(l)) { l.skipped = true; l.actualAmount = null; l.actualWeight = null; l.doneAt = null; } });
        var prs = [];
        try { prs = await woComputePRs(lines, id); } catch (err) { console.error('Workouts: could not check records:', err); }
        var startMs = d.startedAt ? Date.parse(d.startedAt) : Date.now();
        var activityId = null;
        try {
            activityId = await _woCreateLinkedActivity(id, d.workoutName, d.date, startMs, null);
        } catch (err) { console.error('Workouts: could not create the linked Activity:', err); }
        await woApplyProgression(d.workoutId, lines, d.date);   // streaks / comeback ramp
        var stop = _woDay; _woDayStop();                      // stop listening before the status flips
        await userCol('workoutSessions').doc(id).update({
            status: 'done', sets: lines, prs: prs, finishedAt: _woISODate(Date.now()), activityId: activityId
        });
        location.hash = '#workout-done/' + id;
    } catch (err) {
        console.error('Workouts: finish day workout failed:', err);
        alert('Could not finish the workout. Please try again.');
        btn.disabled = false; btn.textContent = 'Finish workout';
    }
}

async function _woDayDiscard() {
    if (!confirm('Discard this workout? Everything you ticked off will be lost.')) return;
    try {
        var id = _woDay.id;
        _woDayStop();
        await userCol('workoutSessions').doc(id).delete();
        location.hash = '#workouts';
    } catch (err) {
        console.error('Workouts: discard failed:', err);
        alert('Could not discard. Please try again.');
    }
}

// ─── "Workout in progress" card (Fitness hub + Workouts list) ─────────────────

/** Puts a card at the top of `containerId` for every open day workout. Safe to call when there are none. */
async function woShowInProgressCard(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    try {
        var snap = await userCol('workoutSessions').where('status', '==', 'in-progress').get();
        var old = el.querySelector('.wd-card-wrap');
        if (old) old.remove();
        if (snap.empty) return;
        var html = snap.docs.map(function(doc) {
            var d = doc.data(), sets = d.sets || [];
            var done = sets.filter(function(l) { return l.actualAmount != null && !l.skipped; }).length;
            var from = d.date !== _woTodayISO() ? ' · from ' + _woFmtLongDate(d.date) : '';
            return '<a href="#workout-day/' + doc.id + '" class="wd-card">' +
                '<span class="wd-card-icon">🌤️</span>' +
                '<span class="wd-card-text"><strong>Workout in progress: ' + _woEsc(d.workoutName) + '</strong>' +
                '<span>' + done + ' of ' + sets.length + ' sets done' + _woEsc(from) + '</span></span>' +
                '<span class="wd-card-go">Continue ›</span></a>';
        }).join('');
        var wrap = document.createElement('div');
        wrap.className = 'wd-card-wrap';
        wrap.innerHTML = html;
        // below the page heading if there is one, otherwise at the very top
        var header = el.querySelector('.page-header');
        if (header && header.nextSibling) header.parentNode.insertBefore(wrap, header.nextSibling);
        else el.insertBefore(wrap, el.firstChild);
    } catch (err) {
        console.error('Workouts: could not check for workouts in progress:', err);
    }
}
