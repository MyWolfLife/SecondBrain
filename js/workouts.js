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

// ─── Library helpers ──────────────────────────────────────────────────────────

var WO_PUSHPULL = {
    push:    { label: 'Push',    cls: 'wo-badge--push' },
    pull:    { label: 'Pull',    cls: 'wo-badge--pull' },
    both:    { label: 'Both',    cls: 'wo-badge--both' },
    neither: { label: 'Neither', cls: 'wo-badge--neither' }
};

var WO_EQUIPMENT_PRESETS = ['Chair', 'Bench', 'Mat', 'Dumbbell', 'Dumbbells', 'Kettlebell',
                            'Barbell', 'Resistance band', 'Pull-up bar'];

var _woMuscles   = [];   // [{id, name, area, sortOrder}] sorted by sortOrder
var _woMuscleMap = {};   // id → muscle

/** Loads the muscle list (seeding the library first if this is the very first visit). */
async function woLoadMuscles() {
    await woEnsureSeeded();
    var snap = await woLibCol('workoutMuscles').get();
    _woMuscles = snap.docs.map(function(d) { var m = d.data(); m.id = d.id; return m; });
    _woMuscles.sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
    _woMuscleMap = {};
    _woMuscles.forEach(function(m) { _woMuscleMap[m.id] = m; });
}

/** "10 reps", "30 sec", "10 reps @ 25 lb", "45 sec @ 40 lb" */
function woFmtAmount(measure, amount, weight) {
    var out = '';
    if (amount != null && amount !== '') {
        if (measure === 'time') {
            out = amount >= 120 && amount % 60 === 0 ? (amount / 60) + ' min' : amount + ' sec';
        } else {
            out = amount + ' reps';
        }
    }
    if (weight != null && weight !== '') out += (out ? ' @ ' : '') + weight + ' lb';
    return out;
}

function _woPushPullBadge(pp) {
    var b = WO_PUSHPULL[pp] || WO_PUSHPULL.neither;
    return '<span class="wo-badge ' + b.cls + '">' + b.label + '</span>';
}

/** Muscle chips for an exercise: ★ main first, then also-works. */
function _woTargetChips(targets) {
    var main = [], also = [];
    (targets || []).forEach(function(t) {
        var m = _woMuscleMap[t.muscleId];
        if (!m) return;
        (t.main ? main : also).push('<span class="wo-chip ' + (t.main ? 'wo-chip--main' : 'wo-chip--also') + '">' +
                                    (t.main ? '★ ' : '') + _woEsc(m.name) + '</span>');
    });
    return main.concat(also).join('');
}

// ─── Exercises list (#workout-exercises) ──────────────────────────────────────

var _woExercises = [];                       // all exercise docs, loaded each visit
var _woFilter = { text: '', area: '', muscle: '', equip: '', pp: '', archived: false };

async function loadWorkoutExercisesPage() {
    _woSetChrome([['Exercises']]);
    var el = document.getElementById('page-workout-exercises');
    el.innerHTML = '<div class="page-header"><h2>Exercises</h2></div><div class="ex-status">Loading…</div>';
    try {
        await woLoadMuscles();
        await woLoadExercises();
    } catch (err) {
        console.error('Workouts: failed to load exercises:', err);
        el.innerHTML = '<div class="page-header"><h2>Exercises</h2></div><div class="ex-status">Could not load exercises.</div>';
        return;
    }
    _woRenderExerciseListShell();
    _woRenderExerciseList();
}

function _woRenderExerciseListShell() {
    var el = document.getElementById('page-workout-exercises');

    var equip = {};
    _woExercises.forEach(function(e) { (e.equipment || []).forEach(function(q) { equip[q] = true; }); });
    var equipOpts = Object.keys(equip).sort().map(function(q) {
        return '<option value="' + _woEsc(q) + '"' + (_woFilter.equip === q ? ' selected' : '') + '>' + _woEsc(q) + '</option>';
    }).join('');

    var areaOpts = WO_AREAS.map(function(a) {
        return '<option value="' + a.id + '"' + (_woFilter.area === a.id ? ' selected' : '') + '>' + a.label + '</option>';
    }).join('');

    el.innerHTML =
        '<div class="page-header">' +
            '<h2>Exercises</h2>' +
            '<div class="page-header-actions">' +
                '<a href="#workout-exercise/new" class="btn btn-primary">+ New Exercise</a>' +
            '</div>' +
        '</div>' +
        '<div class="ex-toolbar">' +
            '<div class="ex-toolbar-row">' +
                '<input type="search" id="woFText" class="filter-input" placeholder="Search exercises…" value="' + _woEsc(_woFilter.text) + '">' +
            '</div>' +
            '<div class="ex-toolbar-row">' +
                '<select id="woFArea"><option value="">All areas</option>' + areaOpts + '</select>' +
                '<select id="woFMuscle"></select>' +
                '<select id="woFPushPull">' +
                    '<option value="">Push / Pull</option>' +
                    ['push', 'pull', 'both', 'neither'].map(function(k) {
                        return '<option value="' + k + '"' + (_woFilter.pp === k ? ' selected' : '') + '>' + WO_PUSHPULL[k].label + '</option>';
                    }).join('') +
                '</select>' +
                '<select id="woFEquip"><option value="">Any equipment</option>' + equipOpts + '</select>' +
                '<label class="wo-inline-check"><input type="checkbox" id="woFArchived"' + (_woFilter.archived ? ' checked' : '') + '> Show archived</label>' +
            '</div>' +
        '</div>' +
        '<div id="woExerciseCount" class="wo-count"></div>' +
        '<div id="woExerciseList"></div>';

    _woFillMuscleFilter();

    document.getElementById('woFText').addEventListener('input', function() { _woFilter.text = this.value; _woRenderExerciseList(); });
    document.getElementById('woFArea').addEventListener('change', function() {
        _woFilter.area = this.value; _woFilter.muscle = ''; _woFillMuscleFilter(); _woRenderExerciseList();
    });
    document.getElementById('woFMuscle').addEventListener('change', function() { _woFilter.muscle = this.value; _woRenderExerciseList(); });
    document.getElementById('woFPushPull').addEventListener('change', function() { _woFilter.pp = this.value; _woRenderExerciseList(); });
    document.getElementById('woFEquip').addEventListener('change', function() { _woFilter.equip = this.value; _woRenderExerciseList(); });
    document.getElementById('woFArchived').addEventListener('change', function() { _woFilter.archived = this.checked; _woRenderExerciseList(); });
}

/** Muscle dropdown shows only the chosen area's muscles (or all, grouped by area). */
function _woFillMuscleFilter() {
    var sel = document.getElementById('woFMuscle');
    var html = '<option value="">All muscles</option>';
    WO_AREAS.forEach(function(a) {
        if (_woFilter.area && _woFilter.area !== a.id) return;
        var ms = _woMuscles.filter(function(m) { return m.area === a.id; });
        if (!ms.length) return;
        html += '<optgroup label="' + a.label + '">' + ms.map(function(m) {
            return '<option value="' + m.id + '"' + (_woFilter.muscle === m.id ? ' selected' : '') + '>' + _woEsc(m.name) + '</option>';
        }).join('') + '</optgroup>';
    });
    sel.innerHTML = html;
}

/**
 * How well an exercise matches the area/muscle filter.
 * Returns 0 = no match, 2 = matches as a ★ main target, 1 = matches as also-works.
 * With no area/muscle filter every exercise "matches" (returns 1).
 */
function _woTargetMatch(ex) {
    if (!_woFilter.area && !_woFilter.muscle) return 1;
    var best = 0;
    (ex.targets || []).forEach(function(t) {
        var m = _woMuscleMap[t.muscleId];
        if (!m) return;
        if (_woFilter.muscle && t.muscleId !== _woFilter.muscle) return;
        if (_woFilter.area && m.area !== _woFilter.area) return;
        best = Math.max(best, t.main ? 2 : 1);
    });
    return best;
}

function _woRenderExerciseList() {
    var f = _woFilter;
    var text = f.text.trim().toLowerCase();
    var rows = _woExercises.filter(function(e) {
        if (e.archived && !f.archived) return false;
        if (text && (e.name || '').toLowerCase().indexOf(text) === -1) return false;
        if (f.pp && e.pushPull !== f.pp) return false;
        if (f.equip && (e.equipment || []).indexOf(f.equip) === -1) return false;
        return _woTargetMatch(e) > 0;
    });

    // Main-target matches first, then also-works, then alphabetical
    rows.sort(function(a, b) {
        var d = _woTargetMatch(b) - _woTargetMatch(a);
        return d !== 0 ? d : (a.name || '').localeCompare(b.name || '');
    });

    document.getElementById('woExerciseCount').textContent =
        rows.length + ' exercise' + (rows.length === 1 ? '' : 's');

    var list = document.getElementById('woExerciseList');
    if (!rows.length) {
        list.innerHTML = '<div class="ex-status">No exercises match. Try clearing a filter, or add a new one.</div>';
        return;
    }
    list.innerHTML = rows.map(function(e) {
        var meta = woFmtAmount(e.measure, e.defaultAmount, e.usesWeight ? e.defaultWeight : null);
        if (e.eachSide) meta += ' · each side';
        var equip = (e.equipment || []).length ? ' · ' + _woEsc(e.equipment.join(', ')) : '';
        return '<a href="#workout-exercise/' + e.id + '" class="wo-card' + (e.archived ? ' wo-card--archived' : '') + '">' +
                   '<div class="wo-thumb">' + (e.thumbData ? '<img src="' + e.thumbData + '" alt="">' : '🤸') + '</div>' +
                   '<div class="wo-card-main">' +
                       '<div class="wo-card-name">' + _woEsc(e.name) + '</div>' +
                       '<div class="wo-badges">' +
                           _woPushPullBadge(e.pushPull) +
                           (e.archived ? '<span class="wo-badge wo-badge--archived">Archived</span>' : '') +
                       '</div>' +
                       '<div class="wo-card-meta">' + _woEsc(meta) + equip + '</div>' +
                       '<div class="wo-chips">' + _woTargetChips(e.targets) + '</div>' +
                   '</div>' +
               '</a>';
    }).join('');
}

// ─── Exercise editor (#workout-exercise/new, #workout-exercise/:id) ───────────

var _woEdit = null;   // working copy of the exercise being edited
var _woJustAdded = false;   // show the 'added — now add pictures' banner on the next editor load

async function loadWorkoutExercisePage(id) {
    var isNew = (id === 'new');
    _woSetChrome([['Exercises', '#workout-exercises'], [isNew ? 'New Exercise' : 'Edit Exercise']]);
    var el = document.getElementById('page-workout-exercise');
    el.innerHTML = '<div class="page-header"><h2>' + (isNew ? 'New Exercise' : 'Edit Exercise') + '</h2></div><div class="ex-status">Loading…</div>';

    try {
        await woLoadMuscles();
        if (isNew) {
            _woEdit = { id: null, name: '', instructions: '', measure: 'reps', defaultAmount: 10,
                        usesWeight: false, defaultWeight: null, eachSide: false, equipment: [],
                        targets: [], pushPull: 'neither', videoUrl: '', archived: false };
        } else {
            var doc = await woLibCol('workoutExercises').doc(id).get();
            if (!doc.exists) { el.innerHTML = '<div class="ex-status">Exercise not found.</div>'; return; }
            _woEdit = doc.data();
            _woEdit.id = doc.id;
            _woEdit.equipment = (_woEdit.equipment || []).slice();
            _woEdit.targets   = (_woEdit.targets   || []).map(function(t) { return { muscleId: t.muscleId, main: !!t.main }; });
        }
    } catch (err) {
        console.error('Workouts: failed to load exercise:', err);
        el.innerHTML = '<div class="ex-status">Could not load this exercise.</div>';
        return;
    }
    _woRenderExerciseEditor();
}

