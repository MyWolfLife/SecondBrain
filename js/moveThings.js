// ============================================================
// moveThings.js — Shared Move Modal for Things and SubThings
// Used by house.js, garage.js, and structures.js to move
// things and subthings across all storage locations.
//
// Collections:
//   things           — house things, field: roomId
//   garageThings     — garage things, field: roomId  (same as house!)
//   structureThings  — structure things, field: structureId
//
// SubThing collections:
//   subThings            — house subthings, field: thingId
//   garageSubThings      — garage subthings, field: thingId
//   structureSubThings   — structure subthings, field: thingId
//
// Cross-entity collections updated during Promote:
//   activities, photos, problems, facts, projects, calendarEvents
// ============================================================

// State tracking what is being moved
var moveThing_entityType     = null; // 'thing' or 'subthing'
var moveThing_entityId       = null; // Firestore doc ID
var moveThing_sourceType     = null; // 'thing'|'garagething'|'structurething'|'subthing'|'garagesubthing'|'structuresubthing'

// ============================================================
// OPEN MOVE MODAL
// ============================================================

/**
 * Open the Move modal for a thing or subthing.
 * Loads all available destinations (house rooms, garage rooms, storage structures)
 * and renders them grouped by section.
 *
 * @param {string} entityType    — 'thing' or 'subthing'
 * @param {string} entityId      — Firestore document ID of the entity to move
 * @param {string} sourceType    — targetType string: 'thing'|'subthing'|'garagething'|'garagesubthing'|'structurething'|'structuresubthing'
 */
function openMoveModal(entityType, entityId, sourceType) {
    moveThing_entityType = entityType;
    moveThing_entityId   = entityId;
    moveThing_sourceType = sourceType;

    var modal       = document.getElementById('moveThingModal');
    var titleEl     = document.getElementById('moveThingModalTitle');
    var destSection = document.getElementById('moveThingDestSection');
    var thingSection = document.getElementById('moveThingToThingSection');
    var radioGroup  = document.getElementById('moveSubThingTypeGroup');

    // Set title
    titleEl.textContent = entityType === 'subthing' ? 'Move Sub-Item' : 'Move Thing';

    // For subthings: show the radio option group (Move to Thing vs Promote to standalone)
    // For things: only show destination picker
    if (entityType === 'subthing') {
        radioGroup.classList.remove('hidden');
        document.getElementById('moveSubThingToThingRadio').checked = true;
        document.getElementById('moveSubThingPromoteRadio').checked = false;
        destSection.classList.add('hidden');     // hide room/structure picker initially
        thingSection.classList.remove('hidden'); // show thing picker initially
        loadMoveThingSearchList();
    } else {
        radioGroup.classList.add('hidden');
        thingSection.classList.add('hidden');
        destSection.classList.remove('hidden');
    }

    // Load destination list (rooms + structures) for the dest section
    loadMoveDestinations();

    openModal('moveThingModal');
}

// ============================================================
// LOAD DESTINATIONS
// ============================================================

/**
 * Load all available move destinations grouped by House, Garage, Structures.
 * Renders them in #moveThingDestList.
 */
function loadMoveDestinations() {
    var listEl = document.getElementById('moveThingDestList');
    listEl.innerHTML = '<p class="empty-state">Loading destinations\u2026</p>';

    // Load all three destination types in parallel
    Promise.all([
        houseCol('rooms').orderBy('name').get(),
        userCol('garageRooms').orderBy('order').get(),
        userCol('structures').where('isStorage', '==', true).orderBy('name').get()
    ]).then(function(results) {
        var roomsSnap      = results[0];
        var garageSnap     = results[1];
        var structuresSnap = results[2];

        listEl.innerHTML = '';

        // ---- House rooms ----
        if (!roomsSnap.empty && _mvAllow(true)) {
            listEl.appendChild(buildMoveDestGroup('\uD83C\uDFE0 House', roomsSnap, 'room'));
        }

        // ---- Garage rooms ----
        if (!garageSnap.empty && _mvAllow(false)) {
            listEl.appendChild(buildMoveDestGroup('\uD83D\uDE97 Garage', garageSnap, 'garageroom'));
        }

        // ---- Storage structures ----
        if (!structuresSnap.empty && _mvAllow(false)) {
            listEl.appendChild(buildMoveDestGroup('\uD83C\uDFDA\uFE0F Structures', structuresSnap, 'structure'));
        }

        if (listEl.children.length === 0) {
            listEl.innerHTML = '<p class="empty-state">No destinations available.</p>';
        }

    }).catch(function(err) {
        console.error('loadMoveDestinations error:', err);
        listEl.innerHTML = '<p class="empty-state">Error loading destinations.</p>';
    });
}

