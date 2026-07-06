// ============================================================
// structures.js — Yard Structures Feature
// Tracks outdoor structures (sheds, fences, firepits, etc.)
// Each structure can optionally act as a storage location with
// Things and SubThings (mirrors garage.js pattern).
//
// Routes:
//   #structures              → loadStructuresPage()
//   #structure/:id           → loadStructurePage(id)
//   #structurething/:id      → loadStructureThingPage(id)
//   #structuresubthing/:id   → loadStructureSubThingPage(id)
//
// Firestore collections:
//   structures         — { name, isStorage, createdAt }
//   structureThings    — { name, structureId, category, description, purchaseDate, worth, notes, createdAt }
//   structureSubThings — { name, thingId, description, purchaseDate, worth, notes, createdAt }
// ============================================================

// ---- Global state ----
window.currentStructure        = null;  // Structure document currently being viewed
window.currentStructureThing   = null;  // Structure thing document currently being viewed
window.currentStructureSubThing = null; // Structure subthing document currently being viewed

// ---- Category display map (unified list shared across House, Garage, Structures) ----
var STRUCTURE_THING_CATEGORIES = {
    'appliance':   'Appliance',
    'auto':        'Auto',
    'chemical':    'Chemical',
    'electronics': 'Electronics',
    'fixture':     'Fixture',
    'furniture':   'Furniture',
    'power-tools': 'Power Tools',
    'tools':       'Tools',
    'other':       'Other'
};

// ============================================================
// STRUCTURES LIST PAGE  (#structures)
// ============================================================

/**
 * Load and render the Structures list page.
 * Called by app.js when routing to #structures.
 */
function loadStructuresPage() {
    var container = document.getElementById('structuresList');
    container.innerHTML = '<p class="empty-state">Loading\u2026</p>';

    userCol('structures').orderBy('name').get()
        .then(function(snapshot) {
            container.innerHTML = '';

            if (snapshot.empty) {
                container.innerHTML = '<p class="empty-state">No structures yet. Add one to get started.</p>';
                return;
            }

            snapshot.forEach(function(doc) {
                container.appendChild(buildStructureCard(doc.id, doc.data()));
            });
        })
        .catch(function(err) {
            console.error('loadStructuresPage error:', err);
            container.innerHTML = '<p class="empty-state">Error loading structures.</p>';
        });
}

/**
 * Build a card for a structure showing name, optional storage badge, Edit + Delete buttons.
 * @param {string} id
 * @param {object} data
 */
function buildStructureCard(id, data) {
    var card = document.createElement('div');
    card.className = 'card structure-card';

    var storageBadge = data.isStorage
        ? '<span class="structure-storage-badge">Storage</span>'
        : '';

    card.innerHTML =
        '<div class="card-main card--clickable-area">' +
            '<span class="card-title">' + escapeHtml(data.name || 'Structure') + '</span>' +
            storageBadge +
        '</div>' +
        '<div class="card-actions">' +
            '<button class="btn btn-secondary btn-small" data-id="' + id + '" data-action="edit-structure">Edit Name</button>' +
        '</div>';

    // Clicking the main area navigates to the structure detail page
    card.querySelector('.card--clickable-area').addEventListener('click', function() {
        window.location.hash = '#structure/' + id;
    });

    card.querySelector('[data-action="edit-structure"]').addEventListener('click', function(e) {
        e.stopPropagation();
        openEditStructureModal(id);
    });

    return card;
}

// ============================================================
// STRUCTURE MODAL  (Add / Edit)
// ============================================================

/**
 * Open the Add Structure modal.
 */
function openAddStructureModal() {
    var modal = document.getElementById('structureModal');
    document.getElementById('structureModalTitle').textContent   = 'Add Structure';
    document.getElementById('structureNameInput').value          = '';
    document.getElementById('structureIsStorageToggle').checked  = false;
    document.getElementById('structureIsStorageToggle').disabled = false;
    document.getElementById('structureStorageNote').classList.add('hidden');
    document.getElementById('structureModalDeleteBtn').classList.add('hidden');

    modal.dataset.mode   = 'add';
    modal.dataset.editId = '';

    openModal('structureModal');
    document.getElementById('structureNameInput').focus();
}

/**
 * Open the Edit Structure modal, pre-filled with existing data.
 * If the structure has things, the storage toggle is disabled.
 * @param {string} id  — structures document ID
 */
function openEditStructureModal(id) {
    var modal = document.getElementById('structureModal');

    userCol('structures').doc(id).get()
        .then(function(doc) {
            if (!doc.exists) return;
            var data = doc.data();

            document.getElementById('structureModalTitle').textContent  = 'Edit Structure';
            document.getElementById('structureNameInput').value         = data.name        || '';
            document.getElementById('structureIsStorageToggle').checked = !!data.isStorage;

            modal.dataset.mode   = 'edit';
            modal.dataset.editId = id;

            // Check if things exist — if so, disable the storage toggle
            return userCol('structureThings')
                .where('structureId', '==', id)
                .limit(1)
                .get()
                .then(function(snap) {
                    var hasThings  = !snap.empty;
                    var toggle     = document.getElementById('structureIsStorageToggle');
                    var noteEl     = document.getElementById('structureStorageNote');
                    toggle.disabled = hasThings && data.isStorage;
                    if (hasThings && data.isStorage) {
                        noteEl.classList.remove('hidden');
                    } else {
                        noteEl.classList.add('hidden');
                    }
                    // Show Delete button in edit mode
                    document.getElementById('structureModalDeleteBtn').classList.remove('hidden');
                    openModal('structureModal');
                    document.getElementById('structureNameInput').focus();
                });
        })
        .catch(function(err) { console.error('openEditStructureModal error:', err); });
}

/**
 * Save the structure (add or edit) from the modal.
 */
function handleStructureModalSave() {
    var modal   = document.getElementById('structureModal');
    var nameVal = document.getElementById('structureNameInput').value.trim();

    if (!nameVal) { alert('Please enter a structure name.'); return; }

    var mode      = modal.dataset.mode;
    var editId    = modal.dataset.editId;
    var isStorage = document.getElementById('structureIsStorageToggle').checked;

    var structureData = {
        name:      nameVal,
        isStorage: isStorage
    };

    if (mode === 'edit' && editId) {
        userCol('structures').doc(editId).update(structureData)
            .then(function() {
                closeModal('structureModal');
                loadStructuresPage();
            })
            .catch(function(err) { console.error('Update structure error:', err); });
    } else {
        structureData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        userCol('structures').add(structureData)
            .then(function() {
                closeModal('structureModal');
                loadStructuresPage();
            })
            .catch(function(err) { console.error('Add structure error:', err); });
    }
}

/**
 * Delete a structure after confirmation.
 * @param {string} id
 * @param {string} name
 */
function deleteStructure(id, name) {
    if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;

    userCol('structures').doc(id).delete()
        .then(function() { loadStructuresPage(); })
        .catch(function(err) { console.error('Delete structure error:', err); });
}

// ============================================================
// STRUCTURE DETAIL PAGE  (#structure/:id)
// ============================================================

/**
 * Load the structure detail page.
 * Called by app.js when routing to #structure/{id}.
 * @param {string} structureId
 */
function loadStructurePage(structureId) {
    userCol('structures').doc(structureId).get()
        .then(function(doc) {
            if (!doc.exists) {
                window.location.hash = '#structures';
                return;
            }
            window.currentStructure = Object.assign({ id: doc.id }, doc.data());
            renderStructurePage(window.currentStructure);
        })
        .catch(function(err) { console.error('loadStructurePage error:', err); });
}

/**
 * Render the structure detail page: header, breadcrumb, all cross-entity sections,
 * and optionally the things section (when isStorage = true).
 * @param {object} structure  — { id, name, isStorage, ... }
 */
