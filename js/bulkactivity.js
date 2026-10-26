// ============================================================
// Bulkactivity.js — Bulk Activity Logging
// Allows logging a single activity against multiple plants at once.
// Opened from the zone detail page "Log Bulk" button.
// ============================================================

/** The zone ID currently open in the bulk modal. */
var bulkActivityZoneId = null;

// ---------- Open Modal ----------

/**
 * Opens the bulk-activity modal for a zone.
 * Resets all fields, loads chemicals/saved actions/plants, then shows the modal.
 * @param {string} zoneId - The Firestore document ID of the zone.
 */
async function openBulkActivityModal(zoneId) {
    bulkActivityZoneId = zoneId;

    // Reset all form fields
    document.getElementById('bulkDescInput').value        = '';
    document.getElementById('bulkDateInput').value        = new Date().toISOString().split('T')[0];
    document.getElementById('bulkNotesInput').value       = '';
    document.getElementById('bulkAmountUsedInput').value  = '';
    document.getElementById('bulkAmountUsedRow').style.display = 'none';
    document.getElementById('bulkIncludeZone').checked    = false;
    document.getElementById('bulkIncludeSubZones').checked = false;
    document.getElementById('bulkSelectAllBtn').textContent = 'Deselect All';

    // Reset saved-action dropdown
    var actionSelect = document.getElementById('bulkSavedActionSelect');
    actionSelect.innerHTML = '<option value="">-- Start from scratch --</option>';
    try {
        var savedActions = await getAllSavedActions();
        savedActions.forEach(function(action) {
            var opt = document.createElement('option');
            opt.value       = action.id;
            opt.textContent = action.name;
            actionSelect.appendChild(opt);
        });
    } catch (e) { /* saved actions are optional — fail silently */ }

    // Build chemical checkbox list (none pre-checked)
    await buildChemicalCheckboxList('bulkChemicalList', []);
    bulkUpdateAmountVisibility();

    // Load plant list with all plants pre-checked
    await bulkLoadPlants();

    openModal('bulkActivityModal');
    document.getElementById('bulkDescInput').focus();
}

// ---------- Plant Checklist ----------

/**
 * Loads plants for the current zone (and optionally sub-zones) into the
 * checklist. All plants start pre-checked. When sub-zones are included,
 * the zone name is shown in parentheses next to each plant name.
 */
async function bulkLoadPlants() {
    var listEl = document.getElementById('bulkPlantList');
    listEl.innerHTML = '<em style="color:#888;font-size:0.85em;">Loading plants\u2026</em>';

    var includeSubZones = document.getElementById('bulkIncludeSubZones').checked;

    try {
        // Collect zone IDs to query
        var zoneIds = await getDescendantZoneIds(bulkActivityZoneId);
        if (!includeSubZones) {
            zoneIds = [bulkActivityZoneId];
        }

        // Build a name map if sub-zones are included (used for disambiguation)
        var zoneNames = {};
        if (includeSubZones && zoneIds.length > 1) {
            for (var z = 0; z < zoneIds.length; z++) {
                var zDoc = await yardCol('zones').doc(zoneIds[z]).get();
                if (zDoc.exists) zoneNames[zoneIds[z]] = zDoc.data().name || '';
            }
        }

        // Load plants for every qualifying zone
        var allPlants = [];
        for (var i = 0; i < zoneIds.length; i++) {
            var snap = await yardCol('plants').where('zoneId', '==', zoneIds[i]).get();
            snap.forEach(function(doc) {
                allPlants.push({ id: doc.id, zoneId: zoneIds[i], ...doc.data() });
            });
        }

        // Sort alphabetically by name
        allPlants.sort(function(a, b) { return a.name.localeCompare(b.name); });

        listEl.innerHTML = '';

        if (allPlants.length === 0) {
            listEl.innerHTML = '<em style="color:#888;font-size:0.85em;">No plants found in this zone.</em>';
            return;
        }

        allPlants.forEach(function(plant) {
            var label = document.createElement('label');
            label.className = 'zone-checkbox-item';

            var cb = document.createElement('input');
            cb.type    = 'checkbox';
            cb.value   = plant.id;
            cb.checked = true;   // Pre-select all plants by default

            var nameText = ' ' + plant.name;
            if (includeSubZones && zoneNames[plant.zoneId] &&
                    plant.zoneId !== bulkActivityZoneId) {
                nameText += ' \u2014 ' + zoneNames[plant.zoneId];
            }

            label.appendChild(cb);
            label.appendChild(document.createTextNode(nameText));
            listEl.appendChild(label);
        });

    } catch (e) {
        console.error('Error loading plants for bulk activity:', e);
        listEl.innerHTML = '<em style="color:#888;font-size:0.85em;">Error loading plants.</em>';
    }
}

// ---------- Helpers ----------

/**
 * Shows or hides the Amount Used field depending on whether any chemical is checked.
 */
function bulkUpdateAmountVisibility() {
    var anyChecked = getCheckedChemicalIds('bulkChemicalList').length > 0;
    var row = document.getElementById('bulkAmountUsedRow');
    if (row) row.style.display = anyChecked ? '' : 'none';
}

/**
 * Pre-fills description, notes, and chemicals when a saved action is selected.
 */
