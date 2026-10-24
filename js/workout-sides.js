// workout-sides.js — "weaker side first" and "swap the starting side each set" (ExerciseAdditionsPlan.md, chunk E3)
//
// Exercise (and the step snapshot of it):
//   startSide  'left' | 'right' | 'weaker'   — which side an each-side exercise starts with
//   swapStart  true                          — the starting side alternates every set (left, right, left …)
// Setting settings/workouts.weakerSide ('left' | 'right') says which side is weaker; if it is not set yet the Start
// screen asks once. At Start the run copy of each each-side step is stamped with runStartSide ('left' | 'right'),
// so the player and the throughout-the-day checklist both use the resolved side.

var _woWeakerSide = null;          // 'left' | 'right' | null (cached from settings)

async function woLoadWeakerSide() {
    try {
        var doc = await userCol('settings').doc('workouts').get();
        _woWeakerSide = doc.exists && (doc.data().weakerSide === 'left' || doc.data().weakerSide === 'right') ? doc.data().weakerSide : null;
    } catch (err) { console.error('Workouts: could not read the weaker side:', err); }
    return _woWeakerSide;
}

async function woSetWeakerSide(side) {
    await userCol('settings').doc('workouts').set({ weakerSide: side }, { merge: true });
    _woWeakerSide = side;
}

function woOppositeSide(side) { return side === 'right' ? 'left' : 'right'; }

/** The side a step starts with on its FIRST set: runStartSide if stamped, else startSide with 'weaker' resolved (left if unknown). */
function woFirstSide(st) {
    if (st.runStartSide) return st.runStartSide;
    if (st.startSide === 'right') return 'right';
    if (st.startSide === 'weaker') return _woWeakerSide || 'left';
    return 'left';
}

/** The side to start with on set number setIndex (0-based), taking "swap each set" into account. */
function woStartSideForSet(st, setIndex) {
    var first = woFirstSide(st);
    return (st.swapStart && setIndex % 2 === 1) ? woOppositeSide(first) : first;
}

/** Does any each-side step of this workout start with the weaker side? */
function woWorkoutNeedsWeakerSide(steps) {
    return _woFlatExercises(steps).some(function(st) { return st.eachSide && st.startSide === 'weaker'; });
}

// ─── Start screen ─────────────────────────────────────────────────────────────

/** Asked once, only when a step starts with the weaker side and we don't know which side that is. */
function woStartSidesAskHtml() {
    if (!woWorkoutNeedsWeakerSide(_woS.workout.steps) || _woWeakerSide) return '';
    var pick = _woS.weakerPick || 'left';
    var opt = function(v, label) {
        return '<label class="wo-ask-opt"><input type="radio" name="wosWeaker" value="' + v + '"' + (pick === v ? ' checked' : '') + '> <span>' + label + '</span></label>';
    };
    return '<div class="wo-banner wo-level-ask" id="wosWeakerAsk"><strong>Which side is your weaker side?</strong> ' +
        '<span class="wo-hint">Some exercises start with it. Answer once — you can change it later in ⚙ Progression.</span>' +
        '<div class="wo-ask-ex">' + opt('left', 'Left') + opt('right', 'Right') + '</div></div>';
}

function woStartSidesBind() {
    document.querySelectorAll('input[name=wosWeaker]').forEach(function(r) {
        r.addEventListener('change', function() { _woS.weakerPick = this.value; });
    });
}

/** At Start: save the answer (an unanswered question counts as left). */
async function woStartSidesCommit() {
    if (woWorkoutNeedsWeakerSide(_woS.workout.steps) && !_woWeakerSide) await woSetWeakerSide(_woS.weakerPick || 'left');
}

/** Stamps runStartSide onto a COPY of the steps for every each-side exercise. */
function woStartApplySides(copySteps) {
    _woFlatExercises(copySteps).forEach(function(st) {
        if (st.eachSide) st.runStartSide = woFirstSide(Object.assign({}, st, { runStartSide: null }));
        else delete st.runStartSide;
    });
    return copySteps;
}