function _woTargetState(muscleId) {
    var t = _woEdit.targets.filter(function(x) { return x.muscleId === muscleId; })[0];
    return t ? (t.main ? 'main' : 'also') : 'off';
}

function _woRenderExerciseEditor() {
    var e     = _woEdit;
    var isNew = !e.id;
    var el    = document.getElementById('page-workout-exercise');

    var allEquip = WO_EQUIPMENT_PRESETS.slice();
    e.equipment.forEach(function(q) { if (allEquip.indexOf(q) === -1) allEquip.push(q); });

    var targetsHtml = WO_AREAS.map(function(a) {
        var ms = _woMuscles.filter(function(m) { return m.area === a.id; });
        if (!ms.length) return '';
        return '<div class="wo-target-area"><div class="wo-target-area-label">' + a.label + '</div><div class="wo-chips">' +
            ms.map(function(m) {
                var st = _woTargetState(m.id);
                return '<button type="button" class="wo-chip-toggle" data-muscle="' + m.id + '" data-state="' + st + '">' +
                       (st === 'main' ? '★ ' : '') + _woEsc(m.name) + '</button>';
            }).join('') + '</div></div>';
    }).join('');

    el.innerHTML =
        '<div class="page-header"><h2>' + (isNew ? 'New Exercise' : 'Edit Exercise') + '</h2></div>' +
        '<div class="ex-form">' +

            '<div class="ex-form-group">' +
                '<label class="ex-label" for="woeName">Name <span class="ex-required">*</span></label>' +
                '<input type="text" id="woeName" value="' + _woEsc(e.name) + '" placeholder="e.g. Push-up" maxlength="80">' +
            '</div>' +

            '<div class="ex-form-group">' +
                '<label class="ex-label">Measured by</label>' +
                '<div class="wo-radio-row">' +
                    '<label><input type="radio" name="woeMeasure" value="reps"' + (e.measure === 'reps' ? ' checked' : '') + '> Reps</label>' +
                    '<label><input type="radio" name="woeMeasure" value="time"' + (e.measure === 'time' ? ' checked' : '') + '> Time</label>' +
                '</div>' +
            '</div>' +

            '<div class="ex-form-group">' +
                '<label class="ex-label" for="woeAmount" id="woeAmountLabel"></label>' +
                '<input type="number" id="woeAmount" min="1" step="1" value="' + (e.defaultAmount != null ? e.defaultAmount : '') + '">' +
            '</div>' +

            '<div class="ex-form-group">' +
                '<label class="wo-inline-check"><input type="checkbox" id="woeUsesWeight"' + (e.usesWeight ? ' checked' : '') + '> Uses weight</label>' +
                '<div id="woeWeightRow" class="' + (e.usesWeight ? '' : 'hidden') + '" style="margin-top:8px;">' +
                    '<label class="ex-label" for="woeWeight">Default weight (lb)</label>' +
                    '<input type="number" id="woeWeight" min="0" step="0.5" value="' + (e.defaultWeight != null ? e.defaultWeight : '') + '">' +
                '</div>' +
            '</div>' +

            '<div class="ex-form-group">' +
                '<label class="wo-inline-check"><input type="checkbox" id="woeEachSide"' + (e.eachSide ? ' checked' : '') + '> Each side (one arm / one leg — the player runs it twice)</label>' +
            '</div>' +

            '<div class="ex-form-group">' +
                '<label class="ex-label" for="woePushPull">Push / Pull</label>' +
                '<select id="woePushPull">' +
                    ['push', 'pull', 'both', 'neither'].map(function(k) {
                        return '<option value="' + k + '"' + (e.pushPull === k ? ' selected' : '') + '>' + WO_PUSHPULL[k].label + '</option>';
                    }).join('') +
                '</select>' +
            '</div>' +

            '<div class="ex-form-group">' +
                '<label class="ex-label">What it works <span class="wo-hint">tap once = ★ main, twice = also works, third = off</span></label>' +
                targetsHtml +
            '</div>' +

            '<div class="ex-form-group">' +
                '<label class="ex-label">Equipment</label>' +
                '<div class="wo-chips" id="woeEquip">' +
                    allEquip.map(function(q) {
                        return '<button type="button" class="wo-chip-toggle" data-equip="' + _woEsc(q) + '" data-state="' +
                               (e.equipment.indexOf(q) !== -1 ? 'main' : 'off') + '">' + _woEsc(q) + '</button>';
                    }).join('') +
                '</div>' +
                '<div class="wo-add-equip"><input type="text" id="woeEquipNew" placeholder="Other equipment…" maxlength="40">' +
                    '<button type="button" class="btn btn-secondary btn-small" id="woeEquipAdd">Add</button></div>' +
            '</div>' +

            '<div class="ex-form-group">' +
                '<label class="ex-label" for="woeCues">How to do it / form cues</label>' +
                '<textarea id="woeCues" rows="4" placeholder="One cue per line">' + _woEsc(e.instructions) + '</textarea>' +
            '</div>' +

            '<div class="ex-form-group">' +
                '<label class="ex-label" for="woeVideo">Video link (optional)</label>' +
                '<input type="url" id="woeVideo" value="' + _woEsc(e.videoUrl) + '" placeholder="https://…">' +
            '</div>' +

            '<div class="ex-form-group" id="woeFramesGroup">' +
                '<label class="ex-label">Pictures</label>' +
                '<p class="wo-hint">' + (isNew ? 'Add the exercise first — you will then be able to add the pictures that show the motion.' : 'Loading…') + '</p>' +
            '</div>' +

            '<div class="ex-form-actions">' +
                '<button type="button" class="btn btn-primary" id="woeSave">' + (isNew ? 'Add Exercise' : 'Save') + '</button>' +
                '<a href="#workout-exercises" class="btn btn-secondary">Cancel</a>' +
                (isNew ? '' :
                    '<a href="#workout-exercise-history/' + e.id + '" class="btn btn-secondary">📈 History</a>' +
                    '<button type="button" class="btn btn-secondary" id="woeArchive">' + (e.archived ? 'Unarchive' : 'Archive') + '</button>' +
                    '<button type="button" class="btn btn-danger" id="woeDelete">Delete</button>') +
            '</div>' +
        '</div>';

    _woUpdateAmountLabel();

    el.querySelectorAll('input[name="woeMeasure"]').forEach(function(r) {
        r.addEventListener('change', function() { _woEdit.measure = this.value; _woUpdateAmountLabel(); });
    });
    document.getElementById('woeUsesWeight').addEventListener('change', function() {
        document.getElementById('woeWeightRow').classList.toggle('hidden', !this.checked);
    });

    // Target chips: off → ★ main → also → off
    el.querySelectorAll('.wo-chip-toggle[data-muscle]').forEach(function(btn) {
        btn.addEventListener('click', function() { _woCycleTarget(this); });
    });
    // Equipment chips: on / off
    el.querySelectorAll('.wo-chip-toggle[data-equip]').forEach(function(btn) {
        btn.addEventListener('click', function() { _woToggleEquip(this); });
    });
    document.getElementById('woeEquipAdd').addEventListener('click', _woAddCustomEquip);
    document.getElementById('woeEquipNew').addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); _woAddCustomEquip(); }
    });

    document.getElementById('woeSave').addEventListener('click', _woSaveExercise);
    var arch = document.getElementById('woeArchive');
    if (arch) arch.addEventListener('click', _woArchiveExercise);
    var del = document.getElementById('woeDelete');
    if (del) del.addEventListener('click', _woDeleteExercise);

    // Pictures (existing exercises only — a new one has no id to attach frames to yet)
    if (!isNew) {
        _woLoadFrames().then(_woRenderFrames).catch(function(err) {
            console.error('Workouts: failed to load frames:', err);
            var g = document.getElementById('woeFramesGroup');
            if (g) g.innerHTML = '<label class="ex-label">Pictures</label><p class="wo-hint">Could not load pictures.</p>';
        });
        if (_woJustAdded) {
            _woJustAdded = false;
            var banner = document.createElement('div');
            banner.className = 'wo-banner';
            banner.textContent = '✓ Exercise added. Add its pictures below, or go back to Exercises when you are done.';
            el.querySelector('.ex-form').insertBefore(banner, el.querySelector('.ex-form').firstChild);
        }
    }
}

function _woUpdateAmountLabel() {
    var lbl = document.getElementById('woeAmountLabel');
    if (lbl) lbl.textContent = _woEdit.measure === 'time' ? 'Default time (seconds)' : 'Default reps';
}

function _woCycleTarget(btn) {
    var id = btn.getAttribute('data-muscle');
    var st = _woTargetState(id);
    _woEdit.targets = _woEdit.targets.filter(function(t) { return t.muscleId !== id; });
    var next = st === 'off' ? 'main' : (st === 'main' ? 'also' : 'off');
    if (next === 'main') _woEdit.targets.push({ muscleId: id, main: true });
    if (next === 'also') _woEdit.targets.push({ muscleId: id, main: false });
    btn.setAttribute('data-state', next);
    btn.textContent = (next === 'main' ? '★ ' : '') + (_woMuscleMap[id] ? _woMuscleMap[id].name : id);
}

function _woToggleEquip(btn) {
    var q = btn.getAttribute('data-equip');
    var i = _woEdit.equipment.indexOf(q);
    if (i === -1) { _woEdit.equipment.push(q); btn.setAttribute('data-state', 'main'); }
    else          { _woEdit.equipment.splice(i, 1); btn.setAttribute('data-state', 'off'); }
}

function _woAddCustomEquip() {
    var input = document.getElementById('woeEquipNew');
    var q = input.value.trim();
    if (!q) return;
    var exists = Array.prototype.some.call(document.querySelectorAll('#woeEquip [data-equip]'), function(b) {
        return b.getAttribute('data-equip').toLowerCase() === q.toLowerCase();
    });
    if (!exists) {
        if (_woEdit.equipment.indexOf(q) === -1) _woEdit.equipment.push(q);
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'wo-chip-toggle';
        b.setAttribute('data-equip', q);
        b.setAttribute('data-state', 'main');
        b.textContent = q;
        b.addEventListener('click', function() { _woToggleEquip(this); });
        document.getElementById('woeEquip').appendChild(b);
    }
    input.value = '';
}

