// ============================================================
// credentials.js — Credentials (passwords / sensitive info)
// Stores usernames, passwords, API keys, and other sensitive
// data organized by category and tracked per person.
// No encryption — Firebase Auth login is sufficient security.
// ============================================================

// ---------- Constants ----------

var CRED_TYPES = [
    { value: '',             label: '— Select type —' },
    { value: 'password',     label: 'Password' },
    { value: 'apikey',       label: 'API Key' },
    { value: 'clientsecret', label: 'Client Secret' },
    { value: 'ssn',          label: 'Social Security Number' },
    { value: 'code',         label: 'Code' },
    { value: 'oauthkey',     label: 'OAuth Key' },
    { value: 'other',        label: 'Other' }
];

function _credTypeLabel(value) {
    var t = CRED_TYPES.find(function(t) { return t.value === value; });
    return (t && t.value) ? t.label : 'Credential';
}

// ---------- Module State ----------

var _credCategories  = [];      // [{id, name, order}] sorted by order
var _credentials     = [];      // all credential docs for current user
var _credPeople      = [];      // [{id, name}] enrolled contact refs
var _credPersonFilter = null;   // null = "Me"; contact ID string otherwise
var _credExpandedCats  = {};    // {catKeyStr: bool}
var _credExpandedItems = {};    // {itemId: bool}
var _credSearchQuery  = '';
var _credClipTimers   = {};     // {btnId: timerHandle}
var _credDragItemId   = null;
var _credDragItemCat  = null;
var _credDragCatId    = null;

// ---------- Page Loaders ----------

async function loadCredentialsPage() {
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#life">Life</a><span class="separator">&rsaquo;</span><span>Credentials</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';
    await _credLoadAll();
    _credRenderList();
}

async function loadCredentialAddPage() {
    var catId = window._credPrefilledCatId !== undefined ? window._credPrefilledCatId : null;
    window._credPrefilledCatId = undefined;
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#credentials">Credentials</a><span class="separator">›</span><span>Add</span>';
    if (!_credCategories.length && !_credentials.length) await _credLoadAll();
    _credRenderForm(null, catId);
}

async function loadCredentialEditPage(credId) {
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#credentials">Credentials</a><span class="separator">›</span><span>Edit</span>';
    if (!_credentials.length) await _credLoadAll();
    var cred = _credentials.find(function(c) { return c.id === credId; });
    if (!cred) { await _credLoadAll(); cred = _credentials.find(function(c) { return c.id === credId; }); }
    _credRenderForm(cred || null, null);
}

async function loadCredentialCategoriesPage() {
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#credentials">Credentials</a><span class="separator">›</span><span>Categories</span>';
    if (!_credCategories.length) await _credLoadAll();
    _credRenderCategoriesPage();
}

// ---------- Data Loading ----------

async function _credLoadAll() {
    var catSnap = await userCol('credentialCategories').orderBy('order').get();
    _credCategories = [];
    catSnap.forEach(function(doc) {
        _credCategories.push(Object.assign({ id: doc.id }, doc.data()));
    });

    var credSnap = await userCol('credentials').get();
    _credentials = [];
    credSnap.forEach(function(doc) {
        _credentials.push(Object.assign({ id: doc.id }, doc.data()));
    });

    var settingsDoc = await userCol('settings').doc('credentials').get();
    _credPeople = [];
    if (settingsDoc.exists) {
        var enrolledIds = (settingsDoc.data().enrolledPersonIds || []).filter(Boolean);
        var fetches = enrolledIds.map(function(pid) {
            return userCol('people').doc(pid).get().then(function(d) {
                return d.exists ? { id: pid, name: d.data().name || pid } : null;
            });
        });
        var results = await Promise.all(fetches);
        _credPeople = results.filter(Boolean).sort(function(a, b) {
            return a.name.localeCompare(b.name);
        });
    }
}

// ---------- Main List Render ----------

function _credRenderList() {
    var page = document.getElementById('page-credentials');
    if (!page) return;

    var personOpts = '<option value="">Me</option>';
    _credPeople.forEach(function(p) {
        personOpts += '<option value="' + escapeHtml(p.id) + '"' +
            (_credPersonFilter === p.id ? ' selected' : '') + '>' +
            escapeHtml(p.name) + '</option>';
    });

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>Credentials</h2>' +
            '<div class="page-header-actions">' +
                '<button class="btn btn-primary" onclick="_credGoAdd(null)">+ Add</button>' +
                '<div class="cred-manage-wrap">' +
                    '<button class="btn btn-secondary" onclick="_credToggleManageMenu(event)">Manage ▾</button>' +
                    '<div class="cred-manage-menu" id="credManageMenu">' +
                        '<button onclick="_credGoCategories()">Manage Categories</button>' +
                        '<button onclick="_credOpenPeopleModal()">Manage People</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div class="cred-filters">' +
            '<div class="cred-filter-row">' +
                '<label class="cred-filter-label">Person:</label>' +
                '<select id="credPersonSel" onchange="_credOnPersonChange()">' + personOpts + '</select>' +
            '</div>' +
            '<div class="cred-search-row">' +
                '<input type="search" id="credSearch" class="cred-search-input"' +
                    ' placeholder="🔍 Search name or URL…"' +
                    ' value="' + escapeHtml(_credSearchQuery) + '"' +
                    ' oninput="_credOnSearch()">' +
            '</div>' +
        '</div>' +
        '<div id="credCatList"></div>';

    _credRefreshCatList();
}

