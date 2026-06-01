/**
 * exercise.js — Exercise section: hub, activities list, activity detail, manage types.
 */

var _exDays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function _exDowLabel(ds) {
    if (!ds) return '';
    var p = ds.split('-');
    return _exDays[new Date(+p[0], +p[1]-1, +p[2]).getDay()];
}

// ─── Default types ────────────────────────────────────────────────────────────

const EXERCISE_DEFAULT_TYPES = [
    { name: 'Running',         tracksMiles: true,  withDogs: true  },
    { name: 'Trail Running',   tracksMiles: true,  withDogs: true  },
    { name: 'Mixed Run',       tracksMiles: true,  withDogs: true  },
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
    { name: 'Other',           tracksMiles: false, withDogs: false },
];

// Types that split mileage into Walked Miles + Run Miles (instead of a single Miles field)
var _EX_SPLIT_MILES_TYPES = ['Trail Running', 'Mixed Run', 'Treadmill'];
function _exIsSplitMilesType(type) {
    return !!(type && _EX_SPLIT_MILES_TYPES.indexOf(type.name) !== -1);
}

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

// One-time migration: add "Mixed Run" to existing users who were seeded before it existed
async function _exEnsureMixedRunType() {
    try {
        var snap = await userCol('exerciseTypes').where('name', '==', 'Mixed Run').limit(1).get();
        if (!snap.empty) return;
        await userCol('exerciseTypes').add({
            name: 'Mixed Run', tracksMiles: true, withDogs: true,
            isDefault: true, archived: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        console.error('Exercise: failed to ensure Mixed Run type:', err);
    }
}

// ─── Module-level state (activities list) ─────────────────────────────────────

var _exTypes       = {};    // typeId → type data (used by list rendering)
var _exRangeFilter = '30';  // dropdown value; preserved across page visits
var _exCustomStart = '';    // YYYY-MM-DD
var _exCustomEnd   = '';    // YYYY-MM-DD
var _exGoToDate    = '';    // YYYY-MM-DD or '' (overrides range filter when set)

// ─── Module-level state (activity form) ──────────────────────────────────────

var _exEditId             = null;  // null = new mode, string = edit mode
var _exSelectedTypeId     = null;  // typeId of the selected type
var _exSelectedType       = null;  // full type object of selected type
var _exAllTypes           = [];    // all non-archived types (sorted)
var _exPendingAddName     = '';    // type name being added on the fly
var _exPendingTracksMiles = null;  // answer to Q1 during add-on-fly flow

// ─── Hub page ─────────────────────────────────────────────────────────────────

function loadExercisePage() {
    window.scrollTo(0, 0);
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#life">Life</a><span class="separator">&rsaquo;</span><span>Exercise</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + (window.appName || 'My Life') + '</a>';

    var el = document.getElementById('page-exercise');
    if (!el) return;
    el.innerHTML =
        '<div class="page-header">' +
            '<h2>Exercise</h2>' +
        '</div>' +
        '<div class="landing-grid">' +
            '<a href="#exercise-activities" class="landing-tile landing-tile--exercise-activities">' +
                '<span class="landing-tile-icon">🏃</span>' +
                '<span class="landing-tile-label">Activities</span>' +
            '</a>' +
            '<a href="#exercise-metrics" class="landing-tile landing-tile--exercise-metrics">' +
                '<span class="landing-tile-icon">📋</span>' +
                '<span class="landing-tile-label">Daily Metrics</span>' +
            '</a>' +
            '<a href="#exercise-goals" class="landing-tile landing-tile--exercise-goals">' +
                '<span class="landing-tile-icon">🎯</span>' +
                '<span class="landing-tile-label">Goals</span>' +
            '</a>' +
            '<div class="landing-tile landing-tile--coming-soon">' +
                '<span class="landing-tile-icon">📊</span>' +
                '<span class="landing-tile-label">Summary</span>' +
                '<span class="coming-soon-badge">Coming Soon</span>' +
            '</div>' +
        '</div>';
}

// ─── Activities list page ─────────────────────────────────────────────────────

async function loadExerciseActivitiesPage() {
    window.scrollTo(0, 0);
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
        '<a href="#exercise">Exercise</a><span class="separator">&rsaquo;</span><span>Activities</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + (window.appName || 'My Life') + '</a>';

    seedExerciseTypesIfNeeded(); _exEnsureMixedRunType();
    _exGoToDate = '';

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

function _exBuildActivitiesPage() {
    var el = document.getElementById('page-exercise-activities');
    if (!el) return;

    var customHidden = _exRangeFilter !== 'custom' ? ' hidden' : '';

    el.innerHTML =
        '<div class="page-header">' +
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
                '<button class="btn btn-secondary btn-small hidden" id="exClearDateBtn">&#10005; Clear date</button>' +
            '</div>' +
        '</div>' +

        '<div id="exListContainer"></div>';

    document.getElementById('exRangeSelect').value = _exRangeFilter;

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

    var thead = document.createElement('thead');
    var hRow  = document.createElement('tr');
    ['Date', 'Day', 'Type', 'Duration', 'Miles', 'Pace', 'Cal', 'Comment'].forEach(function(h) {
        var th = document.createElement('th');
        th.textContent = h;
        hRow.appendChild(th);
    });
    thead.appendChild(hRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    activities.forEach(function(a) {
        var type     = _exTypes[a.typeId] || {};
        var typeName = (type.name || '?') + (a.withDogs ? ' 🐾' : '');
        var dur      = exFmtDuration(a.durationMinutes);
        // For split-miles types show walked + run total; otherwise just miles
        var milesDisplay = '';
        if (type.tracksMiles) {
            var walked = (a.miles    != null && a.miles    !== '') ? parseFloat(a.miles)    : 0;
            var run    = (a.runMiles != null && a.runMiles !== '') ? parseFloat(a.runMiles) : 0;
            var total  = _exIsSplitMilesType(type) ? (walked + run) : walked;
            if (total > 0) milesDisplay = total;
        }
        var miles = milesDisplay;
        var pace  = (type.tracksMiles && miles && a.durationMinutes) ? exFmtPace(miles, a.durationMinutes) : '';

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

        var line1 = document.createElement('div');
        line1.className = 'ex-card-line';
        [dateStr, typeName, dur].forEach(function(txt) {
            var span = document.createElement('span');
            span.textContent = txt;
            line1.appendChild(span);
        });
        card.appendChild(line1);

        var parts = [];
        if (type.tracksMiles) {
            var walked = (a.miles    != null && a.miles    !== '') ? parseFloat(a.miles)    : 0;
            var run    = (a.runMiles != null && a.runMiles !== '') ? parseFloat(a.runMiles) : 0;
            var totalMi = _exIsSplitMilesType(type) ? (walked + run) : walked;
            if (totalMi > 0) {
                var pace = exFmtPace(totalMi, a.durationMinutes);
                parts.push(totalMi + ' mi' + (pace ? ' @ ' + pace : ''));
            }
        }
        if (a.calories != null && a.calories !== '') parts.push(a.calories + ' cal');

        if (parts.length > 0) {
            var line2 = document.createElement('div');
            line2.className = 'ex-card-line ex-card-line--sub';
            parts.forEach(function(txt) {
                var span = document.createElement('span');
                span.textContent = txt;
                line2.appendChild(span);
            });
            card.appendChild(line2);
        }

        if (a.comment) {
            var line3 = document.createElement('div');
            line3.className = 'ex-card-note';
            line3.textContent = a.comment;
            card.appendChild(line3);
        }

        wrap.appendChild(card);
    });

    return wrap;
}

// ─── Activity detail / edit page ─────────────────────────────────────────────

async function loadExerciseActivityPage(id) {
    window.scrollTo(0, 0);
    seedExerciseTypesIfNeeded(); _exEnsureMixedRunType();

    _exEditId         = (id === 'new') ? null : id;
    _exSelectedTypeId = null;
    _exSelectedType   = null;
    _exPendingAddName = '';
    _exAllTypes       = [];

    var el = document.getElementById('page-exercise-activity');
    if (!el) return;
    el.innerHTML = '<p class="ex-status">Loading…</p>';

    try {
        // Load all non-archived types
        var typeSnap = await userCol('exerciseTypes').where('archived', '==', false).get();
        typeSnap.forEach(function(doc) {
            _exAllTypes.push(Object.assign({ id: doc.id }, doc.data()));
        });
        _exSortTypes(_exAllTypes);

        // Load the existing activity if editing
        var existing = null;
        if (_exEditId) {
            var actDoc = await userCol('exerciseActivities').doc(_exEditId).get();
            if (actDoc.exists) {
                existing = actDoc.data();
                // If the type is archived it won't be in _exAllTypes — fetch it so we can display it
                var typeInList = _exAllTypes.find(function(t) { return t.id === existing.typeId; });
                if (!typeInList && existing.typeId) {
                    var archivedDoc = await userCol('exerciseTypes').doc(existing.typeId).get();
                    if (archivedDoc.exists) {
                        _exAllTypes.unshift(Object.assign({ id: archivedDoc.id }, archivedDoc.data()));
                    }
                }
            }
        }

        _exBuildActivityForm(existing);

    } catch (err) {
        console.error('Exercise: failed to load activity form:', err);
        el.innerHTML = '<p class="ex-status">Error loading. Please go back and try again.</p>';
    }
}

function _exBuildActivityForm(existing) {
    var el    = document.getElementById('page-exercise-activity');
    var isNew = !_exEditId;

    // Date and time defaults
    var now         = new Date();
    var defaultDate = _exFmtYMD(now);
    var defaultTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    var date     = existing ? (existing.activityDate || '').substring(0, 10) : defaultDate;
    var time     = existing ? (existing.activityDate || '').substring(11, 16) : defaultTime;
    var duration = (existing && existing.durationMinutes != null) ? existing.durationMinutes : '';
    var miles    = (existing && existing.miles    != null) ? existing.miles    : '';
    var runMiles = (existing && existing.runMiles != null) ? existing.runMiles : '';
    var withDogs = existing ? !!existing.withDogs : false;
    var calories = (existing && existing.calories != null) ? existing.calories : '';
    var comment  = existing ? (existing.comment || '') : '';

    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
        '<a href="#exercise">Exercise</a><span class="separator">&rsaquo;</span>' +
        '<a href="#exercise-activities">Activities</a><span class="separator">&rsaquo;</span>' +
        '<span>' + (isNew ? 'New Activity' : 'Edit Activity') + '</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + (window.appName || 'My Life') + '</a>';

    el.innerHTML =
        '<div class="page-header">' +
            '<h2>' + (isNew ? 'New Activity' : 'Edit Activity') + '</h2>' +
        '</div>' +

        '<div class="ex-form">' +

            // ── From Picture (new mode only, shown when LLM configured) ───────
            (isNew ?
                '<div id="exFromPicSection" class="ex-from-pic-section hidden">' +
                    '<div class="ex-from-pic-divider">— or fill from a photo —</div>' +
                    '<input type="file" id="exPicInput" accept="image/*" style="display:none">' +
                    '<div class="ex-from-pic-btn-row">' +
                        '<button type="button" class="btn btn-secondary btn-sm" id="exPicGalleryBtn" title="Select picture to prefill exercise">📷 From Picture</button>' +
                    '</div>' +
                    '<div id="exPicStatus" class="ex-pic-status hidden"></div>' +
                '</div>'
            : '') +

            // ── Type picker ──────────────────────────────────────────────────
            '<div class="ex-form-group">' +
                '<label class="ex-label" for="exTypeInput">Activity Type <span class="ex-required">*</span></label>' +
                '<div class="ex-type-picker" id="exTypePicker">' +
                    '<input type="text" id="exTypeInput" class="ex-type-input" placeholder="Search types…" autocomplete="off">' +
                    '<div class="ex-type-dropdown hidden" id="exTypeDropdown"></div>' +
                '</div>' +
                // Add-on-fly panel
                '<div class="ex-add-type-panel hidden" id="exAddTypePanel">' +
                    '<p class="ex-add-type-title">New type: "<strong id="exAddTypeName"></strong>"</p>' +
                    '<div id="exAddTypeQ1">' +
                        '<p class="ex-add-type-q">Track miles for this activity?</p>' +
                        '<div class="ex-add-type-btns">' +
                            '<button class="btn btn-primary btn-small" id="exAddTypeMilesYes">Yes</button>' +
                            '<button class="btn btn-secondary btn-small" id="exAddTypeMilesNo">No</button>' +
                        '</div>' +
                    '</div>' +
                    '<div id="exAddTypeQ2" class="hidden">' +
                        '<p class="ex-add-type-q">Show \'With Dogs\' toggle?</p>' +
                        '<div class="ex-add-type-btns">' +
                            '<button class="btn btn-primary btn-small" id="exAddTypeDogsYes">Yes</button>' +
                            '<button class="btn btn-secondary btn-small" id="exAddTypeDogsNo">No</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            // ── Date & Time ──────────────────────────────────────────────────
            '<div class="ex-form-group">' +
                '<label class="ex-label">Date &amp; Time <span class="ex-required">*</span></label>' +
                '<div class="ex-datetime-row">' +
                    '<input type="date" id="exActivityDate" value="' + date + '">' +
                    '<span id="exActivityDateDow" class="ex-dow-label">' + _exDowLabel(date) + '</span>' +
                    '<input type="time" id="exActivityTime" value="' + time + '">' +
                '</div>' +
            '</div>' +

            // ── Duration ────────────────────────────────────────────────────
            '<div class="ex-form-group">' +
                '<label class="ex-label" for="exDuration">Duration</label>' +
                '<div class="ex-duration-row">' +
                    '<input type="text" inputmode="text" id="exDuration" class="ex-input-short" placeholder="e.g. 45:26 or 1:15:00" value="' + (duration !== '' ? exFmtDuration(duration) : '') + '">' +
                    '<span class="ex-duration-label" id="exDurationLabel">' + _exFmtDurationLabel(duration) + '</span>' +
                '</div>' +
                '<p class="ex-hint" id="exDurationHint">MM:SS &mdash; for over 1 hr use H:MM:SS (e.g. 1:15:00)</p>' +
            '</div>' +

            // ── Miles / Walked Miles (conditional) ──────────────────────────
            // Label is "Walked Miles" for Trail Running, Mixed Run, Treadmill;
            // "Miles" for all other types that track distance.
            '<div class="ex-form-group hidden" id="exMilesGroup">' +
                '<label class="ex-label" for="exMiles" id="exMilesLabel">Miles</label>' +
                '<input type="number" id="exMiles" class="ex-input-short" step="0.01" min="0" placeholder="e.g. 3.1" value="' + miles + '">' +
            '</div>' +

            // ── Run Miles (split-miles types only) ───────────────────────────
            '<div class="ex-form-group hidden" id="exRunMilesGroup">' +
                '<label class="ex-label" for="exRunMiles">Run Miles</label>' +
                '<input type="number" id="exRunMiles" class="ex-input-short" step="0.01" min="0" placeholder="e.g. 1.5" value="' + runMiles + '">' +
            '</div>' +

            // ── Total Miles preview (split-miles types only) ─────────────────
            '<div class="ex-form-group hidden" id="exTotalMilesGroup">' +
                '<label class="ex-label">Total Miles</label>' +
                '<span class="ex-pace-preview" id="exTotalMilesPreview">—</span>' +
            '</div>' +

            // ── Pace preview (conditional) ───────────────────────────────────
            '<div class="ex-form-group hidden" id="exPaceGroup">' +
                '<label class="ex-label">Pace</label>' +
                '<span class="ex-pace-preview" id="exPacePreview">—</span>' +
            '</div>' +

            // ── With Dogs (conditional) ──────────────────────────────────────
            '<div class="ex-form-group hidden" id="exWithDogsGroup">' +
                '<label class="ex-checkbox-label">' +
                    '<input type="checkbox" id="exWithDogs"' + (withDogs ? ' checked' : '') + '> With Dogs 🐾' +
                '</label>' +
            '</div>' +

            // ── Calories ────────────────────────────────────────────────────
            '<div class="ex-form-group">' +
                '<label class="ex-label" for="exCalories">Calories Burned</label>' +
                '<input type="number" id="exCalories" class="ex-input-short" min="0" placeholder="Optional" value="' + calories + '">' +
            '</div>' +

            // ── Comment ─────────────────────────────────────────────────────
            '<div class="ex-form-group">' +
                '<label class="ex-label" for="exComment">Comment</label>' +
                '<textarea id="exComment" class="ex-textarea" rows="3" placeholder="Optional notes…">' + _exEsc(comment) + '</textarea>' +
            '</div>' +

            // ── Actions ─────────────────────────────────────────────────────
            '<div class="ex-form-actions">' +
                '<button class="btn btn-primary" id="exSaveBtn">Save Activity</button>' +
                '<button class="btn btn-secondary" onclick="location.hash=\'#exercise-activities\'">Cancel</button>' +
                (!isNew ? '<button class="btn btn-danger" id="exDeleteBtn">Delete Activity</button>' : '') +
            '</div>' +

        '</div>';

    // ── Wire events ───────────────────────────────────────────────────────────

    var typeInput    = document.getElementById('exTypeInput');
    var typeDropdown = document.getElementById('exTypeDropdown');

    typeInput.addEventListener('focus', function() {
        this.select();
        _exRenderTypeDropdown('');
    });

    typeInput.addEventListener('input', function() {
        _exRenderTypeDropdown(this.value);
    });

    typeInput.addEventListener('blur', function() {
        setTimeout(function() {
            if (typeDropdown) typeDropdown.classList.add('hidden');
            // Restore input to the selected type name if one is chosen
            if (_exSelectedType) {
                typeInput.value = _exSelectedType.name;
            }
        }, 150);
    });

    // Add-on-fly buttons
    document.getElementById('exAddTypeMilesYes').addEventListener('click', function() { _exAddTypeAnswerMiles(true); });
    document.getElementById('exAddTypeMilesNo').addEventListener('click',  function() { _exAddTypeAnswerMiles(false); });
    document.getElementById('exAddTypeDogsYes').addEventListener('click',  function() { _exAddTypeAnswerDogs(true); });
    document.getElementById('exAddTypeDogsNo').addEventListener('click',   function() { _exAddTypeAnswerDogs(false); });

    // Duration hint + pace preview: update when duration changes
    document.getElementById('exActivityDate').addEventListener('change', function() {
        var dowEl = document.getElementById('exActivityDateDow');
        if (dowEl) dowEl.textContent = _exDowLabel(this.value);
    });

    document.getElementById('exDuration').addEventListener('input', function() {
        _exUpdateDurationHint();
        _exUpdatePacePreview();
    });
    document.getElementById('exMiles') && document.getElementById('exMiles').addEventListener('input', _exUpdatePacePreview);

    // From Picture
    if (isNew) {
        var exPicInput   = document.getElementById('exPicInput');
        var exGalleryBtn = document.getElementById('exPicGalleryBtn');
        if (exGalleryBtn) exGalleryBtn.addEventListener('click', function() { exPicInput.click(); });
        if (exPicInput) exPicInput.addEventListener('change', function() {
            if (this.files && this.files.length > 0) _exHandleFromPicture(this.files);
        });
    }

    // Save and delete
    document.getElementById('exSaveBtn').addEventListener('click', _exSaveActivity);
    var delBtn = document.getElementById('exDeleteBtn');
    if (delBtn) delBtn.addEventListener('click', _exDeleteActivity);

    // Pre-select type when editing
    if (existing && existing.typeId) {
        var preType = _exAllTypes.find(function(t) { return t.id === existing.typeId; });
        if (preType) _exSelectType(preType.id, preType.name, preType);
    }

    _exUpdatePacePreview();

    if (isNew) _exCheckLlmForPage();
}

// ─── Searchable type dropdown ─────────────────────────────────────────────────

function _exRenderTypeDropdown(searchText) {
    var dropdown = document.getElementById('exTypeDropdown');
    if (!dropdown) return;

    dropdown.innerHTML = '';
    var search = (searchText || '').trim().toLowerCase();

    var filtered = _exAllTypes.filter(function(t) {
        return !search || t.name.toLowerCase().includes(search);
    });

    filtered.forEach(function(t) {
        var item = document.createElement('div');
        item.className = 'ex-type-option';
        item.textContent = t.name;
        item.addEventListener('mousedown', function(e) {
            e.preventDefault();
            _exSelectType(t.id, t.name, t);
            dropdown.classList.add('hidden');
        });
        dropdown.appendChild(item);
    });

    // "Add X" option if typed text has no case-insensitive exact match
    if (search) {
        var exactMatch = _exAllTypes.some(function(t) {
            return t.name.toLowerCase() === search;
        });
        if (!exactMatch) {
            var addItem = document.createElement('div');
            addItem.className = 'ex-type-option ex-type-option--add';
            addItem.textContent = '＋ Add "' + searchText.trim() + '"';
            addItem.addEventListener('mousedown', function(e) {
                e.preventDefault();
                dropdown.classList.add('hidden');
                _exStartAddType(searchText.trim());
            });
            dropdown.appendChild(addItem);
        }
    }

    dropdown.classList.toggle('hidden', dropdown.children.length === 0);
}

function _exSelectType(typeId, typeName, typeObj) {
    _exSelectedTypeId = typeId;
    _exSelectedType   = typeObj;
    var input = document.getElementById('exTypeInput');
    if (input) input.value = typeName;
    _exUpdateConditionalFields();
    _exUpdatePacePreview();
}

function _exUpdateConditionalFields() {
    var type = _exSelectedType || {};
    var isSplit = _exIsSplitMilesType(type);

    var milesGroup      = document.getElementById('exMilesGroup');
    var milesLabel      = document.getElementById('exMilesLabel');
    var runMilesGroup   = document.getElementById('exRunMilesGroup');
    var totalMilesGroup = document.getElementById('exTotalMilesGroup');
    var paceGroup       = document.getElementById('exPaceGroup');
    var dogsGroup       = document.getElementById('exWithDogsGroup');

    if (milesGroup)      milesGroup.classList.toggle('hidden', !type.tracksMiles);
    if (milesLabel)      milesLabel.textContent = isSplit ? 'Walked Miles' : 'Miles';
    if (runMilesGroup)   runMilesGroup.classList.toggle('hidden', !isSplit);
    if (totalMilesGroup) totalMilesGroup.classList.toggle('hidden', !isSplit);
    if (paceGroup)       paceGroup.classList.toggle('hidden', !type.tracksMiles);
    if (dogsGroup)       dogsGroup.classList.toggle('hidden', !type.withDogs);

    // Wire input listeners now that fields may be visible
    var milesInput = document.getElementById('exMiles');
    if (milesInput && !milesInput.dataset.listenerAttached) {
        milesInput.addEventListener('input', function() {
            _exUpdateTotalMilesPreview();
            _exUpdatePacePreview();
        });
        milesInput.dataset.listenerAttached = '1';
    }
    var runMilesInput = document.getElementById('exRunMiles');
    if (runMilesInput && !runMilesInput.dataset.listenerAttached) {
        runMilesInput.addEventListener('input', function() {
            _exUpdateTotalMilesPreview();
            _exUpdatePacePreview();
        });
        runMilesInput.dataset.listenerAttached = '1';
    }

    _exUpdateTotalMilesPreview();
}

// ─── Add-on-fly flow ──────────────────────────────────────────────────────────

function _exStartAddType(name) {
    _exPendingAddName     = name;
    _exPendingTracksMiles = null;

    document.getElementById('exAddTypeName').textContent = name;
    document.getElementById('exAddTypeQ1').classList.remove('hidden');
    document.getElementById('exAddTypeQ2').classList.add('hidden');
    document.getElementById('exAddTypePanel').classList.remove('hidden');
}

function _exAddTypeAnswerMiles(yes) {
    _exPendingTracksMiles = yes;
    document.getElementById('exAddTypeQ1').classList.add('hidden');
    document.getElementById('exAddTypeQ2').classList.remove('hidden');
}

async function _exAddTypeAnswerDogs(yes) {
    document.getElementById('exAddTypePanel').classList.add('hidden');

    try {
        var ref = userCol('exerciseTypes').doc();
        await ref.set({
            name:        _exPendingAddName,
            tracksMiles: _exPendingTracksMiles,
            withDogs:    yes,
            isDefault:   false,
            archived:    false,
            createdAt:   firebase.firestore.FieldValue.serverTimestamp()
        });

        var newType = {
            id: ref.id, name: _exPendingAddName,
            tracksMiles: _exPendingTracksMiles, withDogs: yes,
            isDefault: false, archived: false
        };
        _exAllTypes.push(newType);
        _exSortTypes(_exAllTypes);

        // Keep the activities-list type map in sync
        _exTypes[ref.id] = newType;

        _exSelectType(ref.id, _exPendingAddName, newType);

    } catch (err) {
        console.error('Exercise: failed to save new type:', err);
        alert('Failed to save the new activity type. Please try again.');
    }
}

// ─── Duration parsing & hint ──────────────────────────────────────────────────

/**
 * Parses a duration string into decimal minutes.
 * Accepts: "45:26" (MM:SS), "1:15:26" (H:MM:SS), or "45.5" (decimal minutes).
 * Returns null if blank or unparseable.
 */
function _exParseDuration(val) {
    if (val == null || String(val).trim() === '') return null;
    var str = String(val).trim();
    if (str.indexOf(':') !== -1) {
        var parts = str.split(':');
        if (parts.length === 2) {
            // MM:SS
            var m = parseInt(parts[0], 10);
            var s = parseInt(parts[1], 10);
            if (isNaN(m) || isNaN(s)) return null;
            return m + s / 60;
        } else if (parts.length === 3) {
            // H:MM:SS
            var h = parseInt(parts[0], 10);
            var m = parseInt(parts[1], 10);
            var s = parseInt(parts[2], 10);
            if (isNaN(h) || isNaN(m) || isNaN(s)) return null;
            return h * 60 + m + s / 60;
        }
        return null;
    }
    var n = parseFloat(str);
    return isNaN(n) ? null : n;
}

/** Returns a friendly label like "1 hr 15 min" or "45 min 26 sec". Empty string if blank. */
function _exFmtDurationLabel(val) {
    var decMin = (typeof val === 'number') ? val : _exParseDuration(val);
    if (decMin == null || isNaN(decMin)) return '';
    var totalSec = Math.round(decMin * 60);
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    var parts = [];
    if (h > 0) parts.push(h + ' hr');
    if (m > 0) parts.push(m + ' min');
    if (s > 0 && h === 0) parts.push(s + ' sec');
    return parts.join(' ');
}

function _exUpdateDurationHint() {
    var labelEl = document.getElementById('exDurationLabel');
    var durEl   = document.getElementById('exDuration');
    if (!labelEl || !durEl) return;
    labelEl.textContent = _exFmtDurationLabel(durEl.value);
}

// ─── Pace / total miles preview ──────────────────────────────────────────────

function _exUpdateTotalMilesPreview() {
    var el = document.getElementById('exTotalMilesPreview');
    if (!el) return;
    var walked = parseFloat((document.getElementById('exMiles')    || {}).value) || 0;
    var run    = parseFloat((document.getElementById('exRunMiles') || {}).value) || 0;
    el.textContent = (walked > 0 || run > 0) ? (walked + run).toFixed(2) + ' mi' : '—';
}

function _exUpdatePacePreview() {
    var previewEl = document.getElementById('exPacePreview');
    if (!previewEl) return;
    var durEl = document.getElementById('exDuration');
    if (!durEl) { previewEl.textContent = '—'; return; }
    var dur = _exParseDuration(durEl.value);

    // For split-miles types pace is based on total miles (walked + run)
    var milesForPace;
    if (_exIsSplitMilesType(_exSelectedType)) {
        var walked = parseFloat((document.getElementById('exMiles')    || {}).value) || 0;
        var run    = parseFloat((document.getElementById('exRunMiles') || {}).value) || 0;
        milesForPace = walked + run;
    } else {
        milesForPace = parseFloat((document.getElementById('exMiles') || {}).value) || 0;
    }

    previewEl.textContent = (milesForPace > 0 && dur > 0) ? exFmtPace(milesForPace, dur) : '—';
}

// ─── Save ─────────────────────────────────────────────────────────────────────

async function _exSaveActivity() {
    if (!_exSelectedTypeId) {
        alert('Please select an activity type.');
        return;
    }
    var date = document.getElementById('exActivityDate').value;
    var time = document.getElementById('exActivityTime').value || '00:00';
    if (!date) { alert('Please enter a date.'); return; }

    var type         = _exSelectedType || {};
    var isSplit      = _exIsSplitMilesType(type);
    var durVal       = document.getElementById('exDuration').value;
    var milesEl      = document.getElementById('exMiles');
    var runMilesEl   = document.getElementById('exRunMiles');
    var milesVal     = (type.tracksMiles && milesEl)            ? milesEl.value    : '';
    var runMilesVal  = (isSplit && runMilesEl)                  ? runMilesEl.value : '';
    var dogsEl       = document.getElementById('exWithDogs');
    var dogsVal      = (type.withDogs && dogsEl) ? dogsEl.checked : null;
    var calVal       = document.getElementById('exCalories').value;
    var noteVal      = document.getElementById('exComment').value.trim();

    var data = {
        typeId:          _exSelectedTypeId,
        activityDate:    date + 'T' + time + ':00',
        durationMinutes: _exParseDuration(durVal),
        miles:           milesVal    !== '' ? parseFloat(milesVal)    : null,
        runMiles:        runMilesVal !== '' ? parseFloat(runMilesVal) : null,
        withDogs:        dogsVal,
        calories:        calVal !== '' ? parseInt(calVal, 10) : null,
        comment:         noteVal
    };

    var saveBtn = document.getElementById('exSaveBtn');
    saveBtn.textContent = 'Saving…';
    saveBtn.disabled    = true;

    try {
        if (_exEditId) {
            await userCol('exerciseActivities').doc(_exEditId).update(data);
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await userCol('exerciseActivities').add(data);
        }
        location.hash = '#exercise-activities';
    } catch (err) {
        console.error('Exercise: save failed:', err);
        alert('Failed to save. Please try again.');
        saveBtn.textContent = 'Save Activity';
        saveBtn.disabled    = false;
    }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

async function _exDeleteActivity() {
    if (!_exEditId) return;
    if (!confirm('Delete this activity? This cannot be undone.')) return;

    try {
        await userCol('exerciseActivities').doc(_exEditId).delete();
        location.hash = '#exercise-activities';
    } catch (err) {
        console.error('Exercise: delete failed:', err);
        alert('Failed to delete. Please try again.');
    }
}

// ─── Manage types page ────────────────────────────────────────────────────────

var _exTypesAll = [];  // full list loaded for the types page

async function loadExerciseTypesPage() {
    window.scrollTo(0, 0);
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
        '<a href="#exercise">Exercise</a><span class="separator">&rsaquo;</span>' +
        '<a href="#exercise-activities">Activities</a><span class="separator">&rsaquo;</span>' +
        '<span>Manage Types</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + (window.appName || 'My Life') + '</a>';

    seedExerciseTypesIfNeeded(); _exEnsureMixedRunType();
    var el = document.getElementById('page-exercise-types');
    if (!el) return;

    el.innerHTML =
        '<div class="page-header">' +
            '<h2>Manage Activity Types</h2>' +
        '</div>' +
        '<div id="exTypesListWrap"><p class="ex-types-loading">Loading…</p></div>';

    try {
        var snap = await userCol('exerciseTypes')
            .where('archived', '==', false)
            .get();
        _exTypesAll = snap.docs.map(function(d) {
            return Object.assign({ id: d.id }, d.data());
        });
        _exTypesAll = _exSortTypes(_exTypesAll);
        _exRenderTypesList();
    } catch (err) {
        console.error('Exercise: failed to load types:', err);
        document.getElementById('exTypesListWrap').innerHTML =
            '<p class="ex-types-error">Failed to load types.</p>';
    }
}

function _exRenderTypesList() {
    var wrap = document.getElementById('exTypesListWrap');
    if (!wrap) return;

    if (_exTypesAll.length === 0) {
        wrap.innerHTML = '<p class="ex-types-empty">No activity types found.</p>';
        return;
    }

    var rows = _exTypesAll.map(function(t) {
        var icons = '';
        if (t.tracksMiles) icons += '<span class="ex-type-flag" title="Tracks miles">📏</span>';
        if (t.withDogs)    icons += '<span class="ex-type-flag" title="With dogs">🐾</span>';

        if (t.isDefault) {
            // Built-in: show name + icons, no action buttons
            return '<div class="ex-type-row" id="exTypeRow-' + t.id + '">' +
                       '<span class="ex-type-row-name">' + _exEsc(t.name) + '</span>' +
                       '<span class="ex-type-row-icons">' + icons + '</span>' +
                       '<span class="ex-type-row-badge">built-in</span>' +
                   '</div>';
        }

        // Custom: show name + icons + Rename + Delete
        return '<div class="ex-type-row" id="exTypeRow-' + t.id + '">' +
                   '<span class="ex-type-row-name" id="exTypeName-' + t.id + '">' + _exEsc(t.name) + '</span>' +
                   '<span class="ex-type-row-icons">' + icons + '</span>' +
                   '<div class="ex-type-row-actions">' +
                       '<button class="btn btn-secondary btn-small" ' +
                           'onclick="_exStartRenameType(\'' + t.id + '\')">' +
                           'Rename' +
                       '</button>' +
                       '<button class="btn btn-small ex-type-delete-btn" ' +
                           'onclick="_exDeleteType(\'' + t.id + '\')">' +
                           'Delete' +
                       '</button>' +
                   '</div>' +
               '</div>';
    });

    wrap.innerHTML =
        '<p class="ex-types-hint">Built-in types cannot be renamed or deleted. Custom types can be renamed; deleting hides them from the dropdown but preserves your history.</p>' +
        '<div class="ex-types-list">' + rows.join('') + '</div>';
}

function _exStartRenameType(typeId) {
    var t = _exTypesAll.find(function(x) { return x.id === typeId; });
    if (!t || t.isDefault) return;

    var row = document.getElementById('exTypeRow-' + typeId);
    if (!row) return;

    // Replace the name span with an inline input + Save/Cancel buttons
    var icons = '';
    if (t.tracksMiles) icons += '<span class="ex-type-flag" title="Tracks miles">📏</span>';
    if (t.withDogs)    icons += '<span class="ex-type-flag" title="With dogs">🐾</span>';

    row.innerHTML =
        '<input type="text" class="ex-type-rename-input" id="exRenameInput-' + typeId + '" ' +
               'value="' + _exEsc(t.name) + '" maxlength="60">' +
        '<span class="ex-type-row-icons">' + icons + '</span>' +
        '<div class="ex-type-row-actions">' +
            '<button class="btn btn-primary btn-small" ' +
                    'onclick="_exSaveRenameType(\'' + typeId + '\')">' +
                'Save' +
            '</button>' +
            '<button class="btn btn-secondary btn-small" ' +
                    'onclick="_exRenderTypesList()">' +
                'Cancel' +
            '</button>' +
        '</div>';

    var input = document.getElementById('exRenameInput-' + typeId);
    if (input) { input.focus(); input.select(); }
}

async function _exSaveRenameType(typeId) {
    var input = document.getElementById('exRenameInput-' + typeId);
    if (!input) return;
    var newName = input.value.trim();
    if (!newName) { alert('Name cannot be blank.'); input.focus(); return; }

    var saveBtn = input.closest('.ex-type-row').querySelector('.btn-primary');
    if (saveBtn) { saveBtn.textContent = 'Saving…'; saveBtn.disabled = true; }

    try {
        await userCol('exerciseTypes').doc(typeId).update({ name: newName });
        var t = _exTypesAll.find(function(x) { return x.id === typeId; });
        if (t) t.name = newName;
        _exRenderTypesList();
    } catch (err) {
        console.error('Exercise: rename failed:', err);
        alert('Failed to save. Please try again.');
        if (saveBtn) { saveBtn.textContent = 'Save'; saveBtn.disabled = false; }
    }
}

async function _exDeleteType(typeId) {
    var t = _exTypesAll.find(function(x) { return x.id === typeId; });
    if (!t || t.isDefault) return;
    if (!confirm('Delete "' + t.name + '"? It will be removed from the dropdown but your past activities will still show this type name.')) return;

    try {
        await userCol('exerciseTypes').doc(typeId).update({ archived: true });
        _exTypesAll = _exTypesAll.filter(function(x) { return x.id !== typeId; });
        _exRenderTypesList();
    } catch (err) {
        console.error('Exercise: delete type failed:', err);
        alert('Failed to delete. Please try again.');
    }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

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

/** Computes pace as M:SS/mi. Returns '' if either input is missing. */
function exFmtPace(miles, durationMin) {
    if (!miles || !durationMin) return '';
    var paceMin = parseFloat(durationMin) / parseFloat(miles);
    var m = Math.floor(paceMin);
    var s = Math.round((paceMin - m) * 60);
    if (s === 60) { m++; s = 0; }
    return m + ':' + String(s).padStart(2, '0') + '/mi';
}

/** Formats an ISO datetime string as M/D/YY. */
function exFmtDateShort(isoStr) {
    var d = _exParseDate(isoStr);
    if (!d) return '';
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' + String(d.getFullYear()).slice(2);
}

/** Returns the full day name (e.g. "Thursday"). */
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

function _exFmtYMD(date) {
    return date.getFullYear() + '-' +
           String(date.getMonth() + 1).padStart(2, '0') + '-' +
           String(date.getDate()).padStart(2, '0');
}

/** Sorts types: defaults first (alpha), then customs (alpha). Returns the array. */
function _exSortTypes(arr) {
    arr.sort(function(a, b) {
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
    return arr;
}

/** HTML-escapes a string for safe insertion into innerHTML. */
function _exEsc(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─── From Picture ─────────────────────────────────────────────────────────────

async function _exCheckLlmForPage() {
    try {
        var doc = await userCol('settings').doc('llm').get();
        var ok  = doc.exists && doc.data().provider && doc.data().apiKey;
        var section = document.getElementById('exFromPicSection');
        if (section) section.classList.toggle('hidden', !ok);
    } catch (e) { /* leave hidden on error */ }
}

async function _exHandleFromPicture(files) {
    if (!files || !files.length) return;

    var statusEl   = document.getElementById('exPicStatus');
    var galleryBtn = document.getElementById('exPicGalleryBtn');
    var saveBtn    = document.getElementById('exSaveBtn');

    statusEl.textContent = 'Analyzing picture…';
    statusEl.classList.remove('hidden');
    if (galleryBtn) galleryBtn.disabled = true;
    if (saveBtn)    saveBtn.disabled    = true;

    try {
        // Compress up to 2 images
        var images = [];
        for (var i = 0; i < Math.min(files.length, 2); i++) {
            images.push(await compressImage(files[i]));
        }

        // Load LLM config
        var cfgDoc = await userCol('settings').doc('llm').get();
        var cfg    = cfgDoc.exists ? cfgDoc.data() : null;
        if (!cfg || !cfg.provider || !cfg.apiKey) {
            statusEl.textContent = 'No LLM configured. Go to Settings.';
            return;
        }
        var llm = LLM_PROVIDERS[cfg.provider];
        if (!llm) { statusEl.textContent = 'Unknown LLM provider.'; return; }

        // Build prompt — include available type names so LLM can match
        var typeNames = _exAllTypes.map(function(t) { return t.name; });
        var now = new Date();
        var prompt = [
            'You are a fitness data extraction assistant. Analyze the provided exercise screenshot and return ONLY a valid JSON object.',
            'No explanation, no markdown, no code blocks. Your entire response must be parseable by JSON.parse().',
            '',
            'Return this exact structure:',
            '{',
            '  "typeName": "",',
            '  "activityDate": null,',
            '  "activityTime": null,',
            '  "durationMin": null,',
            '  "miles": null,',
            '  "calories": null,',
            '  "additionalMessage": ""',
            '}',
            '',
            'Field rules:',
            '- typeName: pick the best match from this list (use exact name, or "" if none fits): ' + JSON.stringify(typeNames),
            '- activityDate: the date the activity took place, as YYYY-MM-DD (e.g. "2026-05-12"). Use the current year (' + now.getFullYear() + ') if only month/day is shown. Return null if no date is visible.',
            '- activityTime: the start time of the activity in 24-hour HH:MM format (e.g. "17:12"), or null if not visible',
            '- durationMin: total exercise duration as decimal minutes (e.g. 22min 58sec = 22.967), or null if not shown',
            '- miles: distance in miles as a decimal number, or null if not shown or not applicable',
            '- calories: total calories burned as an integer, or null if not shown',
            '- additionalMessage: brief note on what could not be extracted, or "" if all fields found'
        ].join('\n');

        var content = [{ type: 'text', text: prompt }];
        images.forEach(function(url) {
            content.push({ type: 'image_url', image_url: { url: url } });
        });

        var model        = cfg.model || llm.model;
        var responseText = await chatCallOpenAICompat(llm, cfg.apiKey, content, model);

        // Parse JSON response
        var parsed;
        try {
            var cleaned   = responseText.replace(/```[\s\S]*?```/g, '').trim();
            var jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
        } catch (e) {
            statusEl.textContent = 'Could not parse LLM response. Try again.';
            return;
        }

        // Pre-fill Date (default to today if LLM returns null)
        var dateEl = document.getElementById('exActivityDate');
        var dowEl  = document.getElementById('exActivityDateDow');
        if (dateEl) {
            var fillDate = (parsed.activityDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.activityDate))
                ? parsed.activityDate
                : _exFmtYMD(new Date());
            dateEl.value = fillDate;
            if (dowEl) dowEl.textContent = _exDowLabel(fillDate);
        }

        // Pre-fill Time (default to now if LLM returns null)
        var timeEl = document.getElementById('exActivityTime');
        if (timeEl) {
            if (parsed.activityTime && /^\d{2}:\d{2}$/.test(parsed.activityTime)) {
                timeEl.value = parsed.activityTime;
            } else {
                var n = new Date();
                timeEl.value = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
            }
        }

        // Pre-fill Type
        if (parsed.typeName) {
            var match = _exAllTypes.find(function(t) {
                return t.name.toLowerCase() === String(parsed.typeName).toLowerCase();
            });
            if (match) _exSelectType(match.id, match.name, match);
        }

        // Pre-fill Duration
        if (parsed.durationMin != null) {
            var durEl = document.getElementById('exDuration');
            if (durEl) {
                durEl.value = exFmtDuration(parsed.durationMin);
                _exUpdateDurationHint();
                _exUpdatePacePreview();
            }
        }

        // Pre-fill Miles
        if (parsed.miles != null) {
            var milesEl = document.getElementById('exMiles');
            if (milesEl) {
                milesEl.value = parsed.miles;
                _exUpdatePacePreview();
            }
        }

        // Pre-fill Calories
        if (parsed.calories != null) {
            var calEl = document.getElementById('exCalories');
            if (calEl) calEl.value = parsed.calories;
        }

        statusEl.textContent = parsed.additionalMessage || 'Fields pre-filled — review and save.';
        statusEl.style.color = '#2e7d32'; // green for success

    } catch (err) {
        console.error('Exercise from picture error:', err);
        statusEl.textContent = 'Error: ' + err.message;
        statusEl.style.color = '';
    } finally {
        if (galleryBtn) galleryBtn.disabled = false;
        if (saveBtn)    saveBtn.disabled    = false;
        var picInput = document.getElementById('exPicInput');
        if (picInput) picInput.value = '';
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DAILY METRICS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Module-level state ──────────────────────────────────────────────────────

var _dmDefsAll        = [];         // non-archived metric defs, sorted by sortOrder (used by Manage Metrics)
var _dmMetricDefs     = [];         // same data, used by list + entry form
var _dmSelMonth       = -1;         // 0-11 = specific month, -1 = full year view; set on page load
var _dmGoalsData      = null;       // current year's exerciseGoals doc; drives color thresholds
var _dmSelYear        = 0;          // 4-digit year; set on page load
var _dmLast7Expanded  = false;      // sticky accordion state — loaded from settings/exercisePrefs
var _dmEditDate       = null;       // null = new entry; 'YYYY-MM-DD' = editing existing
var _dmExistingDoc    = null;       // loaded doc data or null

// No default seeding — each user creates their own custom metrics via Manage Metrics.
function seedExerciseMetricDefsIfNeeded() { return Promise.resolve(); }

// ─── Page load stubs ─────────────────────────────────────────────────────────

async function loadExerciseMetricsPage() {
    window.scrollTo(0, 0);
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
        '<a href="#exercise">Exercise</a><span class="separator">&rsaquo;</span><span>Daily Metrics</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + (window.appName || 'My Life') + '</a>';

    var el = document.getElementById('page-exercise-metrics');
    if (!el) return;
    el.innerHTML = '<p class="ex-status">Loading…</p>';

    var _now = new Date();
    _dmSelMonth = _now.getMonth();   // 0-11
    _dmSelYear  = _now.getFullYear();

    await seedExerciseMetricDefsIfNeeded();

    // Load metric defs, sticky prefs, and current year's goals doc in parallel
    var results = await Promise.all([
        userCol('exerciseMetricDefs').get(),
        userCol('settings').doc('exercisePrefs').get(),
        userCol('exerciseGoals').doc(String(new Date().getFullYear())).get()
    ]);
    _dmMetricDefs = results[0].docs
        .map(function(d) { return Object.assign({ id: d.id }, d.data()); })
        .filter(function(d) { return !d.archived; })
        .sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
    var prefs = results[1].exists ? results[1].data() : {};
    _dmLast7Expanded = prefs.dmLast7Expanded === true;
    _dmGoalsData = results[2].exists ? results[2].data() : null;

    _dmRenderMetricsPage(el);
}

function _dmRenderMetricsPage(el) {
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    // Month combo: 'Year' at top, then Jan–Dec
    var monthOpts = '<option value="-1"' + (_dmSelMonth === -1 ? ' selected' : '') + '>Year</option>';
    for (var m = 0; m < 12; m++) {
        monthOpts += '<option value="' + m + '"' + (_dmSelMonth === m ? ' selected' : '') + '>' + monthNames[m] + '</option>';
    }

    // Year combo: 2020–2070
    var yearOpts = '';
    for (var y = 2020; y <= 2070; y++) {
        yearOpts += '<option value="' + y + '"' + (_dmSelYear === y ? ' selected' : '') + '>' + y + '</option>';
    }

    el.innerHTML =
        '<div class="dm-list-header">' +
            '<h2>Daily Metrics</h2>' +
            '<div class="dm-list-actions">' +
                '<a href="#exercise-metric-defs" class="ex-link-btn">Manage Metrics</a>' +
                '<a href="#exercise-metric/new" class="btn-primary dm-entry-btn">+ Entry</a>' +
            '</div>' +
        '</div>' +
        '<div class="dm-filter-bar">' +
            '<select id="dmMonthSelect" class="dm-filter-select">' + monthOpts + '</select>' +
            '<select id="dmYearSelect" class="dm-filter-select">' + yearOpts + '</select>' +
        '</div>' +
        '<div class="dm-records-label" id="dmRecordsLabel">Loading…</div>' +
        '<div id="dmListContent"><p class="ex-status">Loading…</p></div>';

    document.getElementById('dmMonthSelect').addEventListener('change', function() {
        _dmSelMonth = parseInt(this.value, 10);
        _dmApplyFilter();
    });
    document.getElementById('dmYearSelect').addEventListener('change', function() {
        _dmSelYear = parseInt(this.value, 10);
        _dmApplyFilter();
    });

    _dmApplyFilter();
}

function _dmFmtYM(year, month) {
    // Returns 'YYYY-MM-DD' for first or last day of a given year/month (0-based month)
    var mm = (month + 1 < 10 ? '0' : '') + (month + 1);
    var lastDay = new Date(year, month + 1, 0).getDate();
    return {
        start: year + '-' + mm + '-01',
        end:   year + '-' + mm + '-' + (lastDay < 10 ? '0' : '') + lastDay
    };
}

async function _dmApplyFilter() {
    var listEl = document.getElementById('dmListContent');
    var labelEl = document.getElementById('dmRecordsLabel');
    if (!listEl) return;
    listEl.innerHTML = '<p class="ex-status">Loading…</p>';

    // Determine query range
    var rangeStart, rangeEnd;
    if (_dmSelMonth === -1) {
        rangeStart = _dmSelYear + '-01-01';
        rangeEnd   = _dmSelYear + '-12-31';
    } else {
        var r = _dmFmtYM(_dmSelYear, _dmSelMonth);
        rangeStart = r.start;
        rangeEnd   = r.end;
    }

    var snap;
    try {
        snap = await userCol('exerciseDailyMetrics')
            .orderBy('date', 'desc')
            .limit(500)
            .get();
    } catch (e) {
        listEl.innerHTML = '<p class="ex-status">Error loading records.</p>';
        return;
    }

    var records = snap.docs
        .map(function(d) { return Object.assign({ id: d.id }, d.data()); })
        .filter(function(r) { return r.date >= rangeStart && r.date <= rangeEnd; });

    if (labelEl) labelEl.textContent = records.length + ' record' + (records.length === 1 ? '' : 's');

    var isDesktop = window.innerWidth >= 700;

    // ── Year view: collapsible monthly accordion ──────────────────────────────
    if (_dmSelMonth === -1) {
        var monthNames = ['January','February','March','April','May','June',
                          'July','August','September','October','November','December'];
        var html = '<div class="dm-year-accordion">';
        for (var mo = 0; mo < 12; mo++) {
            var r2 = _dmFmtYM(_dmSelYear, mo);
            var moRecords = records.filter(function(rec) { return rec.date >= r2.start && rec.date <= r2.end; });
            var countLabel = moRecords.length === 0 ? 'No records'
                           : moRecords.length + ' record' + (moRecords.length === 1 ? '' : 's');
            html += '<div class="dm-accordion-section">' +
                '<button class="dm-accordion-hdr" data-mo="' + mo + '" aria-expanded="false">' +
                    '<span class="dm-accordion-title">' + monthNames[mo] + ' ' + _dmSelYear + '</span>' +
                    '<span class="dm-accordion-count">' + countLabel + '</span>' +
                    '<span class="dm-accordion-arrow">▶</span>' +
                '</button>' +
                '<div class="dm-accordion-body" id="dmAccordion-' + mo + '" style="display:none">';
            if (moRecords.length === 0) {
                html += '<p class="ex-status dm-accordion-empty">No records for this month.</p>';
            } else {
                var moSummary = _dmComputeSummary(moRecords);
                html += isDesktop
                    ? _dmBuildTable(moRecords, moSummary)
                    : _dmBuildCards(moRecords, moSummary);
            }
            html += '</div></div>';
        }
        html += '</div>';
        listEl.innerHTML = html;

        // Wire accordion toggles
        listEl.querySelectorAll('.dm-accordion-hdr').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var mo2 = btn.dataset.mo;
                var body = document.getElementById('dmAccordion-' + mo2);
                var open = btn.getAttribute('aria-expanded') === 'true';
                btn.setAttribute('aria-expanded', open ? 'false' : 'true');
                body.style.display = open ? 'none' : 'block';
                btn.querySelector('.dm-accordion-arrow').textContent = open ? '▶' : '▼';
            });
        });
    } else {
        // ── Month view: standard table or cards ───────────────────────────────

        // Determine if we should show the Last 7 Days accordion (current month + current year only)
        var todayD = new Date();
        var isCurrentPeriod = (_dmSelMonth === todayD.getMonth() && _dmSelYear === todayD.getFullYear());

        var last7Html = '';
        if (isCurrentPeriod) {
            // Compute last-7 date range — ends yesterday, never includes today
            var l7End = new Date(todayD); l7End.setHours(0,0,0,0);
            l7End.setDate(l7End.getDate() - 1);              // yesterday
            var l7Start = new Date(l7End); l7Start.setDate(l7End.getDate() - 6); // 7 days total
            function _fmtD(dt) {
                var mm = dt.getMonth()+1, dd = dt.getDate();
                return dt.getFullYear() + '-' + (mm<10?'0':'') + mm + '-' + (dd<10?'0':'') + dd;
            }
            var l7StartStr = _fmtD(l7Start), l7EndStr = _fmtD(l7End);

            // Fetch last-7 records separately (separate query — never touches monthly data)
            var l7Snap;
            try {
                l7Snap = await userCol('exerciseDailyMetrics')
                    .where('date', '<=', l7EndStr)   // exclude today before applying limit
                    .orderBy('date', 'desc')
                    .limit(7)
                    .get();
            } catch(e) { l7Snap = null; }

            var l7Records = l7Snap ? l7Snap.docs
                .map(function(d) { return Object.assign({ id: d.id }, d.data()); })
                .filter(function(r) { return r.date >= l7StartStr && r.date <= l7EndStr; })
                : [];

            var l7Summary = _dmComputeSummary(l7Records, 7);
            var l7RecCount = l7Records.length;
            var l7CountLabel = l7RecCount === 0 ? 'No records'
                             : l7RecCount + ' record' + (l7RecCount === 1 ? '' : 's');
            var l7Open = _dmLast7Expanded;
            last7Html =
                '<div class="dm-accordion-section dm-last7-section">' +
                    '<button class="dm-accordion-hdr" id="dmLast7Hdr" aria-expanded="' + (l7Open ? 'true' : 'false') + '">' +
                        '<span class="dm-accordion-title">Last 7 Days</span>' +
                        '<span class="dm-accordion-count">' + l7CountLabel + '</span>' +
                        '<span class="dm-accordion-arrow">' + (l7Open ? '▼' : '▶') + '</span>' +
                    '</button>' +
                    '<div class="dm-accordion-body" id="dmLast7Body" style="display:' + (l7Open ? 'block' : 'none') + '">' +
                        (l7RecCount === 0
                            ? '<p class="ex-status dm-accordion-empty">No entries in the last 7 days.</p>'
                            : _dmBuildSummaryCardHtml(l7Summary, 'Last 7 Days Avg (' + l7RecCount + ' of 7 logged)')) +
                    '</div>' +
                '</div>';
        }

        // Monthly content
        var monthlyHtml = '';
        if (records.length === 0) {
            monthlyHtml = '<p class="ex-status">No entries for this period.</p>';
        } else {
            var summary = _dmComputeSummary(records);
            monthlyHtml = isDesktop
                ? _dmBuildTable(records, summary)
                : _dmBuildCards(records, summary);
        }

        listEl.innerHTML = last7Html + monthlyHtml;

        // Wire Last 7 accordion toggle — persists state to Firestore
        if (isCurrentPeriod) {
            var l7Hdr = document.getElementById('dmLast7Hdr');
            var l7Body = document.getElementById('dmLast7Body');
            if (l7Hdr) {
                l7Hdr.addEventListener('click', function() {
                    var open = l7Hdr.getAttribute('aria-expanded') === 'true';
                    _dmLast7Expanded = !open;
                    l7Hdr.setAttribute('aria-expanded', _dmLast7Expanded ? 'true' : 'false');
                    l7Body.style.display = _dmLast7Expanded ? 'block' : 'none';
                    l7Hdr.querySelector('.dm-accordion-arrow').textContent = _dmLast7Expanded ? '▼' : '▶';
                    // Persist asynchronously — fire and forget
                    userCol('settings').doc('exercisePrefs').set(
                        { dmLast7Expanded: _dmLast7Expanded }, { merge: true }
                    );
                });
            }
        }
    }

    // Wire card/row clicks and note icons
    listEl.querySelectorAll('[data-date]').forEach(function(el) {
        el.addEventListener('click', function(e) {
            if (e.target.closest('.dm-note-icon')) return;
            window.location.hash = 'exercise-metric/' + el.dataset.date;
        });
    });
    listEl.querySelectorAll('.dm-note-icon[data-note]').forEach(function(icon) {
        icon.addEventListener('click', function(e) {
            e.stopPropagation();
            _dmShowNoteOverlay(icon, icon.dataset.note);
        });
    });
}

function _dmComputeSummary(records, denominator) {
    var stdFields = ['weight','sleepScore','bodyBattery','dailySteps','totalBurn','foodCalories'];
    var sums = {}, counts = {};
    stdFields.forEach(function(f) { sums[f] = 0; counts[f] = 0; });

    var customSums   = {};   // id → sum (number)
    var customCounts = {};   // id → count of non-null
    var customTrueCounts = {}; // id → true count (boolean)
    _dmMetricDefs.forEach(function(def) {
        customSums[def.id] = 0; customCounts[def.id] = 0; customTrueCounts[def.id] = 0;
    });

    records.forEach(function(r) {
        stdFields.forEach(function(f) {
            var v = r[f];
            if (v !== null && v !== undefined && v !== '') {
                sums[f] += parseFloat(v); counts[f]++;
            }
        });
        _dmMetricDefs.forEach(function(def) {
            var cv = r.customValues && r.customValues[def.id];
            if (def.type === 'boolean') {
                if (cv === true) customTrueCounts[def.id]++;
                customCounts[def.id]++;
            } else if (def.type === 'number') {
                if (cv !== null && cv !== undefined && cv !== '') {
                    customSums[def.id] += parseFloat(cv); customCounts[def.id]++;
                }
            }
            // text: no summary
        });
    });

    var n = records.length;
    var result = {};
    // denominator overrides n for boolean X/Y display (e.g. pass 7 for last-7-days widget)
    // Weight: 1 decimal; others: round to integer
    result.weight      = counts.weight      ? (sums.weight / counts.weight).toFixed(1) : '—';

    // Weight change: newest entry minus oldest entry (records are desc, so records[0] = newest)
    var newestWeight = null, oldestWeight = null;
    for (var i = 0; i < records.length; i++) {
        var w = records[i].weight;
        if (w !== null && w !== undefined && w !== '') {
            if (newestWeight === null) newestWeight = parseFloat(w);
            oldestWeight = parseFloat(w); // keeps updating — ends at the oldest found
        }
    }
    result.weightChange = (newestWeight !== null && oldestWeight !== null && newestWeight !== oldestWeight)
        ? parseFloat((newestWeight - oldestWeight).toFixed(1))
        : null;
    result.sleepScore  = counts.sleepScore  ? Math.round(sums.sleepScore / counts.sleepScore) : '—';
    result.bodyBattery = counts.bodyBattery ? Math.round(sums.bodyBattery / counts.bodyBattery) : '—';
    result.dailySteps  = counts.dailySteps  ? Math.round(sums.dailySteps / counts.dailySteps).toLocaleString() : '—';
    result.totalBurn   = counts.totalBurn   ? Math.round(sums.totalBurn / counts.totalBurn).toLocaleString() : '—';
    result.foodCalories = counts.foodCalories ? Math.round(sums.foodCalories / counts.foodCalories).toLocaleString() : '—';

    // +/- Diff sum: total (burn - food) across all rows that have both values
    var diffSum = null;
    records.forEach(function(r) {
        var b = (r.totalBurn !== null && r.totalBurn !== undefined && r.totalBurn !== '') ? parseFloat(r.totalBurn) : null;
        var f = (r.foodCalories !== null && r.foodCalories !== undefined && r.foodCalories !== '') ? parseFloat(r.foodCalories) : null;
        if (b !== null && f !== null) {
            diffSum = (diffSum || 0) + (b - f);
        }
    });
    result.diffSum = diffSum; // null if no rows had both values

    result.custom = {};
    var boolDenom = (denominator !== undefined && denominator !== null) ? denominator : n;
    _dmMetricDefs.forEach(function(def) {
        if (def.type === 'boolean') {
            result.custom[def.id] = customTrueCounts[def.id] + '/' + boolDenom;
        } else if (def.type === 'number') {
            result.custom[def.id] = customCounts[def.id] ? customSums[def.id].toLocaleString() : '—';
        } else {
            result.custom[def.id] = '';
        }
    });
    return result;
}

function _dmFmtDate(dateStr) {
    // 'YYYY-MM-DD' → '5/7/26 Wed'
    if (!dateStr) return '';
    var parts = dateStr.split('-');
    var dt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return (dt.getMonth() + 1) + '/' + dt.getDate() + '/' + String(dt.getFullYear()).slice(2) + ' ' + days[dt.getDay()];
}

function _dmNoteIcon(noteText, desktop) {
    if (!noteText) return '';
    var escaped = _exEsc(noteText);
    if (desktop) {
        return '<span class="dm-note-icon" title="' + escaped + '">📝</span>';
    }
    return '<span class="dm-note-icon" data-note="' + escaped + '" role="button" tabindex="0">📝</span>';
}

// ─── Phase 7: Daily Metrics color threshold helpers ───────────────────────────

// Returns the threshold object for a given YYYY-MM-DD date from the loaded goals doc.
function _dmGetMonthThresholds(dateStr) {
    if (!_dmGoalsData || !dateStr) return null;
    var month = parseInt(dateStr.split('-')[1], 10);
    var months = _dmGoalsData.months || {};
    return months[month] || months[String(month)] || null;
}

// Returns a CSS background-color hex string (or '') for a metric value against its thresholds.
function _dmThresholdBg(value, thresholds, field) {
    if (value == null || !thresholds) return '';
    var v = parseFloat(value);
    if (isNaN(v)) return '';

    var Y  = '#fde68a';   // yellow
    var G  = '#86efac';   // green
    var B  = '#93c5fd';   // blue
    var LY = '#fff2cc';   // light yellow (food bad day)

    switch (field) {
        case 'bodyBattery':
            if (thresholds.batteryYellow != null && v <= thresholds.batteryYellow) return Y;
            if (thresholds.batteryBlue   != null && v >= thresholds.batteryBlue)   return B;
            return '';

        case 'dailySteps':
            if (thresholds.stepsYellow != null && v < thresholds.stepsYellow) return Y;
            if (thresholds.stepsBlue   != null && v >= thresholds.stepsBlue)  return B;
            if (thresholds.stepsGreen  != null && v >= thresholds.stepsGreen) return G;
            return '';

        case 'totalBurn':
            if (thresholds.burnBlue  != null && v >= thresholds.burnBlue)  return B;
            if (thresholds.burnGreen != null && v >= thresholds.burnGreen) return G;
            return '';

        case 'foodCalories':
            if (thresholds.foodYellow1 != null && v < thresholds.foodYellow1)  return Y;
            if (thresholds.foodBad     != null && v >= thresholds.foodBad)     return LY;
            if (thresholds.foodYellow2 != null && v >= thresholds.foodYellow2) return Y;
            return '';

        case 'calLoss':
            if (thresholds.calLossYellow != null && v <= thresholds.calLossYellow) return Y;
            if (thresholds.calLossBlue   != null && v >= thresholds.calLossBlue)   return B;
            if (thresholds.calLossGreen  != null && v >= thresholds.calLossGreen)  return G;
            return '';

        default:
            return '';
    }
}

function _dmBuildTable(records, summary) {
    // +/- Diff column appears after Food Cal.
    var preDiffCols = [
        { key: 'weight',       label: 'Weight' },
        { key: 'sleepScore',   label: 'Sleep' },
        { key: 'bodyBattery',  label: 'Body Bat.' },
        { key: 'dailySteps',   label: 'Steps' },
        { key: 'totalBurn',    label: 'Burn' },
        { key: 'foodCalories', label: 'Food Cal.' }
    ];
    var postDiffCols = [];

    // Header row
    var thead = '<thead>';
    // Summary row
    thead += '<tr class="dm-summary-row"><td></td>';
    preDiffCols.forEach(function(c) {
        if (c.key === 'weight') {
            // Show overall weight change instead of average
            if (summary.weightChange !== null && summary.weightChange !== undefined) {
                var wc = summary.weightChange;
                var color = wc < 0 ? 'green' : 'red';
                var sign = wc > 0 ? '+' : '';
                thead += '<td style="color:' + color + ';font-weight:bold">' + sign + wc.toFixed(1) + '</td>';
            } else {
                thead += '<td>—</td>';
            }
        } else {
            thead += '<td>avg ' + summary[c.key] + '</td>';
        }
    });
    // +/- Diff summary: total calories and equivalent pounds (÷3500)
    if (summary.diffSum !== null && summary.diffSum !== undefined) {
        var ds = Math.round(summary.diffSum);
        var lbs = (summary.diffSum / 3500).toFixed(1);
        thead += '<td>' + ds.toLocaleString() + ' (' + lbs + ')</td>';
    } else {
        thead += '<td>—</td>';
    }
    postDiffCols.forEach(function(c) { thead += '<td>avg ' + summary[c.key] + '</td>'; });
    _dmMetricDefs.forEach(function(def) {
        var cls = def.type === 'text' ? ' class="dm-col-text"' : '';
        thead += '<td' + cls + '>' + _exEsc(summary.custom[def.id] || '') + '</td>';
    });
    thead += '</tr>';
    // Column header row
    thead += '<tr class="dm-header-row"><th>Date</th>';
    preDiffCols.forEach(function(c) { thead += '<th>' + c.label + '</th>'; });
    thead += '<th>+/- Diff</th>';
    postDiffCols.forEach(function(c) { thead += '<th>' + c.label + '</th>'; });
    _dmMetricDefs.forEach(function(def) {
        var cls = def.type === 'text' ? ' class="dm-col-text"' : '';
        var tip = def.tooltip ? ' title="' + _exEsc(def.tooltip) + '"' : '';
        thead += '<th' + cls + tip + '>' + _exEsc(def.name) + '</th>';
    });
    thead += '</tr></thead>';

    // Body
    var tbody = '<tbody>';
    records.forEach(function(r) {
        var thresholds = _dmGetMonthThresholds(r.date);

        tbody += '<tr class="dm-data-row" data-date="' + _exEsc(r.date) + '">';
        tbody += '<td class="dm-date-cell">' + _exEsc(_dmFmtDate(r.date)) + '</td>';
        preDiffCols.forEach(function(c) {
            var rawVal = (r[c.key] !== null && r[c.key] !== undefined && r[c.key] !== '') ? r[c.key] : null;
            var v = rawVal !== null ? rawVal : '—';
            if (typeof v === 'number') v = v.toLocaleString();
            var note = r.notes && r.notes[c.key] ? r.notes[c.key] : '';
            var bg = _dmThresholdBg(rawVal, thresholds, c.key);
            var style = bg ? ' style="background-color:' + bg + '"' : '';
            tbody += '<td class="dm-col-num"' + style + '>' + _exEsc(String(v)) + _dmNoteIcon(note, true) + '</td>';
        });
        // +/- Diff: burn - food, colored by calLoss thresholds (fallback: yellow if negative)
        var burnVal = (r.totalBurn !== null && r.totalBurn !== undefined && r.totalBurn !== '') ? parseFloat(r.totalBurn) : null;
        var foodVal = (r.foodCalories !== null && r.foodCalories !== undefined && r.foodCalories !== '') ? parseFloat(r.foodCalories) : null;
        if (burnVal !== null && foodVal !== null) {
            var diff = burnVal - foodVal;
            var diffBg = thresholds
                ? _dmThresholdBg(diff, thresholds, 'calLoss')
                : (diff < 0 ? '#ffeb3b' : '');
            var diffStyle = diffBg ? ' style="background-color:' + diffBg + (diffBg === '#ffeb3b' ? ';color:#000' : '') + '"' : '';
            tbody += '<td class="dm-col-num"' + diffStyle + '>' + diff.toLocaleString() + '</td>';
        } else {
            tbody += '<td class="dm-col-num">—</td>';
        }
        postDiffCols.forEach(function(c) {
            var v = (r[c.key] !== null && r[c.key] !== undefined && r[c.key] !== '') ? r[c.key] : '—';
            if (typeof v === 'number') v = v.toLocaleString();
            var note = r.notes && r.notes[c.key] ? r.notes[c.key] : '';
            tbody += '<td class="dm-col-num">' + _exEsc(String(v)) + _dmNoteIcon(note, true) + '</td>';
        });
        _dmMetricDefs.forEach(function(def) {
            var cv = r.customValues && r.customValues[def.id];
            var display = '';
            var cls = '';
            if (def.type === 'boolean') {
                display = cv === true ? 'Y' : '—';
            } else if (def.type === 'number') {
                display = (cv !== null && cv !== undefined && cv !== '') ? String(cv) : '—';
            } else {
                // text — show full value, allow wrapping
                display = cv ? _exEsc(String(cv)) : '—';
                cls = ' class="dm-col-text"';
            }
            var note = r.notes && r.notes[def.id] ? r.notes[def.id] : '';
            tbody += '<td' + cls + '>' + display + _dmNoteIcon(note, true) + '</td>';
        });
        tbody += '</tr>';
    });
    tbody += '</tbody>';

    return '<div class="dm-table-wrap"><table class="dm-table">' + thead + tbody + '</table></div>';
}

// Shared helper — renders a tinted summary card from a pre-computed summary object.
// title: string shown as the card header (e.g. "Averages / Totals (31 records)")
function _dmBuildSummaryCardHtml(summary, title) {
    var wtDisplay = summary.weight;
    if (summary.weightChange !== null && summary.weightChange !== undefined) {
        var wc = summary.weightChange;
        var wcColor = wc < 0 ? '#2e7d32' : '#c62828';
        var wcSign = wc > 0 ? '+' : '';
        wtDisplay += ' <span style="color:' + wcColor + ';font-weight:bold">(' + wcSign + wc.toFixed(1) + ')</span>';
    }
    var row1 = '<span class="dm-card-metric"><span class="dm-card-label">Wt</span> ' + wtDisplay + '</span>' +
               '<span class="dm-card-metric"><span class="dm-card-label">Sleep</span> ' + summary.sleepScore + '</span>' +
               '<span class="dm-card-metric"><span class="dm-card-label">Body Battery</span> ' + summary.bodyBattery + '</span>';
    var row2 = '<span class="dm-card-metric"><span class="dm-card-label">Steps</span> ' + summary.dailySteps + '</span>' +
               '<span class="dm-card-metric"><span class="dm-card-label">Burn</span> ' + summary.totalBurn + '</span>';
    if (summary.diffSum !== null && summary.diffSum !== undefined) {
        var ds = Math.round(summary.diffSum);
        var lbs = (summary.diffSum / 3500).toFixed(1);
        var diffBg = summary.diffSum < 0 ? 'background-color:#ffeb3b;color:#000;padding:0 3px;border-radius:2px' : '';
        row2 += '<span class="dm-card-metric" style="' + diffBg + '"><span class="dm-card-label" style="' + (diffBg ? 'color:#555' : '') + '">Diff</span> ' + ds.toLocaleString() + ' (' + lbs + ')</span>';
    }
    row2 += '<span class="dm-card-metric"><span class="dm-card-label">Food</span> ' + summary.foodCalories + '</span>';

    var customRow = _dmMetricDefs.map(function(def) {
        var val = summary.custom[def.id];
        if (!val) return '';
        return '<span class="dm-card-metric"><span class="dm-card-label">' + _exEsc(def.name) + ':</span> ' + val + '</span>';
    }).join('');

    return '<div class="dm-summary-card">' +
        '<div class="dm-summary-card-title">' + _exEsc(title) + '</div>' +
        '<div class="dm-card-row">' + row1 + '</div>' +
        '<div class="dm-card-row">' + row2 + '</div>' +
        (customRow ? '<div class="dm-card-row dm-card-custom">' + customRow + '</div>' : '') +
    '</div>';
}

function _dmBuildCards(records, summary) {
    var stdLabels = [
        { key: 'weight',       label: 'Wt' },
        { key: 'sleepScore',   label: 'Sleep' },
        { key: 'bodyBattery',  label: 'Bat' },
        { key: 'dailySteps',   label: 'Steps' },
        { key: 'totalBurn',    label: 'Burn' },
        { key: 'foodCalories', label: 'Food' }
    ];

    var summaryHtml = summary
        ? _dmBuildSummaryCardHtml(summary, 'Averages / Totals (' + records.length + ' record' + (records.length === 1 ? '' : 's') + ')')
        : '';

    var cardsHtml = records.map(function(r) {
        var thresholds = _dmGetMonthThresholds(r.date);

        // Helper: inline bg style string
        function bg(val, field) {
            var c = _dmThresholdBg(val, thresholds, field);
            return c ? 'background-color:' + c + ';padding:0 3px;border-radius:2px' : '';
        }

        // Standard metrics — 2 rows of 3
        var stdLine1 = '', stdLine2 = '';
        stdLabels.slice(0, 3).forEach(function(c) {
            var rawVal = (r[c.key] !== null && r[c.key] !== undefined && r[c.key] !== '') ? r[c.key] : null;
            var v = rawVal !== null ? rawVal : '—';
            var note = r.notes && r.notes[c.key] ? r.notes[c.key] : '';
            var s = rawVal !== null ? bg(rawVal, c.key) : '';
            var style = s ? ' style="' + s + '"' : '';
            stdLine1 += '<span class="dm-card-metric"' + style + '><span class="dm-card-label">' + c.label + '</span> ' + _exEsc(String(v)) + _dmNoteIcon(note, false) + '</span>';
        });
        // Row 2: Steps, Burn colored; Diff with calLoss thresholds; Food colored
        stdLabels.slice(3, 5).forEach(function(c) {
            var rawVal = (r[c.key] !== null && r[c.key] !== undefined && r[c.key] !== '') ? r[c.key] : null;
            var v = rawVal !== null ? rawVal : '—';
            var note = r.notes && r.notes[c.key] ? r.notes[c.key] : '';
            var s = rawVal !== null ? bg(rawVal, c.key) : '';
            var style = s ? ' style="' + s + '"' : '';
            stdLine2 += '<span class="dm-card-metric"' + style + '><span class="dm-card-label">' + c.label + '</span> ' + _exEsc(String(v)) + _dmNoteIcon(note, false) + '</span>';
        });
        var cardBurn = (r.totalBurn !== null && r.totalBurn !== undefined && r.totalBurn !== '') ? parseFloat(r.totalBurn) : null;
        var cardFood = (r.foodCalories !== null && r.foodCalories !== undefined && r.foodCalories !== '') ? parseFloat(r.foodCalories) : null;
        if (cardBurn !== null && cardFood !== null) {
            var cardDiff = cardBurn - cardFood;
            var diffBg = thresholds
                ? _dmThresholdBg(cardDiff, thresholds, 'calLoss')
                : (cardDiff < 0 ? '#ffeb3b' : '');
            var diffStyle = diffBg ? ' style="background-color:' + diffBg + ';padding:0 3px;border-radius:2px"' : '';
            stdLine2 += '<span class="dm-card-metric"' + diffStyle + '><span class="dm-card-label">Diff</span> ' + cardDiff.toLocaleString() + '</span>';
        } else {
            stdLine2 += '<span class="dm-card-metric"><span class="dm-card-label">Diff</span> —</span>';
        }
        var foodRaw  = (r.foodCalories !== null && r.foodCalories !== undefined && r.foodCalories !== '') ? r.foodCalories : null;
        var foodV    = foodRaw !== null ? foodRaw : '—';
        var foodNote = r.notes && r.notes.foodCalories ? r.notes.foodCalories : '';
        var foodStyle = foodRaw !== null ? bg(foodRaw, 'foodCalories') : '';
        foodStyle = foodStyle ? ' style="' + foodStyle + '"' : '';
        stdLine2 += '<span class="dm-card-metric"' + foodStyle + '><span class="dm-card-label">Food</span> ' + _exEsc(String(foodV)) + _dmNoteIcon(foodNote, false) + '</span>';

        // Custom metrics
        var customHtml = _dmMetricDefs.map(function(def) {
            var cv = r.customValues && r.customValues[def.id];
            var display = '';
            if (def.type === 'boolean') {
                display = cv === true ? 'Y' : '—';
            } else if (def.type === 'number') {
                display = (cv !== null && cv !== undefined && cv !== '') ? String(cv) + (def.unitLabel ? ' ' + def.unitLabel : '') : '—';
            } else {
                display = cv ? _exEsc(String(cv)).substring(0, 30) : '—';
            }
            var note = r.notes && r.notes[def.id] ? r.notes[def.id] : '';
            return '<span class="dm-card-metric"><span class="dm-card-label">' + _exEsc(def.name) + '</span> ' + display + _dmNoteIcon(note, false) + '</span>';
        }).join('');

        return '<div class="dm-card" data-date="' + _exEsc(r.date) + '">' +
            '<div class="dm-card-date">' + _exEsc(_dmFmtDate(r.date)) + '</div>' +
            '<div class="dm-card-row">' + stdLine1 + '</div>' +
            '<div class="dm-card-row">' + stdLine2 + '</div>' +
            (customHtml ? '<div class="dm-card-row dm-card-custom">' + customHtml + '</div>' : '') +
        '</div>';
    }).join('');

    return summaryHtml + cardsHtml;
}

function _dmShowNoteOverlay(iconEl, noteText) {
    // Remove any existing overlay
    var old = document.getElementById('dmNoteOverlay');
    if (old) old.remove();

    var overlay = document.createElement('div');
    overlay.id = 'dmNoteOverlay';
    overlay.className = 'dm-note-overlay';
    overlay.innerHTML = '<span class="dm-note-overlay-text">' + _exEsc(noteText) + '</span>' +
        '<button class="dm-note-overlay-close" aria-label="Close">✕</button>';
    overlay.addEventListener('click', function(e) { e.stopPropagation(); });
    overlay.querySelector('.dm-note-overlay-close').addEventListener('click', function() { overlay.remove(); });

    // Position near the icon
    var rect = iconEl.getBoundingClientRect();
    overlay.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    overlay.style.left = Math.max(8, rect.left + window.scrollX - 100) + 'px';
    document.body.appendChild(overlay);

    // Close on outside tap
    setTimeout(function() {
        document.addEventListener('click', function closeOverlay() {
            overlay.remove();
            document.removeEventListener('click', closeOverlay);
        });
    }, 10);
}

async function loadExerciseMetricPage(dateOrNew) {
    window.scrollTo(0, 0);
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + (window.appName || 'My Life') + '</a>';

    var el = document.getElementById('page-exercise-metric');
    if (!el) return;
    el.innerHTML = '<p class="ex-status">Loading…</p>';

    // Load metric defs fresh
    var snap = await userCol('exerciseMetricDefs').get();
    _dmMetricDefs = snap.docs
        .map(function(d) { return Object.assign({ id: d.id }, d.data()); })
        .filter(function(d) { return !d.archived; })
        .sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });

    if (dateOrNew === 'new') {
        _dmEditDate    = null;
        _dmExistingDoc = null;
    } else {
        _dmEditDate = dateOrNew;
        var docSnap = await userCol('exerciseDailyMetrics').doc(dateOrNew).get();
        _dmExistingDoc = docSnap.exists ? docSnap.data() : null;
    }

    _dmUpdateBreadcrumb();
    _dmBuildEntryForm(el);
}

function _dmUpdateBreadcrumb() {
    var label = _dmEditDate ? _dmEditDate : 'New Entry';
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
        '<a href="#exercise">Exercise</a><span class="separator">&rsaquo;</span>' +
        '<a href="#exercise-metrics">Daily Metrics</a><span class="separator">&rsaquo;</span>' +
        '<span>' + _exEsc(label) + '</span>';
}

function _dmTodayStr() {
    var t = new Date();
    var m = t.getMonth() + 1, d = t.getDate();
    return t.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
}

function _dmBuildEntryForm(el) {
    var doc  = _dmExistingDoc || {};
    var notes = doc.notes || {};
    var cv    = doc.customValues || {};
    var dateVal = _dmEditDate || _dmTodayStr();
    var isEdit = !!_dmEditDate;

    function stdField(id, label, inputMode, helpText, noteKey) {
        var val = (doc[id] !== undefined && doc[id] !== null) ? doc[id] : '';
        var noteVal = notes[noteKey || id] || '';
        var hasNote = noteVal.length > 0;
        return '<div class="dm-entry-group">' +
            '<div class="dm-entry-field-row">' +
                '<label class="ex-label" for="dmf-' + id + '">' + _exEsc(label) + '</label>' +
                '<div class="dm-entry-input-wrap">' +
                    '<input type="text" inputmode="' + inputMode + '" id="dmf-' + id + '" ' +
                        'class="dm-entry-input" value="' + _exEsc(String(val)) + '" autocomplete="off">' +
                    '<button type="button" class="dm-note-toggle' + (hasNote ? ' dm-note-has-note' : '') + '" ' +
                        'data-note-key="' + _exEsc(noteKey || id) + '" aria-label="Note">📝</button>' +
                '</div>' +
            '</div>' +
            (helpText ? '<p class="ex-hint">' + _exEsc(helpText) + '</p>' : '') +
            '<div class="dm-note-area' + (hasNote ? ' dm-note-area--open' : '') + '" data-note-key="' + _exEsc(noteKey || id) + '">' +
                '<textarea class="dm-note-textarea" rows="4" placeholder="Note…">' + _exEsc(noteVal) + '</textarea>' +
            '</div>' +
        '</div>';
    }

    function customField(def) {
        var raw = cv[def.id];
        // Treat null/undefined as the empty default; numbers default to 0, text to blank
        var val;
        if (def.type === 'number') {
            val = (raw !== undefined && raw !== null && raw !== '') ? raw : 0;
        } else if (def.type === 'boolean') {
            val = raw === true;
        } else {
            val = (raw !== undefined && raw !== null) ? raw : '';
        }
        var noteVal = notes[def.id] || '';
        var hasNote = noteVal.length > 0;

        // Text fields: the textarea IS the note — no separate toggle or note area
        if (def.type === 'text') {
            return '<div class="dm-entry-group dm-entry-group--text">' +
                '<label class="ex-label" for="dmf-' + def.id + '"' + (def.tooltip ? ' title="' + _exEsc(def.tooltip) + '"' : '') + '>' + _exEsc(def.name) + '</label>' +
                '<textarea id="dmf-' + def.id + '" class="dm-text-field" rows="4" ' +
                    'placeholder="…">' + _exEsc(String(val)) + '</textarea>' +
            '</div>';
        }

        var inputHtml = '';
        if (def.type === 'boolean') {
            var checked = val === true ? ' checked' : '';
            inputHtml = '<label class="dm-bool-label">' +
                '<input type="checkbox" id="dmf-' + def.id + '" class="dm-bool-input"' + checked + '> ' +
                '<span>Yes</span>' +
            '</label>';
        } else {
            // number
            inputHtml = '<input type="text" inputmode="decimal" id="dmf-' + def.id + '" ' +
                'class="dm-entry-input" value="' + _exEsc(String(val)) + '" autocomplete="off">' +
                (def.unitLabel ? '<span class="dm-entry-unit">' + _exEsc(def.unitLabel) + '</span>' : '');
        }
        return '<div class="dm-entry-group">' +
            '<div class="dm-entry-field-row">' +
                '<label class="ex-label" for="dmf-' + def.id + '"' + (def.tooltip ? ' title="' + _exEsc(def.tooltip) + '"' : '') + '>' + _exEsc(def.name) + '</label>' +
                '<div class="dm-entry-input-wrap">' +
                    inputHtml +
                    '<button type="button" class="dm-note-toggle' + (hasNote ? ' dm-note-has-note' : '') + '" ' +
                        'data-note-key="' + _exEsc(def.id) + '" aria-label="Note">📝</button>' +
                '</div>' +
            '</div>' +
            '<div class="dm-note-area' + (hasNote ? ' dm-note-area--open' : '') + '" data-note-key="' + _exEsc(def.id) + '">' +
                '<textarea class="dm-note-textarea" rows="4" placeholder="Note…">' + _exEsc(noteVal) + '</textarea>' +
            '</div>' +
        '</div>';
    }

    var customFields = _dmMetricDefs.map(customField).join('');

    var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    function _dowLabel(ds) {
        if (!ds) return '';
        var p = ds.split('-');
        return days[new Date(+p[0], +p[1]-1, +p[2]).getDay()];
    }

    el.innerHTML =
        '<div class="ex-form">' +
            '<div class="dm-entry-group">' +
                '<div class="dm-entry-field-row">' +
                    '<label class="ex-label" for="dmfDate">Date</label>' +
                    '<div class="dm-entry-input-wrap">' +
                        '<input type="date" id="dmfDate" class="dm-entry-input" value="' + _exEsc(dateVal) + '">' +
                        '<span id="dmDateDow" class="dm-dow-label">' + _exEsc(_dowLabel(dateVal)) + '</span>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<div class="dm-section-header">Body</div>' +
            stdField('weight',      'Weight',       'decimal', '') +
            stdField('sleepScore',  'Sleep Score',  'numeric', '') +
            stdField('bodyBattery', 'Body Battery', 'numeric', '') +

            '<div class="dm-section-header">Activity</div>' +
            stdField('dailySteps', 'Daily Steps',        'numeric', '') +
            stdField('totalBurn',  'Total Actual Burn',  'numeric', 'From watch — usually entered the following day') +
            stdField('foodCalories','Food Calories',     'numeric', '') +

            (_dmMetricDefs.length ? '<div class="dm-section-header">Habits &amp; Custom</div>' + customFields : '') +

            '<div class="ex-form-actions">' +
                '<button type="button" id="dmSaveBtn" class="btn-primary">Save</button>' +
                '<button type="button" id="dmCancelBtn" class="btn-secondary">Cancel</button>' +
                (isEdit ? '<button type="button" id="dmDeleteBtn" class="btn-danger">Delete</button>' : '') +
            '</div>' +
        '</div>';

    // Wire date change — load existing record for that date if one exists;
    // otherwise preserve the in-progress form values (user just corrected the date)
    document.getElementById('dmfDate').addEventListener('change', async function() {
        var newDate = this.value;
        if (!newDate) return;
        var docSnap = await userCol('exerciseDailyMetrics').doc(newDate).get();
        _dmEditDate    = newDate;
        _dmExistingDoc = docSnap.exists ? docSnap.data() : null;
        _dmUpdateBreadcrumb();
        if (docSnap.exists) {
            // Existing record for this date — load it into the form
            _dmBuildEntryForm(el);
        } else {
            // No record yet — keep whatever the user typed; just hide Delete if it's showing
            var delBtn = document.getElementById('dmDeleteBtn');
            if (delBtn) delBtn.remove();
            // Update day-of-week label
            var dowEl = document.getElementById('dmDateDow');
            if (dowEl) dowEl.textContent = _dowLabel(newDate);
        }
    });

    // Wire note toggles
    el.querySelectorAll('.dm-note-toggle').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var key  = btn.dataset.noteKey;
            var area = el.querySelector('.dm-note-area[data-note-key="' + key + '"]');
            if (!area) return;
            area.classList.toggle('dm-note-area--open');
        });
    });

    document.getElementById('dmSaveBtn').addEventListener('click', _dmSaveMetric);
    document.getElementById('dmCancelBtn').addEventListener('click', function() {
        window.location.hash = 'exercise-metrics';
    });
    var delBtn = document.getElementById('dmDeleteBtn');
    if (delBtn) delBtn.addEventListener('click', _dmDeleteMetric);
}

