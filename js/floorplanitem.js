// ============================================================
// floorplanitem.js — Floor Plan Item Detail Page
// Shows Facts, Problems, Activities, Projects, and Photos for
// any individual floor plan object (door, window, fixture, etc.)
// Route: #floorplanitem/{planId}/{itemType}/{itemId}
// ============================================================

// ---- Page State ----
var currentFpItem        = null;   // The item object from fpPlan
var currentFpPlanForItem = null;   // The full fpPlan document data
var currentFpPlanId      = null;   // The Firestore floorPlans doc ID (= floorId)
var currentFpItemType    = null;   // The itemType string (e.g. 'door', 'fixture')
var currentFpItemId      = null;   // The item's id field

// ============================================================
// ITEM TYPE HELPERS
// ============================================================

/**
 * Given a plan and itemType string, return the correct array from the plan.
 * Returns [] if the array does not exist or itemType is unknown.
 */
function fpItemGetArray(plan, itemType) {
    var map = {
        'door':             plan.doors            || [],
        'window':           plan.windows          || [],
        'ceiling':          plan.ceilingFixtures  || [],
        'recessedLight':    plan.recessedLights   || [],
        'wallplate':        plan.wallPlates       || [],
        'fixture':          plan.fixtures         || [],
        'plumbingEndpoint': plan.plumbingEndpoints|| [],
        'plumbing':         plan.plumbing         || []
    };
    return map[itemType] || [];
}

/**
 * Returns a human-readable type badge label for the item.
 * Uses subtype / fixtureType / endpointType where relevant.
 */
function fpItemGetTypeBadge(item, itemType) {
    if (itemType === 'door') {
        var subtypeMap = { single: 'Door (Single)', french: 'Door (French)', sliding: 'Door (Sliding)', pocket: 'Door (Pocket)' };
        return subtypeMap[item.subtype] || 'Door';
    }
    if (itemType === 'window')           return 'Window';
    if (itemType === 'ceiling') {
        var subtypeMap = { fan: 'Ceiling Fan', 'fan-light': 'Fan/Light', 'flush-mount': 'Flush Mount', 'drop-light': 'Drop Light', chandelier: 'Chandelier', generic: 'Ceiling Fixture' };
        return subtypeMap[item.subtype] || 'Ceiling Fixture';
    }
    if (itemType === 'recessedLight')    return 'Recessed Light';
    if (itemType === 'wallplate')        return 'Wall Plate';
    if (itemType === 'fixture') {
        var ftMap = { toilet: 'Toilet', sink: 'Sink', tub: 'Tub/Shower' };
        return ftMap[item.fixtureType] || 'Fixture';
    }
    if (itemType === 'plumbingEndpoint') {
        return item.endpointType === 'spigot' ? 'Spigot' : 'Stub-out';
    }
    if (itemType === 'plumbing')         return 'Plumbing';
    return itemType;
}

/**
 * Returns the display name for an item — uses item.name if set, otherwise
 * falls back to a human-readable type + position hint.
 */
