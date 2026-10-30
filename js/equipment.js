// ============================================================
// equipment.js — Fitness → Equipment
// The gear you own (treadmill, bands, bike…): what it is, what it is for, what you paid,
// useful links (manual, setup video…) and a dated history (battery changed, repaired…).
//
// Pages:
//   #equipment            list: search box, "show retired", total spent
//   #equipment-item/new   add a piece of equipment    (#equipment-item/:id = edit)
//
// Firestore (per-user, userCol): equipment
//   { name, description, usedFor, brand, model, serial, boughtFrom, location,
//     acquiredDate 'YYYY-MM-DD'|'', price (number)|null, warrantyUntil 'YYYY-MM-DD'|'',
//     status 'active'|'retired', notes, thumb (small JPEG data URL or ''),
//     links[]  ({ id, url, description }),
//     (extra pictures are ordinary `photos` docs, targetType 'equipment', shown by the shared gallery)
//     log[]    ({ id, date 'YYYY-MM-DD', kind, text, cost (number)|null }), createdAt }
//
// Not to be confused with the Workouts "equipment list" (workoutEquipment) — that is just the
// names an exercise needs ("Dumbbell"); this is the physical things you own.
//
// Links and log entries live inside the item's own document. On an existing item they are saved
// the moment they are added or deleted; on a new item they are saved with the form's Save.
// ============================================================

var EQ_LOG_KINDS = ['Maintenance', 'Repair', 'Battery', 'Support call', 'Cleaning', 'Part replaced', 'Other'];

var _eqItems = [];                              // every item, loaded by the list page
var _eqFilter = { text: '', retired: false };   // list filters — kept while you move around the app
var _eqEdit = null;                             // the item being edited { id|null, thumb, links[], log[] }

// ─── Small helpers ───────────────────────────────────────────────────────────

