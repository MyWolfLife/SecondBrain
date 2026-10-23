// workout-player.js — turns a workout into a timeline and runs it (Fitness → Workouts)
//
// Plan:  WorkoutsPlan.md §4 / §11     Progress: WorkoutsProgress.md
//
// Two layers, kept apart so each stays easy to read and test:
//   1. woBuildTimeline(workout)  — pure function: workout doc → flat list of PHASES
//   2. woCreateRunner(phases)    — the clock: runs the phases (pause / resume / skip / back / +time)
// The screens (Start screen, guided player) come later and only talk to the runner.

// ─── 1. Timeline ─────────────────────────────────────────────────────────────
//
// Phase kinds:
//   getready — countdown before the first exercise
//   work     — do an exercise set (timed: counts down; reps: waits for "Done")
//   switch   — short pause between the two sides of an each-side exercise
//   rest     — timed countdown, or waits for "I'm ready" (tap)
//
// Every phase: { kind, label, section, stepIndex, itemIndex, exerciseId, exerciseName,
//   measure, amount, weight, setIndex, setCount, round, rounds, side, restKind,
//   durationSec (null = waits for a tap / "done"), tap (bool) }

var WO_GETREADY_SEC = 10;
var WO_SWITCH_SEC   = 5;

/** Builds the work phase(s) for one set of one exercise (two phases + a switch for each-side moves). */
function _woSetPhases(st, set, ctx) {
    var amount = set.amount != null ? set.amount : (st.measure === 'time' ? 30 : 10);
    var weight = set.weight != null ? set.weight : null;
    var sides  = st.eachSide ? (st.startSide === 'right' ? ['right', 'left'] : ['left', 'right']) : [null];
    var out = [];
    sides.forEach(function(side, si) {
        out.push({
            kind: 'work', label: st.exerciseName, section: ctx.section,
            stepIndex: ctx.stepIndex, itemIndex: ctx.itemIndex,
            exerciseId: st.exerciseId, exerciseName: st.exerciseName,
            measure: st.measure, amount: amount, weight: weight,
            setIndex: ctx.setIndex, setCount: ctx.setCount,
            round: ctx.round, rounds: ctx.rounds, side: side, sideMode: st.sideMode || null,
            restKind: null,
            durationSec: (st.measure === 'time' && !ctx.allTap) ? amount : null,
            tap: st.measure !== 'time' || !!ctx.allTap
        });
        if (si === 0 && sides.length > 1) {
            out.push({ kind: 'switch', label: 'Switch sides', section: ctx.section,
                       stepIndex: ctx.stepIndex, itemIndex: ctx.itemIndex, exerciseId: st.exerciseId,
                       exerciseName: st.exerciseName, measure: st.measure, amount: null, weight: null,
                       setIndex: ctx.setIndex, setCount: ctx.setCount, round: ctx.round, rounds: ctx.rounds,
                       side: null, restKind: null, durationSec: WO_SWITCH_SEC, tap: false });
        }
    });
    return out;
}

/** A rest phase from a {mode, seconds} setting; returns [] for a zero-length timed rest. */
function _woRestPhase(rest, restKind, ctx) {
    if (!rest) return [];
    var tap = rest.mode === 'tap';
    if (!tap && !(rest.seconds > 0)) return [];
    return [{ kind: 'rest', label: 'Rest', section: ctx.section,
              stepIndex: ctx.stepIndex, itemIndex: ctx.itemIndex || null,
              exerciseId: null, exerciseName: null, measure: null, amount: null, weight: null,
              setIndex: null, setCount: null, round: ctx.round || null, rounds: ctx.rounds || null,
              side: null, restKind: restKind, durationSec: tap ? null : rest.seconds, tap: tap }];
}

/**
 * Workout doc → ordered phases. Opts: { getReadySec (0 = no get-ready phase), allTap (self-paced: every exercise waits for Done) }.
 * Rests that would come after the very last exercise are dropped.
 */
function woBuildTimeline(workout, opts) {
    opts = opts || {};
    var getReady = opts.getReadySec != null ? opts.getReadySec : WO_GETREADY_SEC;
    var phases = [];

    (workout.steps || []).forEach(function(step, si) {
        var section = step.section || 'main';

        if (step.type === 'exercise') {
            var sets = step.sets || [];
            sets.forEach(function(set, k) {
                var ctx = { section: section, stepIndex: si, itemIndex: null, setIndex: k, setCount: sets.length, round: null, rounds: null, allTap: !!opts.allTap };
                phases = phases.concat(_woSetPhases(step, set, ctx));
                if (k < sets.length - 1) phases = phases.concat(_woRestPhase(step.restBetweenSets, 'sets', ctx));
            });
            phases = phases.concat(_woRestPhase(step.restAfter, 'after', { section: section, stepIndex: si }));

        } else if (step.type === 'circuit') {
            var items = step.items || [], rounds = step.rounds || 1;
            for (var r = 1; r <= rounds; r++) {
                items.forEach(function(it, ij) {
                    var set = (it.sets && it.sets[0]) || { amount: null, weight: null };
                    var ctx = { section: section, stepIndex: si, itemIndex: ij, setIndex: r - 1, setCount: rounds, round: r, rounds: rounds, allTap: !!opts.allTap };
                    phases = phases.concat(_woSetPhases(it, set, ctx));
                    if (ij < items.length - 1) phases = phases.concat(_woRestPhase(step.restBetweenItems, 'items', ctx));
                });
                if (r < rounds) phases = phases.concat(_woRestPhase(step.restBetweenRounds, 'rounds', { section: section, stepIndex: si, round: r, rounds: rounds }));
            }
            phases = phases.concat(_woRestPhase(step.restAfter, 'after', { section: section, stepIndex: si }));
        }
    });

    // No point resting after the final exercise
    while (phases.length && phases[phases.length - 1].kind !== 'work') phases.pop();

    if (phases.length && getReady > 0) {
        phases.unshift({ kind: 'getready', label: 'Get ready', section: phases[0].section,
                         stepIndex: 0, itemIndex: null, exerciseId: null, exerciseName: null, measure: null,
                         amount: null, weight: null, setIndex: null, setCount: null, round: null, rounds: null,
                         side: null, restKind: null, durationSec: getReady, tap: false });
    }
    return phases;
}

/** The next work phase after index i (what the "UP NEXT" display shows during rests). */
function woNextWork(phases, i) {
    for (var k = i + 1; k < phases.length; k++) if (phases[k].kind === 'work') return phases[k];
    return null;
}

/** Seconds a phase is expected to take (display only; tap phases use the same rough figures as the builder). */
function woPhaseEstimateSec(p) {
    if (p.durationSec != null) return p.durationSec;
    if (p.kind === 'work') return (p.measure === 'time' ? (p.amount || 30) : (p.amount || 10) * WO_SECONDS_PER_REP);
    return WO_TAP_REST_ASSUMED;
}