/**
 * Build a grouped section of destination buttons.
 * @param {string}         groupLabel  — display label for the group header
 * @param {QuerySnapshot}  snapshot    — docs for this group
 * @param {string}         destType    — 'room' | 'garageroom' | 'structure'
 */
function buildMoveDestGroup(groupLabel, snapshot, destType) {
    var group = document.createElement('div');
    group.className = 'move-destination-group';

    var label = document.createElement('div');
    label.className   = 'move-destination-group-label';
    label.textContent = groupLabel;
    group.appendChild(label);

    snapshot.forEach(function(doc) {
        var btn = document.createElement('button');
        btn.type      = 'button';
        btn.className = 'btn btn-secondary move-dest-btn';
        btn.textContent = escapeHtml(doc.data().name || 'Room');
        btn.dataset.destType = destType;
        btn.dataset.destId   = doc.id;

        btn.addEventListener('click', function() {
            // Highlight selection
            document.querySelectorAll('.move-dest-btn').forEach(function(b) {
                b.classList.remove('move-dest-btn--selected');
            });
            btn.classList.add('move-dest-btn--selected');
        });

        group.appendChild(btn);
    });

    return group;
}

// ============================================================
// THING SEARCH LIST (for "Move SubThing to Another Thing")
// ============================================================

/**
 * Load and render the searchable thing list for "Move to Another Thing".
 * Searches across all three thing collections.
 */
function loadMoveThingSearchList() {
    var listEl    = document.getElementById('moveThingToThingList');
    var emptyEl   = document.getElementById('moveThingToThingEmpty');
    var searchEl  = document.getElementById('moveThingToThingSearch');

    listEl.innerHTML    = '';
    emptyEl.textContent = 'Loading\u2026';
    if (searchEl) searchEl.value = '';

    // Load all things from all three collections in parallel
    Promise.all([
        houseCol('things').get(),
        userCol('garageThings').get(),
        userCol('structureThings').get()
    ]).then(function(results) {
        var allThings = [];

        if (_mvAllow(true)) results[0].forEach(function(doc) {
            allThings.push({ id: doc.id, name: doc.data().name || '', context: 'House', targetType: 'thing' });
        });
        if (_mvAllow(false)) results[1].forEach(function(doc) {
            allThings.push({ id: doc.id, name: doc.data().name || '', context: 'Garage', targetType: 'garagething' });
        });
        if (_mvAllow(false)) results[2].forEach(function(doc) {
            allThings.push({ id: doc.id, name: doc.data().name || '', context: 'Structure', targetType: 'structurething' });
        });

        // Sort alphabetically
        allThings.sort(function(a, b) { return a.name.localeCompare(b.name); });

        emptyEl.textContent = allThings.length === 0 ? 'No things found.' : '';

        // Store all things on the element for filtering
        listEl.dataset.allThings = JSON.stringify(allThings);

        renderMoveThingList(allThings, listEl, emptyEl);

        // Wire up search input
        if (searchEl) {
            searchEl.addEventListener('input', function() {
                var query = searchEl.value.trim().toLowerCase();
                var filtered = query
                    ? allThings.filter(function(t) { return t.name.toLowerCase().includes(query); })
                    : allThings;
                renderMoveThingList(filtered, listEl, emptyEl);
            });
        }
    }).catch(function(err) {
        console.error('loadMoveThingSearchList error:', err);
        emptyEl.textContent = 'Error loading things.';
    });
}

/**
 * Render the filtered list of things to pick from.
 */
function renderMoveThingList(things, listEl, emptyEl) {
    listEl.innerHTML = '';
    emptyEl.textContent = things.length === 0 ? 'No matching things.' : '';

    things.forEach(function(t) {
        var btn = document.createElement('button');
        btn.type      = 'button';
        btn.className = 'btn btn-secondary move-dest-btn';
        btn.innerHTML = escapeHtml(t.name) +
                        ' <span class="move-thing-context-badge">' + escapeHtml(t.context) + '</span>';
        btn.dataset.thingId     = t.id;
        btn.dataset.thingTarget = t.targetType;

        btn.addEventListener('click', function() {
            document.querySelectorAll('#moveThingToThingList .move-dest-btn').forEach(function(b) {
                b.classList.remove('move-dest-btn--selected');
            });
            btn.classList.add('move-dest-btn--selected');
        });

        listEl.appendChild(btn);
    });
}

// ============================================================
// EXECUTE MOVES
// ============================================================

/**
 * Execute the confirmed move action.
 * Reads UI state to determine what type of move to perform.
 */
