// ============================================================
// bucketlist.js — Bucket List: places, trails, events you want to visit
//
// Firestore collection: userCol('bucketList')
// Plan document: saveplacesPlan.md
//
// Document shape:
//   name, kind, why, notes, tags[]
//   geo    : { country, countryCode, region, city, venue, address, lat, lng, precision }
//   timing : { type: none|months|date|range, months[], season, startDate, endDate, yearly, label }
//   website, links[{url,label}]
//   status : want | planned | visited | dismissed
//   priority: 1 = high, 2 = medium, 3 = low
//   visitedDate (ISO), source, createdAt, updatedAt
//
// Photos and facts reuse the shared photos.js / facts.js with targetType 'bucketItem'.
//
// Routes: #bucketlist (list), #bucketitem/{id} (detail)
// ============================================================

// ---------- Constants ----------

var BL_KINDS = {
    country   : { icon: '🌍', label: 'Country' },
    region    : { icon: '🗺️', label: 'Region / State' },
    town      : { icon: '🏘️', label: 'Town / City' },
    park      : { icon: '🌲', label: 'Park / Nature' },
    trail     : { icon: '🥾', label: 'Trail / Hike' },
    waterfall : { icon: '💦', label: 'Waterfall' },
    scenic    : { icon: '📸', label: 'Scenic Spot' },
    bar       : { icon: '🍺', label: 'Bar / Brewery' },
    restaurant: { icon: '🍽️', label: 'Restaurant' },
    event     : { icon: '🎉', label: 'Event' },
    other     : { icon: '📍', label: 'Other' }
};

var BL_STATUSES = {
    want     : 'Want',
    planned  : 'Planned',
    visited  : 'Visited',
    dismissed: 'Dismissed'
};

var BL_PRIORITIES = { 1: 'High', 2: 'Medium', 3: 'Low' };

var BL_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Season → months. Winter wraps the year end.
var BL_SEASONS = {
    spring: [3, 4, 5],
    summer: [6, 7, 8],
    fall  : [9, 10, 11],
    winter: [12, 1, 2]
};

// ---------- Module state ----------

var _blItems       = [];     // all loaded items: [{ id, data }]
var _blEditId      = null;   // id being edited (null = add mode)
var _blModalGeo    = null;   // geo object being built in the modal (lat/lng/countryCode etc.)
var _blDetailMap   = null;   // Leaflet map on the detail page
var _blSearchResults = [];   // location search results shown in the modal

// Current list filters. status 'active' = Want + Planned.
var _blFilters = { text: '', status: 'active', kind: '', priority: '', month: '', country: '', sort: 'priority' };

// ============================================================
// Small helpers
// ============================================================

/** Today as an ISO date string (yyyy-mm-dd) in local time. */
function _blTodayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** Split an ISO date into numbers without timezone surprises. Returns {y, m, d} or null. */
function _blParseIso(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    var p = iso.split('-');
    return { y: parseInt(p[0], 10), m: parseInt(p[1], 10), d: parseInt(p[2], 10) };
}

/** "Nov 28" or "Nov 28, 2026". */
function _blFmtDate(iso, withYear) {
    var p = _blParseIso(iso);
    if (!p) return '';
    return BL_MONTH_NAMES[p.m - 1] + ' ' + p.d + (withYear ? ', ' + p.y : '');
}

/**
 * Format a month list compactly: [5] → "May", [10,11] → "Oct–Nov",
 * [12,1,2] → "Dec–Feb", [3,7] → "Mar, Jul".
 */
function _blFmtMonths(months) {
    var set = {};
    (months || []).forEach(function(m) { set[m] = true; });
    var sorted = Object.keys(set).map(Number).sort(function(a, b) { return a - b; });
    if (sorted.length === 0) return '';
    if (sorted.length === 12) return 'Year-round';

    // Build runs of consecutive months
    var runs = [];
    sorted.forEach(function(m) {
        var last = runs[runs.length - 1];
        if (last && last[last.length - 1] === m - 1) last.push(m);
        else runs.push([m]);
    });
    // A run ending in Dec and another starting in Jan are really one run (wraps the year)
    if (runs.length > 1 && runs[0][0] === 1 && runs[runs.length - 1][runs[runs.length - 1].length - 1] === 12) {
        var tail = runs.pop();
        runs[0] = tail.concat(runs[0]);
    }
    return runs.map(function(r) {
        var first = BL_MONTH_NAMES[r[0] - 1];
        return r.length === 1 ? first : first + '–' + BL_MONTH_NAMES[r[r.length - 1] - 1];
    }).join(', ');
}

