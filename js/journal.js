// ============================================================
// Journal.js — Life / Journal feature
// Handles journal entries, tracking items, and categories.
//
// Firestore collections (all via userCol()):
//   journalEntries       — date, entryText, createdAt, updatedAt
//   journalTrackingItems — date, category, value, createdAt, updatedAt
//   journalCategories    — name, createdAt
// ============================================================

// ---------- Global State ----------

/** The journal entry currently being edited (or null when adding). */
window.currentJournalEntry = null;

// ---------- @Mention State ----------

/** Set of person IDs @-mentioned in the entry currently being edited. */
var _journalMentionedPersonIds = new Set();

/**
 * Cached flat list of all people (main + sub) for autocomplete.
 * Invalidated when a new entry session begins.
 * Format: [{id, name, nickname, parentPersonId}, ...]
 */
var _journalPeopleCache = null;

/** Set of place IDs selected on the entry currently being edited. */
var _journalPlaceIds = new Set();

/** Bias coordinates for place text search (set from GPS or manual geocode). */
var _journalBiasLat = null;
var _journalBiasLng = null;

/** Map of placeId → place name, pre-loaded when rendering the feed. */
var _journalPlaceNamesMap = {};

/** Temporary store for venues shown in the place search dropdown. */
var _journalPlaceDropdownVenues = [];

/** Whether the "Check-Ins Only" feed filter is active. */
var _journalCheckinsOnly = localStorage.getItem('bishop_journal_checkinsOnly') === 'true';

/** Category name to filter the feed to (empty string = no filter). */
var _journalCategoryFilter = localStorage.getItem('bishop_journal_categoryFilter') || '';

/** True when the entry form is opened in check-in mode (from the Check In button). */
var _journalCheckinMode = false;

/** Photos attached to the current journal entry being edited.
 *  Each element: { imageData: '<base64 data URL>', caption: '' }
 *  Cleared when a new entry is opened; restored from Firestore when editing. */
var _journalPhotos = [];

/** The venue selected in the check-in picker (not yet saved to Firestore until Save). */
var _journalCheckinVenue = null;

/** Venues shown in the check-in place picker modal. */
var _checkinPickerVenues = [];
/** GPS coords captured when the check-in picker opens — used to bias name searches. */
var _checkinPickerLat = null;
var _checkinPickerLng = null;

/**
 * When non-null, the check-in picker calls this function (venue) instead of
 * opening a new journal entry form. Used when "📍 Check In" is clicked from
 * within an already-open journal entry.
 */
var _checkinPickerCallback = null;

/**
 * Whether to show mini log entries from life events in the journal feed.
 * Persisted in localStorage so the choice survives page reloads.
 */
var _journalShowEventNotes = localStorage.getItem('bishop_journal_showEventNotes') !== 'false';

/** The tracking item currently being edited (or null when adding). */
window.currentTrackingItem = null;

/** True when the journal-entry page is in edit mode. */
window.journalEditMode = false;

/**
 * When the journal entry was opened from a health visit, this holds the visit's
 * Firestore ID so saveJournalEntry() can write the back-link.
 * Null when opening a normal journal entry.
 */
window._journalSourceVisitId = null;

/**
 * Where the Cancel button navigates. Normally '#journal'; set to the visit
 * detail route when opening from a health visit so Cancel goes back there.
 */
window._journalCancelTarget = '#journal';

/** True when the journal-tracking page is in edit mode. */
window.journalTrackingEditMode = false;

/** Cached list of tracking categories: [{id, name}, ...] */
window.journalCategories = [];


// ============================================================
// Utility: format a Date object as YYYY-MM-DD (local time)
// (We use a local version so we never have UTC-offset surprises.)
// ============================================================
function journalFormatDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}

/**
 * Update the day-of-week hint label below the date input.
 * Shows e.g. "Sunday" when the date is 2026-04-19.
 */
function _journalUpdateDayOfWeek(yyyyMmDd) {
    var el = document.getElementById('journalEntryDayOfWeek');
    if (!el) return;
    if (!yyyyMmDd) { el.textContent = ''; return; }
    var parts = yyyyMmDd.split('-');
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
    el.textContent = d.toLocaleDateString('en-US', { weekday: 'long' });
}

/**
 * Format a YYYY-MM-DD string as "Monday, March 24, 2026" for display.
 * We parse the date manually to avoid timezone-shift issues.
 */
