// ============================================================
// garage.js — Garage / Interior Feature
// Mirrors house.js patterns — 2 fixed rooms (Garage, Attic),
// each with Things and SubThings, plus all cross-entity sections.
//
// Routes:
//   #garage             → loadGaragePage()
//   #garageroom/:id     → loadGarageRoomPage(id)
//   #garagething/:id    → loadGarageThingPage(id)
//   #garagesubthing/:id → loadGarageSubThingPage(id)
//
// Firestore collections:
//   garageRooms    — { name, order, createdAt }
//   garageThings   — { name, roomId, category, description, purchaseDate, worth, notes, createdAt }
//   garageSubThings — { name, thingId, description, purchaseDate, worth, notes, createdAt }
// ============================================================

// ---- Global state ----
window.currentGarageRoom    = null;  // Garage room document currently being viewed
window.currentGarageThing   = null;  // Garage thing document currently being viewed
window.currentGarageSubThing = null; // Garage subthing document currently being viewed

// ---- Category helpers (same categories as House things) ----
var GARAGE_THING_CATEGORIES = {
    'furniture':     'Furniture',
    'appliance':     'Appliance',
    'ceiling-fan':   'Ceiling Fan',
    'ceiling-light': 'Ceiling Light',
    'electronics':   'Electronics',
    'other':         'Other'
};

// ============================================================
// GARAGE HOME PAGE  (#garage)
// Lists the 2 fixed rooms; auto-creates them on first visit.
// ============================================================

/**
 * Load and render the Garage home page.
 * Queries garageRooms ordered by 'order'. If the collection is
 * empty (first visit), auto-creates the default Garage and Attic rooms.
 */
function loadGaragePage() {
    var container = document.getElementById('garageRoomsList');
    container.innerHTML = '<p class="empty-state">Loading…</p>';

    // Breadcrumb: House › Garage
    var bar = document.getElementById('breadcrumbBar');
    if (bar) bar.innerHTML = '<a href="#house">House</a><span class="separator">&rsaquo;</span><span>Garage</span>';

    userCol('garageRooms').orderBy('order').get()
        .then(function(snapshot) {
            if (snapshot.empty) {
                // First visit — seed the two default rooms, then reload
                return seedGarageRooms().then(function() {
                    return userCol('garageRooms').orderBy('order').get();
                }).then(function(snap2) {
                    renderGarageRoomCards(snap2, container);
                });
            }
            renderGarageRoomCards(snapshot, container);
        })
        .catch(function(err) {
            console.error('loadGaragePage error:', err);
            container.innerHTML = '<p class="empty-state">Error loading garage data.</p>';
        });
}

/**
 * Create the 2 default rooms in Firestore on first visit.
 * Returns a Promise that resolves when both writes complete.
 */
function seedGarageRooms() {
    var ts = firebase.firestore.FieldValue.serverTimestamp();
    var batch = db.batch();

    var ref1 = userCol('garageRooms').doc();
    batch.set(ref1, { name: 'Garage', order: 1, createdAt: ts });

    var ref2 = userCol('garageRooms').doc();
    batch.set(ref2, { name: 'Attic',  order: 2, createdAt: ts });

    return batch.commit();
}

/**
 * Build and append a clickable card for each garage room.
 * @param {QuerySnapshot} snapshot
 * @param {Element}       container
 */
function renderGarageRoomCards(snapshot, container) {
    container.innerHTML = '';

    snapshot.forEach(function(doc) {
        var data = doc.data();
        var card = document.createElement('div');
        card.className = 'card card--clickable garage-room-card';

        card.innerHTML =
            '<div class="card-main">' +
                '<span class="card-title">' + escapeHtml(data.name || 'Room') + '</span>' +
            '</div>' +
            '<span class="card-arrow">›</span>';

        card.addEventListener('click', function() {
            window.location.hash = '#garageroom/' + doc.id;
        });

        container.appendChild(card);
    });
}

// ============================================================
// GARAGE ROOM PAGE  (#garageroom/:id)
// ============================================================

/**
 * Load the Garage room detail page.
 * Called by app.js when the route is #garageroom/{id}.
 * @param {string} roomId  — Firestore document ID in garageRooms
 */
function loadGarageRoomPage(roomId) {
    userCol('garageRooms').doc(roomId).get()
        .then(function(doc) {
            if (!doc.exists) {
                window.location.hash = '#garage';
                return;
            }
            window.currentGarageRoom = Object.assign({ id: doc.id }, doc.data());
            renderGarageRoomPage(window.currentGarageRoom);
            loadGarageThings(roomId);
        })
        .catch(function(err) { console.error('loadGarageRoomPage error:', err); });
}

/**
 * Render room header, breadcrumb, and all cross-entity sections.
 * @param {object} room  — { id, name, ... }
 */