async function _woSaveExercise() {
    var name = document.getElementById('woeName').value.trim();
    if (!name) { alert('Please enter a name for the exercise.'); document.getElementById('woeName').focus(); return; }

    var amount = parseInt(document.getElementById('woeAmount').value, 10);
    var usesWeight = document.getElementById('woeUsesWeight').checked;
    var weightRaw  = document.getElementById('woeWeight').value;
    var weight = usesWeight && weightRaw !== '' ? parseFloat(weightRaw) : null;

    var data = {
        name:          name,
        instructions:  document.getElementById('woeCues').value.trim(),
        measure:       _woEdit.measure,
        defaultAmount: isNaN(amount) ? null : amount,
        usesWeight:    usesWeight,
        defaultWeight: weight,
        eachSide:      document.getElementById('woeEachSide').checked,
        equipment:     _woEdit.equipment,
        targets:       _woEdit.targets,
        pushPull:      document.getElementById('woePushPull').value,
        videoUrl:      document.getElementById('woeVideo').value.trim(),
        archived:      !!_woEdit.archived
    };

    var btn = document.getElementById('woeSave');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
        if (_woEdit.id) {
            await woLibCol('workoutExercises').doc(_woEdit.id).update(data);
        } else {
            data.isSeeded  = false;
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            var ref = await woLibCol('workoutExercises').add(data);
            _woJustAdded = true;
            location.hash = '#workout-exercise/' + ref.id;     // straight on to adding pictures
            return;
        }
        location.hash = '#workout-exercises';
    } catch (err) {
        console.error('Workouts: save exercise failed:', err);
        alert('Failed to save. Please try again.');
        btn.disabled = false;
        btn.textContent = _woEdit.id ? 'Save' : 'Add Exercise';
    }
}

async function _woArchiveExercise() {
    try {
        await woLibCol('workoutExercises').doc(_woEdit.id).update({ archived: !_woEdit.archived });
        location.hash = '#workout-exercises';
    } catch (err) {
        console.error('Workouts: archive failed:', err);
        alert('Failed to update. Please try again.');
    }
}

async function _woDeleteExercise() {
    // Is it used by any workout? (workouts store exerciseIds[] for exactly this lookup)
    try {
        var used = await woLibCol('workouts').where('exerciseIds', 'array-contains', _woEdit.id).get();
        if (!used.empty) {
            var names = used.docs.map(function(d) { return d.data().name; }).join(', ');
            if (confirm('"' + _woEdit.name + '" is used in: ' + names + '.\n\nDeleting it would leave those workouts pointing at a missing exercise.\n\nArchive it instead? (It disappears from lists but stays in those workouts.)')) {
                await _woArchiveExercise();
            }
            return;
        }
    } catch (err) {
        console.error('Workouts: could not check exercise usage:', err);
        alert('Could not check whether this exercise is used in a workout. Please try again.');
        return;
    }
    if (!confirm('Delete "' + _woEdit.name + '"? This cannot be undone. (Archive it instead to hide it but keep it in existing workouts.)')) return;
    try {
        var frames = await woLibCol('photos').where('targetType', '==', 'workoutExercise').where('targetId', '==', _woEdit.id).get();
        var batch = db.batch();
        frames.forEach(function(d) { batch.delete(d.ref); });
        batch.delete(woLibCol('workoutExercises').doc(_woEdit.id));
        await batch.commit();
        location.hash = '#workout-exercises';
    } catch (err) {
        console.error('Workouts: delete exercise failed:', err);
        alert('Failed to delete. Please try again.');
    }
}

// ─── Exercise frames: the pictures that show the motion (chunk 1.5) ───────────
//
// Each frame is one photo doc in the `photos` collection (targetType 'workoutExercise',
// targetId = exercise id, frameOrder = position). The first frame is also copied onto the
// exercise doc as a small `thumbData` so the list can show thumbnails without extra queries.

var WO_FRAME_MAX_DIM    = 720;      // px, longest side
var WO_FRAME_MAX_BASE64 = 150000;   // ~110 KB — several frames per exercise stay light
var WO_FLIP_MS          = 800;      // flipbook speed (ms per frame)

var _woFrames    = [];     // [{id, imageData, frameOrder}] in display order
var _woFlipTimer = null;

async function _woLoadFrames() {
    var snap = await woLibCol('photos')
        .where('targetType', '==', 'workoutExercise')
        .where('targetId', '==', _woEdit.id).get();
    _woFrames = snap.docs.map(function(d) {
        var p = d.data();
        return { id: d.id, imageData: p.imageData, frameOrder: p.frameOrder || 0 };
    });
    _woFrames.sort(function(a, b) { return a.frameOrder - b.frameOrder; });
}

function _woRenderFrames() {
    var group = document.getElementById('woeFramesGroup');
    if (!group) return;
    clearInterval(_woFlipTimer);

    var strip = _woFrames.map(function(f, i) {
        return '<div class="wo-frame">' +
                   '<img src="' + f.imageData + '" alt="Frame ' + (i + 1) + '">' +
                   '<div class="wo-frame-num">' + (i + 1) + '</div>' +
                   '<div class="wo-frame-btns">' +
                       '<button type="button" class="wo-frame-btn" data-act="left"  data-id="' + f.id + '"' + (i === 0 ? ' disabled' : '') + ' title="Move earlier">◀</button>' +
                       '<button type="button" class="wo-frame-btn" data-act="right" data-id="' + f.id + '"' + (i === _woFrames.length - 1 ? ' disabled' : '') + ' title="Move later">▶</button>' +
                       '<button type="button" class="wo-frame-btn wo-frame-btn--del" data-act="del" data-id="' + f.id + '" title="Delete frame">✕</button>' +
                   '</div>' +
               '</div>';
    }).join('');

    group.innerHTML =
        '<label class="ex-label">Pictures <span class="wo-hint">2–4 frames that show the motion: start, middle, end</span></label>' +
        (_woFrames.length
            ? '<div class="wo-flip-wrap"><img id="woeFlip" class="wo-flip" alt="Preview"><div class="wo-hint">Preview — how the player will show it</div></div>' +
              '<div class="wo-frame-strip">' + strip + '</div>'
            : '<p class="wo-hint">No pictures yet.</p>') +
        '<div class="wo-frame-actions">' +
            '<button type="button" class="btn btn-secondary btn-small" id="woeFrameCamera">📷 Camera</button>' +
            '<button type="button" class="btn btn-secondary btn-small" id="woeFrameGallery">🖼️ Gallery</button>' +
            '<button type="button" class="btn btn-secondary btn-small" id="woeFramePaste">📋 Paste</button>' +
            '<button type="button" class="btn btn-secondary btn-small" id="woeFrameVideo">🎞️ From video' + (_woGrabSupportsGif() ? ' / GIF' : '') + '</button>' +
        '</div>' +
        '<div id="woeFrameStatus" class="wo-hint"></div>';

    document.getElementById('woeFrameCamera').addEventListener('click', function() { _woPickFrameFile(true); });
    document.getElementById('woeFrameGallery').addEventListener('click', function() { _woPickFrameFile(false); });
    document.getElementById('woeFramePaste').addEventListener('click', _woPasteFrame);
    document.getElementById('woeFrameVideo').addEventListener('click', _woOpenGrabber);
    group.querySelectorAll('.wo-frame-btn').forEach(function(b) {
        b.addEventListener('click', function() {
            var act = this.getAttribute('data-act'), id = this.getAttribute('data-id');
            if (act === 'del') _woDeleteFrame(id); else _woMoveFrame(id, act === 'left' ? -1 : 1);
        });
    });

    _woStartFlipbook();
}

/** Cycles the preview <img> through the frames; stops itself when the page is left. */
function _woStartFlipbook() {
    var img = document.getElementById('woeFlip');
    if (!img || !_woFrames.length) return;
    var i = 0;
    img.src = _woFrames[0].imageData;
    if (_woFrames.length < 2) return;
    _woFlipTimer = setInterval(function() {
        var el = document.getElementById('woeFlip');
        if (!el) { clearInterval(_woFlipTimer); return; }
        i = (i + 1) % _woFrames.length;
        el.src = _woFrames[i].imageData;
    }, WO_FLIP_MS);
}

function _woFrameStatus(msg) {
    var el = document.getElementById('woeFrameStatus');
    if (el) el.textContent = msg || '';
}

/** Camera (forces the camera on phones) or gallery picker (multiple allowed). */
function _woPickFrameFile(useCamera) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (useCamera) input.capture = 'environment';
    else           input.multiple = true;
    input.addEventListener('change', async function() {
        var files = Array.prototype.slice.call(input.files || []);
        if (!files.length) return;
        await _woAddFrameFiles(files);
    });
    input.click();
}

async function _woPasteFrame() {
    if (!navigator.clipboard || !navigator.clipboard.read) {
        alert('Clipboard paste is not supported in this browser. Try Gallery instead.');
        return;
    }
    try {
        var items = await navigator.clipboard.read();
        var blob = null;
        for (var i = 0; i < items.length && !blob; i++) {
            var type = items[i].types.find(function(t) { return t.startsWith('image/'); });
            if (type) blob = await items[i].getType(type);
        }
        if (!blob) {
            alert('No image on the clipboard.\n\nIn Chrome: right-click an image and choose "Copy image", then click Paste here.');
            return;
        }
        await _woAddFrameFiles([new File([blob], 'pasted' + (blob.type === 'image/png' ? '.png' : '.jpg'), { type: blob.type })]);
    } catch (err) {
        if (err.name === 'NotAllowedError') alert('Clipboard access was denied.\n\nClick "Allow" when the browser asks, then try again.');
        else { console.error('Workouts: paste frame failed:', err); alert('Could not read the clipboard. Try Gallery instead.'); }
    }
}

/** One file → optional crop first; several files → added straight away. */
async function _woAddFrameFiles(files) {
    try {
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            if (files.length === 1 && typeof showCropPreview === 'function') {
                try { file = await showCropPreview(file); }
                catch (e) { return; }                      // user cancelled
            }
            _woFrameStatus('Adding picture…');
            var dataUrl = await compressImage(file, { maxDimension: WO_FRAME_MAX_DIM, maxBase64: WO_FRAME_MAX_BASE64 });
            await woAddFrameData(dataUrl);
        }
    } catch (err) {
        console.error('Workouts: add frame failed:', err);
        alert('Could not add the picture. Please try again.');
    }
    _woFrameStatus('');
}

/** Saves one already-compressed frame (also used by the video/GIF grabber). */
async function woAddFrameData(dataUrl) {
    var next = _woFrames.length ? _woFrames[_woFrames.length - 1].frameOrder + 1 : 0;
    var ref = await woLibCol('photos').add({
        targetType: 'workoutExercise',
        targetId:   _woEdit.id,
        imageData:  dataUrl,
        caption:    '',
        frameOrder: next,
        createdAt:  firebase.firestore.FieldValue.serverTimestamp()
    });
    _woFrames.push({ id: ref.id, imageData: dataUrl, frameOrder: next });
    await _woAfterFramesChanged();
}

async function _woMoveFrame(id, dir) {
    var i = _woFrames.findIndex(function(f) { return f.id === id; });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= _woFrames.length) return;
    var a = _woFrames[i], b = _woFrames[j];
    try {
        var batch = db.batch();
        batch.update(woLibCol('photos').doc(a.id), { frameOrder: b.frameOrder });
        batch.update(woLibCol('photos').doc(b.id), { frameOrder: a.frameOrder });
        await batch.commit();
        var t = a.frameOrder; a.frameOrder = b.frameOrder; b.frameOrder = t;
        _woFrames.sort(function(x, y) { return x.frameOrder - y.frameOrder; });
        await _woAfterFramesChanged();
    } catch (err) {
        console.error('Workouts: move frame failed:', err);
        alert('Could not reorder. Please try again.');
    }
}

