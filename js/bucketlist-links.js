// ============================================================
// bucketlist-links.js — Bucket List integrations with the rest of the app
//
//   • Log visit in journal  (journal.js check-in / entry form, back-linked via visitedJournalId)
//   • Add to trip           (Life Projects → project Locations)
//   • Add to calendar       (Life Calendar event or reminder)
//   • bucketListShowFiltered() — used by SecondBrain "show my bucket list" queries
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

/** Copy the item into the chosen trip's Locations list and link the two. */
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
        // Already a location with this name in the trip? Don't duplicate it.
        var dup = await lpSub(projectId, 'projectLocations').where('name', '==', data.name).get();
        if (!dup.empty) { status.textContent = 'A location named "' + data.name + '" is already in that trip.'; return; }

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
        await lpSub(projectId, 'projectLocations').add(Object.assign({ locationId: locRef.id }, locData, { addedAt: firebase.firestore.FieldValue.serverTimestamp() }));

        var update = {
            trips    : firebase.firestore.FieldValue.arrayUnion({ projectId: projectId, title: title }),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        // Going on a trip means it's planned
        if ((data.status || 'want') === 'want') update.status = 'planned';
        await userCol('bucketList').doc(itemId).update(update);

        closeModal('blTripModal');
        loadBucketItemPage(itemId);
    } catch (err) {
        console.error('Error adding to trip:', err);
        status.textContent = 'Could not add to the trip: ' + err.message;
    } finally {
        addBtn.disabled = false;
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
