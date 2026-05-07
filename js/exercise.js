/**
 * exercise.js — Exercise hub, activity types seeding, and page stubs.
 * Phase 1: Foundation & Hub
 */

// ─── Default activity types ──────────────────────────────────────────────────

const EXERCISE_DEFAULT_TYPES = [
    { name: 'Running',       tracksMiles: true,  withDogs: true  },
    { name: 'Trail Running', tracksMiles: true,  withDogs: true  },
    { name: 'Walking',       tracksMiles: true,  withDogs: true  },
    { name: 'Hiking',        tracksMiles: true,  withDogs: true  },
    { name: 'Treadmill',     tracksMiles: true,  withDogs: false },
    { name: 'Golf',          tracksMiles: false, withDogs: false },
    { name: 'Mowing',        tracksMiles: false, withDogs: false },
    { name: 'Yard Work',     tracksMiles: false, withDogs: false },
    { name: 'Weights',       tracksMiles: false, withDogs: false },
    { name: 'Elliptical',    tracksMiles: false, withDogs: false },
    { name: 'Row Machine',   tracksMiles: false, withDogs: false },
    { name: 'Bike',          tracksMiles: false, withDogs: false },
    { name: 'Stationary Bike', tracksMiles: false, withDogs: false },
];

/**
 * Checks if the exerciseTypes collection is empty and seeds default types if so.
 * Called on first visit to any exercise page.
 */
async function seedExerciseTypesIfNeeded() {
    try {
        var snapshot = await userCol('exerciseTypes').limit(1).get();
        if (!snapshot.empty) return; // already seeded

        var batch = db.batch();
        EXERCISE_DEFAULT_TYPES.forEach(function(t) {
            var ref = userCol('exerciseTypes').doc();
            batch.set(ref, {
                name:        t.name,
                tracksMiles: t.tracksMiles,
                withDogs:    t.withDogs,
                isDefault:   true,
                archived:    false,
                createdAt:   firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        await batch.commit();
        console.log('Exercise: seeded ' + EXERCISE_DEFAULT_TYPES.length + ' default activity types.');
    } catch (err) {
        console.error('Exercise: failed to seed activity types:', err);
    }
}

// ─── Hub page ────────────────────────────────────────────────────────────────

/**
 * Renders the Exercise hub page (#exercise).
 * Three cards: Activities (active), Goals and Summary (coming soon).
 */
function loadExercisePage() {
    var el = document.getElementById('page-exercise');
    if (!el) return;
    el.innerHTML =
        '<div class="page-header">' +
            '<button class="btn btn-secondary btn-small" onclick="location.hash=\'#life\'">&#8592; Life</button>' +
            '<h2>Exercise</h2>' +
        '</div>' +
        '<div class="landing-grid">' +
            '<a href="#exercise-activities" class="landing-tile landing-tile--exercise-activities">' +
                '<span class="landing-tile-icon">🏃</span>' +
                '<span class="landing-tile-label">Activities</span>' +
            '</a>' +
            '<div class="landing-tile landing-tile--coming-soon">' +
                '<span class="landing-tile-icon">🎯</span>' +
                '<span class="landing-tile-label">Goals</span>' +
                '<span class="coming-soon-badge">Coming Soon</span>' +
            '</div>' +
            '<div class="landing-tile landing-tile--coming-soon">' +
                '<span class="landing-tile-icon">📊</span>' +
                '<span class="landing-tile-label">Summary</span>' +
                '<span class="coming-soon-badge">Coming Soon</span>' +
            '</div>' +
        '</div>';
}

// ─── Activities list page (stub — Phase 2) ───────────────────────────────────

function loadExerciseActivitiesPage() {
    seedExerciseTypesIfNeeded();
    var el = document.getElementById('page-exercise-activities');
    if (!el) return;
    el.innerHTML =
        '<div class="page-header">' +
            '<button class="btn btn-secondary btn-small" onclick="location.hash=\'#exercise\'">&#8592; Exercise</button>' +
            '<h2>Activities</h2>' +
        '</div>' +
        '<p style="padding:24px;color:#666;">Activities list — coming in Phase 2.</p>';
}

// ─── Activity detail / edit page (stub — Phase 3) ────────────────────────────

function loadExerciseActivityPage(id) {
    seedExerciseTypesIfNeeded();
    var el = document.getElementById('page-exercise-activity');
    if (!el) return;
    var isNew = (id === 'new');
    el.innerHTML =
        '<div class="page-header">' +
            '<button class="btn btn-secondary btn-small" onclick="location.hash=\'#exercise-activities\'">&#8592; Activities</button>' +
            '<h2>' + (isNew ? 'New Activity' : 'Edit Activity') + '</h2>' +
        '</div>' +
        '<p style="padding:24px;color:#666;">Activity form — coming in Phase 3.</p>';
}

// ─── Manage types page (stub — Phase 4) ──────────────────────────────────────

function loadExerciseTypesPage() {
    seedExerciseTypesIfNeeded();
    var el = document.getElementById('page-exercise-types');
    if (!el) return;
    el.innerHTML =
        '<div class="page-header">' +
            '<button class="btn btn-secondary btn-small" onclick="location.hash=\'#exercise-activities\'">&#8592; Activities</button>' +
            '<h2>Manage Activity Types</h2>' +
        '</div>' +
        '<p style="padding:24px;color:#666;">Type management — coming in Phase 4.</p>';
}