function renderGarageRoomPage(room) {
    document.getElementById('garageRoomName').textContent = room.name || 'Room';

    // Breadcrumb: House › Garage › Room Name
    buildGarageBreadcrumb([
        { label: 'House',  hash: '#house' },
        { label: 'Garage', hash: '#garage' },
        { label: room.name || 'Room', hash: null }
    ]);

    // ---- Load all cross-entity feature sections ----
    loadPhotos(    'garageroom', room.id, 'garageRoomPhotosSection',           'garageRoomPhotosEmpty')
        .then(function() { _setPhotoAccCount('garageRoomPhotosAccCount', 'garageroom'); });
    loadActivities('garageroom', room.id, 'garageRoomActivitiesContainer',     'garageRoomActivitiesEmpty')
        .then(function() { _setDetailAccCount('garageRoomActivityAccCount', 'garageRoomActivitiesContainer'); });
    loadProblems(  'garageroom', room.id, 'garageRoomProblemsContainer',       'garageRoomProblemsEmpty')
        .then(function() { _setDetailAccCount('garageRoomProblemsAccCount', 'garageRoomProblemsContainer'); });
    loadFacts(     'garageroom', room.id, 'garageRoomFactsContainer',          'garageRoomFactsEmpty')
        .then(function() { _setDetailAccCount('garageRoomFactsAccCount', 'garageRoomFactsContainer'); });
    loadProjects(  'garageroom', room.id, 'garageRoomProjectsContainer',       'garageRoomProjectsEmpty')
        .then(function() { _setDetailAccCount('garageRoomTasksAccCount', 'garageRoomProjectsContainer'); });

    if (typeof loadEventsForTarget === 'function') {
        var months = parseInt(document.getElementById('garageRoomCalendarRangeSelect').value, 10) || 3;
        loadEventsForTarget('garageroom', room.id,
            'garageRoomCalendarEventsContainer', 'garageRoomCalendarEventsEmpty', months)
            .then(function() { _setDetailAccCount('garageRoomCalendarAccCount', 'garageRoomCalendarEventsContainer'); });
    }
}

// ============================================================
// RENAME ROOM MODAL
// ============================================================

/**
 * Open the rename-room modal, pre-filled with the current room name.
 */
function openRenameGarageRoomModal() {
    var modal = document.getElementById('garageRenameRoomModal');
    var input = document.getElementById('garageRenameRoomInput');

    input.value = (window.currentGarageRoom && window.currentGarageRoom.name) || '';
    openModal('garageRenameRoomModal');
    input.focus();
}

/**
 * Save the new room name to Firestore, then reload the room page.
 */
function handleRenameGarageRoomSave() {
    var input   = document.getElementById('garageRenameRoomInput');
    var nameVal = input.value.trim();

    if (!nameVal) { alert('Please enter a room name.'); return; }
    if (!window.currentGarageRoom) return;

    userCol('garageRooms').doc(window.currentGarageRoom.id).update({ name: nameVal })
        .then(function() {
            closeModal('garageRenameRoomModal');
            loadGarageRoomPage(window.currentGarageRoom.id);
        })
        .catch(function(err) {
            console.error('Rename garage room error:', err);
            alert('Error saving — please try again.');
        });
}

// ============================================================
// GARAGE THINGS LIST  (shown on the Room detail page)
// ============================================================

/**
 * Load and render the things list for a given garage room.
 * @param {string} roomId
 */
function loadGarageThings(roomId) {
    var container  = document.getElementById('garageThingsList');
    var emptyState = document.getElementById('garageThingsEmpty');

    container.innerHTML    = '';
    emptyState.textContent = 'Loading…';

    userCol('garageThings')
        .where('roomId', '==', roomId)
        .get()
        .then(function(snapshot) {
            emptyState.textContent = '';

            if (snapshot.empty) {
                emptyState.textContent = 'No things yet. Add furniture, appliances, or tools.';
                return;
            }

            // Sort client-side by createdAt (avoids composite index requirement)
            var docs = [];
            snapshot.forEach(function(doc) { docs.push(doc); });
            docs.sort(function(a, b) {
                var ta = a.data().createdAt ? a.data().createdAt.toMillis() : 0;
                var tb = b.data().createdAt ? b.data().createdAt.toMillis() : 0;
                return ta - tb;
            });

            docs.forEach(function(doc) {
                container.appendChild(buildGarageThingCard(doc.id, doc.data()));
            });
            _setDetailAccCount('garageRoomThingsAccCount', 'garageThingsList');
        })
        .catch(function(err) {
            console.error('loadGarageThings error:', err);
            emptyState.textContent = 'Error loading things.';
        });
}

/**
 * Build a clickable card for a garage thing.
 * @param {string} id    — Firestore document ID
 * @param {object} data  — Thing document data
 */
function buildGarageThingCard(id, data) {
    var card = document.createElement('div');
    card.className = 'card card--clickable';

    var label    = escapeHtml(data.name || 'Unnamed Thing');
    var catBadge = buildGarageThingCategoryBadge(data.category);

    card.innerHTML =
        '<div class="card-main">' +
            '<span class="card-title">' + label + '</span>' +
            catBadge +
        '</div>' +
        '<span class="card-arrow">›</span>';

    card.addEventListener('click', function() {
        window.location.hash = '#garagething/' + id;
    });

    return card;
}

/**
 * Return an HTML badge string for a garage thing category.
 * @param {string} category
 */
function buildGarageThingCategoryBadge(category) {
    if (!category) return '';
    var label = GARAGE_THING_CATEGORIES[category] || category;
    return '<span class="house-thing-cat-badge house-thing-cat-badge--' +
           escapeHtml(category) + '">' + escapeHtml(label) + '</span>';
}

// ============================================================
// GARAGE THING MODAL  (Add / Edit)
// ============================================================

/**
 * Open the Add Thing modal for a garage room.
 * @param {string} roomId  — parent garageRoom document ID
 */
function openAddGarageThingModal(roomId) {
    var modal = document.getElementById('garageThingModal');

    document.getElementById('garageThingModalTitle').textContent = 'Add Thing';
    document.getElementById('garageThingNameInput').value        = '';
    document.getElementById('garageThingCategorySelect').value   = 'other';
    document.getElementById('garageThingDescriptionInput').value = '';
    document.getElementById('garageThingPurchaseDateInput').value = '';
    document.getElementById('garageThingWorthInput').value       = '';
    document.getElementById('garageThingNotesInput').value       = '';

    modal.dataset.mode   = 'add';
    modal.dataset.editId = '';
    modal.dataset.roomId = roomId;

    buildContactPicker('gtBenePicker', { placeholder: 'Search contacts\u2026' });

    openModal('garageThingModal');
    document.getElementById('garageThingNameInput').focus();
}

