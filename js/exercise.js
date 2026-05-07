/**
 * exercise.js — Exercise section: hub, activities list, activity detail, manage types.
 */

// ─── Default types ────────────────────────────────────────────────────────────

const EXERCISE_DEFAULT_TYPES = [
    { name: 'Running',         tracksMiles: true,  withDogs: true  },
    { name: 'Trail Running',   tracksMiles: true,  withDogs: true  },
    { name: 'Walking',         tracksMiles: true,  withDogs: true  },
    { name: 'Hiking',          tracksMiles: true,  withDogs: true  },
    { name: 'Treadmill',       tracksMiles: true,  withDogs: false },
    { name: 'Golf',            tracksMiles: false, withDogs: false },
    { name: 'Mowing',          tracksMiles: false, withDogs: false },
    { name: 'Yard Work',       tracksMiles: false, withDogs: false },
    { name: 'Weights',         tracksMiles: false, withDogs: false },
    { name: 'Elliptical',      tracksMiles: false, withDogs: false },
    { name: 'Row Machine',     tracksMiles: false, withDogs: false },
    { name: 'Bike',            tracksMiles: false, withDogs: false },
    { name: 'Stationary Bike', tracksMiles: false, withDogs: false },
];

/**
 * Seeds 13 default activity types into Firestore on first visit.
 * No-ops if the collection already has documents.
 */