async function _woDeleteFrame(id) {
    if (!confirm('Delete this picture?')) return;
    try {
        await woLibCol('photos').doc(id).delete();
        _woFrames = _woFrames.filter(function(f) { return f.id !== id; });
        await _woAfterFramesChanged();
    } catch (err) {
        console.error('Workouts: delete frame failed:', err);
        alert('Could not delete. Please try again.');
    }
}

/** Keeps the exercise's list thumbnail in sync with its first frame, then redraws. */
async function _woAfterFramesChanged() {
    try {
        var thumb = _woFrames.length ? await _compressToThumb(_woFrames[0].imageData) : null;
        await woLibCol('workoutExercises').doc(_woEdit.id).update({
            thumbData: thumb !== null ? thumb : firebase.firestore.FieldValue.delete()
        });
    } catch (err) {
        console.error('Workouts: thumbnail update failed:', err);
    }
    _woRenderFrames();
}

// ─── Frames from a video or GIF (chunk 1.6) ───────────────────────────────────
//
// 🎞️ From video / GIF opens a picker overlay.
//   Video: pick a clip (e.g. phone video of one rep) → scrub → "Grab frame" at start / middle / end,
//          or "Auto 3 frames" (evenly spaced). The clip is never stored — only the grabbed stills.
//   GIF:   pick a GIF → Chrome's ImageDecoder reads its frames → app offers 4 evenly spaced
//          stills (tap to select/deselect) → Add. Hidden if the browser has no ImageDecoder.

var _woGrab = null;   // {kind:'video'|'gif', url, video, gifFrames:[{dataUrl, on}], grabbed:[dataUrl]}

function _woGrabSupportsGif() { return typeof ImageDecoder !== 'undefined'; }

function _woOpenGrabber() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = _woGrabSupportsGif() ? 'video/*,image/gif' : 'video/*';
    input.addEventListener('change', function() {
        var file = input.files && input.files[0];
        if (!file) return;
        if (file.type === 'image/gif') _woGrabStartGif(file);
        else                           _woGrabStartVideo(file);
    });
    input.click();
}

function _woGrabOverlay(innerHtml) {
    _woCloseGrabber();
    var ov = document.createElement('div');
    ov.id = 'woGrabOverlay';
    ov.className = 'wo-grab-overlay';
    ov.innerHTML = '<div class="wo-grab-box">' + innerHtml + '</div>';
    document.body.appendChild(ov);
    return ov;
}

function _woCloseGrabber() {
    var ov = document.getElementById('woGrabOverlay');
    if (ov) ov.remove();
    if (_woGrab && _woGrab.url) URL.revokeObjectURL(_woGrab.url);
    _woGrab = null;
}

/** Draws the current video frame (or any image source) to a canvas → compressed JPEG data URL. */
function _woCanvasToFrame(source, w, h) {
    var scale = Math.min(1, WO_FRAME_MAX_DIM / Math.max(w, h));
    var cw = Math.round(w * scale), ch = Math.round(h * scale);
    var canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    canvas.getContext('2d').drawImage(source, 0, 0, cw, ch);
    var q = 0.75, out = canvas.toDataURL('image/jpeg', q);
    while (out.length > WO_FRAME_MAX_BASE64 && q > 0.3) { q -= 0.1; out = canvas.toDataURL('image/jpeg', q); }
    return out;
}

// ----- Video -----

function _woGrabStartVideo(file) {
    var url = URL.createObjectURL(file);
    var ov = _woGrabOverlay(
        '<h3>Grab frames from video</h3>' +
        '<video id="woGrabVideo" class="wo-grab-video" playsinline muted preload="auto"></video>' +
        '<input type="range" id="woGrabSlider" min="0" max="1000" value="0" class="wo-grab-slider">' +
        '<div class="wo-hint" id="woGrabTime">Loading video…</div>' +
        '<div class="wo-frame-actions">' +
            '<button type="button" class="btn btn-primary btn-small" id="woGrabNow">📸 Grab this frame</button>' +
            '<button type="button" class="btn btn-secondary btn-small" id="woGrabAuto">✨ Auto 3 frames</button>' +
        '</div>' +
        '<div class="wo-hint">Grabbed (in order):</div>' +
        '<div class="wo-frame-strip" id="woGrabStrip"></div>' +
        '<div class="ex-form-actions">' +
            '<button type="button" class="btn btn-primary" id="woGrabAdd" disabled>Add frames</button>' +
            '<button type="button" class="btn btn-secondary" id="woGrabCancel">Cancel</button>' +
        '</div>');
    _woGrab = { kind: 'video', url: url, grabbed: [] };

    var video  = ov.querySelector('#woGrabVideo');
    var slider = ov.querySelector('#woGrabSlider');
    video.src = url;

    video.addEventListener('loadedmetadata', function() {
        ov.querySelector('#woGrabTime').textContent = 'Drag the slider to the start of the move, then grab. ' + video.duration.toFixed(1) + 's long.';
        video.currentTime = 0;
    });
    video.addEventListener('error', function() {
        ov.querySelector('#woGrabTime').textContent = 'This video could not be opened in this browser.';
    });
    slider.addEventListener('input', function() {
        if (video.duration) video.currentTime = (slider.value / 1000) * video.duration;
    });
    video.addEventListener('timeupdate', function() {
        ov.querySelector('#woGrabTime').textContent = video.currentTime.toFixed(2) + 's of ' + (video.duration || 0).toFixed(1) + 's';
    });
    ov.querySelector('#woGrabNow').addEventListener('click', function() {
        if (!video.videoWidth) return;
        _woGrab.grabbed.push(_woCanvasToFrame(video, video.videoWidth, video.videoHeight));
        _woGrabRenderStrip();
    });
    ov.querySelector('#woGrabAuto').addEventListener('click', async function() {
        if (!video.duration) return;
        _woGrab.grabbed = [];
        var stops = [0.05, 0.5, 0.95];
        for (var i = 0; i < stops.length; i++) {
            await _woSeekVideo(video, stops[i] * video.duration);
            _woGrab.grabbed.push(_woCanvasToFrame(video, video.videoWidth, video.videoHeight));
        }
        _woGrabRenderStrip();
    });
    ov.querySelector('#woGrabAdd').addEventListener('click', _woGrabCommit);
    ov.querySelector('#woGrabCancel').addEventListener('click', _woCloseGrabber);
}

function _woSeekVideo(video, t) {
    return new Promise(function(resolve) {
        var done = function() { video.removeEventListener('seeked', done); resolve(); };
        video.addEventListener('seeked', done);
        video.currentTime = t;
    });
}

function _woGrabRenderStrip() {
    var strip = document.getElementById('woGrabStrip');
    if (!strip || !_woGrab) return;
    strip.innerHTML = _woGrab.grabbed.map(function(d, i) {
        return '<div class="wo-frame"><img src="' + d + '" alt="Grabbed ' + (i + 1) + '">' +
               '<div class="wo-frame-num">' + (i + 1) + '</div>' +
               '<div class="wo-frame-btns"><button type="button" class="wo-frame-btn wo-frame-btn--del" data-i="' + i + '">✕ Remove</button></div></div>';
    }).join('');
    strip.querySelectorAll('[data-i]').forEach(function(b) {
        b.addEventListener('click', function() { _woGrab.grabbed.splice(parseInt(this.getAttribute('data-i'), 10), 1); _woGrabRenderStrip(); });
    });
    document.getElementById('woGrabAdd').disabled = _woGrab.grabbed.length === 0;
}

// ----- GIF -----

async function _woGrabStartGif(file) {
    var ov = _woGrabOverlay('<h3>Frames from GIF</h3><div class="wo-hint" id="woGrabTime">Reading GIF…</div>');
    _woGrab = { kind: 'gif', url: null, gifFrames: [] };
    try {
        var decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: 'image/gif' });
        await decoder.tracks.ready;
        var count = decoder.tracks.selectedTrack.frameCount;
        if (!count) throw new Error('GIF has no frames');
        // Up to 4 evenly spaced stills (a still GIF just gives one)
        var n = Math.min(4, count), picks = [];
        for (var i = 0; i < n; i++) picks.push(n === 1 ? 0 : Math.round(i * (count - 1) / (n - 1)));
        for (var k = 0; k < picks.length; k++) {
            var res = await decoder.decode({ frameIndex: picks[k] });
            var vf = res.image;
            _woGrab.gifFrames.push({ dataUrl: _woCanvasToFrame(vf, vf.displayWidth, vf.displayHeight), on: true });
            vf.close();
        }
        decoder.close();
    } catch (err) {
        console.error('Workouts: GIF read failed:', err);
        ov.querySelector('.wo-grab-box').innerHTML = '<h3>Frames from GIF</h3><p>That GIF could not be read.</p>' +
            '<div class="ex-form-actions"><button type="button" class="btn btn-secondary" id="woGrabCancel">Close</button></div>';
        ov.querySelector('#woGrabCancel').addEventListener('click', _woCloseGrabber);
        return;
    }
    _woGrabRenderGif(ov);
}

function _woGrabRenderGif(ov) {
    ov.querySelector('.wo-grab-box').innerHTML =
        '<h3>Frames from GIF</h3>' +
        '<div class="wo-hint">Tap a frame to leave it out. Selected frames are added in order.</div>' +
        '<div class="wo-frame-strip" id="woGrabStrip">' +
            _woGrab.gifFrames.map(function(f, i) {
                return '<div class="wo-frame wo-gif-pick' + (f.on ? '' : ' wo-gif-pick--off') + '" data-i="' + i + '">' +
                       '<img src="' + f.dataUrl + '" alt="GIF frame ' + (i + 1) + '"><div class="wo-frame-num">' + (i + 1) + '</div></div>';
            }).join('') +
        '</div>' +
        '<div class="ex-form-actions">' +
            '<button type="button" class="btn btn-primary" id="woGrabAdd">Add frames</button>' +
            '<button type="button" class="btn btn-secondary" id="woGrabCancel">Cancel</button>' +
        '</div>';
    ov.querySelectorAll('.wo-gif-pick').forEach(function(el) {
        el.addEventListener('click', function() {
            var f = _woGrab.gifFrames[parseInt(this.getAttribute('data-i'), 10)];
            f.on = !f.on;
            this.classList.toggle('wo-gif-pick--off', !f.on);
            document.getElementById('woGrabAdd').disabled = !_woGrab.gifFrames.some(function(x) { return x.on; });
        });
    });
    ov.querySelector('#woGrabAdd').addEventListener('click', _woGrabCommit);
    ov.querySelector('#woGrabCancel').addEventListener('click', _woCloseGrabber);
}

/** Saves the chosen stills as frames, in order, then closes the overlay. */
async function _woGrabCommit() {
    if (!_woGrab) return;
    var frames = _woGrab.kind === 'video'
        ? _woGrab.grabbed.slice()
        : _woGrab.gifFrames.filter(function(f) { return f.on; }).map(function(f) { return f.dataUrl; });
    var btn = document.getElementById('woGrabAdd');
    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
    try {
        for (var i = 0; i < frames.length; i++) await woAddFrameData(frames[i]);
    } catch (err) {
        console.error('Workouts: add grabbed frames failed:', err);
        alert('Could not add the frames. Please try again.');
    }
    _woCloseGrabber();
}

