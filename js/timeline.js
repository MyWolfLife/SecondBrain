// ============================================================
// timeline.js — Life → Timeline
// A timeline of my life: schools, jobs, homes, trips, games, races — what / when / where / who.
// Dates may be fuzzy ("Fall 1988", "Early 1980s", "about 1981–1983"), so a date is picked with a
// precision instead of being forced to a day. Memories (Thoughts → Memories) are merged into the
// list read-only; tapping one opens the memory.
//
// Pages:
//   #timeline              list: search box, category chips, oldest/newest toggle, grouped by decade → year
//   #timeline-event/new    add an event   (#timeline-event/:id = edit)
//
// Firestore (per-user, userCol): timelineEvents
//   { title, category, notes,
//     precision ('day'|'month'|'season'|'year'|'decade'|'range'),
//     when { year, month, day, season, decade, part ('early'|'mid'|'late'|''), toYear },
//     approx (bool — "about"),
//     endYear, endMonth (0 = year only), ongoing (bool)   — optional end of a span (school, a job)
//     sortDate  'YYYY-MM-DD' earliest possible date (what the list sorts by),
//     placeName, address { street, city, state, zip },
//     whoText (raw text; "@Name" marks a linked contact), personIds[],
//     createdAt }
//
// Categories: a starter list plus whatever is already in use. New ones are typed on an event.
// Memories are read from the existing `memories` collection (title, dateText, sortDate).
// ============================================================

var TL_STARTER_CATEGORIES = ['School', 'Work', 'Home', 'Trip', 'Sports', 'Race', 'Other'];
var TL_MEMORY = '__memory__';               // the "Memories" filter chip
var TL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var TL_SEASON_MONTH = { spring: 3, summer: 6, fall: 9, winter: 12 };   // month used to sort a season
var TL_PART_OFFSET  = { '': 0, early: 0, mid: 4, late: 7 };            // years added to the decade to sort it

var _tlEvents = [];             // timeline events, loaded by the list page
var _tlMemories = [];           // memories shaped like events {isMemory, id, title, dateText, sortDate}
var _tlFilter = {               // kept while you move around the app (not across reloads)
    text: '',
    category: '',               // '' = all, TL_MEMORY, or a category name
    order: 'oldest'             // 'oldest' | 'newest'
};
var _tlEdit = null;             // the event being edited { id|null, personIds:Set }
var _tlPeopleCache = null;      // contacts for @ / @@ mentions
var _tlBirth = null;            // my birthday {year, month, day} from the Me contact (for ages), or null

// ─── Small helpers ───────────────────────────────────────────────────────────

function _tlEsc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _tlPad(n) { return (n < 10 ? '0' : '') + n; }

function _tlCrumbs(crumbs) {
    var html = '<a href="#life">Life</a>';
    crumbs.forEach(function(c) {
        html += '<span class="separator">&rsaquo;</span>' +
                (c[1] ? '<a href="' + c[1] + '">' + c[0] + '</a>' : '<span>' + c[0] + '</span>');
    });
    window.scrollTo(0, 0);
    document.getElementById('breadcrumbBar').innerHTML = html;
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + (window.appName || 'My Life') + '</a>';
}

function _tlCleanCategory(c) { return String(c || '').trim().replace(/\s+/g, ' '); }

