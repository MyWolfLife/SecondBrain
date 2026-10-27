// ============================================================
// People.js — Personal contacts / relationship tracker
// Track people you know with contact info, family members,
// important dates, photos, facts, and a running interaction log.
// Firestore collections: people, peopleImportantDates,
//                        peopleInteractions, peopleCategories
// ============================================================

// ---------- State ----------
var currentPerson     = null;   // Person currently being viewed
var _pplVoiceRecog    = null;   // SpeechRecognition instance for interactions
var _pplVoiceActive   = false;

// ---------- Default categories (merged with any user-added ones) ----------
var PEOPLE_DEFAULT_CATEGORIES = [
    'Family', 'Friend', 'Neighbor', 'Coworker', 'Acquaintance'
];

// ============================================================
// PEOPLE LIST PAGE  (#people)
// ============================================================

/**
 * Load and render the full people list.
 * Shows only top-level people (parentPersonId == null).
 */
async function loadPeoplePage() {
    // Set breadcrumb in sticky header (showPage clears it for top-level pages,
    // so we re-set it here to show the Life context path).
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML = '<a href="#life">Life</a><span class="separator">&rsaquo;</span><span>People</span>';

    var container  = document.getElementById('peopleListContainer');
    var emptyState = document.getElementById('peopleListEmpty');
    container.innerHTML = '';
    emptyState.style.display = 'none';

    await _populatePeopleFilterSelect();

    try {
        var snap = await pplCol('people')
            .where('parentPersonId', '==', null)
            .get();

        var docs = [];
        snap.forEach(function(doc) {
            docs.push(Object.assign({ id: doc.id }, doc.data()));
        });

        // Sort A-Z by name
        docs.sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });

        // Apply category filter
        var filterVal = (document.getElementById('peopleCategoryFilter').value || '').trim();
        if (filterVal) {
            docs = docs.filter(function(p) { return p.category === filterVal; });
        }

        // Apply search filter
        var searchVal = (document.getElementById('peopleSearchInput').value || '').toLowerCase().trim();
        if (searchVal) {
            docs = docs.filter(function(p) {
                return (p.name     || '').toLowerCase().includes(searchVal) ||
                       (p.nickname || '').toLowerCase().includes(searchVal);
            });
        }

        if (docs.length === 0) {
            emptyState.textContent = snap.empty
                ? 'No people yet. Press + Add Person to get started.'
                : 'No people match the current filter.';
            emptyState.style.display = 'block';
            return;
        }

        // Fetch last interaction date for each person in one pass
        var intSnap = await pplCol('peopleInteractions').get();
        var lastIntMap = {};
        intSnap.forEach(function(doc) {
            var d = doc.data();
            if (!lastIntMap[d.personId] || d.date > lastIntMap[d.personId]) {
                lastIntMap[d.personId] = d.date;
            }
        });

        docs.forEach(function(person) {
            container.appendChild(buildPersonCard(person, lastIntMap[person.id] || null));
        });

    } catch (err) {
        console.error('loadPeoplePage error:', err);
        emptyState.textContent = 'Error loading people.';
        emptyState.style.display = 'block';
    }
}

/** Populate the category filter dropdown on the people list page. */
async function _populatePeopleFilterSelect() {
    var sel     = document.getElementById('peopleCategoryFilter');
    var current = sel.value;
    sel.innerHTML = '<option value="">All Categories</option>';
    var cats = await _loadCategoryList();
    cats.forEach(function(c) {
        var opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        if (c === current) opt.selected = true;
        sel.appendChild(opt);
    });
}

/**
 * Build a clickable person card for the list.
 * @param {Object} person - Person data
 * @param {string|null} lastInteraction - Date string of most recent interaction
 */
function buildPersonCard(person, lastInteraction) {
    var card = document.createElement('div');
    card.className = 'card card--clickable person-card';

    var avatarHtml = _buildAvatarHtml(person, 'person-avatar');

    var categoryBadge = person.category
        ? '<span class="person-category-badge">' + escapeHtml(person.category) + '</span>'
        : '';

    var nickHtml = person.nickname
        ? '<span class="person-nickname">"' + escapeHtml(person.nickname) + '"</span>'
        : '';

    var lastIntHtml = lastInteraction
        ? '<span class="person-last-interaction">Last: ' + escapeHtml(lastInteraction) + '</span>'
        : '<span class="person-last-interaction person-last-interaction--none">No interactions yet</span>';

    card.innerHTML =
        avatarHtml +
        '<div class="card-main person-card-info">' +
            '<div class="person-card-name-row">' +
                '<span class="card-title">' + escapeHtml(person.name || 'Unnamed') + '</span>' +
                nickHtml + categoryBadge +
            '</div>' +
            lastIntHtml +
        '</div>' +
        '<span class="card-arrow">›</span>';

    card.addEventListener('click', function() {
        window.location.hash = '#person/' + person.id;
    });
    return card;
}

/** Build avatar HTML (photo or initials placeholder). */
function _buildAvatarHtml(person, cssClass) {
    if (person.profilePhotoData) {
        return '<img class="' + cssClass + '" src="' + person.profilePhotoData + '" alt="">';
    }
    var initials = (person.name || '?')
        .split(' ').map(function(w) { return w[0] || ''; }).slice(0, 2).join('').toUpperCase();
    return '<div class="' + cssClass + ' person-avatar--initials">' + escapeHtml(initials) + '</div>';
}