// ─── Workouts (chunks 1.7 + 1.8) ──────────────────────────────────────────────
//
// A workout doc (collection `workouts`):
//   name, description, steps[], exerciseIds[] (for "is this exercise used?" lookups),
//   estimatedSeconds, archived, createdAt, updatedAt
//
// steps[] holds two kinds of step:
//
//   EXERCISE STEP  { type:'exercise', section:'warmup'|'main'|'cooldown',
//     exerciseId, exerciseName (snapshot), measure, eachSide, usesWeight,
//     sets:[{amount, weight}]      ← CURRENT numbers (what the player uses)
//     baseSets:[{amount, weight}]  ← as built (never changed by progression)
//     restBetweenSets:{mode:'timed'|'tap', seconds}, restAfter:{mode, seconds},
//     successStreak, lastDoneDate, previousBestSets, comeback }   ← progression state (WorkoutsPlan §5a)
//
//   CIRCUIT        { type:'circuit', section, rounds,
//     items:[exercise steps with exactly ONE set each — the amount done per round, no rests of their own],
//     restBetweenItems:{mode,seconds}, restBetweenRounds:{mode,seconds}, restAfter:{mode,seconds} }

var WO_SECONDS_PER_REP    = 3;    // only used for the estimated-time display
var WO_TAP_REST_ASSUMED   = 30;   // seconds assumed for a "tap when ready" rest in estimates
var WO_DEFAULT_SETS       = 3;
var WO_DEFAULT_ROUNDS     = 3;
var WO_DEFAULT_REST_SETS  = 45;   // seconds between sets
var WO_DEFAULT_REST_AFTER = 60;   // seconds after the last set of an exercise / a circuit
var WO_DEFAULT_REST_ITEMS = 15;   // seconds between exercises inside a circuit
var WO_SECTIONS = [
    { id: 'warmup',   label: 'Warm-up' },
    { id: 'main',     label: 'Main' },
    { id: 'cooldown', label: 'Cool-down' }
];

var _woExMap = {};   // exerciseId → exercise doc (live, for badges/targets)

/** Loads all exercises into _woExercises / _woExMap. */
async function woLoadExercises() {
    var snap = await woLibCol('workoutExercises').get();
    _woExercises = snap.docs.map(function(d) { var e = d.data(); e.id = d.id; return e; });
    _woExMap = {};
    _woExercises.forEach(function(e) { _woExMap[e.id] = e; });
    return _woExercises;
}

function _woStepSets(step) { return step.sets || []; }

/** Every exercise in order, circuit items included. */
function _woFlatExercises(steps) {
    var out = [];
    (steps || []).forEach(function(st) {
        if (st.type === 'exercise') out.push(st);
        else if (st.type === 'circuit') (st.items || []).forEach(function(it) { out.push(it); });
    });
    return out;
}

function _woRestSeconds(rest) {
    if (!rest) return 0;
    return rest.mode === 'tap' ? WO_TAP_REST_ASSUMED : (rest.seconds || 0);
}

function _woSetSeconds(st, set) {
    var sides = st.eachSide ? 2 : 1;
    var work  = st.measure === 'time' ? (set.amount || 0) : (set.amount || 0) * WO_SECONDS_PER_REP;
    return work * sides;
}

/** Rough duration of a workout in seconds (display only). */
function woEstimateSeconds(steps) {
    var total = 0;
    (steps || []).forEach(function(st) {
        if (st.type === 'exercise') {
            var sets = _woStepSets(st);
            sets.forEach(function(s, i) {
                total += _woSetSeconds(st, s);
                if (i < sets.length - 1) total += _woRestSeconds(st.restBetweenSets);
            });
            total += _woRestSeconds(st.restAfter);
        } else if (st.type === 'circuit') {
            var items = st.items || [], rounds = st.rounds || 1, perRound = 0;
            items.forEach(function(it, i) {
                perRound += (it.sets && it.sets[0]) ? _woSetSeconds(it, it.sets[0]) : 0;
                if (i < items.length - 1) perRound += _woRestSeconds(st.restBetweenItems);
            });
            total += perRound * rounds + _woRestSeconds(st.restBetweenRounds) * (rounds - 1) + _woRestSeconds(st.restAfter);
        }
    });
    return total;
}

function woFmtMinutes(sec) {
    if (!sec) return '';
    var m = Math.max(1, Math.round(sec / 60));
    return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min';
}

/** Body areas an exercise works — by ★ main targets, falling back to any target. */
function _woExerciseAreas(ex) {
    var main = {}, any = {};
    ((ex && ex.targets) || []).forEach(function(t) {
        var m = _woMuscleMap[t.muscleId];
        if (!m) return;
        any[m.area] = true;
        if (t.main) main[m.area] = true;
    });
    return Object.keys(main).length ? Object.keys(main) : Object.keys(any);
}

/** Distinct body-area labels a workout touches. */
function _woWorkoutAreas(steps) {
    var used = {};
    _woFlatExercises(steps).forEach(function(st) {
        _woExerciseAreas(_woExMap[st.exerciseId]).forEach(function(a) { used[a] = true; });
    });
    return WO_AREAS.filter(function(a) { return used[a.id]; }).map(function(a) { return a.label; });
}

function _woPushPullTally(steps) {
    var t = { push: 0, pull: 0, both: 0 };
    _woFlatExercises(steps).forEach(function(st) {
        var ex = _woExMap[st.exerciseId];
        if (ex && t[ex.pushPull] != null) t[ex.pushPull]++;
    });
    return t;
}

/**
 * Gentle suggestion when 3+ pushes (or pulls) in a row hit the same body area.
 * Returns a sentence, or '' when the workout is balanced.
 */
function _woAlternateHint(steps) {
    var flat = _woFlatExercises(steps);
    var run = null;   // {pp, common:[areaId…], from, to}
    var found = null;
    flat.forEach(function(st, idx) {
        var ex = _woExMap[st.exerciseId];
        if (!ex || (ex.pushPull !== 'push' && ex.pushPull !== 'pull')) { run = null; return; }
        var areas = _woExerciseAreas(ex);
        if (run && run.pp === ex.pushPull) {
            var common = run.common.filter(function(a) { return areas.indexOf(a) !== -1; });
            if (common.length) { run.common = common; run.to = idx; }
            else               { run = { pp: ex.pushPull, common: areas, from: idx, to: idx }; }
        } else {
            run = { pp: ex.pushPull, common: areas, from: idx, to: idx };
        }
        if (!found && run.to - run.from + 1 >= 3) found = { pp: run.pp, common: run.common.slice(), from: run.from, to: run.to };
    });
    if (!found) return '';

    var opposite = found.pp === 'push' ? 'pull' : 'push';
    var areaNames = WO_AREAS.filter(function(a) { return found.common.indexOf(a.id) !== -1; }).map(function(a) { return a.label; }).join(' / ');
    var picks = _woExercises.filter(function(e) {
        return !e.archived && e.pushPull === opposite &&
               _woExerciseAreas(e).some(function(a) { return found.common.indexOf(a) !== -1; });
    }).slice(0, 2).map(function(e) { return e.name; });
    return 'Exercises ' + (found.from + 1) + '–' + (found.to + 1) + ' are all ' + (found.pp === 'push' ? 'pushes' : 'pulls') + ' for ' + areaNames +
           '. Consider alternating with a ' + opposite + (picks.length ? ' (e.g. ' + picks.join(', ') + ')' : '') + '.';
}

// ─── Workouts list (#workouts) ────────────────────────────────────────────────

var _woWorkouts = [];
var _woWFilter  = { text: '', archived: false };

async function loadWorkoutsPage() {
    _woSetChrome([['Workouts']]);
    var el = document.getElementById('page-workouts');
    el.innerHTML = '<div class="page-header"><h2>Workouts</h2></div><div class="ex-status">Loading…</div>';
    try {
        await woLoadMuscles();
        await woLoadExercises();
        var snap = await woLibCol('workouts').get();
        _woWorkouts = snap.docs.map(function(d) { var w = d.data(); w.id = d.id; return w; });
    } catch (err) {
        console.error('Workouts: failed to load workouts:', err);
        el.innerHTML = '<div class="page-header"><h2>Workouts</h2></div><div class="ex-status">Could not load workouts.</div>';
        return;
    }
    el.innerHTML =
        '<div class="page-header">' +
            '<h2>Workouts</h2>' +
            '<div class="page-header-actions"><button type="button" class="btn btn-secondary" id="woProgBtn" title="When to suggest heavier weights, comeback rules">⚙ Progression</button> <a href="#workout/new" class="btn btn-primary">+ New Workout</a></div>' +
        '</div>' +
        '<div class="ex-toolbar"><div class="ex-toolbar-row">' +
            '<input type="search" id="woWText" class="filter-input" placeholder="Search workouts…" value="' + _woEsc(_woWFilter.text) + '">' +
            '<label class="wo-inline-check"><input type="checkbox" id="woWArchived"' + (_woWFilter.archived ? ' checked' : '') + '> Show archived</label>' +
        '</div></div>' +
        '<div id="woWorkoutList"></div>';
    if (typeof woShowInProgressCard === 'function') woShowInProgressCard('page-workouts');
    document.getElementById('woProgBtn').addEventListener('click', woOpenProgressionSettings);
    document.getElementById('woWText').addEventListener('input', function() { _woWFilter.text = this.value; _woRenderWorkoutList(); });
    document.getElementById('woWArchived').addEventListener('change', function() { _woWFilter.archived = this.checked; _woRenderWorkoutList(); });
    // ▶ Start sits inside the card link — intercept its click so it opens the Start screen, not the builder
    document.getElementById('woWorkoutList').addEventListener('click', function(ev) {
        var btn = ev.target.closest('.wo-card-start');
        if (!btn) return;
        ev.preventDefault();
        location.hash = '#workout-start/' + btn.getAttribute('data-start');
    });
    _woRenderWorkoutList();
}

function _woRenderWorkoutList() {
    var text = _woWFilter.text.trim().toLowerCase();
    var rows = _woWorkouts.filter(function(w) {
        if (w.archived && !_woWFilter.archived) return false;
        return !text || (w.name || '').toLowerCase().indexOf(text) !== -1;
    }).sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });

    var list = document.getElementById('woWorkoutList');
    if (!rows.length) {
        list.innerHTML = '<div class="ex-status">' + (_woWorkouts.length
            ? 'No workouts match.'
            : 'No workouts yet. Tap <strong>+ New Workout</strong> to build your first one.') + '</div>';
        return;
    }
    list.innerHTML = rows.map(function(w) {
        var steps    = w.steps || [];
        var count    = _woFlatExercises(steps).length;
        var circuits = steps.filter(function(s) { return s.type === 'circuit'; }).length;
        var tally    = _woPushPullTally(steps);
        var areas    = _woWorkoutAreas(steps);
        var bits     = [count + ' exercise' + (count === 1 ? '' : 's')];
        if (circuits) bits.push(circuits + ' circuit' + (circuits === 1 ? '' : 's'));
        var est = woFmtMinutes(w.estimatedSeconds != null ? w.estimatedSeconds : woEstimateSeconds(steps));
        if (est) bits.push('~' + est);
        var pp = [];
        if (tally.push) pp.push('Push ' + tally.push);
        if (tally.pull) pp.push('Pull ' + tally.pull);
        return '<a href="#workout/' + w.id + '" class="wo-card' + (w.archived ? ' wo-card--archived' : '') + '">' +
                   '<div class="wo-thumb">🏋️</div>' +
                   '<div class="wo-card-main">' +
                       '<div class="wo-card-name">' + _woEsc(w.name) + '</div>' +
                       (w.archived ? '<div class="wo-badges"><span class="wo-badge wo-badge--archived">Archived</span></div>' : '') +
                       '<div class="wo-card-meta">' + _woEsc(bits.join(' · ')) + (pp.length ? ' · ' + pp.join(' · ') : '') + '</div>' +
                       (areas.length ? '<div class="wo-chips">' + areas.map(function(a) { return '<span class="wo-chip wo-chip--also">' + _woEsc(a) + '</span>'; }).join('') + '</div>' : '') +
                       (w.description ? '<div class="wo-card-meta">' + _woEsc(w.description) + '</div>' : '') +
                   '</div>' +
                   (w.archived ? '' : '<span class="wo-card-start" data-start="' + w.id + '">▶ Start</span>') +
               '</a>';
    }).join('');
}

