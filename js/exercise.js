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
    { name: 'Other',           tracksMiles: false, withDogs: false },
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
    window.scrollTo(0, 0);
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
        '<a href="#exercise">Exercise</a><span class="separator">&rsaquo;</span><span>Activities</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + (window.appName || 'My Life') + '</a>';

    seedExerciseTypesIfNeeded();
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

        var line1 = document.createElement('div');
        line1.className = 'ex-card-line';
        [dateStr, typeName, dur].forEach(function(txt) {
            var span = document.createElement('span');
            span.textContent = txt;
            line1.appendChild(span);
        });
        card.appendChild(line1);

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

// ─── Activity detail / edit page ─────────────────────────────────────────────

async function loadExerciseActivityPage(id) {
    window.scrollTo(0, 0);
    seedExerciseTypesIfNeeded();

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
    var miles    = (existing && existing.miles != null) ? existing.miles : '';
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
                    '<input type="time" id="exActivityTime" value="' + time + '">' +
                '</div>' +
            '</div>' +

            // ── Duration ────────────────────────────────────────────────────
            '<div class="ex-form-group">' +
                '<label class="ex-label" for="exDuration">Duration</label>' +
                '<div class="ex-duration-row">' +
                    '<input type="text" inputmode="decimal" id="exDuration" class="ex-input-short" placeholder="e.g. 45:26 or 1:15:00" value="' + (duration !== '' ? exFmtDuration(duration) : '') + '">' +
                    '<span class="ex-duration-label" id="exDurationLabel">' + _exFmtDurationLabel(duration) + '</span>' +
                '</div>' +
                '<p class="ex-hint" id="exDurationHint">MM:SS &mdash; for over 1 hr use H:MM:SS (e.g. 1:15:00)</p>' +
            '</div>' +

            // ── Miles (conditional) ──────────────────────────────────────────
            '<div class="ex-form-group hidden" id="exMilesGroup">' +
                '<label class="ex-label" for="exMiles">Miles</label>' +
                '<input type="number" id="exMiles" class="ex-input-short" step="0.01" min="0" placeholder="e.g. 3.1" value="' + miles + '">' +
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
        _exRenderTypeDropdown(this.value);
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
    document.getElementById('exDuration').addEventListener('input', function() {
        _exUpdateDurationHint();
        _exUpdatePacePreview();
    });
    document.getElementById('exMiles') && document.getElementById('exMiles').addEventListener('input', _exUpdatePacePreview);

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
    var milesGroup  = document.getElementById('exMilesGroup');
    var paceGroup   = document.getElementById('exPaceGroup');
    var dogsGroup   = document.getElementById('exWithDogsGroup');
    if (milesGroup) milesGroup.classList.toggle('hidden', !type.tracksMiles);
    if (paceGroup)  paceGroup.classList.toggle('hidden', !type.tracksMiles);
    if (dogsGroup)  dogsGroup.classList.toggle('hidden', !type.withDogs);

    // Wire miles input listener now that it may be visible
    var milesInput = document.getElementById('exMiles');
    if (milesInput && !milesInput.dataset.listenerAttached) {
        milesInput.addEventListener('input', _exUpdatePacePreview);
        milesInput.dataset.listenerAttached = '1';
    }
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

// ─── Pace preview ─────────────────────────────────────────────────────────────

function _exUpdatePacePreview() {
    var previewEl = document.getElementById('exPacePreview');
    if (!previewEl) return;
    var milesEl = document.getElementById('exMiles');
    var durEl   = document.getElementById('exDuration');
    if (!milesEl || !durEl) { previewEl.textContent = '—'; return; }
    var miles = parseFloat(milesEl.value);
    var dur   = _exParseDuration(durEl.value);
    previewEl.textContent = (miles > 0 && dur > 0) ? exFmtPace(miles, dur) : '—';
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

    var type     = _exSelectedType || {};
    var durVal   = document.getElementById('exDuration').value;
    var milesEl  = document.getElementById('exMiles');
    var milesVal = (type.tracksMiles && milesEl) ? milesEl.value : '';
    var dogsEl   = document.getElementById('exWithDogs');
    var dogsVal  = (type.withDogs && dogsEl) ? dogsEl.checked : null;
    var calVal   = document.getElementById('exCalories').value;
    var noteVal  = document.getElementById('exComment').value.trim();

    var data = {
        typeId:          _exSelectedTypeId,
        activityDate:    date + 'T' + time + ':00',
        durationMinutes: _exParseDuration(durVal),
        miles:           milesVal !== '' ? parseFloat(milesVal) : null,
        withDogs:        dogsVal,
        calories:        calVal   !== '' ? parseInt(calVal, 10) : null,
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

    seedExerciseTypesIfNeeded();
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

// ═══════════════════════════════════════════════════════════════════════════════
// DAILY METRICS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Module-level state ──────────────────────────────────────────────────────

var _dmDefsAll     = [];            // non-archived metric defs, sorted by sortOrder (used by Manage Metrics)
var _dmMetricDefs  = [];            // same data, used by list + entry form
var _dmRangeFilter = 'thisMonth';   // always reset on page load — not persisted
var _dmCustomStart = '';
var _dmCustomEnd   = '';
var _dmEditDate    = null;          // null = new entry; 'YYYY-MM-DD' = editing existing
var _dmExistingDoc = null;          // loaded doc data or null

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

    _dmRangeFilter = 'thisMonth';
    _dmCustomStart = '';
    _dmCustomEnd   = '';

    await seedExerciseMetricDefsIfNeeded();

    var snap = await userCol('exerciseMetricDefs').get();
    _dmMetricDefs = snap.docs
        .map(function(d) { return Object.assign({ id: d.id }, d.data()); })
        .filter(function(d) { return !d.archived; })
        .sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });

    _dmRenderMetricsPage(el);
}

