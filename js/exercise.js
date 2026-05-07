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
                '<label class="ex-label" for="exDuration">Duration <span class="ex-field-note">(minutes)</span></label>' +
                '<input type="number" id="exDuration" class="ex-input-short" step="0.5" min="0" placeholder="e.g. 45.5" value="' + duration + '">' +
                '<p class="ex-hint" id="exDurationHint">' + _exFmtDurationHint(duration) + '</p>' +
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

// ─── Duration hint ────────────────────────────────────────────────────────────

/** Returns a friendly hint string for the duration field. */
function _exFmtDurationHint(val) {
    var n = parseFloat(val);
    if (isNaN(n) || val === '' || val == null) return 'Enter decimal minutes — e.g. 45.5';
    var formatted = exFmtDuration(n);
    return n + ' min = ' + formatted;
}

function _exUpdateDurationHint() {
    var hint = document.getElementById('exDurationHint');
    var durEl = document.getElementById('exDuration');
    if (!hint || !durEl) return;
    hint.textContent = _exFmtDurationHint(durEl.value);
}

// ─── Pace preview ─────────────────────────────────────────────────────────────

function _exUpdatePacePreview() {
    var previewEl = document.getElementById('exPacePreview');
    if (!previewEl) return;
    var milesEl = document.getElementById('exMiles');
    var durEl   = document.getElementById('exDuration');
    if (!milesEl || !durEl) { previewEl.textContent = '—'; return; }
    var miles = parseFloat(milesEl.value);
    var dur   = parseFloat(durEl.value);
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
        durationMinutes: durVal   !== '' ? parseFloat(durVal)   : null,
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