async function _dmSaveMetric() {
    var dateVal = document.getElementById('dmfDate').value;
    if (!dateVal) { alert('Please enter a date.'); return; }

    var stdKeys = ['weight','sleepScore','bodyBattery','dailySteps','totalBurn','foodCalories'];
    var data = { date: dateVal };

    // Standard fields — blank → null
    stdKeys.forEach(function(k) {
        var el = document.getElementById('dmf-' + k);
        if (!el) { data[k] = null; return; }
        var v = el.value.trim();
        data[k] = v === '' ? null : parseFloat(v);
    });

    // Custom values
    var customValues = {};
    _dmMetricDefs.forEach(function(def) {
        var el = document.getElementById('dmf-' + def.id);
        if (!el) { customValues[def.id] = null; return; }
        if (def.type === 'boolean') {
            customValues[def.id] = el.checked;
        } else if (def.type === 'number') {
            var v = el.value.trim();
            customValues[def.id] = v === '' ? null : parseFloat(v);
        } else {
            var v2 = el.value.trim();
            customValues[def.id] = v2 === '' ? null : v2;
        }
    });
    data.customValues = customValues;

    // Notes — only non-empty
    var notesObj = {};
    document.querySelectorAll('.dm-note-textarea').forEach(function(ta) {
        var area = ta.closest('.dm-note-area');
        var key  = area ? area.dataset.noteKey : null;
        if (key && ta.value.trim()) notesObj[key] = ta.value.trim();
    });
    data.notes = notesObj;

    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    if (!_dmEditDate) data.createdAt = firebase.firestore.FieldValue.serverTimestamp();

    try {
        await userCol('exerciseDailyMetrics').doc(dateVal).set(data);
        window.location.hash = 'exercise-metrics';
    } catch (err) {
        console.error('DailyMetrics: save failed', err);
        alert('Save failed. Please try again.');
    }
}