function _credRefreshCatList() {
    var container = document.getElementById('credCatList');
    if (!container) return;

    var query    = _credSearchQuery.trim().toLowerCase();
    var personId = _credPersonFilter || null;

    var allCats = _credCategories.concat([{ id: null, name: 'Uncategorized', _virtual: true }]);
    var html = '';

    allCats.forEach(function(cat) {
        var catKey = cat.id || '__uncategorized';

        var items = _credentials.filter(function(c) {
            var mp = (personId === null)
                ? (c.personId == null || c.personId === '')
                : c.personId === personId;
            var mc = (cat.id === null)
                ? (c.categoryId == null || c.categoryId === '')
                : c.categoryId === cat.id;
            return mp && mc;
        });

        var filtered = query
            ? items.filter(function(c) {
                return (c.name || '').toLowerCase().includes(query) ||
                       (c.url  || '').toLowerCase().includes(query);
              })
            : items;

        if (query && filtered.length === 0) return;

        filtered.sort(function(a, b) { return (a.order || 0) - (b.order || 0); });

        var isOpen  = _credExpandedCats[catKey] || (!!query && filtered.length > 0);
        var badge   = query
            ? '(' + filtered.length + ' of ' + items.length + ')'
            : '(' + items.length + ')';

        html +=
            '<div class="cred-cat" data-cat-key="' + escapeHtml(catKey) + '">' +
                '<div class="cred-cat-header" onclick="_credToggleCat(\'' + escapeHtml(catKey) + '\')">' +
                    '<span class="cred-chevron">' + (isOpen ? '▼' : '►') + '</span>' +
                    '<span class="cred-cat-name">' + escapeHtml(cat.name) + '</span>' +
                    '<span class="cred-cat-count">' + escapeHtml(badge) + '</span>' +
                    '<button class="cred-cat-add-btn btn btn-primary btn-small"' +
                            ' title="Add credential to ' + escapeHtml(cat.name) + '"' +
                            ' onclick="event.stopPropagation();_credGoAdd(\'' + escapeHtml(catKey) + '\')">+</button>' +
                '</div>' +
                '<div class="cred-cat-body" id="credBody_' + escapeHtml(catKey) + '"' +
                     ' style="' + (isOpen ? '' : 'display:none') + '">';

        if (filtered.length === 0) {
            html += '<div class="cred-empty-cat">No credentials here yet.</div>';
        } else {
            filtered.forEach(function(item) { html += _credItemHtml(item, catKey); });
        }

        html += '</div></div>';
    });

    if (!html) {
        var name = personId
            ? (_credPeople.find(function(p) { return p.id === personId; }) || {}).name || 'this person'
            : null;
        container.innerHTML = '<div class="empty-state">' +
            (query
                ? 'No credentials match your search.'
                : name
                    ? 'No credentials for ' + escapeHtml(name) + ' yet. Tap + Add to add one.'
                    : 'No credentials yet. Tap + Add to get started.') +
            '</div>';
    } else {
        container.innerHTML = html;
    }
}

// ---------- Credential Item HTML ----------

function _credItemHtml(item, catKey) {
    var id   = item.id;
    var open = !!_credExpandedItems[id];
    return (
        '<div class="cred-item" data-item-id="' + escapeHtml(id) + '" data-cat-key="' + escapeHtml(catKey) + '"' +
            ' draggable="true"' +
            ' ondragstart="_credItemDragStart(event,\'' + escapeHtml(id) + '\',\'' + escapeHtml(catKey) + '\')"' +
            ' ondragover="_credItemDragOver(event,\'' + escapeHtml(id) + '\')"' +
            ' ondragleave="_credItemDragLeave(event,\'' + escapeHtml(id) + '\')"' +
            ' ondrop="_credItemDrop(event,\'' + escapeHtml(id) + '\',\'' + escapeHtml(catKey) + '\')"' +
            ' ondragend="_credItemDragEnd()">' +
            '<div class="cred-item-header" onclick="_credToggleItem(\'' + escapeHtml(id) + '\')">' +
                '<span class="cred-drag-handle" title="Drag to reorder" onclick="event.stopPropagation()">≡</span>' +
                '<span class="cred-chevron">' + (open ? '▼' : '►') + '</span>' +
                '<span class="cred-item-name">' + escapeHtml(item.name || '(unnamed)') + '</span>' +
            '</div>' +
            '<div class="cred-item-body" id="credItemBody_' + escapeHtml(id) + '"' +
                 ' style="' + (open ? '' : 'display:none') + '">' +
                (open ? _credItemBodyHtml(item) : '') +
            '</div>' +
        '</div>'
    );
}

