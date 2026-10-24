// workout-progress.js — getting stronger over time (Fitness → Workouts)
//
// Plan: WorkoutsPlan.md §5a (decision D19)
//
// Every exercise step in a workout keeps TWO sets of numbers:
//   baseSets  — as you built it (never changes on its own)
//   sets      — CURRENT: what the player uses; moves up as you progress
// plus progression state: successStreak, lastDoneDate, previousBestSets, comeback.
//
//  • A finished workout counts as a SUCCESS for a step when every set hit the Current numbers.
//    Successes in a row are counted; a miss resets the count to 0 (no penalty).
//  • After N successes (default 10) the Start screen offers "⬆ Ready to level up" with a
//    suggestion (double progression: +1 rep up to base+2, then +weight and back to base reps;
//    +weight on every set for pyramids; +1 rep bodyweight; +5 sec timed). Accept → Current moves up.
//  • After 4+ weeks away the Start screen says "Welcome back" and offers Comeback (60% of Current,
//    climbing ~10% per session back to your old numbers), Base, or Current.
//  • "Reset to base" puts a step back to exactly what you built.
//  • Exercises with LEVELS (ExerciseLevelsPlan.md, chunk L7): the streak belongs to the level it was earned at
//    (step.streakLevelId; playing a different level starts it again). After N good sessions the Start screen
//    suggests the NEXT LEVEL instead of more reps/weight (the top level falls back to reps/weight). After a few
//    sessions below target in a row (step.missStreak) it suggests the PREVIOUS level. Accepting moves my level
//    (or the step's pinned level); the sets keep their numbers.

var WO_PROG_DEFAULTS = {
    levelUpAfter: 10,    // successful sessions in a row before suggesting an increase
    weightStep: 5,       // lb added when levelling up a weighted exercise
    repsAboveBase: 2,    // reps climb to base + this before the weight goes up
    timeStep: 5,         // seconds added to a timed exercise
    comebackWeeks: 4,    // away this long → "Welcome back"
    comebackPct: 60,     // comeback starts at this % of Current
    rampPct: 10,         // each completed comeback session climbs this % of your old numbers
    levelDownAfter: 3    // sessions below target in a row before suggesting an easier level (0 = never)
};

var _woProgSettingsCache = null;

/** The user's progression settings (defaults filled in). */
async function woProgSettings(force) {
    if (_woProgSettingsCache && !force) return _woProgSettingsCache;
    var s = Object.assign({}, WO_PROG_DEFAULTS);
    try {
        var doc = await userCol('settings').doc('workouts').get();
        if (doc.exists && doc.data().progression) Object.keys(s).forEach(function(k) {
            var v = doc.data().progression[k];
            if (typeof v === 'number' && (v > 0 || (k === 'levelDownAfter' && v === 0))) s[k] = v;
        });
    } catch (err) { console.error('Workouts: could not load progression settings:', err); }
    _woProgSettingsCache = s;
    return s;
}

// ─── small helpers ────────────────────────────────────────────────────────────

function _woRound25(x) { return Math.max(0, Math.round(x / 2.5) * 2.5); }
function _woHasWeight(st) { return (st.sets || []).some(function(s) { return s.weight != null; }); }
function _woSameNumbers(a, b) { return JSON.stringify(a || []) === JSON.stringify(b || []); }
function _woCloneSetList(sets) { return _woCloneSets(sets); }       // keeps rep ranges / to-failure flags

/** Visits every exercise step and circuit item: cb(step, path). Path "2" or "2.1". */
function woEachExerciseStep(steps, cb) {
    (steps || []).forEach(function(st, i) {
        if (st.type === 'circuit') (st.items || []).forEach(function(it, j) { cb(it, i + '.' + j, i, j); });
        else if (st.type === 'exercise') cb(st, String(i), i, null);
    });
}

function woStepAt(steps, path) {
    var p = String(path).split('.');
    var st = steps[parseInt(p[0], 10)];
    return p.length > 1 && st ? (st.items || [])[parseInt(p[1], 10)] : st;
}

// ─── after a workout: update streaks / comeback ramp ──────────────────────────

function _woLineDone(l) { return !l.skipped && l.actualAmount != null; }

/**
 * How a finished step went against its Current numbers: {met} every set reached its minimum (the number, or 1 for a
 * to-failure set); {top} every set reached the TOP of its range (same as met for fixed sets). lines = this step's lines.
 */