// ============================================================
// PERSON DETAIL PAGE  (#person/{id})
// ============================================================

/**
 * Load the person detail page.
 * Called by app.js when route is #person/{id}.
 */
async function loadPersonDetail(personId) {
    currentPerson = null;

    try {
        var doc = await pplCol('people').doc(personId).get();
        if (!doc.exists) { window.location.hash = '#people'; return; }
        currentPerson = window.currentPerson = Object.assign({ id: doc.id }, doc.data());

        // Load parent for breadcrumb (sub-people only)
        var parentPerson = null;
        if (currentPerson.parentPersonId) {
            var pDoc = await pplCol('people').doc(currentPerson.parentPersonId).get();
            if (pDoc.exists) parentPerson = Object.assign({ id: pDoc.id }, pDoc.data());
        }

        renderPersonDetail(currentPerson, parentPerson);

    } catch (err) { console.error('loadPersonDetail error:', err); }
}

/**
 * Render the person detail page from loaded data.
 * @param {Object} person
 * @param {Object|null} parentPerson - Set when this is a sub-person
 */
function renderPersonDetail(person, parentPerson) {
    // Breadcrumb (written to the sticky header bar)
    var crumb = document.getElementById('breadcrumbBar');
    if (parentPerson) {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#people">People</a><span class="separator">&rsaquo;</span>' +
            '<a href="#person/' + parentPerson.id + '">' + escapeHtml(parentPerson.name || 'Person') + '</a><span class="separator">&rsaquo;</span>' +
            '<span>' + escapeHtml(person.name || '') + '</span>';
    } else {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#people">People</a><span class="separator">&rsaquo;</span>' +
            '<span>' + escapeHtml(person.name || '') + '</span>';
    }

    // Avatar
    document.getElementById('personDetailAvatar').innerHTML =
        _buildAvatarHtml(person, 'person-detail-avatar');

    // Name / nickname / category
    document.getElementById('personDetailName').textContent     = person.name || '';
    document.getElementById('personDetailNickname').textContent = person.nickname ? '"' + person.nickname + '"' : '';
    var catEl = document.getElementById('personDetailCategory');
    catEl.textContent  = person.category || '';
    catEl.style.display = person.category ? '' : 'none';

    // Contact info
    var rows = '';
    if (person.phone)       rows += _contactRow('Phone',    '<a href="tel:' + escapeHtml(person.phone) + '">' + escapeHtml(person.phone) + '</a>');
    if (person.email)       rows += _contactRow('Email',    '<a href="mailto:' + escapeHtml(person.email) + '">' + escapeHtml(person.email) + '</a>');
    if (person.address)     rows += _contactRow('Address',  '<a href="https://maps.google.com/?q=' + encodeURIComponent(person.address) + '" target="_blank" rel="noopener">' + escapeHtml(person.address) + '</a>');
    if (person.facebookUrl) rows += _contactRow('Facebook', '<a href="' + escapeHtml(person.facebookUrl) + '" target="_blank" rel="noopener">View Profile ↗</a>');
    if (person.howKnown)    rows += _contactRow('How known', escapeHtml(person.howKnown));
    if (person.notes)       rows += _contactRow('Notes',    escapeHtml(person.notes));
    document.getElementById('personContactInfo').innerHTML = rows || '<p class="empty-state" style="margin:0">No contact info yet.</p>';

    // Family members section — only visible for main (non-sub) people
    var subSection = document.getElementById('personSubPeopleSection');
    if (subSection) subSection.style.display = person.parentPersonId ? 'none' : '';

    // Wire edit button
    document.getElementById('personEditBtn').onclick = function() { openEditPersonModal(person); };

    // Load all sub-sections
    if (!person.parentPersonId) loadSubPeople(person.id);
    loadImportantDates(person.id);
    loadPhotos('person', person.id, 'personPhotoContainer', 'personPhotoEmptyState');
    loadFacts('person',  person.id, 'personFactsContainer',  'personFactsEmptyState');
    loadSharedEvents(person.id);
    loadInteractions(person.id);
}

function _contactRow(label, valueHtml) {
    return '<div class="person-contact-row">' +
               '<span class="person-contact-label">' + escapeHtml(label) + '</span>' +
               '<span class="person-contact-value">' + valueHtml + '</span>' +
           '</div>';
}

// ============================================================
// LC-12: Shared Events section on Person detail page
// ============================================================

/**
 * Load life events this person is tagged on and render the Shared Events section.
 * Queries lifeEvents where peopleIds array-contains the person's ID.
 * @param {string} personId
 */