function renderStructurePage(structure) {
    document.getElementById('structureName').textContent = structure.name || 'Structure';

    // Breadcrumb: Yard > Structures > [name]
    buildStructureBreadcrumb([
        { label: 'Structures', hash: '#structures' },
        { label: structure.name || 'Structure', hash: null }
    ]);

    // ---- Load all cross-entity feature sections ----
    loadPhotos(    'structure', structure.id, 'structurePhotosSection',          'structurePhotosEmpty')
        .then(function() { _setPhotoAccCount('structurePhotosAccCount', 'structure'); });
    loadActivities('structure', structure.id, 'structureActivitiesContainer',    'structureActivitiesEmpty')
        .then(function() { _setDetailAccCount('structureActivityAccCount', 'structureActivitiesContainer'); });
    loadProblems(  'structure', structure.id, 'structureProblemsContainer',      'structureProblemsEmpty')
        .then(function() { _setDetailAccCount('structureProblemsAccCount', 'structureProblemsContainer'); });
    loadFacts(     'structure', structure.id, 'structureFactsContainer',         'structureFactsEmpty')
        .then(function() { _setDetailAccCount('structureFactsAccCount', 'structureFactsContainer'); });
    loadProjects(  'structure', structure.id, 'structureProjectsContainer',      'structureProjectsEmpty')
        .then(function() { _setDetailAccCount('structureTasksAccCount', 'structureProjectsContainer'); });

    if (typeof loadEventsForTarget === 'function') {
        var months = parseInt(document.getElementById('structureCalendarRangeSelect').value, 10) || 3;
        loadEventsForTarget('structure', structure.id,
            'structureCalendarEventsContainer', 'structureCalendarEventsEmpty', months)
            .then(function() { _setDetailAccCount('structureCalendarAccCount', 'structureCalendarEventsContainer'); });
    }

    // Show or hide the Things section based on isStorage flag
    var thingsSection = document.getElementById('structureThingsSection');
    if (structure.isStorage) {
        thingsSection.classList.remove('hidden');
        loadStructureThings(structure.id);
    } else {
        thingsSection.classList.add('hidden');
    }
}

// ============================================================
// STRUCTURE THINGS LIST  (shown on Structure detail page)
// ============================================================

/**
 * Load and render the things list for a given structure.
 * @param {string} structureId
 */
function loadStructureThings(structureId) {
    var container  = document.getElementById('structureThingsList');
    var emptyState = document.getElementById('structureThingsEmpty');

    container.innerHTML    = '';
    emptyState.textContent = 'Loading\u2026';

    userCol('structureThings')
        .where('structureId', '==', structureId)
        .get()
        .then(function(snapshot) {
            emptyState.textContent = '';

            if (snapshot.empty) {
                emptyState.textContent = 'No things yet. Add tools, equipment, or supplies.';
                return;
            }

            // Sort client-side by createdAt to avoid composite index
            var docs = [];
            snapshot.forEach(function(doc) { docs.push(doc); });
            docs.sort(function(a, b) {
                var ta = a.data().createdAt ? a.data().createdAt.toMillis() : 0;
                var tb = b.data().createdAt ? b.data().createdAt.toMillis() : 0;
                return ta - tb;
            });

            docs.forEach(function(doc) {
                container.appendChild(buildStructureThingCard(doc.id, doc.data()));
            });
            _setDetailAccCount('structureThingsAccCount', 'structureThingsList');
        })
        .catch(function(err) {
            console.error('loadStructureThings error:', err);
            emptyState.textContent = 'Error loading things.';
        });
}

/**
 * Build a clickable card for a structure thing.
 * @param {string} id
 * @param {object} data
 */
function buildStructureThingCard(id, data) {
    var card = document.createElement('div');
    card.className = 'card card--clickable';

    var catBadge = buildStructureThingCategoryBadge(data.category);

    card.innerHTML =
        '<div class="card-main">' +
            '<span class="card-title">' + escapeHtml(data.name || 'Unnamed Thing') + '</span>' +
            catBadge +
        '</div>' +
        '<span class="card-arrow">\u203a</span>';

    card.addEventListener('click', function() {
        window.location.hash = '#structurething/' + id;
    });

    return card;
}

/**
 * Return an HTML badge string for a structure thing category.
 * @param {string} category
 */
function buildStructureThingCategoryBadge(category) {
    if (!category) return '';
    var label = STRUCTURE_THING_CATEGORIES[category] || category;
    return '<span class="house-thing-cat-badge house-thing-cat-badge--' +
           escapeHtml(category) + '">' + escapeHtml(label) + '</span>';
}

// ============================================================
// STRUCTURE THING MODAL  (Add / Edit)
// ============================================================

/**
 * Open the Add Structure Thing modal.
 * @param {string} structureId  — parent structure document ID
 */
function openAddStructureThingModal(structureId) {
    var modal = document.getElementById('structureThingModal');

    document.getElementById('structureThingModalTitle').textContent     = 'Add Thing';
    document.getElementById('structureThingNameInput').value             = '';
    document.getElementById('structureThingCategorySelect').value        = 'other';
    document.getElementById('structureThingDescriptionInput').value      = '';
    document.getElementById('structureThingPurchaseDateInput').value     = '';
    document.getElementById('structureThingWorthInput').value            = '';
    document.getElementById('structureThingNotesInput').value            = '';
    document.getElementById('structureThingCommentInput').value          = '';

    // Reset From Picture status
    var statusEl = document.getElementById('structureThingPicStatus');
    if (statusEl) { statusEl.textContent = ''; statusEl.classList.add('hidden'); }

    modal.dataset.mode        = 'add';
    modal.dataset.editId      = '';
    modal.dataset.structureId = structureId;

    buildContactPicker('strThingBenePicker', { placeholder: 'Search contacts\u2026' });

    // Show From Picture section if LLM is configured
    structureCheckLlmForModal();

    openModal('structureThingModal');
    document.getElementById('structureThingNameInput').focus();
}

/**
 * Open the Edit Structure Thing modal, pre-filled with existing data.
 * @param {string} thingId  — structureThings document ID
 */
function openEditStructureThingModal(thingId) {
    var modal = document.getElementById('structureThingModal');
    var thing = window.currentStructureThing;

    if (!thing || thing.id !== thingId) {
        // Fallback: load from Firestore if state is stale
        userCol('structureThings').doc(thingId).get()
            .then(function(doc) {
                if (doc.exists) {
                    window.currentStructureThing = Object.assign({ id: doc.id }, doc.data());
                    openEditStructureThingModal(thingId);
                }
            });
        return;
    }

    document.getElementById('structureThingModalTitle').textContent     = 'Edit Thing';
    document.getElementById('structureThingNameInput').value             = thing.name         || '';
    document.getElementById('structureThingCategorySelect').value        = thing.category     || 'other';
    document.getElementById('structureThingDescriptionInput').value      = thing.description  || '';
    document.getElementById('structureThingPurchaseDateInput').value     = thing.purchaseDate || '';
    document.getElementById('structureThingWorthInput').value            = thing.worth        || '';
    document.getElementById('structureThingNotesInput').value            = thing.notes        || '';
    document.getElementById('structureThingCommentInput').value          = '';

    // Hide From Picture in edit mode
    var picSection = document.getElementById('structureThingFromPictureSection');
    if (picSection) picSection.classList.add('hidden');

    modal.dataset.mode        = 'edit';
    modal.dataset.editId      = thingId;
    modal.dataset.structureId = thing.structureId || '';

    buildContactPicker('strThingBenePicker', {
        placeholder: 'Search contacts\u2026',
        initialId:   thing.beneficiaryContactId || undefined,
        initialName: thing.beneficiaryName      || undefined
    });

    openModal('structureThingModal');
    document.getElementById('structureThingNameInput').focus();
}