function journalFormatDateHeader(yyyyMmDd) {
    var parts = yyyyMmDd.split('-');
    // Use noon local time to avoid DST edge cases
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Format a Firestore Timestamp (or JS Date) as "7:02 AM".
 * Used as a fallback for old entries that don't have an entryTime field.
 * @param {object|Date} ts - A Firestore Timestamp or JS Date
 */
function journalFormatTime(ts) {
    if (!ts) return '';
    var d = (ts.toDate) ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * Convert a stored "HH:MM" string to "7:02 AM" display format.
 * @param {string} hhmm - 24-hour time string e.g. "14:30"
 */
function journalFormatTime12(hhmm) {
    if (!hhmm) return '';
    var parts = hhmm.split(':');
    var h = parseInt(parts[0], 10);
    var m = parts[1] || '00';
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + m + ' ' + ampm;
}

/**
 * Return the current local time as "HH:MM" for defaulting the time input.
 */
function journalCurrentTimeHHMM() {
    var d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/**
 * Derive an "HH:MM" string from a Firestore Timestamp, for pre-filling
 * the time input on entries that pre-date the entryTime field.
 */
function journalTimestampToHHMM(ts) {
    if (!ts) return journalCurrentTimeHHMM();
    var d = (ts.toDate) ? ts.toDate() : new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/**
 * Escape HTML special characters to safely insert text into the DOM.
 * Uses the same escapeHtml() that zones.js defines globally, but we
 * guard with a fallback in case load order varies.
 */
function journalEscape(str) {
    if (typeof escapeHtml === 'function') return escapeHtml(str);
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}


// ============================================================
// Life Landing Page
// ============================================================

/**
 * Render the Life landing page.
 * Currently just shows the Journal tile — no Firestore needed.
 * Called by app.js when routing to #life.
 */
function loadLifePage() {
    // Nothing dynamic to load — the tile links are static HTML.
    // This function is a hook for future Life features.
}


// ============================================================
// Journal Main Page  (#journal)
// ============================================================

/**
 * Load the main journal page.
 * Restores the sticky date-range preference from Firestore, then
 * loads and renders journal data.
 * Called by app.js when routing to #journal.
 */
async function loadJournalPage() {
    // Set breadcrumb in sticky header (showPage clears it for top-level pages).
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML = '<a href="#life">Life</a><span class="separator">&rsaquo;</span><span>Journal</span>';

    // Wire up toolbar buttons (safe to call each time — replaces listeners)
    _journalWireToolbar();

    // Check for a preset date passed via localStorage (from Life Project itinerary journal icon)
    var presetDate = localStorage.getItem('journalPresetDate');
    if (presetDate) {
        localStorage.removeItem('journalPresetDate');
        var sel = document.getElementById('journalRangeSelect');
        if (sel) sel.value = 'custom';
        var fromEl = document.getElementById('journalFromDate');
        var toEl   = document.getElementById('journalToDate');
        if (fromEl) fromEl.value = presetDate;
        if (toEl)   toEl.value   = presetDate;
        _journalToggleCustomRange();
        await loadJournalData();
        return; // skip normal preference restore
    }

    // Restore saved date range preference
    try {
        var settingDoc = await userCol('settings').doc('journal').get();
        if (settingDoc.exists) {
            var savedRange = settingDoc.data().defaultDateRange || '7';
            var sel = document.getElementById('journalRangeSelect');
            if (sel) sel.value = savedRange;
        }
    } catch (e) {
        // Non-fatal — just use the default dropdown value
        console.warn('Could not load journal range preference:', e);
    }

    // Show/hide custom range inputs based on current selection
    _journalToggleCustomRange();

    // Load and render the feed — normal journal or all-activity based on toggle state
    if (_journalAllActivity) {
        await loadAllActivityFeed();
    } else {
        await loadJournalData();
    }
}

/**
 * Wire all toolbar button click handlers.
 * Called each time the journal page loads so handlers are always fresh.
 */
function _journalWireToolbar() {
    var rangeSelect = document.getElementById('journalRangeSelect');
    if (rangeSelect) {
        rangeSelect.onchange = function() {
            _journalToggleCustomRange();
            if (rangeSelect.value !== 'custom') {
                saveJournalRangePreference(rangeSelect.value);
                _journalAllActivity ? loadAllActivityFeed() : loadJournalData();
            }
        };
    }

    var applyBtn = document.getElementById('journalCustomApplyBtn');
    if (applyBtn) {
        applyBtn.onclick = function() {
            saveJournalRangePreference('custom');
            _journalAllActivity ? loadAllActivityFeed() : loadJournalData();
        };
    }

    var goToDateBtn = document.getElementById('journalGoToDateBtn');
    if (goToDateBtn) {
        goToDateBtn.onclick = journalGoToDate;
    }

    var newEntryBtn = document.getElementById('journalNewEntryBtn');
    if (newEntryBtn) {
        newEntryBtn.onclick = openAddJournalEntry;
    }

    var addTrackingBtn = document.getElementById('journalAddTrackingBtn');
    if (addTrackingBtn) {
        addTrackingBtn.onclick = openAddTracking;
    }

    var manageCatsBtn = document.getElementById('journalManageCategoriesBtn');
    if (manageCatsBtn) {
        manageCatsBtn.onclick = function() {
            window.location.hash = '#journal-categories';
        };
    }

    // "Show Event Notes" toggle — hides/shows mini log entries from life events
    var showNotesChk = document.getElementById('journalShowEventNotes');
    if (showNotesChk) {
        showNotesChk.checked = _journalShowEventNotes;
        showNotesChk.onchange = function() {
            _journalShowEventNotes = this.checked;
            localStorage.setItem('bishop_journal_showEventNotes', _journalShowEventNotes ? 'true' : 'false');
            var feedEl = document.getElementById('journalFeed');
            if (feedEl) {
                feedEl.classList.toggle('journal-feed--hide-logs', !_journalShowEventNotes);
            }
        };
    }

    // "Check-Ins Only" toggle — reloads feed filtered to check-in entries only
    var checkinsOnlyChk = document.getElementById('journalCheckinsOnly');
    if (checkinsOnlyChk) {
        checkinsOnlyChk.checked = _journalCheckinsOnly;
        checkinsOnlyChk.onchange = function() {
            _journalCheckinsOnly = this.checked;
            localStorage.setItem('bishop_journal_checkinsOnly', _journalCheckinsOnly ? 'true' : 'false');
            loadJournalData();
        };
    }

    // "All Activity" toggle — unified timeline across the whole app
    var allActivityChk = document.getElementById('journalAllActivityToggle');
    if (allActivityChk) {
        allActivityChk.checked = _journalAllActivity;
        _journalSetAllActivityMode(_journalAllActivity);
        allActivityChk.onchange = function() {
            _journalAllActivity = this.checked;
            localStorage.setItem('bishop_journal_allActivity', _journalAllActivity ? 'true' : 'false');
            _journalSetAllActivityMode(_journalAllActivity);
            if (_journalAllActivity) {
                loadAllActivityFeed();
            } else {
                loadJournalData();
            }
        };
    }

    // Category filter dropdown
    var catFilter = document.getElementById('journalCategoryFilterSelect');
    if (catFilter) {
        catFilter.value = _journalCategoryFilter;
        catFilter.onchange = function() {
            _journalCategoryFilter = this.value;
            localStorage.setItem('bishop_journal_categoryFilter', _journalCategoryFilter);
            loadJournalData();
        };
        _journalPopulateFilterPanel();
    }
}

/**
 * Populate the category filter dropdown with all tracking categories
 * and the most recent date each was logged (e.g. "Hair Cut (04/17/2026)").
 */
async function _journalPopulateFilterPanel() {
    var select = document.getElementById('journalCategoryFilterSelect');
    if (!select) return;

    // Ensure categories are loaded
    if (!window.journalCategories || window.journalCategories.length === 0) {
        await loadJournalCategories();
    }
    var cats = window.journalCategories || [];
    if (cats.length === 0) return;

    // Query last tracking item per category (no composite index needed — equality only)
    var promises = cats.map(function(cat) {
        return userCol('journalTrackingItems')
            .where('category', '==', cat.name)
            .get()
            .then(function(snap) {
                var maxDate = '';
                snap.forEach(function(doc) {
                    var d = doc.data().date || '';
                    if (d > maxDate) maxDate = d;
                });
                return { name: cat.name, lastDate: maxDate };
            });
    });

    var results = await Promise.all(promises);

    var html = '<option value="">No Filter</option>';
    results.forEach(function(r) {
        var label = r.name;
        if (r.lastDate) {
            var p = r.lastDate.split('-');
            label += ' (' + p[1] + '/' + p[2] + '/' + p[0] + ')';
        }
        var sel = (_journalCategoryFilter === r.name) ? ' selected' : '';
        html += '<option value="' + journalEscape(r.name) + '"' + sel + '>' +
                journalEscape(label) + '</option>';
    });

    select.innerHTML = html;
}

/**
 * Show or hide the custom date range inputs based on the dropdown value.
 */
function _journalToggleCustomRange() {
    var sel = document.getElementById('journalRangeSelect');
    var customDiv = document.getElementById('journalCustomRange');
    if (!sel || !customDiv) return;
    if (sel.value === 'custom') {
        customDiv.classList.remove('hidden');
    } else {
        customDiv.classList.add('hidden');
    }
}

/**
 * Calculate the from/to date range based on the current toolbar selection.
 * Returns { fromDate: 'YYYY-MM-DD', toDate: 'YYYY-MM-DD' }.
 */
function getJournalDateRange() {
    var sel = document.getElementById('journalRangeSelect');
    var today = new Date();
    var toDate = journalFormatDate(today);
    var fromDate;

    if (sel && sel.value === 'custom') {
        fromDate = document.getElementById('journalFromDate').value;
        toDate   = document.getElementById('journalToDate').value;
    } else {
        var days = parseInt((sel ? sel.value : '7'), 10) || 7;
        var from = new Date(today);
        from.setDate(from.getDate() - days + 1);
        fromDate = journalFormatDate(from);
    }

    return { fromDate: fromDate, toDate: toDate };
}

/**
 * Save the selected date range value to Firestore so it persists.
 * @param {string} value - The range value (e.g. '7', '30', 'custom')
 */
async function saveJournalRangePreference(value) {
    try {
        await userCol('settings').doc('journal').set(
            { defaultDateRange: value },
            { merge: true }
        );
    } catch (e) {
        console.warn('Could not save journal range preference:', e);
    }
}

/**
 * Query journal entries and tracking items for the current date range,
 * merge and group them by date, then render the feed.
 *
 * NOTE: These queries use compound orderBy (date desc + createdAt asc),
 * which requires composite indexes in Firestore.  The first time you run
 * this, Firestore will throw an error with a link to create the index.
 * That link will appear in the browser console — click it to create the
 * index in one step.
 */
async function loadJournalData() {
    var feedEl = document.getElementById('journalFeed');
    if (!feedEl) return;
    feedEl.innerHTML = '<p class="empty-state">Loading...</p>';

    var range = getJournalDateRange();
    if (!range.fromDate || !range.toDate) {
        feedEl.innerHTML = '<p class="empty-state">Please select a valid date range.</p>';
        return;
    }

    try {
        // Run all queries in parallel for speed
        var [entriesSnap, trackingSnap, logsSnap] = await Promise.all([
            userCol('journalEntries')
                .where('date', '>=', range.fromDate)
                .where('date', '<=', range.toDate)
                .orderBy('date', 'desc')
                .orderBy('createdAt', 'asc')
                .get(),
            userCol('journalTrackingItems')
                .where('date', '>=', range.fromDate)
                .where('date', '<=', range.toDate)
                .orderBy('date', 'desc')
                .orderBy('createdAt', 'asc')
                .get(),
            // Mini logs: range query on a single field — no composite index needed
            userCol('lifeEventLogs')
                .where('logDate', '>=', range.fromDate)
                .where('logDate', '<=', range.toDate)
                .get()
        ]);

        // Collect all items from all snapshots into a flat array
        var allItems = [];

        entriesSnap.forEach(function(doc) {
            allItems.push({ type: 'entry', id: doc.id, data: doc.data() });
        });

        trackingSnap.forEach(function(doc) {
            allItems.push({ type: 'tracking', id: doc.id, data: doc.data() });
        });

        // Process life event mini logs
        var logDocs = [];
        logsSnap.forEach(function(doc) { logDocs.push({ id: doc.id, data: doc.data() }); });

        if (logDocs.length > 0) {
            // Batch-fetch the referenced life events and all categories
            var uniqueEventIds = [];
            logDocs.forEach(function(l) {
                if (l.data.eventId && uniqueEventIds.indexOf(l.data.eventId) === -1) {
                    uniqueEventIds.push(l.data.eventId);
                }
            });

            var [eventDocs, catSnap] = await Promise.all([
                Promise.all(uniqueEventIds.map(function(id) { return userCol('lifeEvents').doc(id).get(); })),
                userCol('lifeCategories').get()
            ]);

            var eventMap = {};
            eventDocs.forEach(function(doc) { if (doc.exists) eventMap[doc.id] = doc.data(); });

            var categoryMap = {};
            catSnap.forEach(function(doc) { categoryMap[doc.id] = doc.data(); });

            // Add each log as a 'lifeLog' item, enriched with event/category data
            logDocs.forEach(function(log) {
                var evData  = eventMap[log.data.eventId] || null;
                var catData = evData && categoryMap[evData.categoryId] ? categoryMap[evData.categoryId] : null;
                allItems.push({
                    type: 'lifeLog',
                    id:   log.id,
                    data: {
                        date:               log.data.logDate  || '',
                        entryTime:          log.data.logTime  || '',
                        body:               log.data.body     || '',
                        mentionedPersonIds: log.data.mentionedPersonIds || [],
                        eventId:            log.data.eventId  || '',
                        eventTitle:         evData ? (evData.title || '(Event)') : '(Event)',
                        categoryColor:      catData ? (catData.color || '') : '',
                        createdAt:          log.data.createdAt
                    }
                });
            });
        }

        // Group by date — build a map { 'YYYY-MM-DD': [items...] }
        var dateMap = {};
        allItems.forEach(function(item) {
            var d = item.data.date;
            if (!dateMap[d]) dateMap[d] = [];
            dateMap[d].push(item);
        });

        // Sort dates descending (newest first)
        var sortedDates = Object.keys(dateMap).sort().reverse();

        // Within each date, sort items by entryTime (user-set) if available,
        // falling back to createdAt for old entries without the field.
        sortedDates.forEach(function(date) {
            dateMap[date].sort(function(a, b) {
                if (a.data.entryTime && b.data.entryTime) {
                    // Both have user-set times — compare lexicographically (HH:MM is zero-padded)
                    return a.data.entryTime.localeCompare(b.data.entryTime);
                }
                // Fall back to server createdAt millis
                var ta = a.data.createdAt ? a.data.createdAt.toMillis() : 0;
                var tb = b.data.createdAt ? b.data.createdAt.toMillis() : 0;
                return ta - tb;
            });
        });

        // Build grouped structure for the renderer
        var grouped = sortedDates.map(function(date) {
            return { date: date, items: dateMap[date] };
        });

        // Pre-load people cache so @mention links render correctly in the feed
        await _journalLoadPeopleCache();

        // Pre-load place names so place links render correctly in the feed
        var allPlaceIds = [];
        entriesSnap.forEach(function(doc) {
            (doc.data().placeIds || []).forEach(function(pid) {
                if (allPlaceIds.indexOf(pid) === -1) allPlaceIds.push(pid);
            });
        });
        _journalPlaceNamesMap = {};
        if (allPlaceIds.length > 0) {
            var placeFetches = allPlaceIds.map(function(pid) {
                return userCol('places').doc(pid).get().then(function(d) {
                    if (d.exists) _journalPlaceNamesMap[pid] = d.data().name || '(Place)';
                });
            });
            await Promise.all(placeFetches);
        }

        // Apply JS filters — each removes non-matching items and drops empty date groups
        var filteredGrouped = grouped;

        if (_journalCheckinsOnly) {
            filteredGrouped = filteredGrouped.map(function(group) {
                return {
                    date: group.date,
                    items: group.items.filter(function(item) {
                        return item.type === 'entry' && item.data.isCheckin;
                    })
                };
            }).filter(function(group) { return group.items.length > 0; });
        }

        if (_journalCategoryFilter) {
            filteredGrouped = filteredGrouped.map(function(group) {
                return {
                    date: group.date,
                    items: group.items.filter(function(item) {
                        return item.type === 'tracking' && item.data.category === _journalCategoryFilter;
                    })
                };
            }).filter(function(group) { return group.items.length > 0; });
        }

        renderJournalFeed(filteredGrouped, _journalCategoryFilter);

    } catch (err) {
        console.error('Error loading journal data:', err);

        // Firestore composite index errors contain "index" in the message
        // and include a URL to create the index automatically.
        var msg = err.message || String(err);
        if (msg.indexOf('index') !== -1 || msg.indexOf('Index') !== -1) {
            feedEl.innerHTML =
                '<p class="empty-state" style="color:#b91c1c;">' +
                '<strong>Index required</strong> — Firestore needs a composite index for this query. ' +
                'Check the browser console for a link to create it automatically (one click). ' +
                'After creating the index, reload the page.</p>';
        } else {
            feedEl.innerHTML = '<p class="empty-state" style="color:#b91c1c;">Error loading journal data. See console for details.</p>';
        }
    }
}

/**
 * Render the journal feed into #journalFeed.
 * @param {Array}  groupedData    - Array of { date: 'YYYY-MM-DD', items: [...] }
 * @param {string} [categoryFilter] - If set, shown in the empty-state message.
 */
function renderJournalFeed(groupedData, categoryFilter) {
    var feedEl = document.getElementById('journalFeed');
    if (!feedEl) return;

    if (groupedData.length === 0) {
        var emptyMsg = categoryFilter
            ? 'No "' + categoryFilter + '" entries in this date range.'
            : 'No entries in this date range. Add your first entry!';
        feedEl.innerHTML = '<p class="empty-state">' + emptyMsg + '</p>';
        return;
    }

    var html = '';

    groupedData.forEach(function(group) {
        // Date header — e.g. "Monday, March 24, 2026"
        html += '<div class="journal-date-header" data-journal-date="' + journalEscape(group.date) + '">' +
                    journalFormatDateHeader(group.date) +
                '</div>';

        group.items.forEach(function(item) {
            if (item.type === 'entry') {
                html += _renderEntryCard(item.id, item.data);
            } else if (item.type === 'tracking') {
                html += _renderTrackingCard(item.id, item.data);
            } else if (item.type === 'lifeLog') {
                html += _renderLifeLogCard(item.id, item.data);
            }
        });
    });

    feedEl.innerHTML = html;

    // Apply the "show event notes" toggle state
    if (!_journalShowEventNotes) {
        feedEl.classList.add('journal-feed--hide-logs');
    } else {
        feedEl.classList.remove('journal-feed--hide-logs');
    }
}

/**
 * Build the HTML for a single journal entry card.
 */
function _renderEntryCard(id, data) {
    // Show user-set time if stored; fall back to server createdAt for old entries
    var timeStr   = data.entryTime ? journalFormatTime12(data.entryTime) : journalFormatTime(data.createdAt);
    var text      = data.entryText || '';
    var isCheckin = !!data.isCheckin;
    var placeIds  = data.placeIds || [];

    // 📍 Check-In badge — shown prominently at the top for check-in entries
    var checkinBadge = isCheckin
        ? '<div class="journal-checkin-badge">📍 Check-In</div>'
        : '';

    // Place name line — tappable links to each place detail page
    var placeHtml = '';
    if (placeIds.length > 0) {
        var placeLinks = placeIds.map(function(pid) {
            var name = _journalPlaceNamesMap[pid] || '(Place)';
            return '<a href="#place/' + journalEscape(pid) + '" class="journal-place-link">' +
                   journalEscape(name) + '</a>';
        });
        placeHtml = '<div class="journal-place-line">' + placeLinks.join(', ') + '</div>';
    }

    // "Go to Event" button — shown only on compiled entries (sourceEventId is set)
    var goToEvent = data.sourceEventId
        ? '<div class="lc-go-to-event-wrap">' +
              '<a href="#life-event/' + journalEscape(data.sourceEventId) + '" class="lc-go-to-event-btn">Go to Event →</a>' +
          '</div>'
        : '';

    // Links — rendered as clickable links at the bottom of the card
    var linksHtml = '';
    if (data.links && data.links.length) {
        var linkItems = data.links.filter(function(l) { return l.url; }).map(function(l) {
            var escapedUrl = journalEscape(l.url);
            return '<span class="journal-entry-link-row">' +
                       '<a href="' + escapedUrl + '" ' +
                           'onclick="event.stopPropagation();window.open(this.href,\'_blank\');return false;" ' +
                           'style="color:#2563eb; font-size:0.85em;">🔗 ' + journalEscape(l.label || l.url) + '</a>' +
                       '<button class="btn btn-small" ' +
                               'onclick="event.stopPropagation();_journalCopyLink(\'' + escapedUrl + '\',this)" ' +
                               'title="Copy link to clipboard" ' +
                               'style="padding:1px 5px; font-size:0.75em; margin-left:4px;">⧉</button>' +
                   '</span>';
        });
        if (linkItems.length) {
            linksHtml = '<div class="journal-entry-links">' + linkItems.join('') + '</div>';
        }
    }

    // Photos strip
    var photosHtml = '';
    if (data.photos && data.photos.length) {
        var thumbs = data.photos.map(function(p) {
            return '<img class="journal-feed-photo" src="' + p.imageData + '" ' +
                   'onclick="journalOpenPhotoViewer(this)" alt="photo">';
        }).join('');
        photosHtml = '<div class="journal-feed-photos">' + thumbs + '</div>';
    }

    return '<div class="journal-item journal-item--entry' + (isCheckin ? ' journal-item--checkin' : '') + '">' +
               checkinBadge +
               '<div class="journal-item-row">' +
                   '<span class="journal-item-time">📝 ' + journalEscape(timeStr) + '</span>' +
                   '<div class="journal-item-text">' +
                       _renderEntryTextWithMentions(text, data.mentionedPersonIds) +
                   '</div>' +
                   '<div class="journal-item-actions">' +
                       '<button class="btn btn-secondary btn-small" ' +
                               'onclick="openEditJournalEntry(\'' + id + '\')">Edit</button>' +
                   '</div>' +
               '</div>' +
               photosHtml +
               placeHtml +
               linksHtml +
               goToEvent +
           '</div>';
}

/**
 * Build the HTML for a single tracking item card.
 */
function _renderTrackingCard(id, data) {
    var timeStr   = journalFormatTime(data.createdAt);
    var category  = data.category || '';
    var value     = data.value || '';

    return '<div class="journal-item journal-item--tracking">' +
               '<div class="journal-item-row">' +
                   '<span class="journal-item-time">⚖️ ' + journalEscape(timeStr) + '</span>' +
                   '<span class="journal-tracking-category">' + journalEscape(category) + '</span>' +
                   '<span class="journal-tracking-value">' + journalEscape(value) + '</span>' +
                   '<div class="journal-item-actions">' +
                       '<button class="btn btn-secondary btn-small" ' +
                               'onclick="openEditTrackingItem(\'' + id + '\')">Edit</button>' +
                   '</div>' +
               '</div>' +
           '</div>';
}


/**
 * Build the HTML for a life event mini log entry card.
 * @param {string} id   - Log document ID
 * @param {Object} data - Enriched log data (body, eventTitle, categoryColor, etc.)
 */
function _renderLifeLogCard(id, data) {
    var timeStr  = data.entryTime ? journalFormatTime12(data.entryTime) : journalFormatTime(data.createdAt);
    var color    = data.categoryColor || 'linear-gradient(135deg,#6b7280,#9ca3af)';
    var bodyHtml = _renderEntryTextWithMentions(data.body || '', data.mentionedPersonIds);
    var eventId  = data.eventId || '';

    return '<div class="journal-item journal-item--life-log">' +
               '<div class="lc-event-badge-bar" style="background:' + color + '"></div>' +
               '<div class="lc-log-journal-body">' +
                   '<div class="journal-item-row">' +
                       '<span class="journal-item-time">📅 ' + journalEscape(timeStr) + '</span>' +
                       '<span class="lc-event-badge">' + journalEscape(data.eventTitle) + '</span>' +
                   '</div>' +
                   '<div class="journal-item-text" style="margin-top:6px;">' + bodyHtml + '</div>' +
                   (eventId
                       ? '<div class="lc-go-to-event-wrap">' +
                             '<a href="#life-event/' + journalEscape(eventId) + '" class="lc-go-to-event-btn">Go to Event →</a>' +
                         '</div>'
                       : '') +
               '</div>' +
           '</div>';
}

// ============================================================
// Go to Date
// ============================================================

/**
 * Scroll to the date header matching #journalGoToDateInput.
 * If no entries exist for that date, show a brief message.
 */
function journalGoToDate() {
    var input = document.getElementById('journalGoToDateInput');
    var msgEl = document.getElementById('journalGoToDateMsg');
    if (!input || !input.value) return;

    var dateStr = input.value; // YYYY-MM-DD
    var header = document.querySelector('[data-journal-date="' + dateStr + '"]');

    if (header) {
        header.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (msgEl) msgEl.classList.add('hidden');
    } else {
        if (msgEl) {
            msgEl.textContent = 'No entries for ' + journalFormatDateHeader(dateStr);
            msgEl.classList.remove('hidden');
            // Auto-hide after 3 seconds
            setTimeout(function() {
                msgEl.classList.add('hidden');
            }, 3000);
        }
    }
}


// ============================================================
// Journal Entry — Add / Edit  (#journal-entry full page)
// ============================================================

/**
 * Open the journal entry form in "add" mode.
 * Called by the "New Entry" button.
 */
function openAddJournalEntry() {
    window.journalEditMode       = false;
    window.currentJournalEntry   = null;
    window._journalSourceVisitId = null;
    window._journalCancelTarget  = '#journal';
    _journalMentionedPersonIds = new Set();   // fresh mention set for new entry
    _journalPeopleCache = null;               // refresh people list
    _updateMentionChips();                    // clear any chips from previous session
    _journalPlaceIds = new Set();             // fresh place set for new entry
    _updateJournalPlaceChips();               // clear place chips from previous session
    _journalCheckinMode  = false;
    _journalCheckinVenue = null;

    var titleEl  = document.getElementById('journalEntryPageTitle');
    var dateEl   = document.getElementById('journalEntryDate');
    var textEl   = document.getElementById('journalEntryText');
    var deleteBtn = document.getElementById('journalEntryDeleteBtn');

    var timeEl   = document.getElementById('journalEntryTime');

    if (titleEl)  titleEl.textContent = 'New Journal Entry';
    if (dateEl)   dateEl.value = journalFormatDate(new Date());
    if (timeEl)   timeEl.value = journalCurrentTimeHHMM();
    if (textEl)   textEl.value = '';
    if (deleteBtn) deleteBtn.classList.add('hidden');
    _journalUpdateDayOfWeek(dateEl ? dateEl.value : '');

    // Hide "View Visit" button (not relevant for regular journal entries)
    var visitBtn = document.getElementById('journalVisitSourceBtn');
    if (visitBtn) visitBtn.classList.add('hidden');

    // Clear links
    var linksContainer = document.getElementById('journalLinksContainer');
    if (linksContainer) linksContainer.innerHTML = '';

    // Clear photos
    _journalClearPhotos();

    // Reset save button in case it was left in "Saving..." state from a previous save
    var saveBtn = document.getElementById('journalEntrySaveBtn');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }

    // Wire buttons
    _journalWireEntryPage();

    window.location.hash = '#journal-entry';

    // Set sticky header breadcrumb
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML = '<a href="#life">Life</a><span class="separator">&rsaquo;</span><a href="#journal">Journal</a><span class="separator">&rsaquo;</span><span>Entry</span>';

}

/**
 * Open the journal entry form pre-filled with health visit data.
 * Called by createVisitJournalEntry() in health.js.
 * @param {string} visitDate  - YYYY-MM-DD date string from the visit
 * @param {string} preText    - Pre-assembled labeled text to populate the textarea
 * @param {string} visitId    - Firestore ID of the health visit (for back-linking)
 */
function openVisitJournalEntryPreFilled(visitDate, visitTime, preText, visitId) {
    window.journalEditMode     = false;
    window.currentJournalEntry = null;
    window._journalSourceVisitId = visitId;
    window._journalCancelTarget  = '#health-visit/' + visitId;

    _journalMentionedPersonIds = new Set();
    _journalPeopleCache = null;
    _updateMentionChips();
    _journalPlaceIds = new Set();
    _updateJournalPlaceChips();
    _journalCheckinMode  = false;
    _journalCheckinVenue = null;

    var titleEl   = document.getElementById('journalEntryPageTitle');
    var dateEl    = document.getElementById('journalEntryDate');
    var timeEl    = document.getElementById('journalEntryTime');
    var textEl    = document.getElementById('journalEntryText');
    var deleteBtn = document.getElementById('journalEntryDeleteBtn');

    if (titleEl)   titleEl.textContent = 'New Journal Entry';
    if (dateEl)    dateEl.value  = visitDate || journalFormatDate(new Date());
    if (timeEl) {
        var _n = new Date();
        timeEl.value = visitTime || (String(_n.getHours()).padStart(2, '0') + ':' + String(_n.getMinutes()).padStart(2, '0'));
    }
    if (textEl)    textEl.value  = preText || '';
    if (deleteBtn) deleteBtn.classList.add('hidden');
    _journalUpdateDayOfWeek(dateEl ? dateEl.value : '');

    var linksContainer = document.getElementById('journalLinksContainer');
    if (linksContainer) linksContainer.innerHTML = '';

    // Clear photos
    _journalClearPhotos();

    var saveBtn = document.getElementById('journalEntrySaveBtn');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }

    // Hide the "View Visit" button (not relevant until after save)
    var visitBtn = document.getElementById('journalVisitSourceBtn');
    if (visitBtn) visitBtn.classList.add('hidden');

    _journalWireEntryPage();

    window.location.hash = '#journal-entry';

    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML =
        '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
        '<a href="#health-visits">Visits</a><span class="separator">&rsaquo;</span>' +
        '<span>Journal Entry</span>';

    // Focus textarea after navigation settles
    setTimeout(function() {
        var ta = document.getElementById('journalEntryText');
        if (ta) ta.focus();
    }, 100);
}

/**
 * Open the journal entry form in "edit" mode.
 * Loads the entry from Firestore and pre-fills the form.
 * @param {string} id - The Firestore document ID
 */
async function openEditJournalEntry(id) {
    try {
        var doc = await userCol('journalEntries').doc(id).get();
        if (!doc.exists) {
            alert('Entry not found.');
            return;
        }

        var data = doc.data();
        window.currentJournalEntry = { id: id, ...data };
        window.journalEditMode = true;
        _journalCheckinMode  = false;  // editing is never in check-in mode
        _journalCheckinVenue = null;
        // Restore mention set from stored IDs, then show chips
        _journalMentionedPersonIds = new Set(data.mentionedPersonIds || []);
        _journalPeopleCache = null;
        await _journalLoadPeopleCache();
        _updateMentionChips();
        // Restore place set from stored IDs, then show chips
        _journalPlaceIds = new Set(data.placeIds || []);
        if (data.placeIds && data.placeIds.length > 0) {
            var placeFetches = data.placeIds.map(function(pid) {
                return userCol('places').doc(pid).get().then(function(d) {
                    if (d.exists) _journalPlaceNamesMap[pid] = d.data().name || '(Place)';
                });
            });
            await Promise.all(placeFetches);
        }
        _updateJournalPlaceChips();

        var titleEl   = document.getElementById('journalEntryPageTitle');
        var dateEl    = document.getElementById('journalEntryDate');
        var timeEl    = document.getElementById('journalEntryTime');
        var textEl    = document.getElementById('journalEntryText');
        var deleteBtn = document.getElementById('journalEntryDeleteBtn');

        if (titleEl)  titleEl.textContent = 'Edit Journal Entry';
        if (dateEl)   dateEl.value = data.date || '';
        if (timeEl)   timeEl.value = data.entryTime || journalTimestampToHHMM(data.createdAt);
        if (textEl)   textEl.value = data.entryText || '';
        if (deleteBtn) deleteBtn.classList.remove('hidden');
        _journalUpdateDayOfWeek(dateEl ? dateEl.value : '');

        // Populate links
        var linksContainer = document.getElementById('journalLinksContainer');
        if (linksContainer) {
            linksContainer.innerHTML = '';
            (data.links || []).forEach(function(l) { _journalAddLinkRow(l.label, l.url); });
        }

        // Restore photos
        _journalPhotos = (data.photos || []).slice();
        _journalRenderPhotoStrip();

        // Reset save button in case it was left in "Saving..." state
        var saveBtn = document.getElementById('journalEntrySaveBtn');
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }

        // "View Visit" button — shown only when this entry was created from a visit
        var visitBtn = document.getElementById('journalVisitSourceBtn');
        if (visitBtn) {
            if (data.sourceVisitId) {
                visitBtn.classList.remove('hidden');
                visitBtn.onclick = function() {
                    window.location.hash = '#health-visit/' + data.sourceVisitId;
                };
            } else {
                visitBtn.classList.add('hidden');
            }
        }

        // Cancel goes back to the visit if sourced from one, otherwise journal feed
        window._journalSourceVisitId = null;  // editing existing — no re-link needed
        window._journalCancelTarget  = data.sourceVisitId
            ? '#health-visit/' + data.sourceVisitId
            : '#journal';

        // Wire buttons
        _journalWireEntryPage();

        window.location.hash = '#journal-entry';

        // Set sticky header breadcrumb
        var crumb = document.getElementById('breadcrumbBar');
        if (crumb) crumb.innerHTML = '<a href="#life">Life</a><span class="separator">&rsaquo;</span><a href="#journal">Journal</a><span class="separator">&rsaquo;</span><span>Entry</span>';

        // Focus the textarea after navigation settles
        setTimeout(function() {
            var ta = document.getElementById('journalEntryText');
            if (ta) ta.focus();
        }, 100);

    } catch (err) {
        console.error('Error loading journal entry:', err);
        alert('Error loading entry. See console for details.');
    }
}

/**
 * Wire the Save, Cancel, Delete, and Voice buttons on the entry form.
 * Called every time the entry page opens.
 */
/**
 * Add a link row (label + URL) to the links section of the journal entry form.
 */
function _journalAddLinkRow(label, url) {
    var container = document.getElementById('journalLinksContainer');
    if (!container) return;
    label = label || '';
    url   = url   || '';
    var row = document.createElement('div');
    row.style.cssText = 'display:flex; gap:6px; align-items:center;';
    row.innerHTML =
        '<input type="text" class="journal-link-label" placeholder="Label (optional)" ' +
               'value="' + (label.replace(/"/g, '&quot;')) + '" ' +
               'style="flex:0 0 36%; min-width:0; padding:6px 8px; border:1px solid #ccc; border-radius:6px; font-size:0.9em;">' +
        '<input type="url" class="journal-link-url" placeholder="https://..." ' +
               'value="' + (url.replace(/"/g, '&quot;')) + '" ' +
               'style="flex:1; min-width:0; padding:6px 8px; border:1px solid #ccc; border-radius:6px; font-size:0.9em;">' +
        '<button class="btn btn-secondary btn-small" type="button" ' +
                'onclick="this.parentElement.remove()" ' +
                'style="flex-shrink:0; padding:4px 8px;">✕</button>';
    container.appendChild(row);
}

/**
 * Copy a link URL to the clipboard. Briefly changes the button to a checkmark to confirm.
 */
/**
 * Opens a full-screen lightbox overlay to view a journal photo.
 * Tap the overlay or press Escape to dismiss.
 */
function journalOpenPhotoViewer(imgEl) {
    var overlay = document.createElement('div');
    overlay.className = 'journal-photo-overlay';
    overlay.innerHTML = '<img src="' + imgEl.src + '" alt="photo">';
    overlay.addEventListener('click', function() { overlay.remove(); });
    document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); }
    });
    document.body.appendChild(overlay);
}

function _journalCopyLink(url, btn) {
    navigator.clipboard.writeText(url).then(function() {
        var orig = btn.textContent;
        btn.textContent = '✓';
        setTimeout(function() { btn.textContent = orig; }, 1500);
    }).catch(function() {
        alert('Could not copy to clipboard.');
    });
}

// ── Journal Entry Photos ─────────────────────────────────────

/** Clears the in-memory photo array and re-renders the strip. */
function _journalClearPhotos() {
    _journalPhotos = [];
    _journalRenderPhotoStrip();
}

/** Renders the photo thumbnail strip from _journalPhotos. */
function _journalRenderPhotoStrip() {
    var strip = document.getElementById('journalPhotoStrip');
    if (!strip) return;
    strip.innerHTML = '';
    _journalPhotos.forEach(function(p, i) {
        var thumb = document.createElement('div');
        thumb.className = 'journal-photo-thumb';
        thumb.innerHTML =
            '<img src="' + p.imageData + '" alt="photo ' + (i + 1) + '">' +
            '<button class="journal-photo-remove" title="Remove photo" onclick="_journalRemovePhoto(' + i + ')">✕</button>';
        strip.appendChild(thumb);
    });
    strip.style.display = _journalPhotos.length ? 'flex' : 'none';
}

/** Remove a photo by index and re-render. */
function _journalRemovePhoto(idx) {
    _journalPhotos.splice(idx, 1);
    _journalRenderPhotoStrip();
}

/**
 * Compress a File/Blob and add it to _journalPhotos.
 * Reuses the global compressImage() from photos.js.
 */
async function _journalAddPhotoFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    try {
        var dataUrl = await compressImage(file);
        _journalPhotos.push({ imageData: dataUrl, caption: '' });
        _journalRenderPhotoStrip();
    } catch (err) {
        console.error('Error compressing photo:', err);
        alert('Could not process that image. Please try another.');
    }
}

