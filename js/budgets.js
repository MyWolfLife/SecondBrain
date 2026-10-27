'use strict';

// ---------------------------------------------------------------------------
// Budgets — monthly budget planner with multiple scenarios
// ---------------------------------------------------------------------------
// State
var _budgetList        = [];   // all non-archived budget docs {id, name, isDefault}
var _budgetDraft       = null; // working copy: {id, name, categories[], lineItems[], incomeItems[]}
var _budgetOriginalIds = null; // {categories: Set, lineItems: Set, incomeItems: Set} — ids present in Firestore at load time
var _budgetDirty       = false;
var _budgetDefaultId   = null; // from settings doc
var _budgetDragSrcId    = null; // drag-and-drop source item localId
var _budgetDragSrcCatId = null; // source item's categoryId (for cross-category detection)
var _budgetCollapsed        = {};    // localId → true/false — accordion collapse state
var _budgetNoteOpen         = {};    // lineItem localId → true/false — note row open state
var _budgetIncomeCollapsed  = true;  // income section collapsed by default

// Non-monthly sub-screen state
var _nmBudgetId = null;
var _nmItems    = [];

// Pre-populated category quick-picks
var BUDGET_CATEGORY_PRESETS = ['Household', 'Vehicles', 'Loans', 'Other', 'Personal'];

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

async function loadBudgetPage() {
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#life">Life</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<a href="#investments">Financial</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<span>Budgets</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';

    var page = document.getElementById('page-budget');
    if (!page) return;
    page.innerHTML = '<p class="muted-text" style="padding:16px">Loading…</p>';

    await _budgetLoadMeta();

    if (_budgetList.length === 0) {
        _budgetRenderEmpty(page);
        return;
    }

    // Load the default budget (or first in list if no default)
    var targetId = _budgetDefaultId || _budgetList[0].id;
    await _budgetLoadData(targetId);
    _budgetRender(page);
}

async function loadBudgetArchivePage() {
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#life">Life</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<a href="#investments">Financial</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<a href="#budget">Budgets</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<span>Archives</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';

    var page = document.getElementById('page-budget-archive');
    if (!page) return;
    page.innerHTML = '<p class="muted-text" style="padding:16px">Loading…</p>';

    var archivedDocs = await bgOwnDocs(true);      // mine, including ones I shared
    var archived = [];
    archivedDocs.forEach(function(doc) {
        archived.push(Object.assign({ id: doc.id }, doc.data()));
    });
    archived.sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });

    var html = '<div class="page-header">' +
        '<h2>📦 Budget Archives</h2>' +
        '<div class="page-header-actions">' +
            '<a class="btn btn-secondary btn-small" href="#budget">‹ Back to Budgets</a>' +
        '</div>' +
    '</div>';

    if (archived.length === 0) {
        html += '<p class="muted-text" style="padding:0 16px">No archived budgets.</p>';
    } else {
        html += '<div class="budget-archive-list">';
        archived.forEach(function(b) {
            html += '<div class="budget-archive-row">' +
                '<span class="budget-archive-name">' + escapeHtml(b.name) + '</span>' +
                '<div class="budget-archive-actions">' +
                    '<button class="btn btn-secondary btn-small" onclick="_budgetUnarchive(\'' + b.id + '\')">Restore</button>' +
                    '<button class="btn btn-danger btn-small" onclick="_budgetDeleteConfirm(\'' + b.id + '\', ' + JSON.stringify(b.name) + ', true)">Delete</button>' +
                '</div>' +
            '</div>';
        });
        html += '</div>';
    }

    page.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function _budgetLoadMeta() {
    // Load settings for defaultBudgetId
    try {
        var settingsDoc = await userCol('settings').doc('llm').get();
        // defaultBudgetId lives in 'app' settings doc
    } catch(e) {}
    var appSettings = await userCol('settings').doc('app').get();
    _budgetDefaultId = appSettings.exists ? (appSettings.data().defaultBudgetId || null) : null;

    // Load all non-archived budgets: mine (private and the ones I shared), then the ones shared with me (sharebudget.js)
    await bgLoad(true);
    var ownDocs = await bgOwnDocs(false);
    _budgetList = [];
    ownDocs.forEach(function(doc) {
        _budgetList.push(Object.assign({ id: doc.id }, doc.data(), { _shareId: bgShareIdFor(doc.id), _role: 'owner' }));
    });
    (await bgSharedWithMeDocs()).forEach(function(doc) {
        _budgetList.push(Object.assign({ id: doc.id }, doc.data(), { _shareId: bgShareIdFor(doc.id), _role: bgRoleFor(doc.id), _ownerName: _bgWithMe[doc.id].ownerName }));
    });
    // Mine first (default first, then alphabetical), then the ones shared with me
    _budgetList.sort(function(a, b) {
        if ((a._role !== 'owner') !== (b._role !== 'owner')) return a._role === 'owner' ? -1 : 1;
        if (a.id === _budgetDefaultId) return -1;
        if (b.id === _budgetDefaultId) return 1;
        return (a.name || '').localeCompare(b.name || '');
    });
}

