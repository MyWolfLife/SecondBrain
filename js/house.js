// ============================================================
// house.js — House / Interior Feature
// Handles Floors (Phase H1), Rooms (Phase H2), Things (Phase H3+)
// Uses the same Firestore patterns as zones.js / plants.js
// ============================================================

// ---- State ----
var currentFloor = null;   // Floor document currently being viewed
var currentRoom  = null;   // Room document currently being viewed
var currentThing = null;   // Thing document currently being viewed
var currentPanel = null;   // Breaker panel document currently being viewed

// Breaker-modal edit state (which slot is open)
var bpEditSlot = null;     // Slot number (1-based) being edited
var bpEditId   = null;     // breaker.id of the existing entry, or null if new

var currentSubThing = null;   // Sub-thing document currently being viewed
// Tag input state for the subThingModal
var stSelectedTags  = [];     // Tags currently selected in the modal
var stAllTags       = [];     // All known tag names loaded from Firestore

// ---- Things Global Search page state ----
var thingsCache          = null;  // { things[], rooms{}, floors{}, subThings } — loaded on demand
var thingsTagsCache      = null;  // [{ id, name }] — loaded from tags collection
var thingsActiveCategory = null;  // Currently selected category key, or null
var thingsActiveTag      = null;  // Currently selected tag name, or null

// ============================================================
// HOUSE CONTEXT LABEL  (used by calendar.js for event cards)
// ============================================================

/**
 * Returns a human-readable "House › Floor › Room" context label for a
 * house entity. Called asynchronously from createCalendarEventCard in
 * calendar.js so that house event cards show a useful location label on
 * the main Calendar page.
 *
 * @param {string} targetType  - "floor" | "room" | "thing"
 * @param {string} targetId    - Firestore document ID of the target
 * @returns {Promise<string|null>} Formatted label, or null if not found
 */
async function getHouseContextLabel(targetType, targetId) {
    try {
        if (targetType === 'floor') {
            var floorDoc = await userCol('floors').doc(targetId).get();
            if (!floorDoc.exists) return null;
            return 'House \u203a ' + floorDoc.data().name;

        } else if (targetType === 'room') {
            var roomDoc = await userCol('rooms').doc(targetId).get();
            if (!roomDoc.exists) return null;
            var roomData = roomDoc.data();
            var floorDoc2 = await userCol('floors').doc(roomData.floorId).get();
            var floorName = floorDoc2.exists ? floorDoc2.data().name : 'Floor';
            return 'House \u203a ' + floorName + ' \u203a ' + roomData.name;

        } else if (targetType === 'thing') {
            var thingDoc = await userCol('things').doc(targetId).get();
            if (!thingDoc.exists) return null;
            var thingData = thingDoc.data();
            var roomDoc2 = await userCol('rooms').doc(thingData.roomId).get();
            if (!roomDoc2.exists) return 'House \u203a \u2026 \u203a ' + thingData.name;
            var roomData2 = roomDoc2.data();
            var floorDoc3 = await userCol('floors').doc(roomData2.floorId).get();
            var floorName2 = floorDoc3.exists ? floorDoc3.data().name : 'Floor';
            return 'House \u203a ' + floorName2 + ' \u203a ' + roomData2.name + ' \u203a ' + thingData.name;

        } else if (targetType === 'subthing') {
            var stDoc = await userCol('subThings').doc(targetId).get();
            if (!stDoc.exists) return null;
            var stData   = stDoc.data();
            var thingDoc = await userCol('things').doc(stData.thingId).get();
            if (!thingDoc.exists) return 'House \u203a \u2026 \u203a ' + stData.name;
            var tData    = thingDoc.data();
            var rDoc2    = await userCol('rooms').doc(tData.roomId).get();
            if (!rDoc2.exists) return 'House \u203a \u2026 \u203a ' + tData.name + ' \u203a ' + stData.name;
            var rData2   = rDoc2.data();
            var fDoc2    = await userCol('floors').doc(rData2.floorId).get();
            var fName2   = fDoc2.exists ? fDoc2.data().name : 'Floor';
            return 'House \u203a ' + fName2 + ' \u203a ' + rData2.name + ' \u203a ' + tData.name + ' \u203a ' + stData.name;

        } else if (targetType === 'item') {
            var itemDoc = await userCol('subThingItems').doc(targetId).get();
            if (!itemDoc.exists) return null;
            var itemData2 = itemDoc.data();
            var stDoc2    = await userCol('subThings').doc(itemData2.subThingId).get();
            if (!stDoc2.exists) return 'House \u203a \u2026 \u203a ' + itemData2.name;
            var stData2   = stDoc2.data();
            var tDoc2     = await userCol('things').doc(stData2.thingId).get();
            if (!tDoc2.exists) return 'House \u203a \u2026 \u203a ' + stData2.name + ' \u203a ' + itemData2.name;
            var tData2    = tDoc2.data();
            var rDoc3     = await userCol('rooms').doc(tData2.roomId).get();
            if (!rDoc3.exists) return 'House \u203a \u2026 \u203a ' + tData2.name + ' \u203a ' + stData2.name + ' \u203a ' + itemData2.name;
            var rData3    = rDoc3.data();
            var fDoc3     = await userCol('floors').doc(rData3.floorId).get();
            var fName3    = fDoc3.exists ? fDoc3.data().name : 'Floor';
            return 'House \u203a ' + fName3 + ' \u203a ' + rData3.name + ' \u203a ' + tData2.name + ' \u203a ' + stData2.name + ' \u203a ' + itemData2.name;
        }
        return null;
    } catch (e) {
        return null;  // Silently skip if any lookup fails
    }
}

// ---- Category helpers ----
var THING_CATEGORIES = {
    'furniture':     'Furniture',
    'appliance':     'Appliance',
    'ceiling-fan':   'Ceiling Fan',
    'ceiling-light': 'Ceiling Light',
    'electronics':   'Electronics',
    'other':         'Other'
};

// ============================================================
// HOUSE HOME PAGE  (#house)
// Lists all floors sorted by floorNumber ascending.
// ============================================================

/**
 * Load and render the House home page.
 * Fetches floors, rooms, open problems, and upcoming calendar events in parallel,
 * then renders a summary stats bar and the floor list with room counts.
 */
function loadHousePage() {
    var container  = document.getElementById('floorListContainer');
    var emptyState = document.getElementById('floorEmptyState');
    var statsEl    = document.getElementById('houseSummaryStats');

    container.innerHTML    = '';
    emptyState.textContent = 'Loading…';
    statsEl.innerHTML      = '';

    // Load the breaker panels list independently (different DOM container)
    loadPanelList();

    // Load the 14-day calendar rollup independently
    loadHouseCalendarRollup();

    // Build the date range for "upcoming in next 30 days"
    var today   = new Date();
    today.setHours(0, 0, 0, 0);
    var in30    = new Date(today);
    in30.setDate(in30.getDate() + 30);
    var todayStr = today.toISOString().slice(0, 10);
    var in30Str  = in30.toISOString().slice(0, 10);

    // Run all six queries in parallel
    var floorsQ   = userCol('floors').orderBy('floorNumber', 'asc').get();
    var roomsQ    = userCol('rooms').get();
    var thingsQ   = userCol('things').get();
    var problemsQ = userCol('problems')
        .where('targetType', 'in', ['floor', 'room', 'thing']).get();
    var projectsQ = userCol('projects')
        .where('targetType', 'in', ['floor', 'room', 'thing']).get();
    var eventsQ   = userCol('calendarEvents')
        .where('targetType', 'in', ['floor', 'room', 'thing']).get();

    Promise.all([floorsQ, roomsQ, thingsQ, problemsQ, projectsQ, eventsQ])
        .then(function(results) {
            var floorSnap   = results[0];
            var roomSnap    = results[1];
            var thingSnap   = results[2];
            var problemSnap = results[3];
            var projectSnap = results[4];
            var eventSnap   = results[5];

            emptyState.textContent = '';

            // --- Lookup maps for problem location labels ---
            var floorById = {};
            floorSnap.forEach(function(doc) { floorById[doc.id] = doc.data(); });

            var roomById = {};
            roomSnap.forEach(function(doc) { roomById[doc.id] = doc.data(); });

            var thingById = {};
            thingSnap.forEach(function(doc) { thingById[doc.id] = doc.data(); });

            // --- Room counts per floor ---
            var roomCountByFloor = {};
            roomSnap.forEach(function(doc) {
                var floorId = doc.data().floorId;
                if (floorId) {
                    roomCountByFloor[floorId] = (roomCountByFloor[floorId] || 0) + 1;
                }
            });

            // --- Collect open problems (docs, not just count) ---
            var openProblemDocs = [];
            problemSnap.forEach(function(doc) {
                if (doc.data().status === 'open') {
                    openProblemDocs.push({ id: doc.id, data: doc.data() });
                }
            });

            // --- Upcoming event count (next 30 days, one-time events only) ---
            // Recurring events are shown as "active" since they repeat indefinitely
            var upcomingEvents  = 0;
            var recurringEvents = 0;
            eventSnap.forEach(function(doc) {
                var d = doc.data();
                if (d.recurring) {
                    recurringEvents++;
                } else if (d.date && d.date >= todayStr && d.date <= in30Str) {
                    upcomingEvents++;
                }
            });

            // --- Render summary stats bar (events only; problems have their own section) ---
            renderHouseSummaryStats(statsEl, {
                upcomingEvents:  upcomingEvents,
                recurringEvents: recurringEvents
            });

            // --- Collect all projects ---
            var allProjectDocs = [];
            projectSnap.forEach(function(doc) {
                allProjectDocs.push({ id: doc.id, data: doc.data() });
            });

            // --- Render single Open Problems panel card ---
            var probContainer = document.getElementById('houseProblemsContainer');
            if (probContainer) {
                renderHouseProblems(probContainer, openProblemDocs);
            }

            // --- Render single All Projects panel card ---
            var projContainer = document.getElementById('houseProjectsContainer');
            if (projContainer) {
                renderHouseProjects(projContainer, allProjectDocs);
            }

            // --- Render Checklists panel card (async, fire-and-forget) ---
            renderHouseChecklistsPanel();

            // --- Load fp item rollup: Open Concerns + Active Projects for whole house ---
            loadFpItemRollupForHouse('houseFpRollupContainer');

            // --- Render floor list ---
            if (floorSnap.empty) {
                emptyState.textContent = 'No floors yet. Add a floor to get started.';
                return;
            }

            floorSnap.forEach(function(doc) {
                var roomCount = roomCountByFloor[doc.id] || 0;
                container.appendChild(buildFloorCard(doc.id, doc.data(), roomCount));
            });
        })
        .catch(function(err) {
            console.error('loadHousePage error:', err);
            emptyState.textContent = 'Error loading house data.';
        });
}

/**
 * Loads all calendar events, generates occurrences for the next 14 days,
 * and renders them as a compact read-only list on the House home page.
 * Completed and overdue occurrences are excluded — this is a forward-looking
 * rollup only. Uses generateOccurrences() from calendar.js.
 */
async function loadHouseCalendarRollup() {
    var container  = document.getElementById('houseCalendarRollup');
    var emptyState = document.getElementById('houseCalendarRollupEmpty');

    container.innerHTML    = '';
    emptyState.textContent = '';
    emptyState.style.display = 'none';

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var todayStr = today.toISOString().slice(0, 10);

    var end14 = new Date(today);
    end14.setDate(end14.getDate() + 14);
    var end14Str = end14.toISOString().slice(0, 10);

    try {
        var snap = await userCol('calendarEvents').get();
        if (snap.empty) {
            emptyState.textContent = 'No upcoming events in the next 14 days.';
            emptyState.style.display = 'block';
            return;
        }

        // Collect all events and generate occurrences within the 14-day window
        var allOccurrences = [];
        snap.forEach(function(doc) {
            var event = Object.assign({ id: doc.id }, doc.data());
            // generateOccurrences is defined in calendar.js (loaded before house.js)
            var occs = generateOccurrences(event, todayStr, end14Str);
            // Keep only uncompleted, non-overdue occurrences
            occs.forEach(function(occ) {
                if (!occ.completed) allOccurrences.push(occ);
            });
        });

        // Sort chronologically
        allOccurrences.sort(function(a, b) {
            return a.occurrenceDate.localeCompare(b.occurrenceDate);
        });

        if (allOccurrences.length === 0) {
            emptyState.textContent = 'No upcoming events in the next 14 days.';
            emptyState.style.display = 'block';
            return;
        }

        // Render compact list
        allOccurrences.forEach(function(occ) {
            var item = document.createElement('div');
            item.className = 'house-cal-item';

            var dateEl = document.createElement('span');
            dateEl.className = 'house-cal-date';
            var d = new Date(occ.occurrenceDate + 'T00:00:00');
            dateEl.textContent = d.toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric'
            });
            item.appendChild(dateEl);

            var titleEl = document.createElement('span');
            titleEl.className = 'house-cal-title';
            titleEl.textContent = occ.title;
            item.appendChild(titleEl);

            container.appendChild(item);
        });

    } catch (err) {
        console.error('loadHouseCalendarRollup error:', err);
        emptyState.textContent = 'Error loading calendar events.';
        emptyState.style.display = 'block';
    }
}

/**
 * Render the summary stats bar on the House home page (events only).
 * @param {Element} el     - The container element to populate
 * @param {object}  stats  - { upcomingEvents, recurringEvents }
 */
function renderHouseSummaryStats(el, stats) {
    var items = [];

    // Upcoming events (next 30 days) — rendered as a clickable link to the events list page
    if (stats.upcomingEvents > 0 || stats.recurringEvents > 0) {
        var eventParts = [];
        if (stats.upcomingEvents > 0) {
            eventParts.push(stats.upcomingEvents + ' upcoming');
        }
        if (stats.recurringEvents > 0) {
            eventParts.push(stats.recurringEvents + ' recurring');
        }
        items.push(
            '<a href="#house-calendar-events" class="house-stat house-stat--events house-stat--link">' +
                '<span class="house-stat-num">' + eventParts.join(', ') + '</span>' +
                '<span class="house-stat-label"> calendar event' +
                    (stats.upcomingEvents + stats.recurringEvents !== 1 ? 's' : '') + '</span>' +
            '</a>'
        );
    } else {
        items.push(
            '<span class="house-stat house-stat--ok">' +
                '<span class="house-stat-label">No upcoming events</span>' +
            '</span>'
        );
    }

    el.innerHTML = items.join('<span class="house-stat-sep">·</span>');
}

/**
 * Load the House Calendar Events page — all calendar events tied to house
 * entities (floor, room, thing, subthing, item), showing the next 3 months
 * of occurrences. Each card is clickable via the standard edit modal.
 */
async function loadHouseCalendarEventsPage() {
    var container = document.getElementById('houseCalEventsContainer');
    if (!container) return;
    container.innerHTML = '<p class="empty-state">Loading\u2026</p>';

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var todayStr = today.toISOString().slice(0, 10);
    var endDate  = new Date(today);
    endDate.setMonth(endDate.getMonth() + 3);
    var endStr   = endDate.toISOString().slice(0, 10);

    try {
        // Firestore 'in' supports up to 10 values; split house types across two queries
        var [snap1, snap2] = await Promise.all([
            userCol('calendarEvents').where('targetType', 'in', ['floor', 'room', 'thing']).get(),
            userCol('calendarEvents').where('targetType', 'in', ['subthing', 'item']).get()
        ]);

        // Merge into a deduped map
        var eventsMap = {};
        snap1.docs.forEach(function(d) { eventsMap[d.id] = Object.assign({ id: d.id }, d.data()); });
        snap2.docs.forEach(function(d) { eventsMap[d.id] = Object.assign({ id: d.id }, d.data()); });

        var allEvents = Object.values(eventsMap);
        if (allEvents.length === 0) {
            container.innerHTML = '<p class="empty-state">No house calendar events found.</p>';
            return;
        }

        // Separate overdue (past uncompleted one-time) from upcoming occurrences
        var overdueOccs  = [];
        var upcomingOccs = [];

        allEvents.forEach(function(event) {
            // Overdue: one-time events before today, not completed
            if (!event.recurring && event.date && event.date < todayStr && !event.completed) {
                overdueOccs.push(Object.assign({}, event, { occurrenceDate: event.date, completed: false }));
            }
            // Upcoming window (generateOccurrences is defined in calendar.js)
            var occs = generateOccurrences(event, todayStr, endStr);
            occs.forEach(function(occ) { upcomingOccs.push(occ); });
        });

        overdueOccs.sort(function(a, b)  { return a.occurrenceDate.localeCompare(b.occurrenceDate); });
        upcomingOccs.sort(function(a, b) { return a.occurrenceDate.localeCompare(b.occurrenceDate); });

        var allOccs = overdueOccs.concat(upcomingOccs);

        if (allOccs.length === 0) {
            container.innerHTML = '<p class="empty-state">No upcoming house calendar events in the next 3 months.</p>';
            return;
        }

        container.innerHTML = '';
        var reloadFn = loadHouseCalendarEventsPage;

        allOccs.forEach(function(occ) {
            // createCalendarEventCard is defined in calendar.js (loaded before house.js)
            container.appendChild(createCalendarEventCard(occ, reloadFn));
        });

    } catch (err) {
        console.error('loadHouseCalendarEventsPage error:', err);
        container.innerHTML = '<p class="empty-state">Error loading events.</p>';
    }
}

/**
 * Render a single "Open Problems" panel card on the house home page.
 * Clicking it navigates to #house-problems where all problems are listed.
 *
 * @param {Element} container - The card-list container to populate
 * @param {Array}   problems  - Array of { id, data } for open problems
 */
function renderHouseProblems(container, problems) {
    container.innerHTML = '';

    var card = document.createElement('div');
    card.className = 'card card--clickable';

    var count = problems.length;
    var metaText = count === 0
        ? 'No open problems'
        : count + ' open problem' + (count !== 1 ? 's' : '');

    card.innerHTML =
        '<div class="card-main">' +
            '<span class="card-title">Open Problems</span>' +
            '<span class="house-floor-meta"> &middot; ' + escapeHtml(metaText) + '</span>' +
        '</div>' +
        '<span class="card-arrow">›</span>';

    card.addEventListener('click', function() {
        window.location.hash = '#house-problems';
    });

    container.appendChild(card);
}

/**
 * Build a human-readable location path for a house problem.
 * Returns a string like "Main Floor › Living Room › Couch".
 */
/**
 * Render a single "All Quick Tasks" panel card on the house home page.
 * Clicking it navigates to #house-projects where all quick tasks are listed.
 */
function renderHouseProjects(container, projects) {
    container.innerHTML = '';

    var card = document.createElement('div');
    card.className = 'card card--clickable';

    var count    = projects.length;
    var metaText = count === 0
        ? 'No quick tasks'
        : count + ' quick task' + (count !== 1 ? 's' : '');

    card.innerHTML =
        '<div class="card-main">' +
            '<span class="card-title">All Quick Tasks</span>' +
            '<span class="house-floor-meta"> &middot; ' + escapeHtml(metaText) + '</span>' +
        '</div>' +
        '<span class="card-arrow">›</span>';

    card.addEventListener('click', function() {
        window.location.hash = '#house-projects';
    });

    container.appendChild(card);
}

/**
 * Render the "Checklists" panel card on the house home page.
 * Shows count of active (incomplete) checklist runs scoped to house, floor, or room.
 * Clicking navigates to #checklists/house.
 */
async function renderHouseChecklistsPanel() {
    var container = document.getElementById('houseChecklistsPanelContainer');
    if (!container) return;
    try {
        var snap = await userCol('checklistRuns').where('completedAt', '==', null).get();
        var count = 0;
        snap.forEach(function(doc) {
            var t = doc.data().targetType;
            if (t === 'house' || t === 'floor' || t === 'room') count++;
        });
        var card = document.createElement('div');
        card.className = 'card card--clickable house-more-card';
        card.innerHTML =
            '<span class="house-more-icon">✅</span>' +
            '<div class="card-main"><span class="card-title">Checklists (' + count + ')</span></div>' +
            '<span class="card-arrow">›</span>';
        card.addEventListener('click', function() {
            window.location.hash = '#checklists/house';
        });
        container.innerHTML = '';
        container.appendChild(card);
    } catch (err) { console.error('renderHouseChecklistsPanel error:', err); }
}

/**
 * Load the House Projects list page (#house-projects).
 * Shows all projects across floors, rooms, and things.
 * Each card links to the owning entity.
 */
async function loadHouseProjectsPage() {
    var container  = document.getElementById('houseProjectsListContainer');
    var emptyState = document.getElementById('houseProjectsListEmpty');
    var bar        = document.getElementById('breadcrumbBar');

    if (!container) return;
    container.innerHTML = '<p class="empty-state">Loading…</p>';
    if (emptyState) emptyState.textContent = '';
    if (bar) bar.innerHTML = '<a href="#house">House</a><span class="separator">&rsaquo;</span><span>All Quick Tasks</span>';

    try {
        var [projectSnap, floorSnap, roomSnap, thingSnap] = await Promise.all([
            userCol('projects').where('targetType', 'in', ['floor', 'room', 'thing']).get(),
            userCol('floors').get(),
            userCol('rooms').get(),
            userCol('things').get()
        ]);

        var floorById = {};
        floorSnap.forEach(function(d) { floorById[d.id] = d.data(); });
        var roomById = {};
        roomSnap.forEach(function(d) { roomById[d.id] = d.data(); });
        var thingById = {};
        thingSnap.forEach(function(d) { thingById[d.id] = d.data(); });

        var projects = [];
        projectSnap.forEach(function(d) { projects.push({ id: d.id, data: d.data() }); });

        container.innerHTML = '';

        if (projects.length === 0) {
            if (emptyState) emptyState.textContent = 'No quick tasks yet.';
            return;
        }

        projects.forEach(function(proj) {
            var data     = proj.data;
            var location = _houseProblemLocation(data, floorById, roomById, thingById);
            var hash     = '#' + (data.targetType || 'house') + '/' + data.targetId;

            var card = document.createElement('div');
            card.className = 'card card--clickable';
            card.innerHTML =
                '<div class="card-main">' +
                    '<span class="card-title">' + escapeHtml(data.title || 'Project') + '</span>' +
                    (location ? '<span class="house-floor-meta">' + escapeHtml(location) + '</span>' : '') +
                '</div>' +
                '<span class="card-arrow">›</span>';

            card.addEventListener('click', (function(h) {
                return function() { window.location.hash = h; };
            })(hash));

            container.appendChild(card);
        });

    } catch (err) {
        console.error('loadHouseProjectsPage error:', err);
        container.innerHTML = '<p class="empty-state" style="color:var(--danger)">Failed to load projects.</p>';
    }
}

function _houseProblemLocation(data, floorById, roomById, thingById) {
    if (data.targetType === 'floor') {
        var fl = floorById[data.targetId];
        return fl ? (fl.name || 'Floor') : 'Floor';
    }
    if (data.targetType === 'room') {
        var rm = roomById[data.targetId];
        if (!rm) return 'Room';
        var fl2 = floorById[rm.floorId];
        return (fl2 ? (fl2.name || 'Floor') + ' › ' : '') + (rm.name || 'Room');
    }
    if (data.targetType === 'thing') {
        var th = thingById[data.targetId];
        if (!th) return 'Thing';
        var rm2 = roomById[th.roomId];
        var fl3 = rm2 ? floorById[rm2.floorId] : null;
        return (fl3 ? (fl3.name || 'Floor') + ' › ' : '') +
               (rm2 ? (rm2.name || 'Room')  + ' › ' : '') +
               (th.name || 'Thing');
    }
    return '';
}

/**
 * Load the House Open Problems list page (#house-problems).
 * Shows all open problems across floors, rooms, and things.
 * Each card links to the owning entity.
 */
