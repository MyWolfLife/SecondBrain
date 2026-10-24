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

// ─── Tempo and pauses (chunk E2) ──────────────────────────────────────────────
//
// step.tempo = { down, pauseBottom, up, pauseTop } in seconds, every part optional ("blank = not set").
// It is shown in the player and spoken once per exercise; it is not counted out loud.

var WO_TEMPO_PARTS = [
    { key: 'down',        label: 'lower',               short: 'lower',        say: 'Lower for' },
    { key: 'pauseBottom', label: 'pause at the bottom', short: 'bottom pause', say: 'pause at the bottom for' },
    { key: 'up',          label: 'lift',                short: 'lift',         say: 'lift for' },
    { key: 'pauseTop',    label: 'pause at the top',    short: 'top pause',    say: 'pause at the top for' }
];

function woHasTempo(t) { return !!t && WO_TEMPO_PARTS.some(function(p) { return t[p.key] > 0; }); }

/** "lower 3 s · pause at the bottom 1 s · lift 1 s" (only the parts that are set). */
function woTempoText(t) {
    if (!woHasTempo(t)) return '';
    return WO_TEMPO_PARTS.filter(function(p) { return t[p.key] > 0; }).map(function(p) { return p.label + ' ' + t[p.key] + ' s'; }).join(' · ');
}

/** "Lower for three seconds, pause at the bottom for one second, lift for one second." */
function woTempoSpoken(t) {
    if (!woHasTempo(t)) return '';
    var word = function(n) { var w = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']; return Number.isInteger(n) && n >= 0 && n <= 10 ? w[n] : String(n); };
    var parts = WO_TEMPO_PARTS.filter(function(p) { return t[p.key] > 0; }).map(function(p) {
        return p.say + ' ' + word(t[p.key]) + (t[p.key] === 1 ? ' second' : ' seconds');
    });
    var out = parts.join(', ');
    return out.charAt(0).toUpperCase() + out.slice(1) + '.';
}

/** The builder's tempo row for a step or circuit item (four small boxes). */
function woTempoRowHtml(st) {
    var t = st.tempo || {};
    var box = function(p) {
        return p.short + ' <input type="number" min="0" step="0.5" data-f="tempo" data-t="' + p.key + '" value="' + (t[p.key] > 0 ? t[p.key] : '') + '"> s';
    };
    return '<div class="wo-rest-row wo-tempo-row"><span class="wo-rest-label">Tempo (optional)</span>' +
        WO_TEMPO_PARTS.map(box).join(' · ') + ' <span class="wo-hint">seconds; blank = none</span></div>';
}