/** Months (1-12) an item is "good" in. Used by the Month filter. */
function _blMonthsOf(timing) {
    if (!timing) return [];
    if (timing.type === 'months') return timing.months || [];
    var s = _blParseIso(timing.startDate);
    if (timing.type === 'date') return s ? [s.m] : [];
    if (timing.type === 'range') {
        var e = _blParseIso(timing.endDate);
        if (!s) return [];
        if (!e) return [s.m];
        var out = [];
        var m = s.m;
        for (var i = 0; i < 12; i++) {
            out.push(m);
            if (m === e.m) break;
            m = (m % 12) + 1;
        }
        return out;
    }
    return [];
}

/** Human-readable timing text for cards and detail ("May", "Nov 28 – Jan 1 · yearly"). */
function _blTimingText(timing) {
    if (!timing || timing.type === 'none' || !timing.type) return '';
    var text = '';
    if (timing.type === 'months') {
        text = _blFmtMonths(timing.months);
    } else if (timing.type === 'date') {
        text = _blFmtDate(timing.startDate, !timing.yearly);
    } else if (timing.type === 'range') {
        text = _blFmtDate(timing.startDate, !timing.yearly) + ' – ' + _blFmtDate(timing.endDate, !timing.yearly);
    }
    if (timing.yearly && (timing.type === 'date' || timing.type === 'range')) text += ' (yearly)';
    if (timing.label) text += text ? ' · ' + timing.label : timing.label;
    return text;
}

/** True when a one-off dated item is in the past. Yearly and month-based items never expire. */
function _blIsExpired(data) {
    var t = data.timing;
    if (!t || t.yearly) return false;
    var cutoff = t.type === 'range' ? t.endDate : (t.type === 'date' ? t.startDate : null);
    if (!cutoff) return false;
    return cutoff < _blTodayIso();
}

/** "Dublin, Ireland" style location line from the geo block. */
function _blLocationText(geo) {
    if (!geo) return '';
    var parts = [];
    if (geo.venue) parts.push(geo.venue);
    if (geo.city) parts.push(geo.city);
    if (geo.region && geo.region !== geo.city) parts.push(geo.region);
    if (geo.country) parts.push(geo.country);
    return parts.join(', ');
}

/** Add https:// to a URL typed without a scheme. Returns '' for blank input. */
function _blNormalizeUrl(url) {
    url = (url || '').trim();
    if (!url) return '';
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : 'https://' + url;
}

/** Work out how precise a location is from which geo fields are filled in. */
function _blPrecision(geo) {
    if (geo.lat != null && geo.lng != null) return 'exact';
    if (geo.city) return 'city';
    if (geo.region) return 'region';
    if (geo.country) return 'country';
    return null;
}

// ============================================================
// List page
// ============================================================

/** Called by app.js when routing to #bucketlist. */
async function loadBucketListPage() {
    var container  = document.getElementById('blListContainer');
    var emptyState = document.getElementById('blEmptyState');

    container.innerHTML = '';
    emptyState.textContent = 'Loading...';
    emptyState.classList.remove('hidden');

    _blWireListControls();

    try {
        var snap = await userCol('bucketList').get();
        _blItems = [];
        snap.forEach(function(doc) { _blItems.push({ id: doc.id, data: doc.data() }); });
        _blRebuildCountryOptions();
        _blRenderList();
    } catch (err) {
        console.error('Error loading bucket list:', err);
        emptyState.textContent = 'Error loading bucket list.';
    }
}

/** Hook up the Add button, search box and filter dropdowns (safe to call repeatedly). */
function _blWireListControls() {
    document.getElementById('blAddBtn').onclick = function() { _blOpenModal(null, null); };

    var search = document.getElementById('blSearchInput');
    search.value = _blFilters.text;
    search.oninput = function() { _blFilters.text = search.value.trim().toLowerCase(); _blRenderList(); };

    var map = {
        blStatusFilter  : 'status',
        blKindFilter    : 'kind',
        blPriorityFilter: 'priority',
        blMonthFilter   : 'month',
        blCountryFilter : 'country',
        blSortSelect    : 'sort'
    };
    Object.keys(map).forEach(function(id) {
        var el = document.getElementById(id);
        el.value = _blFilters[map[id]];
        el.onchange = function() { _blFilters[map[id]] = el.value; _blRenderList(); };
    });
}

