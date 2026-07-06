// ============================================================
// Zones.js — Zone CRUD and display logic
// Handles creating, reading, updating, and deleting zones,
// as well as rendering the home screen and zone detail pages.
// ============================================================

// ---------- Load & Display: Home Screen (Top-Level Zones) ----------

/**
 * Loads all top-level zones (parentId == null) and displays them on the home screen.
 */
async function loadZonesList() {
    const container = document.getElementById('zoneListContainer');
    const emptyState = document.getElementById('zoneEmptyState');

    try {
        // Query Firestore for top-level zones (sort client-side to avoid composite index)
        const snapshot = await userCol('zones')
            .where('parentId', '==', null)
            .get();

        // Clear any previous content
        container.innerHTML = '';

        if (snapshot.empty) {
            emptyState.textContent = 'No zones yet — add one to get started!';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        // Sort zones alphabetically by name on the client side
        const zones = [];
        snapshot.forEach(function(doc) {
            zones.push({ id: doc.id, ...doc.data() });
        });
        zones.sort(function(a, b) {
            return a.name.localeCompare(b.name);
        });

        // Build a card for each zone
        zones.forEach(function(zone) {
            const card = createZoneCard(zone.id, zone);
            container.appendChild(card);
        });

        // Load the More section panels (All Problems, All Projects, Checklists) and upcoming calendar events
        if (typeof renderYardProblemsPanel === 'function') {
            renderYardProblemsPanel();
        }
        if (typeof renderYardProjectsPanel === 'function') {
            renderYardProjectsPanel();
        }
        if (typeof renderYardChecklistsPanel === 'function') {
            renderYardChecklistsPanel();
        }
        if (typeof loadHomeCalendar === 'function') {
            loadHomeCalendar();
        }

    } catch (error) {
        console.error('Error loading zones:', error);
        emptyState.textContent = 'Error loading zones. Check console for details.';
        emptyState.style.display = 'block';
    }
}

// ---------- Load & Display: Zone Detail Page ----------

/**
 * Loads a zone's details: its info, sub-zones, and plants.
 * @param {string} zoneId - The Firestore document ID of the zone.
 */
async function loadZoneDetail(zoneId) {
    const titleEl = document.getElementById('zoneTitle');
    const subZoneContainer = document.getElementById('subZoneListContainer');
    const subZoneEmptyState = document.getElementById('subZoneEmptyState');
    const plantContainer = document.getElementById('zonePlantListContainer');
    const plantEmptyState = document.getElementById('zonePlantEmptyState');
    const addSubZoneBtn = document.getElementById('addSubZoneBtn');
    const editZoneBtn = document.getElementById('editZoneBtn');

    try {
        // Get the zone document
        const doc = await userCol('zones').doc(zoneId).get();

        if (!doc.exists) {
            titleEl.textContent = 'Zone not found';
            return;
        }

        const zone = doc.data();
        titleEl.textContent = zone.name;

        // Store current zone info for use by add/edit/delete buttons
        window.currentZone = { id: doc.id, ...zone };

        // Build breadcrumbs
        await buildBreadcrumbs(doc.id);

        // Show/hide "Add Sub-zone" button based on depth (max 3 levels)
        if (zone.level < 3) {
            addSubZoneBtn.style.display = 'inline-flex';
        } else {
            addSubZoneBtn.style.display = 'none';
        }

        // Show edit button (delete is now inside the edit modal)
        editZoneBtn.style.display = 'inline-flex';

        // Show "View All Plants" button
        document.getElementById('viewAllPlantsBtn').style.display = 'inline-flex';

        // --- Load sub-zones (sort client-side to avoid composite index) ---
        const subSnapshot = await userCol('zones')
            .where('parentId', '==', zoneId)
            .get();

        subZoneContainer.innerHTML = '';

        if (subSnapshot.empty) {
            if (zone.level < 3) {
                subZoneEmptyState.textContent = 'No sub-zones yet.';
                subZoneEmptyState.style.display = 'block';
            } else {
                subZoneEmptyState.style.display = 'none';
            }
        } else {
            subZoneEmptyState.style.display = 'none';

            // Sort sub-zones alphabetically
            const subZones = [];
            subSnapshot.forEach(function(subDoc) {
                subZones.push({ id: subDoc.id, ...subDoc.data() });
            });
            subZones.sort(function(a, b) {
                return a.name.localeCompare(b.name);
            });

            subZones.forEach(function(subZone) {
                const card = createZoneCard(subZone.id, subZone);
                subZoneContainer.appendChild(card);
            });
        }
        _setDetailAccCount('zoneSubZonesAccCount', 'subZoneListContainer');

        // --- Load plants in this zone ---
        await loadPlantsInZone(zoneId);
        _setDetailAccCount('zonePlantsAccCount', 'zonePlantListContainer');

        // --- Load problems, facts, projects, calendar events, activities, photos ---
        loadProblems('zone', zoneId, 'zoneProblemsContainer', 'zoneProblemsEmptyState')
            .then(function() { _setDetailAccCount('zoneProblemsAccCount', 'zoneProblemsContainer'); });
        loadFacts('zone', zoneId, 'zoneFactsContainer', 'zoneFactsEmptyState')
            .then(function() { _setDetailAccCount('zoneFactsAccCount', 'zoneFactsContainer'); });
        loadProjects('zone', zoneId, 'zoneProjectsContainer', 'zoneProjectsEmptyState')
            .then(function() { _setDetailAccCount('zoneTasksAccCount', 'zoneProjectsContainer'); });
        if (typeof loadEventsForTarget === 'function') {
            var zoneMonths = parseInt(document.getElementById('zoneCalendarRangeSelect').value, 10) || 3;
            loadEventsForTarget('zone', zoneId, 'zoneCalendarEventsContainer', 'zoneCalendarEventsEmptyState', zoneMonths)
                .then(function() { _setDetailAccCount('zoneCalendarAccCount', 'zoneCalendarEventsContainer'); });
        }
        loadActivities('zone', zoneId, 'zoneActivityContainer', 'zoneActivityEmptyState')
            .then(function() { _setDetailAccCount('zoneActivityAccCount', 'zoneActivityContainer'); });
        loadPhotos('zone', zoneId, 'zonePhotoContainer', 'zonePhotoEmptyState')
            .then(function() { _setPhotoAccCount('zonePhotosAccCount', 'zone'); });
        if (typeof loadGpsSection === 'function') {
            loadGpsSection(zoneId)
                .then(function() { _setDetailAccCount('zoneGpsAccCount', 'zoneGpsPreview'); });
        }

        // Reset View All Plants section
        document.getElementById('viewAllPlantsSection').style.display = 'none';

        // Reset "Include sub-zones" checkbox on zone navigation
        var subZoneCheckbox = document.getElementById('showSubZoneProjects');
        if (subZoneCheckbox) subZoneCheckbox.checked = false;

    } catch (error) {
        console.error('Error loading zone detail:', error);
        titleEl.textContent = 'Error loading zone';
    }
}

// ---------- Create a Zone Card Element ----------

/**
 * Creates a clickable card element for a zone.
 * @param {string} id - The zone's Firestore document ID.
 * @param {Object} zone - The zone data (name, level, etc.).
 * @returns {HTMLElement} The card element.
 */
function createZoneCard(id, zone) {
    const card = document.createElement('div');
    card.className = 'card';
    card.addEventListener('click', function() {
        window.location.hash = 'zone/' + id;
    });

    const info = document.createElement('div');

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = zone.name;
    info.appendChild(title);

    // Show level indicator as subtitle
    const levelLabels = { 1: 'Major Zone', 2: 'Sub-zone', 3: 'Detail Zone' };
    const subtitle = document.createElement('div');
    subtitle.className = 'card-subtitle';
    subtitle.textContent = levelLabels[zone.level] || '';
    info.appendChild(subtitle);

    card.appendChild(info);

    const arrow = document.createElement('span');
    arrow.className = 'card-arrow';
    arrow.textContent = '\u203A'; // single right-pointing angle quotation mark
    card.appendChild(arrow);

    return card;
}

// ---------- Breadcrumbs ----------

/**
 * Builds and displays the breadcrumb trail for a given zone.
 * Walks up the parent chain to build: Home > Parent > Current Zone
 * @param {string} zoneId - The Firestore document ID of the current zone.
 */
async function buildBreadcrumbs(zoneId) {
    const breadcrumbBar = document.getElementById('breadcrumbBar');
    const crumbs = [];

    // Walk up the parent chain
    let currentId = zoneId;
    while (currentId) {
        const doc = await userCol('zones').doc(currentId).get();
        if (!doc.exists) break;

        const zone = doc.data();
        crumbs.unshift({ id: doc.id, name: zone.name });
        currentId = zone.parentId;
    }

    // Build the breadcrumb HTML
    let html = '<a href="#zones">Yard</a>';
    crumbs.forEach(function(crumb, index) {
        html += '<span class="separator">&rsaquo;</span>';
        if (index < crumbs.length - 1) {
            // Link to parent zones
            html += '<a href="#zone/' + crumb.id + '">' + escapeHtml(crumb.name) + '</a>';
        } else {
            // Current zone (no link)
            html += '<span>' + escapeHtml(crumb.name) + '</span>';
        }
    });

    breadcrumbBar.innerHTML = html;
}

// ---------- Add Zone ----------

/**
 * Opens the add-zone modal.
 * @param {string|null} parentId - The parent zone's ID (null for top-level).
 * @param {number} parentLevel - The parent's level (0 for top-level, so new zone = 1).
 */
function openAddZoneModal(parentId, parentLevel) {
    const modal = document.getElementById('zoneModal');
    const modalTitle = document.getElementById('zoneModalTitle');
    const nameInput = document.getElementById('zoneNameInput');
    const deleteBtn = document.getElementById('zoneModalDeleteBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';
    const saveBtn = document.getElementById('zoneModalSaveBtn');

    modalTitle.textContent = parentId ? 'Add Sub-zone' : 'Add Zone';
    nameInput.value = '';

    // Store context for the save handler
    modal.dataset.mode = 'add';
    modal.dataset.parentId = parentId || '';
    modal.dataset.newLevel = parentLevel + 1;

    openModal('zoneModal');
    nameInput.focus();
}

/**
 * Opens the edit-zone modal for an existing zone.
 * @param {string} zoneId - The zone's Firestore document ID.
 * @param {string} currentName - The zone's current name.
 */
function openEditZoneModal(zoneId, currentName) {
    const modal = document.getElementById('zoneModal');
    const modalTitle = document.getElementById('zoneModalTitle');
    const nameInput = document.getElementById('zoneNameInput');
    const deleteBtn = document.getElementById('zoneModalDeleteBtn');
    if (deleteBtn) deleteBtn.style.display = 'inline-flex';

    modalTitle.textContent = 'Edit Zone';
    nameInput.value = currentName;

    // Store context for the save handler
    modal.dataset.mode = 'edit';
    modal.dataset.editId = zoneId;

    openModal('zoneModal');
    nameInput.focus();
}

/**
 * Handles the save button in the zone modal (add or edit).
 */
async function handleZoneModalSave() {
    const modal = document.getElementById('zoneModal');
    const nameInput = document.getElementById('zoneNameInput');
    const name = nameInput.value.trim();

    if (!name) {
        alert('Please enter a zone name.');
        return;
    }

    const mode = modal.dataset.mode;

    try {
        if (mode === 'add') {
            // Create a new zone
            const parentId = modal.dataset.parentId || null;
            const level = parseInt(modal.dataset.newLevel);

            await userCol('zones').add({
                name: name,
                parentId: parentId,
                level: level,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            console.log('Zone added:', name);

        } else if (mode === 'edit') {
            // Update existing zone name
            const zoneId = modal.dataset.editId;
            await userCol('zones').doc(zoneId).update({
                name: name
            });

            console.log('Zone updated:', name);
        }

        closeModal('zoneModal');

        // Refresh the current view
        refreshCurrentZoneView();

    } catch (error) {
        console.error('Error saving zone:', error);
        alert('Error saving zone. Check console for details.');
    }
}

// ---------- Delete Zone ----------

/**
 * Deletes a zone after checking for children (sub-zones or plants).
 * @param {string} zoneId - The zone's Firestore document ID.
 */
async function handleDeleteZone(zoneId) {
    try {
        // Check for sub-zones
        const subZones = await userCol('zones')
            .where('parentId', '==', zoneId)
            .limit(1)
            .get();

        if (!subZones.empty) {
            alert('Cannot delete this zone — it has sub-zones. Delete or move them first.');
            return;
        }

        // Check for plants
        const plants = await userCol('plants')
            .where('zoneId', '==', zoneId)
            .limit(1)
            .get();

        if (!plants.empty) {
            alert('Cannot delete this zone — it has plants. Delete or move them first.');
            return;
        }

        // Confirm deletion
        if (!confirm('Are you sure you want to delete this zone?')) {
            return;
        }

        await userCol('zones').doc(zoneId).delete();
        console.log('Zone deleted:', zoneId);

        // Navigate back to parent or home
        if (window.currentZone && window.currentZone.parentId) {
            window.location.hash = 'zone/' + window.currentZone.parentId;
        } else {
            window.location.hash = 'home';
        }

    } catch (error) {
        console.error('Error deleting zone:', error);
        alert('Error deleting zone. Check console for details.');
    }
}

// ---------- Helpers ----------

/**
 * Refreshes the current zone view (home page or zone detail).
 */
function refreshCurrentZoneView() {
    const hash = window.location.hash.slice(1) || 'home';
    const parts = hash.split('/');

    if (parts[0] === 'zone' && parts[1]) {
        loadZoneDetail(parts[1]);
    } else {
        loadZonesList();
    }
}

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} text - The text to escape.
 * @returns {string} The escaped text.
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ---------- Modal Utilities ----------

/**
 * Opens a modal by its ID.
 * @param {string} modalId - The ID of the modal overlay element.
 */
function openModal(modalId) {
    document.getElementById(modalId).classList.add('open');
    // Push a history entry so the Android back button can close this modal
    // instead of navigating away. The URL hash is unchanged — only history
    // state changes, so hashchange / handleRoute are NOT triggered.
    history.pushState({ modal: modalId }, '');
}

/**
 * Closes a modal by its ID.
 * @param {string} modalId - The ID of the modal overlay element.
 */
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('open');
    // If the current history state belongs to this modal, pop it to keep
    // history in sync. (When the back button triggers closeModal, history
    // has already been popped, so history.state won't match and we skip this.)
    if (history.state && history.state.modal === modalId) {
        // Signal the popstate handler to ignore this synthetic back navigation —
        // it was us cleaning up history, not the user pressing the back button.
        window._modalHistoryBack = true;
        history.back();
    }
}

// ---------- Global Modal Drag-Protection ----------
//
// Problem: when the user clicks inside a modal (e.g. a text input) and drags
// the mouse outside the modal card onto the overlay, the browser fires a
// synthetic 'click' event on the overlay (nearest common ancestor of mousedown
// and mouseup targets). Each modal's click-overlay-to-close handler then
// triggers and unexpectedly closes the modal.
//
// Fix: intercept ALL clicks on modal overlays in the capture phase. If the
// mousedown that started this gesture was NOT on the overlay itself (i.e. the
// user was dragging, not clicking the backdrop), cancel the event so that no
// close handler ever runs. Zero changes needed to individual modal handlers.

var _modalOverlayMouseDownOnSelf = false;

document.addEventListener('mousedown', function(e) {
    _modalOverlayMouseDownOnSelf = e.target.classList.contains('modal-overlay');
}, true);

document.addEventListener('click', function(e) {
    // If the click landed on an overlay but the drag started inside a modal,
    // swallow the event so the modal stays open.
    if (e.target.classList.contains('modal-overlay') && !_modalOverlayMouseDownOnSelf) {
        e.stopPropagation();
    }
}, true);

// ---------- Event Listeners (set up after DOM loads) ----------

document.addEventListener('DOMContentLoaded', function() {

    // "Add Zone" button on home page
    document.getElementById('addZoneBtn').addEventListener('click', function() {
        openAddZoneModal(null, 0);
    });

    // "Add Sub-zone" button on zone detail page
    document.getElementById('addSubZoneBtn').addEventListener('click', function() {
        if (window.currentZone) {
            openAddZoneModal(window.currentZone.id, window.currentZone.level);
        }
    });

    // "Edit Zone" button on zone detail page
    document.getElementById('editZoneBtn').addEventListener('click', function() {
        if (window.currentZone) {
            openEditZoneModal(window.currentZone.id, window.currentZone.name);
        }
    });

    // "Delete Zone" button inside the edit modal
    document.getElementById('zoneModalDeleteBtn').addEventListener('click', function() {
        if (window.currentZone) {
            closeModal('zoneModal');
            handleDeleteZone(window.currentZone.id);
        }
    });

    // Zone modal — Save button
    document.getElementById('zoneModalSaveBtn').addEventListener('click', handleZoneModalSave);

    // Zone modal — Cancel button
    document.getElementById('zoneModalCancelBtn').addEventListener('click', function() {
        closeModal('zoneModal');
    });

    // Zone modal — Close when clicking overlay background
    document.getElementById('zoneModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal('zoneModal');
        }
    });

    // Zone modal — Save on Enter key
    document.getElementById('zoneNameInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            handleZoneModalSave();
        }
    });

    // "Add Event" button on zone detail page
    document.getElementById('addZoneCalendarEventBtn').addEventListener('click', function() {
        if (window.currentZone && typeof openAddCalendarEventModal === 'function') {
            var reloadFn = function() {
                var months = parseInt(document.getElementById('zoneCalendarRangeSelect').value, 10) || 3;
                loadEventsForTarget('zone', window.currentZone.id,
                    'zoneCalendarEventsContainer', 'zoneCalendarEventsEmptyState', months);
            };
            openAddCalendarEventModal('zone', window.currentZone.id, reloadFn);
        }
    });

    // Range picker for zone calendar events
    document.getElementById('zoneCalendarRangeSelect').addEventListener('change', function() {
        if (window.currentZone) {
            var months = parseInt(this.value, 10) || 3;
            loadEventsForTarget('zone', window.currentZone.id,
                'zoneCalendarEventsContainer', 'zoneCalendarEventsEmptyState', months);
        }
    });
});