function _credItemBodyHtml(item) {
    var id   = item.id;
    var html = '<div class="cred-detail-rows">';

    if (item.url) {
        html += _credRow('URL',
            '<a href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener">' +
            escapeHtml(item.url) + '</a>');
    }
    if (item.email) {
        html += _credRow('Email', escapeHtml(item.email));
    }
    if (item.username) {
        html += _credRow('Username',
            '<span class="cred-copy-wrap">' +
                '<span>' + escapeHtml(item.username) + '</span>' +
                '<button class="cred-copy-btn btn btn-small" id="cc_u_' + escapeHtml(id) + '"' +
                        ' onclick="_credCopyVal(\'' + _credEscJs(item.username) + '\',\'cc_u_' + escapeHtml(id) + '\')">📋</button>' +
            '</span>');
    }
    if (item.credentialType || item.credentialValue) {
        html += _credRow(
            escapeHtml(_credTypeLabel(item.credentialType || '')),
            '<span class="cred-copy-wrap">' +
                '<span class="cred-mask-wrap" id="cm_v_' + escapeHtml(id) + '">' +
                    '<span class="cred-dots">••••••••</span>' +
                    '<span class="cred-plain" style="display:none">' + escapeHtml(item.credentialValue || '') + '</span>' +
                '</span>' +
                '<button class="cred-reveal-btn" onclick="_credToggleMask(\'cm_v_' + escapeHtml(id) + '\')" title="Reveal/hide">👁</button>' +
                '<button class="cred-copy-btn btn btn-small" id="cc_v_' + escapeHtml(id) + '"' +
                        ' onclick="_credCopyVal(\'' + _credEscJs(item.credentialValue || '') + '\',\'cc_v_' + escapeHtml(id) + '\')">📋</button>' +
            '</span>');
    }
    if (item.updatedAt) {
        var d = item.updatedAt.toDate ? item.updatedAt.toDate() : new Date(item.updatedAt);
        html += _credRow('Last Updated', escapeHtml(d.toLocaleDateString()));
    }
    if (item.previousCredential) {
        html += _credRow('Previous',
            '<span class="cred-copy-wrap">' +
                '<span class="cred-mask-wrap" id="cm_p_' + escapeHtml(id) + '">' +
                    '<span class="cred-dots">••••••••</span>' +
                    '<span class="cred-plain" style="display:none">' + escapeHtml(item.previousCredential) + '</span>' +
                '</span>' +
                '<button class="cred-reveal-btn" onclick="_credToggleMask(\'cm_p_' + escapeHtml(id) + '\')" title="Reveal/hide">👁</button>' +
            '</span>');
    }
    if (item.secretQA) {
        html += _credRow('Secret Q&amp;A', '<span class="cred-multiline">' + escapeHtml(item.secretQA) + '</span>');
    }
    if (item.notes) {
        html += _credRow('Notes', '<span class="cred-multiline">' + escapeHtml(item.notes) + '</span>');
    }

    html += '</div>';
    html +=
        '<div class="cred-item-actions">' +
            '<button class="btn btn-secondary btn-small"' +
                    ' onclick="_credGoEdit(\'' + escapeHtml(id) + '\')">Edit</button>' +
            '<button class="btn btn-danger btn-small"' +
                    ' onclick="_credConfirmDelete(\'' + escapeHtml(id) + '\',\'' + _credEscJs(item.name || '') + '\')">Delete</button>' +
        '</div>';
    return html;
}

function _credRow(label, valueHtml) {
    return '<div class="cred-detail-row">' +
        '<span class="cred-detail-label">' + label + '</span>' +
        '<span class="cred-detail-value">' + valueHtml + '</span>' +
    '</div>';
}

