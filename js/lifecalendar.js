// ============================================================
// lifecalendar.js — Life Calendar feature
// Personal event tracking with categories, mini logs, and
// journal integration.
// ============================================================

// ---------- Module State ----------

/** The currently loaded life event (for detail page). */
window.currentLifeEvent = null;

/**
 * Pre-filled date for new event creation.
 * Set by loadLifeCalendarPage() when user clicks a day cell.
 * Consumed (and cleared) by loadNewLifeEventPage().
 */
window._newEventDate = null;

/** The category currently being edited in the category modal (null = new). */
var _lcEditingCategoryId = null;

/**
 * Tracks unsaved changes on the event form.
 * Set to true on any field change; cleared on save.
 * Checked on hashchange to warn the user before navigating away.
 */
var _lcEventDirty = false;

/** ID of the event currently being edited (null = new event). */
var _lcEditingEventId = null;

/**
 * People IDs currently selected on the event form.
 * Populated from the loaded event on edit, or empty on new.
 */
var _lcSelectedPeopleIds = [];

/**
 * Full people list loaded once per event page visit.
 * Each entry: { id, name }
 */
var _lcAllPeople = [];

/**
 * Links currently on the event form.
 * Each entry: { label, url }
 */
var _lcEventLinks = [];

/**
 * Categories cached for template lookup on the event form.
 * Populated by loadNewLifeEventPage / loadLifeEventPage.
 */
var _lcAllCategories = [];

// ---------- LC-8: Calendar page filter state ----------

/** Status filter value for the calendar event list. */
var _lcStatusFilter   = 'upcoming'; // 'upcoming'|'upcoming+attended'|'attended'|'missed'|'all'

/** Category ID filter — empty string means All Categories. */
var _lcCategoryFilter = '';

/** Search query (filters title + location client-side). */
var _lcSearchQuery    = '';

/** All events loaded for the calendar page (unfiltered). */
var _lcAllEvents      = [];

/**
 * Health appointments loaded for the calendar page.
 * Normalized into a calendar-compatible shape (see _lcNormalizeAppointment).
 */
var _lcAllAppointments = [];

// ---------- LC-9: Grid view state ----------

/** Current view mode. null until first page load, then 'list' or 'grid'. */
var _lcViewMode  = null;

/** Show past 30 days toggle for list view. Off by default, not sticky (reset on page load). */
var _lcShowPast  = false;

/** Year currently displayed on the grid (full 4-digit). */
var _lcGridYear  = 0;

/** Month currently displayed on the grid (0-indexed, JS Date convention). */
var _lcGridMonth = 0;

// Template keys for each known category type.
// 'travel' intentionally has no extra fields (marker only).
var LC_TEMPLATE_KEYS = ['race', 'concert', 'golf', 'sports'];

/**
 * Color swatches for category color picker.
 * Reuses the same gradient set as notebooks for visual consistency.
 */
var LC_COLOR_SWATCHES = [
    { label: 'Sky',      gradient: 'linear-gradient(135deg, #0284c7, #38bdf8)' },
    { label: 'Teal',     gradient: 'linear-gradient(135deg, #0d9488, #34d399)' },
    { label: 'Green',    gradient: 'linear-gradient(135deg, #16a34a, #4ade80)' },
    { label: 'Amber',    gradient: 'linear-gradient(135deg, #d97706, #fbbf24)' },
    { label: 'Rose',     gradient: 'linear-gradient(135deg, #e11d48, #fb7185)' },
    { label: 'Violet',   gradient: 'linear-gradient(135deg, #7c3aed, #c4b5fd)' },
    { label: 'Indigo',   gradient: 'linear-gradient(135deg, #6366f1, #a5b4fc)' },
    { label: 'Gray',     gradient: 'linear-gradient(135deg, #6b7280, #9ca3af)' },
    { label: 'Orange',   gradient: 'linear-gradient(135deg, #ea580c, #fb923c)' },
    { label: 'Pink',     gradient: 'linear-gradient(135deg, #db2777, #f472b6)' },
    { label: 'Lime',     gradient: 'linear-gradient(135deg, #65a30d, #a3e635)' },
    { label: 'Cyan',     gradient: 'linear-gradient(135deg, #0891b2, #67e8f9)' },
    { label: 'Purple',   gradient: 'linear-gradient(135deg, #9333ea, #d8b4fe)' },
    { label: 'Brown',    gradient: 'linear-gradient(135deg, #92400e, #d97706)' },
    { label: 'Midnight', gradient: 'linear-gradient(135deg, #1e1b4b, #4338ca)' },
    { label: 'Forest',   gradient: 'linear-gradient(135deg, #14532d, #22c55e)' },
];

/**
 * The 5 categories auto-seeded on first visit.
 * template links to category-specific field schemas (used in LC-5).
 */
var LC_SEED_CATEGORIES = [
    { name: 'Races',         template: 'race',    color: LC_COLOR_SWATCHES[1].gradient, sortOrder: 1 },
    { name: 'Concerts',      template: 'concert', color: LC_COLOR_SWATCHES[4].gradient, sortOrder: 2 },
    { name: 'Golf',          template: 'golf',    color: LC_COLOR_SWATCHES[2].gradient, sortOrder: 3 },
    { name: 'Travel',        template: 'travel',  color: LC_COLOR_SWATCHES[0].gradient, sortOrder: 4 },
    { name: 'Sports Events', template: 'sports',  color: LC_COLOR_SWATCHES[3].gradient, sortOrder: 5 },
];

// ============================================================
// Category — Firestore CRUD
// ============================================================

/**
 * Load all life categories ordered by sortOrder, then name.
 * @returns {Array} Array of { id, name, color, template, sortOrder }
 */
async function lcLoadCategories() {
    var snap = await userCol('lifeCategories').orderBy('sortOrder').get();
    return snap.docs.map(function(doc) {
        return { id: doc.id, ...doc.data() };
    });
}

/**
 * Create a new life category.
 * @param {string} name      - Category name
 * @param {string} color     - CSS gradient string
 * @param {string} template  - Template key (e.g. 'race', 'golf', or '' for generic)
 * @returns {string} New doc ID
 */
