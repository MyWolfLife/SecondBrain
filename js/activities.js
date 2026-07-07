// ============================================================
// Activities.js — Activity logging, history display, and Saved Actions
// Activities are logged against plants, zones, or weeds.
// Saved Actions are reusable templates that pre-fill the activity form.
// Firestore collections: "activities" and "savedActions"
//
// Multi-chemical support: activities and saved actions store chemicalIds[]
// (array). Old records with a single chemicalId are normalized on read.
// ============================================================

/** Chemical IDs currently selected in the saved-action modal. */
var savedActionSelectedChemicalIds = [];

/** Chemical IDs currently selected in the log/edit activity modal. */
var _activitySelectedChemIds = [];

/** Firestore place ID selected in the activity modal (null = none). */
var _activityPlaceId = null;

/** Venue data for a NEW (unsaved) place picked from search dropdown. */
var _activityPlaceVenue = null;

/** Venues shown in the activity place search dropdown. */
var _activityPlaceDropdownVenues = [];
/** GPS coords captured when the activity modal opens — used to bias name searches and show distance. */
var _activityBiasLat = null;
var _activityBiasLng = null;

/**
 * Which modal most recently opened the chemical picker: 'activity' or 'savedAction'.
 * Used by handleChemicalPickerDone to route the selection back correctly.
 */
var _chemPickerContext = 'savedAction';

// ---------- Chemical Checkbox List Helpers ----------

/**
 * Normalizes an activity or saved action record so it always has chemicalIds[].
 * Old records stored a single chemicalId string.
 * @param {Object} record - The activity or saved action data.
 * @returns {string[]} The array of chemical IDs.
 */
function normalizeChemicalIds(record) {
    if (Array.isArray(record.chemicalIds)) {
        return record.chemicalIds;
    }
    if (record.chemicalId) {
        return [record.chemicalId];
    }
    return [];
}

/**
 * Builds a checkbox list of all chemicals inside a container element.
 * @param {string} containerId - The ID of the div to populate.
 * @param {string[]} selectedIds - Array of chemical IDs to pre-check.
 */
async function buildChemicalCheckboxList(containerId, selectedIds) {
    var container = document.getElementById(containerId);
    container.innerHTML = '<em style="color:#888;font-size:0.85em;">Loading...</em>';

    try {
        var chemicals = await getAllChemicals();

        container.innerHTML = '';

        if (chemicals.length === 0) {
            container.innerHTML = '<em style="color:#888;font-size:0.85em;">No products added yet.</em>';
            return;
        }

        chemicals.forEach(function(chem) {
            var label = document.createElement('label');
            label.className = 'zone-checkbox-item';

            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = chem.id;
            checkbox.checked = selectedIds && selectedIds.indexOf(chem.id) >= 0;

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(' ' + chem.name));
            container.appendChild(label);
        });

    } catch (e) {
        console.error('Error loading chemicals for checkbox list:', e);
        container.innerHTML = '<em style="color:#888;font-size:0.85em;">Error loading products.</em>';
    }
}

/**
 * Reads all checked chemical IDs from a checkbox list container.
 * @param {string} containerId - The ID of the checkbox list container.
 * @returns {string[]} Array of checked chemical IDs.
 */
function getCheckedChemicalIds(containerId) {
    var container = document.getElementById(containerId);
    var checked = [];
    var checkboxes = container.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(function(cb) {
        if (cb.checked) {
            checked.push(cb.value);
        }
    });
    return checked;
}

// ---------- Amount Used Visibility Helper ----------

/**
 * Shows or hides the "Amount Used" field in the log-activity modal based on
 * whether at least one chemical checkbox is currently checked.
 * Called whenever checkboxes change or the modal opens.
 */
function updateAmountUsedVisibility() {
    var anyChecked = _activitySelectedChemIds.length > 0;
    var row = document.getElementById('activityAmountUsedRow');
    if (row) row.style.display = anyChecked ? '' : 'none';
}

/**
 * Renders the selected chemicals as compact tags inside the activity modal chips area.
 * @param {string[]} chemicalIds - Array of selected chemical IDs.
 */
async function renderActivityChemicalsDisplay(chemicalIds) {
    var container = document.getElementById('activityChemicalChips');
    container.innerHTML = '';

    if (!chemicalIds || chemicalIds.length === 0) {
        var none = document.createElement('span');
        none.className = 'chemicals-none-text';
        none.textContent = 'None selected';
        container.appendChild(none);
        return;
    }

    try {
        var chemicals = await getAllChemicals();
        var selected = chemicals.filter(function(c) { return chemicalIds.indexOf(c.id) >= 0; });
        if (selected.length === 0) {
            var none2 = document.createElement('span');
            none2.className = 'chemicals-none-text';
            none2.textContent = 'None selected';
            container.appendChild(none2);
        } else {
            selected.forEach(function(c) {
                var tag = document.createElement('span');
                tag.className = 'chemical-tag';
                tag.textContent = c.name;
                container.appendChild(tag);
            });
        }
    } catch (e) {
        console.error('Error rendering activity chemicals:', e);
    }
}

// ---------- Load & Display Activity History ----------

/**
 * Loads and displays activity history for a given target (plant, zone, or weed).
 * Shows activities in reverse chronological order (newest first).
 * @param {string} targetType - "plant", "zone", or "weed"
 * @param {string} targetId - The Firestore document ID of the target.
 * @param {string} containerId - The ID of the container element.
 * @param {string} emptyStateId - The ID of the empty-state message element.
 */
