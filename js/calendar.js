// ============================================================
// Calendar.js — Calendar event management and display
// Supports one-time and recurring events (weekly, monthly, every X days,
// and two maintenance-schedule types: reset_interval and fixed_months).
// Displays events chronologically grouped by month.
// Shows a configurable range (default: next 3 months).
// Firestore collection: "calendarEvents"
//
// calendarEvents fields:
//   title, description, date (ISO string), recurring (null or {type, intervalDays}),
//   targetType? ('zone'|'plant'|null), targetId? (string|null),
//   zoneIds? (string[], IDs of linked zones — multi-zone support),
//   savedActionId? (string|null),
//   completed (boolean, for one-time events),
//   completedDates (string[], ISO dates of completed recurring occurrences — weekly/
//     monthly/every_x_days only),
//   cancelledDates (string[], ISO dates of deleted single occurrences of a recurring event)
//
// recurring.type === 'reset_interval' (maintenance schedule, e.g. "change hot tub
// water every 3 months"): additional fields intervalUnit ('days'|'months') and
// intervalValue (number). Unlike the other recurring types, only ONE occurrence is
// ever active at a time — its due date is `lastCompletedDate + interval`, or the
// event's original `date` if never completed. Nothing is scheduled further ahead
// until the current occurrence is actually marked Completed.
//
// recurring.type === 'fixed_months' (maintenance schedule, e.g. "fertilize in May,
// July, and October"): additional fields months (number[], 1-12), dayOfMonth
// (number), and minSpacingDays (number, not yet enforced — see MaintenanceSchedulePlan.md).
// One independent occurrence per configured month, every year. Per-occurrence delete
// still uses cancelledDates[] like the other types, but completion status does not.
//
// occurrenceStatus (map, reset_interval and fixed_months ONLY — replaces
// completedDates for these two types): keyed by occurrence date string, value is
// { status: 'completed'|'in_progress', startedAt?, notes? }. 'in_progress' entries
// carry a start date and free-text notes; occurrences in this state still count as
// open/actionable (completed stays false) until actually marked Completed.
//
// See MaintenanceSchedulePlan.md for the full feature design.
// ============================================================

// ---------- Module State ----------

/** How many months ahead to display (default 3). */
var calendarRangeMonths = 3;

/**
 * Reload callback stored when opening the event modal from a zone/plant page.
 * After saving, this function is called instead of loadCalendar().
 */
var calendarEventModalReloadFn = null;

/**
 * Occurrence currently being completed (stored for use by handleCompleteEvent).
 */
var pendingCompleteOccurrence = null;

/**
 * Occurrence currently being marked In Progress (stored for use by handleSaveInProgress
 * and handleClearInProgress).
 */
var pendingInProgressOccurrence = null;

/**
 * Occurrence currently being postponed (stored for use by handleSavePostpone).
 */
var pendingPostponeOccurrence = null;

/**
 * Pending recurring-event delete (stored while the deleteRecurringModal is open).
 */
var pendingDeleteRecurring = null;

// ---------- Load & Display Calendar ----------

/**
 * Loads all calendar events, generates upcoming uncompleted occurrences,
 * and renders them grouped by month. Also loads the overdue section.
 */
async function loadCalendar() {
    var container = document.getElementById('calendarEventsContainer');
    var emptyState = document.getElementById('calendarEmptyState');
    var rangeSelect = document.getElementById('calendarRangeSelect');

    // Read range from dropdown
    calendarRangeMonths = parseInt(rangeSelect.value) || 3;

    // Calculate date range: today through N months from now
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var rangeStart = formatDateISO(today);

    var rangeEndDate = new Date(today);
    rangeEndDate.setMonth(rangeEndDate.getMonth() + calendarRangeMonths);
    var rangeEnd = formatDateISO(rangeEndDate);

    // Load overdue section first, then people annual dates
    await loadOverdueEvents();
    await loadPeopleAnnualDates(today, rangeEndDate);

    try {
        var snapshot = await userCol('calendarEvents').get();

        container.innerHTML = '';

        if (snapshot.empty) {
            emptyState.textContent = 'No calendar events yet \u2014 add one to get started!';
            emptyState.style.display = 'block';
            return;
        }

        // Collect all events
        var events = [];
        snapshot.forEach(function(doc) {
            events.push({ id: doc.id, ...doc.data() });
        });

        // Generate all occurrences within the display range
        var showCompleted = document.getElementById('showCompletedCalendarEvents').checked;
        var allOccurrences = [];
        events.forEach(function(event) {
            var occurrences = generateOccurrences(event, rangeStart, rangeEnd);
            // Filter to uncompleted only, unless "Show completed" is checked
            var relevant = showCompleted ? occurrences : occurrences.filter(function(occ) { return !occ.completed; });
            allOccurrences = allOccurrences.concat(relevant);
        });

        // Sort by occurrence date
        allOccurrences.sort(function(a, b) {
            return a.occurrenceDate.localeCompare(b.occurrenceDate);
        });

        if (allOccurrences.length === 0) {
            emptyState.textContent = 'No events in the next ' + calendarRangeMonths +
                ' month' + (calendarRangeMonths > 1 ? 's' : '') + '.';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        // Group by month and render
        var currentMonth = '';
        allOccurrences.forEach(function(occ) {
            var monthKey = occ.occurrenceDate.substring(0, 7); // "YYYY-MM"

            if (monthKey !== currentMonth) {
                currentMonth = monthKey;
                var monthHeader = document.createElement('h3');
                monthHeader.className = 'calendar-month-header';
                var parts = monthKey.split('-');
                var monthDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
                monthHeader.textContent = monthDate.toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric'
                });
                container.appendChild(monthHeader);
            }

            var card = createCalendarEventCard(occ, loadCalendar);
            container.appendChild(card);
        });

    } catch (error) {
        console.error('Error loading calendar:', error);
        emptyState.textContent = 'Error loading calendar events.';
        emptyState.style.display = 'block';
    }
}

// ---------- Load Events for Zone / Plant Target ----------

/**
 * Loads upcoming calendar events tied to a specific zone or plant,
 * and renders them as compact event cards.
 * @param {string} targetType - "zone" or "plant"
 * @param {string} targetId - The target's Firestore document ID.
 * @param {string} containerId - The ID of the container element.
 * @param {string} emptyStateId - The ID of the empty-state message element.
 */
/**
 * Recursively collects all {type, id} pairs for an entity and its descendants.
 * Uses PROBLEM_CHILD_MAP (defined in problems.js) — same hierarchy applies.
 * Used by loadEventsForTarget to gather calendar events from all descendant entities.
 */
async function _gatherEntityRefs(entityType, entityId) {
    var refs = [{ type: entityType, id: entityId }];
    var childDef = PROBLEM_CHILD_MAP[entityType];
    if (childDef) {
        var childSnap = await userCol(childDef.collection)
            .where(childDef.parentField, '==', entityId)
            .get();
        var promises = [];
        childSnap.forEach(function(childDoc) {
            promises.push(
                _gatherEntityRefs(childDef.childType, childDoc.id)
                    .then(function(childRefs) {
                        childRefs.forEach(function(r) { refs.push(r); });
                    })
            );
        });
        await Promise.all(promises);
    }
    return refs;
}

