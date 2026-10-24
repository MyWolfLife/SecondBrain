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

// ─── Labels: category, source, precaution (chunk E5) ──────────────────────────
//
// Exercise fields: category ('push' | 'pull' | 'core' | 'legs' | 'full' | ''), source (free text, e.g. "YAYOG" for
// imported exercises), precaution (a safety note shown on the Start screen and the View card).

var WO_CATEGORIES = { push: 'Push', pull: 'Pull', core: 'Core', legs: 'Legs & glutes', full: 'Full body' };

function woCategoryLabel(c) { return WO_CATEGORIES[c] || ''; }

// ─── Interval sets (FormatsPlan.md, chunk F1) ─────────────────────────────────
//
// step.interval = { seconds, capSec|null } on an exercise step: every set starts on a fixed clock (e.g. every 3:00);
// you go to failure or up to the work cap (the cap only beeps — you still type your reps), then rest for whatever is
// left of the interval. The step's own "rest between sets" / "rest after" are not used.

var WO_INTERVAL_DEFAULT = { seconds: 180, capSec: 90 };

/** 180 → "3:00", 90 → "1:30", 45 → "0:45" */
function woClockText(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}

/** "3:00" → 180, "1:30" → 90, "45" → 45 (a plain number is seconds); NaN when it can't be read. */
function woParseClock(text) {
    var t = String(text || '').trim();
    if (!t) return NaN;
    var m = t.match(/^(\d+):(\d{1,2})$/);
    if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    return /^\d+$/.test(t) ? parseInt(t, 10) : NaN;
}

/** "every 3:00, work cap 1:30" (empty when the step has no interval). */
function woIntervalText(iv) {
    if (!iv || !(iv.seconds > 0)) return '';
    return 'every ' + woClockText(iv.seconds) + (iv.capSec > 0 ? ', work cap ' + woClockText(iv.capSec) : '');
}

/** "one minute thirty" style for the voice (digits are fine for the speech engine). */
function woSayClock(sec) {
    var m = Math.floor(sec / 60), s = sec % 60, out = [];
    if (m) out.push(m + (m === 1 ? ' minute' : ' minutes'));
    if (s) out.push(s + (s === 1 ? ' second' : ' seconds'));
    return out.join(' ');
}

/** The builder's interval row for an exercise step. */
function woIntervalRowHtml(st) {
    var iv = st.interval;
    return '<div class="wo-rest-row wo-interval-row"><span class="wo-rest-label">Interval sets</span>' +
        '<label class="wo-inline-check"><input type="checkbox" data-f="intervalOn"' + (iv ? ' checked' : '') + '> each set starts on a clock</label>' +
        (iv ? ' every <input type="text" class="wo-clock-box" data-f="intervalSec" value="' + woClockText(iv.seconds) + '" placeholder="3:00"> · work cap ' +
              '<input type="text" class="wo-clock-box" data-f="intervalCap" value="' + (iv.capSec ? woClockText(iv.capSec) : '') + '" placeholder="none"> <span class="wo-hint">min:sec</span>' : '') +
        '</div>';
}

// ─── Tabata and timed sets (FormatsPlan.md, chunk F2) ─────────────────────────
//
// step.timed = { workSec, restSec, rounds } on an exercise step: repeat "work for workSec, rest for restSec" for that
// many rounds. For a reps exercise each work period is "as many reps as you can" and you count them with the +1 button
// (the total of each round is saved as that round's set line); a timed exercise (like a plank) is simply held for
// workSec. The step's own sets / rest-between-sets are not used; "Rest after exercise" is the gap before the next
// exercise (the book suggests a couple of minutes between Tabatas).

var WO_TIMED_PRESETS = {
    tabata: { label: 'Tabata — 20 s on, 10 s off, 8 rounds',       workSec: 20, restSec: 10, rounds: 8 },
    timed:  { label: 'Timed sets — 20 s on, 40 s off, 20 rounds',  workSec: 20, restSec: 40, rounds: 20 }
};

function woTimedPresetKey(t) {
    var k = Object.keys(WO_TIMED_PRESETS).filter(function(key) {
        var p = WO_TIMED_PRESETS[key];
        return t && t.workSec === p.workSec && t.restSec === p.restSec && t.rounds === p.rounds;
    })[0];
    return k || 'custom';
}

/** "20 s on / 10 s off × 8 rounds (4:00)" */
function woTimedText(t) {
    if (!t) return '';
    var total = t.rounds * t.workSec + Math.max(0, t.rounds - 1) * t.restSec;
    return t.workSec + ' s on / ' + t.restSec + ' s off × ' + t.rounds + ' round' + (t.rounds === 1 ? '' : 's') + ' (' + woClockText(total) + ')';
}

/** The builder's timed-rounds row for an exercise step. */
function woTimedRowHtml(st) {
    var t = st.timed;
    var num = function(key, val, title) { return '<input type="number" class="wo-clock-box" min="0" step="1" data-f="' + key + '" value="' + val + '" title="' + title + '">'; };
    var key = woTimedPresetKey(t);
    return '<div class="wo-rest-row wo-timed-row"><span class="wo-rest-label">Timed rounds</span>' +
        '<label class="wo-inline-check"><input type="checkbox" data-f="timedOn"' + (t ? ' checked' : '') + '> Tabata / timed sets</label>' +
        (t ? ' <select class="wo-amode" data-f="timedPreset">' +
                Object.keys(WO_TIMED_PRESETS).map(function(k) { return '<option value="' + k + '"' + (key === k ? ' selected' : '') + '>' + WO_TIMED_PRESETS[k].label + '</option>'; }).join('') +
                '<option value="custom"' + (key === 'custom' ? ' selected' : '') + '>Custom</option></select> ' +
             'work ' + num('timedWork', t.workSec, 'seconds of work') + ' s · rest ' + num('timedRest', t.restSec, 'seconds of rest') + ' s · ' +
             num('timedRounds', t.rounds, 'number of rounds') + ' rounds ' +
             '<span class="wo-hint">' + (st.measure === 'time' ? 'hold for the work time each round' : 'as many reps as you can each round — count them with +1') + '</span>' : '') +
        '</div>';
}

