// ============================================================
// Activityreport.js — Activity History Report
// Shows all logged activities (plants, zones, weeds) with
// date-range, target-type, and chemical filters.
// All filtering is done client-side after a single Firestore load.
// ============================================================

/** All activity docs loaded from Firestore. Re-used across filter changes. */
var arAllActivities = [];

/** Name maps: arNameMap.plant[id] = plantName, .zone[id], .weed[id] */
var arNameMap = {};

/** Chemical name map: arChemMap[chemId] = chemName */
var arChemMap = {};

/** True once initial data is loaded; prevents duplicate Firestore reads. */
var arDataLoaded = false;

// ---------- Entry Point ----------

/**
 * Called by the router when navigating to #activityreport.
 * Loads all data on first visit, then applies filters and renders.
 */
async function loadActivityReportPage() {
    var resultsEl = document.getElementById('arResults');
    var summaryEl = document.getElementById('arSummary');
    var emptyEl   = document.getElementById('arEmptyState');

    resultsEl.innerHTML = '';
    emptyEl.classList.add('hidden');
    summaryEl.textContent = 'Loading…';

    // Wire filter buttons exactly once
    var applyBtn = document.getElementById('arApplyBtn');
    var clearBtn = document.getElementById('arClearBtn');
    if (!applyBtn.dataset.wired) {
        applyBtn.dataset.wired = 'true';
        applyBtn.addEventListener('click', arApplyFilters);
        clearBtn.addEventListener('click', arClearFilters);
    }

    // Populate chemical filter dropdown (refresh in case chemicals changed since last visit)
    await arPopulateChemicalFilter();

    // Load all Firestore data (only once per session; filtered client-side after that)
    if (!arDataLoaded) {
        await arLoadData();
    }

    arApplyFilters();
}

// ---------- Data Loading ----------

/**
 * Loads all activities, plant/zone/weed name maps, and chemical names from
 * Firestore in parallel. Caches everything so filter changes are instant.
 */
async function arLoadData() {
    try {
        var [activitiesSnap, plantsSnap, zonesSnap, weedsSnap, chemsSnap] = await Promise.all([
            yReadAll('activities'),
            yReadAll('plants'),
            yReadAll('zones'),
            yReadAll('weeds'),
            yReadAll('chemicals'),
        ]);

        // Build activities array and sort newest-first client-side
        arAllActivities = [];
        activitiesSnap.forEach(function(doc) {
            arAllActivities.push({ id: doc.id, ...doc.data() });
        });
        arAllActivities.sort(function(a, b) {
            return (b.date || '').localeCompare(a.date || '');
        });

        // Build name maps for each entity type
        arNameMap = { plant: {}, zone: {}, weed: {} };
        plantsSnap.forEach(function(doc) { arNameMap.plant[doc.id] = doc.data().name || ''; });
        zonesSnap.forEach(function(doc)  { arNameMap.zone[doc.id]  = doc.data().name || ''; });
        weedsSnap.forEach(function(doc)  { arNameMap.weed[doc.id]  = doc.data().name || ''; });

        // Build chemical name map
        arChemMap = {};
        chemsSnap.forEach(function(doc) { arChemMap[doc.id] = doc.data().name || ''; });

        arDataLoaded = true;

    } catch (err) {
        console.error('Activity report load error:', err);
        document.getElementById('arSummary').textContent = 'Error loading data — please try again.';
    }
}

/**
 * Populates the chemical filter <select> with all chemicals, sorted by name.
 * Preserves any existing selection if the chemical still exists.
 */
async function arPopulateChemicalFilter() {
    var select   = document.getElementById('arChemicalFilter');
    var prevVal  = select.value;

    select.innerHTML = '<option value="">All products</option>';

    try {
        var snap = await yardCol('chemicals').orderBy('name').get();
        snap.forEach(function(doc) {
            var opt = document.createElement('option');
            opt.value       = doc.id;
            opt.textContent = doc.data().name || '';
            select.appendChild(opt);
        });
    } catch (e) { /* chemical filter is optional — fail silently */ }

    if (prevVal) select.value = prevVal;
}

// ---------- Filtering ----------

/**
 * Reads the current filter values, filters arAllActivities, and renders.
 * Called when Apply is clicked or when the page first loads.
 */
function arApplyFilters() {
    var fromDate = document.getElementById('arFromDate').value;   // 'YYYY-MM-DD' or ''
    var toDate   = document.getElementById('arToDate').value;
    var typeVal  = document.getElementById('arTypeFilter').value;  // 'plant'|'zone'|'weed'|''
    var chemVal  = document.getElementById('arChemicalFilter').value; // chemId or ''

    var filtered = arAllActivities.filter(function(a) {
        if (fromDate && (a.date || '') < fromDate) return false;
        if (toDate   && (a.date || '') > toDate)   return false;
        if (typeVal  && a.targetType !== typeVal)   return false;
        if (chemVal) {
            var ids = normalizeChemicalIds(a);    // from activities.js
            if (ids.indexOf(chemVal) < 0) return false;
        }
        return true;
    });

    arRenderResults(filtered);
}

/**
 * Resets all filter controls to their defaults and re-renders.
 */
function arClearFilters() {
    document.getElementById('arFromDate').value       = '';
    document.getElementById('arToDate').value         = '';
    document.getElementById('arTypeFilter').value     = '';
    document.getElementById('arChemicalFilter').value = '';
    arApplyFilters();
}

// ---------- Rendering ----------

/**
 * Renders filtered activities grouped by month (newest month first).
 * @param {Array} activities - The filtered array of activity objects.
 */