async function loadEventsForTarget(targetType, targetId, containerId, emptyStateId, months) {
    months = months || 3;
    var container = document.getElementById(containerId);
    var emptyState = document.getElementById(emptyStateId);

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var rangeStart = formatDateISO(today);
    var rangeEndDate = new Date(today);
    rangeEndDate.setMonth(rangeEndDate.getMonth() + months);
    var rangeEnd = formatDateISO(rangeEndDate);

    try {
        container.innerHTML = '';

        // Use a map to deduplicate events by ID (needed when running multiple queries).
        var eventsMap = {};

        if (targetType === 'zone') {
            // Query 1: old-style targetType/targetId links directly to this zone
            var snap1 = await userCol('calendarEvents')
                .where('targetType', '==', 'zone')
                .where('targetId', '==', targetId)
                .get();
            snap1.forEach(function(doc) {
                eventsMap[doc.id] = { id: doc.id, ...doc.data() };
            });

            // Query 2: new-style zoneIds array-contains this zone
            var snap2 = await userCol('calendarEvents')
                .where('zoneIds', 'array-contains', targetId)
                .get();
            snap2.forEach(function(doc) {
                eventsMap[doc.id] = { id: doc.id, ...doc.data() };
            });

            // Query 3: plant-linked events for any plant in this zone or its sub-zones.
            // Get all zone IDs in the hierarchy under this zone, then find plants in those zones,
            // then find calendar events tied to those plants.
            var allZoneIds = await getDescendantZoneIds(targetId);
            var allZoneChunks = chunkArray(allZoneIds, 30);
            var plantIds = [];
            for (var z = 0; z < allZoneChunks.length; z++) {
                var plantSnap = await userCol('plants')
                    .where('zoneId', 'in', allZoneChunks[z])
                    .get();
                plantSnap.forEach(function(doc) { plantIds.push(doc.id); });
            }
            var plantChunks = chunkArray(plantIds, 30);
            for (var p = 0; p < plantChunks.length; p++) {
                var evSnap = await userCol('calendarEvents')
                    .where('targetType', '==', 'plant')
                    .where('targetId', 'in', plantChunks[p])
                    .get();
                evSnap.forEach(function(doc) {
                    eventsMap[doc.id] = { id: doc.id, ...doc.data() };
                });
            }

        } else if (PROBLEM_CHILD_MAP[targetType]) {
            // Hierarchical entity (floor, room, thing, garageroom, etc.)
            // Gather this entity + all descendants, then fetch events for each
            var allRefs = await _gatherEntityRefs(targetType, targetId);
            var refPromises = allRefs.map(function(ref) {
                return userCol('calendarEvents')
                    .where('targetType', '==', ref.type)
                    .where('targetId',   '==', ref.id)
                    .get()
                    .then(function(snap) {
                        snap.forEach(function(doc) {
                            eventsMap[doc.id] = { id: doc.id, ...doc.data() };
                        });
                    });
            });
            await Promise.all(refPromises);

        } else {
            // For plants and any other single-entity types: direct query
            var snapshot = await userCol('calendarEvents')
                .where('targetType', '==', targetType)
                .where('targetId', '==', targetId)
                .get();
            snapshot.forEach(function(doc) {
                eventsMap[doc.id] = { id: doc.id, ...doc.data() };
            });
        }

        var events = Object.values(eventsMap);

        if (events.length === 0) {
            emptyState.textContent = 'No calendar events.';
            emptyState.style.display = 'block';
            return;
        }

        var yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        var yesterdayStr = formatDateISO(yesterday);

        // --- Overdue: past uncompleted occurrences (shown above upcoming) ---
        var overdueOccs = [];
        events.forEach(function(event) {
            if (!event.date) return;
            var eventStart = new Date(event.date + 'T00:00:00');
            if (eventStart >= today) return; // hasn't started yet — not overdue

            if (!event.recurring) {
                if (!event.completed) {
                    overdueOccs.push({
                        eventId: event.id, title: event.title,
                        description: event.description || '',
                        occurrenceDate: event.date, recurring: null,
                        completed: false, overdue: true,
                        targetType: event.targetType || null,
                        targetId: event.targetId || null,
                        savedActionId: event.savedActionId || null,
                        zoneIds: event.zoneIds || [],
                        tagIds: event.tagIds || [],
                        trackingCategory: event.trackingCategory || ''
                    });
                }
            } else {
                var pastOccs = generateOccurrences(event, event.date, yesterdayStr);
                pastOccs.forEach(function(occ) {
                    if (!occ.completed && occ.status !== 'skipped' && occ.status !== 'unnecessary') {
                        occ.overdue = true;
                        overdueOccs.push(occ);
                    }
                });
            }
        });
        // Most-recent overdue first (same as main calendar overdue section)
        overdueOccs.sort(function(a, b) {
            return b.occurrenceDate.localeCompare(a.occurrenceDate);
        });

        // --- Upcoming: uncompleted occurrences from today forward ---
        var upcomingOccs = [];
        events.forEach(function(event) {
            var occurrences = generateOccurrences(event, rangeStart, rangeEnd);
            var upcoming = occurrences.filter(function(occ) { return !occ.completed; });
            upcomingOccs = upcomingOccs.concat(upcoming);
        });
        upcomingOccs.sort(function(a, b) {
            return a.occurrenceDate.localeCompare(b.occurrenceDate);
        });

        if (overdueOccs.length === 0 && upcomingOccs.length === 0) {
            emptyState.textContent = 'No upcoming events in next ' + months + ' month' + (months === 1 ? '' : 's') + '.';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        // Reload function for cards on this target's page
        var reloadFn = function() {
            loadEventsForTarget(targetType, targetId, containerId, emptyStateId, months);
        };

        // Render overdue first (with orange badge), then upcoming
        overdueOccs.forEach(function(occ) {
            var card = createCalendarEventCard(occ, reloadFn);
            card.classList.add('calendar-overdue-card');
            container.appendChild(card);
        });
        upcomingOccs.forEach(function(occ) {
            var card = createCalendarEventCard(occ, reloadFn);
            container.appendChild(card);
        });

    } catch (error) {
        console.error('Error loading events for target:', error);
        emptyState.textContent = 'Error loading events.';
        emptyState.style.display = 'block';
    }
}

// ---------- Load Overdue Events ----------

/**
 * Finds past calendar events that were NOT completed and shows them
 * in the calendarOverdueSection on the calendar page.
 */
async function loadOverdueEvents() {
    var section = document.getElementById('calendarOverdueSection');
    var container = document.getElementById('calendarOverdueContainer');

    container.innerHTML = '';

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    try {
        var snapshot = await userCol('calendarEvents').get();

        if (snapshot.empty) {
            section.style.display = 'none';
            return;
        }

        var events = [];
        snapshot.forEach(function(doc) {
            events.push({ id: doc.id, ...doc.data() });
        });

        // Find overdue: one-time events past due and not completed;
        // recurring events with uncompleted past occurrences
        var overdueOccurrences = [];

        events.forEach(function(event) {
            // For the overdue check, look from event.date back to yesterday
            var eventStartDate = new Date(event.date + 'T00:00:00');
            if (eventStartDate >= today) return; // Event hasn't started yet — not overdue

            if (!event.recurring) {
                // One-time event: overdue if not completed
                if (!event.completed) {
                    overdueOccurrences.push({
                        eventId: event.id,
                        title: event.title,
                        description: event.description || '',
                        occurrenceDate: event.date,
                        recurring: null,
                        completed: false,
                        targetType: event.targetType || null,
                        targetId: event.targetId || null,
                        savedActionId: event.savedActionId || null,
                        tagIds: event.tagIds || [],
                        overdue: true,
                        trackingCategory: event.trackingCategory || ''
                    });
                }
            } else {
                // Recurring: find all past occurrences not in completedDates
                var completedDates = event.completedDates || [];
                var rangeEnd = formatDateISO(yesterday);
                var pastOccs = generateOccurrences(event, event.date, rangeEnd);
                pastOccs.forEach(function(occ) {
                    if (!occ.completed && occ.status !== 'skipped' && occ.status !== 'unnecessary') {
                        occ.overdue = true;
                        overdueOccurrences.push(occ);
                    }
                });
            }
        });

        if (overdueOccurrences.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';

        // Sort most-recent overdue first
        overdueOccurrences.sort(function(a, b) {
            return b.occurrenceDate.localeCompare(a.occurrenceDate);
        });

        overdueOccurrences.forEach(function(occ) {
            var card = createCalendarEventCard(occ, loadCalendar);
            card.classList.add('calendar-overdue-card');
            container.appendChild(card);
        });

    } catch (error) {
        console.error('Error loading overdue events:', error);
        section.style.display = 'none';
    }
}

// ---------- Maintenance List (#maintenance) ----------

/**
 * Loads the dedicated cross-entity maintenance-schedule list: every
 * calendarEvents doc whose recurring.type is 'reset_interval' or 'fixed_months',
 * regardless of which entity it's linked to. Reuses createCalendarEventCard so
 * status actions here are identical to the calendar page and entity detail pages —
 * single source of truth, no divergence.
 *
 * Three buckets: Overdue (open, past-due), Upcoming (open, next 12 months),
 * Resolved (Completed/Skipped/Unnecessary — only collected and shown when the
 * "Show resolved" toggle is checked, matching the Problems/Quick Task List
 * convention). Postponed reset_interval occurrences don't appear anywhere here —
 * generateOccurrences already fully suppresses them while postponedUntil is in
 * the future, so they drop out on their own without needing special handling.
 */
async function loadMaintenanceList() {
    var container = document.getElementById('maintenanceListContainer');
    var emptyState = document.getElementById('maintenanceEmptyState');
    var showResolved = document.getElementById('showResolvedMaintenance').checked;

    container.innerHTML = '';
    emptyState.style.display = 'none';

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var todayStr = formatDateISO(today);
    var yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    var yesterdayStr = formatDateISO(yesterday);
    var rangeEndDate = new Date(today);
    rangeEndDate.setMonth(rangeEndDate.getMonth() + 12);
    var rangeEndStr = formatDateISO(rangeEndDate);

    function isResolved(occ) {
        return occ.completed || occ.status === 'skipped' || occ.status === 'unnecessary';
    }

    try {
        var snapshot = await userCol('calendarEvents')
            .where('recurring.type', 'in', ['reset_interval', 'fixed_months'])
            .get();

        if (snapshot.empty) {
            emptyState.textContent = 'No maintenance schedules yet. Create one from the Calendar page — choose "Reset Interval" or "Fixed Months" as the frequency.';
            emptyState.style.display = 'block';
            return;
        }

        var events = [];
        snapshot.forEach(function(doc) { events.push({ id: doc.id, ...doc.data() }); });

        var overdueOccs = [];
        var upcomingOccs = [];
        var resolvedOccs = [];

        events.forEach(function(event) {
            var pastOccs = generateOccurrences(event, event.date, yesterdayStr);
            pastOccs.forEach(function(occ) {
                if (isResolved(occ)) {
                    if (showResolved) resolvedOccs.push(occ);
                } else {
                    occ.overdue = true;
                    overdueOccs.push(occ);
                }
            });

            var futureOccs = generateOccurrences(event, todayStr, rangeEndStr);
            futureOccs.forEach(function(occ) {
                if (isResolved(occ)) {
                    if (showResolved) resolvedOccs.push(occ);
                } else {
                    upcomingOccs.push(occ);
                }
            });
        });

        overdueOccs.sort(function(a, b) { return b.occurrenceDate.localeCompare(a.occurrenceDate); });
        upcomingOccs.sort(function(a, b) { return a.occurrenceDate.localeCompare(b.occurrenceDate); });
        resolvedOccs.sort(function(a, b) { return b.occurrenceDate.localeCompare(a.occurrenceDate); });

        if (overdueOccs.length === 0 && upcomingOccs.length === 0 && resolvedOccs.length === 0) {
            emptyState.textContent = showResolved
                ? 'No maintenance schedules in the next 12 months.'
                : 'Nothing needs attention right now. Turn on "Show resolved" to see completed, skipped, or unnecessary items.';
            emptyState.style.display = 'block';
            return;
        }

        var reloadFn = loadMaintenanceList;

        if (overdueOccs.length > 0) {
            var overdueHeader = document.createElement('h3');
            overdueHeader.className = 'section-heading calendar-overdue-heading';
            overdueHeader.textContent = 'Overdue';
            container.appendChild(overdueHeader);
            overdueOccs.forEach(function(occ) {
                var card = createCalendarEventCard(occ, reloadFn);
                card.classList.add('calendar-overdue-card');
                container.appendChild(card);
            });
        }

        if (upcomingOccs.length > 0) {
            var upcomingHeader = document.createElement('h3');
            upcomingHeader.className = 'section-heading';
            upcomingHeader.textContent = 'Upcoming';
            container.appendChild(upcomingHeader);
            upcomingOccs.forEach(function(occ) {
                container.appendChild(createCalendarEventCard(occ, reloadFn));
            });
        }

        if (resolvedOccs.length > 0) {
            var resolvedHeader = document.createElement('h3');
            resolvedHeader.className = 'section-heading';
            resolvedHeader.textContent = 'Resolved';
            container.appendChild(resolvedHeader);
            resolvedOccs.forEach(function(occ) {
                container.appendChild(createCalendarEventCard(occ, reloadFn));
            });
        }

    } catch (error) {
        console.error('Error loading maintenance list:', error);
        emptyState.textContent = 'Error loading maintenance schedules.';
        emptyState.style.display = 'block';
    }
}

// ---------- Generate Occurrences ----------

/**
 * Given a calendar event and a date range, generates all occurrence dates
 * that fall within the range. Occurrence objects carry completion state,
 * targetType, targetId, and savedActionId from the parent event.
 *
 * @param {Object} event - The calendar event document data (with id).
 * @param {string} rangeStart - ISO date string "YYYY-MM-DD" for range start.
 * @param {string} rangeEnd - ISO date string "YYYY-MM-DD" for range end.
 * @returns {Array} Array of occurrence objects with occurrenceDate added.
 */
function generateOccurrences(event, rangeStart, rangeEnd) {
    var occurrences = [];
    var rangeStartDate = new Date(rangeStart + 'T00:00:00');
    var rangeEndDate = new Date(rangeEnd + 'T23:59:59');
    var completedDates = event.completedDates || [];
    var cancelledDates = event.cancelledDates || [];

    if (!event.recurring) {
        // One-time event — just check if it falls in range
        var eventDate = new Date(event.date + 'T00:00:00');
        if (eventDate >= rangeStartDate && eventDate <= rangeEndDate) {
            occurrences.push({
                eventId: event.id,
                title: event.title,
                description: event.description || '',
                occurrenceDate: event.date,
                recurring: null,
                completed: !!event.completed,
                targetType: event.targetType || null,
                targetId: event.targetId || null,
                savedActionId: event.savedActionId || null,
                zoneIds: event.zoneIds || [],
                tagIds: event.tagIds || [],
                trackingCategory: event.trackingCategory || ''
            });
        }
        return occurrences;
    }

    // Reset-interval event — exactly one active occurrence, anchored to the last
    // completion (or the original date if never completed). Unlike the other
    // recurring types, no future occurrences are generated ahead of time; the
    // "next" one only exists once this one is marked Completed (see
    // handleCompleteEvent, which sets lastCompletedDate).
    if (event.recurring.type === 'reset_interval') {
        // Postponed: fully suppressed from every view while postponedUntil is in the
        // future — matches "no reminder." The real due date is never touched, so once
        // postponedUntil passes, the occurrence resumes showing exactly as it would
        // have if never postponed (likely already overdue by then).
        if (event.postponedUntil) {
            var todayForPostpone = new Date();
            todayForPostpone.setHours(0, 0, 0, 0);
            if (todayForPostpone < new Date(event.postponedUntil + 'T00:00:00')) {
                return occurrences;
            }
        }
        var dueDate = event.lastCompletedDate
            ? addInterval(new Date(event.lastCompletedDate + 'T00:00:00'), event.recurring.intervalUnit, event.recurring.intervalValue)
            : new Date(event.date + 'T00:00:00');
        if (dueDate >= rangeStartDate && dueDate <= rangeEndDate) {
            var riDateStr = formatDateISO(dueDate);
            var riStatus = (event.occurrenceStatus && event.occurrenceStatus[riDateStr]) || null;
            occurrences.push({
                eventId: event.id,
                title: event.title,
                description: event.description || '',
                occurrenceDate: riDateStr,
                recurring: event.recurring,
                completed: !!(riStatus && riStatus.status === 'completed'),
                status: riStatus ? riStatus.status : null,
                statusStartedAt: (riStatus && riStatus.startedAt) || null,
                statusNotes: (riStatus && riStatus.notes) || null,
                targetType: event.targetType || null,
                targetId: event.targetId || null,
                savedActionId: event.savedActionId || null,
                zoneIds: event.zoneIds || [],
                tagIds: event.tagIds || [],
                trackingCategory: event.trackingCategory || ''
            });
        }
        return occurrences;
    }

    // Fixed-months event — one independent occurrence per configured month, every
    // year, anchored to the event's original date (so a month that already passed
    // in the creation year doesn't generate a phantom occurrence). Completion status
    // is tracked via occurrenceStatus[dateStr] (see reset_interval above), but
    // per-occurrence delete still uses the ordinary cancelledDates[] array — deleting
    // an occurrence is a different concern (permanent removal) from its status.
    if (event.recurring.type === 'fixed_months') {
        var fmMonths = event.recurring.months || [];
        var fmDayOfMonth = event.recurring.dayOfMonth || 1;
        var fmAnchor = new Date(event.date + 'T00:00:00');
        var fmStartYear = rangeStartDate.getFullYear();
        var fmEndYear = rangeEndDate.getFullYear();

        for (var fy = fmStartYear; fy <= fmEndYear; fy++) {
            for (var fmi = 0; fmi < fmMonths.length; fmi++) {
                var fmMonth = fmMonths[fmi]; // 1-12
                var fmLastDay = new Date(fy, fmMonth, 0).getDate();
                var fmOccDate = new Date(fy, fmMonth - 1, Math.min(fmDayOfMonth, fmLastDay));
                if (fmOccDate < fmAnchor) continue; // schedule hasn't started yet
                if (fmOccDate < rangeStartDate || fmOccDate > rangeEndDate) continue;

                var fmDateStr = formatDateISO(fmOccDate);
                if (cancelledDates.indexOf(fmDateStr) !== -1) continue;

                var fmStatus = (event.occurrenceStatus && event.occurrenceStatus[fmDateStr]) || null;
                occurrences.push({
                    eventId: event.id,
                    title: event.title,
                    description: event.description || '',
                    occurrenceDate: fmDateStr,
                    recurring: event.recurring,
                    completed: !!(fmStatus && fmStatus.status === 'completed'),
                    status: fmStatus ? fmStatus.status : null,
                    statusStartedAt: (fmStatus && fmStatus.startedAt) || null,
                    statusNotes: (fmStatus && fmStatus.notes) || null,
                    targetType: event.targetType || null,
                    targetId: event.targetId || null,
                    savedActionId: event.savedActionId || null,
                    zoneIds: event.zoneIds || [],
                    tagIds: event.tagIds || [],
                    trackingCategory: event.trackingCategory || ''
                });
            }
        }

        occurrences.sort(function(a, b) { return a.occurrenceDate.localeCompare(b.occurrenceDate); });
        return occurrences;
    }

    // Recurring event — generate occurrences
    var startDate = new Date(event.date + 'T00:00:00');
    var originalDay = startDate.getDate();
    var type = event.recurring.type;
    var intervalDays = event.recurring.intervalDays || 14;

    var current = new Date(startDate);
    var maxIterations = 1000; // Safety limit
    var count = 0;

    // Fast-forward past dates before the range
    while (current < rangeStartDate && count < maxIterations) {
        current = advanceRecurringDate(current, type, intervalDays, originalDay);
        count++;
    }

    // Generate occurrences within the range
    while (current <= rangeEndDate && count < maxIterations) {
        var dateStr = formatDateISO(current);
        // Skip occurrences that were individually deleted
        if (cancelledDates.indexOf(dateStr) === -1) {
            occurrences.push({
                eventId: event.id,
                title: event.title,
                description: event.description || '',
                occurrenceDate: dateStr,
                recurring: event.recurring,
                completed: completedDates.indexOf(dateStr) >= 0,
                targetType: event.targetType || null,
                targetId: event.targetId || null,
                savedActionId: event.savedActionId || null,
                zoneIds: event.zoneIds || [],
                tagIds: event.tagIds || [],
                trackingCategory: event.trackingCategory || ''
            });
        }

        current = advanceRecurringDate(current, type, intervalDays, originalDay);
        count++;
    }

    return occurrences;
}

/**
 * Advances a date to the next recurrence.
 * @param {Date} date - The current occurrence date.
 * @param {string} type - "weekly", "monthly", or "every_x_days".
 * @param {number} intervalDays - Number of days for every_x_days type.
 * @param {number} originalDay - The original day-of-month (for monthly clamping).
 * @returns {Date} A new Date object for the next occurrence.
 */
function advanceRecurringDate(date, type, intervalDays, originalDay) {
    var next = new Date(date);

    if (type === 'weekly') {
        next.setDate(next.getDate() + 7);
    } else if (type === 'monthly') {
        // Move to same day next month, clamping to end of month
        var nextMonth = next.getMonth() + 1;
        var nextYear = next.getFullYear();
        if (nextMonth > 11) {
            nextMonth = 0;
            nextYear++;
        }
        var lastDay = new Date(nextYear, nextMonth + 1, 0).getDate();
        next = new Date(nextYear, nextMonth, Math.min(originalDay, lastDay));
    } else if (type === 'every_x_days') {
        next.setDate(next.getDate() + intervalDays);
    }

    return next;
}

/**
 * Adds an interval (in days or months) to a date. Used for reset_interval scheduling.
 * Month addition clamps to the end of the resulting month (e.g. Jan 31 + 1 month -> Feb 28).
 * @param {Date} date - The starting date.
 * @param {string} unit - "days" or "months".
 * @param {number} value - The interval amount.
 * @returns {Date} A new Date object advanced by the interval.
 */
function addInterval(date, unit, value) {
    var next = new Date(date);
    if (unit === 'months') {
        var day = next.getDate();
        var targetMonth = next.getMonth() + value;
        var targetYear = next.getFullYear() + Math.floor(targetMonth / 12);
        targetMonth = ((targetMonth % 12) + 12) % 12;
        var lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
        next = new Date(targetYear, targetMonth, Math.min(day, lastDay));
    } else {
        next.setDate(next.getDate() + value);
    }
    return next;
}

/**
 * Returns the 3-letter abbreviation for a 1-12 month number. Used by the
 * fixed_months recurring badge (e.g. "May, Jul, Oct").
 * @param {number} m - Month number, 1-12.
 * @returns {string} 3-letter month abbreviation.
 */
function monthAbbrev(m) {
    var names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return names[m - 1] || '';
}

/**
 * Finds the next fixed_months occurrence date strictly after the given date,
 * wrapping to the following year if the given date's month is the last configured
 * one. Used by the auto-Unnecessary check in handleCompleteEvent.
 * @param {Object} recurring - The event's recurring config ({months, dayOfMonth}).
 * @param {Date} afterDate - The date to search after (the occurrence just completed).
 * @returns {Date|null} The next occurrence's Date, or null if no months configured.
 */
function _fmNextOccurrenceDate(recurring, afterDate) {
    var months = (recurring.months || []).slice().sort(function(a, b) { return a - b; });
    if (months.length === 0) return null;
    var dayOfMonth = recurring.dayOfMonth || 1;
    var year = afterDate.getFullYear();
    var month = afterDate.getMonth() + 1; // 1-12

    for (var i = 0; i < months.length; i++) {
        if (months[i] > month) {
            var lastDay = new Date(year, months[i], 0).getDate();
            return new Date(year, months[i] - 1, Math.min(dayOfMonth, lastDay));
        }
    }
    // Wrap to next year's first configured month
    var firstMonth = months[0];
    var lastDayNextYear = new Date(year + 1, firstMonth, 0).getDate();
    return new Date(year + 1, firstMonth - 1, Math.min(dayOfMonth, lastDayNextYear));
}

/**
 * Appends a clickable link (with leading text already part of the label) to a
 * container element. Small shared helper for the target-entity line.
 * @param {HTMLElement} container
 * @param {string} label - Full link text, e.g. "Vehicle: 2019 Ford F-150".
 * @param {string} href - e.g. "#vehicle/abc123".
 */
function _calAppendTargetLink(container, label, href) {
    var a = document.createElement('a');
    a.href = href;
    a.textContent = label;
    container.appendChild(a);
}

/**
 * Friendly label prefix for a targetType, used by the generic entity-link
 * fallback in createCalendarEventCard.
 * @param {string} type
 * @returns {string}
 */
function _calTargetTypeLabel(type) {
    var labels = {
        vehicle: 'Vehicle', weed: 'Weed',
        subthing: 'Sub-Thing', item: 'Item',
        structure: 'Structure', structurething: 'Thing', structuresubthing: 'Sub-Thing',
        garageroom: 'Garage Room', garagething: 'Thing', garagesubthing: 'Sub-Thing'
    };
    return labels[type] || 'Linked to';
}

// ---------- Create Event Card ----------

/**
 * Creates a DOM element for a single calendar event occurrence.
 * @param {Object} occ - An occurrence object from generateOccurrences().
 * @param {Function} reloadFn - Callback to call after edit/delete/complete.
 * @returns {HTMLElement} The event card element.
 */
function createCalendarEventCard(occ, reloadFn) {
    var card = document.createElement('div');
    card.className = 'calendar-event-card';
    if (occ.completed) {
        card.classList.add('calendar-event-card--completed');
    }
    if (occ.status === 'in_progress') {
        card.classList.add('calendar-inprogress-card');
    }

    // Date line
    var dateLine = document.createElement('div');
    dateLine.className = 'calendar-event-date';
    var dateObj = new Date(occ.occurrenceDate + 'T00:00:00');
    dateLine.textContent = dateObj.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
    card.appendChild(dateLine);

    // Title
    var title = document.createElement('div');
    title.className = 'calendar-event-title';
    title.textContent = occ.title;
    card.appendChild(title);

    // Description (if any)
    if (occ.description) {
        var desc = document.createElement('div');
        desc.className = 'calendar-event-desc';
        desc.textContent = occ.description;
        card.appendChild(desc);
    }

    // Tag chips (if any) — resolved async since it needs a Firestore lookup;
    // includes archived tags so already-tagged events keep showing the name.
    if (occ.tagIds && occ.tagIds.length > 0) {
        var tagChipsEl = document.createElement('div');
        tagChipsEl.className = 'tag-chips-display';
        card.appendChild(tagChipsEl);
        renderTagChips(tagChipsEl, occ.tagIds);
    }

    // Zone / plant / entity association line — populated async, rendered as a
    // clickable link to the linked entity (needed by the #maintenance list, which
    // has no other way to reach the underlying zone/plant/vehicle/etc.).
    var targetEl = document.createElement('div');
    targetEl.className = 'calendar-event-target';
    card.appendChild(targetEl);
    (async function() {
        try {
            if (occ.targetType === 'plant' && occ.targetId) {
                var plantDoc = await userCol('plants').doc(occ.targetId).get();
                if (plantDoc.exists) {
                    _calAppendTargetLink(targetEl, 'Plant: ' + plantDoc.data().name, '#plant/' + occ.targetId);
                }
            } else if (occ.zoneIds && occ.zoneIds.length > 0) {
                var zoneEntries = [];
                for (var zi = 0; zi < occ.zoneIds.length; zi++) {
                    var zDoc = await userCol('zones').doc(occ.zoneIds[zi]).get();
                    if (zDoc.exists) zoneEntries.push({ id: occ.zoneIds[zi], name: zDoc.data().name });
                }
                if (zoneEntries.length > 0) {
                    targetEl.appendChild(document.createTextNode(zoneEntries.length === 1 ? 'Zone: ' : 'Zones: '));
                    zoneEntries.forEach(function(z, idx) {
                        var zLink = document.createElement('a');
                        zLink.href = '#zone/' + z.id;
                        zLink.textContent = z.name;
                        targetEl.appendChild(zLink);
                        if (idx < zoneEntries.length - 1) targetEl.appendChild(document.createTextNode(', '));
                    });
                }
            } else if ((occ.targetType === 'floor' || occ.targetType === 'room' || occ.targetType === 'thing') && occ.targetId) {
                // House context label — resolved by house.js to keep calendar.js yard-agnostic
                if (typeof getHouseContextLabel === 'function') {
                    var houseLabel = await getHouseContextLabel(occ.targetType, occ.targetId);
                    if (houseLabel) _calAppendTargetLink(targetEl, houseLabel, '#' + occ.targetType + '/' + occ.targetId);
                }
            } else if (occ.targetType && occ.targetId) {
                // Generic fallback for any other linkable entity type (vehicle, weed,
                // subthing, item, structure, structurething, structuresubthing,
                // garageroom, garagething, garagesubthing).
                var entityName = await resolveTargetName(occ.targetType, occ.targetId);
                if (entityName && entityName !== occ.targetId) {
                    _calAppendTargetLink(targetEl, _calTargetTypeLabel(occ.targetType) + ': ' + entityName, '#' + occ.targetType + '/' + occ.targetId);
                }
            }
        } catch (e) { /* silently skip if lookup fails */ }
    })();

    // Recurring badge
    if (occ.recurring) {
        var badge = document.createElement('div');
        badge.className = 'calendar-recurring-badge';
        var label = '\u{1F504} '; // 🔄
        if (occ.recurring.type === 'weekly') label += 'Weekly';
        else if (occ.recurring.type === 'monthly') label += 'Monthly';
        else if (occ.recurring.type === 'every_x_days') {
            label += 'Every ' + (occ.recurring.intervalDays || 14) + ' days';
        } else if (occ.recurring.type === 'reset_interval') {
            label += 'Every ' + (occ.recurring.intervalValue || 1) + ' ' +
                (occ.recurring.intervalUnit || 'months') + ' (resets on completion)';
        } else if (occ.recurring.type === 'fixed_months') {
            label += (occ.recurring.months || []).map(monthAbbrev).join(', ');
        }
        badge.textContent = label;
        card.appendChild(badge);
    }

    // Maintenance-schedule types (reset_interval, fixed_months) get extra status
    // handling (In Progress) and lose a couple of features that don't apply to them
    // (Reschedule \u2014 see below).
    var isMaintenanceType = occ.recurring &&
        (occ.recurring.type === 'reset_interval' || occ.recurring.type === 'fixed_months');

    // Completed badge
    if (occ.completed) {
        var completedBadge = document.createElement('span');
        completedBadge.className = 'calendar-completed-badge';
        completedBadge.textContent = '\u2713 Completed';
        card.appendChild(completedBadge);
    }

    // In Progress badge (maintenance schedules only)
    if (occ.status === 'in_progress') {
        var inProgressBadge = document.createElement('span');
        inProgressBadge.className = 'calendar-inprogress-badge';
        var startedText = '';
        if (occ.statusStartedAt) {
            var startedDateObj = new Date(occ.statusStartedAt + 'T00:00:00');
            startedText = ' since ' + startedDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        inProgressBadge.textContent = '\u{1F528} In Progress' + startedText;
        card.appendChild(inProgressBadge);
    }

    // Skipped badge (fixed_months only — user-initiated)
    if (occ.status === 'skipped') {
        var skippedBadge = document.createElement('span');
        skippedBadge.className = 'calendar-skipped-badge';
        skippedBadge.textContent = '⏭ Skipped';
        card.appendChild(skippedBadge);
    }

    // Unnecessary badge (fixed_months only — system-set via minSpacingDays)
    if (occ.status === 'unnecessary') {
        var unnecessaryBadge = document.createElement('span');
        unnecessaryBadge.className = 'calendar-skipped-badge';
        unnecessaryBadge.textContent = '➖ Unnecessary';
        card.appendChild(unnecessaryBadge);
    }

    // Overdue badge — suppressed for resolved statuses (skipped/unnecessary): showing
    // "OVERDUE" alongside "no action needed" would be a contradiction
    if (occ.overdue && occ.status !== 'skipped' && occ.status !== 'unnecessary') {
        var overdueBadge = document.createElement('span');
        overdueBadge.className = 'calendar-overdue-badge';
        overdueBadge.textContent = 'OVERDUE';
        card.appendChild(overdueBadge);
    }

    // Inline reschedule row — built early so the button click handler can reference it.
    // Hidden by default; revealed when the Reschedule button is clicked.
    // Reset-interval and fixed-months events don't get this: editing `date` has no
    // effect on either type's occurrence dates (reset_interval computes from
    // lastCompletedDate; fixed_months computes from months[]/dayOfMonth) — the
    // reset-interval equivalent is Postpone (see MS-4); fixed_months occurrences
    // use per-occurrence delete (cancelledDates) instead, which still works normally.
    var rescheduleRow = null;
    if (occ.overdue && !isMaintenanceType) {
        rescheduleRow = document.createElement('div');
        rescheduleRow.className = 'cal-reschedule-row hidden';

        var reschedLabel = document.createElement('label');
        reschedLabel.className = 'cal-reschedule-label';
        reschedLabel.textContent = 'New date:';
        rescheduleRow.appendChild(reschedLabel);

        var reschedInput = document.createElement('input');
        reschedInput.type = 'date';
        reschedInput.className = 'cal-reschedule-input';
        rescheduleRow.appendChild(reschedInput);

        var reschedConfirmBtn = document.createElement('button');
        reschedConfirmBtn.className = 'btn btn-small btn-primary';
        reschedConfirmBtn.textContent = 'Confirm';
        reschedConfirmBtn.addEventListener('click', function() {
            var newDate = reschedInput.value;
            if (!newDate) { alert('Please pick a new date.'); return; }
            calHandleReschedule(occ, newDate, reloadFn);
        });
        rescheduleRow.appendChild(reschedConfirmBtn);

        var reschedCancelBtn = document.createElement('button');
        reschedCancelBtn.className = 'btn btn-small btn-secondary';
        reschedCancelBtn.textContent = 'Cancel';
        reschedCancelBtn.addEventListener('click', function() {
            rescheduleRow.classList.add('hidden');
        });
        rescheduleRow.appendChild(reschedCancelBtn);
    }

    // Action buttons
    var actions = document.createElement('div');
    actions.className = 'calendar-event-actions';

    // Complete button — only shown for uncompleted occurrences
    if (!occ.completed) {
        var completeBtn = document.createElement('button');
        completeBtn.className = 'btn btn-small btn-complete';
        completeBtn.textContent = 'Complete';
        completeBtn.addEventListener('click', function() {
            openCompleteEventModal(occ, reloadFn);
        });
        actions.appendChild(completeBtn);
    }

    // In Progress / Edit Progress button — maintenance schedules only, uncompleted occurrences only
    if (isMaintenanceType && !occ.completed) {
        var inProgressBtn = document.createElement('button');
        inProgressBtn.className = 'btn btn-small btn-secondary';
        inProgressBtn.textContent = (occ.status === 'in_progress') ? 'Edit Progress' : 'In Progress';
        inProgressBtn.addEventListener('click', function() {
            openInProgressModal(occ, reloadFn);
        });
        actions.appendChild(inProgressBtn);
    }

    // Skip / Unskip button — fixed_months only, uncompleted occurrences only
    if (occ.recurring && occ.recurring.type === 'fixed_months' && !occ.completed) {
        var skipBtn = document.createElement('button');
        skipBtn.className = 'btn btn-small btn-secondary';
        skipBtn.textContent = (occ.status === 'skipped') ? 'Unskip' : 'Skip';
        skipBtn.addEventListener('click', function() {
            handleToggleSkip(occ, reloadFn);
        });
        actions.appendChild(skipBtn);
    }

    // Postpone button — reset_interval only, uncompleted occurrences only
    if (occ.recurring && occ.recurring.type === 'reset_interval' && !occ.completed) {
        var postponeBtn = document.createElement('button');
        postponeBtn.className = 'btn btn-small btn-secondary';
        postponeBtn.textContent = 'Postpone';
        postponeBtn.addEventListener('click', function() {
            openPostponeModal(occ, reloadFn);
        });
        actions.appendChild(postponeBtn);
    }

    // Clear Status button — for the system-set Unnecessary status only (Skip and
    // In Progress each have their own toggle/edit button that doubles as a clear path)
    if (occ.status === 'unnecessary') {
        var clearStatusBtn = document.createElement('button');
        clearStatusBtn.className = 'btn btn-small btn-secondary';
        clearStatusBtn.textContent = 'Clear Status';
        clearStatusBtn.addEventListener('click', function() {
            clearOccurrenceStatus(occ, reloadFn);
        });
        actions.appendChild(clearStatusBtn);
    }

    // Reschedule button — only shown for overdue occurrences (see exclusions above)
    if (occ.overdue && !isMaintenanceType) {
        var rescheduleBtn = document.createElement('button');
        rescheduleBtn.className = 'btn btn-small btn-reschedule';
        rescheduleBtn.textContent = 'Reschedule';
        rescheduleBtn.addEventListener('click', function() {
            rescheduleRow.classList.toggle('hidden');
            if (!rescheduleRow.classList.contains('hidden')) {
                reschedInput.focus();
            }
        });
        actions.appendChild(rescheduleBtn);
    }

    var editBtn = document.createElement('button');
    editBtn.className = 'btn btn-small btn-secondary';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', function() {
        openEditCalendarEventModal(occ.eventId, reloadFn, occ.occurrenceDate);
    });
    actions.appendChild(editBtn);

    var copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-small btn-secondary';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', function() {
        openCopyCalendarEventModal(occ.eventId, reloadFn);
    });
    actions.appendChild(copyBtn);

    // Add to Google Calendar link — shown only when GCal API is not connected (Mode 1)
    if (typeof gcalIsConnected === 'function' && !gcalIsConnected()) {
        var gcalLink = document.createElement('a');
        gcalLink.className = 'btn btn-small btn-secondary';
        gcalLink.textContent = '+ GCal';
        gcalLink.title = 'Add to Google Calendar';
        gcalLink.href = gcalYardDeepLink(occ);
        gcalLink.target = '_blank';
        gcalLink.rel = 'noopener';
        actions.appendChild(gcalLink);
    }

    card.appendChild(actions);

    // Append the reschedule row below the action buttons (only for overdue cards)
    if (rescheduleRow) {
        card.appendChild(rescheduleRow);
    }

    return card;
}