async function _dmDeleteMetric() {
    if (!_dmEditDate) return;
    if (!confirm('Delete entry for ' + _dmEditDate + '? This cannot be undone.')) return;
    try {
        await userCol('exerciseDailyMetrics').doc(_dmEditDate).delete();
        window.location.hash = 'exercise-metrics';
    } catch (err) {
        console.error('DailyMetrics: delete failed', err);
        alert('Delete failed. Please try again.');
    }
}

// ─── Manage Metrics Screen ────────────────────────────────────────────────────

async function loadExerciseMetricDefsPage() {
    window.scrollTo(0, 0);
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
        '<a href="#exercise">Exercise</a><span class="separator">&rsaquo;</span>' +
        '<a href="#exercise-metrics">Daily Metrics</a><span class="separator">&rsaquo;</span>' +
        '<span>Manage Metrics</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + (window.appName || 'My Life') + '</a>';

    var el = document.getElementById('page-exercise-metric-defs');
    if (!el) return;
    el.innerHTML = '<p class="ex-status">Loading…</p>';

    await seedExerciseMetricDefsIfNeeded();

    try {
        var snap = await userCol('exerciseMetricDefs').get();
        _dmDefsAll = snap.docs
            .map(function(d) { return Object.assign({ id: d.id }, d.data()); })
            .filter(function(d) { return !d.archived; })
            .sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
        _dmRenderDefsList();
    } catch (err) {
        console.error('DailyMetrics: failed to load metric defs:', err);
        el.innerHTML = '<p class="ex-status">Error loading. Please try again.</p>';
    }
}

