// ============================================================
// Contacts.js — Contact tracker (renamed from People)
// Track people and organizations with contact info, family
// members, important dates, photos, facts, and interactions.
// Contact types: Personal, Medical Professional, Medical
//   Facility, Service Professional, Other.
// Firestore collections: people (unchanged), peopleImportantDates,
//                        peopleInteractions
// ============================================================

// ---------- State ----------
var currentPerson     = null;   // Contact currently being viewed
var _pplVoiceRecog    = null;   // SpeechRecognition instance for interactions
var _pplVoiceActive   = false;

// ---------- Contact type categories (fixed list) ----------
var CONTACT_CATEGORIES = [
    'Personal',
    'Medical Professional',
    'Medical Facility',
    'Service Professional',
    'Business',
    'Pet',
    'Other'
];

// ---------- Specialty / Trade / Personal Type lists ----------
// Medical Professional  → "Specialty" text input with datalist (large list, autocomplete works well)
// Service Professional  → "Trade" select dropdown  + on-the-fly add
// Personal              → "Relationship" select dropdown + on-the-fly add
// Trades and personal types are stored in Firestore lookups collection.

var _DEFAULT_SERVICE_TRADES  = ['Plumber','Electrician','HVAC','Pest Control','Handyman'];
var _DEFAULT_PERSONAL_TYPES  = ['Friend','Family','Neighbor','Coworker','Acquaintance'];
var _DEFAULT_BUSINESS_TYPES  = ['Electronics Store','Garden Store','Restaurant','Hardware Store','Grocery Store'];

// Built-in specialties (for Medical Professional datalist — kept as autocomplete)
var _BUILTIN_SPECIALTIES = new Set([
    'Family Medicine','Internal Medicine','Pediatrics','OB/GYN','Cardiology',
    'Dermatology','Endocrinology','Gastroenterology','Neurology','Oncology',
    'Ophthalmology','Optometry','Orthopedics','Otolaryngology (ENT)',
    'Physical Therapy','Psychiatry','Psychology','Pulmonology','Rheumatology',
    'Urology','Dentistry','Oral Surgery','Orthodontics','Urgent Care',
    'Emergency Medicine','Radiology','Anesthesiology','Chiropractic',
    'Podiatry','Allergy & Immunology','Nephrology','Hematology',
    'Infectious Disease','Palliative Care','Geriatrics'
]);

/** Load medical specialties into the datalist (autocomplete for Medical Professional). */
async function _loadCustomSpecialties() {
    var dl = document.getElementById('specialtyOptions');
    if (!dl) return;
    try {
        var snap = await userCol('lookups').doc('specialties').get();
        if (!snap.exists) return;
        var values = snap.data().values || [];
        var existing = new Set(Array.from(dl.options).map(function(o) { return o.value; }));
        values.forEach(function(v) {
            if (!existing.has(v)) {
                var opt = document.createElement('option');
                opt.value = v;
                dl.appendChild(opt);
            }
        });
    } catch (err) { console.warn('_loadCustomSpecialties error:', err); }
}

/** Save a new medical specialty to Firestore. */
async function _saveCustomSpecialty(value) {
    try {
        await userCol('lookups').doc('specialties').set(
            { values: firebase.firestore.FieldValue.arrayUnion(value) },
            { merge: true }
        );
    } catch (err) { console.warn('_saveCustomSpecialty error:', err); }
}

/**
 * Load the service trades list from Firestore and populate the trade <select>.
 * Falls back to _DEFAULT_SERVICE_TRADES if no Firestore doc exists yet.
 */
async function _loadServiceTrades(selectedValue) {
    var sel = document.getElementById('personTradeSelect');
    if (!sel) return;
    var trades = _DEFAULT_SERVICE_TRADES.slice();
    try {
        var snap = await userCol('lookups').doc('serviceTrades').get();
        if (snap.exists) {
            var vals = snap.data().values || [];
            if (vals.length > 0) {
                // If stored list has none of the built-in defaults, it's an old-style
                // custom-only list — merge defaults in and heal the doc.
                var hasDefault = _DEFAULT_SERVICE_TRADES.some(function(d) { return vals.indexOf(d) !== -1; });
                if (!hasDefault) {
                    trades = _DEFAULT_SERVICE_TRADES.slice();
                    vals.forEach(function(v) { if (trades.indexOf(v) === -1) trades.push(v); });
                    userCol('lookups').doc('serviceTrades').set({ values: trades }).catch(function(){});
                } else {
                    trades = vals;
                }
            }
        }
    } catch (err) { console.warn('_loadServiceTrades error:', err); }
    sel.innerHTML = '<option value="">— Select trade —</option>';
    trades.forEach(function(t) {
        var opt = document.createElement('option');
        opt.value = t; opt.textContent = t;
        if (t === selectedValue) opt.selected = true;
        sel.appendChild(opt);
    });
    var addOpt = document.createElement('option');
    addOpt.value = '__add_new__'; addOpt.textContent = '+ Add new trade...';
    sel.appendChild(addOpt);

    // Show inline add row when user picks "Add new..."
    sel.onchange = function() {
        if (sel.value === '__add_new__') {
            sel.value = '';   // reset so it shows placeholder
            document.getElementById('personTradeAddRow').style.display = '';
            document.getElementById('personTradeNewInput').focus();
        }
    };
}

/**
 * Load the personal contact types from Firestore and populate the personal type <select>.
 * Falls back to _DEFAULT_PERSONAL_TYPES if no Firestore doc exists yet.
 */
async function _loadPersonalTypes(selectedValue) {
    var sel = document.getElementById('personPersonalTypeSelect');
    if (!sel) return;
    var types = _DEFAULT_PERSONAL_TYPES.slice();
    try {
        var snap = await userCol('lookups').doc('personalContactTypes').get();
        if (snap.exists) {
            var vals = snap.data().values || [];
            if (vals.length > 0) {
                // If stored list has none of the built-in defaults, it's an old-style
                // custom-only list — merge defaults in and heal the doc.
                var hasDefault = _DEFAULT_PERSONAL_TYPES.some(function(d) { return vals.indexOf(d) !== -1; });
                if (!hasDefault) {
                    types = _DEFAULT_PERSONAL_TYPES.slice();
                    vals.forEach(function(v) { if (types.indexOf(v) === -1) types.push(v); });
                    userCol('lookups').doc('personalContactTypes').set({ values: types }).catch(function(){});
                } else {
                    types = vals;
                }
            }
        }
    } catch (err) { console.warn('_loadPersonalTypes error:', err); }
    sel.innerHTML = '<option value="">— Select type —</option>';
    types.forEach(function(t) {
        var opt = document.createElement('option');
        opt.value = t; opt.textContent = t;
        if (t === selectedValue) opt.selected = true;
        sel.appendChild(opt);
    });
    var addOpt = document.createElement('option');
    addOpt.value = '__add_new__'; addOpt.textContent = '+ Add new type...';
    sel.appendChild(addOpt);

    // Show inline add row when user picks "Add new..."
    sel.onchange = function() {
        if (sel.value === '__add_new__') {
            sel.value = '';   // reset so it shows placeholder
            document.getElementById('personPersonalTypeAddRow').style.display = '';
            document.getElementById('personPersonalTypeNewInput').focus();
        }
    };
}

/**
 * Load the business contact types from Firestore and populate the business type <select>.
 * Falls back to _DEFAULT_BUSINESS_TYPES if no Firestore doc exists yet.
 */