async function loadActivities(targetType, targetId, containerId, emptyStateId) {
    const container = document.getElementById(containerId);
    const emptyState = document.getElementById(emptyStateId);

    try {
        const snapshot = await userCol('activities')
            .where('targetType', '==', targetType)
            .where('targetId', '==', targetId)
            .get();

        container.innerHTML = '';

        if (snapshot.empty) {
            emptyState.textContent = 'No activities logged yet.';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        // Collect and sort by date descending (newest first)
        const activities = [];
        snapshot.forEach(function(doc) {
            activities.push({ id: doc.id, ...doc.data() });
        });
        activities.sort(function(a, b) {
            return (b.date || '').localeCompare(a.date || '');
        });

        // Collect all unique chemical IDs needed (supports both old and new format)
        var allChemIds = [];
        activities.forEach(function(a) {
            var ids = normalizeChemicalIds(a);
            ids.forEach(function(id) {
                if (allChemIds.indexOf(id) < 0) allChemIds.push(id);
            });
        });

        // Fetch chemical names
        var chemicalNames = {};
        for (var i = 0; i < allChemIds.length; i++) {
            try {
                var chemDoc = await userCol('chemicals').doc(allChemIds[i]).get();
                if (chemDoc.exists) {
                    chemicalNames[allChemIds[i]] = chemDoc.data().name;
                }
            } catch (e) {
                // Chemical may have been deleted
            }
        }

        // Batch-fetch place names for activities that have a placeId
        var placeNames = {};
        var placeIds = [];
        activities.forEach(function(a) {
            if (a.placeId && placeIds.indexOf(a.placeId) < 0) placeIds.push(a.placeId);
        });
        for (var pi = 0; pi < placeIds.length; pi++) {
            try {
                var placeDoc = await userCol('places').doc(placeIds[pi]).get();
                if (placeDoc.exists) placeNames[placeIds[pi]] = placeDoc.data().name || '';
            } catch (e) { /* ignore */ }
        }

        activities.forEach(function(activity) {
            var ids = normalizeChemicalIds(activity);
            var names = ids.map(function(id) { return chemicalNames[id] || 'Unknown'; });
            var placeName = activity.placeId ? (placeNames[activity.placeId] || null) : null;
            var item = createActivityItem(activity, names, targetType, targetId, placeName);
            container.appendChild(item);
        });

    } catch (error) {
        console.error('Error loading activities:', error);
        emptyState.textContent = 'Error loading activities.';
        emptyState.style.display = 'block';
    }
}

// ---------- Create an Activity Item Element ----------

/**
 * Creates a compact DOM element representing a single activity.
 * @param {Object} activity - The activity data.
 * @param {string[]} chemicalNames - Array of chemical names used (may be empty).
 * @param {string} targetType - "plant", "zone", or "weed"
 * @param {string} targetId - The target's Firestore document ID.
 * @param {string|null} [placeName] - Resolved place name (if activity has a placeId).
 * @returns {HTMLElement} The activity item element.
 */
function createActivityItem(activity, chemicalNames, targetType, targetId, placeName) {
    const item = document.createElement('div');
    item.className = 'activity-item';

    // Left side: date + description (compact)
    const leftSide = document.createElement('div');
    leftSide.className = 'activity-left';

    const dateBadge = document.createElement('span');
    dateBadge.className = 'activity-date';
    dateBadge.textContent = activity.date || 'No date';
    leftSide.appendChild(dateBadge);

    const desc = document.createElement('span');
    desc.className = 'activity-description';
    desc.textContent = activity.description;
    leftSide.appendChild(desc);

    // Show amount used if recorded (only appears when a chemical was used)
    if (activity.amountUsed) {
        const amountEl = document.createElement('span');
        amountEl.className = 'activity-amount';
        amountEl.textContent = activity.amountUsed;
        leftSide.appendChild(amountEl);
    }

    // Show place name as a tappable secondary line if this activity has one
    if (placeName && activity.placeId) {
        var placeLineEl = document.createElement('span');
        placeLineEl.className = 'activity-place-line';
        placeLineEl.innerHTML = '📍 <a class="activity-place-link" href="#place/' +
            activity.placeId + '" onclick="event.stopPropagation()">' +
            escapeHtml(placeName) + '</a>';
        leftSide.appendChild(placeLineEl);
    }

    item.appendChild(leftSide);

    // Right side: Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-small btn-secondary';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', function() {
        openEditActivityModal(activity, targetType, targetId);
    });
    item.appendChild(editBtn);

    return item;
}

// ---------- View/Edit Activity Modal ----------

/**
 * Opens a view modal for an existing activity, showing full details
 * with "Save as Action" and "Delete" buttons.
 * @param {Object} activity - The activity data.
 * @param {string[]} chemicalNames - Array of chemical names (may be empty).
 * @param {string} targetType - "plant", "zone", or "weed".
 * @param {string} targetId - The target's Firestore document ID.
 */