/**
 * Save the structure thing (add or edit) from the modal.
 */
function handleStructureThingModalSave() {
    var modal   = document.getElementById('structureThingModal');
    var nameVal = document.getElementById('structureThingNameInput').value.trim();

    if (!nameVal) { alert('Please enter a name.'); return; }

    var mode        = modal.dataset.mode;
    var editId      = modal.dataset.editId;
    var structureId = modal.dataset.structureId;

    var thingData = {
        name:                 nameVal,
        category:             document.getElementById('structureThingCategorySelect').value   || 'other',
        description:          document.getElementById('structureThingDescriptionInput').value.trim(),
        purchaseDate:         document.getElementById('structureThingPurchaseDateInput').value || null,
        worth:                document.getElementById('structureThingWorthInput').value.trim() || null,
        notes:                document.getElementById('structureThingNotesInput').value.trim(),
        beneficiaryContactId: document.getElementById('strThingBenePicker_id').value || null
    };

    if (mode === 'edit' && editId) {
        userCol('structureThings').doc(editId).update(thingData)
            .then(function() {
                closeModal('structureThingModal');
                loadStructureThingPage(editId);
            })
            .catch(function(err) { console.error('Update structure thing error:', err); });
    } else {
        if (!structureId) { alert('No structure selected.'); return; }
        thingData.structureId = structureId;
        thingData.createdAt   = firebase.firestore.FieldValue.serverTimestamp();

        userCol('structureThings').add(thingData)
            .then(function() {
                closeModal('structureThingModal');
                loadStructureThings(structureId);
            })
            .catch(function(err) { console.error('Add structure thing error:', err); });
    }
}

// ============================================================
// STRUCTURE THING DETAIL PAGE  (#structurething/:id)
// ============================================================

/**
 * Load the Structure thing detail page.
 * Called by app.js when routing to #structurething/{id}.
 * @param {string} thingId  — structureThings document ID
 */
function loadStructureThingPage(thingId) {
    userCol('structureThings').doc(thingId).get()
        .then(function(doc) {
            if (!doc.exists) {
                window.location.hash = '#structures';
                return;
            }
            window.currentStructureThing = Object.assign({ id: doc.id }, doc.data());

            // Load parent structure for breadcrumb
            return userCol('structures').doc(window.currentStructureThing.structureId).get()
                .then(function(structDoc) {
                    window.currentStructure = structDoc.exists
                        ? Object.assign({ id: structDoc.id }, structDoc.data())
                        : { id: window.currentStructureThing.structureId, name: 'Structure' };
                    renderStructureThingPage(window.currentStructureThing, window.currentStructure);
                    loadStructureSubThings(thingId);
                });
        })
        .catch(function(err) { console.error('loadStructureThingPage error:', err); });
}

/**
 * Render the thing header, info card, breadcrumb, and all cross-entity sections.
 * @param {object} thing      — { id, name, category, ... }
 * @param {object} structure  — { id, name }
 */
function renderStructureThingPage(thing, structure) {
    document.getElementById('structureThingName').textContent = thing.name || 'Thing';

    var catLabel = STRUCTURE_THING_CATEGORIES[thing.category] || thing.category || '';
    document.getElementById('structureThingMeta').textContent =
        (structure.name || 'Structure') + (catLabel ? ' \u00b7 ' + catLabel : '');

    // Breadcrumb: Structures > [structure name] > [thing name]
    buildStructureBreadcrumb([
        { label: 'Structures',                hash: '#structures' },
        { label: structure.name || 'Structure', hash: '#structure/' + structure.id },
        { label: thing.name || 'Thing',       hash: null }
    ]);

    // Render inventory details card (description, purchaseDate, worth, notes)
    renderStructureInventoryDetails(thing, 'structureThingDetailsSection');
    _renderBeneficiaryRow('strThingGoesToRow', thing, []);

    // ---- Load all cross-entity feature sections ----
    loadPhotos(    'structurething', thing.id, 'structureThingPhotosSection',          'structureThingPhotosEmpty')
        .then(function() { _setPhotoAccCount('structureThingPhotosAccCount', 'structurething'); });
    loadActivities('structurething', thing.id, 'structureThingActivitiesContainer',    'structureThingActivitiesEmpty')
        .then(function() { _setDetailAccCount('structureThingActivityAccCount', 'structureThingActivitiesContainer'); });
    loadProblems(  'structurething', thing.id, 'structureThingProblemsContainer',      'structureThingProblemsEmpty')
        .then(function() { _setDetailAccCount('structureThingProblemsAccCount', 'structureThingProblemsContainer'); });
    loadFacts(     'structurething', thing.id, 'structureThingFactsContainer',         'structureThingFactsEmpty')
        .then(function() { _setDetailAccCount('structureThingFactsAccCount', 'structureThingFactsContainer'); });
    loadProjects(  'structurething', thing.id, 'structureThingProjectsContainer',      'structureThingProjectsEmpty')
        .then(function() { _setDetailAccCount('structureThingTasksAccCount', 'structureThingProjectsContainer'); });

    if (typeof loadEventsForTarget === 'function') {
        var months = parseInt(document.getElementById('structureThingCalendarRangeSelect').value, 10) || 3;
        loadEventsForTarget('structurething', thing.id,
            'structureThingCalendarEventsContainer', 'structureThingCalendarEventsEmpty', months)
            .then(function() { _setDetailAccCount('structureThingCalendarAccCount', 'structureThingCalendarEventsContainer'); });
    }
}

/**
 * Delete a structure thing after confirmation.
 * Navigates back to the parent structure page on success.
 * @param {string} id  — structureThings document ID
 */
function deleteStructureThing(id) {
    var thing = window.currentStructureThing;
    var name  = (thing && thing.name) ? thing.name : 'this thing';

    if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;

    userCol('structureThings').doc(id).delete()
        .then(function() {
            if (window.currentStructure && window.currentStructure.id) {
                window.location.hash = '#structure/' + window.currentStructure.id;
            } else {
                window.location.hash = '#structures';
            }
        })
        .catch(function(err) { console.error('Delete structure thing error:', err); });
}

// ============================================================
// STRUCTURE SUBTHINGS LIST  (shown on Thing detail page)
// ============================================================

/**
 * Load and render the subthings list for a given structure thing.
 * @param {string} thingId
 */
function loadStructureSubThings(thingId) {
    var container  = document.getElementById('structureSubThingsList');
    var emptyState = document.getElementById('structureSubThingsEmpty');

    container.innerHTML    = '';
    emptyState.textContent = 'Loading\u2026';

    userCol('structureSubThings')
        .where('thingId', '==', thingId)
        .get()
        .then(function(snapshot) {
            emptyState.textContent = '';

            if (snapshot.empty) {
                emptyState.textContent = 'No sub-items yet.';
                return;
            }

            // Sort client-side by createdAt
            var docs = [];
            snapshot.forEach(function(doc) { docs.push(doc); });
            docs.sort(function(a, b) {
                var ta = a.data().createdAt ? a.data().createdAt.toMillis() : 0;
                var tb = b.data().createdAt ? b.data().createdAt.toMillis() : 0;
                return ta - tb;
            });

            docs.forEach(function(doc) {
                container.appendChild(buildStructureSubThingCard(doc.id, doc.data()));
            });
            _setDetailAccCount('structureThingSubItemsAccCount', 'structureSubThingsList');
        })
        .catch(function(err) {
            console.error('loadStructureSubThings error:', err);
            emptyState.textContent = 'Error loading sub-items.';
        });
}

/**
 * Build a clickable card for a structure subthing.
 * @param {string} id
 * @param {object} data
 */