function arRenderResults(activities) {
    var resultsEl = document.getElementById('arResults');
    var emptyEl   = document.getElementById('arEmptyState');
    var summaryEl = document.getElementById('arSummary');

    resultsEl.innerHTML = '';
    emptyEl.classList.add('hidden');

    var count = activities.length;
    summaryEl.textContent = count + ' activit' + (count === 1 ? 'y' : 'ies') + ' found';

    if (count === 0) {
        emptyEl.textContent = 'No activities match the selected filters.';
        emptyEl.classList.remove('hidden');
        return;
    }

    // Group by year-month key ('2026-03', '2026-02', …)
    // Since activities are sorted newest-first, group order is also newest-first
    var groups    = {};   // monthKey → [activities]
    var groupOrder = [];  // ordered list of monthKeys

    activities.forEach(function(a) {
        var key = (a.date && a.date.length >= 7) ? a.date.substring(0, 7) : 'unknown';
        if (!groups[key]) {
            groups[key] = [];
            groupOrder.push(key);
        }
        groups[key].push(a);
    });

    groupOrder.forEach(function(key) {
        // Month heading
        var heading = document.createElement('div');
        heading.className   = 'ar-month-heading';
        heading.textContent = arFormatMonthKey(key);
        resultsEl.appendChild(heading);

        // One card per activity in this month
        groups[key].forEach(function(a) {
            resultsEl.appendChild(arBuildCard(a));
        });
    });
}

/**
 * Converts a 'YYYY-MM' string to 'Month YYYY' (e.g. '2026-03' → 'March 2026').
 * @param {string} key
 * @returns {string}
 */
function arFormatMonthKey(key) {
    if (key === 'unknown') return 'Unknown Date';
    var parts = key.split('-');
    var MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
    var monthIdx = parseInt(parts[1], 10) - 1;
    return (MONTHS[monthIdx] || key) + ' ' + parts[0];
}

/**
 * Builds a single activity card element.
 * @param {Object} a - Activity data object.
 * @returns {HTMLElement}
 */
function arBuildCard(a) {
    var card = document.createElement('div');
    card.className = 'ar-card';

    // ── Top row: date badge, type chip, target link ──────────────────────────
    var topRow = document.createElement('div');
    topRow.className = 'ar-card-top';

    // Date badge
    var dateBadge = document.createElement('span');
    dateBadge.className   = 'ar-date-badge';
    dateBadge.textContent = a.date || '—';
    topRow.appendChild(dateBadge);

    // Type chip (Plant / Zone / Weed) — color-coded
    var typeChip = document.createElement('span');
    var typeName = a.targetType || '';
    typeChip.className   = 'ar-type-chip ar-type-' + typeName;
    typeChip.textContent = typeName ? (typeName.charAt(0).toUpperCase() + typeName.slice(1)) : '?';
    topRow.appendChild(typeChip);

    // Target name — clickable link to the entity's detail page
    var targetName = arResolveTargetName(a);
    var targetUrl  = arResolveTargetUrl(a);

    var targetEl;
    if (targetUrl) {
        targetEl          = document.createElement('a');
        targetEl.href     = targetUrl;
    } else {
        targetEl = document.createElement('span');
    }
    targetEl.className   = 'ar-target-link';
    targetEl.textContent = targetName;
    topRow.appendChild(targetEl);

    card.appendChild(topRow);

    // ── Description ──────────────────────────────────────────────────────────
    if (a.description) {
        var desc = document.createElement('div');
        desc.className   = 'ar-description';
        desc.textContent = a.description;
        card.appendChild(desc);
    }

    // ── Chemical tags ────────────────────────────────────────────────────────
    var chemIds = normalizeChemicalIds(a);
    if (chemIds.length > 0) {
        var chemRow = document.createElement('div');
        chemRow.className = 'ar-chem-row';
        chemIds.forEach(function(id) {
            var tag = document.createElement('span');
            tag.className   = 'ar-chem-tag';
            tag.textContent = arChemMap[id] || '(unknown product)';
            chemRow.appendChild(tag);
        });
        card.appendChild(chemRow);
    }

    // ── Amount used ───────────────────────────────────────────────────────────
    if (a.amountUsed) {
        var amount = document.createElement('div');
        amount.className   = 'ar-notes';
        amount.textContent = '⚗️ ' + a.amountUsed;
        card.appendChild(amount);
    }

    // ── Notes (collapsed into a subtle line) ─────────────────────────────────
    if (a.notes) {
        var notes = document.createElement('div');
        notes.className   = 'ar-notes';
        notes.textContent = a.notes;
        card.appendChild(notes);
    }

    return card;
}

// ---------- Helpers ----------

/**
 * Returns the display name for an activity's target, using the cached name maps.
 * Falls back to '(Deleted)' if the entity no longer exists.
 */
function arResolveTargetName(a) {
    if (!a.targetType || !a.targetId) return '(Unknown)';
    var map = arNameMap[a.targetType] || {};
    var name = map[a.targetId];
    return name !== undefined ? (name || '(Unnamed)') : '(Deleted)';
}

/**
 * Returns the hash URL for navigating to the activity's target entity.
 * Returns null for unknown types.
 */
function arResolveTargetUrl(a) {
    if (!a.targetType || !a.targetId) return null;
    var prefixes = { plant: '#plant/', zone: '#zone/', weed: '#weed/' };
    var prefix = prefixes[a.targetType];
    return prefix ? prefix + a.targetId : null;
}