function openViewActivityModal(activity, chemicalNames, targetType, targetId) {
    var modal = document.getElementById('viewActivityModal');

    document.getElementById('viewActivityDate').textContent = activity.date || 'No date';
    document.getElementById('viewActivityDesc').textContent = activity.description || '';
    document.getElementById('viewActivityChemical').textContent =
        chemicalNames && chemicalNames.length > 0 ? chemicalNames.join(', ') : 'None';
    document.getElementById('viewActivityNotes').textContent = activity.notes || 'None';

    // Show Amount Used only when it was recorded
    var amountField = document.getElementById('viewActivityAmountUsedField');
    var amountVal   = activity.amountUsed || '';
    if (amountVal) {
        document.getElementById('viewActivityAmountUsed').textContent = amountVal;
        amountField.style.display = '';
    } else {
        amountField.style.display = 'none';
    }

    // Show/hide "Save as Action" button
    var saveAsBtn = document.getElementById('viewActivitySaveAsBtn');
    if (activity.savedActionId) {
        saveAsBtn.style.display = 'none';
    } else {
        saveAsBtn.style.display = 'inline-flex';
    }

    // Store activity data for action buttons
    modal.dataset.activityId = activity.id;
    modal.dataset.targetType = targetType;
    modal.dataset.targetId = targetId;

    // Wire up Save as Action button
    saveAsBtn.onclick = function() {
        closeModal('viewActivityModal');
        openSaveAsActionModal(activity);
    };

    // Wire up Edit button — open the activity modal pre-filled for editing
    document.getElementById('viewActivityEditBtn').onclick = function() {
        closeModal('viewActivityModal');
        openEditActivityModal(activity, targetType, targetId);
    };

    // Wire up Delete button — confirm before closing modal
    document.getElementById('viewActivityDeleteBtn').onclick = function() {
        if (!confirm('Are you sure you want to delete this activity?')) return;
        closeModal('viewActivityModal');
        handleDeleteActivity(activity.id, targetType, targetId);
    };

    openModal('viewActivityModal');
}

/**
 * Opens the activity modal pre-filled for editing an existing activity.
 * @param {Object} activity - The existing activity data (including id).
 * @param {string} targetType - The target type.
 * @param {string} targetId - The target ID.
 */
async function openEditActivityModal(activity, targetType, targetId) {
    const modal = document.getElementById('activityModal');
    const descInput = document.getElementById('activityDescInput');
    const dateInput = document.getElementById('activityDateInput');
    const notesInput = document.getElementById('activityNotesInput');
    const savedActionRow = document.getElementById('activitySavedActionSelect').closest('.form-group');

    // Set edit mode
    modal.dataset.mode = 'edit';
    modal.dataset.editId = activity.id;
    modal.dataset.targetType = targetType;
    modal.dataset.targetId = targetId;

    // Update title and hide saved-action picker (not relevant when editing)
    document.getElementById('activityModalTitle').textContent = 'Edit Activity';
    document.getElementById('activityModalSaveBtn').textContent = 'Save Changes';
    if (savedActionRow) savedActionRow.style.display = 'none';

    // Pre-fill fields
    descInput.value = activity.description || '';
    dateInput.value = activity.date || '';
    notesInput.value = activity.notes || '';
    document.getElementById('activityAmountUsedInput').value = activity.amountUsed || '';

    // Restore place selection
    _activityPlaceId    = activity.placeId || null;
    _activityPlaceVenue = null;
    _activityInitPlaceSearch();
    if (_activityPlaceId) {
        // Fetch name for the chip display
        userCol('places').doc(_activityPlaceId).get().then(function(doc) {
            _activityUpdatePlaceUI(doc.exists ? (doc.data().name || '(Place)') : '(Place)');
        }).catch(function() { _activityUpdatePlaceUI('(Place)'); });
    } else {
        _activityUpdatePlaceUI(null);
    }

    // Hide chemical section for vehicle; otherwise show chips with pre-selected items
    var hideChemicals = (targetType === 'vehicle');
    var chemicalGroup = document.getElementById('activityChemicalGroup');
    if (chemicalGroup) chemicalGroup.style.display = hideChemicals ? 'none' : '';

    if (!hideChemicals) {
        _activitySelectedChemIds = normalizeChemicalIds(activity);
        await renderActivityChemicalsDisplay(_activitySelectedChemIds);
        updateAmountUsedVisibility();
    } else {
        _activitySelectedChemIds = [];
        document.getElementById('activityAmountUsedRow').style.display = 'none';
    }

    openModal('activityModal');
    descInput.focus();
}

// ---------- Log Activity Modal ----------

/**
 * Opens the log-activity modal for a target (plant, zone, or weed).
 * @param {string} targetType - "plant", "zone", or "weed"
 * @param {string} targetId - The target's Firestore document ID.
 */