async function lcAddCategory(name, color, template) {
    // Assign sortOrder = max existing + 1
    var snap = await userCol('lifeCategories').orderBy('sortOrder', 'desc').limit(1).get();
    var nextOrder = snap.empty ? 1 : (snap.docs[0].data().sortOrder || 0) + 1;

    var ref = await userCol('lifeCategories').add({
        name:      name.trim(),
        color:     color,
        template:  template || '',
        sortOrder: nextOrder,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return ref.id;
}

/**
 * Update an existing life category's name and color.
 * @param {string} id    - Category doc ID
 * @param {string} name  - New name
 * @param {string} color - New CSS gradient
 */
async function lcUpdateCategory(id, name, color) {
    await userCol('lifeCategories').doc(id).update({
        name:  name.trim(),
        color: color
    });
}

/**
 * Delete a life category.
 * If any lifeEvents reference this category, shows the reassignment modal instead.
 * @param {string} id - Category doc ID
 */
async function lcDeleteCategory(id) {
    // Check for events using this category
    var eventsSnap = await userCol('lifeEvents').where('categoryId', '==', id).get();

    if (!eventsSnap.empty) {
        // Show reassignment modal
        _lcShowDeleteCategoryModal(id, eventsSnap.docs);
        return;
    }

    // No events — simple confirm + delete
    if (!confirm('Delete this category?')) return;
    await userCol('lifeCategories').doc(id).delete();
    loadLifeCalendarPage();
}

// ============================================================
// Event — Firestore CRUD
// ============================================================

/**
 * Create a new life event in Firestore.
 * @param {Object} data - Event fields (title, categoryId, startDate, etc.)
 * @returns {string} New document ID
 */
async function lcAddEvent(data) {
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    var ref = await userCol('lifeEvents').add(data);
    return ref.id;
}

/**
 * Update an existing life event.
 * @param {string} id   - Firestore doc ID
 * @param {Object} data - Fields to update
 */
async function lcUpdateEvent(id, data) {
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    await userCol('lifeEvents').doc(id).update(data);
}

/**
 * Delete a life event and cascade-delete its mini logs and photos.
 * Journal entries that reference this event are left intact.
 * @param {string} id - Firestore doc ID
 */
async function lcDeleteEvent(id) {
    var batch = firebase.firestore().batch();

    // Delete mini logs
    var logsSnap = await userCol('lifeEventLogs').where('eventId', '==', id).get();
    logsSnap.docs.forEach(function(doc) { batch.delete(doc.ref); });

    // Delete photos
    var photosSnap = await userCol('photos')
        .where('targetType', '==', 'lifeEvent')
        .where('targetId', '==', id)
        .get();
    photosSnap.docs.forEach(function(doc) { batch.delete(doc.ref); });

    // Delete the event itself
    batch.delete(userCol('lifeEvents').doc(id));

    await batch.commit();
}

// ============================================================
// Mini Log — Firestore CRUD
// ============================================================

/**
 * Add a mini log entry for a life event.
 * @param {string} eventId   - Parent event doc ID
 * @param {string} body      - Entry text (may contain @name mentions)
 * @param {Array}  mentionedPersonIds - Person IDs mentioned
 * @param {string} logDate   - ISO date string (YYYY-MM-DD)
 * @param {string} logTime   - HH:MM time string
 * @returns {string} New log doc ID
 */
async function lcAddLog(eventId, body, mentionedPersonIds, logDate, logTime) {
    var ref = await userCol('lifeEventLogs').add({
        eventId:            eventId,
        body:               body,
        mentionedPersonIds: mentionedPersonIds || [],
        logDate:            logDate || '',
        logTime:            logTime || '',
        createdAt:          firebase.firestore.FieldValue.serverTimestamp()
    });
    return ref.id;
}

/**
 * Update an existing mini log entry's body text.
 * @param {string} logId             - Log doc ID
 * @param {string} body              - New body text
 * @param {Array}  mentionedPersonIds - Updated person IDs mentioned
 */
async function lcUpdateLog(logId, body, mentionedPersonIds) {
    await userCol('lifeEventLogs').doc(logId).update({
        body:               body,
        mentionedPersonIds: mentionedPersonIds || [],
        updatedAt:          firebase.firestore.FieldValue.serverTimestamp()
    });
}

/**
 * Delete a mini log entry.
 * @param {string} logId - Log doc ID
 */
async function lcDeleteLog(logId) {
    await userCol('lifeEventLogs').doc(logId).delete();
}

/**
 * Load all mini log entries for an event, sorted oldest first.
 * @param {string} eventId
 * @returns {Array} Array of { id, body, mentionedPersonIds, logDate, logTime, createdAt }
 */
async function lcLoadLogs(eventId) {
    // Single-field filter only (no composite index needed).
    // Sort client-side by logDate + logTime.
    var snap = await userCol('lifeEventLogs')
        .where('eventId', '==', eventId)
        .get();
    var docs = snap.docs.map(function(doc) {
        return { id: doc.id, ...doc.data() };
    });
    docs.sort(function(a, b) {
        var aKey = (a.logDate || '') + (a.logTime || '');
        var bKey = (b.logDate || '') + (b.logTime || '');
        return aKey.localeCompare(bKey);
    });
    return docs;
}

// ============================================================
// People — load for picker
// ============================================================

/**
 * Load all people for the current user, sorted by name.
 * Used to populate the people picker autocomplete.
 * @returns {Array} Array of { id, name }
 */
async function lcLoadPeople() {
    var snap = await pplCol('people').orderBy('name').get();
    return snap.docs.map(function(doc) {
        var d = doc.data();
        return { id: doc.id, name: d.name || '', howKnown: d.howKnown || '', quickMention: !!d.quickMention };
    });
}

// ============================================================
// Category — Auto-seed on first visit
// ============================================================

/**
 * Checks if lifeCategories is empty for this user.
 * If so, seeds the 5 default categories.
 */
async function lcEnsureDefaultCategories() {
    var snap = await userCol('lifeCategories').limit(1).get();
    if (!snap.empty) return; // already seeded

    var batch = firebase.firestore().batch();
    var now = firebase.firestore.FieldValue.serverTimestamp();

    LC_SEED_CATEGORIES.forEach(function(cat) {
        var ref = userCol('lifeCategories').doc();
        batch.set(ref, {
            name:      cat.name,
            color:     cat.color,
            template:  cat.template,
            sortOrder: cat.sortOrder,
            createdAt: now
        });
    });

    await batch.commit();
}

// ============================================================
// Category — UI helpers
// ============================================================

/**
 * Renders the color swatch circles in the category modal.
 * @param {string} selectedGradient - The currently selected gradient string
 */
function lcRenderCategorySwatches(selectedGradient) {
    var container = document.getElementById('lcCategoryColorSwatches');
    if (!container) return;
    container.innerHTML = '';

    LC_COLOR_SWATCHES.forEach(function(swatch) {
        var el = document.createElement('div');
        el.className = 'notes-color-swatch' + (swatch.gradient === selectedGradient ? ' selected' : '');
        el.style.background = swatch.gradient;
        el.title = swatch.label;
        el.addEventListener('click', function() {
            container.querySelectorAll('.notes-color-swatch').forEach(function(s) {
                s.classList.remove('selected');
            });
            el.classList.add('selected');
            document.getElementById('lcCategoryColorValue').value = swatch.gradient;
        });
        container.appendChild(el);
    });
}

/**
 * Opens the category add/edit modal.
 * @param {Object|null} category - Existing category object (null = new)
 */
function lcOpenCategoryModal(category) {
    _lcEditingCategoryId = category ? category.id : null;

    var title    = document.getElementById('lcCategoryModalTitle');
    var nameInput = document.getElementById('lcCategoryNameInput');
    var colorInput = document.getElementById('lcCategoryColorValue');

    title.textContent = category ? 'Edit Category' : 'Add Category';
    nameInput.value   = category ? category.name  : '';

    var selectedColor = (category && category.color) ? category.color : LC_COLOR_SWATCHES[0].gradient;
    colorInput.value  = selectedColor;
    lcRenderCategorySwatches(selectedColor);

    openModal('lcCategoryModal');
    nameInput.focus();
}

/**
 * Shows the delete-category reassignment modal.
 * Lists the affected events and lets user pick a replacement category before deleting.
 * @param {string}   deletingId   - ID of category being deleted
 * @param {Array}    eventDocs    - Firestore QueryDocumentSnapshot array
 */
async function _lcShowDeleteCategoryModal(deletingId, eventDocs) {
    // Load all categories except the one being deleted
    var allCats = await lcLoadCategories();
    var others  = allCats.filter(function(c) { return c.id !== deletingId; });

    if (others.length === 0) {
        alert('Cannot delete the last category. Add another category first.');
        return;
    }

    // Build event list HTML
    var evList = eventDocs.map(function(doc) {
        return '<li>' + escapeHtml(doc.data().title || '(untitled)') + '</li>';
    }).join('');

    // Build replacement dropdown
    var opts = others.map(function(c) {
        return '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>';
    }).join('');

    var container = document.getElementById('lcDeleteCategoryBody');
    container.innerHTML =
        '<p>The following events use this category. Choose a replacement before deleting:</p>' +
        '<ul class="lc-delete-event-list">' + evList + '</ul>' +
        '<div class="form-group" style="margin-top:12px;">' +
        '<label>Move events to:</label>' +
        '<select id="lcReplacementCategorySelect" class="form-control">' + opts + '</select>' +
        '</div>';

    // Wire confirm button
    var confirmBtn = document.getElementById('lcDeleteCategoryConfirmBtn');
    // Remove any old listener
    var fresh = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(fresh, confirmBtn);

    fresh.addEventListener('click', async function() {
        var replacementId = document.getElementById('lcReplacementCategorySelect').value;
        if (!replacementId) return;

        // Batch-update all affected events
        var batch = firebase.firestore().batch();
        eventDocs.forEach(function(doc) {
            batch.update(userCol('lifeEvents').doc(doc.id), { categoryId: replacementId });
        });
        await batch.commit();

        // Delete the category
        await userCol('lifeCategories').doc(deletingId).delete();
        closeModal('lcDeleteCategoryModal');
        loadLifeCalendarPage();
    });

    openModal('lcDeleteCategoryModal');
}

/**
 * Renders the category tile grid on the Life Calendar page.
 * @param {Array}  categories - Array of category objects
 * @param {Element} container - DOM element to render into
 */
function lcRenderCategoryTiles(categories, container) {
    if (categories.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);padding:8px 0;">No categories yet.</p>';
        return;
    }

    container.innerHTML = '';
    categories.forEach(function(cat) {
        var tile = document.createElement('div');
        tile.className = 'lc-category-tile';
        tile.style.background = cat.color;

        tile.innerHTML =
            '<span class="lc-category-tile-name">' + escapeHtml(cat.name) + '</span>' +
            '<div class="lc-category-tile-actions">' +
            '<button class="lc-tile-btn" data-action="edit" title="Edit">✏️</button>' +
            '<button class="lc-tile-btn" data-action="delete" title="Delete">🗑️</button>' +
            '</div>';

        tile.querySelector('[data-action="edit"]').addEventListener('click', function(e) {
            e.stopPropagation();
            lcOpenCategoryModal(cat);
        });
        tile.querySelector('[data-action="delete"]').addEventListener('click', function(e) {
            e.stopPropagation();
            lcDeleteCategory(cat.id);
        });

        container.appendChild(tile);
    });
}

// ============================================================
// Page Loaders
// ============================================================

// ============================================================
// LC-8 helpers — event list rendering
// ============================================================

/**
 * Format a time string (HH:MM 24-hour) to 12-hour display (e.g. "7:30pm", "2pm").
 * Returns '' if timeStr is falsy.
 * @param {string} timeStr - HH:MM
 * @returns {string}
 */
function _lcFormatTime(timeStr) {
    if (!timeStr) return '';
    var parts = timeStr.split(':');
    var h = parseInt(parts[0], 10);
    var m = parts[1] || '00';
    var ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return (m === '00') ? (h + ampm) : (h + ':' + m + ampm);
}

/**
 * Format a date range for display on event cards.
 * @param {string} startDate - ISO date (YYYY-MM-DD)
 * @param {string} endDate   - ISO date or '' for single-day
 * @returns {string}
 */
function _lcFormatDateRange(startDate, endDate) {
    if (!startDate) return '';
    // Use T00:00:00 to parse as local time (not UTC)
    var s = new Date(startDate + 'T00:00:00');
    var fullOpts  = { month: 'short', day: 'numeric', year: 'numeric' };
    var shortOpts = { month: 'short', day: 'numeric' };
    if (!endDate || endDate === startDate) {
        return s.toLocaleDateString('en-US', fullOpts);
    }
    var e = new Date(endDate + 'T00:00:00');
    if (s.getFullYear() === e.getFullYear()) {
        // "Apr 3 – Oct 11, 2026"
        return s.toLocaleDateString('en-US', shortOpts) + ' \u2013 ' +
               e.toLocaleDateString('en-US', fullOpts);
    }
    // Cross-year: "Dec 30, 2025 – Jan 2, 2026"
    return s.toLocaleDateString('en-US', fullOpts) + ' \u2013 ' +
           e.toLocaleDateString('en-US', fullOpts);
}

/**
 * Return a human-readable status label.
 * @param {string} status
 * @returns {string}
 */
function _lcStatusLabel(status) {
    if (status === 'attended') return 'Attended';
    if (status === 'didntgo')  return "Didn't Go";
    return 'Upcoming';
}

// Fixed gradient color used for all appointment bars/cards.
var LC_APPT_COLOR = 'linear-gradient(135deg,#ef4444,#f87171)';

/**
 * Normalize a healthAppointments Firestore document into a calendar-compatible
 * event object so it can be rendered alongside life events.
 * @param {string} id   - Firestore document ID
 * @param {Object} data - Firestore document data
 * @returns {Object}
 */
function _lcNormalizeAppointment(id, data) {
    var provider = data.providerText || data.facilityText || '';
    var title    = data.type || 'Appointment';
    if (provider) title += ' – ' + provider;
    return {
        id:                id,
        _kind:             'appt',
        _apptStatus:       data.status || 'scheduled',
        startDate:         data.date   || '',
        startTime:         data.time   || '',
        title:             title,
        notes:             data.notes  || '',
        facilityContactId: data.facilityContactId || null,
        facilityText:      data.facilityText      || ''
    };
}

/** contactId → {name, phone, address} for facility contacts used in appointments */
var _lcFacilityContactMap = {};

/**
 * Return appointments to include for the current view.
 * - Grid view:  all appointments except cancelled (shows past ones too)
 * - List view:  filtered by status to match the user's current status filter
 * @param {boolean} forGrid
 * @returns {Array}
 */
function _lcGetAppointmentsForView(forGrid) {
    return _lcAllAppointments.filter(function(a) {
        if (a._apptStatus === 'cancelled') return false;

        if (forGrid) {
            // Grid shows all non-cancelled regardless of status filter
            // Category filter suppresses appointments when a specific category is selected
            if (_lcCategoryFilter) return false;
            return true;
        }

        // List view — map appointment status to the life-event status filter
        // scheduled = upcoming, completed = attended, converted = treated like attended
        if (_lcStatusFilter === 'upcoming'          && a._apptStatus !== 'scheduled')  return false;
        if (_lcStatusFilter === 'upcoming+attended' && a._apptStatus === 'cancelled')  return false;
        if (_lcStatusFilter === 'attended'          && a._apptStatus !== 'completed')  return false;
        if (_lcStatusFilter === 'missed')  return false; // no "missed" concept for appointments
        // Date cutoff for list view (same logic as _lcGetFilteredEvents)
        if (_lcStatusFilter === 'upcoming' || _lcStatusFilter === 'upcoming+attended') {
            var today2 = new Date(); today2.setHours(0, 0, 0, 0);
            var cutoff2 = _lcShowPast
                ? new Date(today2.getTime() - 30 * 24 * 60 * 60 * 1000)
                : today2;
            if ((a.startDate || '') < cutoff2.toISOString().slice(0, 10)) return false;
        }
        // Category filter: appointments have no category → exclude when a category is selected
        if (_lcCategoryFilter) return false;
        // Search filter
        if (_lcSearchQuery) {
            var q = _lcSearchQuery.toLowerCase();
            if (!(a.title || '').toLowerCase().includes(q)) return false;
        }
        return true;
    });
}

/**
 * Return the current events array with all filters applied (unsorted).
 * Shared by both list and grid render paths.
 * @returns {Array}
 */
function _lcGetFilteredEvents() {
    // Date cutoff for list view — applies only to "upcoming" / "upcoming+attended" filters.
    // "attended", "missed", "all" are intentionally past-looking so no cutoff is applied.
    var listDateCutoff = null;
    if (_lcViewMode !== 'grid' &&
        (_lcStatusFilter === 'upcoming' || _lcStatusFilter === 'upcoming+attended')) {
        var today = new Date(); today.setHours(0, 0, 0, 0);
        var cutoff = _lcShowPast
            ? new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
            : today;
        listDateCutoff = cutoff.toISOString().slice(0, 10);
    }

    var todayStr = _lcIsoDate(new Date());

    return _lcAllEvents.filter(function(ev) {
        var evDate = ev.startDate || '';

        // Bypass the status filter when we're looking at an upcoming-style filter but the
        // event has already been marked attended/didntgo (it happened — still worth showing).
        //
        // Grid view: ALWAYS bypass for all dates.  The grid is a calendar visualisation —
        //   health appointments already show unconditionally on the grid; life events should
        //   match that behaviour.  An event marked "attended" (even if its scheduled date is
        //   in the future, e.g. user went early) should stay visible on the grid.
        //
        // List view: bypass for events on or before today when "Show Past 30 Days" is on.
        //   The list has an explicit status filter dropdown for past-only views.
        //
        // Only applies to upcoming-style filters; "Attended only" / "Missed only" are
        // already past-looking and intentional, so they keep their own status filter.
        var isUpcomingStyleFilter = (_lcStatusFilter === 'upcoming' || _lcStatusFilter === 'upcoming+attended');
        var bypassStatusFilter    = isUpcomingStyleFilter &&
                                    (_lcViewMode === 'grid' ||
                                     (evDate <= todayStr && _lcShowPast));

        if (!bypassStatusFilter) {
            // Status filter (upcoming/future events, and non-bypassed past events)
            if (_lcStatusFilter === 'upcoming'          && ev.status !== 'upcoming')  return false;
            if (_lcStatusFilter === 'upcoming+attended' && ev.status === 'didntgo')   return false;
            if (_lcStatusFilter === 'attended'          && ev.status !== 'attended')  return false;
            if (_lcStatusFilter === 'missed'            && ev.status !== 'didntgo')   return false;
        }

        // Date cutoff (list view, upcoming-style filters only)
        if (listDateCutoff && evDate < listDateCutoff) return false;
        // Category filter
        if (_lcCategoryFilter && ev.categoryId !== _lcCategoryFilter) return false;
        // Search filter (title + location, case-insensitive)
        if (_lcSearchQuery) {
            var q   = _lcSearchQuery.toLowerCase();
            var hit = (ev.title    || '').toLowerCase().includes(q) ||
                      (ev.location || '').toLowerCase().includes(q);
            if (!hit) return false;
        }
        return true;
    });
}

/**
 * Apply current filter state and render to whichever view is active (list or grid).
 * Called whenever a filter control or view toggle changes.
 */
function _lcApplyFilters() {
    var filtered = _lcGetFilteredEvents();

    if (_lcViewMode === 'grid') {
        // Grid: merge all non-cancelled appointments (past ones included) with filtered events
        var appts = _lcGetAppointmentsForView(true);
        _lcRenderGrid(_lcGridYear, _lcGridMonth, filtered.concat(appts));
    } else {
        // List: merge status-filtered appointments with filtered events
        var appts = _lcGetAppointmentsForView(false);
        var all = filtered.concat(appts);
        // Sort: past-only views → newest first; everything else → soonest first
        var descending = (_lcStatusFilter === 'attended' || _lcStatusFilter === 'missed');
        all.sort(function(a, b) {
            var aDate = a.startDate || '';
            var bDate = b.startDate || '';
            if (aDate < bDate) return descending ? 1 : -1;
            if (aDate > bDate) return descending ? -1 : 1;
            return 0;
        });
        _lcRenderEventList(all, _lcAllCategories);
    }
}

/**
 * Render event cards into #lcEventList.
 * @param {Array} events     - Filtered + sorted events
 * @param {Array} categories - All categories (for color lookup)
 */
function _lcRenderEventList(events, categories) {
    var list = document.getElementById('lcEventList');
    if (!list) return;

    if (events.length === 0) {
        list.innerHTML = '<p class="empty-state">No events match your filters.</p>';
        return;
    }

    // Build category color + name maps for quick lookup
    var colorMap = {};
    var nameMap  = {};
    categories.forEach(function(c) {
        colorMap[c.id] = c.color || '';
        nameMap[c.id]  = c.name  || '';
    });

    list.innerHTML = events.map(function(ev) {
        var isAppt = ev._kind === 'appt';

        // Color: appointments use a fixed health-red; life events use category color
        var color  = isAppt
            ? LC_APPT_COLOR
            : (colorMap[ev.categoryId] || 'linear-gradient(135deg,#6b7280,#9ca3af)');

        // Dates: appointments have only a single date
        var dates  = _lcFormatDateRange(ev.startDate, isAppt ? '' : ev.endDate);

        // Status badge
        var statusLbl, statusCls;
        if (isAppt) {
            var apptStatusMap = {
                scheduled: ['Scheduled', 'upcoming'],
                completed: ['Completed', 'attended'],
                cancelled: ['Cancelled', 'didntgo'],
                converted: ['Converted', 'attended']
            };
            var apptMapped = apptStatusMap[ev._apptStatus] || ['Appointment', 'upcoming'];
            statusLbl = apptMapped[0];
            statusCls = 'lc-status-badge--' + apptMapped[1];
        } else {
            statusLbl = _lcStatusLabel(ev.status);
            statusCls = 'lc-status-badge--' + (ev.status || 'upcoming');
        }

        // Location text: for contact-linked events show the contact name; otherwise show text
        var locationText = '';
        if (!isAppt) {
            if (ev.locationContactId && _lcFacilityContactMap[ev.locationContactId]) {
                locationText = _lcFacilityContactMap[ev.locationContactId].name || '';
            } else {
                locationText = ev.location || '';
            }
        }
        var location = locationText
            ? '<span class="lc-event-card-location">' + escapeHtml(locationText) + '</span>'
            : '';

        // Small "Appt" pill for appointment cards so they're visually distinct
        var apptBadge = isAppt ? '<span class="lc-appt-badge">Appt</span> ' : '';

        var timePrefix = ev.startTime
            ? '<span class="lc-event-time">' + escapeHtml(_lcFormatTime(ev.startTime)) + '</span> '
            : '';

        // For today's events/appointments: show address and phone from linked contact
        var todayStr = _lcIsoDate(new Date());
        var apptTodayHtml = '';
        if (ev.startDate === todayStr) {
            var contactForToday = null;
            if (isAppt && ev.facilityContactId) {
                contactForToday = _lcFacilityContactMap[ev.facilityContactId] || null;
            } else if (!isAppt && ev.locationContactId) {
                contactForToday = _lcFacilityContactMap[ev.locationContactId] || null;
            }
            if (contactForToday) {
                var apptAddr  = contactForToday.address || '';
                var apptPhone = contactForToday.phone   || '';
                var todayParts = [];
                if (apptAddr)  todayParts.push('<a href="https://maps.google.com/?q=' + encodeURIComponent(apptAddr) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="color:#2563eb; font-size:0.85em;">📍 ' + escapeHtml(apptAddr) + '</a>');
                if (apptPhone) todayParts.push('<a href="tel:' + escapeHtml(apptPhone.replace(/\s/g,'')) + '" onclick="event.stopPropagation()" style="color:#2563eb; font-size:0.85em;">📞 ' + escapeHtml(apptPhone) + '</a>');
                if (todayParts.length) {
                    apptTodayHtml = '<div style="margin-top:4px; display:flex; flex-direction:column; gap:2px;">' + todayParts.join('') + '</div>';
                }
            }
        }

        // data- attribute drives click navigation: appointments go to health-appointments page
        var dataAttr = isAppt ? 'data-appt="true"' : ('data-id="' + escapeHtml(ev.id) + '"');

        // "Add to Google Calendar" deep link — shown on non-appointment cards when not API-connected
        var gcalBtn = '';
        if (!isAppt && typeof gcalIsConnected === 'function' && !gcalIsConnected()) {
            var gcalUrl = gcalLifeDeepLink(ev, {
                categoryName: nameMap[ev.categoryId] || '',
                locationText: locationText
            });
            gcalBtn = '<a class="lc-gcal-link" href="' + escapeHtml(gcalUrl) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">+ Add to Google Calendar</a>';
        }

        return `
            <div class="lc-event-card" ${dataAttr} role="button" tabindex="0">
                <div class="lc-event-card-bar" style="background:${color}"></div>
                <div class="lc-event-card-body">
                    <div class="lc-event-card-title">${apptBadge}${timePrefix}${escapeHtml(ev.title || '')}</div>
                    <div class="lc-event-card-meta">
                        <span class="lc-event-card-dates">${escapeHtml(dates)}</span>
                        ${location}
                        <span class="lc-status-badge ${statusCls}">${escapeHtml(statusLbl)}</span>
                    </div>
                    ${apptTodayHtml}
                    ${gcalBtn}
                </div>
            </div>
        `;
    }).join('');

    // Wire click handlers — appointments navigate to health-appointments, events to event detail
    list.querySelectorAll('.lc-event-card').forEach(function(card) {
        function go() {
            if (card.dataset.appt) {
                window.location.hash = '#health-appointments';
            } else {
                window.location.hash = '#life-event/' + card.dataset.id;
            }
        }
        card.addEventListener('click', go);
        card.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') go(); });
    });
}

// ============================================================
// LC-9 helpers — grid view
// ============================================================

/**
 * Format a Date object to 'YYYY-MM-DD' local time string.
 * @param {Date} date
 * @returns {string}
 */
function _lcIsoDate(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
}

/**
 * Build a map of dayOfMonth → events[] for the given month.
 * Multi-day events appear on every day they touch within the month.
 * @param {Array}  events - Filtered events
 * @param {number} year
 * @param {number} month  - 0-indexed
 * @returns {Object}      - { 1: [...], 2: [...], … }
 */
function _lcBuildDayMap(events, year, month) {
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var map = {};
    for (var d = 1; d <= daysInMonth; d++) map[d] = [];

    var monthStart = year + '-' + String(month + 1).padStart(2, '0') + '-01';
    var monthEnd   = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(daysInMonth).padStart(2, '0');

    events.forEach(function(ev) {
        var start = ev.startDate || '';
        var end   = ev.endDate   || ev.startDate || '';
        if (!start) return;
        // Skip events entirely outside this month
        if (end < monthStart || start > monthEnd) return;

        // Clamp to month boundaries
        var effStart = start < monthStart ? monthStart : start;
        var effEnd   = end   > monthEnd   ? monthEnd   : end;

        // Walk each day in range and add event to its slot
        var cur = new Date(effStart + 'T00:00:00');
        var last = new Date(effEnd  + 'T00:00:00');
        while (cur <= last) {
            if (cur.getMonth() === month && cur.getFullYear() === year) {
                map[cur.getDate()].push(ev);
            }
            cur.setDate(cur.getDate() + 1);
        }
    });

    return map;
}

/**
 * Update the grid month/year label above the grid.
 */
function _lcUpdateGridMonthLabel() {
    var label = document.getElementById('lcGridMonthLabel');
    if (!label) return;
    var d = new Date(_lcGridYear, _lcGridMonth, 1);
    label.textContent = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Sync the view-toggle button text and show/hide grid vs list containers.
 */
function _lcSyncViewUI() {
    var isGrid   = (_lcViewMode === 'grid');
    var toggleBtn  = document.getElementById('lcViewToggle');
    var gridNav    = document.getElementById('lcGridNav');
    var gridWrap   = document.getElementById('lcGridContainer');
    var listWrap   = document.getElementById('lcEventList');
    var pastLabel  = document.getElementById('lcPastToggleLabel');
    var pastChk    = document.getElementById('lcShowPastToggle');

    if (toggleBtn) toggleBtn.textContent = isGrid ? 'List View' : 'Grid View';
    if (gridNav)   gridNav.classList.toggle('hidden', !isGrid);
    if (gridWrap)  gridWrap.classList.toggle('hidden', !isGrid);
    if (listWrap)  listWrap.classList.toggle('hidden',  isGrid);
    if (pastLabel) pastLabel.classList.toggle('hidden', isGrid);

    // Reset past toggle when switching to list view
    if (!isGrid) {
        _lcShowPast = false;
        if (pastChk) pastChk.checked = false;
    }
}

/**
 * Render the month grid into #lcGridContainer.
 * @param {number} year
 * @param {number} month   - 0-indexed
 * @param {Array}  events  - Already-filtered events
 */
function _lcRenderGrid(year, month, events) {
    var container = document.getElementById('lcGridContainer');
    if (!container) return;

    var todayStr     = _lcIsoDate(new Date());
    var daysInMonth  = new Date(year, month + 1, 0).getDate();
    var firstWeekDay = new Date(year, month, 1).getDay(); // 0 = Sunday

    var dayMap   = _lcBuildDayMap(events, year, month);
    var colorMap = {};
    _lcAllCategories.forEach(function(c) { colorMap[c.id] = c.color || ''; });

    var html = '<div class="lc-grid">';

    // Day-of-week headers
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(function(h) {
        html += '<div class="lc-grid-header">' + h + '</div>';
    });

    // Leading blank cells
    for (var b = 0; b < firstWeekDay; b++) {
        html += '<div class="lc-grid-cell lc-grid-cell--blank"></div>';
    }

    // Day cells
    for (var day = 1; day <= daysInMonth; day++) {
        var isoDay   = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        var isToday  = (isoDay === todayStr);
        var dayEvs   = dayMap[day] || [];
        var showN    = Math.min(4, dayEvs.length);
        var overflow = dayEvs.length - showN;

        html += '<div class="lc-grid-cell' + (isToday ? ' lc-grid-cell--today' : '') +
                '" data-date="' + isoDay + '" data-day="' + day + '">';

        // Date number (circled if today)
        html += '<span class="lc-grid-day-num' + (isToday ? ' lc-grid-day-num--today' : '') + '">' + day + '</span>';

        // Up to 4 event bars
        for (var i = 0; i < showN; i++) {
            var ev      = dayEvs[i];
            var isAppt  = ev._kind === 'appt';
            var color   = isAppt ? LC_APPT_COLOR : (colorMap[ev.categoryId] || 'linear-gradient(135deg,#6b7280,#9ca3af)');
            var dgo     = ev.status === 'didntgo';
            var barTime = ev.startTime ? _lcFormatTime(ev.startTime) + ' ' : '';
            // Appointments use data-appt="true"; life events use data-id
            var dataAttr = isAppt ? ' data-appt="true"' : (' data-id="' + escapeHtml(ev.id) + '"');
            html += '<div class="lc-event-bar' + (dgo ? ' lc-event-bar--didnt-go' : '') + (isAppt ? ' lc-event-bar--appt' : '') +
                    '"' + dataAttr + ' style="background:' + color + '"' +
                    ' title="' + escapeHtml((barTime + (ev.title || '')).trim()) + '">' +
                    '<span class="lc-event-bar-title">' + escapeHtml(barTime) + escapeHtml(ev.title || '') + '</span>' +
                    (dgo ? '<span class="lc-event-bar-x">✗</span>' : '') +
                    '</div>';
        }

        // Overflow link
        if (overflow > 0) {
            html += '<span class="lc-overflow-link" data-day="' + day + '">+' + overflow + ' more</span>';
        }

        html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;

    // Wire event bar clicks → navigate directly (appointments go to health-appointments)
    container.querySelectorAll('.lc-event-bar').forEach(function(bar) {
        bar.addEventListener('click', function(e) {
            e.stopPropagation();
            if (this.dataset.appt) {
                window.location.hash = '#health-appointments';
            } else {
                window.location.hash = '#life-event/' + this.dataset.id;
            }
        });
    });

    // Wire day cell clicks → day modal (or straight to new event if no events)
    container.querySelectorAll('.lc-grid-cell:not(.lc-grid-cell--blank)').forEach(function(cell) {
        cell.addEventListener('click', function(e) {
            if (e.target.closest('.lc-event-bar')) return; // handled above
            var date   = this.dataset.date;
            var dayNum = parseInt(this.dataset.day);
            var evs    = dayMap[dayNum] || [];
            if (evs.length === 0) {
                // Empty day → go straight to create event
                window._newEventDate = date;
                window.location.hash = '#life-event/new';
            } else {
                _lcOpenDayModal(date, evs);
            }
        });
    });

    // Wire overflow links → open day modal
    container.querySelectorAll('.lc-overflow-link').forEach(function(link) {
        link.addEventListener('click', function(e) {
            e.stopPropagation();
            var dayNum = parseInt(this.dataset.day);
            var date   = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(dayNum).padStart(2, '0');
            _lcOpenDayModal(date, dayMap[dayNum] || []);
        });
    });

    // Update the month/year label
    _lcUpdateGridMonthLabel();
}

/**
 * Open the day-detail modal for the given date.
 * @param {string} date   - ISO date (YYYY-MM-DD)
 * @param {Array}  events - Events that fall on this day
 */
function _lcOpenDayModal(date, events) {
    var d = new Date(date + 'T00:00:00');
    var label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    document.getElementById('lcDayModalDate').textContent = label;

    var colorMap = {};
    _lcAllCategories.forEach(function(c) { colorMap[c.id] = c.color || ''; });

    var list = document.getElementById('lcDayModalList');
    list.innerHTML = '';

    // Event + appointment cards
    events.forEach(function(ev) {
        var isAppt = ev._kind === 'appt';
        var color  = isAppt ? LC_APPT_COLOR : (colorMap[ev.categoryId] || 'linear-gradient(135deg,#6b7280,#9ca3af)');
        var card   = document.createElement('div');
        card.className = 'lc-day-modal-card';
        var timePrefix = ev.startTime
            ? '<span class="lc-event-time">' + escapeHtml(_lcFormatTime(ev.startTime)) + '</span> '
            : '';
        var apptBadge = isAppt ? '<span class="lc-appt-badge">Appt</span> ' : '';
        var statusLabel, statusClass;
        if (isAppt) {
            var apptStatusMap = { scheduled: ['Scheduled','upcoming'], completed: ['Completed','attended'],
                                  cancelled: ['Cancelled','didntgo'],  converted:  ['Converted','attended'] };
            var m = apptStatusMap[ev._apptStatus] || ['Appointment','upcoming'];
            statusLabel = m[0]; statusClass = m[1];
        } else {
            statusLabel = _lcStatusLabel(ev.status);
            statusClass = ev.status || 'upcoming';
        }
        card.innerHTML =
            '<div class="lc-event-card-bar" style="background:' + color + '"></div>' +
            '<div class="lc-event-card-body">' +
                '<div class="lc-event-card-title">' + apptBadge + timePrefix + escapeHtml(ev.title || '') + '</div>' +
                '<div class="lc-event-card-meta">' +
                    '<span class="lc-event-card-dates">' + escapeHtml(_lcFormatDateRange(ev.startDate, isAppt ? '' : ev.endDate)) + '</span>' +
                    '<span class="lc-status-badge lc-status-badge--' + statusClass + '">' +
                        escapeHtml(statusLabel) +
                    '</span>' +
                '</div>' +
            '</div>';
        if (isAppt) {
            card.addEventListener('click', function() {
                closeModal('lcDayModal');
                setTimeout(function() { window.location.hash = '#health-appointments'; }, 50);
            });
        } else {
            card.addEventListener('click', (function(id) {
                return function() {
                    closeModal('lcDayModal');
                    // Defer navigation so closeModal's history.back() resolves first
                    setTimeout(function() { window.location.hash = '#life-event/' + id; }, 50);
                };
            })(ev.id));
        }
        list.appendChild(card);
    });

    // Add Event card
    var addCard = document.createElement('div');
    addCard.className = 'lc-day-modal-add';
    addCard.textContent = '+ Add Event for This Day';
    addCard.addEventListener('click', function() {
        closeModal('lcDayModal');
        // Defer navigation so closeModal's history.back() resolves first
        setTimeout(function() {
            window._newEventDate = date;
            window.location.hash = '#life-event/new';
        }, 50);
    });
    list.appendChild(addCard);

    openModal('lcDayModal');
}

/**
 * Load the Life Calendar main page (#life-calendar).
 * Shows event list with filters, and category management below.
 */
async function loadLifeCalendarPage() {
    const section = document.getElementById('page-life-calendar');
    if (!section) return;

    // Set breadcrumb in sticky header
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML = '<a href="#life">Life</a><span class="separator">&rsaquo;</span><a href="#life-calendar">Calendar</a>';

    // Reset past toggle — not sticky across page navigations
    _lcShowPast = false;

    // Skeleton while loading
    section.innerHTML = `
        <div class="page-header">
            <h2>Life Calendar</h2>
        </div>
        <div class="lc-page-body">
            <p style="color:var(--text-muted);">Loading…</p>
        </div>
    `;

    try {
        // Seed default categories if this is the first visit
        await lcEnsureDefaultCategories();

        // Load categories, events, and health appointments in parallel
        var [categories, eventsSnap, apptsSnap] = await Promise.all([
            lcLoadCategories(),
            userCol('lifeEvents').get(),
            userCol('healthAppointments').get()
        ]);

        // Cache for filter re-use
        _lcAllCategories  = categories;
        _lcAllEvents      = eventsSnap.docs.map(function(d) { return { id: d.id, ...d.data() }; });
        _lcAllAppointments = apptsSnap.docs
            .map(function(d) { return _lcNormalizeAppointment(d.id, d.data()); })
            .filter(function(a) { return !!a.startDate; }); // only appointments with a date

        // Fetch facility contacts (health appointments) AND life event location contacts
        // so today's cards can show address/phone and all cards can show contact name.
        var facilityIds = [...new Set(
            apptsSnap.docs.map(function(d) { return d.data().facilityContactId; }).filter(Boolean)
        )];
        var locationContactIds = [...new Set(
            _lcAllEvents.map(function(ev) { return ev.locationContactId; }).filter(Boolean)
        )];
        var allContactIdsToFetch = [...new Set([...facilityIds, ...locationContactIds])];
        _lcFacilityContactMap = {};
        if (allContactIdsToFetch.length > 0) {
            await Promise.all(allContactIdsToFetch.map(async function(cid) {
                try {
                    var snap = await pplCol('people').doc(cid).get();
                    if (snap.exists) _lcFacilityContactMap[cid] = snap.data();
                } catch(e) { /* ignore */ }
            }));
        }

        // Set default view based on screen size (only on first visit)
        if (_lcViewMode === null) {
            _lcViewMode = window.innerWidth >= 768 ? 'grid' : 'list';
        }

        // Initialize grid to current month
        var now = new Date();
        if (_lcGridYear === 0) { _lcGridYear = now.getFullYear(); _lcGridMonth = now.getMonth(); }

        // Build category filter options
        var catOptions = '<option value="">All Categories</option>' +
            categories.map(function(c) {
                return '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + '</option>';
            }).join('');

        var isGrid = (_lcViewMode === 'grid');

        // Render full page
        section.innerHTML = `
            <div class="page-header">
                <h2>Life Calendar</h2>
            </div>
            <div class="lc-page-body">

                <!-- Controls -->
                <div class="lc-controls-row">
                    <select id="lcStatusFilter" class="form-control lc-filter-select">
                        <option value="upcoming">Upcoming</option>
                        <option value="upcoming+attended">Upcoming + Attended</option>
                        <option value="attended">Attended</option>
                        <option value="missed">Missed</option>
                        <option value="all">All</option>
                    </select>
                    <select id="lcCategoryFilter" class="form-control lc-filter-select">
                        ${catOptions}
                    </select>
                    <input type="search" id="lcSearchInput" class="form-control lc-search-input"
                           placeholder="Search events…" value="${escapeHtml(_lcSearchQuery)}">
                    <button class="btn btn-sm btn-secondary" id="lcViewToggle">${isGrid ? 'List View' : 'Grid View'}</button>
                    <button class="btn btn-primary btn-sm" id="lcAddEventBtn">+ Add Event</button>
                </div>

                <!-- Show Past toggle (list view only) -->
                <label class="lc-past-toggle${isGrid ? ' hidden' : ''}" id="lcPastToggleLabel">
                    <input type="checkbox" id="lcShowPastToggle"> Show past 30 days
                </label>

                <!-- Grid navigation (hidden in list view) -->
                <div class="lc-grid-nav${isGrid ? '' : ' hidden'}" id="lcGridNav">
                    <button class="btn btn-sm btn-secondary" id="lcGridPrev">&#8249;</button>
                    <span class="lc-grid-month-label" id="lcGridMonthLabel"></span>
                    <button class="btn btn-sm btn-secondary" id="lcGridNext">&#8250;</button>
                    <button class="btn btn-sm btn-secondary" id="lcGridToday">Today</button>
                </div>

                <!-- Grid container (hidden in list view) -->
                <div class="lc-grid-wrap${isGrid ? '' : ' hidden'}" id="lcGridContainer"></div>

                <!-- Event list (hidden in grid view) -->
                <div class="lc-event-list${isGrid ? ' hidden' : ''}" id="lcEventList">
                    <p style="color:var(--text-muted);">Loading events…</p>
                </div>

                <!-- Category management (collapsible) -->
                <details class="lc-categories-details">
                    <summary class="lc-categories-summary">Manage Categories</summary>
                    <div class="lc-section-header" style="margin-top:12px;">
                        <h3>Categories</h3>
                        <button class="btn btn-sm btn-secondary" id="lcAddCategoryBtn">+ Category</button>
                    </div>
                    <div class="lc-category-grid" id="lcCategoryGrid"></div>
                </details>

            </div>
        `;

        // Restore filter UI state
        document.getElementById('lcStatusFilter').value   = _lcStatusFilter;
        document.getElementById('lcCategoryFilter').value = _lcCategoryFilter;

        // Render category tiles inside the details panel
        lcRenderCategoryTiles(categories, document.getElementById('lcCategoryGrid'));

        // Wire filter controls
        document.getElementById('lcStatusFilter').addEventListener('change', function() {
            _lcStatusFilter = this.value;
            _lcApplyFilters();
        });
        document.getElementById('lcCategoryFilter').addEventListener('change', function() {
            _lcCategoryFilter = this.value;
            _lcApplyFilters();
        });
        document.getElementById('lcSearchInput').addEventListener('input', function() {
            _lcSearchQuery = this.value;
            _lcApplyFilters();
        });

        // Wire past toggle
        document.getElementById('lcShowPastToggle').addEventListener('change', function() {
            _lcShowPast = this.checked;
            _lcApplyFilters();
        });

        // Wire view toggle
        document.getElementById('lcViewToggle').addEventListener('click', function() {
            _lcViewMode = (_lcViewMode === 'grid') ? 'list' : 'grid';
            _lcSyncViewUI();
            _lcApplyFilters();
        });

        // Wire grid navigation
        document.getElementById('lcGridPrev').addEventListener('click', function() {
            _lcGridMonth--;
            if (_lcGridMonth < 0) { _lcGridMonth = 11; _lcGridYear--; }
            _lcApplyFilters();
        });
        document.getElementById('lcGridNext').addEventListener('click', function() {
            _lcGridMonth++;
            if (_lcGridMonth > 11) { _lcGridMonth = 0; _lcGridYear++; }
            _lcApplyFilters();
        });
        document.getElementById('lcGridToday').addEventListener('click', function() {
            var t = new Date();
            _lcGridYear  = t.getFullYear();
            _lcGridMonth = t.getMonth();
            _lcApplyFilters();
        });

        // Wire Add Event button
        document.getElementById('lcAddEventBtn').addEventListener('click', function() {
            window._newEventDate = null;
            window.location.hash = '#life-event/new';
        });

        // Wire Add Category button
        document.getElementById('lcAddCategoryBtn').addEventListener('click', function() {
            lcOpenCategoryModal(null);
        });

        // Wire day modal close button
        document.getElementById('lcDayModalCloseBtn').addEventListener('click', function() {
            closeModal('lcDayModal');
        });

        // Wire category modal save/cancel buttons
        _lcWireCategoryModal();

        // Initial render
        _lcApplyFilters();

    } catch (err) {
        console.error('loadLifeCalendarPage error:', err);
        document.querySelector('#page-life-calendar .lc-page-body').innerHTML =
            '<p style="color:var(--danger);">Failed to load. Please refresh.</p>';
    }
}

/**
 * Wire the save/cancel buttons on the category add/edit modal.
 * Called each time the Life Calendar page loads (idempotent via cloneNode trick).
 */
function _lcWireCategoryModal() {
    var saveBtn = document.getElementById('lcCategoryModalSaveBtn');
    var fresh = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(fresh, saveBtn);

    fresh.addEventListener('click', async function() {
        var name  = (document.getElementById('lcCategoryNameInput').value || '').trim();
        var color = document.getElementById('lcCategoryColorValue').value || LC_COLOR_SWATCHES[0].gradient;

        if (!name) {
            alert('Please enter a category name.');
            return;
        }

        try {
            if (_lcEditingCategoryId) {
                await lcUpdateCategory(_lcEditingCategoryId, name, color);
            } else {
                await lcAddCategory(name, color, '');
            }
            closeModal('lcCategoryModal');
            loadLifeCalendarPage();
        } catch (err) {
            console.error('lcSaveCategory error:', err);
            alert('Save failed. Please try again.');
        }
    });

    var cancelBtn = document.getElementById('lcCategoryModalCancelBtn');
    var freshCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(freshCancel, cancelBtn);
    freshCancel.addEventListener('click', function() {
        closeModal('lcCategoryModal');
    });

    var deleteCancelBtn = document.getElementById('lcDeleteCategoryModalCancelBtn');
    var freshDeleteCancel = deleteCancelBtn.cloneNode(true);
    deleteCancelBtn.parentNode.replaceChild(freshDeleteCancel, deleteCancelBtn);
    freshDeleteCancel.addEventListener('click', function() {
        closeModal('lcDeleteCategoryModal');
    });
}

// ============================================================
// Event Form — shared helpers
// ============================================================

/**
 * Builds the category <option> list for the event form dropdown.
 * @param {Array}  categories     - Array of category objects
 * @param {string} selectedId     - Currently selected category ID (or '')
 * @returns {string} HTML option tags
 */
function _lcBuildCategoryOptions(categories, selectedId) {
    return categories.map(function(cat) {
        var sel = cat.id === selectedId ? ' selected' : '';
        return '<option value="' + cat.id + '"' + sel + '>' + escapeHtml(cat.name) + '</option>';
    }).join('');
}

/**
 * Renders the event form HTML into #page-life-event.
 * Used by both new and edit flows.
 * @param {Object|null} event      - Existing event data (null = new)
 * @param {Array}       categories - All life categories
 * @param {string}      prefillDate - ISO date string to pre-fill startDate (new only)
 */
function _lcRenderEventForm(event, categories, prefillDate) {
    const isNew    = !event;
    const title    = isNew ? '' : (event.title || '');
    const catId    = isNew ? (categories[0] ? categories[0].id : '') : (event.categoryId || '');
    const startDate = isNew ? (prefillDate || '') : (event.startDate || '');
    const endDate   = isNew ? '' : (event.endDate   || '');
    const startTime = isNew ? '' : (event.startTime || '');
    const endTime   = isNew ? '' : (event.endTime   || '');
    const location  = isNew ? '' : (event.location  || '');
    const locationContactId = isNew ? null : (event.locationContactId || null);
    const locMode = locationContactId ? 'contacts' : 'manual';
    const cost     = isNew ? '' : (event.cost != null ? event.cost : '');
    const status   = isNew ? 'upcoming' : (event.status || 'upcoming');
    const didntGoReason = isNew ? '' : (event.didntGoReason || '');
    const description   = isNew ? '' : (event.description || '');
    const outcome       = isNew ? '' : (event.outcome || '');

    const breadcrumbLabel = isNew ? 'New Event' : escapeHtml(title || 'Event');
    const pageTitle       = isNew ? 'New Event' : escapeHtml(title || 'Event');

    const didntGoHidden = status === 'didntgo' ? '' : ' hidden';

    const catOptions = _lcBuildCategoryOptions(categories, catId);

    // Set sticky header breadcrumb
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML = '<a href="#life">Life</a><span class="separator">&rsaquo;</span><a href="#life-calendar">Calendar</a><span class="separator">&rsaquo;</span><span>' + breadcrumbLabel + '</span>';

    const section = document.getElementById('page-life-event');
    section.innerHTML = `
        <div class="page-header">
            <h2>${pageTitle}</h2>
            <button type="button" class="btn btn-primary btn-sm" id="lcEventTopSaveBtn">Save</button>
        </div>
        <div class="lc-event-form-wrap">
            <form class="lc-event-form" id="lcEventForm" autocomplete="off">

                <div class="form-group">
                    <label for="lcEventTitle">Title *</label>
                    <input type="text" id="lcEventTitle" class="form-control"
                           placeholder="Event name" value="${escapeHtml(title)}">
                </div>

                <div class="form-group">
                    <label for="lcEventCategory">Category *</label>
                    <select id="lcEventCategory" class="form-control">
                        ${catOptions}
                    </select>
                </div>

                <div class="lc-date-row">
                    <div class="form-group">
                        <label for="lcEventStartDate">Start Date *</label>
                        <input type="date" id="lcEventStartDate" class="form-control"
                               value="${escapeHtml(startDate)}">
                    </div>
                    <div class="form-group">
                        <label for="lcEventEndDate">End Date <span class="label-optional">(optional)</span></label>
                        <input type="date" id="lcEventEndDate" class="form-control"
                               value="${escapeHtml(endDate)}">
                    </div>
                </div>

                <div class="lc-date-row">
                    <div class="form-group">
                        <label for="lcEventStartTime">Start Time <span class="label-optional">(optional)</span></label>
                        <input type="time" id="lcEventStartTime" class="form-control"
                               value="${escapeHtml(startTime)}">
                    </div>
                    <div class="form-group">
                        <label for="lcEventEndTime">End Time <span class="label-optional">(optional)</span></label>
                        <input type="time" id="lcEventEndTime" class="form-control"
                               value="${escapeHtml(endTime)}">
                    </div>
                </div>

                <div class="form-group">
                    <label>Location</label>
                    <div class="lc-loc-mode-row">
                        <div class="lc-loc-contacts-col">
                            <label class="lc-loc-radio-label">
                                <input type="radio" name="lcLocMode" value="contacts"
                                       ${locMode === 'contacts' ? 'checked' : ''}> Contacts
                            </label>
                            <label class="lc-loc-radio-label lc-loc-show-personal-label" id="lcLocShowPersonalWrap"
                                   ${locMode !== 'contacts' ? 'style="display:none;"' : ''}>
                                <input type="checkbox" id="lcLocShowPersonal"><span>Show Personal</span>
                            </label>
                        </div>
                        <label class="lc-loc-radio-label">
                            <input type="radio" name="lcLocMode" value="manual"
                                   ${locMode === 'manual' ? 'checked' : ''}> Manual
                        </label>
                    </div>
                    <div id="lcLocContactsGroup"${locMode !== 'contacts' ? ' class="hidden"' : ''}>
                        <select id="lcEventLocationContact" class="form-control">
                            <option value="">— Loading contacts… —</option>
                        </select>
                    </div>
                    <div id="lcLocManualGroup"${locMode !== 'manual' ? ' class="hidden"' : ''}>
                        <input type="text" id="lcEventLocation" class="form-control"
                               placeholder="City, venue, etc." value="${escapeHtml(location)}">
                    </div>
                </div>

                <div class="form-group">
                    <label for="lcEventCost">Cost ($)</label>
                    <input type="number" id="lcEventCost" class="form-control"
                           placeholder="0.00" min="0" step="0.01"
                           value="${cost !== '' ? cost : ''}">
                </div>

                <div class="form-group lc-status-row">
                    <label>Status</label>
                    <div class="lc-status-options">
                        <label class="lc-status-label">
                            <input type="radio" name="lcEventStatus" value="upcoming"
                                   ${status === 'upcoming' ? 'checked' : ''}> Upcoming
                        </label>
                        <label class="lc-status-label">
                            <input type="radio" name="lcEventStatus" value="attended"
                                   ${status === 'attended' ? 'checked' : ''}> Attended
                        </label>
                        <label class="lc-status-label">
                            <input type="radio" name="lcEventStatus" value="didntgo"
                                   ${status === 'didntgo' ? 'checked' : ''}> Didn't Go
                        </label>
                    </div>
                </div>

                <div class="form-group lc-didnt-go-reason${didntGoHidden}" id="lcDidntGoGroup">
                    <label for="lcEventDidntGoReason">Reason for not going</label>
                    <textarea id="lcEventDidntGoReason" class="form-control" rows="2"
                              placeholder="Why didn't you go?">${escapeHtml(didntGoReason)}</textarea>
                </div>

                <div class="form-group">
                    <label for="lcEventDescription">Description</label>
                    <textarea id="lcEventDescription" class="form-control" rows="3"
                              placeholder="What is this event?">${escapeHtml(description)}</textarea>
                </div>

                <div class="form-group">
                    <label for="lcEventOutcome">Outcome / Notes</label>
                    <textarea id="lcEventOutcome" class="form-control" rows="3"
                              placeholder="How did it go?">${escapeHtml(outcome)}</textarea>
                </div>

                <!-- Category-specific type fields (shown/hidden by template) -->
                <div class="lc-type-fields hidden" id="lcTypeFields-race">
                    <div class="lc-type-fields-header">Race Details</div>
                    <div class="form-group">
                        <label for="lcRaceDistance">Distance</label>
                        <input type="text" id="lcRaceDistance" class="form-control" placeholder="e.g. 26.2 miles">
                    </div>
                    <div class="form-group">
                        <label for="lcRaceFinishTime">Finish Time</label>
                        <input type="text" id="lcRaceFinishTime" class="form-control" placeholder="e.g. 3:45:22">
                    </div>
                </div>

                <div class="lc-type-fields hidden" id="lcTypeFields-concert">
                    <div class="lc-type-fields-header">Concert Details</div>
                    <div class="form-group">
                        <label>Acts / Performers</label>
                        <div class="lc-tag-chips" id="lcConcertActChips"></div>
                        <div class="lc-tag-input-wrap">
                            <input type="text" id="lcConcertActInput" class="form-control"
                                   placeholder="Type name, press Enter to add">
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="lcConcertSeat">Section &amp; Seat</label>
                        <input type="text" id="lcConcertSeat" class="form-control" placeholder="e.g. Section 101 Row D Seat 12">
                    </div>
                </div>

                <div class="lc-type-fields hidden" id="lcTypeFields-golf">
                    <div class="lc-type-fields-header">Golf Details</div>
                    <div class="form-group">
                        <label>Course(s)</label>
                        <div class="lc-tag-chips" id="lcGolfCourseChips"></div>
                        <div class="lc-tag-input-wrap">
                            <input type="text" id="lcGolfCourseInput" class="form-control"
                                   placeholder="Type course name, press Enter to add">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Score(s)</label>
                        <div class="lc-tag-chips" id="lcGolfScoreChips"></div>
                        <div class="lc-tag-input-wrap">
                            <input type="text" id="lcGolfScoreInput" class="form-control"
                                   placeholder="Type score, press Enter to add">
                        </div>
                    </div>
                </div>

                <div class="lc-type-fields hidden" id="lcTypeFields-sports">
                    <div class="lc-type-fields-header">Sports Event Details</div>
                    <div class="form-group">
                        <label for="lcSportType">Sport</label>
                        <select id="lcSportType" class="form-control">
                            <option value="">Select…</option>
                            <option value="Baseball">Baseball</option>
                            <option value="Football">Football</option>
                            <option value="Basketball">Basketball</option>
                            <option value="Hockey">Hockey</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div class="form-group hidden" id="lcSportOtherGroup">
                        <label for="lcSportOther">Sport (other)</label>
                        <input type="text" id="lcSportOther" class="form-control" placeholder="Specify sport">
                    </div>
                    <div class="form-group">
                        <label for="lcSportsTeams">Teams Playing</label>
                        <input type="text" id="lcSportsTeams" class="form-control" placeholder="e.g. Cubs vs Cardinals">
                    </div>
                    <div class="form-group">
                        <label for="lcSportsFinalScore">Final Score</label>
                        <input type="text" id="lcSportsFinalScore" class="form-control" placeholder="e.g. 4–2">
                    </div>
                    <div class="form-group">
                        <label for="lcSportsSeat">Section &amp; Seat</label>
                        <input type="text" id="lcSportsSeat" class="form-control" placeholder="e.g. Section 203 Row B">
                    </div>
                </div>

                <!-- People picker -->
                <div class="form-group">
                    <label>Who went with you?</label>
                    <div class="lc-people-chips" id="lcPeopleChips"></div>
                    <div class="lc-people-picker-wrap">
                        <input type="text" id="lcPeopleSearch" class="form-control"
                               placeholder="Search by name…" autocomplete="off">
                        <ul class="lc-people-dropdown hidden" id="lcPeopleDropdown"></ul>
                    </div>
                </div>

                <!-- Links -->
                <div class="form-group">
                    <div class="lc-section-header" style="margin-bottom:8px;">
                        <label style="margin:0;">Links</label>
                        <button type="button" class="btn btn-sm btn-secondary" id="lcAddLinkBtn">+ Link</button>
                    </div>
                    <div id="lcLinkInlineForm" class="lc-link-inline-form hidden">
                        <input type="text" id="lcLinkLabel" class="form-control" placeholder="Label (e.g. Race Results)">
                        <input type="url"  id="lcLinkUrl"   class="form-control" placeholder="https://…" style="margin-top:6px;">
                        <div class="lc-link-inline-btns">
                            <button type="button" class="btn btn-sm btn-primary"    id="lcLinkConfirmBtn">Add</button>
                            <button type="button" class="btn btn-sm btn-secondary"  id="lcLinkCancelBtn">Cancel</button>
                        </div>
                    </div>
                    <ul class="lc-links-list" id="lcLinksList"></ul>
                </div>

                <div class="lc-event-form-actions">
                    <button type="button" class="btn btn-primary" id="lcEventSaveBtn">Save</button>
                    ${!isNew ? '<button type="button" class="btn btn-danger" id="lcEventDeleteBtn">Delete</button>' : ''}
                    <button type="button" class="btn btn-secondary" id="lcEventCancelBtn">Cancel</button>
                </div>

            </form>
        </div>

        ${!isNew ? `
        <!-- Mini Log — only shown on existing events -->
        <div class="lc-mini-log-section">
            <div class="lc-section-header">
                <h3>Mini Log</h3>
            </div>
            <!-- Add entry form -->
            <div class="lc-log-add-form" id="lcLogAddForm">
                <div class="lc-log-datetime-row">
                    <input type="date" id="lcLogNewDate" class="form-control lc-log-date-input">
                    <input type="time" id="lcLogNewTime" class="form-control lc-log-time-input">
                </div>
                <div class="lc-log-textarea-wrap">
                    <textarea id="lcLogNewBody" class="form-control" rows="4"
                              placeholder="What happened? Type @ to mention someone…"></textarea>
                    <div id="lcLogMentionDropdown" class="lc-log-mention-dropdown" style="display:none;"></div>
                </div>
                <button type="button" class="btn btn-sm btn-primary" id="lcLogAddBtn">Add Entry</button>
            </div>
            <!-- Log entries list -->
            <div class="lc-mini-log-list" id="lcMiniLogList">
                <p style="color:var(--text-muted);font-size:0.88rem;">Loading…</p>
            </div>
        </div>

        <!-- Photos — only shown on existing events -->
        <div class="lc-section-header" style="margin-top:1.5rem;">
            <h3>Photos</h3>
            <button type="button" class="btn btn-sm btn-primary" id="lcPhotoCameraBtn">+ Camera</button>
            <button type="button" class="btn btn-sm btn-primary" id="lcPhotoGalleryBtn">+ Gallery</button>
            <button type="button" class="btn btn-sm btn-primary paste-photo-btn" data-entity="lifeEvent">📋 Paste</button>
        </div>
        <div id="lcPhotoContainer"></div>
        <p class="empty-state" id="lcPhotoEmpty">No photos yet.</p>

        <!-- Create Journal Entry — only on saved events -->
        <div class="lc-create-journal-wrap">
            <button type="button" class="btn btn-secondary" id="lcCreateJournalEntryBtn">
                📓 Create Journal Entry
            </button>
            <span class="label-optional">Opens a pre-filled draft in the journal editor</span>
        </div>
        ` : ''}
    `;

    // Wire location mode radio buttons (Contacts / Manual)
    section.querySelectorAll('input[name="lcLocMode"]').forEach(function(radio) {
        radio.addEventListener('change', function() {
            var isContacts = (this.value === 'contacts');
            var cg  = document.getElementById('lcLocContactsGroup');
            var mg  = document.getElementById('lcLocManualGroup');
            var spw = document.getElementById('lcLocShowPersonalWrap');
            if (cg)  cg.classList.toggle('hidden', !isContacts);
            if (mg)  mg.classList.toggle('hidden', isContacts);
            if (spw) spw.style.display = isContacts ? '' : 'none';
            _lcEventDirty = true;
        });
    });

    // Lazy-load all contacts into the location picker dropdown.
    // By default, Personal contacts are excluded unless "Show Personal" is checked.
    (function(savedContactId) {
        var _allLocContacts = [];   // full list (name + category), loaded once

        function _populateLocationSelect(showPersonal) {
            var sel = document.getElementById('lcEventLocationContact');
            if (!sel) return;
            var filtered = showPersonal
                ? _allLocContacts
                : _allLocContacts.filter(function(c) { return c.category !== 'Personal' && c.category !== 'Pet'; });
            var currentVal = sel.value;
            sel.innerHTML = '<option value="">— Select a contact —</option>';
            filtered.forEach(function(c) {
                var opt = document.createElement('option');
                opt.value       = c.id;
                opt.textContent = c.name || '(no name)';
                // Preserve current selection if it still appears in the filtered list
                if (c.id === currentVal || c.id === savedContactId) opt.selected = true;
                sel.appendChild(opt);
            });
        }

        pplCol('people').where('parentPersonId', '==', null).get()
            .then(function(snap) {
                snap.forEach(function(d) {
                    _allLocContacts.push({
                        id:       d.id,
                        name:     d.data().name     || '',
                        category: d.data().category || ''
                    });
                });
                _allLocContacts.sort(function(a, b) { return a.name.localeCompare(b.name); });

                var sel = document.getElementById('lcEventLocationContact');
                if (!sel) return;

                // If the saved contact is Personal, auto-check "Show Personal" so it's visible
                var savedIsPersonal = savedContactId
                    ? _allLocContacts.some(function(c) {
                        return c.id === savedContactId && (c.category === 'Personal' || c.category === 'Pet');
                      })
                    : false;

                var chk = document.getElementById('lcLocShowPersonal');
                if (chk && savedIsPersonal) chk.checked = true;

                _populateLocationSelect(savedIsPersonal);
                sel.addEventListener('change', function() { _lcEventDirty = true; });

                // Wire "Show Personal" checkbox
                if (chk) {
                    chk.addEventListener('change', function() {
                        _populateLocationSelect(this.checked);
                        _lcEventDirty = true;
                    });
                }
            })
            .catch(function(err) {
                console.error('location picker: could not load contacts', err);
                var sel = document.getElementById('lcEventLocationContact');
                if (sel) sel.innerHTML = '<option value="">— Could not load contacts —</option>';
            });
    }(locationContactId));

    // Toggle "Didn't Go" reason visibility when status changes
    section.querySelectorAll('input[name="lcEventStatus"]').forEach(function(radio) {
        radio.addEventListener('change', function() {
            var group = document.getElementById('lcDidntGoGroup');
            if (this.value === 'didntgo') {
                group.classList.remove('hidden');
            } else {
                group.classList.add('hidden');
            }
            _lcEventDirty = true;
        });
    });

    // When end date is empty and focused, temporarily set it to the start date so
    // the browser's native date picker opens at the correct month instead of today.
    // Clear the temporary value on blur if the user didn't actually pick anything.
    (function() {
        var endEl   = document.getElementById('lcEventEndDate');
        var startEl = document.getElementById('lcEventStartDate');
        if (!endEl || !startEl) return;
        var _tempSet = false;
        endEl.addEventListener('focus', function() {
            if (!endEl.value && startEl.value) {
                endEl.value = startEl.value;
                _tempSet = true;
            }
        });
        endEl.addEventListener('change', function() {
            _tempSet = false;   // user made a real selection — keep it
        });
        endEl.addEventListener('blur', function() {
            if (_tempSet) {
                endEl.value = '';   // user dismissed without picking — restore empty
                _tempSet = false;
            }
        });
    })();

    // Mark dirty on any field change
    ['lcEventTitle','lcEventCategory','lcEventStartDate','lcEventEndDate',
     'lcEventStartTime','lcEventEndTime',
     'lcEventLocation','lcEventCost','lcEventDidntGoReason',
     'lcEventDescription','lcEventOutcome'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('input', function() { _lcEventDirty = true; });
        if (el) el.addEventListener('change', function() { _lcEventDirty = true; });
    });

    // Wire Save (bottom button and top button)
    document.getElementById('lcEventSaveBtn').addEventListener('click', function() {
        _lcSaveEvent(isNew);
    });
    document.getElementById('lcEventTopSaveBtn').addEventListener('click', function() {
        _lcSaveEvent(isNew);
    });

    // Wire Delete (edit mode only)
    if (!isNew) {
        document.getElementById('lcEventDeleteBtn').addEventListener('click', function() {
            _lcConfirmDeleteEvent(_lcEditingEventId);
        });
    }

    // Wire Cancel
    document.getElementById('lcEventCancelBtn').addEventListener('click', function() {
        if (_lcEventDirty && !confirm('You have unsaved changes. Leave anyway?')) return;
        _lcEventDirty = false;
        window.location.hash = '#life-calendar';
    });

    // ---- Type fields ----

    // Show the right typeFields section based on the current category, and populate from event.typeFields
    var tf = (event && event.typeFields) ? event.typeFields : {};
    _lcShowTypeFields(_lcGetTemplateForCategory(catId), tf);

    // Re-show on category change
    document.getElementById('lcEventCategory').addEventListener('change', function() {
        var tmpl = _lcGetTemplateForCategory(this.value);
        _lcShowTypeFields(tmpl, {});
        _lcEventDirty = true;
    });

    // Sports: toggle "Other" text input
    var sportSel = document.getElementById('lcSportType');
    if (sportSel) {
        sportSel.addEventListener('change', function() {
            var otherGroup = document.getElementById('lcSportOtherGroup');
            if (this.value === 'Other') {
                otherGroup.classList.remove('hidden');
            } else {
                otherGroup.classList.add('hidden');
            }
        });
    }

    // Wire tag-list inputs (Enter to add)
    _lcWireTagInput('lcConcertActInput',  'lcConcertActChips');
    _lcWireTagInput('lcGolfCourseInput',  'lcGolfCourseChips');
    _lcWireTagInput('lcGolfScoreInput',   'lcGolfScoreChips');

    // ---- People picker ----

    // Initialize selected people from the event (edit) or empty (new)
    _lcSelectedPeopleIds = (event && event.peopleIds) ? event.peopleIds.slice() : [];

    // Render chips for already-selected people (using cached _lcAllPeople)
    _lcRenderPeopleChips();

    // Wire search input
    var searchEl = document.getElementById('lcPeopleSearch');
    var dropEl   = document.getElementById('lcPeopleDropdown');

    searchEl.addEventListener('input', function() {
        var q = this.value.trim().toLowerCase();
        if (!q) { dropEl.classList.add('hidden'); dropEl.innerHTML = ''; return; }

        var matches = _lcAllPeople.filter(function(p) {
            return p.name.toLowerCase().includes(q) && !_lcSelectedPeopleIds.includes(p.id);
        });

        if (matches.length === 0) {
            dropEl.innerHTML = '<li class="lc-people-no-match">No matches</li>';
            dropEl.classList.remove('hidden');
            return;
        }

        dropEl.innerHTML = matches.map(function(p) {
            return '<li data-id="' + p.id + '" data-name="' + escapeHtml(p.name) + '">'
                + escapeHtml(p.name) + '</li>';
        }).join('');
        dropEl.classList.remove('hidden');

        dropEl.querySelectorAll('li[data-id]').forEach(function(li) {
            li.addEventListener('click', function() {
                _lcAddPersonChip(li.dataset.id, li.dataset.name);
                searchEl.value = '';
                dropEl.innerHTML = '';
                dropEl.classList.add('hidden');
            });
        });
    });

    // Enter key: if exactly one match, add it
    searchEl.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var q = this.value.trim().toLowerCase();
        var matches = _lcAllPeople.filter(function(p) {
            return p.name.toLowerCase().includes(q) && !_lcSelectedPeopleIds.includes(p.id);
        });
        if (matches.length === 1) {
            _lcAddPersonChip(matches[0].id, matches[0].name);
            searchEl.value = '';
            dropEl.innerHTML = '';
            dropEl.classList.add('hidden');
        }
    });

    // Close dropdown on outside click
    document.addEventListener('click', function _lcPickerOutside(e) {
        if (!e.target.closest('#lcPeopleSearch') && !e.target.closest('#lcPeopleDropdown')) {
            dropEl.classList.add('hidden');
            document.removeEventListener('click', _lcPickerOutside);
        }
    });

    // ---- Links ----

    // Initialize links from event (edit) or empty (new)
    _lcEventLinks = (event && event.links) ? event.links.map(function(l) {
        return { label: l.label || '', url: l.url || '' };
    }) : [];

    // Track which index is being edited (-1 = new)
    var _lcEditingLinkIdx = -1;

    _lcRenderLinks();

    document.getElementById('lcAddLinkBtn').addEventListener('click', function() {
        _lcEditingLinkIdx = -1;
        document.getElementById('lcLinkLabel').value = '';
        document.getElementById('lcLinkUrl').value   = '';
        document.getElementById('lcLinkConfirmBtn').textContent = 'Add';
        document.getElementById('lcLinkInlineForm').classList.remove('hidden');
        document.getElementById('lcLinkLabel').focus();
    });

    document.getElementById('lcLinkCancelBtn').addEventListener('click', function() {
        document.getElementById('lcLinkInlineForm').classList.add('hidden');
    });

    document.getElementById('lcLinkConfirmBtn').addEventListener('click', function() {
        var label = (document.getElementById('lcLinkLabel').value || '').trim();
        var url   = (document.getElementById('lcLinkUrl').value || '').trim();
        if (!label || !url) { alert('Please enter both a label and a URL.'); return; }

        if (_lcEditingLinkIdx >= 0) {
            _lcEventLinks[_lcEditingLinkIdx] = { label: label, url: url };
        } else {
            _lcEventLinks.push({ label: label, url: url });
        }
        _lcEditingLinkIdx = -1;
        document.getElementById('lcLinkInlineForm').classList.add('hidden');
        _lcRenderLinks();
        _lcEventDirty = true;
    });
}

// ============================================================
// Mini Log — UI helpers
// ============================================================

/** Person IDs @-mentioned in the mini log entry currently being composed/edited. */
var _lcLogMentionedIds = new Set();

/**
 * Wire the mini log section on the event detail page.
 * Loads existing logs and sets up the add-entry form.
 * @param {string} eventId
 */
async function _lcWireMiniLog(eventId) {
    // Default date/time to now
    var now = new Date();
    var pad = function(n) { return String(n).padStart(2, '0'); };
    var todayStr = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    var timeStr  = pad(now.getHours()) + ':' + pad(now.getMinutes());

    var dateEl = document.getElementById('lcLogNewDate');
    var timeEl = document.getElementById('lcLogNewTime');
    if (dateEl) dateEl.value = todayStr;
    if (timeEl) timeEl.value = timeStr;

    // Wire @mention autocomplete on the textarea
    _lcLogMentionedIds = new Set();
    _lcInitLogMention('lcLogNewBody', 'lcLogMentionDropdown');

    // Wire Add Entry button
    var addBtn = document.getElementById('lcLogAddBtn');
    if (addBtn) {
        addBtn.addEventListener('click', async function() {
            var body = (document.getElementById('lcLogNewBody').value || '').trim();
            if (!body) { alert('Please enter some text.'); return; }
            var logDate = document.getElementById('lcLogNewDate').value || todayStr;
            var logTime = document.getElementById('lcLogNewTime').value || timeStr;
            addBtn.disabled = true;
            try {
                await lcAddLog(eventId, body, [..._lcLogMentionedIds], logDate, logTime);
                document.getElementById('lcLogNewBody').value = '';
                _lcLogMentionedIds = new Set();
                await _lcLoadAndRenderLogs(eventId);
            } catch (err) {
                console.error('lcAddLog error:', err);
                alert('Failed to add entry.');
            } finally {
                addBtn.disabled = false;
            }
        });
    }

    // Load existing logs
    await _lcLoadAndRenderLogs(eventId);
}

/**
 * Load logs from Firestore and render them into #lcMiniLogList.
 * @param {string} eventId
 */
async function _lcLoadAndRenderLogs(eventId) {
    var list = document.getElementById('lcMiniLogList');
    if (!list) return;
    try {
        var logs = await lcLoadLogs(eventId);
        if (logs.length === 0) {
            list.innerHTML = '<p style="color:var(--text-muted);font-size:0.88rem;">No entries yet.</p>';
            return;
        }
        list.innerHTML = '';
        logs.forEach(function(log) {
            list.appendChild(_lcBuildLogEntry(log, eventId));
        });
    } catch (err) {
        console.error('_lcLoadAndRenderLogs error:', err);
        list.innerHTML = '<p style="color:var(--danger);font-size:0.88rem;">Failed to load.</p>';
    }
}

/**
 * Build a DOM element for one log entry (display mode).
 * @param {Object} log     - Log data { id, body, mentionedPersonIds, logDate, logTime }
 * @param {string} eventId - Parent event ID (for reload after edit/delete)
 * @returns {HTMLElement}
 */
function _lcBuildLogEntry(log, eventId) {
    var entry = document.createElement('div');
    entry.className = 'lc-log-entry';
    entry.dataset.logId = log.id;

    var dateStr = log.logDate || '';
    var timeStr = log.logTime || '';
    var metaStr = dateStr;
    if (timeStr) metaStr += ' ' + timeStr;

    entry.innerHTML =
        '<div class="lc-log-meta">' + escapeHtml(metaStr) + '</div>' +
        '<div class="lc-log-body">' + _lcRenderLogBody(log.body || '', log.mentionedPersonIds || []) + '</div>' +
        '<div class="lc-log-actions">' +
            '<button type="button" class="btn btn-xs btn-secondary lc-log-edit-btn">Edit</button>' +
            '<button type="button" class="btn btn-xs btn-danger lc-log-delete-btn">Delete</button>' +
        '</div>';

    // Delete
    entry.querySelector('.lc-log-delete-btn').addEventListener('click', async function() {
        if (!confirm('Delete this entry?')) return;
        try {
            await lcDeleteLog(log.id);
            await _lcLoadAndRenderLogs(eventId);
        } catch (err) {
            console.error('lcDeleteLog error:', err);
            alert('Delete failed.');
        }
    });

    // Edit — switch to inline edit mode
    entry.querySelector('.lc-log-edit-btn').addEventListener('click', function() {
        _lcShowLogEditMode(entry, log, eventId);
    });

    return entry;
}

/**
 * Replace the log entry element with an inline edit form.
 * @param {HTMLElement} entry   - The .lc-log-entry DOM element
 * @param {Object}      log     - Original log data
 * @param {string}      eventId
 */
function _lcShowLogEditMode(entry, log, eventId) {
    var editMentionedIds = new Set(log.mentionedPersonIds || []);
    var dropId = 'lcLogEditDrop_' + log.id;

    entry.innerHTML =
        '<div class="lc-log-textarea-wrap">' +
            '<textarea id="lcLogEditBody_' + log.id + '" class="form-control" rows="2">' +
                escapeHtml(log.body || '') +
            '</textarea>' +
            '<div id="' + dropId + '" class="lc-log-mention-dropdown" style="display:none;"></div>' +
        '</div>' +
        '<div class="lc-log-actions">' +
            '<button type="button" class="btn btn-xs btn-primary lc-log-save-edit-btn">Save</button>' +
            '<button type="button" class="btn btn-xs btn-secondary lc-log-cancel-edit-btn">Cancel</button>' +
        '</div>';

    // Wire @mention on edit textarea
    _lcInitLogMention('lcLogEditBody_' + log.id, dropId, editMentionedIds);

    // Save
    entry.querySelector('.lc-log-save-edit-btn').addEventListener('click', async function() {
        var body = (document.getElementById('lcLogEditBody_' + log.id).value || '').trim();
        if (!body) { alert('Please enter some text.'); return; }
        try {
            await lcUpdateLog(log.id, body, [...editMentionedIds]);
            await _lcLoadAndRenderLogs(eventId);
        } catch (err) {
            console.error('lcUpdateLog error:', err);
            alert('Save failed.');
        }
    });

    // Cancel — re-render without changes
    entry.querySelector('.lc-log-cancel-edit-btn').addEventListener('click', async function() {
        await _lcLoadAndRenderLogs(eventId);
    });
}

/**
 * Render log body text, converting @name tokens into person links.
 * Uses _lcAllPeople for name → ID lookup.
 * @param {string} body               - Raw body text
 * @param {Array}  mentionedPersonIds - Person IDs that were mentioned
 * @returns {string} Safe HTML string
 */
function _lcRenderLogBody(body, mentionedPersonIds) {
    if (!body) return '';
    if (!mentionedPersonIds || !mentionedPersonIds.length || !_lcAllPeople.length) {
        return escapeHtml(body).replace(/\n/g, '<br>');
    }

    // Build a map of first-name/nickname → person ID
    var mentionMap = {};
    mentionedPersonIds.forEach(function(id) {
        var person = _lcAllPeople.find(function(p) { return p.id === id; });
        if (!person) return;
        var displayName = person.name.split(' ')[0];
        mentionMap[displayName] = id;
    });

    var names = Object.keys(mentionMap);
    if (!names.length) return escapeHtml(body).replace(/\n/g, '<br>');

    names.sort(function(a, b) { return b.length - a.length; });
    var pattern = names.map(function(n) {
        return '@' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('|');
    var regex = new RegExp('(' + pattern + ')(?!\\w)', 'g');

    var parts = body.split(regex);
    return parts.map(function(part) {
        if (part.charAt(0) === '@') {
            var name = part.slice(1);
            var id = mentionMap[name];
            if (id) {
                return '<a href="#person/' + id + '" class="lc-mention-link">@' + escapeHtml(name) + '</a>';
            }
        }
        return escapeHtml(part).replace(/\n/g, '<br>');
    }).join('');
}

/**
 * Wire @mention autocomplete on a textarea.
 * @param {string}  textareaId  - ID of the textarea element
 * @param {string}  dropId      - ID of the dropdown container element
 * @param {Set}     [mentionSet] - Set to track mentioned IDs (defaults to _lcLogMentionedIds)
 */
function _lcInitLogMention(textareaId, dropId, mentionSet) {
    var ta   = document.getElementById(textareaId);
    var drop = document.getElementById(dropId);
    if (!ta || !drop) return;

    var ids = mentionSet || _lcLogMentionedIds;

    function getMentionPrefix() {
        var before = ta.value.substring(0, ta.selectionStart);
        var match  = before.match(/(@@?)(\w*)$/);
        if (!match) return null;
        return { text: match[2], full: match[1].length === 2 };
    }

    function showDrop(matches) {
        if (!matches.length) { drop.style.display = 'none'; drop.innerHTML = ''; return; }
        drop.innerHTML = '';
        matches.forEach(function(person) {
            var item = document.createElement('div');
            item.className = 'lc-log-mention-item';
            var lcLabel = escapeHtml(person.name);
            if (person.howKnown) lcLabel += ' <span class="mention-item-nick">' + escapeHtml(person.howKnown) + '</span>';
            item.innerHTML = lcLabel;
            item.addEventListener('mousedown', function(e) {
                e.preventDefault();
                var result = getMentionPrefix();
                if (result === null) { drop.style.display = 'none'; return; }
                var firstName = person.name.split(' ')[0];
                var pos     = ta.selectionStart;
                var atCount = result.full ? 2 : 1;
                var before  = ta.value.substring(0, pos - result.text.length - atCount);
                var after   = ta.value.substring(pos);
                ta.value   = before + '@' + firstName + ' ' + after;
                var newPos = before.length + 1 + firstName.length + 1;
                ta.selectionStart = ta.selectionEnd = newPos;
                ids.add(person.id);
                drop.style.display = 'none';
                drop.innerHTML = '';
                ta.focus();
            });
            drop.appendChild(item);
        });
        drop.style.display = '';
    }

    ta.addEventListener('input', function() {
        var result = getMentionPrefix();
        if (result === null) { drop.style.display = 'none'; return; }
        var q = result.text.toLowerCase();
        var matches = _lcAllPeople.filter(function(p) {
            var nameMatch = p.name.toLowerCase().startsWith(q);
            // Single @ → quick list only; @@ → full list
            return nameMatch && (result.full || p.quickMention);
        }).slice(0, 7);
        showDrop(matches);
    });

    ta.addEventListener('blur', function() {
        setTimeout(function() { drop.style.display = 'none'; }, 180);
    });

    ta.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') { drop.style.display = 'none'; }
    });
}

// ============================================================
// Type fields helpers
// ============================================================

/**
 * Returns the template key for a given category ID.
 * Falls back to '' if the category has no template or isn't found.
 * @param {string} categoryId
 * @returns {string} template key, e.g. 'race', 'concert', 'golf', 'sports', 'travel', or ''
 */
function _lcGetTemplateForCategory(categoryId) {
    var cat = _lcAllCategories.find(function(c) { return c.id === categoryId; });
    return (cat && cat.template) ? cat.template : '';
}

/**
 * Hide all typeFields sections, then show the one matching `template`.
 * Populate the visible section's fields from `typeFields` data.
 * @param {string} template - e.g. 'race', 'concert', 'golf', 'sports', or ''
 * @param {Object} tf       - typeFields data from the event doc
 */
function _lcShowTypeFields(template, tf) {
    // Hide all
    LC_TEMPLATE_KEYS.forEach(function(key) {
        var el = document.getElementById('lcTypeFields-' + key);
        if (el) el.classList.add('hidden');
    });

    if (!template || !LC_TEMPLATE_KEYS.includes(template)) return;

    var section = document.getElementById('lcTypeFields-' + template);
    if (!section) return;
    section.classList.remove('hidden');

    // Populate fields from saved data
    if (template === 'race') {
        _lcSetVal('lcRaceDistance',  tf.distance   || '');
        _lcSetVal('lcRaceFinishTime', tf.finishTime || '');
    } else if (template === 'concert') {
        _lcSetVal('lcConcertSeat', tf.seat || '');
        _lcRenderTagChips('lcConcertActChips', tf.acts || [], 'lcConcertActInput');
    } else if (template === 'golf') {
        _lcRenderTagChips('lcGolfCourseChips', tf.courses || [], 'lcGolfCourseInput');
        _lcRenderTagChips('lcGolfScoreChips',  tf.scores  || [], 'lcGolfScoreInput');
    } else if (template === 'sports') {
        _lcSetVal('lcSportsTeams',      tf.teams      || '');
        _lcSetVal('lcSportsFinalScore', tf.finalScore || '');
        _lcSetVal('lcSportsSeat',       tf.seat       || '');
        var sportSel = document.getElementById('lcSportType');
        if (sportSel) {
            var sport = tf.sport || '';
            var knownSports = ['Baseball','Football','Basketball','Hockey'];
            if (sport && !knownSports.includes(sport)) {
                sportSel.value = 'Other';
                _lcSetVal('lcSportOther', sport);
                var otherGroup = document.getElementById('lcSportOtherGroup');
                if (otherGroup) otherGroup.classList.remove('hidden');
            } else {
                sportSel.value = sport;
            }
        }
    }
}

/** Set a form element's value safely. */
function _lcSetVal(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val;
}

/**
 * If an Enter-key tag input has pending text that was never submitted as a chip,
 * flush it to the chips container now so Save doesn't silently drop it.
 * @param {string} inputId  - ID of the text input
 * @param {string} chipsId  - ID of the chips container
 */
function _lcFlushTagInput(inputId, chipsId) {
    var input = document.getElementById(inputId);
    if (!input) return;
    var val = input.value.trim();
    if (!val) return;
    var existing = _lcReadTagChips(chipsId);
    if (!existing.includes(val)) {
        existing.push(val);
        _lcRenderTagChips(chipsId, existing, inputId);
    }
    input.value = '';
}

/**
 * Read all visible typeFields and return an object to store in Firestore.
 * Returns {} if no template section is currently visible.
 * Flushes any pending tag-input text before reading so typing without
 * pressing Enter is not silently dropped.
 */
function _lcReadTypeFields() {
    for (var i = 0; i < LC_TEMPLATE_KEYS.length; i++) {
        var key = LC_TEMPLATE_KEYS[i];
        var section = document.getElementById('lcTypeFields-' + key);
        if (!section || section.classList.contains('hidden')) continue;

        if (key === 'race') {
            return {
                distance:   (document.getElementById('lcRaceDistance').value  || '').trim(),
                finishTime: (document.getElementById('lcRaceFinishTime').value || '').trim()
            };
        } else if (key === 'concert') {
            _lcFlushTagInput('lcConcertActInput', 'lcConcertActChips');
            return {
                acts: _lcReadTagChips('lcConcertActChips'),
                seat: (document.getElementById('lcConcertSeat').value || '').trim()
            };
        } else if (key === 'golf') {
            _lcFlushTagInput('lcGolfCourseInput', 'lcGolfCourseChips');
            _lcFlushTagInput('lcGolfScoreInput',  'lcGolfScoreChips');
            return {
                courses: _lcReadTagChips('lcGolfCourseChips'),
                scores:  _lcReadTagChips('lcGolfScoreChips')
            };
        } else if (key === 'sports') {
            var sportEl = document.getElementById('lcSportType');
            var sport = sportEl ? sportEl.value : '';
            if (sport === 'Other') {
                sport = (document.getElementById('lcSportOther').value || '').trim() || 'Other';
            }
            return {
                sport:       sport,
                teams:       (document.getElementById('lcSportsTeams').value      || '').trim(),
                finalScore:  (document.getElementById('lcSportsFinalScore').value  || '').trim(),
                seat:        (document.getElementById('lcSportsSeat').value        || '').trim()
            };
        }
    }
    return {};
}

/**
 * Wires an Enter-key tag-input to add chips.
 * @param {string} inputId      - ID of the text input
 * @param {string} chipsId      - ID of the chips container
 */
function _lcWireTagInput(inputId, chipsId) {
    var input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var val = this.value.trim();
        if (!val) return;
        var existing = _lcReadTagChips(chipsId);
        if (!existing.includes(val)) {
            existing.push(val);
            _lcRenderTagChips(chipsId, existing, inputId);
            _lcEventDirty = true;
        }
        this.value = '';
    });
}