function _dmRenderMetricsPage(el) {
    var today = new Date();
    var thisYear = today.getFullYear();
    var thisMonth = today.getMonth(); // 0-based
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    // Build <select> options
    var opts = '';
    var ranges = [
        ['lastWeek','Last Week'], ['thisWeek','This Week'], ['thisMonth','This Month'],
        ['lastMonth','Last Month'], ['thisYear','This Year'], ['lastYear','Last Year']
    ];
    ranges.forEach(function(r) {
        var sel = _dmRangeFilter === r[0] ? ' selected' : '';
        opts += '<option value="' + r[0] + '"' + sel + '>' + r[1] + '</option>';
    });
    opts += '<optgroup label="─────────────────"></optgroup>';
    for (var m = 0; m < 12; m++) {
        var isLastYear = (m > thisMonth);
        var yr = isLastYear ? thisYear - 1 : thisYear;
        var key = 'month-' + m + '-' + yr;
        var label = monthNames[m] + (isLastYear ? ' \'' + String(yr).slice(2) : '');
        var sel2 = _dmRangeFilter === key ? ' selected' : '';
        opts += '<option value="' + key + '"' + sel2 + '>' + label + '</option>';
    }
    opts += '<optgroup label="─────────────────"></optgroup>';
    var customSel = _dmRangeFilter === 'custom' ? ' selected' : '';
    opts += '<option value="custom"' + customSel + '>Custom…</option>';

    var customDisplay = _dmRangeFilter === 'custom' ? 'flex' : 'none';

    el.innerHTML =
        '<div class="dm-list-header">' +
            '<h2>Daily Metrics</h2>' +
            '<div class="dm-list-actions">' +
                '<a href="#exercise-metric-defs" class="ex-link-btn">Manage Metrics</a>' +
                '<a href="#exercise-metric/new" class="btn-primary dm-entry-btn">+ Entry</a>' +
            '</div>' +
        '</div>' +
        '<div class="dm-filter-bar">' +
            '<select id="dmFilterSelect" class="dm-filter-select">' + opts + '</select>' +
            '<div class="dm-custom-row" id="dmCustomRow" style="display:' + customDisplay + '">' +
                '<input type="date" id="dmCustomStart" class="dm-date-input" value="' + _exEsc(_dmCustomStart) + '"> – ' +
                '<input type="date" id="dmCustomEnd" class="dm-date-input" value="' + _exEsc(_dmCustomEnd) + '">' +
                '<button id="dmCustomLoad" class="ex-action-btn">Load</button>' +
            '</div>' +
        '</div>' +
        '<div class="dm-records-label" id="dmRecordsLabel">Loading…</div>' +
        '<div id="dmListContent"><p class="ex-status">Loading…</p></div>';

    document.getElementById('dmFilterSelect').addEventListener('change', function() {
        _dmRangeFilter = this.value;
        var customRow = document.getElementById('dmCustomRow');
        if (_dmRangeFilter === 'custom') {
            customRow.style.display = 'flex';
        } else {
            customRow.style.display = 'none';
            _dmApplyFilter();
        }
    });

    document.getElementById('dmCustomLoad').addEventListener('click', function() {
        _dmCustomStart = document.getElementById('dmCustomStart').value;
        _dmCustomEnd   = document.getElementById('dmCustomEnd').value;
        if (!_dmCustomStart || !_dmCustomEnd) { alert('Please select both a start and end date.'); return; }
        _dmApplyFilter();
    });

    _dmApplyFilter();
}