async function loadSharedEvents(personId) {
    var container = document.getElementById('personSharedEventsContainer');
    var emptyEl   = document.getElementById('personSharedEventsEmpty');
    if (!container || !emptyEl) return;

    try {
        var [eventsSnap, catSnap] = await Promise.all([
            userCol('lifeEvents').where('peopleIds', 'array-contains', personId).get(),
            userCol('lifeCategories').get()
        ]);

        // Build category color map
        var colorMap = {};
        catSnap.forEach(function(doc) { colorMap[doc.id] = doc.data().color || ''; });

        // Collect events and sort newest-first by startDate
        var events = [];
        eventsSnap.forEach(function(doc) { events.push({ id: doc.id, ...doc.data() }); });
        events.sort(function(a, b) {
            var aDate = a.startDate || '';
            var bDate = b.startDate || '';
            return aDate < bDate ? 1 : aDate > bDate ? -1 : 0;
        });

        if (events.length === 0) {
            container.innerHTML = '';
            emptyEl.style.display = '';
            return;
        }

        emptyEl.style.display = 'none';
        container.innerHTML = events.map(function(ev) {
            var color     = colorMap[ev.categoryId] || 'linear-gradient(135deg,#6b7280,#9ca3af)';
            // _lcFormatDateRange and _lcStatusLabel are globals from lifecalendar.js
            var dates     = typeof _lcFormatDateRange === 'function'
                                ? _lcFormatDateRange(ev.startDate, ev.endDate)
                                : (ev.startDate || '');
            var statusLbl = typeof _lcStatusLabel === 'function'
                                ? _lcStatusLabel(ev.status)
                                : (ev.status || 'Upcoming');
            var statusCls = 'lc-status-badge--' + (ev.status || 'upcoming');
            var location  = ev.location
                ? '<span class="lc-event-card-location">' + escapeHtml(ev.location) + '</span>'
                : '';

            return '<div class="lc-shared-event-item" data-id="' + escapeHtml(ev.id) + '" role="button" tabindex="0">' +
                       '<div class="lc-shared-event-bar" style="background:' + color + '"></div>' +
                       '<div class="lc-event-card-body">' +
                           '<div class="lc-event-card-title">' + escapeHtml(ev.title || '') + '</div>' +
                           '<div class="lc-event-card-meta">' +
                               '<span class="lc-event-card-dates">' + escapeHtml(dates) + '</span>' +
                               location +
                               '<span class="lc-status-badge ' + statusCls + '">' + escapeHtml(statusLbl) + '</span>' +
                           '</div>' +
                       '</div>' +
                   '</div>';
        }).join('');

        // Wire click handlers
        container.querySelectorAll('.lc-shared-event-item').forEach(function(item) {
            item.addEventListener('click', function() {
                window.location.hash = '#life-event/' + this.dataset.id;
            });
            item.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    window.location.hash = '#life-event/' + this.dataset.id;
                }
            });
        });

    } catch (err) {
        console.error('loadSharedEvents error:', err);
        container.innerHTML = '<p style="color:var(--danger);font-size:0.88rem;">Failed to load shared events.</p>';
    }
}

// ============================================================
// PROFILE PHOTO
// ============================================================

/**
 * Handle profile photo file selection.
 * Compresses and saves as profilePhotoData on the person doc.
 */
async function _handleProfilePhotoUpload(file) {
    if (!currentPerson) return;
    try {
        var compressed = await compressImage(file, 400, 400, 0.75);
        await pplCol('people').doc(currentPerson.id).update({ profilePhotoData: compressed });
        currentPerson.profilePhotoData = compressed;
        document.getElementById('personDetailAvatar').innerHTML =
            _buildAvatarHtml(currentPerson, 'person-detail-avatar');
    } catch (err) {
        console.error('Profile photo error:', err);
        alert('Error saving profile photo.');
    }
}

// ============================================================
// CATEGORIES
// ============================================================

/** Load merged default + user-added categories. */
async function _loadCategoryList() {
    var snap = await userCol('peopleCategories').get();
    var custom = [];
    snap.forEach(function(doc) { custom.push(doc.data().name); });
    var all = PEOPLE_DEFAULT_CATEGORIES.slice();
    custom.forEach(function(c) { if (all.indexOf(c) === -1) all.push(c); });
    all.sort();
    return all;
}

/**
 * Populate a category <select> element.
 * Appends "Add new category..." as the last option.
 */
async function _populateCategorySelect(selectId, selectedValue) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    var cats = await _loadCategoryList();
    sel.innerHTML = '<option value="">— Select category —</option>';
    cats.forEach(function(c) {
        var opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        if (c === selectedValue) opt.selected = true;
        sel.appendChild(opt);
    });
    var addOpt = document.createElement('option');
    addOpt.value = '__add_new__';
    addOpt.textContent = '+ Add new category...';
    sel.appendChild(addOpt);
}

// ============================================================
// PERSON CRUD  (Add / Edit modal)
// ============================================================

async function openAddPersonModal(parentPersonId) {
    document.getElementById('personModalTitle').textContent = parentPersonId ? 'Add Family Member' : 'Add Person';
    document.getElementById('personNameInput').value       = '';
    document.getElementById('personNicknameInput').value   = '';
    document.getElementById('personHowKnownInput').value   = '';
    document.getElementById('personPhoneInput').value      = '';
    document.getElementById('personEmailInput').value      = '';
    document.getElementById('personAddressInput').value    = '';
    document.getElementById('personFacebookInput').value   = '';
    document.getElementById('personNotesInput').value      = '';
    document.getElementById('personModalDeleteBtn').style.display  = 'none';
    document.getElementById('personCategoryNewGroup').style.display = 'none';
    document.getElementById('personCategoryNewInput').value = '';

    var modal = document.getElementById('personModal');
    modal.dataset.mode           = 'add';
    modal.dataset.editId         = '';
    modal.dataset.parentPersonId = parentPersonId || '';

    await _populateCategorySelect('personCategorySelect', '');
    openModal('personModal');
    document.getElementById('personNameInput').focus();
}