// ─── Workout builder (#workout/new, #workout/:id) ─────────────────────────────

var _woW = null;   // working copy of the workout being built

function _woBlankRest(seconds) { return { mode: 'timed', seconds: seconds }; }
function _woCloneSets(sets) { return (sets || []).map(function(s) { return { amount: s.amount, weight: s.weight }; }); }

/** New exercise step from a library exercise, using its defaults. In a circuit it has one set and no rests. */
function _woNewStep(ex, inCircuit) {
    var count = inCircuit ? 1 : WO_DEFAULT_SETS;
    var sets = [];
    for (var i = 0; i < count; i++) {
        sets.push({ amount: ex.defaultAmount != null ? ex.defaultAmount : (ex.measure === 'time' ? 30 : 10),
                    weight: ex.usesWeight && ex.defaultWeight != null ? ex.defaultWeight : null });
    }
    var st = {
        type: 'exercise', section: 'main',
        exerciseId: ex.id, exerciseName: ex.name, measure: ex.measure,
        eachSide: !!ex.eachSide, usesWeight: !!ex.usesWeight,
        sets: sets, baseSets: _woCloneSets(sets),
        restBetweenSets: inCircuit ? null : _woBlankRest(WO_DEFAULT_REST_SETS),
        restAfter:       inCircuit ? null : _woBlankRest(WO_DEFAULT_REST_AFTER),
        successStreak: 0, lastDoneDate: null, previousBestSets: null, comeback: null
    };
    if (inCircuit) delete st.section;
    return st;
}

function _woNewCircuit() {
    return {
        type: 'circuit', section: 'main', rounds: WO_DEFAULT_ROUNDS, items: [],
        restBetweenItems:  _woBlankRest(WO_DEFAULT_REST_ITEMS),
        restBetweenRounds: _woBlankRest(WO_DEFAULT_REST_AFTER),
        restAfter:         _woBlankRest(WO_DEFAULT_REST_AFTER)
    };
}

/** "2" → steps[2];  "2.1" → steps[2].items[1] */
function _woGetStep(path) {
    var p = String(path).split('.');
    var st = _woW.steps[parseInt(p[0], 10)];
    return p.length > 1 && st ? (st.items || [])[parseInt(p[1], 10)] : st;
}

async function loadWorkoutBuilderPage(id) {
    var isNew = (id === 'new');
    _woSetChrome([['Workouts', '#workouts'], [isNew ? 'New Workout' : 'Edit Workout']]);
    var el = document.getElementById('page-workout');
    el.innerHTML = '<div class="page-header"><h2>' + (isNew ? 'New Workout' : 'Edit Workout') + '</h2></div><div class="ex-status">Loading…</div>';
    try {
        await woLoadMuscles();
        await woLoadExercises();
        if (isNew) {
            _woW = { id: null, name: '', description: '', steps: [], archived: false };
        } else {
            var doc = await woLibCol('workouts').doc(id).get();
            if (!doc.exists) { el.innerHTML = '<div class="ex-status">Workout not found.</div>'; return; }
            _woW = doc.data();
            _woW.id = doc.id;
            _woW.steps = JSON.parse(JSON.stringify(_woW.steps || []));   // deep copy — edits stay local until Save
        }
    } catch (err) {
        console.error('Workouts: failed to load workout:', err);
        el.innerHTML = '<div class="ex-status">Could not load this workout.</div>';
        return;
    }
    _woRenderBuilder();
}

function _woRenderBuilder() {
    var w = _woW, isNew = !w.id;
    var el = document.getElementById('page-workout');
    el.innerHTML =
        '<div class="page-header"><h2>' + (isNew ? 'New Workout' : 'Edit Workout') + '</h2></div>' +
        '<div class="ex-form">' +
            '<div class="ex-form-group">' +
                '<label class="ex-label" for="wobName">Name <span class="ex-required">*</span></label>' +
                '<input type="text" id="wobName" value="' + _woEsc(w.name) + '" placeholder="e.g. Upper Body A" maxlength="80">' +
            '</div>' +
            '<div class="ex-form-group">' +
                '<label class="ex-label" for="wobDesc">Notes (optional)</label>' +
                '<textarea id="wobDesc" rows="2" placeholder="What this workout is for…">' + _woEsc(w.description) + '</textarea>' +
            '</div>' +
            '<div class="ex-form-group">' +
                '<label class="ex-label">Exercises</label>' +
                '<div id="wobSummary" class="wo-builder-summary"></div>' +
                '<div id="wobHint" class="wo-hint-box hidden"></div>' +
                '<div id="wobSteps"></div>' +
                '<div class="wo-frame-actions">' +
                    '<button type="button" class="btn btn-secondary" id="wobAdd">+ Add exercise</button>' +
                    '<button type="button" class="btn btn-secondary" id="wobAddCircuit">+ Add circuit</button>' +
                '</div>' +
            '</div>' +
            '<div class="ex-form-actions">' +
                '<button type="button" class="btn btn-primary" id="wobSave">' + (isNew ? 'Create Workout' : 'Save') + '</button>' +
                '<a href="#workouts" class="btn btn-secondary">Cancel</a>' +
                (isNew ? '' :
                    '<a href="#workout-start/' + w.id + '" class="btn btn-secondary" title="Starts the saved version of this workout">▶ Start</a>' +
                    '<button type="button" class="btn btn-secondary" id="wobCopy">Copy as new</button>' +
                    '<button type="button" class="btn btn-secondary" id="wobArchive">' + (w.archived ? 'Unarchive' : 'Archive') + '</button>' +
                    '<button type="button" class="btn btn-danger" id="wobDelete">Delete</button>') +
            '</div>' +
        '</div>';

    document.getElementById('wobName').addEventListener('input', function() { _woW.name = this.value; });
    document.getElementById('wobDesc').addEventListener('input', function() { _woW.description = this.value; });
    document.getElementById('wobAdd').addEventListener('click', function() { _woOpenExercisePicker(null); });
    document.getElementById('wobAddCircuit').addEventListener('click', function() {
        _woW.steps.push(_woNewCircuit());
        _woRenderSteps();
        var cards = document.querySelectorAll('.wo-step');
        if (cards.length) cards[cards.length - 1].scrollIntoView({ block: 'center' });
    });
    document.getElementById('wobSave').addEventListener('click', _woSaveWorkout);
    var copy = document.getElementById('wobCopy');    if (copy) copy.addEventListener('click', _woCopyWorkout);
    var arch = document.getElementById('wobArchive'); if (arch) arch.addEventListener('click', _woArchiveWorkout);
    var del  = document.getElementById('wobDelete');  if (del)  del.addEventListener('click', _woDeleteWorkout);

    // One set of listeners for every step control (the step list is re-rendered often)
    var box = document.getElementById('wobSteps');
    box.addEventListener('click',  _woStepClick);
    box.addEventListener('input',  _woStepInput);
    box.addEventListener('change', _woStepInput);
    _woRenderSteps();
}

function _woRestEditor(label, key, rest) {
    rest = rest || _woBlankRest(0);
    return '<div class="wo-rest-row"><span class="wo-rest-label">' + label + '</span>' +
        '<select data-f="rest" data-rest="' + key + '" data-part="mode">' +
            '<option value="timed"' + (rest.mode === 'timed' ? ' selected' : '') + '>Timed</option>' +
            '<option value="tap"' + (rest.mode === 'tap' ? ' selected' : '') + '>Tap when ready</option>' +
        '</select>' +
        '<span class="wo-rest-secs' + (rest.mode === 'tap' ? ' hidden' : '') + '">' +
            '<input type="number" min="0" step="5" data-f="rest" data-rest="' + key + '" data-part="seconds" value="' + (rest.seconds || 0) + '"> sec</span>' +
    '</div>';
}

function _woSectionSelect(st) {
    return '<select class="wo-section-select" data-f="section" title="Part of the workout">' +
        WO_SECTIONS.map(function(s) {
            return '<option value="' + s.id + '"' + ((st.section || 'main') === s.id ? ' selected' : '') + '>' + s.label + '</option>';
        }).join('') + '</select>';
}

function _woSetsUniform(st) {
    var sets = _woStepSets(st);
    return sets.every(function(s) { return s.amount === sets[0].amount && s.weight === sets[0].weight; });
}

/** Sets editor for one exercise: quick row, or one row per set ("custom"). */
function _woSetsEditor(st, inCircuit) {
    var sets = _woStepSets(st);
    var unit = st.measure === 'time' ? 'sec' : 'reps';
    var s0   = sets[0] || { amount: '', weight: null };
    var wField = function(val, k) {
        return st.usesWeight ? ' @ <input type="number" min="0" step="0.5" data-f="' + (k == null ? 'qweight' : 'weight') + '"' +
               (k == null ? '' : ' data-k="' + k + '"') + ' value="' + (val != null ? val : '') + '"> lb' : '';
    };

    if (inCircuit) {   // one set per round — just amount (+ weight)
        return '<span class="wo-item-sets"><input type="number" min="1" data-f="qamount" value="' + (s0.amount != null ? s0.amount : '') + '"> ' + unit + wField(s0.weight) + '</span>';
    }
    if (!st._custom && _woSetsUniform(st)) {
        return '<div class="wo-step-sets">' +
                   '<input type="number" min="1" max="20" data-f="qcount" value="' + sets.length + '"> sets × ' +
                   '<input type="number" min="1" data-f="qamount" value="' + (s0.amount != null ? s0.amount : '') + '"> ' + unit + wField(s0.weight) +
                   ' <button type="button" class="wo-link-btn" data-act="custom">Customize sets</button>' +
               '</div>';
    }
    var rows = sets.map(function(s, k) {
        return '<div class="wo-set-row"><span class="wo-set-label">Set ' + (k + 1) + '</span>' +
               '<input type="number" min="1" data-f="amount" data-k="' + k + '" value="' + (s.amount != null ? s.amount : '') + '"> ' + unit + wField(s.weight, k) +
               (sets.length > 1 ? ' <button type="button" class="wo-frame-btn wo-frame-btn--del" data-act="delset" data-k="' + k + '" title="Remove set">✕</button>' : '') +
               '</div>';
    }).join('');
    return '<div class="wo-step-sets wo-step-sets--custom">' + rows +
           '<div class="wo-set-actions"><button type="button" class="wo-link-btn" data-act="addset">+ Add set</button>' +
           (_woSetsUniform(st)
               ? ' <button type="button" class="wo-link-btn" data-act="quick">Back to quick entry</button>'
               : ' <span class="wo-hint">(sets differ)</span>') +
           '</div></div>';
}