async function loadHouseProblemsPage() {
    var container  = document.getElementById('houseProblemsListContainer');
    var emptyState = document.getElementById('houseProblemsListEmpty');
    var bar        = document.getElementById('breadcrumbBar');

    if (!container) return;
    container.innerHTML = '<p class="empty-state">Loading…</p>';
    if (emptyState) emptyState.textContent = '';
    if (bar) bar.innerHTML = '<a href="#house">House</a><span class="separator">&rsaquo;</span><span>Open Problems</span>';

    try {
        var [problemSnap, floorSnap, roomSnap, thingSnap] = await Promise.all([
            userCol('problems').where('targetType', 'in', ['floor', 'room', 'thing']).get(),
            userCol('floors').get(),
            userCol('rooms').get(),
            userCol('things').get()
        ]);

        // Build lookup maps
        var floorById = {};
        floorSnap.forEach(function(d) { floorById[d.id] = d.data(); });
        var roomById = {};
        roomSnap.forEach(function(d) { roomById[d.id] = d.data(); });
        var thingById = {};
        thingSnap.forEach(function(d) { thingById[d.id] = d.data(); });

        // Collect open problems
        var openProblems = [];
        problemSnap.forEach(function(d) {
            if (d.data().status === 'open') openProblems.push({ id: d.id, data: d.data() });
        });

        container.innerHTML = '';

        if (openProblems.length === 0) {
            if (emptyState) emptyState.textContent = 'No open problems — all clear!';
            return;
        }

        openProblems.forEach(function(prob) {
            var data     = prob.data;
            var location = _houseProblemLocation(data, floorById, roomById, thingById);
            var hash     = '#' + (data.targetType || 'house') + '/' + data.targetId;

            var card = document.createElement('div');
            card.className = 'card card--clickable';
            card.innerHTML =
                '<div class="card-main">' +
                    '<span class="card-title">' + escapeHtml(data.description || 'Problem') + '</span>' +
                    (location ? '<span class="house-floor-meta">' + escapeHtml(location) + '</span>' : '') +
                '</div>' +
                '<span class="card-arrow">›</span>';

            card.addEventListener('click', (function(h) {
                return function() { window.location.hash = h; };
            })(hash));

            container.appendChild(card);
        });

    } catch (err) {
        console.error('loadHouseProblemsPage error:', err);
        container.innerHTML = '<p class="empty-state" style="color:var(--danger)">Failed to load problems.</p>';
    }
}

/**
 * Build a clickable card for a floor, showing room count.
 * @param {string} id         - Firestore document ID
 * @param {object} data       - Floor document data
 * @param {number} roomCount  - Number of rooms on this floor
 */
function buildFloorCard(id, data, roomCount) {
    var card = document.createElement('div');
    card.className = 'card card--clickable';

    var label    = escapeHtml(data.name || 'Unnamed Floor');
    var numLabel = (data.floorNumber !== undefined && data.floorNumber !== null)
        ? ' <span class="house-floor-num">Floor ' + data.floorNumber + '</span>'
        : '';
    var roomLabel = roomCount > 0
        ? '<span class="house-floor-meta"> &middot; ' + roomCount + ' room' + (roomCount !== 1 ? 's' : '') + '</span>'
        : '<span class="house-floor-meta"> &middot; No rooms yet</span>';

    card.innerHTML =
        '<div class="card-main">' +
            '<span class="card-title">' + label + numLabel + '</span>' +
            roomLabel +
        '</div>' +
        '<span class="card-arrow">›</span>';

    card.addEventListener('click', function() {
        window.location.hash = '#floor/' + id;
    });

    return card;
}

// ============================================================
// FLOOR DETAIL PAGE  (#floor/{floorId})
// ============================================================

/**
 * Load the Floor detail page.
 * Called by app.js when the route is #floor/{id}.
 */
function loadFloorDetail(floorId) {
    userCol('floors').doc(floorId).get()
        .then(function(doc) {
            if (!doc.exists) {
                window.location.hash = '#house';
                return;
            }
            currentFloor = window.currentFloor = Object.assign({ id: doc.id }, doc.data());
            renderFloorDetail(currentFloor);
            loadRoomsList(floorId);
        })
        .catch(function(err) { console.error('loadFloorDetail error:', err); });
}

/**
 * Render floor header / meta / breadcrumb, then load all feature sections.
 */
function renderFloorDetail(floor) {
    document.getElementById('floorTitle').textContent = floor.name || 'Floor';

    var meta = document.getElementById('floorMeta');
    if (floor.floorNumber !== undefined && floor.floorNumber !== null) {
        meta.textContent  = 'Floor number: ' + floor.floorNumber;
        meta.style.display = '';
    } else {
        meta.textContent  = '';
        meta.style.display = 'none';
    }

    buildHouseBreadcrumb([
        { label: 'House', hash: '#house' },
        { label: floor.name || 'Floor', hash: null }
    ]);

    // ---- Floor Plan button + thumbnail ----
    var fpBtn = document.getElementById('editFloorPlanBtn');
    if (fpBtn) fpBtn.href = '#floorplan/' + floor.id;

    var thumbContainer = document.getElementById('floorPlanThumbnailContainer');
    if (thumbContainer) {
        thumbContainer.onclick = function() { window.location.hash = '#floorplan/' + floor.id; };
    }

    if (typeof fpLoadAndRenderThumbnail === 'function') {
        fpLoadAndRenderThumbnail(floor.id, 'floorPlanThumbnailContainer', 'floorPlanThumbnailEmpty');
    }

    // Set button text: "View Floor Plan" if a plan exists, "Add Floor Plan" if not.
    // loadFloorPlanPage automatically opens in edit mode when no plan exists.
    userCol('floorPlans').doc(floor.id).get().then(function(planDoc) {
        var btn = document.getElementById('editFloorPlanBtn');
        if (btn) btn.textContent = planDoc.exists ? 'View Floor Plan' : 'Add Floor Plan';
        var emptyMsg = document.getElementById('floorPlanThumbnailEmpty');
        if (emptyMsg && !planDoc.exists) {
            emptyMsg.textContent = 'No floor plan drawn yet. Click "Add Floor Plan" to start drawing.';
        }
    }).catch(function(err) {
        console.warn('renderFloorDetail: could not check floor plan existence', err);
    });

    // ---- Load all feature sections, then update accordion counts ----
    loadProblems('floor', floor.id, 'floorProblemsContainer', 'floorProblemsEmptyState')
        .then(function() { _setDetailAccCount('floorProblemsAccCount', 'floorProblemsContainer'); });
    loadFacts('floor', floor.id, 'floorFactsContainer', 'floorFactsEmptyState')
        .then(function() { _setDetailAccCount('floorFactsAccCount', 'floorFactsContainer'); });
    loadProjects('floor', floor.id, 'floorProjectsContainer', 'floorProjectsEmptyState')
        .then(function() { _setDetailAccCount('floorTasksAccCount', 'floorProjectsContainer'); });
    loadActivities('floor', floor.id, 'floorActivityContainer', 'floorActivityEmptyState')
        .then(function() { _setDetailAccCount('floorActivityAccCount', 'floorActivityContainer'); });
    loadPhotos('floor', floor.id, 'floorPhotoContainer', 'floorPhotoEmptyState')
        .then(function() { _setPhotoAccCount('floorPhotosAccCount', 'floor'); });

    if (typeof loadEventsForTarget === 'function') {
        var months = parseInt(document.getElementById('floorCalendarRangeSelect').value, 10) || 3;
        loadEventsForTarget('floor', floor.id,
            'floorCalendarEventsContainer', 'floorCalendarEventsEmptyState', months)
            .then(function() { _setDetailAccCount('floorCalendarAccCount', 'floorCalendarEventsContainer'); });
    }

    // Load fp item rollup: Open Concerns + Active Projects for all items on this floor
    loadFpItemRollup('floor', floor.id, floor.id, 'floorFpRollupContainer');
}

/**
 * Update a detail-accordion count badge from the number of children in a container.
 * Hides the badge when count is 0.
 * @param {string} countId     - ID of the <span class="detail-acc-count"> element.
 * @param {string} containerId - ID of the container whose children are the items.
 */
function _setDetailAccCount(countId, containerId) {
    var countEl = document.getElementById(countId);
    if (!countEl) return;
    var container = document.getElementById(containerId);
    var count = container ? container.children.length : 0;
    if (count > 0) {
        countEl.textContent = '(' + count + ')';
        countEl.classList.remove('hidden');
    } else {
        countEl.textContent = '';
        countEl.classList.add('hidden');
    }
}

// ============================================================
// ROOMS LIST  (shown on the Floor detail page)
// ============================================================

/**
 * Load and render the rooms list for a given floor.
 * @param {string} floorId
 */
function loadRoomsList(floorId) {
    var container  = document.getElementById('roomListContainer');
    var emptyState = document.getElementById('roomListEmptyState');

    container.innerHTML    = '';
    emptyState.textContent = 'Loading…';

    userCol('rooms')
        .where('floorId', '==', floorId)
        .get()
        .then(function(snapshot) {
            emptyState.textContent = '';

            if (snapshot.empty) {
                emptyState.textContent = 'No rooms yet. Add a room to get started.';
                return;
            }

            // Sort by sortOrder; fall back to createdAt for rooms that predate drag-sort
            var docs = [];
            snapshot.forEach(function(doc) { docs.push(doc); });
            docs.sort(function(a, b) {
                var sa = a.data().sortOrder != null ? a.data().sortOrder : (a.data().createdAt ? a.data().createdAt.toMillis() : 0);
                var sb = b.data().sortOrder != null ? b.data().sortOrder : (b.data().createdAt ? b.data().createdAt.toMillis() : 0);
                return sa - sb;
            });
            docs.forEach(function(doc) {
                container.appendChild(buildRoomCard(doc.id, doc.data()));
            });
            _setDetailAccCount('floorRoomsAccCount', 'roomListContainer');

            // Enable drag-to-reorder via SortableJS
            if (window.Sortable) {
                Sortable.create(container, {
                    handle: '.drag-handle',
                    animation: 150,
                    onEnd: function() {
                        // Persist the new order — write sortOrder = position index to each room
                        var batch = db.batch();
                        container.querySelectorAll('[data-id]').forEach(function(card, index) {
                            var docRef = userCol('rooms').doc(card.dataset.id);
                            batch.update(docRef, { sortOrder: index });
                        });
                        batch.commit().catch(function(err) {
                            console.error('Room reorder save error:', err);
                        });
                    }
                });
            }
        })
        .catch(function(err) {
            console.error('loadRoomsList error:', err);
            emptyState.textContent = 'Error loading rooms.';
        });
}

/**
 * Build a clickable card for a room.
 */
function buildRoomCard(id, data) {
    var card = document.createElement('div');
    card.className = 'card card--clickable';
    card.dataset.id = id;   // used by Sortable to identify the record

    var label     = escapeHtml(data.name || 'Unnamed Room');
    var typeBadge = buildRoomTypeBadge(data.type);

    card.innerHTML =
        '<span class="drag-handle" title="Drag to reorder">⠿</span>' +
        '<div class="card-main">' +
            '<span class="card-title">' + label + '</span>' +
            typeBadge +
        '</div>' +
        '<span class="card-arrow">›</span>';

    // Click navigates to room — but ignore clicks that start on the drag handle
    card.addEventListener('click', function(e) {
        if (e.target.classList.contains('drag-handle')) return;
        window.location.hash = '#room/' + id;
    });

    return card;
}

/**
 * Return an HTML badge string for a room type (only for non-standard types).
 */
function buildRoomTypeBadge(type) {
    if (!type || type === 'standard') return '';
    var labels = { hallway: 'Hallway', stairs: 'Stairs', outdoors: 'Outdoors', utility: 'Utility' };
    var label  = labels[type] || type;
    return '<span class="house-room-type-badge house-room-type-badge--' +
           escapeHtml(type) + '">' + escapeHtml(label) + '</span>';
}

// ============================================================
// ROOM DETAIL PAGE  (#room/{roomId})
// ============================================================

/**
 * Load the Room detail page.
 * Called by app.js when the route is #room/{id}.
 */
function loadRoomDetail(roomId) {
    userCol('rooms').doc(roomId).get()
        .then(function(doc) {
            if (!doc.exists) {
                window.location.hash = '#house';
                return;
            }
            currentRoom = window.currentRoom = Object.assign({ id: doc.id }, doc.data());

            // Also load the parent floor so we can show it in the breadcrumb
            return userCol('floors').doc(currentRoom.floorId).get()
                .then(function(floorDoc) {
                    currentFloor = floorDoc.exists
                        ? Object.assign({ id: floorDoc.id }, floorDoc.data())
                        : { id: currentRoom.floorId, name: 'Unknown Floor' };
                    renderRoomDetail(currentRoom, currentFloor);
                    loadThingsList(currentRoom.id);
                });
        })
        .catch(function(err) { console.error('loadRoomDetail error:', err); });
}

/**
 * Render room header / meta / breadcrumb, then load all feature sections.
 */
function renderRoomDetail(room, floor) {
    document.getElementById('roomTitle').textContent = room.name || 'Room';

    // Meta: floor name + type badge
    var meta = document.getElementById('roomMeta');
    var typeLabel = '';
    if (room.type && room.type !== 'standard') {
        var typeLabels = { hallway: 'Hallway', stairs: 'Stairs', outdoors: 'Outdoors', utility: 'Utility' };
        typeLabel = ' · ' + (typeLabels[room.type] || room.type);
    }
    meta.textContent = (floor.name || 'Unknown Floor') + typeLabel;

    // Breadcrumb — "House › Floor Name › Room Name"
    buildHouseBreadcrumb([
        { label: 'House',              hash: '#house' },
        { label: floor.name || 'Floor', hash: '#floor/' + floor.id },
        { label: room.name || 'Room',  hash: null }
    ]);

    // ---- Load all feature sections, then update accordion counts ----
    loadProblems('room', room.id, 'roomProblemsContainer', 'roomProblemsEmptyState')
        .then(function() { _setDetailAccCount('roomProblemsAccCount', 'roomProblemsContainer'); });
    loadFacts('room', room.id, 'roomFactsContainer', 'roomFactsEmptyState')
        .then(function() { _setDetailAccCount('roomFactsAccCount', 'roomFactsContainer'); });
    loadProjects('room', room.id, 'roomProjectsContainer', 'roomProjectsEmptyState')
        .then(function() { _setDetailAccCount('roomTasksAccCount', 'roomProjectsContainer'); });
    loadActivities('room', room.id, 'roomActivityContainer', 'roomActivityEmptyState')
        .then(function() { _setDetailAccCount('roomActivityAccCount', 'roomActivityContainer'); });
    loadPhotos('room', room.id, 'roomPhotoContainer', 'roomPhotoEmptyState')
        .then(function() { _setPhotoAccCount('roomPhotosAccCount', 'room'); });

    if (typeof loadEventsForTarget === 'function') {
        var months = parseInt(document.getElementById('roomCalendarRangeSelect').value, 10) || 3;
        loadEventsForTarget('room', room.id,
            'roomCalendarEventsContainer', 'roomCalendarEventsEmptyState', months)
            .then(function() { _setDetailAccCount('roomCalendarAccCount', 'roomCalendarEventsContainer'); });
    }

    // Load floor plan items that belong to this room
    loadRoomFloorPlanItems(room.id, floor.id)
        .then(function() { _setDetailAccCount('roomFloorPlanAccCount', 'roomFloorPlanItemsContainer'); });

    // Load fp item rollup: Open Concerns + Active Projects for items in this room
    loadFpItemRollup('room', room.id, floor.id, 'roomFpRollupContainer');

    // Load electrical controls: switches in other rooms that control items here
    loadRoomElectricalControls(room.id);
}

// ============================================================
// FLOOR PLAN ITEM ROLLUP (Open Concerns + Active Projects)
// ============================================================

// All fp item targetType values — used for Firestore 'in' queries
var FP_ITEM_TYPES = ['door', 'window', 'ceiling', 'recessedLight', 'wallplate', 'fixture', 'plumbingEndpoint', 'plumbing'];

// Icon map for fp item types (mirrors loadRoomFloorPlanItems typeIconMap)
var FP_TYPE_ICONS = {
    door:             '🚪',
    window:           '🪟',
    fixture:          '🛁',
    ceiling:          '💡',
    recessedLight:    '◎',
    wallplate:        '🔌',
    plumbingEndpoint: '🔧',
    plumbing:         '〰️'
};

/**
 * Return a human-readable display name for a fp item.
 * Falls back to type label if item.name is blank.
 */
function fpRollupGetName(item, itemType) {
    if (item.name && item.name.trim()) return item.name.trim();
    if (itemType === 'door') {
        var doorLabels = { single: 'Door', french: 'French Door', sliding: 'Sliding Door', pocket: 'Pocket Door' };
        return doorLabels[item.subtype] || 'Door';
    }
    if (itemType === 'window')           return 'Window';
    if (itemType === 'ceiling') {
        var ceilLabels = { fan: 'Ceiling Fan', 'fan-light': 'Fan/Light', 'flush-mount': 'Flush Mount', 'drop-light': 'Drop Light', chandelier: 'Chandelier', generic: 'Ceiling Fixture' };
        return ceilLabels[item.subtype] || 'Ceiling Fixture';
    }
    if (itemType === 'recessedLight')    return 'Recessed Light';
    if (itemType === 'wallplate')        return 'Wall Plate';
    if (itemType === 'fixture') {
        var fixLabels = { toilet: 'Toilet', sink: 'Sink', tub: 'Tub/Shower' };
        return fixLabels[item.fixtureType] || 'Fixture';
    }
    if (itemType === 'plumbingEndpoint') return item.endpointType === 'spigot' ? 'Spigot' : 'Stub-out';
    if (itemType === 'plumbing')         return 'Plumbing';
    return 'Item';
}

/**
 * Render a single collapsible rollup section (concerns or projects) into container.
 * Does nothing if rows array is empty.
 *
 * @param {HTMLElement} container  — parent div to append the section into
 * @param {string}      title      — section heading text (without count)
 * @param {Array}       rows       — [{icon, typeLabel, itemName, title, detailsUrl}]
 */
function fpRenderRollupSection(container, title, rows) {
    if (!rows.length) return;

    var section = document.createElement('div');
    section.className = 'fp-rollup-section';

    var header = document.createElement('div');
    header.className = 'fp-rollup-header';
    header.innerHTML =
        escapeHtml(title) +
        ' <span class="fp-rollup-count">' + rows.length + '</span>' +
        '<span class="fp-rollup-arrow">›</span>';
    header.addEventListener('click', function() {
        section.classList.toggle('open');
    });
    section.appendChild(header);

    var body = document.createElement('div');
    body.className = 'fp-rollup-body';

    rows.forEach(function(row) {
        var div = document.createElement('div');
        div.className = 'fp-rollup-row';
        div.innerHTML =
            '<span class="fp-rollup-item-type">' + (row.icon || '') + ' ' + escapeHtml(row.typeLabel) + '</span>' +
            '<span class="fp-rollup-item-name">' + escapeHtml(row.itemName) + '</span>' +
            '<span class="fp-rollup-concern">' + escapeHtml(row.title) + '</span>' +
            '<a href="' + row.detailsUrl + '" class="btn btn-secondary btn-small fp-rollup-details-btn">Details \u2192</a>';
        body.appendChild(div);
    });

    section.appendChild(body);
    container.appendChild(section);
}

/**
 * Load and render the Open Concerns + Active Projects rollup for room or floor scope.
 *
 * @param {'room'|'floor'} scopeType  — 'room' filters to one room shape; 'floor' covers all rooms
 * @param {string}         scopeId    — room.id (Firestore) for room scope, floor.id for floor scope
 * @param {string}         floorId    — Firestore floor ID (= floorPlans doc ID)
 * @param {string}         containerId — ID of the wrapping div to render into
 */
async function loadFpItemRollup(scopeType, scopeId, floorId, containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    try {
        // 1. Load the floor plan doc for this floor
        var planDoc = await userCol('floorPlans').doc(floorId).get();
        if (!planDoc.exists) return;
        var plan = planDoc.data();
        var planId = floorId;

        // 2. Build itemId → { item, itemType, planId } map scoped to room or floor
        var itemMap = {};

        function collectItems(arr, itemType, shapeFilter) {
            (arr || []).forEach(function(item) {
                if (!shapeFilter || shapeFilter(item)) {
                    itemMap[item.id] = { item: item, itemType: itemType, planId: planId };
                }
            });
        }

        if (scopeType === 'room') {
            // Find the fp room shape whose .roomId === Firestore room ID
            var shape = (plan.rooms || []).find(function(r) { return r.roomId === scopeId; });
            if (!shape) return;
            var shapeId = shape.id;
            var roomFilter = function(item) { return item.roomId === shapeId; };
            collectItems(plan.doors,             'door',             roomFilter);
            collectItems(plan.windows,           'window',           roomFilter);
            collectItems(plan.fixtures,          'fixture',          roomFilter);
            collectItems(plan.ceilingFixtures,   'ceiling',          roomFilter);
            collectItems(plan.recessedLights,    'recessedLight',    roomFilter);
            collectItems(plan.wallPlates,        'wallplate',        roomFilter);
            collectItems(plan.plumbingEndpoints, 'plumbingEndpoint', roomFilter);
            collectItems(plan.plumbing,          'plumbing',         roomFilter);
        } else {
            // Floor scope: collect all items across all rooms in this plan
            collectItems(plan.doors,             'door',             null);
            collectItems(plan.windows,           'window',           null);
            collectItems(plan.fixtures,          'fixture',          null);
            collectItems(plan.ceilingFixtures,   'ceiling',          null);
            collectItems(plan.recessedLights,    'recessedLight',    null);
            collectItems(plan.wallPlates,        'wallplate',        null);
            collectItems(plan.plumbingEndpoints, 'plumbingEndpoint', null);
            collectItems(plan.plumbing,          'plumbing',         null);
        }

        var itemIds = Object.keys(itemMap);
        if (!itemIds.length) return;

        // 3. Query open problems and active projects in parallel
        var results = await Promise.all([
            userCol('problems').where('targetType', 'in', FP_ITEM_TYPES).where('status', '==', 'open').get(),
            userCol('projects').where('targetType', 'in', FP_ITEM_TYPES).get()
        ]);
        var problemSnap = results[0];
        var projectSnap = results[1];

        // 4. Filter to only items in scope, build display rows
        var concernRows = [];
        problemSnap.forEach(function(doc) {
            var d = doc.data();
            if (!itemMap[d.targetId]) return;
            var entry = itemMap[d.targetId];
            concernRows.push({
                icon:       FP_TYPE_ICONS[entry.itemType] || '',
                typeLabel:  fpRollupGetName(entry.item, entry.itemType),
                itemName:   fpRollupGetName(entry.item, entry.itemType),
                title:      d.description || '(no description)',
                detailsUrl: '#floorplanitem/' + entry.planId + '/' + entry.itemType + '/' + d.targetId
            });
        });

        var projectRows = [];
        projectSnap.forEach(function(doc) {
            var d = doc.data();
            if (!itemMap[d.targetId]) return;
            if (d.status === 'complete') return;
            var entry = itemMap[d.targetId];
            projectRows.push({
                icon:       FP_TYPE_ICONS[entry.itemType] || '',
                typeLabel:  fpRollupGetName(entry.item, entry.itemType),
                itemName:   fpRollupGetName(entry.item, entry.itemType),
                title:      d.title || '(no title)',
                detailsUrl: '#floorplanitem/' + entry.planId + '/' + entry.itemType + '/' + d.targetId
            });
        });

        // 5. Render the two collapsible sections
        var scopeLabel = scopeType === 'room' ? 'Items in this Room' : 'Items on this Floor';
        fpRenderRollupSection(container, 'Open Concerns \u2014 ' + scopeLabel, concernRows);
        fpRenderRollupSection(container, 'Active Projects \u2014 ' + scopeLabel, projectRows);

    } catch (err) {
        console.error('loadFpItemRollup error:', err);
    }
}

/**
 * Load and render the Open Concerns + Active Projects rollup for the whole house.
 * Loads all floor plan docs in parallel, collects items from every floor.
 *
 * @param {string} containerId — ID of the wrapping div to render into
 */