function _dmRenderDefsList() {
    var el = document.getElementById('page-exercise-metric-defs');
    if (!el) return;

    var rows = _dmDefsAll.map(function(def, idx) {
        return _dmBuildDefRowHTML(def, idx);
    }).join('');

    el.innerHTML =
        '<div class="page-header">' +
            '<h2>Manage Metrics</h2>' +
            '<button class="btn btn-primary btn-small" id="dmAddBtn">+ Metric</button>' +
        '</div>' +

        // Add form — hidden until "+" is clicked
        '<div class="dm-add-form hidden" id="dmAddForm">' +
            '<div class="dm-form-row">' +
                '<input type="text" id="dmAddName" class="dm-name-input" placeholder="Metric name (required)" maxlength="60">' +
                '<select id="dmAddType" class="dm-type-select">' +
                    '<option value="boolean">Yes / No</option>' +
                    '<option value="number">Number</option>' +
                    '<option value="text">Text</option>' +
                '</select>' +
            '</div>' +
            '<div class="dm-number-opts hidden" id="dmAddNumberOpts">' +
                '<label class="dm-checkbox-label">' +
                    '<input type="checkbox" id="dmAddDecimal"> Allow decimals' +
                '</label>' +
                '<input type="text" id="dmAddUnit" class="dm-unit-input" placeholder="Unit label (e.g. cal, lbs)" maxlength="20">' +
            '</div>' +
            '<div class="dm-form-row">' +
                '<input type="text" id="dmAddTooltip" class="dm-tooltip-input" placeholder="Tooltip / description (shown on hover over column header)" maxlength="200">' +
            '</div>' +
            '<div class="dm-form-btns">' +
                '<button class="btn btn-primary btn-small" id="dmSaveNewBtn">Add Metric</button>' +
                '<button class="btn btn-secondary btn-small" id="dmCancelNewBtn">Cancel</button>' +
            '</div>' +
        '</div>' +

        '<p class="dm-defs-hint">These custom metrics appear after the standard metrics (Weight, Sleep, Steps, etc.) on the daily entry form. Standard metrics are always present and cannot be edited here.</p>' +

        (rows
            ? '<div class="dm-defs-list" id="dmDefsList">' + rows + '</div>'
            : '<p class="ex-status">No custom metrics yet. Use "+ Metric" to add one.</p>');

    // Wire add button toggle
    document.getElementById('dmAddBtn').addEventListener('click', function() {
        var form = document.getElementById('dmAddForm');
        form.classList.toggle('hidden');
        if (!form.classList.contains('hidden')) {
            document.getElementById('dmAddName').focus();
        }
    });

    // Wire type select → show/hide number options
    document.getElementById('dmAddType').addEventListener('change', function() {
        document.getElementById('dmAddNumberOpts').classList.toggle('hidden', this.value !== 'number');
    });

    document.getElementById('dmSaveNewBtn').addEventListener('click', _dmSaveNewDef);
    document.getElementById('dmCancelNewBtn').addEventListener('click', function() {
        document.getElementById('dmAddForm').classList.add('hidden');
    });
}