/** One line per phase — for console checks and debugging. */
function woTimelineSummary(phases) {
    return phases.map(function(p, i) {
        var bits = [i + ':' + p.kind];
        if (p.kind === 'work') {
            bits.push(p.exerciseName + (p.side ? ' (' + p.side + ')' : ''));
            bits.push((p.round ? 'round ' + p.round + '/' + p.rounds : 'set ' + (p.setIndex + 1) + '/' + p.setCount));
            bits.push(p.measure === 'time' ? p.amount + 's' : p.amount + ' reps' + (p.weight != null ? ' @' + p.weight : ''));
        } else if (p.kind === 'rest') {
            bits.push(p.restKind);
        }
        bits.push(p.durationSec != null ? p.durationSec + 's' : 'TAP');
        return bits.join(' ');
    });
}

// ─── 2. Runner (the clock) ────────────────────────────────────────────────────
//
// States: 'idle' → 'running' ⇄ 'paused' → 'done'
// A timed phase stores WHEN it ends (phaseEndsAt), not a ticking counter, so a paused tab,
// a throttled background timer or a screen flicker can never make the clock drift.
// A tap phase (reps exercise / "tap when ready" rest) just waits: remainingMs stays null.
//
// cb = { onPhase(phase, index), onTick(info), onDone(results) }  — all optional
// opts = { now: function() → ms }   (injectable so tests can fake time)

function woCreateRunner(phases, cb, opts) {
    cb = cb || {};
    var now = (opts && opts.now) || function() { return Date.now(); };

    var R = {
        phases: phases,
        index: -1,
        state: 'idle',
        phaseEndsAt: null,     // ms timestamp, timed phases while running
        remainingMs: null,     // ms left, timed phases while paused
        startedAt: null,
        pausedAt: null,
        pausedTotalMs: 0,
        results: []            // one per work phase visited: {index, status:'done'|'skipped', doneAt}
    };

    function phase() { return R.phases[R.index] || null; }

    function enter(i) {
        R.index = i;
        var p = phase();
        if (!p) return finish();
        if (p.durationSec != null) { R.phaseEndsAt = now() + p.durationSec * 1000; R.remainingMs = null; }
        else                       { R.phaseEndsAt = null; R.remainingMs = null; }
        if (cb.onPhase) cb.onPhase(p, i);
        emitTick();
    }

    function finish() {
        R.state = 'done';
        R.phaseEndsAt = null;
        if (cb.onDone) cb.onDone(R.results);
    }

    /** Records how a work phase ended, replacing any earlier result for the same phase (after Back). */
    function record(status, actual) {
        var p = phase();
        if (!p || p.kind !== 'work') return;
        R.results = R.results.filter(function(r) { return r.index !== R.index; });
        var res = { index: R.index, status: status, doneAt: now() };
        if (actual) res.actual = actual;      // {amount, weight} the user entered before tapping Done (self-paced)
        R.results.push(res);
    }

    function advance(status, actual) {
        record(status, actual);
        if (R.index + 1 >= R.phases.length) return finish();
        enter(R.index + 1);
    }

    function secondsLeft() {
        var p = phase();
        if (!p || p.durationSec == null) return null;
        if (R.state === 'paused') return Math.ceil(R.remainingMs / 1000);
        return Math.max(0, Math.ceil((R.phaseEndsAt - now()) / 1000));
    }

    function emitTick() {
        if (!cb.onTick) return;
        cb.onTick({ index: R.index, phase: phase(), secondsLeft: secondsLeft(), state: R.state });
    }

    // ----- controls -----

    R.start = function() {
        if (R.state !== 'idle' || !R.phases.length) return;
        R.state = 'running';
        R.startedAt = now();
        enter(0);
    };

    /** Call regularly (the screens use a ~200 ms interval). Advances when a timed phase runs out. */
    R.tick = function() {
        if (R.state !== 'running') return;
        var p = phase();
        if (p && p.durationSec != null && now() >= R.phaseEndsAt) advance('done');
        else emitTick();
    };

    R.pause = function() {
        if (R.state !== 'running') return;
        var p = phase();
        R.state = 'paused';
        R.pausedAt = now();
        if (p && p.durationSec != null) R.remainingMs = Math.max(0, R.phaseEndsAt - now());
        emitTick();
    };

    R.resume = function() {
        if (R.state !== 'paused') return;
        var p = phase();
        R.pausedTotalMs += now() - R.pausedAt;
        R.pausedAt = null;
        R.state = 'running';
        if (p && p.durationSec != null) { R.phaseEndsAt = now() + R.remainingMs; R.remainingMs = null; }
        emitTick();
    };

    /** "Done" — finishes a reps set / tap rest, or ends a timed phase early. Counts as completed. */
    R.done = function(actual) {
        if (R.state === 'paused') R.resume();
        if (R.state !== 'running') return;
        advance('done', actual);
    };

    /** "Skip" — moves on; a skipped work phase is logged as skipped. */
    R.skip = function() {
        if (R.state === 'paused') R.resume();
        if (R.state !== 'running') return;
        advance('skipped');
    };

    /** Back one phase (re-runs it from the start). From the first phase it restarts that phase. */
    R.back = function() {
        if (R.state === 'paused') R.resume();
        if (R.state !== 'running') return;
        enter(Math.max(0, R.index - 1));
    };

    /** Adds seconds to the current timed phase (the "+15 s" button / "more time"). */
    R.addTime = function(sec) {
        var p = phase();
        if (!p || p.durationSec == null || R.state === 'done' || R.state === 'idle') return;
        if (R.state === 'paused') R.remainingMs += sec * 1000;
        else                      R.phaseEndsAt += sec * 1000;
        emitTick();
    };

    /** Finish the whole workout now (the "End workout" command). Unvisited work is not logged. */
    R.end = function() {
        if (R.state === 'done' || R.state === 'idle') return;
        finish();
    };

    // ----- read-only helpers for the screens -----

    R.current      = phase;
    R.secondsLeft  = secondsLeft;
    R.nextWork     = function() { return woNextWork(R.phases, R.index); };
    R.elapsedMs    = function() {
        if (R.startedAt == null) return 0;
        var end = R.state === 'paused' ? R.pausedAt : now();
        return Math.max(0, end - R.startedAt - R.pausedTotalMs);
    };
    /** Rough seconds still to go (timed phases use their clock, tap phases a typical figure). */
    R.remainingEstimateSec = function() {
        var total = 0;
        for (var i = Math.max(R.index, 0); i < R.phases.length; i++) {
            if (i === R.index && R.state !== 'idle') {
                var left = secondsLeft();
                total += left != null ? left : woPhaseEstimateSec(R.phases[i]);
            } else {
                total += woPhaseEstimateSec(R.phases[i]);
            }
        }
        return total;
    };
    R.workPhaseCount = function() { return R.phases.filter(function(p) { return p.kind === 'work'; }).length; };

    return R;
}