async function seedExerciseTypesIfNeeded() {
    try {
        var snap = await userCol('exerciseTypes').limit(1).get();
        if (!snap.empty) return;

        var batch = db.batch();
        EXERCISE_DEFAULT_TYPES.forEach(function(t) {
            var ref = userCol('exerciseTypes').doc();
            batch.set(ref, {
                name:        t.name,
                tracksMiles: t.tracksMiles,
                withDogs:    t.withDogs,
                isDefault:   true,
                archived:    false,
                createdAt:   firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        await batch.commit();
        console.log('Exercise: seeded ' + EXERCISE_DEFAULT_TYPES.length + ' default activity types.');
    } catch (err) {
        console.error('Exercise: failed to seed activity types:', err);
    }
}

// ─── Module-level state ───────────────────────────────────────────────────────

var _exTypes       = {};    // typeId → type data
var _exRangeFilter = '30';  // current dropdown value; preserved across page visits
var _exCustomStart = '';    // YYYY-MM-DD
var _exCustomEnd   = '';    // YYYY-MM-DD
var _exGoToDate    = '';    // YYYY-MM-DD or '' (overrides range filter when set)

// ─── Hub page ─────────────────────────────────────────────────────────────────

function loadExercisePage() {
    var el = document.getElementById('page-exercise');
    if (!el) return;
    el.innerHTML =
        '<div class="page-header">' +
            '<button class="btn btn-secondary btn-small" onclick="location.hash=\'#life\'">&#8592; Life</button>' +
            '<h2>Exercise</h2>' +
        '</div>' +
        '<div class="landing-grid">' +
            '<a href="#exercise-activities" class="landing-tile landing-tile--exercise-activities">' +
                '<span class="landing-tile-icon">🏃</span>' +
                '<span class="landing-tile-label">Activities</span>' +
            '</a>' +
            '<div class="landing-tile landing-tile--coming-soon">' +
                '<span class="landing-tile-icon">🎯</span>' +
                '<span class="landing-tile-label">Goals</span>' +
                '<span class="coming-soon-badge">Coming Soon</span>' +
            '</div>' +
            '<div class="landing-tile landing-tile--coming-soon">' +
                '<span class="landing-tile-icon">📊</span>' +
                '<span class="landing-tile-label">Summary</span>' +
                '<span class="coming-soon-badge">Coming Soon</span>' +
            '</div>' +
        '</div>';
}

// ─── Activities list page ─────────────────────────────────────────────────────

async function loadExerciseActivitiesPage() {
    seedExerciseTypesIfNeeded();
    _exGoToDate = '';   // always clear a stale Go-to-Date on fresh navigation

    // Load all non-archived types into a lookup map
    _exTypes = {};
    try {
        var typeSnap = await userCol('exerciseTypes').get();
        typeSnap.forEach(function(doc) { _exTypes[doc.id] = doc.data(); });
    } catch (err) {
        console.error('Exercise: failed to load types:', err);
    }

    _exBuildActivitiesPage();
    _exApplyFilter();
}

/** Renders the static page shell (header + toolbar + empty list container). */
function _exBuildActivitiesPage() {
    var el = document.getElementById('page-exercise-activities');
    if (!el) return;

    var customHidden  = _exRangeFilter !== 'custom' ? ' hidden' : '';
    var clearHidden   = _exGoToDate ? '' : ' hidden';

    el.innerHTML =
        '<div class="page-header">' +
            '<button class="btn btn-secondary btn-small" onclick="location.hash=\'#exercise\'">&#8592; Exercise</button>' +
            '<h2>Activities</h2>' +
            '<button class="btn btn-primary btn-small" onclick="location.hash=\'#exercise-activity/new\'">+ Activity</button>' +
        '</div>' +

        '<div class="ex-toolbar">' +
            '<div class="ex-toolbar-row">' +
                '<select id="exRangeSelect">' +
                    '<option value="7">Last 7 days</option>' +
                    '<option value="30">Last 30 days</option>' +
                    '<option value="90">Last 90 days</option>' +
                    '<option value="month">This Month</option>' +
                    '<option value="year">This Year</option>' +
                    '<option value="all">All Time</option>' +
                    '<option value="custom">Custom…</option>' +
                '</select>' +
                '<a href="#exercise-types" class="ex-manage-link">Manage Types</a>' +
            '</div>' +

            '<div id="exCustomRange" class="ex-toolbar-row' + customHidden + '">' +
                '<input type="date" id="exStartDate" value="' + _exCustomStart + '">' +
                '<span>to</span>' +
                '<input type="date" id="exEndDate" value="' + _exCustomEnd + '">' +
                '<button class="btn btn-secondary btn-small" id="exLoadBtn">Load</button>' +
            '</div>' +

            '<div class="ex-toolbar-row">' +
                '<input type="date" id="exGoToDateInput">' +
                '<button class="btn btn-secondary btn-small" id="exGoToDateBtn">Go to Date</button>' +
                '<button class="btn btn-secondary btn-small' + clearHidden + '" id="exClearDateBtn">&#10005; Clear date</button>' +
            '</div>' +
        '</div>' +

        '<div id="exListContainer"></div>';

    // Restore dropdown to current state
    document.getElementById('exRangeSelect').value = _exRangeFilter;

    // ── Event wiring ──────────────────────────────────────────────────────────

    document.getElementById('exRangeSelect').addEventListener('change', function() {
        _exRangeFilter = this.value;
        _exGoToDate    = '';
        document.getElementById('exGoToDateInput').value = '';
        document.getElementById('exClearDateBtn').classList.add('hidden');
        document.getElementById('exCustomRange').classList.toggle('hidden', this.value !== 'custom');
        if (this.value !== 'custom') _exApplyFilter();
    });

    document.getElementById('exLoadBtn').addEventListener('click', function() {
        _exCustomStart = document.getElementById('exStartDate').value;
        _exCustomEnd   = document.getElementById('exEndDate').value;
        if (!_exCustomStart || !_exCustomEnd) {
            alert('Please select both a start and end date.');
            return;
        }
        _exApplyFilter();
    });

    document.getElementById('exGoToDateBtn').addEventListener('click', function() {
        var val = document.getElementById('exGoToDateInput').value;
        if (!val) return;
        _exGoToDate = val;
        document.getElementById('exClearDateBtn').classList.remove('hidden');
        _exApplyFilter();
    });

    document.getElementById('exClearDateBtn').addEventListener('click', function() {
        _exGoToDate = '';
        document.getElementById('exGoToDateInput').value = '';
        this.classList.add('hidden');
        _exApplyFilter();
    });
}

/** Queries Firestore, applies client-side date filter, and renders results. */
async function _exApplyFilter() {
    var container = document.getElementById('exListContainer');
    if (!container) return;
    container.innerHTML = '<p class="ex-status">Loading…</p>';

    try {
        var snap = await userCol('exerciseActivities')
            .orderBy('activityDate', 'desc')
            .limit(500)
            .get();

        var all = [];
        snap.forEach(function(doc) {
            var d = doc.data();
            d.id = doc.id;
            all.push(d);
        });

        var range    = _exGetDateRange();
        var filtered = all.filter(function(a) {
            if (!a.activityDate) return false;
            if (range.start && a.activityDate < range.start) return false;
            if (range.end   && a.activityDate > range.end)   return false;
            return true;
        });

        container.innerHTML = '';

        if (filtered.length === 0) {
            container.innerHTML = '<p class="ex-status">No activities found for this period.</p>';
            return;
        }

        container.appendChild(_exBuildTable(filtered));
        container.appendChild(_exBuildCards(filtered));

    } catch (err) {
        console.error('Exercise: failed to load activities:', err);
        container.innerHTML = '<p class="ex-status">Error loading activities. Please try again.</p>';
    }
}

/** Returns { start, end } ISO datetime strings based on current filter state. */
function _exGetDateRange() {
    if (_exGoToDate) {
        return { start: _exGoToDate + 'T00:00:00', end: _exGoToDate + 'T23:59:59' };
    }
    var now   = new Date();
    var today = _exFmtYMD(now);

    switch (_exRangeFilter) {
        case '7': {
            var d = new Date(now); d.setDate(d.getDate() - 6);
            return { start: _exFmtYMD(d) + 'T00:00:00', end: today + 'T23:59:59' };
        }
        case '30': {
            var d = new Date(now); d.setDate(d.getDate() - 29);
            return { start: _exFmtYMD(d) + 'T00:00:00', end: today + 'T23:59:59' };
        }
        case '90': {
            var d = new Date(now); d.setDate(d.getDate() - 89);
            return { start: _exFmtYMD(d) + 'T00:00:00', end: today + 'T23:59:59' };
        }
        case 'month': {
            var s = new Date(now.getFullYear(), now.getMonth(), 1);
            return { start: _exFmtYMD(s) + 'T00:00:00', end: today + 'T23:59:59' };
        }
        case 'year': {
            return { start: now.getFullYear() + '-01-01T00:00:00', end: today + 'T23:59:59' };
        }
        case 'custom': {
            if (!_exCustomStart || !_exCustomEnd) return { start: null, end: null };
            return { start: _exCustomStart + 'T00:00:00', end: _exCustomEnd + 'T23:59:59' };
        }
        case 'all':
        default:
            return { start: null, end: null };
    }
}

// ─── Desktop table ────────────────────────────────────────────────────────────

function _exBuildTable(activities) {
    var wrap  = document.createElement('div');
    wrap.className = 'ex-table-wrap';

    var table = document.createElement('table');
    table.className = 'ex-table';

    // Header row
    var thead = document.createElement('thead');
    var hRow  = document.createElement('tr');
    ['Date', 'Day', 'Type', 'Duration', 'Miles', 'Pace', 'Cal', 'Comment'].forEach(function(h) {
        var th = document.createElement('th');
        th.textContent = h;
        hRow.appendChild(th);
    });
    thead.appendChild(hRow);
    table.appendChild(thead);

    // Data rows
    var tbody = document.createElement('tbody');
    activities.forEach(function(a) {
        var type     = _exTypes[a.typeId] || {};
        var typeName = (type.name || '?') + (a.withDogs ? ' 🐾' : '');
        var dur      = exFmtDuration(a.durationMinutes);
        var miles    = (type.tracksMiles && a.miles != null && a.miles !== '') ? a.miles : '';
        var pace     = (type.tracksMiles && miles && a.durationMinutes) ? exFmtPace(miles, a.durationMinutes) : '';

        var tr = document.createElement('tr');
        tr.className = 'ex-table-row';
        (function(id) { tr.onclick = function() { location.hash = '#exercise-activity/' + id; }; })(a.id);

        [
            exFmtDateShort(a.activityDate),
            exFmtDayFull(a.activityDate),
            typeName,
            dur,
            miles,
            pace,
            (a.calories != null && a.calories !== '') ? a.calories : '',
            a.comment || ''
        ].forEach(function(val) {
            var td = document.createElement('td');
            td.textContent = String(val == null ? '' : val);
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
}

// ─── Mobile cards ─────────────────────────────────────────────────────────────

function _exBuildCards(activities) {
    var wrap = document.createElement('div');
    wrap.className = 'ex-cards';

    activities.forEach(function(a) {
        var type     = _exTypes[a.typeId] || {};
        var typeName = (type.name || '?') + (a.withDogs ? ' 🐾' : '');
        var dur      = exFmtDuration(a.durationMinutes) || '—';
        var dateStr  = exFmtDayShort(a.activityDate) + ' ' + exFmtDateShort(a.activityDate);

        var card = document.createElement('div');
        card.className = 'ex-card';
        (function(id) { card.onclick = function() { location.hash = '#exercise-activity/' + id; }; })(a.id);

        // Line 1: Date | Type | Duration
        var line1 = document.createElement('div');
        line1.className = 'ex-card-line';
        [dateStr, typeName, dur].forEach(function(txt) {
            var span = document.createElement('span');
            span.textContent = txt;
            line1.appendChild(span);
        });
        card.appendChild(line1);

        // Line 2 (up to 3): miles@pace | calories | comment
        var parts = [];
        if (type.tracksMiles && a.miles) {
            var pace = exFmtPace(a.miles, a.durationMinutes);
            parts.push(a.miles + ' mi' + (pace ? ' @ ' + pace : ''));
        }
        if (a.calories != null && a.calories !== '') parts.push(a.calories + ' cal');
        if (a.comment) parts.push(a.comment);

        if (parts.length > 0) {
            var line2 = document.createElement('div');
            line2.className = 'ex-card-line ex-card-line--sub';
            parts.slice(0, 3).forEach(function(txt) {
                var span = document.createElement('span');
                span.textContent = txt;
                line2.appendChild(span);
            });
            card.appendChild(line2);
        }

        wrap.appendChild(card);
    });

    return wrap;
}

// ─── Activity detail / edit page (stub — Phase 3) ────────────────────────────

function loadExerciseActivityPage(id) {
    seedExerciseTypesIfNeeded();
    var el = document.getElementById('page-exercise-activity');
    if (!el) return;
    var isNew = (id === 'new');
    el.innerHTML =
        '<div class="page-header">' +
            '<button class="btn btn-secondary btn-small" onclick="location.hash=\'#exercise-activities\'">&#8592; Activities</button>' +
            '<h2>' + (isNew ? 'New Activity' : 'Edit Activity') + '</h2>' +
        '</div>' +
        '<p style="padding:24px;color:#666;">Activity form — coming in Phase 3.</p>';
}

// ─── Manage types page (stub — Phase 4) ──────────────────────────────────────

function loadExerciseTypesPage() {
    seedExerciseTypesIfNeeded();
    var el = document.getElementById('page-exercise-types');
    if (!el) return;
    el.innerHTML =
        '<div class="page-header">' +
            '<button class="btn btn-secondary btn-small" onclick="location.hash=\'#exercise-activities\'">&#8592; Activities</button>' +
            '<h2>Manage Activity Types</h2>' +
        '</div>' +
        '<p style="padding:24px;color:#666;">Type management — coming in Phase 4.</p>';
}

// ─── Format helpers ───────────────────────────────────────────────────────────

/** Converts decimal minutes to MM:SS or H:MM:SS. Returns '' if blank. */
function exFmtDuration(min) {
    if (min === null || min === undefined || min === '') return '';
    var totalSec = Math.round(parseFloat(min) * 60);
    var h  = Math.floor(totalSec / 3600);
    var m  = Math.floor((totalSec % 3600) / 60);
    var s  = totalSec % 60;
    var mm = String(m).padStart(2, '0');
    var ss = String(s).padStart(2, '0');
    return h > 0 ? (h + ':' + mm + ':' + ss) : (mm + ':' + ss);
}

/** Computes pace in M:SS/mi from miles and decimal minutes. Returns '' if either is missing. */
function exFmtPace(miles, durationMin) {
    if (!miles || !durationMin) return '';
    var paceMin = parseFloat(durationMin) / parseFloat(miles);
    var m = Math.floor(paceMin);
    var s = Math.round((paceMin - m) * 60);
    if (s === 60) { m++; s = 0; }
    return m + ':' + String(s).padStart(2, '0') + '/mi';
}

/** Formats an ISO datetime string as M/D/YY (e.g. "5/8/26"). */
function exFmtDateShort(isoStr) {
    var d = _exParseDate(isoStr);
    if (!d) return '';
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' + String(d.getFullYear()).slice(2);
}

/** Returns the full day name for an ISO datetime string (e.g. "Thursday"). */
function exFmtDayFull(isoStr) {
    var d = _exParseDate(isoStr);
    if (!d) return '';
    return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
}

/** Returns the 3-letter day abbreviation (e.g. "Thu"). */
function exFmtDayShort(isoStr) {
    return exFmtDayFull(isoStr).slice(0, 3);
}

function _exParseDate(isoStr) {
    if (!isoStr) return null;
    var d = new Date(isoStr);
    return isNaN(d.getTime()) ? null : d;
}

/** Returns a YYYY-MM-DD string for a Date object. */
function _exFmtYMD(date) {
    return date.getFullYear() + '-' +
           String(date.getMonth() + 1).padStart(2, '0') + '-' +
           String(date.getDate()).padStart(2, '0');
}
