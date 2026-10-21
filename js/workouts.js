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

// ─── Seed data (WorkoutsPlan.md §3.1a / §3.4) ─────────────────────────────────

// Muscles grouped by area. Doc id = slug, so exercises reference muscles by slug.
// Areas: 'cardio' | 'upper' | 'core' | 'lower'. The area is looked up from the muscle,
// never stored on an exercise.
var WO_AREAS = [
    { id: 'cardio', label: 'Cardio' },
    { id: 'upper',  label: 'Upper Body' },
    { id: 'core',   label: 'Core' },
    { id: 'lower',  label: 'Lower Body' }
];

var WO_DEFAULT_MUSCLES = [
    { id: 'cardio',          name: 'Cardio',          area: 'cardio' },
    { id: 'chest',           name: 'Chest',           area: 'upper' },
    { id: 'front-shoulders', name: 'Front shoulders', area: 'upper' },
    { id: 'shoulders',       name: 'Shoulders',       area: 'upper' },
    { id: 'rear-shoulders',  name: 'Rear shoulders',  area: 'upper' },
    { id: 'upper-back',      name: 'Upper back',      area: 'upper' },
    { id: 'lats',            name: 'Lats',            area: 'upper' },
    { id: 'traps',           name: 'Traps',           area: 'upper' },
    { id: 'biceps',          name: 'Biceps',          area: 'upper' },
    { id: 'triceps',         name: 'Triceps',         area: 'upper' },
    { id: 'forearms',        name: 'Forearms',        area: 'upper' },
    { id: 'abs',             name: 'Abs',             area: 'core' },
    { id: 'obliques',        name: 'Obliques',        area: 'core' },
    { id: 'lower-back',      name: 'Lower back',      area: 'core' },
    { id: 'glutes',          name: 'Glutes',          area: 'lower' },
    { id: 'hips',            name: 'Hips',            area: 'lower' },
    { id: 'quads',           name: 'Quads',           area: 'lower' },
    { id: 'hamstrings',      name: 'Hamstrings',      area: 'lower' },
    { id: 'calves',          name: 'Calves',          area: 'lower' }
];

// t = targets as 'slug' (also works) or '*slug' (main target).
// pp = push / pull ('push' | 'pull' | 'both' | 'neither').
var WO_DEFAULT_EXERCISES = [
    { name: 'Push-up', measure: 'reps', amount: 10, pp: 'push', equip: [],
      cues: ['Hands under shoulders, body in one straight line', 'Lower until your chest is a fist from the floor', 'Press up without letting your hips sag'],
      t: ['*chest', 'triceps', 'front-shoulders', 'abs'] },
    { name: 'Squat (bodyweight)', measure: 'reps', amount: 15, pp: 'push', equip: [],
      cues: ['Feet shoulder-width, toes slightly out', 'Sit back and down, knees tracking over toes', 'Drive through your heels to stand'],
      t: ['*quads', '*glutes', 'hamstrings'] },
    { name: 'Lunge', measure: 'reps', amount: 10, pp: 'push', equip: [], side: true,
      cues: ['Long step forward, torso upright', 'Back knee drops toward the floor', 'Push off the front foot to return'],
      t: ['*quads', '*glutes', 'hamstrings', 'calves'] },
    { name: 'Plank', measure: 'time', amount: 30, pp: 'neither', equip: [],
      cues: ['Forearms under shoulders, body in a straight line', 'Squeeze glutes and brace your abs', 'Keep breathing; do not let hips sag or pike'],
      t: ['*abs', 'obliques', 'lower-back', 'shoulders'] },
    { name: 'Side plank', measure: 'time', amount: 20, pp: 'neither', equip: [], side: true,
      cues: ['Elbow under shoulder, feet stacked', 'Lift hips so your body is one line', 'Keep hips from rotating forward or back'],
      t: ['*obliques', 'abs', 'hips'] },
    { name: 'Glute bridge', measure: 'reps', amount: 15, pp: 'push', equip: [],
      cues: ['Lie on your back, knees bent, feet flat', 'Press through heels and lift hips', 'Squeeze glutes at the top, lower with control'],
      t: ['*glutes', 'hamstrings', 'lower-back'] },
    { name: 'Burpee', measure: 'reps', amount: 8, pp: 'both', equip: [],
      cues: ['Squat, hands down, jump feet back to a plank', 'Chest to floor (optional push-up), jump feet in', 'Explode up into a jump'],
      t: ['*cardio', 'chest', 'quads', 'shoulders'] },
    { name: 'Mountain climbers', measure: 'time', amount: 30, pp: 'neither', equip: [],
      cues: ['High plank, hands under shoulders', 'Drive knees toward your chest, alternating fast', 'Keep hips low and core tight'],
      t: ['*cardio', '*abs', 'shoulders', 'hips'] },
    { name: 'Jumping jacks', measure: 'time', amount: 30, pp: 'neither', equip: [],
      cues: ['Jump feet wide while arms sweep overhead', 'Land softly on the balls of your feet', 'Keep a steady rhythm'],
      t: ['*cardio', 'calves', 'shoulders'] },
    { name: 'Dips (chair/bench)', measure: 'reps', amount: 10, pp: 'push', equip: ['Chair'],
      cues: ['Hands on the edge, fingers forward, hips off the seat', 'Lower until elbows reach about 90 degrees', 'Press up, keeping shoulders down'],
      t: ['*triceps', 'chest', 'front-shoulders'] },
    { name: 'Pull-up', measure: 'reps', amount: 5, pp: 'pull', equip: ['Pull-up bar'],
      cues: ['Hang with arms straight, shoulders engaged', 'Pull your chest toward the bar', 'Lower all the way with control'],
      t: ['*lats', 'biceps', 'upper-back', 'forearms'] },
    { name: 'Superman hold', measure: 'time', amount: 20, pp: 'neither', equip: [],
      cues: ['Lie face down, arms extended overhead', 'Lift arms, chest and legs a few inches', 'Squeeze glutes and hold, neck neutral'],
      t: ['*lower-back', 'glutes', 'upper-back'] },
    { name: 'Crunch', measure: 'reps', amount: 15, pp: 'neither', equip: [],
      cues: ['Knees bent, hands light behind your head', 'Curl shoulders off the floor using your abs', 'Lower slowly; do not yank your neck'],
      t: ['*abs'] },
    { name: 'Wall sit', measure: 'time', amount: 45, pp: 'neither', equip: [],
      cues: ['Back flat against the wall', 'Thighs parallel to the floor, knees over ankles', 'Hold and breathe steadily'],
      t: ['*quads', 'glutes', 'calves'] },
    { name: 'Goblet squat', measure: 'reps', amount: 10, weight: 25, pp: 'push', equip: ['Dumbbell'],
      cues: ['Hold one dumbbell vertically at your chest', 'Sit between your hips, chest tall', 'Drive up through your heels'],
      t: ['*quads', '*glutes', 'abs'] },
    { name: 'Dumbbell row', measure: 'reps', amount: 10, weight: 25, pp: 'pull', equip: ['Dumbbell'], side: true,
      cues: ['One hand and knee on a bench, flat back', 'Pull the dumbbell toward your hip', 'Squeeze the shoulder blade, lower slowly'],
      t: ['*lats', 'upper-back', 'biceps', 'rear-shoulders'] },
    { name: 'Shoulder press', measure: 'reps', amount: 10, weight: 20, pp: 'push', equip: ['Dumbbells'],
      cues: ['Dumbbells at shoulder height, core braced', 'Press straight overhead without arching your back', 'Lower to ear level with control'],
      t: ['*shoulders', 'triceps', 'upper-back'] },
    { name: 'Bicep curl', measure: 'reps', amount: 12, weight: 20, pp: 'pull', equip: ['Dumbbells'],
      cues: ['Elbows pinned to your sides', 'Curl up without swinging your torso', 'Lower slowly for the full range'],
      t: ['*biceps', 'forearms'] },
    { name: 'Romanian deadlift', measure: 'reps', amount: 10, weight: 30, pp: 'pull', equip: ['Dumbbells'],
      cues: ['Soft knees, dumbbells close to your legs', 'Push hips back, back flat, until you feel a hamstring stretch', 'Drive hips forward to stand tall'],
      t: ['*hamstrings', '*glutes', 'lower-back'] },
    { name: 'Farmer carry', measure: 'time', amount: 45, weight: 40, pp: 'neither', equip: ['Dumbbells'],
      cues: ['Heavy dumbbell in each hand, shoulders back', 'Walk tall with short, steady steps', 'Do not let the weights swing or your shoulders shrug'],
      t: ['*forearms', 'traps', 'abs', 'cardio'] }
];