// Escape a string for safe use inside a JS string literal in an inline onclick attribute
function _credEscJs(str) {
    return (str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ---------- Accordion Toggle ----------

function _credToggleCat(catKey) {
    _credExpandedCats[catKey] = !_credExpandedCats[catKey];
    var header = document.querySelector('.cred-cat[data-cat-key="' + catKey + '"] .cred-chevron');
    var body   = document.getElementById('credBody_' + catKey);
    if (!header || !body) return;
    if (_credExpandedCats[catKey]) { header.textContent = '▼'; body.style.display = ''; }
    else                           { header.textContent = '►'; body.style.display = 'none'; }
}

function _credToggleItem(itemId) {
    _credExpandedItems[itemId] = !_credExpandedItems[itemId];
    var item = _credentials.find(function(c) { return c.id === itemId; });
    var chevron = document.querySelector('.cred-item[data-item-id="' + itemId + '"] .cred-chevron');
    var body    = document.getElementById('credItemBody_' + itemId);
    if (!chevron || !body) return;
    if (_credExpandedItems[itemId]) {
        chevron.textContent = '▼';
        body.style.display  = '';
        body.innerHTML = item ? _credItemBodyHtml(item) : '';
    } else {
        chevron.textContent = '►';
        body.style.display  = 'none';
        body.innerHTML = '';
    }
}

// ---------- Search ----------

function _credOnSearch() {
    var el = document.getElementById('credSearch');
    _credSearchQuery = el ? el.value : '';
    _credRefreshCatList();
}

// ---------- Person Filter ----------

function _credOnPersonChange() {
    var sel = document.getElementById('credPersonSel');
    _credPersonFilter = sel ? (sel.value || null) : null;
    _credExpandedItems = {};
    _credRefreshCatList();
}

// ---------- Copy + Mask ----------

function _credCopyVal(value, btnId) {
    if (!value) return;
    navigator.clipboard.writeText(value).then(function() {
        var btn = document.getElementById(btnId);
        if (!btn) return;
        var orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function() {
            var b = document.getElementById(btnId);
            if (b) b.textContent = orig;
        }, 2000);
        if (_credClipTimers[btnId]) clearTimeout(_credClipTimers[btnId]);
        _credClipTimers[btnId] = setTimeout(function() {
            navigator.clipboard.writeText('').catch(function() {});
            delete _credClipTimers[btnId];
        }, 60000);
    }).catch(function(err) { console.warn('Copy failed:', err); });
}

function _credToggleMask(wrapId) {
    var wrap = document.getElementById(wrapId);
    if (!wrap) return;
    var dots  = wrap.querySelector('.cred-dots');
    var plain = wrap.querySelector('.cred-plain');
    if (!dots || !plain) return;
    var showing = plain.style.display !== 'none';
    dots.style.display  = showing ? '' : 'none';
    plain.style.display = showing ? 'none' : '';
}

// ---------- Navigation ----------

function _credGoAdd(catKey) {
    window._credPrefilledCatId = catKey || null;
    window.location.hash = '#credentials/add';
}

function _credGoEdit(credId) {
    window.location.hash = '#credentials/edit/' + credId;
}

function _credGoCategories() {
    _credCloseManageMenu();
    window.location.hash = '#credentials/categories';
}

// ---------- Manage Menu ----------

function _credToggleManageMenu(e) {
    if (e) e.stopPropagation();
    var menu = document.getElementById('credManageMenu');
    if (!menu) return;
    var isOpen = menu.classList.toggle('open');
    if (isOpen) {
        setTimeout(function() {
            document.addEventListener('click', _credCloseManageMenu, { once: true });
        }, 0);
    }
}

function _credCloseManageMenu() {
    var menu = document.getElementById('credManageMenu');
    if (menu) menu.classList.remove('open');
}

// ---------- Manage People Modal ----------

function _credOpenPeopleModal() {
    _credCloseManageMenu();
    _credRenderPeopleList();
    openModal('credPeopleModal');
    setTimeout(function() {
        buildContactPicker('credPeoplePicker', {
            placeholder: 'Search contacts…',
            onSelect: function(id, name) {
                _credEnrollPerson(id, name);
                var inp = document.getElementById('credPeoplePicker_search');
                var hid = document.getElementById('credPeoplePicker_id');
                if (inp) inp.value = '';
                if (hid) hid.value = '';
            }
        });
    }, 50);
}

function _credRenderPeopleList() {
    var list = document.getElementById('credPeopleListBody');
    if (!list) return;
    if (_credPeople.length === 0) {
        list.innerHTML = '<p class="cred-people-empty">No people added yet.</p>';
        return;
    }
    list.innerHTML = _credPeople.map(function(p) {
        return '<div class="cred-person-mgmt-row">' +
            '<span>' + escapeHtml(p.name) + '</span>' +
            '<button class="btn btn-danger btn-small"' +
                    ' onclick="_credRemovePerson(\'' + escapeHtml(p.id) + '\',\'' + _credEscJs(p.name) + '\')">' +
                    'Remove</button>' +
        '</div>';
    }).join('');
}

async function _credEnrollPerson(contactId, name) {
    if (_credPeople.find(function(p) { return p.id === contactId; })) return;
    _credPeople.push({ id: contactId, name: name });
    _credPeople.sort(function(a, b) { return a.name.localeCompare(b.name); });
    await _credSaveEnrolledIds();
    _credRenderPeopleList();
    _credRefreshPersonSelect();
}

async function _credRemovePerson(contactId, name) {
    var count = _credentials.filter(function(c) { return c.personId === contactId; }).length;
    var msg = count > 0
        ? 'Remove ' + name + '? This will also permanently delete their ' + count + ' credential(s).'
        : 'Remove ' + name + ' from tracked people?';
    if (!confirm(msg)) return;
    if (count > 0) {
        var batch = db.batch();
        _credentials.filter(function(c) { return c.personId === contactId; }).forEach(function(c) {
            batch.delete(userCol('credentials').doc(c.id));
        });
        await batch.commit();
        _credentials = _credentials.filter(function(c) { return c.personId !== contactId; });
    }
    _credPeople = _credPeople.filter(function(p) { return p.id !== contactId; });
    await _credSaveEnrolledIds();
    if (_credPersonFilter === contactId) _credPersonFilter = null;
    _credRenderPeopleList();
    _credRefreshPersonSelect();
    _credRefreshCatList();
}

async function _credSaveEnrolledIds() {
    var ids = _credPeople.map(function(p) { return p.id; });
    await userCol('settings').doc('credentials').set({ enrolledPersonIds: ids }, { merge: true });
}

function _credRefreshPersonSelect() {
    var sel = document.getElementById('credPersonSel');
    if (!sel) return;
    var cur = _credPersonFilter || '';
    var opts = '<option value="">Me</option>';
    _credPeople.forEach(function(p) {
        opts += '<option value="' + escapeHtml(p.id) + '"' + (cur === p.id ? ' selected' : '') + '>' +
            escapeHtml(p.name) + '</option>';
    });
    sel.innerHTML = opts;
}

// ---------- Add / Edit Form ----------

function _credRenderForm(cred, prefilledCatKey) {
    var isEdit  = !!cred;
    var pageId  = isEdit ? 'page-credentials-edit' : 'page-credentials-add';
    var page    = document.getElementById(pageId);
    if (!page) return;

    // Clear the other form page to prevent stale duplicate field IDs (cfName, cfUrl, etc.)
    // from being returned first by document.getElementById when saving.
    var otherPageId = isEdit ? 'page-credentials-add' : 'page-credentials-edit';
    var otherPage = document.getElementById(otherPageId);
    if (otherPage) otherPage.innerHTML = '';

    var c = cred || {};

    // Category preselect
    var selCatId = '';
    if (prefilledCatKey && prefilledCatKey !== '__uncategorized') selCatId = prefilledCatKey;
    else if (c.categoryId) selCatId = c.categoryId;

    var catOpts = '<option value="">Uncategorized</option>';
    _credCategories.forEach(function(cat) {
        catOpts += '<option value="' + escapeHtml(cat.id) + '"' + (selCatId === cat.id ? ' selected' : '') + '>' +
            escapeHtml(cat.name) + '</option>';
    });
    catOpts += '<option value="__new__">✚ Add new category…</option>';

    // Person preselect
    var selPersonId = c.personId || _credPersonFilter || '';
    var personOpts  = '<option value="">Me</option>';
    _credPeople.forEach(function(p) {
        personOpts += '<option value="' + escapeHtml(p.id) + '"' + (selPersonId === p.id ? ' selected' : '') + '>' +
            escapeHtml(p.name) + '</option>';
    });

    // Type options
    var typeOpts = '';
    CRED_TYPES.forEach(function(t) {
        typeOpts += '<option value="' + escapeHtml(t.value) + '"' +
            ((c.credentialType || '') === t.value ? ' selected' : '') + '>' +
            escapeHtml(t.label) + '</option>';
    });

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>' + (isEdit ? 'Edit Credential' : 'Add Credential') + '</h2>' +
        '</div>' +
        '<form class="cred-form" id="credForm"' +
              ' onsubmit="event.preventDefault();_credSaveForm(\'' + escapeHtml(c.id || '') + '\')">' +
            '<div class="form-group"><label>Name</label>' +
                '<input type="text" id="cfName" value="' + escapeHtml(c.name || '') + '"' +
                       ' placeholder="e.g. Chase Online"></div>' +
            '<div class="form-group"><label>URL</label>' +
                '<input type="text" id="cfUrl" value="' + escapeHtml(c.url || '') + '"' +
                       ' placeholder="https://"></div>' +
            '<div class="form-group"><label>Email</label>' +
                '<input type="text" id="cfEmail" value="' + escapeHtml(c.email || '') + '"' +
                       ' placeholder="you@example.com"></div>' +
            '<div class="form-group"><label>Username</label>' +
                '<input type="text" id="cfUsername" value="' + escapeHtml(c.username || '') + '"></div>' +
            '<div class="form-group"><label>Credential Type</label>' +
                '<select id="cfCredType">' + typeOpts + '</select></div>' +
            '<div class="form-group"><label>Credential Value</label>' +
                '<input type="text" id="cfCredValue" value="' + escapeHtml(c.credentialValue || '') + '"' +
                       ' autocomplete="new-password"></div>' +
            '<div class="form-group"><label>Previous Credential</label>' +
                '<input type="text" id="cfPrevCred" value="' + escapeHtml(c.previousCredential || '') + '"' +
                       ' autocomplete="off"></div>' +
            '<div class="form-group"><label>Notes</label>' +
                '<textarea id="cfNotes" rows="3">' + escapeHtml(c.notes || '') + '</textarea></div>' +
            '<div class="form-group"><label>Secret Q&amp;A</label>' +
                '<textarea id="cfSecretQA" rows="4"' +
                          ' placeholder="Enter question/answer pairs however you like">' +
                    escapeHtml(c.secretQA || '') + '</textarea></div>' +
            '<div class="form-group"><label>Person</label>' +
                '<select id="cfPerson">' + personOpts + '</select></div>' +
            '<div class="form-group"><label>Category</label>' +
                '<select id="cfCategory" onchange="_credOnCatChange()">' + catOpts + '</select>' +
                '<input type="text" id="cfNewCat" placeholder="New category name"' +
                       ' style="display:none;margin-top:8px"></div>' +
            '<div class="form-actions">' +
                '<button type="submit" class="btn btn-primary">Save</button>' +
                '<button type="button" class="btn btn-secondary"' +
                        ' onclick="window.location.hash=\'#credentials\'">Cancel</button>' +
            '</div>' +
        '</form>';
}

function _credOnCatChange() {
    var sel = document.getElementById('cfCategory');
    var inp = document.getElementById('cfNewCat');
    if (!sel || !inp) return;
    inp.style.display = sel.value === '__new__' ? '' : 'none';
    if (sel.value === '__new__') inp.focus();
}

async function _credSaveForm(existingId) {
    var name      = _fv('cfName');
    var url       = _fv('cfUrl');
    var email     = _fv('cfEmail');
    var username  = _fv('cfUsername');
    var credType  = _fv('cfCredType');
    var credValue = _fv('cfCredValue');
    var prevCred  = _fv('cfPrevCred');
    var notes     = _fv('cfNotes');
    var secretQA  = _fv('cfSecretQA');
    var personId  = _fv('cfPerson') || null;
    var catSel    = _fv('cfCategory');
    var newCatNm  = _fv('cfNewCat');

    // Resolve category
    var categoryId = catSel === '' ? null : catSel;
    if (catSel === '__new__') {
        if (!newCatNm.trim()) {
            alert('Please enter a name for the new category.');
            document.getElementById('cfNewCat').focus();
            return;
        }
        var newOrder  = _credCategories.length;
        var newCatRef = await userCol('credentialCategories').add({
            name: newCatNm.trim(), order: newOrder, createdAt: new Date()
        });
        categoryId = newCatRef.id;
        _credCategories.push({ id: categoryId, name: newCatNm.trim(), order: newOrder });
    }

    var now = new Date();

    // Determine if credential value changed
    var oldValue = '';
    if (existingId) {
        var existing = _credentials.find(function(c) { return c.id === existingId; });
        oldValue = existing ? (existing.credentialValue || '') : '';
    }

    var data = {
        name: name.trim(), url: url.trim(), email: email.trim(),
        username: username.trim(), credentialType: credType,
        notes: notes.trim(), secretQA: secretQA.trim(),
        personId: personId, categoryId: categoryId,
        credentialValue: credValue,
        previousCredential: (credValue !== oldValue && existingId) ? oldValue : prevCred
    };
    if (credValue !== oldValue) data.updatedAt = now;

    if (existingId) {
        await userCol('credentials').doc(existingId).update(data);
        var idx = _credentials.findIndex(function(c) { return c.id === existingId; });
        if (idx >= 0) _credentials[idx] = Object.assign(_credentials[idx], data);
    } else {
        var siblings = _credentials.filter(function(c) {
            return (c.personId || null) === (data.personId || null) &&
                   (c.categoryId || null) === (data.categoryId || null);
        });
        data.order     = siblings.length;
        data.createdAt = now;
        if (!data.updatedAt && credValue) data.updatedAt = now;
        var ref = await userCol('credentials').add(data);
        _credentials.push(Object.assign({ id: ref.id }, data));
    }

    window.location.hash = '#credentials';
}

function _fv(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
}

// ---------- Delete ----------

async function _credConfirmDelete(credId, credName) {
    if (!confirm('Delete "' + (credName || 'this credential') + '"? This cannot be undone.')) return;
    await userCol('credentials').doc(credId).delete();
    _credentials = _credentials.filter(function(c) { return c.id !== credId; });
    delete _credExpandedItems[credId];
    _credRefreshCatList();
}

// ---------- Category Management Page ----------

function _credRenderCategoriesPage() {
    var page = document.getElementById('page-credentials-categories');
    if (!page) return;

    var rowsHtml = _credCategories.map(_credCatMgmtRowHtml).join('');

    page.innerHTML =
        '<div class="page-header"><h2>Manage Categories</h2></div>' +
        '<div class="cred-cat-mgmt-list" id="credCatMgmtList">' + rowsHtml + '</div>' +
        '<div class="cred-cat-mgmt-add">' +
            '<input type="text" id="credNewCatInp" placeholder="New category name"' +
                   ' onkeydown="if(event.key===\'Enter\')_credAddCatFromInput()">' +
            '<button class="btn btn-primary" onclick="_credAddCatFromInput()">Add</button>' +
        '</div>' +
        '<div class="cred-cat-mgmt-pinned">' +
            '<div class="cred-cat-mgmt-row">' +
                '<span class="cred-drag-handle" style="visibility:hidden">≡</span>' +
                '<span class="cred-cat-mgmt-name">Uncategorized</span>' +
                '<span class="cred-cat-mgmt-system">System — cannot be deleted</span>' +
            '</div>' +
        '</div>';
}

function _credCatMgmtRowHtml(cat) {
    return '<div class="cred-cat-mgmt-row" data-cat-id="' + escapeHtml(cat.id) + '"' +
        ' draggable="true"' +
        ' ondragstart="_credCatDragStart(event,\'' + escapeHtml(cat.id) + '\')"' +
        ' ondragover="_credCatDragOver(event,\'' + escapeHtml(cat.id) + '\')"' +
        ' ondragleave="_credCatDragLeave(event,\'' + escapeHtml(cat.id) + '\')"' +
        ' ondrop="_credCatDrop(event,\'' + escapeHtml(cat.id) + '\')"' +
        ' ondragend="_credCatDragEnd()">' +
        '<span class="cred-drag-handle" title="Drag to reorder">≡</span>' +
        '<span class="cred-cat-mgmt-name" id="credCatNm_' + escapeHtml(cat.id) + '">' + escapeHtml(cat.name) + '</span>' +
        '<input class="cred-cat-mgmt-input" id="credCatInp_' + escapeHtml(cat.id) + '"' +
               ' type="text" value="' + escapeHtml(cat.name) + '" style="display:none"' +
               ' onkeydown="_credCatKeyDown(event,\'' + escapeHtml(cat.id) + '\')">' +
        '<div class="cred-cat-mgmt-actions">' +
            '<button class="btn btn-secondary btn-small" id="credCatRenBtn_' + escapeHtml(cat.id) + '"' +
                    ' onclick="_credStartRename(\'' + escapeHtml(cat.id) + '\')">Rename</button>' +
            '<button class="btn btn-primary btn-small" id="credCatSvBtn_' + escapeHtml(cat.id) + '"' +
                    ' style="display:none"' +
                    ' onclick="_credSaveRename(\'' + escapeHtml(cat.id) + '\')">Save</button>' +
            '<button class="btn btn-secondary btn-small" id="credCatCxBtn_' + escapeHtml(cat.id) + '"' +
                    ' style="display:none"' +
                    ' onclick="_credCancelRename(\'' + escapeHtml(cat.id) + '\')">Cancel</button>' +
            '<button class="btn btn-danger btn-small"' +
                    ' onclick="_credDeleteCat(\'' + escapeHtml(cat.id) + '\',\'' + _credEscJs(cat.name) + '\')">Delete</button>' +
        '</div>' +
    '</div>';
}

function _credStartRename(catId) {
    document.getElementById('credCatNm_'    + catId).style.display = 'none';
    document.getElementById('credCatInp_'   + catId).style.display = '';
    document.getElementById('credCatRenBtn_'+ catId).style.display = 'none';
    document.getElementById('credCatSvBtn_' + catId).style.display = '';
    document.getElementById('credCatCxBtn_' + catId).style.display = '';
    document.getElementById('credCatInp_'   + catId).focus();
}

function _credCancelRename(catId) {
    var cat = _credCategories.find(function(c) { return c.id === catId; });
    document.getElementById('credCatInp_'   + catId).value = cat ? cat.name : '';
    document.getElementById('credCatNm_'    + catId).style.display = '';
    document.getElementById('credCatInp_'   + catId).style.display = 'none';
    document.getElementById('credCatRenBtn_'+ catId).style.display = '';
    document.getElementById('credCatSvBtn_' + catId).style.display = 'none';
    document.getElementById('credCatCxBtn_' + catId).style.display = 'none';
}

function _credCatKeyDown(e, catId) {
    if (e.key === 'Enter')  _credSaveRename(catId);
    if (e.key === 'Escape') _credCancelRename(catId);
}

async function _credSaveRename(catId) {
    var inp  = document.getElementById('credCatInp_' + catId);
    var name = inp ? inp.value.trim() : '';
    if (!name) { alert('Category name cannot be empty.'); return; }
    await userCol('credentialCategories').doc(catId).update({ name: name });
    var cat = _credCategories.find(function(c) { return c.id === catId; });
    if (cat) cat.name = name;
    var nm = document.getElementById('credCatNm_' + catId);
    if (nm) nm.textContent = name;
    _credCancelRename(catId);
}

async function _credDeleteCat(catId, catName) {
    var count = _credentials.filter(function(c) { return c.categoryId === catId; }).length;
    var msg = count > 0
        ? 'Move ' + count + ' credential(s) to Uncategorized and delete "' + catName + '"?'
        : 'Delete category "' + catName + '"?';
    if (!confirm(msg)) return;
    if (count > 0) {
        var batch = db.batch();
        _credentials.filter(function(c) { return c.categoryId === catId; }).forEach(function(c) {
            batch.update(userCol('credentials').doc(c.id), { categoryId: null });
            c.categoryId = null;
        });
        await batch.commit();
    }
    await userCol('credentialCategories').doc(catId).delete();
    _credCategories = _credCategories.filter(function(c) { return c.id !== catId; });
    var row = document.querySelector('.cred-cat-mgmt-row[data-cat-id="' + catId + '"]');
    if (row) row.remove();
}

async function _credAddCatFromInput() {
    var inp  = document.getElementById('credNewCatInp');
    var name = inp ? inp.value.trim() : '';
    if (!name) return;
    var newOrder = _credCategories.length;
    var ref = await userCol('credentialCategories').add({ name: name, order: newOrder, createdAt: new Date() });
    var newCat = { id: ref.id, name: name, order: newOrder };
    _credCategories.push(newCat);
    if (inp) inp.value = '';
    var list = document.getElementById('credCatMgmtList');
    if (list) list.insertAdjacentHTML('beforeend', _credCatMgmtRowHtml(newCat));
}

// ---------- Drag — Credentials ----------

function _credItemDragStart(e, itemId, catKey) {
    _credDragItemId  = itemId;
    _credDragItemCat = catKey;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(function() {
        var el = document.querySelector('.cred-item[data-item-id="' + itemId + '"]');
        if (el) el.classList.add('cred-dragging');
    }, 0);
}

function _credItemDragOver(e, targetId) {
    if (targetId === _credDragItemId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var el = document.querySelector('.cred-item[data-item-id="' + targetId + '"]');
    if (!el) return;
    document.querySelectorAll('.cred-drop-before,.cred-drop-after').forEach(function(x) {
        x.classList.remove('cred-drop-before', 'cred-drop-after');
    });
    var rect   = el.getBoundingClientRect();
    var before = (e.clientY - rect.top) < rect.height / 2;
    el.classList.add(before ? 'cred-drop-before' : 'cred-drop-after');
}

function _credItemDragLeave(e, targetId) {
    var el = document.querySelector('.cred-item[data-item-id="' + targetId + '"]');
    if (el && !el.contains(e.relatedTarget)) el.classList.remove('cred-drop-before', 'cred-drop-after');
}

async function _credItemDrop(e, targetId, catKey) {
    e.preventDefault();
    var sourceId     = _credDragItemId;
    var sourceCatKey = _credDragItemCat;
    var before = false;
    var tgtEl  = document.querySelector('.cred-item[data-item-id="' + targetId + '"]');
    if (tgtEl) before = tgtEl.classList.contains('cred-drop-before');
    _credItemDragEnd();
    if (!sourceId || sourceId === targetId) return;

    var catId    = (catKey === '__uncategorized') ? null : catKey;
    var srcCatId = (sourceCatKey === '__uncategorized') ? null : sourceCatKey;
    var pid      = _credPersonFilter || null;

    // Cross-category move
    if (sourceCatKey !== catKey) {
        var srcItem = _credentials.find(function(c) { return c.id === sourceId; });
        if (!srcItem) return;

        var targetItems = _credentials.filter(function(c) {
            return (c.personId || null) === pid && (c.categoryId || null) === catId;
        }).sort(function(a, b) { return (a.order || 0) - (b.order || 0); });

        var ti2     = targetItems.findIndex(function(c) { return c.id === targetId; });
        var insIdx  = (ti2 < 0) ? targetItems.length : (before ? ti2 : ti2 + 1);
        targetItems.splice(insIdx, 0, srcItem);

        var srcItems = _credentials.filter(function(c) {
            return (c.personId || null) === pid && (c.categoryId || null) === srcCatId && c.id !== sourceId;
        }).sort(function(a, b) { return (a.order || 0) - (b.order || 0); });

        srcItem.categoryId = catId;
        var batch = db.batch();
        batch.update(userCol('credentials').doc(sourceId), { categoryId: catId });
        targetItems.forEach(function(item, i) {
            item.order = i;
            batch.update(userCol('credentials').doc(item.id), { order: i });
        });
        srcItems.forEach(function(item, i) {
            item.order = i;
            batch.update(userCol('credentials').doc(item.id), { order: i });
        });
        await batch.commit();
        _credRefreshCatList();
        return;
    }

    // Same-category reorder
    var items   = _credentials.filter(function(c) {
        return (c.personId || null) === pid && (c.categoryId || null) === catId;
    }).sort(function(a, b) { return (a.order || 0) - (b.order || 0); });

    var si = items.findIndex(function(c) { return c.id === sourceId; });
    var ti = items.findIndex(function(c) { return c.id === targetId; });
    if (si < 0 || ti < 0) return;

    var moved = items.splice(si, 1)[0];
    var ni    = before ? ti : ti + 1;
    if (ni > si) ni--;
    items.splice(ni, 0, moved);

    var batch = db.batch();
    items.forEach(function(item, i) {
        item.order = i;
        batch.update(userCol('credentials').doc(item.id), { order: i });
    });
    await batch.commit();

    var body = document.getElementById('credBody_' + catKey);
    if (body) body.innerHTML = items.map(function(item) { return _credItemHtml(item, catKey); }).join('');
}

function _credItemDragEnd() {
    document.querySelectorAll('.cred-dragging,.cred-drop-before,.cred-drop-after').forEach(function(el) {
        el.classList.remove('cred-dragging', 'cred-drop-before', 'cred-drop-after');
    });
    _credDragItemId  = null;
    _credDragItemCat = null;
}

// ---------- Drag — Categories ----------

function _credCatDragStart(e, catId) {
    _credDragCatId = catId;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(function() {
        var el = document.querySelector('.cred-cat-mgmt-row[data-cat-id="' + catId + '"]');
        if (el) el.classList.add('cred-dragging');
    }, 0);
}

function _credCatDragOver(e, targetId) {
    if (targetId === _credDragCatId) return;
    e.preventDefault();
    var el = document.querySelector('.cred-cat-mgmt-row[data-cat-id="' + targetId + '"]');
    if (!el) return;
    document.querySelectorAll('.cred-drop-before,.cred-drop-after').forEach(function(x) {
        x.classList.remove('cred-drop-before', 'cred-drop-after');
    });
    var rect   = el.getBoundingClientRect();
    var before = (e.clientY - rect.top) < rect.height / 2;
    el.classList.add(before ? 'cred-drop-before' : 'cred-drop-after');
}

function _credCatDragLeave(e, targetId) {
    var el = document.querySelector('.cred-cat-mgmt-row[data-cat-id="' + targetId + '"]');
    if (el && !el.contains(e.relatedTarget)) el.classList.remove('cred-drop-before', 'cred-drop-after');
}

async function _credCatDrop(e, targetId) {
    e.preventDefault();
    var sourceId = _credDragCatId;
    var before   = false;
    var tgtEl    = document.querySelector('.cred-cat-mgmt-row[data-cat-id="' + targetId + '"]');
    if (tgtEl) before = tgtEl.classList.contains('cred-drop-before');
    _credCatDragEnd();
    if (!sourceId || sourceId === targetId) return;

    var si = _credCategories.findIndex(function(c) { return c.id === sourceId; });
    var ti = _credCategories.findIndex(function(c) { return c.id === targetId; });
    if (si < 0 || ti < 0) return;

    var moved = _credCategories.splice(si, 1)[0];
    var ni    = before ? ti : ti + 1;
    if (ni > si) ni--;
    _credCategories.splice(ni, 0, moved);

    var batch = db.batch();
    _credCategories.forEach(function(cat, i) {
        cat.order = i;
        batch.update(userCol('credentialCategories').doc(cat.id), { order: i });
    });
    await batch.commit();

    var list = document.getElementById('credCatMgmtList');
    if (list) list.innerHTML = _credCategories.map(_credCatMgmtRowHtml).join('');
}

function _credCatDragEnd() {
    document.querySelectorAll('.cred-dragging,.cred-drop-before,.cred-drop-after').forEach(function(el) {
        el.classList.remove('cred-dragging', 'cred-drop-before', 'cred-drop-after');
    });
    _credDragCatId = null;
}