/**
 * Render tag chips in a container.
 * @param {string} chipsId  - ID of the container div
 * @param {Array}  tags     - Array of string values
 * @param {string} inputId  - ID of the associated input (for re-wiring after render)
 */
function _lcRenderTagChips(chipsId, tags, inputId) {
    var container = document.getElementById(chipsId);
    if (!container) return;
    container.innerHTML = '';
    tags.forEach(function(tag) {
        var chip = document.createElement('span');
        chip.className = 'lc-tag-chip';
        chip.innerHTML = escapeHtml(tag) +
            '<button type="button" class="lc-chip-remove" title="Remove">✕</button>';
        chip.querySelector('.lc-chip-remove').addEventListener('click', function() {
            var current = _lcReadTagChips(chipsId);
            var idx = current.indexOf(tag);
            if (idx > -1) current.splice(idx, 1);
            _lcRenderTagChips(chipsId, current, inputId);
            _lcEventDirty = true;
        });
        container.appendChild(chip);
    });
}

/**
 * Read current tag chips from a container as an array of strings.
 * @param {string} chipsId
 * @returns {Array<string>}
 */
function _lcReadTagChips(chipsId) {
    var container = document.getElementById(chipsId);
    if (!container) return [];
    return Array.from(container.querySelectorAll('.lc-tag-chip')).map(function(chip) {
        // text content minus the ✕ button text
        return chip.childNodes[0].textContent.trim();
    });
}

