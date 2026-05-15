// ============================================================
// Plants.js — Plant CRUD, metadata, and display logic
// Handles creating, reading, updating, deleting, and moving
// plants, as well as rendering plant lists and detail pages.
// ============================================================

// ---------- Textarea auto-resize ----------

function _autoResizeTextarea(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

// ---------- Health Status Config ----------

/**
 * Defines the four health statuses plus their display properties.
 * Stored in Firestore as the key string (e.g. 'healthy').
 */
var HEALTH_STATUSES = {
    healthy:    { label: 'Healthy',    emoji: '🟢', cssClass: 'health-healthy' },
    struggling: { label: 'Struggling', emoji: '🟡', cssClass: 'health-struggling' },
    dormant:    { label: 'Dormant',    emoji: '🔵', cssClass: 'health-dormant' },
    dead:       { label: 'Dead',       emoji: '🔴', cssClass: 'health-dead' },
};

/**
 * Builds a badge <span> element for a given health status value.
 * Returns null if the status is empty or unrecognized.
 * @param {string} status - One of: 'healthy', 'struggling', 'dormant', 'dead', or ''.
 * @returns {HTMLElement|null}
 */
function buildHealthBadge(status) {
    var cfg = status ? HEALTH_STATUSES[status] : null;
    if (!cfg) return null;
    var span = document.createElement('span');
    span.className   = 'health-badge ' + cfg.cssClass;
    span.textContent = cfg.emoji + '\u2009' + cfg.label;   // thin space between emoji + label
    return span;
}

/**
 * Updates the health badge in the plant detail page header.
 * Replaces the content of #plantHealthBadge with the new status styling.
 * @param {string} status - The current health status value.
 */
function updatePlantHealthBadge(status) {
    var badgeEl = document.getElementById('plantHealthBadge');
    if (!badgeEl) return;
    var cfg = status ? HEALTH_STATUSES[status] : null;
    if (cfg) {
        badgeEl.className   = 'health-badge ' + cfg.cssClass;
        badgeEl.textContent = cfg.emoji + '\u2009' + cfg.label;
        badgeEl.style.display = '';
    } else {
        badgeEl.style.display = 'none';
        badgeEl.textContent   = '';
    }
}

/**
 * Saves the selected health status to Firestore for the current plant.
 * Called automatically when the dropdown value changes.
 * @param {string} status - The newly selected status value (may be empty to clear).
 */
async function saveHealthStatus(status) {
    if (!window.currentPlant) return;
    try {
        await userCol('plants').doc(window.currentPlant.id).update({
            healthStatus: status || firebase.firestore.FieldValue.delete()
        });
        window.currentPlant.healthStatus = status || '';
        updatePlantHealthBadge(status);

        // Flash a brief "✓ Saved" confirmation
        var msg = document.getElementById('plantHealthSavedMsg');
        if (msg) {
            msg.style.display = 'inline';
            setTimeout(function() { msg.style.display = 'none'; }, 1800);
        }
    } catch (err) {
        console.error('Error saving health status:', err);
        alert('Error saving health status.');
    }
}

// ---------- Load Plants in a Zone ----------

/**
 * Loads all plants in a given zone and renders them in the zone detail page.
 * Called from zones.js when loading a zone detail.
 * @param {string} zoneId - The Firestore document ID of the zone.
 */
async function loadPlantsInZone(zoneId) {
    const container = document.getElementById('zonePlantListContainer');
    const emptyState = document.getElementById('zonePlantEmptyState');
    const addPlantBtn = document.getElementById('addPlantBtn');

    // Show the add plant button and quick photo button
    if (addPlantBtn) {
        addPlantBtn.style.display = 'inline-flex';
    }
    var quickPhotoBtn = document.getElementById('quickAddPlantPhotoBtn');
    if (quickPhotoBtn) {
        quickPhotoBtn.style.display = 'inline-flex';
    }

    try {
        const snapshot = await userCol('plants')
            .where('zoneId', '==', zoneId)
            .get();

        container.innerHTML = '';

        if (snapshot.empty) {
            emptyState.textContent = 'No plants in this zone yet.';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        // Sort plants alphabetically client-side
        const plants = [];
        snapshot.forEach(function(doc) {
            plants.push({ id: doc.id, ...doc.data() });
        });
        plants.sort(function(a, b) {
            return a.name.localeCompare(b.name);
        });

        plants.forEach(function(plant) {
            const card = createPlantCard(plant.id, plant);
            container.appendChild(card);
        });

    } catch (error) {
        console.error('Error loading plants:', error);
        emptyState.textContent = 'Error loading plants. Check console for details.';
        emptyState.style.display = 'block';
    }
}

// ---------- Create a Plant Card ----------

/**
 * Creates a clickable card element for a plant.
 * @param {string} id - The plant's Firestore document ID.
 * @param {Object} plant - The plant data.
 * @returns {HTMLElement} The card element.
 */
function createPlantCard(id, plant) {
    const card = document.createElement('div');
    card.className = 'card plant-card';
    card.addEventListener('click', function() {
        window.location.hash = 'plant/' + id;
    });

    // Profile thumbnail on the left side (if set via "Use as Profile" in photo viewer)
    if (plant.profilePhotoData) {
        var thumb = document.createElement('img');
        thumb.src = plant.profilePhotoData;
        thumb.className = 'entity-card-thumb';
        thumb.alt = plant.name;
        card.appendChild(thumb);
    }

    const info = document.createElement('div');
    info.style.flex = '1';

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = plant.alias || plant.name;
    info.appendChild(title);

    // Health status badge — shown beneath the name when a status is set
    var badge = buildHealthBadge(plant.healthStatus);
    if (badge) {
        badge.style.marginTop = '3px';
        info.appendChild(badge);
    }

    // Show a brief metadata summary if available
    const meta = plant.metadata || {};
    const summaryParts = [];
    if (meta.sunShade) summaryParts.push(meta.sunShade);
    if (meta.wateringNeeds) summaryParts.push(meta.wateringNeeds);
    if (summaryParts.length > 0) {
        const subtitle = document.createElement('div');
        subtitle.className = 'card-subtitle';
        subtitle.textContent = summaryParts.join(' | ');
        info.appendChild(subtitle);
    }

    card.appendChild(info);

    const arrow = document.createElement('span');
    arrow.className = 'card-arrow';
    arrow.textContent = '\u203A';
    card.appendChild(arrow);

    return card;
}

// ---------- Plant Detail Page ----------

/**
 * Loads and displays the full detail page for a plant.
 * @param {string} plantId - The Firestore document ID of the plant.
 */
async function loadPlantDetail(plantId) {
    const titleEl = document.getElementById('plantTitle');
    const metadataForm = document.getElementById('plantMetadataForm');
    const zoneInfoEl = document.getElementById('plantZoneInfo');
    const activityContainer = document.getElementById('plantActivityContainer');
    const activityEmptyState = document.getElementById('plantActivityEmptyState');

    try {
        const doc = await userCol('plants').doc(plantId).get();

        if (!doc.exists) {
            titleEl.textContent = 'Plant not found';
            return;
        }

        const plant = doc.data();
        titleEl.textContent = plant.alias || plant.name;
        var formalEl = document.getElementById('plantFormalName');
        if (plant.alias && formalEl) {
            formalEl.textContent = plant.name;
            formalEl.classList.remove('hidden');
        } else if (formalEl) {
            formalEl.classList.add('hidden');
        }

        // Store current plant info for buttons
        window.currentPlant = { id: doc.id, ...plant };

        // Populate health status dropdown and update the header badge
        var healthSelect = document.getElementById('plantHealthStatusSelect');
        healthSelect.value = plant.healthStatus || '';
        updatePlantHealthBadge(plant.healthStatus || '');

        // Build breadcrumbs: Home > Zone path > Plant Name
        await buildPlantBreadcrumbs(doc.id, plant);

        // Show zone info link
        if (plant.zoneId) {
            const zonePath = await getZonePath(plant.zoneId);
            zoneInfoEl.innerHTML = '<strong>Zone:</strong> ' + zonePath;
        }

        // Populate metadata form (selects + text inputs)
        const meta = plant.metadata || {};
        document.getElementById('plantHeatTolerance').value = meta.heatTolerance || '';
        document.getElementById('plantColdTolerance').value = meta.coldTolerance || '';
        document.getElementById('plantWateringNeeds').value = meta.wateringNeeds || '';
        document.getElementById('plantSunShade').value = meta.sunShade || '';
        document.getElementById('plantBloomMonth').value = meta.bloomMonth || '';
        document.getElementById('plantDormantMonth').value = meta.dormantMonth || '';
        document.getElementById('plantCommonName').value = plant.alias || '';
        var plantNotesEl = document.getElementById('plantNotes');
        plantNotesEl.value = meta.notes || '';
        _autoResizeTextarea(plantNotesEl);

        // Snapshot original values for dirty-state tracking
        snapshotOriginalMetadata();

        // Load problems, facts, projects, calendar events, and activities for this plant
        loadProblems('plant', doc.id, 'plantProblemsContainer', 'plantProblemsEmptyState')
            .then(function() { _setDetailAccCount('plantProblemsAccCount', 'plantProblemsContainer'); });
        loadFacts('plant', doc.id, 'plantFactsContainer', 'plantFactsEmptyState')
            .then(function() { _setDetailAccCount('plantFactsAccCount', 'plantFactsContainer'); });
        loadProjects('plant', doc.id, 'plantProjectsContainer', 'plantProjectsEmptyState')
            .then(function() { _setDetailAccCount('plantTasksAccCount', 'plantProjectsContainer'); });
        if (typeof loadEventsForTarget === 'function') {
            var plantMonths = parseInt(document.getElementById('plantCalendarRangeSelect').value, 10) || 3;
            loadEventsForTarget('plant', doc.id, 'plantCalendarEventsContainer', 'plantCalendarEventsEmptyState', plantMonths)
                .then(function() { _setDetailAccCount('plantCalendarAccCount', 'plantCalendarEventsContainer'); });
        }

        // Load activity history
        loadActivities('plant', doc.id, 'plantActivityContainer', 'plantActivityEmptyState')
            .then(function() { _setDetailAccCount('plantActivityAccCount', 'plantActivityContainer'); });

        // Load photos
        loadPhotos('plant', doc.id, 'plantPhotoContainer', 'plantPhotoEmptyState')
            .then(function() { _setDetailAccCount('plantPhotosAccCount', 'plantPhotoContainer'); });

    } catch (error) {
        console.error('Error loading plant detail:', error);
        titleEl.textContent = 'Error loading plant';
    }
}

// ---------- Plant Breadcrumbs ----------

/**
 * Builds breadcrumbs for a plant: Home > Zone chain > Plant name
 * @param {string} plantId - The plant's Firestore document ID.
 * @param {Object} plant - The plant data.
 */
async function buildPlantBreadcrumbs(plantId, plant) {
    const breadcrumbBar = document.getElementById('breadcrumbBar');
    const crumbs = [];

    // Walk up the zone parent chain
    let currentZoneId = plant.zoneId;
    while (currentZoneId) {
        const zoneDoc = await userCol('zones').doc(currentZoneId).get();
        if (!zoneDoc.exists) break;
        const zone = zoneDoc.data();
        crumbs.unshift({ id: zoneDoc.id, name: zone.name, type: 'zone' });
        currentZoneId = zone.parentId;
    }

    // Build HTML
    let html = '<a href="#zones">Yard</a>';
    crumbs.forEach(function(crumb) {
        html += '<span class="separator">&rsaquo;</span>';
        html += '<a href="#zone/' + crumb.id + '">' + escapeHtml(crumb.name) + '</a>';
    });
    html += '<span class="separator">&rsaquo;</span>';
    html += '<span>' + escapeHtml(plant.name) + '</span>';

    breadcrumbBar.innerHTML = html;
}

// ---------- Zone Path Helper ----------

/**
 * Gets the full path string for a zone (e.g., "Front Yard > By Mailbox").
 * @param {string} zoneId - The zone's Firestore document ID.
 * @returns {string} The formatted zone path.
 */
async function getZonePath(zoneId) {
    const parts = [];
    let currentId = zoneId;

    while (currentId) {
        const doc = await userCol('zones').doc(currentId).get();
        if (!doc.exists) break;
        const zone = doc.data();
        parts.unshift(escapeHtml(zone.name));
        currentId = zone.parentId;
    }

    return parts.join(' &rsaquo; ');
}

// ---------- Clone Plant ----------

/**
 * Opens the plant name modal in "clone" mode, pre-filled with the current
 * plant's name (plus " (Clone)" suffix). On save, the new plant is created
 * in the same zone with the same metadata and health status copied over.
 * No activity history, photos, facts, problems, or projects are copied.
 */
function clonePlant() {
    if (!window.currentPlant) return;

    var modal      = document.getElementById('plantModal');
    var modalTitle = document.getElementById('plantModalTitle');
    var nameInput  = document.getElementById('plantNameInput');

    modalTitle.textContent = 'Clone Plant';
    nameInput.value        = window.currentPlant.name + ' (Clone)';

    modal.dataset.mode        = 'clone';
    modal.dataset.zoneId      = window.currentPlant.zoneId || '';
    modal.dataset.cloneFromId = window.currentPlant.id;

    openModal('plantModal');
    nameInput.select();   // Pre-select so the user can easily change the name
}

// ---------- Add Plant ----------

/**
 * Opens the add-plant modal.
 * @param {string} zoneId - The zone to add the plant to.
 */
function openAddPlantModal(zoneId) {
    const modal = document.getElementById('plantModal');
    const modalTitle = document.getElementById('plantModalTitle');
    const nameInput = document.getElementById('plantNameInput');

    modalTitle.textContent = 'Add Plant';
    nameInput.value = '';

    modal.dataset.mode = 'add';
    modal.dataset.zoneId = zoneId;

    // Reset From Picture section
    document.getElementById('plantFromPictureSection').classList.add('hidden');
    document.getElementById('plantPicStatus').classList.add('hidden');
    document.getElementById('plantPicStatus').textContent = '';
    document.getElementById('plantPicInput').value = '';
    document.getElementById('plantCamInput').value = '';
    // Check if LLM is configured and show the section if so
    plantCheckLlmForModal();

    openModal('plantModal');
    nameInput.focus();
}

/**
 * Opens the edit-plant-name modal.
 * @param {string} plantId - The plant's Firestore document ID.
 * @param {string} currentName - The plant's current name.
 */
function openEditPlantNameModal(plantId, currentName) {
    const modal = document.getElementById('plantModal');
    const modalTitle = document.getElementById('plantModalTitle');
    const nameInput = document.getElementById('plantNameInput');

    modalTitle.textContent = 'Edit Plant Name';
    nameInput.value = currentName;

    modal.dataset.mode = 'edit';
    modal.dataset.editId = plantId;

    openModal('plantModal');
    nameInput.focus();
}

/**
 * Handles save for the add/edit plant modal.
 */
async function handlePlantModalSave() {
    const modal = document.getElementById('plantModal');
    const nameInput = document.getElementById('plantNameInput');
    const name = nameInput.value.trim();

    if (!name) {
        alert('Please enter a plant name.');
        return;
    }

    const mode = modal.dataset.mode;

    try {
        if (mode === 'add') {
            const zoneId = modal.dataset.zoneId;
            await userCol('plants').add({
                name: name,
                zoneId: zoneId,
                metadata: {},
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('Plant added:', name);

            closeModal('plantModal');
            refreshCurrentView();

        } else if (mode === 'edit') {
            const plantId = modal.dataset.editId;
            await userCol('plants').doc(plantId).update({ name: name });
            console.log('Plant renamed:', name);

            closeModal('plantModal');
            refreshCurrentView();

        } else if (mode === 'clone') {
            // Copy metadata and health status from the source plant
            var cloneFromId = modal.dataset.cloneFromId;
            var zoneId      = modal.dataset.zoneId;
            var sourceDoc   = await userCol('plants').doc(cloneFromId).get();
            var sourceMeta  = sourceDoc.exists ? (sourceDoc.data().metadata || {}) : {};
            var sourceHealth = sourceDoc.exists ? (sourceDoc.data().healthStatus || '') : '';

            var newData = {
                name:      name,
                zoneId:    zoneId,
                metadata:  sourceMeta,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (sourceHealth) newData.healthStatus = sourceHealth;

            var newRef = await userCol('plants').add(newData);
            console.log('Plant cloned:', name, '(from', cloneFromId + ')');

            // Navigate to the new plant's detail page so the user can review it
            closeModal('plantModal');
            window.location.hash = 'plant/' + newRef.id;
        }

    } catch (error) {
        console.error('Error saving plant:', error);
        alert('Error saving plant. Check console for details.');
    }
}

// ---------- Plant Metadata — Dirty-State Tracking ----------

/** Stores the original metadata values when the plant is loaded. */
var originalMetadata = {};

/** IDs of all metadata form fields to track. */
var METADATA_FIELD_IDS = [
    'plantCommonName',
    'plantHeatTolerance', 'plantColdTolerance', 'plantWateringNeeds',
    'plantSunShade', 'plantBloomMonth', 'plantDormantMonth', 'plantNotes'
];

/**
 * Snapshots the current form field values into originalMetadata.
 * Called after loading a plant and after saving.
 */
function snapshotOriginalMetadata() {
    originalMetadata = {};
    METADATA_FIELD_IDS.forEach(function(fieldId) {
        originalMetadata[fieldId] = document.getElementById(fieldId).value;
    });
    updateMetadataSaveButtonState();
}

/**
 * Compares current field values to the snapshot.
 * Enables Save button if anything changed, disables if all match.
 */
function updateMetadataSaveButtonState() {
    var saveBtn = document.getElementById('saveMetadataBtn');
    var isDirty = false;

    METADATA_FIELD_IDS.forEach(function(fieldId) {
        if (document.getElementById(fieldId).value !== originalMetadata[fieldId]) {
            isDirty = true;
        }
    });

    saveBtn.disabled = !isDirty;
}

// ---------- Save Plant Metadata ----------

/**
 * Saves the metadata form fields for the current plant.
 */
async function savePlantMetadata() {
    if (!window.currentPlant) return;

    const alias = document.getElementById('plantCommonName').value.trim();
    const metadata = {
        heatTolerance: document.getElementById('plantHeatTolerance').value.trim(),
        coldTolerance: document.getElementById('plantColdTolerance').value.trim(),
        wateringNeeds: document.getElementById('plantWateringNeeds').value.trim(),
        sunShade: document.getElementById('plantSunShade').value.trim(),
        bloomMonth: document.getElementById('plantBloomMonth').value.trim(),
        dormantMonth: document.getElementById('plantDormantMonth').value.trim(),
        notes: document.getElementById('plantNotes').value.trim()
    };

    try {
        await userCol('plants').doc(window.currentPlant.id).update({
            alias: alias,
            metadata: metadata
        });

        // Update local copy
        window.currentPlant.metadata = metadata;

        // Re-snapshot original values so Save button becomes disabled again
        snapshotOriginalMetadata();

        // Show a brief confirmation
        const saveBtn = document.getElementById('saveMetadataBtn');
        saveBtn.textContent = 'Saved!';
        saveBtn.classList.remove('btn-primary');
        saveBtn.classList.add('btn-secondary');
        saveBtn.disabled = true;
        setTimeout(function() {
            saveBtn.textContent = 'Save Care Info';
            saveBtn.classList.remove('btn-secondary');
            saveBtn.classList.add('btn-primary');
            updateMetadataSaveButtonState();
        }, 1500);

        console.log('Plant metadata saved');

    } catch (error) {
        console.error('Error saving metadata:', error);
        alert('Error saving metadata. Check console for details.');
    }
}

// ---------- Move Plant to Another Zone ----------

/**
 * Opens the move-plant modal and populates it with all available zones.
 */
async function openMovePlantModal() {
    if (!window.currentPlant) return;

    const select = document.getElementById('movePlantZoneSelect');
    select.innerHTML = '<option value="">Loading zones...</option>';

    openModal('movePlantModal');

    try {
        // Load all zones
        const snapshot = await userCol('zones').get();
        const zones = [];
        snapshot.forEach(function(doc) {
            zones.push({ id: doc.id, ...doc.data() });
        });

        // Build a tree structure for display
        const options = buildZoneOptionsTree(zones, null, '');

        select.innerHTML = '<option value="">-- Select a zone --</option>';
        options.forEach(function(opt) {
            const option = document.createElement('option');
            option.value = opt.id;
            option.textContent = opt.label;
            // Highlight current zone
            if (opt.id === window.currentPlant.zoneId) {
                option.textContent += ' (current)';
                option.disabled = true;
            }
            select.appendChild(option);
        });

    } catch (error) {
        console.error('Error loading zones for move:', error);
        select.innerHTML = '<option value="">Error loading zones</option>';
    }
}

/**
 * Builds a flat list of zone options with indentation to show hierarchy.
 * @param {Array} allZones - All zone documents.
 * @param {string|null} parentId - The parent ID to filter by.
 * @param {string} prefix - Indentation prefix for display.
 * @returns {Array} Flat array of {id, label} objects.
 */
function buildZoneOptionsTree(allZones, parentId, prefix) {
    const results = [];
    const children = allZones
        .filter(function(z) { return z.parentId === parentId; })
        .sort(function(a, b) { return a.name.localeCompare(b.name); });

    children.forEach(function(zone) {
        results.push({ id: zone.id, label: prefix + zone.name });
        // Recurse into children with deeper indentation
        const subResults = buildZoneOptionsTree(allZones, zone.id, prefix + '\u00A0\u00A0\u00A0\u00A0');
        results.push.apply(results, subResults);
    });

    return results;
}

/**
 * Handles the save for moving a plant to a new zone.
 */
async function handleMovePlantSave() {
    const select = document.getElementById('movePlantZoneSelect');
    const newZoneId = select.value;

    if (!newZoneId) {
        alert('Please select a zone.');
        return;
    }

    if (!window.currentPlant) return;

    try {
        await userCol('plants').doc(window.currentPlant.id).update({
            zoneId: newZoneId
        });

        console.log('Plant moved to zone:', newZoneId);
        closeModal('movePlantModal');

        // Reload the plant detail to reflect the new zone
        loadPlantDetail(window.currentPlant.id);

    } catch (error) {
        console.error('Error moving plant:', error);
        alert('Error moving plant. Check console for details.');
    }
}

// ---------- Delete Plant ----------

/**
 * Deletes the current plant after confirmation.
 */
async function handleDeletePlant() {
    if (!window.currentPlant) return;

    if (!confirm('Are you sure you want to delete "' + window.currentPlant.name + '"? This cannot be undone.')) {
        return;
    }

    try {
        const zoneId = window.currentPlant.zoneId;
        await userCol('plants').doc(window.currentPlant.id).delete();
        console.log('Plant deleted:', window.currentPlant.name);

        // Navigate back to the zone
        window.location.hash = 'zone/' + zoneId;

    } catch (error) {
        console.error('Error deleting plant:', error);
        alert('Error deleting plant. Check console for details.');
    }
}

// ---------- View All Plants (Recursive Zone Hierarchy) ----------

/**
 * Loads all plants in the current zone AND all its sub-zones recursively.
 * Displays them as a flat list with their zone path shown.
 */
async function loadAllPlantsInHierarchy() {
    if (!window.currentZone) return;

    const container = document.getElementById('allPlantsListContainer');
    const emptyState = document.getElementById('allPlantsEmptyState');
    const section = document.getElementById('viewAllPlantsSection');

    section.style.display = 'block';
    container.innerHTML = '';
    emptyState.textContent = 'Loading...';
    emptyState.style.display = 'block';

    try {
        // Step 1: Collect all zone IDs in the hierarchy (current zone + all descendants)
        const zoneIds = await getDescendantZoneIds(window.currentZone.id);

        // Step 2: Load plants from all these zones
        // Firestore 'in' queries support up to 10 values, so we may need multiple queries
        const allPlants = [];
        const chunks = chunkArray(zoneIds, 10);

        for (var i = 0; i < chunks.length; i++) {
            var chunk = chunks[i];
            var snapshot = await userCol('plants')
                .where('zoneId', 'in', chunk)
                .get();

            snapshot.forEach(function(doc) {
                allPlants.push({ id: doc.id, ...doc.data() });
            });
        }

        if (allPlants.length === 0) {
            emptyState.textContent = 'No plants found in this zone or any sub-zones.';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        // Sort alphabetically
        allPlants.sort(function(a, b) {
            return a.name.localeCompare(b.name);
        });

        // Step 3: Get zone paths for display (batch-load zone names)
        const zonePathCache = {};

        // Render each plant with its zone path
        for (var j = 0; j < allPlants.length; j++) {
            var plant = allPlants[j];
            // Get or cache the zone path
            if (!zonePathCache[plant.zoneId]) {
                zonePathCache[plant.zoneId] = await getZonePath(plant.zoneId);
            }

            var card = createPlantCardWithPath(plant.id, plant, zonePathCache[plant.zoneId]);
            container.appendChild(card);
        }

    } catch (error) {
        console.error('Error loading all plants in hierarchy:', error);
        emptyState.textContent = 'Error loading plants.';
        emptyState.style.display = 'block';
    }
}

/**
 * Recursively collects all zone IDs for a given zone and its descendants.
 * @param {string} zoneId - The starting zone's Firestore document ID.
 * @returns {Promise<string[]>} Array of zone IDs (includes the starting zone).
 */
async function getDescendantZoneIds(zoneId) {
    const ids = [zoneId];

    const snapshot = await userCol('zones')
        .where('parentId', '==', zoneId)
        .get();

    const childPromises = [];
    snapshot.forEach(function(doc) {
        childPromises.push(getDescendantZoneIds(doc.id));
    });

    const childResults = await Promise.all(childPromises);
    childResults.forEach(function(childIds) {
        ids.push.apply(ids, childIds);
    });

    return ids;
}

/**
 * Splits an array into chunks of a given size.
 * @param {Array} array - The array to chunk.
 * @param {number} size - The maximum chunk size.
 * @returns {Array} Array of chunks.
 */
function chunkArray(array, size) {
    const chunks = [];
    for (var i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

/**
 * Creates a plant card that also shows the zone path underneath the name.
 * @param {string} id - The plant's Firestore document ID.
 * @param {Object} plant - The plant data.
 * @param {string} zonePath - The formatted zone path HTML.
 * @returns {HTMLElement} The card element.
 */
function createPlantCardWithPath(id, plant, zonePath) {
    const card = document.createElement('div');
    card.className = 'card plant-card';
    card.addEventListener('click', function() {
        window.location.hash = 'plant/' + id;
    });

    const info = document.createElement('div');

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = plant.alias || plant.name;
    info.appendChild(title);

    // Health status badge — shown when a status is set
    var badge = buildHealthBadge(plant.healthStatus);
    if (badge) {
        badge.style.marginTop = '3px';
        info.appendChild(badge);
    }

    // Show zone path
    const path = document.createElement('div');
    path.className = 'plant-zone-path';
    path.innerHTML = zonePath;
    info.appendChild(path);

    card.appendChild(info);

    const arrow = document.createElement('span');
    arrow.className = 'card-arrow';
    arrow.textContent = '\u203A';
    card.appendChild(arrow);

    return card;
}

// ---------- Refresh Helper ----------

/**
 * Refreshes the current view based on the hash.
 */
function refreshCurrentView() {
    const hash = window.location.hash.slice(1) || 'home';
    const parts = hash.split('/');

    if (parts[0] === 'plant' && parts[1]) {
        loadPlantDetail(parts[1]);
    } else if (parts[0] === 'zone' && parts[1]) {
        loadZoneDetail(parts[1]);
    } else {
        loadZonesList();
    }
}

// ---------- Plant Identification from Picture ----------

// The prompt sent to the LLM for plant identification.
// Instructs the LLM to return ONLY a JSON object with exact field values.
var PLANT_ID_PROMPT = [
    'You are a plant identification assistant. Analyze the provided plant image(s) and return ONLY a valid JSON object.',
    'No explanation, no markdown, no code blocks, no extra text of any kind.',
    'Your entire response must be parseable by JSON.parse().',
    '',
    'Return this exact structure:',
    '{',
    '  "name": "",',
    '  "commonName": "",',
    '  "heatTolerance": "",',
    '  "coldTolerance": "",',
    '  "wateringNeeds": "",',
    '  "sunShade": "",',
    '  "bloomMonth": "",',
    '  "dormantMonth": "",',
    '  "notes": "",',
    '  "additionalMessage": ""',
    '}',
    '',
    'Field rules:',
    '- name: the formal or scientific name, e.g. "Loropetalum chinense var. rubrum \'Purple Diamond\'"',
    '- commonName: the informal everyday name most people use, e.g. "Purple Diamond Loropetalum". Leave "" if it is the same as name or unknown.',
    '- heatTolerance: one of exactly: "High", "Medium-High", "Medium", "Medium-Low", "Low", or "" if unknown',
    '- coldTolerance: one of exactly: "High", "Medium-High", "Medium", "Medium-Low", "Low", or "" if unknown',
    '- wateringNeeds: free text, e.g. "Weekly", "Drought tolerant", or "" if unknown',
    '- sunShade: one of exactly: "Full Sun", "Partial Sun", "Partial Shade", "Full Shade", or "" if unknown',
    '- bloomMonth: the typical primary bloom month as a number 1-12 (e.g. "4" for April), or "" if unknown',
    '- dormantMonth: the typical primary dormancy month as a number 1-12, or "" if unknown',
    '- notes: brief description including scientific name and one key care tip. Maximum 200 characters.',
    '- additionalMessage: use for issues such as unclear image or plant not recognized. Leave "" if no issues.',
    '',
    'If you cannot identify the plant at all, return all fields as "" and explain in additionalMessage.'
].join('\n');

// Month number → name lookup (index 0 unused so index == month number)
var PLANT_MONTH_NAMES = ['','January','February','March','April','May','June',
                         'July','August','September','October','November','December'];

// Holds parsed LLM data while the review modal is open
var plantLlmPending = null;

/**
 * Checks Firestore for an LLM config and shows the From Picture section if found.
 * Called each time the Add Plant modal opens.
 */
async function plantCheckLlmForModal() {
    try {
        var doc = await userCol('settings').doc('llm').get();
        var ok  = doc.exists && doc.data().provider && doc.data().apiKey;
        document.getElementById('plantFromPictureSection').classList.toggle('hidden', !ok);
    } catch (e) {
        // Leave hidden on error
    }
}

/**
 * Legacy handler: compress selected images from the in-modal inputs, then send to LLM.
 * The gallery/camera buttons now open the staging flow instead, so this handles
 * any remaining direct file-input path.
 */
async function plantHandleFromPicture(files) {
    if (!files || files.length === 0) return;

    var statusEl   = document.getElementById('plantPicStatus');
    var saveBtn    = document.getElementById('plantModalSaveBtn');
    var galleryBtn = document.getElementById('plantPicGalleryBtn');
    var cameraBtn  = document.getElementById('plantPicCameraBtn');
    var modal      = document.getElementById('plantModal');

    statusEl.textContent = 'Identifying plant\u2026';
    statusEl.classList.remove('hidden');
    saveBtn.disabled    = true;
    galleryBtn.disabled = true;
    cameraBtn.disabled  = true;

    try {
        var images = [];
        for (var i = 0; i < Math.min(files.length, 4); i++) {
            images.push(await compressImage(files[i]));
        }
        var zoneId = modal.dataset.zoneId;
        await plantSendToLlm(images, zoneId);
    } catch (err) {
        console.error('Plant ID error:', err);
        statusEl.textContent = 'Error: ' + err.message;
    } finally {
        saveBtn.disabled    = false;
        galleryBtn.disabled = false;
        cameraBtn.disabled  = false;
        document.getElementById('plantPicInput').value = '';
        document.getElementById('plantCamInput').value = '';
    }
}

/**
 * Send already-compressed base64 images to the LLM for plant identification.
 * Called from both the in-modal flow and the staging (+Photo) flow.
 * @param {string[]} images - Array of base64 data URL strings (already compressed)
 * @param {string}   zoneId - Zone ID to assign the new plant to
 */
async function plantSendToLlm(images, zoneId) {
    var statusEl   = document.getElementById('plantPicStatus');
    var saveBtn    = document.getElementById('plantModalSaveBtn');
    var galleryBtn = document.getElementById('plantPicGalleryBtn');
    var cameraBtn  = document.getElementById('plantPicCameraBtn');
    var modal      = document.getElementById('plantModal');

    var modalOpen = modal && modal.classList.contains('active');
    if (modalOpen && statusEl) {
        statusEl.textContent = 'Identifying plant\u2026';
        statusEl.classList.remove('hidden');
        if (saveBtn)    saveBtn.disabled    = true;
        if (galleryBtn) galleryBtn.disabled = true;
        if (cameraBtn)  cameraBtn.disabled  = true;
    }

    try {
        // Load LLM config
        var cfgDoc  = await userCol('settings').doc('llm').get();
        var cfg     = cfgDoc.exists ? cfgDoc.data() : null;
        if (!cfg || !cfg.provider || !cfg.apiKey) {
            if (modalOpen && statusEl) statusEl.textContent = 'No LLM configured. Go to Settings.';
            else alert('No LLM configured. Go to Settings.');
            return;
        }
        var llm = LLM_PROVIDERS[cfg.provider];
        if (!llm) {
            if (modalOpen && statusEl) statusEl.textContent = 'Unknown LLM provider.';
            else alert('Unknown LLM provider.');
            return;
        }

        // Optionally append city/state location context to the prompt
        var mainDoc   = await userCol('settings').doc('main').get();
        var cityState = (mainDoc.exists && mainDoc.data().cityState) ? mainDoc.data().cityState.trim() : '';
        var prompt    = cityState
            ? PLANT_ID_PROMPT + '\n\nLocation: ' + cityState
            : PLANT_ID_PROMPT;

        // Build the message content: prompt text + already-compressed images
        var content = [{ type: 'text', text: prompt }];
        images.forEach(function(url) {
            content.push({ type: 'image_url', image_url: { url: url } });
        });

        var activeModel  = cfg.model || llm.model;
        var responseText = await chatCallOpenAICompat(llm, cfg.apiKey, content, activeModel);
        var parsed       = plantParseLlmResponse(responseText);

        var showToggle = document.getElementById('plantShowResponseToggle');
        if (modalOpen && showToggle && showToggle.checked) {
            plantLlmPending = { parsed: parsed, images: images, zoneId: zoneId };
            if (statusEl) { statusEl.textContent = ''; statusEl.classList.add('hidden'); }
            closeModal('plantModal');
            plantShowReviewModal(prompt, responseText, parsed);
        } else {
            if (!parsed.name && parsed.additionalMessage) {
                if (modalOpen && statusEl) {
                    statusEl.textContent = '\u26a0 ' + parsed.additionalMessage;
                } else {
                    alert('\u26a0 ' + parsed.additionalMessage);
                }
                return;
            }
            await plantSaveFromLlm(parsed, images, zoneId, '');
            if (modalOpen && statusEl) { statusEl.textContent = ''; statusEl.classList.add('hidden'); }
            closeModal('plantModal');
            refreshCurrentView();
        }

    } catch (err) {
        console.error('Plant ID error:', err);
        if (modalOpen && statusEl) {
            statusEl.textContent = 'Error: ' + err.message;
        } else {
            alert('Error identifying plant: ' + err.message);
        }
    } finally {
        if (modalOpen) {
            if (saveBtn)    saveBtn.disabled    = false;
            if (galleryBtn) galleryBtn.disabled = false;
            if (cameraBtn)  cameraBtn.disabled  = false;
            var picIn = document.getElementById('plantPicInput');
            var camIn = document.getElementById('plantCamInput');
            if (picIn) picIn.value = '';
            if (camIn) camIn.value = '';
        }
    }
}

/**
 * Parse the LLM's JSON response. Strips accidental markdown fences.
 * Returns a safe object even if parsing fails.
 */
function plantParseLlmResponse(text) {
    try {
        var clean = text.trim()
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/,      '')
            .replace(/```\s*$/,      '');
        return JSON.parse(clean);
    } catch (e) {
        return {
            name: '', heatTolerance: '', coldTolerance: '', wateringNeeds: '',
            sunShade: '', bloomMonth: '', dormantMonth: '', notes: '',
            additionalMessage: 'Could not parse response: ' + text.substring(0, 120)
        };
    }
}

/**
 * Show the review modal with the raw prompt, raw response, and a summary
 * of the parsed fields so the user can verify before saving.
 */
function plantShowReviewModal(prompt, rawResponse, parsed) {
    document.getElementById('reviewPromptText').textContent      = prompt;
    document.getElementById('reviewResponseText').textContent    = rawResponse;
    document.getElementById('plantReviewName').value             = parsed.name || '';
    document.getElementById('plantReviewCommonName').value       = parsed.commonName || '';

    function monthLabel(val) {
        var n = parseInt(val);
        return (n >= 1 && n <= 12) ? PLANT_MONTH_NAMES[n] : (val || '—');
    }

    document.getElementById('reviewHeatTolerance').textContent = parsed.heatTolerance  || '—';
    document.getElementById('reviewColdTolerance').textContent = parsed.coldTolerance  || '—';
    document.getElementById('reviewWateringNeeds').textContent = parsed.wateringNeeds  || '—';
    document.getElementById('reviewSunShade').textContent      = parsed.sunShade       || '—';
    document.getElementById('reviewBloomMonth').textContent    = monthLabel(parsed.bloomMonth);
    document.getElementById('reviewDormantMonth').textContent  = monthLabel(parsed.dormantMonth);
    document.getElementById('reviewNotes').textContent         = parsed.notes          || '—';

    var msgEl = document.getElementById('plantReviewMessage');
    if (parsed.additionalMessage) {
        msgEl.textContent = '\u26a0 ' + parsed.additionalMessage;
        msgEl.classList.remove('hidden');
    } else {
        msgEl.classList.add('hidden');
    }

    openModal('plantLlmReviewModal');
}

/**
 * Create the plant record + save photos from the LLM response.
 * nameOverride is used when the user edited the name in the review modal.
 * Photos are only saved when a plant name was successfully identified.
 */
async function plantSaveFromLlm(parsed, images, zoneId, nameOverride, aliasOverride) {
    var plantName = (nameOverride || parsed.name || 'Unknown Plant').trim();
    var plantAlias = (aliasOverride !== undefined ? aliasOverride : (parsed.commonName || '')).trim();

    function monthVal(num) {
        var n = parseInt(num);
        return (n >= 1 && n <= 12) ? PLANT_MONTH_NAMES[n] : '';
    }

    var metadata = {
        heatTolerance : parsed.heatTolerance || '',
        coldTolerance : parsed.coldTolerance || '',
        wateringNeeds : parsed.wateringNeeds || '',
        sunShade      : parsed.sunShade      || '',
        bloomMonth    : monthVal(parsed.bloomMonth),
        dormantMonth  : monthVal(parsed.dormantMonth),
        notes         : parsed.notes         || ''
    };

    var newRef = await userCol('plants').add({
        name      : plantName,
        alias     : plantAlias,
        zoneId    : zoneId,
        metadata  : metadata,
        createdAt : firebase.firestore.FieldValue.serverTimestamp()
    });

    // Only attach photos when identification produced a plant name
    var identified = !!(parsed.name || nameOverride);
    if (identified) {
        for (var i = 0; i < images.length; i++) {
            await userCol('photos').add({
                targetType : 'plant',
                targetId   : newRef.id,
                imageData  : images[i],
                caption    : '',
                createdAt  : firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    }

    return newRef.id;
}

// ---------- Quick-Add Plant from Photo ----------

/**
 * Quick-add a plant from the "+Photo" button on the zone page.
 * Opens the shared staging modal so the user can take up to 4 photos with crop,
 * then sends them all to the LLM at once. No separate review modal — saves directly.
 * @param {string} zoneId - The zone ID to add the plant to.
 */
function plantQuickAddFromPhoto(zoneId) {
    openLlmPhotoStaging('Identify Plant', function(images) {
        // images are already-compressed base64 strings from the staging flow
        _plantQuickSendToLlm(images, zoneId);
    });
}

/**
 * Internal helper: send staged images to LLM and save directly (no review modal).
 * @param {string[]} images - Already-compressed base64 data URLs
 * @param {string}   zoneId - Zone ID for the new plant
 */
async function _plantQuickSendToLlm(images, zoneId) {
    var btn = document.getElementById('quickAddPlantPhotoBtn');
    var origText = btn ? btn.textContent : '+Photo';
    if (btn) { btn.textContent = 'Identifying\u2026'; btn.disabled = true; }

    try {
        // Load LLM config
        var cfgDoc = await userCol('settings').doc('llm').get();
        var cfg = cfgDoc.exists ? cfgDoc.data() : null;
        if (!cfg || !cfg.provider || !cfg.apiKey) {
            alert('No LLM configured. Go to Settings.');
            return;
        }
        var llm = LLM_PROVIDERS[cfg.provider];
        if (!llm) { alert('Unknown LLM provider.'); return; }

        // Optionally append city/state location context to the prompt
        var mainDoc = await userCol('settings').doc('main').get();
        var cityState = (mainDoc.exists && mainDoc.data().cityState) ? mainDoc.data().cityState.trim() : '';
        var prompt = cityState ? PLANT_ID_PROMPT + '\n\nLocation: ' + cityState : PLANT_ID_PROMPT;

        // Build content: prompt text + already-compressed images
        var content = [{ type: 'text', text: prompt }];
        images.forEach(function(url) {
            content.push({ type: 'image_url', image_url: { url: url } });
        });

        var activeModel = cfg.model || llm.model;
        var responseText = await chatCallOpenAICompat(llm, cfg.apiKey, content, activeModel);
        var parsed = plantParseLlmResponse(responseText);

        if (!parsed.name && parsed.additionalMessage) {
            alert('Could not identify plant: ' + parsed.additionalMessage);
            return;
        }
        if (!parsed.name) {
            alert('Could not identify plant. Try a clearer photo.');
            return;
        }

        await plantSaveFromLlm(parsed, images, zoneId, '');
        refreshCurrentView();

    } catch (err) {
        console.error('Quick plant photo error:', err);
        alert('Error: ' + err.message);
    } finally {
        if (btn) { btn.textContent = origText; btn.disabled = false; }
        var input = document.getElementById('quickPlantCamInput');
        if (input) input.value = '';
    }
}

// ---------- Event Listeners ----------

document.addEventListener('DOMContentLoaded', function() {

    // "Add Plant" button on zone detail page
    document.getElementById('addPlantBtn').addEventListener('click', function() {
        if (window.currentZone) {
            openAddPlantModal(window.currentZone.id);
        }
    });

    // "+Photo" quick-add button on zone detail page — opens staging modal directly
    document.getElementById('quickAddPlantPhotoBtn').addEventListener('click', function() {
        var zoneId = window.currentZone ? window.currentZone.id : null;
        if (!zoneId) { alert('No zone selected.'); return; }
        plantQuickAddFromPhoto(zoneId);
    });
    // Legacy camera input kept wired in case other paths fire it (staging replaces primary use)
    document.getElementById('quickPlantCamInput').addEventListener('change', function() {
        if (this.files && this.files.length > 0) {
            var zoneId = window.currentZone ? window.currentZone.id : null;
            if (!zoneId) { alert('No zone selected.'); return; }
            // Compress and send directly for legacy path
            (async function() {
                var images = [];
                for (var i = 0; i < Math.min(this.files.length, 4); i++) {
                    images.push(await compressImage(this.files[i]));
                }
                await _plantQuickSendToLlm(images, zoneId);
            }.bind(this))();
        }
    });

    // Plant modal — Save button
    document.getElementById('plantModalSaveBtn').addEventListener('click', handlePlantModalSave);

    // Plant modal — Cancel button
    document.getElementById('plantModalCancelBtn').addEventListener('click', function() {
        closeModal('plantModal');
    });

    // Plant modal — Close on overlay click
    document.getElementById('plantModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal('plantModal');
    });

    // Plant modal — Enter key to save
    document.getElementById('plantNameInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') handlePlantModalSave();
    });

    // Plant detail — Edit name button
    document.getElementById('editPlantNameBtn').addEventListener('click', function() {
        if (window.currentPlant) {
            openEditPlantNameModal(window.currentPlant.id, window.currentPlant.name);
        }
    });

    // Plant detail — Move button
    document.getElementById('movePlantBtn').addEventListener('click', openMovePlantModal);

    // Plant detail — Clone button
    document.getElementById('clonePlantBtn').addEventListener('click', clonePlant);

    // Plant detail — Delete button
    document.getElementById('deletePlantBtn').addEventListener('click', handleDeletePlant);

    // Plant detail — Save metadata button
    document.getElementById('saveMetadataBtn').addEventListener('click', savePlantMetadata);

    // Plant metadata — Dirty-state tracking on all metadata fields
    METADATA_FIELD_IDS.forEach(function(fieldId) {
        var el = document.getElementById(fieldId);
        // Use 'input' for text/textarea, 'change' for selects
        el.addEventListener('input', updateMetadataSaveButtonState);
        el.addEventListener('change', updateMetadataSaveButtonState);
    });

    // Auto-resize the notes textarea as the user types
    document.getElementById('plantNotes').addEventListener('input', function() {
        _autoResizeTextarea(this);
    });

    // Move plant modal — Save button
    document.getElementById('movePlantSaveBtn').addEventListener('click', handleMovePlantSave);

    // Move plant modal — Cancel button
    document.getElementById('movePlantCancelBtn').addEventListener('click', function() {
        closeModal('movePlantModal');
    });

    // Move plant modal — Close on overlay click
    document.getElementById('movePlantModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal('movePlantModal');
    });

    // Plant detail — Health status dropdown (auto-saves on change)
    document.getElementById('plantHealthStatusSelect').addEventListener('change', function() {
        saveHealthStatus(this.value);
    });

    // "View All Plants" button on zone detail page
    document.getElementById('viewAllPlantsBtn').addEventListener('click', loadAllPlantsInHierarchy);

    // "Hide" button for View All Plants section
    document.getElementById('hideAllPlantsBtn').addEventListener('click', function() {
        document.getElementById('viewAllPlantsSection').style.display = 'none';
    });

    // "Add Event" button on plant detail page
    document.getElementById('addPlantCalendarEventBtn').addEventListener('click', function() {
        if (window.currentPlant && typeof openAddCalendarEventModal === 'function') {
            var reloadFn = function() {
                var months = parseInt(document.getElementById('plantCalendarRangeSelect').value, 10) || 3;
                loadEventsForTarget('plant', window.currentPlant.id,
                    'plantCalendarEventsContainer', 'plantCalendarEventsEmptyState', months);
            };
            openAddCalendarEventModal('plant', window.currentPlant.id, reloadFn);
        }
    });

    // Range picker for plant calendar events
    document.getElementById('plantCalendarRangeSelect').addEventListener('change', function() {
        if (window.currentPlant) {
            var months = parseInt(this.value, 10) || 3;
            loadEventsForTarget('plant', window.currentPlant.id,
                'plantCalendarEventsContainer', 'plantCalendarEventsEmptyState', months);
        }
    });

    // From Picture — gallery and camera buttons now open the staging modal
    document.getElementById('plantPicGalleryBtn').addEventListener('click', function() {
        var modal  = document.getElementById('plantModal');
        var zoneId = modal ? modal.dataset.zoneId : null;
        openLlmPhotoStaging('Identify Plant', function(images) {
            plantSendToLlm(images, zoneId);
        });
    });
    document.getElementById('plantPicCameraBtn').addEventListener('click', function() {
        var modal  = document.getElementById('plantModal');
        var zoneId = modal ? modal.dataset.zoneId : null;
        openLlmPhotoStaging('Identify Plant', function(images) {
            plantSendToLlm(images, zoneId);
        });
    });
    // Legacy file inputs kept wired for any remaining direct trigger path
    document.getElementById('plantPicInput').addEventListener('change', function() {
        if (this.files && this.files.length > 0) plantHandleFromPicture(this.files);
    });
    document.getElementById('plantCamInput').addEventListener('change', function() {
        if (this.files && this.files.length > 0) plantHandleFromPicture(this.files);
    });

    // Review modal — Add It button
    document.getElementById('plantReviewAddBtn').addEventListener('click', async function() {
        if (!plantLlmPending) return;
        var btn          = this;
        var nameOverride  = document.getElementById('plantReviewName').value.trim();
        var aliasOverride = document.getElementById('plantReviewCommonName').value.trim();
        btn.disabled     = true;
        btn.textContent  = 'Saving\u2026';
        try {
            await plantSaveFromLlm(plantLlmPending.parsed, plantLlmPending.images,
                                   plantLlmPending.zoneId, nameOverride, aliasOverride);
            plantLlmPending = null;
            closeModal('plantLlmReviewModal');
            refreshCurrentView();
        } catch (err) {
            console.error('Error saving plant from LLM:', err);
            alert('Error saving plant. Please try again.');
            btn.disabled    = false;
            btn.textContent = 'Add It';
        }
    });

    // Review modal — Cancel button
    document.getElementById('plantReviewCancelBtn').addEventListener('click', function() {
        plantLlmPending = null;
        closeModal('plantLlmReviewModal');
    });

    // Review modal — close on overlay click
    document.getElementById('plantLlmReviewModal').addEventListener('click', function(e) {
        if (e.target === this) {
            plantLlmPending = null;
            closeModal('plantLlmReviewModal');
        }
    });
});