async function executeMoveConfirm() {
    var btn = document.getElementById('moveThingConfirmBtn');
    btn.disabled    = true;
    btn.textContent = 'Moving\u2026';

    try {
        if (moveThing_entityType === 'thing') {
            // Move a thing to a new room/garage room/structure
            var selected = document.querySelector('#moveThingDestList .move-dest-btn--selected');
            if (!selected) { alert('Please select a destination.'); return; }
            await executeMoveThingToDestination(
                moveThing_entityId,
                moveThing_sourceType,
                selected.dataset.destType,
                selected.dataset.destId
            );
            closeModal('moveThingModal');
            // Reload the thing's detail page (same ID, different parent)
            window.location.hash = '#' + moveThing_sourceType + '/' + moveThing_entityId;

        } else if (moveThing_entityType === 'subthing') {
            var toThingRadio   = document.getElementById('moveSubThingToThingRadio');
            var promoteRadio   = document.getElementById('moveSubThingPromoteRadio');

            if (toThingRadio && toThingRadio.checked) {
                // Move subthing to another thing
                var selectedThing = document.querySelector('#moveThingToThingList .move-dest-btn--selected');
                if (!selectedThing) { alert('Please select a destination thing.'); return; }
                await executeMoveSubThingToThing(
                    moveThing_entityId,
                    selectedThing.dataset.thingId
                );
                closeModal('moveThingModal');
                // Stay on the subthing page (same ID, different parent)
                window.location.reload();

            } else if (promoteRadio && promoteRadio.checked) {
                // Promote subthing to standalone thing
                var selectedDest = document.querySelector('#moveThingDestList .move-dest-btn--selected');
                if (!selectedDest) { alert('Please select a destination location.'); return; }
                var newThingId = await executePromoteSubThingToThing(
                    moveThing_entityId,
                    moveThing_sourceType,
                    selectedDest.dataset.destType,
                    selectedDest.dataset.destId
                );
                closeModal('moveThingModal');
                // Navigate to the new thing page
                var newTargetType = destTypeToThingTargetType(selectedDest.dataset.destType);
                window.location.hash = '#' + newTargetType + '/' + newThingId;
            }
        }
    } catch (err) {
        console.error('Move execution error:', err);
        alert('Error moving item: ' + err.message);
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Move';
    }
}

/**
 * Convert a destination type string to the thing's targetType string.
 * @param {string} destType  — 'room' | 'garageroom' | 'structure'
 * @returns {string}
 */
function destTypeToThingTargetType(destType) {
    if (destType === 'room')       return 'thing';
    if (destType === 'garageroom') return 'garagething';
    if (destType === 'structure')  return 'structurething';
    return 'thing';
}

/**
 * Move a thing to a new destination by updating its parent reference field.
 * All subthings and cross-entity data automatically follow (they reference thingId / targetId,
 * which don't change).
 *
 * @param {string} thingId      — Firestore doc ID of the thing to move
 * @param {string} sourceType   — 'thing' | 'garagething' | 'structurething'
 * @param {string} destType     — 'room' | 'garageroom' | 'structure'
 * @param {string} destId       — Firestore doc ID of the destination
 */
async function executeMoveThingToDestination(thingId, sourceType, destType, destId) {
    // Determine which collection the thing lives in
    var collection = thingSourceTypeToCollection(sourceType);

    // Build the update: clear old reference, set new one
    var update = {};

    // Clear all possible parent reference fields first
    update.roomId       = firebase.firestore.FieldValue.delete();
    update.structureId  = firebase.firestore.FieldValue.delete();

    // Set the new parent reference
    if (destType === 'room' || destType === 'garageroom') {
        update.roomId = destId;
    } else if (destType === 'structure') {
        update.structureId = destId;
    }

    await yNameCol(collection).doc(thingId).update(update);
}

/**
 * Move a subthing to a different parent thing (stays a subthing).
 * Just updates the thingId field. All cross-entity data follows automatically.
 *
 * @param {string} subThingId     — Firestore doc ID of the subthing
 * @param {string} newThingId     — Firestore doc ID of the new parent thing
 */
async function executeMoveSubThingToThing(subThingId, newThingId) {
    // The subthing collection is determined by sourceType stored at open time
    var collection = subThingSourceTypeToCollection(moveThing_sourceType);
    await yNameCol(collection).doc(subThingId).update({ thingId: newThingId });
}

/**
 * Promote a subthing to a standalone thing at a new destination.
 * Steps:
 *   1. Load the subthing doc
 *   2. Determine the target collection based on destType
 *   3. Create a new thing doc at the destination
 *   4. Batch-update ALL cross-entity docs (activities, photos, problems, facts, projects, calendarEvents)
 *      to point from (oldSourceType, subThingId) to (newTargetType, newThingId)
 *   5. Delete the old subthing doc
 *
 * @param {string} subThingId   — Firestore doc ID of the subthing
 * @param {string} sourceType   — 'subthing' | 'garagesubthing' | 'structuresubthing'
 * @param {string} destType     — 'room' | 'garageroom' | 'structure'
 * @param {string} destId       — Firestore doc ID of the destination
 * @returns {Promise<string>}   — new thing's Firestore doc ID
 */