/**
 * Open the Edit Thing modal, pre-filled with existing data.
 * @param {string} thingId  — garageThings document ID to edit
 */
function openEditGarageThingModal(thingId) {
    var modal = document.getElementById('garageThingModal');
    var thing = window.currentGarageThing;

    if (!thing || thing.id !== thingId) {
        // Fallback: load from Firestore if state is stale
        userCol('garageThings').doc(thingId).get()
            .then(function(doc) {
                if (doc.exists) {
                    window.currentGarageThing = Object.assign({ id: doc.id }, doc.data());
                    openEditGarageThingModal(thingId);
                }
            });
        return;
    }

    document.getElementById('garageThingModalTitle').textContent = 'Edit Thing';
    document.getElementById('garageThingNameInput').value        = thing.name         || '';
    document.getElementById('garageThingCategorySelect').value   = thing.category     || 'other';
    document.getElementById('garageThingDescriptionInput').value = thing.description  || '';
    document.getElementById('garageThingPurchaseDateInput').value = thing.purchaseDate || '';
    document.getElementById('garageThingWorthInput').value       = thing.worth        || '';
    document.getElementById('garageThingNotesInput').value       = thing.notes        || '';

    modal.dataset.mode   = 'edit';
    modal.dataset.editId = thingId;
    modal.dataset.roomId = thing.roomId || '';

    buildContactPicker('gtBenePicker', {
        placeholder: 'Search contacts\u2026',
        initialId:   thing.beneficiaryContactId || undefined,
        initialName: thing.beneficiaryName      || undefined
    });

    openModal('garageThingModal');
    document.getElementById('garageThingNameInput').focus();
}

/**
 * Save the garage thing (add or edit) from the modal.
 * Triggered by the Save button in garageThingModal.
 */
function handleGarageThingModalSave() {
    var modal   = document.getElementById('garageThingModal');
    var nameVal = document.getElementById('garageThingNameInput').value.trim();

    if (!nameVal) { alert('Please enter a name.'); return; }

    var mode   = modal.dataset.mode;
    var editId = modal.dataset.editId;
    var roomId = modal.dataset.roomId;

    var thingData = {
        name:                 nameVal,
        category:             document.getElementById('garageThingCategorySelect').value   || 'other',
        description:          document.getElementById('garageThingDescriptionInput').value.trim(),
        purchaseDate:         document.getElementById('garageThingPurchaseDateInput').value || null,
        worth:                document.getElementById('garageThingWorthInput').value.trim() || null,
        notes:                document.getElementById('garageThingNotesInput').value.trim(),
        beneficiaryContactId: document.getElementById('gtBenePicker_id').value || null
    };

    if (mode === 'edit' && editId) {
        userCol('garageThings').doc(editId).update(thingData)
            .then(function() {
                closeModal('garageThingModal');
                loadGarageThingPage(editId);
            })
            .catch(function(err) { console.error('Update garage thing error:', err); });
    } else {
        if (!roomId) { alert('No room selected.'); return; }
        thingData.roomId    = roomId;
        thingData.createdAt = firebase.firestore.FieldValue.serverTimestamp();

        userCol('garageThings').add(thingData)
            .then(function() {
                closeModal('garageThingModal');
                loadGarageThings(roomId);
            })
            .catch(function(err) { console.error('Add garage thing error:', err); });
    }
}

// ============================================================
// GARAGE THING DETAIL PAGE  (#garagething/:id)
// ============================================================

/**
 * Load the Garage thing detail page.
 * Called by app.js when the route is #garagething/{id}.
 * @param {string} thingId  — garageThings document ID
 */
function loadGarageThingPage(thingId) {
    userCol('garageThings').doc(thingId).get()
        .then(function(doc) {
            if (!doc.exists) {
                window.location.hash = '#garage';
                return;
            }
            window.currentGarageThing = Object.assign({ id: doc.id }, doc.data());

            // Load parent room for breadcrumb
            return userCol('garageRooms').doc(window.currentGarageThing.roomId).get()
                .then(function(roomDoc) {
                    window.currentGarageRoom = roomDoc.exists
                        ? Object.assign({ id: roomDoc.id }, roomDoc.data())
                        : { id: window.currentGarageThing.roomId, name: 'Room' };
                    renderGarageThingPage(window.currentGarageThing, window.currentGarageRoom);
                    loadGarageSubThings(thingId);
                });
        })
        .catch(function(err) { console.error('loadGarageThingPage error:', err); });
}

/**
 * Render thing header, info card, breadcrumb, and all cross-entity sections.
 * @param {object} thing  — { id, name, category, ... }
 * @param {object} room   — { id, name }
 */