/** Handle paste events on the entry textarea — pick up any pasted image. */
function _journalHandlePaste(e) {
    var items = (e.clipboardData || window.clipboardData || {}).items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
            e.preventDefault();
            _journalAddPhotoFile(items[i].getAsFile());
            return;
        }
    }
}

function _journalWireEntryPage() {
    var saveBtn   = document.getElementById('journalEntrySaveBtn');
    var cancelBtn = document.getElementById('journalEntryCancelBtn');
    var deleteBtn = document.getElementById('journalEntryDeleteBtn');

    if (saveBtn)   saveBtn.onclick   = saveJournalEntry;
    if (cancelBtn) cancelBtn.onclick = function() {
        window.location.hash = window._journalCancelTarget || '#journal';
        window._journalCancelTarget  = '#journal';
        window._journalSourceVisitId = null;
    };

    var dateEl = document.getElementById('journalEntryDate');
    if (dateEl) dateEl.onchange = function() { _journalUpdateDayOfWeek(this.value); };
    if (deleteBtn) deleteBtn.onclick = function() {
        if (window.currentJournalEntry) {
            deleteJournalEntry(window.currentJournalEntry.id);
        }
    };

    // Initialize voice-to-text for the entry textarea
    initVoiceToText('journalEntryText', 'journalVoiceBtn');

    // Initialize @mention autocomplete
    _journalInitMentions();

    // Initialize place search (skips if in check-in mode with pre-selected venue)
    _journalInitPlaceSearch();

    // Show/hide check-in vs regular places UI based on mode
    _journalUpdateCheckinModeUI();

    // Photo paste on the textarea
    var textEl = document.getElementById('journalEntryText');
    if (textEl) {
        textEl.removeEventListener('paste', _journalHandlePaste);
        textEl.addEventListener('paste', _journalHandlePaste);
    }

    // Camera / Gallery file input
    var photoInput = document.getElementById('journalPhotoInput');
    if (photoInput && !photoInput.dataset.wired) {
        photoInput.dataset.wired = 'true';
        photoInput.addEventListener('change', function() {
            Array.from(photoInput.files).forEach(function(f) { _journalAddPhotoFile(f); });
            photoInput.value = '';
        });
    }
}

/**
 * Save the current journal entry (add or edit).
 */