async function _loadBusinessTypes(selectedValue) {
    var sel = document.getElementById('personBusinessTypeSelect');
    if (!sel) return;
    var types = _DEFAULT_BUSINESS_TYPES.slice();
    try {
        var snap = await userCol('lookups').doc('businessTypes').get();
        if (snap.exists) {
            var vals = snap.data().values || [];
            if (vals.length > 0) {
                var hasDefault = _DEFAULT_BUSINESS_TYPES.some(function(d) { return vals.indexOf(d) !== -1; });
                if (!hasDefault) {
                    types = _DEFAULT_BUSINESS_TYPES.slice();
                    vals.forEach(function(v) { if (types.indexOf(v) === -1) types.push(v); });
                    userCol('lookups').doc('businessTypes').set({ values: types }).catch(function(){});
                } else {
                    types = vals;
                }
            }
        }
    } catch (err) { console.warn('_loadBusinessTypes error:', err); }
    sel.innerHTML = '<option value="">— Select type —</option>';
    types.forEach(function(t) {
        var opt = document.createElement('option');
        opt.value = t; opt.textContent = t;
        if (t === selectedValue) opt.selected = true;
        sel.appendChild(opt);
    });
    var addOpt = document.createElement('option');
    addOpt.value = '__add_new__'; addOpt.textContent = '+ Add new type...';
    sel.appendChild(addOpt);

    sel.onchange = function() {
        if (sel.value === '__add_new__') {
            sel.value = '';
            document.getElementById('personBusinessTypeAddRow').style.display = '';
            document.getElementById('personBusinessTypeNewInput').focus();
        }
    };
}

/** Cancel adding a new trade — hide the inline row. */
function _contactCancelAddTrade() {
    document.getElementById('personTradeAddRow').style.display = 'none';
    document.getElementById('personTradeNewInput').value = '';
}

/** Cancel adding a new personal type — hide the inline row. */
function _contactCancelAddPersonalType() {
    document.getElementById('personPersonalTypeAddRow').style.display = 'none';
    document.getElementById('personPersonalTypeNewInput').value = '';
}

/** Cancel adding a new business type — hide the inline row. */
function _contactCancelAddBusinessType() {
    document.getElementById('personBusinessTypeAddRow').style.display = 'none';
    document.getElementById('personBusinessTypeNewInput').value = '';
}

/**
 * "Add on the fly" handler for the trade field in the contact modal.
 * Saves the new trade to Firestore, repopulates the select, and selects it.
 */
async function _contactAddTradeOnTheFly() {
    var input = document.getElementById('personTradeNewInput');
    var val = input.value.trim();
    if (!val) return;
    try {
        var snap = await userCol('lookups').doc('serviceTrades').get();
        var existing = (snap.exists && snap.data().values && snap.data().values.length > 0)
            ? snap.data().values : _DEFAULT_SERVICE_TRADES.slice();
        if (existing.indexOf(val) === -1) existing.push(val);
        await userCol('lookups').doc('serviceTrades').set({ values: existing });
    } catch (err) { console.warn('_contactAddTradeOnTheFly save error:', err); }
    await _loadServiceTrades(val);
    input.value = '';
    document.getElementById('personTradeAddRow').style.display = 'none';
}

/**
 * "Add on the fly" handler for the personal type field in the contact modal.
 * Saves the new type to Firestore, repopulates the select, and selects it.
 */
async function _contactAddPersonalTypeOnTheFly() {
    var input = document.getElementById('personPersonalTypeNewInput');
    var val = input.value.trim();
    if (!val) return;
    try {
        var snap = await userCol('lookups').doc('personalContactTypes').get();
        var existing = (snap.exists && snap.data().values && snap.data().values.length > 0)
            ? snap.data().values : _DEFAULT_PERSONAL_TYPES.slice();
        if (existing.indexOf(val) === -1) existing.push(val);
        await userCol('lookups').doc('personalContactTypes').set({ values: existing });
    } catch (err) { console.warn('_contactAddPersonalTypeOnTheFly save error:', err); }
    await _loadPersonalTypes(val);
    input.value = '';
    document.getElementById('personPersonalTypeAddRow').style.display = 'none';
}

/**
 * "Add on the fly" handler for the business type field in the contact modal.
 * Saves the new type to Firestore, repopulates the select, and selects it.
 */
async function _contactAddBusinessTypeOnTheFly() {
    var input = document.getElementById('personBusinessTypeNewInput');
    var val = input.value.trim();
    if (!val) return;
    try {
        var snap = await userCol('lookups').doc('businessTypes').get();
        var existing = (snap.exists && snap.data().values && snap.data().values.length > 0)
            ? snap.data().values : _DEFAULT_BUSINESS_TYPES.slice();
        if (existing.indexOf(val) === -1) existing.push(val);
        await userCol('lookups').doc('businessTypes').set({ values: existing });
    } catch (err) { console.warn('_contactAddBusinessTypeOnTheFly save error:', err); }
    await _loadBusinessTypes(val);
    input.value = '';
    document.getElementById('personBusinessTypeAddRow').style.display = 'none';
}

/**
 * Show/hide the category-specific fields based on selected contact type.
 * Medical Professional → specialty text input (datalist autocomplete)
 * Service Professional → trade select + add-on-the-fly
 * Personal             → personal type select + add-on-the-fly
 * Others               → all hidden
 */
function _configureTypeFields(category) {
    var specialtyGrp     = document.getElementById('personSpecialtyGroup');
    var tradeGrp         = document.getElementById('personTradeGroup');
    var personalTypeGrp  = document.getElementById('personPersonalTypeGroup');
    var businessTypeGrp  = document.getElementById('personBusinessTypeGroup');
    var ownerGrp         = document.getElementById('personOwnerGroup');

    if (specialtyGrp)    specialtyGrp.style.display    = (category === 'Medical Professional') ? '' : 'none';
    if (tradeGrp)        tradeGrp.style.display        = (category === 'Service Professional') ? '' : 'none';
    if (personalTypeGrp) personalTypeGrp.style.display = (category === 'Personal')            ? '' : 'none';
    if (businessTypeGrp) businessTypeGrp.style.display = (category === 'Business')            ? '' : 'none';
    if (ownerGrp)        ownerGrp.style.display        = (category === 'Pet')                 ? '' : 'none';
}

// Backwards-compat alias (still referenced in a few older places)
function _configureSpecialtyField(category) { _configureTypeFields(category); }

// ============================================================
// ME CONTACT  (auto-created protected contact for the user)
// ============================================================

/**
 * Ensure a "Me" contact exists in the people collection.
 * Called on contacts page load and before health migration.
 * Returns the Me contact ID (creates one if none exists).
 * Safe to call multiple times — idempotent.
 */
async function ensureMeContact() {
    try {
        var snap = await userCol('people').where('isMe', '==', true).limit(1).get();
        if (!snap.empty) return snap.docs[0].id;
        // No Me contact yet — create one
        var ref = await userCol('people').add({
            name:             'Me',
            isMe:             true,
            category:         'Personal',
            parentPersonId:   null,
            profilePhotoData: null,
            createdAt:        firebase.firestore.FieldValue.serverTimestamp()
        });
        return ref.id;
    } catch (err) {
        console.error('ensureMeContact error:', err);
        return null;
    }
}

// ============================================================
// CONTACTS LIST PAGE  (#contacts)
// ============================================================

/**
 * Load and render the full contacts list.
 * Shows only top-level contacts (parentPersonId == null).
 */
async function loadContactsPage() {
    // Ensure the "Me" contact exists (silent, non-blocking)
    ensureMeContact();

    // Set breadcrumb in sticky header
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML = '<a href="#life">Life</a><span class="separator">&rsaquo;</span><span>Contacts</span>';

    var container  = document.getElementById('contactsListContainer');
    var emptyState = document.getElementById('contactsListEmpty');
    container.innerHTML = '';
    emptyState.style.display = 'none';

    await _populateContactsFilterSelect();

    try {
        var snap = await userCol('people')
            .where('parentPersonId', '==', null)
            .get();

        var docs = [];
        snap.forEach(function(doc) {
            docs.push(Object.assign({ id: doc.id }, doc.data()));
        });

        // Sort A-Z by name
        docs.sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });

        // Apply category filter
        var filterVal = (document.getElementById('contactCategoryFilter').value || '').trim();
        if (filterVal) {
            docs = docs.filter(function(p) { return p.category === filterVal; });
        }

        // Apply search filter
        var searchVal = (document.getElementById('contactSearchInput').value || '').toLowerCase().trim();
        if (searchVal) {
            docs = docs.filter(function(p) {
                return (p.name      || '').toLowerCase().includes(searchVal) ||
                       (p.nickname  || '').toLowerCase().includes(searchVal) ||
                       (p.specialty || '').toLowerCase().includes(searchVal);
            });
        }

        if (docs.length === 0) {
            emptyState.textContent = snap.empty
                ? 'No contacts yet. Press + Add Contact to get started.'
                : 'No contacts match the current filter.';
            emptyState.style.display = 'block';
            return;
        }

        // Fetch last interaction date for each contact in one pass
        var intSnap = await userCol('peopleInteractions').get();
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
        console.error('loadContactsPage error:', err);
        emptyState.textContent = 'Error loading contacts.';
        emptyState.style.display = 'block';
    }
}