function renderGarageThingPage(thing, room) {
    document.getElementById('garageThingName').textContent = thing.name || 'Thing';

    var catLabel = GARAGE_THING_CATEGORIES[thing.category] || thing.category || '';
    document.getElementById('garageThingMeta').textContent =
        (room.name || 'Garage') + (catLabel ? ' · ' + catLabel : '');

    // Breadcrumb: House › Garage › Room Name › Thing Name
    buildGarageBreadcrumb([
        { label: 'House',            hash: '#house' },
        { label: 'Garage',           hash: '#garage' },
        { label: room.name || 'Room', hash: '#garageroom/' + room.id },
        { label: thing.name || 'Thing', hash: null }
    ]);

    // Render inventory details card (description, purchaseDate, worth, notes)
    renderGarageInventoryDetails(thing, 'garageThingDetailsSection');
    _renderBeneficiaryRow('gtGoesToRow', thing, []);

    // ---- Load all cross-entity feature sections ----
    loadPhotos(    'garagething', thing.id, 'garageThingPhotosSection',           'garageThingPhotosEmpty')
        .then(function() { _setPhotoAccCount('garageThingPhotosAccCount', 'garagething'); });
    loadActivities('garagething', thing.id, 'garageThingActivitiesContainer',     'garageThingActivitiesEmpty')
        .then(function() { _setDetailAccCount('garageThingActivityAccCount', 'garageThingActivitiesContainer'); });
    loadProblems(  'garagething', thing.id, 'garageThingProblemsContainer',       'garageThingProblemsEmpty')
        .then(function() { _setDetailAccCount('garageThingProblemsAccCount', 'garageThingProblemsContainer'); });
    loadFacts(     'garagething', thing.id, 'garageThingFactsContainer',          'garageThingFactsEmpty')
        .then(function() { _setDetailAccCount('garageThingFactsAccCount', 'garageThingFactsContainer'); });
    loadProjects(  'garagething', thing.id, 'garageThingProjectsContainer',       'garageThingProjectsEmpty')
        .then(function() { _setDetailAccCount('garageThingTasksAccCount', 'garageThingProjectsContainer'); });

    if (typeof loadEventsForTarget === 'function') {
        var months = parseInt(document.getElementById('garageThingCalendarRangeSelect').value, 10) || 3;
        loadEventsForTarget('garagething', thing.id,
            'garageThingCalendarEventsContainer', 'garageThingCalendarEventsEmpty', months)
            .then(function() { _setDetailAccCount('garageThingCalendarAccCount', 'garageThingCalendarEventsContainer'); });
    }
}

// ============================================================
// GARAGE SUBTHING LIST  (shown on Thing detail page)
// ============================================================

/**
 * Load and render the subthings list for a given garage thing.
 * @param {string} thingId
 */
function loadGarageSubThings(thingId) {
    var container  = document.getElementById('garageSubThingsList');
    var emptyState = document.getElementById('garageSubThingsEmpty');

    container.innerHTML    = '';
    emptyState.textContent = 'Loading…';

    userCol('garageSubThings')
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
                container.appendChild(buildGarageSubThingCard(doc.id, doc.data()));
            });
            _setDetailAccCount('garageThingSubItemsAccCount', 'garageSubThingsList');
        })
        .catch(function(err) {
            console.error('loadGarageSubThings error:', err);
            emptyState.textContent = 'Error loading sub-items.';
        });
}

/**
 * Build a clickable card for a garage subthing.
 * @param {string} id    — Firestore document ID
 * @param {object} data  — SubThing document data
 */
function buildGarageSubThingCard(id, data) {
    var card = document.createElement('div');
    card.className = 'card card--clickable';

    card.innerHTML =
        '<div class="card-main">' +
            '<span class="card-title">' + escapeHtml(data.name || 'Unnamed Item') + '</span>' +
        '</div>' +
        '<span class="card-arrow">›</span>';

    card.addEventListener('click', function() {
        window.location.hash = '#garagesubthing/' + id;
    });

    return card;
}

// ============================================================
// GARAGE SUBTHING MODAL  (Add / Edit)
// ============================================================

/**
 * Open the Add SubThing modal for a garage thing.
 * @param {string} thingId  — parent garageThing document ID
 */
function openAddGarageSubThingModal(thingId) {
    var modal = document.getElementById('garageSubThingModal');

    document.getElementById('garageSubThingModalTitle').textContent  = 'Add Sub-Item';
    document.getElementById('garageSubThingNameInput').value         = '';
    document.getElementById('garageSubThingDescriptionInput').value  = '';
    document.getElementById('garageSubThingPurchaseDateInput').value = '';
    document.getElementById('garageSubThingWorthInput').value        = '';
    document.getElementById('garageSubThingNotesInput').value        = '';

    modal.dataset.mode    = 'add';
    modal.dataset.editId  = '';
    modal.dataset.thingId = thingId;

    buildContactPicker('gstBenePicker', { placeholder: 'Search contacts\u2026' });

    openModal('garageSubThingModal');
    document.getElementById('garageSubThingNameInput').focus();
}

/**
 * Open the Edit SubThing modal, pre-filled with existing data.
 * @param {string} subThingId  — garageSubThings document ID to edit
 */
function openEditGarageSubThingModal(subThingId) {
    var modal    = document.getElementById('garageSubThingModal');
    var subThing = window.currentGarageSubThing;

    if (!subThing || subThing.id !== subThingId) {
        // Fallback: load from Firestore if state is stale
        userCol('garageSubThings').doc(subThingId).get()
            .then(function(doc) {
                if (doc.exists) {
                    window.currentGarageSubThing = Object.assign({ id: doc.id }, doc.data());
                    openEditGarageSubThingModal(subThingId);
                }
            });
        return;
    }

    document.getElementById('garageSubThingModalTitle').textContent  = 'Edit Sub-Item';
    document.getElementById('garageSubThingNameInput').value         = subThing.name         || '';
    document.getElementById('garageSubThingDescriptionInput').value  = subThing.description  || '';
    document.getElementById('garageSubThingPurchaseDateInput').value = subThing.purchaseDate || '';
    document.getElementById('garageSubThingWorthInput').value        = subThing.worth        || '';
    document.getElementById('garageSubThingNotesInput').value        = subThing.notes        || '';

    modal.dataset.mode    = 'edit';
    modal.dataset.editId  = subThingId;
    modal.dataset.thingId = subThing.thingId || '';

    buildContactPicker('gstBenePicker', {
        placeholder: 'Search contacts\u2026',
        initialId:   subThing.beneficiaryContactId || undefined,
        initialName: subThing.beneficiaryName      || undefined
    });

    openModal('garageSubThingModal');
    document.getElementById('garageSubThingNameInput').focus();
}