async function openEditPersonModal(person) {
    document.getElementById('personModalTitle').textContent = person.parentPersonId ? 'Edit Family Member' : 'Edit Person';
    document.getElementById('personNameInput').value       = person.name        || '';
    document.getElementById('personNicknameInput').value   = person.nickname    || '';
    document.getElementById('personHowKnownInput').value   = person.howKnown    || '';
    document.getElementById('personPhoneInput').value      = person.phone       || '';
    document.getElementById('personEmailInput').value      = person.email       || '';
    document.getElementById('personAddressInput').value    = person.address     || '';
    document.getElementById('personFacebookInput').value   = person.facebookUrl || '';
    document.getElementById('personNotesInput').value      = person.notes       || '';
    document.getElementById('personModalDeleteBtn').style.display  = '';
    document.getElementById('personCategoryNewGroup').style.display = 'none';
    document.getElementById('personCategoryNewInput').value = '';

    var modal = document.getElementById('personModal');
    modal.dataset.mode           = 'edit';
    modal.dataset.editId         = person.id;
    modal.dataset.parentPersonId = person.parentPersonId || '';

    await _populateCategorySelect('personCategorySelect', person.category || '');
    openModal('personModal');
}

async function handlePersonModalSave() {
    var name = document.getElementById('personNameInput').value.trim();
    if (!name) { alert('Name is required.'); return; }

    // Resolve category — handle "add new" case
    var catSel = document.getElementById('personCategorySelect').value;
    var catNew = document.getElementById('personCategoryNewInput').value.trim();
    var category = '';
    if (catSel === '__add_new__') {
        category = catNew;
        if (category) {
            var ex = await userCol('peopleCategories').where('name', '==', category).get();
            if (ex.empty) {
                await userCol('peopleCategories').add({
                    name: category,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
    } else {
        category = catSel;
    }

    var data = {
        name:        name,
        nickname:    document.getElementById('personNicknameInput').value.trim(),
        howKnown:    document.getElementById('personHowKnownInput').value.trim(),
        phone:       formatPhoneNumber(document.getElementById('personPhoneInput').value.trim()),
        email:       document.getElementById('personEmailInput').value.trim(),
        address:     document.getElementById('personAddressInput').value.trim(),
        facebookUrl: document.getElementById('personFacebookInput').value.trim(),
        notes:       document.getElementById('personNotesInput').value.trim(),
        category:    category,
    };

    var modal          = document.getElementById('personModal');
    var mode           = modal.dataset.mode;
    var editId         = modal.dataset.editId;
    var parentPersonId = modal.dataset.parentPersonId || null;

    try {
        if (mode === 'add') {
            data.parentPersonId = parentPersonId;
            data.profilePhotoData = null;
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await pplCol('people').add(data);
            closeModal('personModal');
            if (parentPersonId) {
                loadSubPeople(parentPersonId);
            } else {
                loadPeoplePage();
            }
        } else {
            await pplCol('people').doc(editId).update(data);
            closeModal('personModal');
            Object.assign(currentPerson, data);
            // Reload parent to rebuild breadcrumb correctly if sub-person
            loadPersonDetail(editId);
        }
    } catch (err) {
        console.error('handlePersonModalSave error:', err);
        alert('Error saving person.');
    }
}

async function handleDeletePerson(id) {
    if (!confirm('Delete this person? Their interactions and important dates will also be deleted.')) return;

    var parentId = currentPerson ? currentPerson.parentPersonId : null;
    closeModal('personModal');

    try {
        var batch = db.batch();

        // Delete interactions
        var intSnap = await pplCol('peopleInteractions').where('personId', '==', id).get();
        intSnap.forEach(function(d) { batch.delete(d.ref); });

        // Delete important dates
        var dateSnap = await pplCol('peopleImportantDates').where('personId', '==', id).get();
        dateSnap.forEach(function(d) { batch.delete(d.ref); });

        // Delete sub-people if main person (and their interactions/dates)
        var subSnap = await pplCol('people').where('parentPersonId', '==', id).get();
        for (var i = 0; i < subSnap.docs.length; i++) {
            var subId = subSnap.docs[i].id;
            var sInt = await pplCol('peopleInteractions').where('personId', '==', subId).get();
            sInt.forEach(function(d) { batch.delete(d.ref); });
            var sDates = await pplCol('peopleImportantDates').where('personId', '==', subId).get();
            sDates.forEach(function(d) { batch.delete(d.ref); });
            batch.delete(subSnap.docs[i].ref);
        }

        batch.delete(cxRef('people', id));
        await batch.commit();

        // Navigate back
        if (parentId) {
            window.location.hash = '#person/' + parentId;
        } else {
            window.location.hash = '#people';
        }

    } catch (err) {
        console.error('handleDeletePerson error:', err);
        alert('Error deleting person.');
    }
}

// ============================================================
// SUB-PEOPLE  (family members on person detail page)
// ============================================================

async function loadSubPeople(parentId) {
    var container  = document.getElementById('subPeopleContainer');
    var emptyState = document.getElementById('subPeopleEmpty');
    container.innerHTML = '';

    try {
        var snap = await pplCol('people').where('parentPersonId', '==', parentId).get();

        if (snap.empty) {
            emptyState.textContent = 'No family members added yet.';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        var docs = [];
        snap.forEach(function(doc) { docs.push(Object.assign({ id: doc.id }, doc.data())); });
        docs.sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
        docs.forEach(function(p) { container.appendChild(buildSubPersonCard(p)); });

    } catch (err) { console.error('loadSubPeople error:', err); }
}

function buildSubPersonCard(person) {
    var card = document.createElement('div');
    card.className = 'card card--clickable person-card';

    var avatarHtml = _buildAvatarHtml(person, 'person-avatar');
    var catBadge   = person.category
        ? '<span class="person-category-badge">' + escapeHtml(person.category) + '</span>' : '';
    var nickHtml   = person.nickname
        ? ' <span class="person-nickname">"' + escapeHtml(person.nickname) + '"</span>' : '';

    card.innerHTML =
        avatarHtml +
        '<div class="card-main person-card-info">' +
            '<div class="person-card-name-row">' +
                '<span class="card-title">' + escapeHtml(person.name || 'Unnamed') + '</span>' +
                nickHtml + catBadge +
            '</div>' +
        '</div>' +
        '<span class="card-arrow">›</span>';

    card.addEventListener('click', function() { window.location.hash = '#person/' + person.id; });
    return card;
}

// ============================================================
// IMPORTANT DATES
// ============================================================

async function loadImportantDates(personId) {
    var container  = document.getElementById('importantDatesContainer');
    var emptyState = document.getElementById('importantDatesEmpty');
    container.innerHTML = '';

    try {
        var snap = await pplCol('peopleImportantDates').where('personId', '==', personId).get();
        if (snap.empty) {
            emptyState.textContent  = 'No important dates yet.';
            emptyState.style.display = 'block';
            return;
        }
        emptyState.style.display = 'none';
        var dates = [];
        snap.forEach(function(doc) { dates.push(Object.assign({ id: doc.id }, doc.data())); });
        dates.sort(function(a, b) { return (a.label || '').localeCompare(b.label || ''); });
        dates.forEach(function(d) { container.appendChild(buildImportantDateItem(d, personId)); });

    } catch (err) { console.error('loadImportantDates error:', err); }
}

function buildImportantDateItem(d, personId) {
    var item = document.createElement('div');
    item.className = 'important-date-item';
    item.title     = 'Click to edit';

    var annualIcon = d.recurrence === 'annual'
        ? ' <span title="Repeats every year — shown on calendar">📅</span>' : '';

    item.innerHTML =
        '<div class="important-date-left">' +
            '<span class="important-date-label">' + escapeHtml(d.label || '') + annualIcon + '</span>' +
            '<span class="important-date-value">'  + escapeHtml(formatImportantDate(d)) + '</span>' +
        '</div>' +
        '<span class="problem-arrow">›</span>';

    item.addEventListener('click', function() { openEditImportantDateModal(d, personId); });
    return item;
}

function openAddImportantDateModal(personId) {
    var modal = document.getElementById('importantDateModal');
    document.getElementById('importantDateModalTitle').textContent = 'Add Important Date';
    document.getElementById('importantDateLabelInput').value  = '';
    document.getElementById('importantDateMonth').value       = '';
    document.getElementById('importantDateDay').value         = '';
    document.getElementById('importantDateYear').value        = '';
    document.getElementById('importantDateRecurrence').value  = 'once';
    document.getElementById('importantDateDeleteBtn').style.display = 'none';
    modal.dataset.mode     = 'add';
    modal.dataset.editId   = '';
    modal.dataset.personId = personId;
    openModal('importantDateModal');
    document.getElementById('importantDateLabelInput').focus();
}

function openEditImportantDateModal(d, personId) {
    var modal = document.getElementById('importantDateModal');
    document.getElementById('importantDateModalTitle').textContent = 'Edit Important Date';
    document.getElementById('importantDateLabelInput').value  = d.label      || '';
    document.getElementById('importantDateMonth').value       = d.month      || '';
    document.getElementById('importantDateDay').value         = d.day        || '';
    document.getElementById('importantDateYear').value        = d.year       || '';
    document.getElementById('importantDateRecurrence').value  = d.recurrence || 'once';
    document.getElementById('importantDateDeleteBtn').style.display = '';
    modal.dataset.mode     = 'edit';
    modal.dataset.editId   = d.id;
    modal.dataset.personId = personId;
    openModal('importantDateModal');
}

async function handleImportantDateSave() {
    var modal      = document.getElementById('importantDateModal');
    var label      = document.getElementById('importantDateLabelInput').value.trim();
    var month      = parseInt(document.getElementById('importantDateMonth').value) || 0;
    var day        = parseInt(document.getElementById('importantDateDay').value)   || 0;
    var yearVal    = document.getElementById('importantDateYear').value.trim();
    var year       = yearVal ? parseInt(yearVal) : null;
    var recurrence = document.getElementById('importantDateRecurrence').value || 'once';
    var personId   = modal.dataset.personId;

    if (!label)        { alert('Please enter a label.');          return; }
    if (!month || !day){ alert('Please enter at least month and day.'); return; }

    var data = { personId: personId, label: label, month: month, day: day, year: year, recurrence: recurrence };

    try {
        if (modal.dataset.mode === 'add') {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await pplCol('peopleImportantDates').add(data);
        } else {
            await pplCol('peopleImportantDates').doc(modal.dataset.editId).update({
                label: label, month: month, day: day, year: year, recurrence: recurrence
            });
        }
        closeModal('importantDateModal');
        loadImportantDates(personId);
    } catch (err) {
        console.error('handleImportantDateSave error:', err);
        alert('Error saving date.');
    }
}

async function handleDeleteImportantDate() {
    var modal    = document.getElementById('importantDateModal');
    var id       = modal.dataset.editId;
    var personId = modal.dataset.personId;
    if (!confirm('Delete this important date?')) return;
    closeModal('importantDateModal');
    try {
        await pplCol('peopleImportantDates').doc(id).delete();
        loadImportantDates(personId);
    } catch (err) { console.error('handleDeleteImportantDate error:', err); }
}

// ============================================================
// INTERACTIONS
// ============================================================

async function loadInteractions(personId) {
    var container  = document.getElementById('personInteractionsContainer');
    var emptyState = document.getElementById('personInteractionsEmpty');
    container.innerHTML = '';

    try {
        var snap = await pplCol('peopleInteractions').where('personId', '==', personId).get();
        if (snap.empty) {
            emptyState.textContent  = 'No interactions logged yet.';
            emptyState.style.display = 'block';
            return;
        }
        emptyState.style.display = 'none';
        var items = [];
        snap.forEach(function(doc) { items.push(Object.assign({ id: doc.id }, doc.data())); });
        items.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
        items.forEach(function(item) { container.appendChild(buildInteractionItem(item, personId)); });

    } catch (err) { console.error('loadInteractions error:', err); }
}

function buildInteractionItem(item, personId) {
    var el = document.createElement('div');
    el.className = 'interaction-item';
    el.title     = 'Click to edit';

    var sourceTag = item.sourceType === 'journal'
        ? '<span class="interaction-source-tag">Journal</span>' : '';

    el.innerHTML =
        '<div class="interaction-left">' +
            '<div class="interaction-top-row">' +
                '<span class="interaction-date">' + escapeHtml(item.date || '') + '</span>' +
                sourceTag +
            '</div>' +
            '<div class="interaction-text">' + escapeHtml(item.text || '') + '</div>' +
        '</div>' +
        '<span class="problem-arrow">›</span>';

    el.addEventListener('click', function() { openEditInteractionModal(item, personId); });
    return el;
}

function openAddInteractionModal(personId) {
    var modal = document.getElementById('interactionModal');
    document.getElementById('interactionModalTitle').textContent = 'Log Interaction';
    document.getElementById('interactionDateInput').value  = new Date().toISOString().split('T')[0];
    document.getElementById('interactionTextInput').value  = '';
    document.getElementById('interactionDeleteBtn').style.display = 'none';
    modal.dataset.mode     = 'add';
    modal.dataset.editId   = '';
    modal.dataset.personId = personId;
    openModal('interactionModal');
    document.getElementById('interactionTextInput').focus();
}

function openEditInteractionModal(item, personId) {
    var modal = document.getElementById('interactionModal');
    document.getElementById('interactionModalTitle').textContent = 'Edit Interaction';
    document.getElementById('interactionDateInput').value = item.date || '';
    document.getElementById('interactionTextInput').value = item.text || '';
    // Journal-sourced interactions are read-only for now (Phase 5 will handle full editing)
    document.getElementById('interactionDeleteBtn').style.display =
        item.sourceType === 'journal' ? 'none' : '';
    modal.dataset.mode     = 'edit';
    modal.dataset.editId   = item.id;
    modal.dataset.personId = personId;
    openModal('interactionModal');
}

async function handleInteractionSave() {
    var modal    = document.getElementById('interactionModal');
    var date     = document.getElementById('interactionDateInput').value;
    var text     = document.getElementById('interactionTextInput').value.trim();
    var personId = modal.dataset.personId;

    if (!text) { alert('Please enter some text.'); return; }

    try {
        if (modal.dataset.mode === 'add') {
            await pplCol('peopleInteractions').add({
                personId:   personId,
                date:       date || new Date().toISOString().split('T')[0],
                text:       text,
                sourceType: 'direct',
                createdAt:  firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            await pplCol('peopleInteractions').doc(modal.dataset.editId).update({ date: date, text: text });
        }
        closeModal('interactionModal');
        _pplStopVoice();
        loadInteractions(personId);
    } catch (err) {
        console.error('handleInteractionSave error:', err);
        alert('Error saving interaction.');
    }
}

async function handleDeleteInteraction() {
    var modal    = document.getElementById('interactionModal');
    var id       = modal.dataset.editId;
    var personId = modal.dataset.personId;
    if (!confirm('Delete this interaction?')) return;
    closeModal('interactionModal');
    try {
        await pplCol('peopleInteractions').doc(id).delete();
        loadInteractions(personId);
    } catch (err) { console.error('handleDeleteInteraction error:', err); }
}

// ============================================================
// VOICE TO TEXT  (interaction entry — same pattern as journal)
// ============================================================

function _pplInitVoice() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    _pplVoiceRecog = new SR();
    _pplVoiceRecog.continuous     = true;
    _pplVoiceRecog.interimResults = false;
    _pplVoiceRecog.lang           = 'en-US';

    _pplVoiceRecog.onresult = function(event) {
        var textarea = document.getElementById('interactionTextInput');
        for (var i = event.resultIndex; i < event.results.length; i++) {
            if (!event.results[i].isFinal) continue;
            var raw = event.results[i][0].transcript.trim();
            var processed = (typeof applySpokenPunctuation === 'function')
                ? applySpokenPunctuation(raw) : raw;

            var existing         = textarea.value;
            var endsWithSentence = /[.!?]\s*$/.test(existing.trimEnd());
            var shouldCap        = (existing.trim().length === 0) || endsWithSentence;
            if (processed.length > 0) {
                processed = shouldCap
                    ? processed.charAt(0).toUpperCase() + processed.slice(1)
                    : processed.charAt(0).toLowerCase() + processed.slice(1);
            }
            textarea.value = existing + (existing && !existing.endsWith(' ') ? ' ' : '') + processed;
        }
    };

    _pplVoiceRecog.onerror = function(e) {
        if (e.error !== 'no-speech') { console.error('People voice error:', e.error); _pplStopVoice(); }
    };
    _pplVoiceRecog.onend = function() {
        if (_pplVoiceActive) _pplVoiceRecog.start();
    };
}

function _pplToggleVoice() {
    if (_pplVoiceActive) {
        _pplStopVoice();
    } else {
        if (!_pplVoiceRecog) _pplInitVoice();
        if (!_pplVoiceRecog) { alert('Speech recognition not supported on this device.'); return; }
        _pplVoiceActive = true;
        _pplVoiceRecog.start();
        var btn = document.getElementById('interactionVoiceBtn');
        btn.textContent = '🎤 Stop';
        btn.classList.add('btn-recording');
    }
}

function _pplStopVoice() {
    _pplVoiceActive = false;
    if (_pplVoiceRecog) { try { _pplVoiceRecog.stop(); } catch(e) {} }
    var btn = document.getElementById('interactionVoiceBtn');
    if (btn) { btn.textContent = '🎤 Speak'; btn.classList.remove('btn-recording'); }
}

// ============================================================
// DATE & PHONE HELPERS
// ============================================================

var MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
];

/**
 * Format an important date record into a readable string.
 * Uses month/day/year fields (year optional).
 * e.g. "March 15" or "March 15, 1985"
 */
function formatImportantDate(d) {
    if (!d.month || !d.day) return d.date || '';   // fallback for old records
    var s = MONTH_NAMES[d.month - 1] + ' ' + d.day;
    if (d.year) s += ', ' + d.year;
    return s;
}

/**
 * Auto-format a US phone number.
 * Strips non-digits. 10 digits → XXX-XXX-XXXX.
 * 11 digits starting with 1 → trims the leading 1, then formats.
 * Anything else is returned as-is.
 */
function formatPhoneNumber(raw) {
    var digits = raw.replace(/\D/g, '');
    if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);
    if (digits.length === 10) {
        return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
    }
    return raw;   // Can't parse — leave unchanged
}

// ============================================================
// RELOAD HELPERS  (called by facts.js / photos.js callbacks)
// ============================================================

/**
 * Called after a fact is saved/deleted for a person.
 * Already handled by reloadFactsForCurrentTarget in facts.js.
 */

// ============================================================
// EVENT LISTENERS
// ============================================================

document.addEventListener('DOMContentLoaded', function() {

    // ---- People list page ----
    document.getElementById('addPersonBtn').addEventListener('click', function() {
        openAddPersonModal(null);
    });
    document.getElementById('peopleCategoryFilter').addEventListener('change', function() {
        if (window.location.hash.startsWith('#people')) loadPeoplePage();
    });
    document.getElementById('peopleSearchInput').addEventListener('input', function() {
        if (window.location.hash.startsWith('#people')) loadPeoplePage();
    });

    // ---- Person detail page ----
    document.getElementById('addSubPersonBtn').addEventListener('click', function() {
        if (currentPerson) openAddPersonModal(currentPerson.id);
    });
    document.getElementById('addImportantDateBtn').addEventListener('click', function() {
        if (currentPerson) openAddImportantDateModal(currentPerson.id);
    });
    document.getElementById('addInteractionBtn').addEventListener('click', function() {
        if (currentPerson) openAddInteractionModal(currentPerson.id);
    });
    document.getElementById('addPersonFactBtn').addEventListener('click', function() {
        if (currentPerson) openAddFactModal('person', currentPerson.id);
    });

    // Person photos — camera + gallery
    // (Profile photo is now set via "Use as Profile" in the photo viewer)
    document.getElementById('personCameraBtn').addEventListener('click', function() {
        document.getElementById('personCameraInput').click();
    });
    document.getElementById('personGalleryBtn').addEventListener('click', function() {
        document.getElementById('personGalleryInput').click();
    });
    document.getElementById('personCameraInput').addEventListener('change', function(e) {
        if (currentPerson && e.target.files[0]) {
            handlePhotoFile(e.target.files[0], 'person', currentPerson.id);
        }
        this.value = '';
    });
    document.getElementById('personGalleryInput').addEventListener('change', function(e) {
        if (currentPerson && e.target.files[0]) {
            handlePhotoFile(e.target.files[0], 'person', currentPerson.id);
        }
        this.value = '';
    });

    // ---- Phone auto-format on blur ----
    document.getElementById('personPhoneInput').addEventListener('blur', function() {
        var formatted = formatPhoneNumber(this.value.trim());
        if (formatted !== this.value.trim()) this.value = formatted;
    });

    // ---- Category select — show "add new" input when chosen ----
    document.getElementById('personCategorySelect').addEventListener('change', function() {
        var grp = document.getElementById('personCategoryNewGroup');
        grp.style.display = this.value === '__add_new__' ? '' : 'none';
        if (this.value === '__add_new__') document.getElementById('personCategoryNewInput').focus();
    });

    // ---- Person modal ----
    document.getElementById('personModalSaveBtn').addEventListener('click', handlePersonModalSave);
    document.getElementById('personModalCancelBtn').addEventListener('click', function() {
        closeModal('personModal');
    });
    document.getElementById('personModalDeleteBtn').addEventListener('click', function() {
        var id = document.getElementById('personModal').dataset.editId;
        if (id) handleDeletePerson(id);
    });
    document.getElementById('personModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal('personModal');
    });

    // ---- Important date modal ----
    document.getElementById('importantDateSaveBtn').addEventListener('click', handleImportantDateSave);
    document.getElementById('importantDateCancelBtn').addEventListener('click', function() {
        closeModal('importantDateModal');
    });
    document.getElementById('importantDateDeleteBtn').addEventListener('click', handleDeleteImportantDate);
    document.getElementById('importantDateModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal('importantDateModal');
    });

    // ---- Interaction modal ----
    document.getElementById('interactionVoiceBtn').addEventListener('click', _pplToggleVoice);
    document.getElementById('interactionSaveBtn').addEventListener('click', handleInteractionSave);
    document.getElementById('interactionCancelBtn').addEventListener('click', function() {
        _pplStopVoice();
        closeModal('interactionModal');
    });
    document.getElementById('interactionDeleteBtn').addEventListener('click', handleDeleteInteraction);
    document.getElementById('interactionModal').addEventListener('click', function(e) {
        if (e.target === this) { _pplStopVoice(); closeModal('interactionModal'); }
    });
});

// ============================================================
// LIFE LANDING PAGE -- Coming Up section (Phase 6)
// ============================================================

/**
 * Load the Life landing page.
 * Renders a 'Coming Up' section showing annual important dates
 * within the next 30 days, sorted by proximity.
 */
async function loadLifePage() {
    var section   = document.getElementById('lifeCalendarSection');
    var container = document.getElementById('lifeCalendarContainer');
    if (!section || !container) return;

    container.innerHTML = '';

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 30);

    try {
        var snap = await pplCol('peopleImportantDates')
            .where('recurrence', '==', 'annual')
            .get();

        if (snap.empty) { section.style.display = 'none'; return; }

        var peopleSnap = await pplCol('people').get();
        var personMap  = {};
        peopleSnap.forEach(function(doc) { personMap[doc.id] = doc.data().name || 'Unknown'; });

        var items = [];
        snap.forEach(function(doc) {
            var d = doc.data();
            if (!d.month || !d.day) return;
            var next = _nextAnnualOccurrence(d.month, d.day, today, endDate);
            if (!next) return;
            items.push({ label: d.label || '', personName: personMap[d.personId] || '', personId: d.personId || '', year: d.year || null, nextDate: next });
        });

        if (!items.length) { section.style.display = 'none'; return; }

        items.sort(function(a, b) { return a.nextDate - b.nextDate; });

        var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        var html = '<h3 class=life-calendar-heading>Coming Up</h3>';
        items.forEach(function(item) {
            var msAway   = item.nextDate - today;
            var daysAway = Math.round(msAway / 86400000);
            var dayLabel = daysAway === 0 ? 'Today!' : daysAway === 1 ? 'Tomorrow' : 'In ' + daysAway + ' days';
            var ageStr = '';
            if (item.year) {
                var age = item.nextDate.getFullYear() - item.year;
                if (age > 0) ageStr = '<span class=life-cal-age>turns ' + age + '</span>';
            }
            html +=
                '<div class=life-cal-item>' +
                    '<div class=life-cal-info>' +
                        '<span class=life-cal-label>' + escapeHtml(item.label) + '</span>' +
                        '<a class=life-cal-person href=#person/' + escapeHtml(item.personId) + '>' + escapeHtml(item.personName) + '</a>' +
                        ageStr +
                    '</div>' +
                    '<span class=life-cal-days>' + escapeHtml(dayLabel) + '</span>' +
                '</div>';
        });

        container.innerHTML = html;
        section.style.display = '';

    } catch (err) {
        console.error('loadLifePage error:', err);
        section.style.display = 'none';
    }
}