async function loadFpItemRollupForHouse(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    try {
        // 1. Load all floors to get their IDs
        var floorSnap = await userCol('floors').get();
        if (floorSnap.empty) return;

        var floorIds = [];
        floorSnap.forEach(function(doc) { floorIds.push(doc.id); });

        // 2. Load all floorPlan docs in parallel
        var planDocs = await Promise.all(
            floorIds.map(function(fid) { return userCol('floorPlans').doc(fid).get(); })
        );

        // 3. Collect all items across every floor plan
        var itemMap = {};   // itemId → { item, itemType, planId }
        planDocs.forEach(function(planDoc) {
            if (!planDoc.exists) return;
            var plan   = planDoc.data();
            var planId = planDoc.id;

            function collectAll(arr, itemType) {
                (arr || []).forEach(function(item) {
                    itemMap[item.id] = { item: item, itemType: itemType, planId: planId };
                });
            }
            collectAll(plan.doors,             'door');
            collectAll(plan.windows,           'window');
            collectAll(plan.fixtures,          'fixture');
            collectAll(plan.ceilingFixtures,   'ceiling');
            collectAll(plan.recessedLights,    'recessedLight');
            collectAll(plan.wallPlates,        'wallplate');
            collectAll(plan.plumbingEndpoints, 'plumbingEndpoint');
            collectAll(plan.plumbing,          'plumbing');
        });

        if (!Object.keys(itemMap).length) return;

        // 4. Query open problems and active projects in parallel
        var results = await Promise.all([
            userCol('problems').where('targetType', 'in', FP_ITEM_TYPES).where('status', '==', 'open').get(),
            userCol('projects').where('targetType', 'in', FP_ITEM_TYPES).get()
        ]);
        var problemSnap = results[0];
        var projectSnap = results[1];

        // 5. Filter to items in scope, build display rows
        var concernRows = [];
        problemSnap.forEach(function(doc) {
            var d = doc.data();
            if (!itemMap[d.targetId]) return;
            var entry = itemMap[d.targetId];
            concernRows.push({
                icon:       FP_TYPE_ICONS[entry.itemType] || '',
                typeLabel:  fpRollupGetName(entry.item, entry.itemType),
                itemName:   fpRollupGetName(entry.item, entry.itemType),
                title:      d.description || '(no description)',
                detailsUrl: '#floorplanitem/' + entry.planId + '/' + entry.itemType + '/' + d.targetId
            });
        });

        var projectRows = [];
        projectSnap.forEach(function(doc) {
            var d = doc.data();
            if (!itemMap[d.targetId]) return;
            if (d.status === 'complete') return;
            var entry = itemMap[d.targetId];
            projectRows.push({
                icon:       FP_TYPE_ICONS[entry.itemType] || '',
                typeLabel:  fpRollupGetName(entry.item, entry.itemType),
                itemName:   fpRollupGetName(entry.item, entry.itemType),
                title:      d.title || '(no title)',
                detailsUrl: '#floorplanitem/' + entry.planId + '/' + entry.itemType + '/' + d.targetId
            });
        });

        // 6. Render the two collapsible sections
        fpRenderRollupSection(container, 'Open Concerns \u2014 Whole House', concernRows);
        fpRenderRollupSection(container, 'Active Projects \u2014 Whole House', projectRows);

    } catch (err) {
        console.error('loadFpItemRollupForHouse error:', err);
    }
}

// ============================================================
// FLOOR PLAN ITEMS IN ROOM
// ============================================================

/**
 * Load all floor plan items that belong to a specific room and render
 * them grouped by category into #roomFloorPlanItemsContainer.
 *
 * Groups:
 *   Layout    — doors, windows, fixtures (toilet/sink/tub)
 *   Electrical — ceilingFixtures, recessedLights, wallPlates
 *   Plumbing  — plumbingEndpoints, plumbing
 *
 * @param {string} roomId   — the room's Firestore ID
 * @param {string} floorId  — the floor's Firestore ID (also the floorPlans doc ID)
 */
async function loadRoomFloorPlanItems(roomId, floorId) {
    var container  = document.getElementById('roomFloorPlanItemsContainer');
    var emptyState = document.getElementById('roomFloorPlanItemsEmptyState');
    if (!container) return;

    container.innerHTML  = '';
    if (emptyState) emptyState.textContent = '';

    try {
        // The floorPlans doc ID is the same as the floor's Firestore ID
        var planDoc = await userCol('floorPlans').doc(floorId).get();
        if (!planDoc.exists) {
            if (emptyState) emptyState.textContent = 'No floor plan found for this floor.';
            return;
        }
        var plan = planDoc.data();
        // The planId used in the route is the floorPlans doc ID.
        // We pass planId = floorId to the detail page URL.
        var planId = floorId;

        // IMPORTANT: items store roomId = fpRoom SHAPE id (e.g. "fp_r_abc"),
        // NOT the Firestore room document ID. Each room shape in fpPlan.rooms
        // has both .id (shape id) and .roomId (Firestore room document ID).
        // We must find the shape whose .roomId matches the Firestore roomId passed in,
        // then filter items by that shape's .id.
        var fpRoomShape = (plan.rooms || []).find(function(r) { return r.roomId === roomId; });
        var shapeId = fpRoomShape ? fpRoomShape.id : null;

        if (!shapeId) {
            // This floor's plan may not have a shape linked to this room yet
            if (emptyState) emptyState.textContent = 'No floor plan items in this room.';
            return;
        }

        // ---- Collect items by group ----
        var groups = [
            {
                label: 'Layout',
                items: []
            },
            {
                label: 'Electrical',
                items: []
            },
            {
                label: 'Plumbing',
                items: []
            }
        ];

        // Helper to push items from an array to a group, tagging each with itemType.
        // Compare item.roomId against shapeId (the fp room shape's internal id).
        function pushItems(arr, itemType, groupIndex) {
            (arr || []).forEach(function(item) {
                if (item.roomId === shapeId) {
                    groups[groupIndex].items.push({ item: item, itemType: itemType });
                }
            });
        }

        pushItems(plan.doors,             'door',             0);
        pushItems(plan.windows,           'window',           0);
        pushItems(plan.fixtures,          'fixture',          0);
        pushItems(plan.ceilingFixtures,   'ceiling',          1);
        pushItems(plan.recessedLights,    'recessedLight',    1);
        pushItems(plan.wallPlates,        'wallplate',        1);
        pushItems(plan.plumbingEndpoints, 'plumbingEndpoint', 2);
        pushItems(plan.plumbing,          'plumbing',         2);

        // Check if any items at all
        var totalItems = groups.reduce(function(acc, g) { return acc + g.items.length; }, 0);
        if (totalItems === 0) {
            if (emptyState) emptyState.textContent = 'No floor plan items in this room.';
            return;
        }

        // ---- Type icon/label map ----
        var typeIconMap = {
            'door':             '🚪',
            'window':           '🪟',
            'fixture':          '🛁',
            'ceiling':          '💡',
            'recessedLight':    '◎',
            'wallplate':        '🔌',
            'plumbingEndpoint': '🔧',
            'plumbing':         '〰️'
        };

        // Returns human-readable type label (same logic as fpItemGetTypeBadge in floorplanitem.js)
        function getTypeLabel(item, itemType) {
            if (itemType === 'door') {
                var m = { single: 'Door', french: 'French Door', sliding: 'Sliding Door', pocket: 'Pocket Door' };
                return m[item.subtype] || 'Door';
            }
            if (itemType === 'window')           return 'Window';
            if (itemType === 'ceiling') {
                var m = { fan: 'Ceiling Fan', 'fan-light': 'Fan/Light', 'flush-mount': 'Flush Mount', 'drop-light': 'Drop Light', chandelier: 'Chandelier', generic: 'Ceiling Fixture' };
                return m[item.subtype] || 'Ceiling Fixture';
            }
            if (itemType === 'recessedLight')    return 'Recessed Light';
            if (itemType === 'wallplate')        return 'Wall Plate';
            if (itemType === 'fixture') {
                var m = { toilet: 'Toilet', sink: 'Sink', tub: 'Tub/Shower' };
                return m[item.fixtureType] || 'Fixture';
            }
            if (itemType === 'plumbingEndpoint') return item.endpointType === 'spigot' ? 'Spigot' : 'Stub-out';
            if (itemType === 'plumbing')         return 'Plumbing';
            return itemType;
        }

        // Returns display name — item.name if set, otherwise type label
        function getDisplayName(item, itemType) {
            if (item.name && item.name.trim()) return item.name.trim();
            return getTypeLabel(item, itemType);
        }

        // ---- Render each group ----
        groups.forEach(function(group) {
            if (group.items.length === 0) return;

            var groupDiv = document.createElement('div');
            groupDiv.className = 'fp-items-group';

            var groupHeader = document.createElement('div');
            groupHeader.className   = 'fp-items-group-header';
            groupHeader.textContent = group.label;
            groupDiv.appendChild(groupHeader);

            group.items.forEach(function(entry) {
                var item     = entry.item;
                var itemType = entry.itemType;

                var row = document.createElement('div');
                row.className = 'fp-item-row';

                // Icon + type label
                var typeSpan = document.createElement('span');
                typeSpan.className   = 'fp-item-type';
                typeSpan.textContent = (typeIconMap[itemType] || '') + ' ' + getTypeLabel(item, itemType);
                row.appendChild(typeSpan);

                // Display name
                var nameSpan = document.createElement('span');
                nameSpan.className   = 'fp-item-name';
                nameSpan.textContent = getDisplayName(item, itemType);
                row.appendChild(nameSpan);

                // Details link
                var detailsLink = document.createElement('a');
                detailsLink.href        = '#floorplanitem/' + planId + '/' + itemType + '/' + item.id;
                detailsLink.className   = 'btn btn-secondary btn-small fp-item-details-btn';
                detailsLink.textContent = 'Details →';
                row.appendChild(detailsLink);

                groupDiv.appendChild(row);
            });

            container.appendChild(groupDiv);
        });

    } catch (err) {
        console.error('loadRoomFloorPlanItems error:', err);
        if (emptyState) emptyState.textContent = 'Error loading floor plan items.';
    }
}

// ============================================================
// ELECTRICAL CONTROLS — REVERSE LOOKUP
// ============================================================

/**
 * Scan all floor plans looking for external targets whose roomId matches
 * the given room, then render a summary section showing which switches
 * (in other rooms) control items located here.
 *
 * @param {string} roomId  - Firestore rooms doc ID of the current room
 */
function loadRoomElectricalControls(roomId) {
    var container = document.getElementById('roomElectricalControlsContainer');
    if (!container) return;
    container.innerHTML = '';

    userCol('floorPlans').get()
        .then(function(snap) {
            var matches = [];

            snap.forEach(function(planDoc) {
                var plan    = planDoc.data();
                var planId  = planDoc.id;
                var plates  = plan.wallPlates || [];

                plates.forEach(function(plate) {
                    (plate.slots || []).forEach(function(slot, slotIdx) {
                        if (!slot.external) return;
                        (slot.externalTargets || []).forEach(function(target) {
                            if (target.roomId === roomId) {
                                matches.push({
                                    target:   target,
                                    plate:    plate,
                                    slotIdx:  slotIdx,
                                    slot:     slot,
                                    planId:   planId
                                });
                            }
                        });
                    });
                });
            });

            if (!matches.length) return;

            // Build section
            var section = document.createElement('div');
            section.className = 'fp-elec-controls-section';

            var hdr = document.createElement('h4');
            hdr.className   = 'section-heading';
            hdr.textContent = '⚡ Electrical Controls';
            section.appendChild(hdr);

            var hint = document.createElement('p');
            hint.className   = 'label-hint';
            hint.textContent = 'Switches in other rooms that control items located here.';
            hint.style.marginBottom = '6px';
            section.appendChild(hint);

            matches.forEach(function(m) {
                var row = document.createElement('div');
                row.className = 'fp-elec-controls-item';

                // Target name + location label
                var nameSpan = document.createElement('span');
                nameSpan.className   = 'fp-elec-controls-name';
                nameSpan.textContent = m.target.name || 'Item';

                // Link to item's detail page
                var detailLink = document.createElement('a');
                detailLink.href      = '#floorplanitem/' + m.target.planId + '/ceiling/' + m.target.fpItemId;
                detailLink.className = 'breadcrumb-link fp-elec-controls-detail';
                detailLink.textContent = ' →';

                // "Controlled by" label
                var bySpan = document.createElement('span');
                bySpan.className   = 'fp-elec-controls-by';
                var slotLabel = 'Slot ' + (m.slotIdx + 1);
                var subtypeLabel = { 'single-pole': '', '3-way': ' (3-way)', 'dimmer': ' (dimmer)', 'smart': ' (smart)' }[m.slot.subtype] || '';
                bySpan.textContent = 'Controlled by: ' + (m.plate.name || 'Wall Plate') +
                    ', ' + slotLabel + subtypeLabel;

                // Link to wall plate's floor plan
                var plateLink = document.createElement('a');
                plateLink.href      = '#floorplanitem/' + m.planId + '/wallplate/' + m.plate.id;
                plateLink.className = 'breadcrumb-link fp-elec-controls-plate';
                plateLink.textContent = ' → View plate';

                row.appendChild(nameSpan);
                row.appendChild(detailLink);
                row.appendChild(document.createElement('br'));
                row.appendChild(bySpan);
                row.appendChild(plateLink);

                section.appendChild(row);
            });

            container.appendChild(section);
        })
        .catch(function(err) {
            console.error('loadRoomElectricalControls error:', err);
        });
}

// ============================================================
// BREADCRUMB / HEADER HELPERS
// ============================================================

/**
 * Build the breadcrumb bar and sticky header for House pages.
 * @param {Array} crumbs  [{label, hash}] — hash null = current page (no link)
 */
function buildHouseBreadcrumb(crumbs) {
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
// FLOOR MODAL  (Add / Edit)
// ============================================================

function openFloorModal(editId, data) {
    var modal     = document.getElementById('floorModal');
    var nameInput = document.getElementById('floorNameInput');
    var numInput  = document.getElementById('floorNumberInput');
    var deleteBtn = document.getElementById('floorModalDeleteBtn');

    if (editId) {
        document.getElementById('floorModalTitle').textContent = 'Edit Floor';
        nameInput.value         = data.name || '';
        numInput.value          = (data.floorNumber !== undefined && data.floorNumber !== null)
                                      ? data.floorNumber : '';
        deleteBtn.style.display = '';
        modal.dataset.mode      = 'edit';
        modal.dataset.editId    = editId;
    } else {
        document.getElementById('floorModalTitle').textContent = 'Add Floor';
        nameInput.value         = '';
        numInput.value          = '';
        deleteBtn.style.display = 'none';
        modal.dataset.mode      = 'add';
        modal.dataset.editId    = '';
    }

    openModal('floorModal');
    nameInput.focus();
}

document.getElementById('floorModalSaveBtn').addEventListener('click', function() {
    var modal   = document.getElementById('floorModal');
    var nameVal = document.getElementById('floorNameInput').value.trim();
    var numVal  = document.getElementById('floorNumberInput').value.trim();

    if (!nameVal) { alert('Please enter a floor name.'); return; }

    var floorData = {
        name:        nameVal,
        floorNumber: numVal !== '' ? parseInt(numVal, 10) : null
    };

    var mode   = modal.dataset.mode;
    var editId = modal.dataset.editId;

    if (mode === 'edit' && editId) {
        userCol('floors').doc(editId).update(floorData)
            .then(function() {
                closeModal('floorModal');
                if (window.location.hash.startsWith('#floor/')) {
                    loadFloorDetail(editId);
                } else {
                    loadHousePage();
                }
            })
            .catch(function(err) { console.error('Update floor error:', err); });
    } else {
        floorData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        userCol('floors').add(floorData)
            .then(function() {
                closeModal('floorModal');
                loadHousePage();
            })
            .catch(function(err) { console.error('Add floor error:', err); });
    }
});

document.getElementById('floorModalCancelBtn').addEventListener('click', function() {
    closeModal('floorModal');
});

document.getElementById('floorModalDeleteBtn').addEventListener('click', function() {
    var editId = document.getElementById('floorModal').dataset.editId;
    if (!editId) return;

    // Block delete if the floor has rooms
    userCol('rooms').where('floorId', '==', editId).limit(1).get()
        .then(function(snap) {
            if (!snap.empty) {
                alert('This floor has rooms. Delete or move all rooms first.');
                return;
            }
            if (!confirm('Delete this floor? This cannot be undone.')) return;
            userCol('floors').doc(editId).delete()
                .then(function() {
                    closeModal('floorModal');
                    window.location.hash = '#house';
                })
                .catch(function(err) { console.error('Delete floor error:', err); });
        });
});

// ============================================================
// ROOM MODAL  (Add / Edit)
// ============================================================

/**
 * Open the room add/edit modal.
 * @param {string|null} editId  - Firestore room ID when editing; null for add
 * @param {object|null} data    - Existing room data when editing
 */
function openRoomModal(editId, data) {
    var modal      = document.getElementById('roomModal');
    var nameInput  = document.getElementById('roomNameInput');
    var typeSelect = document.getElementById('roomTypeSelect');
    var deleteBtn  = document.getElementById('roomModalDeleteBtn');
    var stairsGrp  = document.getElementById('roomStairsConnectGroup');
    var connectSel = document.getElementById('roomConnectsToFloorSelect');

    if (editId) {
        document.getElementById('roomModalTitle').textContent = 'Edit Room';
        nameInput.value         = data.name || '';
        typeSelect.value        = data.type || 'standard';
        deleteBtn.style.display = '';
        modal.dataset.mode      = 'edit';
        modal.dataset.editId    = editId;
    } else {
        document.getElementById('roomModalTitle').textContent = 'Add Room';
        nameInput.value         = '';
        typeSelect.value        = 'standard';
        deleteBtn.style.display = 'none';
        modal.dataset.mode      = 'add';
        modal.dataset.editId    = '';
    }

    // Load all floors into the "connects to" dropdown (exclude the current floor)
    connectSel.innerHTML = '<option value="">— Not specified —</option>';
    userCol('floors').orderBy('floorNumber', 'asc').get()
        .then(function(snap) {
            snap.forEach(function(doc) {
                if (currentFloor && doc.id === currentFloor.id) return; // skip current floor
                var opt = document.createElement('option');
                opt.value       = doc.id;
                opt.textContent = doc.data().name || 'Floor';
                if (editId && data.connectsToFloorId === doc.id) opt.selected = true;
                connectSel.appendChild(opt);
            });
        });

    // Show/hide the "connects to floor" group based on type
    function toggleStairsGroup() {
        stairsGrp.style.display = typeSelect.value === 'stairs' ? '' : 'none';
    }
    toggleStairsGroup();
    typeSelect.onchange = toggleStairsGroup;

    openModal('roomModal');
    nameInput.focus();
}

document.getElementById('roomModalSaveBtn').addEventListener('click', function() {
    var modal   = document.getElementById('roomModal');
    var nameVal = document.getElementById('roomNameInput').value.trim();
    var typeVal = document.getElementById('roomTypeSelect').value;

    if (!nameVal) { alert('Please enter a room name.'); return; }

    var mode   = modal.dataset.mode;
    var editId = modal.dataset.editId;

    var connectsToFloorId = '';
    if (typeVal === 'stairs') {
        connectsToFloorId = document.getElementById('roomConnectsToFloorSelect').value || '';
    }

    if (mode === 'edit' && editId) {
        userCol('rooms').doc(editId).update({
            name:               nameVal,
            type:               typeVal,
            connectsToFloorId:  connectsToFloorId
        })
            .then(function() {
                closeModal('roomModal');
                loadRoomDetail(editId);
            })
            .catch(function(err) { console.error('Update room error:', err); });
    } else {
        // Add — floorId comes from the currently viewed floor
        if (!currentFloor) { alert('No floor selected.'); return; }
        var roomData = {
            name:               nameVal,
            type:               typeVal,
            connectsToFloorId:  connectsToFloorId,
            floorId:            currentFloor.id,
            sortOrder:          Date.now(),
            createdAt:          firebase.firestore.FieldValue.serverTimestamp()
        };
        userCol('rooms').add(roomData)
            .then(function() {
                closeModal('roomModal');
                loadRoomsList(currentFloor.id);
            })
            .catch(function(err) { console.error('Add room error:', err); });
    }
});

document.getElementById('roomModalCancelBtn').addEventListener('click', function() {
    closeModal('roomModal');
});

document.getElementById('roomModalDeleteBtn').addEventListener('click', function() {
    var editId = document.getElementById('roomModal').dataset.editId;
    if (!editId) return;

    if (!confirm('Delete this room? This cannot be undone.')) return;

    userCol('rooms').doc(editId).delete()
        .then(function() {
            closeModal('roomModal');
            // Go back to the floor this room belonged to
            if (currentFloor) {
                window.location.hash = '#floor/' + currentFloor.id;
            } else {
                window.location.hash = '#house';
            }
        })
        .catch(function(err) { console.error('Delete room error:', err); });
});

// ============================================================
// MOVE ROOM MODAL
// ============================================================

/**
 * Open the move-room modal, populating the floor dropdown.
 */
function openMoveRoomModal() {
    var select = document.getElementById('moveRoomFloorSelect');
    select.innerHTML = '<option value="">Loading floors…</option>';

    userCol('floors').orderBy('floorNumber', 'asc').get()
        .then(function(snapshot) {
            select.innerHTML = '';
            snapshot.forEach(function(doc) {
                var opt   = document.createElement('option');
                opt.value = doc.id;
                var data  = doc.data();
                opt.textContent = data.name +
                    (data.floorNumber !== null && data.floorNumber !== undefined
                        ? ' (Floor ' + data.floorNumber + ')' : '');
                // Pre-select the current floor
                if (currentRoom && doc.id === currentRoom.floorId) {
                    opt.selected = true;
                }
                select.appendChild(opt);
            });
        });

    openModal('moveRoomModal');
}

document.getElementById('moveRoomSaveBtn').addEventListener('click', function() {
    var newFloorId = document.getElementById('moveRoomFloorSelect').value;
    if (!newFloorId || !currentRoom) return;

    if (newFloorId === currentRoom.floorId) {
        closeModal('moveRoomModal');
        return;
    }

    userCol('rooms').doc(currentRoom.id).update({ floorId: newFloorId })
        .then(function() {
            closeModal('moveRoomModal');
            // Navigate to the new floor
            window.location.hash = '#floor/' + newFloorId;
        })
        .catch(function(err) { console.error('Move room error:', err); });
});

document.getElementById('moveRoomCancelBtn').addEventListener('click', function() {
    closeModal('moveRoomModal');
});

// ============================================================
// PAGE BUTTON WIRING
// ============================================================

// House home — Add Floor
document.getElementById('addFloorBtn').addEventListener('click', function() {
    openFloorModal(null, null);
});

// Floor detail — Edit Floor
document.getElementById('editFloorBtn').addEventListener('click', function() {
    if (!currentFloor) return;
    openFloorModal(currentFloor.id, currentFloor);
});

// Floor detail — Add Room
document.getElementById('addRoomBtn').addEventListener('click', function() {
    openRoomModal(null, null);
});

// Room detail — Edit Room
document.getElementById('editRoomBtn').addEventListener('click', function() {
    if (!currentRoom) return;
    openRoomModal(currentRoom.id, currentRoom);
});

// Room detail — Move Room
document.getElementById('moveRoomBtn').addEventListener('click', function() {
    if (!currentRoom) return;
    openMoveRoomModal();
});

// ============================================================
// THINGS LIST  (shown on the Room detail page)
// ============================================================

/**
 * Load and render the things list for a given room.
 * @param {string} roomId
 */
function loadThingsList(roomId) {
    var container  = document.getElementById('thingListContainer');
    var emptyState = document.getElementById('thingListEmptyState');

    container.innerHTML    = '';
    emptyState.textContent = 'Loading…';

    userCol('things')
        .where('roomId', '==', roomId)
        .get()
        .then(function(snapshot) {
            emptyState.textContent = '';

            if (snapshot.empty) {
                emptyState.textContent = 'No things yet. Add furniture, appliances, or fixtures.';
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
                container.appendChild(buildThingCard(doc.id, doc.data()));
            });
            _setDetailAccCount('roomThingsAccCount', 'thingListContainer');
        })
        .catch(function(err) {
            console.error('loadThingsList error:', err);
            emptyState.textContent = 'Error loading things.';
        });
}

/**
 * Build a clickable card for a thing.
 */
function buildThingCard(id, data) {
    var card = document.createElement('div');
    card.className = 'card card--clickable';

    var label    = escapeHtml(data.name || 'Unnamed Thing');
    var catBadge = buildThingCategoryBadge(data.category);

    card.innerHTML =
        (data.profilePhotoData ? '<img class="entity-card-thumb" alt="">' : '') +
        '<div class="card-main">' +
            '<span class="card-title">' + label + '</span>' +
            catBadge +
        '</div>' +
        '<span class="card-arrow">›</span>';

    if (data.profilePhotoData) {
        card.querySelector('.entity-card-thumb').src = data.profilePhotoData;
    }

    card.addEventListener('click', function() {
        window.location.hash = '#thing/' + id;
    });

    return card;
}

/**
 * Return an HTML badge string for a thing category.
 */