// ---------- Reschedule Overdue Event ----------

/**
 * Reschedules an overdue calendar event occurrence to a new date.
 *
 * For one-time events: the event's `date` field is updated directly.
 * For recurring events: the overdue occurrence date is added to `cancelledDates`
 * (so it stops showing as overdue), and the series `date` anchor is updated to
 * the new date so the pattern continues forward from there.
 *
 * @param {Object} occ     - The occurrence object from createCalendarEventCard.
 * @param {string} newDate - ISO date string "YYYY-MM-DD" for the new date.
 * @param {Function} reloadFn - Callback to refresh the calendar after saving.
 */
async function calHandleReschedule(occ, newDate, reloadFn) {
    try {
        var eventRef = userCol('calendarEvents').doc(occ.eventId);

        if (!occ.recurring) {
            // One-time event: simply move the date forward
            await eventRef.update({ date: newDate });
        } else {
            // Recurring event: cancel this specific occurrence and shift the series
            // anchor to the new date so all future occurrences flow from there.
            await eventRef.update({
                date: newDate,
                cancelledDates: firebase.firestore.FieldValue.arrayUnion(occ.occurrenceDate)
            });
        }

        // GCal sync — date changed, re-sync the event (fire-and-forget)
        if (typeof gcalIsConnected === 'function' && gcalIsConnected()) {
            (function(eid) {
                userCol('calendarEvents').doc(eid).get().then(function(snap) {
                    if (snap.exists) gcalSyncYardEvent({ id: snap.id, ...snap.data() });
                }).catch(function(e) { console.warn('gcalSyncYardEvent error:', e); });
            })(occ.eventId);
        }

        if (typeof reloadFn === 'function') reloadFn();

    } catch (err) {
        console.error('Error rescheduling event:', err);
        alert('Error rescheduling event. Please try again.');
    }
}

