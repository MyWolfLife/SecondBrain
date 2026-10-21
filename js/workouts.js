// workouts.js — Fitness → Exercises (library) and Workouts (builder, history)
//
// Plan:  WorkoutsPlan.md      Progress: WorkoutsProgress.md
//
// Data (all per-user today; the library will move to a shared space later — see
// SharedSpacesPlan.md — which is why library collections go through woLibCol()):
//   workoutMuscles    — muscle list, grouped by area
//   workoutExercises  — the exercise library
//   workouts          — built routines (steps with sets, rest, circuits)
//   workoutSessions   — Workout History (personal, always userCol)

// ─── Data access ──────────────────────────────────────────────────────────────

/**
 * Collection reference for library data (muscles, exercises, workouts).
 * Today this is simply the user's own collection. When Shared Spaces arrives,
 * this one function is pointed at the shared container instead — nothing else
 * in this file needs to change.
 */
function woLibCol(name) {
    return userCol(name);
}

// ─── Shared page helpers ──────────────────────────────────────────────────────

/** Sets the breadcrumb + header for a workouts page. crumbs = [[label, hash?], ...] (last has no hash). */
function _woSetChrome(crumbs) {
    window.scrollTo(0, 0);
    var html = '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
               '<a href="#exercise">Fitness</a>';
    crumbs.forEach(function(c) {
        html += '<span class="separator">&rsaquo;</span>' +
                (c[1] ? '<a href="' + c[1] + '">' + c[0] + '</a>' : '<span>' + c[0] + '</span>');
    });
    document.getElementById('breadcrumbBar').innerHTML = html;
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + (window.appName || 'My Life') + '</a>';
}

function _woEsc(text) {
    var d = document.createElement('div');
    d.textContent = text == null ? '' : String(text);
    return d.innerHTML;
}

// ─── Page loaders (filled in by later chunks) ─────────────────────────────────

function loadWorkoutExercisesPage() {
    _woSetChrome([['Exercises']]);
    document.getElementById('page-workout-exercises').innerHTML =
        '<div class="page-header"><h2>Exercises</h2></div>' +
        '<p class="empty-state">Exercise library coming together…</p>';
}

function loadWorkoutExercisePage(id) {
    _woSetChrome([['Exercises', '#workout-exercises'], [id === 'new' ? 'New Exercise' : 'Edit Exercise']]);
    document.getElementById('page-workout-exercise').innerHTML =
        '<div class="page-header"><h2>Exercise</h2></div>';
}

function loadWorkoutsPage() {
    _woSetChrome([['Workouts']]);
    document.getElementById('page-workouts').innerHTML =
        '<div class="page-header"><h2>Workouts</h2></div>' +
        '<p class="empty-state">Workout builder coming together…</p>';
}

function loadWorkoutBuilderPage(id) {
    _woSetChrome([['Workouts', '#workouts'], [id === 'new' ? 'New Workout' : 'Edit Workout']]);
    document.getElementById('page-workout').innerHTML =
        '<div class="page-header"><h2>Workout</h2></div>';
}