function _dmBuildDefRowHTML(def, idx) {
    var typeLabel = def.type === 'boolean' ? 'Yes/No' : def.type === 'number' ? 'Number' : 'Text';
    var badge     = '<span class="dm-type-badge dm-type-badge--' + def.type + '">' + typeLabel + '</span>';
    var unit      = (def.type === 'number' && def.unitLabel)
                    ? ' <span class="dm-def-unit">(' + _exEsc(def.unitLabel) + ')</span>' : '';
    var upBtn     = idx > 0
                    ? '<button class="dm-sort-btn" onclick="_dmMoveDef(\'' + def.id + '\',-1)" title="Move up">↑</button>' : '';
    var dnBtn     = idx < _dmDefsAll.length - 1
                    ? '<button class="dm-sort-btn" onclick="_dmMoveDef(\'' + def.id + '\',1)" title="Move down">↓</button>' : '';

    return '<div class="dm-def-row" id="dmDefRow-' + def.id + '">' +
               '<span class="dm-def-name">' + _exEsc(def.name) + '</span>' +
               badge + unit +
               '<div class="dm-def-actions">' +
                   upBtn + dnBtn +
                   '<button class="btn btn-secondary btn-small" onclick="_dmStartEditDef(\'' + def.id + '\')">Edit</button>' +
                   '<button class="btn btn-small dm-def-delete-btn" onclick="_dmDeleteDef(\'' + def.id + '\')">Delete</button>' +
               '</div>' +
           '</div>';
}

// ─── Add new metric def ───────────────────────────────────────────────────────

async function _dmSaveNewDef() {
    var name = (document.getElementById('dmAddName').value || '').trim();
    if (!name) { alert('Please enter a metric name.'); document.getElementById('dmAddName').focus(); return; }

    var type         = document.getElementById('dmAddType').value;
    var allowDecimal = type === 'number' && document.getElementById('dmAddDecimal').checked;
    var unitLabel    = type === 'number' ? (document.getElementById('dmAddUnit').value || '').trim() : '';
    var tooltip      = (document.getElementById('dmAddTooltip').value || '').trim();

    var maxOrder = _dmDefsAll.reduce(function(m, d) { return Math.max(m, d.sortOrder || 0); }, -1);

    var saveBtn = document.getElementById('dmSaveNewBtn');
    saveBtn.textContent = 'Adding…';
    saveBtn.disabled    = true;

    try {
        var ref = userCol('exerciseMetricDefs').doc();
        await ref.set({
            name:         name,
            type:         type,
            allowDecimal: allowDecimal,
            unitLabel:    unitLabel,
            tooltip:      tooltip,
            sortOrder:    maxOrder + 1,
            archived:     false,
            createdAt:    firebase.firestore.FieldValue.serverTimestamp()
        });

        _dmDefsAll.push({ id: ref.id, name: name, type: type, allowDecimal: allowDecimal,
                          unitLabel: unitLabel, tooltip: tooltip, sortOrder: maxOrder + 1, archived: false });
        _dmRenderDefsList();
    } catch (err) {
        console.error('DailyMetrics: failed to save metric def:', err);
        alert('Failed to save. Please try again.');
        saveBtn.textContent = 'Add Metric';
        saveBtn.disabled    = false;
    }
}

// ─── Edit metric def ──────────────────────────────────────────────────────────

function _dmStartEditDef(defId) {
    var def = _dmDefsAll.find(function(d) { return d.id === defId; });
    var row = document.getElementById('dmDefRow-' + defId);
    if (!def || !row) return;

    var typeLabel = def.type === 'boolean' ? 'Yes/No' : def.type === 'number' ? 'Number' : 'Text';
    var badge     = '<span class="dm-type-badge dm-type-badge--' + def.type + '">' + typeLabel + '</span>';

    var numberOpts = def.type === 'number'
        ? '<div class="dm-number-opts">' +
              '<label class="dm-checkbox-label">' +
                  '<input type="checkbox" id="dmEditDecimal-' + defId + '"' + (def.allowDecimal ? ' checked' : '') + '> Allow decimals' +
              '</label>' +
              '<input type="text" id="dmEditUnit-' + defId + '" class="dm-unit-input" ' +
                  'placeholder="Unit label (e.g. cal, lbs)" value="' + _exEsc(def.unitLabel || '') + '" maxlength="20">' +
          '</div>'
        : '';

    row.innerHTML =
        '<div class="dm-form-row">' +
            '<input type="text" class="dm-name-input" id="dmEditName-' + defId + '" ' +
                'value="' + _exEsc(def.name) + '" maxlength="60">' +
            badge +
        '</div>' +
        numberOpts +
        '<div class="dm-form-row">' +
            '<input type="text" class="dm-tooltip-input" id="dmEditTooltip-' + defId + '" ' +
                'placeholder="Tooltip / description (shown on hover over column header)" ' +
                'value="' + _exEsc(def.tooltip || '') + '" maxlength="200">' +
        '</div>' +
        '<div class="dm-def-actions">' +
            '<button class="btn btn-primary btn-small" onclick="_dmSaveEditDef(\'' + defId + '\')">Save</button>' +
            '<button class="btn btn-secondary btn-small" onclick="_dmRenderDefsList()">Cancel</button>' +
        '</div>';

    var nameInput = document.getElementById('dmEditName-' + defId);
    if (nameInput) { nameInput.focus(); nameInput.select(); }
}

async function _dmSaveEditDef(defId) {
    var def       = _dmDefsAll.find(function(d) { return d.id === defId; });
    var nameInput = document.getElementById('dmEditName-' + defId);
    if (!def || !nameInput) return;

    var newName = nameInput.value.trim();
    if (!newName) { alert('Name cannot be blank.'); nameInput.focus(); return; }

    var allowDecimal = def.type === 'number'
        ? !!(document.getElementById('dmEditDecimal-' + defId) || {}).checked : false;
    var unitLabel = def.type === 'number'
        ? ((document.getElementById('dmEditUnit-' + defId) || {}).value || '').trim() : '';
    var tooltip = ((document.getElementById('dmEditTooltip-' + defId) || {}).value || '').trim();

    var saveBtn = document.querySelector('#dmDefRow-' + defId + ' .btn-primary');
    if (saveBtn) { saveBtn.textContent = 'Saving…'; saveBtn.disabled = true; }

    try {
        var updates = { name: newName, tooltip: tooltip };
        if (def.type === 'number') { updates.allowDecimal = allowDecimal; updates.unitLabel = unitLabel; }

        await userCol('exerciseMetricDefs').doc(defId).update(updates);

        def.name = newName;
        def.tooltip = tooltip;
        if (def.type === 'number') { def.allowDecimal = allowDecimal; def.unitLabel = unitLabel; }

        _dmRenderDefsList();
    } catch (err) {
        console.error('DailyMetrics: failed to update metric def:', err);
        alert('Failed to save. Please try again.');
        if (saveBtn) { saveBtn.textContent = 'Save'; saveBtn.disabled = false; }
    }
}

// ─── Sort order ───────────────────────────────────────────────────────────────

async function _dmMoveDef(defId, direction) {
    var idx     = _dmDefsAll.findIndex(function(d) { return d.id === defId; });
    var swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= _dmDefsAll.length) return;

    var a = _dmDefsAll[idx];
    var b = _dmDefsAll[swapIdx];

    try {
        var batch = db.batch();
        batch.update(userCol('exerciseMetricDefs').doc(a.id), { sortOrder: b.sortOrder });
        batch.update(userCol('exerciseMetricDefs').doc(b.id), { sortOrder: a.sortOrder });
        await batch.commit();

        var tmp      = a.sortOrder;
        a.sortOrder  = b.sortOrder;
        b.sortOrder  = tmp;
        _dmDefsAll.sort(function(x, y) { return (x.sortOrder || 0) - (y.sortOrder || 0); });
        _dmRenderDefsList();
    } catch (err) {
        console.error('DailyMetrics: failed to reorder metric defs:', err);
        alert('Failed to reorder. Please try again.');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXERCISE GOALS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Goals module-level state ─────────────────────────────────────────────────

var _egYears       = [];    // sorted array of year numbers that have been created
var _egCurrentYear = null;  // year number currently displayed
var _egYearData    = null;  // full data object from the exerciseGoals/:year Firestore doc
var _egAllTypes    = [];    // all non-archived exerciseTypes (for the add-exercise dropdown)

// ─── Goals landing / year grid page ──────────────────────────────────────────

/**
 * Entry point for #exercise-goals and #exercise-goals/:year.
 * If yearParam is provided, loads that year's grid.
 * If omitted, defaults to the current calendar year (or most recent if none).
 * Shows empty state when no years exist at all.
 */
async function loadExerciseGoalsPage(yearParam) {
    window.scrollTo(0, 0);
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
        '<a href="#exercise">Exercise</a><span class="separator">&rsaquo;</span><span>Goals</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + (window.appName || 'My Life') + '</a>';

    var el = document.getElementById('page-exercise-goals');
    if (!el) return;
    el.innerHTML = '<p class="loading-text">Loading...</p>';

    // Load all created years from Firestore
    try {
        var snap = await userCol('exerciseGoals').orderBy('year', 'asc').get();
        _egYears = [];
        snap.forEach(function(doc) { _egYears.push(doc.data().year); });
    } catch (err) {
        console.error('Goals: failed to load years:', err);
        el.innerHTML = '<p class="error-text">Failed to load goals. Please try again.</p>';
        return;
    }

    var currentYear = new Date().getFullYear();

    if (_egYears.length === 0) {
        _egRenderEmptyState(el, currentYear + 1);
        return;
    }

    // Determine which year to display
    var targetYear = yearParam ? parseInt(yearParam, 10) : null;
    if (!targetYear) {
        // Default to current calendar year if it exists, else the most recent year
        targetYear = (_egYears.indexOf(currentYear) !== -1) ? currentYear : _egYears[_egYears.length - 1];
        // Update URL without adding a history entry so Back works correctly
        history.replaceState(null, '', '#exercise-goals/' + targetYear);
    }

    _egRenderYearPage(el, targetYear);
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function _egRenderEmptyState(el, defaultNewYear) {
    el.innerHTML =
        '<div class="page-header"><h2>Goals</h2></div>' +
        '<div class="empty-state">' +
            '<p>No yearly goals yet.</p>' +
            '<button class="btn btn-primary" onclick="_egShowAddYearPopup()">Add Year</button>' +
        '</div>' +
        _egAddYearPopupHtml(defaultNewYear);
}

// ─── Year page shell ──────────────────────────────────────────────────────────

function _egRenderYearPage(el, year) {
    _egCurrentYear = year;
    var nextYear = new Date().getFullYear() + 1;

    var options = _egYears.map(function(y) {
        return '<option value="' + y + '"' + (y === year ? ' selected' : '') + '>' + y + '</option>';
    }).join('');
    options += '<option value="__add__">+ Add New Year</option>';

    el.innerHTML =
        '<div class="page-header"><h2>Goals</h2></div>' +
        '<div class="eg-toolbar">' +
            '<label class="eg-year-label">Year:</label>' +
            '<select id="egYearSelect" onchange="_egOnYearSelect(this.value)">' + options + '</select>' +
        '</div>' +
        '<div id="egYearContent"><p class="loading-text">Loading...</p></div>' +
        _egAddYearPopupHtml(nextYear);

    _egLoadYearContent(year);
}

// ─── Load year data + exercise types ─────────────────────────────────────────

// Fetches year doc and exercise types; populates _egYearData, _egAllTypes, _egMonths.
// Skips the fetch if data for this year is already loaded.
async function _egEnsureYearData(year) {
    if (_egCurrentYear === year && _egYearData !== null) return;
    _egCurrentYear = year;

    var [yearSnap, typeSnap] = await Promise.all([
        userCol('exerciseGoals').doc(String(year)).get(),
        userCol('exerciseTypes').where('archived', '==', false).get()
    ]);

    _egYearData = yearSnap.exists ? yearSnap.data() : { trackedExercises: [], months: {} };
    if (!_egYearData.trackedExercises) _egYearData.trackedExercises = [];

    _egAllTypes = [];
    typeSnap.forEach(function(doc) {
        _egAllTypes.push(Object.assign({ id: doc.id }, doc.data()));
    });
    _egAllTypes.sort(function(a, b) { return a.name.localeCompare(b.name); });
    _egInitMonths();
}

async function _egLoadYearContent(year) {
    var content = document.getElementById('egYearContent');
    if (!content) return;

    try {
        await _egEnsureYearData(year);
    } catch (err) {
        console.error('Goals: failed to load year content:', err);
        content.innerHTML = '<p class="error-text">Failed to load. Please try again.</p>';
        return;
    }

    _egRenderYearContent();
}

// ─── Render year content (constants + tracked exercises + grid stub) ──────────

function _egRenderYearContent() {
    var content = document.getElementById('egYearContent');
    if (!content) return;

    var d = _egYearData;

    content.innerHTML =
        // ── Year constants ──────────────────────────────────────────────────
        '<div class="eg-section">' +
            '<div class="eg-section-title">Year Constants</div>' +
            '<div class="eg-constants-grid">' +

                '<div class="eg-constant">' +
                    '<label class="eg-constant-label">Starting Weight (lbs)</label>' +
                    '<input class="eg-constant-input" type="text" inputmode="decimal" id="egStartingWeight" value="' + (d.startingWeight || '') + '" placeholder="e.g. 218" onblur="_egSaveConstant(\'startingWeight\', this.value)">' +
                '</div>' +

                '<div class="eg-constant">' +
                    '<label class="eg-constant-label">Height</label>' +
                    '<div class="eg-height-wrap">' +
                        '<input class="eg-constant-input eg-height-input" type="text" inputmode="numeric" id="egHeightFeet" value="' + (d.heightFeet != null ? d.heightFeet : '') + '" placeholder="ft" onblur="_egSaveConstant(\'heightFeet\', this.value)">' +
                        '<span class="eg-height-sep">ft</span>' +
                        '<input class="eg-constant-input eg-height-input" type="text" inputmode="numeric" id="egHeightInches" value="' + (d.heightInches != null ? d.heightInches : '') + '" placeholder="0" onblur="_egSaveConstant(\'heightInches\', this.value)">' +
                        '<span class="eg-height-sep">in</span>' +
                    '</div>' +
                '</div>' +

                '<div class="eg-constant">' +
                    '<label class="eg-constant-label">Birth Year</label>' +
                    '<input class="eg-constant-input" type="text" inputmode="numeric" id="egBirthYear" value="' + (d.birthYear || '') + '" placeholder="e.g. 1966" onblur="_egSaveConstant(\'birthYear\', this.value)">' +
                '</div>' +

                '<div class="eg-constant">' +
                    '<label class="eg-constant-label">Gender</label>' +
                    '<select class="eg-constant-select" id="egGender" onchange="_egSaveConstant(\'gender\', this.value)">' +
                        '<option value="">— Select —</option>' +
                        '<option value="male"' + (d.gender === 'male' ? ' selected' : '') + '>Male</option>' +
                        '<option value="female"' + (d.gender === 'female' ? ' selected' : '') + '>Female</option>' +
                    '</select>' +
                '</div>' +

                '<div class="eg-constant">' +
                    '<label class="eg-constant-label eg-multiplier-label" title="Activity multiplier applied to your resting metabolic rate to estimate daily non-exercise calorie burn. 1.2 = sedentary desk life. 1.375 = lightly active daily life. Use 1.2 if your tracked exercise sessions already account for most of your activity.">Activity Multiplier ⓘ</label>' +
                    '<input class="eg-constant-input" type="text" inputmode="decimal" id="egActivityMultiplier" value="' + (d.activityMultiplier != null ? d.activityMultiplier : '1.2') + '" placeholder="1.2" onblur="_egSaveConstant(\'activityMultiplier\', this.value)">' +
                '</div>' +

                '<div class="eg-constant">' +
                    '<label class="eg-constant-label">Calories Per Mile</label>' +
                    '<input class="eg-constant-input" type="text" inputmode="numeric" id="egCalPerMile" value="' + (d.calPerMile || '') + '" placeholder="e.g. 110" onblur="_egSaveConstant(\'calPerMile\', this.value)">' +
                '</div>' +

            '</div>' +
        '</div>' +

        // ── Tracked exercises (summary + link to management screen) ────────
        '<div class="eg-section">' +
            '<div class="eg-section-header">' +
                '<span class="eg-section-title">Tracked Exercises</span>' +
                '<a href="#exercise-goals/' + _egCurrentYear + '/exercises" class="btn btn-secondary btn-small">Manage →</a>' +
            '</div>' +
            '<p id="egExerciseSummary" class="eg-section-summary"></p>' +
        '</div>' +

        // ── Monthly goals (desktop grid + mobile cards) ─────────────────────
        '<div class="eg-section eg-section--grid">' +
            '<div class="eg-section-title">Monthly Goals</div>' +
            '<div id="egGridContainer"></div>' +              // desktop grid (hidden on mobile via CSS)
            '<div class="eg-mobile-view" id="egMobileView"></div>' +  // mobile cards (hidden on desktop)
        '</div>';

    _egRenderExerciseSummary();
    _egRenderGrid();
    _egRenderMobileView();
    _egAddSelectOnFocus('egYearContent');
    _egAddKeydownNav('egYearContent');
}

// ─── Phase 3: Monthly goals grid ─────────────────────────────────────────────

var _egMonths = {};  // month number (1-12) → month data object

var _EG_MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Threshold column definitions — drives Phase 4 grid columns and Phase 7 Daily Metrics color coding.
// color: 'y'=yellow threshold, 'g'=green threshold, 'b'=blue threshold, 'ly'=light-yellow (food bad)
// groupStart: true adds a visual separator to the left of this column
var _EG_THRESHOLD_COLS = [
    // Food
    { field: 'foodYellow1',    label: 'Food<',   color: 'y',  group: 'Food',     groupStart: true,  tooltip: 'Food — Yellow low: if daily food calories are BELOW this, Daily Metrics cell turns yellow (eating too little)' },
    { field: 'foodYellow2',    label: 'Food≥',   color: 'y',  group: 'Food',     groupStart: false, tooltip: 'Food — Yellow high: if daily food calories are AT OR ABOVE this, cell turns yellow (eating a little over goal)' },
    { field: 'foodBad',        label: 'Food≥',   color: 'ly', group: 'Food',     groupStart: false, tooltip: 'Food — Bad day: if daily food calories are AT OR ABOVE this, cell turns pale yellow (significantly over goal)' },
    // Burn (Actual Burn)
    { field: 'burnGreen',      label: 'Burn≥',   color: 'g',  group: 'Burn',     groupStart: true,  tooltip: 'Actual Burn — Green: if total daily calorie burn is AT OR ABOVE this, Daily Metrics cell turns green' },
    { field: 'burnBlue',       label: 'Burn≥',   color: 'b',  group: 'Burn',     groupStart: false, tooltip: 'Actual Burn — Blue: if total daily calorie burn is AT OR ABOVE this, Daily Metrics cell turns blue' },
    // Cal Loss
    { field: 'calLossYellow',  label: 'Cal≤',    color: 'y',  group: 'Cal Loss', groupStart: true,  tooltip: 'Calorie Loss — Yellow: if burn minus food calories is AT OR BELOW this, Daily Metrics cell turns yellow (not enough deficit)' },
    { field: 'calLossGreen',   label: 'Cal≥',    color: 'g',  group: 'Cal Loss', groupStart: false, tooltip: 'Calorie Loss — Green: if burn minus food calories is AT OR ABOVE this, Daily Metrics cell turns green (good deficit)' },
    { field: 'calLossBlue',    label: 'Cal≥',    color: 'b',  group: 'Cal Loss', groupStart: false, tooltip: 'Calorie Loss — Blue: if burn minus food calories is AT OR ABOVE this, Daily Metrics cell turns blue (great deficit)' },
    // Steps
    { field: 'stepsYellow',    label: 'Steps<',  color: 'y',  group: 'Steps',    groupStart: true,  tooltip: 'Steps — Yellow: if daily steps are BELOW this, Daily Metrics cell turns yellow (low step day)' },
    { field: 'stepsGreen',     label: 'Steps≥',  color: 'g',  group: 'Steps',    groupStart: false, tooltip: 'Steps — Green: if daily steps are AT OR ABOVE this, cell turns green (good step day)' },
    { field: 'stepsBlue',      label: 'Steps≥',  color: 'b',  group: 'Steps',    groupStart: false, tooltip: 'Steps — Blue: if daily steps are AT OR ABOVE this, cell turns blue (great step day)' },
    // Miles
    { field: 'milesYellow',    label: 'Mi<',     color: 'y',  group: 'Miles',    groupStart: true,  tooltip: 'Miles — Yellow: if daily miles are BELOW this (future Daily Metrics color use)' },
    { field: 'milesGreen',     label: 'Mi≥',     color: 'g',  group: 'Miles',    groupStart: false, tooltip: 'Miles — Green: if daily miles are AT OR ABOVE this (future Daily Metrics color use)' },
    { field: 'milesBlue',      label: 'Mi≥',     color: 'b',  group: 'Miles',    groupStart: false, tooltip: 'Miles — Blue: if daily miles are AT OR ABOVE this (future Daily Metrics color use)' },
    // Exercise (auto-calculated)
    { field: 'exerciseYellow', label: 'Ex<',     color: 'y',  group: 'Exercise', groupStart: true,  calculated: true, tooltip: 'Exercise Burn — Yellow (auto-calculated): Total Ex Burn − 300, minimum 200. If daily exercise burn is below this, Daily Metrics cell turns yellow.' },
    { field: 'exerciseBlue',   label: 'Ex≥',     color: 'b',  group: 'Exercise', groupStart: false, calculated: true, tooltip: 'Exercise Burn — Blue (auto-calculated): Total Ex Burn + 200, minimum 500. If daily exercise burn is at or above this, Daily Metrics cell turns blue.' },
    // Battery
    { field: 'batteryYellow',  label: 'Bat≤',    color: 'y',  group: 'Battery',  groupStart: true,  tooltip: 'Body Battery — Yellow: if battery is AT OR BELOW this, Daily Metrics cell turns yellow (low battery day)' },
    { field: 'batteryBlue',    label: 'Bat≥',    color: 'b',  group: 'Battery',  groupStart: false, tooltip: 'Body Battery — Blue: if battery is AT OR ABOVE this, Daily Metrics cell turns blue (great battery day)' },
];

function _egInitMonths() {
    _egMonths = {};
    var stored = _egYearData.months || {};
    for (var m = 1; m <= 12; m++) {
        // Keys may be stored as numbers or strings depending on SDK version
        _egMonths[m] = stored[m] || stored[String(m)] || {};
    }
}

function _egDaysInMonth(month) {
    return new Date(_egCurrentYear, month, 0).getDate();
}

// Returns the effective goal weight for a month:
// uses the month's explicit value, or walks back to the last set month, or startingWeight.
function _egEffectiveGoalWeight(month) {
    for (var m = month; m >= 1; m--) {
        if (_egMonths[m] && _egMonths[m].goalWeight != null) return _egMonths[m].goalWeight;
    }
    return (_egYearData && _egYearData.startingWeight != null) ? _egYearData.startingWeight : null;
}

// Weight loss for a month: positive = lost weight, negative = gained. Returns null if data missing.
function _egWeightLoss(month) {
    var curr = _egEffectiveGoalWeight(month);
    var prev = month === 1
        ? ((_egYearData && _egYearData.startingWeight != null) ? _egYearData.startingWeight : null)
        : _egEffectiveGoalWeight(month - 1);
    if (curr == null || prev == null) return null;
    return Math.round(prev - curr);
}

// Daily calorie deficit needed to hit the weight loss goal.
function _egDailyCalLoss(month) {
    var loss = _egWeightLoss(month);
    if (loss == null) return null;
    return Math.round(Math.abs(loss) * 3500 / _egDaysInMonth(month));
}

function _egFmtWtLoss(val) {
    if (val == null) return '<span class="eg-calc-blank">—</span>';
    var cls = val < 0 ? ' eg-val-warn' : '';
    return '<span class="eg-calc-num' + cls + '">' + val + '</span>';
}

function _egFmtCalc(val) {
    if (val == null) return '<span class="eg-calc-blank">—</span>';
    return '<span class="eg-calc-num">' + val.toLocaleString() + '</span>';
}

// ─── Build the full goals grid ────────────────────────────────────────────────

// Updates all input DOM elements for a month from _egMonths[month]. Called after Copy Prev.
function _egUpdateMonthInputs(month) {
    var mData    = _egMonths[month] || {};
    var sessions = mData.exerciseSessions || {};

    var gwInp = document.querySelector('[data-month="' + month + '"][data-field="goalWeight"]');
    if (gwInp) { gwInp.value = mData.goalWeight != null ? mData.goalWeight : ''; gwInp.classList.remove('eg-inherited'); }

    var milesInp = document.querySelector('[data-month="' + month + '"][data-field="avgMilesPerDay"]');
    if (milesInp) milesInp.value = mData.avgMilesPerDay != null ? mData.avgMilesPerDay : '';

    (_egYearData.trackedExercises || []).forEach(function(te) {
        var inp = document.querySelector('[data-month="' + month + '"][data-typeid="' + te.typeId + '"]');
        if (inp) inp.value = sessions[te.typeId] != null ? sessions[te.typeId] : '';
    });

    _EG_THRESHOLD_COLS.forEach(function(col) {
        var inp = document.querySelector('[data-month="' + month + '"][data-field="' + col.field + '"]');
        if (inp) inp.value = mData[col.field] != null ? mData[col.field] : '';
    });
}

function _egRenderGrid() {
    var container = document.getElementById('egGridContainer');
    if (!container) return;

    var exercises = (_egYearData.trackedExercises || []).slice()
        .sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });

    // ── Header ───────────────────────────────────────────────────────────────
    var hdr =
        '<th class="eg-th eg-col-month eg-th-corner" title="Month of the year">Month</th>' +
        '<th class="eg-th" title="Your target weight at the end of this month (entered by you — not calculated)">Goal<br><span class="eg-th-sub">Weight</span></th>' +
        '<th class="eg-th eg-th-calc" title="Calculated: weight change from prior month. Positive = lost weight, negative = gained. (Prior goal weight − this month\'s goal weight)">Wt<br><span class="eg-th-sub">Loss</span></th>' +
        '<th class="eg-th eg-th-calc" title="Calculated: daily calorie deficit needed to hit your weight loss goal. (|Weight change| × 3,500 ÷ days in month)">Daily Cal<br><span class="eg-th-sub">Loss</span></th>' +
        '<th class="eg-th" title="Your goal: average miles walked or run per day this month">Miles<br><span class="eg-th-sub">/ Day</span></th>';

    exercises.forEach(function(te) {
        hdr += '<th class="eg-th" title="Your goal: how many ' + escapeHtml(te.typeName) + ' sessions this month (' + te.calPerSession + ' cal/session average)">' +
               escapeHtml(te.typeName) + '<br><span class="eg-th-sub">' + te.calPerSession + ' cal/ses</span></th>';
    });

    // Projection column headers (between exercise goals and thresholds)
    hdr +=
        '<th class="eg-th eg-th-calc eg-th-group-start" title="Calculated: daily calorie burn from your mileage goal. (Miles/Day × Calories Per Mile constant)">Burn<br><span class="eg-th-sub">Miles/Day</span></th>' +
        '<th class="eg-th eg-th-calc" title="Calculated: daily calorie burn from your non-mileage exercise sessions. (Sum of sessions × cal/session ÷ days in month)">Burn<br><span class="eg-th-sub">Extra/Day</span></th>' +
        '<th class="eg-th eg-th-calc" title="Calculated: total daily exercise calorie burn. (Burn Miles + Burn Extra)">Total<br><span class="eg-th-sub">Ex Burn</span></th>' +
        '<th class="eg-th eg-th-calc" title="Calculated: estimated daily non-exercise calorie burn using Mifflin-St Jeor formula applied to prior month\'s estimated weight, multiplied by your activity multiplier. Updates each month as your weight changes. Falls back to a static value if height/birth year/gender are not set.">Base<br><span class="eg-th-sub">Burn</span></th>' +
        '<th class="eg-th eg-th-calc" title="Calculated: estimated pounds lost this month if you hit all your goals. Formula: ((Base Burn + Total Exercise Burn) − Avg Food) × Days ÷ 3,500. Shows red if negative (plan predicts weight gain).">Est Wt<br><span class="eg-th-sub">Loss</span></th>' +
        '<th class="eg-th eg-th-calc" title="Calculated: estimated weight at end of month. Chains from prior month\'s estimated weight (or prior month\'s goal weight if chain is broken). Shows yellow if higher than your Goal Weight — your plan won\'t hit your target.">Est Wt<br><span class="eg-th-sub">End Mo</span></th>';

    // Threshold columns
    _EG_THRESHOLD_COLS.forEach(function(col) {
        var colorCls = 'eg-th-' + col.color;
        var borderCls = col.groupStart ? ' eg-th-group-start' : '';
        hdr += '<th class="eg-th ' + colorCls + borderCls + '" title="' + col.tooltip + '">' +
               col.label + '<br><span class="eg-th-sub">' + col.group + '</span></th>';
    });

    hdr += '<th class="eg-th eg-th-copy" title="Copy all values from the prior month into this row"></th>';  // Copy Prev column

    // Compute all projection values up front (sequential — J depends on previous J)
    var projs = _egComputeProjections();

    // ── Rows ─────────────────────────────────────────────────────────────────
    var rows = '';
    for (var m = 1; m <= 12; m++) {
        var mData    = _egMonths[m] || {};
        var sessions = mData.exerciseSessions || {};
        var effGW    = _egEffectiveGoalWeight(m);
        var gwVal    = mData.goalWeight != null ? mData.goalWeight : (effGW != null ? effGW : '');
        var isInherited = mData.goalWeight == null && gwVal !== '';

        rows += '<tr>' +
            '<td class="eg-td eg-td-month">' + _EG_MONTH_NAMES[m - 1] + '</td>' +

            // Goal Weight input
            '<td class="eg-td">' +
                '<input class="eg-cell-input' + (isInherited ? ' eg-inherited' : '') + '" type="text" inputmode="decimal"' +
                ' data-month="' + m + '" data-field="goalWeight"' +
                ' value="' + gwVal + '"' +
                ' onblur="_egSaveMonthField(' + m + ',\'goalWeight\',this.value)">' +
            '</td>' +

            // Weight Loss (calc)
            '<td class="eg-td eg-td-calc eg-wt-loss-cell" data-month="' + m + '">' +
                _egFmtWtLoss(_egWeightLoss(m)) +
            '</td>' +

            // Daily Cal Loss (calc)
            '<td class="eg-td eg-td-calc eg-daily-cal-cell" data-month="' + m + '">' +
                _egFmtCalc(_egDailyCalLoss(m)) +
            '</td>' +

            // Avg Miles / Day
            '<td class="eg-td">' +
                '<input class="eg-cell-input" type="text" inputmode="decimal"' +
                ' data-month="' + m + '" data-field="avgMilesPerDay"' +
                ' value="' + (mData.avgMilesPerDay != null ? mData.avgMilesPerDay : '') + '"' +
                ' onblur="_egSaveMonthField(' + m + ',\'avgMilesPerDay\',this.value)">' +
            '</td>';

        // Tracked exercise session counts
        exercises.forEach(function(te) {
            var sesVal = sessions[te.typeId] != null ? sessions[te.typeId] : '';
            rows += '<td class="eg-td">' +
                '<input class="eg-cell-input eg-session-input" type="text" inputmode="numeric"' +
                ' data-month="' + m + '" data-typeid="' + te.typeId + '"' +
                ' value="' + sesVal + '"' +
                ' onblur="_egSaveMonthSession(' + m + ',\'' + te.typeId + '\',this.value)">' +
                '</td>';
        });

        // Projection cells (F, G, H, I, J)
        var p     = projs[m - 1];
        var iWarn = p.i != null && p.i < 0;
        var jWarn = p.j != null && effGW != null && p.j > effGW;
        rows +=
            '<td class="eg-td eg-td-calc eg-proj-f eg-td-group-start" data-month="' + m + '">' + _egFmtCalc(p.f) + '</td>' +
            '<td class="eg-td eg-td-calc eg-proj-g" data-month="' + m + '">' + _egFmtCalc(p.g) + '</td>' +
            '<td class="eg-td eg-td-calc eg-proj-h" data-month="' + m + '">' + _egFmtCalc(p.h) + '</td>' +
            '<td class="eg-td eg-td-calc eg-proj-base" data-month="' + m + '">' + _egFmtCalc(p.baseBurn) + '</td>' +
            '<td class="eg-td eg-td-calc eg-proj-i' + (iWarn ? ' eg-td-warn' : '') + '" data-month="' + m + '">' + _egFmtProjI(p.i) + '</td>' +
            '<td class="eg-td eg-td-calc eg-proj-j' + (jWarn ? ' eg-td-warn' : '') + '" data-month="' + m + '">' +
                (p.j != null ? '<span class="eg-calc-num">' + p.j + '</span>' : '<span class="eg-calc-blank">—</span>') +
            '</td>';

        // Threshold columns — editable for most, read-only for calculated ones
        _EG_THRESHOLD_COLS.forEach(function(col) {
            var borderCls = col.groupStart ? ' eg-td-group-start' : '';
            if (col.calculated) {
                // Auto-calculated from projection data — read-only calc cell
                var calcVal = p[col.field];
                var calcClass = 'eg-proj-ex-' + (col.color === 'y' ? 'yellow' : 'blue');
                rows += '<td class="eg-td eg-td-calc ' + calcClass + borderCls + '" data-month="' + m + '">' +
                    _egFmtCalc(calcVal) + '</td>';
            } else {
                var fieldVal = mData[col.field] != null ? mData[col.field] : '';
                rows += '<td class="eg-td' + borderCls + '">' +
                    '<input class="eg-cell-input eg-threshold-input" type="text" inputmode="numeric"' +
                    ' data-month="' + m + '" data-field="' + col.field + '"' +
                    ' value="' + fieldVal + '"' +
                    ' onblur="_egSaveMonthField(' + m + ',\'' + col.field + '\',this.value)">' +
                    '</td>';
            }
        });

        // Copy Previous button (hidden for January)
        rows += '<td class="eg-td eg-td-copy">' +
            (m > 1 ? '<button class="btn btn-secondary eg-copy-btn" onclick="_egCopyPreviousMonth(' + m + ')">Copy Prev</button>' : '') +
            '</td></tr>';
    }

    container.innerHTML =
        '<div class="eg-grid-wrap">' +
            '<table class="eg-grid">' +
                '<thead><tr>' + hdr + '</tr></thead>' +
                '<tbody>' + rows + '</tbody>' +
            '</table>' +
        '</div>';

    // Ensure exercise thresholds are saved on every page load, not just on input changes.
    // This means visiting the Goals page once is sufficient to generate and persist the numbers.
    _egAutoSaveExerciseThresholds(projs);
}