// ─── 3. Start screen (#workout-start/:id) ─────────────────────────────────────
//
// Pre-flight: pick the date and mode, tweak numbers for THIS session only (optionally
// saving them back), choose voice options. "Start" hands a ready-to-run session to the
// guided player through window._woSession and opens #workout-run.

var _woS = null;   // {id, original, workout, date, voiceCues, voiceCmds, saveBack}

/** Browser speech recognition constructor, or null when unsupported (e.g. iPhone Safari). */
function woSpeechRecognitionCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function _woLoadPlayerPrefs() {
    var p = { cues: true, commands: true };
    try { var s = JSON.parse(localStorage.getItem('woPlayerPrefs') || 'null'); if (s) { p.cues = s.cues !== false; p.commands = s.commands !== false; } } catch (e) {}
    return p;
}

function _woSavePlayerPrefs(cues, commands) {
    try { localStorage.setItem('woPlayerPrefs', JSON.stringify({ cues: cues, commands: commands })); } catch (e) {}
}

function _woTodayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** "3×12 @ 25 lb" or "10 @ 25 / 5 @ 45 / 3 @ 60 lb" from the done set lines of one exercise. */
function woFmtLastSets(lines) {
    if (!lines.length) return '';
    var timed = lines[0].measure === 'time', unit = timed ? ' sec' : '';
    var uniform = lines.every(function(l) { return l.actualAmount === lines[0].actualAmount && l.actualWeight === lines[0].actualWeight; });
    var w = function(l) { return l.actualWeight != null ? ' @ ' + l.actualWeight + ' lb' : ''; };
    if (uniform) return lines.length + '×' + lines[0].actualAmount + unit + w(lines[0]);
    return lines.map(function(l) { return l.actualAmount + (l.actualWeight != null ? ' @ ' + l.actualWeight : ''); }).join(' / ') + (timed ? ' sec' : (lines.some(function(l) { return l.actualWeight != null; }) ? ' lb' : ' reps'));
}

/** exerciseId → {date, text} from the most recent finished workout that included it (any workout). */
async function _woLastTimeMap(steps) {
    var want = {};
    _woFlatExercises(steps).forEach(function(st) { want[st.exerciseId] = true; });
    var snap = await userCol('workoutSessions').get();
    var sessions = snap.docs.map(function(d) { return d.data(); });
    sessions.sort(function(a, b) { return (b.date || '').localeCompare(a.date || '') || (b.startedAt || '').localeCompare(a.startedAt || ''); });
    var out = {};
    sessions.forEach(function(sess) {
        Object.keys(want).forEach(function(exId) {
            if (out[exId]) return;
            // a left/right pair counts as one set — keep the left (or only) line
            var lines = (sess.sets || []).filter(function(l) {
                return l.exerciseId === exId && !l.skipped && l.actualAmount != null && l.side !== 'right';
            });
            if (lines.length) out[exId] = { date: sess.date, text: woFmtLastSets(lines) };
        });
    });
    return out;
}

function _woLastTimeHtml(exerciseId) {
    var l = _woS && _woS.last && _woS.last[exerciseId];
    if (!l) return '';
    var p = l.date.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return '<div class="wo-lasttime">Last time: ' + _woEsc(l.text) + ' · ' + _woEsc(d) + '</div>';
}

async function loadWorkoutStartPage(id) {
    var el = document.getElementById('page-workout-start');
    _woSetChrome([['Workouts', '#workouts'], ['Start']]);
    el.innerHTML = '<div class="page-header"><h2>Start workout</h2></div><div class="ex-status">Loading…</div>';
    try {
        await woLoadMuscles();
        await woLoadExercises();
        var doc = await woLibCol('workouts').doc(id).get();
        if (!doc.exists) { el.innerHTML = '<div class="ex-status">Workout not found.</div>'; return; }
        var w = doc.data(); w.id = doc.id;
        w.steps = _woCleanSteps(w.steps);
        woSyncSideModes(w.steps);                 // pick up any change made to an exercise's side setting
        var last = await _woLastTimeMap(w.steps);
        var prefs = _woLoadPlayerPrefs();
        _woS = { last: last, id: w.id, original: JSON.parse(JSON.stringify(w)), workout: w,
                 date: _woTodayISO(), voiceCues: prefs.cues, voiceCmds: prefs.commands && !!woSpeechRecognitionCtor(),
                 saveBack: false };
        await woProgInitStart();                 // streaks, level-up offers, welcome-back (workout-progress.js)
    } catch (err) {
        console.error('Workouts: failed to load workout for start:', err);
        el.innerHTML = '<div class="ex-status">Could not load this workout.</div>';
        return;
    }
    _woRenderStartPage();
}

function _woStartUnit(st) { return st.measure === 'time' ? 'sec' : 'reps'; }