async function saveJournalEntry() {
    var dateEl = document.getElementById('journalEntryDate');
    var timeEl = document.getElementById('journalEntryTime');
    var textEl = document.getElementById('journalEntryText');
    var saveBtn = document.getElementById('journalEntrySaveBtn');

    var date      = dateEl ? dateEl.value.trim() : '';
    var entryTime = timeEl ? timeEl.value.trim() : '';
    var text      = textEl ? textEl.value.trim() : '';

    if (!date) {
        alert('Please select a date.');
        return;
    }
    if (!text && !_journalCheckinMode) {
        alert('Please enter some text for the journal entry.');
        return;
    }

    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

    // Copy entry text to clipboard before saving so it's recoverable if the save fails
    if (text) {
        try { await navigator.clipboard.writeText(text); } catch (e) { /* non-fatal */ }
    }

    var mentionedIds  = [..._journalMentionedPersonIds];
    var placeIds      = [..._journalPlaceIds];
    var isCheckinEntry = _journalCheckinMode;  // capture before any async work

    // Collect links from the links section
    var links = [];
    document.querySelectorAll('#journalLinksContainer > div').forEach(function(row) {
        var label = (row.querySelector('.journal-link-label') ? row.querySelector('.journal-link-label').value : '').trim();
        var url   = (row.querySelector('.journal-link-url')   ? row.querySelector('.journal-link-url').value   : '').trim();
        if (url) links.push({ label: label, url: url });
    });

    try {
        // Resolve the check-in venue to a Firestore place ID (dedup + enrichment inside)
        if (_journalCheckinMode && _journalCheckinVenue && _journalCheckinVenue.name) {
            var checkinPlaceId = _journalCheckinVenue.existingId
                ? _journalCheckinVenue.existingId
                : await placesSaveNew(_journalCheckinVenue);
            if (placeIds.indexOf(checkinPlaceId) === -1) placeIds.push(checkinPlaceId);
        }

        if (window.journalEditMode && window.currentJournalEntry) {
            // Update existing entry — preserve existing isCheckin value (do not overwrite)
            var entryId = window.currentJournalEntry.id;
            await userCol('journalEntries').doc(entryId).update({
                date:               date,
                entryTime:          entryTime,
                entryText:          text,
                mentionedPersonIds: mentionedIds,
                placeIds:           placeIds,
                links:              links,
                photos:             _journalPhotos.slice(),
                updatedAt:          firebase.firestore.FieldValue.serverTimestamp()
            });
            // Re-sync interactions (deletes old records, creates fresh ones)
            await _syncJournalMentionInteractions(entryId, date, text, mentionedIds);
        } else {
            // Add new entry — need the generated ID to link interactions
            var newEntryData = {
                date:               date,
                entryTime:          entryTime,
                entryText:          text,
                mentionedPersonIds: mentionedIds,
                placeIds:           placeIds,
                links:              links,
                photos:             _journalPhotos.slice(),
                isCheckin:          isCheckinEntry,
                createdAt:          firebase.firestore.FieldValue.serverTimestamp()
            };
            // If opened from a health visit, store the back-link on the entry
            var sourceVisitId = window._journalSourceVisitId || null;
            if (sourceVisitId) newEntryData.sourceVisitId = sourceVisitId;

            var ref = await userCol('journalEntries').add(newEntryData);

            // Write the forward-link onto the visit so the button updates to "View Journal"
            if (sourceVisitId) {
                await userCol('healthVisits').doc(sourceVisitId).update({
                    linkedJournalEntryId: ref.id
                });
                if (window.currentHealthVisit && window.currentHealthVisit.id === sourceVisitId) {
                    window.currentHealthVisit.linkedJournalEntryId = ref.id;
                }
            }

            if (mentionedIds.length > 0) {
                await _syncJournalMentionInteractions(ref.id, date, text, mentionedIds);
            }
        }

        var cancelTarget = window._journalCancelTarget || '#journal';
        window._journalSourceVisitId = null;
        window._journalCancelTarget  = '#journal';
        window.location.hash = cancelTarget;

    } catch (err) {
        console.error('Error saving journal entry:', err);
        alert('Error saving entry. See console for details.');
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
    }
}

/**
 * Delete a journal entry after confirmation.
 * @param {string} id - The Firestore document ID
 */
async function deleteJournalEntry(id) {
    if (!confirm('Delete this journal entry? This cannot be undone.')) return;

    try {
        await userCol('journalEntries').doc(id).delete();

        // If we're on the entry page, go back to the journal
        if (window.location.hash === '#journal-entry') {
            window.location.hash = '#journal';
        } else {
            // Reload the feed in place
            loadJournalData();
        }
    } catch (err) {
        console.error('Error deleting journal entry:', err);
        alert('Error deleting entry. See console for details.');
    }
}


// ============================================================
// Voice to Text
// ============================================================

/**
 * Initialize voice-to-text for a textarea.
 * Uses the browser's built-in Web Speech API (SpeechRecognition).
 * Works on desktop Chrome and Android Chrome.
 * Hides the button if the browser doesn't support it.
 *
 * @param {string} textareaId - ID of the textarea to append text to
 * @param {string} btnId      - ID of the mic button to toggle
 */
/**
 * Convert spoken punctuation words into their symbol equivalents.
 * Applied to voice-to-text transcripts so saying "period" inserts "."
 * just like the phone's SMS keyboard does.
 *
 * Rules are applied in order — longer phrases first to avoid partial matches.
 * Each replacement trims any leading/trailing space around the word so the
 * result reads naturally (e.g. "Hello period" → "Hello.")
 */
/**
 * Handle destructive voice editing commands that operate on the textarea
 * content directly rather than inserting text.
 * Called in onresult BEFORE punctuation processing.
 * Returns true if the transcript was a command (caller should skip appending).
 *
 * Commands (entire spoken chunk must match, case-insensitive):
 *   "delete last word"     — removes the last word in the textarea
 *   "delete last sentence" — removes text after the last .  !  or  ?
 *   "clear all"            — empties the textarea completely
 */
function _applyVoiceEditCommand(rawTranscript, textarea) {
    var cmd = rawTranscript.trim().toLowerCase();

    if (cmd === 'delete last word') {
        // Remove the last word and any surrounding whitespace
        textarea.value = textarea.value.replace(/\s*\S+\s*$/, '');
        return true;
    }

    if (cmd === 'delete last sentence') {
        var val = textarea.value;
        // Find the rightmost .!? that still has non-whitespace content after it
        // — that's the last sentence boundary before the incomplete trailing sentence.
        // If there's no such boundary, clear everything.
        var match = val.match(/([\s\S]*[.!?])[\s\S]*\S/);
        if (match) {
            textarea.value = match[1];
        } else {
            textarea.value = '';
        }
        return true;
    }

    if (cmd === 'clear all') {
        textarea.value = '';
        return true;
    }

    return false; // not a recognized command
}

function applySpokenPunctuation(text) {
    var rules = [
        // New line / paragraph first (multi-word)
        [/\s*new paragraph\s*/gi,      '\n\n'],
        [/\s*new line\s*/gi,           '\n'],
        // Multi-word punctuation
        [/\s*open parenthesis\s*/gi,   ' ('],
        [/\s*close parenthesis\s*/gi,  ') '],
        [/\s*open paren\s*/gi,         ' ('],
        [/\s*close paren\s*/gi,        ') '],
        [/\s*question mark\s*/gi,      '? '],
        [/\s*exclamation point\s*/gi,  '! '],
        [/\s*exclamation mark\s*/gi,   '! '],
        [/\s*dot dot dot\s*/gi,        '... '],
        // Single-word punctuation
        [/\s*period\s*/gi,             '. '],
        [/\s*comma\s*/gi,              ', '],
        [/\s*semicolon\s*/gi,          '; '],
        [/\s*colon\s*/gi,             ': '],
        [/\s*hyphen\s*/gi,             '-'],
        [/\s*dash\s*/gi,              ' — '],
        [/\s*ellipsis\s*/gi,           '... '],
    ];

    rules.forEach(function(rule) {
        text = text.replace(rule[0], rule[1]);
    });

    // Remove spaces that landed before punctuation (e.g. speech engine outputs " ." or " ,")
    text = text.replace(/ ([.,;:!?])/g, '$1');
    // Collapse multiple spaces/tabs (but NOT newlines — those are intentional commands)
    text = text.replace(/[ \t]{2,}/g, ' ');
    // Strip leading/trailing spaces and tabs only — never strip \n or \n\n
    text = text.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');

    // Capitalize the first letter of each new sentence WITHIN this chunk
    // (after ". ", "? ", "! " followed by a lowercase letter)
    // NOTE: We do NOT capitalize the first letter of the chunk here — that is
    // handled at insertion time based on whether the preceding text ends a sentence.
    text = text.replace(/([.?!]\s+)([a-z])/g, function(match, punct, letter) {
        return punct + letter.toUpperCase();
    });

    return text;
}

function initVoiceToText(textareaId, btnId) {
    var btn = document.getElementById(btnId);
    if (!btn) return;

    // Check for browser support
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        // Browser doesn't support speech recognition — hide the button
        btn.style.display = 'none';
        return;
    }

    // Show the button (in case it was previously hidden)
    btn.style.display = '';
    btn.textContent = '🎤 Speak';
    btn.classList.remove('journal-voice-active');

    var recognition = new SR();
    recognition.continuous   = true;   // Keep listening until stopped
    recognition.interimResults = false; // Only final results
    recognition.lang = 'en-US';

    var isListening = false;

    // Expose a global stop function so other modules (e.g. QuickLog send/cancel)
    // can kill the active recognition session from outside this closure.
    window._stopVoiceToText = function() {
        if (isListening) {
            isListening = false;
            try { recognition.stop(); } catch (e) { /* already stopped */ }
        }
    };

    btn.onclick = function() {
        if (isListening) {
            isListening = false;   // Set false before stop so onend doesn't auto-restart
            recognition.stop();
        } else {
            try {
                recognition.start();
            } catch (e) {
                console.warn('Speech recognition start error:', e);
            }
        }
    };

    recognition.onstart = function() {
        isListening = true;
        btn.textContent = '🔴 Listening...';
        btn.classList.add('journal-voice-active');
    };

    recognition.onresult = function(event) {
        var textarea = document.getElementById(textareaId);
        if (!textarea) return;

        // Collect all final results from this recognition session
        var transcript = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                transcript += event.results[i][0].transcript;
            }
        }

        if (transcript) {
            // Check for editing commands first — these act on the textarea directly
            // and should not be appended as text.
            if (_applyVoiceEditCommand(transcript, textarea)) return;

            // Convert spoken punctuation words to symbols (e.g. "period" → ".")
            transcript = applySpokenPunctuation(transcript);

            var existing = textarea.value;

            // Decide whether the first word of this chunk should be capitalized.
            // Capitalize only when: the textarea is empty, OR the existing text
            // ends with sentence-closing punctuation (. ! ?).
            // Otherwise lowercase it — the speech recognizer auto-capitalizes every
            // new chunk it fires, causing random mid-sentence capitals.
            var endsWithSentence = /[.!?]\s*$/.test(existing.trimEnd());
            var shouldCapitalize = (existing.trim().length === 0) || endsWithSentence;

            if (transcript.length > 0) {
                if (shouldCapitalize) {
                    transcript = transcript.charAt(0).toUpperCase() + transcript.slice(1);
                } else {
                    transcript = transcript.charAt(0).toLowerCase() + transcript.slice(1);
                }
            }

            // Append with a space separator if needed.
            // Skip the space when: existing already ends with space/newline,
            // OR the incoming transcript starts with a newline (it IS the newline).
            var needsSpace = existing.length > 0
                && !existing.endsWith(' ')
                && !existing.endsWith('\n')
                && !transcript.startsWith('\n');
            textarea.value = existing + (needsSpace ? ' ' : '') + transcript;
            textarea.scrollTop = textarea.scrollHeight;
        }
    };

    recognition.onend = function() {
        // If isListening is still true, the browser cut off due to a pause —
        // auto-restart so the user can take their time without losing the session.
        if (isListening) {
            try { recognition.start(); } catch (e) { /* already starting */ }
        } else {
            btn.textContent = '🎤 Speak';
            btn.classList.remove('journal-voice-active');
        }
    };

    recognition.onerror = function(event) {
        console.warn('Speech recognition error:', event.error);

        if (event.error === 'no-speech') {
            // Silence detected — restart quietly if user hasn't stopped
            if (isListening) {
                try { recognition.start(); } catch (e) { /* already starting */ }
            }
            return;
        }

        // Any other error — stop fully and show brief indicator
        isListening = false;
        btn.textContent = '⚠️ Error';
        btn.classList.remove('journal-voice-active');
        setTimeout(function() { btn.textContent = '🎤 Speak'; }, 2000);
    };
}


// ============================================================
// Tracking Items — Add / Edit  (#journal-tracking full page)
// ============================================================

/**
 * Load all tracking categories into window.journalCategories.
 * Called before opening the tracking form.
 */
async function loadJournalCategories() {
    try {
        var snap = await userCol('journalCategories').orderBy('name').get();
        window.journalCategories = [];
        snap.forEach(function(doc) {
            window.journalCategories.push({ id: doc.id, name: doc.data().name });
        });
    } catch (err) {
        console.error('Error loading journal categories:', err);
        window.journalCategories = [];
    }
}

/**
 * Open the tracking form in "add" mode.
 * Allows entering multiple category+value rows at once.
 */
async function openAddTracking() {
    window.journalTrackingEditMode = false;
    window.currentTrackingItem = null;

    // Load categories before building the form
    await loadJournalCategories();

    var titleEl    = document.getElementById('journalTrackingPageTitle');
    var dateEl     = document.getElementById('trackingDate');
    var container  = document.getElementById('trackingRowsContainer');
    var deleteBtn  = document.getElementById('trackingDeleteBtn');

    if (titleEl)   titleEl.textContent = 'Add Tracking';
    if (dateEl)    dateEl.value = journalFormatDate(new Date());
    if (container) container.innerHTML = '';
    if (deleteBtn) deleteBtn.classList.add('hidden');

    // Reset save button in case it was left in "Saving..." state
    var saveBtn = document.getElementById('trackingSaveBtn');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }

    // Add one blank row to start
    addTrackingRow();

    // Wire page buttons
    _journalWireTrackingPage();

    window.location.hash = '#journal-tracking';

    // Set sticky header breadcrumb
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML = '<a href="#life">Life</a><span class="separator">&rsaquo;</span><a href="#journal">Journal</a><span class="separator">&rsaquo;</span><span>Tracking</span>';
}

/**
 * Open the tracking form in "edit" mode for a single item.
 * Shows one pre-filled row.
 * @param {string} id - Firestore document ID of the tracking item
 */
async function openEditTrackingItem(id) {
    await loadJournalCategories();

    try {
        var doc = await userCol('journalTrackingItems').doc(id).get();
        if (!doc.exists) {
            alert('Tracking item not found.');
            return;
        }

        var data = doc.data();
        window.currentTrackingItem = { id: id, ...data };
        window.journalTrackingEditMode = true;

        var titleEl   = document.getElementById('journalTrackingPageTitle');
        var dateEl    = document.getElementById('trackingDate');
        var container = document.getElementById('trackingRowsContainer');
        var deleteBtn = document.getElementById('trackingDeleteBtn');

        if (titleEl)   titleEl.textContent = 'Edit Tracking Item';
        if (dateEl)    dateEl.value = data.date || journalFormatDate(new Date());
        if (container) container.innerHTML = '';
        if (deleteBtn) deleteBtn.classList.remove('hidden');

        // Reset save button in case it was left in "Saving..." state
        var saveBtn = document.getElementById('trackingSaveBtn');
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }

        // Add a single pre-filled row
        addTrackingRow(data.category, data.value);

        // Wire page buttons
        _journalWireTrackingPage();

        window.location.hash = '#journal-tracking';

        // Set sticky header breadcrumb
        var crumb = document.getElementById('breadcrumbBar');
        if (crumb) crumb.innerHTML = '<a href="#life">Life</a><span class="separator">&rsaquo;</span><a href="#journal">Journal</a><span class="separator">&rsaquo;</span><span>Tracking</span>';

    } catch (err) {
        console.error('Error loading tracking item:', err);
        alert('Error loading tracking item. See console for details.');
    }
}