function buildStructureSubThingCard(id, data) {
    var card = document.createElement('div');
    card.className = 'card card--clickable';

    card.innerHTML =
        '<div class="card-main">' +
            '<span class="card-title">' + escapeHtml(data.name || 'Unnamed Item') + '</span>' +
        '</div>' +
        '<span class="card-arrow">\u203a</span>';

    card.addEventListener('click', function() {
        window.location.hash = '#structuresubthing/' + id;
    });

    return card;
}

// ============================================================
// STRUCTURE SUBTHING MODAL  (Add / Edit)
// ============================================================

/**
 * Open the Add SubThing modal.
 * @param {string} thingId  — parent structureThing document ID
 */
function openAddStructureSubThingModal(thingId) {
    var modal = document.getElementById('structureSubThingModal');

    document.getElementById('structureSubThingModalTitle').textContent  = 'Add Sub-Item';
    document.getElementById('structureSubThingNameInput').value         = '';
    document.getElementById('structureSubThingDescriptionInput').value  = '';
    document.getElementById('structureSubThingPurchaseDateInput').value = '';
    document.getElementById('structureSubThingWorthInput').value        = '';
    document.getElementById('structureSubThingNotesInput').value        = '';

    modal.dataset.mode    = 'add';
    modal.dataset.editId  = '';
    modal.dataset.thingId = thingId;

    buildContactPicker('strSubBenePicker', { placeholder: 'Search contacts\u2026' });

    openModal('structureSubThingModal');
    document.getElementById('structureSubThingNameInput').focus();
}

/**
 * Open the Edit SubThing modal, pre-filled with existing data.
 * @param {string} subThingId  — structureSubThings document ID
 */
function openEditStructureSubThingModal(subThingId) {
    var modal    = document.getElementById('structureSubThingModal');
    var subThing = window.currentStructureSubThing;

    if (!subThing || subThing.id !== subThingId) {
        userCol('structureSubThings').doc(subThingId).get()
            .then(function(doc) {
                if (doc.exists) {
                    window.currentStructureSubThing = Object.assign({ id: doc.id }, doc.data());
                    openEditStructureSubThingModal(subThingId);
                }
            });
        return;
    }

    document.getElementById('structureSubThingModalTitle').textContent  = 'Edit Sub-Item';
    document.getElementById('structureSubThingNameInput').value         = subThing.name         || '';
    document.getElementById('structureSubThingDescriptionInput').value  = subThing.description  || '';
    document.getElementById('structureSubThingPurchaseDateInput').value = subThing.purchaseDate || '';
    document.getElementById('structureSubThingWorthInput').value        = subThing.worth        || '';
    document.getElementById('structureSubThingNotesInput').value        = subThing.notes        || '';

    modal.dataset.mode    = 'edit';
    modal.dataset.editId  = subThingId;
    modal.dataset.thingId = subThing.thingId || '';

    buildContactPicker('strSubBenePicker', {
        placeholder: 'Search contacts\u2026',
        initialId:   subThing.beneficiaryContactId || undefined,
        initialName: subThing.beneficiaryName      || undefined
    });

    openModal('structureSubThingModal');
    document.getElementById('structureSubThingNameInput').focus();
}

/**
 * Save the structure subthing (add or edit) from the modal.
 */
function handleStructureSubThingModalSave() {
    var modal   = document.getElementById('structureSubThingModal');
    var nameVal = document.getElementById('structureSubThingNameInput').value.trim();

    if (!nameVal) { alert('Please enter a name.'); return; }

    var mode    = modal.dataset.mode;
    var editId  = modal.dataset.editId;
    var thingId = modal.dataset.thingId;

    var itemData = {
        name:                 nameVal,
        description:          document.getElementById('structureSubThingDescriptionInput').value.trim(),
        purchaseDate:         document.getElementById('structureSubThingPurchaseDateInput').value || null,
        worth:                document.getElementById('structureSubThingWorthInput').value.trim() || null,
        notes:                document.getElementById('structureSubThingNotesInput').value.trim(),
        beneficiaryContactId: document.getElementById('strSubBenePicker_id').value || null
    };

    if (mode === 'edit' && editId) {
        userCol('structureSubThings').doc(editId).update(itemData)
            .then(function() {
                closeModal('structureSubThingModal');
                loadStructureSubThingPage(editId);
            })
            .catch(function(err) { console.error('Update structure subthing error:', err); });
    } else {
        if (!thingId) { alert('No parent thing selected.'); return; }
        itemData.thingId   = thingId;
        itemData.createdAt = firebase.firestore.FieldValue.serverTimestamp();

        userCol('structureSubThings').add(itemData)
            .then(function() {
                closeModal('structureSubThingModal');
                loadStructureSubThings(thingId);
            })
            .catch(function(err) { console.error('Add structure subthing error:', err); });
    }
}

// ============================================================
// STRUCTURE SUBTHING DETAIL PAGE  (#structuresubthing/:id)
// ============================================================

/**
 * Load the Structure subthing detail page.
 * Called by app.js when routing to #structuresubthing/{id}.
 * @param {string} subThingId  — structureSubThings document ID
 */
function loadStructureSubThingPage(subThingId) {
    userCol('structureSubThings').doc(subThingId).get()
        .then(function(doc) {
            if (!doc.exists) {
                window.location.hash = '#structures';
                return;
            }
            window.currentStructureSubThing = Object.assign({ id: doc.id }, doc.data());

            // Load parent thing, then parent structure for breadcrumb
            return userCol('structureThings').doc(window.currentStructureSubThing.thingId).get()
                .then(function(thingDoc) {
                    window.currentStructureThing = thingDoc.exists
                        ? Object.assign({ id: thingDoc.id }, thingDoc.data())
                        : { id: window.currentStructureSubThing.thingId, name: 'Thing', structureId: null };

                    var structureId = window.currentStructureThing.structureId;
                    if (!structureId) {
                        window.currentStructure = { id: '', name: 'Structure' };
                        renderStructureSubThingPage(
                            window.currentStructureSubThing,
                            window.currentStructureThing,
                            window.currentStructure
                        );
                        return;
                    }

                    return userCol('structures').doc(structureId).get()
                        .then(function(structDoc) {
                            window.currentStructure = structDoc.exists
                                ? Object.assign({ id: structDoc.id }, structDoc.data())
                                : { id: structureId, name: 'Structure' };
                            renderStructureSubThingPage(
                                window.currentStructureSubThing,
                                window.currentStructureThing,
                                window.currentStructure
                            );
                        });
                });
        })
        .catch(function(err) { console.error('loadStructureSubThingPage error:', err); });
}

/**
 * Render subthing header, info card, breadcrumb, and all cross-entity sections.
 * @param {object} subThing   — { id, name, ... }
 * @param {object} thing      — { id, name }
 * @param {object} structure  — { id, name }
 */
