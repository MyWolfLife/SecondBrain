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
        var snap = await woLibCol('workoutExercises').get();
        _woExercises = snap.docs.map(function(d) { var e = d.data(); e.id = d.id; return e; });
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
        '</div>' +
        '<div id="woeFrameStatus" class="wo-hint"></div>';

    document.getElementById('woeFrameCamera').addEventListener('click', function() { _woPickFrameFile(true); });
    document.getElementById('woeFrameGallery').addEventListener('click', function() { _woPickFrameFile(false); });
    document.getElementById('woeFramePaste').addEventListener('click', _woPasteFrame);
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

// ─── Workouts (placeholders until chunk 1.7) ──────────────────────────────────

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