function _woStepResult(st, lines, isCircuitItem) {
    if (!lines.length || !lines.every(_woLineDone)) return { met: false, top: false };
    var sides = st.eachSide ? 2 : 1, cur = st.sets || [], met = true, top = true;
    lines.forEach(function(l, j) {
        var set = isCircuitItem ? cur[0] : cur[Math.floor(j / sides)];
        if (!set) return;
        var weightOk = set.weight == null || (l.actualWeight || 0) >= set.weight;
        if (!(l.actualAmount >= (set.amount || 0) && weightOk)) met = false;
        var goal = set.amountMax != null ? set.amountMax : (set.amount || 0);
        if (!(l.actualAmount >= goal && weightOk)) top = false;
    });
    return { met: met, top: top };
}

/** Did every set of this step hit its Current numbers? */
function _woStepMetTargets(st, lines, isCircuitItem) { return _woStepResult(st, lines, isCircuitItem).met; }

/** Moves Current up toward previousBestSets by rampPct of the old numbers. Ends the comeback when it gets there. */
function woClimbComeback(st, S) {
    var prev = st.previousBestSets || [], cur = st.sets || [], allThere = true;
    cur.forEach(function(set, k) {
        var p = prev[k] || prev[prev.length - 1];
        if (!p) return;
        if (set.weight != null && p.weight != null) {
            set.weight = Math.min(p.weight, _woRound25(set.weight + Math.max(2.5, p.weight * S.rampPct / 100)));
            if (set.weight < p.weight) allThere = false;
            if (p.amount != null) set.amount = p.amount;
        } else if (p.amount != null) {
            set.amount = Math.min(p.amount, (set.amount || 0) + Math.max(1, Math.round(p.amount * S.rampPct / 100)));
            if (set.amount < p.amount) allThere = false;
        }
        if (p.amountMax != null && set.amountMax != null) set.amountMax = Math.max(set.amount, Math.min(p.amountMax, set.amountMax + 1));
    });
    if (allThere) { st.comeback = null; st.previousBestSets = null; st.successStreak = 0; }
}

/**
 * Pure: given the workout's steps and the set lines of a just-finished run, returns the steps with
 * updated successStreak / lastDoneDate / comeback ramp, or null when nothing changed.
 * Lines carry stepIndex / itemIndex (manual lines added afterwards have none and are ignored).
 */
function woEvaluateProgression(steps, lines, dateISO, S) {
    var out = JSON.parse(JSON.stringify(steps)), changed = false;
    woEachExerciseStep(out, function(st, path, i, j) {
        var mine = lines.filter(function(l) {
            return l.stepIndex === i && ((l.itemIndex == null && j == null) || l.itemIndex === j);
        });
        if (!mine.some(_woLineDone)) return;                       // not attempted → leave everything as it was
        st.lastDoneDate = dateISO; changed = true;
        var res = _woStepResult(st, mine, j != null), met = res.met;
        var played = (mine.filter(_woLineDone)[0] || {}).levelId || null;            // multi-level exercises only
        if (played) {
            if (st.streakLevelId && st.streakLevelId !== played) { st.successStreak = 0; st.missStreak = 0; }   // a new level starts a new streak
            st.streakLevelId = played;
        }
        if (st.comeback) { if (met) woClimbComeback(st, S); }      // comeback: climb, no 10-session wait
        else             { st.successStreak = res.top ? (st.successStreak || 0) + 1 : 0; }      // a range counts when you reach its top
        if (played) st.missStreak = met ? 0 : (st.missStreak || 0) + 1;
    });
    return changed ? out : null;
}

/** Loads the workout, applies woEvaluateProgression for a finished run, and saves it. Never throws. */
async function woApplyProgression(workoutId, lines, dateISO) {
    if (!workoutId) return;
    try {
        var ref = woLibCol('workouts').doc(workoutId);
        var doc = await ref.get();
        if (!doc.exists) return;                                   // the workout was deleted since
        var S = await woProgSettings();
        var next = woEvaluateProgression(doc.data().steps || [], lines, dateISO, S);
        if (next) await ref.update({ steps: next });
    } catch (err) {
        console.error('Workouts: could not update progression:', err);
    }
}

// ─── level-up suggestion ──────────────────────────────────────────────────────

function woLevelUpAfter(st, S) { return st.levelUpAfter > 0 ? st.levelUpAfter : S.levelUpAfter; }
function woLevelUpReady(st, S) { return !st.comeback && (st.successStreak || 0) >= woLevelUpAfter(st, S); }