function _woRenderSteps() {
    var box = document.getElementById('wobSteps');
    if (!box) return;
    var steps = _woW.steps;
    if (!steps.length) {
        box.innerHTML = '<p class="wo-hint">Nothing here yet — tap <strong>+ Add exercise</strong> or <strong>+ Add circuit</strong>.</p>';
    } else {
        box.innerHTML = steps.map(function(st, i) {
            var btns = function(path, canUp, canDown, allowDup) {
                return '<span class="wo-step-btns">' +
                    '<button type="button" class="wo-frame-btn" data-act="up" title="Move up"' + (canUp ? '' : ' disabled') + '>↑</button>' +
                    '<button type="button" class="wo-frame-btn" data-act="down" title="Move down"' + (canDown ? '' : ' disabled') + '>↓</button>' +
                    (allowDup ? '<button type="button" class="wo-frame-btn" data-act="dup" title="Duplicate">⧉</button>' : '') +
                    '<button type="button" class="wo-frame-btn wo-frame-btn--del" data-act="del" title="Remove">✕</button></span>';
            };

            if (st.type === 'circuit') {
                var items = st.items || [];
                return '<div class="wo-step wo-circuit" data-path="' + i + '">' +
                    '<div class="wo-step-head">' +
                        '<span class="wo-step-num">' + (i + 1) + '</span>' +
                        '<span class="wo-step-name">Circuit</span>' +
                        '<span class="wo-circuit-rounds"><input type="number" min="1" max="20" data-f="rounds" value="' + (st.rounds || 1) + '"> rounds</span>' +
                        _woSectionSelect(st) + btns(i, i > 0, i < steps.length - 1, true) +
                    '</div>' +
                    (items.length ? items.map(function(it, j) {
                        var ex = _woExMap[it.exerciseId];
                        return '<div class="wo-item" data-path="' + i + '.' + j + '">' +
                            '<span class="wo-item-name">' + _woEsc(ex ? ex.name : it.exerciseName) + (ex ? '' : ' (deleted)') + '</span>' +
                            (ex ? _woPushPullBadge(ex.pushPull) : '') +
                            (it.eachSide ? '<span class="wo-badge wo-badge--neither">Each side</span>' : '') +
                            _woSetsEditor(it, true) +
                            btns(i + '.' + j, j > 0, j < items.length - 1, false) +
                        '</div>';
                    }).join('') : '<p class="wo-hint wo-item-empty">No exercises in this circuit yet.</p>') +
                    '<div class="wo-set-actions"><button type="button" class="wo-link-btn" data-act="additem">+ Add exercise to circuit</button></div>' +
                    _woRestEditor('Rest between exercises', 'restBetweenItems', st.restBetweenItems) +
                    _woRestEditor('Rest between rounds', 'restBetweenRounds', st.restBetweenRounds) +
                    _woRestEditor('Rest after circuit', 'restAfter', st.restAfter) +
                '</div>';
            }

            var ex = _woExMap[st.exerciseId];
            return '<div class="wo-step" data-path="' + i + '">' +
                '<div class="wo-step-head">' +
                    '<span class="wo-step-num">' + (i + 1) + '</span>' +
                    '<span class="wo-step-name">' + _woEsc(ex ? ex.name : st.exerciseName) + (ex ? '' : ' (deleted)') + '</span>' +
                    (ex ? _woPushPullBadge(ex.pushPull) : '') +
                    (st.eachSide ? '<span class="wo-badge wo-badge--neither">Each side</span>' : '') +
                    _woSectionSelect(st) + btns(i, i > 0, i < steps.length - 1, true) +
                '</div>' +
                _woSetsEditor(st, false) +
                _woRestEditor('Rest between sets', 'restBetweenSets', st.restBetweenSets) +
                _woRestEditor('Rest after exercise', 'restAfter', st.restAfter) +
                '<div class="wo-rest-row"><span class="wo-rest-label">Level-up (optional)</span>' +
                    'after <input type="number" min="1" data-f="levelUpAfter" placeholder="10" value="' + (st.levelUpAfter || '') + '"> sessions' +
                    (st.usesWeight ? ' · weight step <input type="number" min="0.5" step="0.5" data-f="weightStep" placeholder="5" value="' + (st.weightStep || '') + '"> lb' : '') +
                    ' <span class="wo-hint">blank = your default</span></div>' +
            '</div>';
        }).join('');
    }
    _woUpdateBuilderSummary();
}

function _woStepClick(ev) {
    var btn = ev.target.closest('[data-act]');
    if (!btn) return;
    var holder = btn.closest('[data-path]');
    if (!holder) return;
    var path = holder.getAttribute('data-path'), act = btn.getAttribute('data-act');
    var parts = path.split('.'), i = parseInt(parts[0], 10), j = parts.length > 1 ? parseInt(parts[1], 10) : null;
    var list = j === null ? _woW.steps : _woW.steps[i].items;
    var idx  = j === null ? i : j;

    if (act === 'up'   && idx > 0)                { var t = list[idx]; list[idx] = list[idx - 1]; list[idx - 1] = t; }
    if (act === 'down' && idx < list.length - 1)  { var u = list[idx]; list[idx] = list[idx + 1]; list[idx + 1] = u; }
    if (act === 'dup')  list.splice(idx + 1, 0, JSON.parse(JSON.stringify(list[idx])));
    if (act === 'del')  list.splice(idx, 1);
    if (act === 'additem') { _woOpenExercisePicker(i); return; }

    var st = _woGetStep(path);
    if (act === 'custom') st._custom = true;
    if (act === 'quick')  st._custom = false;
    if (act === 'addset') {
        var last = st.sets[st.sets.length - 1] || { amount: 10, weight: null };
        st.sets.push({ amount: last.amount, weight: last.weight });
        _woSyncBase(st);
    }
    if (act === 'delset' && st.sets.length > 1) {
        st.sets.splice(parseInt(btn.getAttribute('data-k'), 10), 1);
        _woSyncBase(st);
    }
    _woRenderSteps();
}

/** Editing the recipe resets both Base and Current (and the success streak). */
function _woSyncBase(st) {
    st.baseSets = _woCloneSets(st.sets);
    st.successStreak = 0;
}

function _woStepInput(ev) {
    var inp = ev.target.closest('[data-f]');
    if (!inp) return;
    var holder = inp.closest('[data-path]');
    if (!holder) return;
    var st = _woGetStep(holder.getAttribute('data-path'));
    if (!st) return;
    var f = inp.getAttribute('data-f');

    if (f === 'section') { st.section = inp.value; return; }
    if (f === 'levelUpAfter' || f === 'weightStep') {          // per-step progression overrides (blank = use the default)
        var n = parseFloat(inp.value);
        if (n > 0) st[f] = n; else delete st[f];
        return;
    }
    if (f === 'rounds')  { st.rounds = Math.max(1, Math.min(20, parseInt(inp.value, 10) || 1)); _woUpdateBuilderSummary(); return; }

    if (f === 'rest') {
        var key = inp.getAttribute('data-rest'), part = inp.getAttribute('data-part');
        var rest = st[key] || (st[key] = _woBlankRest(0));
        if (part === 'mode') {
            rest.mode = inp.value;
            var secs = inp.closest('.wo-rest-row').querySelector('.wo-rest-secs');
            if (secs) secs.classList.toggle('hidden', rest.mode === 'tap');
        } else {
            rest.seconds = Math.max(0, parseInt(inp.value, 10) || 0);
        }
        _woUpdateBuilderSummary();
        return;
    }

    // Quick row: N sets × amount @ weight → rewrites every set
    if (f === 'qcount' || f === 'qamount' || f === 'qweight') {
        var scope = inp.closest('.wo-step-sets, .wo-item-sets');
        var cEl = scope.querySelector('[data-f=qcount]'), aEl = scope.querySelector('[data-f=qamount]'), wEl = scope.querySelector('[data-f=qweight]');
        var count  = cEl ? Math.max(1, Math.min(20, parseInt(cEl.value, 10) || 1)) : 1;
        var amount = parseInt(aEl.value, 10);
        var weight = wEl && wEl.value !== '' ? parseFloat(wEl.value) : null;
        var sets = [];
        for (var k = 0; k < count; k++) sets.push({ amount: isNaN(amount) ? null : amount, weight: weight });
        st.sets = sets;
        _woSyncBase(st);
        _woUpdateBuilderSummary();
        return;
    }

    // Custom per-set row
    if (f === 'amount' || f === 'weight') {
        var set = st.sets[parseInt(inp.getAttribute('data-k'), 10)];
        if (!set) return;
        if (f === 'amount') { var a = parseInt(inp.value, 10); set.amount = isNaN(a) ? null : a; }
        else                { set.weight = inp.value !== '' ? parseFloat(inp.value) : null; }
        _woSyncBase(st);
        _woUpdateBuilderSummary();
        // Re-render only when "uniform ↔ different" changes the available buttons (on blur/change, not while typing)
        if (ev.type === 'change') _woRenderSteps();
    }
}

function _woUpdateBuilderSummary() {
    var el = document.getElementById('wobSummary');
    var hint = document.getElementById('wobHint');
    if (!el) return;
    var steps = _woW.steps;
    if (!steps.length) { el.textContent = ''; if (hint) hint.classList.add('hidden'); return; }
    var flat  = _woFlatExercises(steps);
    var tally = _woPushPullTally(steps);
    var areas = _woWorkoutAreas(steps);
    var bits = [flat.length + ' exercise' + (flat.length === 1 ? '' : 's'), '~' + woFmtMinutes(woEstimateSeconds(steps))];
    bits.push('Push ' + tally.push + ' · Pull ' + tally.pull + (tally.both ? ' · Both ' + tally.both : ''));
    if (areas.length) bits.push(areas.join(' · '));
    el.textContent = bits.join('   |   ');

    var msg = _woAlternateHint(steps);
    if (hint) { hint.textContent = msg ? '💡 ' + msg : ''; hint.classList.toggle('hidden', !msg); }
}

// ----- Exercise picker overlay (also hosts the inline "+ New exercise" form) -----

var _woPick = { text: '', area: '', pp: '', circuit: null, onPick: null };