/**
 * Add a person chip to the selected list and re-render.
 * @param {string} id   - Person Firestore ID
 * @param {string} name - Person display name
 */
function _lcAddPersonChip(id, name) {
    if (_lcSelectedPeopleIds.includes(id)) return;
    _lcSelectedPeopleIds.push(id);

    // Cache name for re-rendering (in case _lcAllPeople doesn't have it yet)
    if (!_lcAllPeople.find(function(p) { return p.id === id; })) {
        _lcAllPeople.push({ id: id, name: name });
    }
    _lcRenderPeopleChips();
    _lcEventDirty = true;
}

/**
 * Render all currently selected people as chips.
 */
function _lcRenderPeopleChips() {
    var container = document.getElementById('lcPeopleChips');
    if (!container) return;
    container.innerHTML = '';

    _lcSelectedPeopleIds.forEach(function(personId) {
        var person = _lcAllPeople.find(function(p) { return p.id === personId; });
        var name   = person ? person.name : personId;

        var chip = document.createElement('span');
        chip.className = 'lc-person-chip';
        chip.innerHTML =
            '<a href="#person/' + personId + '" class="lc-chip-name">' + escapeHtml(name) + '</a>' +
            '<button type="button" class="lc-chip-remove" data-id="' + personId + '" title="Remove">✕</button>';

        chip.querySelector('.lc-chip-remove').addEventListener('click', function() {
            _lcSelectedPeopleIds = _lcSelectedPeopleIds.filter(function(id) { return id !== personId; });
            _lcRenderPeopleChips();
            _lcEventDirty = true;
        });

        container.appendChild(chip);
    });
}