/** {sets, text} — the next numbers for this step, or null when there is nothing to suggest. */
function woSuggestLevelUp(st, S) {
    var sets = _woCloneSetList(st.sets);
    if (!sets.length) return null;
    var wStep = st.weightStep > 0 ? st.weightStep : S.weightStep;
    var unit = st.measure === 'time' ? ' sec' : ' reps';
    var before = woFmtSet(st.measure, sets[0]), text;
    var shaped = sets.some(function(s) { return s.amountMax != null || s.failure; });

    if (shaped && st.measure !== 'time') {                      // rep ranges / to-failure sets
        if (_woHasWeight(st)) {
            sets.forEach(function(s) { s.weight = (s.weight || 0) + wStep; });
            text = '+' + wStep + ' lb on every set (the rep ranges stay)';
        } else {
            sets.forEach(function(s) { s.amount = (s.amount || 0) + 1; if (s.amountMax != null) s.amountMax += 1; });
            text = woFmtSet(st.measure, st.sets[0]) + ' → ' + woFmtSet(st.measure, sets[0]);
        }
    } else if (st.measure === 'time') {
        sets.forEach(function(s) { s.amount = (s.amount || 0) + S.timeStep; });
        text = (sets[0].amount - S.timeStep) + ' → ' + sets[0].amount + ' sec';
    } else if (_woHasWeight(st)) {
        var uniform = sets.every(function(s) { return s.amount === sets[0].amount && s.weight === sets[0].weight; });
        if (uniform) {
            var base = (st.baseSets && st.baseSets[0] && st.baseSets[0].amount) || sets[0].amount;
            var top = st.repTop > 0 ? st.repTop : base + S.repsAboveBase;
            if (sets[0].amount < top) {
                sets.forEach(function(s) { s.amount += 1; });
                text = (sets[0].amount - 1) + ' → ' + sets[0].amount + ' reps @ ' + sets[0].weight + ' lb';
            } else {
                sets.forEach(function(s) { s.weight = (s.weight || 0) + wStep; s.amount = base; });
                text = sets[0].amount + ' reps @ ' + (sets[0].weight - wStep) + ' → ' + sets[0].weight + ' lb (back to ' + base + ' reps)';
            }
        } else {
            sets.forEach(function(s) { s.weight = (s.weight || 0) + wStep; });
            text = '+' + wStep + ' lb on every set';
        }
    } else {
        sets.forEach(function(s) { s.amount = (s.amount || 0) + 1; });
        text = (sets[0].amount - 1) + ' → ' + sets[0].amount + ' reps';
    }
    return { sets: sets, text: text, before: before };
}

/**
 * Level-based suggestion for a step of a multi-level exercise, at the level it will play today:
 * {dir:'up'|'down', to (level), fromLabel, toLabel} or null. Up needs a finished streak and a harder active
 * level (the top level falls back to reps/weight); down needs missStreak sessions below target and an easier level.
 */
function woSuggestLevelMove(st, path, S) {
    var ex = _woExMap[st.exerciseId];
    if (!ex || !woIsMultiLevel(ex)) return null;
    var cur = woStartLevelFor(st, path);
    if (!cur) return null;
    if (st.streakLevelId && st.streakLevelId !== cur.id) return null;            // that streak belongs to another level
    var act = woActiveLevelsOf(ex), all = woLevelsOf(ex);
    var i = act.findIndex(function(l) { return l.id === cur.id; });
    var name = function(l) { return woLevelDisplay(l, all.findIndex(function(x) { return x.id === l.id; })); };
    if (woLevelUpReady(st, S) && i < act.length - 1) return { dir: 'up', to: act[i + 1], fromLabel: name(cur), toLabel: name(act[i + 1]) };
    if (S.levelDownAfter > 0 && (st.missStreak || 0) >= S.levelDownAfter && i > 0) return { dir: 'down', to: act[i - 1], fromLabel: name(cur), toLabel: name(act[i - 1]) };
    return null;
}

/** Multi-level step that still has a harder level: reps/weight suggestions are replaced by the level move. */
function _woHasHarderLevel(st, path) {
    var ex = _woExMap[st.exerciseId];
    if (!ex || !woIsMultiLevel(ex)) return false;
    var cur = woStartLevelFor(st, path), act = woActiveLevelsOf(ex);
    return !!cur && act.findIndex(function(l) { return l.id === cur.id; }) < act.length - 1;
}

