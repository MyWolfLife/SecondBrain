// ============================================================
// bucketlist-links.js — Bucket List integrations with the rest of the app
//
//   • Log visit in journal  (journal.js check-in / entry form, back-linked via visitedJournalId)
//   • Add to trip           (Life Projects → project Locations)
//   • Add to calendar       (Life Calendar event or reminder)
//   • bucketListShowFiltered() — used by SecondBrain "show my bucket list" queries
//   • Trip page "Bucket List nearby", check-in nudge, Life page "coming up"
//   • Google (AI Mode) button and the full "Ask AI about it" prompt
//
// Depends on bucketlist.js (BL_KINDS, _bl* helpers), journal.js, life-projects.js, lifecalendar.js.
// Plan document: saveplacesPlan.md §8
// ============================================================

/**
 * Add the integration buttons to the detail page's action row.
 * Called by loadBucketItemPage() in bucketlist.js.
 */
function _blAddIntegrationButtons(actionEl, itemId, data) {
    function makeBtn(label, onClick) {
        var b = document.createElement('button');
        b.className = 'btn btn-secondary btn-small';
        b.textContent = label;
        b.onclick = onClick;
        actionEl.appendChild(b);
    }
    makeBtn(data.visitedJournalId ? '📓 View journal entry' : '📓 Log visit in journal',
            function() { blLogVisitInJournal(itemId, data); });
    makeBtn('🧳 Add to trip', function() { blOpenTripModal(itemId, data); });
    makeBtn('📅 Add to calendar', function() { blOpenCalendarModal(itemId, data); });
    makeBtn('🔎 Google', function() { blOpenGoogle(data); });
    makeBtn('🤖 Ask AI about it', function() { blOpenAskAi(itemId, data); });
}

// ============================================================
// Journal
// ============================================================

/**
 * Open a journal entry for this visit. If an entry is already linked, open it instead.
 * With exact coordinates the entry is a check-in at a place record created on save; otherwise it
 * is a plain entry with the location in the text. Saving the entry marks the item Visited and
 * stores the link back (see saveJournalEntry in journal.js: window._journalSourceBucketId).
 */
async function blLogVisitInJournal(itemId, data) {
    try {
        if (data.visitedJournalId) {
            var existing = await userCol('journalEntries').doc(data.visitedJournalId).get();
            if (existing.exists) { openEditJournalEntry(data.visitedJournalId); return; }
            // The linked entry was deleted — drop the stale link and start a fresh entry
            await userCol('bucketList').doc(itemId).update({ visitedJournalId: firebase.firestore.FieldValue.delete() });
        }
    } catch (err) {
        console.error('Could not open linked journal entry:', err);
        alert('Could not open the journal entry — please try again.');
        return;
    }

    var geo = data.geo || {};
    var loc = _blLocationText(geo);
    var kind = BL_KINDS[data.kind] || BL_KINDS.other;

    if (geo.lat != null && geo.lng != null) {
        // Real coordinates: a proper check-in (creates a Places record when the entry is saved)
        openCheckInForm({
            name: data.name, address: geo.address || loc || null, category: kind.label,
            fsqId: null, osmId: null, lat: geo.lat, lng: geo.lng, existingId: null
        }, false);
    } else {
        openAddJournalEntry();
    }

    // These must be set AFTER the open call above, which resets them
    window._journalSourceBucketId = itemId;
    window._journalCancelTarget   = '#bucketitem/' + itemId;

    var dateEl = document.getElementById('journalEntryDate');
    if (dateEl && data.visitedDate) {
        dateEl.value = data.visitedDate;
        if (typeof _journalUpdateDayOfWeek === 'function') _journalUpdateDayOfWeek(data.visitedDate);
    }
    var textEl = document.getElementById('journalEntryText');
    if (textEl) textEl.value = 'Visited ' + data.name + (loc ? ' (' + loc + ')' : '') + '.\n';
}

// ============================================================
// Trips (Life Projects → Locations)
// ============================================================