/**
 * Render the links list.
 */
function _lcRenderLinks() {
    var list = document.getElementById('lcLinksList');
    if (!list) return;
    list.innerHTML = '';

    _lcEventLinks.forEach(function(link, idx) {
        var li = document.createElement('li');
        li.className = 'lc-link-item';
        li.innerHTML =
            '<a href="' + escapeHtml(link.url) + '" target="_blank" rel="noopener" class="lc-link-label">'
            + escapeHtml(link.label) + '</a>' +
            '<div class="lc-link-actions">' +
            '<button type="button" class="btn btn-xs btn-secondary" data-action="edit">Edit</button>' +
            '<button type="button" class="btn btn-xs btn-danger"    data-action="delete">Delete</button>' +
            '</div>';

        li.querySelector('[data-action="edit"]').addEventListener('click', function() {
            // stash editing index into closure variable via re-assignment
            document.getElementById('lcLinkLabel').value = link.label;
            document.getElementById('lcLinkUrl').value   = link.url;
            document.getElementById('lcLinkConfirmBtn').textContent = 'Update';
            document.getElementById('lcLinkInlineForm').classList.remove('hidden');
            document.getElementById('lcLinkLabel').focus();
            // Update the confirm handler's editing index
            // We reach into the closure via the module-level approach:
            // The confirmBtn listener reads _lcEditingLinkIdx from its own scope
            // so we update it on the parent form via a custom attribute trick
            document.getElementById('lcLinkInlineForm').dataset.editIdx = idx;
            // Re-wire confirm button for this index
            var cb = document.getElementById('lcLinkConfirmBtn');
            var fresh = cb.cloneNode(true);
            cb.parentNode.replaceChild(fresh, cb);
            fresh.addEventListener('click', function() {
                var label = (document.getElementById('lcLinkLabel').value || '').trim();
                var url   = (document.getElementById('lcLinkUrl').value || '').trim();
                if (!label || !url) { alert('Please enter both a label and a URL.'); return; }
                _lcEventLinks[idx] = { label: label, url: url };
                document.getElementById('lcLinkInlineForm').classList.add('hidden');
                _lcRenderLinks();
                _lcEventDirty = true;
            });
        });

        li.querySelector('[data-action="delete"]').addEventListener('click', function() {
            _lcEventLinks.splice(idx, 1);
            _lcRenderLinks();
            _lcEventDirty = true;
        });

        list.appendChild(li);
    });
}