/** 60% (default) of Current for the Comeback choice — weights drop, unweighted exercises drop reps/seconds. */
function woComebackSets(st, S) {
    return _woCloneSetList(st.sets).map(function(s) {
        if (s.weight != null) { s.weight = Math.max(2.5, _woRound25(s.weight * S.comebackPct / 100)); }
        else if (s.amount != null) {
            s.amount = Math.max(1, Math.round(s.amount * S.comebackPct / 100));
            if (s.amountMax != null) s.amountMax = Math.max(s.amount, Math.round(s.amountMax * S.comebackPct / 100));
        }
        return s;
    });
}

// ─── Start-screen integration ─────────────────────────────────────────────────

/** Called once the Start screen has loaded the workout (sets _woS.prog). */
async function woProgInitStart() {
    var S = await woProgSettings(true);
    var last = null;
    woEachExerciseStep(_woS.workout.steps, function(st) {
        if (st.lastDoneDate && (!last || st.lastDoneDate > last)) last = st.lastDoneDate;
    });
    var midRamp = false;
    woEachExerciseStep(_woS.workout.steps, function(st) { if (st.comeback) midRamp = true; });
    var days = null;
    if (last) {
        var p = last.split('-');
        days = Math.floor((Date.now() - new Date(+p[0], +p[1] - 1, +p[2]).getTime()) / 86400000);
    }
    _woS.prog = {
        S: S, dismissed: {},
        trueOriginal: JSON.parse(JSON.stringify(_woS.original)),
        welcome: (!midRamp && days != null && days >= S.comebackWeeks * 7) ? { days: days, last: last } : null,
        choice: 'current'
    };
    if (_woS.prog.welcome) _woS.prog.choice = 'comeback';
    if (_woS.prog.welcome) _woProgApplyChoice('comeback');
}

/** Rebuilds the session numbers (and the in-memory "saved" copy) for a Welcome-back choice. */
function _woProgApplyChoice(choice) {
    var P = _woS.prog, S = P.S;
    P.choice = choice;
    woEachExerciseStep(P.trueOriginal.steps, function(tst, path) {
        [_woS.original.steps, _woS.workout.steps].forEach(function(steps) {
            var st = woStepAt(steps, path); if (!st) return;
            if (choice === 'comeback') {
                st.previousBestSets = _woCloneSetList(tst.sets);
                st.sets = woComebackSets(tst, S);
                st.comeback = { startedAt: _woS.date };
                st.successStreak = 0;
            } else if (choice === 'base') {
                st.sets = _woCloneSetList(tst.baseSets || tst.sets);
                st.previousBestSets = null; st.comeback = null; st.successStreak = 0;
            } else {
                st.sets = _woCloneSetList(tst.sets); st.previousBestSets = tst.previousBestSets || null;
                st.comeback = tst.comeback || null; st.successStreak = tst.successStreak || 0;
            }
        });
    });
}

function woProgBannerHtml() {
    var P = _woS && _woS.prog;
    if (!P || !P.welcome) return '';
    var d = P.welcome.days, ago = d >= 60 ? Math.round(d / 30) + ' months' : Math.round(d / 7) + ' weeks';
    var opt = function(v, title, hint) {
        return '<label class="wo-mode"><input type="radio" name="wosComeback" value="' + v + '"' + (P.choice === v ? ' checked' : '') + '> <span><strong>' + title + '</strong><br><span class="wo-hint">' + hint + '</span></span></label>';
    };
    return '<div class="wo-banner wo-banner--pr"><strong>👋 Welcome back!</strong> It has been about ' + ago + ' since you did this workout.' +
        '<div class="wo-mode-list" style="margin-top:8px;">' +
            opt('comeback', 'Comeback (recommended)', 'Start at ' + P.S.comebackPct + '% of your weights and climb back about ' + P.S.rampPct + '% a session — no waiting.') +
            opt('base', 'Start at Base', 'Back to exactly what you built.') +
            opt('current', 'Start at Current', 'Carry on from where you left off.') +
        '</div></div>';
}