function renderStructureSubThingPage(subThing, thing, structure) {
    document.getElementById('structureSubThingName').textContent = subThing.name || 'Item';
    document.getElementById('structureSubThingMeta').textContent =
        (structure.name || 'Structure') + ' \u203a ' + (thing.name || 'Thing');

    // Breadcrumb: Structures > [structure name] > [thing name] > [item name]
    buildStructureBreadcrumb([
        { label: 'Structures',                    hash: '#structures' },
        { label: structure.name || 'Structure',   hash: structure.id ? '#structure/' + structure.id : null },
        { label: thing.name || 'Thing',           hash: thing.id ? '#structurething/' + thing.id : null },
        { label: subThing.name || 'Item',         hash: null }
    ]);

    // Render inventory details card
    renderStructureInventoryDetails(subThing, 'structureSubThingDetailsSection');
    _renderBeneficiaryRow('strSubGoesToRow', subThing, [
        { entity: thing, label: thing.name || 'Thing' }
    ]);

    // ---- Load all cross-entity feature sections ----
    loadPhotos(    'structuresubthing', subThing.id, 'structureSubThingPhotosSection',          'structureSubThingPhotosEmpty')
        .then(function() { _setPhotoAccCount('structureSubThingPhotosAccCount', 'structuresubthing'); });
    loadActivities('structuresubthing', subThing.id, 'structureSubThingActivitiesContainer',    'structureSubThingActivitiesEmpty')
        .then(function() { _setDetailAccCount('structureSubThingActivityAccCount', 'structureSubThingActivitiesContainer'); });
    loadProblems(  'structuresubthing', subThing.id, 'structureSubThingProblemsContainer',      'structureSubThingProblemsEmpty')
        .then(function() { _setDetailAccCount('structureSubThingProblemsAccCount', 'structureSubThingProblemsContainer'); });
    loadFacts(     'structuresubthing', subThing.id, 'structureSubThingFactsContainer',         'structureSubThingFactsEmpty')
        .then(function() { _setDetailAccCount('structureSubThingFactsAccCount', 'structureSubThingFactsContainer'); });
    loadProjects(  'structuresubthing', subThing.id, 'structureSubThingProjectsContainer',      'structureSubThingProjectsEmpty')
        .then(function() { _setDetailAccCount('structureSubThingTasksAccCount', 'structureSubThingProjectsContainer'); });

    if (typeof loadEventsForTarget === 'function') {
        var months = parseInt(document.getElementById('structureSubThingCalendarRangeSelect').value, 10) || 3;
        loadEventsForTarget('structuresubthing', subThing.id,
            'structureSubThingCalendarEventsContainer', 'structureSubThingCalendarEventsEmpty', months)
            .then(function() { _setDetailAccCount('structureSubThingCalendarAccCount', 'structureSubThingCalendarEventsContainer'); });
    }
}

/**
 * Delete a structure subthing after confirmation.
 * Navigates back to the parent thing page on success.
 * @param {string} id  — structureSubThings document ID
 */
function deleteStructureSubThing(id) {
    var subThing = window.currentStructureSubThing;
    var name     = (subThing && subThing.name) ? subThing.name : 'this item';

    if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;

    userCol('structureSubThings').doc(id).delete()
        .then(function() {
            if (window.currentStructureThing && window.currentStructureThing.id) {
                window.location.hash = '#structurething/' + window.currentStructureThing.id;
            } else {
                window.location.hash = '#structures';
            }
        })
        .catch(function(err) { console.error('Delete structure subthing error:', err); });
}

// ============================================================
// INVENTORY DETAILS RENDERER
// Renders purchaseDate, worth, description, notes as a card.
// Mirrors garage.js renderGarageInventoryDetails() for consistency.
// ============================================================

/**
 * Render structure thing/subthing inventory details as a card section.
 * Hides the section entirely when no data is present.
 * @param {object} data      — Thing or SubThing document data
 * @param {string} sectionId — Element ID of the details section
 */
function renderStructureInventoryDetails(data, sectionId) {
    var section = document.getElementById(sectionId);
    if (!section) return;

    var rows = [];

    if (data.purchaseDate) {
        var pd    = new Date(data.purchaseDate + 'T00:00:00');
        var pdStr = pd.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        rows.push(['Purchased', pdStr]);
    }

    if (data.worth !== null && data.worth !== undefined && data.worth !== '')
        rows.push(['Worth / Value', '$' + data.worth]);

    if (data.description)
        rows.push(['Description', data.description]);

    if (data.notes)
        rows.push(['Notes', data.notes]);

    if (!rows.length) {
        section.style.display = 'none';
        return;
    }

    section.style.display = '';
    section.innerHTML = rows.map(function(r) {
        return '<div class="thing-detail-row">' +
               '<span class="thing-detail-label">' + escapeHtml(r[0]) + '</span>' +
               '<span class="thing-detail-value">'  + escapeHtml(String(r[1])) + '</span>' +
               '</div>';
    }).join('');
}

// ============================================================
// BREADCRUMB HELPER
// Mirrors buildGarageBreadcrumb() from garage.js.
// ============================================================

/**
 * Build the breadcrumb bar and sticky header for Structure pages.
 * @param {Array} crumbs  — [{ label, hash }] — hash null = current page (no link)
 */
function buildStructureBreadcrumb(crumbs) {
    var bar = document.getElementById('breadcrumbBar');

    bar.innerHTML = '';

    crumbs.forEach(function(crumb, i) {
        var span = document.createElement('span');
        if (crumb.hash) {
            var a = document.createElement('a');
            a.href        = crumb.hash;
            a.className   = 'breadcrumb-link';
            a.textContent = crumb.label;
            span.appendChild(a);
        } else {
            span.className   = 'breadcrumb-current';
            span.textContent = crumb.label;
        }
        bar.appendChild(span);

        if (i < crumbs.length - 1) {
            var sep = document.createElement('span');
            sep.className   = 'breadcrumb-sep';
            sep.textContent = ' \u203a ';
            bar.appendChild(sep);
        }
    });

}

// ============================================================
// FROM PICTURE — LLM IDENTIFICATION FOR STRUCTURE THINGS
// Mirrors house.js houseHandleFromPicture() pattern.
// ============================================================

// Prompt for identifying a structure/yard thing from a photo
var STRUCTURE_THING_ID_PROMPT = [
    'You are identifying an item, tool, or object found in or around a yard structure (shed, garage, storage area, etc.).',
    'Analyze the provided image(s) and return ONLY a valid JSON object.',
    'No explanation, no markdown, no code blocks, no extra text of any kind.',
    'Your entire response must be parseable by JSON.parse().',
    '',
    'Return this exact structure:',
    '{',
    '  "name": "",',
    '  "description": "",',
    '  "worth": null,',
    '  "category": "",',
    '  "additionalMessage": ""',
    '}',
    '',
    'Field rules:',
    '- name: a concise descriptive name, e.g. "Honda Push Mower", "Leaf Blower", "Garden Hose Reel"',
    '- description: what it is, approximate age/condition if visible, notable features. 150 words or less.',
    '- worth: your best estimate of current used market value in USD as a plain number (e.g. 75), or null if unknown.',
    '- category: one of: appliance, auto, chemical, electronics, fixture, furniture, power-tools, tools, other',
    '- additionalMessage: use for issues such as unclear image or item not recognized. Leave "" if no issues.',
    '',
    'If you cannot identify the item at all, return name/description/category as "" and explain in additionalMessage.'
].join('\n');

// Pending LLM result while the review modal is open
var structureLlmPending = null;  // { parsed, images, structureId }

/**
 * Check whether an LLM is configured and show/hide the From Picture section.
 * Called each time the Add Thing modal opens.
 */
async function structureCheckLlmForModal() {
    var section = document.getElementById('structureThingFromPictureSection');
    if (!section) return;
    try {
        var doc = await userCol('settings').doc('llm').get();
        var ok  = doc.exists && doc.data().provider && doc.data().apiKey;
        section.classList.toggle('hidden', !ok);
    } catch (e) {
        section.classList.add('hidden');
    }
}

/**
 * Legacy handler: compress selected images from in-modal inputs, then send to LLM.
 * The gallery/camera buttons now open the staging flow instead.
 * @param {FileList} files  — selected image files
 */
