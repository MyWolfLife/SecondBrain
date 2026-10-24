// workout-amounts.js — rep ranges and to-failure sets (ExerciseAdditionsPlan.md, chunk E1)
//
// A set inside step.sets[] is { amount, weight } as always. Two optional fields add the book's styles:
//   amountMax  — top of a range ("6–12 reps"); amount stays the minimum
//   failure    — true = as many as you can; amount (if any) means "at least"
// A set with neither is exactly the fixed set that existed before, so 3×10 and 10/5/3 are unchanged.
//
// Timed exercises support fixed and "as long as you can" (failure); ranges are for reps only.

/** 'fixed' | 'range' | 'max' */
function woSetMode(set) {
    return set && set.failure ? 'max' : (set && set.amountMax != null ? 'range' : 'fixed');
}

/** Puts a set into a mode, keeping the numbers sensible (a new range starts 2 above the minimum). */
function woApplyAmountMode(set, mode, measure) {
    if (mode === 'range' && measure !== 'time') {
        delete set.failure;
        if (set.amount == null) set.amount = 10;
        if (set.amountMax == null || set.amountMax < set.amount) set.amountMax = set.amount + 2;
    } else if (mode === 'max') {
        set.failure = true; delete set.amountMax;
    } else {
        delete set.failure; delete set.amountMax;
    }
}

/** "10 reps", "6–12 reps", "Max reps", "at least 5 reps (max)", "30 sec", "Max time"; weight appended as usual. */
function woFmtSet(measure, set) {
    set = set || {};
    var unit = measure === 'time' ? ' sec' : ' reps', out;
    if (set.failure) {
        out = set.amount > 1 ? 'at least ' + set.amount + unit + ' (max)' : (measure === 'time' ? 'Max time' : 'Max reps');
    } else if (set.amountMax != null && measure !== 'time') {
        out = set.amount + '–' + set.amountMax + unit;
    } else {
        out = woFmtAmount(measure, set.amount, null);
    }
    if (set.weight != null && set.weight !== '') out += (out ? ' @ ' : '') + set.weight + ' lb';
    return out;
}

/** A timeline phase / set line → the same text. */
function woFmtPhase(p) {
    return woFmtSet(p.measure, { amount: p.amount != null ? p.amount : p.targetAmount, amountMax: p.amountMax != null ? p.amountMax : p.targetMax,
                                 failure: p.failure, weight: p.weight != null ? p.weight : p.targetWeight });
}

/** The big number on the player: "10", "6–12", "MAX". */
function woBigAmount(p) {
    if (p.failure) return 'MAX';
    return p.amountMax != null ? p.amount + '–' + p.amountMax : String(p.amount);
}

/** Does this phase's real number have to be typed in (range / failure)? */
function woNeedsActual(p) { return !!p.failure || p.amountMax != null; }

/**
 * The amount control for one set: [exactly ▾] [10] reps  |  [a range ▾] [6] – [12] reps  |  [to failure ▾] [at least] reps
 * pre: '' for per-set rows (data-f amount/amode/amax, data-k = k) or 'q' for the quick row (qamount/qamode/qamax).
 */
function woAmountEditorHtml(measure, set, pre, k) {
    set = set || {};
    var mode = woSetMode(set), kA = (k == null) ? '' : ' data-k="' + k + '"';
    var unit = measure === 'time' ? 'sec' : 'reps';
    var modes = measure === 'time' ? [['fixed', 'exactly'], ['max', 'as long as you can']]
                                   : [['fixed', 'exactly'], ['range', 'a range'], ['max', 'to failure']];
    var sel = '<select class="wo-amode" data-f="' + pre + 'amode"' + kA + ' title="How the target is set">' + modes.map(function(m) {
        return '<option value="' + m[0] + '"' + (mode === m[0] ? ' selected' : '') + '>' + m[1] + '</option>';
    }).join('') + '</select> ';
    var lo = '<input type="number" min="1" data-f="' + pre + 'amount"' + kA + ' value="' + (set.amount != null ? set.amount : '') + '"' +
             (mode === 'max' ? ' placeholder="at least"' : '') + '>';
    var hi = mode === 'range' ? ' – <input type="number" min="1" data-f="' + pre + 'amax"' + kA + ' value="' + (set.amountMax != null ? set.amountMax : '') + '">' : '';
    return sel + lo + hi + ' ' + unit;
}

/** Keeps a range sane after typing: the top can never be below the minimum. */
function woFixRange(set) {
    if (set.amountMax != null && set.amount != null && set.amountMax < set.amount) set.amountMax = set.amount;
}