/**
 * Reads all event form fields and returns a plain data object.
 * @returns {Object|null} Event data, or null if validation fails
 */
function _lcReadEventForm() {
    var title = (document.getElementById('lcEventTitle').value || '').trim();
    if (!title) { alert('Please enter a title.'); return null; }

    var startDate = document.getElementById('lcEventStartDate').value || '';
    if (!startDate) { alert('Please enter a start date.'); return null; }

    var endDate = document.getElementById('lcEventEndDate').value || '';
    if (endDate && endDate < startDate) { alert('End date cannot be before start date.'); return null; }

    var statusEl = document.querySelector('input[name="lcEventStatus"]:checked');
    var status   = statusEl ? statusEl.value : 'upcoming';

    var data = {
        title:         title,
        categoryId:    document.getElementById('lcEventCategory').value || '',
        startDate:     startDate,
        endDate:       endDate,
        startTime:     document.getElementById('lcEventStartTime').value || '',
        endTime:       document.getElementById('lcEventEndTime').value || '',
        location:          '',   // set below based on location mode radio
        locationContactId: null, // set below based on location mode radio
        status:        status,
        didntGoReason: status === 'didntgo'
            ? (document.getElementById('lcEventDidntGoReason').value || '').trim()
            : '',
        description:   (document.getElementById('lcEventDescription').value || '').trim(),
        outcome:       (document.getElementById('lcEventOutcome').value || '').trim(),
    };

    // Resolve location: contacts mode stores a contact ID; manual mode stores text
    var locModeEl = document.querySelector('input[name="lcLocMode"]:checked');
    if (locModeEl && locModeEl.value === 'contacts') {
        var contSel = document.getElementById('lcEventLocationContact');
        data.locationContactId = (contSel && contSel.value) ? contSel.value : null;
        data.location = '';
    } else {
        var locInput = document.getElementById('lcEventLocation');
        data.location = locInput ? (locInput.value || '').trim() : '';
        data.locationContactId = null;
    }

    var costVal = document.getElementById('lcEventCost').value;
    data.cost = costVal !== '' ? parseFloat(costVal) : null;

    data.peopleIds  = _lcSelectedPeopleIds.slice();
    data.links      = _lcEventLinks.map(function(l) { return { label: l.label, url: l.url }; });
    data.typeFields = _lcReadTypeFields();

    return data;
}