// ─── Phase 5: Projection column calculations ──────────────────────────────────

// Computes all 5 projection values for all 12 months in one pass.
// Computes base daily calorie burn for a given weight using Mifflin-St Jeor × activity multiplier.
// Returns null if any required year constant (height, birthYear, gender) is missing.
function _egCalcBaseBurn(weightLbs) {
    var d = _egYearData;
    if (!d || weightLbs == null) return null;
    var hFt  = d.heightFeet;
    var hIn  = d.heightInches != null ? d.heightInches : 0;
    var by   = d.birthYear;
    var sex  = d.gender;
    var mult = d.activityMultiplier != null ? d.activityMultiplier : 1.2;
    if (hFt == null || by == null || !sex) return null;

    var heightCm = ((hFt * 12) + hIn) * 2.54;
    var weightKg = weightLbs / 2.2046;
    var age      = _egCurrentYear - by;
    var bmr      = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'female' ? -161 : 5);
    return Math.round(bmr * mult);
}

// Returns array[0..11] of { f, g, h, i, j } (all may be null if data missing).
function _egComputeProjections() {
    var calPerMile = _egYearData ? (_egYearData.calPerMile || null) : null;
    var exercises  = _egYearData ? (_egYearData.trackedExercises || []) : [];
    var results    = [];
    var prevJ      = null;
    // prevWeight tracks the weight at the START of each month (= prior month's estimated ending weight).
    // Used to compute a realistic base burn as weight changes throughout the year.
    var prevWeight = (_egYearData && _egYearData.startingWeight != null) ? _egYearData.startingWeight : null;

    for (var m = 1; m <= 12; m++) {
        var mData    = _egMonths[m] || {};
        var sessions = mData.exerciseSessions || {};
        var days     = _egDaysInMonth(m);

        // Base Burn — per-month BMR × activity multiplier using prior month's estimated weight.
        // Falls back to static baseDailyBurn constant if formula inputs (height/birthYear/gender) are missing.
        var baseBurn = _egCalcBaseBurn(prevWeight);
        if (baseBurn === null) baseBurn = (_egYearData && _egYearData.baseDailyBurn) || null;

        // F — Daily calorie burn from miles
        var f = (calPerMile != null && mData.avgMilesPerDay != null)
            ? Math.round(mData.avgMilesPerDay * calPerMile)
            : null;

        // G — Daily calorie burn from non-mile exercise sessions (always 0+)
        var extraTotal = 0;
        exercises.forEach(function(te) {
            extraTotal += (sessions[te.typeId] != null ? sessions[te.typeId] : 0) * (te.calPerSession || 0);
        });
        var g = Math.round(extraTotal / days);

        // H — Total daily exercise burn (null if F is null — calPerMile not set)
        var h = f != null ? f + g : null;

        // I — Estimated weight lost this month
        var fy1 = mData.foodYellow1 != null ? mData.foodYellow1 : null;
        var fy2 = mData.foodYellow2 != null ? mData.foodYellow2 : null;
        var i = null;
        if (baseBurn != null && h != null && fy1 != null && fy2 != null) {
            i = Math.round(((baseBurn + h) - (fy1 + fy2) / 2) * days / 3500);
        }

        // J — Estimated end-of-month weight (rolling chain).
        // Falls back to effective goal weight when chain is broken (mid-year start).
        var startForJ;
        if (m === 1) {
            startForJ = (_egYearData && _egYearData.startingWeight != null)
                ? _egYearData.startingWeight : null;
        } else {
            startForJ = prevJ !== null ? prevJ : _egEffectiveGoalWeight(m - 1);
        }
        var j = (startForJ != null && i != null) ? Math.round(startForJ - i) : null;
        prevJ = j;

        // Update prevWeight for next month's base burn calculation.
        // Use estimated ending weight if available; otherwise fall back to goal weight.
        prevWeight = (j !== null) ? j : _egEffectiveGoalWeight(m);

        // Exercise thresholds — auto-calculated from H so they scale with the plan
        var exerciseYellow = h !== null ? Math.max(h - 300, 200) : null;
        var exerciseBlue   = h !== null ? Math.max(h + 200, 500) : null;

        results.push({ f: f, g: g, h: h, baseBurn: baseBurn, exerciseYellow: exerciseYellow, exerciseBlue: exerciseBlue, i: i, j: j });
    }
    return results;
}

function _egFmtProjI(val) {
    if (val == null) return '<span class="eg-calc-blank">—</span>';
    var cls = val < 0 ? ' eg-val-warn' : '';
    return '<span class="eg-calc-num' + cls + '">' + val + '</span>';
}

// ─── Update all calculated cells reactively ───────────────────────────────────

function _egUpdateCalcCells() {
    // Weight group calc cells (Wt Loss, Daily Cal Loss)
    for (var m = 1; m <= 12; m++) {
        var wtCell  = document.querySelector('.eg-wt-loss-cell[data-month="' + m + '"]');
        var calCell = document.querySelector('.eg-daily-cal-cell[data-month="' + m + '"]');
        if (wtCell)  wtCell.innerHTML  = _egFmtWtLoss(_egWeightLoss(m));
        if (calCell) calCell.innerHTML = _egFmtCalc(_egDailyCalLoss(m));
    }

    // Projection columns (F, G, H, I, J)
    var projs = _egComputeProjections();
    for (var m2 = 1; m2 <= 12; m2++) {
        var p     = projs[m2 - 1];
        var effGW = _egEffectiveGoalWeight(m2);
        var iWarn = p.i != null && p.i < 0;
        var jWarn = p.j != null && effGW != null && p.j > effGW;

        var fCell    = document.querySelector('.eg-proj-f[data-month="' + m2 + '"]');
        var gCell    = document.querySelector('.eg-proj-g[data-month="' + m2 + '"]');
        var hCell    = document.querySelector('.eg-proj-h[data-month="' + m2 + '"]');
        var baseCell = document.querySelector('.eg-proj-base[data-month="' + m2 + '"]');
        var iCell    = document.querySelector('.eg-proj-i[data-month="' + m2 + '"]');
        var jCell    = document.querySelector('.eg-proj-j[data-month="' + m2 + '"]');

        if (fCell)    fCell.innerHTML    = _egFmtCalc(p.f);
        if (gCell)    gCell.innerHTML    = _egFmtCalc(p.g);
        if (hCell)    hCell.innerHTML    = _egFmtCalc(p.h);
        if (baseCell) baseCell.innerHTML = _egFmtCalc(p.baseBurn);

        // Exercise threshold calc cells
        var eyCell = document.querySelector('.eg-proj-ex-yellow[data-month="' + m2 + '"]');
        var ebCell = document.querySelector('.eg-proj-ex-blue[data-month="' + m2 + '"]');
        if (eyCell) eyCell.innerHTML = _egFmtCalc(p.exerciseYellow);
        if (ebCell) ebCell.innerHTML = _egFmtCalc(p.exerciseBlue);
        if (iCell) {
            iCell.className = 'eg-td eg-td-calc eg-proj-i' + (iWarn ? ' eg-td-warn' : '');
            iCell.setAttribute('data-month', m2);
            iCell.innerHTML = _egFmtProjI(p.i);
        }
        if (jCell) {
            jCell.className = 'eg-td eg-td-calc eg-proj-j' + (jWarn ? ' eg-td-warn' : '');
            jCell.setAttribute('data-month', m2);
            jCell.innerHTML = p.j != null
                ? '<span class="eg-calc-num">' + p.j + '</span>'
                : '<span class="eg-calc-blank">—</span>';
        }
    }
    // Auto-save calculated exercise thresholds to Firestore so Daily Metrics color
    // wiring can look them up without needing to re-derive them.
    _egAutoSaveExerciseThresholds(projs);
}

// Saves exerciseYellow/Blue for months where H changed.  Fire-and-forget (no await).
async function _egAutoSaveExerciseThresholds(projs) {
    if (!_egCurrentYear || !_egYearData) return;
    var update = {};
    projs.forEach(function(p, idx) {
        var m = idx + 1;
        if (!_egMonths[m]) _egMonths[m] = {};
        if (p.exerciseYellow !== null && _egMonths[m].exerciseYellow !== p.exerciseYellow) {
            _egMonths[m].exerciseYellow = p.exerciseYellow;
            update['months.' + m + '.exerciseYellow'] = p.exerciseYellow;
        }
        if (p.exerciseBlue !== null && _egMonths[m].exerciseBlue !== p.exerciseBlue) {
            _egMonths[m].exerciseBlue = p.exerciseBlue;
            update['months.' + m + '.exerciseBlue'] = p.exerciseBlue;
        }
    });
    if (Object.keys(update).length > 0) {
        update.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        try {
            await userCol('exerciseGoals').doc(String(_egCurrentYear)).update(update);
        } catch (err) {
            console.error('Goals: failed to auto-save exercise thresholds:', err);
        }
    }
}

// ─── Save a monthly entered field on blur ────────────────────────────────────

async function _egSaveMonthField(month, field, rawValue) {
    var val = rawValue === '' ? null : parseFloat(rawValue);
    if (val !== null && isNaN(val)) return;

    if (!_egMonths[month]) _egMonths[month] = {};
    _egMonths[month][field] = val;

    var update = {};
    update['months.' + month + '.' + field] =
        val !== null ? val : firebase.firestore.FieldValue.delete();

    // Cascade goal weight forward to: (a) months still null, or (b) months with a higher
    // weight than the value just entered (keeps goals monotonically non-increasing).
    if (field === 'goalWeight' && val !== null) {
        for (var m2 = month + 1; m2 <= 12; m2++) {
            if (!_egMonths[m2]) _egMonths[m2] = {};
            if (_egMonths[m2].goalWeight == null || _egMonths[m2].goalWeight > val) {
                _egMonths[m2].goalWeight = val;
                update['months.' + m2 + '.goalWeight'] = val;
                var inp = document.querySelector('[data-month="' + m2 + '"][data-field="goalWeight"]');
                if (inp && inp !== document.activeElement) {
                    inp.value = val;
                    inp.classList.add('eg-inherited');
                }
            }
        }
        // Remove inherited style from the cell that was just explicitly set
        var thisInp = document.querySelector('[data-month="' + month + '"][data-field="goalWeight"]');
        if (thisInp) thisInp.classList.remove('eg-inherited');
    }

    update.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    try {
        await userCol('exerciseGoals').doc(String(_egCurrentYear)).update(update);
    } catch (err) {
        console.error('Goals: failed to save month field:', err);
    }
    _egUpdateCalcCells();
}

// ─── Save a session count on blur ────────────────────────────────────────────

async function _egSaveMonthSession(month, typeId, rawValue) {
    var val = rawValue === '' ? null : parseInt(rawValue, 10);
    if (val !== null && (isNaN(val) || val < 0)) return;

    if (!_egMonths[month]) _egMonths[month] = {};
    if (!_egMonths[month].exerciseSessions) _egMonths[month].exerciseSessions = {};
    _egMonths[month].exerciseSessions[typeId] = val;

    var update = {};
    update['months.' + month + '.exerciseSessions.' + typeId] =
        val !== null ? val : firebase.firestore.FieldValue.delete();
    update.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    try {
        await userCol('exerciseGoals').doc(String(_egCurrentYear)).update(update);
    } catch (err) {
        console.error('Goals: failed to save session count:', err);
    }
    _egUpdateCalcCells();  // session counts affect projection columns G, H, I, J
}

// ─── Copy previous month ──────────────────────────────────────────────────────

async function _egCopyPreviousMonth(month) {
    if (month <= 1) return;

    // Deep copy the previous month's data
    var prev = JSON.parse(JSON.stringify(_egMonths[month - 1] || {}));
    // Merge into current month, preserving any fields not in prev (e.g., Phase 4 thresholds)
    var existing = JSON.parse(JSON.stringify(_egMonths[month] || {}));
    var merged = Object.assign(existing, prev);
    _egMonths[month] = merged;

    // Update all DOM inputs for this month (goal weight, miles, sessions, thresholds)
    _egUpdateMonthInputs(month);

    // Write entire month object to Firestore
    var update = {};
    update['months.' + month] = merged;
    update.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    try {
        await userCol('exerciseGoals').doc(String(_egCurrentYear)).update(update);
    } catch (err) {
        console.error('Goals: failed to copy month:', err);
        alert('Failed to copy. Please try again.');
        return;
    }
    _egUpdateCalcCells();
}

// ─── Save a year-level constant on blur ───────────────────────────────────────

async function _egSaveConstant(field, rawValue) {
    var val;
    if (rawValue === '' || rawValue == null) {
        val = null;
    } else if (field === 'gender') {
        val = String(rawValue);  // gender is a string ('male'/'female'), not a number
    } else {
        val = parseFloat(rawValue);
        if (isNaN(val)) return;
    }

    if (!_egYearData) _egYearData = {};
    _egYearData[field] = val;

    try {
        var update = {};
        update[field] = val;
        update.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        await userCol('exerciseGoals').doc(String(_egCurrentYear)).update(update);
    } catch (err) {
        console.error('Goals: failed to save constant:', err);
    }
    _egUpdateCalcCells();  // calPerMile and baseDailyBurn affect projection columns
}