/**
 * Wire Save, Cancel, Delete, and Add Row buttons on the tracking form.
 */
function _journalWireTrackingPage() {
    var saveBtn       = document.getElementById('trackingSaveBtn');
    var cancelBtn     = document.getElementById('trackingCancelBtn');
    var deleteBtn     = document.getElementById('trackingDeleteBtn');
    var addRowBtn     = document.getElementById('trackingAddRowBtn');
    var addRowSection = document.getElementById('trackingAddRowSection');

    if (saveBtn)   saveBtn.onclick   = saveTracking;
    if (cancelBtn) cancelBtn.onclick = function() { window.location.hash = '#journal'; };
    if (deleteBtn) deleteBtn.onclick = function() {
        if (window.currentTrackingItem) {
            deleteTrackingItem(window.currentTrackingItem.id);
        }
    };

    // Hide "Add Row" button in edit mode (only one row)
    if (addRowSection) {
        addRowSection.style.display = window.journalTrackingEditMode ? 'none' : '';
    }
    if (addRowBtn) {
        addRowBtn.onclick = function() { addTrackingRow(); };
    }
}

/**
 * Append a new tracking row to #trackingRowsContainer.
 * Each row has: category dropdown, value input, remove button.
 *
 * @param {string} [preCategory] - Pre-select this category (for edit mode)
 * @param {string} [preValue]    - Pre-fill this value (for edit mode)
 */
function addTrackingRow(preCategory, preValue) {
    var container = document.getElementById('trackingRowsContainer');
    if (!container) return;

    var rowIndex = container.children.length;
    var rowId = 'trackingRow_' + Date.now() + '_' + rowIndex;

    // Build options for the category dropdown
    var optionsHtml = '<option value="">-- Select category --</option>';
    (window.journalCategories || []).forEach(function(cat) {
        var sel = (preCategory && cat.name === preCategory) ? ' selected' : '';
        optionsHtml += '<option value="' + journalEscape(cat.name) + '"' + sel + '>' +
                       journalEscape(cat.name) + '</option>';
    });
    optionsHtml += '<option value="__new__">New...</option>';

    var row = document.createElement('div');
    row.className = 'tracking-row';
    row.id = rowId;
    row.innerHTML =
        '<select class="tracking-cat-select" onchange="_trackingCatChanged(this)">' +
            optionsHtml +
        '</select>' +
        '<input type="text" class="tracking-new-cat-input hidden" placeholder="New category name">' +
        '<input type="text" class="tracking-value-input" placeholder="Value" value="' +
            journalEscape(preValue || '') + '">' +
        '<button type="button" class="tracking-row-remove" ' +
                'onclick="_removeTrackingRow(this)" title="Remove row">✕</button>';

    container.appendChild(row);

    // Update remove button visibility (hide if only 1 row)
    _updateTrackingRowRemoveBtns();
}

/**
 * Show or hide the "New category" text input when "New..." is selected.
 * @param {HTMLSelectElement} selectEl
 */
function _trackingCatChanged(selectEl) {
    var row = selectEl.closest('.tracking-row');
    var newInput = row.querySelector('.tracking-new-cat-input');
    if (selectEl.value === '__new__') {
        newInput.classList.remove('hidden');
        newInput.focus();
    } else {
        newInput.classList.add('hidden');
        newInput.value = '';
    }
}

/**
 * Remove a tracking row from the form.
 * @param {HTMLButtonElement} btn - The remove button that was clicked
 */
function _removeTrackingRow(btn) {
    var row = btn.closest('.tracking-row');
    if (row) row.remove();
    _updateTrackingRowRemoveBtns();
}

/**
 * Hide the remove button when there is only one row left
 * (so the user can't accidentally remove all rows).
 */
function _updateTrackingRowRemoveBtns() {
    var container = document.getElementById('trackingRowsContainer');
    if (!container) return;
    var rows = container.querySelectorAll('.tracking-row');
    rows.forEach(function(row, idx) {
        var btn = row.querySelector('.tracking-row-remove');
        if (btn) btn.style.visibility = (rows.length === 1) ? 'hidden' : 'visible';
    });
}

/**
 * Save all tracking rows (add mode) or update one row (edit mode).
 */
async function saveTracking() {
    var dateEl    = document.getElementById('trackingDate');
    var container = document.getElementById('trackingRowsContainer');
    var saveBtn   = document.getElementById('trackingSaveBtn');

    var date = dateEl ? dateEl.value.trim() : '';
    if (!date) {
        alert('Please select a date.');
        return;
    }

    // Collect rows
    var rows = container ? container.querySelectorAll('.tracking-row') : [];
    var itemsToSave = [];

    for (var i = 0; i < rows.length; i++) {
        var row      = rows[i];
        var catSel   = row.querySelector('.tracking-cat-select');
        var newCatIn = row.querySelector('.tracking-new-cat-input');
        var valIn    = row.querySelector('.tracking-value-input');

        var catName  = '';
        var value    = valIn ? valIn.value.trim() : '';

        if (catSel && catSel.value === '__new__') {
            // User typed a new category name
            catName = newCatIn ? newCatIn.value.trim() : '';
        } else {
            catName = catSel ? catSel.value.trim() : '';
        }

        // Skip rows where both category and value are empty
        if (!catName && !value) continue;

        itemsToSave.push({ catName: catName, isNew: catSel && catSel.value === '__new__', value: value });
    }

    if (itemsToSave.length === 0) {
        alert('Please enter at least one tracking item.');
        return;
    }

    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

    try {
        // Save any newly created categories first
        for (var j = 0; j < itemsToSave.length; j++) {
            var item = itemsToSave[j];
            if (item.isNew && item.catName) {
                // Check if category already exists (may have been typed as duplicate)
                var exists = window.journalCategories.some(function(c) {
                    return c.name.toLowerCase() === item.catName.toLowerCase();
                });
                if (!exists) {
                    var newDoc = await userCol('journalCategories').add({
                        name:      item.catName,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    window.journalCategories.push({ id: newDoc.id, name: item.catName });
                }
            }
        }

        if (window.journalTrackingEditMode && window.currentTrackingItem) {
            // Edit mode — update single doc
            var single = itemsToSave[0];
            await userCol('journalTrackingItems').doc(window.currentTrackingItem.id).update({
                date:      date,
                category:  single.catName,
                value:     single.value,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            // Add mode — save each row as a separate doc
            var savePromises = itemsToSave.map(function(item) {
                return userCol('journalTrackingItems').add({
                    date:      date,
                    category:  item.catName,
                    value:     item.value,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            await Promise.all(savePromises);
        }

        window.location.hash = '#journal';

    } catch (err) {
        console.error('Error saving tracking items:', err);
        alert('Error saving tracking items. See console for details.');
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
    }
}

/**
 * Delete a tracking item after confirmation.
 * @param {string} id - Firestore document ID
 */
async function deleteTrackingItem(id) {
    if (!confirm('Delete this tracking item? This cannot be undone.')) return;

    try {
        await userCol('journalTrackingItems').doc(id).delete();

        if (window.location.hash === '#journal-tracking') {
            window.location.hash = '#journal';
        } else {
            loadJournalData();
        }
    } catch (err) {
        console.error('Error deleting tracking item:', err);
        alert('Error deleting tracking item. See console for details.');
    }
}


// ============================================================
// Categories Management  (#journal-categories full page)
// ============================================================

/**
 * Load and render the categories management page.
 * Called by app.js when routing to #journal-categories.
 */
async function loadJournalCategoriesPage() {
    var listEl = document.getElementById('journalCategoriesList');
    if (listEl) listEl.innerHTML = '<p class="empty-state">Loading...</p>';

    // Set sticky header breadcrumb
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML = '<a href="#life">Life</a><span class="separator">&rsaquo;</span><a href="#journal">Journal</a><span class="separator">&rsaquo;</span><span>Categories</span>';

    // Wire the Add Category button
    var addBtn = document.getElementById('journalCategoryAddBtn');
    if (addBtn) {
        addBtn.onclick = function() {
            var form = document.getElementById('journalAddCategoryForm');
            var input = document.getElementById('journalNewCategoryInput');
            if (form) {
                form.style.display = 'flex';
                form.classList.remove('hidden');
            }
            if (input) { input.value = ''; input.focus(); }
        };
    }

    var saveNewBtn = document.getElementById('journalNewCategorySaveBtn');
    if (saveNewBtn) {
        saveNewBtn.onclick = function() {
            var input = document.getElementById('journalNewCategoryInput');
            var name = input ? input.value.trim() : '';
            if (name) addJournalCategory(name);
        };
    }

    var cancelNewBtn = document.getElementById('journalNewCategoryCancelBtn');
    if (cancelNewBtn) {
        cancelNewBtn.onclick = function() {
            var form = document.getElementById('journalAddCategoryForm');
            if (form) { form.style.display = 'none'; }
        };
    }

    // Enter = save, Escape = cancel on the new category input
    var newCatInput = document.getElementById('journalNewCategoryInput');
    if (newCatInput) {
        newCatInput.onkeydown = function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                var name = newCatInput.value.trim();
                if (name) addJournalCategory(name);
            } else if (e.key === 'Escape') {
                var form = document.getElementById('journalAddCategoryForm');
                if (form) { form.style.display = 'none'; }
            }
        };
    }

    // Load and render category list
    try {
        var snap = await userCol('journalCategories').orderBy('name').get();
        var cats = [];
        snap.forEach(function(doc) {
            cats.push({ id: doc.id, name: doc.data().name });
        });

        if (!listEl) return;

        if (cats.length === 0) {
            listEl.innerHTML = '<p class="empty-state">No categories yet. Add one above.</p>';
            return;
        }

        var html = '';
        cats.forEach(function(cat) {
            html += '<div class="journal-category-item" id="catItem_' + cat.id + '">' +
                        '<span class="journal-category-name" id="catName_' + cat.id + '">' +
                            journalEscape(cat.name) +
                        '</span>' +
                        '<input type="text" class="journal-category-edit-input hidden" ' +
                               'id="catInput_' + cat.id + '" value="' + journalEscape(cat.name) + '">' +
                        '<button class="btn btn-secondary btn-small" id="catEditBtn_' + cat.id + '" ' +
                                'onclick="_journalStartEditCategory(\'' + cat.id + '\')">Edit</button>' +
                        '<button class="btn btn-primary btn-small hidden" id="catSaveBtn_' + cat.id + '" ' +
                                'onclick="_journalSaveEditCategory(\'' + cat.id + '\')">Save</button>' +
                        '<button class="btn btn-danger btn-small" ' +
                                'onclick="deleteJournalCategory(\'' + cat.id + '\')">Delete</button>' +
                    '</div>';
        });
        listEl.innerHTML = html;

    } catch (err) {
        console.error('Error loading categories:', err);
        if (listEl) listEl.innerHTML = '<p class="empty-state" style="color:#b91c1c;">Error loading categories.</p>';
    }
}

/**
 * Switch a category row into inline edit mode.
 * @param {string} id - Category document ID
 */
function _journalStartEditCategory(id) {
    document.getElementById('catName_'    + id).classList.add('hidden');
    document.getElementById('catInput_'   + id).classList.remove('hidden');
    document.getElementById('catEditBtn_' + id).classList.add('hidden');
    document.getElementById('catSaveBtn_' + id).classList.remove('hidden');
    document.getElementById('catInput_'   + id).focus();
}

/**
 * Save a renamed category.
 * @param {string} id - Category document ID
 */
async function _journalSaveEditCategory(id) {
    var input = document.getElementById('catInput_' + id);
    var name = input ? input.value.trim() : '';
    if (!name) { alert('Category name cannot be empty.'); return; }
    await renameJournalCategory(id, name);
}

/**
 * Add a new tracking category.
 * @param {string} name - The category name
 */
async function addJournalCategory(name) {
    name = name.trim();
    if (!name) return;

    try {
        // Check for duplicate (case-insensitive)
        var snap = await userCol('journalCategories').get();
        var duplicate = false;
        snap.forEach(function(doc) {
            if (doc.data().name.toLowerCase() === name.toLowerCase()) duplicate = true;
        });
        if (duplicate) {
            alert('A category with that name already exists.');
            return;
        }

        await userCol('journalCategories').add({
            name:      name,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Hide the add form and reload
        var form = document.getElementById('journalAddCategoryForm');
        if (form) form.style.display = 'none';

        loadJournalCategoriesPage();

    } catch (err) {
        console.error('Error adding category:', err);
        alert('Error adding category. See console for details.');
    }
}

/**
 * Rename an existing tracking category.
 * @param {string} id      - Category document ID
 * @param {string} newName - New category name
 */
async function renameJournalCategory(id, newName) {
    newName = newName.trim();
    if (!newName) return;

    try {
        await userCol('journalCategories').doc(id).update({ name: newName });
        loadJournalCategoriesPage();
    } catch (err) {
        console.error('Error renaming category:', err);
        alert('Error renaming category. See console for details.');
    }
}

/**
 * Delete a tracking category after confirmation.
 * @param {string} id - Category document ID
 */
// ============================================================
// VOICE HELP MODAL  (shared by journal entry + chat pages)
// ============================================================

(function() {
    // Wire Help buttons on journal entry and chat pages to open the shared modal
    var helpBtns = ['journalVoiceHelpBtn', 'chatVoiceHelpBtn'];
    helpBtns.forEach(function(btnId) {
        var btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', function() {
                openModal('voiceHelpModal');
            });
        }
    });

    var closeBtn = document.getElementById('voiceHelpCloseBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            closeModal('voiceHelpModal');
        });
    }
}());

async function deleteJournalCategory(id) {
    if (!confirm('Delete this category? This will not delete existing tracking items that used it.')) return;

    try {
        await userCol('journalCategories').doc(id).delete();
        loadJournalCategoriesPage();
    } catch (err) {
        console.error('Error deleting category:', err);
        alert('Error deleting category. See console for details.');
    }
}

// ============================================================
// @MENTION AUTOCOMPLETE -- Journal entry textarea
// ============================================================

async function _journalLoadPeopleCache() {
    if (_journalPeopleCache) return _journalPeopleCache;
    try {
        var snap = await userCol('people').get();
        _journalPeopleCache = [];
        snap.forEach(function(doc) {
            var d = doc.data();
            _journalPeopleCache.push({ id: doc.id, name: d.name || '', nickname: d.nickname || '', howKnown: d.howKnown || '', parentPersonId: d.parentPersonId || null, quickMention: !!d.quickMention });
        });
        _journalPeopleCache.sort(function(a,b){ return a.name.localeCompare(b.name); });
    } catch(err) { console.error('_journalLoadPeopleCache:', err); _journalPeopleCache = []; }
    return _journalPeopleCache;
}

function _journalGetMentionPrefix() {
    var ta = document.getElementById('journalEntryText');
    if (!ta) return null;
    var before = ta.value.substring(0, ta.selectionStart);
    var match  = before.match(/(@@?)(\w*)$/);
    if (!match) return null;
    return { text: match[2], full: match[1].length === 2 };
}

function _journalShowDropdown(matches) {
    var drop = document.getElementById('journalMentionDropdown');
    if (!drop) return;
    drop.innerHTML = '';
    if (!matches.length) { drop.style.display = 'none'; return; }
    matches.forEach(function(person) {
        var item = document.createElement('div');
        item.className = 'mention-item';
        item._mentionPerson = person; // stored for Tab-key access
        var label = escapeHtml(person.name);
        if (person.nickname) label += ' <span class=mention-item-nick>(' + escapeHtml(person.nickname) + ')</span>';
        if (person.howKnown) label += ' <span class=mention-item-nick>' + escapeHtml(person.howKnown) + '</span>';
        item.innerHTML = label;
        item.addEventListener('mousedown', function(e){ e.preventDefault(); _journalSelectMention(person); });
        item.addEventListener('touchend',  function(e){ e.preventDefault(); _journalSelectMention(person); });
        drop.appendChild(item);
    });
    drop.style.display = '';
}

function _journalHideDropdown() {
    var drop = document.getElementById('journalMentionDropdown');
    if (drop) drop.style.display = 'none';
}

function _journalSelectMention(person) {
    var result = _journalGetMentionPrefix();
    if (result === null) { _journalHideDropdown(); return; }
    var ta = document.getElementById('journalEntryText');
    var pos = ta.selectionStart;
    var atCount = result.full ? 2 : 1;
    var before = ta.value.substring(0, pos - result.text.length - atCount);
    var after  = ta.value.substring(pos);
    // Insert first name only (or nickname) — not the full last name
    var name   = person.nickname || person.name.split(' ')[0];
    ta.value   = before + '@' + name + ' ' + after;
    var newPos = before.length + 1 + name.length + 1;
    ta.selectionStart = ta.selectionEnd = newPos;
    _journalMentionedPersonIds.add(person.id);
    _journalHideDropdown();
    ta.focus();
    _updateMentionChips();   // refresh chips row immediately
}

async function _journalHandleTextareaInput() {
    var result = _journalGetMentionPrefix();
    if (result === null) { _journalHideDropdown(); return; }
    var people = await _journalLoadPeopleCache();
    var lower  = result.text.toLowerCase();
    var matches = people.filter(function(p){
        var nameMatch = p.name.toLowerCase().startsWith(lower) ||
                        (p.nickname && p.nickname.toLowerCase().startsWith(lower));
        // Single @ → quick list only; @@ → full list
        return nameMatch && (result.full || p.quickMention);
    }).slice(0, 7);
    _journalShowDropdown(matches);
}

function _journalInitMentions() {
    var ta = document.getElementById('journalEntryText');
    if (!ta) return;
    ta.removeEventListener('input',   _journalHandleTextareaInput);
    ta.addEventListener('input',      _journalHandleTextareaInput);
    ta.addEventListener('blur',       function(){ setTimeout(_journalHideDropdown, 180); });
    ta.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            _journalHideDropdown();
        } else if (e.key === 'Tab' || e.key === 'Enter') {
            // If the @mention dropdown is open, Tab or Enter picks the first result
            var drop = document.getElementById('journalMentionDropdown');
            if (drop && drop.style.display !== 'none' && drop.children.length > 0) {
                e.preventDefault();      // stop Tab from jumping fields / Enter from submitting
                e.stopPropagation();     // stop app.js document-level Tab→spaces handler
                var firstItem = drop.children[0];
                if (firstItem && firstItem._mentionPerson) {
                    _journalSelectMention(firstItem._mentionPerson);
                }
            }
        }
    });
    _journalLoadPeopleCache();
}

