// ============================================================
// Problems.js — Problems / Concerns CRUD and display logic
// Problems can be attached to plants or zones via targetType/targetId.
// When resolved, a resolvedAt timestamp is recorded.
// Resolved problems are hidden by default (toggle with checkbox).
// Stored in Firestore collection: "problems"
// ============================================================

// ---------- Shared Date/Time Formatter ----------

/**
 * Formats an ISO date string or Firestore Timestamp for display.
 * Returns a readable date/time like "Mar 9, 2026, 2:30 PM"
 * This function is used by both problems.js and projects.js.
 * @param {string|Object} dateValue - ISO string or Firestore Timestamp.
 * @returns {string} Formatted date/time string.
 */
function formatDateTime(dateValue) {
    if (!dateValue) return '';
    var date;
    if (dateValue.toDate) {
        date = dateValue.toDate();  // Firestore Timestamp
    } else {
        date = new Date(dateValue);
    }
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

// ---------- Load & Display Problems ----------

/**
 * Loads and displays problems for a given target (plant or zone).
 * Resolved problems are hidden unless the "show resolved" checkbox is checked.
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The Firestore document ID of the plant or zone.
 * @param {string} containerId - The ID of the container element to render into.
 * @param {string} emptyStateId - The ID of the empty-state message element.
 */
/**
 * Describes how to fetch immediate children for each parent entity type.
 * Used by loadProblemsWithChildren() to roll up child problems to the parent page.
 * Each entry: { collection, parentField, childType }
 *   collection  — Firestore collection name
 *   parentField — field on child docs that holds the parent ID
 *   childType   — the targetType string used in the problems collection
 */
var PROBLEM_CHILD_MAP = {
    'floor':         { collection: 'rooms',              parentField: 'floorId',     childType: 'room'           },
    'room':          { collection: 'things',             parentField: 'roomId',      childType: 'thing'          },
    'thing':         { collection: 'subThings',          parentField: 'thingId',     childType: 'subthing'       },
    'garageroom':    { collection: 'garageThings',       parentField: 'roomId',      childType: 'garagething'    },
    'garagething':   { collection: 'garageSubThings',    parentField: 'thingId',     childType: 'garagesubthing' },
    'structure':     { collection: 'structureThings',    parentField: 'structureId', childType: 'structurething' },
    'structurething':{ collection: 'structureSubThings', parentField: 'thingId',     childType: 'structuresubthing' },
    'zone':          { collection: 'zones',              parentField: 'parentId',    childType: 'zone'           },
};

/**
 * Recursively gathers ALL problems for an entity and every descendant.
 * The root entity's own problems get sourceLabel=null (no "from:" shown).
 * Every descendant's problems get sourceLabel = that descendant's name.
 *
 * Example: calling _gatherProblems('floor', floorId, null) returns:
 *   - floor's own problems          (sourceLabel: null)
 *   - each room's problems          (sourceLabel: room name)
 *   - each thing in each room       (sourceLabel: thing name)
 *   - each subthing in each thing   (sourceLabel: subthing name)
 *
 * @param {string}      entityType  - targetType for this entity
 * @param {string}      entityId    - Firestore document ID
 * @param {string|null} sourceLabel - Label to attach to problems at this level (null = own entity)
 * @returns {Promise<Array>} Array of { problem, targetType, targetId, sourceLabel }
 */
async function _gatherProblems(entityType, entityId, sourceLabel) {
    var items = [];

    // Load problems belonging directly to this entity
    var snap = await yTargetCol('problems', entityType)
        .where('targetType', '==', entityType)
        .where('targetId',   '==', entityId)
        .get();
    snap.forEach(function(doc) {
        items.push({
            problem:     Object.assign({ id: doc.id }, doc.data()),
            targetType:  entityType,
            targetId:    entityId,
            sourceLabel: sourceLabel
        });
    });

    // Recurse into children (if this type has children defined)
    var childDef = PROBLEM_CHILD_MAP[entityType];
    if (childDef) {
        var childrenSnap = await yNameCol(childDef.collection)
            .where(childDef.parentField, '==', entityId)
            .get();

        var childPromises = [];
        childrenSnap.forEach(function(childDoc) {
            var childName = childDoc.data().name || 'Unknown';
            childPromises.push(
                _gatherProblems(childDef.childType, childDoc.id, childName)
                    .then(function(childItems) {
                        childItems.forEach(function(ci) { items.push(ci); });
                    })
            );
        });
        await Promise.all(childPromises);
    }

    return items;
}

/**
 * Load problems for a parent entity AND ALL descendants (recursive roll-up).
 * Replaces the old single-level version — now a floor sees thing/subthing problems too.
 */
async function loadProblemsWithChildren(targetType, targetId, containerId, emptyStateId) {
    var container  = document.getElementById(containerId);
    var emptyState = document.getElementById(emptyStateId);

    var checkboxMap = {
        'floor':          'showResolvedFloorProblems',
        'room':           'showResolvedRoomProblems',
        'thing':          'showResolvedThingProblems',
        'garageroom':     'showResolvedGarageRoomProblems',
        'garagething':    'showResolvedGarageThingProblems',
        'structure':      'showResolvedStructureProblems',
        'structurething': 'showResolvedStructureThingProblems',
        'zone':           'showResolvedZoneProblems',
    };
    var cb = document.getElementById(checkboxMap[targetType]);
    var showResolved = cb ? cb.checked : false;

    container.innerHTML = '';
    emptyState.style.display = 'none';

    try {
        // Gather own + all descendant problems in one recursive sweep
        var allItems = await _gatherProblems(targetType, targetId, null);

        // Split open / resolved, sort newest first
        var openItems     = allItems.filter(function(i) { return i.problem.status === 'open'; });
        var resolvedItems = allItems.filter(function(i) { return i.problem.status === 'resolved'; });

        openItems.sort(function(a, b)     { return (b.problem.dateLogged || '').localeCompare(a.problem.dateLogged || ''); });
        resolvedItems.sort(function(a, b) { return (b.problem.dateLogged || '').localeCompare(a.problem.dateLogged || ''); });

        var displayItems = showResolved ? openItems.concat(resolvedItems) : openItems;

        if (displayItems.length === 0) {
            emptyState.textContent = resolvedItems.length > 0
                ? 'All issues resolved! Check "Show resolved" to see them.'
                : 'No problems or concerns logged.';
            emptyState.style.display = 'block';
            return;
        }

        displayItems.forEach(function(item) {
            container.appendChild(createProblemItem(item.problem, item.targetType, item.targetId, item.sourceLabel));
        });

    } catch (err) {
        console.error('loadProblemsWithChildren error:', err);
        emptyState.textContent = 'Error loading problems.';
        emptyState.style.display = 'block';
    }
}

async function loadProblems(targetType, targetId, containerId, emptyStateId) {
    // Types that support child roll-up delegate to loadProblemsWithChildren
    if (PROBLEM_CHILD_MAP[targetType]) {
        return loadProblemsWithChildren(targetType, targetId, containerId, emptyStateId);
    }

    const container = document.getElementById(containerId);
    const emptyState = document.getElementById(emptyStateId);

    // Check if "show resolved" checkbox is checked — map every targetType to its checkbox ID
    const checkboxMap = {
        'plant':            'showResolvedPlantProblems',
        'zone':             'showResolvedZoneProblems',
        'vehicle':          'showResolvedVehicleProblems',
        'garageroom':       'showResolvedGarageRoomProblems',
        'garagething':      'showResolvedGarageThingProblems',
        'garagesubthing':   'showResolvedGarageSubThingProblems',
        'structure':        'showResolvedStructureProblems',
        'structurething':   'showResolvedStructureThingProblems',
        'structuresubthing':'showResolvedStructureSubThingProblems',
        'floor':            'showResolvedFloorProblems',
        'room':             'showResolvedRoomProblems',
        'thing':            'showResolvedThingProblems',
        'subthing':         'showResolvedSubThingProblems',
        'item':             'showResolvedItemProblems',
        'panel':            'showResolvedPanelProblems',
        'weed':             'showResolvedWeedProblems',
        // Floor plan item types — all share the same checkbox on page-floorplanitem
        'door':             'showResolvedFpItemProblems',
        'window':           'showResolvedFpItemProblems',
        'ceiling':          'showResolvedFpItemProblems',
        'recessedLight':    'showResolvedFpItemProblems',
        'wallplate':        'showResolvedFpItemProblems',
        'fixture':          'showResolvedFpItemProblems',
        'plumbingEndpoint': 'showResolvedFpItemProblems',
        'plumbing':         'showResolvedFpItemProblems',
    };
    const checkboxId = checkboxMap[targetType];
    const checkbox = checkboxId ? document.getElementById(checkboxId) : null;
    const showResolved = checkbox ? checkbox.checked : false;

    try {
        const snapshot = await yTargetCol('problems', targetType)
            .where('targetType', '==', targetType)
            .where('targetId', '==', targetId)
            .get();

        container.innerHTML = '';

        if (snapshot.empty) {
            emptyState.textContent = 'No problems or concerns logged.';
            emptyState.style.display = 'block';
            return;
        }

        // Collect all problems
        const allProblems = [];
        snapshot.forEach(function(doc) {
            allProblems.push({ id: doc.id, ...doc.data() });
        });

        // Separate open and resolved
        const openProblems = allProblems.filter(function(p) {
            return p.status === 'open';
        });
        const resolvedProblems = allProblems.filter(function(p) {
            return p.status === 'resolved';
        });

        // Sort each group: newest first by dateLogged
        openProblems.sort(function(a, b) {
            return (b.dateLogged || '').localeCompare(a.dateLogged || '');
        });
        resolvedProblems.sort(function(a, b) {
            return (b.dateLogged || '').localeCompare(a.dateLogged || '');
        });

        // Build display list: open always shown, resolved only if checkbox checked
        const displayProblems = showResolved
            ? openProblems.concat(resolvedProblems)
            : openProblems;

        if (displayProblems.length === 0) {
            if (resolvedProblems.length > 0) {
                emptyState.textContent = 'All issues resolved! Check "Show resolved" to see them.';
            } else {
                emptyState.textContent = 'No problems or concerns logged.';
            }
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        displayProblems.forEach(function(problem) {
            const item = createProblemItem(problem, targetType, targetId);
            container.appendChild(item);
        });

    } catch (error) {
        console.error('Error loading problems:', error);
        emptyState.textContent = 'Error loading problems.';
        emptyState.style.display = 'block';
    }
}

// ---------- Create a Problem Item Element ----------

/**
 * Creates a DOM element representing a single problem/concern.
 * Clicking the item opens the edit modal (no separate Edit button).
 * @param {Object} problem    - The problem data (including id).
 * @param {string} targetType - The problem's own targetType (used for edit modal and reload).
 * @param {string} targetId   - The problem's own targetId.
 * @param {string} [sourceLabel] - Optional label shown when rolled up from a child entity
 *                                  e.g. "Kitchen" when a thing problem appears on the room page.
 * @returns {HTMLElement} The problem item element.
 */
function createProblemItem(problem, targetType, targetId, sourceLabel) {
    const item = document.createElement('div');
    item.className = 'problem-item problem-item--clickable' + (problem.status === 'resolved' ? ' resolved' : '');
    item.title = 'Click to edit';

    // Left side: badge + description + secondary info
    const leftSide = document.createElement('div');
    leftSide.className = 'problem-left';

    // Top row: badge + description
    const topRow = document.createElement('div');
    topRow.className = 'problem-top-row';

    const badge = document.createElement('span');
    badge.className = 'problem-badge ' + (problem.status === 'open' ? 'badge-open' : 'badge-resolved');
    badge.textContent = problem.status === 'open' ? 'Open' : 'Resolved';
    topRow.appendChild(badge);

    const desc = document.createElement('span');
    desc.className = 'problem-description';
    desc.textContent = problem.description;
    topRow.appendChild(desc);

    leftSide.appendChild(topRow);

    // Secondary info line: date · notes · source label (if rolled up)
    var secondaryParts = [];
    if (problem.dateLogged) secondaryParts.push(problem.dateLogged);
    if (problem.status === 'resolved' && problem.resolvedAt) {
        secondaryParts.push('Resolved: ' + formatDateTime(problem.resolvedAt));
    }
    if (problem.notes) secondaryParts.push(problem.notes);
    if (sourceLabel)   secondaryParts.push('from: ' + sourceLabel);

    if (secondaryParts.length > 0) {
        const secondary = document.createElement('div');
        secondary.className = 'problem-secondary';
        secondary.textContent = secondaryParts.join(' \u2022 ');
        leftSide.appendChild(secondary);
    }

    item.appendChild(leftSide);

    // Right side: chevron arrow (signals the item is clickable)
    const arrow = document.createElement('span');
    arrow.className = 'problem-arrow';
    arrow.textContent = '›';
    item.appendChild(arrow);

    // Clicking anywhere on the item opens the edit modal
    item.addEventListener('click', function() {
        openEditProblemModal(problem, targetType, targetId);
    });

    return item;
}

// ---------- Add Problem ----------

/**
 * Opens the add-problem modal.
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The target's Firestore document ID.
 */
function openAddProblemModal(targetType, targetId) {
    const modal = document.getElementById('problemModal');
    const modalTitle = document.getElementById('problemModalTitle');
    const descInput = document.getElementById('problemDescInput');
    const notesInput = document.getElementById('problemNotesInput');

    modalTitle.textContent = 'Add Problem / Concern';
    descInput.value = '';
    notesInput.value = '';

    modal.dataset.mode = 'add';
    modal.dataset.targetType = targetType;
    window.yardProblemOpen = _yIsYardTarget(targetType);   // facts/photos on this problem follow it into the yard share
    window.houseProblemOpen = _hIsHouseTarget(targetType);   // same for the house
    modal.dataset.targetId = targetId;

    // Hide Delete button and Status field in add mode (new problems are always Open)
    document.getElementById('problemModalDeleteBtn').style.display = 'none';
    document.getElementById('problemStatusGroup').style.display = 'none';
    document.getElementById('problemFactsSection').style.display = 'block';
    document.getElementById('problemFactsContainer').innerHTML = '';
    document.getElementById('problemFactsEmptyState').textContent = 'Save this problem first, then add facts.';
    document.getElementById('problemFactsEmptyState').style.display = 'block';

    // Hide photos section until problem is saved and has an ID
    document.getElementById('problemPhotosSection').style.display = 'none';
    document.getElementById('problemPhotoContainer').innerHTML = '';

    openModal('problemModal');
    descInput.focus();
}

// ---------- Edit Problem ----------

/**
 * Opens the edit-problem modal with existing data.
 * @param {Object} problem - The problem data (including id).
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The target's Firestore document ID.
 */
function openEditProblemModal(problem, targetType, targetId) {
    const modal = document.getElementById('problemModal');
    const modalTitle = document.getElementById('problemModalTitle');
    const descInput = document.getElementById('problemDescInput');
    const notesInput = document.getElementById('problemNotesInput');

    modalTitle.textContent = 'Edit Problem / Concern';
    descInput.value = problem.description || '';
    notesInput.value = problem.notes || '';

    modal.dataset.mode = 'edit';
    modal.dataset.editId = problem.id;
    modal.dataset.targetType = targetType;
    window.yardProblemOpen = _yIsYardTarget(targetType);   // facts/photos on this problem follow it into the yard share
    window.houseProblemOpen = _hIsHouseTarget(targetType);   // same for the house
    modal.dataset.targetId = targetId;

    // Show Delete button and Status field in edit mode
    document.getElementById('problemModalDeleteBtn').style.display = 'inline-flex';
    document.getElementById('problemStatusGroup').style.display = '';
    document.getElementById('problemStatusSelect').value = problem.status || 'open';

    // Show Facts section and load facts for this problem
    document.getElementById('problemFactsSection').style.display = 'block';
    loadFacts('problem', problem.id, 'problemFactsContainer', 'problemFactsEmptyState');

    // Show Photos section and load photos for this problem
    document.getElementById('problemPhotosSection').style.display = 'block';
    window.currentProblem = { id: problem.id };
    loadPhotos('problem', problem.id, 'problemPhotoContainer', 'problemPhotoEmptyState');

    openModal('problemModal');
    descInput.focus();
}

// ---------- Save Problem (Add or Edit) ----------

/**
 * Handles the save button in the problem modal.
 */
async function handleProblemModalSave() {
    const modal = document.getElementById('problemModal');
    const descInput = document.getElementById('problemDescInput');
    const notesInput = document.getElementById('problemNotesInput');

    const description = descInput.value.trim();
    const notes = notesInput.value.trim();

    if (!description) {
        alert('Please enter a description.');
        return;
    }

    const mode = modal.dataset.mode;
    const targetType = modal.dataset.targetType;
    const targetId = modal.dataset.targetId;

    try {
        if (mode === 'add') {
            await yTargetCol('problems', targetType).add({
                targetType: targetType,
                targetId: targetId,
                description: description,
                notes: notes,
                status: 'open',
                dateLogged: new Date().toISOString().split('T')[0],  // YYYY-MM-DD
                resolvedAt: null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('Problem added:', description);

        } else if (mode === 'edit') {
            const problemId  = modal.dataset.editId;
            const newStatus  = document.getElementById('problemStatusSelect').value;

            // Read the current status to detect a change
            const existing   = await yTargetCol('problems', targetType).doc(problemId).get();
            const oldStatus  = existing.exists ? (existing.data().status || 'open') : 'open';

            const updateData = { description, notes, status: newStatus };

            if (newStatus === 'resolved' && oldStatus !== 'resolved') {
                // Newly resolving — stamp the timestamp
                updateData.resolvedAt = new Date().toISOString();
            } else if (newStatus === 'open' && oldStatus === 'resolved') {
                // Reopening — clear the timestamp
                updateData.resolvedAt = null;
            }

            await yTargetCol('problems', targetType).doc(problemId).update(updateData);
            console.log('Problem updated:', description, '| status:', newStatus);

            // When resolving, auto-create an activity entry (same as the old Resolve button did)
            if (newStatus === 'resolved' && oldStatus !== 'resolved' &&
                ACTIVITY_SUPPORTED_TARGETS.indexOf(targetType) >= 0) {
                const today = new Date().toISOString().split('T')[0];
                await yTargetCol('activities', targetType).add({
                    targetType:  targetType,
                    targetId:    targetId,
                    description: 'Resolved: ' + description,
                    notes:       notes,
                    date:        today,
                    chemicalIds: [],
                    createdAt:   firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }

        closeModal('problemModal');
        reloadProblemsForCurrentTarget(targetType, targetId);

    } catch (error) {
        console.error('Error saving problem:', error);
        alert('Error saving problem. Check console for details.');
    }
}

// ---------- Toggle Problem Status ----------

/**
 * Toggles a problem between open and resolved.
 * When resolving, records a resolvedAt timestamp.
 * When reopening, clears the resolvedAt timestamp.
 * @param {string} problemId - The problem's Firestore document ID.
 * @param {string} currentStatus - The current status ("open" or "resolved").
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The target's Firestore document ID.
 */
// Target types that have an activity history section.
// When a problem is resolved for one of these, an activity is auto-created.
var ACTIVITY_SUPPORTED_TARGETS = [
    'plant', 'zone', 'vehicle',
    'garageroom', 'garagething', 'garagesubthing',
    'structure', 'structurething', 'structuresubthing',
    'floor', 'room', 'thing', 'subthing'
];

async function toggleProblemStatus(problemId, currentStatus, targetType, targetId) {
    const newStatus = currentStatus === 'open' ? 'resolved' : 'open';

    // Confirm before resolving (not needed for reopening)
    if (newStatus === 'resolved') {
        if (!confirm('Mark this problem as resolved?')) return;
    }

    try {
        const updateData = { status: newStatus };

        if (newStatus === 'resolved') {
            // Record the resolution timestamp
            updateData.resolvedAt = new Date().toISOString();
        } else {
            // Clear the resolution timestamp when reopening
            updateData.resolvedAt = null;
        }

        await yTargetCol('problems', targetType).doc(problemId).update(updateData);
        console.log('Problem status changed to:', newStatus);

        // When resolving, auto-create an activity so it appears in history.
        // Only applies to target types that have an activity history section.
        if (newStatus === 'resolved' && ACTIVITY_SUPPORTED_TARGETS.indexOf(targetType) >= 0) {
            const problemDoc = await yTargetCol('problems', targetType).doc(problemId).get();
            if (problemDoc.exists) {
                const p = problemDoc.data();
                const today = new Date().toISOString().split('T')[0];
                await yTargetCol('activities', targetType).add({
                    targetType:    targetType,
                    targetId:      targetId,
                    description:   'Resolved: ' + (p.description || 'Problem'),
                    notes:         p.notes || '',
                    date:          today,
                    chemicalIds:   [],
                    createdAt:     firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log('Auto-created activity for resolved problem:', p.description);
            }
        }

        reloadProblemsForCurrentTarget(targetType, targetId);
        // Also refresh the activity list if it's visible on the same page
        reloadActivitiesForCurrentTarget(targetType, targetId);

    } catch (error) {
        console.error('Error toggling problem status:', error);
        alert('Error updating problem. Check console for details.');
    }
}

// ---------- Delete Problem ----------

/**
 * Deletes a problem after confirmation.
 * @param {string} problemId - The problem's Firestore document ID.
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The target's Firestore document ID.
 */
async function handleDeleteProblem(problemId, targetType, targetId) {
    if (!confirm('Are you sure you want to delete this problem?')) {
        return;
    }

    try {
        await yTargetCol('problems', targetType).doc(problemId).delete();
        console.log('Problem deleted:', problemId);
        reloadProblemsForCurrentTarget(targetType, targetId);

    } catch (error) {
        console.error('Error deleting problem:', error);
        alert('Error deleting problem. Check console for details.');
    }
}

// ---------- Reload Helper ----------

/**
 * Reloads the problems list for the current target.
 * Determines the correct container IDs based on target type.
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The target's Firestore document ID.
 */
function reloadProblemsForCurrentTarget(targetType, targetId) {
    var map = {
        'plant':            ['plantProblemsContainer',               'plantProblemsEmptyState'],
        'zone':             ['zoneProblemsContainer',                'zoneProblemsEmptyState'],
        'vehicle':          ['vehicleProblemsContainer',             'vehicleProblemsEmptyState'],
        'panel':            ['panelProblemsContainer',               'panelProblemsEmptyState'],
        'floor':            ['floorProblemsContainer',               'floorProblemsEmptyState'],
        'room':             ['roomProblemsContainer',                'roomProblemsEmptyState'],
        'thing':            ['thingProblemsContainer',               'thingProblemsEmptyState'],
        'subthing':         ['stProblemsContainer',                  'stProblemsEmptyState'],
        'garageroom':       ['garageRoomProblemsContainer',          'garageRoomProblemsEmpty'],
        'garagething':      ['garageThingProblemsContainer',         'garageThingProblemsEmpty'],
        'garagesubthing':   ['garageSubThingProblemsContainer',      'garageSubThingProblemsEmpty'],
        'structure':        ['structureProblemsContainer',           'structureProblemsEmpty'],
        'structurething':   ['structureThingProblemsContainer',      'structureThingProblemsEmpty'],
        'structuresubthing':['structureSubThingProblemsContainer',   'structureSubThingProblemsEmpty'],
        'fpOutlet':         ['fpOutletProblemsContainer',            'fpOutletProblemsEmptyState'],
        'fpSwitch':         ['fpSwitchProblemsContainer',            'fpSwitchProblemsEmptyState'],
        'fpPlumbing':       ['fpPlumbingProblemsContainer',          'fpPlumbingProblemsEmptyState'],
        'fpCeiling':        ['fpCeilingProblemsContainer',           'fpCeilingProblemsEmptyState'],
        'breaker':          ['breakerProblemsContainer',             'breakerProblemsEmptyState'],
        'weed':             ['weedProblemsContainer',                'weedProblemsEmptyState'],
    };
    var ids = map[targetType];
    if (ids) {
        loadProblems(targetType, targetId, ids[0], ids[1]);
    }
}

// ---------- Ensure Problem Saved (for facts in add mode) ----------

/**
 * If the problem modal is in add mode, saves the problem and switches to edit mode.
 * Used by the facts "+ Add" button so facts can be added during initial problem creation.
 * @returns {string|null} The problem ID if saved/already exists, or null if validation failed.
 */
async function ensureProblemSaved() {
    var modal = document.getElementById('problemModal');
    if (modal.dataset.mode === 'edit') {
        return modal.dataset.editId || null;
    }

    // In add mode — validate then save
    var description = document.getElementById('problemDescInput').value.trim();
    var notes = document.getElementById('problemNotesInput').value.trim();
    var targetType = modal.dataset.targetType;
    var targetId = modal.dataset.targetId;

    if (!description) {
        alert('Please enter a description before adding facts.');
        return null;
    }

    try {
        var docRef = await yTargetCol('problems', targetType).add({
            targetType: targetType,
            targetId: targetId,
            description: description,
            notes: notes,
            status: 'open',
            dateLogged: new Date().toISOString().split('T')[0],
            resolvedAt: null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('Problem auto-saved for facts:', description);

        // Switch modal to edit mode so subsequent saves update instead of re-inserting
        modal.dataset.mode = 'edit';
        modal.dataset.editId = docRef.id;
        document.getElementById('problemModalTitle').textContent = 'Edit Problem / Concern';
        document.getElementById('problemModalDeleteBtn').style.display = 'inline-flex';

        // Reload the facts section now that we have an ID
        loadFacts('problem', docRef.id, 'problemFactsContainer', 'problemFactsEmptyState');

        // Show and load the photos section now that we have an ID
        document.getElementById('problemPhotosSection').style.display = 'block';
        window.currentProblem = { id: docRef.id };
        loadPhotos('problem', docRef.id, 'problemPhotoContainer', 'problemPhotoEmptyState');

        // Reload the problems list in the background
        reloadProblemsForCurrentTarget(targetType, targetId);

        return docRef.id;

    } catch (error) {
        console.error('Error auto-saving problem:', error);
        alert('Error saving problem. Check console for details.');
        return null;
    }
}

// ---------- Event Listeners ----------

document.addEventListener('DOMContentLoaded', function() {

    // "Add Problem" buttons (plant and zone detail pages)
    document.getElementById('addPlantProblemBtn').addEventListener('click', function() {
        if (window.currentPlant) {
            openAddProblemModal('plant', window.currentPlant.id);
        }
    });

    document.getElementById('addZoneProblemBtn').addEventListener('click', function() {
        if (window.currentZone) {
            openAddProblemModal('zone', window.currentZone.id);
        }
    });

    // "Show resolved" checkboxes — reload list when toggled
    // Uses a helper to avoid repetition across all target types
    function wireShowResolved(checkboxId, getTargetFn, containerId, emptyId, targetType) {
        var cb = document.getElementById(checkboxId);
        if (!cb) return;
        cb.addEventListener('change', function() {
            var target = getTargetFn();
            if (target) loadProblems(targetType, target.id, containerId, emptyId);
        });
    }

    wireShowResolved('showResolvedZoneProblems',             function(){ return window.currentZone; },           'zoneProblemsContainer',               'zoneProblemsEmptyState',           'zone');
    wireShowResolved('showResolvedPlantProblems',            function(){ return window.currentPlant; },          'plantProblemsContainer',              'plantProblemsEmptyState',          'plant');
    wireShowResolved('showResolvedVehicleProblems',          function(){ return window.currentVehicle; },        'vehicleProblemsContainer',            'vehicleProblemsEmptyState',        'vehicle');
    wireShowResolved('showResolvedGarageRoomProblems',       function(){ return window.currentGarageRoom; },     'garageRoomProblemsContainer',         'garageRoomProblemsEmpty',          'garageroom');
    wireShowResolved('showResolvedGarageThingProblems',      function(){ return window.currentGarageThing; },    'garageThingProblemsContainer',        'garageThingProblemsEmpty',         'garagething');
    wireShowResolved('showResolvedGarageSubThingProblems',   function(){ return window.currentGarageSubThing; }, 'garageSubThingProblemsContainer',     'garageSubThingProblemsEmpty',      'garagesubthing');
    wireShowResolved('showResolvedStructureProblems',        function(){ return window.currentStructure; },      'structureProblemsContainer',          'structureProblemsEmpty',           'structure');
    wireShowResolved('showResolvedStructureThingProblems',   function(){ return window.currentStructureThing; }, 'structureThingProblemsContainer',     'structureThingProblemsEmpty',      'structurething');
    wireShowResolved('showResolvedStructureSubThingProblems',function(){ return window.currentStructureSubThing;},'structureSubThingProblemsContainer', 'structureSubThingProblemsEmpty',   'structuresubthing');
    wireShowResolved('showResolvedFloorProblems',            function(){ return window.currentFloor; },          'floorProblemsContainer',              'floorProblemsEmptyState',          'floor');
    wireShowResolved('showResolvedRoomProblems',             function(){ return window.currentRoom; },           'roomProblemsContainer',               'roomProblemsEmptyState',           'room');
    wireShowResolved('showResolvedThingProblems',            function(){ return window.currentThing; },          'thingProblemsContainer',              'thingProblemsEmptyState',          'thing');
    wireShowResolved('showResolvedSubThingProblems',         function(){ return window.currentSubThing; },       'stProblemsContainer',                 'stProblemsEmptyState',             'subthing');
    wireShowResolved('showResolvedPanelProblems',            function(){ return window.currentPanel; },          'panelProblemsContainer',              'panelProblemsEmptyState',          'panel');

    // Problem modal — voice-to-text on the Description (formerly Notes) textarea
    if (typeof initVoiceToText === 'function') {
        initVoiceToText('problemNotesInput', 'problemNotesVoiceBtn');
    }

    // Problem modal — Save buttons (bottom and top)
    document.getElementById('problemModalSaveBtn').addEventListener('click', handleProblemModalSave);
    document.getElementById('problemModalSaveBtnTop').addEventListener('click', handleProblemModalSave);

    // Problem modal — Delete button (only visible in edit mode)
    document.getElementById('problemModalDeleteBtn').addEventListener('click', function() {
        var modal = document.getElementById('problemModal');
        var problemId = modal.dataset.editId;
        var targetType = modal.dataset.targetType;
        var targetId = modal.dataset.targetId;
        if (problemId) {
            closeModal('problemModal');
            handleDeleteProblem(problemId, targetType, targetId);
        }
    });

    // Problem modal — Cancel buttons (bottom and top)
    document.getElementById('problemModalCancelBtn').addEventListener('click', function() {
        closeModal('problemModal');
    });
    document.getElementById('problemModalCancelBtnTop').addEventListener('click', function() {
        closeModal('problemModal');
    });

    // Problem modal — Close on overlay click
    document.getElementById('problemModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal('problemModal');
    });
});