// ---------- Complete Event Modal ----------

/**
 * Opens the complete-event confirm modal.
 * @param {Object} occ - The occurrence object.
 * @param {Function} reloadFn - Callback to call after completing.
 */
function openCompleteEventModal(occ, reloadFn) {
    var dateObj = new Date(occ.occurrenceDate + 'T00:00:00');
    var dateStr = dateObj.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });

    document.getElementById('completeEventInfo').textContent = occ.title + ' — ' + dateStr;
    document.getElementById('completeEventNotesInput').value = '';

    pendingCompleteOccurrence = { occ: occ, reloadFn: reloadFn };

    openModal('completeEventModal');
    document.getElementById('completeEventNotesInput').focus();
}

/**
 * Handles confirming a complete-event action.
 * Creates an activity record and marks the event/occurrence as completed.
 */
async function handleCompleteEvent() {
    if (!pendingCompleteOccurrence) return;

    var occ = pendingCompleteOccurrence.occ;
    var reloadFn = pendingCompleteOccurrence.reloadFn;
    var notes = document.getElementById('completeEventNotesInput').value.trim();

    closeModal('completeEventModal');
    pendingCompleteOccurrence = null;

    // Reset-interval schedules anchor the next due date to the actual completion
    // date (today), not the stale occurrence date — matches "reset the timer from
    // when it was actually done," which may be well after the original due date.
    // All other event types keep logging against the occurrence's own date.
    var isResetInterval = occ.recurring && occ.recurring.type === 'reset_interval';
    var completionDate = isResetInterval ? formatDateISO(new Date()) : occ.occurrenceDate;

    try {
        // Collect chemicalIds from the saved action (if any)
        var chemicalIds = [];
        if (occ.savedActionId) {
            try {
                var actionDoc = await userCol('savedActions').doc(occ.savedActionId).get();
                if (actionDoc.exists) {
                    chemicalIds = normalizeChemicalIds(actionDoc.data());
                }
            } catch (e) { /* ignore */ }
        }

        // Create one activity per linked target.
        // Plant-linked events: one activity for the plant.
        // Zone-linked events: one activity per zone in zoneIds[].
        var zoneIds = occ.zoneIds || [];
        if (occ.targetType === 'plant' && occ.targetId) {
            await userCol('activities').add({
                targetType: 'plant',
                targetId: occ.targetId,
                description: occ.title,
                date: completionDate,
                notes: notes,
                chemicalIds: chemicalIds,
                savedActionId: occ.savedActionId || null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            for (var i = 0; i < zoneIds.length; i++) {
                await userCol('activities').add({
                    targetType: 'zone',
                    targetId: zoneIds[i],
                    description: occ.title,
                    date: completionDate,
                    notes: notes,
                    chemicalIds: chemicalIds,
                    savedActionId: occ.savedActionId || null,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }

        // Mark the event as completed in Firestore
        var eventRef = userCol('calendarEvents').doc(occ.eventId);
        var isFixedMonths = occ.recurring && occ.recurring.type === 'fixed_months';
        if (!occ.recurring) {
            // One-time event: mark as completed
            await eventRef.update({
                completed: true,
                completedAt: occ.occurrenceDate
            });
        } else if (isResetInterval) {
            // Reset-interval: advance the anchor to today (drives the next due date —
            // see generateOccurrences) and record a status entry for history, keyed by
            // the occurrence actually being completed (clears any In Progress entry
            // at that same key).
            var riUpdate = {};
            riUpdate.lastCompletedDate = completionDate;
            riUpdate['occurrenceStatus.' + occ.occurrenceDate] = { status: 'completed' };
            await eventRef.update(riUpdate);
        } else if (isFixedMonths) {
            // Fixed-months: status map only (no completedDates for this type) — clears
            // any In Progress entry at the same key.
            var fmUpdate = {};
            fmUpdate['occurrenceStatus.' + occ.occurrenceDate] = { status: 'completed' };

            // Auto-Unnecessary: if the next scheduled occurrence falls within
            // minSpacingDays of today (the actual moment of completion — not the
            // possibly-stale occurrence date, since a late completion is exactly what
            // should trigger this), it's redundant to do it again that soon.
            var minSpacing = occ.recurring.minSpacingDays || 45;
            var nextFmDate = _fmNextOccurrenceDate(occ.recurring, new Date(occ.occurrenceDate + 'T00:00:00'));
            if (nextFmDate) {
                var todayForSpacing = new Date();
                todayForSpacing.setHours(0, 0, 0, 0);
                var gapDays = Math.round((nextFmDate - todayForSpacing) / 86400000);
                if (gapDays <= minSpacing) {
                    fmUpdate['occurrenceStatus.' + formatDateISO(nextFmDate)] = { status: 'unnecessary' };
                }
            }

            await eventRef.update(fmUpdate);
        } else {
            // Recurring event: add this occurrence date to completedDates array
            await eventRef.update({
                completedDates: firebase.firestore.FieldValue.arrayUnion(occ.occurrenceDate)
            });
        }

        // Create a journal tracking item if the event has a tracking category configured.
        // One-way: we create on attend but never delete on un-attend.
        // Guard: skip if a tracking item already exists for this date + category.
        if (occ.trackingCategory) {
            try {
                var existingSnap = await userCol('journalTrackingItems')
                    .where('date', '==', completionDate)
                    .where('category', '==', occ.trackingCategory)
                    .limit(1)
                    .get();
                if (existingSnap.empty) {
                    await userCol('journalTrackingItems').add({
                        date: completionDate,
                        category: occ.trackingCategory,
                        value: occ.description || occ.title || '',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    console.log('Tracking item created:', occ.trackingCategory, completionDate);
                } else {
                    console.log('Tracking item already exists — skipped:', occ.trackingCategory, completionDate);
                }
            } catch (e) {
                console.warn('Could not create tracking item on attend:', e);
            }
        }

        console.log('Event completed:', occ.title, completionDate, '— activities created:', occ.targetType === 'plant' ? 1 : zoneIds.length);

        // GCal sync — re-read updated doc so ✓ prefix is applied (fire-and-forget)
        if (typeof gcalIsConnected === 'function' && gcalIsConnected()) {
            (function(eid) {
                userCol('calendarEvents').doc(eid).get().then(function(snap) {
                    if (snap.exists) gcalSyncYardEvent({ id: snap.id, ...snap.data() });
                }).catch(function(e) { console.warn('gcalSyncYardEvent error:', e); });
            })(occ.eventId);
        }

        // Reload the activity history if we're on a zone/plant detail page
        if (occ.targetType === 'plant' && occ.targetId) {
            loadActivities('plant', occ.targetId, 'plantActivityContainer', 'plantActivityEmptyState');
        } else if (zoneIds.length > 0) {
            // Reload activity for any zone currently displayed
            if (window.currentZone && zoneIds.indexOf(window.currentZone.id) >= 0) {
                loadActivities('zone', window.currentZone.id, 'zoneActivityContainer', 'zoneActivityEmptyState');
            }
        }

        // Reload the event list
        if (typeof reloadFn === 'function') {
            reloadFn();
        }

    } catch (error) {
        console.error('Error completing event:', error);
        alert('Error completing event. Check console for details.');
    }
}

// ---------- Occurrence Status Helpers (maintenance schedules only) ----------

/**
 * Writes an occurrenceStatus entry for a single occurrence. Generic helper used
 * by In Progress, Skip, and the auto-Unnecessary logic.
 * @param {Object} occ - The occurrence object.
 * @param {Object} statusObj - e.g. { status: 'skipped' }.
 * @param {Function|null} reloadFn - Callback to call after saving.
 */
async function setOccurrenceStatus(occ, statusObj, reloadFn) {
    try {
        var update = {};
        update['occurrenceStatus.' + occ.occurrenceDate] = statusObj;
        await userCol('calendarEvents').doc(occ.eventId).update(update);
        console.log('Occurrence status set:', occ.title, occ.occurrenceDate, statusObj.status);
        if (typeof reloadFn === 'function') reloadFn();
    } catch (error) {
        console.error('Error updating occurrence status:', error);
        alert('Error updating status. Check console for details.');
    }
}

/**
 * Clears the occurrenceStatus entry for a single occurrence, reverting it to
 * plain due/overdue.
 * @param {Object} occ - The occurrence object.
 * @param {Function|null} reloadFn - Callback to call after clearing.
 */
async function clearOccurrenceStatus(occ, reloadFn) {
    try {
        var update = {};
        update['occurrenceStatus.' + occ.occurrenceDate] = firebase.firestore.FieldValue.delete();
        await userCol('calendarEvents').doc(occ.eventId).update(update);
        console.log('Occurrence status cleared:', occ.title, occ.occurrenceDate);
        if (typeof reloadFn === 'function') reloadFn();
    } catch (error) {
        console.error('Error clearing occurrence status:', error);
        alert('Error clearing status. Check console for details.');
    }
}

// ---------- In Progress Modal (maintenance schedules only) ----------

/**
 * Opens the In Progress modal for a reset_interval or fixed_months occurrence.
 * Pre-fills the start date and notes if the occurrence is already In Progress
 * (editing), otherwise defaults the start date to today.
 * @param {Object} occ - The occurrence object.
 * @param {Function} reloadFn - Callback to call after saving.
 */
function openInProgressModal(occ, reloadFn) {
    var dateObj = new Date(occ.occurrenceDate + 'T00:00:00');
    var dateStr = dateObj.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
    document.getElementById('inProgressInfo').textContent = occ.title + ' — ' + dateStr;

    var isEditing = occ.status === 'in_progress';
    document.getElementById('inProgressStartDateInput').value = isEditing && occ.statusStartedAt
        ? occ.statusStartedAt
        : formatDateISO(new Date());
    document.getElementById('inProgressNotesInput').value = isEditing ? (occ.statusNotes || '') : '';
    document.getElementById('inProgressClearBtn').style.display = isEditing ? 'inline-block' : 'none';

    pendingInProgressOccurrence = { occ: occ, reloadFn: reloadFn };

    openModal('inProgressModal');
    document.getElementById('inProgressStartDateInput').focus();
}

/**
 * Saves the In Progress status (start date + notes) for the pending occurrence.
 */
async function handleSaveInProgress() {
    if (!pendingInProgressOccurrence) return;

    var occ = pendingInProgressOccurrence.occ;
    var reloadFn = pendingInProgressOccurrence.reloadFn;
    var startedAt = document.getElementById('inProgressStartDateInput').value || formatDateISO(new Date());
    var notes = document.getElementById('inProgressNotesInput').value.trim();

    closeModal('inProgressModal');
    pendingInProgressOccurrence = null;

    setOccurrenceStatus(occ, { status: 'in_progress', startedAt: startedAt, notes: notes }, reloadFn);
}

/**
 * Clears the In Progress status for the pending occurrence, reverting it to
 * plain due/overdue.
 */
function handleClearInProgress() {
    if (!pendingInProgressOccurrence) return;

    var occ = pendingInProgressOccurrence.occ;
    var reloadFn = pendingInProgressOccurrence.reloadFn;

    closeModal('inProgressModal');
    pendingInProgressOccurrence = null;

    clearOccurrenceStatus(occ, reloadFn);
}

// ---------- Skip (fixed_months only) ----------

/**
 * Toggles Skipped status for a fixed_months occurrence. No confirmation on
 * un-skip (non-destructive); confirms before skipping since it's a deliberate
 * "not doing this one" choice. No Activity is logged either way.
 * @param {Object} occ - The occurrence object.
 * @param {Function} reloadFn - Callback to call after saving.
 */
function handleToggleSkip(occ, reloadFn) {
    if (occ.status === 'skipped') {
        clearOccurrenceStatus(occ, reloadFn);
        return;
    }
    if (!confirm('Skip this occurrence? No activity will be logged, and the next scheduled occurrence is unaffected.')) return;
    setOccurrenceStatus(occ, { status: 'skipped' }, reloadFn);
}

// ---------- Postpone Modal (reset_interval only) ----------

/**
 * Opens the Postpone modal for a reset_interval occurrence.
 * @param {Object} occ - The occurrence object.
 * @param {Function} reloadFn - Callback to call after saving.
 */
function openPostponeModal(occ, reloadFn) {
    var dateObj = new Date(occ.occurrenceDate + 'T00:00:00');
    var dateStr = dateObj.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
    document.getElementById('postponeInfo').textContent = occ.title + ' — ' + dateStr;
    document.getElementById('postponeDateInput').value = '';

    pendingPostponeOccurrence = { occ: occ, reloadFn: reloadFn };

    openModal('postponeModal');
}

/**
 * Sets the postpone date input to today + N days (used by the quick-pick buttons).
 * @param {number} days - Number of days from today.
 */
function _calSetPostponeQuickPick(days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    document.getElementById('postponeDateInput').value = formatDateISO(d);
}

/**
 * Saves postponedUntil on the pending occurrence's event. While in the future,
 * the reset_interval occurrence is fully suppressed from display (see
 * generateOccurrences) — the real due date is untouched.
 */
async function handleSavePostpone() {
    if (!pendingPostponeOccurrence) return;

    var occ = pendingPostponeOccurrence.occ;
    var reloadFn = pendingPostponeOccurrence.reloadFn;
    var postponedUntil = document.getElementById('postponeDateInput').value;

    if (!postponedUntil) {
        alert('Please pick a date, or use one of the quick-pick buttons.');
        return;
    }

    closeModal('postponeModal');
    pendingPostponeOccurrence = null;

    try {
        await userCol('calendarEvents').doc(occ.eventId).update({ postponedUntil: postponedUntil });
        console.log('Postponed:', occ.title, 'until', postponedUntil);
        if (typeof reloadFn === 'function') reloadFn();
    } catch (error) {
        console.error('Error postponing event:', error);
        alert('Error postponing. Check console for details.');
    }
}

// ---------- Add Event Modal ----------

/**
 * Opens the add-event modal with blank fields.
 * @param {string|null} targetType - Optional: "zone" or "plant" (when called from a detail page).
 * @param {string|null} targetId - Optional: The target's Firestore document ID.
 * @param {Function|null} reloadFn - Optional: Callback to reload after save.
 */
async function openAddCalendarEventModal(targetType, targetId, reloadFn) {
    var modal = document.getElementById('calendarEventModal');
    var modalTitle = document.getElementById('calendarEventModalTitle');

    modalTitle.textContent = 'Add Event';

    document.getElementById('calEventTitleInput').value = '';
    document.getElementById('calEventDescInput').value = '';
    document.getElementById('calEventTypeSelect').value = 'one-time';
    document.getElementById('calEventDateInput').value = '';
    document.getElementById('calEventFrequencySelect').value = 'weekly';
    document.getElementById('calEventIntervalInput').value = '14';
    document.getElementById('calResetIntervalValueInput').value = '3';
    document.getElementById('calResetIntervalUnitSelect').value = 'months';
    _calSetFixedMonthCheckboxes([]);
    document.getElementById('calFixedMonthsDayInput').value = '1';
    document.getElementById('calFixedMonthsSpacingInput').value = '45';

    modal.dataset.mode = 'add';
    modal.dataset.targetType = targetType || '';
    modal.dataset.targetId = targetId || '';
    modal.dataset.occurrenceDate = '';

    // Hide delete button in add mode
    document.getElementById('calEventDeleteBtn').style.display = 'none';

    // Show linked entity label if opened from a zone/plant
    var linkedEntityEl = document.getElementById('calEventLinkedEntity');
    if (targetType && targetId) {
        var entityName = await resolveTargetName(targetType, targetId);
        linkedEntityEl.textContent = 'Adding event for: ' + entityName;
        linkedEntityEl.style.display = 'block';
    } else {
        linkedEntityEl.style.display = 'none';
    }

    // Show zone checkboxes only for yard-type events (zone, weed, or standalone).
    // Entity-linked events (plant, thing, room, vehicle, etc.) don't need a zone.
    var zoneSection = document.getElementById('calEventZoneSection');
    var isYardType = (!targetType || targetType === 'zone' || targetType === 'weed');
    if (!isYardType) {
        zoneSection.style.display = 'none';
    } else {
        zoneSection.style.display = 'block';
        // Pre-check the current zone if opened from a zone page
        var preSelected = (targetType === 'zone' && targetId) ? [targetId] : [];
        await loadCalEventZoneCheckboxes(preSelected);
    }

    // Load saved actions into dropdown
    await populateSavedActionsDropdown('calEventSavedActionSelect', null);

    // Load tag checkboxes (none pre-selected for a new event)
    await buildTagCheckboxList('calEventTagsCheckboxList', []);

    // Reset tracking-on-attended fields
    var trackChk = document.getElementById('calEventTrackingEnabled');
    if (trackChk) trackChk.checked = false;
    var trackRow = document.getElementById('calEventTrackingRow');
    if (trackRow) trackRow.classList.add('hidden');
    await _calLoadTrackingCategories('');

    // Store reload callback
    calendarEventModalReloadFn = reloadFn || null;

    toggleRecurringOptions();
    openModal('calendarEventModal');
    document.getElementById('calEventTitleInput').focus();
}

// ---------- Edit Event Modal ----------

/**
 * Opens the edit-event modal, loading the event data from Firestore.
 * @param {string} eventId - The calendar event's Firestore document ID.
 * @param {Function|null} reloadFn - Optional: Callback to reload after save.
 * @param {string|null} occurrenceDate - For recurring events: the specific occurrence date being edited.
 *   Stored in modal.dataset.occurrenceDate so the delete handler can offer per-occurrence delete.
 */
async function openEditCalendarEventModal(eventId, reloadFn, occurrenceDate) {
    var modal = document.getElementById('calendarEventModal');
    var modalTitle = document.getElementById('calendarEventModalTitle');

    modalTitle.textContent = 'Edit Event';

    try {
        var doc = await userCol('calendarEvents').doc(eventId).get();
        if (!doc.exists) {
            alert('Event not found.');
            return;
        }

        var event = doc.data();

        document.getElementById('calEventTitleInput').value = event.title || '';
        document.getElementById('calEventDescInput').value = event.description || '';
        document.getElementById('calEventDateInput').value = event.date || '';

        if (event.recurring) {
            document.getElementById('calEventTypeSelect').value = 'recurring';
            document.getElementById('calEventFrequencySelect').value = event.recurring.type || 'weekly';
            document.getElementById('calEventIntervalInput').value = event.recurring.intervalDays || 14;
            document.getElementById('calResetIntervalValueInput').value = event.recurring.intervalValue || 3;
            document.getElementById('calResetIntervalUnitSelect').value = event.recurring.intervalUnit || 'months';
            _calSetFixedMonthCheckboxes(event.recurring.months || []);
            document.getElementById('calFixedMonthsDayInput').value = event.recurring.dayOfMonth || 1;
            document.getElementById('calFixedMonthsSpacingInput').value = event.recurring.minSpacingDays || 45;
        } else {
            document.getElementById('calEventTypeSelect').value = 'one-time';
            document.getElementById('calEventFrequencySelect').value = 'weekly';
            document.getElementById('calEventIntervalInput').value = '14';
            document.getElementById('calResetIntervalValueInput').value = '3';
            document.getElementById('calResetIntervalUnitSelect').value = 'months';
            _calSetFixedMonthCheckboxes([]);
            document.getElementById('calFixedMonthsDayInput').value = '1';
            document.getElementById('calFixedMonthsSpacingInput').value = '45';
        }

        modal.dataset.mode = 'edit';
        modal.dataset.editId = eventId;
        modal.dataset.targetType = event.targetType || '';
        modal.dataset.targetId = event.targetId || '';
        modal.dataset.occurrenceDate = occurrenceDate || '';

        // Show delete button in edit mode
        document.getElementById('calEventDeleteBtn').style.display = 'inline-block';

        // Entity-linked events (not zone/weed/standalone): show entity label, hide zone section.
        // Zone/weed/standalone events: hide label, show editable zone checkboxes.
        var linkedEntityEl = document.getElementById('calEventLinkedEntity');
        var zoneSection = document.getElementById('calEventZoneSection');
        var editIsYardType = (!event.targetType || event.targetType === 'zone' || event.targetType === 'weed');

        if (!editIsYardType && event.targetId) {
            var entityName = await resolveTargetName(event.targetType, event.targetId);
            linkedEntityEl.textContent = 'Linked to: ' + entityName;
            linkedEntityEl.style.display = 'block';
            zoneSection.style.display = 'none';
        } else {
            linkedEntityEl.style.display = 'none';
            zoneSection.style.display = 'block';
            // Pre-select from zoneIds; fall back to targetId for old-style zone-linked events
            var currentZoneIds = event.zoneIds || [];
            if (currentZoneIds.length === 0 && event.targetType === 'zone' && event.targetId) {
                currentZoneIds = [event.targetId];
            }
            await loadCalEventZoneCheckboxes(currentZoneIds);
        }

        // Load saved actions dropdown with current selection
        await populateSavedActionsDropdown('calEventSavedActionSelect', event.savedActionId || null);

        // Load tag checkboxes with current selection
        await buildTagCheckboxList('calEventTagsCheckboxList', event.tagIds || []);

        // Populate tracking-on-attended fields
        var trackingCat = event.trackingCategory || '';
        var trackChk = document.getElementById('calEventTrackingEnabled');
        var trackRow = document.getElementById('calEventTrackingRow');
        if (trackChk) trackChk.checked = !!trackingCat;
        if (trackRow) trackRow.classList.toggle('hidden', !trackingCat);
        await _calLoadTrackingCategories(trackingCat);

        // Store reload callback
        calendarEventModalReloadFn = reloadFn || null;

        toggleRecurringOptions();
        openModal('calendarEventModal');
        document.getElementById('calEventTitleInput').focus();

    } catch (error) {
        console.error('Error loading event for edit:', error);
        alert('Error loading event.');
    }
}

// ---------- Copy Event Modal ----------

/**
 * Opens the add-event modal pre-filled with a copy of an existing event.
 * The date is cleared so the user must pick a new date.
 * @param {string} eventId - The source event's Firestore document ID.
 * @param {Function|null} reloadFn - Optional: Callback to reload after save.
 */
async function openCopyCalendarEventModal(eventId, reloadFn) {
    var modal = document.getElementById('calendarEventModal');
    var modalTitle = document.getElementById('calendarEventModalTitle');

    modalTitle.textContent = 'Copy Event';

    try {
        var doc = await userCol('calendarEvents').doc(eventId).get();
        if (!doc.exists) {
            alert('Event not found.');
            return;
        }

        var event = doc.data();

        document.getElementById('calEventTitleInput').value = event.title || '';
        document.getElementById('calEventDescInput').value = event.description || '';

        // Set to one-time with blank date so user must pick a new date
        document.getElementById('calEventTypeSelect').value = 'one-time';
        document.getElementById('calEventDateInput').value = '';
        document.getElementById('calEventFrequencySelect').value = 'weekly';
        document.getElementById('calEventIntervalInput').value = '14';
        document.getElementById('calResetIntervalValueInput').value = '3';
        document.getElementById('calResetIntervalUnitSelect').value = 'months';
        _calSetFixedMonthCheckboxes([]);
        document.getElementById('calFixedMonthsDayInput').value = '1';
        document.getElementById('calFixedMonthsSpacingInput').value = '45';

        modal.dataset.mode = 'add'; // It's a new event (copy)
        modal.dataset.targetType = '';
        modal.dataset.targetId = '';

        // Hide delete button in copy mode
        document.getElementById('calEventDeleteBtn').style.display = 'none';

        document.getElementById('calEventLinkedEntity').style.display = 'none';

        // Show empty zone checkboxes (copy starts with no zone selections)
        var zoneSection = document.getElementById('calEventZoneSection');
        zoneSection.style.display = 'block';
        await loadCalEventZoneCheckboxes([]);

        // Load saved actions dropdown (no pre-selection for a copy)
        await populateSavedActionsDropdown('calEventSavedActionSelect', null);

        // Tags are not carried over to the copy (consistent with saved action above)
        await buildTagCheckboxList('calEventTagsCheckboxList', []);

        calendarEventModalReloadFn = reloadFn || null;

        toggleRecurringOptions();
        openModal('calendarEventModal');
        document.getElementById('calEventDateInput').focus();

    } catch (error) {
        console.error('Error loading event for copy:', error);
        alert('Error loading event.');
    }
}

// ---------- Save Event ----------

/**
 * Handles the save button in the calendar event modal (add or edit).
 */
async function handleCalendarEventModalSave() {
    var modal = document.getElementById('calendarEventModal');
    var title = document.getElementById('calEventTitleInput').value.trim();
    var description = document.getElementById('calEventDescInput').value.trim();
    var eventType = document.getElementById('calEventTypeSelect').value;
    var date = document.getElementById('calEventDateInput').value;
    var frequency = document.getElementById('calEventFrequencySelect').value;
    var intervalDays = parseInt(document.getElementById('calEventIntervalInput').value) || 14;
    var resetIntervalValue = parseInt(document.getElementById('calResetIntervalValueInput').value) || 3;
    var resetIntervalUnit = document.getElementById('calResetIntervalUnitSelect').value || 'months';
    var fixedMonths = _calGetFixedMonthCheckboxes();
    var fixedMonthsDay = parseInt(document.getElementById('calFixedMonthsDayInput').value) || 1;
    var fixedMonthsSpacing = parseInt(document.getElementById('calFixedMonthsSpacingInput').value) || 45;
    var savedActionId = document.getElementById('calEventSavedActionSelect').value || null;
    var trackingEnabled = document.getElementById('calEventTrackingEnabled').checked;
    var trackingCategory = (trackingEnabled && document.getElementById('calEventTrackingCategory').value) || '';

    // Collect selected zone IDs (only shown for non-plant events)
    var zoneIds = [];
    var zoneSection = document.getElementById('calEventZoneSection');
    if (zoneSection.style.display !== 'none') {
        var zoneCheckboxes = document.querySelectorAll('#calEventZoneCheckboxList input[type="checkbox"]:checked');
        zoneCheckboxes.forEach(function(cb) {
            zoneIds.push(cb.value);
        });
    }

    // Collect selected tag IDs
    var tagIds = getCheckedTagIds('calEventTagsCheckboxList');

    if (!title) {
        alert('Please enter a title.');
        return;
    }

    if (!date) {
        alert('Please select a date.');
        return;
    }

    if (eventType === 'recurring' && frequency === 'fixed_months' && fixedMonths.length === 0) {
        alert('Please select at least one month.');
        return;
    }

    // Zone selection is only required for standalone or yard-linked (zone/weed) events.
    // Entity-linked events (plant, thing, room, vehicle, etc.) carry their own location context.
    var saveTargetType = modal.dataset.targetType || '';
    var isEntityLinked = saveTargetType && saveTargetType !== 'zone' && saveTargetType !== 'weed';
    if (!isEntityLinked && zoneIds.length === 0) {
        alert('Please link this event to at least one zone.');
        return;
    }

    // Build recurring object (null for one-time)
    var recurring = null;
    if (eventType === 'recurring') {
        recurring = { type: frequency };
        if (frequency === 'every_x_days') {
            recurring.intervalDays = intervalDays;
        } else if (frequency === 'reset_interval') {
            recurring.intervalValue = resetIntervalValue;
            recurring.intervalUnit = resetIntervalUnit;
        } else if (frequency === 'fixed_months') {
            recurring.months = fixedMonths;
            recurring.dayOfMonth = fixedMonthsDay;
            recurring.minSpacingDays = fixedMonthsSpacing;
        }
    }

    var targetType = modal.dataset.targetType || null;
    var targetId = modal.dataset.targetId || null;
    var mode = modal.dataset.mode;

    try {
        if (mode === 'add') {
            var newRef = await userCol('calendarEvents').add({
                title: title,
                description: description,
                date: date,
                recurring: recurring,
                targetType: targetType || null,
                targetId: targetId || null,
                zoneIds: zoneIds,
                tagIds: tagIds,
                savedActionId: savedActionId,
                trackingCategory: trackingCategory,
                completed: false,
                completedDates: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('Calendar event added:', title);
            // GCal sync (fire-and-forget)
            if (typeof gcalIsConnected === 'function' && gcalIsConnected()) {
                (function(ref) {
                    ref.get().then(function(snap) {
                        if (snap.exists) gcalSyncYardEvent({ id: snap.id, ...snap.data() });
                    }).catch(function(e) { console.warn('gcalSyncYardEvent error:', e); });
                })(newRef);
            }

        } else if (mode === 'edit') {
            var eventId = modal.dataset.editId;
            await userCol('calendarEvents').doc(eventId).update({
                title: title,
                description: description,
                date: date,
                recurring: recurring,
                targetType: targetType || null,
                targetId: targetId || null,
                zoneIds: zoneIds,
                tagIds: tagIds,
                savedActionId: savedActionId,
                trackingCategory: trackingCategory
            });
            console.log('Calendar event updated:', title);
            // GCal sync (fire-and-forget)
            if (typeof gcalIsConnected === 'function' && gcalIsConnected()) {
                (function(eid) {
                    userCol('calendarEvents').doc(eid).get().then(function(snap) {
                        if (snap.exists) gcalSyncYardEvent({ id: snap.id, ...snap.data() });
                    }).catch(function(e) { console.warn('gcalSyncYardEvent error:', e); });
                })(eventId);
            }
        }

        closeModal('calendarEventModal');

        // Call the stored reload function, or fall back to loadCalendar
        if (typeof calendarEventModalReloadFn === 'function') {
            calendarEventModalReloadFn();
        } else {
            loadCalendar();
        }

    } catch (error) {
        console.error('Error saving calendar event:', error);
        alert('Error saving event. Check console for details.');
    }
}

// ---------- Delete Event ----------

/**
 * Deletes a calendar event after confirmation.
 * For recurring events, warns that ALL occurrences will be deleted.
 * @param {string} eventId - The event's Firestore document ID.
 * @param {Function|null} reloadFn - Optional: Callback to reload after delete.
 */
async function handleDeleteCalendarEvent(eventId, reloadFn) {
    try {
        // Read before delete so we can clean up GCal
        var gcalDocData = null;
        if (typeof gcalIsConnected === 'function' && gcalIsConnected()) {
            try {
                var gcalSnap = await userCol('calendarEvents').doc(eventId).get();
                if (gcalSnap.exists) gcalDocData = { id: gcalSnap.id, ...gcalSnap.data() };
            } catch (e) { /* skip — not worth blocking the delete */ }
        }

        await userCol('calendarEvents').doc(eventId).delete();
        console.log('Calendar event deleted:', eventId);

        // GCal cleanup (fire-and-forget)
        if (gcalDocData) {
            gcalDeleteYardEvent(gcalDocData).catch(function(e) { console.warn('gcalDeleteYardEvent error:', e); });
        }

        if (typeof reloadFn === 'function') {
            reloadFn();
        } else {
            loadCalendar();
        }

    } catch (error) {
        console.error('Error deleting calendar event:', error);
        alert('Error deleting event. Check console for details.');
    }
}

// ---------- Helpers ----------

/**
 * Populates the saved action dropdown in the calendar event modal.
 * @param {string} selectId - The ID of the select element.
 * @param {string|null} selectedId - The ID to pre-select (or null for none).
 */
async function populateSavedActionsDropdown(selectId, selectedId) {
    var select = document.getElementById(selectId);
    select.innerHTML = '<option value="">-- None --</option>';

    try {
        var actions = await getAllSavedActions();
        actions.forEach(function(action) {
            var option = document.createElement('option');
            option.value = action.id;
            option.textContent = action.name;
            if (action.id === selectedId) option.selected = true;
            select.appendChild(option);
        });
    } catch (e) {
        console.error('Error loading saved actions for calendar modal:', e);
    }
}

/**
 * When a saved action is selected in the calendar event modal,
 * pre-fill the title and description from the saved action.
 */
async function handleCalEventSavedActionSelect() {
    var actionId = document.getElementById('calEventSavedActionSelect').value;
    if (!actionId) return;

    try {
        var doc = await userCol('savedActions').doc(actionId).get();
        if (!doc.exists) return;
        var action = doc.data();
        if (action.name) {
            document.getElementById('calEventTitleInput').value = action.name;
        }
        if (action.description) {
            document.getElementById('calEventDescInput').value = action.description;
        }
    } catch (e) {
        console.error('Error loading saved action for calendar modal:', e);
    }
}

/**
 * Resolves a targetType/targetId to a human-readable name.
 * @param {string} targetType - "zone" or "plant"
 * @param {string} targetId - The Firestore document ID.
 * @returns {Promise<string>} The entity name.
 */
async function resolveTargetName(targetType, targetId) {
    // Maps each targetType to its Firestore collection name
    var TYPE_COLLECTION = {
        plant:             'plants',
        zone:              'zones',
        weed:              'weeds',
        floor:             'floors',
        room:              'rooms',
        thing:             'things',
        subthing:          'subThings',
        item:              'subThingItems',
        structure:         'structures',
        structurething:    'structureThings',
        structuresubthing: 'structureSubThings',
        vehicle:           'vehicles',
        garageroom:        'garageRooms',
        garagething:       'garageThings',
        garagesubthing:    'garageSubThings'
    };
    try {
        var col = TYPE_COLLECTION[targetType];
        if (!col) return targetId;
        var doc = await userCol(col).doc(targetId).get();
        if (doc.exists) {
            var data = doc.data();
            // Vehicles have no single "name" field — build one from year/make/model,
            // same pattern used elsewhere in the app (e.g. app.js clCaptureContext).
            if (targetType === 'vehicle') {
                return [data.year, data.make, data.model].filter(Boolean).join(' ') || targetId;
            }
            return data.name || targetId;
        }
    } catch (e) { /* ignore */ }
    return targetId;
}

// ---------- Zone Checkbox Helper ----------

/**
 * Populates the zone checkbox list in the calendar event modal.
 * Loads all zones in hierarchy order and pre-checks the given IDs.
 * @param {string[]} selectedZoneIds - Zone IDs to pre-check.
 */
async function loadCalEventZoneCheckboxes(selectedZoneIds) {
    var container = document.getElementById('calEventZoneCheckboxList');
    container.innerHTML = '<p style="margin:0;font-size:0.85rem;color:#888">Loading zones...</p>';

    try {
        var snapshot = await userCol('zones').get();
        var allZones = [];
        snapshot.forEach(function(doc) {
            allZones.push({ id: doc.id, ...doc.data() });
        });

        // buildZoneOptionsTree is defined in plants.js (loaded before calendar.js)
        var options = buildZoneOptionsTree(allZones, null, '');

        container.innerHTML = '';

        if (options.length === 0) {
            container.innerHTML = '<p class="empty-state" style="margin:0">No zones created yet.</p>';
            return;
        }

        options.forEach(function(opt) {
            var wrapper = document.createElement('label');
            wrapper.className = 'zone-checkbox-item';

            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = opt.id;
            checkbox.checked = selectedZoneIds.indexOf(opt.id) !== -1;

            var text = document.createElement('span');
            text.textContent = opt.label;

            wrapper.appendChild(checkbox);
            wrapper.appendChild(text);
            container.appendChild(wrapper);
        });

    } catch (error) {
        console.error('Error loading zones for calendar event modal:', error);
        container.innerHTML = '<p class="empty-state" style="margin:0">Error loading zones.</p>';
    }
}

/**
 * Checks/unchecks the fixed_months month checkboxes to match the given month numbers.
 * @param {number[]} months - Month numbers (1-12) to pre-check. Empty array clears all.
 */
function _calSetFixedMonthCheckboxes(months) {
    var boxes = document.querySelectorAll('.calFixedMonthCheckbox');
    boxes.forEach(function(cb) {
        cb.checked = months.indexOf(parseInt(cb.value)) !== -1;
    });
}

/**
 * Reads the currently-checked fixed_months month checkboxes.
 * @returns {number[]} Sorted array of checked month numbers (1-12).
 */
function _calGetFixedMonthCheckboxes() {
    var checked = document.querySelectorAll('.calFixedMonthCheckbox:checked');
    var months = [];
    checked.forEach(function(cb) { months.push(parseInt(cb.value)); });
    months.sort(function(a, b) { return a - b; });
    return months;
}

// ---------- UI Helpers ----------

/**
 * Shows/hides the recurring options based on the event type dropdown.
 * Also updates the date label text.
 */
function toggleRecurringOptions() {
    var eventType = document.getElementById('calEventTypeSelect').value;
    var recurringOptions = document.getElementById('calRecurringOptions');
    var dateLabel = document.getElementById('calEventDateLabel');

    if (eventType === 'recurring') {
        recurringOptions.style.display = 'block';
        dateLabel.textContent = 'Start Date';
    } else {
        recurringOptions.style.display = 'none';
        dateLabel.textContent = 'Date';
    }

    toggleIntervalInput();
}

/**
 * Shows/hides the "Every X Days" and "Reset Interval" fields based on frequency selection.
 */
function toggleIntervalInput() {
    var frequency = document.getElementById('calEventFrequencySelect').value;
    var intervalGroup = document.getElementById('calIntervalGroup');
    var resetIntervalGroup = document.getElementById('calResetIntervalGroup');
    var fixedMonthsGroup = document.getElementById('calFixedMonthsGroup');

    intervalGroup.style.display = (frequency === 'every_x_days') ? 'block' : 'none';
    resetIntervalGroup.style.display = (frequency === 'reset_interval') ? 'block' : 'none';
    fixedMonthsGroup.style.display = (frequency === 'fixed_months') ? 'block' : 'none';
}

/**
 * Show/hide the tracking category dropdown based on the checkbox state.
 */
function _calToggleTrackingRow() {
    var enabled = document.getElementById('calEventTrackingEnabled').checked;
    var row = document.getElementById('calEventTrackingRow');
    if (row) row.classList.toggle('hidden', !enabled);
}

/**
 * Load all journal tracking categories into the calEventTrackingCategory dropdown.
 * @param {string} [selectedCat] - Category name to pre-select.
 */
async function _calLoadTrackingCategories(selectedCat) {
    var select = document.getElementById('calEventTrackingCategory');
    if (!select) return;
    try {
        var snap = await userCol('journalCategories').orderBy('name').get();
        var html = '<option value="">-- Select Category --</option>';
        snap.forEach(function(doc) {
            var name = doc.data().name || '';
            var sel = (name === selectedCat) ? ' selected' : '';
            html += '<option value="' + _calEsc(name) + '"' + sel + '>' + _calEsc(name) + '</option>';
        });
        select.innerHTML = html;
    } catch (e) {
        console.warn('Could not load journal categories for calendar tracking:', e);
    }
}

/** Minimal HTML-escape for option values/text. */
function _calEsc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ---------- Date Formatting Helpers ----------

/**
 * Formats a Date object as "YYYY-MM-DD".
 * @param {Date} date - The date to format.
 * @returns {string} The formatted date string.
 */
function formatDateISO(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
}

// ---------- Delete Recurring Event Modal ----------

/**
 * Opens the modal that lets the user choose: delete just this occurrence or all occurrences.
 * @param {string} eventId - The calendar event's Firestore document ID.
 * @param {string} occurrenceDate - ISO date string of the specific occurrence being deleted.
 * @param {string} title - The event title (for display in the modal).
 * @param {Function} reloadFn - Callback to reload after delete.
 */
function openDeleteRecurringModal(eventId, occurrenceDate, title, reloadFn) {
    var dateObj = new Date(occurrenceDate + 'T00:00:00');
    var dateStr = dateObj.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
    document.getElementById('deleteRecurringInfo').textContent = title + ' — ' + dateStr;
    pendingDeleteRecurring = { eventId: eventId, occurrenceDate: occurrenceDate, reloadFn: reloadFn };
    openModal('deleteRecurringModal');
}

/**
 * Deletes only the current occurrence of a recurring event by adding it to cancelledDates[].
 * The event document remains; other occurrences are unaffected.
 */
async function handleDeleteThisOccurrence() {
    if (!pendingDeleteRecurring) return;
    var eventId = pendingDeleteRecurring.eventId;
    var occurrenceDate = pendingDeleteRecurring.occurrenceDate;
    var reloadFn = pendingDeleteRecurring.reloadFn;
    pendingDeleteRecurring = null;
    closeModal('deleteRecurringModal');

    try {
        await userCol('calendarEvents').doc(eventId).update({
            cancelledDates: firebase.firestore.FieldValue.arrayUnion(occurrenceDate)
        });
        console.log('Cancelled occurrence:', occurrenceDate, 'for event:', eventId);
        // GCal sync — will delete the cancelled occurrence's GCal event (fire-and-forget)
        if (typeof gcalIsConnected === 'function' && gcalIsConnected()) {
            (function(eid) {
                userCol('calendarEvents').doc(eid).get().then(function(snap) {
                    if (snap.exists) gcalSyncYardEvent({ id: snap.id, ...snap.data() });
                }).catch(function(e) { console.warn('gcalSyncYardEvent error:', e); });
            })(eventId);
        }
        if (typeof reloadFn === 'function') reloadFn();
        else loadCalendar();
    } catch (error) {
        console.error('Error cancelling occurrence:', error);
        alert('Error deleting occurrence. Check console for details.');
    }
}

/**
 * Deletes all occurrences of a recurring event by removing the Firestore document.
 * Shows a final confirmation before proceeding.
 */
async function handleDeleteAllOccurrences() {
    if (!pendingDeleteRecurring) return;
    var eventId = pendingDeleteRecurring.eventId;
    var reloadFn = pendingDeleteRecurring.reloadFn;
    pendingDeleteRecurring = null;
    closeModal('deleteRecurringModal');

    if (!confirm('Delete ALL occurrences of this recurring event? This cannot be undone.')) return;
    handleDeleteCalendarEvent(eventId, reloadFn);
}

// ---------- Home Page Calendar (compact) ----------

/**
 * Loads upcoming calendar events for display on the My Yard home page.
 * Shows a compact list of events for the next 3 months.
 */
async function loadHomeCalendar() {
    var container = document.getElementById('homeCalendarContainer');
    var emptyState = document.getElementById('homeCalendarEmptyState');

    var rangeMonths = 3;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var rangeStart = formatDateISO(today);

    var rangeEndDate = new Date(today);
    rangeEndDate.setMonth(rangeEndDate.getMonth() + rangeMonths);
    var rangeEnd = formatDateISO(rangeEndDate);

    try {
        var snapshot = await userCol('calendarEvents').get();

        container.innerHTML = '';

        if (snapshot.empty) {
            emptyState.textContent = 'No upcoming events.';
            emptyState.style.display = 'block';
            return;
        }

        var events = [];
        snapshot.forEach(function(doc) {
            events.push({ id: doc.id, ...doc.data() });
        });

        var allOccurrences = [];
        events.forEach(function(event) {
            var occurrences = generateOccurrences(event, rangeStart, rangeEnd);
            var upcoming = occurrences.filter(function(occ) { return !occ.completed; });
            allOccurrences = allOccurrences.concat(upcoming);
        });

        allOccurrences.sort(function(a, b) {
            return a.occurrenceDate.localeCompare(b.occurrenceDate);
        });

        if (allOccurrences.length === 0) {
            emptyState.textContent = 'No upcoming events in the next 3 months.';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        // Show up to 10 upcoming events as full cards with Complete/Edit/Copy/Delete
        var limit = Math.min(allOccurrences.length, 10);
        for (var i = 0; i < limit; i++) {
            var card = createCalendarEventCard(allOccurrences[i], loadHomeCalendar);
            container.appendChild(card);
        }

        if (allOccurrences.length > limit) {
            var moreLink = document.createElement('div');
            moreLink.className = 'home-calendar-more';
            moreLink.innerHTML = '<a href="#calendar">' + (allOccurrences.length - limit) + ' more events \u203A</a>';
            container.appendChild(moreLink);
        }

    } catch (error) {
        console.error('Error loading home calendar:', error);
        emptyState.textContent = 'Error loading calendar.';
        emptyState.style.display = 'block';
    }
}

// ---------- Event Listeners ----------

document.addEventListener('DOMContentLoaded', function() {

    // "Add Event" button on calendar page
    document.getElementById('addCalendarEventBtn').addEventListener('click', function() {
        openAddCalendarEventModal(null, null, loadCalendar);
    });

    // Range dropdown change — reload calendar
    document.getElementById('calendarRangeSelect').addEventListener('change', function() {
        loadCalendar();
    });

    // "Show completed" checkbox — reload calendar to include/exclude completed events
    document.getElementById('showCompletedCalendarEvents').addEventListener('change', function() {
        loadCalendar();
    });

    // Maintenance list — "Show resolved" checkbox
    document.getElementById('showResolvedMaintenance').addEventListener('change', function() {
        loadMaintenanceList();
    });

    // Calendar event modal — Save button
    document.getElementById('calEventSaveBtn').addEventListener('click', handleCalendarEventModalSave);

    // Calendar event modal — Delete button (edit mode only)
    // For recurring events with a known occurrence date, offer per-occurrence or all-occurrences delete.
    // For one-time events (or recurring without occurrence context), use a simple confirm.
    document.getElementById('calEventDeleteBtn').addEventListener('click', async function() {
        var modal = document.getElementById('calendarEventModal');
        var eventId = modal.dataset.editId;
        var occurrenceDate = modal.dataset.occurrenceDate || '';
        var reloadFn = typeof calendarEventModalReloadFn === 'function' ? calendarEventModalReloadFn : loadCalendar;

        try {
            var doc = await userCol('calendarEvents').doc(eventId).get();
            if (!doc.exists) return;
            var event = doc.data();

            if (event.recurring && event.recurring.type !== 'reset_interval' && occurrenceDate) {
                // Recurring event opened from a specific occurrence card — offer choice.
                // Reset-interval events skip this: there's only ever one active occurrence,
                // so "delete just this occurrence" (cancelledDates) has no meaning for this
                // type — deleting always means deleting the whole schedule.
                closeModal('calendarEventModal');
                openDeleteRecurringModal(eventId, occurrenceDate, event.title, reloadFn);
            } else {
                // One-time event, or recurring opened without a specific date context
                var message = event.recurring
                    ? 'This is a recurring event. Deleting it will remove ALL occurrences. Continue?'
                    : 'Are you sure you want to delete this event?';
                if (!confirm(message)) return;
                closeModal('calendarEventModal');
                handleDeleteCalendarEvent(eventId, reloadFn);
            }
        } catch (e) {
            if (!confirm('Are you sure you want to delete this event?')) return;
            closeModal('calendarEventModal');
            handleDeleteCalendarEvent(eventId, reloadFn);
        }
    });

    // Calendar event modal — Cancel button
    document.getElementById('calEventCancelBtn').addEventListener('click', function() {
        closeModal('calendarEventModal');
    });

    // Calendar event modal — Close on overlay click
    document.getElementById('calendarEventModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal('calendarEventModal');
    });

    // Calendar event modal — Enter key on title to save
    document.getElementById('calEventTitleInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') handleCalendarEventModalSave();
    });

    // Event type dropdown change — toggle recurring options
    document.getElementById('calEventTypeSelect').addEventListener('change', function() {
        toggleRecurringOptions();
    });

    // Frequency dropdown change — toggle interval input
    document.getElementById('calEventFrequencySelect').addEventListener('change', function() {
        toggleIntervalInput();
    });

    // Saved action dropdown in calendar modal — auto-fill title/description
    document.getElementById('calEventSavedActionSelect').addEventListener('change', handleCalEventSavedActionSelect);

    // Delete recurring modal — "Delete This Occurrence" button
    document.getElementById('deleteThisOccurrenceBtn').addEventListener('click', handleDeleteThisOccurrence);

    // Delete recurring modal — "Delete All Occurrences" button
    document.getElementById('deleteAllOccurrencesBtn').addEventListener('click', handleDeleteAllOccurrences);

    // Delete recurring modal — Cancel button
    document.getElementById('deleteRecurringCancelBtn').addEventListener('click', function() {
        closeModal('deleteRecurringModal');
        pendingDeleteRecurring = null;
    });

    // Delete recurring modal — Close on overlay click
    document.getElementById('deleteRecurringModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal('deleteRecurringModal');
            pendingDeleteRecurring = null;
        }
    });

    // Complete event modal — Confirm button
    document.getElementById('completeEventConfirmBtn').addEventListener('click', handleCompleteEvent);

    // Complete event modal — Cancel button
    document.getElementById('completeEventCancelBtn').addEventListener('click', function() {
        closeModal('completeEventModal');
        pendingCompleteOccurrence = null;
    });

    // Complete event modal — Close on overlay click
    document.getElementById('completeEventModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal('completeEventModal');
            pendingCompleteOccurrence = null;
        }
    });

    // In Progress modal — Save button
    document.getElementById('inProgressSaveBtn').addEventListener('click', handleSaveInProgress);

    // In Progress modal — Clear Status button
    document.getElementById('inProgressClearBtn').addEventListener('click', handleClearInProgress);

    // In Progress modal — Cancel button
    document.getElementById('inProgressCancelBtn').addEventListener('click', function() {
        closeModal('inProgressModal');
        pendingInProgressOccurrence = null;
    });

    // In Progress modal — Close on overlay click
    document.getElementById('inProgressModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal('inProgressModal');
            pendingInProgressOccurrence = null;
        }
    });

    // Postpone modal — quick-pick buttons
    document.getElementById('postponeWeekBtn').addEventListener('click', function() { _calSetPostponeQuickPick(7); });
    document.getElementById('postponeTwoWeeksBtn').addEventListener('click', function() { _calSetPostponeQuickPick(14); });
    document.getElementById('postponeMonthBtn').addEventListener('click', function() { _calSetPostponeQuickPick(30); });

    // Postpone modal — Save button
    document.getElementById('postponeSaveBtn').addEventListener('click', handleSavePostpone);

    // Postpone modal — Cancel button
    document.getElementById('postponeCancelBtn').addEventListener('click', function() {
        closeModal('postponeModal');
        pendingPostponeOccurrence = null;
    });

    // Postpone modal — Close on overlay click
    document.getElementById('postponeModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal('postponeModal');
            pendingPostponeOccurrence = null;
        }
    });
});