function fpItemGetDisplayName(item, itemType) {
    if (item.name && item.name.trim()) return item.name.trim();
    return fpItemGetTypeBadge(item, itemType);
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

/**
 * Load the floor plan item detail page.
 * Called from app.js when the route is #floorplanitem/{planId}/{itemType}/{itemId}
 *
 * @param {string} planId    — Firestore floorPlans document ID (same as floorId)
 * @param {string} itemType  — one of: door, window, ceiling, recessedLight,
 *                             wallplate, fixture, plumbingEndpoint, plumbing
 * @param {string} itemId    — the item's id field within the plan array
 */
function loadFloorPlanItemPage(planId, itemType, itemId) {
    currentFpPlanId   = planId;
    currentFpItemType = itemType;
    currentFpItemId   = itemId;
    currentFpItem     = null;
    currentFpPlanForItem = null;

    // Reset page
    document.getElementById('fpItemTitle').textContent  = 'Loading…';
    document.getElementById('fpItemMeta').innerHTML     = '';
    document.getElementById('fpItemNameInput').value    = '';
    document.getElementById('fpItemEditNameRow').style.display = 'none';

    // Load the floorPlan document
    houseCol('floorPlans').doc(planId).get()
        .then(function(doc) {
            if (!doc.exists) {
                document.getElementById('fpItemTitle').textContent = 'Item Not Found';
                return;
            }
            var plan = doc.data();
            currentFpPlanForItem = plan;

            // Find the item in the appropriate array
            var arr  = fpItemGetArray(plan, itemType);
            var item = arr.find(function(x) { return x.id === itemId; });
            if (!item) {
                document.getElementById('fpItemTitle').textContent = 'Item Not Found';
                return;
            }
            currentFpItem = item;

            // Render page content now that we have the item
            renderFloorPlanItemPage(item, itemType, planId, plan);
        })
        .catch(function(err) {
            console.error('loadFloorPlanItemPage error:', err);
            document.getElementById('fpItemTitle').textContent = 'Error loading item';
        });
}

// ============================================================
// PAGE RENDERER
// ============================================================

/**
 * Populate the page-floorplanitem section with the item's data.
 * Loads all cross-entity feature sections (facts, problems, activities,
 * projects, photos).
 */
function renderFloorPlanItemPage(item, itemType, planId, plan) {
    var displayName = fpItemGetDisplayName(item, itemType);
    var typeBadge   = fpItemGetTypeBadge(item, itemType);

    // Title
    document.getElementById('fpItemTitle').textContent = displayName;

    // Pre-fill the name edit input
    document.getElementById('fpItemNameInput').value = item.name || '';

    // Build meta line: type badge + room link + floor plan link
    var metaEl = document.getElementById('fpItemMeta');
    metaEl.innerHTML = '';

    // Type badge span
    var badgeSpan = document.createElement('span');
    badgeSpan.className   = 'type-badge';
    badgeSpan.textContent = typeBadge;
    metaEl.appendChild(badgeSpan);

    // Look up the room name + floor for breadcrumb and links.
    //
    // IMPORTANT: item.roomId is the fpPlan room SHAPE's internal id (e.g. "fp_r_abc").
    // Each fpPlan room shape also has a .roomId field that holds the Firestore room
    // document ID.  We must translate: shape id → fpRoom.roomId → Firestore room.
    var shapeId     = item.roomId || null;
    var fpRoomShape = shapeId
        ? (plan.rooms || []).find(function(r) { return r.id === shapeId; })
        : null;
    var firestoreRoomId = fpRoomShape ? (fpRoomShape.roomId || null) : null;

    var roomName  = '';
    var floorName = '';

    // planId IS the floor's Firestore ID (floorPlans doc has same ID as floor doc)
    var storedFloorId = plan.floorId || planId;

    houseCol('floors').doc(storedFloorId).get()
        .then(function(floorDoc) {
            if (floorDoc.exists) {
                floorName = floorDoc.data().name || 'Floor';
            }
            if (!firestoreRoomId) {
                // No linked room — build breadcrumb without room
                buildHouseBreadcrumb([
                    { label: 'House',       hash: '#house' },
                    { label: floorName,     hash: '#floor/' + storedFloorId },
                    { label: typeBadge,     hash: null }
                ]);

                // Add floor plan link to meta
                var sep = document.createTextNode(' · ');
                metaEl.appendChild(sep);
                var fpLink = document.createElement('a');
                fpLink.href        = '#floorplan/' + planId;
                fpLink.className   = 'breadcrumb-link';
                fpLink.textContent = 'Floor Plan';
                metaEl.appendChild(fpLink);
                return;
            }

            // Load the Firestore room document
            return houseCol('rooms').doc(firestoreRoomId).get()
                .then(function(roomDoc) {
                    if (roomDoc.exists) {
                        roomName = roomDoc.data().name || 'Room';
                    }

                    // Breadcrumb: House › Floor Name › Room Name › Item Name
                    buildHouseBreadcrumb([
                        { label: 'House',           hash: '#house' },
                        { label: floorName,         hash: '#floor/' + storedFloorId },
                        { label: roomName || 'Room', hash: '#room/' + firestoreRoomId },
                        { label: displayName,        hash: null }
                    ]);

                    // Meta line — room link + floor plan link
                    var sep1 = document.createTextNode(' · ');
                    metaEl.appendChild(sep1);
                    var roomLink = document.createElement('a');
                    roomLink.href        = '#room/' + firestoreRoomId;
                    roomLink.className   = 'breadcrumb-link';
                    roomLink.textContent = roomName || 'Room';
                    metaEl.appendChild(roomLink);

                    var sep2 = document.createTextNode(' · ');
                    metaEl.appendChild(sep2);
                    var fpLink = document.createElement('a');
                    fpLink.href        = '#floorplan/' + planId;
                    fpLink.className   = 'breadcrumb-link';
                    fpLink.textContent = 'Floor Plan';
                    metaEl.appendChild(fpLink);
                });
        })
        .catch(function(err) {
            console.error('renderFloorPlanItemPage breadcrumb error:', err);
        });

    // ---- Load all cross-entity feature sections ----
    // targetType = itemType, targetId = item.id
    loadProblems(  itemType, item.id, 'fpItemProblemsContainer',  'fpItemProblemsEmptyState');
    loadFacts(     itemType, item.id, 'fpItemFactsContainer',     'fpItemFactsEmptyState');
    loadProjects(  itemType, item.id, 'fpItemProjectsContainer',  'fpItemProjectsEmptyState');
    loadActivities(itemType, item.id, 'fpItemActivityContainer',  'fpItemActivityEmptyState');
    loadPhotos(    itemType, item.id, 'fpItemPhotoContainer',     'fpItemPhotoEmptyState');
}

// ============================================================
// NAME EDITING
// ============================================================

/**
 * Show the inline name-edit row.
 */
function fpItemShowEditName() {
    var input = document.getElementById('fpItemNameInput');
    input.value = currentFpItem ? (currentFpItem.name || '') : '';
    document.getElementById('fpItemEditNameRow').style.display = 'flex';
    input.focus();
    input.select();
}

/**
 * Hide the inline name-edit row without saving.
 */
function fpItemCancelEditName() {
    document.getElementById('fpItemEditNameRow').style.display = 'none';
}

/**
 * Save the edited name back to Firestore by updating the item in the
 * fpPlan array and writing the whole plan doc.
 */
function fpItemSaveName() {
    if (!currentFpItem || !currentFpPlanForItem || !currentFpPlanId) return;

    var newName = document.getElementById('fpItemNameInput').value.trim();
    var arr     = fpItemGetArray(currentFpPlanForItem, currentFpItemType);
    var item    = arr.find(function(x) { return x.id === currentFpItemId; });
    if (!item) {
        document.getElementById('fpItemEditNameRow').style.display = 'none';
        return;
    }

    item.name = newName;

    // Build the field key for Firestore update
    var arrayKeyMap = {
        'door':             'doors',
        'window':           'windows',
        'ceiling':          'ceilingFixtures',
        'recessedLight':    'recessedLights',
        'wallplate':        'wallPlates',
        'fixture':          'fixtures',
        'plumbingEndpoint': 'plumbingEndpoints',
        'plumbing':         'plumbing'
    };
    var fieldKey = arrayKeyMap[currentFpItemType];
    if (!fieldKey) {
        document.getElementById('fpItemEditNameRow').style.display = 'none';
        return;
    }

    var update = {};
    update[fieldKey] = currentFpPlanForItem[fieldKey] || [];

    houseCol('floorPlans').doc(currentFpPlanId).update(update)
        .then(function() {
            // Update displayed title
            var displayName = fpItemGetDisplayName(item, currentFpItemType);
            document.getElementById('fpItemTitle').textContent = displayName;
            document.getElementById('fpItemEditNameRow').style.display = 'none';
            currentFpItem = item;
        })
        .catch(function(err) {
            console.error('fpItemSaveName error:', err);
            alert('Failed to save name: ' + err.message);
        });
}

// ============================================================
// EVENT WIRING (runs once when script loads)
// ============================================================

(function() {
    // Edit Name button
    var editNameBtn = document.getElementById('fpItemEditNameBtn');
    if (editNameBtn) {
        editNameBtn.addEventListener('click', fpItemShowEditName);
    }

    // Save Name button
    var saveNameBtn = document.getElementById('fpItemSaveNameBtn');
    if (saveNameBtn) {
        saveNameBtn.addEventListener('click', fpItemSaveName);
    }

    // Cancel Name edit button
    var cancelNameBtn = document.getElementById('fpItemCancelNameBtn');
    if (cancelNameBtn) {
        cancelNameBtn.addEventListener('click', fpItemCancelEditName);
    }

    // Allow Enter key to save name
    var nameInput = document.getElementById('fpItemNameInput');
    if (nameInput) {
        nameInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') fpItemSaveName();
            if (e.key === 'Escape') fpItemCancelEditName();
        });
    }

    // ---- Feature section buttons ----

    document.getElementById('addFpItemProblemBtn').addEventListener('click', function() {
        if (currentFpItem) openAddProblemModal(currentFpItemType, currentFpItemId);
    });

    document.getElementById('addFpItemFactBtn').addEventListener('click', function() {
        if (currentFpItem) openAddFactModal(currentFpItemType, currentFpItemId);
    });

    document.getElementById('addFpItemProjectBtn').addEventListener('click', function() {
        if (currentFpItem) openAddProjectModal(currentFpItemType, currentFpItemId);
    });

    document.getElementById('logFpItemActivityBtn').addEventListener('click', function() {
        if (currentFpItem) openLogActivityModal(currentFpItemType, currentFpItemId);
    });

    document.getElementById('addFpItemCameraBtn').addEventListener('click', function() {
        if (currentFpItem) triggerCameraUpload(currentFpItemType, currentFpItemId);
    });

    document.getElementById('addFpItemGalleryBtn').addEventListener('click', function() {
        if (currentFpItem) triggerGalleryUpload(currentFpItemType, currentFpItemId);
    });

    // "Show resolved" checkbox for problems
    document.getElementById('showResolvedFpItemProblems').addEventListener('change', function() {
        if (currentFpItem) {
            loadProblems(currentFpItemType, currentFpItemId,
                'fpItemProblemsContainer', 'fpItemProblemsEmptyState');
        }
    });
})();