function _eqMoney(n) {
    if (n === null || n === undefined || n === '' || isNaN(n)) return '';
    return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "12.50", "$12.50" or "" → number or null. NaN is returned for text that is not a number. */
function _eqParseMoney(raw) {
    raw = String(raw || '').replace(/[$,\s]/g, '');
    if (!raw) return null;
    var n = parseFloat(raw);
    return (isNaN(n) || n < 0) ? NaN : n;
}

/** Purchase price plus every cost entered on the history. */
function _eqTotalSpent(item) {
    var t = item.price || 0;
    (item.log || []).forEach(function(e) { t += e.cost || 0; });
    return t;
}

function _eqLastLog(item) {
    var last = null;
    (item.log || []).forEach(function(e) { if (!last || e.date > last.date) last = e; });
    return last;
}

/** 'expired' | 'soon' (within 60 days) | 'ok' | '' (no warranty date). */
function _eqWarrantyState(item) {
    if (!item.warrantyUntil) return '';
    var today = _woTodayISO();
    if (item.warrantyUntil < today) return 'expired';
    var soon = new Date(); soon.setDate(soon.getDate() + 60);
    var soonISO = soon.getFullYear() + '-' + String(soon.getMonth() + 1).padStart(2, '0') + '-' + String(soon.getDate()).padStart(2, '0');
    return item.warrantyUntil <= soonISO ? 'soon' : 'ok';
}

function _eqWarrantyText(item) {
    var s = _eqWarrantyState(item);
    if (!s) return '';
    return (s === 'expired' ? 'Warranty ended ' : 'Warranty until ') + _wlFmtDate(item.warrantyUntil);
}

function _eqThumbHtml(item) {
    return '<div class="wl-thumb">' + (item.thumb ? '<img src="' + item.thumb + '" alt="" loading="lazy">' : '🏋️') + '</div>';
}

async function _eqLoadItems() {
    var snap = await userCol('equipment').get();
    _eqItems = snap.docs.map(function(d) { var e = d.data(); e.id = d.id; return e; });
}

// ─── List page (#equipment) ──────────────────────────────────────────────────

async function loadEquipmentPage() {
    _woSetChrome([['Equipment']]);
    var el = document.getElementById('page-equipment');
    el.innerHTML = '<div class="page-header"><h2>Equipment</h2></div><div class="ex-status">Loading…</div>';
    try {
        await _eqLoadItems();
    } catch (err) {
        console.error('Equipment: failed to load:', err);
        el.innerHTML = '<div class="page-header"><h2>Equipment</h2></div><div class="ex-status">Could not load equipment.</div>';
        return;
    }
    el.innerHTML =
        '<div class="page-header">' +
            '<h2>Equipment</h2>' +
            '<div class="page-header-actions"><a href="#equipment-item/new" class="btn btn-primary">+ Add Equipment</a></div>' +
        '</div>' +
        '<div class="ex-toolbar">' +
            '<div class="ex-toolbar-row">' +
                '<input type="search" id="eqText" class="filter-input" placeholder="Search name, brand, what it is used for…" value="' + _woEsc(_eqFilter.text) + '">' +
            '</div>' +
            '<div class="ex-toolbar-row">' +
                '<label class="wo-inline-check"><input type="checkbox" id="eqRetired"' + (_eqFilter.retired ? ' checked' : '') + '> Show retired</label>' +
            '</div>' +
        '</div>' +
        '<div id="eqCount" class="wl-count"></div>' +
        '<div id="eqList"></div>';
    document.getElementById('eqText').addEventListener('input', function() { _eqFilter.text = this.value; _eqRenderList(); });
    document.getElementById('eqRetired').addEventListener('change', function() { _eqFilter.retired = this.checked; _eqRenderList(); });
    document.getElementById('eqList').addEventListener('click', function(ev) {
        if (ev.target.closest('a')) return;   // the Edit / link buttons do their own thing
        var card = ev.target.closest('[data-id]');
        if (card) location.hash = '#equipment-item/' + card.getAttribute('data-id');
    });
    _eqRenderList();
}

function _eqFiltered() {
    var q = _eqFilter.text.trim().toLowerCase();
    return _eqItems.filter(function(e) {
        if (!_eqFilter.retired && e.status === 'retired') return false;
        if (!q) return true;
        return [e.name, e.brand, e.model, e.description, e.usedFor, e.location].join(' ').toLowerCase().indexOf(q) !== -1;
    }).sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
}

function _eqRenderList() {
    var list = document.getElementById('eqList');
    if (!list) return;
    var rows = _eqFiltered();
    var spent = rows.reduce(function(t, e) { return t + _eqTotalSpent(e); }, 0);
    document.getElementById('eqCount').textContent = _eqItems.length
        ? rows.length + ' item' + (rows.length === 1 ? '' : 's') + (spent ? ' · ' + _eqMoney(spent) + ' spent in total (purchase + upkeep)' : '') : '';
    if (!rows.length) {
        list.innerHTML = '<div class="ex-status">' + (_eqItems.length
            ? 'No equipment matches.'
            : 'No equipment yet. Tap <strong>+ Add Equipment</strong> to record something you own.') + '</div>';
        return;
    }
    list.innerHTML = rows.map(function(e) {
        var meta = [];
        if (e.acquiredDate) meta.push('Got ' + _wlFmtDate(e.acquiredDate));
        if (e.price !== null && e.price !== undefined) meta.push(_eqMoney(e.price));
        var last = _eqLastLog(e);
        var warn = _eqWarrantyText(e);
        return '<div class="wo-card wl-card" data-id="' + e.id + '" style="cursor:pointer">' +
                   _eqThumbHtml(e) +
                   '<div class="wo-card-main">' +
                       '<div class="wo-card-name">' + _woEsc(e.name) +
                           (e.status === 'retired' ? ' <span class="wo-chip wo-chip--also">Retired</span>' : '') + '</div>' +
                       (e.usedFor ? '<div class="wo-card-meta">' + _woEsc(e.usedFor) + '</div>' : '') +
                       '<div class="wo-card-meta">' + _woEsc(meta.join(' · ')) + '</div>' +
                       (last ? '<div class="wo-card-meta">Last: ' + _woEsc(last.kind) + ' · ' + _wlFmtDate(last.date) + '</div>' : '') +
                       (warn ? '<div class="wo-card-meta' + (_eqWarrantyState(e) === 'soon' ? ' eq-warn' : '') + '">' + _woEsc(warn) + '</div>' : '') +
                   '</div>' +
               '</div>';
    }).join('');
}

// ─── Add / edit page (#equipment-item/new, #equipment-item/:id) ──────────────

async function loadEquipmentItemPage(id) {
    var isNew = id === 'new';
    _woSetChrome([['Equipment', '#equipment'], [isNew ? 'Add Equipment' : 'Edit Equipment']]);
    var el = document.getElementById('page-equipment-item');
    el.innerHTML = '<div class="ex-status">Loading…</div>';

    var item = { name: '', description: '', usedFor: '', brand: '', model: '', serial: '', boughtFrom: '', location: '',
                 acquiredDate: '', price: null, warrantyUntil: '', status: 'active', notes: '', thumb: '', links: [], log: [] };
    if (!isNew) {
        try {
            var doc = await userCol('equipment').doc(id).get();
            if (!doc.exists) { el.innerHTML = '<div class="ex-status">This equipment was not found.</div>'; return; }
            item = Object.assign(item, doc.data());
        } catch (err) {
            console.error('Equipment: failed to load item:', err);
            el.innerHTML = '<div class="ex-status">Could not load the equipment.</div>';
            return;
        }
    }
    _eqEdit = { id: isNew ? null : id, thumb: item.thumb || '', links: (item.links || []).slice(), log: (item.log || []).slice(), price: item.price };

    var field = function(fid, label, value, ph, type) {
        return '<div class="form-group"><label for="' + fid + '">' + label + '</label>' +
               '<input type="' + (type || 'text') + '" id="' + fid + '" placeholder="' + (ph || '') + '" value="' + _woEsc(value || '') + '"></div>';
    };
    el.innerHTML =
        '<div class="page-header"><h2>' + (isNew ? 'Add Equipment' : _woEsc(item.name || 'Edit Equipment')) + '</h2></div>' +
        '<div class="wl-form">' +
            field('eqName', 'Name <span class="required">*</span>', item.name, 'e.g. NordicTrack treadmill') +
            wlPicFieldHtml('eq') +
            '<div class="form-group"><label for="eqDesc">Description</label>' +
                '<textarea id="eqDesc" rows="3" placeholder="What it is">' + _woEsc(item.description) + '</textarea></div>' +
            '<div class="form-group"><label for="eqUsedFor">What it is used for</label>' +
                '<textarea id="eqUsedFor" rows="2" placeholder="e.g. Upper-body strength, warm-ups">' + _woEsc(item.usedFor) + '</textarea></div>' +
            '<div class="form-row">' +
                field('eqDate', 'When I got it', item.acquiredDate, '', 'date') +
                field('eqPrice', 'What I paid ($)', item.price === null || item.price === undefined ? '' : String(item.price), '0.00') +
            '</div>' +
            field('eqBoughtFrom', 'Bought from', item.boughtFrom, 'Store or website') +
            '<div class="form-row">' + field('eqBrand', 'Brand', item.brand, '') + field('eqModel', 'Model', item.model, '') + '</div>' +
            field('eqSerial', 'Serial number', item.serial, '') +
            '<div class="form-row">' +
                field('eqWarranty', 'Warranty ends', item.warrantyUntil, '', 'date') +
                field('eqLocation', 'Where it is kept', item.location, 'e.g. Garage, spare room') +
            '</div>' +
            '<div class="form-group"><label for="eqNotes">Notes</label>' +
                '<textarea id="eqNotes" rows="2">' + _woEsc(item.notes) + '</textarea></div>' +
            '<label class="wo-inline-check"><input type="checkbox" id="eqRetiredChk"' + (item.status === 'retired' ? ' checked' : '') + '> Retired (sold, broken or given away — hides it from the list)</label>' +
            '<div class="wl-form-buttons">' +
                '<button type="button" class="btn btn-primary" id="eqSaveBtn">Save</button>' +
                '<a href="#equipment" class="btn btn-secondary">Cancel</a>' +
                (isNew ? '' : '<button type="button" class="btn btn-danger" id="eqDeleteBtn">Delete</button>') +
            '</div>' +
        '</div>' +
        '<div class="wl-done-section">' +
            '<h3>More pictures</h3>' +
            (isNew
                ? '<div class="wl-hint">Save the equipment first, then come back to add more pictures.</div>'
                : '<div class="wl-card-actions">' +
                      '<button type="button" class="btn btn-primary btn-small" id="eqPhotoCamBtn">+ Camera</button>' +
                      '<button type="button" class="btn btn-primary btn-small" id="eqPhotoGalBtn">+ Gallery</button>' +
                      '<button type="button" class="btn btn-primary btn-small paste-photo-btn" data-entity="equipment">&#128203; Paste</button>' +
                  '</div>' +
                  '<div id="eqPhotoContainer"></div>' +
                  '<p class="empty-state" id="eqPhotoEmptyState">No pictures yet.</p>') +
        '</div>' +
        '<div class="wl-done-section">' +
            '<h3>Links</h3>' +
            '<div class="wl-hint">Manufacturer, setup, how to use, where to buy parts…' + (isNew ? ' (saved when you tap Save)' : '') + '</div>' +
            '<div id="eqLinkList"></div>' +
            '<div class="form-group"><input type="url" id="eqLinkUrl" placeholder="https://…">' +
                '<input type="text" id="eqLinkDesc" placeholder="What this link is for, e.g. Setup video" style="margin-top:6px">' +
                '<button type="button" class="btn btn-secondary btn-small" id="eqLinkAddBtn" style="margin-top:6px">+ Add link</button></div>' +
        '</div>' +
        '<div class="wl-done-section">' +
            '<h3>History</h3>' +
            '<div class="wl-hint">Battery changed, repaired, maintenance, support calls…' + (isNew ? ' (saved when you tap Save)' : '') + '</div>' +
            '<div id="eqLogList"></div>' +
            '<div class="form-group">' +
                '<div class="form-row">' +
                    '<div class="form-group"><input type="date" id="eqLogDate" value="' + _woTodayISO() + '"></div>' +
                    '<div class="form-group"><select id="eqLogKind">' + EQ_LOG_KINDS.map(function(k) { return '<option>' + k + '</option>'; }).join('') + '</select></div>' +
                '</div>' +
                '<input type="text" id="eqLogText" placeholder="What happened (optional)" style="margin-top:6px">' +
                '<input type="text" id="eqLogCost" placeholder="Cost $ (optional)" style="margin-top:6px">' +
                '<button type="button" class="btn btn-secondary btn-small" id="eqLogAddBtn" style="margin-top:6px">+ Add to history</button>' +
            '</div>' +
        '</div>';

    wlPicFieldWire('eq', _eqEdit);
    // More pictures use the shared photo gallery (photos.js, targetType 'equipment')
    window.currentEquipment = isNew ? null : { id: id };
    if (!isNew) {
        document.getElementById('eqPhotoCamBtn').addEventListener('click', function() { triggerCameraUpload('equipment', id); });
        document.getElementById('eqPhotoGalBtn').addEventListener('click', function() { triggerGalleryUpload('equipment', id); });
        loadPhotos('equipment', id, 'eqPhotoContainer', 'eqPhotoEmptyState');
    }
    document.getElementById('eqSaveBtn').addEventListener('click', _eqSave);
    if (!isNew) document.getElementById('eqDeleteBtn').addEventListener('click', _eqDelete);
    document.getElementById('eqLinkAddBtn').addEventListener('click', _eqAddLink);
    document.getElementById('eqLogAddBtn').addEventListener('click', _eqAddLog);
    document.getElementById('eqLinkList').addEventListener('click', function(ev) {
        var b = ev.target.closest('[data-del-link]');
        if (b) _eqDeleteLink(b.getAttribute('data-del-link'));
    });
    document.getElementById('eqLogList').addEventListener('click', function(ev) {
        var b = ev.target.closest('[data-del-log]');
        if (b) _eqDeleteLog(b.getAttribute('data-del-log'));
    });
    _eqRenderLinks();
    _eqRenderLog();
    if (isNew) document.getElementById('eqName').focus();
}

// ─── Links and history (saved at once on an existing item) ───────────────────

/** Writes links + log straight to the item — only when it already exists. */
async function _eqPersistLists() {
    if (!_eqEdit.id) return true;
    try {
        await userCol('equipment').doc(_eqEdit.id).update({ links: _eqEdit.links, log: _eqEdit.log });
        return true;
    } catch (err) {
        console.error('Equipment: saving links/history failed:', err);
        alert('Failed to save. Please try again.');
        return false;
    }
}

function _eqRenderLinks() {
    var wrap = document.getElementById('eqLinkList');
    if (!wrap) return;
    wrap.innerHTML = _eqEdit.links.length ? _eqEdit.links.map(function(l) {
        return '<div class="wl-done-row"><div>' +
                   '<a href="' + _woEsc(l.url) + '" target="_blank" rel="noopener"><strong>' + _woEsc(l.description || _wlHost(l.url) || l.url) + '</strong> ↗</a>' +
                   '<div class="wo-card-meta">' + _woEsc(_wlHost(l.url)) + '</div></div>' +
               '<button type="button" class="btn btn-secondary btn-small" data-del-link="' + _woEsc(l.id) + '">Delete</button></div>';
    }).join('') : '<div class="wl-hint">No links yet.</div>';
}

async function _eqAddLink() {
    var url = _wlCleanUrl(document.getElementById('eqLinkUrl').value);
    if (!url) { alert('Please enter the link.'); return; }
    _eqEdit.links.push({ id: String(Date.now()), url: url, description: document.getElementById('eqLinkDesc').value.trim() });
    if (!(await _eqPersistLists())) { _eqEdit.links.pop(); return; }
    document.getElementById('eqLinkUrl').value = '';
    document.getElementById('eqLinkDesc').value = '';
    _eqRenderLinks();
}

async function _eqDeleteLink(linkId) {
    if (!confirm('Delete this link?')) return;
    var before = _eqEdit.links;
    _eqEdit.links = before.filter(function(l) { return l.id !== linkId; });
    if (!(await _eqPersistLists())) _eqEdit.links = before;
    _eqRenderLinks();
}

function _eqRenderLog() {
    var wrap = document.getElementById('eqLogList');
    if (!wrap) return;
    var log = _eqEdit.log.slice().sort(function(a, b) { return b.date.localeCompare(a.date); });
    wrap.innerHTML = log.length ? log.map(function(e) {
        var head = [_wlFmtDate(e.date), e.kind].concat(e.cost ? [_eqMoney(e.cost)] : []).join(' · ');
        return '<div class="wl-done-row"><div><strong>' + _woEsc(head) + '</strong>' +
                   (e.text ? '<div class="wo-card-meta">' + _woEsc(e.text) + '</div>' : '') + '</div>' +
               '<button type="button" class="btn btn-secondary btn-small" data-del-log="' + _woEsc(e.id) + '">Delete</button></div>';
    }).join('') : '<div class="wl-hint">Nothing recorded yet.</div>';
}

async function _eqAddLog() {
    var date = document.getElementById('eqLogDate').value;
    if (!date) { alert('Please pick the date.'); return; }
    var cost = _eqParseMoney(document.getElementById('eqLogCost').value);
    if (isNaN(cost)) { alert('Cost must be a number.'); return; }
    _eqEdit.log.push({ id: String(Date.now()), date: date, kind: document.getElementById('eqLogKind').value,
                       text: document.getElementById('eqLogText').value.trim(), cost: cost });
    if (!(await _eqPersistLists())) { _eqEdit.log.pop(); return; }
    document.getElementById('eqLogText').value = '';
    document.getElementById('eqLogCost').value = '';
    _eqRenderLog();
}

async function _eqDeleteLog(entryId) {
    if (!confirm('Delete this history entry?')) return;
    var before = _eqEdit.log;
    _eqEdit.log = before.filter(function(e) { return e.id !== entryId; });
    if (!(await _eqPersistLists())) _eqEdit.log = before;
    _eqRenderLog();
}

// ─── Save / delete ───────────────────────────────────────────────────────────

async function _eqSave() {
    var name = document.getElementById('eqName').value.trim();
    if (!name) { alert('Please give the equipment a name.'); return; }
    var price = _eqParseMoney(document.getElementById('eqPrice').value);
    if (isNaN(price)) { alert('What I paid must be a number.'); return; }
    var val = function(id) { return document.getElementById(id).value.trim(); };

    var data = {
        name: name,
        description: val('eqDesc'),
        usedFor: val('eqUsedFor'),
        acquiredDate: document.getElementById('eqDate').value,
        price: price,
        boughtFrom: val('eqBoughtFrom'),
        brand: val('eqBrand'),
        model: val('eqModel'),
        serial: val('eqSerial'),
        warrantyUntil: document.getElementById('eqWarranty').value,
        location: val('eqLocation'),
        notes: val('eqNotes'),
        status: document.getElementById('eqRetiredChk').checked ? 'retired' : 'active',
        thumb: _eqEdit.thumb || '',
        links: _eqEdit.links,
        log: _eqEdit.log
    };
    var btn = document.getElementById('eqSaveBtn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
        if (_eqEdit.id) {
            await userCol('equipment').doc(_eqEdit.id).update(data);
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await userCol('equipment').add(data);
        }
        location.hash = '#equipment';
    } catch (err) {
        console.error('Equipment: save failed:', err);
        alert('Failed to save. Please try again.');
        btn.disabled = false; btn.textContent = 'Save';
    }
}

async function _eqDelete() {
    if (!confirm('Delete this equipment and its pictures, links and history? This cannot be undone.')) return;
    try {
        var pics = await userCol('photos').where('targetType', '==', 'equipment').where('targetId', '==', _eqEdit.id).get();
        await Promise.all(pics.docs.map(function(d) { return d.ref.delete(); }));
        await userCol('equipment').doc(_eqEdit.id).delete();
        location.hash = '#equipment';
    } catch (err) {
        console.error('Equipment: delete failed:', err);
        alert('Failed to delete. Please try again.');
    }
}