async function handleBulkSavedActionSelect() {
    var actionId = document.getElementById('bulkSavedActionSelect').value;
    if (!actionId) return;

    try {
        var doc = await yardCol('savedActions').doc(actionId).get();
        if (!doc.exists) return;

        var action = doc.data();
        document.getElementById('bulkDescInput').value  = action.description || '';
        document.getElementById('bulkNotesInput').value = action.notes || '';

        var ids = normalizeChemicalIds(action);
        await buildChemicalCheckboxList('bulkChemicalList', ids);
        bulkUpdateAmountVisibility();

    } catch (e) {
        console.error('Error loading saved action for bulk modal:', e);
    }
}

/**
 * Toggles all plant checkboxes between selected and deselected.
 * Updates the button label to reflect the next action.
 */
function bulkToggleSelectAll() {
    var checkboxes = document.querySelectorAll('#bulkPlantList input[type="checkbox"]');
    var allChecked = Array.from(checkboxes).every(function(cb) { return cb.checked; });

    checkboxes.forEach(function(cb) { cb.checked = !allChecked; });

    // Flip the button label
    document.getElementById('bulkSelectAllBtn').textContent =
        allChecked ? 'Select All' : 'Deselect All';
}

// ---------- Save ----------

/**
 * Validates the form and writes one activity document per selected plant.
 * Also writes a zone-level activity if "Also log against this zone" is checked.
 * All writes happen in parallel (Promise.all) for speed.
 */
async function handleBulkSave() {
    var description = document.getElementById('bulkDescInput').value.trim();
    var date        = document.getElementById('bulkDateInput').value;
    var notes       = document.getElementById('bulkNotesInput').value.trim();
    var amountUsed  = document.getElementById('bulkAmountUsedInput').value.trim();
    var chemicalIds = getCheckedChemicalIds('bulkChemicalList');
    var savedActionId = document.getElementById('bulkSavedActionSelect').value || null;
    var includeZone = document.getElementById('bulkIncludeZone').checked;

    if (!description) { alert('Please enter a description.'); return; }
    if (!date)        { alert('Please enter a date.'); return; }

    // Collect selected plant IDs
    var plantCheckboxes = document.querySelectorAll('#bulkPlantList input[type="checkbox"]:checked');
    var selectedPlantIds = Array.from(plantCheckboxes).map(function(cb) { return cb.value; });

    if (selectedPlantIds.length === 0 && !includeZone) {
        alert('Please select at least one plant, or check \u201cAlso log against this zone\u201d.');
        return;
    }

    // Shared data for every activity written
    var baseData = {
        description:   description,
        date:          date,
        notes:         notes,
        amountUsed:    amountUsed || '',
        chemicalIds:   chemicalIds,
        savedActionId: savedActionId,
        createdAt:     firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        var writes = [];

        // One activity per selected plant
        selectedPlantIds.forEach(function(plantId) {
            writes.push(yTargetCol('activities', 'plant').add(
                Object.assign({}, baseData, { targetType: 'plant', targetId: plantId })
            ));
        });

        // Optional zone-level activity
        if (includeZone) {
            writes.push(yTargetCol('activities', 'zone').add(
                Object.assign({}, baseData, { targetType: 'zone', targetId: bulkActivityZoneId })
            ));
        }

        await Promise.all(writes);

        var total = selectedPlantIds.length + (includeZone ? 1 : 0);
        console.log('Bulk activity logged:', description, '\u2014', total, 'records written');

        closeModal('bulkActivityModal');

        // If the zone-level activity was written, refresh the zone activity list
        if (includeZone) {
            loadActivities('zone', bulkActivityZoneId, 'zoneActivityContainer', 'zoneActivityEmptyState');
        }

    } catch (err) {
        console.error('Error logging bulk activity:', err);
        alert('Error logging activities. Please try again.');
    }
}

// ---------- Event Listeners ----------

document.addEventListener('DOMContentLoaded', function() {

    // Zone detail — Log Bulk button
    document.getElementById('logBulkActivityBtn').addEventListener('click', function() {
        if (window.currentZone) {
            openBulkActivityModal(window.currentZone.id);
        }
    });

    // Bulk modal — Saved action dropdown
    document.getElementById('bulkSavedActionSelect').addEventListener('change', handleBulkSavedActionSelect);

    // Bulk modal — Chemical checkboxes (event delegation — list is rebuilt dynamically)
    document.getElementById('bulkChemicalList').addEventListener('change', function(e) {
        if (e.target.type === 'checkbox') bulkUpdateAmountVisibility();
    });

    // Bulk modal — Include sub-zones toggle: reload plant list
    document.getElementById('bulkIncludeSubZones').addEventListener('change', function() {
        // Reset Select All button when the list is rebuilt
        document.getElementById('bulkSelectAllBtn').textContent = 'Deselect All';
        bulkLoadPlants();
    });

    // Bulk modal — Select All / Deselect All
    document.getElementById('bulkSelectAllBtn').addEventListener('click', bulkToggleSelectAll);

    // Bulk modal — Save
    document.getElementById('bulkSaveBtn').addEventListener('click', handleBulkSave);

    // Bulk modal — Cancel
    document.getElementById('bulkCancelBtn').addEventListener('click', function() {
        closeModal('bulkActivityModal');
    });

    // Bulk modal — Close on overlay click
    document.getElementById('bulkActivityModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal('bulkActivityModal');
    });
});