/** Populate the category filter dropdown on the contacts list page. */
async function _populateContactsFilterSelect() {
    var sel     = document.getElementById('contactCategoryFilter');
    var current = sel.value;
    sel.innerHTML = '<option value="">All Categories</option>';
    CONTACT_CATEGORIES.forEach(function(c) {
        var opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        if (c === current) opt.selected = true;
        sel.appendChild(opt);
    });
}

/**
 * Build a clickable contact card for the list.
 * @param {Object} person - Contact data
 * @param {string|null} lastInteraction - Date string of most recent interaction
 */
function buildPersonCard(person, lastInteraction) {
    var card = document.createElement('div');
    card.className = 'card card--clickable person-card';

    var avatarHtml = _buildAvatarHtml(person, 'person-avatar');

    // Use contact type category (Personal/Medical Professional/etc.)
    // Fall back to 'Personal' for old records that have no category or old-style categories
    var contactType = CONTACT_CATEGORIES.indexOf(person.category) !== -1
        ? person.category
        : (person.category ? 'Personal' : '');

    // Sub-type label shown beside the category badge
    var subTypeLabel = '';
    if (contactType === 'Personal' && person.personalType) {
        subTypeLabel = ' <span class="person-subtype-label">' + escapeHtml(person.personalType) + '</span>';
    } else if (contactType === 'Service Professional' && person.specialty) {
        subTypeLabel = ' <span class="person-subtype-label">' + escapeHtml(person.specialty) + '</span>';
    } else if (contactType === 'Medical Professional' && person.specialty) {
        subTypeLabel = ' <span class="person-subtype-label">' + escapeHtml(person.specialty) + '</span>';
    } else if (contactType === 'Business' && person.businessType) {
        subTypeLabel = ' <span class="person-subtype-label">' + escapeHtml(person.businessType) + '</span>';
    }

    var categoryBadge = contactType
        ? '<span class="person-category-badge contact-type-' + contactType.toLowerCase().replace(/\s+/g, '-') + '">'
            + escapeHtml(contactType) + '</span>' + subTypeLabel
        : '';

    var nickHtml = person.nickname
        ? '<span class="person-nickname">"' + escapeHtml(person.nickname) + '"</span>'
        : '';

    // For Medical/Service Professionals, show specialty/trade instead of last interaction
    var sublineHtml;
    if ((contactType === 'Medical Professional' || contactType === 'Service Professional') && person.specialty) {
        sublineHtml = '<span class="person-last-interaction">' + escapeHtml(person.specialty) + '</span>';
    } else if (contactType === 'Medical Facility' && person.address) {
        sublineHtml = '<span class="person-last-interaction">' + escapeHtml(person.address) + '</span>';
    } else {
        sublineHtml = lastInteraction
            ? '<span class="person-last-interaction">Last: ' + escapeHtml(lastInteraction) + '</span>'
            : '<span class="person-last-interaction person-last-interaction--none">No interactions yet</span>';
    }

    card.innerHTML =
        avatarHtml +
        '<div class="card-main person-card-info">' +
            '<div class="person-card-name-row">' +
                '<span class="card-title">' + escapeHtml(person.name || 'Unnamed') + '</span>' +
                nickHtml + categoryBadge +
            '</div>' +
            sublineHtml +
        '</div>' +
        '<span class="card-arrow">›</span>';

    card.addEventListener('click', function() {
        window.location.hash = '#contact/' + person.id;
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
// CONTACT DETAIL PAGE  (#contact/{id})
// ============================================================

/**
 * Load the contact detail page.
 * Called by app.js when route is #contact/{id}.
 */
async function loadContactDetail(personId) {
    currentPerson = null;

    try {
        var doc = await userCol('people').doc(personId).get();
        if (!doc.exists) { window.location.hash = '#contacts'; return; }
        currentPerson = window.currentPerson = Object.assign({ id: doc.id }, doc.data());

        // Load parent for breadcrumb (sub-contacts only)
        var parentPerson = null;
        if (currentPerson.parentPersonId) {
            var pDoc = await userCol('people').doc(currentPerson.parentPersonId).get();
            if (pDoc.exists) parentPerson = Object.assign({ id: pDoc.id }, pDoc.data());
        }

        renderPersonDetail(currentPerson, parentPerson);

    } catch (err) { console.error('loadContactDetail error:', err); }
}

// Keep old function name as alias so any other code calling loadPersonDetail still works
function loadPersonDetail(personId) { return loadContactDetail(personId); }

/**
 * Render the contact detail page from loaded data.
 * @param {Object} person
 * @param {Object|null} parentPerson - Set when this is a sub-contact
 */
function renderPersonDetail(person, parentPerson) {
    window.scrollTo(0, 0);

    // Breadcrumb (written to the sticky header bar)
    var crumb = document.getElementById('breadcrumbBar');
    if (parentPerson) {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#contacts">Contacts</a><span class="separator">&rsaquo;</span>' +
            '<a href="#contact/' + parentPerson.id + '">' + escapeHtml(parentPerson.name || 'Contact') + '</a><span class="separator">&rsaquo;</span>' +
            '<span>' + escapeHtml(person.name || '') + '</span>';
    } else {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#contacts">Contacts</a><span class="separator">&rsaquo;</span>' +
            '<span>' + escapeHtml(person.name || '') + '</span>';
    }

    // Avatar
    document.getElementById('personDetailAvatar').innerHTML =
        _buildAvatarHtml(person, 'person-detail-avatar');

    // Name / nickname / category type
    document.getElementById('personDetailName').textContent     = person.name || '';
    document.getElementById('personDetailNickname').textContent = person.nickname ? '"' + person.nickname + '"' : '';

    // "This is me" badge
    var meBadgeEl = document.getElementById('personDetailMeBadge');
    if (meBadgeEl) meBadgeEl.style.display = person.isMe ? '' : 'none';

    // Contact type badge (show new-style, fall back gracefully for old records)
    var contactType = CONTACT_CATEGORIES.indexOf(person.category) !== -1
        ? person.category
        : (person.category ? null : null);  // old-style categories hidden
    var catEl = document.getElementById('personDetailCategory');
    if (contactType) {
        catEl.textContent  = contactType;
        catEl.className    = 'person-category-badge contact-type-' + contactType.toLowerCase().replace(/\s+/g, '-');
        catEl.style.display = '';
    } else {
        catEl.style.display = 'none';
    }

    // Contact info rows
    var rows = '';
    if (person.category === 'Pet' && person.ownerContactId && person.ownerName)
        rows += _contactRow('Owner', '<a href="#contact/' + escapeHtml(person.ownerContactId) + '">' + escapeHtml(person.ownerName) + '</a>');
    if (person.specialty && person.category === 'Medical Professional')
        rows += _contactRow('Specialty', escapeHtml(person.specialty));
    if (person.specialty && person.category === 'Service Professional')
        rows += _contactRow('Trade', escapeHtml(person.specialty));
    if (person.businessType && person.category === 'Business')
        rows += _contactRow('Business Type', escapeHtml(person.businessType));
    if (person.phone)
        rows += _contactRow('Phone', '<a href="tel:' + escapeHtml(person.phone) + '">' + escapeHtml(person.phone) + '</a>');
    if (person.email)
        rows += _contactRow('Email', '<a href="mailto:' + escapeHtml(person.email) + '">' + escapeHtml(person.email) + '</a>');
    if (person.address)
        rows += _contactRow('Address', '<a href="https://maps.google.com/?q=' + encodeURIComponent(person.address) + '" target="_blank" rel="noopener">' + escapeHtml(person.address) + '</a>');
    if (person.website)
        rows += _contactRow('Website', '<a href="' + escapeHtml(person.website) + '" target="_blank" rel="noopener">' + escapeHtml(person.website) + ' ↗</a>');
    if (person.facebookUrl)
        rows += _contactRow('Facebook', '<a href="' + escapeHtml(person.facebookUrl) + '" target="_blank" rel="noopener">View Profile ↗</a>');
    if (person.howKnown)
        rows += _contactRow('How known', escapeHtml(person.howKnown));
    if (person.notes)
        rows += _contactRow('Notes', escapeHtml(person.notes));
    document.getElementById('personContactInfo').innerHTML = rows || '<p class="empty-state" style="margin:0">No contact info yet.</p>';

    // Family members section — only visible for main (non-sub) contacts
    var subSection = document.getElementById('personSubPeopleSection');
    if (subSection) subSection.style.display = person.parentPersonId ? 'none' : '';

    // Rename heading to "Staff" for Medical Facility contacts
    var isFacility = person.category === 'Medical Facility';
    var subLabel = isFacility ? 'Staff' : 'Family Members';
    var headingEl = document.getElementById('subPeopleHeading');
    if (headingEl) headingEl.textContent = subLabel;

    // Wire edit button
    document.getElementById('personEditBtn').onclick = function() { openEditContactModal(person); };

    // Load all sub-sections
    if (!person.parentPersonId) loadSubPeople(person.id, subLabel);
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
// LC-12: Shared Events section on Contact detail page
// ============================================================

/**
 * Load life events this contact is tagged on and render the Shared Events section.
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
 * Compresses and saves as profilePhotoData on the contact doc.
 */
async function _handleProfilePhotoUpload(file) {
    if (!currentPerson) return;
    try {
        var compressed = await compressImage(file, 400, 400, 0.75);
        await userCol('people').doc(currentPerson.id).update({ profilePhotoData: compressed });
        currentPerson.profilePhotoData = compressed;
        document.getElementById('personDetailAvatar').innerHTML =
            _buildAvatarHtml(currentPerson, 'person-detail-avatar');
    } catch (err) {
        console.error('Profile photo error:', err);
        alert('Error saving profile photo.');
    }
}

// ============================================================
// CONTACT CRUD  (Add / Edit modal)
// ============================================================

async function openAddContactModal(parentPersonId) {
    document.getElementById('personModalTitle').textContent = parentPersonId ? 'Add Family Member' : 'Add Contact';
    document.getElementById('personNameInput').value       = '';
    document.getElementById('personNicknameInput').value   = '';
    document.getElementById('personHowKnownInput').value   = '';
    document.getElementById('personPhoneInput').value      = '';
    document.getElementById('personEmailInput').value      = '';
    document.getElementById('personAddressInput').value    = '';
    document.getElementById('personWebsiteInput').value    = '';
    document.getElementById('personFacebookInput').value   = '';
    document.getElementById('personNotesInput').value      = '';
    document.getElementById('personSpecialtyInput').value  = '';
    document.getElementById('personIsMeInput').checked           = false;
    document.getElementById('personQuickMentionInput').checked   = false;
    document.getElementById('personModalDeleteBtn').style.display = 'none';
    document.getElementById('personNameInput').readOnly           = false;
    document.getElementById('personNameInput').style.background   = '';
    var isMeGrp = document.getElementById('personIsMeGroup');
    if (isMeGrp) isMeGrp.style.display = '';

    // Reset inline-add rows
    document.getElementById('personTradeAddRow').style.display        = 'none';
    document.getElementById('personPersonalTypeAddRow').style.display = 'none';
    document.getElementById('personBusinessTypeAddRow').style.display = 'none';

    var modal = document.getElementById('personModal');
    modal.dataset.mode           = 'add';
    modal.dataset.editId         = '';
    modal.dataset.parentPersonId = parentPersonId || '';

    _populateContactCategorySelect('personCategorySelect', 'Personal');
    _configureTypeFields('Personal');
    _loadCustomSpecialties();
    _loadServiceTrades('');
    _loadPersonalTypes('');
    _loadBusinessTypes('');
    buildContactPicker('personOwnerPicker', { placeholder: 'Search contacts…', onSelect: function() {} });
    openModal('personModal');
    document.getElementById('personNameInput').focus();
}

// Backwards-compat alias (called from HTML buttons that say openAddPersonModal)
function openAddPersonModal(parentPersonId) { return openAddContactModal(parentPersonId); }

async function openEditContactModal(person) {
    document.getElementById('personModalTitle').textContent = person.parentPersonId ? 'Edit Family Member' : 'Edit Contact';
    document.getElementById('personNameInput').value       = person.name        || '';
    document.getElementById('personNicknameInput').value   = person.nickname    || '';
    document.getElementById('personHowKnownInput').value   = person.howKnown    || '';
    document.getElementById('personPhoneInput').value      = person.phone       || '';
    document.getElementById('personEmailInput').value      = person.email       || '';
    document.getElementById('personAddressInput').value    = person.address     || '';
    document.getElementById('personWebsiteInput').value    = person.website     || '';
    document.getElementById('personFacebookInput').value   = person.facebookUrl || '';
    document.getElementById('personNotesInput').value      = person.notes       || '';
    document.getElementById('personSpecialtyInput').value  = person.specialty   || '';
    document.getElementById('personIsMeInput').checked           = !!person.isMe;
    document.getElementById('personQuickMentionInput').checked   = !!person.quickMention;

    // Me contact: hide delete button, lock name, hide the isMe toggle (can't change it)
    var isMe = !!person.isMe;
    document.getElementById('personModalDeleteBtn').style.display = isMe ? 'none' : '';
    document.getElementById('personNameInput').readOnly           = isMe;
    document.getElementById('personNameInput').style.background   = isMe ? 'var(--bg-secondary, #f3f4f6)' : '';
    var isMeGroup = document.getElementById('personIsMeGroup');
    if (isMeGroup) isMeGroup.style.display = isMe ? 'none' : '';

    // Reset inline-add rows
    document.getElementById('personTradeAddRow').style.display        = 'none';
    document.getElementById('personPersonalTypeAddRow').style.display = 'none';
    document.getElementById('personBusinessTypeAddRow').style.display = 'none';

    var catVal = CONTACT_CATEGORIES.indexOf(person.category) !== -1 ? person.category : 'Personal';
    _populateContactCategorySelect('personCategorySelect', catVal);
    _configureTypeFields(catVal);

    var modal = document.getElementById('personModal');
    modal.dataset.mode           = 'edit';
    modal.dataset.editId         = person.id;
    modal.dataset.parentPersonId = person.parentPersonId || '';

    _loadCustomSpecialties();
    _loadServiceTrades(person.specialty    || '');   // trade stored in specialty field
    _loadPersonalTypes(person.personalType || '');
    _loadBusinessTypes(person.businessType || '');
    buildContactPicker('personOwnerPicker', {
        placeholder: 'Search contacts…',
        initialId:   person.ownerContactId || '',
        initialName: person.ownerName      || '',
        onSelect: function() {}
    });
    openModal('personModal');
}

// Backwards-compat alias
function openEditPersonModal(person) { return openEditContactModal(person); }

/** Populate the contact type category <select> element with the fixed CONTACT_CATEGORIES list. */
function _populateContactCategorySelect(selectId, selectedValue) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select type —</option>';
    CONTACT_CATEGORIES.forEach(function(c) {
        var opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        if (c === selectedValue) opt.selected = true;
        sel.appendChild(opt);
    });
}

async function handleContactModalSave() {
    var name = document.getElementById('personNameInput').value.trim();
    if (!name) { alert('Name is required.'); return; }

    var catVal = document.getElementById('personCategorySelect').value || 'Personal';

    // Read specialty/trade depending on category:
    // Medical Professional → text input; Service Professional → select dropdown
    var specialtyVal = '';
    if (catVal === 'Medical Professional') {
        specialtyVal = document.getElementById('personSpecialtyInput').value.trim();
    } else if (catVal === 'Service Professional') {
        specialtyVal = document.getElementById('personTradeSelect').value;
    }

    var data = {
        name:         name,
        nickname:     document.getElementById('personNicknameInput').value.trim(),
        howKnown:     document.getElementById('personHowKnownInput').value.trim(),
        phone:        formatPhoneNumber(document.getElementById('personPhoneInput').value.trim()),
        email:        document.getElementById('personEmailInput').value.trim(),
        address:      document.getElementById('personAddressInput').value.trim(),
        website:      document.getElementById('personWebsiteInput').value.trim(),
        facebookUrl:  document.getElementById('personFacebookInput').value.trim(),
        notes:        document.getElementById('personNotesInput').value.trim(),
        category:     catVal,
        specialty:    specialtyVal,
        personalType: (catVal === 'Personal')
                          ? document.getElementById('personPersonalTypeSelect').value
                          : '',
        businessType: (catVal === 'Business')
                          ? document.getElementById('personBusinessTypeSelect').value
                          : '',
        quickMention: document.getElementById('personQuickMentionInput').checked,
        isMe:         document.getElementById('personIsMeInput').checked,
        ownerContactId: (catVal === 'Pet')
            ? (document.getElementById('personOwnerPicker')
                   ? (document.getElementById('personOwnerPicker')._getSelectedId
                          ? document.getElementById('personOwnerPicker')._getSelectedId()
                          : '')
                   : '')
            : '',
        ownerName: (catVal === 'Pet')
            ? (document.getElementById('personOwnerPicker')
                   ? (document.getElementById('personOwnerPicker')._getSelectedName
                          ? document.getElementById('personOwnerPicker')._getSelectedName()
                          : '')
                   : '')
            : '',
    };

    var modal          = document.getElementById('personModal');
    var mode           = modal.dataset.mode;
    var editId         = modal.dataset.editId;
    var parentPersonId = modal.dataset.parentPersonId || null;

    // Persist new medical specialty if it's not already in the built-in list
    if (catVal === 'Medical Professional' && specialtyVal && !_BUILTIN_SPECIALTIES.has(specialtyVal)) {
        _saveCustomSpecialty(specialtyVal);
    }

    try {
        // If isMe is being set, clear the flag from all other contacts first
        if (data.isMe) {
            var allPeople = await userCol('people').where('isMe', '==', true).get();
            var batch = db.batch();
            allPeople.forEach(function(doc) {
                if (doc.id !== editId) batch.update(doc.ref, { isMe: false });
            });
            await batch.commit();
        }

        if (mode === 'add') {
            data.parentPersonId   = parentPersonId;
            data.profilePhotoData = null;
            data.createdAt        = firebase.firestore.FieldValue.serverTimestamp();
            await userCol('people').add(data);
            closeModal('personModal');
            if (parentPersonId) {
                loadSubPeople(parentPersonId);
            } else {
                loadContactsPage();
            }
        } else {
            await userCol('people').doc(editId).update(data);
            closeModal('personModal');
            Object.assign(currentPerson, data);
            loadContactDetail(editId);
        }
    } catch (err) {
        console.error('handleContactModalSave error:', err);
        alert('Error saving contact.');
    }
}

// Backwards-compat alias
function handlePersonModalSave() { return handleContactModalSave(); }

async function handleDeleteContact(id) {
    // The Me contact cannot be deleted
    if (currentPerson && currentPerson.isMe) {
        alert('The "Me" contact cannot be deleted.');
        return;
    }

    if (!confirm('Delete this contact? Their interactions and important dates will also be deleted.')) return;

    var parentId = currentPerson ? currentPerson.parentPersonId : null;
    closeModal('personModal');

    try {
        var batch = db.batch();

        // Delete interactions
        var intSnap = await userCol('peopleInteractions').where('personId', '==', id).get();
        intSnap.forEach(function(d) { batch.delete(d.ref); });

        // Delete important dates
        var dateSnap = await userCol('peopleImportantDates').where('personId', '==', id).get();
        dateSnap.forEach(function(d) { batch.delete(d.ref); });

        // Delete sub-contacts if main contact (and their interactions/dates)
        var subSnap = await userCol('people').where('parentPersonId', '==', id).get();
        for (var i = 0; i < subSnap.docs.length; i++) {
            var subId = subSnap.docs[i].id;
            var sInt = await userCol('peopleInteractions').where('personId', '==', subId).get();
            sInt.forEach(function(d) { batch.delete(d.ref); });
            var sDates = await userCol('peopleImportantDates').where('personId', '==', subId).get();
            sDates.forEach(function(d) { batch.delete(d.ref); });
            batch.delete(subSnap.docs[i].ref);
        }

        batch.delete(userCol('people').doc(id));
        await batch.commit();

        // Navigate back
        if (parentId) {
            window.location.hash = '#contact/' + parentId;
        } else {
            window.location.hash = '#contacts';
        }

    } catch (err) {
        console.error('handleDeleteContact error:', err);
        alert('Error deleting contact.');
    }
}

// Backwards-compat alias
function handleDeletePerson(id) { return handleDeleteContact(id); }

// ============================================================
// SUB-CONTACTS  (family members on contact detail page)
// ============================================================

async function loadSubPeople(parentId, label) {
    var container  = document.getElementById('subPeopleContainer');
    var emptyState = document.getElementById('subPeopleEmpty');
    container.innerHTML = '';
    var memberLabel = label || 'Family Members';

    try {
        var snap = await userCol('people').where('parentPersonId', '==', parentId).get();

        if (snap.empty) {
            emptyState.textContent = 'No ' + memberLabel.toLowerCase() + ' added yet.';
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
    var catBadge   = person.category && CONTACT_CATEGORIES.indexOf(person.category) !== -1
        ? '<span class="person-category-badge contact-type-' + person.category.toLowerCase().replace(/\s+/g, '-') + '">'
          + escapeHtml(person.category) + '</span>'
        : '';
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

    card.addEventListener('click', function() { window.location.hash = '#contact/' + person.id; });
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
        var snap = await userCol('peopleImportantDates').where('personId', '==', personId).get();
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
            await userCol('peopleImportantDates').add(data);
        } else {
            await userCol('peopleImportantDates').doc(modal.dataset.editId).update({
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
        await userCol('peopleImportantDates').doc(id).delete();
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
        var snap = await userCol('peopleInteractions').where('personId', '==', personId).get();
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
            var interactionDate = date || new Date().toISOString().split('T')[0];
            await userCol('peopleInteractions').add({
                personId:   personId,
                date:       interactionDate,
                text:       text,
                sourceType: 'direct',
                createdAt:  firebase.firestore.FieldValue.serverTimestamp()
            });
            // Keep house lastInteractionAt in sync for neighbor residents
            if (typeof _nbUpdateHouseLastInteraction === 'function') {
                _nbUpdateHouseLastInteraction(personId, interactionDate);
            }
        } else {
            await userCol('peopleInteractions').doc(modal.dataset.editId).update({ date: date, text: text });
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
        await userCol('peopleInteractions').doc(id).delete();
        loadInteractions(personId);
    } catch (err) { console.error('handleDeleteInteraction error:', err); }
}

// ============================================================
// VOICE TO TEXT  (interaction entry)
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
        if (e.error !== 'no-speech') { console.error('Contacts voice error:', e.error); _pplStopVoice(); }
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
 */
function formatImportantDate(d) {
    if (!d.month || !d.day) return d.date || '';
    var s = MONTH_NAMES[d.month - 1] + ' ' + d.day;
    if (d.year) s += ', ' + d.year;
    return s;
}

/**
 * Auto-format a US phone number.
 */
function formatPhoneNumber(raw) {
    var digits = raw.replace(/\D/g, '');
    if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);
    if (digits.length === 10) {
        return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
    }
    return raw;
}

// ============================================================
// EVENT LISTENERS
// ============================================================

document.addEventListener('DOMContentLoaded', function() {

    // ---- Contacts list page ----
    document.getElementById('addContactBtn').addEventListener('click', function() {
        openAddContactModal(null);
    });
    document.getElementById('contactCategoryFilter').addEventListener('change', function() {
        if (window.location.hash.startsWith('#contacts')) loadContactsPage();
    });
    document.getElementById('contactSearchInput').addEventListener('input', function() {
        if (window.location.hash.startsWith('#contacts')) loadContactsPage();
    });

    // ---- Contact detail page ----
    document.getElementById('addSubPersonBtn').addEventListener('click', function() {
        if (currentPerson) openAddContactModal(currentPerson.id);
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

    // Contact photos — camera + gallery
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

    // ---- Category select — show correct sub-field for the selected contact type ----
    document.getElementById('personCategorySelect').addEventListener('change', function() {
        _configureTypeFields(this.value);
        if (this.value === 'Medical Professional') {
            document.getElementById('personSpecialtyInput').focus();
        }
    });

    // ---- Contact modal ----
    document.getElementById('personModalSaveBtn').addEventListener('click', handleContactModalSave);
    document.getElementById('personModalCancelBtn').addEventListener('click', function() {
        closeModal('personModal');
    });
    document.getElementById('personModalDeleteBtn').addEventListener('click', function() {
        var id = document.getElementById('personModal').dataset.editId;
        if (id) handleDeleteContact(id);
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
// LIFE LANDING PAGE -- Coming Up section
// ============================================================

/**
 * Load the Life landing page.
 * Renders a 'Coming Up' section showing annual important dates
 * within the next 30 days, sorted by proximity.
 */
async function loadLifePage() {
    _lifeInitTileOrder();  // apply saved order + wire drag on desktop (non-blocking)

    var section   = document.getElementById('lifeCalendarSection');
    var container = document.getElementById('lifeCalendarContainer');
    if (!section || !container) return;

    container.innerHTML = '';

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 30);
    var todayStr   = today.toISOString().slice(0, 10);
    var endDateStr = endDate.toISOString().slice(0, 10);

    try {
        // Load annual contact dates and upcoming life events in parallel
        var results = await Promise.all([
            userCol('peopleImportantDates').where('recurrence', '==', 'annual').get(),
            userCol('lifeEvents').where('startDate', '>=', todayStr).where('startDate', '<=', endDateStr).get()
        ]);
        var datesSnap  = results[0];
        var eventsSnap = results[1];

        // Build person name map only if annual dates exist
        var personMap = {};
        if (!datesSnap.empty) {
            var peopleSnap = await userCol('people').get();
            peopleSnap.forEach(function(doc) { personMap[doc.id] = doc.data().name || 'Unknown'; });
        }

        var items = [];

        // Annual dates from contacts
        datesSnap.forEach(function(doc) {
            var d = doc.data();
            if (!d.month || !d.day) return;
            var next = _nextAnnualOccurrence(d.month, d.day, today, endDate);
            if (!next) return;
            items.push({ _type: 'annual', label: d.label || '', personName: personMap[d.personId] || '', personId: d.personId || '', year: d.year || null, nextDate: next });
        });

        // Upcoming life calendar events (skip attended/missed/didntgo)
        eventsSnap.forEach(function(doc) {
            var d = doc.data();
            if (d.status === 'attended' || d.status === 'missed' || d.status === 'didntgo') return;
            items.push({
                _type:             'event',
                _id:               doc.id,
                label:             d.title             || '',
                nextDate:          new Date(d.startDate),
                location:          d.location          || '',
                locationContactId: d.locationContactId || null
            });
        });

        if (!items.length) { section.style.display = 'none'; return; }

        items.sort(function(a, b) { return a.nextDate - b.nextDate; });

        // Fetch contact details (address + phone) for today's events that have a linked contact.
        // Use daysAway rounding (same as the display logic) instead of toDateString() because
        // dates parsed from ISO strings ("2026-04-17") are UTC midnight and may appear as the
        // previous day in local time, causing toDateString() to not match even when the event
        // is correctly displayed as "Today!".
        var locationContactMap = {};
        var contactIdsToFetch = items
            .filter(function(i) {
                if (i._type !== 'event' || !i.locationContactId) return false;
                var dAway = Math.round((i.nextDate - today) / 86400000);
                return dAway === 0;
            })
            .map(function(i) { return i.locationContactId; });
        contactIdsToFetch = contactIdsToFetch.filter(function(id, idx) { return contactIdsToFetch.indexOf(id) === idx; }); // dedupe
        if (contactIdsToFetch.length) {
            await Promise.all(contactIdsToFetch.map(async function(cid) {
                try {
                    var cSnap = await userCol('people').doc(cid).get();
                    if (cSnap.exists) locationContactMap[cid] = cSnap.data();
                } catch(e) { /* ignore */ }
            }));
        }

        var html = '<h3 class=life-calendar-heading>Coming Up</h3>';
        items.forEach(function(item) {
            var msAway   = item.nextDate - today;
            var daysAway = Math.round(msAway / 86400000);
            var dayLabel = daysAway === 0 ? 'Today!' : daysAway === 1 ? 'Tomorrow' : 'In ' + daysAway + ' days';

            if (item._type === 'event') {
                // For today's events: show a clickable address and/or phone number
                var todayLinksHtml = '';
                if (daysAway === 0) {
                    var addr  = '';
                    var phone = '';
                    if (item.locationContactId && locationContactMap[item.locationContactId]) {
                        // Linked contact — use their stored address and phone
                        addr  = locationContactMap[item.locationContactId].address || '';
                        phone = locationContactMap[item.locationContactId].phone   || '';
                    } else if (item.location) {
                        // Plain-text location — treat as address only
                        addr = item.location;
                    }
                    var todayParts = [];
                    if (addr)  todayParts.push('<a href="https://maps.google.com/?q=' + encodeURIComponent(addr) + '" target="_blank" rel="noopener" class="life-cal-today-link">📍 ' + escapeHtml(addr) + '</a>');
                    if (phone) todayParts.push('<a href="tel:' + escapeHtml(phone.replace(/\s/g, '')) + '" class="life-cal-today-link">📞 ' + escapeHtml(phone) + '</a>');
                    if (todayParts.length) {
                        todayLinksHtml = '<div class="life-cal-today-links">' + todayParts.join('') + '</div>';
                    }
                }
                html +=
                    '<div class=life-cal-item>' +
                        '<div class=life-cal-info>' +
                            '<a class="life-cal-label life-cal-event-link" href=#life-event/' + escapeHtml(item._id) + '>' + escapeHtml(item.label) + '</a>' +
                            todayLinksHtml +
                        '</div>' +
                        '<span class=life-cal-days>' + escapeHtml(dayLabel) + '</span>' +
                    '</div>';
            } else {
                var ageStr = '';
                if (item.year) {
                    var age = item.nextDate.getFullYear() - item.year;
                    if (age > 0) ageStr = '<span class=life-cal-age>turns ' + age + '</span>';
                }
                html +=
                    '<div class=life-cal-item>' +
                        '<div class=life-cal-info>' +
                            '<span class=life-cal-label>' + escapeHtml(item.label) + '</span>' +
                            '<a class=life-cal-person href=#contact/' + escapeHtml(item.personId) + '>' + escapeHtml(item.personName) + '</a>' +
                            ageStr +
                        '</div>' +
                        '<span class=life-cal-days>' + escapeHtml(dayLabel) + '</span>' +
                    '</div>';
            }
        });

        container.innerHTML = html;
        section.style.display = '';

    } catch (err) {
        console.error('loadLifePage error:', err);
        section.style.display = 'none';
    }
}

// ============================================================
// LIFE PAGE — TILE ORDER (drag-and-drop reorder on desktop)
// ============================================================

// Loads the saved tile order from Firestore, applies it to the DOM,
// and (on pointer/mouse devices only) wires up drag-and-drop handles.
async function _lifeInitTileOrder() {
    var grid = document.getElementById('lifeFeatureGrid');
    if (!grid) return;

    // Guard: only set up drag listeners once per grid instance.
    // The grid is static HTML that persists across navigations, so we
    // track initialisation with a data attribute.
    var alreadyDraggable = grid.dataset.dragInit === 'true';

    try {
        var doc = await userCol('settings').doc('lifeTileOrder').get();
        var savedOrder = doc.exists ? (doc.data().order || []) : [];
        _lifeApplyTileOrder(grid, savedOrder);
    } catch (e) {
        // Non-fatal: leave tiles in default HTML order if Firestore fails.
    }

    if (!alreadyDraggable && window.matchMedia('(pointer: fine)').matches) {
        _lifeSetupDrag(grid);
        grid.dataset.dragInit = 'true';
    } else if (alreadyDraggable) {
        // Re-add handles to any tiles that were freshly reordered into the DOM
        // (handles survive because the tiles themselves are persistent elements).
    }
}

// Reorders tile elements in the grid according to the saved order array.
// Tiles whose ID is not in the saved array are appended after the rest.
function _lifeApplyTileOrder(grid, order) {
    if (!order || order.length === 0) return;
    var tiles = Array.from(grid.querySelectorAll('[data-tile-id]'));
    tiles.sort(function(a, b) {
        var ia = order.indexOf(a.dataset.tileId);
        var ib = order.indexOf(b.dataset.tileId);
        if (ia === -1) ia = 999;
        if (ib === -1) ib = 999;
        return ia - ib;
    });
    tiles.forEach(function(tile) { grid.appendChild(tile); });
}

// Adds drag handles to each tile and wires the grid's HTML5 DnD events.
// Called once per page session (guarded by grid.dataset.dragInit).
function _lifeSetupDrag(grid) {
    var dragging = null;

    // Add grip handle and draggable attribute to every tile
    Array.from(grid.querySelectorAll('[data-tile-id]')).forEach(function(tile) {
        tile.setAttribute('draggable', 'true');
        if (!tile.querySelector('.life-drag-handle')) {
            var handle = document.createElement('span');
            handle.className = 'life-drag-handle';
            handle.textContent = '⣿'; // ⣿ braille dots — classic grip icon
            handle.setAttribute('aria-hidden', 'true');
            tile.appendChild(handle);
        }
    });

    grid.addEventListener('dragstart', function(e) {
        var tile = e.target.closest('[data-tile-id]');
        if (!tile) return;
        dragging = tile;
        e.dataTransfer.effectAllowed = 'move';
        // Delay so the browser captures the un-faded tile as the drag image
        setTimeout(function() { tile.classList.add('life-tile--dragging'); }, 0);
    });

    grid.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        var target = e.target.closest('[data-tile-id]');
        if (!target || target === dragging) return;
        grid.querySelectorAll('.life-tile--drop-before, .life-tile--drop-after').forEach(function(el) {
            el.classList.remove('life-tile--drop-before', 'life-tile--drop-after');
        });
        var rect = target.getBoundingClientRect();
        target.classList.add(e.clientX < rect.left + rect.width / 2
            ? 'life-tile--drop-before'
            : 'life-tile--drop-after');
    });

    grid.addEventListener('dragleave', function(e) {
        // Only clear indicators when the cursor truly leaves the grid
        if (!grid.contains(e.relatedTarget)) {
            _lifeClearDragClasses(grid);
        }
    });

    grid.addEventListener('drop', function(e) {
        e.preventDefault();
        var target = e.target.closest('[data-tile-id]');
        _lifeClearDragClasses(grid);
        if (!target || !dragging || target === dragging) return;
        var rect = target.getBoundingClientRect();
        var insertBefore = e.clientX < rect.left + rect.width / 2;
        grid.insertBefore(dragging, insertBefore ? target : target.nextSibling);
        _lifeSaveTileOrder(grid);
    });

    grid.addEventListener('dragend', function() {
        _lifeClearDragClasses(grid);
        dragging = null;
    });
}

function _lifeClearDragClasses(grid) {
    grid.querySelectorAll('.life-tile--dragging, .life-tile--drop-before, .life-tile--drop-after')
        .forEach(function(el) {
            el.classList.remove('life-tile--dragging', 'life-tile--drop-before', 'life-tile--drop-after');
        });
}

async function _lifeSaveTileOrder(grid) {
    var order = Array.from(grid.querySelectorAll('[data-tile-id]'))
        .map(function(t) { return t.dataset.tileId; });
    try {
        await userCol('settings').doc('lifeTileOrder').set({ order: order }, { merge: true });
    } catch (e) {
        console.error('Failed to save tile order', e);
    }
}

// ============================================================
// CONTACT PICKER  (reusable searchable contact picker component)
// Used by: Phase 2 (Care Team), Phase 3 (Appointments),
//          and any future feature needing a contact lookup.
// ============================================================

/**
 * Build a searchable contact picker inside a container element.
 *
 * Usage:
 *   buildContactPicker('myContainerId', {
 *     filterCategory: 'Medical Professional',   // optional
 *     placeholder:    'Search providers...',     // optional
 *     initialId:      existingContactId,         // optional — pre-select a contact
 *     initialName:    existingContactName,        // optional
 *     allowCreate:    true,                       // show "+ Create new contact"
 *     onSelect: function(id, name) { ... }        // called when user picks or clears
 *   });
 *
 * The container will contain:
 *   - A text input for searching
 *   - A dropdown list of matching contacts
 *   - A hidden input storing the selected contact ID (name: containerId + '_id')
 *
 * @param {string}   containerId
 * @param {Object}   options
 */
function buildContactPicker(containerId, options) {
    options = options || {};
    var container = document.getElementById(containerId);
    if (!container) return;

    var filterCat       = options.filterCategory  || null;
    var placeholder     = options.placeholder     || 'Search contacts…';
    var allowCreate     = options.allowCreate     || false;
    var onSelect        = options.onSelect        || function() {};
    var facilityPickerId = options.facilityPickerId || null;  // show facility staff on focus
    var inputId     = containerId + '_search';
    var hiddenId    = containerId + '_id';

    // Build the HTML structure
    container.innerHTML =
        '<div class="contact-picker-wrap">' +
            '<input type="text" id="' + inputId + '" class="contact-picker-input"' +
                   ' placeholder="' + escapeHtml(placeholder) + '" autocomplete="off">' +
            '<input type="hidden" id="' + hiddenId + '">' +
            '<div class="contact-picker-dropdown" id="' + containerId + '_drop" style="display:none;"></div>' +
        '</div>';

    var searchInput = document.getElementById(inputId);
    var hiddenInput = document.getElementById(hiddenId);
    var dropdown    = document.getElementById(containerId + '_drop');

    // Pre-populate if an initial value was provided
    if (options.initialId) {
        hiddenInput.value = options.initialId;
        if (options.initialName) {
            searchInput.value = options.initialName;
        } else {
            // Name not cached on the doc — fetch it from the people collection
            userCol('people').doc(options.initialId).get().then(function(doc) {
                if (doc.exists && !searchInput.value) {
                    searchInput.value = doc.data().name || '';
                }
            });
        }
    }

    // All contacts cache — loaded once on first open
    var _allContacts = null;

    async function _loadContacts() {
        if (_allContacts) return _allContacts;
        try {
            // When filtering by category, load ALL contacts (including sub-contacts like
            // staff members under a Medical Facility) so they appear in the picker.
            // Without a category filter, show only top-level contacts to avoid clutter.
            var query = filterCat
                ? userCol('people').where('category', '==', filterCat)
                : userCol('people').where('parentPersonId', '==', null);
            var snap = await query.get();
            _allContacts = [];
            snap.forEach(function(doc) {
                _allContacts.push(Object.assign({ id: doc.id }, doc.data()));
            });
            _allContacts.sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
        } catch (e) {
            console.error('ContactPicker load error:', e);
            _allContacts = [];
        }
        return _allContacts;
    }

    function _renderDropdown(matches, query) {
        if (!matches.length && !allowCreate) {
            dropdown.style.display = 'none';
            return;
        }
        var html = '';
        matches.forEach(function(c) {
            var sub = c.specialty ? '<span class="contact-picker-sub">' + escapeHtml(c.specialty) + '</span>' : '';
            html += '<div class="contact-picker-item" data-id="' + escapeHtml(c.id) + '" data-name="' + escapeHtml(c.name || '') + '">' +
                        escapeHtml(c.name || 'Unnamed') + sub +
                    '</div>';
        });
        if (allowCreate && query) {
            html += '<div class="contact-picker-create" data-query="' + escapeHtml(query) + '">' +
                        '+ Create new contact: <strong>' + escapeHtml(query) + '</strong>' +
                    '</div>';
        } else if (allowCreate && !matches.length) {
            html += '<div class="contact-picker-create contact-picker-create--empty">' +
                        'No matches. Type a name to create a new contact.' +
                    '</div>';
        }
        dropdown.innerHTML = html;
        dropdown.style.display = '';

        // Wire item clicks
        dropdown.querySelectorAll('.contact-picker-item').forEach(function(item) {
            item.addEventListener('mousedown', function(e) {
                e.preventDefault(); // prevent blur firing first
                _selectContact(this.dataset.id, this.dataset.name);
            });
        });

        // Wire create click
        var createEl = dropdown.querySelector('.contact-picker-create');
        if (createEl && createEl.dataset.query) {
            createEl.addEventListener('mousedown', function(e) {
                e.preventDefault();
                _createNewContact(this.dataset.query, filterCat);
            });
        }
    }

    function _selectContact(id, name) {
        hiddenInput.value  = id;
        searchInput.value  = name;
        dropdown.style.display = 'none';
        onSelect(id, name);
    }

    function _clearSelection() {
        hiddenInput.value  = '';
        onSelect('', '');
    }

    async function _createNewContact(name, category) {
        // Open the contact add modal pre-filled with the name and category,
        // and wire a one-time callback to select the new contact when saved.
        dropdown.style.display = 'none';

        // Store a pending callback on the modal that handleContactModalSave will call
        window._contactPickerCallback = function(newId, newName) {
            hiddenInput.value = newId;
            searchInput.value = newName;
            // Force-reload the contacts cache for next time
            _allContacts = null;
            onSelect(newId, newName);
            window._contactPickerCallback = null;
        };

        // Pre-fill and open the contact modal
        openAddContactModal(null);
        document.getElementById('personNameInput').value = name;
        if (category) {
            _populateContactCategorySelect('personCategorySelect', category);
            _configureTypeFields(category);
        }
    }

    searchInput.addEventListener('input', async function() {
        var query = this.value.trim().toLowerCase();
        if (!query) {
            _clearSelection();
            dropdown.style.display = 'none';
            return;
        }
        var contacts = await _loadContacts();
        var matches  = contacts.filter(function(c) {
            return (c.name      || '').toLowerCase().includes(query) ||
                   (c.specialty || '').toLowerCase().includes(query);
        });
        _renderDropdown(matches, this.value.trim());
    });

    // Load staff sub-contacts of the currently-selected facility
    async function _loadFacilityStaff(facilityId) {
        try {
            var q    = userCol('people').where('parentPersonId', '==', facilityId);
            var snap = await q.get();
            var staff = [];
            snap.forEach(function(doc) {
                var d = Object.assign({ id: doc.id }, doc.data());
                if (!filterCat || d.category === filterCat) staff.push(d);
            });
            staff.sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
            return staff;
        } catch(e) { return []; }
    }

    searchInput.addEventListener('focus', async function() {
        var query = this.value.trim().toLowerCase();
        if (query.length > 0) {
            // Re-show filtered results while field has text
            var contacts = await _loadContacts();
            var matches  = contacts.filter(function(c) {
                return (c.name      || '').toLowerCase().includes(query) ||
                       (c.specialty || '').toLowerCase().includes(query);
            });
            _renderDropdown(matches, this.value.trim());
        } else if (facilityPickerId) {
            // If a facility is already selected, show its staff as quick suggestions
            var facId = (document.getElementById(facilityPickerId + '_id') || {}).value || '';
            if (facId) {
                var staff = await _loadFacilityStaff(facId);
                if (staff.length > 0) {
                    // Prefix dropdown with a non-selectable header row
                    var facNameEl = document.getElementById(facilityPickerId + '_search');
                    var facName   = facNameEl ? facNameEl.value.trim() : 'Facility';
                    var html = '<div class="contact-picker-section-header">Staff at ' + escapeHtml(facName) + '</div>';
                    staff.forEach(function(c) {
                        var sub = c.specialty ? '<span class="contact-picker-sub">' + escapeHtml(c.specialty) + '</span>' : '';
                        html += '<div class="contact-picker-item" data-id="' + escapeHtml(c.id) + '" data-name="' + escapeHtml(c.name || '') + '">' +
                                    escapeHtml(c.name || 'Unnamed') + sub +
                                '</div>';
                    });
                    dropdown.innerHTML = html;
                    dropdown.style.display = '';
                    dropdown.querySelectorAll('.contact-picker-item').forEach(function(item) {
                        item.addEventListener('mousedown', function(e) {
                            e.preventDefault();
                            _selectContact(this.dataset.id, this.dataset.name);
                        });
                    });
                }
            }
        }
    });

    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            var first = dropdown.querySelector('.contact-picker-item');
            if (first && dropdown.style.display !== 'none') {
                _selectContact(first.dataset.id, first.dataset.name);
            }
        }
    });

    searchInput.addEventListener('blur', function() {
        // Small delay so mousedown on dropdown items fires before blur hides them
        setTimeout(function() { dropdown.style.display = 'none'; }, 150);
        // If the user cleared the field, clear the hidden value too
        if (!searchInput.value.trim()) {
            _clearSelection();
        }
    });

    // Expose a method to get the current selected contact ID
    container._getSelectedId   = function() { return hiddenInput.value; };
    container._getSelectedName = function() { return searchInput.value; };
    container._reset           = function() {
        hiddenInput.value = '';
        searchInput.value = '';
        dropdown.style.display = 'none';
    };
}

// Patch handleContactModalSave to call the pending picker callback when creating via picker
(function() {
    var _orig = handleContactModalSave;
    handleContactModalSave = async function() {
        var modal  = document.getElementById('personModal');
        var isAdd  = modal.dataset.mode === 'add';
        var cb     = window._contactPickerCallback;

        if (isAdd && cb) {
            // We need to intercept the save to capture the new ID.
            // Re-implement the add path here to capture the new doc ref.
            var name = document.getElementById('personNameInput').value.trim();
            if (!name) { alert('Name is required.'); return; }
            var catVal = document.getElementById('personCategorySelect').value || 'Personal';
            var data = {
                name:        name,
                nickname:    document.getElementById('personNicknameInput').value.trim(),
                howKnown:    document.getElementById('personHowKnownInput').value.trim(),
                phone:       formatPhoneNumber(document.getElementById('personPhoneInput').value.trim()),
                email:       document.getElementById('personEmailInput').value.trim(),
                address:     document.getElementById('personAddressInput').value.trim(),
                website:     document.getElementById('personWebsiteInput').value.trim(),
                facebookUrl: document.getElementById('personFacebookInput').value.trim(),
                notes:       document.getElementById('personNotesInput').value.trim(),
                category:    catVal,
                specialty:   catVal === 'Medical Professional'
                                 ? document.getElementById('personSpecialtyInput').value.trim()
                                 : catVal === 'Service Professional'
                                     ? document.getElementById('personTradeSelect').value : '',
                personalType: catVal === 'Personal'
                                 ? document.getElementById('personPersonalTypeSelect').value : '',
                businessType: catVal === 'Business'
                                 ? document.getElementById('personBusinessTypeSelect').value : '',
                parentPersonId:   null,
                profilePhotoData: null,
                createdAt:        firebase.firestore.FieldValue.serverTimestamp()
            };
            try {
                var ref = await userCol('people').add(data);
                closeModal('personModal');
                cb(ref.id, name);
            } catch (err) {
                console.error('handleContactModalSave (picker) error:', err);
                alert('Error saving contact.');
            }
        } else {
            return _orig.apply(this, arguments);
        }
    };
})();