// ─── Tracked exercise summary (on year page) ─────────────────────────────────

function _egRenderExerciseSummary() {
    var el = document.getElementById('egExerciseSummary');
    if (!el) return;
    var exercises = (_egYearData.trackedExercises || []).slice()
        .sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
    if (exercises.length === 0) {
        el.textContent = 'No exercises tracked yet.';
    } else {
        el.textContent = exercises.length + ' tracked: ' +
            exercises.map(function(te) { return te.typeName; }).join(', ');
    }
}

// ─── Tracked exercises management page ───────────────────────────────────────

async function loadExerciseGoalExercisesPage(year) {
    window.scrollTo(0, 0);
    var yearNum = parseInt(year, 10);
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
        '<a href="#exercise">Exercise</a><span class="separator">&rsaquo;</span>' +
        '<a href="#exercise-goals/' + year + '">Goals</a><span class="separator">&rsaquo;</span>' +
        '<span>Tracked Exercises</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + (window.appName || 'My Life') + '</a>';

    var el = document.getElementById('page-exercise-goal-exercises');
    if (!el) return;
    el.innerHTML = '<p class="loading-text">Loading...</p>';

    try {
        await _egEnsureYearData(yearNum);
    } catch (err) {
        el.innerHTML = '<p class="error-text">Failed to load. Please try again.</p>';
        return;
    }

    _egRenderExercisesManagePage(yearNum);
}

function _egRenderExercisesManagePage(year) {
    var el = document.getElementById('page-exercise-goal-exercises');
    if (!el) return;

    el.innerHTML =
        '<div class="page-header">' +
            '<h2>Tracked Exercises — ' + year + '</h2>' +
            '<button class="btn btn-primary btn-small" onclick="_egShowAddExerciseForm()">+ Add Exercise</button>' +
        '</div>' +
        '<div id="egTrackedList"></div>' +
        '<div id="egAddExerciseForm" class="eg-add-exercise-form hidden"></div>';

    _egRenderTrackedList();
    _egAddSelectOnFocus('page-exercise-goal-exercises');
}

// ─── Tracked exercise list ────────────────────────────────────────────────────

function _egRenderTrackedList() {
    var list = document.getElementById('egTrackedList');
    if (!list) return;

    var exercises = (_egYearData.trackedExercises || []).slice()
        .sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });

    if (exercises.length === 0) {
        list.innerHTML = '<p class="eg-empty-note">No exercises tracked yet. Add one above.</p>';
        return;
    }

    list.innerHTML = exercises.map(function(te, i) {
        var isFirst = i === 0;
        var isLast  = i === exercises.length - 1;
        var tid = te.typeId;
        return '<div class="eg-te-row">' +
            '<div class="eg-te-edit">' +
                '<input class="eg-te-name-input" type="text" value="' + escapeHtml(te.typeName) + '"' +
                    ' onblur="_egSaveTrackedExercise(\'' + tid + '\',\'typeName\',this.value)"' +
                    ' title="Edit name">' +
                '<div class="eg-te-cal-wrap">' +
                    '<input class="eg-te-cal-input" type="text" inputmode="numeric" value="' + (te.calPerSession || 0) + '"' +
                        ' onblur="_egSaveTrackedExercise(\'' + tid + '\',\'calPerSession\',this.value)"' +
                        ' title="Edit calories per session">' +
                    '<span class="eg-te-cal-label">cal/ses</span>' +
                '</div>' +
            '</div>' +
            '<div class="eg-te-actions">' +
                '<button class="btn btn-icon" title="Move up" onclick="_egMoveExercise(\'' + tid + '\', -1)"' + (isFirst ? ' disabled' : '') + '>↑</button>' +
                '<button class="btn btn-icon" title="Move down" onclick="_egMoveExercise(\'' + tid + '\', 1)"' + (isLast ? ' disabled' : '') + '>↓</button>' +
                '<button class="btn btn-danger btn-small" onclick="_egDeleteExercise(\'' + tid + '\')">Remove</button>' +
            '</div>' +
        '</div>';
    }).join('');
}

// ─── Save tracked exercise field on blur ─────────────────────────────────────