/** Per-step block: level-up offer, comeback note, reset-to-base link. */
function woProgStepHtml(st, path) {
    var P = _woS && _woS.prog;
    if (!P) return '';
    var out = '';
    if (st.comeback && st.previousBestSets) {
        var target = woFmtAmount(st.measure, st.previousBestSets[0].amount, st.previousBestSets[0].weight);
        out += '<div class="wo-prog wo-prog--comeback">↗ Comeback — climbing back toward ' + _woEsc(target) + '</div>';
    } else if (woSuggestLevelMove(st, path, P.S) && !P.dismissed[path + ':' + woSuggestLevelMove(st, path, P.S).dir]) {
        var mv = woSuggestLevelMove(st, path, P.S);
        out += mv.dir === 'up'
            ? '<div class="wo-prog wo-prog--up"><strong>⬆ Ready for the next level</strong> — ' + (st.successStreak || 0) + ' good sessions in a row at ' + _woEsc(mv.fromLabel) + '. Suggestion: <strong>' + _woEsc(mv.fromLabel) + ' → ' + _woEsc(mv.toLabel) + '</strong>'
            : '<div class="wo-prog wo-prog--down"><strong>⬇ Maybe go easier</strong> — below target ' + (st.missStreak || 0) + ' sessions in a row at ' + _woEsc(mv.fromLabel) + '. Suggestion: <strong>' + _woEsc(mv.fromLabel) + ' → ' + _woEsc(mv.toLabel) + '</strong>';
        out += '<div class="wo-hint">Your sets keep their numbers — change them below if the new level needs fewer reps.</div>' +
            '<div class="wo-prog-btns"><button type="button" class="btn btn-primary btn-small" data-prog="acceptlevel" data-path="' + path + '" data-to="' + _woEsc(mv.to.id) + '">Accept</button>' +
            '<button type="button" class="btn btn-secondary btn-small" data-prog="notyetlevel" data-path="' + path + '" data-dir="' + mv.dir + '">Not yet</button></div></div>';
    } else if (woLevelUpReady(st, P.S) && !P.dismissed[path] && !_woHasHarderLevel(st, path)) {
        var sug = woSuggestLevelUp(st, P.S);
        if (sug) out += '<div class="wo-prog wo-prog--up"><strong>⬆ Ready to level up</strong> — ' + (st.successStreak || 0) + ' good sessions in a row. Suggestion: <strong>' + _woEsc(sug.text) + '</strong>' +
            '<div class="wo-prog-btns"><button type="button" class="btn btn-primary btn-small" data-prog="accept" data-path="' + path + '">Accept</button>' +
            '<button type="button" class="btn btn-secondary btn-small" data-prog="notyet" data-path="' + path + '">Not yet</button></div></div>';
    } else if ((st.successStreak || 0) > 0 && !st.comeback) {
        var curLv = woStartLevelFor(st, path);
        out += '<div class="wo-prog wo-prog--streak">' + st.successStreak + ' of ' + woLevelUpAfter(st, P.S) + ' good sessions toward the next ' + (_woHasHarderLevel(st, path) ? 'level' : 'level-up') +
               (curLv && _woHasHarderLevel(st, path) ? ' (at ' + _woEsc(woLevelDisplay(curLv, woLevelsOf(_woExMap[st.exerciseId]).findIndex(function(x) { return x.id === curLv.id; }))) + ')' : '') + '</div>';
    }
    if (st.comeback || !_woSameNumbers(st.sets, st.baseSets)) {
        out += '<div class="wo-prog-reset"><button type="button" class="wo-link-btn" data-prog="reset" data-path="' + path + '">Reset to base</button></div>';
    }
    return out;
}