/**
 * Save handler — called from both new and edit form.
 * @param {boolean} isNew - true when creating, false when editing
 */
async function _lcSaveEvent(isNew) {
    var data = _lcReadEventForm();
    if (!data) return;

    var saveBtn = document.getElementById('lcEventSaveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
        if (isNew) {
            var newEventId = await lcAddEvent(data);
            _lcEventDirty = false;
            // GCal sync (fire-and-forget)
            if (typeof gcalIsConnected === 'function' && gcalIsConnected()) {
                userCol('lifeEvents').doc(newEventId).get().then(function(snap) {
                    if (snap.exists) gcalSyncLifeEvent({ id: snap.id, ...snap.data() });
                }).catch(function(e) { console.warn('gcalSyncLifeEvent error:', e); });
            }
            window.location.hash = '#life-calendar';
        } else {
            await lcUpdateEvent(_lcEditingEventId, data);
            _lcEventDirty = false;
            // GCal sync (fire-and-forget)
            if (typeof gcalIsConnected === 'function' && gcalIsConnected()) {
                (function(eid) {
                    userCol('lifeEvents').doc(eid).get().then(function(snap) {
                        if (snap.exists) gcalSyncLifeEvent({ id: snap.id, ...snap.data() });
                    }).catch(function(e) { console.warn('gcalSyncLifeEvent error:', e); });
                })(_lcEditingEventId);
            }
            window.location.hash = '#life-calendar';
        }
    } catch (err) {
        console.error('_lcSaveEvent error:', err);
        alert('Save failed. Please try again.');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
    }
}