async function openLogActivityModal(targetType, targetId) {
    const modal = document.getElementById('activityModal');
    const descInput = document.getElementById('activityDescInput');
    const dateInput = document.getElementById('activityDateInput');
    const notesInput = document.getElementById('activityNotesInput');
    const savedActionSelect = document.getElementById('activitySavedActionSelect');

    // Reset form
    descInput.value = '';
    dateInput.value = new Date().toISOString().split('T')[0];  // Today
    notesInput.value = '';
    document.getElementById('activityAmountUsedInput').value = '';
    document.getElementById('activityAmountUsedRow').style.display = 'none';

    // Reset place selection
    _activityPlaceId    = null;
    _activityPlaceVenue = null;
    _activityInitPlaceSearch();
    _activityUpdatePlaceUI(null);

    modal.dataset.targetType = targetType;
    modal.dataset.targetId = targetId;

    // Hide Place field for yard entities — it only makes sense for life/journal contexts
    var yardType = (targetType === 'plant' || targetType === 'zone' || targetType === 'weed');
    var placeGroup = document.getElementById('activityPlaceGroup');
    if (placeGroup) placeGroup.style.display = yardType ? 'none' : '';

    // Hide chemical/product section for target types that don't use chemicals
    var hideChemicals = (targetType === 'vehicle');
    var chemicalGroup = document.getElementById('activityChemicalGroup');
    if (chemicalGroup) chemicalGroup.style.display = hideChemicals ? 'none' : '';
    document.getElementById('activityAmountUsedRow').style.display = 'none';

    // Reset and render empty chips display
    _activitySelectedChemIds = [];
    if (!hideChemicals) {
        await renderActivityChemicalsDisplay([]);
    }

    // Populate saved actions dropdown
    savedActionSelect.innerHTML = '<option value="">-- Start from scratch --</option>';
    try {
        const savedActions = await getAllSavedActions();
        savedActions.forEach(function(action) {
            const option = document.createElement('option');
            option.value = action.id;
            option.textContent = action.name;
            savedActionSelect.appendChild(option);
        });
    } catch (e) {
        console.error('Error loading saved actions for dropdown:', e);
    }

    openModal('activityModal');
    descInput.focus();
}

/**
 * Handles picking a saved action from the dropdown — pre-fills the form.
 */
async function handleSavedActionSelect() {
    const select = document.getElementById('activitySavedActionSelect');
    const actionId = select.value;

    if (!actionId) return;  // "Start from scratch" selected

    try {
        const doc = await userCol('savedActions').doc(actionId).get();
        if (!doc.exists) return;

        const action = doc.data();
        document.getElementById('activityDescInput').value = action.description || '';
        document.getElementById('activityNotesInput').value = action.notes || '';

        // Pre-select chemicals from the saved action
        var ids = normalizeChemicalIds(action);
        _activitySelectedChemIds = ids;
        await renderActivityChemicalsDisplay(ids);
        updateAmountUsedVisibility();

        console.log('Saved action loaded:', action.name);

    } catch (error) {
        console.error('Error loading saved action:', error);
    }
}

// ---------- Save Activity ----------

/**
 * Resets the activity modal back to "add" mode defaults.
 * Called after save or cancel so the next open starts fresh.
 */
function _resetActivityModal() {
    var modal = document.getElementById('activityModal');
    modal.dataset.mode = 'add';
    delete modal.dataset.editId;
    document.getElementById('activityModalTitle').textContent = 'Log Activity';
    document.getElementById('activityModalSaveBtn').textContent = 'Log Activity';
    var savedActionRow = document.getElementById('activitySavedActionSelect').closest('.form-group');
    if (savedActionRow) savedActionRow.style.display = '';
    _activityPlaceId    = null;
    _activityPlaceVenue = null;
}

/**
 * Handles the save button in the log-activity modal.
 */