/**
 * Save the garage subthing (add or edit) from the modal.
 * Triggered by the Save button in garageSubThingModal.
 */
function handleGarageSubThingModalSave() {
    var modal   = document.getElementById('garageSubThingModal');
    var nameVal = document.getElementById('garageSubThingNameInput').value.trim();

    if (!nameVal) { alert('Please enter a name.'); return; }

    var mode    = modal.dataset.mode;
    var editId  = modal.dataset.editId;
    var thingId = modal.dataset.thingId;

    var itemData = {
        name:                 nameVal,
        description:          document.getElementById('garageSubThingDescriptionInput').value.trim(),
        purchaseDate:         document.getElementById('garageSubThingPurchaseDateInput').value || null,
        worth:                document.getElementById('garageSubThingWorthInput').value.trim() || null,
        notes:                document.getElementById('garageSubThingNotesInput').value.trim(),
        beneficiaryContactId: document.getElementById('gstBenePicker_id').value || null
    };

    if (mode === 'edit' && editId) {
        userCol('garageSubThings').doc(editId).update(itemData)
            .then(function() {
                closeModal('garageSubThingModal');
                loadGarageSubThingPage(editId);
            })
            .catch(function(err) { console.error('Update garage subthing error:', err); });
    } else {
        if (!thingId) { alert('No parent thing selected.'); return; }
        itemData.thingId   = thingId;
        itemData.createdAt = firebase.firestore.FieldValue.serverTimestamp();

        userCol('garageSubThings').add(itemData)
            .then(function() {
                closeModal('garageSubThingModal');
                loadGarageSubThings(thingId);
            })
            .catch(function(err) { console.error('Add garage subthing error:', err); });
    }
}

// ============================================================
// GARAGE SUBTHING DETAIL PAGE  (#garagesubthing/:id)
// ============================================================

/**
 * Load the Garage subthing detail page.
 * Called by app.js when the route is #garagesubthing/{id}.
 * @param {string} subThingId  — garageSubThings document ID
 */
function loadGarageSubThingPage(subThingId) {
    userCol('garageSubThings').doc(subThingId).get()
        .then(function(doc) {
            if (!doc.exists) {
                window.location.hash = '#garage';
                return;
            }
            window.currentGarageSubThing = Object.assign({ id: doc.id }, doc.data());

            // Load parent thing, then parent room for breadcrumb
            return userCol('garageThings').doc(window.currentGarageSubThing.thingId).get()
                .then(function(thingDoc) {
                    window.currentGarageThing = thingDoc.exists
                        ? Object.assign({ id: thingDoc.id }, thingDoc.data())
                        : { id: window.currentGarageSubThing.thingId, name: 'Thing', roomId: null };

                    var roomId = window.currentGarageThing.roomId;
                    if (!roomId) {
                        window.currentGarageRoom = { id: '', name: 'Room' };
                        renderGarageSubThingPage(
                            window.currentGarageSubThing,
                            window.currentGarageThing,
                            window.currentGarageRoom
                        );
                        return;
                    }

                    return userCol('garageRooms').doc(roomId).get()
                        .then(function(roomDoc) {
                            window.currentGarageRoom = roomDoc.exists
                                ? Object.assign({ id: roomDoc.id }, roomDoc.data())
                                : { id: roomId, name: 'Room' };
                            renderGarageSubThingPage(
                                window.currentGarageSubThing,
                                window.currentGarageThing,
                                window.currentGarageRoom
                            );
                        });
                });
        })
        .catch(function(err) { console.error('loadGarageSubThingPage error:', err); });
}

/**
 * Render subthing header, info card, breadcrumb, and all cross-entity sections.
 * @param {object} subThing  — { id, name, ... }
 * @param {object} thing     — { id, name }
 * @param {object} room      — { id, name }
 */