/** Fill the Country filter from the countries present in the data. */
function _blRebuildCountryOptions() {
    var sel = document.getElementById('blCountryFilter');
    var seen = {};
    _blItems.forEach(function(it) {
        var c = it.data.geo && it.data.geo.country;
        if (c) seen[c] = true;
    });
    var countries = Object.keys(seen).sort(function(a, b) { return a.localeCompare(b); });
    sel.innerHTML = '<option value="">All countries</option>' +
        countries.map(function(c) { return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>'; }).join('');
    // If the remembered country no longer exists, reset it
    if (_blFilters.country && !seen[_blFilters.country]) _blFilters.country = '';
    sel.value = _blFilters.country;
}

/** Does this item pass the current filters? */
function _blMatches(data) {
    var f = _blFilters;
    var status = data.status || 'want';

    if (f.status === 'active') {
        if (status !== 'want' && status !== 'planned') return false;
    } else if (f.status !== 'all' && status !== f.status) {
        return false;
    }
    if (f.kind && data.kind !== f.kind) return false;
    if (f.priority && String(data.priority || 2) !== f.priority) return false;
    if (f.country && !(data.geo && data.geo.country === f.country)) return false;
    if (f.month && _blMonthsOf(data.timing).indexOf(parseInt(f.month, 10)) === -1) return false;

    if (f.text) {
        var hay = [
            data.name, data.why, data.notes, (data.tags || []).join(' '), _blLocationText(data.geo),
            _blTimingText(data.timing)
        ].join(' ').toLowerCase();
        if (hay.indexOf(f.text) === -1) return false;
    }
    return true;
}

/** Filter, sort and draw the list. */
function _blRenderList() {
    var container  = document.getElementById('blListContainer');
    var emptyState = document.getElementById('blEmptyState');
    var countEl    = document.getElementById('blCountLine');

    var shown = _blItems.filter(function(it) { return _blMatches(it.data); });

    shown.sort(function(a, b) {
        if (_blFilters.sort === 'name') return (a.data.name || '').localeCompare(b.data.name || '');
        if (_blFilters.sort === 'newest') return _blCreatedMs(b.data) - _blCreatedMs(a.data);
        // Default: priority (High first), then name
        var pa = a.data.priority || 2, pb = b.data.priority || 2;
        if (pa !== pb) return pa - pb;
        return (a.data.name || '').localeCompare(b.data.name || '');
    });

    container.innerHTML = '';
    countEl.textContent = _blItems.length ? (shown.length + ' of ' + _blItems.length + ' items') : '';

    if (shown.length === 0) {
        emptyState.textContent = _blItems.length === 0
            ? 'Nothing on your bucket list yet. Tap + Add to save your first place.'
            : 'No items match these filters.';
        emptyState.classList.remove('hidden');
        return;
    }
    emptyState.classList.add('hidden');
    shown.forEach(function(it) { container.appendChild(_blRenderCard(it.id, it.data)); });
}

/** createdAt as milliseconds (Firestore Timestamp or missing). */
function _blCreatedMs(data) {
    return (data.createdAt && data.createdAt.toMillis) ? data.createdAt.toMillis() : 0;
}

/** Build the small badge row shown on cards and detail pages (left-aligned). */
function _blBadgesHtml(data) {
    var badges = [];
    var status = data.status || 'want';
    if (status !== 'want') badges.push('<span class="bl-badge bl-badge--' + status + '">' + escapeHtml(BL_STATUSES[status] || status) + '</span>');
    var pr = data.priority || 2;
    badges.push('<span class="bl-badge bl-badge--p' + pr + '">' + escapeHtml(BL_PRIORITIES[pr]) + '</span>');
    if ((status === 'want' || status === 'planned') && _blIsExpired(data)) {
        badges.push('<span class="bl-badge bl-badge--expired">Expired</span>');
    }
    return badges.join('');
}

/** One list card. */
function _blRenderCard(id, data) {
    var kind = BL_KINDS[data.kind] || BL_KINDS.other;
    var row = document.createElement('div');
    row.className = 'card-list-item bl-card';

    var main = document.createElement('div');
    main.className = 'bl-card-main';
    main.style.cursor = 'pointer';
    main.onclick = function() { window.location.hash = '#bucketitem/' + id; };

    var loc = _blLocationText(data.geo);
    var timing = _blTimingText(data.timing);

    main.innerHTML =
        '<div class="bl-card-name">' + kind.icon + ' ' + escapeHtml(data.name || '(unnamed)') + '</div>' +
        '<div class="bl-badges">' + _blBadgesHtml(data) + '</div>' +
        (loc    ? '<div class="bl-card-sub">📍 ' + escapeHtml(loc) + '</div>' : '') +
        (timing ? '<div class="bl-card-sub">🗓️ ' + escapeHtml(timing) + '</div>' : '') +
        (data.why ? '<div class="bl-card-why">' + escapeHtml(data.why) + '</div>' : '');

    var editBtn = document.createElement('button');
    editBtn.className = 'btn btn-secondary btn-small';
    editBtn.textContent = 'Edit';
    editBtn.onclick = function(e) { e.stopPropagation(); _blOpenModal(id, data); };

    row.appendChild(main);
    row.appendChild(editBtn);
    return row;
}

// ============================================================
// Detail page
// ============================================================

/** Called by app.js when routing to #bucketitem/{id}. */
async function loadBucketItemPage(itemId) {
    var nameEl   = document.getElementById('blDetailName');
    var infoEl   = document.getElementById('blDetailInfo');
    var mapWrap  = document.getElementById('blDetailMapWrap');
    var actionEl = document.getElementById('blDetailActions');

    nameEl.textContent = 'Loading...';
    infoEl.innerHTML = '';
    actionEl.innerHTML = '';
    _blSetBreadcrumb(null);

    if (_blDetailMap) { _blDetailMap.remove(); _blDetailMap = null; }
    mapWrap.classList.add('hidden');

    document.getElementById('blDetailBackBtn').onclick = function() { window.location.hash = '#bucketlist'; };

    try {
        var doc = await userCol('bucketList').doc(itemId).get();
        if (!doc.exists) { nameEl.textContent = 'Item not found'; return; }

        var data = doc.data();
        window.currentBucketItem = { id: itemId, ...data };   // global for photo/fact buttons
        var kind = BL_KINDS[data.kind] || BL_KINDS.other;

        nameEl.textContent = kind.icon + ' ' + (data.name || '(unnamed)');
        _blSetBreadcrumb(data.name || '(unnamed)');
        document.getElementById('blDetailEditBtn').onclick = function() { _blOpenModal(itemId, data); };

        // ── Status quick actions ─────────────────────────────────
        var status = data.status || 'want';
        if (status !== 'visited') actionEl.appendChild(_blStatusButton(itemId, 'visited', '✅ Mark Visited', true));
        if (status === 'want')    actionEl.appendChild(_blStatusButton(itemId, 'planned', '📅 Mark Planned'));
        if (status !== 'want' && status !== 'planned') actionEl.appendChild(_blStatusButton(itemId, 'want', '↩ Back to Want'));
        if (status !== 'dismissed') actionEl.appendChild(_blStatusButton(itemId, 'dismissed', 'Dismiss'));

        // ── Info table ───────────────────────────────────────────
        var geo = data.geo || {};
        var rows = [];
        rows.push({ label: 'Status', html: _blBadgesHtml(data) + (data.visitedDate ? ' <span class="bl-visited-date">on ' + escapeHtml(_blFmtDate(data.visitedDate, true)) + '</span>' : '') });
        rows.push({ label: 'Type', text: kind.label });
        var loc = _blLocationText(geo);
        if (loc) rows.push({ label: 'Where', text: loc });
        if (geo.address) rows.push({ label: 'Address', text: geo.address });
        var timing = _blTimingText(data.timing);
        if (timing) rows.push({ label: 'When', text: timing });
        if (data.why)   rows.push({ label: 'Why', text: data.why });
        if (data.notes) rows.push({ label: 'Notes', text: data.notes, pre: true });
        if (data.tags && data.tags.length) rows.push({ label: 'Tags', text: data.tags.join(', ') });
        if (data.website) rows.push({ label: 'Website', link: { url: data.website, label: data.website } });
        (data.links || []).forEach(function(l, i) {
            rows.push({ label: i === 0 ? 'Links' : '', link: { url: l.url, label: l.label || l.url } });
        });
        if (geo.lat != null && geo.lng != null) {
            rows.push({ label: 'Coordinates', html:
                escapeHtml(Number(geo.lat).toFixed(5) + ', ' + Number(geo.lng).toFixed(5)) +
                ' &nbsp;<a href="https://www.google.com/maps?q=' + encodeURIComponent(geo.lat + ',' + geo.lng) +
                '" target="_blank" rel="noopener">Open in Maps</a>' });
        }

        var table = document.createElement('div');
        table.className = 'place-detail-table';
        rows.forEach(function(r) {
            var row = document.createElement('div');
            row.className = 'place-detail-row';
            var label = document.createElement('span');
            label.className = 'place-detail-label';
            label.textContent = r.label;
            var value = document.createElement('span');
            value.className = 'place-detail-value';
            if (r.html !== undefined) value.innerHTML = r.html;
            else if (r.link) {
                var a = document.createElement('a');
                a.href = r.link.url; a.target = '_blank'; a.rel = 'noopener';
                a.textContent = r.link.label;
                value.appendChild(a);
            } else {
                value.textContent = r.text;
                if (r.pre) value.style.whiteSpace = 'pre-wrap';
            }
            row.appendChild(label);
            row.appendChild(value);
            table.appendChild(row);
        });
        infoEl.appendChild(table);

        // ── Leaflet map ──────────────────────────────────────────
        if (geo.lat != null && geo.lng != null && typeof L !== 'undefined') {
            mapWrap.classList.remove('hidden');
            setTimeout(function() {
                _blDetailMap = L.map('blDetailMap').setView([geo.lat, geo.lng], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                }).addTo(_blDetailMap);
                L.marker([geo.lat, geo.lng]).addTo(_blDetailMap);
                _blDetailMap.invalidateSize();
            }, 50);
        }

        // ── Facts & photos (shared modules) ──────────────────────
        loadFacts('bucketItem', itemId, 'blFactsContainer', 'blFactsEmptyState');
        loadPhotos('bucketItem', itemId, 'blPhotoContainer', 'blPhotoEmptyState');

    } catch (err) {
        console.error('Error loading bucket item:', err);
        nameEl.textContent = 'Error loading item';
    }
}

/** Breadcrumb: Bucket List › {name}. */
function _blSetBreadcrumb(name) {
    var crumb = document.getElementById('breadcrumbBar');
    if (!crumb) return;
    crumb.innerHTML =
        '<a href="#bucketlist">Bucket List</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<span>' + escapeHtml(name || 'Item') + '</span>';
}

/** Detail-page button that sets the item's status. */
function _blStatusButton(itemId, newStatus, label, primary) {
    var btn = document.createElement('button');
    btn.className = 'btn btn-small ' + (primary ? 'btn-primary' : 'btn-secondary');
    btn.textContent = label;
    btn.onclick = async function() {
        var update = { status: newStatus, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        if (newStatus === 'visited') update.visitedDate = _blTodayIso();
        try {
            await userCol('bucketList').doc(itemId).update(update);
            loadBucketItemPage(itemId);
        } catch (err) {
            console.error('Error updating status:', err);
            alert('Error updating status — please try again.');
        }
    };
    return btn;
}

// ============================================================
// Add / Edit modal
// ============================================================

/** Open the modal in add mode (id null) or edit mode. */
function _blOpenModal(id, data) {
    _blEditId = id;
    data = data || {};
    var geo = data.geo || {};
    var timing = data.timing || { type: 'none', months: [], yearly: false };

    document.getElementById('blModalTitle').textContent = id ? 'Edit Bucket List Item' : 'Add to Bucket List';
    document.getElementById('blModalDeleteBtn').style.display = id ? '' : 'none';

    document.getElementById('blNameInput').value = data.name || '';
    document.getElementById('blKindSelect').value = data.kind || 'other';
    document.getElementById('blStatusSelect').value = data.status || 'want';
    document.getElementById('blPrioritySelect').value = String(data.priority || 2);
    document.getElementById('blVisitedDate').value = data.visitedDate || '';
    _blToggleVisitedRow();

    // Location
    _blModalGeo = { lat: geo.lat != null ? geo.lat : null, lng: geo.lng != null ? geo.lng : null, countryCode: geo.countryCode || null };
    document.getElementById('blLocSearchInput').value = '';
    document.getElementById('blLocResults').innerHTML = '';
    document.getElementById('blCountryInput').value = geo.country || '';
    document.getElementById('blRegionInput').value = geo.region || '';
    document.getElementById('blCityInput').value = geo.city || '';
    document.getElementById('blVenueInput').value = geo.venue || '';
    document.getElementById('blAddressInput').value = geo.address || '';
    _blUpdateCoordsLabel();

    // Timing
    document.getElementById('blTimingType').value = timing.type || 'none';
    var monthBoxes = document.querySelectorAll('#blMonthGrid input[type=checkbox]');
    monthBoxes.forEach(function(cb) { cb.checked = (timing.months || []).indexOf(parseInt(cb.value, 10)) !== -1; });
    document.getElementById('blStartDate').value = timing.startDate || '';
    document.getElementById('blEndDate').value = timing.endDate || '';
    document.getElementById('blYearly').checked = !!timing.yearly;
    document.getElementById('blTimingLabel').value = timing.label || '';
    _blToggleTimingRows();

    // Text + links
    document.getElementById('blWhyInput').value = data.why || '';
    document.getElementById('blNotesInput').value = data.notes || '';
    document.getElementById('blTagsInput').value = (data.tags || []).join(', ');
    document.getElementById('blWebsiteInput').value = data.website || '';
    var linksWrap = document.getElementById('blLinksContainer');
    linksWrap.innerHTML = '';
    (data.links || []).forEach(function(l) { _blAddLinkRow(l.url, l.label); });

    // Wire controls
    document.getElementById('blModalCancelBtn').onclick = function() { closeModal('blModal'); };
    document.getElementById('blModalSaveBtn').onclick = _blSave;
    document.getElementById('blModalDeleteBtn').onclick = function() {
        closeModal('blModal');
        setTimeout(function() { _blConfirmDelete(_blEditId); }, 50);
    };
    document.getElementById('blStatusSelect').onchange = function() {
        // Default the visited date to today the first time "Visited" is picked
        if (this.value === 'visited' && !document.getElementById('blVisitedDate').value) {
            document.getElementById('blVisitedDate').value = _blTodayIso();
        }
        _blToggleVisitedRow();
    };
    document.getElementById('blTimingType').onchange = _blToggleTimingRows;
    document.getElementById('blLocSearchBtn').onclick = _blRunLocationSearch;
    document.getElementById('blLocSearchInput').onkeydown = function(e) {
        if (e.key === 'Enter') { e.preventDefault(); _blRunLocationSearch(); }
    };
    document.getElementById('blClearCoordsBtn').onclick = function() { _blModalGeo.lat = null; _blModalGeo.lng = null; _blUpdateCoordsLabel(); };
    document.getElementById('blAddLinkBtn').onclick = function() { _blAddLinkRow('', ''); };
    document.querySelectorAll('#blSeasonButtons button').forEach(function(btn) {
        btn.onclick = function() { _blApplySeason(btn.dataset.season); };
    });

    openModal('blModal');
}

/** Show the visited-date row only when status is Visited. */
function _blToggleVisitedRow() {
    var isVisited = document.getElementById('blStatusSelect').value === 'visited';
    document.getElementById('blVisitedRow').classList.toggle('hidden', !isVisited);
}

/** Show the sub-fields that match the chosen timing type. */
function _blToggleTimingRows() {
    var type = document.getElementById('blTimingType').value;
    document.getElementById('blMonthsRow').classList.toggle('hidden', type !== 'months');
    document.getElementById('blDatesRow').classList.toggle('hidden', type !== 'date' && type !== 'range');
    document.getElementById('blEndDateWrap').classList.toggle('hidden', type !== 'range');
    document.getElementById('blYearlyRow').classList.toggle('hidden', type !== 'date' && type !== 'range');
    document.getElementById('blTimingLabelRow').classList.toggle('hidden', type === 'none');
}

/** Tick the months of a season (replaces the current selection). */
function _blApplySeason(season) {
    var months = BL_SEASONS[season] || [];
    document.querySelectorAll('#blMonthGrid input[type=checkbox]').forEach(function(cb) {
        cb.checked = months.indexOf(parseInt(cb.value, 10)) !== -1;
    });
}

/** Add one URL + label row to the extra-links list. */
function _blAddLinkRow(url, label) {
    var row = document.createElement('div');
    row.className = 'bl-link-row';
    row.innerHTML =
        '<input type="text" class="bl-link-label" placeholder="Label (optional)">' +
        '<input type="text" class="bl-link-url" placeholder="https://...">' +
        '<button type="button" class="btn btn-secondary btn-small bl-link-remove" title="Remove">&times;</button>';
    row.querySelector('.bl-link-label').value = label || '';
    row.querySelector('.bl-link-url').value = url || '';
    row.querySelector('.bl-link-remove').onclick = function() { row.remove(); };
    document.getElementById('blLinksContainer').appendChild(row);
}

/** Show the saved coordinates (or "none") in the modal. */
function _blUpdateCoordsLabel() {
    var has = _blModalGeo && _blModalGeo.lat != null && _blModalGeo.lng != null;
    document.getElementById('blCoordsLabel').textContent = has
        ? '📍 ' + Number(_blModalGeo.lat).toFixed(5) + ', ' + Number(_blModalGeo.lng).toFixed(5)
        : '📍 No coordinates';
    document.getElementById('blClearCoordsBtn').style.display = has ? '' : 'none';
}

// ---------- Location search (OpenStreetMap / Nominatim) ----------

/**
 * Search OpenStreetMap for a place name and show structured results.
 * OSM covers countries, towns, trails, waterfalls and parks, which suits this list.
 */
async function _blRunLocationSearch() {
    var query = document.getElementById('blLocSearchInput').value.trim();
    var resultsEl = document.getElementById('blLocResults');
    if (!query) return;

    resultsEl.innerHTML = '<div class="bl-loc-status">Searching...</div>';
    try {
        await _placesNominatimRateLimit();   // shared 1 request/second guard from places.js
        var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=8&addressdetails=1&namedetails=1&q=' +
                  encodeURIComponent(query);
        var resp = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        _blSearchResults = (await resp.json()).map(_blMapNominatim);
    } catch (err) {
        console.warn('Bucket list location search failed:', err);
        resultsEl.innerHTML = '<div class="bl-loc-status">Search failed — check your connection or fill the fields in by hand.</div>';
        return;
    }

    if (_blSearchResults.length === 0) {
        resultsEl.innerHTML = '<div class="bl-loc-status">No matches. Try a different spelling, or fill the fields in by hand.</div>';
        return;
    }
    resultsEl.innerHTML = '';
    _blSearchResults.forEach(function(r, i) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bl-loc-result';
        btn.innerHTML = '<strong>' + escapeHtml(r.name) + '</strong><span>' + escapeHtml(r.display) + '</span>';
        btn.onclick = function() { _blApplySearchResult(i); };
        resultsEl.appendChild(btn);
    });
}

/** Convert a raw Nominatim result into the pieces we store. */
function _blMapNominatim(item) {
    var a = item.address || {};
    var parts = (item.display_name || '').split(',').map(function(s) { return s.trim(); });
    var name = (item.namedetails && (item.namedetails.name || item.namedetails['name:en'])) || parts[0] || '';
    // Administrative areas and generic "place" results are towns/regions, not a specific venue
    var isArea = item.class === 'boundary' || item.class === 'place';
    return {
        name       : name,
        display    : parts.slice(1, 4).join(', ') || (a.country || ''),
        isArea     : isArea,
        country    : a.country || '',
        countryCode: (a.country_code || '').toUpperCase(),
        region     : a.state || a.region || a.province || a.state_district || '',
        city       : a.city || a.town || a.village || a.hamlet || a.municipality || '',   // county deliberately excluded — it isn't a city
        address    : item.display_name || '',
        lat        : parseFloat(item.lat),
        lng        : parseFloat(item.lon),
        osmType    : item.type || ''
    };
}

/** Copy a chosen search result into the modal fields. */
function _blApplySearchResult(index) {
    var r = _blSearchResults[index];
    if (!r) return;
    document.getElementById('blCountryInput').value = r.country;
    document.getElementById('blRegionInput').value = r.region;
    // For a town/area result the name IS the city; for a venue, keep the city separate
    document.getElementById('blCityInput').value = r.isArea && !r.city ? r.name : r.city;
    document.getElementById('blVenueInput').value = r.isArea ? '' : r.name;
    document.getElementById('blAddressInput').value = r.address;
    _blModalGeo.lat = r.lat;
    _blModalGeo.lng = r.lng;
    _blModalGeo.countryCode = r.countryCode || null;
    _blUpdateCoordsLabel();
    // Fill the name only if the user hasn't typed one yet
    var nameInput = document.getElementById('blNameInput');
    if (!nameInput.value.trim()) nameInput.value = r.name;
    document.getElementById('blLocResults').innerHTML = '';
}

// ---------- Save ----------

/** Read the modal and write the document. */
async function _blSave() {
    var name = document.getElementById('blNameInput').value.trim();
    if (!name) {
        alert('Please enter a name.');
        document.getElementById('blNameInput').focus();
        return;
    }

    // Timing
    var type = document.getElementById('blTimingType').value;
    var timing = { type: type, months: [], season: null, startDate: null, endDate: null, yearly: false, label: null };
    if (type === 'months') {
        document.querySelectorAll('#blMonthGrid input[type=checkbox]:checked').forEach(function(cb) {
            timing.months.push(parseInt(cb.value, 10));
        });
        timing.months.sort(function(a, b) { return a - b; });
        if (timing.months.length === 0) { timing.type = 'none'; }
        // Record the season name when the picked months exactly match one
        Object.keys(BL_SEASONS).forEach(function(s) {
            var sm = BL_SEASONS[s].slice().sort(function(a, b) { return a - b; });
            if (sm.join(',') === timing.months.join(',')) timing.season = s;
        });
    } else if (type === 'date' || type === 'range') {
        timing.startDate = document.getElementById('blStartDate').value || null;
        timing.endDate = type === 'range' ? (document.getElementById('blEndDate').value || null) : null;
        timing.yearly = document.getElementById('blYearly').checked;
        if (!timing.startDate) {
            alert('Please choose a start date, or set "When" to "No specific time".');
            return;
        }
        if (type === 'range' && timing.endDate && timing.endDate < timing.startDate) {
            alert('The end date is before the start date.');
            return;
        }
        if (type === 'range' && !timing.endDate) timing.type = 'date';
    }
    if (timing.type !== 'none') timing.label = document.getElementById('blTimingLabel').value.trim() || null;

    // Location
    var geo = {
        country    : document.getElementById('blCountryInput').value.trim() || null,
        countryCode: _blModalGeo.countryCode || null,
        region     : document.getElementById('blRegionInput').value.trim() || null,
        city       : document.getElementById('blCityInput').value.trim() || null,
        venue      : document.getElementById('blVenueInput').value.trim() || null,
        address    : document.getElementById('blAddressInput').value.trim() || null,
        lat        : _blModalGeo.lat,
        lng        : _blModalGeo.lng
    };
    geo.precision = _blPrecision(geo);

    // Links
    var links = [];
    document.querySelectorAll('#blLinksContainer .bl-link-row').forEach(function(row) {
        var url = _blNormalizeUrl(row.querySelector('.bl-link-url').value);
        if (url) links.push({ url: url, label: row.querySelector('.bl-link-label').value.trim() || null });
    });

    var tags = document.getElementById('blTagsInput').value.split(',')
        .map(function(t) { return t.trim().toLowerCase(); })
        .filter(function(t, i, arr) { return t && arr.indexOf(t) === i; });

    var status = document.getElementById('blStatusSelect').value;
    var payload = {
        name       : name,
        kind       : document.getElementById('blKindSelect').value,
        why        : document.getElementById('blWhyInput').value.trim() || null,
        notes      : document.getElementById('blNotesInput').value.trim() || null,
        tags       : tags,
        geo        : geo,
        timing     : timing,
        website    : _blNormalizeUrl(document.getElementById('blWebsiteInput').value) || null,
        links      : links,
        status     : status,
        priority   : parseInt(document.getElementById('blPrioritySelect').value, 10) || 2,
        visitedDate: status === 'visited' ? (document.getElementById('blVisitedDate').value || _blTodayIso()) : null,
        updatedAt  : firebase.firestore.FieldValue.serverTimestamp()
    };

    var saveBtn = document.getElementById('blModalSaveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
        if (_blEditId) {
            await userCol('bucketList').doc(_blEditId).update(payload);
        } else {
            payload.source = 'manual';
            payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await userCol('bucketList').add(payload);
        }
        closeModal('blModal');
        // Refresh whichever page is showing
        if (window.location.hash.indexOf('#bucketitem/') === 0) loadBucketItemPage(_blEditId);
        else loadBucketListPage();
    } catch (err) {
        console.error('Error saving bucket list item:', err);
        alert('Error saving — please try again.');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
    }
}

// ---------- Delete ----------

/** Permanently delete an item along with its photos and facts. */
async function _blConfirmDelete(id) {
    if (!id) return;
    if (!confirm('Delete this item, including its photos and facts? This cannot be undone.\n\n(Tip: use Dismiss instead to hide it but keep it.)')) return;
    try {
        var types = ['photos', 'facts'];
        for (var i = 0; i < types.length; i++) {
            var snap = await userCol(types[i]).where('targetType', '==', 'bucketItem').where('targetId', '==', id).get();
            for (var j = 0; j < snap.docs.length; j++) { await snap.docs[j].ref.delete(); }
        }
        await userCol('bucketList').doc(id).delete();
        // Changing the hash triggers the router; if we're already on the list, reload it directly
        if (window.location.hash === '#bucketlist') loadBucketListPage();
        else window.location.hash = '#bucketlist';
    } catch (err) {
        console.error('Error deleting bucket list item:', err);
        alert('Error deleting — please try again.');
    }
}