async function structureThingHandleFromPicture(files) {
    if (!files || files.length === 0) return;

    var statusEl   = document.getElementById('structureThingPicStatus');
    var saveBtn    = document.getElementById('structureThingModalSaveBtn');
    var galleryBtn = document.getElementById('structureThingPicGalleryBtn');
    var cameraBtn  = document.getElementById('structureThingPicCameraBtn');

    statusEl.textContent = 'Identifying item\u2026';
    statusEl.classList.remove('hidden');
    saveBtn.disabled    = true;
    galleryBtn.disabled = true;
    cameraBtn.disabled  = true;

    try {
        var images = [];
        for (var i = 0; i < Math.min(files.length, 4); i++) {
            images.push(await compressImage(files[i]));
        }
        var modal       = document.getElementById('structureThingModal');
        var structureId = modal ? modal.dataset.structureId : null;
        await structureThingSendToLlm(images, structureId);
    } catch (err) {
        console.error('Structure thing ID error:', err);
        statusEl.textContent = 'Error: ' + err.message;
    } finally {
        saveBtn.disabled    = false;
        galleryBtn.disabled = false;
        cameraBtn.disabled  = false;
        var picInput = document.getElementById('structureThingPicInput');
        var camInput = document.getElementById('structureThingCamInput');
        if (picInput) picInput.value = '';
        if (camInput) camInput.value = '';
    }
}

/**
 * Send already-compressed base64 images to the LLM for structure thing identification.
 * Called from both the in-modal flow and the staging (+Photo) flow.
 * @param {string[]} images      - Array of base64 data URL strings (already compressed)
 * @param {string}   structureId - Parent structure ID for the new item
 */
async function structureThingSendToLlm(images, structureId) {
    var statusEl   = document.getElementById('structureThingPicStatus');
    var saveBtn    = document.getElementById('structureThingModalSaveBtn');
    var galleryBtn = document.getElementById('structureThingPicGalleryBtn');
    var cameraBtn  = document.getElementById('structureThingPicCameraBtn');
    var toggleEl   = document.getElementById('structureThingShowResponseToggle');
    var modalEl    = document.getElementById('structureThingModal');
    var modalOpen  = modalEl && modalEl.classList.contains('active');

    if (modalOpen && statusEl) {
        statusEl.textContent = 'Identifying item\u2026';
        statusEl.classList.remove('hidden');
        if (saveBtn)    saveBtn.disabled    = true;
        if (galleryBtn) galleryBtn.disabled = true;
        if (cameraBtn)  cameraBtn.disabled  = true;
    }

    try {
        // Load LLM config
        var cfgDoc = await userCol('settings').doc('llm').get();
        var cfg    = cfgDoc.exists ? cfgDoc.data() : null;
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

        // Build prompt — append personal comment if user filled it in
        var commentInput = document.getElementById('structureThingCommentInput');
        var comment      = commentInput ? commentInput.value.trim() : '';
        var prompt       = comment
            ? STRUCTURE_THING_ID_PROMPT + '\n\nAdditional context from the owner: ' + comment
            : STRUCTURE_THING_ID_PROMPT;

        // Build content: text prompt + already-compressed images
        var content = [{ type: 'text', text: prompt }];
        images.forEach(function(url) {
            content.push({ type: 'image_url', image_url: { url: url } });
        });

        var activeModel  = cfg.model || llm.model;
        var responseText = await chatCallOpenAICompat(llm, cfg.apiKey, content, activeModel);
        var parsed       = structureThingParseLlmResponse(responseText);

        if (modalOpen && toggleEl && toggleEl.checked) {
            structureLlmPending = { parsed: parsed, images: images, structureId: structureId };
            if (statusEl) { statusEl.textContent = ''; statusEl.classList.add('hidden'); }
            closeModal('structureThingModal');
            structureThingShowReviewModal(prompt, responseText, parsed);
        } else {
            if (!parsed.name && parsed.additionalMessage) {
                if (modalOpen && statusEl) {
                    statusEl.textContent = '\u26a0 ' + parsed.additionalMessage;
                } else {
                    alert('\u26a0 ' + parsed.additionalMessage);
                }
                return;
            }
            await structureThingLlmSaveFromLlm(parsed, images, structureId, '');
            if (modalOpen && statusEl) { statusEl.textContent = ''; statusEl.classList.add('hidden'); }
            closeModal('structureThingModal');
            if (structureId) loadStructureThings(structureId);
        }

    } catch (err) {
        console.error('Structure thing ID error:', err);
        if (modalOpen && statusEl) {
            statusEl.textContent = 'Error: ' + err.message;
        } else {
            alert('Error identifying item: ' + err.message);
        }
    } finally {
        if (modalOpen) {
            if (saveBtn)    saveBtn.disabled    = false;
            if (galleryBtn) galleryBtn.disabled = false;
            if (cameraBtn)  cameraBtn.disabled  = false;
            var picInput = document.getElementById('structureThingPicInput');
            var camInput = document.getElementById('structureThingCamInput');
            if (picInput) picInput.value = '';
            if (camInput) camInput.value = '';
        }
    }
}

/**
 * Parse the LLM JSON response, stripping accidental markdown fences.
 * @param {string} text  — raw LLM response
 */