function buildThingCategoryBadge(category) {
    if (!category) return '';
    var label = THING_CATEGORIES[category] || category;
    return '<span class="house-thing-cat-badge house-thing-cat-badge--' +
           escapeHtml(category) + '">' + escapeHtml(label) + '</span>';
}

// ============================================================
// THING DETAIL PAGE  (#thing/{thingId})
// ============================================================

/**
 * Load the Thing detail page.
 * Called by app.js when the route is #thing/{id}.
 */
function loadThingDetail(thingId) {
    userCol('things').doc(thingId).get()
        .then(function(doc) {
            if (!doc.exists) {
                window.location.hash = '#house';
                return;
            }
            currentThing = window.currentThing = Object.assign({ id: doc.id }, doc.data());

            // Load parent room, then parent floor for breadcrumb
            return userCol('rooms').doc(currentThing.roomId).get()
                .then(function(roomDoc) {
                    currentRoom = roomDoc.exists
                        ? Object.assign({ id: roomDoc.id }, roomDoc.data())
                        : { id: currentThing.roomId, name: 'Unknown Room', floorId: null };

                    var floorId = currentRoom.floorId;
                    if (!floorId) {
                        currentFloor = { id: '', name: 'Unknown Floor' };
                        renderThingDetail(currentThing, currentRoom, currentFloor);
                        return;
                    }

                    return userCol('floors').doc(floorId).get()
                        .then(function(floorDoc) {
                            currentFloor = floorDoc.exists
                                ? Object.assign({ id: floorDoc.id }, floorDoc.data())
                                : { id: floorId, name: 'Unknown Floor' };
                            renderThingDetail(currentThing, currentRoom, currentFloor);
                        });
                });
        })
        .catch(function(err) { console.error('loadThingDetail error:', err); });
}

/**
 * Render thing header / meta / breadcrumb, then load all feature sections.
 */
function renderThingDetail(thing, room, floor) {
    document.getElementById('thingTitle').textContent = thing.name || 'Thing';

    var meta     = document.getElementById('thingMeta');
    var catLabel = THING_CATEGORIES[thing.category] || thing.category || '';
    // Only show category — floor/room path is already in the clickable breadcrumb bar above
    meta.textContent = catLabel;

    // Inventory details card
    renderInventoryDetails(thing, 'thingDetailsSection');
    _renderBeneficiaryRow('thingGoesToRow', thing, []);

    // Breadcrumb: House > Floor > Room > Thing
    buildHouseBreadcrumb([
        { label: 'House',               hash: '#house' },
        { label: floor.name || 'Floor', hash: '#floor/' + floor.id },
        { label: room.name  || 'Room',  hash: '#room/'  + room.id },
        { label: thing.name || 'Thing', hash: null }
    ]);

    // ---- Load all feature sections ----
    loadProblems('thing', thing.id, 'thingProblemsContainer', 'thingProblemsEmptyState')
        .then(function() { _setDetailAccCount('thingProblemsAccCount', 'thingProblemsContainer'); });
    loadFacts('thing', thing.id, 'thingFactsContainer', 'thingFactsEmptyState')
        .then(function() { _setDetailAccCount('thingFactsAccCount', 'thingFactsContainer'); });
    loadProjects('thing', thing.id, 'thingProjectsContainer', 'thingProjectsEmptyState')
        .then(function() { _setDetailAccCount('thingTasksAccCount', 'thingProjectsContainer'); });
    loadActivities('thing', thing.id, 'thingActivityContainer', 'thingActivityEmptyState')
        .then(function() { _setDetailAccCount('thingActivityAccCount', 'thingActivityContainer'); });
    loadPhotos('thing', thing.id, 'thingPhotoContainer', 'thingPhotoEmptyState')
        .then(function() { _setPhotoAccCount('thingPhotosAccCount', 'thing'); });

    if (typeof loadEventsForTarget === 'function') {
        var months = parseInt(document.getElementById('thingCalendarRangeSelect').value, 10) || 3;
        loadEventsForTarget('thing', thing.id,
            'thingCalendarEventsContainer', 'thingCalendarEventsEmptyState', months)
            .then(function() { _setDetailAccCount('thingCalendarAccCount', 'thingCalendarEventsContainer'); });
    }

    // Load sub-things (items) list
    loadSubThingsList(thing.id);
}

// ============================================================
// THING MODAL  (Add / Edit)
// ============================================================

function openThingModal(editId, data) {
    var modal     = document.getElementById('thingModal');
    var nameInput = document.getElementById('thingNameInput');
    var catSelect = document.getElementById('thingCategorySelect');
    var deleteBtn = document.getElementById('thingModalDeleteBtn');

    if (editId) {
        document.getElementById('thingModalTitle').textContent = 'Edit Thing';
        nameInput.value         = data.name || '';
        catSelect.value         = data.category || 'furniture';
        document.getElementById('thingPricePaidInput').value    = data.pricePaid    || '';
        document.getElementById('thingWorthInput').value        = data.worth        || '';
        document.getElementById('thingYearBoughtInput').value   = data.yearBought   || '';
        document.getElementById('thingPurchaseDateInput').value = data.purchaseDate || '';
        document.getElementById('thingDescriptionInput').value  = data.description  || '';
        document.getElementById('thingCommentInput').value      = data.comment      || '';
        deleteBtn.style.display = '';
        modal.dataset.mode      = 'edit';
        modal.dataset.editId    = editId;
    } else {
        document.getElementById('thingModalTitle').textContent = 'Add Thing';
        nameInput.value         = '';
        catSelect.value         = 'furniture';
        document.getElementById('thingPricePaidInput').value    = '';
        document.getElementById('thingWorthInput').value        = '';
        document.getElementById('thingYearBoughtInput').value   = '';
        document.getElementById('thingPurchaseDateInput').value = '';
        document.getElementById('thingDescriptionInput').value  = '';
        document.getElementById('thingCommentInput').value      = '';
        deleteBtn.style.display = 'none';
        modal.dataset.mode      = 'add';
        modal.dataset.editId    = '';
    }
    buildContactPicker('thingBenePicker', {
        placeholder: 'Search contacts\u2026',
        initialId:   editId ? (data.beneficiaryContactId || undefined) : undefined,
        initialName: editId ? (data.beneficiaryName      || undefined) : undefined
    });

    // Show/hide From Picture only in add mode
    var picSection = document.getElementById('thingFromPictureSection');
    if (editId) {
        picSection.classList.add('hidden');
    } else {
        picSection.classList.add('hidden');
        document.getElementById('thingPicStatus').classList.add('hidden');
        document.getElementById('thingPicStatus').textContent = '';
        document.getElementById('thingPicInput').value = '';
        document.getElementById('thingCamInput').value = '';
        houseCheckLlmForModal('thingFromPictureSection');
    }

    openModal('thingModal');
    nameInput.focus();
}