// ============================================================
// JOURNAL TO PEOPLE INTERACTION SYNC
// ============================================================

async function _syncJournalMentionInteractions(entryId, date, text, personIds) {
    if (!entryId) return;
    if (!personIds || !personIds.length) {
        try {
            var old = await userCol('peopleInteractions').where('journalEntryId','==',entryId).get();
            if (!old.empty) { var b = db.batch(); old.forEach(function(d){ b.delete(d.ref); }); await b.commit(); }
        } catch(err) { console.error('mention cleanup:', err); }
        return;
    }
    var people = await _journalLoadPeopleCache();
    var parentMap = {};
    people.forEach(function(p){ if (p.parentPersonId) parentMap[p.id] = p.parentPersonId; });
    var toWrite = new Set(personIds);
    personIds.forEach(function(id){ if (parentMap[id]) toWrite.add(parentMap[id]); });
    try {
        var old = await userCol('peopleInteractions').where('journalEntryId','==',entryId).get();
        var batch = db.batch();
        old.forEach(function(d){ batch.delete(d.ref); });
        toWrite.forEach(function(personId){
            var ref = userCol('peopleInteractions').doc();
            batch.set(ref, { personId: personId, date: date, text: text, sourceType: 'journal', journalEntryId: entryId, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        });
        await batch.commit();
    } catch(err) { console.error('_syncJournalMentionInteractions:', err); }
}

// ============================================================
// @MENTION RENDERING IN FEED  +  CHIPS IN EDIT FORM
// ============================================================

function _renderEntryTextWithMentions(rawText, mentionedPersonIds) {
    if (!mentionedPersonIds || !mentionedPersonIds.length ||
            !_journalPeopleCache || !_journalPeopleCache.length) {
        return journalEscape(rawText);
    }
    var cacheById = {};
    _journalPeopleCache.forEach(function(p) { cacheById[p.id] = p; });
    var mentionMap = {};
    mentionedPersonIds.forEach(function(id) {
        var p = cacheById[id];
        if (!p) return;
        var displayName = p.nickname || p.name.split(" ")[0];
        if (displayName) mentionMap[displayName] = id;
    });
    var names = Object.keys(mentionMap);
    if (!names.length) return journalEscape(rawText);
    names.sort(function(a, b) { return b.length - a.length; });
    var pattern = names.map(function(n) {
        // Escape all regex special characters in the person's display name
        return '@' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('|');
    // Negative lookahead (?!\w) prevents matching @Steve inside @Steven
    var regex = new RegExp('(' + pattern + ')(?!\\w)', 'g');
    var parts = rawText.split(regex);
    return parts.map(function(part) {
        if (part.charAt(0) === "@") {
            var name = part.slice(1);
            var id = mentionMap[name];
            if (id) {
                return "<a href=" + "\"#person/" + id + "\"" + " class=journal-mention-link onclick=" + "\"event.stopPropagation()\"" + ">@" + journalEscape(name) + "</a>";
            }
        }
        return journalEscape(part);
    }).join("");
}

function _updateMentionChips() {
    var container = document.getElementById("journalMentionedChips");
    if (!container) return;
    var ids = Array.from(_journalMentionedPersonIds);
    if (!ids.length) { container.style.display = "none"; container.innerHTML = ""; return; }
    var cacheById = {};
    if (_journalPeopleCache) { _journalPeopleCache.forEach(function(p) { cacheById[p.id] = p; }); }
    var html = "<span class=mention-chips-label>Mentioned:</span>";
    ids.forEach(function(id) {
        var p = cacheById[id];
        var name = p ? (p.nickname || p.name.split(" ")[0]) : "...";
        html += "<a href=" + "\"#person/" + id + "\"" + " class=mention-chip>@" + journalEscape(name) + "</a>";
    });
    container.innerHTML = html;
    container.style.display = "";
}

// ============================================================
// PLACE SEARCH + CHIPS IN ENTRY FORM
// ============================================================

/**
 * Wire the place search input, GPS button, and dropdown for the entry form.
 * Called every time the entry page opens.
 */
function _journalInitPlaceSearch() {
    var input      = document.getElementById('journalPlaceSearch');
    var locBtn     = document.getElementById('journalUseLocationBtn');
    var dropdown   = document.getElementById('journalPlaceDropdown');
    var biasInput  = document.getElementById('journalPlaceBias');
    var radiusSel  = document.getElementById('journalPlaceRadius');
    if (!input || !locBtn || !dropdown) return;

    // Clear search field and dropdown from any previous session
    input.value = '';
    dropdown.style.display = 'none';

    // ── Radius dropdown — restore sticky value from localStorage ────────────
    var RADIUS_KEY = 'bishop_place_search_radius';
    if (radiusSel) {
        var savedRadius = localStorage.getItem(RADIUS_KEY);
        if (savedRadius) {
            // Find and select the matching option; fall back to default (500m) if not found
            var found = false;
            for (var i = 0; i < radiusSel.options.length; i++) {
                if (radiusSel.options[i].value === savedRadius) {
                    radiusSel.selectedIndex = i;
                    found = true;
                    break;
                }
            }
            if (!found) radiusSel.selectedIndex = 0;
        }
        radiusSel.onchange = function() {
            localStorage.setItem(RADIUS_KEY, radiusSel.value);
        };
    }

    // ── Bias location — silently grab GPS on form open ───────────────────────
    // Reset bias coords from any previous form session
    _journalBiasLat = null;
    _journalBiasLng = null;
    if (biasInput) biasInput.value = '';

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(pos) {
                _journalBiasLat = pos.coords.latitude;
                _journalBiasLng = pos.coords.longitude;
                if (biasInput && !biasInput.value) {
                    biasInput.value = 'Current location';
                }
            },
            function() { /* GPS unavailable or denied — no-op, search runs unbiased */ },
            { timeout: 8000, maximumAge: 60000 }
        );
    }

    // ── Bias input — geocode typed location with 800ms debounce ─────────────
    var biasDebounce = null;
    if (biasInput) {
        biasInput.oninput = function() {
            clearTimeout(biasDebounce);
            var text = biasInput.value.trim();
            // If cleared, reset bias coords
            if (!text || text === 'Current location') {
                if (!text) { _journalBiasLat = null; _journalBiasLng = null; }
                return;
            }
            biasDebounce = setTimeout(async function() {
                biasInput.style.borderColor = '#aaa'; // visual "searching" hint
                var coords = await placesGeocodeLocation(text);
                if (coords) {
                    _journalBiasLat = coords.lat;
                    _journalBiasLng = coords.lng;
                    biasInput.style.borderColor = ''; // reset
                } else {
                    // Geocode failed — clear bias so search runs globally
                    _journalBiasLat = null;
                    _journalBiasLng = null;
                    biasInput.style.borderColor = 'var(--danger)'; // red hint
                }
            }, 800);
        };

        // Clear red hint when user starts typing again
        biasInput.onfocus = function() { biasInput.style.borderColor = ''; };
    }

    // ── Name search — passes bias + radius to placesSearchByName ────────────
    var debounceTimer = null;
    input.oninput = function() {
        clearTimeout(debounceTimer);
        var q = input.value.trim();
        if (q.length < 2) { dropdown.style.display = 'none'; return; }
        debounceTimer = setTimeout(async function() {
            try {
                var radiusKm = radiusSel ? parseFloat(radiusSel.value) : null;
                var results  = await placesSearchByName(q, _journalBiasLat, _journalBiasLng, radiusKm);
                _journalShowPlaceDropdown(results);
            } catch (err) {
                console.warn('Place search error:', err);
            }
        }, 500);
    };

    // Hide dropdown when focus leaves the search input (delay so clicks register first)
    input.onblur = function() {
        setTimeout(function() { dropdown.style.display = 'none'; }, 200);
    };

    // GPS nearby search (Overpass, unchanged)
    locBtn.onclick = _journalHandleUseLocation;
}

/**
 * Show a dropdown of venue options below the place search input.
 * Stores venues in _journalPlaceDropdownVenues so onclick can look them up by index.
 * @param {Array} venues - Array of venue objects from placesSearchByName / placesNearby
 */
function _journalShowPlaceDropdown(venues) {
    var dropdown = document.getElementById('journalPlaceDropdown');
    if (!dropdown) return;

    if (!venues || venues.length === 0) {
        dropdown.style.display = 'none';
        return;
    }

    _journalPlaceDropdownVenues = venues.slice(0, 8);
    var html = '';
    _journalPlaceDropdownVenues.forEach(function(v, i) {
        var sub = [v.category, v.address].filter(Boolean).join(' · ');
        html += '<div class="journal-place-dropdown-item" onmousedown="_journalAddPlaceToEntry(' + i + ')">' +
                    '<div class="journal-place-dropdown-name">' + journalEscape(v.name || '') + '</div>' +
                    (sub ? '<div class="journal-place-dropdown-sub">' + journalEscape(sub) + '</div>' : '') +
                '</div>';
    });
    dropdown.innerHTML = html;
    dropdown.style.display = '';
}

/**
 * Add a venue to the entry's place selection.
 * Uses the venue's existingId if already saved; otherwise calls placesSaveNew().
 * @param {number} idx - Index into _journalPlaceDropdownVenues
 */
function _journalAddPlaceToEntry(idx) {
    var venue = _journalPlaceDropdownVenues[idx];
    if (!venue) return;

    // Close dropdown and clear search input
    var dropdown = document.getElementById('journalPlaceDropdown');
    var input    = document.getElementById('journalPlaceSearch');
    if (dropdown) dropdown.style.display = 'none';
    if (input)    input.value = '';

    if (venue.existingId) {
        // Already a saved place — just add it to the selection
        _journalPlaceIds.add(venue.existingId);
        _journalPlaceNamesMap[venue.existingId] = venue.name;
        _updateJournalPlaceChips();
        return;
    }

    // New place — save it first (dedup + LLM enrichment fires inside placesSaveNew)
    placesSaveNew(venue).then(function(placeId) {
        _journalPlaceIds.add(placeId);
        _journalPlaceNamesMap[placeId] = venue.name;
        _updateJournalPlaceChips();
    }).catch(function(err) {
        console.error('Error saving place from journal:', err);
        alert('Could not save place. Try again.');
    });
}

/**
 * Remove a place from the current entry's selection.
 * @param {string} pid - Place Firestore doc ID
 */
function _journalRemovePlace(pid) {
    _journalPlaceIds.delete(pid);
    _updateJournalPlaceChips();
}

/**
 * Render the selected places as removable pills below the search input.
 */
function _updateJournalPlaceChips() {
    var container = document.getElementById('journalPlaceChips');
    if (!container) return;

    var ids = Array.from(_journalPlaceIds);
    if (!ids.length) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    var html = '<span class="mention-chips-label">Places:</span>';
    ids.forEach(function(pid) {
        var name = _journalPlaceNamesMap[pid] || '(Place)';
        html += '<span class="journal-place-chip">' +
                    journalEscape(name) +
                    ' <button class="journal-place-chip-remove" ' +
                             'onmousedown="_journalRemovePlace(\'' + pid + '\')" ' +
                             'title="Remove">&times;</button>' +
                '</span>';
    });
    container.innerHTML = html;
    container.style.display = '';
}

// ============================================================
// Phase 5 — Quick Check-In Flow
// ============================================================

/**
 * Open the check-in picker from within the journal entry form.
 * Same picker as the main-screen Check In button, but instead of creating a new
 * entry, the selected venue is applied to the current open entry.
 */
function _openCheckInFromEntry() {
    _checkinPickerCallback = _checkinApplyVenueToEntry;
    openCheckIn();
}

/**
 * Callback used when the check-in picker was opened from within an existing
 * journal entry. Applies the venue to the current form without navigating away.
 * @param {Object|null} venue — Selected venue, or null for a manual check-in.
 */
function _checkinApplyVenueToEntry(venue) {
    _journalCheckinMode  = true;
    _journalCheckinVenue = venue || null;
    _journalUpdateCheckinModeUI();
}

/**
 * Open the check-in picker modal.
 * Fires GPS immediately; user can also search by name.
 * Called from the "📍 Check In" button on the home/landing page.
 */
function openCheckIn() {
    // _checkinPickerCallback is intentionally NOT reset here — callers like
    // _openCheckInFromEntry() set it immediately before calling this function.
    // The callback is cleared by the cancel, manual, and venue-select handlers.
    openModal('checkInPickerModal');

    var statusEl  = document.getElementById('checkInPickerStatus');
    var resultsEl = document.getElementById('checkInPickerResults');
    var searchEl  = document.getElementById('checkInPickerSearch');
    var biasEl    = document.getElementById('checkInPickerBias');

    if (statusEl)  statusEl.textContent = '📍 Getting your location...';
    if (resultsEl) resultsEl.innerHTML  = '';
    if (searchEl)  searchEl.value       = '';
    if (biasEl)    biasEl.value         = '';
    _checkinPickerLat = null;
    _checkinPickerLng = null;
    _checkinPickerVenues = [];

    // Wire Cancel button
    var cancelBtn = document.getElementById('checkInPickerCancelBtn');
    if (cancelBtn) {
        cancelBtn.onclick = function() {
            _checkinPickerCallback = null;
            closeModal('checkInPickerModal');
        };
    }

    // Wire "Enter Manually" button → skip picker, apply venue (null) via callback or open new form
    var manualBtn = document.getElementById('checkInManualBtn');
    if (manualBtn) {
        manualBtn.onclick = function() {
            closeModal('checkInPickerModal');
            if (_checkinPickerCallback) {
                var cb = _checkinPickerCallback;
                _checkinPickerCallback = null;
                cb(null);
            } else {
                openCheckInForm(null, true);
            }
        };
    }

    // Wire bias location input — geocode typed city/address and re-run nearby search
    var _biasTimer = null;
    if (biasEl) {
        biasEl.oninput = function() {
            clearTimeout(_biasTimer);
            var text = biasEl.value.trim();
            if (!text) {
                biasEl.style.borderColor = '';
                return;
            }
            _biasTimer = setTimeout(async function() {
                biasEl.style.borderColor = '#aaa';
                var coords = await placesGeocodeLocation(text);
                if (coords) {
                    _checkinPickerLat = coords.lat;
                    _checkinPickerLng = coords.lng;
                    biasEl.style.borderColor = 'var(--success, #2e7d32)';
                    // Re-run nearby search with the new location
                    var statusEl2 = document.getElementById('checkInPickerStatus');
                    var resultsEl2 = document.getElementById('checkInPickerResults');
                    if (statusEl2) statusEl2.textContent = '🔍 Finding nearby places...';
                    if (resultsEl2) resultsEl2.innerHTML = '';
                    try {
                        var venues = await placesNearby(_checkinPickerLat, _checkinPickerLng);
                        _checkinPickerVenues = venues;
                        _checkinPickerShowResults(venues);
                        if (statusEl2) statusEl2.textContent = venues.length
                            ? 'Places near ' + text + ' — tap one to check in'
                            : 'No named places found near ' + text + '. Try searching by name.';
                    } catch (err) {
                        if (statusEl2) statusEl2.textContent = 'Could not load places. Try searching by name.';
                    }
                } else {
                    biasEl.style.borderColor = 'var(--danger, #c62828)';
                }
            }, 800);
        };
        biasEl.onfocus = function() { biasEl.style.borderColor = ''; };
    }

    // Wire name search input (debounced)
    var _searchTimer = null;
    if (searchEl) {
        searchEl.oninput = function() {
            clearTimeout(_searchTimer);
            var q = searchEl.value.trim();
            if (!q) return;
            _searchTimer = setTimeout(async function() {
                if (statusEl) statusEl.textContent = '🔍 Searching...';
                try {
                    var results = await placesSearchByName(q, _checkinPickerLat, _checkinPickerLng);
                    _checkinPickerVenues = results;
                    _checkinPickerShowResults(results);
                    if (statusEl) statusEl.textContent = results.length
                        ? results.length + ' result(s) found'
                        : 'No places found for "' + q + '"';
                } catch (err) {
                    if (statusEl) statusEl.textContent = 'Search failed. Try again.';
                }
            }, 500);
        };
    }

    // Fire GPS immediately
    _checkinPickerFetchNearby(false);
}

/** Fetch GPS + nearby places. Called on open and by the Retry button.
 *  @param {boolean} forceRefresh - true on retry (bypasses cached GPS position) */
function _checkinPickerFetchNearby(forceRefresh) {
    var statusEl  = document.getElementById('checkInPickerStatus');
    var resultsEl = document.getElementById('checkInPickerResults');

    if (!navigator.geolocation) {
        if (statusEl) statusEl.textContent = 'GPS not available. Search by name above.';
        return;
    }

    if (statusEl) statusEl.textContent = '📍 Getting your location...';
    if (resultsEl) resultsEl.innerHTML = '';

    navigator.geolocation.getCurrentPosition(
        async function(pos) {
            _checkinPickerLat = pos.coords.latitude;
            _checkinPickerLng = pos.coords.longitude;
            var biasEl2 = document.getElementById('checkInPickerBias');
            if (biasEl2 && !biasEl2.value) biasEl2.value = 'Current location';
            if (statusEl) statusEl.textContent = '🔍 Finding nearby places...';
            try {
                var venues = await placesNearby(pos.coords.latitude, pos.coords.longitude);
                _checkinPickerVenues = venues;
                _checkinPickerShowResults(venues);
                if (statusEl) statusEl.textContent = venues.length
                    ? 'Nearby places — tap one to check in'
                    : 'No named places found nearby. Try searching by name.';
            } catch (err) {
                if (statusEl) statusEl.innerHTML = 'Could not load nearby places. Search by name above. ' +
                    '<button class="btn btn-secondary btn-small" onclick="_checkinPickerFetchNearby(true)">Retry</button>';
            }
        },
        function() {
            if (statusEl) statusEl.innerHTML = 'Location unavailable. ' +
                '<button class="btn btn-secondary btn-small" onclick="_checkinPickerFetchNearby(true)">Retry</button>';
        },
        { timeout: 12000, maximumAge: forceRefresh ? 0 : 60000 }
    );
}

/**
 * Render the venue list inside the check-in picker modal.
 * @param {Array} venues  Array of venue objects from placesNearby/placesSearchByName.
 */
function _checkinPickerShowResults(venues) {
    var el = document.getElementById('checkInPickerResults');
    if (!el) return;

    if (!venues || venues.length === 0) {
        el.innerHTML = '';
        return;
    }

    var html = '';
    venues.forEach(function(v, idx) {
        var dist = placesDistanceLabel(_checkinPickerLat, _checkinPickerLng, v.lat, v.lng);
        var sub  = [];
        if (v.category)  sub.push(v.category);
        if (v.address)   sub.push(v.address);
        var subText = sub.join(' · ');

        html += '<div class="checkin-picker-item" data-idx="' + idx + '">' +
                    '<div class="checkin-picker-name">' + (v.name || 'Unnamed Place') +
                        (dist ? ' <span class="place-distance">' + dist + '</span>' : '') +
                    '</div>' +
                    (subText ? '<div class="checkin-picker-sub">' + subText + '</div>' : '') +
                '</div>';
    });
    el.innerHTML = html;

    // Wire tap handlers
    el.querySelectorAll('.checkin-picker-item').forEach(function(item) {
        item.onclick = function() {
            var idx = parseInt(item.dataset.idx, 10);
            _checkinSelectPlace(idx);
        };
    });
}

/**
 * User tapped a venue in the picker — close picker and open the entry form
 * pre-loaded with that venue in check-in mode.
 * @param {number} idx  Index into _checkinPickerVenues.
 */
function _checkinSelectPlace(idx) {
    var venue = _checkinPickerVenues[idx];
    if (!venue) return;
    var overlay = document.getElementById('checkInPickerModal');
    if (overlay) overlay.classList.remove('open');
    // replaceState is synchronous — avoids the race where history.back() (async)
    // fires after openCheckInForm sets the hash and reverts the URL to #main.
    if (history.state && history.state.modal === 'checkInPickerModal') {
        history.replaceState(null, '');
    }
    if (_checkinPickerCallback) {
        var cb = _checkinPickerCallback;
        _checkinPickerCallback = null;
        cb(venue);
    } else {
        openCheckInForm(venue, false);
    }
}

/**
 * Open the journal entry form in check-in mode.
 * Sets _journalCheckinMode and _journalCheckinVenue, then opens the modal.
 * @param {Object|null} venue     The selected venue (or null for manual entry).
 * @param {boolean}     isManual  True when the user chose "Enter Manually".
 */
function openCheckInForm(venue, isManual) {
    // Start a fresh journal entry
    openAddJournalEntry();

    // Set check-in mode globals before wiring the form
    _journalCheckinMode   = true;
    _journalCheckinVenue  = venue || null;

    // Reflect the mode in the form UI
    _journalUpdateCheckinModeUI();
}

/**
 * Update the journal entry form to reflect current check-in mode.
 * - In check-in mode: hide the place search row; show the locked venue display.
 * - In normal mode: show the place search row; hide the locked venue display.
 */
function _journalUpdateCheckinModeUI() {
    var placesGroup    = document.getElementById('journalPlacesGroup');
    var checkinRow     = document.getElementById('journalCheckinPlaceRow');
    var nameEl         = document.getElementById('journalCheckinPlaceName');
    var subEl          = document.getElementById('journalCheckinPlaceSub');

    if (_journalCheckinMode) {
        // Hide the normal place-search row
        if (placesGroup)  placesGroup.classList.add('hidden');
        // Show the locked check-in place display
        if (checkinRow)   checkinRow.classList.remove('hidden');

        if (_journalCheckinVenue) {
            if (nameEl) nameEl.textContent = _journalCheckinVenue.name || '';
            if (subEl) {
                var parts = [];
                if (_journalCheckinVenue.category) parts.push(_journalCheckinVenue.category);
                if (_journalCheckinVenue.address)  parts.push(_journalCheckinVenue.address);
                subEl.textContent = parts.join(' · ');
            }
        } else {
            // Manual check-in — no venue selected yet
            if (nameEl) nameEl.textContent = 'Manual check-in';
            if (subEl)  subEl.textContent  = 'No specific place selected';
        }
    } else {
        // Normal mode
        if (placesGroup)  placesGroup.classList.remove('hidden');
        if (checkinRow)   checkinRow.classList.add('hidden');
    }
}

/**
 * Handle the "📍 Nearby" button — get GPS then call Overpass for nearby venues.
 */
async function _journalHandleUseLocation() {
    var locBtn = document.getElementById('journalUseLocationBtn');
    if (!locBtn) return;

    if (!navigator.geolocation) {
        alert('GPS not supported by this browser.');
        return;
    }

    locBtn.disabled    = true;
    locBtn.textContent = 'Getting location...';

    navigator.geolocation.getCurrentPosition(
        async function(pos) {
            locBtn.disabled    = false;
            locBtn.textContent = '📍 Nearby';
            try {
                var venues = await placesNearby(pos.coords.latitude, pos.coords.longitude);
                if (venues.length === 0) {
                    alert('No named places found nearby. Try searching by name instead.');
                    return;
                }
                _journalShowPlaceDropdown(venues);
                var input = document.getElementById('journalPlaceSearch');
                if (input) input.focus();
            } catch (err) {
                console.error('Nearby places error:', err);
                alert('Could not find nearby places. Check your connection.');
            }
        },
        function() {
            locBtn.disabled    = false;
            locBtn.textContent = '📍 Nearby';
            alert('Could not get your location. Search by name instead.');
        },
        { timeout: 10000, maximumAge: 30000 }
    );
}


// ============================================================
// All-Activity Feed — unified timeline across the whole app
// ============================================================

/** Whether the "All Activity" unified timeline toggle is active. */
var _journalAllActivity = localStorage.getItem('bishop_journal_allActivity') === 'true';

/** Flat sorted array of all normalized feed items for the active query. */
var _journalAllActivityItems = [];

/** How many items are currently rendered (50 at a time). */
var _journalAllActivityShown = 50;

/** Route prefix map for activity targetTypes. */
var _AF_TARGET_ROUTES = {
    plant:     '#plant/',
    zone:      '#zone/',
    weed:      '#weed/',
    vehicle:   '#vehicle/',
    room:      '#room/'
};

/**
 * Load and render the "All Activity" unified timeline.
 * Fires when the toggle turns on or the date range changes while the toggle is on.
 */
async function loadAllActivityFeed() {
    var feedEl = document.getElementById('journalFeed');
    if (!feedEl) return;
    feedEl.innerHTML = '<p class="empty-state">Loading timeline\u2026</p>';
    _journalAllActivityItems = [];
    _journalAllActivityShown = 50;

    var range = getJournalDateRange();
    if (!range.fromDate || !range.toDate) {
        feedEl.innerHTML = '<p class="empty-state">Please select a valid date range.</p>';
        return;
    }

    // Cap toDate at today so only past events appear
    var todayStr = journalFormatDate(new Date());
    var toDate   = range.toDate > todayStr ? todayStr : range.toDate;
    var fromDate = range.fromDate;

    try {
        // Fire all entity-name map reads AND timeline collection reads in parallel
        var results = await Promise.all([
            // Entity name maps (index 0-8)
            userCol('zones').get(),
            userCol('plants').get(),
            userCol('weeds').get(),
            userCol('vehicles').get(),
            userCol('rooms').get(),
            userCol('concerns').get(),
            userCol('conditions').get(),
            userCol('lifeEvents').get(),
            userCol('people').get(),
            // Timeline collections (index 9-20)
            userCol('activities').where('date', '>=', fromDate).where('date', '<=', toDate).get(),
            userCol('calendarEvents').where('date', '>=', fromDate).where('date', '<=', toDate).get(),
            userCol('healthVisits').where('date', '>=', fromDate).where('date', '<=', toDate).get(),
            userCol('healthAppointments').where('date', '>=', fromDate).where('date', '<=', toDate).get(),
            userCol('concernUpdates').where('date', '>=', fromDate).where('date', '<=', toDate).get(),
            userCol('healthConditionLogs').where('date', '>=', fromDate).where('date', '<=', toDate).get(),
            userCol('bloodWorkRecords').where('date', '>=', fromDate).where('date', '<=', toDate).get(),
            userCol('vitals').where('date', '>=', fromDate).where('date', '<=', toDate).get(),
            userCol('peopleInteractions').where('date', '>=', fromDate).where('date', '<=', toDate).get(),
            userCol('journalEntries').where('date', '>=', fromDate).where('date', '<=', toDate).get(),
            userCol('journalTrackingItems').where('date', '>=', fromDate).where('date', '<=', toDate).get(),
            userCol('lifeEventLogs').where('logDate', '>=', fromDate).where('logDate', '<=', toDate).get()
        ]);

        var zonesSnap = results[0], plantsSnap = results[1], weedsSnap = results[2];
        var vehiclesSnap = results[3], roomsSnap = results[4];
        var concernsSnap = results[5], conditionsSnap = results[6];
        var lifeEventsSnap = results[7], peopleSnap = results[8];
        var activitiesSnap = results[9], calendarSnap = results[10];
        var visitsSnap = results[11], apptsSnap = results[12];
        var concernUpdatesSnap = results[13], conditionLogsSnap = results[14];
        var bloodWorkSnap = results[15], vitalsSnap = results[16];
        var interactionsSnap = results[17];
        var journalEntriesSnap = results[18], trackingSnap = results[19], lifeLogsSnap = results[20];

        // ---- Build entity name lookup maps ----
        var zonesMap = {}, plantsMap = {}, weedsMap = {}, vehiclesMap = {}, roomsMap = {};
        zonesSnap.forEach(function(d) { zonesMap[d.id] = d.data().name || ''; });
        plantsSnap.forEach(function(d) { plantsMap[d.id] = d.data().name || ''; });
        weedsSnap.forEach(function(d) { weedsMap[d.id] = d.data().name || ''; });
        vehiclesSnap.forEach(function(d) {
            var v = d.data();
            vehiclesMap[d.id] = [v.year, v.make, v.model].filter(Boolean).join(' ') || v.name || '';
        });
        roomsSnap.forEach(function(d) { roomsMap[d.id] = d.data().name || ''; });
        var allEntityMaps = { zone: zonesMap, plant: plantsMap, weed: weedsMap, vehicle: vehiclesMap, room: roomsMap };

        var concernsMap = {}, conditionsMap = {}, lifeEventsMap = {}, peopleMap = {};
        concernsSnap.forEach(function(d)   { concernsMap[d.id]   = d.data().title || d.data().name || ''; });
        conditionsSnap.forEach(function(d) { conditionsMap[d.id] = d.data().name  || ''; });
        lifeEventsSnap.forEach(function(d) { lifeEventsMap[d.id] = d.data().title || ''; });
        peopleSnap.forEach(function(d) {
            var p = d.data();
            var full = ((p.firstName || '') + ' ' + (p.lastName || '')).trim();
            peopleMap[d.id] = p.nickname || p.name || full || '';
        });

        // ---- Normalize all docs into a common item shape ----
        var items = [];

        // Journal entries
        journalEntriesSnap.forEach(function(doc) {
            var d    = doc.data();
            var text = d.entryText || '';
            items.push({
                id: doc.id, sortDate: d.date || '', sortTime: d.entryTime || '',
                sortTs: d.createdAt ? d.createdAt.toMillis() : 0,
                type: 'journalEntry', icon: '📝', typeLabel: 'Journal',
                typeBg: '#dcfce7', typeColor: '#166534',
                title: text || '(Journal entry)',
                subtitle: d.isCheckin ? '📍 Check-in' : null,
                route: null, specialAction: 'openEditJournalEntry', specialId: doc.id
            });
        });

        // Tracking items
        trackingSnap.forEach(function(doc) {
            var d = doc.data();
            items.push({
                id: doc.id, sortDate: d.date || '', sortTime: '',
                sortTs: d.createdAt ? d.createdAt.toMillis() : 0,
                type: 'tracking', icon: '⚖️', typeLabel: 'Tracking',
                typeBg: '#fef9c3', typeColor: '#854d0e',
                title: (d.category || '') + (d.value ? ': ' + d.value : '') || '(Tracking)',
                subtitle: null, route: null
            });
        });

        // Life event mini-logs
        lifeLogsSnap.forEach(function(doc) {
            var d = doc.data();
            items.push({
                id: doc.id, sortDate: d.logDate || '', sortTime: d.logTime || '',
                sortTs: d.createdAt ? d.createdAt.toMillis() : 0,
                type: 'lifeLog', icon: '📅', typeLabel: 'Event Note',
                typeBg: '#e0e7ff', typeColor: '#3730a3',
                title: d.body || '(Event note)',
                subtitle: lifeEventsMap[d.eventId] || null,
                route: d.eventId ? '#life-event/' + d.eventId : null
            });
        });

        // Activities (yard/house/garage/vehicles/etc.)
        activitiesSnap.forEach(function(doc) {
            var d = doc.data();
            var entityMap = allEntityMaps[d.targetType];
            var entityName = entityMap ? (entityMap[d.targetId] || d.targetType || '') : (d.targetType || '');
            var route = _AF_TARGET_ROUTES[d.targetType] ? _AF_TARGET_ROUTES[d.targetType] + d.targetId : null;
            items.push({
                id: doc.id, sortDate: d.date || '', sortTime: '',
                sortTs: d.createdAt ? d.createdAt.toMillis() : 0,
                type: 'activity', icon: '🌿', typeLabel: 'Activity',
                typeBg: '#f0fdf4', typeColor: '#15803d',
                title: d.description || '(Activity)',
                subtitle: entityName || null,
                route: route
            });
        });

        // Calendar events
        calendarSnap.forEach(function(doc) {
            var d = doc.data();
            items.push({
                id: doc.id, sortDate: d.date || '', sortTime: '',
                sortTs: d.createdAt ? d.createdAt.toMillis() : 0,
                type: 'calendarEvent', icon: '📅', typeLabel: 'Calendar',
                typeBg: '#dbeafe', typeColor: '#1e40af',
                title: d.title || '(Calendar event)',
                subtitle: _afTruncate(d.description || '', 80) || null,
                route: '#calendar'
            });
        });

        // Health visits
        visitsSnap.forEach(function(doc) {
            var d = doc.data();
            items.push({
                id: doc.id, sortDate: d.date || '', sortTime: '',
                sortTs: d.createdAt ? d.createdAt.toMillis() : 0,
                type: 'healthVisit', icon: '🏥', typeLabel: 'Visit',
                typeBg: '#f3e8ff', typeColor: '#6b21a8',
                title: d.reason || d.whatWasDone || d.providerText || 'Health Visit',
                subtitle: d.providerText || null,
                route: '#health-visit/' + doc.id
            });
        });

        // Health appointments (past only — toDate is already capped at today)
        apptsSnap.forEach(function(doc) {
            var d = doc.data();
            items.push({
                id: doc.id, sortDate: d.date || '', sortTime: d.time || '',
                sortTs: d.createdAt ? d.createdAt.toMillis() : 0,
                type: 'appointment', icon: '📋', typeLabel: 'Appointment',
                typeBg: '#fff7ed', typeColor: '#9a3412',
                title: d.notes || d.type || 'Appointment',
                subtitle: d.type || null,
                route: '#health-appointments'
            });
        });

        // Concern journal updates
        concernUpdatesSnap.forEach(function(doc) {
            var d = doc.data();
            items.push({
                id: doc.id, sortDate: d.date || '', sortTime: '',
                sortTs: d.createdAt ? d.createdAt.toMillis() : 0,
                type: 'concernUpdate', icon: '💬', typeLabel: 'Concern Note',
                typeBg: '#fef3c7', typeColor: '#92400e',
                title: d.note || '(Concern note)',
                subtitle: d.concernId ? (concernsMap[d.concernId] || 'Concern') : 'Concern',
                route: d.concernId ? '#health-concern/' + d.concernId : '#health-concerns'
            });
        });

        // Condition log entries
        conditionLogsSnap.forEach(function(doc) {
            var d = doc.data();
            items.push({
                id: doc.id, sortDate: d.date || '', sortTime: '',
                sortTs: d.createdAt ? d.createdAt.toMillis() : 0,
                type: 'conditionLog', icon: '📋', typeLabel: 'Condition',
                typeBg: '#ccfbf1', typeColor: '#134e4a',
                title: d.note || '(Condition log)',
                subtitle: d.conditionId ? (conditionsMap[d.conditionId] || 'Condition') : 'Condition',
                route: d.conditionId ? '#health-condition/' + d.conditionId : '#health-conditions'
            });
        });

        // Blood work records
        bloodWorkSnap.forEach(function(doc) {
            var d = doc.data();
            items.push({
                id: doc.id, sortDate: d.date || '', sortTime: '',
                sortTs: d.createdAt ? d.createdAt.toMillis() : 0,
                type: 'bloodWork', icon: '🩸', typeLabel: 'Blood Work',
                typeBg: '#fce7f3', typeColor: '#9d174d',
                title: 'Blood Work' + (d.lab ? ' \u2014 ' + d.lab : ''),
                subtitle: d.orderedBy ? 'Ordered by: ' + d.orderedBy : null,
                route: '#health-bloodwork/' + doc.id
            });
        });

        // Vitals readings
        vitalsSnap.forEach(function(doc) {
            var d = doc.data();
            var val = d.value1 || '';
            if (d.value2) val += '/' + d.value2;
            items.push({
                id: doc.id, sortDate: d.date || '', sortTime: d.time || '',
                sortTs: d.createdAt ? d.createdAt.toMillis() : 0,
                type: 'vital', icon: '💓', typeLabel: 'Vital',
                typeBg: '#e0e7ff', typeColor: '#3730a3',
                title: ((d.type || 'Vital') + ': ' + val + (d.unit ? ' ' + d.unit : '')).trim(),
                subtitle: d.notes || null,
                route: '#health-vitals'
            });
        });

        // People interactions — skip journal-generated records (sourceType:'journal')
        // those are already shown as the journal entry itself
        interactionsSnap.forEach(function(doc) {
            var d = doc.data();
            if (d.sourceType === 'journal') return;
            items.push({
                id: doc.id, sortDate: d.date || '', sortTime: '',
                sortTs: d.createdAt ? d.createdAt.toMillis() : 0,
                type: 'interaction', icon: '💬', typeLabel: 'Interaction',
                typeBg: '#e0f2fe', typeColor: '#0c4a6e',
                title: d.text || '(Interaction)',
                subtitle: d.personId ? (peopleMap[d.personId] || null) : null,
                route: d.personId ? '#contact/' + d.personId : '#contacts'
            });
        });

        // ---- Sort: date desc → time desc (no time = end of day) → createdAt desc ----
        items.sort(function(a, b) {
            if (a.sortDate > b.sortDate) return -1;
            if (a.sortDate < b.sortDate) return  1;
            var ta = a.sortTime || '99:99';
            var tb = b.sortTime || '99:99';
            if (ta > tb) return -1;
            if (ta < tb) return  1;
            return (b.sortTs || 0) - (a.sortTs || 0);
        });

        _journalAllActivityItems = items;
        _renderAllActivityFeed();

    } catch (err) {
        console.error('Error loading all-activity feed:', err);
        feedEl.innerHTML = '<p class="empty-state" style="color:#b91c1c;">Error loading timeline. See console for details.</p>';
    }
}

/** Truncate a string to maxLen characters, appending '…' if cut. */
function _afTruncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.slice(0, maxLen) + '\u2026' : str;
}

/**
 * Render the current page of the all-activity feed into #journalFeed.
 * Groups visible items by date and shows a "Show 50 more" button when needed.
 */
function _renderAllActivityFeed() {
    var feedEl = document.getElementById('journalFeed');
    if (!feedEl) return;

    var items   = _journalAllActivityItems;
    var total   = items.length;
    var visible = items.slice(0, _journalAllActivityShown);

    if (total === 0) {
        feedEl.innerHTML = '<p class="empty-state">No activity in this date range.</p>';
        return;
    }

    // Group by date
    var dateMap = {};
    visible.forEach(function(item) {
        var d = item.sortDate || '';
        if (!dateMap[d]) dateMap[d] = [];
        dateMap[d].push(item);
    });
    var sortedDates = Object.keys(dateMap).sort().reverse();

    var html = '';
    sortedDates.forEach(function(date) {
        if (date) {
            html += '<div class="journal-date-header" data-journal-date="' + journalEscape(date) + '">' +
                        journalFormatDateHeader(date) +
                    '</div>';
        }
        dateMap[date].forEach(function(item) {
            html += _renderAllActivityCard(item);
        });
    });

    if (total > _journalAllActivityShown) {
        var remaining = total - _journalAllActivityShown;
        html += '<button class="af-show-more" onclick="_journalAllActivityShowMore()">' +
                    'Show 50 more (' + remaining + ' remaining)' +
                '</button>';
    } else {
        html += '<p class="af-end-of-feed">All ' + total + ' item' + (total === 1 ? '' : 's') + ' shown</p>';
    }

    feedEl.innerHTML = html;
}

/**
 * Build the HTML for a single unified activity-feed card.
 * Cards with a route are tappable and show a › arrow.
 */
function _renderAllActivityCard(item) {
    var badgeStyle = 'background:' + journalEscape(item.typeBg) + ';color:' + journalEscape(item.typeColor);
    var badge = '<span class="af-type-badge" style="' + badgeStyle + '">' +
                    item.icon + ' ' + journalEscape(item.typeLabel) +
                '</span>';

    var subtitle = item.subtitle
        ? '<div class="af-subtitle">' + journalEscape(item.subtitle) + '</div>'
        : '';

    var hasAction = !!(item.route || item.specialAction);
    var arrow     = hasAction ? '<span class="af-arrow">\u203a</span>' : '';

    var onclick = '';
    if (item.specialAction === 'openEditJournalEntry') {
        onclick = ' onclick="openEditJournalEntry(\'' + journalEscape(item.specialId) + '\')"';
    } else if (item.route) {
        onclick = ' onclick="window.location.hash=\'' + journalEscape(item.route) + '\'"';
    }

    return '<div class="af-card' + (hasAction ? ' af-card--tappable' : '') + '"' + onclick + '>' +
               '<div class="af-card-body">' +
                   badge +
                   '<div class="af-title">' + journalEscape(item.title) + '</div>' +
                   subtitle +
               '</div>' +
               arrow +
           '</div>';
}

/**
 * Load the next 50 items in the all-activity feed, preserving scroll position.
 */
function _journalAllActivityShowMore() {
    _journalAllActivityShown += 50;
    var scrollY = window.pageYOffset || document.documentElement.scrollTop;
    _renderAllActivityFeed();
    window.scrollTo(0, scrollY);
}

/**
 * Dim or un-dim the normal journal filter toggles when all-activity mode changes.
 */
function _journalSetAllActivityMode(active) {
    var labels = document.querySelectorAll('#page-journal .journal-toggle-label--dimmable');
    labels.forEach(function(lbl) {
        lbl.classList.toggle('journal-toggle-label--dimmed', active);
    });
}
