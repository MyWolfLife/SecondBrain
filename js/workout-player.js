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
    var sides  = st.eachSide ? ['left', 'right'] : [null];
    var out = [];
    sides.forEach(function(side, si) {
        out.push({
            kind: 'work', label: st.exerciseName, section: ctx.section,
            stepIndex: ctx.stepIndex, itemIndex: ctx.itemIndex,
            exerciseId: st.exerciseId, exerciseName: st.exerciseName,
            measure: st.measure, amount: amount, weight: weight,
            setIndex: ctx.setIndex, setCount: ctx.setCount,
            round: ctx.round, rounds: ctx.rounds, side: side,
            restKind: null,
            durationSec: st.measure === 'time' ? amount : null,
            tap: st.measure !== 'time'
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
 * Workout doc → ordered phases. Opts: { getReadySec } (0 = no get-ready phase).
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
                var ctx = { section: section, stepIndex: si, itemIndex: null, setIndex: k, setCount: sets.length, round: null, rounds: null };
                phases = phases.concat(_woSetPhases(step, set, ctx));
                if (k < sets.length - 1) phases = phases.concat(_woRestPhase(step.restBetweenSets, 'sets', ctx));
            });
            phases = phases.concat(_woRestPhase(step.restAfter, 'after', { section: section, stepIndex: si }));

        } else if (step.type === 'circuit') {
            var items = step.items || [], rounds = step.rounds || 1;
            for (var r = 1; r <= rounds; r++) {
                items.forEach(function(it, ij) {
                    var set = (it.sets && it.sets[0]) || { amount: null, weight: null };
                    var ctx = { section: section, stepIndex: si, itemIndex: ij, setIndex: r - 1, setCount: rounds, round: r, rounds: rounds };
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
    function record(status) {
        var p = phase();
        if (!p || p.kind !== 'work') return;
        R.results = R.results.filter(function(r) { return r.index !== R.index; });
        R.results.push({ index: R.index, status: status, doneAt: now() });
    }

    function advance(status) {
        record(status);
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
    R.done = function() {
        if (R.state === 'paused') R.resume();
        if (R.state !== 'running') return;
        advance('done');
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
        var prefs = _woLoadPlayerPrefs();
        _woS = { id: w.id, original: JSON.parse(JSON.stringify(w)), workout: w,
                 date: _woTodayISO(), voiceCues: prefs.cues, voiceCmds: prefs.commands && !!woSpeechRecognitionCtor(),
                 saveBack: false };
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
                    return '<div class="wo-item" data-path="' + i + '.' + j + '"><span class="wo-item-name">' + _woEsc(it.exerciseName) + '</span>' +
                        '<span class="wo-item-sets"><input type="number" min="1" data-f="amount" data-k="0" value="' + (s0.amount != null ? s0.amount : '') + '"> ' + _woStartUnit(it) +
                        (it.usesWeight ? ' @ <input type="number" min="0" step="0.5" data-f="weight" data-k="0" value="' + (s0.weight != null ? s0.weight : '') + '"> lb' : '') + '</span></div>';
                }).join('') + '</div>';
        }
        return '<div class="wo-step" data-path="' + i + '">' +
            '<div class="wo-step-head"><span class="wo-step-num">' + (i + 1) + '</span><span class="wo-step-name">' + _woEsc(st.exerciseName) + '</span>' +
            (st.eachSide ? '<span class="wo-badge wo-badge--neither">Each side</span>' : '') + '</div>' +
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

            '<div class="ex-form-group"><label class="ex-label" for="wosDate">Date</label>' +
                '<input type="date" id="wosDate" value="' + s.date + '" max="' + _woTodayISO() + '"></div>' +

            '<div class="ex-form-group"><label class="ex-label">How do you want to do it?</label>' +
                '<div class="wo-mode-list">' +
                    '<label class="wo-mode"><input type="radio" name="wosMode" value="guided" checked> <span><strong>🎬 Guided</strong><br><span class="wo-hint">Prop up your phone — it counts down each exercise and rest and shows what is next.</span></span></label>' +
                    '<label class="wo-mode wo-mode--off"><input type="radio" name="wosMode" value="self" disabled> <span><strong>✅ Self-paced</strong> <span class="wo-badge wo-badge--neither">coming soon</span><br><span class="wo-hint">You tap Done after each set.</span></span></label>' +
                    '<label class="wo-mode wo-mode--off"><input type="radio" name="wosMode" value="day" disabled> <span><strong>🌤️ Throughout the day</strong> <span class="wo-badge wo-badge--neither">coming soon</span><br><span class="wo-hint">Tick sets off whenever you do them.</span></span></label>' +
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
    document.getElementById('wosGo').addEventListener('click', _woStartGo);
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
        if (s.saveBack && _woStartChanged()) {
            steps = _woStepsWithSavedChanges();
            var ids = [];
            _woFlatExercises(steps).forEach(function(st) { if (st.exerciseId && ids.indexOf(st.exerciseId) === -1) ids.push(st.exerciseId); });
            await woLibCol('workouts').doc(s.id).update({
                steps: steps, exerciseIds: ids, estimatedSeconds: woEstimateSeconds(steps),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        window._woSession = {
            workoutId:   s.id,
            workoutName: s.workout.name,
            workout:     { id: s.id, name: s.workout.name, steps: JSON.parse(JSON.stringify(s.workout.steps)) },
            date:        s.date,
            mode:        'guided',
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

// ─── 4. Player screen (#workout-run) — placeholder until chunk 2.3 ────────────

function loadWorkoutRunPage() {
    _woSetChrome([['Workouts', '#workouts'], ['Workout']]);
    var el = document.getElementById('page-workout-run');
    var sess = window._woSession;
    el.innerHTML = '<div class="page-header"><h2>' + _woEsc(sess ? sess.workoutName : 'Workout') + '</h2></div>' +
        '<div class="ex-status">The guided player is coming together…</div>';
}