// ============================================================
// PEOPLE ANNUAL DATES — shown on the calendar from peopleImportantDates
// ============================================================

/**
 * Query all peopleImportantDates with recurrence === 'annual',
 * calculate the next occurrence within the current display range,
 * and render them in the People section on the calendar page.
 *
 * @param {Date} rangeStart - Start of display range (today, midnight)
 * @param {Date} rangeEnd   - End of display range
 */
async function loadPeopleAnnualDates(rangeStart, rangeEnd) {
    var section   = document.getElementById('calendarPeopleSection');
    var container = document.getElementById('calendarPeopleContainer');
    if (!section || !container) return;

    container.innerHTML = '';
    section.style.display = 'none';

    try {
        // Fetch all annual important dates
        var snap = await userCol('peopleImportantDates')
            .where('recurrence', '==', 'annual')
            .get();

        if (snap.empty) return;

        // Build a map of personId → person name (fetch all people once)
        var peopleSnap = await userCol('people').get();
        var personMap  = {};
        peopleSnap.forEach(function(doc) {
            personMap[doc.id] = doc.data().name || 'Unknown';
        });

        // Collect dates and their next occurrences within the range
        var items = [];
        snap.forEach(function(doc) {
            var d = doc.data();
            if (!d.month || !d.day) return;

            var next = _nextAnnualOccurrence(d.month, d.day, rangeStart, rangeEnd);
            if (!next) return;   // Falls outside the display range

            items.push({
                id:         doc.id,
                label:      d.label    || '',
                personId:   d.personId || '',
                personName: personMap[d.personId] || '',
                month:      d.month,
                day:        d.day,
                year:       d.year || null,    // Birth/event year for age calc
                nextDate:   next,              // JS Date of next occurrence
            });
        });

        if (items.length === 0) return;

        // Sort by next occurrence date
        items.sort(function(a, b) { return a.nextDate - b.nextDate; });

        // Render each item
        items.forEach(function(item) {
            container.appendChild(_buildPeopleDateCard(item));
        });

        section.style.display = '';

    } catch (err) {
        console.error('loadPeopleAnnualDates error:', err);
    }
}

