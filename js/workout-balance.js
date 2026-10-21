// workout-balance.js — which muscles you've been working (Fitness → Balance)
//
// Plan: WorkoutsPlan.md §3.4 (muscle map / weekly balance)
//
// For the chosen period, every finished set is credited to the muscles its exercise works:
// a ★ main target counts 1, an "also works" target counts ½ (an each-side pair counts once).
// Shown as heat bars grouped by body area, with the muscles you have NOT touched called out,
// plus a push-vs-pull tally. (A simple heat list rather than a body drawing.)

/**
 * sessions: Workout History docs; days: look-back window; exMap: exerciseId → exercise; muscles: list.
 * Returns {scores:{muscleId→n}, workouts, setCount, push, pull}.
 */
function woComputeBalance(sessions, days, exMap, muscles) {
    var cutoff = new Date(); cutoff.setHours(0, 0, 0, 0); cutoff.setDate(cutoff.getDate() - (days - 1));
    var cut = cutoff.getFullYear() + '-' + String(cutoff.getMonth() + 1).padStart(2, '0') + '-' + String(cutoff.getDate()).padStart(2, '0');
    var R = { scores: {}, workouts: 0, setCount: 0, push: 0, pull: 0 };
    muscles.forEach(function(m) { R.scores[m.id] = 0; });
    sessions.forEach(function(s) {
        if (s.status === 'in-progress' || !s.date || s.date < cut) return;
        var counted = false;
        (s.sets || []).forEach(function(l) {
            if (l.skipped || l.actualAmount == null || l.side === 'right') return;     // each-side pair counts once
            var ex = exMap[l.exerciseId];
            if (!ex) return;
            counted = true; R.setCount++;
            (ex.targets || []).forEach(function(t) {
                if (R.scores[t.muscleId] != null) R.scores[t.muscleId] += t.main ? 1 : 0.5;
            });
            if (ex.pushPull === 'push' || ex.pushPull === 'both') R.push++;
            if (ex.pushPull === 'pull' || ex.pushPull === 'both') R.pull++;
        });
        if (counted) R.workouts++;
    });
    return R;
}

var _woBalDays = 7;

async function loadWorkoutBalancePage() {
    window.scrollTo(0, 0);
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#life">Life</a><span class="separator">&rsaquo;</span><a href="#exercise">Fitness</a>' +
        '<span class="separator">&rsaquo;</span><span>Muscle Balance</span>';
    document.getElementById('headerTitle').innerHTML = '<a href="#main" class="home-link">' + (window.appName || 'My Life') + '</a>';
    var el = document.getElementById('page-workout-balance');
    el.innerHTML = '<div class="page-header"><h2>Muscle Balance</h2></div><div class="ex-status">Loading…</div>';
    var sessions;
    try {
        await woLoadMuscles();
        await woLoadExercises();
        var snap = await userCol('workoutSessions').get();
        sessions = snap.docs.map(function(d) { return d.data(); });
    } catch (err) {
        console.error('Workouts: failed to load balance data:', err);
        el.innerHTML = '<div class="page-header"><h2>Muscle Balance</h2></div><div class="ex-status">Could not load your workouts.</div>';
        return;
    }
    el.innerHTML =
        '<div class="page-header"><h2>Muscle Balance</h2></div>' +
        '<div class="ex-toolbar"><div class="ex-toolbar-row">' +
            '<label class="ex-label" for="wbRange" style="margin:0;">Period</label>' +
            '<select id="wbRange">' + [[7, 'Last 7 days'], [14, 'Last 14 days'], [30, 'Last 30 days'], [90, 'Last 90 days']].map(function(o) {
                return '<option value="' + o[0] + '"' + (_woBalDays === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
            }).join('') + '</select>' +
        '</div></div>' +
        '<div id="wbBody"></div>';
    var draw = function() { _woRenderBalance(sessions); };
    document.getElementById('wbRange').addEventListener('change', function() { _woBalDays = parseInt(this.value, 10); draw(); });
    draw();
}

function _woRenderBalance(sessions) {
    var box = document.getElementById('wbBody');
    var B = woComputeBalance(sessions, _woBalDays, _woExMap, _woMuscles);
    if (!B.setCount) {
        box.innerHTML = '<div class="ex-status">No finished workouts in this period yet. Do one and your muscle balance will show up here.</div>';
        return;
    }
    var max = Math.max.apply(null, _woMuscles.map(function(m) { return B.scores[m.id]; }));
    var untouched = _woMuscles.filter(function(m) { return m.area !== 'cardio' && B.scores[m.id] === 0; });
    var fmt = function(n) { return (Math.round(n * 2) / 2).toString(); };

    var areas = WO_AREAS.map(function(a) {
        var ms = _woMuscles.filter(function(m) { return m.area === a.id; });
        if (!ms.length) return '';
        var total = ms.reduce(function(t, m) { return t + B.scores[m.id]; }, 0);
        return '<div class="wb-area"><div class="wb-area-head"><strong>' + a.label + '</strong><span>' + fmt(total) + ' set-credits</span></div>' +
            ms.map(function(m) {
                var sc = B.scores[m.id], pct = max ? Math.round(100 * sc / max) : 0;
                var heat = sc === 0 ? 0 : (pct >= 66 ? 3 : (pct >= 33 ? 2 : 1));
                return '<div class="wb-row' + (sc === 0 ? ' wb-row--none' : '') + '"><span class="wb-name">' + _woEsc(m.name) + '</span>' +
                    '<span class="wb-bar"><span class="wb-fill wb-heat-' + heat + '" style="width:' + pct + '%"></span></span>' +
                    '<span class="wb-num">' + (sc === 0 ? 'not worked' : fmt(sc)) + '</span></div>';
            }).join('') + '</div>';
    }).join('');

    var pp = B.push + B.pull, pushPct = pp ? Math.round(100 * B.push / pp) : 50;
    box.innerHTML =
        '<div class="wo-stats"><div><strong>' + B.workouts + '</strong><span>workout' + (B.workouts === 1 ? '' : 's') + '</span></div>' +
            '<div><strong>' + B.setCount + '</strong><span>sets done</span></div></div>' +
        (untouched.length ? '<div class="wo-banner wo-banner--pr"><strong>Not worked in this period:</strong> ' + untouched.map(function(m) { return _woEsc(m.name); }).join(', ') + '</div>' : '<div class="wo-banner">✓ You worked every muscle group in this period.</div>') +
        '<div class="wb-pp"><div class="wb-pp-head"><strong>Push vs pull</strong><span>' + B.push + ' push · ' + B.pull + ' pull</span></div>' +
            '<div class="wb-pp-bar"><span class="wb-pp-push" style="width:' + pushPct + '%"></span><span class="wb-pp-pull" style="width:' + (100 - pushPct) + '%"></span></div></div>' +
        areas;
}