async function executePromoteSubThingToThing(subThingId, sourceType, destType, destId) {
    // Load the subthing document
    var subCollection = subThingSourceTypeToCollection(sourceType);
    var subDoc = await yNameCol(subCollection).doc(subThingId).get();
    if (!subDoc.exists) throw new Error('Subthing not found.');
    var subData = subDoc.data();

    // Determine the target thing collection and the new targetType
    var thingCollection;
    var newTargetType;
    var newThingData = {
        name:         subData.name         || '',
        description:  subData.description  || '',
        purchaseDate: subData.purchaseDate  || null,
        worth:        subData.worth         || null,
        notes:        subData.notes         || '',
        category:     subData.category      || 'other',
        createdAt:    firebase.firestore.FieldValue.serverTimestamp()
    };

    if (destType === 'room') {
        thingCollection = 'things';
        newTargetType   = 'thing';
        newThingData.roomId = destId;
    } else if (destType === 'garageroom') {
        thingCollection = 'garageThings';
        newTargetType   = 'garagething';
        newThingData.roomId = destId;  // garageThings also use roomId
    } else if (destType === 'structure') {
        thingCollection = 'structureThings';
        newTargetType   = 'structurething';
        newThingData.structureId = destId;
    } else {
        throw new Error('Unknown destination type: ' + destType);
    }

    // Create the new thing doc
    var newRef = await yNameCol(thingCollection).add(newThingData);
    var newThingId = newRef.id;

    // Migrate all cross-entity docs from old subthing to new thing
    // (individual updates in a loop — avoids the 500-doc batch limit)
    var crossEntityCollections = [
        'activities', 'photos', 'problems', 'facts', 'projects', 'calendarEvents'
    ];

    for (var i = 0; i < crossEntityCollections.length; i++) {
        var colName = crossEntityCollections[i];
        var snap = await (colName === 'calendarEvents' ? userCol(colName) : yTargetCol(colName, sourceType))
            .where('targetType', '==', sourceType)
            .where('targetId',   '==', subThingId)
            .get();

        for (var j = 0; j < snap.docs.length; j++) {
            await snap.docs[j].ref.update({
                targetType: newTargetType,
                targetId:   newThingId
            });
        }
    }

    // Delete the old subthing doc
    await yNameCol(subCollection).doc(subThingId).delete();

    return newThingId;
}

// ============================================================
// COLLECTION NAME HELPERS
// ============================================================

/**
 * Get the Firestore collection name for a thing given its sourceType.
 * @param {string} sourceType
 * @returns {string}
 */
function thingSourceTypeToCollection(sourceType) {
    if (sourceType === 'thing')         return 'things';
    if (sourceType === 'garagething')   return 'garageThings';
    if (sourceType === 'structurething') return 'structureThings';
    return 'things';
}

/**
 * Get the Firestore collection name for a subthing given its sourceType.
 * @param {string} sourceType
 * @returns {string}
 */
function subThingSourceTypeToCollection(sourceType) {
    if (sourceType === 'subthing')          return 'subThings';
    if (sourceType === 'garagesubthing')    return 'garageSubThings';
    if (sourceType === 'structuresubthing') return 'structureSubThings';
    return 'subThings';
}

// ============================================================
// PAGE BUTTON WIRING
// ============================================================

// Handle radio button change: toggle between "move to thing" and "promote" pickers
document.getElementById('moveSubThingToThingRadio').addEventListener('change', function() {
    if (this.checked) {
        document.getElementById('moveThingToThingSection').classList.remove('hidden');
        document.getElementById('moveThingDestSection').classList.add('hidden');
    }
});

document.getElementById('moveSubThingPromoteRadio').addEventListener('change', function() {
    if (this.checked) {
        document.getElementById('moveThingToThingSection').classList.add('hidden');
        document.getElementById('moveThingDestSection').classList.remove('hidden');
    }
});

document.getElementById('moveThingConfirmBtn').addEventListener('click', function() {
    executeMoveConfirm();
});

document.getElementById('moveThingCancelBtn').addEventListener('click', function() {
    closeModal('moveThingModal');
});

/**
 * While the House is shared, a thing cannot move between the House and the Garage / Structures
 * (one side is shared, the other private), so only destinations on the same side are offered.
 * @param {boolean} destIsHouse - true when the destination is a House room / thing
 */
function _mvAllow(destIsHouse) {
    if (!window.houseShareId) return true;
    var sourceIsHouse = ['thing', 'subthing', 'item'].indexOf(moveThing_sourceType) !== -1;
    return destIsHouse === sourceIsHouse;
}