function renderGarageSubThingPage(subThing, thing, room) {
    document.getElementById('garageSubThingName').textContent = subThing.name || 'Item';
    document.getElementById('garageSubThingMeta').textContent =
        (room.name || 'Garage') + ' › ' + (thing.name || 'Thing');

    // Breadcrumb: House › Garage › Room Name › Thing Name › Item Name
    buildGarageBreadcrumb([
        { label: 'House',               hash: '#house' },
        { label: 'Garage',              hash: '#garage' },
        { label: room.name  || 'Room',  hash: room.id  ? '#garageroom/'  + room.id  : null },
        { label: thing.name || 'Thing', hash: thing.id ? '#garagething/' + thing.id : null },
        { label: subThing.name || 'Item', hash: null }
    ]);

    // Render inventory details card
    renderGarageInventoryDetails(subThing, 'garageSubThingDetailsSection');
    _renderBeneficiaryRow('gstGoesToRow', subThing, [
        { entity: thing, label: thing.name || 'Thing' }
    ]);

    // ---- Load all cross-entity feature sections ----
    loadPhotos(    'garagesubthing', subThing.id, 'garageSubThingPhotosSection',       'garageSubThingPhotosEmpty')
        .then(function() { _setPhotoAccCount('garageSubThingPhotosAccCount', 'garagesubthing'); });
    loadActivities('garagesubthing', subThing.id, 'garageSubThingActivitiesContainer', 'garageSubThingActivitiesEmpty')
        .then(function() { _setDetailAccCount('garageSubThingActivityAccCount', 'garageSubThingActivitiesContainer'); });
    loadProblems(  'garagesubthing', subThing.id, 'garageSubThingProblemsContainer',   'garageSubThingProblemsEmpty')
        .then(function() { _setDetailAccCount('garageSubThingProblemsAccCount', 'garageSubThingProblemsContainer'); });
    loadFacts(     'garagesubthing', subThing.id, 'garageSubThingFactsContainer',      'garageSubThingFactsEmpty')
        .then(function() { _setDetailAccCount('garageSubThingFactsAccCount', 'garageSubThingFactsContainer'); });
    loadProjects(  'garagesubthing', subThing.id, 'garageSubThingProjectsContainer',   'garageSubThingProjectsEmpty')
        .then(function() { _setDetailAccCount('garageSubThingTasksAccCount', 'garageSubThingProjectsContainer'); });

    if (typeof loadEventsForTarget === 'function') {
        var months = parseInt(document.getElementById('garageSubThingCalendarRangeSelect').value, 10) || 3;
        loadEventsForTarget('garagesubthing', subThing.id,
            'garageSubThingCalendarEventsContainer', 'garageSubThingCalendarEventsEmpty', months)
            .then(function() { _setDetailAccCount('garageSubThingCalendarAccCount', 'garageSubThingCalendarEventsContainer'); });
    }
}

// ============================================================
// DELETE HANDLERS
// ============================================================

/**
 * Delete a garage thing after confirmation.
 * Navigates back to the parent room page on success.
 * @param {string} id  — garageThings document ID
 */
function deleteGarageThing(id) {
    var thing = window.currentGarageThing;
    var name  = (thing && thing.name) ? thing.name : 'this thing';

    if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;

    userCol('garageThings').doc(id).delete()
        .then(function() {
            if (window.currentGarageRoom && window.currentGarageRoom.id) {
                window.location.hash = '#garageroom/' + window.currentGarageRoom.id;
            } else {
                window.location.hash = '#garage';
            }
        })
        .catch(function(err) { console.error('Delete garage thing error:', err); });
}

/**
 * Delete a garage subthing after confirmation.
 * Navigates back to the parent thing page on success.
 * @param {string} id  — garageSubThings document ID
 */
function deleteGarageSubThing(id) {
    var subThing = window.currentGarageSubThing;
    var name     = (subThing && subThing.name) ? subThing.name : 'this item';

    if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;

    userCol('garageSubThings').doc(id).delete()
        .then(function() {
            if (window.currentGarageThing && window.currentGarageThing.id) {
                window.location.hash = '#garagething/' + window.currentGarageThing.id;
            } else {
                window.location.hash = '#garage';
            }
        })
        .catch(function(err) { console.error('Delete garage subthing error:', err); });
}

// ============================================================
// INVENTORY DETAILS RENDERER
// Renders purchaseDate, worth, description, notes as a card.
// Mirrors house.js renderInventoryDetails() for consistency.
// ============================================================

/**
 * Render garage thing/subthing inventory details as a card.
 * Hides the section entirely when no data is present.
 * @param {object} data      — Thing or SubThing document data
 * @param {string} sectionId — Element ID of the details section
 */
function renderGarageInventoryDetails(data, sectionId) {
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
// BREADCRUMB / HEADER HELPER
// Mirrors buildHouseBreadcrumb() from house.js.
// ============================================================

/**
 * Build the breadcrumb bar and sticky header for Garage pages.
 * @param {Array} crumbs  — [{ label, hash }] — hash null = current page (no link)
 */
function buildGarageBreadcrumb(crumbs) {
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
            sep.textContent = ' › ';
            bar.appendChild(sep);
        }
    });

}

// ============================================================
// PAGE BUTTON WIRING
// All button click handlers for Garage pages.
// ============================================================

// ---- Garage Room page buttons ----

document.getElementById('garageRoomRenameBtn').addEventListener('click', function() {
    openRenameGarageRoomModal();
});

document.getElementById('garageRenameRoomSaveBtn').addEventListener('click', function() {
    handleRenameGarageRoomSave();
});

document.getElementById('garageRenameRoomCancelBtn').addEventListener('click', function() {
    closeModal('garageRenameRoomModal');
});

// ---------- Quick-Add Garage Thing from Photo ----------

/**
 * Quick-add a garage thing from camera without showing the review modal.
 * Reads window.currentGarageRoom for roomId.
 * @param {FileList} files
 * @param {string}   btnId   - button element ID to show loading state
 * @param {string}   inputId - file input element ID to reset after use
 */