document.getElementById('thingModalSaveBtn').addEventListener('click', function() {
    var modal   = document.getElementById('thingModal');
    var nameVal = document.getElementById('thingNameInput').value.trim();
    var catVal  = document.getElementById('thingCategorySelect').value;

    if (!nameVal) { alert('Please enter a name.'); return; }

    var mode   = modal.dataset.mode;
    var editId = modal.dataset.editId;

    var extraFields = {
        pricePaid:            document.getElementById('thingPricePaidInput').value.trim()    || null,
        worth:                document.getElementById('thingWorthInput').value.trim()        || null,
        yearBought:           document.getElementById('thingYearBoughtInput').value.trim()   || null,
        purchaseDate:         document.getElementById('thingPurchaseDateInput').value.trim() || null,
        description:          document.getElementById('thingDescriptionInput').value.trim(),
        comment:              document.getElementById('thingCommentInput').value.trim(),
        beneficiaryContactId: document.getElementById('thingBenePicker_id').value           || null
    };

    if (mode === 'edit' && editId) {
        var updateData = Object.assign({ name: nameVal, category: catVal }, extraFields);
        userCol('things').doc(editId).update(updateData)
            .then(function() {
                closeModal('thingModal');
                loadThingDetail(editId);
            })
            .catch(function(err) { console.error('Update thing error:', err); });
    } else {
        if (!currentRoom) { alert('No room selected.'); return; }
        var thingData = Object.assign({
            name:      nameVal,
            category:  catVal,
            roomId:    currentRoom.id,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, extraFields);
        userCol('things').add(thingData)
            .then(function() {
                closeModal('thingModal');
                loadThingsList(currentRoom.id);
            })
            .catch(function(err) { console.error('Add thing error:', err); });
    }
});

document.getElementById('thingModalCancelBtn').addEventListener('click', function() {
    closeModal('thingModal');
});

document.getElementById('thingModalDeleteBtn').addEventListener('click', function() {
    var editId = document.getElementById('thingModal').dataset.editId;
    if (!editId) return;

    userCol('subThings').where('thingId', '==', editId).limit(1).get()
        .then(function(snap) {
            if (!snap.empty) {
                alert('This thing has items. Delete all items first.');
                return;
            }

            if (!confirm('Delete this thing? This cannot be undone.')) return;

            userCol('things').doc(editId).delete()
                .then(function() {
                    closeModal('thingModal');
                    if (currentRoom) {
                        window.location.hash = '#room/' + currentRoom.id;
                    } else {
                        window.location.hash = '#house';
                    }
                })
                .catch(function(err) { console.error('Delete thing error:', err); });
        })
        .catch(function(err) { console.error('Check subThings error:', err); });
});

// ============================================================
// MOVE THING MODAL
// ============================================================

/**
 * Open the move-thing modal, showing all rooms grouped by floor.
 */
function openMoveThingModal() {
    var select = document.getElementById('moveThingRoomSelect');
    select.innerHTML = '<option value="">Loading rooms…</option>';

    // Load all floors then all rooms, grouped by floor for the dropdown
    userCol('floors').orderBy('floorNumber', 'asc').get()
        .then(function(floorSnap) {
            var floorMap   = {};
            var floorOrder = [];
            floorSnap.forEach(function(doc) {
                floorMap[doc.id] = doc.data().name || 'Floor';
                floorOrder.push(doc.id);
            });

            return userCol('rooms').get().then(function(roomSnap) {
                var byFloor = {};
                roomSnap.forEach(function(doc) {
                    var d = doc.data();
                    if (!byFloor[d.floorId]) byFloor[d.floorId] = [];
                    byFloor[d.floorId].push({ id: doc.id, name: d.name || 'Room' });
                });

                select.innerHTML = '';
                floorOrder.forEach(function(floorId) {
                    var rooms = byFloor[floorId] || [];
                    if (!rooms.length) return;

                    var group = document.createElement('optgroup');
                    group.label = floorMap[floorId] || 'Floor';
                    rooms.forEach(function(r) {
                        var opt = document.createElement('option');
                        opt.value = r.id;
                        opt.textContent = r.name;
                        if (currentThing && r.id === currentThing.roomId) opt.selected = true;
                        group.appendChild(opt);
                    });
                    select.appendChild(group);
                });

                if (!select.options.length) {
                    select.innerHTML = '<option value="">No rooms available</option>';
                }
            });
        });

    openModal('moveThingModal');
}

document.getElementById('moveThingSaveBtn').addEventListener('click', function() {
    var newRoomId = document.getElementById('moveThingRoomSelect').value;
    if (!newRoomId || !currentThing) return;

    if (newRoomId === currentThing.roomId) {
        closeModal('moveThingModal');
        return;
    }

    userCol('things').doc(currentThing.id).update({ roomId: newRoomId })
        .then(function() {
            closeModal('moveThingModal');
            window.location.hash = '#room/' + newRoomId;
        })
        .catch(function(err) { console.error('Move thing error:', err); });
});

document.getElementById('moveThingCancelBtn').addEventListener('click', function() {
    closeModal('moveThingModal');
});

// ============================================================
// THING PAGE BUTTON WIRING
// ============================================================

// Room detail — Add Thing
document.getElementById('addThingBtn').addEventListener('click', function() {
    openThingModal(null, null);
});

// Room detail — "+Photo" quick-add for things — opens staging modal directly
document.getElementById('quickAddThingPhotoBtn').addEventListener('click', function() {
    houseQuickAddThingFromPhoto('quickAddThingPhotoBtn', 'quickThingCamInput');
});
// Legacy camera input kept wired for any remaining direct trigger path
document.getElementById('quickThingCamInput').addEventListener('change', function() {
    if (this.files && this.files.length > 0) {
        (async function(files) {
            var images = [];
            for (var i = 0; i < Math.min(files.length, 4); i++) {
                images.push(await compressImage(files[i]));
            }
            await _houseQuickSendToLlm(images, 'thing', 'quickAddThingPhotoBtn', 'quickThingCamInput');
        })(this.files);
    }
});

// Thing detail — Edit
document.getElementById('editThingBtn').addEventListener('click', function() {
    if (!currentThing) return;
    openThingModal(currentThing.id, currentThing);
});

// Thing detail — Move
document.getElementById('moveThingBtn').addEventListener('click', function() {
    if (!currentThing) return;
    openMoveThingModal();
});

// ============================================================
// THING FEATURE BUTTON WIRING  (Problems, Facts, Projects,
// Activities, Photos, Calendar Events on the Thing detail page)
// ============================================================

document.getElementById('addThingProblemBtn').addEventListener('click', function() {
    if (currentThing) openAddProblemModal('thing', currentThing.id);
});

document.getElementById('addThingFactBtn').addEventListener('click', function() {
    if (currentThing) openAddFactModal('thing', currentThing.id);
});

document.getElementById('addThingProjectBtn').addEventListener('click', function() {
    if (currentThing) openAddProjectModal('thing', currentThing.id);
});

document.getElementById('logThingActivityBtn').addEventListener('click', function() {
    if (currentThing) openLogActivityModal('thing', currentThing.id);
});

document.getElementById('addThingCameraBtn').addEventListener('click', function() {
    if (currentThing) triggerCameraUpload('thing', currentThing.id);
});
document.getElementById('addThingGalleryBtn').addEventListener('click', function() {
    if (currentThing) triggerGalleryUpload('thing', currentThing.id);
});

document.getElementById('addThingCalendarEventBtn').addEventListener('click', function() {
    if (currentThing && typeof openAddCalendarEventModal === 'function') {
        var reloadFn = function() {
            var months = parseInt(document.getElementById('thingCalendarRangeSelect').value, 10) || 3;
            loadEventsForTarget('thing', currentThing.id,
                'thingCalendarEventsContainer', 'thingCalendarEventsEmptyState', months);
        };
        openAddCalendarEventModal('thing', currentThing.id, reloadFn);
    }
});

document.getElementById('thingCalendarRangeSelect').addEventListener('change', function() {
    if (currentThing && typeof loadEventsForTarget === 'function') {
        var months = parseInt(this.value, 10) || 3;
        loadEventsForTarget('thing', currentThing.id,
            'thingCalendarEventsContainer', 'thingCalendarEventsEmptyState', months);
    }
});

// ============================================================
// FLOOR FEATURE BUTTON WIRING  (Problems, Facts, Projects,
// Activities, Photos, Calendar Events on the Floor detail page)
// ============================================================

document.getElementById('addFloorProblemBtn').addEventListener('click', function() {
    if (currentFloor) openAddProblemModal('floor', currentFloor.id);
});

document.getElementById('addFloorFactBtn').addEventListener('click', function() {
    if (currentFloor) openAddFactModal('floor', currentFloor.id);
});

document.getElementById('addFloorProjectBtn').addEventListener('click', function() {
    if (currentFloor) openAddProjectModal('floor', currentFloor.id);
});

document.getElementById('logFloorActivityBtn').addEventListener('click', function() {
    if (currentFloor) openLogActivityModal('floor', currentFloor.id);
});

document.getElementById('addFloorCameraBtn').addEventListener('click', function() {
    if (currentFloor) triggerCameraUpload('floor', currentFloor.id);
});
document.getElementById('addFloorGalleryBtn').addEventListener('click', function() {
    if (currentFloor) triggerGalleryUpload('floor', currentFloor.id);
});

document.getElementById('addFloorCalendarEventBtn').addEventListener('click', function() {
    if (currentFloor && typeof openAddCalendarEventModal === 'function') {
        var reloadFn = function() {
            var months = parseInt(document.getElementById('floorCalendarRangeSelect').value, 10) || 3;
            loadEventsForTarget('floor', currentFloor.id,
                'floorCalendarEventsContainer', 'floorCalendarEventsEmptyState', months);
        };
        openAddCalendarEventModal('floor', currentFloor.id, reloadFn);
    }
});

document.getElementById('floorCalendarRangeSelect').addEventListener('change', function() {
    if (currentFloor && typeof loadEventsForTarget === 'function') {
        var months = parseInt(this.value, 10) || 3;
        loadEventsForTarget('floor', currentFloor.id,
            'floorCalendarEventsContainer', 'floorCalendarEventsEmptyState', months);
    }
});

// ============================================================
// ROOM FEATURE BUTTON WIRING  (Problems, Facts, Projects,
// Activities, Photos, Calendar Events on the Room detail page)
// ============================================================

document.getElementById('addRoomProblemBtn').addEventListener('click', function() {
    if (currentRoom) openAddProblemModal('room', currentRoom.id);
});

document.getElementById('addRoomFactBtn').addEventListener('click', function() {
    if (currentRoom) openAddFactModal('room', currentRoom.id);
});

document.getElementById('addRoomProjectBtn').addEventListener('click', function() {
    if (currentRoom) openAddProjectModal('room', currentRoom.id);
});

document.getElementById('logRoomActivityBtn').addEventListener('click', function() {
    if (currentRoom) openLogActivityModal('room', currentRoom.id);
});

document.getElementById('addRoomCameraBtn').addEventListener('click', function() {
    if (currentRoom) triggerCameraUpload('room', currentRoom.id);
});
document.getElementById('addRoomGalleryBtn').addEventListener('click', function() {
    if (currentRoom) triggerGalleryUpload('room', currentRoom.id);
});

document.getElementById('addRoomCalendarEventBtn').addEventListener('click', function() {
    if (currentRoom && typeof openAddCalendarEventModal === 'function') {
        var reloadFn = function() {
            var months = parseInt(document.getElementById('roomCalendarRangeSelect').value, 10) || 3;
            loadEventsForTarget('room', currentRoom.id,
                'roomCalendarEventsContainer', 'roomCalendarEventsEmptyState', months);
        };
        openAddCalendarEventModal('room', currentRoom.id, reloadFn);
    }
});

document.getElementById('roomCalendarRangeSelect').addEventListener('change', function() {
    if (currentRoom && typeof loadEventsForTarget === 'function') {
        var months = parseInt(this.value, 10) || 3;
        loadEventsForTarget('room', currentRoom.id,
            'roomCalendarEventsContainer', 'roomCalendarEventsEmptyState', months);
    }
});

// ============================================================
// BREAKER PANEL LIST  (Phase H12 — shown on House home page)
// ============================================================

/**
 * Load and render the breaker panels list for the House home page.
 * Runs independently from the floors query — different DOM container.
 */
function loadPanelList() {
    var container  = document.getElementById('panelListContainer');
    var emptyState = document.getElementById('panelEmptyState');

    container.innerHTML    = '';
    emptyState.textContent = 'Loading…';

    userCol('breakerPanels').get()
        .then(function(snap) {
            emptyState.textContent = '';

            if (snap.empty) {
                emptyState.textContent = 'No breaker panels yet.';
                return;
            }

            // Sort client-side by createdAt ascending
            var docs = [];
            snap.forEach(function(doc) { docs.push(doc); });
            docs.sort(function(a, b) {
                var ta = a.data().createdAt ? a.data().createdAt.toMillis() : 0;
                var tb = b.data().createdAt ? b.data().createdAt.toMillis() : 0;
                return ta - tb;
            });

            docs.forEach(function(doc) {
                container.appendChild(buildPanelCard(doc.id, doc.data()));
            });
        })
        .catch(function(err) {
            console.error('loadPanelList error:', err);
            emptyState.textContent = 'Error loading panels.';
        });
}

/**
 * Build a clickable card for a breaker panel.
 * @param {string} id    - Firestore document ID
 * @param {object} data  - Panel document data
 */
function buildPanelCard(id, data) {
    var card = document.createElement('div');
    card.className = 'card card--clickable';

    var label      = escapeHtml(data.name || 'Unnamed Panel');
    var locMeta    = data.location
        ? '<span class="house-floor-meta">' + escapeHtml(data.location) + '</span>'
        : '';
    var assigned   = (data.breakers || []).length;
    var total      = data.totalSlots || 0;
    var slotsMeta  = '<span class="house-floor-meta">' + assigned + ' of ' + total + ' slots assigned</span>';

    card.innerHTML =
        '<div class="card-main">' +
            '<span class="card-title">' + label + '</span>' +
            locMeta + slotsMeta +
        '</div>' +
        '<span class="card-arrow">›</span>';

    card.addEventListener('click', function() {
        window.location.hash = '#panel/' + id;
    });

    return card;
}

// ============================================================
// PANEL DETAIL PAGE  (#panel/{panelId})
// ============================================================

/**
 * Load the Breaker Panel detail page.
 * Called by app.js when the route is #panel/{id}.
 * @param {string} panelId
 */
function loadPanelDetail(panelId) {
    userCol('breakerPanels').doc(panelId).get()
        .then(function(doc) {
            if (!doc.exists) {
                window.location.hash = '#house';
                return;
            }
            currentPanel = window.currentPanel = Object.assign({ id: doc.id }, doc.data());
            renderPanelDetail(currentPanel);
        })
        .catch(function(err) { console.error('loadPanelDetail error:', err); });
}

/**
 * Render the panel header, breadcrumb, grid, and all feature sections.
 * @param {object} panel  - Panel doc data merged with { id }
 */
function renderPanelDetail(panel) {
    document.getElementById('panelTitle').textContent = panel.name || 'Breaker Panel';

    var locEl = document.getElementById('panelLocation');
    locEl.textContent   = panel.location || '';
    locEl.style.display = panel.location ? '' : 'none';

    var notesEl = document.getElementById('panelNotes');
    notesEl.textContent   = panel.notes || '';
    notesEl.style.display = panel.notes ? '' : 'none';

    buildHouseBreadcrumb([
        { label: 'House',                  hash: '#house' },
        { label: panel.name || 'Panel',    hash: null }
    ]);

    // Render the 2-column breaker grid
    renderPanelGrid(panel);

    // Standard cross-entity sections
    loadProblems(  'panel', panel.id, 'panelProblemsContainer', 'panelProblemsEmptyState');
    loadFacts(     'panel', panel.id, 'panelFactsContainer',    'panelFactsEmptyState');
    loadActivities('panel', panel.id, 'panelActivityContainer', 'panelActivityEmptyState');
    loadPhotos(    'panel', panel.id, 'panelPhotoContainer',    'panelPhotoEmptyState');
}

// ============================================================
// PANEL GRID RENDERER
// ============================================================

/**
 * Render the 2-column breaker grid.
 * Slots are paired left/right: (1,2), (3,4), (5,6)…
 * Empty slots show a dashed placeholder that can still be clicked to assign.
 * @param {object} panel
 */
function renderPanelGrid(panel) {
    var container  = document.getElementById('panelGridContainer');
    var emptyState = document.getElementById('panelGridEmptyState');

    container.innerHTML    = '';
    emptyState.textContent = '';

    var total = panel.totalSlots || 0;
    if (total === 0) {
        emptyState.textContent = 'No slots configured. Edit the panel to set the number of slots.';
        return;
    }

    // Build a lookup map: slot number → breaker data
    var breakerMap = {};
    (panel.breakers || []).forEach(function(b) {
        breakerMap[b.slot] = b;
    });

    // Render pairs of slots as rows
    for (var i = 1; i <= total; i += 2) {
        var row = document.createElement('div');
        row.className = 'breaker-row';

        row.appendChild(buildBreakerSlotEl(i,     breakerMap[i]     || null));
        // Right column: only render if within total slots
        if (i + 1 <= total) {
            row.appendChild(buildBreakerSlotEl(i + 1, breakerMap[i + 1] || null));
        } else {
            // Spacer to keep grid symmetrical on odd totals
            var spacer = document.createElement('div');
            row.appendChild(spacer);
        }

        container.appendChild(row);
    }
}

/**
 * Build one breaker slot cell element.
 * @param {number}      slotNum  - 1-based slot position
 * @param {object|null} breaker  - Breaker data object or null if empty
 * @returns {HTMLElement}
 */
function buildBreakerSlotEl(slotNum, breaker) {
    var cell = document.createElement('div');

    if (!breaker) {
        cell.className = 'breaker-slot breaker-slot--empty';
        cell.innerHTML =
            '<span class="breaker-slot-num">' + slotNum + '</span>' +
            '<span class="breaker-slot-label">(empty)</span>';
    } else {
        var status = breaker.status || 'on';
        cell.className = 'breaker-slot breaker-slot--' + escapeHtml(status);

        var ampsHtml   = breaker.amps
            ? '<span class="breaker-amps">' + breaker.amps + 'A</span>'
            : '';
        var statusText = status.charAt(0).toUpperCase() + status.slice(1);

        cell.innerHTML =
            '<span class="breaker-slot-num">' + slotNum + '</span>' +
            '<span class="breaker-slot-label">' + escapeHtml(breaker.label || '(unlabeled)') + '</span>' +
            '<div class="breaker-slot-meta">' +
                ampsHtml +
                '<span class="breaker-status breaker-status--' + escapeHtml(status) + '">' +
                    statusText +
                '</span>' +
            '</div>';
    }

    cell.addEventListener('click', function() {
        openBreakerModal(slotNum, breaker);
    });

    return cell;
}

// ============================================================
// PANEL MODAL  (Add / Edit)
// ============================================================

/**
 * Open the add/edit modal for a breaker panel.
 * @param {string|null} editId  - Firestore document ID when editing; null for add
 * @param {object|null} data    - Existing panel data when editing
 */
function openPanelModal(editId, data) {
    var modal     = document.getElementById('panelModal');
    var deleteBtn = document.getElementById('panelModalDeleteBtn');

    document.getElementById('panelNameInput').value       = (editId && data) ? (data.name      || '') : '';
    document.getElementById('panelLocationInput').value   = (editId && data) ? (data.location  || '') : '';
    document.getElementById('panelNotesInput').value      = (editId && data) ? (data.notes     || '') : '';
    document.getElementById('panelTotalSlotsInput').value = (editId && data) ? (data.totalSlots || 20) : 20;

    if (editId) {
        document.getElementById('panelModalTitle').textContent = 'Edit Panel';
        deleteBtn.style.display = '';
        modal.dataset.mode   = 'edit';
        modal.dataset.editId = editId;
    } else {
        document.getElementById('panelModalTitle').textContent = 'Add Breaker Panel';
        deleteBtn.style.display = 'none';
        modal.dataset.mode   = 'add';
        modal.dataset.editId = '';
    }

    openModal('panelModal');
    document.getElementById('panelNameInput').focus();
}

document.getElementById('panelModalSaveBtn').addEventListener('click', function() {
    var modal    = document.getElementById('panelModal');
    var nameVal  = document.getElementById('panelNameInput').value.trim();
    var locVal   = document.getElementById('panelLocationInput').value.trim();
    var notesVal = document.getElementById('panelNotesInput').value.trim();
    var slotsVal = parseInt(document.getElementById('panelTotalSlotsInput').value, 10);

    if (!nameVal)                          { alert('Please enter a panel name.'); return; }
    if (isNaN(slotsVal) || slotsVal < 2)  { alert('Total slots must be at least 2.'); return; }

    // Round up to nearest even number (breaker panels always have pairs)
    if (slotsVal % 2 !== 0) slotsVal += 1;

    var panelData = { name: nameVal, location: locVal, notes: notesVal, totalSlots: slotsVal };

    var mode   = modal.dataset.mode;
    var editId = modal.dataset.editId;

    if (mode === 'edit' && editId) {
        userCol('breakerPanels').doc(editId).update(panelData)
            .then(function() {
                closeModal('panelModal');
                loadPanelDetail(editId);
            })
            .catch(function(err) { console.error('Update panel error:', err); });
    } else {
        panelData.breakers  = [];
        panelData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        userCol('breakerPanels').add(panelData)
            .then(function(ref) {
                closeModal('panelModal');
                window.location.hash = '#panel/' + ref.id;
            })
            .catch(function(err) { console.error('Add panel error:', err); });
    }
});

document.getElementById('panelModalCancelBtn').addEventListener('click', function() {
    closeModal('panelModal');
});

document.getElementById('panelModalDeleteBtn').addEventListener('click', function() {
    var editId = document.getElementById('panelModal').dataset.editId;
    if (!editId) return;
    if (!confirm('Delete this panel and all its breaker data? This cannot be undone.')) return;
    userCol('breakerPanels').doc(editId).delete()
        .then(function() {
            closeModal('panelModal');
            window.location.hash = '#house';
        })
        .catch(function(err) { console.error('Delete panel error:', err); });
});

// ============================================================
// BREAKER MODAL  (Edit a single slot)
// ============================================================

/**
 * Open the edit modal for one breaker slot.
 * @param {number}      slotNum  - Slot position (1-based)
 * @param {object|null} breaker  - Existing breaker data, or null if the slot is empty
 */
function openBreakerModal(slotNum, breaker) {
    bpEditSlot = slotNum;
    bpEditId   = breaker ? (breaker.id || null) : null;

    document.getElementById('breakerModalTitle').textContent = 'Breaker — Slot ' + slotNum;
    document.getElementById('breakerLabelInput').value   = breaker ? (breaker.label  || '') : '';
    document.getElementById('breakerAmpsSelect').value   = breaker ? (breaker.amps   || '') : '';
    document.getElementById('breakerStatusSelect').value = breaker ? (breaker.status || 'on') : 'on';
    document.getElementById('breakerNotesInput').value   = breaker ? (breaker.notes  || '') : '';

    // Connected devices section — only visible when editing an assigned slot (Phase H13)
    var devSection = document.getElementById('breakerDevicesSection');
    if (breaker && breaker.id) {
        devSection.style.display = '';
        loadBreakerDevices(breaker.id, 'breakerDevicesContainer', 'breakerDevicesEmptyState');
    } else {
        devSection.style.display = 'none';
        document.getElementById('breakerDevicesContainer').innerHTML = '';
    }

    // Problems section — only visible when editing an already-assigned slot
    var probSection = document.getElementById('breakerProblemsSection');
    if (breaker && breaker.id) {
        probSection.style.display = '';
        loadProblems('breaker', breaker.id,
            'breakerProblemsContainer', 'breakerProblemsEmptyState');
    } else {
        probSection.style.display = 'none';
        document.getElementById('breakerProblemsContainer').innerHTML = '';
    }

    // "Clear Slot" button only appears when editing an assigned slot
    document.getElementById('breakerClearBtn').style.display = (breaker && breaker.id) ? '' : 'none';

    openModal('breakerModal');
    document.getElementById('breakerLabelInput').focus();
}

document.getElementById('breakerModalSaveBtn').addEventListener('click', function() {
    if (!currentPanel || bpEditSlot === null) return;

    var labelVal  = document.getElementById('breakerLabelInput').value.trim();
    var ampsRaw   = document.getElementById('breakerAmpsSelect').value;
    var statusVal = document.getElementById('breakerStatusSelect').value;
    var notesVal  = document.getElementById('breakerNotesInput').value.trim();

    // Build the updated breakers array (copy so we don't mutate state before save)
    var breakers = (currentPanel.breakers || []).slice();

    // Find if an entry already exists for this slot
    var existingIdx = -1;
    for (var i = 0; i < breakers.length; i++) {
        if (breakers[i].slot === bpEditSlot) { existingIdx = i; break; }
    }

    var breakerEntry = {
        id:     bpEditId || bpUUID(),
        slot:   bpEditSlot,
        label:  labelVal,
        amps:   ampsRaw ? parseInt(ampsRaw, 10) : null,
        status: statusVal,
        notes:  notesVal
    };

    if (existingIdx >= 0) {
        // Preserve the original id so existing problem links stay intact
        breakerEntry.id = breakers[existingIdx].id;
        breakers[existingIdx] = breakerEntry;
    } else {
        breakers.push(breakerEntry);
    }

    // Keep array sorted by slot for readability in Firestore
    breakers.sort(function(a, b) { return a.slot - b.slot; });

    userCol('breakerPanels').doc(currentPanel.id).update({ breakers: breakers })
        .then(function() {
            currentPanel.breakers = breakers;
            closeModal('breakerModal');
            renderPanelGrid(currentPanel);
        })
        .catch(function(err) { console.error('Save breaker error:', err); });
});

document.getElementById('breakerModalCancelBtn').addEventListener('click', function() {
    closeModal('breakerModal');
});

// "Clear Slot" — removes the breaker assignment, leaving the slot empty
document.getElementById('breakerClearBtn').addEventListener('click', function() {
    if (!currentPanel || bpEditSlot === null) return;
    if (!confirm('Clear slot ' + bpEditSlot + '? The label and settings will be removed.')) return;

    var breakers = (currentPanel.breakers || []).filter(function(b) {
        return b.slot !== bpEditSlot;
    });

    userCol('breakerPanels').doc(currentPanel.id).update({ breakers: breakers })
        .then(function() {
            currentPanel.breakers = breakers;
            closeModal('breakerModal');
            renderPanelGrid(currentPanel);
        })
        .catch(function(err) { console.error('Clear breaker error:', err); });
});

// "+ Add Problem" button inside the breaker modal
document.getElementById('breakerAddProblemBtn').addEventListener('click', function() {
    if (!bpEditId) return;
    openAddProblemModal('breaker', bpEditId);
});

// ============================================================
// PANEL PAGE BUTTON WIRING
// ============================================================

// House home — Add Panel
document.getElementById('addPanelBtn').addEventListener('click', function() {
    openPanelModal(null, null);
});

// Panel detail — Edit Panel
document.getElementById('editPanelBtn').addEventListener('click', function() {
    if (!currentPanel) return;
    openPanelModal(currentPanel.id, currentPanel);
});

// Panel detail — Delete Panel
document.getElementById('deletePanelBtn').addEventListener('click', function() {
    if (!currentPanel) return;
    if (!confirm('Delete "' + (currentPanel.name || 'this panel') + '"? This cannot be undone.')) return;
    userCol('breakerPanels').doc(currentPanel.id).delete()
        .then(function() { window.location.hash = '#house'; })
        .catch(function(err) { console.error('Delete panel error:', err); });
});

// Panel detail — "+ 2 Slots" button expands the grid by two positions
document.getElementById('addBreakerSlotBtn').addEventListener('click', function() {
    if (!currentPanel) return;
    var newTotal = (currentPanel.totalSlots || 0) + 2;
    userCol('breakerPanels').doc(currentPanel.id).update({ totalSlots: newTotal })
        .then(function() {
            currentPanel.totalSlots = newTotal;
            renderPanelGrid(currentPanel);
        })
        .catch(function(err) { console.error('Add slot error:', err); });
});

// Panel detail — Problems / Facts / Activities / Photos
document.getElementById('addPanelProblemBtn').addEventListener('click', function() {
    if (currentPanel) openAddProblemModal('panel', currentPanel.id);
});

document.getElementById('addPanelFactBtn').addEventListener('click', function() {
    if (currentPanel) openAddFactModal('panel', currentPanel.id);
});

document.getElementById('logPanelActivityBtn').addEventListener('click', function() {
    if (currentPanel) openLogActivityModal('panel', currentPanel.id);
});

document.getElementById('addPanelCameraBtn').addEventListener('click', function() {
    if (currentPanel) triggerCameraUpload('panel', currentPanel.id);
});
document.getElementById('addPanelGalleryBtn').addEventListener('click', function() {
    if (currentPanel) triggerGalleryUpload('panel', currentPanel.id);
});

// ============================================================
// ROOMS PAGE  (#rooms)
// Displays a navigable tree of all floors and their rooms.
// ============================================================

/**
 * Load and render the Rooms tree page.
 * Shows all floors (sorted by floorNumber) with their rooms listed
 * beneath each floor. Both floor and room rows are clickable links.
 */
function loadRoomsPage() {
    var container  = document.getElementById('roomsTreeContainer');
    var emptyState = document.getElementById('roomsTreeEmptyState');

    container.innerHTML    = '';
    emptyState.textContent = 'Loading…';

    buildHouseBreadcrumb([
        { label: 'House', hash: '#house' },
        { label: 'Rooms', hash: null }
    ]);

    var floorsQ = userCol('floors').orderBy('floorNumber', 'asc').get();
    var roomsQ  = userCol('rooms').get();

    Promise.all([floorsQ, roomsQ])
        .then(function(results) {
            var floorSnap = results[0];
            var roomSnap  = results[1];

            emptyState.textContent = '';

            if (floorSnap.empty) {
                emptyState.textContent = 'No floors yet. Add a floor from the House page.';
                return;
            }

            // Group rooms by floorId, sorted by createdAt
            var roomsByFloor = {};
            roomSnap.forEach(function(doc) {
                var fId = doc.data().floorId;
                if (!roomsByFloor[fId]) roomsByFloor[fId] = [];
                roomsByFloor[fId].push({ id: doc.id, data: doc.data() });
            });
            Object.keys(roomsByFloor).forEach(function(fId) {
                roomsByFloor[fId].sort(function(a, b) {
                    var ta = a.data.createdAt ? a.data.createdAt.toMillis() : 0;
                    var tb = b.data.createdAt ? b.data.createdAt.toMillis() : 0;
                    return ta - tb;
                });
            });

            // Render floor rows + indented room rows
            floorSnap.forEach(function(floorDoc) {
                var floor = floorDoc.data();
                var rooms = roomsByFloor[floorDoc.id] || [];

                // Floor link row
                var floorRow = document.createElement('a');
                floorRow.href      = '#floor/' + floorDoc.id;
                floorRow.className = 'rooms-tree-floor';
                floorRow.textContent = floor.name || 'Floor';
                if (floor.floorNumber !== null && floor.floorNumber !== undefined) {
                    var numSpan = document.createElement('span');
                    numSpan.className   = 'rooms-tree-floor-num';
                    numSpan.textContent = '  (Floor ' + floor.floorNumber + ')';
                    floorRow.appendChild(numSpan);
                }
                container.appendChild(floorRow);

                if (!rooms.length) {
                    var noRooms = document.createElement('div');
                    noRooms.className   = 'rooms-tree-empty';
                    noRooms.textContent = 'No rooms on this floor';
                    container.appendChild(noRooms);
                } else {
                    rooms.forEach(function(r) {
                        var roomRow = document.createElement('a');
                        roomRow.href      = '#room/' + r.id;
                        roomRow.className = 'rooms-tree-room';
                        roomRow.textContent = r.data.name || 'Room';
                        container.appendChild(roomRow);
                    });
                }
            });
        })
        .catch(function(err) {
            console.error('loadRoomsPage error:', err);
            emptyState.textContent = 'Error loading rooms.';
        });
}

// ============================================================
// CIRCUIT LINKAGE  (Phase H13)
// Scan all floor plan documents to find markers linked to a breaker.
// ============================================================

/**
 * Load and render all floor plan markers (outlets, switches, ceiling fixtures)
 * that have a matching breakerId.  Renders a compact list inside the breakerModal.
 *
 * @param {string} breakerId   - The breaker's stable UUID to search for
 * @param {string} containerId - id of the <div> to render into
 * @param {string} emptyId     - id of the <p class="empty-state"> element
 */
function loadBreakerDevices(breakerId, containerId, emptyId) {
    var container = document.getElementById(containerId);
    var emptyEl   = document.getElementById(emptyId);

    container.innerHTML    = '';
    emptyEl.textContent    = 'Loading…';

    // Scan all floorPlans documents for markers with this breakerId
    userCol('floorPlans').get()
        .then(function(snap) {
            var devices = [];

            snap.forEach(function(planDoc) {
                var plan    = planDoc.data();
                var floorId = planDoc.id;

                // Check outlets, switches, and ceiling fixtures
                var markerArrays = {
                    outlets:         '⚡ Outlet',
                    switches:        '💡 Switch',
                    ceilingFixtures: '🔆 Ceiling Fixture'
                };

                Object.keys(markerArrays).forEach(function(key) {
                    (plan[key] || []).forEach(function(marker) {
                        if (marker.breakerId === breakerId) {
                            devices.push({
                                floorId:   floorId,
                                typeLabel: markerArrays[key],
                                marker:    marker
                            });
                        }
                    });
                });
            });

            emptyEl.textContent = '';

            if (!devices.length) {
                emptyEl.textContent =
                    'No devices linked yet. Edit outlets, switches, or ceiling fixtures ' +
                    'on a floor plan to link them to this circuit.';
                return;
            }

            // Collect unique floorIds so we can look up names
            var uniqueFloorIds = [];
            devices.forEach(function(d) {
                if (uniqueFloorIds.indexOf(d.floorId) === -1) {
                    uniqueFloorIds.push(d.floorId);
                }
            });

            // Fetch floor names, then render
            return Promise.all(uniqueFloorIds.map(function(fid) {
                return userCol('floors').doc(fid).get();
            })).then(function(floorDocs) {
                var floorNames = {};
                floorDocs.forEach(function(d) {
                    floorNames[d.id] = d.exists ? (d.data().name || 'Floor') : 'Floor';
                });

                devices.forEach(function(d) {
                    var floorName = floorNames[d.floorId] || 'Floor';
                    var label     = d.marker.label || d.marker.type || '(unlabeled)';

                    var item = document.createElement('div');
                    item.className = 'breaker-device-item';
                    item.title     = 'Go to floor plan';
                    item.innerHTML =
                        '<span class="breaker-device-type">' + d.typeLabel + '</span>' +
                        '<span class="breaker-device-label">' + escapeHtml(label) + '</span>' +
                        '<span class="breaker-device-floor">' + escapeHtml(floorName) + '</span>';

                    // Clicking navigates to the floor plan for that floor
                    item.addEventListener('click', function() {
                        closeModal('breakerModal');
                        window.location.hash = '#floorplan/' + d.floorId;
                    });

                    container.appendChild(item);
                });
            });
        })
        .catch(function(err) {
            console.error('loadBreakerDevices error:', err);
            emptyEl.textContent = 'Error loading devices.';
        });
}

// ============================================================
// UUID HELPER  (generates stable IDs for individual breakers)
// ============================================================
// SHARED INVENTORY DETAIL RENDERER
// Renders price/worth/year/description/comment as a card.
// Used by both thing detail and sub-thing detail pages.
// ============================================================

function renderInventoryDetails(data, sectionId) {
    var section = document.getElementById(sectionId);
    if (!section) return;

    var rows = [];
    if (data.pricePaid  !== null && data.pricePaid  !== undefined && data.pricePaid  !== '')
        rows.push(['Price Paid',  '$' + data.pricePaid]);
    if (data.worth      !== null && data.worth      !== undefined && data.worth      !== '')
        rows.push(['Worth',       '$' + data.worth]);
    if (data.yearBought !== null && data.yearBought !== undefined && data.yearBought !== '')
        rows.push(['Year Bought', data.yearBought]);
    if (data.purchaseDate) {
        // Format ISO date string as "Month D, YYYY" for readability
        var pd = new Date(data.purchaseDate + 'T00:00:00');
        var pdStr = pd.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        rows.push(['Purchased', pdStr]);
    }
    if (data.description)
        rows.push(['Description', data.description]);
    if (data.comment)
        rows.push(['Comment',     data.comment]);

    if (!rows.length) { section.style.display = 'none'; return; }

    section.style.display = '';
    section.innerHTML = rows.map(function(r) {
        return '<div class="thing-detail-row">' +
               '<span class="thing-detail-label">' + escapeHtml(r[0]) + '</span>' +
               '<span class="thing-detail-value">'  + escapeHtml(String(r[1])) + '</span>' +
               '</div>';
    }).join('');
}

// ============================================================
// SUB-THINGS LIST  (shown on Thing detail page)
// ============================================================

function loadSubThingsList(thingId) {
    var container  = document.getElementById('subThingListContainer');
    var emptyState = document.getElementById('subThingListEmptyState');

    container.innerHTML    = '';
    emptyState.textContent = 'Loading…';

    userCol('subThings').where('thingId', '==', thingId).get()
        .then(function(snapshot) {
            emptyState.textContent = '';
            if (snapshot.empty) {
                emptyState.textContent = 'No items yet. Add an item to start tracking inventory.';
                return;
            }

            var docs = [];
            snapshot.forEach(function(doc) { docs.push(doc); });
            docs.sort(function(a, b) {
                var ta = a.data().createdAt ? a.data().createdAt.toMillis() : 0;
                var tb = b.data().createdAt ? b.data().createdAt.toMillis() : 0;
                return ta - tb;
            });
            docs.forEach(function(doc) {
                container.appendChild(buildSubThingCard(doc.id, doc.data()));
            });
            _setDetailAccCount('thingItemsAccCount', 'subThingListContainer');
        })
        .catch(function(err) {
            console.error('loadSubThingsList error:', err);
            emptyState.textContent = 'Error loading items.';
        });
}

function buildSubThingCard(id, data) {
    var card = document.createElement('div');
    card.className = 'card card--clickable';

    var label = escapeHtml(data.name || 'Unnamed Item');
    var tags  = (data.tags || []).map(function(t) {
        return '<span class="thing-tag-badge">' + escapeHtml(t) + '</span>';
    }).join('');
    var meta  = tags
        ? '<div class="house-floor-meta" style="margin-top:3px">' + tags + '</div>'
        : '';

    card.innerHTML =
        (data.profilePhotoData ? '<img class="entity-card-thumb" alt="">' : '') +
        '<div class="card-main">' +
            '<span class="card-title">' + label + '</span>' +
            meta +
        '</div>' +
        '<span class="card-arrow">\u203a</span>';

    if (data.profilePhotoData) {
        card.querySelector('.entity-card-thumb').src = data.profilePhotoData;
    }

    card.addEventListener('click', function() {
        window.location.hash = '#subthing/' + id;
    });
    return card;
}

// ============================================================
// SUB-THING DETAIL PAGE  (#subthing/{id})
// ============================================================

function loadSubThingDetail(subThingId) {
    userCol('subThings').doc(subThingId).get()
        .then(function(doc) {
            if (!doc.exists) { window.location.hash = '#house'; return; }
            currentSubThing = window.currentSubThing = Object.assign({ id: doc.id }, doc.data());

            // Load parent chain: thing → room → floor
            return userCol('things').doc(currentSubThing.thingId).get()
                .then(function(thingDoc) {
                    currentThing = thingDoc.exists
                        ? Object.assign({ id: thingDoc.id }, thingDoc.data())
                        : { id: currentSubThing.thingId, name: 'Thing', roomId: null };

                    var roomId = currentThing.roomId;
                    if (!roomId) {
                        currentRoom  = { id: '', name: 'Room',  floorId: null };
                        currentFloor = { id: '', name: 'Floor' };
                        renderSubThingDetail(currentSubThing, currentThing, currentRoom, currentFloor);
                        return;
                    }

                    return userCol('rooms').doc(roomId).get()
                        .then(function(roomDoc) {
                            currentRoom = roomDoc.exists
                                ? Object.assign({ id: roomDoc.id }, roomDoc.data())
                                : { id: roomId, name: 'Room', floorId: null };

                            var floorId = currentRoom.floorId;
                            if (!floorId) {
                                currentFloor = { id: '', name: 'Floor' };
                                renderSubThingDetail(currentSubThing, currentThing, currentRoom, currentFloor);
                                return;
                            }

                            return userCol('floors').doc(floorId).get()
                                .then(function(floorDoc) {
                                    currentFloor = floorDoc.exists
                                        ? Object.assign({ id: floorDoc.id }, floorDoc.data())
                                        : { id: floorId, name: 'Floor' };
                                    renderSubThingDetail(currentSubThing, currentThing, currentRoom, currentFloor);
                                });
                        });
                });
        })
        .catch(function(err) { console.error('loadSubThingDetail error:', err); });
}

// ============================================================
// ITEM LIST  (shown on SubThing detail page)
// ============================================================

/**
 * Loads and renders all Items for a subThing as clickable cards.
 * Called from renderSubThingDetail and after add/delete operations.
 * @param {string} subThingId
 */
function loadItemsList(subThingId) {
    var container  = document.getElementById('itemListContainer');
    var emptyState = document.getElementById('itemListEmptyState');
    if (!container) return;

    container.innerHTML    = '';
    emptyState.textContent = 'Loading…';

    userCol('subThingItems').where('subThingId', '==', subThingId).get()
        .then(function(snapshot) {
            emptyState.textContent = '';
            if (snapshot.empty) {
                emptyState.textContent = 'No items yet. Tap + Add Item to start tracking.';
                return;
            }

            var docs = [];
            snapshot.forEach(function(doc) { docs.push(doc); });
            docs.sort(function(a, b) {
                var ta = a.data().createdAt ? a.data().createdAt.toMillis() : 0;
                var tb = b.data().createdAt ? b.data().createdAt.toMillis() : 0;
                return ta - tb;  // oldest first
            });
            docs.forEach(function(doc) {
                container.appendChild(buildItemCard(doc.id, doc.data()));
            });
            _setDetailAccCount('stItemsAccCount', 'itemListContainer');
        })
        .catch(function(err) {
            console.error('loadItemsList error:', err);
            emptyState.textContent = 'Error loading items.';
        });
}

/**
 * Builds a single clickable card for an Item in the list.
 * @param {string} id   - Firestore document ID
 * @param {Object} data - Item data
 * @returns {HTMLElement}
 */
function buildItemCard(id, data) {
    var card = document.createElement('div');
    card.className = 'card card--clickable';

    var label = escapeHtml(data.name || 'Unnamed Item');
    var tags  = (data.tags || []).map(function(t) {
        return '<span class="thing-tag-badge">' + escapeHtml(t) + '</span>';
    }).join('');
    var meta  = tags
        ? '<div class="house-floor-meta" style="margin-top:3px">' + tags + '</div>'
        : '';

    card.innerHTML =
        (data.profilePhotoData ? '<img class="entity-card-thumb" alt="">' : '') +
        '<div class="card-main">' +
            '<span class="card-title">' + label + '</span>' +
            meta +
        '</div>' +
        '<span class="card-arrow">\u203a</span>';

    if (data.profilePhotoData) {
        card.querySelector('.entity-card-thumb').src = data.profilePhotoData;
    }

    card.addEventListener('click', function() {
        window.location.hash = '#item/' + id;
    });
    return card;
}

function renderSubThingDetail(subThing, thing, room, floor) {
    document.getElementById('stTitle').textContent = subThing.name || 'Item';

    // Meta line: Floor › Room › Thing · #tag1 #tag2
    var meta     = document.getElementById('stMeta');
    var tagsText = (subThing.tags || []).map(function(t) { return '#' + t; }).join(' ');
    meta.textContent =
        (floor.name || '') + ' \u203a ' +
        (room.name  || '') + ' \u203a ' +
        (thing.name || '') +
        (tagsText ? ' \u00b7 ' + tagsText : '');

    // Breadcrumb: House › Floor › Room › Thing › Item
    buildHouseBreadcrumb([
        { label: 'House',                  hash: '#house' },
        { label: floor.name || 'Floor',    hash: floor.id  ? '#floor/' + floor.id  : null },
        { label: room.name  || 'Room',     hash: room.id   ? '#room/'  + room.id   : null },
        { label: thing.name || 'Thing',    hash: thing.id  ? '#thing/' + thing.id  : null },
        { label: subThing.name || 'Item',  hash: null }
    ]);

    // Details card
    renderInventoryDetails(subThing, 'stDetailsSection');
    _renderBeneficiaryRow('stGoesToRow', subThing, [
        { entity: thing, label: thing.name || 'Thing' }
    ]);

    // Items list (fourth level)
    loadItemsList(subThing.id);

    // All cross-entity feature sections
    loadProblems(  'subthing', subThing.id, 'stProblemsContainer', 'stProblemsEmptyState')
        .then(function() { _setDetailAccCount('stProblemsAccCount', 'stProblemsContainer'); });
    loadFacts(     'subthing', subThing.id, 'stFactsContainer',    'stFactsEmptyState')
        .then(function() { _setDetailAccCount('stFactsAccCount', 'stFactsContainer'); });
    loadProjects(  'subthing', subThing.id, 'stProjectsContainer', 'stProjectsEmptyState')
        .then(function() { _setDetailAccCount('stTasksAccCount', 'stProjectsContainer'); });
    loadActivities('subthing', subThing.id, 'stActivityContainer', 'stActivityEmptyState')
        .then(function() { _setDetailAccCount('stActivityAccCount', 'stActivityContainer'); });
    loadPhotos(    'subthing', subThing.id, 'stPhotoContainer',    'stPhotoEmptyState')
        .then(function() { _setPhotoAccCount('stPhotosAccCount', 'subthing'); });

    if (typeof loadEventsForTarget === 'function') {
        var months = parseInt(document.getElementById('stCalendarRangeSelect').value, 10) || 3;
        loadEventsForTarget('subthing', subThing.id,
            'stCalendarEventsContainer', 'stCalendarEventsEmptyState', months)
            .then(function() { _setDetailAccCount('stCalendarAccCount', 'stCalendarEventsContainer'); });
    }
}

// ============================================================
// SUB-THING MODAL  (Add / Edit)
// ============================================================

function openSubThingModal(editId, data) {
    var modal     = document.getElementById('subThingModal');
    var nameInput = document.getElementById('stNameInput');
    var deleteBtn = document.getElementById('stModalDeleteBtn');

    if (editId) {
        document.getElementById('stModalTitle').textContent = 'Edit Item';
        nameInput.value                                      = data.name        || '';
        document.getElementById('stPricePaidInput').value   = data.pricePaid   || '';
        document.getElementById('stWorthInput').value       = data.worth       || '';
        document.getElementById('stYearBoughtInput').value  = data.yearBought  || '';
        document.getElementById('stDescriptionInput').value = data.description || '';
        document.getElementById('stCommentInput').value     = data.comment     || '';
        deleteBtn.style.display = '';
        modal.dataset.mode      = 'edit';
        modal.dataset.editId    = editId;
        // Show scan button in edit mode; reset result message
        document.getElementById('stScanRow').style.display    = 'block';
        document.getElementById('stScanResult').style.display = 'none';
    } else {
        document.getElementById('stModalTitle').textContent = 'Add Item';
        nameInput.value                                      = '';
        document.getElementById('stPricePaidInput').value   = '';
        document.getElementById('stWorthInput').value       = '';
        document.getElementById('stYearBoughtInput').value  = '';
        document.getElementById('stDescriptionInput').value = '';
        document.getElementById('stCommentInput').value     = '';
        deleteBtn.style.display = 'none';
        modal.dataset.mode      = 'add';
        modal.dataset.editId    = '';
        // Hide scan button — no ID yet for a new item
        document.getElementById('stScanRow').style.display  = 'none';
    }

    // Initialize tag state
    stSelectedTags = editId ? (data.tags || []).slice() : [];
    stRenderChips();
    document.getElementById('stTagInput').value = '';
    document.getElementById('stTagSuggestions').classList.add('hidden');

    // Load known tags from Firestore for autocomplete
    stLoadTags();

    // Show/hide From Picture only in add mode
    var stPicSection = document.getElementById('stFromPictureSection');
    if (editId) {
        stPicSection.classList.add('hidden');
    } else {
        stPicSection.classList.add('hidden');
        document.getElementById('stPicStatus').classList.add('hidden');
        document.getElementById('stPicStatus').textContent = '';
        document.getElementById('stPicInput').value = '';
        document.getElementById('stCamInput').value = '';
        houseCheckLlmForModal('stFromPictureSection');
    }

    buildContactPicker('stBenePicker', {
        placeholder: 'Search contacts\u2026',
        initialId:   editId ? (data.beneficiaryContactId || undefined) : undefined,
        initialName: editId ? (data.beneficiaryName      || undefined) : undefined
    });

    openModal('subThingModal');
    nameInput.focus();
}

document.getElementById('stModalSaveBtn').addEventListener('click', function() {
    var modal   = document.getElementById('subThingModal');
    var nameVal = document.getElementById('stNameInput').value.trim();

    if (!nameVal) { alert('Please enter a name.'); return; }

    var itemData = {
        name:                 nameVal,
        pricePaid:            document.getElementById('stPricePaidInput').value.trim()   || null,
        worth:                document.getElementById('stWorthInput').value.trim()       || null,
        yearBought:           document.getElementById('stYearBoughtInput').value.trim()  || null,
        description:          document.getElementById('stDescriptionInput').value.trim(),
        comment:              document.getElementById('stCommentInput').value.trim(),
        tags:                 stSelectedTags.slice(),
        beneficiaryContactId: document.getElementById('stBenePicker_id').value || null
    };

    var mode   = modal.dataset.mode;
    var editId = modal.dataset.editId;

    if (mode === 'edit' && editId) {
        userCol('subThings').doc(editId).update(itemData)
            .then(function() {
                closeModal('subThingModal');
                loadSubThingDetail(editId);
            })
            .catch(function(err) { console.error('Update subThing error:', err); });
    } else {
        if (!currentThing) { alert('No parent item selected.'); return; }
        itemData.thingId   = currentThing.id;
        itemData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        userCol('subThings').add(itemData)
            .then(function() {
                closeModal('subThingModal');
                loadSubThingsList(currentThing.id);
            })
            .catch(function(err) { console.error('Add subThing error:', err); });
    }
});

document.getElementById('stModalCancelBtn').addEventListener('click', function() {
    closeModal('subThingModal');
});

// Sub-thing modal — Scan barcode button (edit mode only)
document.getElementById('stModalScanBtn').addEventListener('click', function() {
    var editId = document.getElementById('subThingModal').dataset.editId;
    if (!editId) return;
    openBarcodeScanner(function(code) {
        saveBarcodeFacts('subthing', editId, code, 'stScanResult');
        // Reload facts list so the new facts appear immediately on the detail page
        loadFacts('subthing', editId,
            'subthingFactsContainer', 'subthingFactsEmpty');
    });
});

document.getElementById('stModalDeleteBtn').addEventListener('click', function() {
    var editId = document.getElementById('subThingModal').dataset.editId;
    if (!editId) return;
    // Guard: block delete if this subThing has items
    userCol('subThingItems').where('subThingId', '==', editId).limit(1).get()
        .then(function(snap) {
            if (!snap.empty) {
                alert('This sub-item has items. Delete all items first.');
                return;
            }
            if (!confirm('Delete this item? This cannot be undone.')) return;
            userCol('subThings').doc(editId).delete()
                .then(function() {
                    closeModal('subThingModal');
                    if (currentThing) {
                        window.location.hash = '#thing/' + currentThing.id;
                    } else {
                        window.location.hash = '#house';
                    }
                })
                .catch(function(err) { console.error('Delete subThing error:', err); });
        })
        .catch(function(err) { console.error('Delete subThing guard error:', err); });
});

// ============================================================
// TAG INPUT LOGIC
// ============================================================

function stLoadTags() {
    userCol('tags').get()
        .then(function(snap) {
            stAllTags = [];
            snap.forEach(function(d) {
                var n = d.data().name;
                if (n) stAllTags.push(n);
            });
            stAllTags.sort(function(a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
        })
        .catch(function(err) { console.error('stLoadTags error:', err); });
}

function stRenderChips() {
    var chipsEl = document.getElementById('stTagChips');
    chipsEl.innerHTML = '';
    stSelectedTags.forEach(function(tag) {
        var chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.innerHTML =
            escapeHtml(tag) +
            '<button class="tag-chip-remove" data-tag="' + escapeHtml(tag) + '" title="Remove">\u00d7</button>';
        chip.querySelector('.tag-chip-remove').addEventListener('click', function(e) {
            e.stopPropagation();
            stRemoveTag(this.dataset.tag);
        });
        chipsEl.appendChild(chip);
    });
}

function stRemoveTag(name) {
    stSelectedTags = stSelectedTags.filter(function(t) { return t !== name; });
    stRenderChips();
}

function stAddTag(name) {
    name = name.trim();
    if (!name) return;
    // Avoid duplicates (case-insensitive check)
    var lower = name.toLowerCase();
    if (stSelectedTags.some(function(t) { return t.toLowerCase() === lower; })) return;
    stSelectedTags.push(name);
    stRenderChips();
    // Persist new tag to Firestore if it doesn't exist yet
    var existsInAll = stAllTags.some(function(t) { return t.toLowerCase() === lower; });
    if (!existsInAll) {
        stAllTags.push(name);
        stAllTags.sort(function(a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
        userCol('tags').add({
            name:      name,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function(err) { console.error('stAddTag: error saving tag:', err); });
    }
}

function stUpdateSuggestions(query) {
    var sugEl = document.getElementById('stTagSuggestions');
    sugEl.innerHTML = '';

    var q = query.trim();
    if (!q) { sugEl.classList.add('hidden'); return; }

    var qLower   = q.toLowerCase();
    var selected = stSelectedTags.map(function(t) { return t.toLowerCase(); });

    // Filter existing tags matching the query that are not already selected
    var matches = stAllTags.filter(function(t) {
        return t.toLowerCase().indexOf(qLower) !== -1 &&
               selected.indexOf(t.toLowerCase()) === -1;
    });

    // Check if the exact query already exists as a tag
    var exactMatch = stAllTags.some(function(t) { return t.toLowerCase() === qLower; });

    var items = matches.map(function(t) { return { label: t, isNew: false }; });
    if (!exactMatch && selected.indexOf(qLower) === -1) {
        items.push({ label: q, isNew: true });
    }

    if (!items.length) { sugEl.classList.add('hidden'); return; }

    items.forEach(function(item) {
        var div = document.createElement('div');
        div.className = 'tag-suggestion-item' + (item.isNew ? ' tag-suggestion-new' : '');
        div.textContent = item.isNew ? '+ Add "' + item.label + '"' : item.label;
        div.addEventListener('mousedown', function(e) {
            e.preventDefault();  // Prevent input blur
            stAddTag(item.label);
            document.getElementById('stTagInput').value = '';
            stUpdateSuggestions('');
        });
        sugEl.appendChild(div);
    });

    sugEl.classList.remove('hidden');
}

// Wire up the tag text input events
document.getElementById('stTagInput').addEventListener('input', function() {
    stUpdateSuggestions(this.value);
});

document.getElementById('stTagInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        var val = this.value.trim().replace(/,$/, '');
        if (val) { stAddTag(val); this.value = ''; stUpdateSuggestions(''); }
    } else if (e.key === 'Backspace' && !this.value && stSelectedTags.length) {
        stRemoveTag(stSelectedTags[stSelectedTags.length - 1]);
    }
});

document.getElementById('stTagInput').addEventListener('blur', function() {
    setTimeout(function() {
        var sugEl = document.getElementById('stTagSuggestions');
        if (sugEl) sugEl.classList.add('hidden');
    }, 150);
});

// Focus the wrapper clicks into the input
document.getElementById('stTagWrapper').addEventListener('click', function() {
    document.getElementById('stTagInput').focus();
});

// ============================================================
// SUB-THING PAGE BUTTON WIRING
// ============================================================

// Thing detail — Add Sub-thing
document.getElementById('addSubThingBtn').addEventListener('click', function() {
    if (!currentThing) return;
    openSubThingModal(null, null);
});

// Thing detail — "+Photo" quick-add for sub-things — opens staging modal directly
document.getElementById('quickAddSubThingPhotoBtn').addEventListener('click', function() {
    houseQuickAddSubThingFromPhoto('quickAddSubThingPhotoBtn', 'quickSubThingCamInput');
});
// Legacy camera input kept wired for any remaining direct trigger path
document.getElementById('quickSubThingCamInput').addEventListener('change', function() {
    if (this.files && this.files.length > 0) {
        (async function(files) {
            var images = [];
            for (var i = 0; i < Math.min(files.length, 4); i++) {
                images.push(await compressImage(files[i]));
            }
            await _houseQuickSendToLlm(images, 'subthing', 'quickAddSubThingPhotoBtn', 'quickSubThingCamInput');
        })(this.files);
    }
});

// Sub-thing detail — Add Item
document.getElementById('addItemBtn').addEventListener('click', function() {
    if (!currentSubThing) return;
    openItemModal(null, null);
});

// Sub-thing detail — "+Photo" quick-add for items — opens staging modal directly
document.getElementById('quickAddItemPhotoBtn').addEventListener('click', function() {
    houseQuickAddItemFromPhoto('quickAddItemPhotoBtn', 'quickItemCamInput');
});
// Legacy camera input kept wired for any remaining direct trigger path
document.getElementById('quickItemCamInput').addEventListener('change', function() {
    if (this.files && this.files.length > 0) {
        (async function(files) {
            var images = [];
            for (var i = 0; i < Math.min(files.length, 4); i++) {
                images.push(await compressImage(files[i]));
            }
            await _houseQuickSendToLlm(images, 'item', 'quickAddItemPhotoBtn', 'quickItemCamInput');
        })(this.files);
    }
});

// Sub-thing detail — Edit
document.getElementById('editStBtn').addEventListener('click', function() {
    if (!currentSubThing) return;
    openSubThingModal(currentSubThing.id, currentSubThing);
});

// ---- Move Sub-Thing ----

// Cache for move modal (things + room/floor context)
var stMoveAllThings = null; // loaded once per modal open

/**
 * Open the Move Sub-Thing modal.
 * Loads all things with room/floor labels, renders the full list, wires search.
 */
function openStMoveModal() {
    document.getElementById('stMoveSearchInput').value = '';
    openModal('stMoveModal');

    // Load things + rooms + floors in parallel (or reuse if already cached)
    Promise.all([
        userCol('things').orderBy('name').get(),
        userCol('rooms').get(),
        userCol('floors').get()
    ]).then(function(results) {
        var thingsSnap = results[0];
        var roomsSnap  = results[1];
        var floorsSnap = results[2];

        // Build lookup maps
        var roomMap  = {};
        var floorMap = {};
        floorsSnap.forEach(function(d) { floorMap[d.id] = d.data().name || 'Floor'; });
        roomsSnap.forEach(function(d) {
            var r = d.data();
            roomMap[d.id] = {
                name  : r.name || 'Room',
                floor : floorMap[r.floorId] || ''
            };
        });

        stMoveAllThings = [];
        thingsSnap.forEach(function(d) {
            var t    = Object.assign({ id: d.id }, d.data());
            var room = roomMap[t.roomId];
            t._label = room ? (room.name + (room.floor ? ' / ' + room.floor : '')) : '';
            stMoveAllThings.push(t);
        });

        stMoveRenderList('');
    }).catch(function(err) {
        document.getElementById('stMoveEmptyState').textContent = 'Error loading things: ' + err.message;
    });
}

/**
 * Render the things list in the move modal, filtered by query string.
 */
function stMoveRenderList(query) {
    var list     = document.getElementById('stMoveResultsList');
    var empty    = document.getElementById('stMoveEmptyState');
    var q        = query.trim().toLowerCase();
    var filtered = (stMoveAllThings || []).filter(function(t) {
        // Exclude the current parent thing
        if (currentSubThing && t.id === currentSubThing.thingId) return false;
        return !q || t.name.toLowerCase().includes(q);
    });

    list.innerHTML = '';
    if (filtered.length === 0) {
        empty.style.display = 'block';
        empty.textContent   = q ? 'No things match "' + query + '"' : 'No things found';
        return;
    }
    empty.style.display = 'none';

    filtered.forEach(function(t) {
        var item = document.createElement('div');
        item.style.cssText = 'padding:10px 14px;cursor:pointer;border-bottom:1px solid #f0f0f0;';
        item.innerHTML =
            '<div style="font-weight:600;">' + escapeHtml(t.name) + '</div>' +
            (t._label ? '<div style="font-size:0.82rem;color:#777;">' + escapeHtml(t._label) + '</div>' : '');
        item.addEventListener('mouseover',  function() { item.style.background = '#f5f5f5'; });
        item.addEventListener('mouseout',   function() { item.style.background = ''; });
        item.addEventListener('click', function() { stMoveConfirm(t); });
        list.appendChild(item);
    });
}

/**
 * User selected a target thing — confirm and update Firestore.
 */
function stMoveConfirm(targetThing) {
    if (!currentSubThing) return;
    var stName = currentSubThing.name || 'this item';
    if (!confirm('Move "' + stName + '" to "' + targetThing.name + '"?')) return;

    userCol('subThings').doc(currentSubThing.id)
        .update({ thingId: targetThing.id })
        .then(function() {
            closeModal('stMoveModal');
            // Update local state and reload the page so breadcrumb/meta refresh
            currentSubThing.thingId = targetThing.id;
            window.location.hash = '#subthing/' + currentSubThing.id;
        })
        .catch(function(err) {
            alert('Move failed: ' + err.message);
        });
}

document.getElementById('moveStBtn').addEventListener('click', function() {
    if (!currentSubThing) return;
    stMoveAllThings = null; // force fresh load each time
    openStMoveModal();
});

document.getElementById('stMoveCancelBtn').addEventListener('click', function() {
    closeModal('stMoveModal');
});

document.getElementById('stMoveSearchInput').addEventListener('input', function() {
    stMoveRenderList(this.value);
});

// Sub-thing detail — Delete (guarded: blocked if items exist)
document.getElementById('deleteStBtn').addEventListener('click', function() {
    if (!currentSubThing) return;
    userCol('subThingItems').where('subThingId', '==', currentSubThing.id).limit(1).get()
        .then(function(snap) {
            if (!snap.empty) {
                alert('This sub-item has items. Delete all items first.');
                return;
            }
            if (!confirm('Delete "' + (currentSubThing.name || 'this item') + '"? This cannot be undone.')) return;
            userCol('subThings').doc(currentSubThing.id).delete()
                .then(function() {
                    if (currentThing) {
                        window.location.hash = '#thing/' + currentThing.id;
                    } else {
                        window.location.hash = '#house';
                    }
                })
                .catch(function(err) { console.error('Delete subThing error:', err); });
        })
        .catch(function(err) { console.error('Delete subThing guard error:', err); });
});

// Sub-thing feature section buttons
document.getElementById('addStProblemBtn').addEventListener('click', function() {
    if (currentSubThing) openAddProblemModal('subthing', currentSubThing.id);
});

document.getElementById('addStFactBtn').addEventListener('click', function() {
    if (currentSubThing) openAddFactModal('subthing', currentSubThing.id);
});

document.getElementById('addStProjectBtn').addEventListener('click', function() {
    if (currentSubThing) openAddProjectModal('subthing', currentSubThing.id);
});

document.getElementById('logStActivityBtn').addEventListener('click', function() {
    if (currentSubThing) openLogActivityModal('subthing', currentSubThing.id);
});

document.getElementById('addStCameraBtn').addEventListener('click', function() {
    if (currentSubThing) triggerCameraUpload('subthing', currentSubThing.id);
});
document.getElementById('addStGalleryBtn').addEventListener('click', function() {
    if (currentSubThing) triggerGalleryUpload('subthing', currentSubThing.id);
});

document.getElementById('addStCalendarEventBtn').addEventListener('click', function() {
    if (currentSubThing && typeof openAddCalendarEventModal === 'function') {
        var reloadFn = function() {
            var months = parseInt(document.getElementById('stCalendarRangeSelect').value, 10) || 3;
            loadEventsForTarget('subthing', currentSubThing.id,
                'stCalendarEventsContainer', 'stCalendarEventsEmptyState', months);
        };
        openAddCalendarEventModal('subthing', currentSubThing.id, reloadFn);
    }
});

document.getElementById('stCalendarRangeSelect').addEventListener('change', function() {
    if (currentSubThing && typeof loadEventsForTarget === 'function') {
        var months = parseInt(this.value, 10) || 3;
        loadEventsForTarget('subthing', currentSubThing.id,
            'stCalendarEventsContainer', 'stCalendarEventsEmptyState', months);
    }
});

// ============================================================

/**
 * Generate a random UUID v4 string.
 * Used to assign a stable, unique id to each breaker entry
 * so that problems.js can link problems to individual breakers.
 * @returns {string}
 */
function bpUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

// ============================================================
// THINGS GLOBAL SEARCH PAGE  (#things)
// Searchable list of all Things and Sub-Things in the house.
// Data loads lazily; cached in memory for the session.
// ============================================================

/**
 * Entry point — called by handleRoute() when navigating to #things.
 * Resets UI state (but keeps in-memory cache), wires event listeners once,
 * and eagerly loads the tags collection for the tag chips row.
 */
function loadThingsPage() {
    buildHouseBreadcrumb([
        { label: 'House', hash: '#house' },
        { label: 'Things', hash: null }
    ]);

    // Reset active filters (keep memory cache for fast repeat visits)
    thingsActiveCategory = null;
    thingsActiveTag      = null;

    // Reset UI
    document.getElementById('thingsSearchInput').value = '';
    document.getElementById('thingsSubthingsToggle').checked = false;
    document.getElementById('thingsEmptyState').textContent =
        'Search by name, click a category or tag, or click All to see everything.';
    document.getElementById('thingsEmptyState').classList.remove('hidden');
    document.getElementById('thingsResultsContainer').classList.add('hidden');
    document.getElementById('thingsResultsContainer').innerHTML = '';
    document.getElementById('thingsCategoriesSection').classList.add('hidden');
    document.getElementById('thingsTagsSection').classList.add('hidden');
    document.getElementById('thingsLoadingState').classList.add('hidden');

    // Wire event listeners only once (guard with a data attribute)
    var searchInput = document.getElementById('thingsSearchInput');
    var allBtn      = document.getElementById('thingsAllBtn');
    var toggle      = document.getElementById('thingsSubthingsToggle');

    if (!searchInput.dataset.wired) {
        searchInput.dataset.wired = '1';

        // Debounced text search — fires 300ms after the user stops typing
        var searchTimer = null;
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(thingsHandleSearch, 300);
        });

        allBtn.addEventListener('click', thingsHandleAll);
        toggle.addEventListener('change', thingsHandleToggle);
    }

    // Load tags eagerly on every visit (small collection, used for chips)
    thingsLoadTags();
}

// ---- Tags ----

/**
 * Fetch the tags collection and populate the tag chips row.
 * Caches results in thingsTagsCache.
 */
function thingsLoadTags() {
    userCol('tags').orderBy('name', 'asc').get()
        .then(function(snap) {
            thingsTagsCache = [];
            snap.forEach(function(doc) {
                thingsTagsCache.push({ id: doc.id, name: doc.data().name || '' });
            });
            // Show category chips now that we have data context ready
            thingsRenderCategoryChips();
            thingsRenderTagChips(thingsTagsCache);
        })
        .catch(function(err) {
            console.error('thingsLoadTags error:', err);
        });
}

// ---- Chip renderers ----

/**
 * Build and mount clickable category chips from THING_CATEGORIES.
 * Shows the categories section.
 */
function thingsRenderCategoryChips() {
    var container = document.getElementById('thingsCategoryChips');
    container.innerHTML = '';

    Object.keys(THING_CATEGORIES).forEach(function(key) {
        var chip = document.createElement('button');
        chip.className = 'things-chip' +
            (thingsActiveCategory === key ? ' things-chip--active' : '');
        chip.textContent = THING_CATEGORIES[key];
        chip.dataset.category = key;
        chip.addEventListener('click', function() {
            thingsHandleCategoryChip(key);
        });
        container.appendChild(chip);
    });

    document.getElementById('thingsCategoriesSection').classList.remove('hidden');
}

/**
 * Build and mount clickable tag chips from the supplied tag list.
 * @param {Array<{id:string, name:string}>} tags
 */
function thingsRenderTagChips(tags) {
    var container = document.getElementById('thingsTagChips');
    container.innerHTML = '';

    tags.forEach(function(tag) {
        var chip = document.createElement('button');
        chip.className = 'things-chip things-chip--tag' +
            (thingsActiveTag === tag.name ? ' things-chip--active' : '');
        chip.textContent = tag.name;
        chip.addEventListener('click', function() {
            thingsHandleTagChip(tag.name);
        });
        container.appendChild(chip);
    });
    // Visibility of the tags section is controlled by the toggle, not here
}

// ---- Lazy data loading ----

/**
 * Ensure things, rooms, and floors are loaded into thingsCache.
 * If includeSubThings is true and subThings haven't been fetched yet, fetch them too.
 * Returns a Promise that resolves when the cache is ready.
 * @param {boolean} includeSubThings
 * @returns {Promise}
 */
function thingsEnsureDataLoaded(includeSubThings) {
    var needsThings    = !thingsCache;
    var needsSubThings = includeSubThings && (!thingsCache || thingsCache.subThings === null);

    if (!needsThings && !needsSubThings) {
        return Promise.resolve();
    }

    document.getElementById('thingsLoadingState').classList.remove('hidden');
    document.getElementById('thingsEmptyState').classList.add('hidden');

    var promises = [];
    if (needsThings) {
        // Fetch things + room + floor lookup maps in parallel
        promises.push(
            userCol('things').get(),
            userCol('rooms').get(),
            userCol('floors').get()
        );
    }
    if (needsSubThings) {
        promises.push(userCol('subThings').get());
    }

    return Promise.all(promises).then(function(results) {
        var idx = 0;

        if (needsThings) {
            var thingsSnap = results[idx++];
            var roomsSnap  = results[idx++];
            var floorsSnap = results[idx++];

            var things = [];
            var rooms  = {};
            var floors = {};

            thingsSnap.forEach(function(doc) {
                things.push(Object.assign({ id: doc.id }, doc.data()));
            });
            roomsSnap.forEach(function(doc) {
                rooms[doc.id] = Object.assign({ id: doc.id }, doc.data());
            });
            floorsSnap.forEach(function(doc) {
                floors[doc.id] = Object.assign({ id: doc.id }, doc.data());
            });

            thingsCache = {
                things:    things,
                subThings: null,   // Loaded separately when needed
                rooms:     rooms,
                floors:    floors
            };
        }

        if (needsSubThings) {
            var stSnap     = results[idx++];
            var subThings  = [];
            stSnap.forEach(function(doc) {
                subThings.push(Object.assign({ id: doc.id }, doc.data()));
            });
            thingsCache.subThings = subThings;
        }

        document.getElementById('thingsLoadingState').classList.add('hidden');
    }).catch(function(err) {
        console.error('thingsEnsureDataLoaded error:', err);
        document.getElementById('thingsLoadingState').classList.add('hidden');
        throw err;
    });
}

// ---- Event handlers ----

/** Handle text input (debounced). */
function thingsHandleSearch() {
    var query = document.getElementById('thingsSearchInput').value.trim();
    if (!query) return;   // Don't auto-load on empty — wait for explicit input

    // Searching clears active category/tag filters
    thingsActiveCategory = null;
    thingsActiveTag      = null;
    thingsRenderCategoryChips();
    if (thingsTagsCache) thingsRenderTagChips(thingsTagsCache);

    var includeSubs = document.getElementById('thingsSubthingsToggle').checked;
    thingsEnsureDataLoaded(includeSubs).then(function() {
        thingsApplyFilters();
    });
}

/** Handle "All" button click — clears filters and shows everything. */
function thingsHandleAll() {
    document.getElementById('thingsSearchInput').value = '';
    thingsActiveCategory = null;
    thingsActiveTag      = null;
    thingsRenderCategoryChips();
    if (thingsTagsCache) thingsRenderTagChips(thingsTagsCache);

    var includeSubs = document.getElementById('thingsSubthingsToggle').checked;
    thingsEnsureDataLoaded(includeSubs).then(function() {
        thingsApplyFilters();
    });
}

/**
 * Handle a category chip click.
 * Clicking the active category deselects it (toggle behavior).
 * @param {string} key  - Category key from THING_CATEGORIES
 */
function thingsHandleCategoryChip(key) {
    document.getElementById('thingsSearchInput').value = '';
    thingsActiveTag = null;

    // Toggle: clicking the already-active chip deselects it
    thingsActiveCategory = (thingsActiveCategory === key) ? null : key;
    thingsRenderCategoryChips();

    var includeSubs = document.getElementById('thingsSubthingsToggle').checked;
    thingsEnsureDataLoaded(includeSubs).then(function() {
        thingsApplyFilters();
        // Narrow tag chips to only those relevant to the selected category
        if (thingsActiveCategory && includeSubs) {
            thingsNarrowTagChips();
        } else if (thingsTagsCache) {
            thingsRenderTagChips(thingsTagsCache);  // Restore full tag list
        }
    });
}

/**
 * Handle a tag chip click.
 * Clicking the active tag deselects it (toggle behavior).
 * @param {string} tagName
 */
function thingsHandleTagChip(tagName) {
    document.getElementById('thingsSearchInput').value = '';

    // Toggle: clicking the already-active chip deselects it
    thingsActiveTag = (thingsActiveTag === tagName) ? null : tagName;
    if (thingsTagsCache) thingsRenderTagChips(thingsTagsCache);  // Re-render to show active state

    var includeSubs = document.getElementById('thingsSubthingsToggle').checked;
    if (!includeSubs) return;  // Tags only apply when sub-things are shown

    thingsEnsureDataLoaded(true).then(function() {
        thingsApplyFilters();
    });
}

/** Handle "Show Sub-things" toggle change. */
function thingsHandleToggle() {
    var on          = document.getElementById('thingsSubthingsToggle').checked;
    var tagsSection = document.getElementById('thingsTagsSection');

    if (on) {
        tagsSection.classList.remove('hidden');
        // Always load sub-things and reapply filters immediately.
        // If no filter is active this is equivalent to clicking "All" — every
        // thing and sub-thing will be shown.
        thingsEnsureDataLoaded(true).then(function() {
            thingsApplyFilters();
            if (thingsActiveCategory) thingsNarrowTagChips();
        });
    } else {
        tagsSection.classList.add('hidden');
        thingsActiveTag = null;
        if (thingsTagsCache) thingsRenderTagChips(thingsTagsCache);
        // Refilter to remove sub-things from whatever is currently showing
        if (!document.getElementById('thingsResultsContainer').classList.contains('hidden')) {
            thingsApplyFilters();
        }
    }
}

// ---- Tag narrowing ----

/**
 * When a category is active and sub-things are shown, narrow the tag chips
 * to only those tags that appear on sub-things whose parent thing is in
 * the filtered category. Falls back to the full tag list if data isn't ready.
 */
function thingsNarrowTagChips() {
    if (!thingsCache || !thingsCache.subThings || !thingsActiveCategory || !thingsTagsCache) return;

    // Collect IDs of things in the active category
    var thingIds = {};
    thingsCache.things.forEach(function(t) {
        if (t.category === thingsActiveCategory) thingIds[t.id] = true;
    });

    // Collect tag names used by sub-things that belong to those things
    var tagSet = {};
    thingsCache.subThings.forEach(function(st) {
        if (thingIds[st.thingId] && Array.isArray(st.tags)) {
            st.tags.forEach(function(tag) { tagSet[tag] = true; });
        }
    });

    var narrowed = thingsTagsCache.filter(function(t) { return tagSet[t.name]; });
    thingsRenderTagChips(narrowed.length > 0 ? narrowed : thingsTagsCache);
}

// ---- Filtering ----

/**
 * Core client-side filter — runs after data is in thingsCache.
 * Applies text / category / tag filters and calls thingsRenderResults().
 */
function thingsApplyFilters() {
    if (!thingsCache) return;

    var query       = document.getElementById('thingsSearchInput').value.trim().toLowerCase();
    var includeSubs = document.getElementById('thingsSubthingsToggle').checked;

    var filteredThings    = thingsCache.things.slice();
    var filteredSubThings = [];

    // ---- Filter Things ----
    if (query) {
        filteredThings = filteredThings.filter(function(t) {
            return t.name && t.name.toLowerCase().includes(query);
        });
    } else if (thingsActiveCategory) {
        filteredThings = filteredThings.filter(function(t) {
            return t.category === thingsActiveCategory;
        });
    } else if (thingsActiveTag) {
        // Tag filter targets sub-things only (things have no tags).
        // Hide the things list so only tag-matched sub-things are shown.
        filteredThings = [];
    }
    // No filter = "All" — show every thing

    // ---- Filter Sub-Things ----
    if (includeSubs && thingsCache.subThings) {
        // Build a set of filtered thing IDs for optional category scoping
        var filteredThingIdSet = {};
        filteredThings.forEach(function(t) { filteredThingIdSet[t.id] = true; });

        filteredSubThings = thingsCache.subThings.slice();

        if (query) {
            // Text search: match sub-thing name
            filteredSubThings = filteredSubThings.filter(function(st) {
                return st.name && st.name.toLowerCase().includes(query);
            });
        } else if (thingsActiveTag) {
            // Tag filter: sub-things must have the tag
            filteredSubThings = filteredSubThings.filter(function(st) {
                return Array.isArray(st.tags) && st.tags.indexOf(thingsActiveTag) !== -1;
            });
            // If a category is also active, scope to sub-things of those things
            if (thingsActiveCategory) {
                filteredSubThings = filteredSubThings.filter(function(st) {
                    return filteredThingIdSet[st.thingId];
                });
            }
        } else if (thingsActiveCategory) {
            // Category active but no tag: show sub-things of filtered things
            filteredSubThings = filteredSubThings.filter(function(st) {
                return filteredThingIdSet[st.thingId];
            });
        }
        // "All" with toggle on: all sub-things shown
    }

    thingsRenderResults(filteredThings, filteredSubThings);
}

// ---- Result rendering ----

/**
 * Render the filtered result list into #thingsResultsContainer.
 * @param {Array} things
 * @param {Array} subThings
 */
function thingsRenderResults(things, subThings) {
    var container  = document.getElementById('thingsResultsContainer');
    var emptyState = document.getElementById('thingsEmptyState');
    container.innerHTML = '';

    var total = things.length + subThings.length;

    if (total === 0) {
        container.classList.add('hidden');
        emptyState.textContent = 'No results found.';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    container.classList.remove('hidden');

    // Lookup map: thingId → thing (for sub-thing parent labels)
    var thingById = {};
    (thingsCache.things || []).forEach(function(t) { thingById[t.id] = t; });

    // Render Things first
    things.forEach(function(thing) {
        container.appendChild(thingsBuildResultItem(thing, false, thingById));
    });

    // Render Sub-Things below
    subThings.forEach(function(st) {
        container.appendChild(thingsBuildResultItem(st, true, thingById));
    });
}

/**
 * Build one result card DOM element.
 * @param {Object}  item        - thing or sub-thing data object
 * @param {boolean} isSubThing
 * @param {Object}  thingById   - lookup map of thingId → thing
 * @returns {HTMLElement}
 */
function thingsBuildResultItem(item, isSubThing, thingById) {
    var card = document.createElement('div');
    card.className = 'card card--clickable things-result-item';

    var nameHtml    = '<span class="things-result-name">' + escapeHtml(item.name || 'Unnamed') + '</span>';
    var contextHtml = '';

    if (isSubThing) {
        // Sub-thing: show parent thing name + tag badges
        var parentThing = thingById[item.thingId];
        var parentName  = parentThing ? escapeHtml(parentThing.name) : 'Unknown';
        contextHtml = '<span class="things-result-context">Sub-thing of: ' + parentName + '</span>';

        if (Array.isArray(item.tags) && item.tags.length) {
            var tagBadges = item.tags.map(function(t) {
                return '<span class="things-tag-badge">' + escapeHtml(t) + '</span>';
            }).join('');
            contextHtml += '<span class="things-tag-badges">' + tagBadges + '</span>';
        }
    } else {
        // Thing: show room / floor location + category badge
        var room      = thingsCache.rooms[item.roomId];
        var floor     = room ? thingsCache.floors[room.floorId] : null;
        var roomName  = room  ? escapeHtml(room.name)  : '';
        var floorName = floor ? escapeHtml(floor.name) : '';

        if (roomName && floorName) {
            contextHtml = '<span class="things-result-context">' +
                roomName + ' / ' + floorName + '</span>';
        } else if (roomName) {
            contextHtml = '<span class="things-result-context">' + roomName + '</span>';
        }

        if (item.category && THING_CATEGORIES[item.category]) {
            contextHtml += ' <span class="things-category-badge">' +
                escapeHtml(THING_CATEGORIES[item.category]) + '</span>';
        }
    }

    card.innerHTML =
        '<div class="card-main">' + nameHtml + contextHtml + '</div>' +
        '<span class="card-arrow">\u203a</span>';

    card.addEventListener('click', function() {
        window.location.hash = isSubThing ? '#subthing/' + item.id : '#thing/' + item.id;
    });

    return card;
}

// ============================================================
// THING / SUB-THING — IDENTIFICATION FROM PICTURE
// ============================================================

var THING_ID_PROMPT = [
    'You are a household item identification assistant. Analyze the provided image(s) and return ONLY a valid JSON object.',
    'No explanation, no markdown, no code blocks, no extra text of any kind.',
    'Your entire response must be parseable by JSON.parse().',
    '',
    'Return this exact structure:',
    '{',
    '  "name": "",',
    '  "description": "",',
    '  "worth": "",',
    '  "additionalMessage": ""',
    '}',
    '',
    'Field rules:',
    '- name: a concise descriptive name, e.g. "Samsung 65-inch QLED TV", "Queen Sleigh Bed Frame", "KitchenAid Stand Mixer"',
    '- description: what it is, approximate age/condition if visible, notable features. 100 words or less.',
    '- worth: your best estimate of current used market value in US dollars as a plain number with no symbols (e.g. "250"). Leave "" if you truly cannot estimate.',
    '- additionalMessage: use for issues such as unclear image or item not recognized. Leave "" if no issues.',
    '',
    'If you cannot identify the item at all, return all fields as "" and explain in additionalMessage.'
].join('\n');

// Pending data while the review modal is open
var houseLlmPending = null;  // { parsed, images, targetType ('thing'|'subthing') }

/**
 * Check if an LLM is configured and show the From Picture section if so.
 * @param {string} sectionId - the element ID of the From Picture section to show
 */
async function houseCheckLlmForModal(sectionId) {
    try {
        var doc = await userCol('settings').doc('llm').get();
        var ok  = doc.exists && doc.data().provider && doc.data().apiKey;
        document.getElementById(sectionId).classList.toggle('hidden', !ok);
    } catch (e) { /* leave hidden */ }
}

/**
 * Legacy handler: compress selected images from in-modal inputs, then send to LLM.
 * The gallery/camera buttons now open the staging flow instead.
 * @param {FileList} files
 * @param {string}   targetType  'thing' or 'subthing'
 */
async function houseHandleFromPicture(files, targetType) {
    if (!files || files.length === 0) return;

    var isThing    = targetType === 'thing';
    var statusEl   = document.getElementById(isThing ? 'thingPicStatus'    : 'stPicStatus');
    var saveBtn    = document.getElementById(isThing ? 'thingModalSaveBtn' : 'stModalSaveBtn');
    var galleryBtn = document.getElementById(isThing ? 'thingPicGalleryBtn': 'stPicGalleryBtn');
    var cameraBtn  = document.getElementById(isThing ? 'thingPicCameraBtn' : 'stPicCameraBtn');

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
        await houseSendToLlm(images, targetType);
    } catch (err) {
        console.error('House item ID error:', err);
        statusEl.textContent = 'Error: ' + err.message;
    } finally {
        saveBtn.disabled    = false;
        galleryBtn.disabled = false;
        cameraBtn.disabled  = false;
        document.getElementById(isThing ? 'thingPicInput' : 'stPicInput').value = '';
        document.getElementById(isThing ? 'thingCamInput' : 'stCamInput').value = '';
    }
}

/**
 * Send already-compressed base64 images to the LLM for Thing/SubThing identification.
 * Called from both the in-modal flow and the staging (+Photo) flow.
 * @param {string[]} images     - Array of base64 data URL strings (already compressed)
 * @param {string}   targetType - 'thing' or 'subthing'
 */
async function houseSendToLlm(images, targetType) {
    var isThing    = targetType === 'thing';
    var statusEl   = document.getElementById(isThing ? 'thingPicStatus'    : 'stPicStatus');
    var saveBtn    = document.getElementById(isThing ? 'thingModalSaveBtn' : 'stModalSaveBtn');
    var galleryBtn = document.getElementById(isThing ? 'thingPicGalleryBtn': 'stPicGalleryBtn');
    var cameraBtn  = document.getElementById(isThing ? 'thingPicCameraBtn' : 'stPicCameraBtn');
    var toggleEl   = document.getElementById(isThing ? 'thingShowResponseToggle' : 'stShowResponseToggle');
    var modalId    = isThing ? 'thingModal' : 'subThingModal';
    var modalEl    = document.getElementById(modalId);
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

        // Build prompt — append personal comment if the user filled it in
        var commentInput = document.getElementById(isThing ? 'thingCommentInput' : 'stCommentInput');
        var comment      = commentInput ? commentInput.value.trim() : '';
        var prompt       = comment
            ? THING_ID_PROMPT + '\n\nAdditional context from the owner: ' + comment
            : THING_ID_PROMPT;

        // Build content: prompt + already-compressed images
        var content = [{ type: 'text', text: prompt }];
        images.forEach(function(url) {
            content.push({ type: 'image_url', image_url: { url: url } });
        });

        var activeModel  = cfg.model || llm.model;
        var responseText = await chatCallOpenAICompat(llm, cfg.apiKey, content, activeModel);
        var parsed       = houseParseLlmResponse(responseText);

        if (modalOpen && toggleEl && toggleEl.checked) {
            houseLlmPending = { parsed: parsed, images: images, targetType: targetType };
            if (statusEl) { statusEl.textContent = ''; statusEl.classList.add('hidden'); }
            closeModal(modalId);
            houseShowReviewModal(prompt, responseText, parsed);
        } else {
            if (!parsed.name && parsed.additionalMessage) {
                if (modalOpen && statusEl) {
                    statusEl.textContent = '\u26a0 ' + parsed.additionalMessage;
                } else {
                    alert('\u26a0 ' + parsed.additionalMessage);
                }
                return;
            }
            await houseSaveFromLlm(parsed, images, targetType, '');
            if (modalOpen && statusEl) { statusEl.textContent = ''; statusEl.classList.add('hidden'); }
            closeModal(modalId);
            if (isThing && currentRoom)   loadThingsList(currentRoom.id);
            if (!isThing && currentThing) loadSubThingsList(currentThing.id);
        }

    } catch (err) {
        console.error('House item ID error:', err);
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
            var picIn = document.getElementById(isThing ? 'thingPicInput' : 'stPicInput');
            var camIn = document.getElementById(isThing ? 'thingCamInput' : 'stCamInput');
            if (picIn) picIn.value = '';
            if (camIn) camIn.value = '';
        }
    }
}