async function _egSaveTrackedExercise(typeId, field, rawValue) {
    var te = (_egYearData.trackedExercises || []).find(function(t) { return t.typeId === typeId; });
    if (!te) return;

    var val;
    if (field === 'typeName') {
        val = rawValue.trim();
        if (!val) return;  // don't allow blank name
    } else if (field === 'calPerSession') {
        val = parseInt(rawValue, 10);
        if (isNaN(val) || val < 0) return;
    }

    te[field] = val;

    try {
        await userCol('exerciseGoals').doc(String(_egCurrentYear)).update({
            trackedExercises: _egYearData.trackedExercises,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // Refresh the summary on the year page if it's visible
        _egRenderExerciseSummary();
    } catch (err) {
        console.error('Goals: failed to save tracked exercise:', err);
    }
}

// ─── Add exercise form ────────────────────────────────────────────────────────

function _egShowAddExerciseForm() {
    var form = document.getElementById('egAddExerciseForm');
    if (!form) return;
    form.classList.remove('hidden');

    // Build dropdown: non-archived types not already tracked
    var trackedIds = (_egYearData.trackedExercises || []).map(function(te) { return te.typeId; });
    var available  = _egAllTypes.filter(function(t) { return trackedIds.indexOf(t.id) === -1; });

    var opts = '<option value="">— Select exercise type —</option>';
    available.forEach(function(t) {
        opts += '<option value="' + t.id + '">' + escapeHtml(t.name) + '</option>';
    });
    opts += '<option value="__new__">+ Add new type...</option>';

    form.innerHTML =
        '<div class="eg-add-form-inner">' +
            '<div class="form-group">' +
                '<label>Exercise Type</label>' +
                '<select id="egAddTypeSelect" onchange="_egOnAddTypeChange(this.value)">' + opts + '</select>' +
            '</div>' +
            '<div id="egNewTypeFields" class="hidden">' +
                '<div class="form-group">' +
                    '<label>New Type Name</label>' +
                    '<input type="text" id="egNewTypeName" placeholder="e.g. Yoga">' +
                '</div>' +
                '<div class="eg-checkbox-row">' +
                    '<label><input type="checkbox" id="egNewTypeTracksMiles"> Track Miles</label>' +
                    '<label><input type="checkbox" id="egNewTypeWithDogs"> With Dogs toggle</label>' +
                '</div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Avg Calories Per Session</label>' +
                '<input type="number" id="egAddCalPerSession" placeholder="e.g. 300" style="width:120px">' +
            '</div>' +
            '<div class="eg-form-actions">' +
                '<button class="btn btn-primary btn-small" onclick="_egConfirmAddExercise()">Add</button>' +
                '<button class="btn btn-secondary btn-small" onclick="_egHideAddExerciseForm()">Cancel</button>' +
            '</div>' +
        '</div>';
}

function _egHideAddExerciseForm() {
    var form = document.getElementById('egAddExerciseForm');
    if (form) { form.classList.add('hidden'); form.innerHTML = ''; }
}

function _egOnAddTypeChange(val) {
    var newFields = document.getElementById('egNewTypeFields');
    if (!newFields) return;
    newFields.classList.toggle('hidden', val !== '__new__');
}

async function _egConfirmAddExercise() {
    var typeSelect = document.getElementById('egAddTypeSelect');
    var calInput   = document.getElementById('egAddCalPerSession');
    if (!typeSelect || !calInput) return;

    var typeId    = typeSelect.value;
    var calPerSes = parseInt(calInput.value, 10);

    if (!typeId) { alert('Please select an exercise type.'); return; }
    if (!calPerSes || calPerSes < 1) { alert('Please enter avg calories per session.'); return; }

    var typeName = '';

    if (typeId === '__new__') {
        // Create a new exerciseType first
        var nameInput = document.getElementById('egNewTypeName');
        var newName   = nameInput ? nameInput.value.trim() : '';
        if (!newName) { alert('Please enter a name for the new type.'); return; }

        var tracksMiles = document.getElementById('egNewTypeTracksMiles').checked;
        var withDogs    = document.getElementById('egNewTypeWithDogs').checked;

        try {
            var newRef = await userCol('exerciseTypes').add({
                name: newName, tracksMiles: tracksMiles, withDogs: withDogs,
                isDefault: false, archived: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            typeId   = newRef.id;
            typeName = newName;
            _egAllTypes.push({ id: typeId, name: newName, tracksMiles: tracksMiles, withDogs: withDogs });
            _egAllTypes.sort(function(a, b) { return a.name.localeCompare(b.name); });
        } catch (err) {
            console.error('Goals: failed to create new type:', err);
            alert('Failed to create type. Please try again.');
            return;
        }
    } else {
        var found = _egAllTypes.find(function(t) { return t.id === typeId; });
        typeName = found ? found.name : typeId;
    }

    // Append to trackedExercises with next sortOrder
    var existing   = _egYearData.trackedExercises || [];
    var nextOrder  = existing.length > 0
        ? Math.max.apply(null, existing.map(function(te) { return te.sortOrder || 0; })) + 1
        : 0;

    var newEntry = { typeId: typeId, typeName: typeName, calPerSession: calPerSes, sortOrder: nextOrder };
    existing.push(newEntry);
    _egYearData.trackedExercises = existing;

    try {
        await userCol('exerciseGoals').doc(String(_egCurrentYear)).update({
            trackedExercises: existing,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        _egHideAddExerciseForm();
        _egRenderTrackedList();
    } catch (err) {
        console.error('Goals: failed to save tracked exercise:', err);
        alert('Failed to save. Please try again.');
        existing.pop();
        _egYearData.trackedExercises = existing;
    }
}

// ─── Reorder tracked exercise ─────────────────────────────────────────────────

async function _egMoveExercise(typeId, direction) {
    var exercises = (_egYearData.trackedExercises || []).slice()
        .sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });

    var idx = exercises.findIndex(function(te) { return te.typeId === typeId; });
    var swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= exercises.length) return;

    // Swap sortOrder values
    var tmp = exercises[idx].sortOrder;
    exercises[idx].sortOrder   = exercises[swapIdx].sortOrder;
    exercises[swapIdx].sortOrder = tmp;

    _egYearData.trackedExercises = exercises;

    try {
        await userCol('exerciseGoals').doc(String(_egCurrentYear)).update({
            trackedExercises: exercises,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        _egRenderTrackedList();
    } catch (err) {
        console.error('Goals: failed to reorder exercise:', err);
    }
}

// ─── Delete tracked exercise ──────────────────────────────────────────────────

async function _egDeleteExercise(typeId) {
    var te = (_egYearData.trackedExercises || []).find(function(t) { return t.typeId === typeId; });
    if (!te) return;
    if (!confirm('Remove "' + te.typeName + '" from tracked exercises? Monthly session counts for this exercise will also be removed.')) return;

    var updated = (_egYearData.trackedExercises || []).filter(function(t) { return t.typeId !== typeId; });
    _egYearData.trackedExercises = updated;

    try {
        await userCol('exerciseGoals').doc(String(_egCurrentYear)).update({
            trackedExercises: updated,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        _egRenderTrackedList();
    } catch (err) {
        console.error('Goals: failed to remove exercise:', err);
        alert('Failed to remove. Please try again.');
    }
}

// ─── Year dropdown handler ────────────────────────────────────────────────────

function _egOnYearSelect(val) {
    if (val === '__add__') {
        // Reset the dropdown to the currently displayed year
        var parts = window.location.hash.slice(1).split('/');
        var cur = parseInt(parts[1], 10);
        var sel = document.getElementById('egYearSelect');
        if (sel && cur) sel.value = cur;
        _egShowAddYearPopup();
        return;
    }
    window.location.hash = '#exercise-goals/' + val;
}

// ─── Add Year popup ───────────────────────────────────────────────────────────

function _egAddYearPopupHtml(defaultYear) {
    return '<div id="egAddYearPopup" class="modal-overlay">' +
        '<div class="modal">' +
            '<h3>Add Year</h3>' +
            '<div class="form-group">' +
                '<label>Year</label>' +
                '<input type="number" id="egNewYearInput" value="' + defaultYear + '" min="2020" max="2050" style="width:100px">' +
            '</div>' +
            '<div class="modal-actions">' +
                '<button class="btn btn-primary" onclick="_egConfirmAddYear()">Add</button>' +
                '<button class="btn btn-secondary" onclick="_egHideAddYearPopup()">Cancel</button>' +
            '</div>' +
        '</div>' +
    '</div>';

}

function _egShowAddYearPopup() {
    var popup = document.getElementById('egAddYearPopup');
    if (popup) popup.classList.add('open');
}

function _egHideAddYearPopup() {
    var popup = document.getElementById('egAddYearPopup');
    if (popup) popup.classList.remove('open');
}

async function _egConfirmAddYear() {
    var input = document.getElementById('egNewYearInput');
    if (!input) return;
    var year = parseInt(input.value, 10);
    if (!year || year < 2020 || year > 2050) {
        alert('Please enter a year between 2020 and 2050.');
        return;
    }
    if (_egYears.indexOf(year) !== -1) {
        alert('Goals for ' + year + ' already exist.');
        return;
    }

    try {
        await userCol('exerciseGoals').doc(String(year)).set({
            year:             year,
            startingWeight:   null,
            baseDailyBurn:    null,
            calPerMile:       null,
            trackedExercises: [],
            months:           {},
            createdAt:        firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt:        firebase.firestore.FieldValue.serverTimestamp()
        });
        _egYears.push(year);
        _egYears.sort(function(a, b) { return a - b; });
        _egHideAddYearPopup();
        window.location.hash = '#exercise-goals/' + year;
    } catch (err) {
        console.error('Goals: failed to create year:', err);
        alert('Failed to create goals for ' + year + '. Please try again.');
    }
}

// ─── Mobile month edit page ───────────────────────────────────────────────────

/** Stub — fully implemented in Phase 6. */
// Auto-selects the full value of an input when focused — delegates from a container
// so one listener covers every input inside, including dynamically rendered ones.
// The _egFocusAdded flag prevents duplicate listeners if the container re-renders.
function _egAddSelectOnFocus(containerId) {
    var el = document.getElementById(containerId);
    if (!el || el._egFocusAdded) return;
    el.addEventListener('focus', function(e) {
        if (e.target && e.target.tagName === 'INPUT') e.target.select();
    }, true);
    el._egFocusAdded = true;
}

// ─── Arrow-key grid navigation ────────────────────────────────────────────────

// Builds a 2D array [row 0..11][col 0..N] of all navigable grid inputs in DOM order.
function _egGetNavGrid() {
    var grid = [];
    for (var m = 1; m <= 12; m++) {
        var rowInputs = Array.from(document.querySelectorAll('.eg-cell-input[data-month="' + m + '"]'));
        grid.push(rowInputs);
    }
    return grid;
}

// Keydown handler — intercepts arrow keys on grid inputs for cell-to-cell navigation.
function _egHandleGridKeydown(e) {
    var input = e.target;
    if (!input || input.tagName !== 'INPUT' || !input.classList.contains('eg-cell-input')) return;

    var key = e.key;
    if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowRight') return;

    var month = parseInt(input.dataset.month, 10);
    if (!month) return;

    var grid   = _egGetNavGrid();
    var rowIdx = month - 1;
    var row    = grid[rowIdx] || [];
    var colIdx = row.indexOf(input);
    if (colIdx === -1) return;

    var sel0         = input.selectionStart;   // null for type="number"; valid for type="text"
    var sel1         = input.selectionEnd;
    var len          = input.value.length;
    var isEmpty      = len === 0;
    var isFullySel   = sel0 === 0 && sel1 === len && len > 0;
    var atRightEdge  = sel0 !== null && sel0 === sel1 && sel0 === len;
    var atLeftEdge   = sel0 !== null && sel0 === sel1 && sel0 === 0;

    var targetInput = null;

    if (key === 'ArrowUp') {
        // Always navigate up — no boundary beyond row 0
        if (rowIdx > 0) {
            var above = grid[rowIdx - 1];
            targetInput = above[Math.min(colIdx, above.length - 1)] || null;
        }

    } else if (key === 'ArrowDown') {
        // Always navigate down — no boundary beyond row 11
        if (rowIdx < grid.length - 1) {
            var below = grid[rowIdx + 1];
            targetInput = below[Math.min(colIdx, below.length - 1)] || null;
        }

    } else if (key === 'ArrowRight') {
        // Navigate right only when empty, fully selected, or cursor already at right edge
        if (isEmpty || isFullySel || atRightEdge) {
            targetInput = colIdx < row.length - 1 ? row[colIdx + 1] : null;
        }

    } else if (key === 'ArrowLeft') {
        // Navigate left only when empty, fully selected, or cursor already at left edge
        if (isEmpty || isFullySel || atLeftEdge) {
            targetInput = colIdx > 0 ? row[colIdx - 1] : null;
        }
    }

    if (targetInput) {
        e.preventDefault();
        targetInput.focus();  // _egAddSelectOnFocus listener will auto-select the value
    }
}

// Attaches the arrow-key grid navigation keydown listener to a container.
function _egAddKeydownNav(containerId) {
    var el = document.getElementById(containerId);
    if (!el || el._egKeydownAdded) return;
    el.addEventListener('keydown', _egHandleGridKeydown, true);
    el._egKeydownAdded = true;
}

// ─── Phase 6: Mobile view & month edit screen ────────────────────────────────

// Human-readable labels for threshold fields on the mobile edit form
var _EG_THRESHOLD_LABELS = {
    foodYellow1:    'Min calories (below = too little)',
    foodYellow2:    'Max calories (above = a little over)',
    foodBad:        'Bad day calories (above = way over)',
    batteryYellow:  'Low battery (at or below → yellow)',
    batteryBlue:    'High battery (at or above → blue)',
    stepsYellow:    'Low steps (below → yellow)',
    stepsGreen:     'Good steps (at or above → green)',
    stepsBlue:      'Great steps (at or above → blue)',
    burnGreen:      'Good total burn (at or above → green)',
    burnBlue:       'Great total burn (at or above → blue)',
    exerciseYellow: 'Low exercise burn (below → yellow)',
    exerciseBlue:   'High exercise burn (at or above → blue)',
    calLossYellow:  'Warn if cal loss at or below → yellow',
    calLossGreen:   'Good cal loss (at or above → green)',
    calLossBlue:    'Great cal loss (at or above → blue)',
    milesYellow:    'Low miles (below → yellow)',
    milesGreen:     'Good miles (at or above → green)',
    milesBlue:      'Great miles (at or above → blue)'
};

// ─── Mobile month summary cards ──────────────────────────────────────────────

function _egRenderMobileView() {
    var el = document.getElementById('egMobileView');
    if (!el) return;

    var exercises = (_egYearData.trackedExercises || []).slice()
        .sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
    var MAX_INLINE = 3;

    var cards = '';
    for (var m = 1; m <= 12; m++) {
        var mData    = _egMonths[m] || {};
        var sessions = mData.exerciseSessions || {};
        var effGW    = _egEffectiveGoalWeight(m);

        var gwDisplay    = effGW != null ? effGW + ' lbs' : '—';
        var milesDisplay = mData.avgMilesPerDay != null ? mData.avgMilesPerDay + '/day' : '—';

        var sessionHtml = '';
        if (exercises.length > 0) {
            if (exercises.length <= MAX_INLINE) {
                sessionHtml = exercises.map(function(te) {
                    var cnt = sessions[te.typeId] != null ? sessions[te.typeId] : '—';
                    return '<span class="eg-mob-stat"><span class="eg-mob-stat-label">' +
                           escapeHtml(te.typeName) + ':</span> ' + cnt + '</span>';
                }).join('');
            } else {
                var total = 0;
                exercises.forEach(function(te) { total += sessions[te.typeId] || 0; });
                sessionHtml = '<span class="eg-mob-stat">' + total + ' sessions</span>';
            }
        }

        cards +=
            '<div class="eg-mob-card">' +
                '<div class="eg-mob-card-header">' +
                    '<span class="eg-mob-month-name">' + _EG_MONTH_NAMES[m - 1] + '</span>' +
                    '<a href="#exercise-goals/' + _egCurrentYear + '/' + m + '" class="btn btn-secondary btn-small">Edit</a>' +
                '</div>' +
                '<div class="eg-mob-card-data">' +
                    '<span class="eg-mob-stat"><span class="eg-mob-stat-label">Wt:</span> ' + gwDisplay + '</span>' +
                    '<span class="eg-mob-stat"><span class="eg-mob-stat-label">Mi:</span> ' + milesDisplay + '</span>' +
                    sessionHtml +
                '</div>' +
            '</div>';
    }

    el.innerHTML = cards;
}

// ─── Mobile month edit screen ─────────────────────────────────────────────────

async function loadExerciseGoalsMonthPage(year, month) {
    window.scrollTo(0, 0);
    var yearNum  = parseInt(year, 10);
    var monthNum = parseInt(month, 10);
    var monthName = _EG_MONTH_NAMES[monthNum - 1] || ('Month ' + month);

    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
        '<a href="#exercise">Exercise</a><span class="separator">&rsaquo;</span>' +
        '<a href="#exercise-goals/' + year + '">Goals</a><span class="separator">&rsaquo;</span>' +
        '<span>' + year + ' – ' + monthName + '</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + (window.appName || 'My Life') + '</a>';

    var el = document.getElementById('page-exercise-goals-month');
    if (!el) return;
    el.innerHTML = '<p class="loading-text">Loading...</p>';

    try {
        await _egEnsureYearData(yearNum);
    } catch (err) {
        console.error('Goals: failed to load month:', err);
        el.innerHTML = '<p class="error-text">Failed to load. Please try again.</p>';
        return;
    }

    _egRenderMonthEditForm(yearNum, monthNum);
}

function _egRenderMonthEditForm(year, month) {
    var el = document.getElementById('page-exercise-goals-month');
    if (!el) return;

    var mData     = _egMonths[month] || {};
    var sessions  = mData.exerciseSessions || {};
    var exercises = (_egYearData.trackedExercises || []).slice()
        .sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
    var monthName = _EG_MONTH_NAMES[month - 1];

    var html =
        '<div class="page-header"><h2>' + monthName + ' ' + year + '</h2></div>';

    // Copy Previous (hidden for January)
    if (month > 1) {
        html += '<div class="eg-month-edit-actions eg-month-edit-top">' +
            '<button class="btn btn-secondary" onclick="_egMobileCopyPrev(' + year + ',' + month + ')">Copy Previous Month</button>' +
        '</div>';
    }

    html += '<div class="eg-month-edit-form">';

    // ── Weight ───────────────────────────────────────────────────────────────
    html += _egMobileSection('Weight', [
        { label: 'Goal Weight (lbs)', value: mData.goalWeight,
          save: '_egSaveMonthField(' + month + ',\'goalWeight\',this.value)', step: '0.1', placeholder: 'e.g. 207' }
    ]);

    // ── Exercise Goals ────────────────────────────────────────────────────────
    var exRows = [
        { label: 'Avg Miles / Day', value: mData.avgMilesPerDay,
          save: '_egSaveMonthField(' + month + ',\'avgMilesPerDay\',this.value)', step: '0.1', placeholder: 'e.g. 6' }
    ];
    exercises.forEach(function(te) {
        exRows.push({
            label: escapeHtml(te.typeName) + ' (sessions)',
            value: sessions[te.typeId] != null ? sessions[te.typeId] : null,
            save: '_egSaveMonthSession(' + month + ',\'' + te.typeId + '\',this.value)',
            step: '1', placeholder: 'e.g. 12'
        });
    });
    html += _egMobileSection('Exercise Goals', exRows);

    // ── Threshold sections grouped from _EG_THRESHOLD_COLS ───────────────────
    var currentGroup = null;
    var groupRows    = [];

    function flushGroup() {
        if (currentGroup && groupRows.length > 0) {
            html += _egMobileSection(currentGroup, groupRows);
        }
        groupRows = [];
    }

    _EG_THRESHOLD_COLS.forEach(function(col) {
        if (col.groupStart && currentGroup !== null) flushGroup();
        currentGroup = col.group;
        groupRows.push({
            label: _EG_THRESHOLD_LABELS[col.field] || col.label,
            value: mData[col.field] != null ? mData[col.field] : null,
            save:  '_egSaveMonthField(' + month + ',\'' + col.field + '\',this.value)',
            step:  '1', placeholder: ''
        });
    });
    flushGroup();

    html += '</div>';  // eg-month-edit-form

    // Back button
    html +=
        '<div class="eg-month-edit-actions">' +
            '<a href="#exercise-goals/' + year + '" class="btn btn-primary">← Back to ' + year + ' Goals</a>' +
        '</div>';

    el.innerHTML = html;
    _egAddSelectOnFocus('page-exercise-goals-month');
}

// Renders one labeled form section with a list of field rows
function _egMobileSection(title, rows) {
    var html = '<div class="eg-month-section"><div class="dm-section-header">' + title + '</div>';
    rows.forEach(function(r) {
        var val = r.value != null ? r.value : '';
        html +=
            '<div class="eg-month-field-row">' +
                '<label class="eg-month-field-label">' + r.label + '</label>' +
                '<input class="eg-month-field-input" type="number"' +
                (r.step ? ' step="' + r.step + '"' : '') +
                ' value="' + val + '"' +
                (r.placeholder ? ' placeholder="' + r.placeholder + '"' : '') +
                ' onblur="' + r.save + '">' +
            '</div>';
    });
    return html + '</div>';
}

// Copy previous month data then re-render the form
async function _egMobileCopyPrev(year, month) {
    if (month <= 1) return;
    await _egCopyPreviousMonth(month);
    _egRenderMonthEditForm(year, month);
}

// ─── Delete metric def ────────────────────────────────────────────────────────

async function _dmDeleteDef(defId) {
    var def = _dmDefsAll.find(function(d) { return d.id === defId; });
    if (!def) return;
    if (!confirm('Delete "' + def.name + '"? It will be removed from the entry form. Your past data for this metric is preserved.')) return;

    try {
        await userCol('exerciseMetricDefs').doc(defId).update({ archived: true });
        _dmDefsAll = _dmDefsAll.filter(function(d) { return d.id !== defId; });
        _dmRenderDefsList();
    } catch (err) {
        console.error('DailyMetrics: failed to delete metric def:', err);
        alert('Failed to delete. Please try again.');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// END-TO-END TEST RUNNER
// Call: await _egRunE2ETests()  (from browser console or preview_eval)
// ═══════════════════════════════════════════════════════════════════════════════

async function _egRunE2ETests() {
    var pass = 0, fail = 0, results = [];

    function ok(id, desc) {
        pass++;
        results.push('[PASS] ' + id + ' — ' + desc);
    }
    function ko(id, desc, reason) {
        fail++;
        results.push('[FAIL] ' + id + ' — ' + desc + ' :: ' + reason);
    }
    function check(id, desc, condition, reason) {
        condition ? ok(id, desc) : ko(id, desc, reason || 'condition false');
    }
    function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

    // ── T1: Year Management ────────────────────────────────────────────────────
    results.push('');
    results.push('── T1: Year Management ──');

    window.location.hash = '#exercise-goals';
    await sleep(900);
    var hash = window.location.hash;
    check('T1.1', 'Auto-redirects to current year',
        hash === '#exercise-goals/2026' || hash.startsWith('#exercise-goals/2026'),
        'hash=' + hash);

    var sel = document.getElementById('egYearSelect');
    check('T1.2a', 'Year dropdown exists', !!sel, 'select not found');
    if (sel) {
        check('T1.2b', '2026 is selected', sel.value === '2026', 'value=' + sel.value);
        var opts = Array.from(sel.options).map(function(o) { return o.value; });
        check('T1.2c', 'Add New Year option present', opts.indexOf('__add__') !== -1, 'opts=' + opts.join(','));
    }

    // Simulate opening Add Year popup
    _egShowAddYearPopup();
    await sleep(100);
    var popup = document.getElementById('egAddYearPopup');
    var yearInput = document.getElementById('egNewYearInput');
    check('T1.3a', 'Add Year popup appears', popup && popup.classList.contains('open'), 'popup class=' + (popup ? popup.className : 'null'));
    check('T1.3b', 'Default year is next year', yearInput && parseInt(yearInput.value, 10) === new Date().getFullYear() + 1,
        'value=' + (yearInput ? yearInput.value : 'null'));

    // Cancel without creating
    _egHideAddYearPopup();
    await sleep(100);
    check('T1.4', 'Cancel closes popup', popup && !popup.classList.contains('open'), 'still open');

    // ── T2: Year Constants ──────────────────────────────────────────────────────
    results.push('');
    results.push('── T2: Year Constants ──');

    window.location.hash = '#exercise-goals/2026';
    await sleep(900);

    var swInp = document.getElementById('egStartingWeight');
    check('T2.1a', 'Starting weight input exists', !!swInp, 'not found');
    if (swInp) {
        swInp.value = '218';
        swInp.dispatchEvent(new Event('blur'));
        await sleep(500);
        check('T2.1b', 'Starting weight saved to state', _egYearData && _egYearData.startingWeight === 218,
            'got=' + (_egYearData ? _egYearData.startingWeight : 'no data'));
    }

    var bdbInp = document.getElementById('egBaseDailyBurn');
    if (bdbInp) {
        bdbInp.value = '2200';
        bdbInp.dispatchEvent(new Event('blur'));
        await sleep(400);
        check('T2.2', 'Base daily burn saved', _egYearData && _egYearData.baseDailyBurn === 2200,
            'got=' + (_egYearData ? _egYearData.baseDailyBurn : 'no data'));
    }

    var cpmInp = document.getElementById('egCalPerMile');
    if (cpmInp) {
        cpmInp.value = '110';
        cpmInp.dispatchEvent(new Event('blur'));
        await sleep(400);
        check('T2.3', 'Cal/mile saved', _egYearData && _egYearData.calPerMile === 110,
            'got=' + (_egYearData ? _egYearData.calPerMile : 'no data'));

        // T2.4: clear and verify F shows dash
        cpmInp.value = '';
        cpmInp.dispatchEvent(new Event('blur'));
        await sleep(400);
        var fCell = document.querySelector('.eg-proj-f[data-month="1"]');
        check('T2.4', 'Clearing calPerMile shows dash in F', fCell && fCell.textContent.trim() === '—',
            'F text=' + (fCell ? fCell.textContent.trim() : 'null'));

        // T2.5: restore and verify F calculates
        cpmInp.value = '110';
        cpmInp.dispatchEvent(new Event('blur'));
        await sleep(400);
        var milesInp = document.querySelector('[data-month="1"][data-field="avgMilesPerDay"]');
        if (milesInp && parseFloat(milesInp.value) > 0) {
            var expectedF = Math.round(parseFloat(milesInp.value) * 110);
            fCell = document.querySelector('.eg-proj-f[data-month="1"]');
            var fText = fCell ? fCell.textContent.replace(/,/g, '').trim() : '';
            check('T2.5', 'Restoring calPerMile recalculates F', fText === String(expectedF),
                'expected=' + expectedF + ' got=' + fText);
        } else {
            results.push('[SKIP] T2.5 — no miles entered for Jan yet');
        }
    }

    // ── T3: Tracked Exercises ───────────────────────────────────────────────────
    results.push('');
    results.push('── T3: Tracked Exercises ──');

    var exercises = _egYearData ? (_egYearData.trackedExercises || []) : [];
    check('T3.1a', 'At least one tracked exercise exists', exercises.length > 0,
        'count=' + exercises.length);

    if (exercises.length > 0) {
        var firstEx = exercises.sort(function(a,b){return (a.sortOrder||0)-(b.sortOrder||0);})[0];
        var colHeader = document.querySelector('.eg-grid thead th:not(.eg-col-month):not(.eg-th-calc):not(.eg-th-copy)');
        // Check first non-special header is an exercise name
        var gridHeaders = Array.from(document.querySelectorAll('.eg-grid thead th')).map(function(th) { return th.textContent.trim(); });
        check('T3.1b', 'Tracked exercise appears as grid column',
            gridHeaders.some(function(h) { return h.indexOf(firstEx.typeName) !== -1; }),
            'headers=' + gridHeaders.slice(0,8).join('|'));

        // T3.2: Session count save
        var typeId = firstEx.typeId;
        var sesInput = document.querySelector('[data-month="1"][data-typeid="' + typeId + '"]');
        if (sesInput) {
            sesInput.value = '12';
            sesInput.dispatchEvent(new Event('blur'));
            await sleep(500);
            var saved = _egMonths[1] && _egMonths[1].exerciseSessions && _egMonths[1].exerciseSessions[typeId];
            check('T3.2', 'Session count saves to state', saved === 12, 'got=' + saved);
        }
    }

    // T3.4: G recalculates
    var gCell = document.querySelector('.eg-proj-g[data-month="1"]');
    var gText = gCell ? gCell.textContent.replace(/,/g, '').trim() : null;
    check('T3.4', 'G column shows value (sessions * cal/session / days)', gText !== null && gText !== '—',
        'G text=' + gText);

    // ── T4: Monthly Goals Grid ──────────────────────────────────────────────────
    results.push('');
    results.push('── T4: Monthly Goals Grid ──');

    // Set Jan goal weight and check cascade
    var janGW = document.querySelector('[data-month="1"][data-field="goalWeight"]');
    if (janGW) {
        // Reset months 2-12 to null first for a clean cascade test
        for (var m2 = 2; m2 <= 12; m2++) {
            if (_egMonths[m2]) _egMonths[m2].goalWeight = null;
        }
        janGW.value = '210';
        janGW.dispatchEvent(new Event('blur'));
        await sleep(600);

        // Check cascade: months 2-12 that were null should now show 210
        var febInp = document.querySelector('[data-month="2"][data-field="goalWeight"]');
        check('T4.1', 'Goal weight cascades to blank months', febInp && febInp.value === '210',
            'Feb value=' + (febInp ? febInp.value : 'null'));

        // T4.2: cascade overrides higher months but leaves lower months alone
        var marGW = document.querySelector('[data-month="3"][data-field="goalWeight"]');
        if (marGW) {
            // Set Mar = 205 (lower than Jan 210) — Jan change should NOT override it
            marGW.value = '205';
            marGW.dispatchEvent(new Event('blur'));
            await sleep(500);
            janGW.value = '208';
            janGW.dispatchEvent(new Event('blur'));
            await sleep(600);
            // Mar is 205 < 208, so should NOT be overridden
            check('T4.2a', 'Cascade does not override lower months',
                marGW.value === '205', 'Mar value=' + marGW.value);
            // Set Mar = 215 (higher than Jan 208) — cascade should update it
            marGW.value = '215';
            marGW.dispatchEvent(new Event('blur'));
            await sleep(500);
            janGW.value = '210';
            janGW.dispatchEvent(new Event('blur'));
            await sleep(600);
            // Mar is 215 > 210, so should be updated to 210
            check('T4.2b', 'Cascade overrides months with higher weight',
                marGW.value === '210', 'Mar value=' + marGW.value);
            // Reset Mar to a lower value
            marGW.value = '205';
            marGW.dispatchEvent(new Event('blur'));
            await sleep(400);
        }
    }

    // T4.3 Weight Loss
    var wtLossCell = document.querySelector('.eg-wt-loss-cell[data-month="1"]');
    var sw = _egYearData ? _egYearData.startingWeight : null;
    if (wtLossCell && sw != null && _egMonths[1] && _egMonths[1].goalWeight != null) {
        var expectedWtLoss = Math.round(sw - _egMonths[1].goalWeight);
        check('T4.3', 'Weight Loss = startingWeight - goalWeight',
            wtLossCell.textContent.trim() === String(expectedWtLoss),
            'expected=' + expectedWtLoss + ' got=' + wtLossCell.textContent.trim());
    }

    // T4.4 Daily Cal Loss
    var calCell = document.querySelector('.eg-daily-cal-cell[data-month="1"]');
    if (calCell && _egMonths[1] && _egMonths[1].goalWeight != null && sw != null) {
        var wtLoss = Math.abs(Math.round(sw - _egMonths[1].goalWeight));
        var expectedCal = Math.round(wtLoss * 3500 / 31);
        var calText = calCell.textContent.replace(/,/g, '').trim();
        check('T4.4', 'Daily Cal Loss = abs(WtLoss)*3500/days',
            calText === String(expectedCal), 'expected=' + expectedCal + ' got=' + calText);
    }

    // T4.5 F = miles * calPerMile
    var milesInput = document.querySelector('[data-month="1"][data-field="avgMilesPerDay"]');
    if (milesInput) {
        milesInput.value = '6';
        milesInput.dispatchEvent(new Event('blur'));
        await sleep(400);
    }
    var projF = document.querySelector('.eg-proj-f[data-month="1"]');
    check('T4.5', 'F = avgMiles * calPerMile',
        projF && projF.textContent.replace(/,/g,'').trim() === '660',
        'F=' + (projF ? projF.textContent.trim() : 'null'));

    // T4.7 H = F + G
    var projH = document.querySelector('.eg-proj-h[data-month="1"]');
    var projG = document.querySelector('.eg-proj-g[data-month="1"]');
    if (projF && projG && projH) {
        var fVal = parseInt(projF.textContent.replace(/,/g,''), 10);
        var gVal = parseInt(projG.textContent.replace(/,/g,''), 10);
        var hVal = parseInt(projH.textContent.replace(/,/g,''), 10);
        check('T4.7', 'H = F + G', hVal === fVal + gVal,
            'F=' + fVal + ' G=' + gVal + ' H=' + hVal);
    }

    // T4.8 I formula
    var fy1Input = document.querySelector('[data-month="1"][data-field="foodYellow1"]');
    var fy2Input = document.querySelector('[data-month="1"][data-field="foodYellow2"]');
    if (fy1Input && fy2Input) {
        fy1Input.value = '1200'; fy1Input.dispatchEvent(new Event('blur'));
        fy2Input.value = '1700'; fy2Input.dispatchEvent(new Event('blur'));
        await sleep(500);
        var projI = document.querySelector('.eg-proj-i[data-month="1"]');
        if (projI && projH) {
            var hv = parseInt(projH.textContent.replace(/,/g,''), 10);
            var baseBurn = _egYearData ? (_egYearData.baseDailyBurn || 0) : 0;
            var avgFood = (1200 + 1700) / 2;
            var expectedI = Math.round((baseBurn + hv - avgFood) * 31 / 3500);
            var iText = projI.textContent.replace(/,/g,'').trim();
            check('T4.8', 'I formula = ((baseBurn+H) - avgFood) * days / 3500',
                iText === String(expectedI), 'expected=' + expectedI + ' got=' + iText);
        }
    }

    // T4.9 J chain
    var projJ = document.querySelector('.eg-proj-j[data-month="1"]');
    if (projJ && projI) {
        var iVal = parseInt(projI.textContent.replace(/,/g,''), 10);
        var jVal = parseInt(projJ.textContent.replace(/,/g,''), 10);
        var expectedJ = Math.round((sw || 218) - iVal);
        check('T4.9', 'J = startingWeight - I for Jan',
            jVal === expectedJ, 'expected=' + expectedJ + ' got=' + jVal);
    }

    // T4.10 J warning when J > goal weight
    var janGWVal = _egMonths[1] ? _egMonths[1].goalWeight : null;
    var jNum = projJ ? parseInt(projJ.textContent.replace(/,/g,''), 10) : null;
    if (jNum != null && janGWVal != null) {
        var expectedWarn = jNum > janGWVal;
        var hasWarn = projJ.classList.contains('eg-td-warn');
        check('T4.10', 'J warning matches J > goalWeight', hasWarn === expectedWarn,
            'jNum=' + jNum + ' goalWt=' + janGWVal + ' hasWarn=' + hasWarn);
    }

    // T4.12 Copy Previous Month
    var sepMiles = parseFloat(document.querySelector('[data-month="1"][data-field="avgMilesPerDay"]').value || '0');
    await _egCopyPreviousMonth(2);
    await sleep(500);
    var febMiles = document.querySelector('[data-month="2"][data-field="avgMilesPerDay"]');
    check('T4.12', 'Copy Prev copies avgMilesPerDay', febMiles && parseFloat(febMiles.value) === sepMiles,
        'expected=' + sepMiles + ' got=' + (febMiles ? febMiles.value : 'null'));

    // ── T5: Threshold Columns ───────────────────────────────────────────────────
    results.push('');
    results.push('── T5: Threshold Columns ──');

    var thHeaders = document.querySelectorAll('.eg-th-y, .eg-th-g, .eg-th-b, .eg-th-ly');
    check('T5.1', '18 threshold column headers present', thHeaders.length === 18,
        'found=' + thHeaders.length);

    var fy1Cell = document.querySelector('[data-month="1"][data-field="foodYellow1"]');
    if (fy1Cell) {
        fy1Cell.value = '1300';
        fy1Cell.dispatchEvent(new Event('blur'));
        await sleep(400);
        check('T5.2', 'Threshold value saves to state', _egMonths[1] && _egMonths[1].foodYellow1 === 1300,
            'got=' + (_egMonths[1] ? _egMonths[1].foodYellow1 : 'null'));
        // Reset
        fy1Cell.value = '1200';
        fy1Cell.dispatchEvent(new Event('blur'));
        await sleep(300);
    }

    var fy2Cell = document.querySelector('[data-month="1"][data-field="foodYellow2"]');
    if (fy1Cell && fy2Cell) {
        var iBeforeText = (document.querySelector('.eg-proj-i[data-month="1"]') || {}).textContent;
        fy2Cell.value = '2000'; // much higher — food budget doubles
        fy2Cell.dispatchEvent(new Event('blur'));
        await sleep(400);
        var iAfterText = (document.querySelector('.eg-proj-i[data-month="1"]') || {}).textContent;
        check('T5.3', 'Changing food threshold recalculates I', iBeforeText !== iAfterText,
            'before=' + iBeforeText + ' after=' + iAfterText);
        // Reset
        fy2Cell.value = '1700';
        fy2Cell.dispatchEvent(new Event('blur'));
        await sleep(300);
    }

    // ── T6: Mobile Month Edit ───────────────────────────────────────────────────
    results.push('');
    results.push('── T6: Mobile Month Edit ──');

    window.location.hash = '#exercise-goals/2026/3';
    await sleep(900);
    var monthEl = document.getElementById('page-exercise-goals-month');
    var sections = monthEl ? monthEl.querySelectorAll('.eg-month-section') : [];
    var inputs   = monthEl ? monthEl.querySelectorAll('.eg-month-field-input') : [];
    check('T6.1a', 'Month edit renders 9 sections', sections.length === 9, 'count=' + sections.length);
    check('T6.1b', 'Month edit renders 22 inputs', inputs.length === 22, 'count=' + inputs.length);

    window.location.hash = '#exercise-goals/2026/1';
    await sleep(700);
    var copyTopDiv = document.querySelector('.eg-month-edit-top');
    check('T6.2', 'January has no Copy Previous button', !copyTopDiv, 'element found when it should be absent');

    window.location.hash = '#exercise-goals/2026/3';
    await sleep(700);
    var firstInput = document.querySelector('.eg-month-field-input');
    if (firstInput) {
        firstInput.value = '195';
        firstInput.dispatchEvent(new Event('blur'));
        await sleep(500);
        check('T6.3', 'Month edit field saves on blur', _egMonths[3] && _egMonths[3].goalWeight === 195,
            'got=' + (_egMonths[3] ? _egMonths[3].goalWeight : 'null'));
    }

    // ── T7: Daily Metrics Color Wiring ──────────────────────────────────────────
    results.push('');
    results.push('── T7: Daily Metrics Color Wiring ──');

    window.location.hash = '#exercise-metrics';
    await sleep(1200);
    check('T7.1', 'Goals data loaded with metrics page', _dmGoalsData !== null, '_dmGoalsData is null');

    var mockT = {
        batteryYellow: 75, batteryBlue: 85,
        stepsYellow: 6000, stepsGreen: 12000, stepsBlue: 15000,
        burnGreen: 2800, burnBlue: 3100,
        foodYellow1: 1200, foodYellow2: 1700, foodBad: 2000,
        calLossYellow: 0, calLossGreen: 1500, calLossBlue: 2000
    };

    check('T7.2',  'Battery low → yellow',      _dmThresholdBg(70,    mockT, 'bodyBattery')   === '#fde68a', _dmThresholdBg(70, mockT, 'bodyBattery'));
    check('T7.3',  'Battery high → blue',        _dmThresholdBg(90,    mockT, 'bodyBattery')   === '#93c5fd', _dmThresholdBg(90, mockT, 'bodyBattery'));
    check('T7.4',  'Steps low → yellow',         _dmThresholdBg(4000,  mockT, 'dailySteps')    === '#fde68a', _dmThresholdBg(4000, mockT, 'dailySteps'));
    check('T7.5',  'Steps mid → green',          _dmThresholdBg(13000, mockT, 'dailySteps')    === '#86efac', _dmThresholdBg(13000, mockT, 'dailySteps'));
    check('T7.6',  'Steps high → blue',          _dmThresholdBg(16000, mockT, 'dailySteps')    === '#93c5fd', _dmThresholdBg(16000, mockT, 'dailySteps'));
    check('T7.7',  'Food below min → yellow',    _dmThresholdBg(800,   mockT, 'foodCalories')  === '#fde68a', _dmThresholdBg(800, mockT, 'foodCalories'));
    check('T7.8',  'Food over max → yellow',     _dmThresholdBg(1800,  mockT, 'foodCalories')  === '#fde68a', _dmThresholdBg(1800, mockT, 'foodCalories'));
    check('T7.9',  'Food bad day → light yellow', _dmThresholdBg(2100,  mockT, 'foodCalories') === '#fff2cc', _dmThresholdBg(2100, mockT, 'foodCalories'));
    check('T7.10', 'Cal loss green range',        _dmThresholdBg(1600,  mockT, 'calLoss')       === '#86efac', _dmThresholdBg(1600, mockT, 'calLoss'));
    check('T7.11', 'Cal loss → blue',             _dmThresholdBg(2200,  mockT, 'calLoss')       === '#93c5fd', _dmThresholdBg(2200, mockT, 'calLoss'));
    check('T7.12', 'No goals → no color',         _dmThresholdBg(1600,  null,  'calLoss')       === '',        _dmThresholdBg(1600, null, 'calLoss'));

    // ── Summary ────────────────────────────────────────────────────────────────
    results.push('');
    results.push('══════════════════════════════════');
    results.push('RESULT: ' + pass + ' passed, ' + fail + ' failed of ' + (pass + fail) + ' tests');
    results.push('══════════════════════════════════');

    console.log(results.join('\n'));
    return { pass: pass, fail: fail, total: pass + fail, results: results };
}