/** Starter categories + any in use, A–Z after the starters. */
function _tlAllCategories() {
    var seen = {}, list = [];
    TL_STARTER_CATEGORIES.forEach(function(c) { seen[c.toLowerCase()] = true; list.push(c); });
    var extra = [];
    _tlEvents.forEach(function(e) {
        if (e.category && !seen[e.category.toLowerCase()]) { seen[e.category.toLowerCase()] = true; extra.push(e.category); }
    });
    extra.sort(function(a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
    return list.concat(extra);
}

/** Use the spelling of an existing category if the typed one matches it in any case. */
function _tlMatchCategory(c) {
    c = _tlCleanCategory(c);
    var hit = _tlAllCategories().find(function(x) { return x.toLowerCase() === c.toLowerCase(); });
    return hit || c;
}

// ─── Dates: precision → sort date + display text ─────────────────────────────

/** Earliest possible date (YYYY-MM-DD) for the picked precision, or '' when the year is missing. */
function _tlSortDate(precision, w) {
    var y = parseInt(w.year, 10), m, d;
    switch (precision) {
        case 'day':
            if (!y || !w.month || !w.day) return '';
            return y + '-' + _tlPad(w.month) + '-' + _tlPad(w.day);
        case 'month':
            if (!y || !w.month) return '';
            return y + '-' + _tlPad(w.month) + '-01';
        case 'season':
            if (!y || !w.season) return '';
            return y + '-' + _tlPad(TL_SEASON_MONTH[w.season]) + '-01';
        case 'year':
            return y ? y + '-01-01' : '';
        case 'decade':
            if (!w.decade) return '';
            return (parseInt(w.decade, 10) + TL_PART_OFFSET[w.part || '']) + '-01-01';
        case 'range':
            return y ? y + '-01-01' : '';      // "year" holds the From year for a range
    }
    return '';
}

/** Words shown on the list: "Fall 1988", "Early 1980s", "1981–1983", "June 15, 1990". */
function _tlWhenText(e) {
    var w = e.when || {}, t = '';
    switch (e.precision) {
        case 'day':    t = TL_MONTHS[(w.month || 1) - 1].substr(0, 3) + ' ' + w.day + ', ' + w.year; break;
        case 'month':  t = TL_MONTHS[(w.month || 1) - 1].substr(0, 3) + ' ' + w.year; break;
        case 'season': t = (w.season ? w.season.charAt(0).toUpperCase() + w.season.slice(1) : '') + ' ' + w.year; break;
        case 'year':   t = String(w.year); break;
        case 'decade': t = (w.part ? w.part.charAt(0).toUpperCase() + w.part.slice(1) + ' ' : '') + w.decade + 's'; break;
        case 'range':  t = w.year + '–' + w.toYear; break;
    }
    var end = _tlEndText(e);
    if (end && e.precision !== 'range') t += ' – ' + end;
    var age = _tlAgeText(e);
    return (e.approx ? '~ ' : '') + t + (age ? ' (' + age + ')' : '');
}

/** My age at a date (whole years), or null when my birthday isn't known. */
function _tlAgeAt(date) {
    if (!_tlBirth) return null;
    var age = date.getFullYear() - _tlBirth.year;
    var m = date.getMonth() + 1;
    if (m < _tlBirth.month || (m === _tlBirth.month && date.getDate() < _tlBirth.day)) age--;
    return age;
}

/** Last day the event's date could be (end of the picked month / season / year / part of a decade / range). */
function _tlLatestDate(e) {
    var w = e.when || {}, y = parseInt(w.year, 10);
    switch (e.precision) {
        case 'day':    return new Date(y, w.month - 1, w.day);
        case 'month':  return new Date(y, w.month, 0);
        case 'season': var m = TL_SEASON_MONTH[w.season]; return m === 12 ? new Date(y + 1, 2, 0) : new Date(y, m + 2, 0);
        case 'year':   return new Date(y, 11, 31);
        case 'decade': return new Date(parseInt(w.decade, 10) + ({ early: 3, mid: 6, late: 9 }[w.part] || 9), 11, 31);
        case 'range':  return new Date(parseInt(w.toYear, 10), 11, 31);
    }
    return null;
}

/** "30 years old". When the date is fuzzy and the age could be either of two (or more), "29–30 years old". */
function _tlAgeText(e) {
    if (!_tlBirth || !e.sortDate) return '';
    var p = e.sortDate.split('-');
    var hi = _tlLatestDate(e);
    if (!hi) return '';
    var lo = _tlAgeAt(new Date(+p[0], +p[1] - 1, +p[2]));
    hi = _tlAgeAt(hi);
    if (hi < 0) return '';                  // before I was born
    lo = Math.max(lo, 0);
    if (lo === hi) return lo + (lo === 1 ? ' year old' : ' years old');
    return lo + '–' + hi + ' years old';
}

/** My birthday from the "Me" contact's Birthday important date, or null. Found once per page load. */
async function _tlLoadBirthday() {
    _tlBirth = null;
    try {
        var me = await userCol('people').where('isMe', '==', true).limit(1).get();
        if (me.empty) return;
        var dates = await userCol('peopleImportantDates').where('personId', '==', me.docs[0].id).get();
        dates.forEach(function(d) {
            var x = d.data();
            if (!_tlBirth && /birthday|bday|birthdate/i.test(x.label || '') && x.year && x.month && x.day) {
                _tlBirth = { year: +x.year, month: +x.month, day: +x.day };
            }
        });
    } catch (err) { console.error('Timeline: birthday load failed:', err); }
}

function _tlEndText(e) {
    if (e.ongoing) return 'Present';
    if (!e.endYear) return '';
    return (e.endMonth ? TL_MONTHS[e.endMonth - 1].substr(0, 3) + ' ' : '') + e.endYear;
}

// ─── Loading ─────────────────────────────────────────────────────────────────

async function _tlLoad() {
    var results = await Promise.all([
        userCol('timelineEvents').get(),
        userCol('memories').get(),
        _tlLoadBirthday()
    ]);
    _tlEvents = results[0].docs.map(function(d) { var e = d.data(); e.id = d.id; return e; });
    _tlMemories = results[1].docs.map(function(d) {
        var m = d.data();
        return { isMemory: true, id: d.id, title: m.title || 'Untitled', dateText: m.dateText || '',
                 sortDate: m.sortDate || '', placeName: m.location || '', category: '' };
    });
}

// ─── List page (#timeline) ───────────────────────────────────────────────────

async function loadTimelinePage() {
    _tlCrumbs([['Timeline']]);
    var el = document.getElementById('page-timeline');
    el.innerHTML = '<div class="page-header"><h2>Timeline</h2></div><div class="ex-status">Loading…</div>';
    try {
        await _tlLoad();
        await _tlLoadPeople();
    } catch (err) {
        console.error('Timeline: failed to load:', err);
        el.innerHTML = '<div class="page-header"><h2>Timeline</h2></div><div class="ex-status">Could not load the timeline.</div>';
        return;
    }
    // Drop a category filter that no longer exists
    if (_tlFilter.category && _tlFilter.category !== TL_MEMORY &&
        _tlAllCategories().indexOf(_tlFilter.category) === -1) _tlFilter.category = '';

    el.innerHTML =
        '<div class="page-header">' +
            '<h2>Timeline</h2>' +
            '<div class="page-header-actions">' +
                '<a href="#timeline-event/new" class="btn btn-primary">+ Add Event</a>' +
            '</div>' +
        '</div>' +
        '<div class="ex-toolbar">' +
            '<div class="ex-toolbar-row">' +
                '<input type="search" id="tlText" class="filter-input" placeholder="Search title, place, people, notes…" value="' + _tlEsc(_tlFilter.text) + '">' +
                '<select id="tlOrder" class="wl-sort">' +
                    '<option value="oldest">Oldest first</option>' +
                    '<option value="newest">Newest first</option>' +
                '</select>' +
            '</div>' +
            '<div class="ex-toolbar-row"><span class="wl-row-label">Category</span><div id="tlCatChips" class="wl-tag-chips"></div></div>' +
        '</div>' +
        '<div id="tlCount" class="wl-count"></div>' +
        '<div id="tlList"></div>';

    document.getElementById('tlOrder').value = _tlFilter.order;
    document.getElementById('tlText').addEventListener('input', function() { _tlFilter.text = this.value; _tlRenderList(); });
    document.getElementById('tlOrder').addEventListener('change', function() { _tlFilter.order = this.value; _tlRenderList(); });
    document.getElementById('tlCatChips').addEventListener('click', function(ev) {
        var c = ev.target.closest('[data-cat]');
        if (!c) return;
        var cat = c.getAttribute('data-cat');
        _tlFilter.category = (_tlFilter.category === cat) ? '' : cat;   // tap again to clear
        _tlRenderChips();
        _tlRenderList();
    });
    _tlRenderChips();
    _tlRenderList();
}

function _tlChip(value, label, on) {
    return '<button type="button" class="wl-chip' + (on ? ' wl-chip--on' : '') + '" data-cat="' + _tlEsc(value) + '">' + _tlEsc(label) + '</button>';
}

function _tlRenderChips() {
    var cat = _tlFilter.category;
    var html = _tlChip('', 'All', !cat);
    _tlAllCategories().forEach(function(c) {
        var n = _tlEvents.filter(function(e) { return e.category === c; }).length;
        if (n || TL_STARTER_CATEGORIES.indexOf(c) !== -1) html += _tlChip(c, c + ' (' + n + ')', cat === c);
    });
    html += _tlChip(TL_MEMORY, 'Memories (' + _tlMemories.length + ')', cat === TL_MEMORY);
    document.getElementById('tlCatChips').innerHTML = html;
}

/** Events + memories that pass the search box and category chip. */
function _tlFiltered() {
    var text = _tlFilter.text.trim().toLowerCase();
    var cat = _tlFilter.category;
    var rows = [];
    if (cat !== TL_MEMORY) rows = rows.concat(_tlEvents);
    if (!cat || cat === TL_MEMORY) rows = rows.concat(_tlMemories);
    return rows.filter(function(r) {
        if (cat && cat !== TL_MEMORY && r.category !== cat) return false;
        if (text) {
            var hay = [r.title, r.placeName, r.whoText, r.notes, r.dateText,
                       r.address ? [r.address.city, r.address.state, r.address.street].join(' ') : ''].join(' ').toLowerCase();
            if (hay.indexOf(text) === -1) return false;
        }
        return true;
    });
}

function _tlRenderList() {
    var list = document.getElementById('tlList');
    if (!list) return;
    var rows = _tlFiltered();
    var total = _tlEvents.length + _tlMemories.length;
    document.getElementById('tlCount').textContent = total ? rows.length + ' of ' + total + ' item' + (total === 1 ? '' : 's') : '';
    if (!rows.length) {
        list.innerHTML = '<div class="ex-status">' + (total
            ? 'Nothing matches.'
            : 'Nothing yet. Tap <strong>+ Add Event</strong> to record a school, a job, a trip, a game…') + '</div>';
        return;
    }

    var dated = rows.filter(function(r) { return r.sortDate; });
    var undated = rows.filter(function(r) { return !r.sortDate; });
    var dir = _tlFilter.order === 'newest' ? -1 : 1;
    dated.sort(function(a, b) {
        return dir * a.sortDate.localeCompare(b.sortDate) || (a.title || '').localeCompare(b.title || '');
    });

    // Group: decade header → year header → rows
    var html = '', lastDecade = null, lastYear = null;
    dated.forEach(function(r) {
        var year = r.sortDate.substr(0, 4);
        var decade = year.substr(0, 3) + '0s';
        if (decade !== lastDecade) { html += '<h3 class="tl-decade">' + decade + '</h3>'; lastDecade = decade; lastYear = null; }
        if (year !== lastYear) { html += '<h4 class="tl-year">' + year + '</h4>'; lastYear = year; }
        html += _tlCardHtml(r);
    });
    if (undated.length) {
        html += '<h3 class="tl-decade">No date</h3>';
        undated.sort(function(a, b) { return (a.title || '').localeCompare(b.title || ''); });
        undated.forEach(function(r) { html += _tlCardHtml(r); });
    }
    list.innerHTML = html;
}

function _tlCardHtml(r) {
    if (r.isMemory) {
        return '<a class="wo-card tl-card tl-card--memory" href="#memory-edit/' + r.id + '">' +
                   '<div class="wo-card-main">' +
                       '<div class="wo-badges"><span class="web-cat-badge tl-badge-memory">📖 Memory</span>' +
                           (r.dateText ? '<span class="tl-when">' + _tlEsc(r.dateText) + '</span>' : '') + '</div>' +
                       '<div class="wo-card-name">' + _tlEsc(r.title) + '</div>' +
                       (r.placeName ? '<div class="wo-card-meta">📍 ' + _tlEsc(r.placeName) + '</div>' : '') +
                   '</div>' +
               '</a>';
    }
    return '<a class="wo-card tl-card" href="#timeline-event/' + r.id + '">' +
               '<div class="wo-card-main">' +
                   '<div class="wo-badges">' +
                       (r.category ? '<span class="web-cat-badge">' + _tlEsc(r.category) + '</span>' : '') +
                       '<span class="tl-when">' + _tlEsc(_tlWhenText(r)) + '</span>' +
                   '</div>' +
                   '<div class="wo-card-name">' + _tlEsc(r.title) + '</div>' +
                   _tlPlaceLine(r) +
                   (r.whoText ? '<div class="wo-card-meta">👥 ' + _tlWhoHtml(r) + '</div>' : '') +
                   (r.notes ? '<div class="wo-card-meta wl-desc">' + _tlEsc(r.notes) + '</div>' : '') +
               '</div>' +
           '</a>';
}

/** "📍 Atlanta-Fulton County Stadium · Atlanta, GA" */
function _tlPlaceLine(r) {
    var a = r.address || {};
    var cityState = [a.city, a.state].filter(Boolean).join(', ');
    var parts = [r.placeName, a.street, cityState].filter(Boolean);
    return parts.length ? '<div class="wo-card-meta">📍 ' + parts.map(_tlEsc).join(' · ') + '</div>' : '';
}

/** Who text with each linked "@Name" turned into a chip link to the contact. The card itself is a link,
 *  so the chip stops the click from also opening the event. */
function _tlWhoHtml(r) {
    var text = r.whoText || '';
    var ids = r.personIds || [];
    var byName = {};
    ids.forEach(function(id) {
        var p = (_tlPeopleCache || []).find(function(x) { return x.id === id; });
        if (p) byName[_tlMentionName(p)] = id;
    });
    var names = Object.keys(byName).sort(function(a, b) { return b.length - a.length; });
    if (!names.length) return _tlEsc(text);
    var pattern = names.map(function(n) { return '@' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|');
    return text.split(new RegExp('(' + pattern + ')(?!\\w)', 'g')).map(function(part) {
        var id = byName[part.replace(/^@/, '')];
        if (part.charAt(0) === '@' && id) {
            return '<span class="tl-person" onclick="event.preventDefault();event.stopPropagation();location.hash=\'#contact/' + id + '\'">' +
                   _tlEsc(part.substr(1)) + '</span>';
        }
        return _tlEsc(part);
    }).join('');
}

// ─── @ / @@ mentions in the Who box ──────────────────────────────────────────

function _tlMentionName(p) { return p.nickname || p.name.split(' ')[0]; }

async function _tlLoadPeople() {
    if (_tlPeopleCache) return _tlPeopleCache;
    try {
        var snap = await userCol('people').get();
        _tlPeopleCache = snap.docs.map(function(doc) {
            var d = doc.data();
            return { id: doc.id, name: d.name || '', nickname: d.nickname || '', howKnown: d.howKnown || '', quickMention: !!d.quickMention };
        });
        _tlPeopleCache.sort(function(a, b) { return a.name.localeCompare(b.name); });
    } catch (err) { console.error('Timeline: people load failed:', err); _tlPeopleCache = []; }
    return _tlPeopleCache;
}

/** The "@" or "@@" word being typed just before the cursor, or null. */
function _tlMentionPrefix() {
    var inp = document.getElementById('tlWho');
    if (!inp) return null;
    var m = inp.value.substring(0, inp.selectionStart).match(/(@@?)(\w*)$/);
    return m ? { text: m[2], full: m[1].length === 2 } : null;
}

function _tlHideDropdown() {
    var drop = document.getElementById('tlMentionDropdown');
    if (drop) drop.classList.add('hidden');
}

function _tlShowDropdown(matches) {
    var drop = document.getElementById('tlMentionDropdown');
    if (!drop) return;
    drop.innerHTML = '';
    if (!matches.length) { drop.classList.add('hidden'); return; }
    matches.forEach(function(p) {
        var item = document.createElement('div');
        item.className = 'mention-item';
        item._person = p;
        item.innerHTML = _tlEsc(p.name) +
            (p.nickname ? ' <span class="mention-item-nick">(' + _tlEsc(p.nickname) + ')</span>' : '') +
            (p.howKnown ? ' <span class="mention-item-nick">' + _tlEsc(p.howKnown) + '</span>' : '');
        item.addEventListener('mousedown', function(e) { e.preventDefault(); _tlSelectMention(p); });
        item.addEventListener('touchend',  function(e) { e.preventDefault(); _tlSelectMention(p); });
        drop.appendChild(item);
    });
    drop.classList.remove('hidden');
}

function _tlSelectMention(p) {
    var pre = _tlMentionPrefix();
    if (!pre) { _tlHideDropdown(); return; }
    var inp = document.getElementById('tlWho');
    var pos = inp.selectionStart;
    var before = inp.value.substring(0, pos - pre.text.length - (pre.full ? 2 : 1));
    var after = inp.value.substring(pos);
    var name = _tlMentionName(p);
    inp.value = before + '@' + name + ' ' + after;
    inp.selectionStart = inp.selectionEnd = before.length + name.length + 2;
    _tlEdit.personIds.add(p.id);
    _tlHideDropdown();
    inp.focus();
}

async function _tlOnWhoInput() {
    var pre = _tlMentionPrefix();
    if (!pre) { _tlHideDropdown(); return; }
    var people = await _tlLoadPeople();
    var lower = pre.text.toLowerCase();
    _tlShowDropdown(people.filter(function(p) {
        var hit = p.name.toLowerCase().startsWith(lower) || (p.nickname && p.nickname.toLowerCase().startsWith(lower));
        return hit && (pre.full || p.quickMention);       // @ = quick list, @@ = everyone
    }).slice(0, 7));
}

function _tlOnWhoKeydown(e) {
    if (e.key === 'Escape') { _tlHideDropdown(); return; }
    if (e.key !== 'Tab' && e.key !== 'Enter') return;
    var drop = document.getElementById('tlMentionDropdown');
    if (drop && !drop.classList.contains('hidden') && drop.children.length) {
        e.preventDefault();
        e.stopPropagation();       // keep app.js's document-level Tab handler out of it
        if (drop.children[0]._person) _tlSelectMention(drop.children[0]._person);
    }
}

// ─── Add / edit page (#timeline-event/new, #timeline-event/:id) ──────────────

var TL_PRECISIONS = [
    ['day', 'Exact day'], ['month', 'Month'], ['season', 'Season'],
    ['year', 'Year'], ['decade', 'Decade'], ['range', 'Range (not sure)']
];

async function loadTimelineEventPage(id) {
    var isNew = id === 'new';
    _tlCrumbs([['Timeline', '#timeline'], [isNew ? 'Add Event' : 'Edit Event']]);
    var el = document.getElementById('page-timeline-event');
    el.innerHTML = '<div class="ex-status">Loading…</div>';

    var ev = { title: '', category: '', notes: '', precision: 'day', when: {}, approx: false,
               endYear: 0, endMonth: 0, ongoing: false, placeName: '', address: {}, whoText: '', personIds: [] };
    try {
        await _tlLoad();
        await _tlLoadPeople();
        if (!isNew) {
            var doc = await userCol('timelineEvents').doc(id).get();
            if (!doc.exists) { el.innerHTML = '<div class="ex-status">This event was not found.</div>'; return; }
            ev = Object.assign(ev, doc.data());
        }
    } catch (err) {
        console.error('Timeline: failed to load event:', err);
        el.innerHTML = '<div class="ex-status">Could not load the event.</div>';
        return;
    }
    // A new event starts in the category the list is filtered to
    if (isNew && !ev.category && _tlFilter.category && _tlFilter.category !== TL_MEMORY) ev.category = _tlFilter.category;
    _tlEdit = { id: isNew ? null : id, personIds: new Set(ev.personIds || []) };

    var catOptions = '<option value="">(No category)</option>' +
        _tlAllCategories().map(function(c) {
            return '<option value="' + _tlEsc(c) + '"' + (c === ev.category ? ' selected' : '') + '>' + _tlEsc(c) + '</option>';
        }).join('') + '<option value="__new__">+ New category…</option>';

    var precOptions = TL_PRECISIONS.map(function(p) {
        return '<option value="' + p[0] + '"' + (p[0] === ev.precision ? ' selected' : '') + '>' + p[1] + '</option>';
    }).join('');

    var a = ev.address || {};
    var hasAddress = !!(a.street || a.city || a.state || a.zip);

    el.innerHTML =
        '<div class="page-header"><h2>' + (isNew ? 'Add Event' : 'Edit Event') + '</h2></div>' +
        '<div class="wl-form">' +
            '<div class="form-group">' +
                '<label for="tlTitle">What <span class="required">*</span></label>' +
                '<input type="text" id="tlTitle" placeholder="e.g. Braves game, Started at Lockheed, 7th grade" value="' + _tlEsc(ev.title) + '">' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="tlCat">Category</label>' +
                '<select id="tlCat">' + catOptions + '</select>' +
                '<input type="text" id="tlCatNew" class="hidden" placeholder="New category" style="margin-top:8px;">' +
            '</div>' +

            '<div class="form-group">' +
                '<label for="tlPrecision">When — how sure are you?</label>' +
                '<select id="tlPrecision">' + precOptions + '</select>' +
                '<div id="tlWhenFields" class="tl-when-fields"></div>' +
                '<label class="wo-inline-check"><input type="checkbox" id="tlApprox"' + (ev.approx ? ' checked' : '') + '> ~ About (show it as approximate)</label>' +
            '</div>' +
            '<div class="form-group" id="tlSpanRow">' +
                '<label class="wo-inline-check"><input type="checkbox" id="tlSpan"' + (ev.endYear || ev.ongoing ? ' checked' : '') + '> Lasted a while (has an end — school, job, home)</label>' +
            '</div>' +
            '<div class="form-group" id="tlEndGroup">' +
                '<label>Ended</label>' +
                '<div class="tl-when-fields">' +
                    '<select id="tlEndMonth"></select>' +
                    '<input type="number" id="tlEndYear" placeholder="Year" min="1800" max="2200" value="' + (ev.endYear || '') + '">' +
                    '<label class="wo-inline-check"><input type="checkbox" id="tlOngoing"' + (ev.ongoing ? ' checked' : '') + '> Still going</label>' +
                '</div>' +
            '</div>' +

            '<div class="form-group">' +
                '<label for="tlPlace">Where</label>' +
                '<input type="text" id="tlPlace" placeholder="e.g. Atlanta-Fulton County Stadium, Atlanta, Decatur" value="' + _tlEsc(ev.placeName) + '">' +
                '<details class="tl-address"' + (hasAddress ? ' open' : '') + '>' +
                    '<summary>Add an address</summary>' +
                    '<input type="text" id="tlStreet" placeholder="Street" value="' + _tlEsc(a.street || '') + '">' +
                    '<div class="tl-when-fields">' +
                        '<input type="text" id="tlCity" placeholder="City" value="' + _tlEsc(a.city || '') + '">' +
                        '<input type="text" id="tlState" placeholder="State" maxlength="20" value="' + _tlEsc(a.state || '') + '">' +
                        '<input type="text" id="tlZip" placeholder="Zip" maxlength="10" value="' + _tlEsc(a.zip || '') + '">' +
                    '</div>' +
                '</details>' +
            '</div>' +

            '<div class="form-group" style="position:relative;">' +
                '<label for="tlWho">Who</label>' +
                '<input type="text" id="tlWho" autocomplete="off" placeholder="Roger, Dad… (type @ for a contact, @@ to search all)" value="' + _tlEsc(ev.whoText) + '">' +
                '<div id="tlMentionDropdown" class="mention-dropdown hidden"></div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="tlNotes">Notes</label>' +
                '<textarea id="tlNotes" rows="3" placeholder="Anything else worth remembering">' + _tlEsc(ev.notes) + '</textarea>' +
            '</div>' +
            '<div class="wl-form-buttons">' +
                '<button type="button" class="btn btn-primary" id="tlSaveBtn">Save</button>' +
                '<a href="#timeline" class="btn btn-secondary">Cancel</a>' +
                (isNew ? '' : '<button type="button" class="btn btn-danger" id="tlDeleteBtn">Delete</button>') +
            '</div>' +
        '</div>';

    // End month dropdown (blank = year only)
    document.getElementById('tlEndMonth').innerHTML = '<option value="0">Month (optional)</option>' +
        TL_MONTHS.map(function(m, i) {
            return '<option value="' + (i + 1) + '"' + (ev.endMonth === i + 1 ? ' selected' : '') + '>' + m + '</option>';
        }).join('');

    var w = ev.when || {};
    _tlRenderWhenFields(ev.precision, w);
    document.getElementById('tlPrecision').addEventListener('change', function() {
        _tlRenderWhenFields(this.value, _tlReadWhen());   // keep what was typed where it still fits
    });
    document.getElementById('tlCat').addEventListener('change', function() {
        var isNewCat = this.value === '__new__';
        document.getElementById('tlCatNew').classList.toggle('hidden', !isNewCat);
        if (isNewCat) document.getElementById('tlCatNew').focus();
    });
    document.getElementById('tlOngoing').addEventListener('change', _tlSyncEnd);
    document.getElementById('tlSpan').addEventListener('change', _tlSyncSpan);
    _tlSyncEnd();
    _tlSyncSpan();

    var who = document.getElementById('tlWho');
    who.addEventListener('input', _tlOnWhoInput);
    who.addEventListener('keydown', _tlOnWhoKeydown);
    who.addEventListener('blur', function() { setTimeout(_tlHideDropdown, 180); });

    document.getElementById('tlSaveBtn').addEventListener('click', _tlSave);
    if (!isNew) document.getElementById('tlDeleteBtn').addEventListener('click', _tlDelete);
    if (isNew) document.getElementById('tlTitle').focus();
}

/** Ending a span with "Still going" ticked makes the end boxes irrelevant. */
function _tlSyncEnd() {
    var on = document.getElementById('tlOngoing').checked;
    document.getElementById('tlEndMonth').disabled = on;
    document.getElementById('tlEndYear').disabled = on;
}

/** Show only the boxes that fit the picked precision. */
function _tlRenderWhenFields(precision, w) {
    var monthSel = '<select id="tlMonth"><option value="0">Month</option>' + TL_MONTHS.map(function(m, i) {
        return '<option value="' + (i + 1) + '"' + (parseInt(w.month, 10) === i + 1 ? ' selected' : '') + '>' + m + '</option>';
    }).join('') + '</select>';
    var yearIn = function(ph) {
        return '<input type="number" id="tlYear" placeholder="' + ph + '" min="1800" max="2200" value="' + (w.year || '') + '">';
    };
    var html = '';
    switch (precision) {
        case 'day':
            // One box: type 1/2/1968 (month/day/year)
            html = '<input type="text" id="tlDate" inputmode="numeric" placeholder="M/D/YYYY, e.g. 1/2/1968" autocomplete="off" value="' +
                   (w.year && w.month && w.day ? w.month + '/' + w.day + '/' + w.year : '') + '">';
            break;
        case 'month':
            html = monthSel + yearIn('Year');
            break;
        case 'season':
            html = '<select id="tlSeason">' + ['spring','summer','fall','winter'].map(function(s) {
                       return '<option value="' + s + '"' + (w.season === s ? ' selected' : '') + '>' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
                   }).join('') + '</select>' + yearIn('Year');
            break;
        case 'year':
            html = yearIn('Year');
            break;
        case 'decade':
            html = '<select id="tlPart">' + [['', 'Whole decade'], ['early', 'Early'], ['mid', 'Mid'], ['late', 'Late']].map(function(p) {
                       return '<option value="' + p[0] + '"' + ((w.part || '') === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
                   }).join('') + '</select>' +
                   '<input type="number" id="tlDecade" placeholder="Decade, e.g. 1980" min="1800" max="2200" step="10" value="' + (w.decade || '') + '">';
            break;
        case 'range':
            html = '<input type="number" id="tlYear" placeholder="From year" min="1800" max="2200" value="' + (w.year || '') + '">' +
                   '<span class="tl-dash">to</span>' +
                   '<input type="number" id="tlToYear" placeholder="To year" min="1800" max="2200" value="' + (w.toYear || '') + '">';
            break;
    }
    document.getElementById('tlWhenFields').innerHTML = html;
    _tlSyncSpan();
}

/** "Lasted a while" reveals the Ended boxes. A range already has an end, so it hides both. */
function _tlSyncSpan() {
    var isRange = document.getElementById('tlPrecision').value === 'range';
    document.getElementById('tlSpanRow').classList.toggle('hidden', isRange);
    document.getElementById('tlEndGroup').classList.toggle('hidden', isRange || !document.getElementById('tlSpan').checked);
}

/** "1/2/1968", "1-2-1968" or "1968-01-02" → {year, month, day}, or null when it isn't a real date. */
function _tlParseDate(text) {
    var t = String(text || '').trim(), m, y, mo, d;
    if ((m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/))) { mo = +m[1]; d = +m[2]; y = +m[3]; }
    else if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)))        { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else return null;
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return { year: y, month: mo, day: d };
}

/** Read whichever date boxes are on screen into a `when` object. */
function _tlReadWhen() {
    var val = function(id) { var e = document.getElementById(id); return e ? e.value : ''; };
    var w = {};
    if (val('tlYear'))   w.year = parseInt(val('tlYear'), 10);
    if (val('tlToYear')) w.toYear = parseInt(val('tlToYear'), 10);
    if (parseInt(val('tlMonth'), 10) > 0) w.month = parseInt(val('tlMonth'), 10);
    var d = _tlParseDate(val('tlDate'));
    if (d) { w.year = d.year; w.month = d.month; w.day = d.day; }
    if (val('tlSeason')) w.season = val('tlSeason');
    if (val('tlDecade')) w.decade = Math.floor(parseInt(val('tlDecade'), 10) / 10) * 10;
    if (document.getElementById('tlPart')) w.part = val('tlPart');
    return w;
}

async function _tlSave() {
    var title = document.getElementById('tlTitle').value.trim();
    if (!title) { alert('Please say what happened.'); return; }

    var category = document.getElementById('tlCat').value;
    if (category === '__new__') {
        category = _tlMatchCategory(document.getElementById('tlCatNew').value);
        if (!category) { alert('Please type the new category, or pick one from the list.'); return; }
    }

    var precision = document.getElementById('tlPrecision').value;
    var when = _tlReadWhen();
    var sortDate = _tlSortDate(precision, when);
    if (!sortDate) {
        alert(precision === 'day'
            ? 'Please type a real date like 1/2/1968 (or pick a less exact "When").'
            : 'Please fill in the date boxes (or pick a less exact "When").');
        return;
    }
    if (precision === 'range' && (!when.toYear || when.toYear < when.year)) {
        alert('The "to" year needs to be the same as or after the "from" year.'); return;
    }

    var spans = document.getElementById('tlSpan').checked && precision !== 'range';
    var ongoing = spans && document.getElementById('tlOngoing').checked;
    var endYear = !spans || ongoing ? 0 : (parseInt(document.getElementById('tlEndYear').value, 10) || 0);
    var endMonth = endYear ? (parseInt(document.getElementById('tlEndMonth').value, 10) || 0) : 0;

    // Keep a linked contact only if its "@Name" is still in the Who text
    var whoText = document.getElementById('tlWho').value.trim();
    var personIds = [];
    _tlEdit.personIds.forEach(function(pid) {
        var p = (_tlPeopleCache || []).find(function(x) { return x.id === pid; });
        if (p && new RegExp('@' + _tlMentionName(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?!\\w)').test(whoText)) personIds.push(pid);
    });

    var data = {
        title: title,
        category: category,
        notes: document.getElementById('tlNotes').value.trim(),
        precision: precision,
        when: when,
        approx: document.getElementById('tlApprox').checked,
        endYear: endYear,
        endMonth: endMonth,
        ongoing: ongoing,
        sortDate: sortDate,
        placeName: document.getElementById('tlPlace').value.trim(),
        address: {
            street: document.getElementById('tlStreet').value.trim(),
            city:   document.getElementById('tlCity').value.trim(),
            state:  document.getElementById('tlState').value.trim(),
            zip:    document.getElementById('tlZip').value.trim()
        },
        whoText: whoText,
        personIds: personIds
    };
    var btn = document.getElementById('tlSaveBtn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
        if (_tlEdit.id) {
            await userCol('timelineEvents').doc(_tlEdit.id).update(data);
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await userCol('timelineEvents').add(data);
        }
        location.hash = '#timeline';
    } catch (err) {
        console.error('Timeline: save failed:', err);
        alert('Failed to save. Please try again.');
        btn.disabled = false; btn.textContent = 'Save';
    }
}

async function _tlDelete() {
    if (!confirm('Delete this event?')) return;
    try {
        await userCol('timelineEvents').doc(_tlEdit.id).delete();
        location.hash = '#timeline';
    } catch (err) {
        console.error('Timeline: delete failed:', err);
        alert('Failed to delete. Please try again.');
    }
}