function _woRenderStartPage() {
    var s = _woS, w = s.workout, el = document.getElementById('page-workout-start');
    var canListen = !!woSpeechRecognitionCtor();

    var stepsHtml = w.steps.map(function(st, i) {
        if (st.type === 'circuit') {
            return '<div class="wo-step wo-circuit" data-path="' + i + '">' +
                '<div class="wo-step-head"><span class="wo-step-num">' + (i + 1) + '</span><span class="wo-step-name">Circuit</span>' +
                '<span class="wo-circuit-rounds"><input type="number" min="1" max="20" data-f="rounds" value="' + (st.rounds || 1) + '"> rounds</span></div>' +
                (st.items || []).map(function(it, j) {
                    var s0 = (it.sets && it.sets[0]) || {};
                    return '<div class="wo-item" data-path="' + i + '.' + j + '"><span class="wo-item-name">' + _woEsc(it.exerciseName) + '</span><button type="button" class="wo-frame-btn wo-view-step" data-view-ex="' + it.exerciseId + '" title="View this exercise">👁</button>' + _woLastTimeHtml(it.exerciseId) +
                        '<span class="wo-item-sets"><input type="number" min="1" data-f="amount" data-k="0" value="' + (s0.amount != null ? s0.amount : '') + '"> ' + _woStartUnit(it) +
                        (it.usesWeight ? ' @ <input type="number" min="0" step="0.5" data-f="weight" data-k="0" value="' + (s0.weight != null ? s0.weight : '') + '"> lb' : '') + '</span></div>' +
                        woProgStepHtml(it, i + '.' + j);
                }).join('') + '</div>';
        }
        return '<div class="wo-step" data-path="' + i + '">' +
            '<div class="wo-step-head"><span class="wo-step-num">' + (i + 1) + '</span><span class="wo-step-name">' + _woEsc(st.exerciseName) + '</span>' +
            _woSideBadge(st) + '<button type="button" class="wo-frame-btn wo-view-step" data-view-ex="' + st.exerciseId + '" title="View this exercise">👁</button></div>' +
            _woLastTimeHtml(st.exerciseId) +
            woProgStepHtml(st, String(i)) +
            '<div class="wo-step-sets wo-step-sets--custom">' +
            (st.sets || []).map(function(set, k) {
                return '<div class="wo-set-row"><span class="wo-set-label">Set ' + (k + 1) + '</span>' +
                    '<input type="number" min="1" data-f="amount" data-k="' + k + '" value="' + (set.amount != null ? set.amount : '') + '"> ' + _woStartUnit(st) +
                    (st.usesWeight ? ' @ <input type="number" min="0" step="0.5" data-f="weight" data-k="' + k + '" value="' + (set.weight != null ? set.weight : '') + '"> lb' : '') + '</div>';
            }).join('') + '</div></div>';
    }).join('');

    el.innerHTML =
        '<div class="page-header"><h2>' + _woEsc(w.name) + '</h2></div>' +
        '<div class="ex-form">' +
            '<div class="wo-banner" id="wosEstimate"></div>' +
            woProgBannerHtml() +

            '<div class="ex-form-group"><label class="ex-label" for="wosDate">Date</label>' +
                '<input type="date" id="wosDate" value="' + s.date + '" max="' + _woTodayISO() + '"></div>' +

            '<div class="ex-form-group"><label class="ex-label">How do you want to do it?</label>' +
                '<div class="wo-mode-list">' +
                    '<label class="wo-mode"><input type="radio" name="wosMode" value="guided" checked> <span><strong>🎬 Guided</strong><br><span class="wo-hint">Prop up your phone — it counts down each exercise and rest and shows what is next.</span></span></label>' +
                    '<label class="wo-mode"><input type="radio" name="wosMode" value="self"> <span><strong>✅ Self-paced</strong><br><span class="wo-hint">You do each set at your own speed and tap Done — rests still count down. You can fix the reps and weight as you go.</span></span></label>' +
                    '<label class="wo-mode"><input type="radio" name="wosMode" value="day"> <span><strong>🌤️ Throughout the day</strong><br><span class="wo-hint">Do your sets whenever you like and tick them off — from any device. Finish when you are done.</span></span></label>' +
                '</div></div>' +

            '<div class="ex-form-group"><label class="ex-label">Voice</label>' +
                '<label class="wo-inline-check"><input type="checkbox" id="wosCues"' + (s.voiceCues ? ' checked' : '') + '> Speak the exercise names and countdowns</label><br>' +
                '<label class="wo-inline-check"><input type="checkbox" id="wosCmds"' + (s.voiceCmds ? ' checked' : '') + (canListen ? '' : ' disabled') + '> Voice commands — say “done”, “next”, “pause”…</label>' +
                (canListen ? '' : '<div class="wo-hint">Voice commands need Chrome (not available in this browser). Tapping always works.</div>') +
            '</div>' +

            '<div class="ex-form-group"><label class="ex-label">Today\'s numbers <span class="wo-hint">change anything for this session only</span></label>' +
                '<div id="wosSteps">' + stepsHtml + '</div>' +
                '<label class="wo-inline-check" style="margin-top:8px;"><input type="checkbox" id="wosSaveBack"> Save these changes back to the workout</label>' +
            '</div>' +

            '<div class="ex-form-actions">' +
                '<button type="button" class="btn btn-primary" id="wosGo">▶ Start workout</button>' +
                '<button type="button" class="btn btn-secondary" id="wosSchedule">📅 Schedule</button>' +
                '<a href="#workouts" class="btn btn-secondary">Cancel</a>' +
            '</div>' +
        '</div>';

    document.getElementById('wosDate').addEventListener('change', function() { _woS.date = this.value || _woTodayISO(); });
    document.getElementById('wosCues').addEventListener('change', function() { _woS.voiceCues = this.checked; });
    document.getElementById('wosCmds').addEventListener('change', function() { _woS.voiceCmds = this.checked; });
    document.getElementById('wosSaveBack').addEventListener('change', function() { _woS.saveBack = this.checked; });
    var box = document.getElementById('wosSteps');
    box.addEventListener('input',  _woStartInput);
    box.addEventListener('change', _woStartInput);
    box.addEventListener('click', function(ev) {
        var v = ev.target.closest('[data-view-ex]');
        if (v) woViewExercise(v.getAttribute('data-view-ex'));
    });
    document.getElementById('wosGo').addEventListener('click', _woStartGo);
    document.getElementById('wosSchedule').addEventListener('click', function() { woOpenScheduleDialog(_woS.id, _woS.workout.name); });
    el.removeEventListener('click', woProgHandleClick);
    el.addEventListener('click', woProgHandleClick);   // level-up / reset buttons and Welcome-back choices
    _woUpdateStartEstimate();
}

/** Typing in a number box edits the session copy of the workout (never the saved workout until Start + save-back). */
function _woStartInput(ev) {
    var inp = ev.target.closest('[data-f]');
    if (!inp) return;
    var holder = inp.closest('[data-path]');
    if (!holder) return;
    var path = holder.getAttribute('data-path').split('.');
    var st = _woS.workout.steps[parseInt(path[0], 10)];
    if (path.length > 1) st = (st.items || [])[parseInt(path[1], 10)];
    if (!st) return;
    var f = inp.getAttribute('data-f');
    if (f === 'rounds') { st.rounds = Math.max(1, Math.min(20, parseInt(inp.value, 10) || 1)); }
    else {
        var set = (st.sets || [])[parseInt(inp.getAttribute('data-k'), 10)];
        if (!set) return;
        if (f === 'amount') { var a = parseInt(inp.value, 10); set.amount = isNaN(a) ? null : a; }
        else                { set.weight = inp.value !== '' ? parseFloat(inp.value) : null; }
    }
    _woUpdateStartEstimate();
}

function _woUpdateStartEstimate() {
    var el = document.getElementById('wosEstimate');
    if (!el) return;
    var secs = woEstimateSeconds(_woS.workout.steps) + WO_GETREADY_SEC;
    var flat = _woFlatExercises(_woS.workout.steps).length;
    el.textContent = flat + ' exercise' + (flat === 1 ? '' : 's') + ' · about ' + woFmtMinutes(secs);
}

/** Did the user change any numbers compared to the saved workout? */
function _woStartChanged() {
    return JSON.stringify(_woS.workout.steps) !== JSON.stringify(_woS.original.steps);
}

/** Copy with Base = the edited numbers for every step that changed (same rule as the builder). */
function _woStepsWithSavedChanges() {
    var out = JSON.parse(JSON.stringify(_woS.workout.steps));
    out.forEach(function(st, i) {
        var orig = _woS.original.steps[i];
        var reset = function(a, b) {
            if (JSON.stringify(a.sets) !== JSON.stringify(b.sets)) { a.baseSets = _woCloneSets(a.sets); a.successStreak = 0; }
        };
        if (st.type === 'circuit') {
            (st.items || []).forEach(function(it, j) { reset(it, orig.items[j]); });
        } else {
            reset(st, orig);
        }
    });
    return out;
}