/**
 * Returns the next annual occurrence of month/day that falls within [rangeStart, rangeEnd].
 * First tries the current year, then next year.
 * Returns a JS Date, or null if no occurrence falls in range.
 */
function _nextAnnualOccurrence(month, day, rangeStart, rangeEnd) {
    var thisYear = rangeStart.getFullYear();

    for (var y = thisYear; y <= thisYear + 1; y++) {
        var candidate = new Date(y, month - 1, day);
        candidate.setHours(0, 0, 0, 0);
        if (candidate >= rangeStart && candidate <= rangeEnd) {
            return candidate;
        }
    }
    return null;
}

/**
 * Build a read-only calendar card for one people annual date.
 */
function _buildPeopleDateCard(item) {
    var card = document.createElement('div');
    card.className = 'calendar-event-card people-date-card';

    // Date display: "March 15"
    var monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
    var dateStr = monthNames[item.month - 1] + ' ' + item.day;

    // Age line (only if we know the birth/event year)
    var ageHtml = '';
    if (item.year) {
        var age = item.nextDate.getFullYear() - item.year;
        if (age > 0) {
            ageHtml = '<span class="people-date-age">turns ' + age + '</span>';
        }
    }

    // Person link
    var personHtml = item.personId
        ? '<a class="people-date-person" href="#person/' + item.personId + '">' +
              escapeHtml(item.personName) + '</a>'
        : escapeHtml(item.personName);

    card.innerHTML =
        '<div class="calendar-event-date">' + escapeHtml(dateStr) + '</div>' +
        '<div class="calendar-event-content">' +
            '<div class="calendar-event-title">' +
                escapeHtml(item.label) + ' — ' + personHtml + ageHtml +
            '</div>' +
            '<span class="calendar-event-badge">Annual</span>' +
        '</div>';

    return card;
}