/** Writes the step changes (made on _woS.original) to the workout doc. */
async function _woProgPersist() {
    var steps = _woS.original.steps;
    await woLibCol('workouts').doc(_woS.id).update({
        steps: steps, estimatedSeconds: woEstimateSeconds(steps),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

/** Click handler for the Start screen's progression buttons and the Welcome-back radios. */
async function woProgHandleClick(ev) {
    var P = _woS && _woS.prog;
    if (!P) return;
    var radio = ev.target.closest('input[name="wosComeback"]');
    if (radio) { _woProgApplyChoice(radio.value); _woRenderStartPage(); return; }

    var btn = ev.target.closest('[data-prog]');
    if (!btn) return;
    var act = btn.getAttribute('data-prog'), path = btn.getAttribute('data-path');
    var orig = woStepAt(_woS.original.steps, path), work = woStepAt(_woS.workout.steps, path);
    if (!orig || !work) return;

    if (act === 'notyet') { P.dismissed[path] = true; _woRenderStartPage(); return; }
    if (act === 'notyetlevel') { P.dismissed[path + ':' + btn.getAttribute('data-dir')] = true; _woRenderStartPage(); return; }
    try {
        if (act === 'acceptlevel') {                                // move up/down a level
            var to = btn.getAttribute('data-to');
            if (work.levelMode === 'pinned') { [orig, work].forEach(function(st) { st.levelId = to; }); }   // pinned step: move the pin
            else {                                                                                       // follows my level: move my level
                await woSetMyLevel(orig.exerciseId, to);
                delete _woS.runLevels[path]; delete _woS.myPick[orig.exerciseId];
            }
            [orig, work].forEach(function(st) { st.successStreak = 0; st.missStreak = 0; st.streakLevelId = to; });
        } else if (act === 'accept') {
            var sug = woSuggestLevelUp(orig, P.S);
            if (!sug) return;
            [orig, work].forEach(function(st) { st.sets = _woCloneSetList(sug.sets); st.successStreak = 0; });
        } else if (act === 'reset') {
            [orig, work].forEach(function(st) {
                st.sets = _woCloneSetList(st.baseSets); st.successStreak = 0; st.comeback = null; st.previousBestSets = null;
            });
        }
        await _woProgPersist();
        _woRenderStartPage();
    } catch (err) {
        console.error('Workouts: progression change failed:', err);
        alert('Could not save that change. Please try again.');
    }
}

// ─── Progression settings (overlay on the Workouts list) ──────────────────────

async function woOpenProgressionSettings() {
    var S = await woProgSettings(true);
    await woLoadWeakerSide();
    var field = function(key, label, hint, step) {
        return '<div class="ex-form-group"><label class="ex-label" for="wps_' + key + '">' + label + ' <span class="wo-hint">' + hint + '</span></label>' +
               '<input type="number" id="wps_' + key + '" min="1" step="' + (step || 1) + '" value="' + S[key] + '"></div>';
    };
    var ov = _woGrabOverlay(
        '<h3>Progression settings</h3>' +
        '<div class="ex-form-group"><label class="ex-label" for="wps_weakerSide">My weaker side <span class="wo-hint">used by exercises set to “weaker side first”</span></label>' +
            '<select id="wps_weakerSide"><option value=""' + (_woWeakerSide ? '' : ' selected') + '>Not set yet</option><option value="left"' + (_woWeakerSide === 'left' ? ' selected' : '') + '>Left</option><option value="right"' + (_woWeakerSide === 'right' ? ' selected' : '') + '>Right</option></select></div>' +
        field('levelUpAfter', 'Level up after', 'good sessions in a row') +
        field('weightStep', 'Weight step', 'lb added when levelling up', 0.5) +
        field('repsAboveBase', 'Reps above base', 'reps climb this far before the weight goes up') +
        field('timeStep', 'Time step', 'seconds added to timed exercises') +
        field('comebackWeeks', 'Welcome back after', 'weeks away') +
        field('comebackPct', 'Comeback starts at', '% of your weights') +
        field('rampPct', 'Comeback climbs', '% of your old weights per session') +
        '<div class="ex-form-group"><label class="ex-label" for="wps_levelDownAfter">Suggest an easier level after <span class="wo-hint">sessions below target in a row, for exercises with levels (0 = never)</span></label>' +
            '<input type="number" id="wps_levelDownAfter" min="0" step="1" value="' + S.levelDownAfter + '"></div>' +
        '<div class="ex-form-actions"><button type="button" class="btn btn-primary" id="wpsSave">Save</button>' +
        '<button type="button" class="btn btn-secondary" id="wpsReset">Defaults</button>' +
        '<button type="button" class="btn btn-secondary" id="wpsClose">Cancel</button></div>');
    ov.querySelector('#wpsClose').addEventListener('click', _woCloseGrabber);
    ov.querySelector('#wpsReset').addEventListener('click', function() {
        Object.keys(WO_PROG_DEFAULTS).forEach(function(k) { ov.querySelector('#wps_' + k).value = WO_PROG_DEFAULTS[k]; });
    });
    ov.querySelector('#wpsSave').addEventListener('click', async function() {
        var prog = {};
        Object.keys(WO_PROG_DEFAULTS).forEach(function(k) {
            var v = parseFloat(ov.querySelector('#wps_' + k).value);
            prog[k] = (v > 0 || (k === 'levelDownAfter' && v === 0)) ? v : WO_PROG_DEFAULTS[k];
        });
        try {
            var ws = ov.querySelector('#wps_weakerSide').value;
            await userCol('settings').doc('workouts').set({ progression: prog, weakerSide: ws || firebase.firestore.FieldValue.delete() }, { merge: true });
            _woWeakerSide = ws || null;
            _woProgSettingsCache = null;
            _woCloseGrabber();
        } catch (err) {
            console.error('Workouts: could not save progression settings:', err);
            alert('Could not save the settings. Please try again.');
        }
    });
}