async function handleActivityModalSave() {
    const modal = document.getElementById('activityModal');
    const descInput = document.getElementById('activityDescInput');
    const dateInput = document.getElementById('activityDateInput');
    const notesInput = document.getElementById('activityNotesInput');
    const savedActionSelect = document.getElementById('activitySavedActionSelect');

    const description = descInput.value.trim();
    const date = dateInput.value;
    const notes = notesInput.value.trim();
    const amountUsed = document.getElementById('activityAmountUsedInput').value.trim();
    const chemicalIds = _activitySelectedChemIds.slice();
    const savedActionId = savedActionSelect.value || null;

    if (!description) {
        alert('Please enter a description.');
        return;
    }

    if (!date) {
        alert('Please enter a date.');
        return;
    }

    const targetType = modal.dataset.targetType;
    const targetId = modal.dataset.targetId;
    const isEdit = modal.dataset.mode === 'edit';
    const editId = modal.dataset.editId;

    // Resolve place — save new place if one was selected from OSM but not yet in Firestore
    var resolvedPlaceId = _activityPlaceId || null;
    try {
        if (!resolvedPlaceId && _activityPlaceVenue) {
            resolvedPlaceId = await placesSaveNew(_activityPlaceVenue);
        }
    } catch (err) {
        console.error('Error saving place for activity:', err);
    }

    try {
        if (isEdit && editId) {
            // Update existing activity
            await userCol('activities').doc(editId).update({
                description: description,
                date:        date,
                notes:       notes,
                amountUsed:  amountUsed || '',
                chemicalIds: chemicalIds,
                placeId:     resolvedPlaceId,
                updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
        await userCol('activities').add({
            targetType:    targetType,
            targetId:      targetId,
            description:   description,
            date:          date,
            notes:         notes,
            amountUsed:    amountUsed || '',
            chemicalIds:   chemicalIds,
            savedActionId: savedActionId,
            placeId:       resolvedPlaceId,
            createdAt:     firebase.firestore.FieldValue.serverTimestamp()
        });
        }

        console.log('Activity logged:', description);
        _resetActivityModal();
        closeModal('activityModal');
        reloadActivitiesForCurrentTarget(targetType, targetId);

    } catch (error) {
        console.error('Error logging activity:', error);
        alert('Error logging activity. Check console for details.');
    }
}

// ---------- Delete Activity ----------

/**
 * Deletes an activity after confirmation.
 * @param {string} activityId - The activity's Firestore document ID.
 * @param {string} targetType - "plant", "zone", or "weed"
 * @param {string} targetId - The target's Firestore document ID.
 */
async function handleDeleteActivity(activityId, targetType, targetId) {
    try {
        await userCol('activities').doc(activityId).delete();
        console.log('Activity deleted:', activityId);
        reloadActivitiesForCurrentTarget(targetType, targetId);

    } catch (error) {
        console.error('Error deleting activity:', error);
        alert('Error deleting activity. Check console for details.');
    }
}

// ---------- Reload Helper ----------

/**
 * Reloads activities for the current target.
 * @param {string} targetType - "plant", "zone", or "weed"
 * @param {string} targetId - The target's Firestore document ID.
 */
function reloadActivitiesForCurrentTarget(targetType, targetId) {
    var map = {
        'plant':            ['plantActivityContainer',               'plantActivityEmptyState'],
        'zone':             ['zoneActivityContainer',                'zoneActivityEmptyState'],
        'weed':             ['weedActivityContainer',                'weedActivityEmptyState'],
        'vehicle':          ['vehicleActivitiesContainer',           'vehicleActivitiesEmptyState'],
        'panel':            ['panelActivityContainer',               'panelActivityEmptyState'],
        'floor':            ['floorActivityContainer',               'floorActivityEmptyState'],
        'room':             ['roomActivityContainer',                'roomActivityEmptyState'],
        'thing':            ['thingActivityContainer',               'thingActivityEmptyState'],
        'subthing':         ['stActivityContainer',                  'stActivityEmptyState'],
        'garageroom':       ['garageRoomActivitiesContainer',        'garageRoomActivitiesEmpty'],
        'garagething':      ['garageThingActivitiesContainer',       'garageThingActivitiesEmpty'],
        'garagesubthing':   ['garageSubThingActivitiesContainer',    'garageSubThingActivitiesEmpty'],
        'structure':        ['structureActivitiesContainer',         'structureActivitiesEmpty'],
        'structurething':   ['structureThingActivitiesContainer',    'structureThingActivitiesEmpty'],
        'structuresubthing':['structureSubThingActivitiesContainer', 'structureSubThingActivitiesEmpty'],
        'place':            ['placeActivityContainer',               'placeActivityEmptyState'],
    };
    var ids = map[targetType];
    if (ids) {
        loadActivities(targetType, targetId, ids[0], ids[1]);
    }
}

// ============================================================
// SAVED ACTIONS — Reusable activity templates
// ============================================================

// ---------- Load & Display Saved Actions Page ----------

/**
 * Loads all saved actions and displays them on the Saved Actions page.
 */
async function loadSavedActionsList() {
    const container = document.getElementById('savedActionsListContainer');
    const emptyState = document.getElementById('savedActionsEmptyState');

    try {
        const snapshot = await userCol('savedActions').get();

        container.innerHTML = '';

        if (snapshot.empty) {
            emptyState.textContent = 'No saved actions yet. Log an activity and save it as an action!';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        // Sort alphabetically
        const actions = [];
        snapshot.forEach(function(doc) {
            actions.push({ id: doc.id, ...doc.data() });
        });
        actions.sort(function(a, b) {
            return a.name.localeCompare(b.name);
        });

        // Pre-load all unique chemical names
        var allChemIds = [];
        actions.forEach(function(a) {
            var ids = normalizeChemicalIds(a);
            ids.forEach(function(id) {
                if (allChemIds.indexOf(id) < 0) allChemIds.push(id);
            });
        });

        var chemicalNames = {};
        for (var i = 0; i < allChemIds.length; i++) {
            try {
                var chemDoc = await userCol('chemicals').doc(allChemIds[i]).get();
                if (chemDoc.exists) {
                    chemicalNames[allChemIds[i]] = chemDoc.data().name;
                }
            } catch (e) { /* ignore */ }
        }

        actions.forEach(function(action) {
            var ids = normalizeChemicalIds(action);
            var names = ids.map(function(id) { return chemicalNames[id] || 'Unknown'; });
            var item = createSavedActionItem(action, names);
            container.appendChild(item);
        });

    } catch (error) {
        console.error('Error loading saved actions:', error);
        emptyState.textContent = 'Error loading saved actions.';
        emptyState.style.display = 'block';
    }
}

// ---------- Create a Saved Action Item ----------

/**
 * Creates a DOM element for a saved action on the management page.
 * @param {Object} action - The saved action data.
 * @param {string[]} chemicalNames - Array of chemical names (may be empty).
 * @returns {HTMLElement} The saved action item element.
 */
function createSavedActionItem(action, chemicalNames) {
    const item = document.createElement('div');
    item.className = 'saved-action-item card';
    item.style.cursor = 'pointer';
    item.addEventListener('click', function() {
        openEditSavedActionModal(action);
    });

    const info = document.createElement('div');
    info.style.flex = '1';

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = action.name;
    info.appendChild(title);

    // Description line
    if (action.description) {
        const desc = document.createElement('div');
        desc.className = 'card-subtitle';
        desc.textContent = action.description;
        info.appendChild(desc);
    }

    // Chemicals line
    if (chemicalNames && chemicalNames.length > 0) {
        const chem = document.createElement('div');
        chem.className = 'card-subtitle';
        chem.style.color = '#2e7d32';
        chem.textContent = 'Product: ' + chemicalNames.join(', ');
        info.appendChild(chem);
    }

    // Notes
    if (action.notes) {
        const notes = document.createElement('div');
        notes.className = 'card-subtitle';
        notes.textContent = action.notes;
        info.appendChild(notes);
    }

    item.appendChild(info);

    return item;
}

// ---------- Chemical Picker (for Saved Action modal) ----------

/**
 * Renders the selected chemicals as tags in the saved-action modal display area.
 * Shows "None selected" when the list is empty.
 * @param {string[]} chemicalIds - Array of selected chemical IDs.
 */
async function renderSavedActionChemicalsDisplay(chemicalIds) {
    var container = document.getElementById('savedActionSelectedChemicalsDisplay');
    container.innerHTML = '';

    if (!chemicalIds || chemicalIds.length === 0) {
        var none = document.createElement('span');
        none.className = 'chemicals-none-text';
        none.textContent = 'None selected';
        container.appendChild(none);
        return;
    }

    try {
        var chemicals = await getAllChemicals();
        var selected = chemicals.filter(function(c) { return chemicalIds.indexOf(c.id) >= 0; });
        if (selected.length === 0) {
            var none = document.createElement('span');
            none.className = 'chemicals-none-text';
            none.textContent = 'None selected';
            container.appendChild(none);
        } else {
            selected.forEach(function(c) {
                var tag = document.createElement('span');
                tag.className = 'chemical-tag';
                tag.textContent = c.name;
                container.appendChild(tag);
            });
        }
    } catch (e) {
        console.error('Error rendering chemicals display:', e);
    }
}

/**
 * Opens the chemical picker modal, pre-checking the currently selected chemicals.
 */
async function openChemicalPickerForSavedAction() {
    _chemPickerContext = 'savedAction';
    await buildChemicalCheckboxList('chemicalPickerList', savedActionSelectedChemicalIds);
    openModal('chemicalPickerModal');
}

/**
 * Opens the chemical picker from the log/edit activity modal.
 */
async function openChemicalPickerForActivity() {
    try {
        _chemPickerContext = 'activity';
        await buildChemicalCheckboxList('chemicalPickerList', _activitySelectedChemIds);
        openModal('chemicalPickerModal');
    } catch (e) {
        console.error('openChemicalPickerForActivity error:', e);
    }
}

/**
 * Applies the chemical picker selection back to whichever modal opened it.
 */
async function handleChemicalPickerDone() {
    var selected = getCheckedChemicalIds('chemicalPickerList');
    closeModal('chemicalPickerModal');
    if (_chemPickerContext === 'activity') {
        _activitySelectedChemIds = selected;
        await renderActivityChemicalsDisplay(_activitySelectedChemIds);
        updateAmountUsedVisibility();
    } else {
        savedActionSelectedChemicalIds = selected;
        await renderSavedActionChemicalsDisplay(savedActionSelectedChemicalIds);
    }
}

// ---------- Save as Action (from an existing activity) ----------

/**
 * Opens a modal to save an activity as a reusable action.
 * @param {Object} activity - The activity to use as a template.
 */
async function openSaveAsActionModal(activity) {
    const modal = document.getElementById('savedActionModal');
    const modalTitle = document.getElementById('savedActionModalTitle');
    const nameInput = document.getElementById('savedActionNameInput');
    const descInput = document.getElementById('savedActionDescInput');
    const notesInput = document.getElementById('savedActionNotesInput');

    modalTitle.textContent = 'Save as Reusable Action';
    nameInput.value = '';
    descInput.value = activity.description || '';
    notesInput.value = activity.notes || '';

    modal.dataset.mode = 'add';
    delete modal.dataset.editId;
    document.getElementById('savedActionModalDeleteBtn').style.display = 'none';

    // Set selected chemicals from the activity and render the display
    savedActionSelectedChemicalIds = normalizeChemicalIds(activity);
    await renderSavedActionChemicalsDisplay(savedActionSelectedChemicalIds);

    openModal('savedActionModal');
    nameInput.focus();
}

// ---------- Add Saved Action (from actions page) ----------

/**
 * Opens the add-saved-action modal from the Actions management page.
 */
async function openAddSavedActionModal() {
    const modal = document.getElementById('savedActionModal');
    const modalTitle = document.getElementById('savedActionModalTitle');
    const nameInput = document.getElementById('savedActionNameInput');
    const descInput = document.getElementById('savedActionDescInput');
    const notesInput = document.getElementById('savedActionNotesInput');

    modalTitle.textContent = 'Add Saved Action';
    nameInput.value = '';
    descInput.value = '';
    notesInput.value = '';

    modal.dataset.mode = 'add';
    delete modal.dataset.editId;
    document.getElementById('savedActionModalDeleteBtn').style.display = 'none';

    // Reset selected chemicals and render empty display
    savedActionSelectedChemicalIds = [];
    await renderSavedActionChemicalsDisplay([]);

    openModal('savedActionModal');
    nameInput.focus();
}

// ---------- Edit Saved Action ----------

/**
 * Opens the edit modal for an existing saved action.
 * @param {Object} action - The saved action data (including id).
 */
async function openEditSavedActionModal(action) {
    const modal = document.getElementById('savedActionModal');
    const modalTitle = document.getElementById('savedActionModalTitle');
    const nameInput = document.getElementById('savedActionNameInput');
    const descInput = document.getElementById('savedActionDescInput');
    const notesInput = document.getElementById('savedActionNotesInput');

    modalTitle.textContent = 'Edit Saved Action';
    nameInput.value = action.name || '';
    descInput.value = action.description || '';
    notesInput.value = action.notes || '';

    modal.dataset.mode = 'edit';
    modal.dataset.editId = action.id;
    document.getElementById('savedActionModalDeleteBtn').style.display = '';

    // Set selected chemicals from the action and render the display
    savedActionSelectedChemicalIds = normalizeChemicalIds(action);
    await renderSavedActionChemicalsDisplay(savedActionSelectedChemicalIds);

    openModal('savedActionModal');
    nameInput.focus();
}

// ---------- Save Saved Action (Add or Edit) ----------

/**
 * Handles the save button in the saved-action modal.
 */
async function handleSavedActionModalSave() {
    const modal = document.getElementById('savedActionModal');
    const nameInput = document.getElementById('savedActionNameInput');
    const descInput = document.getElementById('savedActionDescInput');
    const notesInput = document.getElementById('savedActionNotesInput');

    const name = nameInput.value.trim();
    const description = descInput.value.trim();
    const notes = notesInput.value.trim();
    const chemicalIds = savedActionSelectedChemicalIds;

    if (!name) {
        alert('Please enter a name for this action.');
        return;
    }

    const mode = modal.dataset.mode;

    try {
        if (mode === 'add') {
            await userCol('savedActions').add({
                name: name,
                description: description,
                notes: notes,
                chemicalIds: chemicalIds,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('Saved action created:', name);

        } else if (mode === 'edit') {
            const actionId = modal.dataset.editId;
            await userCol('savedActions').doc(actionId).update({
                name: name,
                description: description,
                notes: notes,
                chemicalIds: chemicalIds
            });
            console.log('Saved action updated:', name);
        }

        closeModal('savedActionModal');

        // Refresh the saved actions page if we're on it
        const hash = window.location.hash.slice(1) || 'home';
        if (hash === 'actions') {
            loadSavedActionsList();
        }

    } catch (error) {
        console.error('Error saving action:', error);
        alert('Error saving action. Check console for details.');
    }
}

// ---------- Delete Saved Action ----------

/**
 * Deletes a saved action after confirmation.
 * @param {string} actionId - The saved action's Firestore document ID.
 */
async function handleDeleteSavedAction(actionId) {
    if (!confirm('Are you sure you want to delete this saved action?')) {
        return;
    }

    try {
        await userCol('savedActions').doc(actionId).delete();
        console.log('Saved action deleted:', actionId);
        loadSavedActionsList();

    } catch (error) {
        console.error('Error deleting saved action:', error);
        alert('Error deleting saved action. Check console for details.');
    }
}

// ---------- Helper: Get all saved actions ----------

/**
 * Loads all saved actions and returns them as an array.
 * @returns {Promise<Array>} Array of saved action objects sorted by name.
 */
async function getAllSavedActions() {
    const snapshot = await userCol('savedActions').get();
    const actions = [];
    snapshot.forEach(function(doc) {
        actions.push({ id: doc.id, ...doc.data() });
    });
    actions.sort(function(a, b) {
        return a.name.localeCompare(b.name);
    });
    return actions;
}

// ============================================================
// Activity Modal — Place Search
// ============================================================

/**
 * Wire up the place search input inside the activity modal.
 * Debounced text search via placesSearchByName(); results shown in a dropdown.
 */
function _activityInitPlaceSearch() {
    var input    = document.getElementById('activityPlaceSearch');
    var dropdown = document.getElementById('activityPlaceDropdown');
    if (!input || !dropdown) return;

    input.value = '';
    dropdown.style.display = 'none';

    var debounceTimer = null;
    _activityBiasLat = null;
    _activityBiasLng = null;
    // Grab GPS once so name searches are biased to the user's current location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(pos) { _activityBiasLat = pos.coords.latitude; _activityBiasLng = pos.coords.longitude; },
            function() {},
            { timeout: 10000, maximumAge: 60000 }
        );
    }
    input.oninput = function() {
        clearTimeout(debounceTimer);
        var q = input.value.trim();
        if (q.length < 2) { dropdown.style.display = 'none'; return; }
        debounceTimer = setTimeout(async function() {
            try {
                var results = await placesSearchByName(q, _activityBiasLat, _activityBiasLng);
                _activityShowPlaceDropdown(results);
            } catch (err) {
                console.warn('Activity place search error:', err);
            }
        }, 500);
    };

    // Hide dropdown on blur (delay so clicks register first via onmousedown)
    input.onblur = function() {
        setTimeout(function() { dropdown.style.display = 'none'; }, 200);
    };
}

/**
 * Render the place search results dropdown in the activity modal.
 * @param {Array} venues - Venue objects from placesSearchByName.
 */
function _activityShowPlaceDropdown(venues) {
    var dropdown = document.getElementById('activityPlaceDropdown');
    if (!dropdown) return;

    if (!venues || venues.length === 0) {
        dropdown.style.display = 'none';
        return;
    }

    _activityPlaceDropdownVenues = venues.slice(0, 8);
    var html = '';
    _activityPlaceDropdownVenues.forEach(function(v, i) {
        var dist = placesDistanceLabel(_activityBiasLat, _activityBiasLng, v.lat, v.lng);
        var sub  = [v.category, v.address].filter(Boolean).join(' · ');
        html += '<div class="activity-place-dropdown-item" onmousedown="_activitySelectPlace(' + i + ')">' +
                    '<div class="activity-place-dropdown-name">' + escapeHtml(v.name || '') +
                        (dist ? ' <span class="place-distance">' + dist + '</span>' : '') +
                    '</div>' +
                    (sub ? '<div class="activity-place-dropdown-sub">' + escapeHtml(sub) + '</div>' : '') +
                '</div>';
    });
    dropdown.innerHTML = html;
    dropdown.style.display = '';
}

/**
 * User selected a venue from the dropdown.
 * Sets _activityPlaceId (if already saved) or _activityPlaceVenue (if new OSM result).
 * @param {number} idx - Index into _activityPlaceDropdownVenues.
 */
function _activitySelectPlace(idx) {
    var venue = _activityPlaceDropdownVenues[idx];
    if (!venue) return;

    var dropdown = document.getElementById('activityPlaceDropdown');
    if (dropdown) dropdown.style.display = 'none';

    if (venue.existingId) {
        _activityPlaceId    = venue.existingId;
        _activityPlaceVenue = null;
    } else {
        _activityPlaceId    = null;
        _activityPlaceVenue = venue;
    }

    _activityUpdatePlaceUI(venue.name || '(Place)');
}

/**
 * Toggle the activity modal place UI between:
 * - chip mode (name !== null): shows the chip row, hides the search input
 * - search mode (name === null): shows the search input, hides the chip row
 * @param {string|null} name - Place name to display in chip, or null to show search.
 */
function _activityUpdatePlaceUI(name) {
    var chipRow   = document.getElementById('activityPlaceChipRow');
    var searchRow = document.getElementById('activityPlaceSearchRow');
    var chipName  = document.getElementById('activityPlaceChipName');
    var clearBtn  = document.getElementById('activityPlaceClearBtn');

    if (name !== null) {
        // Place selected — show chip
        if (chipName)  chipName.textContent = '📍 ' + name;
        if (chipRow)   chipRow.classList.remove('hidden');
        if (searchRow) searchRow.style.display = 'none';
        if (clearBtn) {
            clearBtn.onclick = function() {
                _activityPlaceId    = null;
                _activityPlaceVenue = null;
                _activityUpdatePlaceUI(null);
            };
        }
    } else {
        // No place — show search input
        if (chipRow)   chipRow.classList.add('hidden');
        if (searchRow) searchRow.style.display = '';
        var input = document.getElementById('activityPlaceSearch');
        if (input) input.value = '';
        var dropdown = document.getElementById('activityPlaceDropdown');
        if (dropdown) dropdown.style.display = 'none';
    }
}

// ---------- Event Listeners ----------

document.addEventListener('DOMContentLoaded', function() {

    // "Log Activity" buttons on plant and zone detail pages
    document.getElementById('logPlantActivityBtn').addEventListener('click', function() {
        if (window.currentPlant) {
            openLogActivityModal('plant', window.currentPlant.id);
        }
    });

    document.getElementById('logZoneActivityBtn').addEventListener('click', function() {
        if (window.currentZone) {
            openLogActivityModal('zone', window.currentZone.id);
        }
    });

    document.getElementById('logPlaceActivityBtn').addEventListener('click', function() {
        if (window.currentPlace) {
            openLogActivityModal('place', window.currentPlace.id);
        }
    });

    // Activity modal — Save button
    document.getElementById('activityModalSaveBtn').addEventListener('click', handleActivityModalSave);

    // Activity modal — Cancel button
    document.getElementById('activityModalCancelBtn').addEventListener('click', function() {
        _resetActivityModal();
        closeModal('activityModal');
    });

    // Activity modal — Close on overlay click
    document.getElementById('activityModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal('activityModal');
    });

    // Activity modal — Saved action dropdown change
    document.getElementById('activitySavedActionSelect').addEventListener('change', handleSavedActionSelect);

    // "Add Saved Action" button on the actions page
    document.getElementById('addSavedActionBtn').addEventListener('click', openAddSavedActionModal);

    // Saved action modal — Save button
    document.getElementById('savedActionModalSaveBtn').addEventListener('click', handleSavedActionModalSave);

    // Saved action modal — Cancel button
    document.getElementById('savedActionModalCancelBtn').addEventListener('click', function() {
        closeModal('savedActionModal');
    });

    // Saved action modal — Delete button (edit mode only)
    document.getElementById('savedActionModalDeleteBtn').addEventListener('click', function() {
        var editId = document.getElementById('savedActionModal').dataset.editId;
        if (!editId) return;
        closeModal('savedActionModal');
        handleDeleteSavedAction(editId);
    });

    // Chemical picker — Edit button inside the activity modal
    document.getElementById('activityEditChemicalsBtn').addEventListener('click', openChemicalPickerForActivity);

    // Chemical picker — open button (inside saved-action modal)
    document.getElementById('openChemicalPickerBtn').addEventListener('click', openChemicalPickerForSavedAction);

    // Chemical picker — Done button
    document.getElementById('chemicalPickerDoneBtn').addEventListener('click', handleChemicalPickerDone);

    // Chemical picker — Cancel button
    document.getElementById('chemicalPickerCancelBtn').addEventListener('click', function() {
        closeModal('chemicalPickerModal');
    });

    // Chemical picker — Close on overlay click
    document.getElementById('chemicalPickerModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal('chemicalPickerModal');
    });

    // Saved action modal — intentionally NO overlay click-to-close
    // User must press Save or Cancel to close this modal

    // View activity modal — Close button
    document.getElementById('viewActivityCloseBtn').addEventListener('click', function() {
        closeModal('viewActivityModal');
    });

    // View activity modal — Close on overlay click
    document.getElementById('viewActivityModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal('viewActivityModal');
    });
});