/** Open the trip picker for an item. */
async function blOpenTripModal(itemId, data) {
    var select = document.getElementById('blTripSelect');
    var status = document.getElementById('blTripStatus');
    var addBtn = document.getElementById('blTripAddBtn');
    status.textContent = 'Loading trips…';
    select.innerHTML = '';
    addBtn.disabled = true;

    document.getElementById('blTripCancelBtn').onclick = function() { closeModal('blTripModal'); };
    addBtn.onclick = function() { _blAddToTrip(itemId, data); };
    openModal('blTripModal');

    try {
        var snap = await userCol('lifeProjects').get();
        var already = (data.trips || []).map(function(t) { return t.projectId; });
        var trips = [];
        snap.forEach(function(d) {
            var p = d.data();
            if (p.template === 'vacation' && !p.archived) trips.push({ id: d.id, title: p.title || '(untitled trip)', start: p.startDate || '' });
        });
        trips.sort(function(a, b) { return (b.start || '').localeCompare(a.start || ''); });

        if (trips.length === 0) {
            status.textContent = 'You have no active vacation trips yet. Create one under Life → Projects first.';
            return;
        }
        trips.forEach(function(t) {
            var opt = document.createElement('option');
            opt.value = t.id;
            opt.dataset.title = t.title;
            var isAdded = already.indexOf(t.id) !== -1;
            opt.textContent = t.title + (t.start ? ' (' + t.start + ')' : '') + (isAdded ? ' — already added' : '');
            opt.disabled = isAdded;
            select.appendChild(opt);
        });
        // Select the first trip that doesn't already have it
        var firstFree = Array.from(select.options).find(function(o) { return !o.disabled; });
        if (firstFree) { select.value = firstFree.value; addBtn.disabled = false; status.textContent = ''; }
        else status.textContent = 'This item is already in all of your trips.';
    } catch (err) {
        console.error('Error loading trips:', err);
        status.textContent = 'Could not load trips.';
    }
}

/** "Add to trip" button in the trip picker dialog. */
async function _blAddToTrip(itemId, data) {
    var select = document.getElementById('blTripSelect');
    var status = document.getElementById('blTripStatus');
    var addBtn = document.getElementById('blTripAddBtn');
    var projectId = select.value;
    if (!projectId) return;
    var title = select.options[select.selectedIndex].dataset.title || '';

    addBtn.disabled = true;
    status.textContent = 'Adding…';
    try {
        var result = await blAddToTripCore(itemId, data, projectId, title);
        if (result === 'duplicate') { status.textContent = 'A location named "' + data.name + '" is already in that trip.'; return; }
        closeModal('blTripModal');
        loadBucketItemPage(itemId);
    } catch (err) {
        console.error('Error adding to trip:', err);
        status.textContent = 'Could not add to the trip: ' + err.message;
    } finally {
        addBtn.disabled = false;
    }
}

/**
 * Copy a bucket list item into a trip's Locations and link the two. Used by the trip picker and by
 * the trip page's "Bucket List nearby" section. Returns 'added' or 'duplicate'.
 * The item moves from Want to Planned, flagged plannedByTrip so it can move back if it leaves the trip.
 */