/** onPick (optional): called with the chosen exercise instead of adding a builder step — used by other screens. */
function _woOpenExercisePicker(circuitIndex, onPick) {
    _woPick = { text: '', area: '', pp: '', circuit: circuitIndex, onPick: onPick || null };
    var ov = _woGrabOverlay(
        '<h3>' + (circuitIndex === null ? 'Add exercise' : 'Add exercise to circuit') + '</h3>' +
        '<div class="ex-toolbar-row">' +
            '<input type="search" id="woPickText" class="filter-input" placeholder="Search…">' +
            '<select id="woPickArea"><option value="">All areas</option>' +
                WO_AREAS.map(function(a) { return '<option value="' + a.id + '">' + a.label + '</option>'; }).join('') + '</select>' +
            '<select id="woPickPP"><option value="">Push / Pull</option>' +
                ['push', 'pull', 'both', 'neither'].map(function(k) { return '<option value="' + k + '">' + WO_PUSHPULL[k].label + '</option>'; }).join('') + '</select>' +
        '</div>' +
        '<div id="woPickList" class="wo-pick-list"></div>' +
        '<div class="ex-form-actions">' +
            '<button type="button" class="btn btn-secondary" id="woPickNew">+ New exercise</button>' +
            '<button type="button" class="btn btn-secondary" id="woPickClose">Close</button>' +
        '</div>');
    ov.querySelector('#woPickText').addEventListener('input', function() { _woPick.text = this.value; _woRenderPicker(); });
    ov.querySelector('#woPickArea').addEventListener('change', function() { _woPick.area = this.value; _woRenderPicker(); });
    ov.querySelector('#woPickPP').addEventListener('change', function() { _woPick.pp = this.value; _woRenderPicker(); });
    ov.querySelector('#woPickNew').addEventListener('click', _woShowInlineNewExercise);
    ov.querySelector('#woPickClose').addEventListener('click', _woCloseGrabber);
    _woRenderPicker();
}

function _woRenderPicker() {
    var text = _woPick.text.trim().toLowerCase();
    var rows = _woExercises.filter(function(e) {
        if (e.archived) return false;
        if (text && (e.name || '').toLowerCase().indexOf(text) === -1) return false;
        if (_woPick.pp && e.pushPull !== _woPick.pp) return false;
        if (_woPick.area) {
            var hit = (e.targets || []).some(function(t) { var m = _woMuscleMap[t.muscleId]; return m && m.area === _woPick.area; });
            if (!hit) return false;
        }
        return true;
    }).sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });

    var list = document.getElementById('woPickList');
    if (!list) return;
    if (!rows.length) { list.innerHTML = '<div class="ex-status">No exercises match. Use <strong>+ New exercise</strong> to create it.</div>'; return; }
    list.innerHTML = rows.map(function(e) {
        return '<button type="button" class="wo-pick-row" data-id="' + e.id + '">' +
                   '<span class="wo-thumb wo-thumb--sm">' + (e.thumbData ? '<img src="' + e.thumbData + '" alt="">' : '🤸') + '</span>' +
                   '<span class="wo-pick-main"><span class="wo-card-name">' + _woEsc(e.name) + '</span>' +
                   '<span class="wo-card-meta">' + _woEsc(woFmtAmount(e.measure, e.defaultAmount, e.usesWeight ? e.defaultWeight : null)) + '</span></span>' +
                   _woPushPullBadge(e.pushPull) +
               '</button>';
    }).join('');
    list.querySelectorAll('.wo-pick-row').forEach(function(b) {
        b.addEventListener('click', function() {
            var ex = _woExMap[this.getAttribute('data-id')];
            if (ex) _woPickChosen(ex);
        });
    });
}

/** An exercise was chosen in the picker: hand it to the caller's callback, or add it to the builder. */
function _woPickChosen(ex) {
    if (_woPick.onPick) { var cb = _woPick.onPick; _woCloseGrabber(); cb(ex); }
    else _woAddExerciseStep(ex);
}

/** Appends an exercise to the workout (or to the circuit the picker was opened for). */
function _woAddExerciseStep(ex) {
    var ci = _woPick.circuit;
    if (ci !== null && _woW.steps[ci] && _woW.steps[ci].type === 'circuit') {
        _woW.steps[ci].items.push(_woNewStep(ex, true));
    } else {
        _woW.steps.push(_woNewStep(ex, false));
    }
    _woCloseGrabber();
    _woRenderSteps();
    var cards = document.querySelectorAll('.wo-step');
    var target = ci !== null && cards[ci] ? cards[ci] : cards[cards.length - 1];
    if (target) target.scrollIntoView({ block: 'center' });
}

/** Inline "+ New exercise": a quick form inside the picker — saves to the library and adds the step. */
function _woShowInlineNewExercise() {
    var box = document.querySelector('#woGrabOverlay .wo-grab-box');
    if (!box) return;
    box.innerHTML =
        '<h3>New exercise</h3>' +
        '<div class="ex-form-group"><label class="ex-label" for="woiName">Name <span class="ex-required">*</span></label>' +
            '<input type="text" id="woiName" maxlength="80" placeholder="e.g. Calf raise"></div>' +
        '<div class="ex-form-group"><label class="ex-label">Measured by</label><div class="wo-radio-row">' +
            '<label><input type="radio" name="woiMeasure" value="reps" checked> Reps</label>' +
            '<label><input type="radio" name="woiMeasure" value="time"> Time</label></div></div>' +
        '<div class="ex-form-group"><label class="ex-label" for="woiAmount" id="woiAmountLabel">Default reps</label>' +
            '<input type="number" id="woiAmount" min="1" step="1" value="10"></div>' +
        '<div class="ex-form-group"><label class="wo-inline-check"><input type="checkbox" id="woiWeight"> Uses weight</label>' +
            '<div id="woiWeightRow" class="hidden" style="margin-top:8px;"><label class="ex-label" for="woiWeightVal">Default weight (lb)</label>' +
            '<input type="number" id="woiWeightVal" min="0" step="0.5"></div></div>' +
        '<div class="ex-form-group"><label class="wo-inline-check"><input type="checkbox" id="woiSide"> Each side</label></div>' +
        '<div class="ex-form-group"><label class="ex-label" for="woiPP">Push / Pull</label>' +
            '<select id="woiPP">' + ['push', 'pull', 'both', 'neither'].map(function(k) {
                return '<option value="' + k + '"' + (k === 'neither' ? ' selected' : '') + '>' + WO_PUSHPULL[k].label + '</option>';
            }).join('') + '</select></div>' +
        '<p class="wo-hint">You can add the muscles it works, form cues and pictures later from Fitness → Exercises.</p>' +
        '<div class="ex-form-actions">' +
            '<button type="button" class="btn btn-primary" id="woiSave">Create &amp; add</button>' +
            '<button type="button" class="btn btn-secondary" id="woiBack">Back</button></div>';

    box.querySelectorAll('input[name=woiMeasure]').forEach(function(r) {
        r.addEventListener('change', function() {
            document.getElementById('woiAmountLabel').textContent = this.value === 'time' ? 'Default time (seconds)' : 'Default reps';
            document.getElementById('woiAmount').value = this.value === 'time' ? 30 : 10;
        });
    });
    document.getElementById('woiWeight').addEventListener('change', function() {
        document.getElementById('woiWeightRow').classList.toggle('hidden', !this.checked);
    });
    document.getElementById('woiBack').addEventListener('click', function() { _woOpenExercisePicker(_woPick.circuit, _woPick.onPick); });
    document.getElementById('woiSave').addEventListener('click', _woSaveInlineExercise);
    document.getElementById('woiName').focus();
}

async function _woSaveInlineExercise() {
    var name = document.getElementById('woiName').value.trim();
    if (!name) { alert('Please enter a name for the exercise.'); document.getElementById('woiName').focus(); return; }
    var amount = parseInt(document.getElementById('woiAmount').value, 10);
    var uses   = document.getElementById('woiWeight').checked;
    var wRaw   = document.getElementById('woiWeightVal').value;
    var data = {
        name: name, instructions: '',
        measure: document.querySelector('input[name=woiMeasure]:checked').value,
        defaultAmount: isNaN(amount) ? null : amount,
        usesWeight: uses, defaultWeight: uses && wRaw !== '' ? parseFloat(wRaw) : null,
        eachSide: document.getElementById('woiSide').checked,
        equipment: [], targets: [],
        pushPull: document.getElementById('woiPP').value,
        videoUrl: '', archived: false, isSeeded: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    var btn = document.getElementById('woiSave');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
        var ref = await woLibCol('workoutExercises').add(data);
        data.id = ref.id;
        _woExercises.push(data);
        _woExMap[data.id] = data;
        _woPickChosen(data);
    } catch (err) {
        console.error('Workouts: inline exercise save failed:', err);
        alert('Failed to create the exercise. Please try again.');
        btn.disabled = false; btn.textContent = 'Create & add';
    }
}

// ----- Save / copy / archive / delete -----

/** Deep copy of the steps without UI-only flags (e.g. _custom). */
function _woCleanSteps(steps) {
    return JSON.parse(JSON.stringify(steps || [], function(key, val) { return key === '_custom' ? undefined : val; }));
}

function _woWorkoutPayload() {
    var steps = _woCleanSteps(_woW.steps);
    var ids = [];
    _woFlatExercises(steps).forEach(function(st) { if (st.exerciseId && ids.indexOf(st.exerciseId) === -1) ids.push(st.exerciseId); });
    return {
        name:             _woW.name.trim(),
        description:      (_woW.description || '').trim(),
        steps:            steps,
        exerciseIds:      ids,
        estimatedSeconds: woEstimateSeconds(steps),
        archived:         !!_woW.archived,
        updatedAt:        firebase.firestore.FieldValue.serverTimestamp()
    };
}

async function _woSaveWorkout() {
    _woW.name = document.getElementById('wobName').value;
    if (!_woW.name.trim()) { alert('Please enter a name for the workout.'); document.getElementById('wobName').focus(); return; }
    if (!_woFlatExercises(_woW.steps).length) { alert('Add at least one exercise first.'); return; }
    var emptyCircuit = _woW.steps.some(function(s) { return s.type === 'circuit' && !(s.items || []).length; });
    if (emptyCircuit) { alert('A circuit has no exercises in it. Add some, or remove the circuit.'); return; }
    var btn = document.getElementById('wobSave');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
        var data = _woWorkoutPayload();
        if (_woW.id) {
            await woLibCol('workouts').doc(_woW.id).update(data);
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await woLibCol('workouts').add(data);
        }
        location.hash = '#workouts';
    } catch (err) {
        console.error('Workouts: save workout failed:', err);
        alert('Failed to save. Please try again.');
        btn.disabled = false; btn.textContent = _woW.id ? 'Save' : 'Create Workout';
    }
}

async function _woCopyWorkout() {
    try {
        var data = _woWorkoutPayload();
        data.name = data.name + ' (copy)';
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        // A copy starts fresh: Current = Base, no progression history
        var reset = function(st) {
            if (st.baseSets) st.sets = _woCloneSets(st.baseSets);
            st.successStreak = 0; st.lastDoneDate = null; st.previousBestSets = null; st.comeback = null;
        };
        data.steps.forEach(function(st) {
            if (st.type === 'circuit') (st.items || []).forEach(reset); else reset(st);
        });
        var ref = await woLibCol('workouts').add(data);
        location.hash = '#workout/' + ref.id;
    } catch (err) {
        console.error('Workouts: copy workout failed:', err);
        alert('Failed to copy. Please try again.');
    }
}

async function _woArchiveWorkout() {
    try {
        await woLibCol('workouts').doc(_woW.id).update({ archived: !_woW.archived });
        location.hash = '#workouts';
    } catch (err) {
        console.error('Workouts: archive workout failed:', err);
        alert('Failed to update. Please try again.');
    }
}

async function _woDeleteWorkout() {
    if (!confirm('Delete "' + _woW.name + '"? This cannot be undone. (Your Workout History is kept.)')) return;
    try {
        await woLibCol('workouts').doc(_woW.id).delete();
        location.hash = '#workouts';
    } catch (err) {
        console.error('Workouts: delete workout failed:', err);
        alert('Failed to delete. Please try again.');
    }
}