/**
 * Parse the LLM's JSON response, stripping accidental markdown fences.
 */
function houseParseLlmResponse(text) {
    try {
        var clean = text.trim()
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/,      '')
            .replace(/```\s*$/,      '');
        return JSON.parse(clean);
    } catch (e) {
        return {
            name: '', description: '', worth: '',
            additionalMessage: 'Could not parse response: ' + text.substring(0, 120)
        };
    }
}

/**
 * Show the review modal with prompt, raw response, and parsed fields.
 */
function houseShowReviewModal(prompt, rawResponse, parsed) {
    document.getElementById('thingReviewPromptText').textContent   = prompt;
    document.getElementById('thingReviewResponseText').textContent = rawResponse;
    document.getElementById('thingReviewName').value               = parsed.name || '';
    document.getElementById('reviewThingDescription').textContent  = parsed.description || '—';
    document.getElementById('reviewThingWorth').textContent        = parsed.worth ? ('$' + parsed.worth) : '—';

    var msgEl = document.getElementById('thingReviewMessage');
    if (parsed.additionalMessage) {
        msgEl.textContent = '\u26a0 ' + parsed.additionalMessage;
        msgEl.classList.remove('hidden');
    } else {
        msgEl.classList.add('hidden');
    }

    openModal('thingLlmReviewModal');
}

/**
 * Save the item and photos from the LLM response.
 * @param {object} parsed       - parsed LLM JSON
 * @param {string[]} images     - compressed base64 data URLs
 * @param {string} targetType   - 'thing' or 'subthing'
 * @param {string} nameOverride - name typed by user in review modal (may be '')
 */
async function houseSaveFromLlm(parsed, images, targetType, nameOverride) {
    var isThing   = targetType === 'thing';
    var itemName  = (nameOverride || parsed.name || 'Unknown Item').trim();
    var itemData  = {
        name        : itemName,
        description : parsed.description || '',
        worth       : parsed.worth       || null,
        createdAt   : firebase.firestore.FieldValue.serverTimestamp()
    };

    var newRef;
    if (isThing) {
        if (!currentRoom) throw new Error('No room selected.');
        itemData.category = document.getElementById('thingCategorySelect').value || 'other';
        itemData.roomId   = currentRoom.id;
        newRef = await userCol('things').add(itemData);
    } else if (targetType === 'item') {
        if (!currentSubThing) throw new Error('No parent sub-item selected.');
        itemData.subThingId = currentSubThing.id;
        itemData.tags       = [];
        newRef = await userCol('subThingItems').add(itemData);
    } else {
        if (!currentThing) throw new Error('No parent item selected.');
        itemData.thingId = currentThing.id;
        itemData.tags    = [];
        newRef = await userCol('subThings').add(itemData);
    }

    // Save photos only when identification produced a name
    var identified = !!(parsed.name || nameOverride);
    if (identified) {
        var photoTargetType = isThing ? 'thing' : (targetType === 'item' ? 'item' : 'subthing');
        for (var i = 0; i < images.length; i++) {
            await userCol('photos').add({
                targetType : photoTargetType,
                targetId   : newRef.id,
                imageData  : images[i],
                caption    : '',
                createdAt  : firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        // Auto-set thumbnail from the first photo
        if (images.length > 0 && typeof _compressToThumb === 'function') {
            try {
                var thumbData = await _compressToThumb(images[0]);
                var thumbCol = isThing ? 'things' : (targetType === 'item' ? 'subThingItems' : 'subThings');
                await userCol(thumbCol).doc(newRef.id).update({ profilePhotoData: thumbData });
            } catch (thumbErr) {
                console.warn('Could not auto-set house item thumbnail:', thumbErr);
            }
        }
    }

    return newRef.id;
}

// ---------- Quick-Add Thing from Photo ----------

/**
 * Quick-add a house thing from the "+Photo" button on the room detail page.
 * Opens the shared staging modal; sends staged images to LLM; saves directly.
 * @param {string} btnId   - button element ID (unused now, kept for signature compat)
 * @param {string} inputId - camera input element ID (unused now, kept for compat)
 */
function houseQuickAddThingFromPhoto(btnId, inputId) {
    openLlmPhotoStaging('Identify Item', function(images) {
        _houseQuickSendToLlm(images, 'thing', btnId, inputId);
    });
}

/**
 * Quick-add a house sub-thing from the "+Photo" button on a thing detail page.
 * Opens the shared staging modal; sends staged images to LLM; saves directly.
 * @param {string} btnId   - button element ID (unused now, kept for signature compat)
 * @param {string} inputId - camera input element ID (unused now, kept for compat)
 */
function houseQuickAddSubThingFromPhoto(btnId, inputId) {
    openLlmPhotoStaging('Identify Item', function(images) {
        _houseQuickSendToLlm(images, 'subthing', btnId, inputId);
    });
}

/**
 * Quick-add a house item from the "+Photo" button on a sub-thing detail page.
 * Opens the shared staging modal; sends staged images to LLM; saves directly.
 */
function houseQuickAddItemFromPhoto(btnId, inputId) {
    openLlmPhotoStaging('Identify Item', function(images) {
        _houseQuickSendToLlm(images, 'item', btnId, inputId);
    });
}

/**
 * Internal helper: send staged images to LLM and save directly (no review modal).
 * @param {string[]} images     - Already-compressed base64 data URLs
 * @param {string}   targetType - 'thing' or 'subthing'
 * @param {string}   btnId      - button element ID to show loading state
 * @param {string}   inputId    - camera input ID to reset after use
 */
async function _houseQuickSendToLlm(images, targetType, btnId, inputId) {
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

        // Build content: prompt + already-compressed images
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

        if (targetType === 'thing') {
            await houseSaveFromLlm(parsed, images, 'thing', '');
            if (currentRoom) loadThingsList(currentRoom.id);
        } else if (targetType === 'item') {
            await houseSaveFromLlm(parsed, images, 'item', '');
            if (currentSubThing) loadItemsList(currentSubThing.id);
        } else {
            await houseSaveFromLlm(parsed, images, 'subthing', '');
            if (currentThing) loadSubThingsList(currentThing.id);
        }

    } catch (err) {
        console.error('Quick house photo error:', err);
        alert('Error: ' + err.message);
    } finally {
        if (btn) { btn.textContent = origText; btn.disabled = false; }
        var input = document.getElementById(inputId);
        if (input) input.value = '';
    }
}

// ---------- Wire-ups ----------

// Thing modal — Gallery / Camera — now open the staging modal
document.getElementById('thingPicGalleryBtn').addEventListener('click', function() {
    openLlmPhotoStaging('Identify Item', function(images) {
        houseSendToLlm(images, 'thing');
    });
});
document.getElementById('thingPicCameraBtn').addEventListener('click', function() {
    openLlmPhotoStaging('Identify Item', function(images) {
        houseSendToLlm(images, 'thing');
    });
});
// Legacy file inputs kept wired for any remaining direct trigger path
document.getElementById('thingPicInput').addEventListener('change', function() {
    if (this.files && this.files.length > 0) houseHandleFromPicture(this.files, 'thing');
});
document.getElementById('thingCamInput').addEventListener('change', function() {
    if (this.files && this.files.length > 0) houseHandleFromPicture(this.files, 'thing');
});

// SubThing modal — Gallery / Camera — now open the staging modal
document.getElementById('stPicGalleryBtn').addEventListener('click', function() {
    openLlmPhotoStaging('Identify Item', function(images) {
        houseSendToLlm(images, 'subthing');
    });
});
document.getElementById('stPicCameraBtn').addEventListener('click', function() {
    openLlmPhotoStaging('Identify Item', function(images) {
        houseSendToLlm(images, 'subthing');
    });
});
// Legacy file inputs kept wired for any remaining direct trigger path
document.getElementById('stPicInput').addEventListener('change', function() {
    if (this.files && this.files.length > 0) houseHandleFromPicture(this.files, 'subthing');
});
document.getElementById('stCamInput').addEventListener('change', function() {
    if (this.files && this.files.length > 0) houseHandleFromPicture(this.files, 'subthing');
});

// Review modal — Add It
document.getElementById('thingReviewAddBtn').addEventListener('click', async function() {
    if (!houseLlmPending) return;
    var btn          = this;
    var nameOverride = document.getElementById('thingReviewName').value.trim();
    btn.disabled     = true;
    btn.textContent  = 'Saving\u2026';
    try {
        await houseSaveFromLlm(houseLlmPending.parsed, houseLlmPending.images,
                               houseLlmPending.targetType, nameOverride);
        var isThing = houseLlmPending.targetType === 'thing';
        houseLlmPending = null;
        closeModal('thingLlmReviewModal');
        if (isThing && currentRoom)   loadThingsList(currentRoom.id);
        if (!isThing && currentThing) loadSubThingsList(currentThing.id);
    } catch (err) {
        console.error('Error saving item from LLM:', err);
        alert('Error saving item. Please try again.');
        btn.disabled    = false;
        btn.textContent = 'Add It';
    }
});

// Review modal — Cancel
document.getElementById('thingReviewCancelBtn').addEventListener('click', function() {
    houseLlmPending = null;
    closeModal('thingLlmReviewModal');
});
document.getElementById('thingLlmReviewModal').addEventListener('click', function(e) {
    if (e.target === this) {
        houseLlmPending = null;
        closeModal('thingLlmReviewModal');
    }
});

// ============================================================
// ITEMS  (subThingItems — fourth level of house hierarchy)
// Room → Thing → SubThing → Item
// ============================================================

// ---- State ----
var currentItem    = null;   // subThingItem document currently being viewed
window.currentItem = null;   // also exposed on window for photos.js

// Tag state for the subThingItem modal
var siSelectedTags = [];     // Tags currently selected in the modal
var siAllTags      = [];     // All known tag names (shared tag collection)

// ============================================================
// ITEM CRUD HELPERS
// ============================================================

/**
 * Deletes an Item document and all cross-entity records attached to it
 * (problems, facts, projects, activities, photos, calendarEvents).
 * @param {string} itemId - Firestore ID of the subThingItems document.
 */
async function _deleteItemCascade(itemId) {
    var collections = ['problems', 'facts', 'projects', 'activities', 'photos', 'calendarEvents'];
    for (var i = 0; i < collections.length; i++) {
        var snap = await userCol(collections[i])
            .where('targetType', '==', 'item')
            .where('targetId',   '==', itemId)
            .get();
        for (var j = 0; j < snap.docs.length; j++) {
            await snap.docs[j].ref.delete();
        }
    }
    await userCol('subThingItems').doc(itemId).delete();
}

// ============================================================
// ITEM DETAIL PAGE  (#item/{itemId})
// ============================================================

/**
 * Entry point called by app.js when navigating to #item/{id}.
 * Loads the item and its full parent chain, then renders the detail page.
 * @param {string} itemId
 */
function loadItemDetail(itemId) {
    userCol('subThingItems').doc(itemId).get()
        .then(function(doc) {
            if (!doc.exists) { window.location.hash = '#house'; return; }
            currentItem = window.currentItem = Object.assign({ id: doc.id }, doc.data());

            // Load parent subThing
            return userCol('subThings').doc(currentItem.subThingId).get()
                .then(function(stDoc) {
                    currentSubThing = stDoc.exists
                        ? Object.assign({ id: stDoc.id }, stDoc.data())
                        : { id: currentItem.subThingId, name: 'Sub-Item', thingId: null };

                    var thingId = currentSubThing.thingId;
                    if (!thingId) {
                        currentThing = currentRoom = currentFloor = { id: '', name: '…' };
                        renderItemDetail(currentItem, currentSubThing, currentThing, currentRoom, currentFloor);
                        return;
                    }

                    return userCol('things').doc(thingId).get()
                        .then(function(tDoc) {
                            currentThing = tDoc.exists
                                ? Object.assign({ id: tDoc.id }, tDoc.data())
                                : { id: thingId, name: 'Thing', roomId: null };

                            var roomId = currentThing.roomId;
                            if (!roomId) {
                                currentRoom  = { id: '', name: 'Room',  floorId: null };
                                currentFloor = { id: '', name: 'Floor' };
                                renderItemDetail(currentItem, currentSubThing, currentThing, currentRoom, currentFloor);
                                return;
                            }

                            return userCol('rooms').doc(roomId).get()
                                .then(function(rDoc) {
                                    currentRoom = rDoc.exists
                                        ? Object.assign({ id: rDoc.id }, rDoc.data())
                                        : { id: roomId, name: 'Room', floorId: null };

                                    var floorId = currentRoom.floorId;
                                    if (!floorId) {
                                        currentFloor = { id: '', name: 'Floor' };
                                        renderItemDetail(currentItem, currentSubThing, currentThing, currentRoom, currentFloor);
                                        return;
                                    }

                                    return userCol('floors').doc(floorId).get()
                                        .then(function(fDoc) {
                                            currentFloor = fDoc.exists
                                                ? Object.assign({ id: fDoc.id }, fDoc.data())
                                                : { id: floorId, name: 'Floor' };
                                            renderItemDetail(currentItem, currentSubThing, currentThing, currentRoom, currentFloor);
                                        });
                                });
                        });
                });
        })
        .catch(function(err) { console.error('loadItemDetail error:', err); });
}

/**
 * Renders all UI for the Item detail page once all parent docs are loaded.
 */
function renderItemDetail(item, subThing, thing, room, floor) {
    document.getElementById('siTitle').textContent = item.name || 'Item';

    // Meta line: Floor › Room › Thing › SubThing · #tag1 #tag2
    var tagsText = (item.tags || []).map(function(t) { return '#' + t; }).join(' ');
    document.getElementById('siMeta').textContent =
        (floor.name    || '') + ' \u203a ' +
        (room.name     || '') + ' \u203a ' +
        (thing.name    || '') + ' \u203a ' +
        (subThing.name || '') +
        (tagsText ? ' \u00b7 ' + tagsText : '');

    // Breadcrumb: House › Floor › Room › Thing › SubThing › Item
    buildHouseBreadcrumb([
        { label: 'House',                    hash: '#house' },
        { label: floor.name    || 'Floor',   hash: floor.id    ? '#floor/'   + floor.id    : null },
        { label: room.name     || 'Room',    hash: room.id     ? '#room/'    + room.id     : null },
        { label: thing.name    || 'Thing',   hash: thing.id    ? '#thing/'   + thing.id    : null },
        { label: subThing.name || 'Sub-Item',hash: subThing.id ? '#subthing/'+ subThing.id : null },
        { label: item.name     || 'Item',    hash: null }
    ]);

    // Inventory details card
    renderInventoryDetails(item, 'siDetailsSection');
    _renderBeneficiaryRow('siGoesToRow', item, [
        { entity: subThing, label: subThing.name || 'Sub-item' },
        { entity: thing,    label: thing.name    || 'Thing' }
    ]);

    // All cross-entity feature sections
    loadProblems(  'item', item.id, 'siProblemsContainer', 'siProblemsEmptyState')
        .then(function() { _setDetailAccCount('siProblemsAccCount', 'siProblemsContainer'); });
    loadFacts(     'item', item.id, 'siFactsContainer',    'siFactsEmptyState')
        .then(function() { _setDetailAccCount('siFactsAccCount', 'siFactsContainer'); });
    loadProjects(  'item', item.id, 'siProjectsContainer', 'siProjectsEmptyState')
        .then(function() { _setDetailAccCount('siTasksAccCount', 'siProjectsContainer'); });
    loadActivities('item', item.id, 'siActivityContainer', 'siActivityEmptyState')
        .then(function() { _setDetailAccCount('siActivityAccCount', 'siActivityContainer'); });
    loadPhotos(    'item', item.id, 'siPhotoContainer',    'siPhotoEmptyState')
        .then(function() { _setPhotoAccCount('siPhotosAccCount', 'item'); });

    if (typeof loadEventsForTarget === 'function') {
        var months = parseInt(document.getElementById('siCalendarRangeSelect').value, 10) || 3;
        loadEventsForTarget('item', item.id,
            'siCalendarEventsContainer', 'siCalendarEventsEmptyState', months)
            .then(function() { _setDetailAccCount('siCalendarAccCount', 'siCalendarEventsContainer'); });
    }
}

// ============================================================
// ITEM MODAL  (Add / Edit)
// ============================================================

/**
 * Opens the add/edit Item modal.
 * @param {string|null} editId  - ID to edit, or null for add mode.
 * @param {Object|null} data    - Existing item data for edit mode.
 */
function openItemModal(editId, data) {
    var modal     = document.getElementById('subThingItemModal');
    var nameInput = document.getElementById('siNameInput');
    var deleteBtn = document.getElementById('siModalDeleteBtn');

    if (editId) {
        document.getElementById('siModalTitle').textContent  = 'Edit Item';
        nameInput.value                                       = data.name        || '';
        document.getElementById('siPricePaidInput').value    = data.pricePaid   || '';
        document.getElementById('siWorthInput').value        = data.worth       || '';
        document.getElementById('siYearBoughtInput').value   = data.yearBought  || '';
        document.getElementById('siDescriptionInput').value  = data.description || '';
        document.getElementById('siNotesInput').value        = data.notes       || '';
        deleteBtn.style.display = '';
        modal.dataset.mode   = 'edit';
        modal.dataset.editId = editId;
    } else {
        document.getElementById('siModalTitle').textContent  = 'Add Item';
        nameInput.value                                       = '';
        document.getElementById('siPricePaidInput').value    = '';
        document.getElementById('siWorthInput').value        = '';
        document.getElementById('siYearBoughtInput').value   = '';
        document.getElementById('siDescriptionInput').value  = '';
        document.getElementById('siNotesInput').value        = '';
        deleteBtn.style.display = 'none';
        modal.dataset.mode   = 'add';
        modal.dataset.editId = '';
    }

    // Initialize tag state
    siSelectedTags = editId ? (data.tags || []).slice() : [];
    siRenderChips();
    document.getElementById('siTagInput').value = '';
    document.getElementById('siTagSuggestions').classList.add('hidden');
    siLoadTags();

    buildContactPicker('siBenePicker', {
        placeholder: 'Search contacts\u2026',
        initialId:   editId ? (data.beneficiaryContactId || undefined) : undefined,
        initialName: editId ? (data.beneficiaryName      || undefined) : undefined
    });

    openModal('subThingItemModal');
    nameInput.focus();
}

// ---- Modal Save ----
document.getElementById('siModalSaveBtn').addEventListener('click', function() {
    var modal   = document.getElementById('subThingItemModal');
    var nameVal = document.getElementById('siNameInput').value.trim();

    if (!nameVal) { alert('Please enter a name.'); return; }

    var itemData = {
        name:                 nameVal,
        pricePaid:            document.getElementById('siPricePaidInput').value.trim()   || null,
        worth:                document.getElementById('siWorthInput').value.trim()       || null,
        yearBought:           document.getElementById('siYearBoughtInput').value.trim()  || null,
        description:          document.getElementById('siDescriptionInput').value.trim(),
        notes:                document.getElementById('siNotesInput').value.trim(),
        tags:                 siSelectedTags.slice(),
        beneficiaryContactId: document.getElementById('siBenePicker_id').value || null
    };

    var mode   = modal.dataset.mode;
    var editId = modal.dataset.editId;

    if (mode === 'edit' && editId) {
        userCol('subThingItems').doc(editId).update(itemData)
            .then(function() {
                closeModal('subThingItemModal');
                loadItemDetail(editId);
            })
            .catch(function(err) { console.error('Update item error:', err); });
    } else {
        if (!currentSubThing) { alert('No parent sub-item selected.'); return; }
        itemData.subThingId = currentSubThing.id;
        itemData.createdAt  = firebase.firestore.FieldValue.serverTimestamp();
        userCol('subThingItems').add(itemData)
            .then(function(ref) {
                closeModal('subThingItemModal');
                // Navigate to the new item's detail page
                window.location.hash = '#item/' + ref.id;
            })
            .catch(function(err) { console.error('Add item error:', err); });
    }
});

// ---- Modal Cancel ----
document.getElementById('siModalCancelBtn').addEventListener('click', function() {
    closeModal('subThingItemModal');
});

// ---- Modal Delete ----
document.getElementById('siModalDeleteBtn').addEventListener('click', function() {
    var editId = document.getElementById('subThingItemModal').dataset.editId;
    if (!editId) return;
    if (!confirm('Delete this item? This cannot be undone.')) return;

    _deleteItemCascade(editId)
        .then(function() {
            closeModal('subThingItemModal');
            if (currentSubThing) {
                window.location.hash = '#subthing/' + currentSubThing.id;
            } else {
                window.location.hash = '#house';
            }
        })
        .catch(function(err) { console.error('Delete item error:', err); });
});

// ============================================================
// ITEM DETAIL PAGE — button wiring
// ============================================================

// Edit button
document.getElementById('editSiBtn').addEventListener('click', function() {
    if (currentItem) openItemModal(currentItem.id, currentItem);
});

// Delete button (from detail page)
document.getElementById('deleteSiBtn').addEventListener('click', function() {
    if (!currentItem) return;
    if (!confirm('Delete this item? This cannot be undone.')) return;

    _deleteItemCascade(currentItem.id)
        .then(function() {
            if (currentSubThing) {
                window.location.hash = '#subthing/' + currentSubThing.id;
            } else {
                window.location.hash = '#house';
            }
        })
        .catch(function(err) { console.error('Delete item error:', err); });
});

// Cross-entity section buttons
document.getElementById('addSiProblemBtn').addEventListener('click', function() {
    if (currentItem) openAddProblemModal('item', currentItem.id);
});

document.getElementById('addSiFactBtn').addEventListener('click', function() {
    if (currentItem) openAddFactModal('item', currentItem.id);
});

document.getElementById('addSiProjectBtn').addEventListener('click', function() {
    if (currentItem) openAddProjectModal('item', currentItem.id);
});

document.getElementById('logSiActivityBtn').addEventListener('click', function() {
    if (currentItem) openLogActivityModal('item', currentItem.id);
});

document.getElementById('addSiCameraBtn').addEventListener('click', function() {
    if (currentItem) triggerCameraUpload('item', currentItem.id);
});
document.getElementById('addSiGalleryBtn').addEventListener('click', function() {
    if (currentItem) triggerGalleryUpload('item', currentItem.id);
});

document.getElementById('addSiCalendarEventBtn').addEventListener('click', function() {
    if (currentItem && typeof openAddCalendarEventModal === 'function') {
        var reloadFn = function() {
            var months = parseInt(document.getElementById('siCalendarRangeSelect').value, 10) || 3;
            loadEventsForTarget('item', currentItem.id,
                'siCalendarEventsContainer', 'siCalendarEventsEmptyState', months);
        };
        openAddCalendarEventModal('item', currentItem.id, reloadFn);
    }
});

document.getElementById('siCalendarRangeSelect').addEventListener('change', function() {
    if (currentItem && typeof loadEventsForTarget === 'function') {
        var months = parseInt(this.value, 10) || 3;
        loadEventsForTarget('item', currentItem.id,
            'siCalendarEventsContainer', 'siCalendarEventsEmptyState', months);
    }
});

document.getElementById('showResolvedItemProblems').addEventListener('change', function() {
    if (currentItem) loadProblems('item', currentItem.id, 'siProblemsContainer', 'siProblemsEmptyState');
});

// ============================================================
// ITEM TAG INPUT LOGIC
// ============================================================

function siLoadTags() {
    userCol('tags').get()
        .then(function(snap) {
            siAllTags = [];
            snap.forEach(function(d) {
                var n = d.data().name;
                if (n) siAllTags.push(n);
            });
            siAllTags.sort(function(a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
        })
        .catch(function(err) { console.error('siLoadTags error:', err); });
}

function siRenderChips() {
    var chipsEl = document.getElementById('siTagChips');
    chipsEl.innerHTML = '';
    siSelectedTags.forEach(function(tag) {
        var chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.innerHTML =
            escapeHtml(tag) +
            '<button class="tag-chip-remove" data-tag="' + escapeHtml(tag) + '" title="Remove">\u00d7</button>';
        chip.querySelector('.tag-chip-remove').addEventListener('click', function(e) {
            e.stopPropagation();
            siRemoveTag(this.dataset.tag);
        });
        chipsEl.appendChild(chip);
    });
}

function siRemoveTag(name) {
    siSelectedTags = siSelectedTags.filter(function(t) { return t !== name; });
    siRenderChips();
}

function siAddTag(name) {
    name = name.trim();
    if (!name) return;
    var lower = name.toLowerCase();
    if (siSelectedTags.some(function(t) { return t.toLowerCase() === lower; })) return;
    siSelectedTags.push(name);
    siRenderChips();
    // Persist new tag to global Firestore tags collection if new
    var existsInAll = siAllTags.some(function(t) { return t.toLowerCase() === lower; });
    if (!existsInAll) {
        siAllTags.push(name);
        siAllTags.sort(function(a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
        userCol('tags').add({
            name:      name,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function(err) { console.error('siAddTag: error saving tag:', err); });
    }
}

function siUpdateSuggestions(query) {
    var sugEl = document.getElementById('siTagSuggestions');
    sugEl.innerHTML = '';

    var q = query.trim();
    if (!q) { sugEl.classList.add('hidden'); return; }

    var qLower   = q.toLowerCase();
    var selected = siSelectedTags.map(function(t) { return t.toLowerCase(); });

    var matches = siAllTags.filter(function(t) {
        return t.toLowerCase().indexOf(qLower) !== -1 &&
               selected.indexOf(t.toLowerCase()) === -1;
    });

    var exactMatch = siAllTags.some(function(t) { return t.toLowerCase() === qLower; });

    var items = matches.map(function(t) { return { label: t, isNew: false }; });
    if (!exactMatch && selected.indexOf(qLower) === -1) {
        items.push({ label: q, isNew: true });
    }

    if (!items.length) { sugEl.classList.add('hidden'); return; }

    items.forEach(function(item) {
        var div = document.createElement('div');
        div.className = 'tag-suggestion-item' + (item.isNew ? ' tag-suggestion-new' : '');
        div.textContent = item.isNew ? '+ Add "' + item.label + '"' : item.label;
        div.addEventListener('mousedown', function(e) {
            e.preventDefault();
            siAddTag(item.label);
            document.getElementById('siTagInput').value = '';
            siUpdateSuggestions('');
        });
        sugEl.appendChild(div);
    });

    sugEl.classList.remove('hidden');
}

// Wire tag input events
document.getElementById('siTagInput').addEventListener('input', function() {
    siUpdateSuggestions(this.value);
});

document.getElementById('siTagInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        var val = this.value.trim().replace(/,$/, '');
        if (val) { siAddTag(val); this.value = ''; siUpdateSuggestions(''); }
    } else if (e.key === 'Backspace' && !this.value && siSelectedTags.length) {
        siRemoveTag(siSelectedTags[siSelectedTags.length - 1]);
    }
});

document.getElementById('siTagInput').addEventListener('blur', function() {
    setTimeout(function() {
        var sugEl = document.getElementById('siTagSuggestions');
        if (sugEl) sugEl.classList.add('hidden');
    }, 150);
});

document.getElementById('siTagWrapper').addEventListener('click', function() {
    document.getElementById('siTagInput').focus();
});
