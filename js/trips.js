// ============================================================
// trips.js — Unplanned Trips (Life Projects template "trip")
// A trip is started, collects tagged journal entries / check-ins
// (journalEntries.tripId) while active, and is ended with "Done".
// Reuses the lifeProjects collection, its People section, and the
// journal entry form. Loaded after journal.js and life-projects.js.
// ============================================================

// ---------- Data helpers ----------

/** Names of known trips by id, for the journal feed badge. */
let _tripNamesMap = {};

/** All non-archived trips (template 'trip'), newest first. */
async function tripListAll() {
    const snap = await lpCol().where('template', '==', 'trip').get();
    const trips = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => !t.archived);
    trips.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    trips.forEach(t => { _tripNamesMap[t.id] = t.title; });
    return trips;
}

/** Trips currently in progress (status 'active'), most recently started first. */
async function tripListActive() {
    const all = await tripListAll();
    return all.filter(t => t.status === 'active')
        .sort((a, b) => (b.startedAt?.seconds || 0) - (a.startedAt?.seconds || 0));
}

/** Refresh the id→title map (called before the journal feed renders). */
async function tripLoadNames() {
    try { await tripListAll(); } catch (e) { console.warn('tripLoadNames:', e); }
}

// ---------- Journal page banner ----------

/** Show "Trip in progress" on the journal page while a trip is active. */
async function tripRenderJournalBanner() {
    const el = document.getElementById('journalTripBanner');
    if (!el) return;
    el.innerHTML = '';
    try {
        const active = await tripListActive();
        if (!active.length) return;
        el.innerHTML = active.map(t => `
            <div style="background:#ecfdf5; border:1px solid #6ee7b7; border-radius:8px; padding:8px 12px; margin:0 0 10px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span>🧭 <strong>${_lpEsc(t.title)}</strong> is in progress</span>
                <a href="#life-project/${t.id}" class="btn btn-small">Open trip</a>
            </div>`).join('');
    } catch (e) { console.warn('tripRenderJournalBanner:', e); }
}

// ---------- Journal entry form: trip picker ----------

let _tripPickerTrips = [];        // trips offered in the picker
let _tripAutoAdded = new Set();   // contact ids this picker added to the entry's mentions

/**
 * Populate the Trip row on the journal entry form.
 * Add mode: defaults to the active trip (or the trip whose page the user came from)
 * and mentions its people. Edit mode: shows the entry's current trip.
 */
async function tripPickerInit() {
    const group = document.getElementById('journalTripGroup');
    const sel = document.getElementById('journalTripSelect');
    if (!group || !sel) return;
    group.classList.add('hidden');
    _tripAutoAdded = new Set();
    try {
        const editing = !!(window.journalEditMode && window.currentJournalEntry);
        const entryTripId = editing ? (window.currentJournalEntry.tripId || '') : '';
        const trips = await tripListAll();
        _tripPickerTrips = trips;

        // Add mode: pre-select the trip from the trip page, else the active trip
        let selected = entryTripId;
        if (!editing && !window._journalSourceVisitId) {
            const pre = window._tripPreselect;
            if (pre && trips.some(t => t.id === pre)) selected = pre;
            else {
                const active = trips.filter(t => t.status === 'active')
                    .sort((a, b) => (b.startedAt?.seconds || 0) - (a.startedAt?.seconds || 0));
                if (active.length) selected = active[0].id;
            }
        }
        window._tripPreselect = null;

        // Offer active trips (and the entry's own trip); an edit/backfill can pick any trip
        const offered = trips.filter(t => editing || t.status === 'active' || t.id === selected);
        if (!offered.length) return;
        sel.innerHTML = '<option value="">None</option>' +
            offered.map(t => `<option value="${t.id}">${_lpEsc(t.title)}${t.status === 'active' ? '' : ' (' + (LP_STATUSES[t.status]?.label || t.status) + ')'}</option>`).join('');
        sel.value = selected;
        group.classList.remove('hidden');

        await _journalLoadPeopleCache();
        tripPickerChanged(!editing);
    } catch (e) { console.warn('tripPickerInit:', e); }
}