async function _woStartGo() {
    var s = _woS, btn = document.getElementById('wosGo');
    _woSavePlayerPrefs(s.voiceCues, s.voiceCmds || (_woLoadPlayerPrefs().commands && !woSpeechRecognitionCtor()));
    btn.disabled = true; btn.textContent = 'Starting…';
    try {
        var steps = s.workout.steps;
        if (s.prog && s.prog.welcome && s.prog.choice !== 'current') await _woProgPersist();   // Comeback / Base choices stick
        if (s.saveBack && _woStartChanged()) {
            steps = _woStepsWithSavedChanges();
            var ids = [];
            _woFlatExercises(steps).forEach(function(st) { if (st.exerciseId && ids.indexOf(st.exerciseId) === -1) ids.push(st.exerciseId); });
            await woLibCol('workouts').doc(s.id).update({
                steps: steps, exerciseIds: ids, estimatedSeconds: woEstimateSeconds(steps),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        var chosen = (document.querySelector('input[name=wosMode]:checked') || {}).value;
        if (chosen === 'day') {                       // Throughout the day: open a checklist record instead of running the player
            var dayId = await woStartDaySession({ workoutId: s.id, workoutName: s.workout.name, date: s.date,
                                                  workout: { id: s.id, name: s.workout.name, steps: JSON.parse(JSON.stringify(s.workout.steps)) } });
            location.hash = '#workout-day/' + dayId;
            return;
        }
        window._woSession = {
            workoutId:   s.id,
            workoutName: s.workout.name,
            workout:     { id: s.id, name: s.workout.name, steps: JSON.parse(JSON.stringify(s.workout.steps)) },
            date:        s.date,
            mode:        (document.querySelector('input[name=wosMode]:checked') || {}).value === 'self' ? 'self' : 'guided',
            voiceCues:   s.voiceCues,
            voiceCmds:   s.voiceCmds
        };
        location.hash = '#workout-run';
    } catch (err) {
        console.error('Workouts: could not start:', err);
        alert('Could not start the workout. Please try again.');
        btn.disabled = false; btn.textContent = '▶ Start workout';
    }
}

// ─── 4. Guided player screen (#workout-run) ───────────────────────────────────
//
// Big, high-contrast screen meant to be read from across the room. The colour of the whole
// screen tells you the phase at a glance (teal = work, blue = rest, amber = get ready,
// purple = switch sides). One full render per phase; the countdown ring/seconds update in place.
//
// Hooks for later chunks (voice, wake lock) — each is called only if defined:
//   woVoiceOnPhase(phase, index, ctx)   woVoiceOnTick(info, ctx)   woVoiceOnEnd(ctx)

var WO_RING_R = 90;
var WO_RING_C = 2 * Math.PI * WO_RING_R;

var _woP = null;   // {session, phases, runner, frames:{exId:[dataUrl]}, tickTimer, flipTimer, keyHandler, hashHandler, finished}

async function loadWorkoutRunPage() {
    var el = document.getElementById('page-workout-run');
    var sess = window._woSession;
    _woPlayerDestroy();
    if (!sess || !sess.workout) { location.hash = '#workouts'; return; }
    _woSetChrome([['Workouts', '#workouts'], [sess.workoutName]]);
    document.body.classList.add('wo-playing');   // hides the app's top banners while the player is full-screen

    var phases = woBuildTimeline(sess.workout, sess.mode === 'self' ? { getReadySec: 0, allTap: true } : {});
    if (!phases.length) {
        el.innerHTML = '<div class="page-header"><h2>' + _woEsc(sess.workoutName) + '</h2></div><div class="ex-status">This workout has no exercises to run.</div>';
        return;
    }
    el.innerHTML = '<div class="page-header"><h2>' + _woEsc(sess.workoutName) + '</h2></div><div class="ex-status">Getting ready…</div>';

    _woP = { session: sess, phases: phases, runner: null, frames: {}, tickTimer: null, flipTimer: null,
             keyHandler: null, hashHandler: null, finished: null };
    try { await _woPlayerLoadFrames(); } catch (err) { console.error('Workouts: could not load frames for player:', err); }
    if (!_woP) return;   // user left while loading

    _woP.runner = woCreateRunner(phases, {
        onPhase: _woPlayerOnPhase,
        onTick:  _woPlayerOnTick,
        onDone:  _woPlayerOnDone
    });

    _woP.tickTimer = setInterval(function() { if (_woP && _woP.runner) _woP.runner.tick(); }, 200);
    _woP.flipTimer = setInterval(_woPlayerFlip, WO_FLIP_MS);

    _woP.keyHandler = function(ev) {
        if (!_woP || !_woP.runner || _woP.runner.state === 'done') return;
        var tag = (ev.target && ev.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (ev.key === ' ')          { ev.preventDefault(); _woPlayerTogglePause(); }
        else if (ev.key === 'ArrowRight') _woP.runner.skip();
        else if (ev.key === 'ArrowLeft')  _woP.runner.back();
        else if (ev.key === 'Enter') _woP.runner.done();
    };
    document.addEventListener('keydown', _woP.keyHandler);

    // Leaving the page (any navigation) stops the player cleanly
    _woP.hashHandler = function() { if (location.hash.indexOf('#workout-run') !== 0) _woPlayerDestroy(); };
    window.addEventListener('hashchange', _woP.hashHandler);

    _woP.runner.start();
}

function _woPlayerDestroy() {
    document.body.classList.remove('wo-playing');
    if (!_woP) return;
    clearInterval(_woP.tickTimer);
    clearInterval(_woP.flipTimer);
    if (_woP.keyHandler)  document.removeEventListener('keydown', _woP.keyHandler);
    if (_woP.hashHandler) window.removeEventListener('hashchange', _woP.hashHandler);
    if (typeof woVoiceOnEnd === 'function') { try { woVoiceOnEnd(_woP); } catch (e) {} }
    _woP = null;
}

/** All exercise frames for the exercises in this workout, one query. */
async function _woPlayerLoadFrames() {
    var ids = {};
    _woFlatExercises(_woP.session.workout.steps).forEach(function(st) { ids[st.exerciseId] = true; });
    var snap = await woLibCol('photos').where('targetType', '==', 'workoutExercise').get();
    var byEx = {};
    snap.docs.forEach(function(d) {
        var p = d.data();
        if (!ids[p.targetId]) return;
        (byEx[p.targetId] = byEx[p.targetId] || []).push({ order: p.frameOrder || 0, data: p.imageData });
    });
    Object.keys(byEx).forEach(function(k) {
        byEx[k].sort(function(a, b) { return a.order - b.order; });
        _woP.frames[k] = byEx[k].map(function(f) { return f.data; });
    });
}

/** One <img> (or the 🤸 placeholder) that the flip timer cycles through the exercise's frames. */
function _woFlipHtml(exerciseId, cls) {
    var fr = _woP.frames[exerciseId];
    if (!fr || !fr.length) return '<div class="wo-flip-ph ' + cls + '">🤸</div>';
    return '<img class="wo-flipbook ' + cls + '" data-ex="' + exerciseId + '" data-i="0" src="' + fr[0] + '" alt="">';
}

function _woPlayerFlip() {
    if (!_woP) return;
    document.querySelectorAll('#page-workout-run img.wo-flipbook').forEach(function(img) {
        var fr = _woP.frames[img.getAttribute('data-ex')];
        if (!fr || fr.length < 2) return;
        var i = (parseInt(img.getAttribute('data-i'), 10) + 1) % fr.length;
        img.setAttribute('data-i', i);
        img.src = fr[i];
    });
}

// ----- text helpers -----

function _woFmtClock(sec) {
    if (sec == null) return '';
    if (sec >= 60) return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    return String(sec);
}

/** "Set 2 of 3" / "Round 2 of 4" */
function _woSetText(p) {
    if (p.round) return 'Round ' + p.round + ' of ' + p.rounds;
    return p.setCount > 1 ? 'Set ' + (p.setIndex + 1) + ' of ' + p.setCount : '';
}

/** "5 reps @ 45 lb" / "30 sec" */
function _woWorkText(p) { return woFmtAmount(p.measure, p.amount, p.weight); }

function _woSideText(p) { return p.side === 'left' ? 'Left side' : (p.side === 'right' ? 'Right side' : ''); }

function _woSectionLabel(sec) {
    var s = WO_SECTIONS.filter(function(x) { return x.id === sec; })[0];
    return s ? s.label : '';
}

// ----- rendering -----

function _woPlayerOnPhase(p, index) {
    _woPlayerRender();
    if (typeof woVoiceOnPhase === 'function') { try { woVoiceOnPhase(p, index, _woP); } catch (e) { console.error(e); } }
}

function _woPlayerOnTick(info) {
    if (!_woP) return;
    _woPlayerUpdateLive(info);
    if (typeof woVoiceOnTick === 'function') { try { woVoiceOnTick(info, _woP); } catch (e) { console.error(e); } }
}

function _woPlayerRender() {
    if (!_woP || !_woP.runner) return;
    var R = _woP.runner, p = R.current(), el = document.getElementById('page-workout-run');
    if (!p) return;
    var next = R.nextWork();
    var tap  = p.durationSec == null;
    var secs = R.secondsLeft();
    var title, sub = '', center = '';

    // Which phase colour/title
    var cls = 'wo-player--' + p.kind;
    if (p.kind === 'getready') title = 'GET READY';
    else if (p.kind === 'switch') title = 'SWITCH SIDES';
    else if (p.kind === 'rest') title = tap ? 'REST — TAP WHEN READY' : 'REST';
    else title = _woEsc(p.exerciseName);

    if (p.kind === 'work') {
        var bits = [_woSetText(p), _woSideText(p), p.sideMode === 'alternate' ? '↔ alternate sides' : ''].filter(Boolean);
        sub = bits.join(' · ');   // reps/weight are shown big in the centre for tap phases
    }

    // The centre: a countdown ring for timed phases, a big number for reps, a tap prompt for tap rests
    var ring =
        '<div class="wo-ring">' +
            '<svg viewBox="0 0 200 200"><circle class="wo-ring-bg" cx="100" cy="100" r="' + WO_RING_R + '"></circle>' +
            '<circle class="wo-ring-fg" id="woRingFg" cx="100" cy="100" r="' + WO_RING_R + '" stroke-dasharray="' + WO_RING_C + '" stroke-dashoffset="0"></circle></svg>' +
            '<div class="wo-ring-text" id="woRingText">' + _woFmtClock(secs) + '</div>' +
        '</div>';
    var selfMode = _woP.session.mode === 'self';
    if (p.kind === 'work' && tap) {
        var unit = p.measure === 'time' ? 'sec' : 'reps';
        center = '<div class="wo-ring wo-ring--reps"><div class="wo-ring-text">' + p.amount + '<span class="wo-ring-unit">' + unit + '</span>' +
                 (p.weight != null ? '<span class="wo-ring-weight">@ ' + p.weight + ' lb</span>' : '') + '</div></div>' +
                 (selfMode ? '<div class="wo-adjust">Did: <input type="number" min="0" id="woActAmt" value="' + p.amount + '"> ' + unit +
                             (p.weight != null ? ' @ <input type="number" min="0" step="0.5" id="woActWt" value="' + p.weight + '"> lb' : '') + '</div>' : '') +
                 '<button type="button" class="wo-bigbtn" id="woDone">✓ DONE</button>' +
                 (selfMode ? '<div class="wo-tap-hint">change the numbers above if you did something different · say “done”</div>'
                           : '<div class="wo-tap-hint">or tap anywhere · say “done”</div>');
    } else if (p.kind === 'rest' && tap) {
        center = '<div class="wo-ring wo-ring--reps"><div class="wo-ring-text wo-ring-text--sm">Rest</div></div>' +
                 '<button type="button" class="wo-bigbtn" id="woDone">I’M READY</button><div class="wo-tap-hint">or tap anywhere · say “ready”</div>';
    } else {
        center = ring;
    }

    // UP NEXT (rest / switch / get-ready screens)
    var upnext = '';
    if (p.kind !== 'work' && next) {
        var nb = [_woSetText(next), _woSideText(next), _woWorkText(next)].filter(Boolean).join(' · ');
        upnext = '<div class="wo-upnext"><div class="wo-upnext-media">' + _woFlipHtml(next.exerciseId, 'wo-upnext-img') + '</div>' +
                 '<div><div class="wo-upnext-label">UP NEXT</div><div class="wo-upnext-name">' + _woEsc(next.exerciseName) + '</div>' +
                 '<div class="wo-upnext-meta">' + _woEsc(nb) + '</div></div></div>';
    }

    var showSection = p.section && p.section !== 'main';
    var media = p.kind === 'work' ? '<div class="wo-player-media">' + _woFlipHtml(p.exerciseId, 'wo-hero-img') + '</div>'
              : (p.kind === 'switch' && p.exerciseId ? '<div class="wo-player-media">' + _woFlipHtml(p.exerciseId, 'wo-hero-img') + '</div>' : '');

    el.innerHTML =
        '<div class="wo-player ' + cls + '" id="woPlayer">' +
            '<div class="wo-player-top">' +
                '<span class="wo-player-name">' + _woEsc(_woP.session.workoutName) + (showSection ? ' · ' + _woSectionLabel(p.section) : '') + '</span>' +
                '<span class="wo-player-left" id="woTimeLeft"></span>' +
                (typeof woCommandsButtonHtml === 'function' ? woCommandsButtonHtml(_woP) : '') +
                '<button type="button" class="wo-end-btn" id="woMute" title="Spoken cues on/off">' + (_woP.session.voiceCues ? '🔊' : '🔇') + '</button>' +
                '<button type="button" class="wo-end-btn" id="woEnd" title="End workout">✕ End</button>' +
            '</div>' +
            '<div class="wo-progress"><div class="wo-progress-bar" id="woProgress"></div></div>' +
            '<div class="wo-player-main" id="woMain">' +
                media +
                '<div class="wo-player-info">' +
                    '<div class="wo-phase-title">' + title + '</div>' +
                    (sub ? '<div class="wo-phase-sub">' + _woEsc(sub) + '</div>' : '') +
                    center +
                    upnext +
                '</div>' +
            '</div>' +
            '<div class="wo-controls">' +
                '<button type="button" class="wo-ctl" id="woBack" title="Back">⏮</button>' +
                '<button type="button" class="wo-ctl wo-ctl--main" id="woPause" title="Pause / resume">⏸</button>' +
                '<button type="button" class="wo-ctl" id="woSkip" title="Skip">⏭</button>' +
                (tap ? '' : '<button type="button" class="wo-ctl wo-ctl--txt" id="woPlus" title="Add 15 seconds">+15s</button>') +
            '</div>' +
            '<div class="wo-paused hidden" id="woPaused">⏸ PAUSED<br><span>tap ▶ to continue</span></div>' +
        '</div>';

    document.getElementById('woBack').addEventListener('click', function() { R.back(); });
    document.getElementById('woSkip').addEventListener('click', function() { R.skip(); });
    document.getElementById('woPause').addEventListener('click', _woPlayerTogglePause);
    var plus = document.getElementById('woPlus'); if (plus) plus.addEventListener('click', function() { R.addTime(15); });
    document.getElementById('woEnd').addEventListener('click', _woPlayerEndClicked);
    if (typeof woCommandsBindUi === 'function') woCommandsBindUi();
    document.getElementById('woMute').addEventListener('click', function() {
        _woP.session.voiceCues = !_woP.session.voiceCues;
        this.textContent = _woP.session.voiceCues ? '🔊' : '🔇';
        if (!_woP.session.voiceCues && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    });
    var doneBtn = document.getElementById('woDone');
    if (doneBtn) doneBtn.addEventListener('click', function(ev) {
        ev.stopPropagation();
        var amt = document.getElementById('woActAmt'), wt = document.getElementById('woActWt');
        var actual = null;
        if (amt) {      // self-paced: whatever is in the boxes is what you did
            var a = parseFloat(amt.value), w = wt ? parseFloat(wt.value) : NaN;
            actual = { amount: isNaN(a) ? null : a, weight: isNaN(w) ? null : w };
        }
        R.done(actual);
    });
    // Guided: tap anywhere = Done. Self-paced has number boxes on screen, so only the DONE button counts.
    if (tap && !selfMode) document.getElementById('woMain').addEventListener('click', function() { R.done(); });

    _woPlayerUpdateLive({ index: R.index, phase: p, secondsLeft: secs, state: R.state });
}

/** Updates only what changes every tick: ring, seconds, progress bar, time left, pause overlay. */
function _woPlayerUpdateLive(info) {
    if (!_woP) return;
    var R = _woP.runner, p = info.phase;
    if (!p) return;
    var fg = document.getElementById('woRingFg'), txt = document.getElementById('woRingText');
    if (fg && p.durationSec) {
        var frac = Math.max(0, Math.min(1, (info.secondsLeft != null ? info.secondsLeft : 0) / p.durationSec));
        fg.setAttribute('stroke-dashoffset', String(WO_RING_C * (1 - frac)));
    }
    if (txt && info.secondsLeft != null) txt.textContent = _woFmtClock(info.secondsLeft);

    var bar = document.getElementById('woProgress');
    if (bar) bar.style.width = Math.round(100 * R.index / R.phases.length) + '%';
    var left = document.getElementById('woTimeLeft');
    if (left) left.textContent = '~' + woFmtMinutes(R.remainingEstimateSec()) + ' left';

    var paused = document.getElementById('woPaused'), pbtn = document.getElementById('woPause');
    if (paused) paused.classList.toggle('hidden', R.state !== 'paused');
    if (pbtn)   pbtn.textContent = R.state === 'paused' ? '▶' : '⏸';
}

function _woPlayerTogglePause() {
    if (!_woP || !_woP.runner) return;
    var R = _woP.runner;
    if (R.state === 'paused') R.resume(); else R.pause();
}

function _woPlayerEndClicked() {
    if (!_woP) return;
    if (!confirm('End this workout now? Anything you have not done yet will be left out.')) return;
    _woP.runner.end();
}

// ----- finish -----

function _woPlayerOnDone(results) {
    if (!_woP) return;
    var R = _woP.runner;
    clearInterval(_woP.tickTimer);
    clearInterval(_woP.flipTimer);
    var done = results.filter(function(r) { return r.status === 'done'; }).length;
    var skipped = results.filter(function(r) { return r.status === 'skipped'; }).length;
    var totalWork = R.workPhaseCount();
    _woP.finished = { session: _woP.session, phases: _woP.phases, results: results, elapsedMs: R.elapsedMs(), startedAt: R.startedAt, endedAt: Date.now() };
    window._woFinished = _woP.finished;

    var mins = Math.max(1, Math.round(R.elapsedMs() / 60000));
    document.getElementById('page-workout-run').innerHTML =
        '<div class="wo-player wo-player--done">' +
            '<div class="wo-player-main"><div class="wo-player-info">' +
                '<div class="wo-phase-title">🎉 Workout complete</div>' +
                '<div class="wo-phase-sub">' + _woEsc(_woP.session.workoutName) + '</div>' +
                '<div class="wo-done-stats">' +
                    '<div><strong>' + mins + '</strong> min</div>' +
                    '<div><strong>' + done + '</strong> of ' + totalWork + ' sets done</div>' +
                    (skipped ? '<div><strong>' + skipped + '</strong> skipped</div>' : '') +
                '</div>' +
                '<div class="wo-tap-hint" id="woSaveStatus">Saving your workout…</div>' +
            '</div></div>' +
        '</div>';
    if (typeof woVoiceOnEnd === 'function') { try { woVoiceOnEnd(_woP); } catch (e) {} }
    _woPlayerSaveAndGo();   // writes Workout History + the linked Activity, then opens the Finished Workout screen
}

// ─── 5. Saving a finished workout (chunk 2.6) ─────────────────────────────────
//
// When a run ends (all the way through, or ✕ End) it is written to Workout History
// (`workoutSessions`, personal) and a linked Activity (`exerciseActivities`, type "Workout")
// is created so it flows into Daily Metrics and the Summary grids. Calories start blank — the
// Finished Workout screen (#workout-done/:id) is where the watch number is entered.

function _woISODate(ms)  { return new Date(ms).toISOString(); }

/** YYYY-MM-DDTHH:MM:00 in local time (the format the Activity form uses). */
function _woLocalDateTime(dateISO, ms) {
    var d = new Date(ms);
    var hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
    // A back-dated workout has no real clock time, so use midday
    return dateISO + 'T' + (dateISO === _woTodayISO() ? hh + ':' + mm : '12:00') + ':00';
}

/** One set line per work phase, in timeline order. Phases never reached (ended early) are logged as skipped. */
function woSetLinesFromRun(phases, results) {
    var byIndex = {};
    results.forEach(function(r) { byIndex[r.index] = r; });
    var lines = [];
    phases.forEach(function(p, i) {
        if (p.kind !== 'work') return;
        var r = byIndex[i], done = !!(r && r.status === 'done');
        lines.push({
            exerciseId: p.exerciseId, exerciseName: p.exerciseName, measure: p.measure,
            stepIndex: p.stepIndex, itemIndex: p.itemIndex == null ? null : p.itemIndex,   // which workout step this came from (progression)
            section: p.section || 'main', side: p.side || null,
            targetAmount: p.amount, targetWeight: p.weight,
            actualAmount: done ? ((r.actual && r.actual.amount != null) ? r.actual.amount : p.amount) : null,
            actualWeight: done ? ((r.actual && r.actual.weight != null) ? r.actual.weight : p.weight) : null,
            doneAt: done ? _woISODate(r.doneAt) : null,
            skipped: !done, manual: false
        });
    });
    return lines;
}

/**
 * Personal records in a just-finished run, compared with every earlier Workout History record.
 * One metric per exercise: weighted → heaviest weight, unweighted reps → most reps in a set,
 * timed → longest time. The very first time you do an exercise is not a record.
 * Returns [{exerciseId, exerciseName, kind:'weight'|'reps'|'time', value, previous}].
 */
async function woComputePRs(sets, excludeId) {
    var snap = await userCol('workoutSessions').get();
    var prior = {};   // exerciseId → {weight, reps, time}
    snap.docs.forEach(function(d) {
        if (d.id === excludeId || d.data().status === 'in-progress') return;   // an open day workout doesn't count as history
        (d.data().sets || []).forEach(function(l) {
            if (l.skipped || l.actualAmount == null) return;
            var b = prior[l.exerciseId] || (prior[l.exerciseId] = { weight: null, reps: null, time: null });
            if (l.measure === 'time')            b.time   = Math.max(b.time   || 0, l.actualAmount);
            else if (l.actualWeight != null)     b.weight = Math.max(b.weight || 0, l.actualWeight);
            else                                 b.reps   = Math.max(b.reps   || 0, l.actualAmount);
        });
    });
    var now = {};     // this run's best per exercise + kind
    sets.forEach(function(l) {
        if (l.skipped || l.actualAmount == null) return;
        var kind  = l.measure === 'time' ? 'time' : (l.actualWeight != null ? 'weight' : 'reps');
        var value = kind === 'weight' ? l.actualWeight : l.actualAmount;
        var key   = l.exerciseId + '|' + kind;
        if (!now[key] || value > now[key].value) now[key] = { exerciseId: l.exerciseId, exerciseName: l.exerciseName, kind: kind, value: value };
    });
    var prs = [];
    Object.keys(now).forEach(function(k) {
        var n = now[k], p = prior[n.exerciseId] && prior[n.exerciseId][n.kind];
        if (p && n.value > p) prs.push({ exerciseId: n.exerciseId, exerciseName: n.exerciseName, kind: n.kind, value: n.value, previous: p });
    });
    return prs;
}

/** The id of the built-in "Workout" activity type, creating it if this account hasn't visited the Activities pages yet. */
async function _woWorkoutTypeId() {
    var find = async function() {
        var s = await userCol('exerciseTypes').where('name', '==', 'Workout').limit(1).get();
        return s.empty ? null : s.docs[0].id;
    };
    var id = await find();
    if (id) return id;
    await seedExerciseTypesIfNeeded();   // empty account → seeds every default type (incl. Workout)
    await _exEnsureWorkoutType();        // existing account missing it → adds it
    return await find();
}

/** Creates the "Workout" Activity for a history record and returns its id. Calories start blank. */
async function _woCreateLinkedActivity(sessionId, workoutName, dateISO, startMs, durationMinutes) {
    var typeId = await _woWorkoutTypeId();
    if (!typeId) throw new Error('Workout activity type not found');
    var ref = await userCol('exerciseActivities').add({
        typeId:           typeId,
        activityDate:     _woLocalDateTime(dateISO, startMs),
        durationMinutes:  durationMinutes,
        miles:            null,
        runMiles:         null,
        withDogs:         null,
        calories:         null,
        comment:          '',
        workoutSessionId: sessionId,
        workoutName:      workoutName,
        createdAt:        firebase.firestore.FieldValue.serverTimestamp()
    });
    return ref.id;
}

/**
 * Saves the finished run. Returns {sessionId, activityId (or null if the Activity could not be created)}.
 * The history record is written first so a problem creating the Activity can never lose the workout.
 */
async function woSaveFinishedWorkout(fin) {
    var sess = fin.session;
    var durationMinutes = Math.max(0.1, Math.round(fin.elapsedMs / 6000) / 10);
    var sets = woSetLinesFromRun(fin.phases, fin.results);
    var prs = [];
    try { prs = await woComputePRs(sets); } catch (err) { console.error('Workouts: could not check records:', err); }

    var sessionRef = await userCol('workoutSessions').add({
        workoutId:       sess.workoutId,
        workoutName:     sess.workoutName,
        date:            sess.date,
        mode:            sess.mode || 'guided',
        status:          'done',
        startedAt:       _woISODate(fin.startedAt || (fin.endedAt - fin.elapsedMs)),
        finishedAt:      _woISODate(fin.endedAt),
        durationMinutes: durationMinutes,
        calories:        null,
        notes:           '',
        rating:          null,
        sets:            sets,
        prs:             prs,
        activityId:      null,
        createdAt:       firebase.firestore.FieldValue.serverTimestamp()
    });

    await woApplyProgression(sess.workoutId, sets, sess.date);   // streaks / comeback ramp for each step

    var activityId = null;
    try {
        activityId = await _woCreateLinkedActivity(sessionRef.id, sess.workoutName, sess.date, fin.startedAt || (fin.endedAt - fin.elapsedMs), durationMinutes);
        await sessionRef.update({ activityId: activityId });
    } catch (err) {
        console.error('Workouts: could not create the linked Activity:', err);
    }
    return { sessionId: sessionRef.id, activityId: activityId };
}

/** Called from the completion screen: saves, then opens the Finished Workout screen. */
async function _woPlayerSaveAndGo() {
    var fin = window._woFinished;
    if (!fin) return;
    var status = document.getElementById('woSaveStatus');
    if (status) status.textContent = 'Saving your workout…';
    try {
        var saved = await woSaveFinishedWorkout(fin);
        window._woFinished = null;                       // saved — never save the same run twice
        location.hash = '#workout-done/' + saved.sessionId;
    } catch (err) {
        console.error('Workouts: save failed:', err);
        if (status) status.innerHTML = 'Could not save the workout. <button type="button" class="wo-link-btn wo-link-btn--light" id="woSaveRetry">Try again</button>';
        var retry = document.getElementById('woSaveRetry');
        if (retry) retry.addEventListener('click', _woPlayerSaveAndGo);
    }
}