function _dmGetDateRange(filter) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var y = today.getFullYear(), m = today.getMonth(), d = today.getDate();

    function fmt(dt) {
        var mm = dt.getMonth() + 1, dd = dt.getDate();
        return dt.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
    }

    if (filter === 'thisMonth') {
        return { start: y + '-' + (m < 9 ? '0' : '') + (m + 1) + '-01', end: fmt(today) };
    }
    if (filter === 'lastMonth') {
        var lm = new Date(y, m, 0); // last day of prev month
        var fm = new Date(y, m - 1, 1);
        return { start: fmt(fm), end: fmt(lm) };
    }
    if (filter === 'thisWeek') {
        var dow = today.getDay(); // 0=Sun
        var mon = new Date(today); mon.setDate(d - ((dow + 6) % 7));
        return { start: fmt(mon), end: fmt(today) };
    }
    if (filter === 'lastWeek') {
        var dow2 = today.getDay();
        var thisMonday = new Date(today); thisMonday.setDate(d - ((dow2 + 6) % 7));
        var lastMon = new Date(thisMonday); lastMon.setDate(thisMonday.getDate() - 7);
        var lastSun = new Date(thisMonday); lastSun.setDate(thisMonday.getDate() - 1);
        return { start: fmt(lastMon), end: fmt(lastSun) };
    }
    if (filter === 'thisYear') {
        return { start: y + '-01-01', end: fmt(today) };
    }
    if (filter === 'lastYear') {
        return { start: (y - 1) + '-01-01', end: (y - 1) + '-12-31' };
    }
    // Month shortcut: 'month-M-YYYY' (M is 0-based)
    var monthMatch = filter.match(/^month-(\d+)-(\d+)$/);
    if (monthMatch) {
        var mm2 = parseInt(monthMatch[1], 10);
        var yy2 = parseInt(monthMatch[2], 10);
        var firstDay = new Date(yy2, mm2, 1);
        var lastDay = new Date(yy2, mm2 + 1, 0);
        return { start: fmt(firstDay), end: fmt(lastDay) };
    }
    // Custom
    return { start: _dmCustomStart, end: _dmCustomEnd };
}

async function _dmApplyFilter() {
    var listEl = document.getElementById('dmListContent');
    var labelEl = document.getElementById('dmRecordsLabel');
    if (!listEl) return;
    listEl.innerHTML = '<p class="ex-status">Loading…</p>';

    var range = _dmGetDateRange(_dmRangeFilter);
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
        .filter(function(r) {
            return r.date >= range.start && r.date <= range.end;
        });

    if (labelEl) labelEl.textContent = records.length + ' record' + (records.length === 1 ? '' : 's');

    if (records.length === 0) {
        listEl.innerHTML = '<p class="ex-status">No entries for this period.</p>';
        return;
    }

    // Compute summary values
    var summary = _dmComputeSummary(records);

    // Detect desktop vs mobile
    var isDesktop = window.innerWidth >= 700;
    listEl.innerHTML = isDesktop
        ? _dmBuildTable(records, summary)
        : _dmBuildCards(records);

    // Wire card/row clicks
    listEl.querySelectorAll('[data-date]').forEach(function(el) {
        el.addEventListener('click', function(e) {
            if (e.target.closest('.dm-note-icon')) return; // let note icon handle it
            window.location.hash = 'exercise-metric/' + el.dataset.date;
        });
    });

    // Wire note icon taps (mobile overlay)
    listEl.querySelectorAll('.dm-note-icon[data-note]').forEach(function(icon) {
        icon.addEventListener('click', function(e) {
            e.stopPropagation();
            _dmShowNoteOverlay(icon, icon.dataset.note);
        });
    });
}