async function blAddToTripCore(itemId, data, projectId, title) {
    // Already a location with this name in the trip? Don't duplicate it.
    var dup = await lpSub(projectId, 'projectLocations').where('name', '==', data.name).get();
    if (!dup.empty) return 'duplicate';

    var geo = data.geo || {};
    var notes = [];
    if (data.why) notes.push(data.why);
    var timing = _blTimingText(data.timing);
    if (timing) notes.push('Best time: ' + timing);
    if (data.notes) notes.push(data.notes);
    notes.push('(From your Bucket List)');

    // Same shape the Locations form saves (see _lpSaveLocation in life-projects.js).
    // Only exact coordinates are copied; approximate map pins would skew drive-time lookups.
    var locData = {
        name   : data.name,
        address: geo.address || _blLocationText(geo) || '',
        phone  : '',
        website: data.website || '',
        contact: '',
        notes  : notes.join('\n'),
        lat    : geo.lat != null ? geo.lat : null,
        lng    : geo.lng != null ? geo.lng : null
    };
    var locRef = await lpLocationsCol().add(Object.assign({}, locData, { createdAt: firebase.firestore.FieldValue.serverTimestamp() }));
    var plRef = await lpSub(projectId, 'projectLocations').add(Object.assign({ locationId: locRef.id }, locData, { addedAt: firebase.firestore.FieldValue.serverTimestamp() }));

    var update = {
        trips    : firebase.firestore.FieldValue.arrayUnion({ projectId: projectId, title: title, projectLocationId: plRef.id }),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    // Going on a trip means it's planned (remembered as automatic so leaving the trip can undo it)
    if ((data.status || 'want') === 'want') { update.status = 'planned'; update.plannedByTrip = true; }
    await userCol('bucketList').doc(itemId).update(update);
    return 'added';
}

/**
 * When an item's page opens, drop any trips it is no longer part of (the trip was deleted, or the
 * location was unlinked/deleted on the trip page). If that leaves it in no trip and its "Planned"
 * status came from a trip, it goes back to Want. Redraws the page only if something changed.
 */
async function _blReconcileTrips(itemId, data) {
    var trips = data.trips || [];
    if (!trips.length) return;
    try {
        var keep = [];
        for (var i = 0; i < trips.length; i++) {
            var t = trips[i];
            var still = false;
            var proj = await userCol('lifeProjects').doc(t.projectId).get();
            if (proj.exists) {
                if (t.projectLocationId) {
                    still = (await lpSub(t.projectId, 'projectLocations').doc(t.projectLocationId).get()).exists;
                } else {
                    // Older links (before the location id was recorded): match by name
                    still = !(await lpSub(t.projectId, 'projectLocations').where('name', '==', data.name).get()).empty;
                }
            }
            if (still) keep.push(t);
        }
        if (keep.length === trips.length) return;

        var update = { trips: keep, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        if (keep.length === 0 && data.status === 'planned' && data.plannedByTrip) {
            update.status = 'want';
            update.plannedByTrip = false;
        }
        await userCol('bucketList').doc(itemId).update(update);
        if (window.location.hash === '#bucketitem/' + itemId) loadBucketItemPage(itemId);
    } catch (err) {
        console.warn('Could not check trips for this item:', err);
    }
}

// ============================================================
// Life Calendar
// ============================================================

/** Date → ISO yyyy-mm-dd (local). */
function _blIsoOf(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Work out when the item's "good time" next starts.
 * Returns { start: Date, end: Date|null, kind: 'dated'|'months' } or null if it has no usable timing.
 */
function _blNextWindow(timing) {
    if (!timing || timing.type === 'none' || !timing.type) return null;
    var today = new Date(); today.setHours(0, 0, 0, 0);

    if (timing.type === 'months') {
        var months = timing.months || [];
        if (!months.length) return null;
        // A run starts at a month whose previous month isn't in the list
        var starts = months.filter(function(m) { return months.indexOf(((m + 10) % 12) + 1) === -1; });
        if (!starts.length) return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: null, kind: 'months' };   // year-round
        var best = null;
        starts.forEach(function(m) {
            [today.getFullYear(), today.getFullYear() + 1].forEach(function(y) {
                var d = new Date(y, m - 1, 1);
                if (d >= today && (!best || d < best)) best = d;
            });
        });
        return best ? { start: best, end: null, kind: 'months' } : null;
    }

    var s = _blParseIso(timing.startDate);
    if (!s) return null;
    var e = _blParseIso(timing.type === 'range' ? timing.endDate : timing.startDate) || s;
    if (!timing.yearly) {
        var ds = new Date(s.y, s.m - 1, s.d), de = new Date(e.y, e.m - 1, e.d);
        return de >= today ? { start: ds, end: timing.type === 'range' ? de : null, kind: 'dated' } : null;
    }
    var wraps = (e.m < s.m) || (e.m === s.m && e.d < s.d);
    for (var y = today.getFullYear(); y <= today.getFullYear() + 1; y++) {
        var ys = new Date(y, s.m - 1, s.d), ye = new Date(y + (wraps ? 1 : 0), e.m - 1, e.d);
        if (ye >= today) return { start: ys, end: timing.type === 'range' ? ye : null, kind: 'dated' };
    }
    return null;
}

/** Open the "Add to calendar" dialog. */
function blOpenCalendarModal(itemId, data) {
    var win = _blNextWindow(data.timing);
    var body = document.getElementById('blCalBody');
    var status = document.getElementById('blCalStatus');
    var createBtn = document.getElementById('blCalCreateBtn');
    status.textContent = '';
    document.getElementById('blCalCancelBtn').onclick = function() { closeModal('blCalModal'); };

    if (!win) {
        body.innerHTML = '<p class="bl-import-intro">This item has no upcoming date or time of year, so there is nothing to put on the calendar. ' +
                         'Edit the item and set <strong>When</strong> first.</p>';
        createBtn.classList.add('hidden');
        openModal('blCalModal');
        return;
    }
    createBtn.classList.remove('hidden');

    var startText = _blFmtDate(_blIsoOf(win.start), true);
    var html = '';
    if (win.kind === 'dated') {
        var endText = win.end ? ' – ' + _blFmtDate(_blIsoOf(win.end), true) : '';
        html += '<label class="bl-inline-check"><input type="radio" name="blCalMode" value="event" checked> Put the event on the calendar: <strong>' +
                escapeHtml(startText + endText) + '</strong></label>';
        html += '<label class="bl-inline-check"><input type="radio" name="blCalMode" value="reminder"> Just remind me before it starts</label>';
    } else {
        html += '<p class="bl-import-intro">The best time starts around <strong>' + escapeHtml(startText) + '</strong>. ' +
                'This creates a reminder before then.</p>';
        html += '<input type="radio" name="blCalMode" value="reminder" checked class="hidden">';
    }
    html += '<div class="form-group" id="blCalLeadRow"><label for="blCalLead">Remind me</label>' +
            '<select id="blCalLead"><option value="7">1 week before</option><option value="14" selected>2 weeks before</option>' +
            '<option value="30">1 month before</option><option value="60">2 months before</option></select></div>';
    html += '<p class="bl-import-status" id="blCalPreview"></p>';
    body.innerHTML = html;

    function refresh() {
        var mode = document.querySelector('input[name="blCalMode"]:checked').value;
        document.getElementById('blCalLeadRow').classList.toggle('hidden', mode !== 'reminder');
        if (mode === 'reminder') {
            var lead = parseInt(document.getElementById('blCalLead').value, 10);
            var when = _blReminderDate(win.start, lead);
            document.getElementById('blCalPreview').textContent = 'Reminder on ' + _blFmtDate(_blIsoOf(when), true) + '.';
        } else {
            document.getElementById('blCalPreview').textContent = '';
        }
    }
    body.querySelectorAll('input[name="blCalMode"]').forEach(function(r) { r.onchange = refresh; });
    document.getElementById('blCalLead').onchange = refresh;
    refresh();

    createBtn.onclick = function() { _blCreateCalendarEvent(itemId, data, win); };
    openModal('blCalModal');
}

/** Reminder date = window start minus lead days, but never in the past. */
function _blReminderDate(start, leadDays) {
    var d = new Date(start.getTime() - leadDays * 86400000);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    return d < today ? today : d;
}

/** Create the Life Calendar event (same document shape the QuickLog "Add Reminder" writes). */
async function _blCreateCalendarEvent(itemId, data, win) {
    var status = document.getElementById('blCalStatus');
    var btn = document.getElementById('blCalCreateBtn');
    var mode = document.querySelector('input[name="blCalMode"]:checked').value;
    btn.disabled = true;
    status.textContent = 'Saving…';

    var geo = data.geo || {};
    var desc = [];
    if (data.why) desc.push(data.why);
    var timing = _blTimingText(data.timing);
    if (timing) desc.push('Best time: ' + timing);
    if (data.website) desc.push(data.website);
    desc.push('(From your Bucket List)');

    var doc = {
        title      : data.name,
        description: desc.join('\n'),
        location   : _blLocationText(geo),
        status     : 'upcoming',
        reminders  : [{ method: 'popup', minutes: 1440 }, { method: 'popup', minutes: 5 }],
        createdAt  : firebase.firestore.FieldValue.serverTimestamp()
    };
    if (mode === 'event') {
        doc.startDate = _blIsoOf(win.start);
        doc.endDate   = win.end ? _blIsoOf(win.end) : null;
    } else {
        var lead = parseInt(document.getElementById('blCalLead').value, 10);
        doc.title     = 'Plan: ' + data.name + ' is coming up';
        doc.startDate = _blIsoOf(_blReminderDate(win.start, lead));
        doc.endDate   = null;
    }

    try {
        var ref = await userCol('lifeEvents').add(doc);
        // Sync to Google Calendar when connected (fire-and-forget, as the other Life Calendar writers do)
        if (typeof gcalIsConnected === 'function' && gcalIsConnected() && typeof gcalSyncLifeEvent === 'function') {
            userCol('lifeEvents').doc(ref.id).get().then(function(snap) {
                if (snap.exists) gcalSyncLifeEvent({ id: snap.id, ...snap.data() });
            }).catch(function(e) { console.warn('gcalSyncLifeEvent error:', e); });
        }
        closeModal('blCalModal');
        alert('Added to your Life Calendar on ' + _blFmtDate(doc.startDate, true) + '.');
    } catch (err) {
        console.error('Error creating calendar event:', err);
        status.textContent = 'Could not save: ' + err.message;
    } finally {
        btn.disabled = false;
    }
}

// ============================================================
// Filtered view (used by SecondBrain "show my bucket list")
// ============================================================

/**
 * Open the Bucket List with filters applied.
 * q: { country, region, city, kind, month (1-12 or 'now'), status, text } — all optional.
 */
async function bucketListShowFiltered(q) {
    q = q || {};
    var statuses = ['active', 'want', 'planned', 'visited', 'dismissed', 'all'];
    var month = (q.month === 'now') ? 'now' : (parseInt(q.month, 10) >= 1 && parseInt(q.month, 10) <= 12 ? String(parseInt(q.month, 10)) : '');

    _blFilters = {
        text    : (q.text || '').trim().toLowerCase(),
        status  : statuses.indexOf(q.status) !== -1 ? q.status : 'active',
        kind    : BL_KINDS[q.kind] ? q.kind : '',
        priority: '',
        month   : month,
        sort    : 'priority'
    };

    try { await _blLoadItems(); } catch (e) { /* the list page will report load errors */ }
    _blEditId = null;
    // Use the spelling already on the list so "ireland" finds "Ireland"
    _blBrowse = {
        country: q.country ? _blCanonPlace(q.country, 'country') : '',
        region : q.region  ? _blCanonPlace(q.region,  'region')  : '',
        city   : q.city    ? _blCanonPlace(q.city,    'city')    : ''
    };
    // A region or city with no country can't be drilled to, so search for it by name instead
    if (!_blBrowse.country && (_blBrowse.region || _blBrowse.city)) {
        _blFilters.text = (_blBrowse.city || _blBrowse.region).toLowerCase();
        _blBrowse = { country: '', region: '', city: '' };
    }
    _blView = 'list';

    if (window.location.hash === '#bucketlist') loadBucketListPage();
    else window.location.hash = '#bucketlist';
}

// ============================================================
// Share target (phone share sheet → Bucket List)
// ============================================================

/**
 * If the app was just opened by the phone's share sheet (URL has ?share=1), collect what the
 * service worker stashed and put it to use:
 *   • shared image(s) → the screenshot import dialog, with any shared text as the caption hint
 *   • only a link/text → the Add dialog pre-filled (name, the link under Other links, notes)
 * Called from initApp() in app.js, so it only runs after sign-in.
 */
async function bucketShareCheck() {
    if (!/[?&]share=1(&|$)/.test(window.location.search)) return;
    // Remove ?share=1 straight away so a refresh doesn't replay the share
    history.replaceState(null, '', window.location.pathname + window.location.hash);
    if (!window.caches) return;

    var meta = null, files = [];
    try {
        var cache = await caches.open('bishop-share');
        var metaRes = await cache.match('/SecondBrain/__share/meta');
        if (!metaRes) return;
        meta = await metaRes.json();
        for (var i = 0; i < (meta.fileCount || 0); i++) {
            var res = await cache.match('/SecondBrain/__share/file-' + i);
            if (!res) continue;
            var blob = await res.blob();
            files.push(new File([blob], decodeURIComponent(res.headers.get('X-File-Name') || 'shared.jpg'), { type: blob.type }));
        }
        // One-shot: clear it so it can't be imported twice
        var keys = await cache.keys();
        await Promise.all(keys.map(function(k) { return cache.delete(k); }));
    } catch (err) {
        console.warn('Could not read the shared content:', err);
        return;
    }

    // Android usually puts the link inside the text; pull it out
    var combined = [meta.title, meta.text, meta.url].filter(Boolean).join('\n');
    var urlMatch = (meta.url || meta.text || '').match(/https?:\/\/\S+/);
    var sharedUrl = urlMatch ? urlMatch[0] : '';
    var textNoUrl = (meta.text || '').replace(sharedUrl, '').trim();

    if (files.length) {
        openBucketImportModal();
        await _blimpAddFiles(files);
        _blimpSharedUrl = sharedUrl;   // kept as a link on each item that gets imported
        // The AI can't open links, so leave the URL out of the hint text it sees
        document.getElementById('blImportHint').value = [meta.title, textNoUrl].filter(Boolean).join(String.fromCharCode(10));
        _blimpStatus('Shared screenshot ready. Tap Read with AI.');
        return;
    }
    if (!combined.trim()) return;

    var firstLine = (meta.title || textNoUrl.split('\n')[0] || '').trim().slice(0, 80);
    _blOpenModal(null, {
        name : firstLine,
        notes: textNoUrl && textNoUrl !== firstLine ? textNoUrl : null,
        links: sharedUrl ? [{ url: sharedUrl, label: 'Shared link' }] : []
    });
}

// ============================================================
// Shared screenshot (one imported screenshot shown on several items)
// ============================================================

/**
 * Show screenshots that were imported along with this item but are stored on another item from the
 * same import (photos.alsoTargetIds). Tapping one toggles a larger view.
 */
async function _blLoadSharedPhotos(itemId) {
    var wrap = document.getElementById('blSharedPhotos');
    if (!wrap) return;
    wrap.innerHTML = '';
    try {
        var snap = await userCol('photos').where('alsoTargetIds', 'array-contains', itemId).get();
        if (snap.empty) return;
        var head = document.createElement('div');
        head.className = 'bl-unplaced-head';
        head.textContent = 'Screenshot shared with other places from the same import (tap to enlarge)';
        wrap.appendChild(head);
        snap.forEach(function(doc) {
            var img = document.createElement('img');
            img.className = 'bl-shared-photo';
            img.src = doc.data().imageData;
            img.alt = doc.data().caption || 'Imported screenshot';
            img.onclick = function() { img.classList.toggle('bl-shared-photo--big'); };
            wrap.appendChild(img);
        });
    } catch (err) {
        console.warn('Could not load shared screenshots:', err);
    }
}

// ============================================================
// Trip page: "Bucket List nearby"
// ============================================================

var BL_TRIP_NEARBY_MILES = 100;

/**
 * Fill the trip page's "Bucket List nearby" section (life-projects.js accordion 'bucketNearby'):
 * Want/Planned items within 100 miles of any of the trip's locations that have coordinates,
 * nearest first, each with a one-tap "+ Add" to the trip's Locations.
 */
async function blLoadTripNearby(projectId) {
    var body = document.getElementById('lpBody_bucketNearby');
    if (!body) return;
    var refs = (typeof _lpLocations !== 'undefined' ? _lpLocations : []).filter(function(l) { return l.lat != null && l.lng != null; });
    if (!refs.length) {
        body.innerHTML = '<p class="bl-near-msg">Add a location with coordinates to this trip (Locations → Find a place) and Bucket List places near it will show here.</p>';
        return;
    }
    body.innerHTML = '<p class="bl-near-msg">Looking for nearby Bucket List places…</p>';

    try {
        await _blLoadItems();
        var active = _blItems.filter(function(it) { var s = it.data.status || 'want'; return s === 'want' || s === 'planned'; });
        // Items without a pin yet get one first (about a second each, done once)
        var statusEl = body.querySelector('.bl-near-msg');
        await blEnsurePins(active, statusEl, function() { return !!document.getElementById('lpBody_bucketNearby'); });

        var rows = [];
        active.forEach(function(it) {
            var p = _blPoint(it.data);
            if (!p) return;
            var best = null;
            refs.forEach(function(l) {
                var mi = _blMiles({ lat: l.lat, lng: l.lng }, p);
                if (!best || mi < best.mi) best = { mi: mi, loc: l.name };
            });
            if (best && best.mi <= BL_TRIP_NEARBY_MILES) rows.push({ it: it, mi: best.mi, loc: best.loc });
        });
        rows.sort(function(a, b) { return a.mi - b.mi; });

        if (!rows.length) {
            body.innerHTML = '<p class="bl-near-msg">No Bucket List places within ' + BL_TRIP_NEARBY_MILES + ' miles of this trip’s locations.</p>';
            return;
        }
        var title = (typeof _lpCurrentProject !== 'undefined' && _lpCurrentProject) ? (_lpCurrentProject.title || '') : '';
        body.innerHTML = '';
        rows.forEach(function(r) {
            var inTrip = (r.it.data.trips || []).some(function(t) { return t.projectId === projectId; });
            var row = document.createElement('div');
            row.className = 'bl-near-row';
            var info = document.createElement('div');
            info.className = 'bl-near-info';
            var a = document.createElement('a');
            a.href = '#bucketitem/' + r.it.id;
            a.textContent = (BL_KINDS[r.it.data.kind] || BL_KINDS.other).icon + ' ' + r.it.data.name;
            var sub = document.createElement('div');
            sub.className = 'bl-near-sub';
            var timing = _blTimingText(r.it.data.timing);
            sub.textContent = _blMilesLabel(r.mi) + ' from ' + r.loc + (timing ? ' · ' + timing : '');
            info.appendChild(a);
            info.appendChild(sub);
            row.appendChild(info);
            if (inTrip) {
                var done = document.createElement('span');
                done.className = 'bl-near-added';
                done.textContent = '✓ In this trip';
                row.appendChild(done);
            } else {
                var btn = document.createElement('button');
                btn.className = 'btn btn-primary btn-small';
                btn.textContent = '+ Add';
                btn.onclick = async function() {
                    btn.disabled = true;
                    btn.textContent = 'Adding…';
                    try {
                        var res = await blAddToTripCore(r.it.id, r.it.data, projectId, title);
                        btn.textContent = res === 'duplicate' ? 'Already a location' : '✓ Added';
                        if (typeof _lpLoadLocations === 'function') _lpLoadLocations();   // refresh the Locations section
                    } catch (err) {
                        console.error('Add to trip failed:', err);
                        btn.disabled = false;
                        btn.textContent = '+ Add';
                        alert('Could not add it: ' + err.message);
                    }
                };
                row.appendChild(btn);
            }
            body.appendChild(row);
        });
    } catch (err) {
        console.error('Bucket List nearby failed:', err);
        body.innerHTML = '<p class="bl-near-msg">Could not load Bucket List places.</p>';
    }
}

// ============================================================
// Check-in nudge
// ============================================================

var BL_CHECKIN_RADIUS_MILES = 0.5;

/**
 * After a check-in is saved (journal.js), see whether a Want/Planned item has its pin within half a
 * mile; if so, offer to mark it Visited and link it to the check-in's journal entry.
 * Town/region/country items are skipped (their pin is just a center point).
 */
async function blCheckinNudge(lat, lng, journalEntryId, date) {
    if (lat == null || lng == null) return;
    try {
        await _blLoadItems();
        var best = null;
        _blItems.forEach(function(it) {
            var s = it.data.status || 'want';
            if (s !== 'want' && s !== 'planned') return;
            if (['country', 'region', 'town'].indexOf(it.data.kind) !== -1) return;
            var p = _blPoint(it.data);
            if (!p) return;
            var mi = _blMiles({ lat: lat, lng: lng }, p);
            if (mi <= BL_CHECKIN_RADIUS_MILES && (!best || mi < best.mi)) best = { it: it, mi: mi };
        });
        if (!best) return;
        if (!confirm('🗺️ "' + best.it.data.name + '" is on your Bucket List.\n\nMark it as visited?')) return;
        var update = { status: 'visited', visitedDate: date || _blTodayIso(), plannedByTrip: false,
                       updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        if (!best.it.data.visitedJournalId && journalEntryId) update.visitedJournalId = journalEntryId;
        await userCol('bucketList').doc(best.it.id).update(update);
    } catch (err) {
        console.warn('Bucket List check-in nudge failed:', err);
    }
}

// ============================================================
// Life page: "Bucket List — coming up"
// ============================================================

/**
 * Under the Life page's Coming Up section: Want/Planned items that are in season or happening now,
 * or whose season/dates start within 30 days. Soonest first, up to 8.
 */
async function blRenderLifeComingUp() {
    var section = document.getElementById('lifeBucketSection');
    if (!section) return;
    section.innerHTML = '';
    section.style.display = 'none';
    try {
        await _blLoadItems();
        var today = new Date(); today.setHours(0, 0, 0, 0);
        var thisMonth = today.getMonth() + 1;
        var rows = [];
        _blItems.forEach(function(it) {
            var s = it.data.status || 'want';
            if (s !== 'want' && s !== 'planned') return;
            var t = it.data.timing;
            if (!t || !t.type || t.type === 'none') return;
            var label = null, sortKey = null;
            if (t.type === 'months') {
                if ((t.months || []).length === 12) return;   // year-round: never "coming up"
                if ((t.months || []).indexOf(thisMonth) !== -1) { label = 'In season now'; sortKey = 0; }
            } else {
                var win = _blNextWindow(t);
                if (win && win.start <= today && (!win.end || win.end >= today)) { label = 'Happening now'; sortKey = 0; }
            }
            if (!label) {
                var next = _blNextWindow(t);
                if (!next) return;
                var days = Math.round((next.start - today) / 86400000);
                if (days < 0 || days > 30) return;
                label = days === 0 ? 'Starts today' : days === 1 ? 'Starts tomorrow' : 'Starts in ' + days + ' days';
                sortKey = days;
            }
            rows.push({ it: it, label: label, sortKey: sortKey });
        });
        if (!rows.length) return;
        rows.sort(function(a, b) { return a.sortKey - b.sortKey || (a.it.data.priority || 2) - (b.it.data.priority || 2); });

        var html = '<h3 class="life-calendar-heading">🗺️ Bucket List — coming up</h3>';
        rows.slice(0, 8).forEach(function(r) {
            var g = r.it.data.geo || {};
            var where = g.city || g.region || g.country || '';
            var timing = _blTimingText(r.it.data.timing);
            html += '<div class="life-cal-item">' +
                        '<div class="life-cal-info">' +
                            '<a class="life-cal-label life-cal-event-link" href="#bucketitem/' + encodeURIComponent(r.it.id) + '">' + escapeHtml(r.it.data.name) + '</a>' +
                            '<span class="life-cal-age">' + escapeHtml([where, timing].filter(Boolean).join(' · ')) + '</span>' +
                        '</div>' +
                        '<span class="life-cal-days">' + escapeHtml(r.label) + '</span>' +
                    '</div>';
        });
        if (rows.length > 8) html += '<a class="bl-coming-more" href="#bucketlist" onclick="_blFilters.month=\'now\'">See all ' + rows.length + ' →</a>';
        section.innerHTML = html;
        section.style.display = '';
    } catch (err) {
        console.warn('Bucket List coming up failed:', err);
    }
}

// ============================================================
// Google and "Ask an AI"
// ============================================================

/** A short natural-language question for Google (sent in the web address, so kept brief). */
function blGoogleQuestion(data) {
    var loc = _blLocationText(data.geo || {});
    var timing = _blTimingText(data.timing);
    return 'Tell me about ' + data.name + (loc ? ' in ' + loc : '') + ': what it is, why people visit, the best time to go' +
           (timing ? ' (I was thinking ' + timing + ')' : '') +
           ', how long to spend there, costs or tickets, tips, and what else is nearby.';
}

/** "🔎 Google": open Google's AI Mode with the question already typed in (and copy it, just in case). */
function blOpenGoogle(data) {
    var q = blGoogleQuestion(data);
    try { if (navigator.clipboard) navigator.clipboard.writeText(q).catch(function() {}); } catch (e) { /* optional */ }
    // udm=50 opens Google's AI Mode; where that isn't available Google shows normal results for the same question
    window.open('https://www.google.com/search?udm=50&q=' + encodeURIComponent(q), '_blank', 'noopener');
}

/**
 * Build a complete prompt for any AI chat app: everything known about the item (including facts and
 * saved links), where the user lives, and a list of what to cover.
 */
async function blBuildAskPrompt(itemId, data) {
    var geo = data.geo || {};
    var kind = BL_KINDS[data.kind] || BL_KINDS.other;
    var home = '';
    var facts = [];
    try {
        var main = await userCol('settings').doc('main').get();
        home = (main.exists && main.data().cityState) ? main.data().cityState.trim() : '';
        var fsnap = await userCol('facts').where('targetType', '==', 'bucketItem').where('targetId', '==', itemId).get();
        fsnap.forEach(function(d) { var f = d.data(); if (f.label || f.value) facts.push((f.label || '') + ': ' + (f.value || '')); });
    } catch (e) { /* the prompt still works without these */ }

    var about = [];
    function add(label, value) { if (value) about.push('- ' + label + ': ' + value); }
    add('Name', data.name);
    add('Type', kind.label);
    add('Location', _blLocationText(geo));
    add('Address', geo.address);
    if (geo.lat != null && geo.lng != null) add('Coordinates', geo.lat + ', ' + geo.lng);
    add('Best time (my note)', _blTimingText(data.timing));
    add('Why I saved it', data.why);
    add('My notes', data.notes);
    add('Tags', (data.tags || []).join(', '));
    add('Website', data.website);
    (data.links || []).forEach(function(l) { add('Link I saved' + (l.label ? ' (' + l.label + ')' : ''), l.url); });
    facts.forEach(function(f) { add('Fact I recorded', f); });
    var status = BL_STATUSES[data.status || 'want'] || 'Want';
    add('Status', status + (data.visitedDate ? ' (visited ' + _blFmtDate(data.visitedDate, true) + ')' : '') +
                   ', priority ' + (BL_PRIORITIES[data.priority || 2] || 'Medium'));
    if (data.trips && data.trips.length) add('Part of my trip(s)', data.trips.map(function(t) { return t.title; }).join(', '));

    var me = [];
    if (home) me.push('- I live near: ' + home);
    me.push("- Today's date: " + _blFmtDate(_blTodayIso(), true));

    return [
        'This place is on my travel bucket list. Tell me everything useful about it so I can decide when and how to go.',
        '',
        'WHAT I ALREADY HAVE',
        about.join('\n'),
        '',
        'ABOUT ME',
        me.join('\n'),
        '',
        'PLEASE COVER',
        '1. What it is and what makes it special (2-3 sentences).',
        '2. The best time to visit: months or season, day of week and time of day, crowds and weather.' +
            (_blTimingText(data.timing) ? ' Tell me if my "best time" note is right.' : ''),
        '3. Getting there' + (home ? ' from where I live' : '') + ': distance, drive or flight time, nearest airport and town, and parking.',
        '4. Costs: entry fees, passes, reservations or timed tickets, and how far ahead to book.',
        '5. How long to spend there, with a suggested half-day or full-day plan.',
        '6. Practical tips: difficulty and accessibility, what to bring, seasonal closures, pets, photography.',
        '7. Other things within about an hour that are worth combining with it, one line each.',
        '8. A few places to stay and eat nearby, across budgets.',
        '9. Anything that has changed recently or that I should double-check before going.',
        '',
        'If you are unsure about something, especially prices, opening hours or dates, say so rather than guessing, and tell me where to check.'
    ].join('\n');
}

/** "🤖 Ask AI about it": the shared Ask AI dialog (askai.js) with the full prompt. */
function blOpenAskAi(itemId, data) {
    openAskAiModal('Ask an AI About This Place', blBuildAskPrompt(itemId, data));
}