/** Trip dropdown changed (or initial fill): redraw the "With" checkboxes. */
function tripPickerChanged(autoAddPeople) {
    const sel = document.getElementById('journalTripSelect');
    const box = document.getElementById('journalTripPeople');
    if (!sel || !box) return;
    // Drop people a previous trip selection added automatically
    _tripAutoAdded.forEach(id => _journalMentionedPersonIds.delete(id));
    _tripAutoAdded = new Set();
    const trip = _tripPickerTrips.find(t => t.id === sel.value);
    const people = (trip?.people || []).filter(p => p.contactId);
    if (autoAddPeople === true || (autoAddPeople !== false && !(window.journalEditMode))) {
        people.forEach(p => {
            if (!_journalMentionedPersonIds.has(p.contactId)) {
                _journalMentionedPersonIds.add(p.contactId);
                _tripAutoAdded.add(p.contactId);
            }
        });
    }
    _updateMentionChips();
    if (!people.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div style="font-size:0.85em; color:#666; margin:6px 0 2px;">With (untick to leave out):</div>' +
        people.map(p => `
            <label style="display:inline-flex; align-items:center; gap:4px; margin:2px 10px 2px 0; cursor:pointer;">
                <input type="checkbox" ${_journalMentionedPersonIds.has(p.contactId) ? 'checked' : ''}
                       onchange="tripPickerPersonToggle('${p.contactId}', this.checked)">
                ${_lpEsc(p.name)}
            </label>`).join('');
}

/** A trip person was ticked/unticked: add/remove them from the entry's mentions. */
function tripPickerPersonToggle(contactId, on) {
    if (on) _journalMentionedPersonIds.add(contactId);
    else { _journalMentionedPersonIds.delete(contactId); _tripAutoAdded.delete(contactId); }
    _updateMentionChips();
}

/** Selected trip id for the entry being saved ('' when none / picker hidden). */
function tripPickerValue() {
    const group = document.getElementById('journalTripGroup');
    const sel = document.getElementById('journalTripSelect');
    if (!group || !sel || group.classList.contains('hidden')) return '';
    return sel.value || '';
}

// ---------- Trip detail page ----------

/** Render the trip detail page (called from _lpRenderDetailPage when template is 'trip'). */
async function tripRenderPage(page) {
    const p = _lpCurrentProject;
    const tpl = LP_TEMPLATES.trip;
    const isActive = p.status === 'active';
    const isDone = p.status === 'done';
    const statusLabel = isActive ? 'In progress' : (isDone ? 'Done' : 'Not started');
    const statusColor = isActive ? '#16a34a' : (isDone ? '#6b7280' : '#2563eb');
    const dateRange = _lpFormatDateRange(p.startDate, p.endDate);

    const mainBtn = isActive
        ? '<button class="btn btn-danger" onclick="tripEnd()">⏹ Done — end trip</button>'
        : (isDone
            ? '<button class="btn" onclick="tripStart()">▶ Resume trip</button>'
            : '<button class="btn btn-primary" onclick="tripStart()">▶ Start trip</button>');

    page.innerHTML = `
        <div class="page-header" style="flex-wrap:wrap; gap:8px;">
            <button class="back-btn" onclick="location.hash='#life-projects'">&larr;</button>
            <h2 style="flex:1; min-width:0;">${tpl.icon} ${_lpEsc(p.title)}</h2>
            <span style="background:${statusColor};color:#fff;font-size:0.75em;padding:2px 10px;border-radius:12px;">${statusLabel}</span>
        </div>
        <div style="padding:16px;">
            ${dateRange ? `<p style="color:#888; font-size:0.9em; margin-bottom:8px;">${dateRange}</p>` : ''}
            ${p.description ? `<p style="color:#555; margin-bottom:12px;">${_lpEsc(p.description)}</p>` : ''}
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;">
                ${mainBtn}
                <button class="btn" onclick="tripAddEntry(true)">📍 Check In</button>
                <button class="btn" onclick="tripAddEntry(false)">📝 Journal Entry</button>
                <button class="btn" onclick="tripToggleBackfill()">🏷️ Tag existing entries</button>
            </div>
            <div id="tripBackfill" class="hidden" style="border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:16px;"></div>
            <h3 style="margin:0 0 6px;">👥 People</h3>
            <div id="lpBody_people" style="margin-bottom:16px;"></div>
            <h3 style="margin:0 0 6px;">Timeline</h3>
            <div id="tripTimeline"><p style="color:#999;">Loading…</p></div>
        </div>`;
    _lpLoadPeople();
    tripLoadTimeline();
}

async function tripStart() {
    const p = _lpCurrentProject;
    try {
        const upd = { status: 'active', mode: 'travel', startedAt: firebase.firestore.FieldValue.serverTimestamp(),
                      updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        if (!p.startDate) upd.startDate = journalFormatDate(new Date());
        if (p.status === 'done') upd.endDate = null;
        await lpCol().doc(p.id).update(upd);
        Object.assign(p, upd);
        _lpRenderDetailPage(document.getElementById('page-life-project'));
    } catch (e) { console.error('tripStart:', e); alert('Could not start the trip.'); }
}

async function tripEnd() {
    if (!confirm('End this trip? New check-ins and journal entries will stop being tagged to it.')) return;
    const p = _lpCurrentProject;
    try {
        const upd = { status: 'done', endDate: journalFormatDate(new Date()),
                      updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        await lpCol().doc(p.id).update(upd);
        Object.assign(p, upd);
        _lpRenderDetailPage(document.getElementById('page-life-project'));
    } catch (e) { console.error('tripEnd:', e); alert('Could not end the trip.'); }
}

/** Start a check-in or journal entry from the trip page, pre-set to this trip. */
function tripAddEntry(isCheckin) {
    window._tripPreselect = _lpCurrentProject.id;
    if (isCheckin) openCheckIn(); else openAddJournalEntry();
}

// ---------- Timeline ----------

async function tripLoadTimeline() {
    const box = document.getElementById('tripTimeline');
    if (!box) return;
    try {
        const snap = await userCol('journalEntries').where('tripId', '==', _lpCurrentProject.id).get();
        const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (!entries.length) {
            box.innerHTML = '<p style="color:#999;">Nothing tagged to this trip yet. Check-ins and journal entries made while the trip is active show up here.</p>';
            return;
        }
        entries.sort((a, b) => ((a.date || '') + (a.entryTime || '')).localeCompare((b.date || '') + (b.entryTime || '')));

        // Place names for check-ins
        const placeIds = [...new Set(entries.flatMap(e => e.placeIds || []))];
        const names = {};
        await Promise.all(placeIds.map(async pid => {
            const d = await userCol('places').doc(pid).get();
            names[pid] = d.exists ? (d.data().name || '(Place)') : '(Place)';
        }));

        let html = '', lastDate = null;
        entries.forEach(e => {
            if (e.date !== lastDate) {
                lastDate = e.date;
                html += `<h4 style="margin:14px 0 6px; color:#374151;">${_lpEsc(journalFormatDateHeader(e.date))}</h4>`;
            }
            const time = e.entryTime ? journalFormatTime12(e.entryTime) : '';
            const where = (e.placeIds || []).map(pid => `<a href="#place/${pid}">${_lpEsc(names[pid])}</a>`).join(', ');
            const photos = (e.photos || []).map(ph => `<img class="journal-feed-photo" src="${ph.imageData}" onclick="journalOpenPhotoViewer(this)" alt="photo">`).join('');
            html += `
                <div class="card" style="margin-bottom:8px; padding:10px;">
                    <div style="display:flex; justify-content:space-between; gap:8px;">
                        <div style="min-width:0; flex:1;">
                            <div style="color:#666; font-size:0.85em;">${e.isCheckin ? '📍' : '📝'} ${_lpEsc(time)} ${where ? '· ' + where : ''}</div>
                            ${e.entryText ? `<div style="white-space:pre-wrap; margin-top:4px;">${_lpEsc(e.entryText)}</div>` : ''}
                            ${photos ? `<div class="journal-feed-photos" style="margin-top:6px;">${photos}</div>` : ''}
                        </div>
                        <button class="btn btn-secondary btn-small" style="align-self:flex-start;" onclick="openEditJournalEntry('${e.id}')">Edit</button>
                    </div>
                </div>`;
        });
        box.innerHTML = html;
    } catch (e) {
        console.error('tripLoadTimeline:', e);
        box.innerHTML = '<p style="color:red;">Could not load the timeline.</p>';
    }
}

// ---------- Backfill: tag existing entries ----------

function tripToggleBackfill() {
    const el = document.getElementById('tripBackfill');
    if (!el) return;
    if (!el.classList.contains('hidden')) { el.classList.add('hidden'); return; }
    const p = _lpCurrentProject;
    const today = journalFormatDate(new Date());
    el.innerHTML = `
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <label>From <input type="date" id="tripBfFrom" value="${p.startDate || today}"></label>
            <label>To <input type="date" id="tripBfTo" value="${p.endDate || today}"></label>
            <button class="btn btn-small btn-primary" onclick="tripBackfillLoad()">Find entries</button>
        </div>
        <div id="tripBfResults" style="margin-top:10px;"></div>`;
    el.classList.remove('hidden');
}

async function tripBackfillLoad() {
    const from = document.getElementById('tripBfFrom').value;
    const to = document.getElementById('tripBfTo').value;
    const out = document.getElementById('tripBfResults');
    if (!from || !to) { out.innerHTML = '<p style="color:#b91c1c;">Pick both dates.</p>'; return; }
    out.innerHTML = '<p style="color:#999;">Searching…</p>';
    try {
        const snap = await userCol('journalEntries').where('date', '>=', from).where('date', '<=', to).get();
        const entries = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => !e.tripId)
            .sort((a, b) => ((a.date || '') + (a.entryTime || '')).localeCompare((b.date || '') + (b.entryTime || '')));
        if (!entries.length) { out.innerHTML = '<p style="color:#999;">No untagged entries in that range.</p>'; return; }
        out.innerHTML = entries.map(e => {
            const txt = (e.entryText || '').slice(0, 80);
            return `<label style="display:flex; gap:8px; align-items:flex-start; margin:4px 0; cursor:pointer;">
                <input type="checkbox" class="tripBfCheck" value="${e.id}" checked>
                <span>${e.isCheckin ? '📍' : '📝'} ${_lpEsc(e.date)} ${_lpEsc(e.entryTime ? journalFormatTime12(e.entryTime) : '')} — ${_lpEsc(txt) || '<i>(no text)</i>'}</span>
            </label>`;
        }).join('') + '<button class="btn btn-small btn-primary" style="margin-top:8px;" onclick="tripBackfillApply()">Tag selected to this trip</button>';
    } catch (e) {
        console.error('tripBackfillLoad:', e);
        out.innerHTML = '<p style="color:red;">Search failed.</p>';
    }
}

async function tripBackfillApply() {
    const ids = [...document.querySelectorAll('.tripBfCheck:checked')].map(c => c.value);
    if (!ids.length) return;
    try {
        const batch = firebase.firestore().batch();
        ids.forEach(id => batch.update(userCol('journalEntries').doc(id), { tripId: _lpCurrentProject.id }));
        await batch.commit();
        document.getElementById('tripBackfill').classList.add('hidden');
        tripLoadTimeline();
    } catch (e) { console.error('tripBackfillApply:', e); alert('Could not tag the entries.'); }
}