function _dmComputeSummary(records) {
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

    result.custom = {};
    _dmMetricDefs.forEach(function(def) {
        if (def.type === 'boolean') {
            result.custom[def.id] = customTrueCounts[def.id] + ' / ' + n;
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

function _dmBuildTable(records, summary) {
    // Split around the computed +/- Diff column (inserted between Burn and Food Cal.)
    var preDiffCols = [
        { key: 'weight',       label: 'Weight' },
        { key: 'sleepScore',   label: 'Sleep' },
        { key: 'bodyBattery',  label: 'Body Bat.' },
        { key: 'dailySteps',   label: 'Steps' },
        { key: 'totalBurn',    label: 'Burn' }
    ];
    var postDiffCols = [
        { key: 'foodCalories', label: 'Food Cal.' }
    ];

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
    thead += '<td>—</td>'; // +/- Diff summary
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
        thead += '<th' + cls + '>' + _exEsc(def.name) + '</th>';
    });
    thead += '</tr></thead>';

    // Body
    var tbody = '<tbody>';
    records.forEach(function(r) {
        tbody += '<tr class="dm-data-row" data-date="' + _exEsc(r.date) + '">';
        tbody += '<td class="dm-date-cell">' + _exEsc(_dmFmtDate(r.date)) + '</td>';
        preDiffCols.forEach(function(c) {
            var v = (r[c.key] !== null && r[c.key] !== undefined && r[c.key] !== '') ? r[c.key] : '—';
            if (typeof v === 'number') v = v.toLocaleString();
            var note = r.notes && r.notes[c.key] ? r.notes[c.key] : '';
            tbody += '<td class="dm-col-num">' + _exEsc(String(v)) + _dmNoteIcon(note, true) + '</td>';
        });
        // +/- Diff: burn - food; yellow bg when negative (ate more than burned)
        var burnVal = (r.totalBurn !== null && r.totalBurn !== undefined && r.totalBurn !== '') ? parseFloat(r.totalBurn) : null;
        var foodVal = (r.foodCalories !== null && r.foodCalories !== undefined && r.foodCalories !== '') ? parseFloat(r.foodCalories) : null;
        if (burnVal !== null && foodVal !== null) {
            var diff = burnVal - foodVal;
            if (diff < 0) {
                tbody += '<td class="dm-col-num" style="background-color:#ffeb3b;color:#000">' + diff.toLocaleString() + '</td>';
            } else {
                tbody += '<td class="dm-col-num">—</td>';
            }
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

function _dmBuildCards(records) {
    var stdLabels = [
        { key: 'weight',       label: 'Wt' },
        { key: 'sleepScore',   label: 'Sleep' },
        { key: 'bodyBattery',  label: 'Bat' },
        { key: 'dailySteps',   label: 'Steps' },
        { key: 'totalBurn',    label: 'Burn' },
        { key: 'foodCalories', label: 'Food' }
    ];

    return records.map(function(r) {
        // Standard metrics — 2 rows of 3
        var stdLine1 = '', stdLine2 = '';
        stdLabels.slice(0, 3).forEach(function(c) {
            var v = (r[c.key] !== null && r[c.key] !== undefined && r[c.key] !== '') ? r[c.key] : '—';
            var note = r.notes && r.notes[c.key] ? r.notes[c.key] : '';
            stdLine1 += '<span class="dm-card-metric"><span class="dm-card-label">' + c.label + '</span> ' + _exEsc(String(v)) + _dmNoteIcon(note, false) + '</span>';
        });
        // Row 2: Steps, Burn, +/-Diff (yellow when negative), Food
        stdLabels.slice(3, 5).forEach(function(c) {
            var v = (r[c.key] !== null && r[c.key] !== undefined && r[c.key] !== '') ? r[c.key] : '—';
            var note = r.notes && r.notes[c.key] ? r.notes[c.key] : '';
            stdLine2 += '<span class="dm-card-metric"><span class="dm-card-label">' + c.label + '</span> ' + _exEsc(String(v)) + _dmNoteIcon(note, false) + '</span>';
        });
        var cardBurn = (r.totalBurn !== null && r.totalBurn !== undefined && r.totalBurn !== '') ? parseFloat(r.totalBurn) : null;
        var cardFood = (r.foodCalories !== null && r.foodCalories !== undefined && r.foodCalories !== '') ? parseFloat(r.foodCalories) : null;
        if (cardBurn !== null && cardFood !== null && cardBurn - cardFood < 0) {
            var cardDiff = cardBurn - cardFood;
            stdLine2 += '<span class="dm-card-metric" style="background-color:#ffeb3b;color:#000;padding:0 3px;border-radius:2px"><span class="dm-card-label" style="color:#555">Diff</span> ' + cardDiff.toLocaleString() + '</span>';
        } else {
            stdLine2 += '<span class="dm-card-metric"><span class="dm-card-label">Diff</span> —</span>';
        }
        var foodV = (r.foodCalories !== null && r.foodCalories !== undefined && r.foodCalories !== '') ? r.foodCalories : '—';
        var foodNote = r.notes && r.notes.foodCalories ? r.notes.foodCalories : '';
        stdLine2 += '<span class="dm-card-metric"><span class="dm-card-label">Food</span> ' + _exEsc(String(foodV)) + _dmNoteIcon(foodNote, false) + '</span>';

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
        var val     = cv[def.id] !== undefined ? cv[def.id] : '';
        var noteVal = notes[def.id] || '';
        var hasNote = noteVal.length > 0;

        // Text fields: the textarea IS the note — no separate toggle or note area
        if (def.type === 'text') {
            return '<div class="dm-entry-group dm-entry-group--text">' +
                '<label class="ex-label" for="dmf-' + def.id + '">' + _exEsc(def.name) + '</label>' +
                '<textarea id="dmf-' + def.id + '" class="dm-text-field" rows="4" ' +
                    'placeholder="…">' + _exEsc(val !== '' ? String(val) : '') + '</textarea>' +
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
                'class="dm-entry-input" value="' + _exEsc(val !== '' ? String(val) : '') + '" autocomplete="off">' +
                (def.unitLabel ? '<span class="dm-entry-unit">' + _exEsc(def.unitLabel) + '</span>' : '');
        }
        return '<div class="dm-entry-group">' +
            '<div class="dm-entry-field-row">' +
                '<label class="ex-label" for="dmf-' + def.id + '">' + _exEsc(def.name) + '</label>' +
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

    el.innerHTML =
        '<div class="ex-form">' +
            '<div class="dm-entry-group">' +
                '<label class="ex-label" for="dmfDate">Date</label>' +
                '<input type="date" id="dmfDate" class="dm-entry-input" value="' + _exEsc(dateVal) + '">' +
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

    // Wire date change — auto-load existing record for that date
    document.getElementById('dmfDate').addEventListener('change', async function() {
        var newDate = this.value;
        if (!newDate) return;
        var docSnap = await userCol('exerciseDailyMetrics').doc(newDate).get();
        _dmEditDate    = newDate;
        _dmExistingDoc = docSnap.exists ? docSnap.data() : null;
        _dmUpdateBreadcrumb();
        _dmBuildEntryForm(el);
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
            sortOrder:    maxOrder + 1,
            archived:     false,
            createdAt:    firebase.firestore.FieldValue.serverTimestamp()
        });

        _dmDefsAll.push({ id: ref.id, name: name, type: type, allowDecimal: allowDecimal,
                          unitLabel: unitLabel, sortOrder: maxOrder + 1, archived: false });
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

    var saveBtn = document.querySelector('#dmDefRow-' + defId + ' .btn-primary');
    if (saveBtn) { saveBtn.textContent = 'Saving…'; saveBtn.disabled = true; }

    try {
        var updates = { name: newName };
        if (def.type === 'number') { updates.allowDecimal = allowDecimal; updates.unitLabel = unitLabel; }

        await userCol('exerciseMetricDefs').doc(defId).update(updates);

        def.name = newName;
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