async function _budgetLoadData(budgetId) {
    var budgetDoc = await bgRef(budgetId).get();
    if (!budgetDoc.exists) return;

    var data = budgetDoc.data();
    _budgetDraft = {
        id:              budgetId,
        name:            data.name || '',
        isArchived:      data.isArchived || false,
        categories:      [],
        lineItems:       [],
        incomeItems:     [],
        nonMonthlyItems: []
    };

    _budgetOriginalIds = {
        categories:  new Set(),
        lineItems:   new Set(),
        incomeItems: new Set()
    };

    var ref = bgRef(budgetId);

    var [catSnap, itemSnap, incSnap, nmSnap] = await Promise.all([
        ref.collection('categories').orderBy('sortOrder').get(),
        ref.collection('lineItems').orderBy('sortOrder').get(),
        ref.collection('incomeItems').orderBy('sortOrder').get(),
        ref.collection('nonMonthlyItems').orderBy('sortOrder').get()
    ]);

    // Reset collapse state — all categories and income start collapsed by default
    _budgetCollapsed       = { '__nonmonthly__': true };
    _budgetIncomeCollapsed = true;

    catSnap.forEach(function(doc) {
        _budgetDraft.categories.push(Object.assign({ firestoreId: doc.id, localId: doc.id }, doc.data()));
        _budgetOriginalIds.categories.add(doc.id);
        _budgetCollapsed[doc.id] = true; // collapsed by default
    });
    itemSnap.forEach(function(doc) {
        _budgetDraft.lineItems.push(Object.assign({ firestoreId: doc.id, localId: doc.id }, doc.data()));
        _budgetOriginalIds.lineItems.add(doc.id);
    });
    incSnap.forEach(function(doc) {
        _budgetDraft.incomeItems.push(Object.assign({ firestoreId: doc.id, localId: doc.id }, doc.data()));
        _budgetOriginalIds.incomeItems.add(doc.id);
    });
    nmSnap.forEach(function(doc) {
        _budgetDraft.nonMonthlyItems.push(Object.assign({ id: doc.id }, doc.data()));
    });

    _budgetDirty = false;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function _budgetRenderEmpty(page) {
    page.innerHTML =
        '<div class="page-header">' +
            '<h2>💰 Budgets</h2>' +
        '</div>' +
        '<div class="budget-empty">' +
            '<p class="muted-text">No budgets yet. Create your first budget to get started.</p>' +
            '<button class="btn btn-primary" onclick="_budgetStartCreate()">+ Create Budget</button>' +
        '</div>';
}

function _budgetRender(page) {
    if (!_budgetDraft) return;

    var isDefault = _budgetDraft.id === _budgetDefaultId;
    var totals    = _budgetCalcTotals();

    var html = '<div class="budget-page">';

    // — Header row: dropdown + archive link
    html += '<div class="budget-header">' +
        '<div class="budget-selector-wrap">' +
            _budgetDropdownHtml() +
        '</div>' +
        '<a class="btn btn-secondary btn-small" href="#budget/archive">📦 Archives</a>' +
    '</div>';

    // — Budget name + default badge
    html += '<div class="budget-title-row">' +
        '<div class="budget-name-display">' +
            '<span class="budget-name-text" id="budgetNameDisplay">' + escapeHtml(_budgetDraft.name) + '</span>' +
            (isDefault ? '<span class="budget-default-badge">Default Budget</span>' : '') +
            (bgIsOwner(_budgetDraft.id) ? '<button class="btn-icon budget-rename-btn" onclick="_budgetStartRename()" title="Rename">✏️</button>' : '') +
        '</div>' +
    '</div>';

    // — Summary (top, above categories)
    html += _budgetSummaryHtml(totals);

    // — Add Category button + picker (below summary)
    html += '<div class="budget-add-category-wrap">' +
        '<button class="btn btn-secondary btn-small" onclick="_budgetShowAddCategory()">+ Add Category</button>' +
    '</div>';
    html += '<div class="budget-category-picker hidden" id="budgetCategoryPicker">' +
        '<div class="budget-picker-label">Quick-pick:</div>' +
        '<div class="budget-picker-chips">';
    BUDGET_CATEGORY_PRESETS.forEach(function(name) {
        html += '<button class="budget-chip" onclick="_budgetAddCategory(\'' + escapeHtml(name) + '\')">' + escapeHtml(name) + '</button>';
    });
    html += '</div>' +
        '<div class="budget-picker-custom">' +
            '<input type="text" id="budgetCustomCatName" placeholder="Or type a custom name…" onkeydown="if(event.key===\'Enter\') _budgetAddCategoryCustom()">' +
            '<button class="btn btn-primary btn-small" onclick="_budgetAddCategoryCustom()">Add</button>' +
            '<button class="btn btn-secondary btn-small" onclick="_budgetHideAddCategory()">Cancel</button>' +
        '</div>' +
    '</div>';

    // — Expense categories (collapsible accordions)
    html += '<div class="budget-categories" id="budgetCategories">';
    _budgetDraft.categories.forEach(function(cat) {
        html += _budgetCategoryHtml(cat, totals);
    });
    html += '</div>';

    // — Non-Monthly Reserve auto-category (collapsible, read-only)
    var nmCollapsed   = !!_budgetCollapsed['__nonmonthly__'];
    var activeNmCount = (_budgetDraft.nonMonthlyItems || []).filter(function(i) { return i.isActive !== false; }).length;
    var totalNmCount  = (_budgetDraft.nonMonthlyItems || []).length;
    html += '<div class="budget-category budget-nonmonthly-cat' + (nmCollapsed ? ' budget-category--collapsed' : '') + '" data-cat-id="__nonmonthly__">' +
        '<div class="budget-category-header budget-category-header--toggle" onclick="_budgetToggleCategory(\'__nonmonthly__\')">' +
            '<span class="budget-cat-toggle">' + (nmCollapsed ? '▶' : '▼') + '</span>' +
            '<span class="budget-category-name">💼 Non-Monthly Reserve</span>' +
            '<span class="budget-category-subtotal" id="nmReserveSubtotal">' + _budgetFmt(totals.nonMonthlyReserve) + '/mo</span>' +
            '<button class="btn btn-secondary btn-small" onclick="event.stopPropagation(); _budgetGoToNonMonthly()">Manage</button>' +
        '</div>' +
        '<div class="budget-nonmonthly-desc" id="nmReserveDesc">' +
            (totalNmCount === 0
                ? '<span class="muted-text">No non-monthly items yet. Tap Manage to add them.</span>'
                : activeNmCount + ' of ' + totalNmCount + ' items active &middot; ' +
                  _budgetFmt(totals.nonMonthlyReserve * 12) + ' annual &divide; 12') +
        '</div>' +
    '</div>';

    // — Income section (collapsible accordion)
    html += '<div class="budget-income-section' + (_budgetIncomeCollapsed ? ' budget-income--collapsed' : '') + '">' +
        '<div class="budget-section-header budget-section-header--toggle" onclick="_budgetToggleIncome()">' +
            '<span class="budget-cat-toggle">' + (_budgetIncomeCollapsed ? '▶' : '▼') + '</span>' +
            '<span class="budget-section-title">Income</span>' +
            '<span class="budget-section-subtotal" id="budgetIncomeTotalDisplay">Total: <strong>' + _budgetFmt(totals.totalIncome) + '</strong></span>' +
        '</div>' +
        '<div class="budget-item-rows" id="budgetIncomeRows">';

    _budgetDraft.incomeItems.forEach(function(item) {
        html += _budgetIncomeRowHtml(item);
    });

    html += '</div>' +
        '<button class="budget-add-item-btn" onclick="_budgetAddIncomeItem()">+ Add Income Line</button>' +
    '</div>';

    // — Action buttons
    html += '<div class="budget-actions">' +
        '<div class="budget-actions-primary">' +
            '<button class="btn btn-primary" onclick="_budgetSave()" id="budgetSaveBtn">Save</button>' +
            '<button class="btn btn-secondary" onclick="_budgetDiscardConfirm()">Discard Changes</button>' +
        '</div>' +
        // Only the owner shares, sets the default, archives or deletes a budget
        (bgIsOwner(_budgetDraft.id) ?
        '<div class="budget-actions-secondary">' +
            '<button class="btn btn-secondary btn-small" id="budgetShareBtn" onclick="_budgetOpenShare()">' + (bgShareIdFor(_budgetDraft.id) ? 'Sharing…' : 'Share…') + '</button>' +
            (!isDefault ? '<button class="btn btn-secondary btn-small" onclick="_budgetSetDefault(\'' + _budgetDraft.id + '\')">Use as Default</button>' : '') +
            '<button class="btn btn-secondary btn-small" onclick="_budgetArchiveConfirm()">Archive</button>' +
            '<button class="btn btn-danger btn-small" onclick="_budgetDeleteConfirm(\'' + _budgetDraft.id + '\', ' + JSON.stringify(_budgetDraft.name) + ', false)">Delete</button>' +
        '</div>' : '') +
    '</div>';

    html += '</div>'; // .budget-page

    page.innerHTML = html;

    // A budget shared with me as "View only": no fields or buttons (the Non-Monthly "Manage" button stays: that page is view only too)
    if (!bgCanEdit(_budgetDraft.id)) bgApplyViewOnly(page.querySelector('.budget-page'), '.budget-dropdown, .budget-nonmonthly-cat button');

    // Wire drag-to-reorder on all category row containers and income rows
    _budgetDraft.categories.forEach(function(cat) {
        _budgetWireItemDrag(document.getElementById('budgetCatRows_' + cat.localId));
    });
    _budgetWireIncomeDrag();
    // Wire category containers as drop zones for cross-category item moves
    _budgetWireCategoryDrop();
}

function _budgetDropdownHtml() {
    var html = '<select class="budget-dropdown" onchange="_budgetDropdownChanged(this.value)">';
    _budgetList.forEach(function(b) {
        var label = b.name + (b.id === _budgetDefaultId ? ' ★' : '') +
            (b._role !== 'owner' ? ' (shared by ' + (b._ownerName || 'someone') + ')' : (b._shareId ? ' (shared)' : ''));
        html += '<option value="' + b.id + '"' + (b.id === (_budgetDraft && _budgetDraft.id) ? ' selected' : '') + '>' +
            escapeHtml(label) + '</option>';
    });
    html += '<option value="__new__">+ Add New Budget</option>';
    html += '</select>';
    return html;
}

function _budgetCategoryHtml(cat, totals) {
    var subtotal   = totals.byCat[cat.localId] || 0;
    var items      = _budgetDraft.lineItems.filter(function(i) { return i.categoryId === cat.localId; });
    var collapsed  = !!_budgetCollapsed[cat.localId];

    var html = '<div class="budget-category' + (collapsed ? ' budget-category--collapsed' : '') + '" data-cat-id="' + cat.localId + '">' +
        '<div class="budget-category-header budget-category-header--toggle" onclick="_budgetToggleCategory(\'' + cat.localId + '\')">' +
            '<span class="budget-cat-toggle">' + (collapsed ? '▶' : '▼') + '</span>' +
            '<span class="budget-category-name">' + escapeHtml(cat.name) + '</span>' +
            '<span class="budget-category-subtotal">' + _budgetFmt(subtotal) + '</span>' +
            '<button class="btn-icon" onclick="event.stopPropagation(); _budgetDeleteCategory(\'' + cat.localId + '\', ' + JSON.stringify(cat.name) + ')" title="Delete category">🗑</button>' +
        '</div>' +
        '<div class="budget-item-rows" data-cat-id="' + cat.localId + '" id="budgetCatRows_' + cat.localId + '">';

    items.forEach(function(item) {
        html += _budgetLineItemRowHtml(item);
    });

    html += '</div>' +
        '<button class="budget-add-item-btn" onclick="_budgetAddLineItem(\'' + cat.localId + '\')">+ Add Item</button>' +
    '</div>';

    return html;
}

function _budgetToggleCategory(localId) {
    _budgetCollapsed[localId] = !_budgetCollapsed[localId];
    var catEl  = document.querySelector('.budget-category[data-cat-id="' + localId + '"]');
    if (!catEl) return;
    catEl.classList.toggle('budget-category--collapsed', _budgetCollapsed[localId]);
    var icon = catEl.querySelector('.budget-cat-toggle');
    if (icon) icon.textContent = _budgetCollapsed[localId] ? '▶' : '▼';
}

// Toggle the income section accordion
function _budgetToggleIncome() {
    _budgetIncomeCollapsed = !_budgetIncomeCollapsed;
    var sec  = document.querySelector('.budget-income-section');
    if (!sec) return;
    sec.classList.toggle('budget-income--collapsed', _budgetIncomeCollapsed);
    var icon = sec.querySelector('.budget-section-header--toggle .budget-cat-toggle');
    if (icon) icon.textContent = _budgetIncomeCollapsed ? '▶' : '▼';
}

// Toggle the note row on a line item open/closed
function _budgetToggleNote(localId) {
    _budgetNoteOpen[localId] = !_budgetNoteOpen[localId];
    var wrap    = document.querySelector('.budget-item-wrap[data-item-id="' + localId + '"]');
    if (!wrap) return;
    var noteRow = wrap.querySelector('.budget-note-row');
    if (noteRow) {
        noteRow.classList.toggle('budget-note-row--hidden', !_budgetNoteOpen[localId]);
        // Focus the input when opening
        if (_budgetNoteOpen[localId]) {
            var inp = noteRow.querySelector('.budget-note-input');
            if (inp) inp.focus();
        }
    }
}

function _budgetLineItemRowHtml(item) {
    var hasNote  = !!(item.note && item.note.trim());
    var noteOpen = !!_budgetNoteOpen[item.localId];
    var noteIconClass = 'budget-note-icon' + (hasNote ? ' budget-note-icon--has-note' : '');
    return '<div class="budget-item-wrap" data-item-id="' + item.localId + '">' +
        '<div class="budget-item-row" draggable="true" data-item-id="' + item.localId + '">' +
            '<span class="budget-drag-handle" title="Drag to reorder">⠿</span>' +
            '<input class="budget-item-name" type="text" value="' + escapeHtml(item.name || '') + '" placeholder="Item name"' +
                ' onchange="_budgetLineItemChanged(\'' + item.localId + '\', \'name\', this.value)">' +
            '<span class="budget-item-dollar">$</span>' +
            '<input class="budget-item-amount" type="number" min="0" step="1" value="' + (item.amount || '') + '" placeholder="0"' +
                ' oninput="_budgetLineItemChanged(\'' + item.localId + '\', \'amount\', this.value)">' +
            '<input class="budget-item-due" type="number" min="1" max="31" value="' + (item.estDueDay || '') + '" placeholder="Day"' +
                ' oninput="_budgetLineItemChanged(\'' + item.localId + '\', \'estDueDay\', this.value)" title="Est. due day of month">' +
            '<button class="btn-icon ' + noteIconClass + '" onclick="_budgetToggleNote(\'' + item.localId + '\')" title="' + (hasNote ? 'Has note — click to view/edit' : 'Add note') + '">💬</button>' +
            '<button class="btn-icon budget-item-delete" onclick="_budgetDeleteLineItem(\'' + item.localId + '\')" title="Delete item">🗑</button>' +
        '</div>' +
        '<div class="budget-note-row' + (noteOpen ? '' : ' budget-note-row--hidden') + '">' +
            '<input class="budget-note-input" type="text" value="' + escapeHtml(item.note || '') + '" placeholder="Add a note…"' +
                ' oninput="_budgetLineItemChanged(\'' + item.localId + '\', \'note\', this.value)">' +
        '</div>' +
    '</div>';
}

function _budgetIncomeRowHtml(item) {
    return '<div class="budget-item-row" data-income-id="' + item.localId + '" draggable="true">' +
        '<span class="budget-drag-handle" title="Drag to reorder">⠿</span>' +
        '<input class="budget-item-name" type="text" value="' + escapeHtml(item.name || '') + '" placeholder="Income source"' +
            ' onchange="_budgetIncomeChanged(\'' + item.localId + '\', \'name\', this.value)">' +
        '<span class="budget-item-dollar">$</span>' +
        '<input class="budget-item-amount" type="number" min="0" step="1" value="' + (item.amount || '') + '" placeholder="0"' +
            ' oninput="_budgetIncomeChanged(\'' + item.localId + '\', \'amount\', this.value)">' +
        '<button class="btn-icon budget-item-delete" onclick="_budgetDeleteIncomeItem(\'' + item.localId + '\')" title="Delete">🗑</button>' +
    '</div>';
}

function _budgetSummaryHtml(totals) {
    var leftover   = totals.totalIncome - totals.totalExpenses;
    var leftClass  = leftover >= 0 ? 'budget-leftover--positive' : 'budget-leftover--negative';
    var visibleCats = _budgetDraft.categories.filter(function(c) {
        return (totals.byCat[c.localId] || 0) > 0;
    });

    var html = '<div class="budget-summary">' +
        '<div class="budget-summary-title">Summary</div>';

    visibleCats.forEach(function(cat) {
        html += '<div class="budget-summary-row">' +
            '<span>' + escapeHtml(cat.name) + '</span>' +
            '<span>' + _budgetFmt(totals.byCat[cat.localId]) + '</span>' +
        '</div>';
    });

    if (totals.nonMonthlyReserve > 0) {
        html += '<div class="budget-summary-row">' +
            '<span>💼 Non-Monthly Reserve</span>' +
            '<span>' + _budgetFmt(totals.nonMonthlyReserve) + '</span>' +
        '</div>';
    }

    html += '<div class="budget-summary-row budget-summary-total">' +
        '<span>Total Expenses</span>' +
        '<span>' + _budgetFmt(totals.totalExpenses) + '</span>' +
    '</div>' +
    '<div class="budget-summary-row budget-summary-total">' +
        '<span>Total Income</span>' +
        '<span>' + _budgetFmt(totals.totalIncome) + '</span>' +
    '</div>' +
    '<div class="budget-summary-row budget-summary-leftover ' + leftClass + '">' +
        '<span>Leftover</span>' +
        '<span>' + _budgetFmt(leftover) + '</span>' +
    '</div>' +
    '</div>';

    return html;
}

// ---------------------------------------------------------------------------
// Totals calculation
// ---------------------------------------------------------------------------

function _budgetCalcTotals() {
    // Build a Set of valid category localIds so orphaned line items
    // (whose category was deleted) are excluded from all totals.
    var validCatIds = new Set(_budgetDraft.categories.map(function(c) { return c.localId; }));

    var byCat = {};
    _budgetDraft.categories.forEach(function(c) { byCat[c.localId] = 0; });
    _budgetDraft.lineItems.forEach(function(item) {
        if (!validCatIds.has(item.categoryId)) return; // skip orphaned items
        byCat[item.categoryId] = (byCat[item.categoryId] || 0) + (parseFloat(item.amount) || 0);
    });
    var nonMonthlyReserve = Math.round(
        (_budgetDraft.nonMonthlyItems || [])
            .filter(function(i) { return i.isActive !== false; })
            .reduce(function(s, i) { return s + (parseFloat(i.amount) || 0); }, 0) / 12
    );
    // Only sum categories that actually exist — prevents deleted-category amounts from inflating the total
    var totalExpenses = _budgetDraft.categories.reduce(function(s, c) { return s + (byCat[c.localId] || 0); }, 0) + nonMonthlyReserve;
    var totalIncome   = _budgetDraft.incomeItems.reduce(function(s, i) { return s + (parseFloat(i.amount) || 0); }, 0);
    return { byCat: byCat, nonMonthlyReserve: nonMonthlyReserve, totalExpenses: totalExpenses, totalIncome: totalIncome };
}

function _budgetFmt(n) {
    n = Math.round(n || 0);
    return '$' + n.toLocaleString();
}

// ---------------------------------------------------------------------------
// Dirty-state helpers
// ---------------------------------------------------------------------------

function _budgetMarkDirty() {
    _budgetDirty = true;
}

function _budgetCheckUnsaved(callback) {
    if (!_budgetDirty) { callback(); return; }
    if (confirm('You have unsaved changes. Discard them and continue?')) {
        _budgetDirty = false;
        callback();
    }
}

// ---------------------------------------------------------------------------
// Dropdown / navigation
// ---------------------------------------------------------------------------

function _budgetDropdownChanged(val) {
    if (val === '__new__') {
        // Reset dropdown visual back to current budget before opening dialog
        var sel = document.querySelector('.budget-dropdown');
        if (sel && _budgetDraft) sel.value = _budgetDraft.id;
        _budgetCheckUnsaved(function() { _budgetStartCreate(); });
        return;
    }
    if (val === (_budgetDraft && _budgetDraft.id)) return;
    _budgetCheckUnsaved(async function() {
        await _budgetLoadData(val);
        _budgetRender(document.getElementById('page-budget'));
    });
}

// ---------------------------------------------------------------------------
// Create / copy budget
// ---------------------------------------------------------------------------

function _budgetStartCreate() {
    var name = prompt('Budget name:');
    if (name === null) return; // cancelled
    name = name.trim();
    if (!name) { alert('Budget name cannot be blank.'); return; }

    // Offer copy-from if there are existing budgets
    var copyFromId = null;
    if (_budgetList.length > 0) {
        var opts = _budgetList.map(function(b, i) { return (i + 1) + '. ' + b.name; }).join('\n');
        var choice = prompt('Copy from an existing budget? Enter a number, or leave blank to start fresh:\n\n' + opts);
        if (choice !== null && choice.trim() !== '') {
            var idx = parseInt(choice.trim(), 10) - 1;
            if (idx >= 0 && idx < _budgetList.length) {
                copyFromId = _budgetList[idx].id;
            }
        }
    }

    _budgetCreateNew(name, copyFromId);
}

async function _budgetCreateNew(name, copyFromId) {
    var page = document.getElementById('page-budget');
    page.innerHTML = '<p class="muted-text" style="padding:16px">Creating budget…</p>';

    try {
        var newDoc = await userCol('budgets').add({
            name:       name,
            isArchived: false,
            createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt:  firebase.firestore.FieldValue.serverTimestamp()
        });
        var newId = newDoc.id;

        // If this is the very first budget, make it default automatically
        if (_budgetList.length === 0) {
            await userCol('settings').doc('app').set({ defaultBudgetId: newId }, { merge: true });
            _budgetDefaultId = newId;
        }

        // Copy subcollections from source budget if requested
        if (copyFromId) {
            await _budgetCopyFrom(copyFromId, newId);
        }

        // Reload meta and navigate to new budget
        await _budgetLoadMeta();
        await _budgetLoadData(newId);
        _budgetRender(page);
    } catch(e) {
        console.error('Error creating budget:', e);
        page.innerHTML = '<p class="muted-text" style="padding:16px">Error creating budget. Please try again.</p>';
    }
}

async function _budgetCopyFrom(srcId, destId) {
    var srcRef  = bgRef(srcId);
    var destRef = bgRef(destId);

    var [catSnap, itemSnap, incSnap] = await Promise.all([
        srcRef.collection('categories').orderBy('sortOrder').get(),
        srcRef.collection('lineItems').orderBy('sortOrder').get(),
        srcRef.collection('incomeItems').orderBy('sortOrder').get()
    ]);

    // Build a map of old category ID → new category ID for lineItem rewiring
    var catIdMap = {};
    var catBatch = db.batch();
    catSnap.forEach(function(doc) {
        var newRef = destRef.collection('categories').doc();
        catIdMap[doc.id] = newRef.id;
        catBatch.set(newRef, doc.data());
    });
    await catBatch.commit();

    var itemBatch = db.batch();
    itemSnap.forEach(function(doc) {
        var d = doc.data();
        d.categoryId = catIdMap[d.categoryId] || d.categoryId;
        itemBatch.set(destRef.collection('lineItems').doc(), d);
    });
    await itemBatch.commit();

    var incBatch = db.batch();
    incSnap.forEach(function(doc) {
        incBatch.set(destRef.collection('incomeItems').doc(), doc.data());
    });
    await incBatch.commit();

    var nmSnap = await srcRef.collection('nonMonthlyItems').orderBy('sortOrder').get();
    var nmBatch = db.batch();
    nmSnap.forEach(function(doc) {
        nmBatch.set(destRef.collection('nonMonthlyItems').doc(), doc.data());
    });
    await nmBatch.commit();
}

// ---------------------------------------------------------------------------
// Rename
// ---------------------------------------------------------------------------

function _budgetStartRename() {
    var current = _budgetDraft ? _budgetDraft.name : '';
    var name = prompt('Budget name:', current);
    if (name === null) return;
    name = name.trim();
    if (!name) { alert('Budget name cannot be blank.'); return; }
    _budgetDraft.name = name;
    _budgetMarkDirty();
    // Update display
    var el = document.getElementById('budgetNameDisplay');
    if (el) el.textContent = name;
    // Update dropdown option
    var opt = document.querySelector('.budget-dropdown option[value="' + _budgetDraft.id + '"]');
    if (opt) opt.textContent = name + (_budgetDraft.id === _budgetDefaultId ? ' ★' : '');
}

// ---------------------------------------------------------------------------
// Set Default
// ---------------------------------------------------------------------------

async function _budgetSetDefault(budgetId) {
    await userCol('settings').doc('app').set({ defaultBudgetId: budgetId }, { merge: true });
    _budgetDefaultId = budgetId;
    await _budgetLoadMeta();
    _budgetRender(document.getElementById('page-budget'));
}

// ---------------------------------------------------------------------------
// Archive
// ---------------------------------------------------------------------------

function _budgetArchiveConfirm() {
    if (_budgetDraft.id === _budgetDefaultId) {
        alert('This is your default budget. Please set another budget as default before archiving this one.');
        return;
    }
    if (!confirm('Archive this budget?\n\nIt will be removed from your active list but can be restored from Archives at any time.')) return;
    _budgetArchive(_budgetDraft.id);
}

async function _budgetArchive(budgetId) {
    await bgRef(budgetId).update({
        isArchived: true,
        updatedAt:  firebase.firestore.FieldValue.serverTimestamp()
    });
    await _budgetLoadMeta();
    var page = document.getElementById('page-budget');
    if (_budgetList.length === 0) {
        _budgetDraft  = null;
        _budgetDirty  = false;
        _budgetRenderEmpty(page);
    } else {
        var nextId = _budgetDefaultId || _budgetList[0].id;
        await _budgetLoadData(nextId);
        _budgetRender(page);
    }
}

async function _budgetUnarchive(budgetId) {
    await bgRef(budgetId).update({
        isArchived: false,
        updatedAt:  firebase.firestore.FieldValue.serverTimestamp()
    });
    loadBudgetArchivePage();
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

function _budgetDeleteConfirm(budgetId, budgetName, fromArchive) {
    if (!confirm('Delete "' + budgetName + '"?\n\nThis cannot be undone.')) return;
    _budgetDelete(budgetId, fromArchive);
}

async function _budgetDelete(budgetId, fromArchive) {
    // A budget that lives in a share: contents first, then the share (sharebudget.js)
    if (bgShareIdFor(budgetId) && bgIsOwner(budgetId)) {
        await bgDeleteSharedBudget(budgetId);
        if (budgetId === _budgetDefaultId) {
            await userCol('settings').doc('app').set({ defaultBudgetId: null }, { merge: true });
            _budgetDefaultId = null;
        }
        if (fromArchive) { loadBudgetArchivePage(); return; }
        await _budgetLoadMeta();
        var pg = document.getElementById('page-budget');
        if (_budgetList.length === 0) { _budgetDraft = null; _budgetDirty = false; _budgetRenderEmpty(pg); }
        else { await _budgetLoadData(_budgetDefaultId || _budgetList[0].id); _budgetRender(pg); }
        return;
    }
    // Delete all subcollections first, then the budget doc
    var ref = bgRef(budgetId);
    var subs = ['categories', 'lineItems', 'incomeItems', 'nonMonthlyItems'];
    for (var s = 0; s < subs.length; s++) {
        var snap = await ref.collection(subs[s]).get();
        if (!snap.empty) {
            var batch = db.batch();
            snap.docs.forEach(function(d) { batch.delete(d.ref); });
            await batch.commit();
        }
    }
    await ref.delete();

    // If this was the default, clear it
    if (budgetId === _budgetDefaultId) {
        await userCol('settings').doc('app').set({ defaultBudgetId: null }, { merge: true });
        _budgetDefaultId = null;
    }

    if (fromArchive) {
        loadBudgetArchivePage();
        return;
    }

    await _budgetLoadMeta();
    var page = document.getElementById('page-budget');
    if (_budgetList.length === 0) {
        _budgetDraft = null;
        _budgetDirty = false;
        _budgetRenderEmpty(page);
    } else {
        var nextId = _budgetDefaultId || _budgetList[0].id;
        await _budgetLoadData(nextId);
        _budgetRender(page);
    }
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function _budgetShowAddCategory() {
    document.getElementById('budgetCategoryPicker').classList.remove('hidden');
}

function _budgetHideAddCategory() {
    document.getElementById('budgetCategoryPicker').classList.add('hidden');
    var inp = document.getElementById('budgetCustomCatName');
    if (inp) inp.value = '';
}

function _budgetAddCategory(name) {
    _budgetHideAddCategory();
    _budgetInsertCategory(name);
}

function _budgetAddCategoryCustom() {
    var inp  = document.getElementById('budgetCustomCatName');
    var name = inp ? inp.value.trim() : '';
    if (!name) { alert('Please enter a category name.'); return; }
    _budgetHideAddCategory();
    _budgetInsertCategory(name);
}

function _budgetInsertCategory(name) {
    var localId = 'cat_' + Date.now();
    var sortOrder = _budgetDraft.categories.length;
    _budgetDraft.categories.push({ localId: localId, firestoreId: null, name: name, sortOrder: sortOrder });
    _budgetCollapsed[localId] = true; // new categories start collapsed
    _budgetMarkDirty();

    // Append category HTML without full re-render
    var container = document.getElementById('budgetCategories');
    if (container) {
        var totals = _budgetCalcTotals();
        var div = document.createElement('div');
        div.innerHTML = _budgetCategoryHtml(_budgetDraft.categories[_budgetDraft.categories.length - 1], totals);
        container.appendChild(div.firstChild);
    }
    _budgetRefreshSummary();
}

function _budgetDeleteCategory(localId, name) {
    var itemCount = _budgetDraft.lineItems.filter(function(i) { return i.categoryId === localId; }).length;
    var msg = itemCount > 0
        ? 'Delete "' + name + '" and its ' + itemCount + ' item' + (itemCount === 1 ? '' : 's') + '? This cannot be undone.'
        : 'Delete "' + name + '"? This cannot be undone.';
    if (!confirm(msg)) return;

    _budgetDraft.categories = _budgetDraft.categories.filter(function(c) { return c.localId !== localId; });
    _budgetDraft.lineItems  = _budgetDraft.lineItems.filter(function(i) { return i.categoryId !== localId; });
    _budgetMarkDirty();

    var el = document.querySelector('[data-cat-id="' + localId + '"].budget-category');
    if (el) el.remove();
    _budgetRefreshSummary();
}

// ---------------------------------------------------------------------------
// Line items
// ---------------------------------------------------------------------------

function _budgetAddLineItem(catLocalId) {
    var localId = 'item_' + Date.now();
    var existing = _budgetDraft.lineItems.filter(function(i) { return i.categoryId === catLocalId; });
    _budgetDraft.lineItems.push({
        localId:     localId,
        firestoreId: null,
        categoryId:  catLocalId,
        name:        '',
        amount:      '',
        estDueDay:   '',
        sortOrder:   existing.length
    });
    _budgetMarkDirty();

    var rowsEl = document.getElementById('budgetCatRows_' + catLocalId);
    if (rowsEl) {
        var div = document.createElement('div');
        div.innerHTML = _budgetLineItemRowHtml(_budgetDraft.lineItems[_budgetDraft.lineItems.length - 1]);
        rowsEl.appendChild(div.firstChild);
        _budgetWireItemDrag(rowsEl);
        // Focus the name input of the new row
        var input = rowsEl.lastElementChild && rowsEl.lastElementChild.querySelector('.budget-item-name');
        if (input) input.focus();
    }
}

function _budgetLineItemChanged(localId, field, value) {
    var item = _budgetDraft.lineItems.find(function(i) { return i.localId === localId; });
    if (!item) return;
    if (field === 'amount' || field === 'estDueDay') {
        item[field] = value === '' ? '' : parseInt(value, 10) || 0;
    } else {
        item[field] = value;
    }
    _budgetMarkDirty();
    if (field === 'amount') _budgetRefreshSummary();
    // Refresh the note icon so it lights up/dims as user types
    if (field === 'note') {
        var wrap = document.querySelector('.budget-item-wrap[data-item-id="' + localId + '"]');
        if (wrap) {
            var btn = wrap.querySelector('.budget-note-icon');
            if (btn) {
                var hasNote = !!(value && value.trim());
                btn.classList.toggle('budget-note-icon--has-note', hasNote);
                btn.title = hasNote ? 'Has note — click to view/edit' : 'Add note';
            }
        }
    }
}

function _budgetDeleteLineItem(localId) {
    if (!confirm('Delete this item?')) return;
    var item = _budgetDraft.lineItems.find(function(i) { return i.localId === localId; });
    _budgetDraft.lineItems = _budgetDraft.lineItems.filter(function(i) { return i.localId !== localId; });
    _budgetMarkDirty();
    var el = document.querySelector('[data-item-id="' + localId + '"]');
    if (el) el.remove();
    _budgetRefreshSummary();
    // Update category subtotal display
    if (item) _budgetRefreshCategorySubtotal(item.categoryId);
}

function _budgetRefreshCategorySubtotal(catLocalId) {
    var totals   = _budgetCalcTotals();
    var subtotal = totals.byCat[catLocalId] || 0;
    var catEl    = document.querySelector('[data-cat-id="' + catLocalId + '"].budget-category');
    if (catEl) {
        var subtotalEl = catEl.querySelector('.budget-category-subtotal');
        if (subtotalEl) subtotalEl.textContent = _budgetFmt(subtotal);
    }
}

// ---------------------------------------------------------------------------
// Income items
// ---------------------------------------------------------------------------

function _budgetAddIncomeItem() {
    var localId = 'inc_' + Date.now();
    _budgetDraft.incomeItems.push({
        localId:     localId,
        firestoreId: null,
        name:        '',
        amount:      '',
        sortOrder:   _budgetDraft.incomeItems.length
    });
    _budgetMarkDirty();

    var rowsEl = document.getElementById('budgetIncomeRows');
    if (rowsEl) {
        var div = document.createElement('div');
        div.innerHTML = _budgetIncomeRowHtml(_budgetDraft.incomeItems[_budgetDraft.incomeItems.length - 1]);
        rowsEl.appendChild(div.firstChild);
        _budgetWireIncomeDrag();
        var input = rowsEl.lastElementChild && rowsEl.lastElementChild.querySelector('.budget-item-name');
        if (input) input.focus();
    }
}

function _budgetIncomeChanged(localId, field, value) {
    var item = _budgetDraft.incomeItems.find(function(i) { return i.localId === localId; });
    if (!item) return;
    item[field] = (field === 'amount') ? (value === '' ? '' : parseInt(value, 10) || 0) : value;
    _budgetMarkDirty();
    if (field === 'amount') _budgetRefreshSummary();
}

function _budgetDeleteIncomeItem(localId) {
    if (!confirm('Delete this income line?')) return;
    _budgetDraft.incomeItems = _budgetDraft.incomeItems.filter(function(i) { return i.localId !== localId; });
    _budgetMarkDirty();
    var el = document.querySelector('[data-income-id="' + localId + '"]');
    if (el) el.remove();
    _budgetRefreshSummary();
}

// ---------------------------------------------------------------------------
// Summary refresh (partial re-render, no full page rebuild)
// ---------------------------------------------------------------------------

function _budgetRefreshSummary() {
    var totals  = _budgetCalcTotals();
    var summary = document.querySelector('.budget-summary');
    if (summary) summary.outerHTML = _budgetSummaryHtml(totals);

    // Refresh income total line
    var incTotalEl = document.querySelector('.budget-income-section .budget-section-subtotal strong');
    if (incTotalEl) incTotalEl.textContent = _budgetFmt(totals.totalIncome);

    // Refresh each visible category subtotal
    _budgetDraft.categories.forEach(function(cat) {
        _budgetRefreshCategorySubtotal(cat.localId);
    });

    // Refresh non-monthly reserve display
    var nmSubtotal = document.getElementById('nmReserveSubtotal');
    if (nmSubtotal) nmSubtotal.textContent = _budgetFmt(totals.nonMonthlyReserve) + '/mo';
    var nmDesc = document.getElementById('nmReserveDesc');
    if (nmDesc) {
        var activeNmCount = (_budgetDraft.nonMonthlyItems || []).filter(function(i) { return i.isActive !== false; }).length;
        var totalNmCount  = (_budgetDraft.nonMonthlyItems || []).length;
        nmDesc.innerHTML = totalNmCount === 0
            ? '<span class="muted-text">No non-monthly items yet. Tap Manage to add them.</span>'
            : activeNmCount + ' of ' + totalNmCount + ' items active &middot; ' +
              _budgetFmt(totals.nonMonthlyReserve * 12) + ' annual &divide; 12';
    }
}

async function _budgetGoToNonMonthly() {
    if (_budgetDirty) {
        if (!confirm('You have unsaved changes. Save before continuing?')) return;
        await _budgetSave();
    }
    window.location.hash = '#budget/nonmonthly/' + _budgetDraft.id;
}

// ---------------------------------------------------------------------------
// Save / Discard
// ---------------------------------------------------------------------------

async function _budgetSave() {
    if (!_budgetDraft) return;

    var saveBtn = document.getElementById('budgetSaveBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

    try {
        var budgetRef = bgRef(_budgetDraft.id);

        // Update the budget doc itself (name, updatedAt)
        await budgetRef.update({
            name:      _budgetDraft.name,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Upsert categories
        var newCatIds = new Set();
        for (var ci = 0; ci < _budgetDraft.categories.length; ci++) {
            var cat = _budgetDraft.categories[ci];
            cat.sortOrder = ci;
            if (cat.firestoreId) {
                await budgetRef.collection('categories').doc(cat.firestoreId).set({
                    name: cat.name, sortOrder: cat.sortOrder
                });
                newCatIds.add(cat.firestoreId);
            } else {
                var newRef = await budgetRef.collection('categories').add({
                    name: cat.name, sortOrder: cat.sortOrder
                });
                cat.firestoreId = newRef.id;
                cat.localId     = newRef.id;
                newCatIds.add(newRef.id);
                _budgetOriginalIds.categories.add(newRef.id);
            }
        }
        // Delete removed categories
        _budgetOriginalIds.categories.forEach(async function(fid) {
            if (!newCatIds.has(fid)) {
                await budgetRef.collection('categories').doc(fid).delete();
            }
        });
        _budgetOriginalIds.categories = newCatIds;

        // Upsert line items
        var newItemIds = new Set();
        for (var ii = 0; ii < _budgetDraft.lineItems.length; ii++) {
            var item = _budgetDraft.lineItems[ii];
            item.sortOrder = ii;
            // Resolve localId → firestoreId for categoryId
            var cat2 = _budgetDraft.categories.find(function(c) { return c.localId === item.categoryId; });
            var fsrCatId = cat2 ? cat2.firestoreId : item.categoryId;
            var payload  = { categoryId: fsrCatId, name: item.name, amount: parseFloat(item.amount) || 0, estDueDay: item.estDueDay || null, sortOrder: item.sortOrder };
            if (item.firestoreId) {
                await budgetRef.collection('lineItems').doc(item.firestoreId).set(payload);
                newItemIds.add(item.firestoreId);
            } else {
                var newIRef = await budgetRef.collection('lineItems').add(payload);
                item.firestoreId = newIRef.id;
                newItemIds.add(newIRef.id);
                _budgetOriginalIds.lineItems.add(newIRef.id);
            }
        }
        _budgetOriginalIds.lineItems.forEach(async function(fid) {
            if (!newItemIds.has(fid)) await budgetRef.collection('lineItems').doc(fid).delete();
        });
        _budgetOriginalIds.lineItems = newItemIds;

        // Upsert income items
        var newIncIds = new Set();
        for (var ini = 0; ini < _budgetDraft.incomeItems.length; ini++) {
            var inc = _budgetDraft.incomeItems[ini];
            inc.sortOrder = ini;
            var incPayload = { name: inc.name, amount: parseFloat(inc.amount) || 0, sortOrder: inc.sortOrder };
            if (inc.firestoreId) {
                await budgetRef.collection('incomeItems').doc(inc.firestoreId).set(incPayload);
                newIncIds.add(inc.firestoreId);
            } else {
                var newIncRef = await budgetRef.collection('incomeItems').add(incPayload);
                inc.firestoreId = newIncRef.id;
                newIncIds.add(newIncRef.id);
                _budgetOriginalIds.incomeItems.add(newIncRef.id);
            }
        }
        _budgetOriginalIds.incomeItems.forEach(async function(fid) {
            if (!newIncIds.has(fid)) await budgetRef.collection('incomeItems').doc(fid).delete();
        });
        _budgetOriginalIds.incomeItems = newIncIds;

        _budgetDirty = false;
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }

        // Update budget list name in case it was renamed
        var listEntry = _budgetList.find(function(b) { return b.id === _budgetDraft.id; });
        if (listEntry) listEntry.name = _budgetDraft.name;

    } catch(e) {
        console.error('Budget save error:', e);
        alert('Error saving budget. Please try again.');
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
    }
}

function _budgetDiscardConfirm() {
    if (!_budgetDirty) return;
    if (!confirm('Discard all unsaved changes?')) return;
    _budgetDirty = false;
    _budgetLoadData(_budgetDraft.id).then(function() {
        _budgetRender(document.getElementById('page-budget'));
    });
}

// ---------------------------------------------------------------------------
// Drag-to-reorder (line items within a category, and income items)
// ---------------------------------------------------------------------------

function _budgetWireItemDrag(rowsEl) {
    if (!rowsEl) return;
    rowsEl.querySelectorAll('.budget-item-row').forEach(function(row) {
        row.ondragstart  = _budgetDragStart;
        row.ondragover   = _budgetDragOver;
        row.ondrop       = _budgetDropItem;
        row.ondragend    = _budgetDragEnd;
    });
}

function _budgetWireIncomeDrag() {
    var rowsEl = document.getElementById('budgetIncomeRows');
    if (!rowsEl) return;
    rowsEl.querySelectorAll('.budget-item-row').forEach(function(row) {
        row.ondragstart  = _budgetDragStart;
        row.ondragover   = _budgetDragOver;
        row.ondrop       = _budgetDropIncome;
        row.ondragend    = _budgetDragEnd;
    });
}

function _budgetDragStart(e) {
    var row = e.currentTarget;
    _budgetDragSrcId = row.dataset.itemId || row.dataset.incomeId;
    // Record source category so cross-category drops can re-render the right containers
    var srcItem = _budgetDraft.lineItems.find(function(i) { return i.localId === _budgetDragSrcId; });
    _budgetDragSrcCatId = srcItem ? srcItem.categoryId : null;
    row.classList.add('budget-dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function _budgetDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function _budgetDragEnd(e) {
    e.currentTarget.classList.remove('budget-dragging');
    document.querySelectorAll('.budget-item-row').forEach(function(r) { r.classList.remove('budget-drag-over'); });
    document.querySelectorAll('.budget-cat-drag-over').forEach(function(el) { el.classList.remove('budget-cat-drag-over'); });
    _budgetDragSrcId    = null;
    _budgetDragSrcCatId = null;
}

// Shared helper: re-render one category's item rows and re-wire drag events
function _budgetRefreshCategoryRows(catLocalId) {
    var rowsEl = document.getElementById('budgetCatRows_' + catLocalId);
    if (!rowsEl) return;
    var items = _budgetDraft.lineItems.filter(function(i) { return i.categoryId === catLocalId; });
    rowsEl.innerHTML = items.map(_budgetLineItemRowHtml).join('');
    _budgetWireItemDrag(rowsEl);
}

function _budgetDropItem(e) {
    e.preventDefault();
    var targetRow = e.currentTarget;
    var targetId  = targetRow.dataset.itemId;
    if (!targetId || targetId === _budgetDragSrcId) return;

    var srcItem = _budgetDraft.lineItems.find(function(i) { return i.localId === _budgetDragSrcId; });
    var tgtItem = _budgetDraft.lineItems.find(function(i) { return i.localId === targetId; });
    if (!srcItem || !tgtItem) return;

    var srcCatId = srcItem.categoryId;
    var tgtCatId = tgtItem.categoryId;
    var crossCat = srcCatId !== tgtCatId;

    // Remove src, insert before target (splice mutates array so re-find target index after removal)
    _budgetDraft.lineItems = _budgetDraft.lineItems.filter(function(i) { return i.localId !== _budgetDragSrcId; });
    var tgtIdx = _budgetDraft.lineItems.findIndex(function(i) { return i.localId === targetId; });
    srcItem.categoryId = tgtCatId; // update category on cross-cat drop (no-op if same cat)
    _budgetDraft.lineItems.splice(tgtIdx, 0, srcItem);
    _budgetMarkDirty();

    _budgetRefreshCategoryRows(tgtCatId);
    if (crossCat) {
        _budgetRefreshCategoryRows(srcCatId);
        _budgetRefreshCategorySubtotal(srcCatId);
        _budgetRefreshCategorySubtotal(tgtCatId);
        _budgetRefreshSummary();
    }
}

function _budgetDropIncome(e) {
    e.preventDefault();
    var targetRow = e.currentTarget;
    var targetId  = targetRow.dataset.incomeId;
    if (!targetId || targetId === _budgetDragSrcId) return;

    var srcIdx = _budgetDraft.incomeItems.findIndex(function(i) { return i.localId === _budgetDragSrcId; });
    var tgtIdx = _budgetDraft.incomeItems.findIndex(function(i) { return i.localId === targetId; });
    if (srcIdx < 0 || tgtIdx < 0) return;

    var moved = _budgetDraft.incomeItems.splice(srcIdx, 1)[0];
    _budgetDraft.incomeItems.splice(tgtIdx, 0, moved);
    _budgetMarkDirty();

    var rowsEl = document.getElementById('budgetIncomeRows');
    if (rowsEl) {
        rowsEl.innerHTML = _budgetDraft.incomeItems.map(_budgetIncomeRowHtml).join('');
        _budgetWireIncomeDrag();
    }
}

// Wire each category container as a drop zone so items can be moved between categories.
// - Dragging over a collapsed category auto-expands it.
// - Dropping on the container (not on a specific row) appends the item to that category.
function _budgetWireCategoryDrop() {
    document.querySelectorAll('.budget-category[data-cat-id]').forEach(function(catEl) {
        var catId = catEl.dataset.catId;

        catEl.addEventListener('dragover', function(e) {
            if (!_budgetDragSrcCatId) return; // only handle line-item drags
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            catEl.classList.add('budget-cat-drag-over');
            // Auto-expand collapsed categories so the user can drop onto a specific row
            if (_budgetCollapsed[catId]) _budgetToggleCategory(catId);
        });

        catEl.addEventListener('dragleave', function(e) {
            // Only remove highlight when the cursor truly leaves this category
            if (!catEl.contains(e.relatedTarget)) {
                catEl.classList.remove('budget-cat-drag-over');
            }
        });

        catEl.addEventListener('drop', function(e) {
            catEl.classList.remove('budget-cat-drag-over');
            // If the drop landed on a specific row, the row's handler takes over
            if (e.target.closest('.budget-item-row')) return;

            var srcItem = _budgetDraft.lineItems.find(function(i) { return i.localId === _budgetDragSrcId; });
            if (!srcItem) return;

            var srcCatId = srcItem.categoryId;
            if (srcCatId === catId) return; // dropped back in same category — no-op

            e.preventDefault();
            // Move item: remove from current position, append to target category
            _budgetDraft.lineItems = _budgetDraft.lineItems.filter(function(i) { return i.localId !== _budgetDragSrcId; });
            srcItem.categoryId = catId;
            _budgetDraft.lineItems.push(srcItem);
            _budgetMarkDirty();

            _budgetRefreshCategoryRows(srcCatId);
            _budgetRefreshCategoryRows(catId);
            _budgetRefreshCategorySubtotal(srcCatId);
            _budgetRefreshCategorySubtotal(catId);
            _budgetRefreshSummary();
        });
    });
}

// ---------------------------------------------------------------------------
// Non-Monthly Expenses sub-screen  (#budget/nonmonthly/:id)
// Auto-saves every change directly to Firestore — no Save button.
// ---------------------------------------------------------------------------

async function loadBudgetNonMonthlyPage(budgetId) {
    _nmBudgetId = budgetId;
    _nmItems    = [];

    await bgLoad();       // so the budget resolves to its share when it is shared (direct link)
    // Load the budget name for the breadcrumb
    var budgetDoc = await bgRef(budgetId).get();
    var budgetName = budgetDoc.exists ? (budgetDoc.data().name || 'Budget') : 'Budget';

    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#life">Life</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<a href="#investments">Financial</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<a href="#budget">Budgets</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<a href="#budget" onclick="void(0)">' + escapeHtml(budgetName) + '</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<span>Non-Monthly</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';

    var page = document.getElementById('page-budget-nonmonthly');
    if (!page) return;
    page.innerHTML = '<p class="muted-text" style="padding:16px">Loading…</p>';

    var snap = await bgRef(budgetId).collection('nonMonthlyItems')
        .orderBy('sortOrder').get();
    snap.forEach(function(doc) {
        _nmItems.push(Object.assign({ id: doc.id }, doc.data()));
    });

    _nmRender(page);
}

function _nmRender(page) {
    var reserve = _nmCalcReserve();
    var activeCount = _nmItems.filter(function(i) { return i.isActive !== false; }).length;
    var annualTotal = _nmItems
        .filter(function(i) { return i.isActive !== false; })
        .reduce(function(s, i) { return s + (parseFloat(i.amount) || 0); }, 0);

    var html = '<div class="page-header">' +
        '<h2>💼 Non-Monthly Expenses</h2>' +
        '<div class="page-header-actions">' +
            '<a class="btn btn-secondary btn-small" href="#budget">‹ Back to Budget</a>' +
        '</div>' +
    '</div>';

    // Reserve summary bar
    html += '<div class="nm-reserve-bar" id="nmReserveBar">' +
        '<div class="nm-reserve-main">' +
            '<span class="nm-reserve-label">Monthly Reserve</span>' +
            '<span class="nm-reserve-amount" id="nmReserveAmount">' + _budgetFmt(reserve) + '<span class="nm-reserve-per">/mo</span></span>' +
        '</div>' +
        '<div class="nm-reserve-detail" id="nmReserveDetail">' +
            (activeCount > 0
                ? _budgetFmt(annualTotal) + ' annual &divide; 12 &nbsp;&middot;&nbsp; ' + activeCount + ' active item' + (activeCount === 1 ? '' : 's')
                : 'No active items') +
        '</div>' +
    '</div>';

    // Column headers
    html += '<div class="nm-col-headers">' +
        '<span class="nm-col-active">Active</span>' +
        '<span class="nm-col-name">Name</span>' +
        '<span class="nm-col-amount">Annual $</span>' +
        '<span class="nm-col-notes">Notes</span>' +
        '<span class="nm-col-del"></span>' +
    '</div>';

    // Item list
    html += '<div class="nm-item-list" id="nmItemList">';
    _nmItems.forEach(function(item) {
        html += _nmItemRowHtml(item);
    });
    html += '</div>';

    // Add button
    html += '<div class="nm-add-wrap">' +
        '<button class="btn btn-secondary" onclick="_nmAddItem()">+ Add Item</button>' +
    '</div>';

    page.innerHTML = html;
    if (!bgCanEdit(_nmBudgetId)) bgApplyViewOnly(page, null);       // budget shared with me as View only
}

function _nmItemRowHtml(item) {
    var isActive = item.isActive !== false;
    return '<div class="nm-item-row' + (isActive ? '' : ' nm-item-inactive') + '" data-nm-id="' + item.id + '">' +
        '<span class="nm-col-active">' +
            '<input type="checkbox" class="nm-checkbox"' + (isActive ? ' checked' : '') +
                ' onchange="_nmToggleActive(\'' + item.id + '\', this.checked)">' +
        '</span>' +
        '<span class="nm-col-name">' +
            '<input type="text" class="nm-input-name" value="' + escapeHtml(item.name || '') + '" placeholder="Item name"' +
                ' onblur="_nmFieldChanged(\'' + item.id + '\', \'name\', this.value)">' +
        '</span>' +
        '<span class="nm-col-amount">' +
            '<input type="number" class="nm-input-amount" min="0" step="1" value="' + (item.amount || '') + '" placeholder="0"' +
                ' onblur="_nmFieldChanged(\'' + item.id + '\', \'amount\', this.value)">' +
        '</span>' +
        '<span class="nm-col-notes">' +
            '<input type="text" class="nm-input-notes" value="' + escapeHtml(item.notes || '') + '" placeholder="Optional notes"' +
                ' onblur="_nmFieldChanged(\'' + item.id + '\', \'notes\', this.value)">' +
        '</span>' +
        '<span class="nm-col-del">' +
            '<button class="btn-icon budget-item-delete" onclick="_nmDeleteItem(\'' + item.id + '\')" title="Delete">🗑</button>' +
        '</span>' +
    '</div>';
}

function _nmCalcReserve() {
    return Math.round(
        _nmItems
            .filter(function(i) { return i.isActive !== false; })
            .reduce(function(s, i) { return s + (parseFloat(i.amount) || 0); }, 0) / 12
    );
}

function _nmRefreshReserve() {
    var reserve     = _nmCalcReserve();
    var activeCount = _nmItems.filter(function(i) { return i.isActive !== false; }).length;
    var annualTotal = _nmItems
        .filter(function(i) { return i.isActive !== false; })
        .reduce(function(s, i) { return s + (parseFloat(i.amount) || 0); }, 0);

    var amountEl = document.getElementById('nmReserveAmount');
    if (amountEl) amountEl.innerHTML = _budgetFmt(reserve) + '<span class="nm-reserve-per">/mo</span>';

    var detailEl = document.getElementById('nmReserveDetail');
    if (detailEl) detailEl.innerHTML = activeCount > 0
        ? _budgetFmt(annualTotal) + ' annual &divide; 12 &nbsp;&middot;&nbsp; ' + activeCount + ' active item' + (activeCount === 1 ? '' : 's')
        : 'No active items';
}

async function _nmAddItem() {
    var sortOrder = _nmItems.length;
    var newDoc = await bgRef(_nmBudgetId).collection('nonMonthlyItems').add({
        name:      '',
        amount:    0,
        notes:     '',
        isActive:  true,
        sortOrder: sortOrder,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    var newItem = { id: newDoc.id, name: '', amount: 0, notes: '', isActive: true, sortOrder: sortOrder };
    _nmItems.push(newItem);

    var list = document.getElementById('nmItemList');
    if (list) {
        var div = document.createElement('div');
        div.innerHTML = _nmItemRowHtml(newItem);
        list.appendChild(div.firstChild);
        // Focus the name input of the new row
        var newRow = list.lastElementChild;
        var nameInput = newRow && newRow.querySelector('.nm-input-name');
        if (nameInput) nameInput.focus();
    }
}

async function _nmToggleActive(itemId, checked) {
    var item = _nmItems.find(function(i) { return i.id === itemId; });
    if (!item) return;
    item.isActive = checked;

    // Update row styling
    var row = document.querySelector('[data-nm-id="' + itemId + '"]');
    if (row) {
        row.classList.toggle('nm-item-inactive', !checked);
    }

    _nmRefreshReserve();

    await bgRef(_nmBudgetId).collection('nonMonthlyItems').doc(itemId).update({
        isActive: checked
    });
}

async function _nmFieldChanged(itemId, field, value) {
    var item = _nmItems.find(function(i) { return i.id === itemId; });
    if (!item) return;

    var parsed = field === 'amount' ? (parseInt(value, 10) || 0) : value;
    if (item[field] === parsed) return; // no change
    item[field] = parsed;

    if (field === 'amount') _nmRefreshReserve();

    var update = {};
    update[field] = parsed;
    await bgRef(_nmBudgetId).collection('nonMonthlyItems').doc(itemId).update(update);
}

async function _nmDeleteItem(itemId) {
    if (!confirm('Delete this item? This cannot be undone.')) return;

    _nmItems = _nmItems.filter(function(i) { return i.id !== itemId; });
    var row = document.querySelector('[data-nm-id="' + itemId + '"]');
    if (row) row.remove();
    _nmRefreshReserve();

    await bgRef(_nmBudgetId).collection('nonMonthlyItems').doc(itemId).delete();
}

// ---------------------------------------------------------------------------
// Sharing one budget (sharebudget.js)
// ---------------------------------------------------------------------------

async function _budgetOpenShare() {
    if (!_budgetDraft || !bgIsOwner(_budgetDraft.id)) return;
    if (_budgetDirty && !confirm('You have unsaved changes. Sharing moves the saved budget. Continue without saving them?')) return;
    await shOpenBudgetShareDialog(_budgetDraft.id, _budgetDraft.name);
}

// After sharing / stopping / changing who: reload the list and show the same budget again
async function _budgetAfterShareChange(budgetId) {
    await _budgetLoadMeta();
    var page = document.getElementById('page-budget');
    if (!page) return;
    await _budgetLoadData(budgetId || (_budgetDraft && _budgetDraft.id) || _budgetDefaultId || (_budgetList[0] && _budgetList[0].id));
    _budgetRender(page);
}