function structureThingParseLlmResponse(text) {
    try {
        var clean = text.trim()
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/,      '')
            .replace(/```\s*$/,      '');
        return JSON.parse(clean);
    } catch (e) {
        return {
            name: '', description: '', worth: null, category: '',
            additionalMessage: 'Could not parse response: ' + text.substring(0, 120)
        };
    }
}

/**
 * Show the review modal with parsed result and debug details.
 * @param {string} prompt       — prompt sent to LLM
 * @param {string} rawResponse  — raw LLM response
 * @param {object} parsed       — parsed JSON from LLM
 */
function structureThingShowReviewModal(prompt, rawResponse, parsed) {
    document.getElementById('structureThingReviewPromptText').textContent   = prompt;
    document.getElementById('structureThingReviewResponseText').textContent = rawResponse;
    document.getElementById('structureThingReviewName').value               = parsed.name || '';
    document.getElementById('reviewStructureThingDescription').textContent  = parsed.description || '\u2014';
    document.getElementById('reviewStructureThingWorth').textContent        = parsed.worth ? ('$' + parsed.worth) : '\u2014';

    var msgEl = document.getElementById('structureThingReviewMessage');
    if (parsed.additionalMessage) {
        msgEl.textContent = '\u26a0 ' + parsed.additionalMessage;
        msgEl.classList.remove('hidden');
    } else {
        msgEl.classList.add('hidden');
    }

    openModal('structureThingLlmReviewModal');
}

/**
 * Create the structure thing doc and save photos from LLM result.
 * @param {object}   parsed       — parsed LLM JSON
 * @param {string[]} images       — compressed base64 data URLs
 * @param {string}   structureId  — parent structure ID
 * @param {string}   nameOverride — name entered in review modal (may be '')
 */
async function structureThingLlmSaveFromLlm(parsed, images, structureId, nameOverride) {
    var itemName = (nameOverride || parsed.name || 'Unknown Item').trim();
    var itemData = {
        name:        itemName,
        category:    parsed.category    || 'other',
        description: parsed.description || '',
        worth:       parsed.worth       || null,
        structureId: structureId,
        createdAt:   firebase.firestore.FieldValue.serverTimestamp()
    };

    var newRef = await userCol('structureThings').add(itemData);

    // Save photos when identification succeeded
    if (itemName && images.length > 0) {
        for (var i = 0; i < images.length; i++) {
            await userCol('photos').add({
                targetType : 'structurething',
                targetId   : newRef.id,
                imageData  : images[i],
                caption    : '',
                createdAt  : firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    }

    return newRef.id;
}

// ============================================================
// PAGE BUTTON WIRING
// All button click handlers for Structure pages.
// ============================================================

// ---- Structures list page ----

document.getElementById('structureAddBtn').addEventListener('click', function() {
    openAddStructureModal();
});

// ---- Structure modal ----

document.getElementById('structureModalSaveBtn').addEventListener('click', function() {
    handleStructureModalSave();
});

document.getElementById('structureModalCancelBtn').addEventListener('click', function() {
    closeModal('structureModal');
});

document.getElementById('structureModalDeleteBtn').addEventListener('click', function() {
    var modal = document.getElementById('structureModal');
    var id    = modal.dataset.editId;
    var name  = document.getElementById('structureNameInput').value || 'this structure';
    if (!id) return;
    closeModal('structureModal');
    deleteStructure(id, name);
});

// ---- Structure detail page buttons ----

// ---------- Quick-Add Structure Thing from Photo ----------

/**
 * Quick-add a structure thing from camera without showing the review modal.
 * Reads window.currentStructure for structureId.
 * @param {FileList} files
 * @param {string}   btnId   - button element ID to show loading state
 * @param {string}   inputId - file input element ID to reset after use
 */
/**
 * Quick-add a structure thing from the "+Photo" button on the structure detail page.
 * Opens the shared staging modal so the user can take up to 4 photos with crop,
 * then sends them all to the LLM at once. Saves directly without review.
 * @param {string} btnId   - button element ID (kept for signature compat)
 * @param {string} inputId - camera input ID (kept for compat)
 */
function structureQuickAddThingFromPhoto(btnId, inputId) {
    if (!window.currentStructure) { alert('No structure selected.'); return; }
    var structureId = window.currentStructure.id;
    openLlmPhotoStaging('Identify Structure Item', function(images) {
        _structureQuickSendToLlm(images, structureId, btnId, inputId);
    });
}

/**
 * Internal helper: send staged images to LLM and save directly (no review modal).
 * @param {string[]} images      - Already-compressed base64 data URLs
 * @param {string}   structureId - Parent structure ID
 * @param {string}   btnId       - button element ID to show loading state
 * @param {string}   inputId     - camera input ID to reset after use
 */
async function _structureQuickSendToLlm(images, structureId, btnId, inputId) {
    var btn = document.getElementById(btnId);
    var origText = btn ? btn.textContent : '+Photo';
    if (btn) { btn.textContent = 'Identifying\u2026'; btn.disabled = true; }

    try {
        // Load LLM config
        var cfgDoc = await userCol('settings').doc('llm').get();
        var cfg = cfgDoc.exists ? cfgDoc.data() : null;
        if (!cfg || !cfg.provider || !cfg.apiKey) { alert('No LLM configured. Go to Settings.'); return; }
        var llm = LLM_PROVIDERS[cfg.provider];
        if (!llm) { alert('Unknown LLM provider.'); return; }

        // Build content: THING_ID_PROMPT (from house.js) + already-compressed images
        var content = [{ type: 'text', text: THING_ID_PROMPT }];
        images.forEach(function(url) {
            content.push({ type: 'image_url', image_url: { url: url } });
        });
        var activeModel = cfg.model || llm.model;
        var responseText = await chatCallOpenAICompat(llm, cfg.apiKey, content, activeModel);
        var parsed = houseParseLlmResponse(responseText);

        if (!parsed.name && parsed.additionalMessage) {
            alert('Could not identify item: ' + parsed.additionalMessage);
            return;
        }
        if (!parsed.name) {
            alert('Could not identify item. Try a clearer photo.');
            return;
        }

        // Save to structureThings collection
        var itemData = {
            name:        parsed.name.trim(),
            category:    parsed.category    || 'other',
            description: parsed.description || '',
            worth:       parsed.worth       || null,
            structureId: structureId,
            createdAt:   firebase.firestore.FieldValue.serverTimestamp()
        };
        var newRef = await userCol('structureThings').add(itemData);

        // Save photos
        for (var j = 0; j < images.length; j++) {
            await userCol('photos').add({
                targetType : 'structurething',
                targetId   : newRef.id,
                imageData  : images[j],
                caption    : '',
                createdAt  : firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        loadStructureThings(structureId);

    } catch (err) {
        console.error('Quick structure thing photo error:', err);
        alert('Error: ' + err.message);
    } finally {
        if (btn) { btn.textContent = origText; btn.disabled = false; }
        var input = document.getElementById(inputId);
        if (input) input.value = '';
    }
}

document.getElementById('structureAddThingBtn').addEventListener('click', function() {
    if (window.currentStructure) {
        openAddStructureThingModal(window.currentStructure.id);
    }
});

// "+Photo" quick-add button for structure things — opens staging modal directly
document.getElementById('quickAddStructureThingPhotoBtn').addEventListener('click', function() {
    structureQuickAddThingFromPhoto('quickAddStructureThingPhotoBtn', 'quickStructureThingCamInput');
});
// Legacy camera input kept wired for any remaining direct trigger path
document.getElementById('quickStructureThingCamInput').addEventListener('change', function() {
    if (this.files && this.files.length > 0) {
        (async function(files) {
            var structureId = window.currentStructure ? window.currentStructure.id : null;
            var images = [];
            for (var i = 0; i < Math.min(files.length, 4); i++) {
                images.push(await compressImage(files[i]));
            }
            await structureThingSendToLlm(images, structureId);
        })(this.files);
    }
});

document.getElementById('structureLogActivityBtn').addEventListener('click', function() {
    if (window.currentStructure) openLogActivityModal('structure', window.currentStructure.id);
});

document.getElementById('structureCameraBtn').addEventListener('click', function() {
    if (window.currentStructure) triggerCameraUpload('structure', window.currentStructure.id);
});
document.getElementById('structureGalleryBtn').addEventListener('click', function() {
    if (window.currentStructure) triggerGalleryUpload('structure', window.currentStructure.id);
});

document.getElementById('structureAddProblemBtn').addEventListener('click', function() {
    if (window.currentStructure) openAddProblemModal('structure', window.currentStructure.id);
});

document.getElementById('structureAddFactBtn').addEventListener('click', function() {
    if (window.currentStructure) openAddFactModal('structure', window.currentStructure.id);
});

document.getElementById('structureAddProjectBtn').addEventListener('click', function() {
    if (window.currentStructure) openAddProjectModal('structure', window.currentStructure.id);
});

document.getElementById('structureAddCalendarEventBtn').addEventListener('click', function() {
    if (window.currentStructure && typeof openAddCalendarEventModal === 'function') {
        var reloadFn = function() {
            var months = parseInt(document.getElementById('structureCalendarRangeSelect').value, 10) || 3;
            loadEventsForTarget('structure', window.currentStructure.id,
                'structureCalendarEventsContainer', 'structureCalendarEventsEmpty', months);
        };
        openAddCalendarEventModal('structure', window.currentStructure.id, reloadFn);
    }
});

document.getElementById('structureCalendarRangeSelect').addEventListener('change', function() {
    if (window.currentStructure && typeof loadEventsForTarget === 'function') {
        var months = parseInt(this.value, 10) || 3;
        loadEventsForTarget('structure', window.currentStructure.id,
            'structureCalendarEventsContainer', 'structureCalendarEventsEmpty', months);
    }
});

// ---- Structure Thing modal buttons ----

document.getElementById('structureThingModalSaveBtn').addEventListener('click', function() {
    handleStructureThingModalSave();
});

document.getElementById('structureThingModalCancelBtn').addEventListener('click', function() {
    closeModal('structureThingModal');
});

// Structure Thing From Picture inputs — now open the staging modal
document.getElementById('structureThingPicGalleryBtn').addEventListener('click', function() {
    var modal       = document.getElementById('structureThingModal');
    var structureId = modal ? modal.dataset.structureId : null;
    openLlmPhotoStaging('Identify Structure Item', function(images) {
        structureThingSendToLlm(images, structureId);
    });
});
document.getElementById('structureThingPicCameraBtn').addEventListener('click', function() {
    var modal       = document.getElementById('structureThingModal');
    var structureId = modal ? modal.dataset.structureId : null;
    openLlmPhotoStaging('Identify Structure Item', function(images) {
        structureThingSendToLlm(images, structureId);
    });
});
// Legacy file inputs kept wired for any remaining direct trigger path
document.getElementById('structureThingPicInput').addEventListener('change', function() {
    if (this.files && this.files.length > 0) structureThingHandleFromPicture(this.files);
});
document.getElementById('structureThingCamInput').addEventListener('change', function() {
    if (this.files && this.files.length > 0) structureThingHandleFromPicture(this.files);
});

// ---- Structure Thing LLM Review modal buttons ----

document.getElementById('structureThingReviewAddBtn').addEventListener('click', async function() {
    if (!structureLlmPending) return;
    var btn          = this;
    var nameOverride = document.getElementById('structureThingReviewName').value.trim();
    btn.disabled     = true;
    btn.textContent  = 'Saving\u2026';
    try {
        var newId = await structureThingLlmSaveFromLlm(
            structureLlmPending.parsed,
            structureLlmPending.images,
            structureLlmPending.structureId,
            nameOverride
        );
        structureLlmPending = null;
        closeModal('structureThingLlmReviewModal');
        window.location.hash = '#structurething/' + newId;
    } catch (err) {
        console.error('Error saving structure thing from LLM:', err);
        alert('Error saving item. Please try again.');
        btn.disabled    = false;
        btn.textContent = 'Add It';
    }
});

document.getElementById('structureThingReviewCancelBtn').addEventListener('click', function() {
    structureLlmPending = null;
    closeModal('structureThingLlmReviewModal');
});

document.getElementById('structureThingLlmReviewModal').addEventListener('click', function(e) {
    if (e.target === this) {
        structureLlmPending = null;
        closeModal('structureThingLlmReviewModal');
    }
});

// ---- Structure Thing detail page buttons ----

document.getElementById('structureThingEditBtn').addEventListener('click', function() {
    if (window.currentStructureThing) {
        openEditStructureThingModal(window.currentStructureThing.id);
    }
});

document.getElementById('structureThingDeleteBtn').addEventListener('click', function() {
    if (window.currentStructureThing) {
        deleteStructureThing(window.currentStructureThing.id);
    }
});

document.getElementById('structureThingMoveBtn').addEventListener('click', function() {
    if (window.currentStructureThing && typeof openMoveModal === 'function') {
        openMoveModal('thing', window.currentStructureThing.id, 'structurething');
    }
});

document.getElementById('structureAddSubThingBtn').addEventListener('click', function() {
    if (window.currentStructureThing) {
        openAddStructureSubThingModal(window.currentStructureThing.id);
    }
});

document.getElementById('structureThingLogActivityBtn').addEventListener('click', function() {
    if (window.currentStructureThing) openLogActivityModal('structurething', window.currentStructureThing.id);
});

document.getElementById('structureThingCameraBtn').addEventListener('click', function() {
    if (window.currentStructureThing) triggerCameraUpload('structurething', window.currentStructureThing.id);
});
document.getElementById('structureThingGalleryBtn').addEventListener('click', function() {
    if (window.currentStructureThing) triggerGalleryUpload('structurething', window.currentStructureThing.id);
});

document.getElementById('structureThingAddProblemBtn').addEventListener('click', function() {
    if (window.currentStructureThing) openAddProblemModal('structurething', window.currentStructureThing.id);
});

document.getElementById('structureThingAddFactBtn').addEventListener('click', function() {
    if (window.currentStructureThing) openAddFactModal('structurething', window.currentStructureThing.id);
});

document.getElementById('structureThingAddProjectBtn').addEventListener('click', function() {
    if (window.currentStructureThing) openAddProjectModal('structurething', window.currentStructureThing.id);
});

document.getElementById('structureThingAddCalendarEventBtn').addEventListener('click', function() {
    if (window.currentStructureThing && typeof openAddCalendarEventModal === 'function') {
        var reloadFn = function() {
            var months = parseInt(document.getElementById('structureThingCalendarRangeSelect').value, 10) || 3;
            loadEventsForTarget('structurething', window.currentStructureThing.id,
                'structureThingCalendarEventsContainer', 'structureThingCalendarEventsEmpty', months);
        };
        openAddCalendarEventModal('structurething', window.currentStructureThing.id, reloadFn);
    }
});

document.getElementById('structureThingCalendarRangeSelect').addEventListener('change', function() {
    if (window.currentStructureThing && typeof loadEventsForTarget === 'function') {
        var months = parseInt(this.value, 10) || 3;
        loadEventsForTarget('structurething', window.currentStructureThing.id,
            'structureThingCalendarEventsContainer', 'structureThingCalendarEventsEmpty', months);
    }
});

// ---- Structure SubThing modal buttons ----

document.getElementById('structureSubThingModalSaveBtn').addEventListener('click', function() {
    handleStructureSubThingModalSave();
});

document.getElementById('structureSubThingModalCancelBtn').addEventListener('click', function() {
    closeModal('structureSubThingModal');
});

// ---- Structure SubThing detail page buttons ----

document.getElementById('structureSubThingEditBtn').addEventListener('click', function() {
    if (window.currentStructureSubThing) {
        openEditStructureSubThingModal(window.currentStructureSubThing.id);
    }
});

document.getElementById('structureSubThingDeleteBtn').addEventListener('click', function() {
    if (window.currentStructureSubThing) {
        deleteStructureSubThing(window.currentStructureSubThing.id);
    }
});

document.getElementById('structureSubThingMoveBtn').addEventListener('click', function() {
    if (window.currentStructureSubThing && typeof openMoveModal === 'function') {
        openMoveModal('subthing', window.currentStructureSubThing.id, 'structuresubthing');
    }
});

document.getElementById('structureSubThingLogActivityBtn').addEventListener('click', function() {
    if (window.currentStructureSubThing) openLogActivityModal('structuresubthing', window.currentStructureSubThing.id);
});

document.getElementById('structureSubThingCameraBtn').addEventListener('click', function() {
    if (window.currentStructureSubThing) triggerCameraUpload('structuresubthing', window.currentStructureSubThing.id);
});
document.getElementById('structureSubThingGalleryBtn').addEventListener('click', function() {
    if (window.currentStructureSubThing) triggerGalleryUpload('structuresubthing', window.currentStructureSubThing.id);
});

document.getElementById('structureSubThingAddProblemBtn').addEventListener('click', function() {
    if (window.currentStructureSubThing) openAddProblemModal('structuresubthing', window.currentStructureSubThing.id);
});

document.getElementById('structureSubThingAddFactBtn').addEventListener('click', function() {
    if (window.currentStructureSubThing) openAddFactModal('structuresubthing', window.currentStructureSubThing.id);
});

document.getElementById('structureSubThingAddProjectBtn').addEventListener('click', function() {
    if (window.currentStructureSubThing) openAddProjectModal('structuresubthing', window.currentStructureSubThing.id);
});

document.getElementById('structureSubThingAddCalendarEventBtn').addEventListener('click', function() {
    if (window.currentStructureSubThing && typeof openAddCalendarEventModal === 'function') {
        var reloadFn = function() {
            var months = parseInt(document.getElementById('structureSubThingCalendarRangeSelect').value, 10) || 3;
            loadEventsForTarget('structuresubthing', window.currentStructureSubThing.id,
                'structureSubThingCalendarEventsContainer', 'structureSubThingCalendarEventsEmpty', months);
        };
        openAddCalendarEventModal('structuresubthing', window.currentStructureSubThing.id, reloadFn);
    }
});

document.getElementById('structureSubThingCalendarRangeSelect').addEventListener('change', function() {
    if (window.currentStructureSubThing && typeof loadEventsForTarget === 'function') {
        var months = parseInt(this.value, 10) || 3;
        loadEventsForTarget('structuresubthing', window.currentStructureSubThing.id,
            'structureSubThingCalendarEventsContainer', 'structureSubThingCalendarEventsEmpty', months);
    }
});