async function garageQuickAddThingFromPhoto(files, btnId, inputId) {
    if (!files || files.length === 0) return;
    var btn = document.getElementById(btnId);
    var origText = btn ? btn.textContent : '+Photo';
    if (btn) { btn.textContent = 'Identifying\u2026'; btn.disabled = true; }

    try {
        // Compress images (up to 4)
        var images = [];
        for (var i = 0; i < Math.min(files.length, 4); i++) {
            images.push(await compressImage(files[i]));
        }

        // Load LLM config
        var cfgDoc = await userCol('settings').doc('llm').get();
        var cfg = cfgDoc.exists ? cfgDoc.data() : null;
        if (!cfg || !cfg.provider || !cfg.apiKey) { alert('No LLM configured. Go to Settings.'); return; }
        var llm = LLM_PROVIDERS[cfg.provider];
        if (!llm) { alert('Unknown LLM provider.'); return; }

        // Build content: prompt + images
        var content = [{ type: 'text', text: THING_ID_PROMPT }];
        images.forEach(function(url) {
            content.push({ type: 'image_url', image_url: { url: url } });
        });
        var activeModel = cfg.model || llm.model;
        var responseText = await chatCallOpenAICompat(llm, cfg.apiKey, content, activeModel);
        // houseParseLlmResponse is globally accessible (defined in house.js, loaded before garage.js)
        var parsed = houseParseLlmResponse(responseText);

        if (!parsed.name && parsed.additionalMessage) {
            alert('Could not identify item: ' + parsed.additionalMessage);
            return;
        }
        if (!parsed.name) {
            alert('Could not identify item. Try a clearer photo.');
            return;
        }

        if (!window.currentGarageRoom) { alert('No garage room selected.'); return; }
        var roomId = window.currentGarageRoom.id;

        // Save to garageThings collection
        var thingData = {
            name:        parsed.name.trim(),
            description: parsed.description || '',
            worth:       parsed.worth       || null,
            notes:       '',
            category:    parsed.category    || 'other',
            roomId:      roomId,
            createdAt:   firebase.firestore.FieldValue.serverTimestamp()
        };
        var newRef = await userCol('garageThings').add(thingData);

        // Save photos
        for (var j = 0; j < images.length; j++) {
            await userCol('photos').add({
                targetType : 'garagething',
                targetId   : newRef.id,
                imageData  : images[j],
                caption    : '',
                createdAt  : firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        loadGarageThings(roomId);

    } catch (err) {
        console.error('Quick garage thing photo error:', err);
        alert('Error: ' + err.message);
    } finally {
        if (btn) { btn.textContent = origText; btn.disabled = false; }
        var input = document.getElementById(inputId);
        if (input) input.value = '';
    }
}

document.getElementById('garageAddThingBtn').addEventListener('click', function() {
    if (window.currentGarageRoom) {
        openAddGarageThingModal(window.currentGarageRoom.id);
    }
});

// "+Photo" quick-add button for garage things
document.getElementById('quickAddGarageThingPhotoBtn').addEventListener('click', function() {
    document.getElementById('quickGarageThingCamInput').click();
});
document.getElementById('quickGarageThingCamInput').addEventListener('change', function() {
    if (this.files && this.files.length > 0) {
        garageQuickAddThingFromPhoto(this.files, 'quickAddGarageThingPhotoBtn', 'quickGarageThingCamInput');
    }
});

document.getElementById('garageRoomLogActivityBtn').addEventListener('click', function() {
    if (window.currentGarageRoom) openLogActivityModal('garageroom', window.currentGarageRoom.id);
});

document.getElementById('garageRoomCameraBtn').addEventListener('click', function() {
    if (window.currentGarageRoom) triggerCameraUpload('garageroom', window.currentGarageRoom.id);
});
document.getElementById('garageRoomGalleryBtn').addEventListener('click', function() {
    if (window.currentGarageRoom) triggerGalleryUpload('garageroom', window.currentGarageRoom.id);
});

document.getElementById('garageRoomAddProblemBtn').addEventListener('click', function() {
    if (window.currentGarageRoom) openAddProblemModal('garageroom', window.currentGarageRoom.id);
});

document.getElementById('garageRoomAddFactBtn').addEventListener('click', function() {
    if (window.currentGarageRoom) openAddFactModal('garageroom', window.currentGarageRoom.id);
});

document.getElementById('garageRoomAddProjectBtn').addEventListener('click', function() {
    if (window.currentGarageRoom) openAddProjectModal('garageroom', window.currentGarageRoom.id);
});

document.getElementById('garageRoomAddCalendarEventBtn').addEventListener('click', function() {
    if (window.currentGarageRoom && typeof openAddCalendarEventModal === 'function') {
        var reloadFn = function() {
            var months = parseInt(document.getElementById('garageRoomCalendarRangeSelect').value, 10) || 3;
            loadEventsForTarget('garageroom', window.currentGarageRoom.id,
                'garageRoomCalendarEventsContainer', 'garageRoomCalendarEventsEmpty', months);
        };
        openAddCalendarEventModal('garageroom', window.currentGarageRoom.id, reloadFn);
    }
});

document.getElementById('garageRoomCalendarRangeSelect').addEventListener('change', function() {
    if (window.currentGarageRoom && typeof loadEventsForTarget === 'function') {
        var months = parseInt(this.value, 10) || 3;
        loadEventsForTarget('garageroom', window.currentGarageRoom.id,
            'garageRoomCalendarEventsContainer', 'garageRoomCalendarEventsEmpty', months);
    }
});

// ---- Garage Thing modal buttons ----

document.getElementById('garageThingModalSaveBtn').addEventListener('click', function() {
    handleGarageThingModalSave();
});

document.getElementById('garageThingModalCancelBtn').addEventListener('click', function() {
    closeModal('garageThingModal');
});

// ---- Garage Thing detail page buttons ----

document.getElementById('garageThingEditBtn').addEventListener('click', function() {
    if (window.currentGarageThing) {
        openEditGarageThingModal(window.currentGarageThing.id);
    }
});

document.getElementById('garageThingDeleteBtn').addEventListener('click', function() {
    if (window.currentGarageThing) {
        deleteGarageThing(window.currentGarageThing.id);
    }
});

document.getElementById('garageAddSubThingBtn').addEventListener('click', function() {
    if (window.currentGarageThing) {
        openAddGarageSubThingModal(window.currentGarageThing.id);
    }
});

document.getElementById('garageThingLogActivityBtn').addEventListener('click', function() {
    if (window.currentGarageThing) openLogActivityModal('garagething', window.currentGarageThing.id);
});

document.getElementById('garageThingCameraBtn').addEventListener('click', function() {
    if (window.currentGarageThing) triggerCameraUpload('garagething', window.currentGarageThing.id);
});
document.getElementById('garageThingGalleryBtn').addEventListener('click', function() {
    if (window.currentGarageThing) triggerGalleryUpload('garagething', window.currentGarageThing.id);
});

document.getElementById('garageThingAddProblemBtn').addEventListener('click', function() {
    if (window.currentGarageThing) openAddProblemModal('garagething', window.currentGarageThing.id);
});

document.getElementById('garageThingAddFactBtn').addEventListener('click', function() {
    if (window.currentGarageThing) openAddFactModal('garagething', window.currentGarageThing.id);
});

document.getElementById('garageThingAddProjectBtn').addEventListener('click', function() {
    if (window.currentGarageThing) openAddProjectModal('garagething', window.currentGarageThing.id);
});

document.getElementById('garageThingAddCalendarEventBtn').addEventListener('click', function() {
    if (window.currentGarageThing && typeof openAddCalendarEventModal === 'function') {
        var reloadFn = function() {
            var months = parseInt(document.getElementById('garageThingCalendarRangeSelect').value, 10) || 3;
            loadEventsForTarget('garagething', window.currentGarageThing.id,
                'garageThingCalendarEventsContainer', 'garageThingCalendarEventsEmpty', months);
        };
        openAddCalendarEventModal('garagething', window.currentGarageThing.id, reloadFn);
    }
});

document.getElementById('garageThingCalendarRangeSelect').addEventListener('change', function() {
    if (window.currentGarageThing && typeof loadEventsForTarget === 'function') {
        var months = parseInt(this.value, 10) || 3;
        loadEventsForTarget('garagething', window.currentGarageThing.id,
            'garageThingCalendarEventsContainer', 'garageThingCalendarEventsEmpty', months);
    }
});

// ---- Garage SubThing modal buttons ----

document.getElementById('garageSubThingModalSaveBtn').addEventListener('click', function() {
    handleGarageSubThingModalSave();
});

document.getElementById('garageSubThingModalCancelBtn').addEventListener('click', function() {
    closeModal('garageSubThingModal');
});

// ---- Garage SubThing detail page buttons ----

document.getElementById('garageSubThingEditBtn').addEventListener('click', function() {
    if (window.currentGarageSubThing) {
        openEditGarageSubThingModal(window.currentGarageSubThing.id);
    }
});

document.getElementById('garageSubThingDeleteBtn').addEventListener('click', function() {
    if (window.currentGarageSubThing) {
        deleteGarageSubThing(window.currentGarageSubThing.id);
    }
});

document.getElementById('garageSubThingLogActivityBtn').addEventListener('click', function() {
    if (window.currentGarageSubThing) openLogActivityModal('garagesubthing', window.currentGarageSubThing.id);
});

document.getElementById('garageSubThingCameraBtn').addEventListener('click', function() {
    if (window.currentGarageSubThing) triggerCameraUpload('garagesubthing', window.currentGarageSubThing.id);
});
document.getElementById('garageSubThingGalleryBtn').addEventListener('click', function() {
    if (window.currentGarageSubThing) triggerGalleryUpload('garagesubthing', window.currentGarageSubThing.id);
});

document.getElementById('garageSubThingAddProblemBtn').addEventListener('click', function() {
    if (window.currentGarageSubThing) openAddProblemModal('garagesubthing', window.currentGarageSubThing.id);
});

document.getElementById('garageSubThingAddFactBtn').addEventListener('click', function() {
    if (window.currentGarageSubThing) openAddFactModal('garagesubthing', window.currentGarageSubThing.id);
});

document.getElementById('garageSubThingAddProjectBtn').addEventListener('click', function() {
    if (window.currentGarageSubThing) openAddProjectModal('garagesubthing', window.currentGarageSubThing.id);
});

document.getElementById('garageSubThingAddCalendarEventBtn').addEventListener('click', function() {
    if (window.currentGarageSubThing && typeof openAddCalendarEventModal === 'function') {
        var reloadFn = function() {
            var months = parseInt(document.getElementById('garageSubThingCalendarRangeSelect').value, 10) || 3;
            loadEventsForTarget('garagesubthing', window.currentGarageSubThing.id,
                'garageSubThingCalendarEventsContainer', 'garageSubThingCalendarEventsEmpty', months);
        };
        openAddCalendarEventModal('garagesubthing', window.currentGarageSubThing.id, reloadFn);
    }
});

document.getElementById('garageSubThingCalendarRangeSelect').addEventListener('change', function() {
    if (window.currentGarageSubThing && typeof loadEventsForTarget === 'function') {
        var months = parseInt(this.value, 10) || 3;
        loadEventsForTarget('garagesubthing', window.currentGarageSubThing.id,
            'garageSubThingCalendarEventsContainer', 'garageSubThingCalendarEventsEmpty', months);
    }
});

// ---- Move buttons (wired to shared moveThings.js modal) ----

document.getElementById('garageThingMoveBtn').addEventListener('click', function() {
    if (window.currentGarageThing && typeof openMoveModal === 'function') {
        openMoveModal('thing', window.currentGarageThing.id, 'garagething');
    }
});

document.getElementById('garageSubThingMoveBtn').addEventListener('click', function() {
    if (window.currentGarageSubThing && typeof openMoveModal === 'function') {
        openMoveModal('subthing', window.currentGarageSubThing.id, 'garagesubthing');
    }
});