/**
 * Prompt and delete a life event, then navigate to #life-calendar.
 * @param {string} id - Event doc ID
 */
async function _lcConfirmDeleteEvent(id) {
    if (!confirm('Delete this event? Mini logs and photos will also be deleted. Journal entries will be kept.')) return;
    try {
        // Read before delete so we can clean up GCal
        var gcalDocData = null;
        if (typeof gcalIsConnected === 'function' && gcalIsConnected()) {
            try {
                var gcalSnap = await userCol('lifeEvents').doc(id).get();
                if (gcalSnap.exists) gcalDocData = { id: gcalSnap.id, ...gcalSnap.data() };
            } catch (e) { /* skip — not worth blocking the delete */ }
        }

        await lcDeleteEvent(id);
        _lcEventDirty = false;

        // GCal cleanup (fire-and-forget)
        if (gcalDocData) {
            gcalDeleteLifeEvent(gcalDocData).catch(function(e) { console.warn('gcalDeleteLifeEvent error:', e); });
        }

        window.location.hash = '#life-calendar';
    } catch (err) {
        console.error('_lcConfirmDeleteEvent error:', err);
        alert('Delete failed. Please try again.');
    }
}

// ============================================================
// LC-11: Compiled Journal Entry
// ============================================================

/**
 * Generate a structured journal entry draft from the current life event,
 * save it to Firestore, and open it in the journal editor.
 *
 * The new journalEntry doc has a `sourceEventId` field linking it back here.
 * Calling this multiple times creates multiple independent snapshot entries.
 *
 * @param {string} eventId - The life event's Firestore ID
 */
async function lcCreateCompiledEntry(eventId) {
    if (_lcEventDirty) {
        alert('Please save your changes before creating a journal entry.');
        return;
    }

    var event = window.currentLifeEvent;
    if (!event) { alert('Event not loaded.'); return; }

    var btn = document.getElementById('lcCreateJournalEntryBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

    try {
        // Load mini logs for this event
        var logs = await lcLoadLogs(eventId);

        // Look up category
        var cat = _lcAllCategories.find(function(c) { return c.id === event.categoryId; }) || null;

        // Build people @mention strings from _lcAllPeople cache
        var peopleNames = (event.peopleIds || []).map(function(pid) {
            var p = _lcAllPeople.find(function(x) { return x.id === pid; });
            return p ? '@' + p.name : '';
        }).filter(Boolean);

        // ---------- Build draft text ----------
        var lines = [];

        // Header line: Title — Date Range — Location
        var headerParts = [event.title || '(Untitled)'];
        var dateRange = _lcFormatDateRange(event.startDate, event.endDate);
        if (dateRange)    headerParts.push(dateRange);
        if (event.location) headerParts.push(event.location);
        lines.push(headerParts.join(' — '));

        // Category + cost meta line
        var meta = [];
        if (cat)                meta.push('Category: ' + cat.name);
        if (event.cost != null) meta.push('Cost: $' + event.cost);
        if (meta.length) lines.push(meta.join(' | '));

        lines.push('');

        // Description
        if (event.description) {
            lines.push('Description:');
            lines.push(event.description);
            lines.push('');
        }

        // Mini log notes (bulleted)
        if (logs.length > 0) {
            lines.push('Notes:');
            logs.forEach(function(log) {
                var when = log.logDate + (log.logTime ? ' ' + log.logTime : '');
                lines.push('• [' + when + '] ' + (log.body || ''));
            });
            lines.push('');
        }

        // Outcome / result
        if (event.outcomeSummary) {
            lines.push('Outcome:');
            lines.push(event.outcomeSummary);
            lines.push('');
        }

        // Didn't Go reason
        if (event.status === 'didntgo' && event.didntGoReason) {
            lines.push("Didn't Go — " + event.didntGoReason);
            lines.push('');
        }

        // Category-specific type fields
        var tf = event.typeFields || {};
        if (cat && cat.template === 'race') {
            if (tf.distance)   lines.push('Distance: '    + tf.distance);
            if (tf.finishTime) lines.push('Finish Time: ' + tf.finishTime);
            if (tf.distance || tf.finishTime) lines.push('');
        } else if (cat && cat.template === 'concert') {
            if (tf.acts && tf.acts.length) lines.push('Acts: '           + tf.acts.join(', '));
            if (tf.seat)                   lines.push('Section & Seat: ' + tf.seat);
            if ((tf.acts && tf.acts.length) || tf.seat) lines.push('');
        } else if (cat && cat.template === 'golf') {
            if (tf.courses && tf.courses.length) lines.push('Course(s): ' + tf.courses.join(', '));
            if (tf.scores  && tf.scores.length)  lines.push('Score(s): '  + tf.scores.join(', '));
            if ((tf.courses && tf.courses.length) || (tf.scores && tf.scores.length)) lines.push('');
        } else if (cat && cat.template === 'sports') {
            if (tf.sport)      lines.push('Sport: '         + tf.sport);
            if (tf.teams)      lines.push('Teams: '         + tf.teams);
            if (tf.finalScore) lines.push('Final Score: '   + tf.finalScore);
            if (tf.seat)       lines.push('Section & Seat: '+ tf.seat);
            if (tf.sport || tf.teams || tf.finalScore || tf.seat) lines.push('');
        }

        // People
        if (peopleNames.length) {
            lines.push('People: ' + peopleNames.join(' '));
            lines.push('');
        }

        // Links
        if (event.links && event.links.length) {
            lines.push('Links:');
            event.links.forEach(function(link) {
                var label = link.label ? link.label + ' — ' : '';
                lines.push('• ' + label + (link.url || ''));
            });
        }

        var entryText = lines.join('\n').trimEnd();

        // ---------- Save to Firestore ----------
        var now       = new Date();
        var entryTime = String(now.getHours()).padStart(2, '0') + ':' +
                        String(now.getMinutes()).padStart(2, '0');

        var ref = await userCol('journalEntries').add({
            date:               event.startDate || journalFormatDate(now),
            entryText:          entryText,
            entryTime:          entryTime,
            sourceEventId:      eventId,           // links entry back to this event
            mentionedPersonIds: event.peopleIds || [],
            createdAt:          firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt:          null
        });

        // Track the compiled entry ID on the event document
        await userCol('lifeEvents').doc(eventId).update({
            journalEntryIds: firebase.firestore.FieldValue.arrayUnion(ref.id)
        });

        // Open the new entry in the journal editor for review + save
        await openEditJournalEntry(ref.id);

    } catch (err) {
        console.error('lcCreateCompiledEntry error:', err);
        alert('Failed to create journal entry. Please try again.');
        if (btn) { btn.disabled = false; btn.textContent = '📓 Create Journal Entry'; }
    }
}

// ============================================================
// Page Loaders — Event pages
// ============================================================

/**
 * Load the New Life Event page (#life-event/new).
 * Pre-fills the date from window._newEventDate if set.
 */
async function loadNewLifeEventPage() {
    const prefillDate = window._newEventDate || '';
    window._newEventDate = null; // consume it
    _lcEditingEventId  = null;
    _lcEventDirty      = false;

    const section = document.getElementById('page-life-event');
    if (!section) return;

    section.innerHTML = '<div class="lc-page-body"><p style="color:var(--text-muted);">Loading…</p></div>';

    try {
        var [categories, people] = await Promise.all([
            lcLoadCategories(),
            lcLoadPeople()
        ]);
        if (categories.length === 0) {
            await lcEnsureDefaultCategories();
            categories = await lcLoadCategories();
        }
        _lcAllPeople      = people;
        _lcAllCategories  = categories;
        _lcRenderEventForm(null, categories, prefillDate);
    } catch (err) {
        console.error('loadNewLifeEventPage error:', err);
        section.innerHTML = '<div class="lc-page-body"><p style="color:var(--danger);">Failed to load. Please refresh.</p></div>';
    }
}

/**
 * Load the Life Event detail/edit page (#life-event/{id}).
 * @param {string} id - Firestore document ID of the life event
 */
async function loadLifeEventPage(id) {
    window.currentLifeEvent = null;
    _lcEditingEventId  = id;
    _lcEventDirty      = false;

    const section = document.getElementById('page-life-event');
    if (!section) return;

    section.innerHTML = '<div class="lc-page-body"><p style="color:var(--text-muted);">Loading…</p></div>';

    try {
        var [eventDoc, categories, people] = await Promise.all([
            userCol('lifeEvents').doc(id).get(),
            lcLoadCategories(),
            lcLoadPeople()
        ]);
        _lcAllPeople     = people;
        _lcAllCategories = categories;

        if (!eventDoc.exists) {
            section.innerHTML = '<div class="lc-page-body"><p style="color:var(--danger);">Event not found.</p></div>';
            return;
        }

        var event = { id: eventDoc.id, ...eventDoc.data() };
        window.currentLifeEvent = event;

        _lcRenderEventForm(event, categories, '');

        // Wire the mini log section (exists only on edit pages)
        _lcWireMiniLog(id);

        // Load photos (exists only on edit pages)
        loadPhotos('lifeEvent', id, 'lcPhotoContainer', 'lcPhotoEmpty');

        // Wire photo upload buttons
        var cameraBtn  = document.getElementById('lcPhotoCameraBtn');
        var galleryBtn = document.getElementById('lcPhotoGalleryBtn');
        if (cameraBtn)  cameraBtn.addEventListener('click',  function() { triggerCameraUpload('lifeEvent',  id); });
        if (galleryBtn) galleryBtn.addEventListener('click', function() { triggerGalleryUpload('lifeEvent', id); });

        // Wire "Create Journal Entry" button
        var journalBtn = document.getElementById('lcCreateJournalEntryBtn');
        if (journalBtn) {
            journalBtn.addEventListener('click', function() {
                lcCreateCompiledEntry(id);
            });
        }
    } catch (err) {
        console.error('loadLifeEventPage error:', err);
        section.innerHTML = '<div class="lc-page-body"><p style="color:var(--danger);">Failed to load. Please refresh.</p></div>';
    }
}

// ============================================================
// Dirty flag — hashchange guard
// ============================================================

/**
 * Intercepts hash navigation when the event form has unsaved changes.
 * Fires before app.js's handleRoute because this file is loaded first.
 * If the user cancels, we restore the old hash to stay on the form.
 */
window.addEventListener('hashchange', function(e) {
    if (!_lcEventDirty) return;

    // Only guard when we're currently on the event page
    var oldHash = (e.oldURL || '').split('#')[1] || '';
    if (!oldHash.startsWith('life-event')) return;

    if (!confirm('You have unsaved changes. Leave anyway?')) {
        // Restore the old hash without triggering another hashchange
        history.replaceState(null, '', '#' + oldHash);
        // Stop further handlers (app.js's handleRoute) from running
        e.stopImmediatePropagation();
        return;
    }

    // User confirmed — clear the dirty flag so the route proceeds normally
    _lcEventDirty = false;
}, true); // useCapture = true so this fires before app.js's listener