// ─── Supersets (FormatsPlan.md, chunk F3) ─────────────────────────────────────
//
// A superset is a CIRCUIT whose rounds start on the interval clock: circuit.interval = { seconds, capSec: null }.
// Each round = the exercises back to back (rest between exercises is normally 0), then the rest fills the rest of the
// interval; the circuit's own "rest between rounds" and "rest after" are not used. The book's recipe: a pair, 4:00
// interval, 2 rounds; the first (harder) exercise 1–5 slow reps, not to failure; the second 6–12 reps.

var WO_SUPERSET_DEFAULT = { seconds: 240, rounds: 2 };

/** The builder's superset row inside a circuit card. */
function woSupersetRowHtml(st) {
    var iv = st.interval;
    return '<div class="wo-rest-row wo-interval-row"><span class="wo-rest-label">Superset (interval)</span>' +
        '<label class="wo-inline-check"><input type="checkbox" data-f="cIntervalOn"' + (iv ? ' checked' : '') + '> each round starts on a clock</label>' +
        (iv ? ' every <input type="text" class="wo-clock-box" data-f="cIntervalSec" value="' + woClockText(iv.seconds) + '" placeholder="4:00"> <span class="wo-hint">min:sec</span>' : '') +
        ' <button type="button" class="wo-link-btn" data-act="supersetfmt" title="The book\'s recipe: 4:00 interval, 2 rounds, first exercise 1–5 slow reps, the rest 6–12">Apply superset format</button>' +
        '</div>';
}

// ─── Stappers (FormatsPlan.md, chunk F4) ──────────────────────────────────────
//
// circuit.stapper = { minutes } on a CIRCUIT: go round the exercises (each with its own reps) as many times as you can in
// `minutes`, no planned rest. The clock has a block deadline: enough cycles are created up front to fill the time, and
// when the deadline passes the runner ends the block (the exercise in progress is not counted). The circuit's rounds,
// rest between rounds and rest after are not used; "rest between exercises" is normally 0.

var WO_STAPPER_DEFAULT = { minutes: 20 };

/** The builder's Stapper row inside a circuit card. */
function woStapperRowHtml(st) {
    var s = st.stapper;
    return '<div class="wo-rest-row wo-interval-row"><span class="wo-rest-label">Stapper (as many cycles as you can)</span>' +
        '<label class="wo-inline-check"><input type="checkbox" data-f="stapperOn"' + (s ? ' checked' : '') + '> go round the exercises until time is up</label>' +
        (s ? ' for <input type="number" class="wo-clock-box" min="1" max="120" data-f="stapperMin" value="' + s.minutes + '"> minutes <span class="wo-hint">keep the reps low enough that you don\'t hit failure in the first rounds</span>' : '') +
        '</div>';
}

/**
 * One summary per Stapper in a finished run: { type:'stapper', stepIndex, minutes, cycles, partial, items }.
 * cycles = rounds where every exercise was done; partial = exercises done in the round that was cut off.
 */
function woBlockSummaries(phases, results) {
    var done = {};
    results.forEach(function(r) { if (r.status === 'done') done[r.index] = true; });
    var byBlock = {}, order = [];
    phases.forEach(function(p, i) {
        if (p.kind !== 'work' || !p.blockId) return;
        var b = byBlock[p.blockId] || (byBlock[p.blockId] = { type: 'stapper', stepIndex: p.stepIndex, minutes: Math.round((p.blockSecTotal || 0) / 60), items: p.blockItems, rounds: {} });
        if (!order.includes(p.blockId)) order.push(p.blockId);
        if (done[i]) b.rounds[p.round] = (b.rounds[p.round] || 0) + 1;
    });
    return order.map(function(id) {
        var b = byBlock[id], cycles = 0, partial = 0;
        Object.keys(b.rounds).map(Number).sort(function(x, y) { return x - y; }).forEach(function(r) {
            if (b.rounds[r] >= b.items) cycles++; else partial = b.rounds[r];
        });
        return { type: b.type, stepIndex: b.stepIndex, minutes: b.minutes, cycles: cycles, partial: partial, items: b.items };
    }).filter(function(b) { return b.cycles || b.partial; });
}

/** "🔁 Stapper: 7 cycles + 2 exercises in 20 min" lines for the Finished screen. */
function woBlocksHtml(blocks) {
    if (!blocks || !blocks.length) return '';
    return '<div class="wo-banner">' + blocks.map(function(b) {
        return '🔁 <strong>Stapper:</strong> ' + b.cycles + ' full cycle' + (b.cycles === 1 ? '' : 's') +
               (b.partial ? ' + ' + b.partial + ' exercise' + (b.partial === 1 ? '' : 's') : '') + ' in ' + b.minutes + ' min';
    }).join('<br>') + '</div>';
}