var _woSeedPromise = null;

/**
 * Seeds the muscle list and the 20 starter exercises the first time the library is
 * used. A flag doc (workoutMeta/seed) makes it run exactly once — deleting every
 * exercise later does NOT bring them back. Safe to call from every page.
 */
function woEnsureSeeded() {
    if (!_woSeedPromise) _woSeedPromise = _woSeedLibrary();
    return _woSeedPromise;
}

async function _woSeedLibrary() {
    try {
        var flag = await woLibCol('workoutMeta').doc('seed').get();
        if (flag.exists) return;

        var ts    = firebase.firestore.FieldValue.serverTimestamp();
        var batch = db.batch();

        WO_DEFAULT_MUSCLES.forEach(function(m, i) {
            batch.set(woLibCol('workoutMuscles').doc(m.id), {
                name: m.name, area: m.area, sortOrder: i, createdAt: ts
            });
        });

        WO_DEFAULT_EXERCISES.forEach(function(e) {
            batch.set(woLibCol('workoutExercises').doc(), {
                name:          e.name,
                instructions:  e.cues.join('\n'),
                measure:       e.measure,                 // 'reps' | 'time'
                defaultAmount: e.amount,                  // reps, or seconds
                usesWeight:    e.weight != null,
                defaultWeight: e.weight != null ? e.weight : null,
                eachSide:      !!e.side,
                equipment:     e.equip,
                targets:       e.t.map(function(t) {
                    return t.charAt(0) === '*' ? { muscleId: t.slice(1), main: true }
                                               : { muscleId: t,          main: false };
                }),
                pushPull:      e.pp,
                videoUrl:      '',
                archived:      false,
                isSeeded:      true,
                createdAt:     ts
            });
        });

        batch.set(woLibCol('workoutMeta').doc('seed'), { done: true, version: 1, createdAt: ts });
        await batch.commit();
        console.log('Workouts: seeded ' + WO_DEFAULT_MUSCLES.length + ' muscles and ' +
                    WO_DEFAULT_EXERCISES.length + ' exercises.');
    } catch (err) {
        console.error('Workouts: failed to seed library:', err);
        _woSeedPromise = null;   // allow a retry on the next visit
    }
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
    woEnsureSeeded();
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
    woEnsureSeeded();
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
