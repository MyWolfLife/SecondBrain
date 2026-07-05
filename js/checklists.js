// ============================================================
// Checklists.js — Context-Aware Seasonal Care Checklists
// Lets the user define reusable checklist templates (e.g.
// "Spring Startup") and run them as interactive to-do lists.
//
// Templates and runs are scoped to a target (yard, zone, house,
// floor, room, or vehicle).  When the Checklists page loads, it
// reads window.checklistsContext (set by the router in app.js)
// and shows only templates / runs that belong to the current
// location or any of its descendants (roll-up).
//
// Firestore collections:
//   checklistTemplates  — { name, targetType, targetId, targetName,
//                           items:[{label}], createdAt }
//   checklistRuns       — { templateId, templateName,
//                           targetType, targetId, targetName,
//                           startedAt, completedAt,
//                           items:[{label, done}] }
// ============================================================

// ---- Module-level context (resolved once per page load) ----
/** Resolved context for the current checklists page view.
 *  Set by loadChecklistsPage(); used by all sub-loaders.
 *  Shape: { type, id?, name?, filterIds? }
 */
var clCurrentContext = null;

/** Run ID set by the search navigator (#checklist-focus/…) so loadChecklistsPage
 *  can auto-expand that specific run card after rendering.
 *  Cleared immediately after use to avoid stale expansion on the next page load. */
var _clFocusRunId = null;

// ---------- Page Entry Point ----------

/**
 * Called by the router when navigating to #checklists.
 * Resolves the current context (yard / zone / house / floor / room /
 * vehicle / life), then loads active runs and templates in parallel.
 */
async function loadChecklistsPage() {
    // Resolve context from the global set by app.js router
    clCurrentContext = await clResolveContextFilter(
        window.checklistsContext || { type: 'yard' }
    );

    // Show context subtitle so the user knows what they're looking at
    var subtitle = document.getElementById('clContextSubtitle');
    if (subtitle) {
        subtitle.textContent = 'Showing: ' + clContextLabel(clCurrentContext);
    }

    // Set breadcrumb bar based on context (yard → #zones, house → #house, others → nothing)
    var bar = document.getElementById('breadcrumbBar');
    if (bar) {
        var ctx = clCurrentContext;
        if (ctx.type === 'yard' || ctx.type === 'zone') {
            bar.innerHTML = '<a href="#zones">Yard</a><span class="separator">&rsaquo;</span><span>Checklists</span>';
        } else if (ctx.type === 'house' || ctx.type === 'floor' || ctx.type === 'room') {
            bar.innerHTML = '<a href="#house">House</a><span class="separator">&rsaquo;</span><span>Checklists</span>';
        } else if (ctx.type === 'life') {
            bar.innerHTML = '<a href="#life">Life</a><span class="separator">&rsaquo;</span><span>Checklists</span>';
        } else {
            bar.innerHTML = '';
        }
    }

    // Wire buttons exactly once (guards against re-entry on repeated page loads)
    var addBtn        = document.getElementById('addChecklistTemplateBtn');
    var blankBtn      = document.getElementById('addBlankChecklistBtn');
    var toggle        = document.getElementById('clShowCompletedToggle');
    var archiveToggle = document.getElementById('clShowArchivedToggle');
    var filterInput   = document.getElementById('clFilterInput');

    if (!addBtn.dataset.wired) {
        addBtn.dataset.wired = 'true';

        addBtn.addEventListener('click', clOpenAddTemplateModal);
        blankBtn.addEventListener('click', clNewBlankList);

        toggle.addEventListener('change', function() {
            var completedDiv   = document.getElementById('clCompletedContainer');
            var completedEmpty = document.getElementById('clCompletedEmptyState');
            if (toggle.checked) {
                completedDiv.classList.remove('hidden');
                clLoadCompletedRuns();
            } else {
                completedDiv.classList.add('hidden');
                completedEmpty.classList.add('hidden');
            }
        });

        archiveToggle.addEventListener('change', function() {
            var archivedDiv   = document.getElementById('clArchivedContainer');
            var archivedEmpty = document.getElementById('clArchivedEmptyState');
            if (archiveToggle.checked) {
                archivedDiv.classList.remove('hidden');
                clLoadArchivedRuns();
            } else {
                archivedDiv.classList.add('hidden');
                archivedEmpty.classList.add('hidden');
            }
        });

        // Filter input: debounce and re-render active (+ completed if open)
        var _clFilterTimer = null;
        filterInput.addEventListener('input', function() {
            clearTimeout(_clFilterTimer);
            _clFilterTimer = setTimeout(function() {
                clLoadActiveRuns();
                if (toggle.checked) clLoadCompletedRuns();
                if (archiveToggle.checked) clLoadArchivedRuns();
            }, 250);
        });

        // Phone column toggle: switches #clActiveRunsContainer between 1- and 2-column layout
        var colToggleBtn = document.getElementById('clColumnToggleBtn');
        if (colToggleBtn) {
            colToggleBtn.addEventListener('click', function() {
                var current = localStorage.getItem('clColumnLayout') || '1';
                var next = current === '2' ? '1' : '2';
                localStorage.setItem('clColumnLayout', next);
                clApplyColumnLayout();
            });
        }
    }

    // Apply saved column layout preference on every page load
    clApplyColumnLayout();

    // Reset sections when page is re-entered
    toggle.checked = false;
    archiveToggle.checked = false;
    filterInput.value = '';
    document.getElementById('clCompletedContainer').classList.add('hidden');
    document.getElementById('clCompletedEmptyState').classList.add('hidden');
    document.getElementById('clArchivedContainer').classList.add('hidden');
    document.getElementById('clArchivedEmptyState').classList.add('hidden');

    // Load both sections simultaneously
    await Promise.all([
        clLoadActiveRuns(),
        clLoadTemplates(),
    ]);
}

/**
 * Reads the stored column layout preference (1 or 2) and applies
 * the appropriate CSS class to #clActiveRunsContainer.
 * The toggle button icon also updates to match.
 */
function clApplyColumnLayout() {
    var layout = localStorage.getItem('clColumnLayout') || '1';
    var container = document.getElementById('clActiveRunsContainer');
    var btn = document.getElementById('clColumnToggleBtn');
    if (container) {
        container.classList.toggle('cl-cols-2', layout === '2');
    }
    if (btn) {
        btn.title = layout === '2' ? 'Switch to 1-column view' : 'Switch to 2-column view';
        btn.textContent = layout === '2' ? '⊟' : '⊞';
    }
}

// ============================================================
// CONTEXT RESOLUTION
// ============================================================

/**
 * Returns a human-readable label for the current context.
 * Shown as a subtitle on the Checklists page.
 * @param {Object} ctx
 * @returns {string}
 */
function clContextLabel(ctx) {
    if (!ctx) return 'Yard';
    switch (ctx.type) {
        case 'life':    return 'Life';
        case 'yard':    return 'Yard';
        case 'zone':    return (ctx.name || 'Zone') + ' (Zone)';
        case 'house':   return 'House';
        case 'floor':   return (ctx.name || 'Floor') + ' (Floor)';
        case 'room':    return (ctx.name || 'Room') + ' (Room)';
        case 'vehicle': return ctx.name || 'Vehicle';
        default:        return 'Yard';
    }
}

/**
 * Augments a raw context object with filterIds[] for rollup queries.
 *
 * - zone context: fetches all zones; computes descendant IDs so that
 *   a zone page shows templates/runs for that zone AND its children.
 * - floor context: fetches rooms on this floor for rollup.
 * - All other contexts need no extra data.
 *
 * @param {Object} ctx  — Raw context from window.checklistsContext.
 * @returns {Object}    — Context with filterIds[] added when applicable.
 */
async function clResolveContextFilter(ctx) {
    if (!ctx) return { type: 'yard' };
    var result = Object.assign({}, ctx);

    if (ctx.type === 'zone') {
        // Fetch all zones in one query — used for both the name lookup and descendant BFS
        var snap = await userCol('zones').get();
        var allZones = {};
        snap.forEach(function(doc) { allZones[doc.id] = doc.data(); });

        // If name is missing (e.g. after browser refresh), pull it from the fetched data
        if (!result.name && ctx.id && allZones[ctx.id]) {
            result.name = allZones[ctx.id].name;
        }

        // BFS: collect all descendant zone IDs
        var desc  = [];
        var queue = [ctx.id];
        while (queue.length) {
            var cur = queue.shift();
            Object.keys(allZones).forEach(function(zid) {
                if (allZones[zid].parentId === cur) {
                    desc.push(zid);
                    queue.push(zid);
                }
            });
        }
        result.filterIds = [ctx.id].concat(desc);

    } else if (ctx.type === 'floor') {
        // Fetch floor name if missing (refresh case)
        if (!result.name && ctx.id) {
            var floorDoc = await userCol('floors').doc(ctx.id).get();
            if (floorDoc.exists) result.name = floorDoc.data().name;
        }
        // Floor shows itself + all rooms on that floor
        var rSnap = await userCol('rooms').where('floorId', '==', ctx.id).get();
        result.filterIds = rSnap.docs.map(function(d) { return d.id; });

    } else if (ctx.type === 'room' && !result.name && ctx.id) {
        var roomDoc = await userCol('rooms').doc(ctx.id).get();
        if (roomDoc.exists) result.name = roomDoc.data().name;

    } else if (ctx.type === 'vehicle' && !result.name && ctx.id) {
        var vDoc = await userCol('vehicles').doc(ctx.id).get();
        if (vDoc.exists) {
            var vd = vDoc.data();
            result.name = [vd.year, vd.make, vd.model].filter(Boolean).join(' ') || 'Vehicle';
        }
    }

    return result;
}

/**
 * Returns true if a template or run doc belongs to the current context.
 * Implements the "roll-up" rule: a child entity's items appear on the
 * parent page, but a parent's items do NOT appear on a child page.
 *
 * @param {Object} item — Template or run document data.
 * @param {Object} ctx  — Resolved context with filterIds if applicable.
 * @returns {boolean}
 */
function clMatchesContext(item, ctx) {
    var t  = item.targetType || null;
    var id = item.targetId   || null;

    switch (ctx.type) {
        case 'life':
            // Life shows templates explicitly tagged 'life' (or untagged legacy)
            return !t || t === 'life';

        case 'yard':
            // Yard top-level rolls up everything: yard-general and all zones
            return t === 'yard' || t === 'zone';

        case 'zone':
            // Zone page shows that zone + its children (filterIds pre-computed)
            return t === 'zone' && (ctx.filterIds || []).indexOf(id) !== -1;

        case 'house':
            // House top-level rolls up: house-general, floors, and rooms
            return t === 'house' || t === 'floor' || t === 'room';

        case 'floor':
            // Floor page shows floor templates + rooms on that floor
            if (t === 'floor' && id === ctx.id) return true;
            if (t === 'room'  && (ctx.filterIds || []).indexOf(id) !== -1) return true;
            return false;

        case 'room':
            // Room page shows only that room's templates
            return t === 'room' && id === ctx.id;

        case 'vehicle':
            // Vehicle page shows only that vehicle's templates
            return t === 'vehicle' && id === ctx.id;

        default:
            return false;
    }
}

// ============================================================
// ACTIVE RUNS
// ============================================================

/**
 * Loads all non-completed, non-archived runs filtered to the current context.
 * Also applies the text filter from #clFilterInput.
 */
async function clLoadActiveRuns() {
    var container = document.getElementById('clActiveRunsContainer');
    var emptyEl   = document.getElementById('clActiveRunsEmptyState');

    container.innerHTML = '<p class="ar-summary">Loading…</p>';
    emptyEl.classList.add('hidden');

    try {
        var snap = await userCol('checklistRuns')
            .where('completedAt', '==', null)
            .get();

        var ctx = clCurrentContext || { type: 'yard' };

        var runs = snap.docs
            .map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); })
            .filter(function(run) { return clMatchesContext(run, ctx); })
            .filter(function(run) { return !run.archived; })
            .filter(clMatchesFilter)
            .sort(function(a, b) {
                return (b.startedAt || '').localeCompare(a.startedAt || '');
            });

        container.innerHTML = '';

        if (runs.length === 0) {
            emptyEl.classList.remove('hidden');
            return;
        }

        runs.forEach(function(run) {
            container.appendChild(clBuildRunCard(run));
        });

        // Scroll to and highlight the run from search (set by #checklist-focus route)
        if (_clFocusRunId) {
            var focusCard = container.querySelector('[data-id="' + _clFocusRunId + '"]');
            _clFocusRunId = null;
            if (focusCard) {
                focusCard.classList.add('cl-run-card--focused');
                setTimeout(function() {
                    focusCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 150);
                setTimeout(function() {
                    focusCard.classList.remove('cl-run-card--focused');
                }, 2500);
            }
        }

    } catch (err) {
        console.error('Error loading active runs:', err);
        container.innerHTML = '<p class="ar-summary" style="color:#c62828;">Error loading active checklists.</p>';
    }
}

/**
 * Builds a Google Keep-style inline card for one active run.
 * Items are shown directly on the card — no accordion.
 * Completed items collapse into a "▶ X completed" toggle row.
 * Footer: tags on left, hover-reveal icon action buttons on right.
 * @param {Object} run — Run document data including id.
 * @returns {HTMLElement}
 */
function clBuildRunCard(run) {
    var card = document.createElement('div');
    card.className  = 'cl-run-card';
    card.dataset.id = run.id;

    var items = run.items || [];

    // ── Title ──────────────────────────────────────────────────
    var title = document.createElement('div');
    title.className   = 'cl-run-title';
    title.textContent = run.templateName || 'Checklist';
    card.appendChild(title);

    // ── Location badge (optional) ──────────────────────────────
    if (run.targetName) {
        var badge = document.createElement('div');
        badge.className   = 'cl-target-badge';
        badge.textContent = '📍 ' + run.targetName;
        card.appendChild(badge);
    }

    // ── Started date ───────────────────────────────────────────
    var dateEl = document.createElement('div');
    dateEl.className   = 'cl-run-date';
    dateEl.textContent = 'Started ' + clFormatDate(run.startedAt);
    card.appendChild(dateEl);

    // ── Items wrapper (undone + done toggle) ───────────────────
    card.appendChild(clBuildItemsWrapper(run.id, items, card));

    // ── Add-item row (CSS-hidden; revealed in edit mode) ───────
    card.appendChild(clBuildAddItemRow(run.id, run.templateId || null, card));

    // ── Footer: tags (left) + icon actions (right) ─────────────
    var footer = document.createElement('div');
    footer.className = 'cl-run-footer';

    var tagsDiv = document.createElement('div');
    tagsDiv.className = 'cl-run-footer-tags';
    if (run.tags && run.tags.length) {
        tagsDiv.appendChild(clBuildTagChips(run.tags));
    }
    footer.appendChild(tagsDiv);

    var actions = document.createElement('div');
    actions.className = 'cl-run-actions';

    var completeBtn = document.createElement('button');
    completeBtn.type      = 'button';
    completeBtn.className = 'cl-run-action-btn';
    completeBtn.title     = 'Mark Complete';
    completeBtn.innerHTML = '&#10003;';
    completeBtn.addEventListener('click', function() { clMarkRunComplete(run.id); });

    var editBtn = document.createElement('button');
    editBtn.type      = 'button';
    editBtn.className = 'cl-run-action-btn';
    editBtn.title     = 'Edit';
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', function() {
        var editing = card.classList.toggle('cl-run-card--editing');
        editBtn.title = editing ? 'Done Editing' : 'Edit';
        editBtn.textContent = editing ? '✔️' : '✏️';
    });

    var archiveBtn = document.createElement('button');
    archiveBtn.type      = 'button';
    archiveBtn.className = 'cl-run-action-btn';
    archiveBtn.title     = 'Archive';
    archiveBtn.textContent = '📦';
    archiveBtn.addEventListener('click', function() { clArchiveRun(run.id, true); });

    var deleteBtn = document.createElement('button');
    deleteBtn.type      = 'button';
    deleteBtn.className = 'cl-run-action-btn cl-run-action-btn--danger';
    deleteBtn.title     = 'Abandon';
    deleteBtn.textContent = '🗑️';
    deleteBtn.addEventListener('click', function() { clDeleteRun(run.id, 'active'); });

    actions.appendChild(completeBtn);
    actions.appendChild(editBtn);
    actions.appendChild(archiveBtn);
    actions.appendChild(deleteBtn);
    footer.appendChild(actions);

    card.appendChild(footer);

    return card;
}

/**
 * Builds the items wrapper for a run card.
 * Contains: undone <ul>, a collapsible "▶ X completed" toggle, and done <ul>.
 * SortableJS is applied to the undone list only.
 * @param {string}      runId
 * @param {Array}       items
 * @param {HTMLElement} card  — Parent card (used by item event handlers).
 * @returns {HTMLElement}
 */
function clBuildItemsWrapper(runId, items, card) {
    var wrapper = document.createElement('div');
    wrapper.className = 'cl-items-wrapper';

    var indexed = items.map(function(item, i) { return { item: item, idx: i }; });
    var undone  = indexed.filter(function(x) { return !x.item.done; });
    var done    = indexed.filter(function(x) { return  x.item.done; })
                         .sort(function(a, b) {
                             return (a.item.doneAt || '').localeCompare(b.item.doneAt || '');
                         });

    // Undone items list
    var undoneList = document.createElement('ul');
    undoneList.className = 'cl-undone-list';
    undone.forEach(function(x) {
        undoneList.appendChild(clBuildItemEl(runId, x.item, x.idx, card));
    });
    wrapper.appendChild(undoneList);

    // Done section: toggle row + hidden list
    if (done.length > 0) {
        var doneToggle = document.createElement('div');
        doneToggle.className   = 'cl-done-toggle';
        doneToggle.textContent = '▶ ' + done.length + ' completed';

        var doneList = document.createElement('ul');
        doneList.className = 'cl-done-list hidden';
        done.forEach(function(x) {
            doneList.appendChild(clBuildItemEl(runId, x.item, x.idx, card));
        });

        doneToggle.addEventListener('click', function() {
            var isOpen = !doneList.classList.contains('hidden');
            doneList.classList.toggle('hidden', isOpen);
            doneToggle.textContent = (isOpen ? '▶ ' : '▼ ') + done.length + ' completed';
        });

        wrapper.appendChild(doneToggle);
        wrapper.appendChild(doneList);
    }

    // SortableJS on undone list only (done items are not reorderable)
    if (typeof Sortable !== 'undefined') {
        Sortable.create(undoneList, {
            handle: '.run-drag-handle',
            animation: 150,
            onEnd: function() {
                clSaveRunItemOrder(runId, wrapper, items, card);
            }
        });
    }

    return wrapper;
}

/**
 * Reads the current DOM order of undone + done items and saves the reordered
 * array to Firestore, then re-renders the card's item list.
 * @param {string}      runId
 * @param {HTMLElement} wrapper        — The .cl-items-wrapper after a drag-end event.
 * @param {Array}       originalItems  — Items array from the last render (used as source of truth).
 * @param {HTMLElement} card
 */
async function clSaveRunItemOrder(runId, wrapper, originalItems, card) {
    // Build a lookup from storage index → item object
    var itemsByIdx = {};
    originalItems.forEach(function(item, i) { itemsByIdx[i] = item; });

    var newItems = [];
    // Undone first in their new drag order
    Array.from(wrapper.querySelectorAll('.cl-undone-list .cl-item')).forEach(function(li) {
        var idx = parseInt(li.dataset.storageIdx);
        if (itemsByIdx[idx] !== undefined) newItems.push(itemsByIdx[idx]);
    });
    // Done items follow in their existing completion-time order
    Array.from(wrapper.querySelectorAll('.cl-done-list .cl-item')).forEach(function(li) {
        var idx = parseInt(li.dataset.storageIdx);
        if (itemsByIdx[idx] !== undefined) newItems.push(itemsByIdx[idx]);
    });

    try {
        var doc = await userCol('checklistRuns').doc(runId).get();
        if (!doc.exists) return;
        var runData = doc.data();
        await userCol('checklistRuns').doc(runId).update({ items: newItems });
        clRerenderRunItems(runId, newItems, runData.templateId || null, card);
    } catch (err) {
        console.error('Error saving run item order:', err);
    }
}

/**
 * Builds one <li> for an active run item.
 * Contains: checkbox, label, 📝 note button, ✕ remove button (edit-mode only),
 * an inline note textarea (toggled by 📝), and a read-only note display.
 */
function clBuildItemEl(runId, item, idx, card) {
    var li = document.createElement('li');
    li.className = 'cl-item' +
        (item.indent === 1 ? ' cl-item--indent-1' : item.indent === 2 ? ' cl-item--indent-2' : '') +
        (item.done   ? ' cl-item--done'     : '');
    li.dataset.storageIdx = String(idx);
    li.dataset.indent     = String(item.indent || 0);

    // ── Main row: drag handle + indent button + checkbox + label + buttons ─────
    var row = document.createElement('div');
    row.className = 'cl-item-row';

    // Drag handle — visible only when card is in edit mode (CSS-toggled)
    var dragHandle = document.createElement('span');
    dragHandle.className   = 'drag-handle run-drag-handle';
    dragHandle.textContent = '⠿';
    dragHandle.title       = 'Drag to reorder';

    // Indent button — visible only in edit mode, cycles 0→1→2→0
    var runIndentBtn = document.createElement('button');
    runIndentBtn.type      = 'button';
    runIndentBtn.className = 'cl-run-indent-btn';
    var _curInd = item.indent || 0;
    runIndentBtn.textContent = _curInd === 2 ? '←' : '→';
    runIndentBtn.title       = _curInd === 0 ? 'Indent' : _curInd === 1 ? 'Indent more' : 'Remove indent';
    runIndentBtn.addEventListener('click', function() {
        var cur  = parseInt(li.dataset.indent || '0');
        var next = cur >= 2 ? 0 : cur + 1;
        li.dataset.indent = String(next);
        li.classList.remove('cl-item--indent-1', 'cl-item--indent-2');
        if (next > 0) li.classList.add('cl-item--indent-' + next);
        runIndentBtn.textContent = next === 2 ? '←' : '→';
        runIndentBtn.title       = next === 0 ? 'Indent' : next === 1 ? 'Indent more' : 'Remove indent';
        clSaveItemIndent(runId, idx, next);
    });

    var cb = document.createElement('input');
    cb.type    = 'checkbox';
    cb.checked = !!item.done;
    cb.addEventListener('change', function() {
        clToggleItem(runId, cb.checked, idx, card);
    });

    // Render URLs as clickable links; plain text as spans
    var isUrl = /^https?:\/\//i.test(item.label);
    var label = document.createElement(isUrl ? 'a' : 'span');
    label.className = 'cl-item-label' + (isUrl ? ' cl-item-label--url' : '') + (item.done ? ' cl-item-label--done' : '');
    if (isUrl) {
        label.href   = item.label;
        label.target = '_blank';
        label.rel    = 'noopener noreferrer';
        var display  = item.label.length > 60 ? item.label.substring(0, 60) + '…' : item.label;
        label.textContent = display;
    } else {
        label.textContent = item.label;
    }

    // Show completion date inline when the item is done
    if (item.done && item.doneAt) {
        var dateSpan = document.createElement('span');
        dateSpan.className   = 'cl-item-done-date';
        dateSpan.textContent = ' (' + clFormatShortDate(item.doneAt) + ')';
        label.appendChild(dateSpan);
    }

    // 📝 note button — toggles inline note editor
    var noteBtn = document.createElement('button');
    noteBtn.type      = 'button';
    noteBtn.className = 'cl-item-note-btn';
    noteBtn.title     = item.note ? 'Edit note' : 'Add note';
    noteBtn.textContent = '📝';

    // ✕ remove button — only visible when card has cl-run-card--editing class
    var removeBtn = document.createElement('button');
    removeBtn.type        = 'button';
    removeBtn.className   = 'cl-item-remove-btn-run';
    removeBtn.title       = 'Remove item';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', function() {
        clRemoveItemFromRun(runId, idx, card);
    });

    row.appendChild(dragHandle);
    row.appendChild(runIndentBtn);
    row.appendChild(cb);
    row.appendChild(label);
    row.appendChild(noteBtn);
    row.appendChild(removeBtn);
    li.appendChild(row);

    // ── Note display (shown read-only when a note exists) ──────
    var noteDisplay = document.createElement('div');
    noteDisplay.className = 'cl-item-note-text' + (item.note ? '' : ' hidden');
    noteDisplay.textContent = item.note || '';
    li.appendChild(noteDisplay);

    // ── Note editor (hidden; toggled by 📝 button) ─────────────
    var noteWrap = document.createElement('div');
    noteWrap.className = 'cl-item-note-wrap hidden';
    var noteInput = document.createElement('textarea');
    noteInput.className   = 'cl-item-note-input';
    noteInput.placeholder = 'Add a note…';
    noteInput.value       = item.note || '';
    noteInput.rows        = 2;
    noteWrap.appendChild(noteInput);
    li.appendChild(noteWrap);

    // Helper: saves note value and collapses the editor
    function collapseNoteEditor() {
        var text = noteInput.value.trim();
        noteWrap.classList.add('hidden');
        noteDisplay.textContent = text;
        noteDisplay.classList.toggle('hidden', !text);
        noteBtn.title = text ? 'Edit note' : 'Add note';
        clSaveItemNote(runId, idx, text);
    }

    // Prevent the blur/click race: without this, clicking the 📝 button when the editor is open
    // fires blur first (hiding the editor), then click sees it hidden and re-opens it.
    noteBtn.addEventListener('mousedown', function(e) { e.preventDefault(); });

    // 📝 button: open if closed, save+close if open
    noteBtn.addEventListener('click', function() {
        if (!noteWrap.classList.contains('hidden')) {
            collapseNoteEditor();
        } else {
            noteWrap.classList.remove('hidden');
            noteInput.focus();
            noteInput.select();
        }
    });

    // Clicking the note text itself also opens the editor for re-editing
    noteDisplay.style.cursor = 'text';
    noteDisplay.addEventListener('click', function() {
        noteWrap.classList.remove('hidden');
        noteInput.focus();
        var len = noteInput.value.length;
        noteInput.setSelectionRange(len, len);
    });

    // Save on blur (user clicks away) and on Enter
    noteInput.addEventListener('blur', collapseNoteEditor);
    noteInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            collapseNoteEditor();
        }
        if (e.key === 'Escape') {
            noteInput.value = item.note || '';  // discard changes
            noteWrap.classList.add('hidden');
        }
    });

    // In edit mode, clicking the item label makes it editable inline
    if (!isUrl) {
        label.addEventListener('click', function() {
            if (!card.classList.contains('cl-run-card--editing')) return;
            var inp = document.createElement('input');
            inp.type      = 'text';
            inp.value     = item.label;
            inp.className = 'cl-item-label-edit';
            row.replaceChild(inp, label);
            inp.focus();
            inp.select();

            function saveLabel() {
                var newLabel = inp.value.trim();
                row.replaceChild(label, inp);
                if (newLabel && newLabel !== item.label) {
                    label.textContent = newLabel;
                    item.label = newLabel;
                    clSaveItemLabel(runId, idx, newLabel);
                }
            }
            inp.addEventListener('blur', saveLabel);
            inp.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); saveLabel(); }
                if (e.key === 'Escape') { row.replaceChild(label, inp); }
            });
        });
    }

    return li;
}

/**
 * Builds the add-item row shown at the bottom of the item list in edit mode.
 * CSS hides it until the card has the cl-run-card--editing class.
 * @param {string}      runId
 * @param {string|null} templateId  — If set, prompts to add the item to the template too.
 * @param {HTMLElement} card
 * @returns {HTMLElement}
 */
function clBuildAddItemRow(runId, templateId, card) {
    var row = document.createElement('div');
    row.className = 'cl-add-item-row';

    var input = document.createElement('input');
    input.type        = 'text';
    input.className   = 'cl-add-item-input';
    input.placeholder = 'New item…';

    var addBtn = document.createElement('button');
    addBtn.type      = 'button';
    addBtn.className = 'btn btn-secondary btn-small';
    addBtn.textContent = '+ Add';

    function doAdd() {
        clAddItemToRun(runId, templateId, input.value, card, input);
    }
    addBtn.addEventListener('click', doAdd);
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); doAdd(); }
    });

    row.appendChild(input);
    row.appendChild(addBtn);
    return row;
}

/**
 * Re-renders just the items wrapper within a card after an add, remove, or toggle.
 * Preserves edit mode (card class is unchanged).
 */
function clRerenderRunItems(runId, items, templateId, card) {
    var oldWrapper = card.querySelector('.cl-items-wrapper');
    var newWrapper = clBuildItemsWrapper(runId, items, card);
    if (oldWrapper) card.replaceChild(newWrapper, oldWrapper);

    // Rebuild the add-item row with the correct templateId in scope
    var oldAddRow = card.querySelector('.cl-add-item-row');
    var newAddRow = clBuildAddItemRow(runId, templateId, card);
    if (oldAddRow) card.replaceChild(newAddRow, oldAddRow);
}

/**
 * Adds a new item to an active run.
 * If the run is derived from a template, offers to add the item there too.
 * @param {string}           runId
 * @param {string|null}      templateId
 * @param {string}           label
 * @param {HTMLElement}      card
 * @param {HTMLInputElement} inputEl  — Cleared and re-focused after add.
 */
async function clAddItemToRun(runId, templateId, label, card, inputEl) {
    label = (label || '').trim();
    if (!label) return;

    try {
        var doc = await userCol('checklistRuns').doc(runId).get();
        if (!doc.exists) return;

        var items = (doc.data().items || []).concat([{ label: label, done: false, note: null }]);
        await userCol('checklistRuns').doc(runId).update({ items: items });

        // Offer to add to the template as well (template-derived runs only)
        if (templateId) {
            if (confirm('Add "' + label + '" to the template too?')) {
                var tmplDoc = await userCol('checklistTemplates').doc(templateId).get();
                if (tmplDoc.exists) {
                    var tmplItems = (tmplDoc.data().items || []).concat([{ label: label }]);
                    await userCol('checklistTemplates').doc(templateId).update({ items: tmplItems });
                }
                // Refresh the templates section so the item count and the
                // template's own edit modal reflect the new item immediately.
                clLoadTemplates();
            }
        }

        clRerenderRunItems(runId, items, templateId, card);

        // clRerenderRunItems rebuilt the add-item row, so the old inputEl is now detached.
        // Find the new input and focus it so the user can keep typing items without re-clicking.
        var newInput = card.querySelector('.cl-add-item-input');
        if (newInput) newInput.focus();

    } catch (err) {
        console.error('Error adding item to run:', err);
        alert('Error adding item. Please try again.');
    }
}

/**
 * Removes an item from a run by index.
 * No template prompt — removals never propagate to the template.
 * @param {string}      runId
 * @param {number}      idx
 * @param {HTMLElement} card
 */
async function clRemoveItemFromRun(runId, idx, card) {
    try {
        var doc = await userCol('checklistRuns').doc(runId).get();
        if (!doc.exists) return;

        var runData  = doc.data();
        var items    = runData.items.filter(function(_, i) { return i !== idx; });
        await userCol('checklistRuns').doc(runId).update({ items: items });

        clRerenderRunItems(runId, items, runData.templateId || null, card);

    } catch (err) {
        console.error('Error removing item from run:', err);
    }
}

/**
 * Saves or clears the note for one item in a run.
 * @param {string} runId
 * @param {number} idx
 * @param {string} noteText  — Empty string clears the note.
 */
async function clSaveItemNote(runId, idx, noteText) {
    try {
        var doc = await userCol('checklistRuns').doc(runId).get();
        if (!doc.exists) return;

        var items = doc.data().items;
        items[idx] = Object.assign({}, items[idx], { note: noteText || null });
        await userCol('checklistRuns').doc(runId).update({ items: items });

    } catch (err) {
        console.error('Error saving item note:', err);
    }
}

/**
 * Updates the indent level of one item in a run (0, 1, or 2).
 */
async function clSaveItemIndent(runId, idx, newIndent) {
    try {
        var doc = await userCol('checklistRuns').doc(runId).get();
        if (!doc.exists) return;
        var items = doc.data().items;
        items[idx] = Object.assign({}, items[idx], { indent: newIndent });
        await userCol('checklistRuns').doc(runId).update({ items: items });
    } catch (err) {
        console.error('Error saving item indent:', err);
    }
}

/**
 * Updates the label text of one item in a run.
 * @param {string} runId
 * @param {number} idx
 * @param {string} newLabel
 */
async function clSaveItemLabel(runId, idx, newLabel) {
    try {
        var doc = await userCol('checklistRuns').doc(runId).get();
        if (!doc.exists) return;
        var items = doc.data().items;
        items[idx] = Object.assign({}, items[idx], { label: newLabel });
        await userCol('checklistRuns').doc(runId).update({ items: items });
    } catch (err) {
        console.error('Error saving item label:', err);
    }
}

/**
 * Creates a brand-new blank run with no template and no items.
 * Prompts for a name; inherits target from the current checklist context.
 */
async function clNewBlankList() {
    var name = prompt('Name for this list:');
    if (!name || !name.trim()) return;

    var ctx = clCurrentContext || { type: 'yard' };

    try {
        await userCol('checklistRuns').add({
            templateId:   null,
            templateName: name.trim(),
            targetType:   ctx.type || 'yard',
            targetId:     ctx.id   || null,
            targetName:   ctx.name || clContextLabel(ctx),
            startedAt:    new Date().toISOString(),
            completedAt:  null,
            items:        [],
            createdAt:    firebase.firestore.FieldValue.serverTimestamp()
        });

        clLoadActiveRuns();
        window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
        console.error('Error creating blank list:', err);
        alert('Error creating list. Please try again.');
    }
}

/**
 * Toggles one item's done state and updates the card in-place.
 * @param {string}  runId
 * @param {boolean} checked
 * @param {number}  idx
 * @param {HTMLElement} card
 */
async function clToggleItem(runId, checked, idx, card) {
    try {
        var doc = await userCol('checklistRuns').doc(runId).get();
        if (!doc.exists) return;

        var runData = doc.data();
        var items   = runData.items;

        // Record or clear the completion timestamp alongside the done flag
        items[idx] = Object.assign({}, items[idx], {
            done:   checked,
            doneAt: checked ? new Date().toISOString() : null
        });

        await userCol('checklistRuns').doc(runId).update({ items: items });

        // Full re-render so the item moves to the bottom (done) or back up (undone)
        // and the completion date appears/disappears next to the label.
        clRerenderRunItems(runId, items, runData.templateId || null, card);

    } catch (err) {
        console.error('Error toggling checklist item:', err);
    }
}

/**
 * Unchecks every item in a run without confirmation.
 * Updates Firestore and resets the card's checkboxes, labels, and progress bar in-place.
 * @param {string}      runId
 * @param {HTMLElement} card
 */
async function clClearAllItems(runId, card) {
    try {
        var doc = await userCol('checklistRuns').doc(runId).get();
        if (!doc.exists) return;

        var runData = doc.data();
        var items = runData.items.map(function(item) {
            return Object.assign({}, item, { done: false, doneAt: null });
        });

        await userCol('checklistRuns').doc(runId).update({ items: items });

        // Full re-render: removes all completion dates and strikethroughs
        clRerenderRunItems(runId, items, runData.templateId || null, card);

    } catch (err) {
        console.error('Error clearing checklist items:', err);
    }
}

/**
 * Stamps completedAt on a run (moves it to the Completed section).
 * @param {string} runId
 */
async function clMarkRunComplete(runId) {
    if (!confirm('Mark this checklist as complete? It will move to the Completed section.')) return;
    try {
        await userCol('checklistRuns').doc(runId).update({
            completedAt: new Date().toISOString()
        });
        clLoadActiveRuns();
    } catch (err) {
        console.error('Error completing run:', err);
    }
}

/**
 * Deletes a run after confirmation.
 * @param {string} runId
 * @param {string} section — 'active' or 'completed'
 */
async function clDeleteRun(runId, section) {
    var msg = section === 'active'
        ? 'Abandon this checklist? All progress will be lost.'
        : section === 'archived'
        ? 'Permanently delete this archived checklist?'
        : 'Delete this completed checklist record?';
    if (!confirm(msg)) return;
    try {
        await userCol('checklistRuns').doc(runId).delete();
        if (section === 'active') {
            clLoadActiveRuns();
        } else if (section === 'archived') {
            clLoadArchivedRuns();
        } else {
            clLoadCompletedRuns();
        }
    } catch (err) {
        console.error('Error deleting run:', err);
    }
}

// ============================================================
// TEMPLATES
// ============================================================

/**
 * Loads all checklist templates, filters to the current context, and renders them.
 */
async function clLoadTemplates() {
    var container = document.getElementById('clTemplatesContainer');
    var emptyEl   = document.getElementById('clTemplatesEmptyState');

    container.innerHTML = '';
    emptyEl.classList.add('hidden');

    try {
        var snap = await userCol('checklistTemplates')
            .orderBy('name')
            .get();

        var ctx = clCurrentContext || { type: 'yard' };

        var templates = snap.docs
            .map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); })
            .filter(function(t) { return clMatchesContext(t, ctx); });

        if (templates.length === 0) {
            emptyEl.classList.remove('hidden');
            return;
        }

        templates.forEach(function(tmpl) {
            container.appendChild(clBuildTemplateCard(tmpl));
        });

    } catch (err) {
        console.error('Error loading checklist templates:', err);
        container.innerHTML = '<p class="ar-summary" style="color:#c62828;">Error loading templates.</p>';
    }
}

/**
 * Builds a compact card for one template.
 * @param {Object} template
 * @returns {HTMLElement}
 */
function clBuildTemplateCard(template) {
    var card = document.createElement('div');
    // Clicking the card body opens the edit modal
    card.className = 'cl-template-card cl-template-card--clickable';
    card.title     = 'Click to edit';
    card.addEventListener('click', function() { clOpenEditTemplateModal(template); });

    var info = document.createElement('div');
    info.className = 'cl-template-info';

    var name = document.createElement('div');
    name.className   = 'cl-template-name';
    name.textContent = template.name;
    info.appendChild(name);

    // Location badge — helpful when viewing a roll-up (e.g. all zone templates on the Yard page)
    if (template.targetName) {
        var badge = document.createElement('div');
        badge.className   = 'cl-target-badge';
        badge.textContent = '📍 ' + template.targetName;
        info.appendChild(badge);
    }

    var count = document.createElement('div');
    var itemCount = (template.items || []).length;
    count.className   = 'cl-template-count';
    count.textContent = itemCount + ' item' + (itemCount !== 1 ? 's' : '');
    info.appendChild(count);

    if (template.tags && template.tags.length) {
        info.appendChild(clBuildTagChips(template.tags));
    }

    card.appendChild(info);

    // Only the Start button remains on the card — Edit is via card click, Delete is in the modal
    var btnGroup = document.createElement('div');
    btnGroup.className = 'cl-template-actions';

    var startBtn = document.createElement('button');
    startBtn.className   = 'btn btn-primary btn-small';
    startBtn.textContent = '▶ Start';
    startBtn.addEventListener('click', function(e) {
        e.stopPropagation();  // don't open the edit modal when clicking Start
        clStartRun(template);
    });

    btnGroup.appendChild(startBtn);
    card.appendChild(btnGroup);

    return card;
}

/**
 * Creates a new run from a template snapshot.
 * Copies targetType / targetId / targetName from the template so the
 * run is independently filterable by context.
 * @param {Object} template
 */
async function clStartRun(template) {
    var items = (template.items || []).map(function(item) {
        return { label: item.label, done: false, indent: item.indent || 0 };
    });
    var tags = template.tags || [];

    if (items.length === 0) {
        alert('This template has no items. Edit the template and add at least one task first.');
        return;
    }

    try {
        await userCol('checklistRuns').add({
            templateId:   template.id,
            templateName: template.name,
            tags:         tags,
            targetType:   template.targetType  || null,
            targetId:     template.targetId    || null,
            targetName:   template.targetName  || null,
            startedAt:    new Date().toISOString(),
            completedAt:  null,
            archived:     false,
            items:        items,
            createdAt:    firebase.firestore.FieldValue.serverTimestamp()
        });

        window.scrollTo({ top: 0, behavior: 'smooth' });
        clLoadActiveRuns();

    } catch (err) {
        console.error('Error starting checklist run:', err);
        alert('Error starting checklist. Please try again.');
    }
}

/**
 * Deletes a template after confirmation.
 * @param {string} templateId
 */
async function clDeleteTemplate(templateId) {
    if (!confirm('Delete this template? Any active runs from this template will not be affected.')) return;
    try {
        await userCol('checklistTemplates').doc(templateId).delete();
        clLoadTemplates();
    } catch (err) {
        console.error('Error deleting template:', err);
    }
}

// ============================================================
// COMPLETED RUNS
// ============================================================

/**
 * Loads completed runs, filters to context, renders in the Completed section.
 * Called when the "Show completed" toggle is checked.
 */
async function clLoadCompletedRuns() {
    var container = document.getElementById('clCompletedContainer');
    var emptyEl   = document.getElementById('clCompletedEmptyState');

    container.innerHTML = '<p class="ar-summary">Loading…</p>';
    emptyEl.classList.add('hidden');

    try {
        // Fetch all completed runs and sort client-side to avoid composite index
        var snap = await userCol('checklistRuns')
            .where('completedAt', '!=', null)
            .get();

        var ctx = clCurrentContext || { type: 'yard' };

        var runs = snap.docs
            .map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); })
            .filter(function(run) { return clMatchesContext(run, ctx); })
            .filter(function(run) { return !run.archived; })
            .filter(clMatchesFilter)
            .sort(function(a, b) {
                return (b.completedAt || '').localeCompare(a.completedAt || '');
            });

        container.innerHTML = '';

        if (runs.length === 0) {
            emptyEl.classList.remove('hidden');
            return;
        }

        runs.forEach(function(run) {
            container.appendChild(clBuildCompletedCard(run));
        });

    } catch (err) {
        console.error('Error loading completed runs:', err);
        container.innerHTML = '<p class="ar-summary" style="color:#c62828;">Error loading completed checklists.</p>';
    }
}

/**
 * Builds an accordion card for one completed run.
 * The header row (name, dates, Delete) is always visible.
 * Clicking the card expands/collapses a read-only item list below.
 * @param {Object} run
 * @returns {HTMLElement}
 */
function clBuildCompletedCard(run) {
    var card = document.createElement('div');
    card.className = 'cl-completed-card';

    // ── Header row (always visible) ───────────────────────────
    var header = document.createElement('div');
    header.className = 'cl-completed-header';

    // Chevron indicator shows expanded/collapsed state
    var chevron = document.createElement('span');
    chevron.className   = 'cl-completed-chevron';
    chevron.textContent = '▶';
    header.appendChild(chevron);

    var info = document.createElement('div');
    info.className = 'cl-completed-info';

    var name = document.createElement('div');
    name.className   = 'cl-completed-name';
    name.textContent = run.templateName || 'Checklist';
    info.appendChild(name);

    if (run.targetName) {
        var badge = document.createElement('div');
        badge.className   = 'cl-target-badge';
        badge.textContent = '📍 ' + run.targetName;
        info.appendChild(badge);
    }

    var items     = run.items || [];
    var doneCount = items.filter(function(i) { return i.done; }).length;

    var dates = document.createElement('div');
    dates.className   = 'cl-completed-dates';
    dates.textContent = 'Started ' + clFormatDate(run.startedAt) +
                        ' · Completed ' + clFormatDate(run.completedAt) +
                        ' · ' + doneCount + '/' + items.length + ' items done';
    info.appendChild(dates);

    header.appendChild(info);

    var archiveCBtn = document.createElement('button');
    archiveCBtn.className      = 'btn btn-secondary btn-small';
    archiveCBtn.textContent    = 'Archive';
    archiveCBtn.style.flexShrink = '0';
    archiveCBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        clArchiveRun(run.id, true);
    });
    header.appendChild(archiveCBtn);

    var delBtn = document.createElement('button');
    delBtn.className   = 'btn btn-danger btn-small';
    delBtn.textContent = 'Delete';
    delBtn.style.flexShrink = '0';
    delBtn.addEventListener('click', function(e) {
        e.stopPropagation();  // don't toggle accordion when clicking Delete
        clDeleteRun(run.id, 'completed');
    });
    header.appendChild(delBtn);

    card.appendChild(header);

    // ── Item list (hidden by default, toggled on card click) ───
    var itemsList = document.createElement('ul');
    itemsList.className = 'cl-completed-items hidden';

    items.forEach(function(item) {
        var li = document.createElement('li');
        li.className = (item.done ? 'cl-completed-item cl-completed-item--done'
                                  : 'cl-completed-item cl-completed-item--missed') +
                       (item.indent === 1 ? ' cl-completed-item--indent-1' : item.indent === 2 ? ' cl-completed-item--indent-2' : '');

        var prefix = item.done ? '✓ ' : '✗ ';
        var isUrl  = /^https?:\/\//i.test(item.label);
        var labelEl;
        if (isUrl) {
            labelEl = document.createElement('a');
            labelEl.href   = item.label;
            labelEl.target = '_blank';
            labelEl.rel    = 'noopener noreferrer';
            labelEl.className = 'cl-item-label--url';
            var disp = item.label.length > 60 ? item.label.substring(0, 60) + '…' : item.label;
            labelEl.textContent = prefix + disp;
        } else {
            labelEl = document.createElement('span');
            labelEl.textContent = prefix + item.label;
        }
        li.appendChild(labelEl);

        // Show note read-only below the label if one was recorded
        if (item.note) {
            var noteEl = document.createElement('div');
            noteEl.className   = 'cl-completed-item-note';
            noteEl.textContent = item.note;
            li.appendChild(noteEl);
        }

        itemsList.appendChild(li);
    });

    card.appendChild(itemsList);

    // ── Toggle accordion on card click ─────────────────────────
    card.addEventListener('click', function() {
        var isOpen = !itemsList.classList.contains('hidden');
        itemsList.classList.toggle('hidden', isOpen);
        chevron.textContent = isOpen ? '▶' : '▼';
    });

    return card;
}

// ============================================================
// ARCHIVED RUNS
// ============================================================

/**
 * Loads all archived runs (regardless of completed state), filters to context,
 * and renders in the Archived section.
 * Called when the "Show archived" toggle is checked.
 */
async function clLoadArchivedRuns() {
    var container = document.getElementById('clArchivedContainer');
    var emptyEl   = document.getElementById('clArchivedEmptyState');

    container.innerHTML = '<p class="ar-summary">Loading…</p>';
    emptyEl.classList.add('hidden');

    try {
        var snap = await userCol('checklistRuns')
            .where('archived', '==', true)
            .get();

        var ctx  = clCurrentContext || { type: 'yard' };
        var runs = snap.docs
            .map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); })
            .filter(function(run) { return clMatchesContext(run, ctx); })
            .filter(clMatchesFilter)
            .sort(function(a, b) {
                return (b.startedAt || '').localeCompare(a.startedAt || '');
            });

        container.innerHTML = '';

        if (runs.length === 0) {
            emptyEl.classList.remove('hidden');
            return;
        }

        runs.forEach(function(run) {
            container.appendChild(clBuildArchivedCard(run));
        });

    } catch (err) {
        console.error('Error loading archived runs:', err);
        container.innerHTML = '<p class="ar-summary" style="color:#c62828;">Error loading archived checklists.</p>';
    }
}

/**
 * Builds a simple card for one archived run.
 * Shows name, dates, status, and an Unarchive + Delete button.
 * @param {Object} run
 * @returns {HTMLElement}
 */
function clBuildArchivedCard(run) {
    var card = document.createElement('div');
    card.className = 'cl-archived-card';

    var info = document.createElement('div');
    info.className = 'cl-archived-info';

    var name = document.createElement('div');
    name.className   = 'cl-completed-name';
    name.textContent = run.templateName || 'Checklist';
    info.appendChild(name);

    if (run.targetName) {
        var badge = document.createElement('div');
        badge.className   = 'cl-target-badge';
        badge.textContent = '📍 ' + run.targetName;
        info.appendChild(badge);
    }

    var items     = run.items || [];
    var doneCount = items.filter(function(i) { return i.done; }).length;
    var statusText = run.completedAt
        ? 'Completed ' + clFormatDate(run.completedAt)
        : 'Started ' + clFormatDate(run.startedAt);
    var dates = document.createElement('div');
    dates.className   = 'cl-completed-dates';
    dates.textContent = statusText + ' · ' + doneCount + '/' + items.length + ' done';
    info.appendChild(dates);

    if (run.tags && run.tags.length) info.appendChild(clBuildTagChips(run.tags));

    card.appendChild(info);

    var btnGroup = document.createElement('div');
    btnGroup.className = 'cl-archived-btns';

    var unarchiveBtn = document.createElement('button');
    unarchiveBtn.className   = 'btn btn-secondary btn-small';
    unarchiveBtn.textContent = 'Unarchive';
    unarchiveBtn.addEventListener('click', function() { clArchiveRun(run.id, false); });

    var delBtn = document.createElement('button');
    delBtn.className   = 'btn btn-danger btn-small';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', function() { clDeleteRun(run.id, 'archived'); });

    btnGroup.appendChild(unarchiveBtn);
    btnGroup.appendChild(delBtn);
    card.appendChild(btnGroup);

    return card;
}

/**
 * Archives or unarchives a run by toggling the `archived` flag.
 * Reloads all affected sections after the update.
 * @param {string}  runId
 * @param {boolean} archive — true to archive, false to unarchive
 */
async function clArchiveRun(runId, archive) {
    try {
        await userCol('checklistRuns').doc(runId).update({ archived: archive });
        clLoadActiveRuns();
        var completedToggle = document.getElementById('clShowCompletedToggle');
        if (completedToggle && completedToggle.checked) clLoadCompletedRuns();
        var archiveToggle = document.getElementById('clShowArchivedToggle');
        if (archiveToggle && archiveToggle.checked) clLoadArchivedRuns();
    } catch (err) {
        console.error('Error archiving/unarchiving run:', err);
    }
}

/**
 * Returns true if a run matches the current text filter (name, tags, or item labels).
 * An empty filter always returns true.
 * @param {Object} run
 * @returns {boolean}
 */
function clMatchesFilter(run) {
    var filterEl = document.getElementById('clFilterInput');
    var term = filterEl ? (filterEl.value || '').trim().toLowerCase() : '';
    if (!term) return true;
    if ((run.templateName || '').toLowerCase().indexOf(term) !== -1) return true;
    if ((run.tags || []).some(function(t) { return t.toLowerCase().indexOf(term) !== -1; })) return true;
    if ((run.items || []).some(function(i) { return (i.label || '').toLowerCase().indexOf(term) !== -1; })) return true;
    return false;
}

/**
 * Builds a row of tag chips for display on run cards.
 * @param {string[]} tags
 * @returns {HTMLElement}
 */
function clBuildTagChips(tags) {
    var wrap = document.createElement('div');
    wrap.className = 'cl-tag-chips';
    (tags || []).forEach(function(tag) {
        var chip = document.createElement('span');
        chip.className   = 'cl-tag-chip';
        chip.textContent = tag;
        wrap.appendChild(chip);
    });
    return wrap;
}

// ============================================================
// TEMPLATE MODAL — Add / Edit
// ============================================================

/**
 * Opens the template modal in Add mode.
 * Populates the target picker defaulting to the current context entity.
 */
async function clOpenAddTemplateModal() {
    var modal = document.getElementById('checklistTemplateModal');
    document.getElementById('clTemplateModalTitle').textContent = 'New Template';
    document.getElementById('clTemplateName').value = '';
    document.getElementById('clTagsInput').value = '';
    document.getElementById('clTemplateItemsEditor').innerHTML = '';
    modal.dataset.mode = 'add';
    delete modal.dataset.editId;

    // Delete button only shown in edit mode
    document.getElementById('clTemplateModalDeleteBtn').classList.add('hidden');

    // Populate target picker (async: fetches zones / floors / rooms)
    var ctx = clCurrentContext || { type: 'yard' };
    await clPopulateTargetPicker(ctx, null);

    // Start with 3 blank item rows
    clAddItemRow('');
    clAddItemRow('');
    clAddItemRow('');
    clInitTemplateSortable();

    openModal('checklistTemplateModal');
    document.getElementById('clTemplateName').focus();
}

/**
 * Opens the template modal in Edit mode pre-filled with existing data.
 * @param {Object} template
 */
async function clOpenEditTemplateModal(template) {
    var modal = document.getElementById('checklistTemplateModal');
    document.getElementById('clTemplateModalTitle').textContent = 'Edit Template';
    document.getElementById('clTemplateName').value = template.name || '';
    document.getElementById('clTagsInput').value = (template.tags || []).join(', ');

    // Show delete button and wire it to this template
    var deleteBtn = document.getElementById('clTemplateModalDeleteBtn');
    deleteBtn.classList.remove('hidden');
    deleteBtn.onclick = function() {
        closeModal('checklistTemplateModal');
        clDeleteTemplate(template.id);
    };

    var editor = document.getElementById('clTemplateItemsEditor');
    editor.innerHTML = '';
    (template.items || []).forEach(function(item) {
        clAddItemRow(item.label, item.indent || 0);
    });
    clAddItemRow('');  // always leave one blank row at bottom
    clInitTemplateSortable();

    modal.dataset.mode   = 'edit';
    modal.dataset.editId = template.id;

    // Populate target picker, pre-selecting the template's existing target
    var ctx = clCurrentContext || { type: 'yard' };
    await clPopulateTargetPicker(ctx, template);

    openModal('checklistTemplateModal');
    document.getElementById('clTemplateName').focus();
}

/**
 * Populates the Location dropdown in the template modal.
 *
 * - Yard context: shows "Yard (general)" + all zones (indented by level)
 * - House context: shows "House (general)" + floors + rooms (indented)
 * - Vehicle context: shows just the vehicle (no other choice)
 * - Life context: hides the picker entirely
 *
 * @param {Object} ctx            — Current resolved context.
 * @param {Object|null} existing  — Existing template (edit mode) or null (add mode).
 */
async function clPopulateTargetPicker(ctx, existing) {
    var group  = document.getElementById('clTargetPickerGroup');
    var select = document.getElementById('clTemplateTarget');
    select.innerHTML = '';

    if (ctx.type === 'life') {
        group.classList.add('hidden');
        return;
    }
    group.classList.remove('hidden');

    // When editing, restore the saved value; otherwise default to the current context entity
    var existingValue = existing
        ? ((existing.targetType || '') + '|' + (existing.targetId || ''))
        : null;

    // ── Yard / Zone context ────────────────────────────────────────────────
    if (ctx.type === 'yard' || ctx.type === 'zone') {
        var yardOpt = document.createElement('option');
        yardOpt.value = 'yard|';
        yardOpt.textContent = 'Yard (general)';
        select.appendChild(yardOpt);

        // Fetch all zones and render hierarchically (Level 1 → Level 2 → Level 3)
        var snap = await userCol('zones').get();
        var zones = {};
        snap.forEach(function(doc) {
            zones[doc.id] = Object.assign({ id: doc.id }, doc.data());
        });

        function addZoneOptions(parentId, prefix) {
            Object.values(zones)
                .filter(function(z) { return (z.parentId || null) === (parentId || null); })
                .sort(function(a, b) { return a.name.localeCompare(b.name); })
                .forEach(function(z) {
                    var o = document.createElement('option');
                    o.value = 'zone|' + z.id;
                    o.textContent = prefix + z.name;
                    select.appendChild(o);
                    addZoneOptions(z.id, prefix + '\u00a0\u00a0');  // non-breaking spaces for visual indent
                });
        }
        addZoneOptions(null, '\u2014 ');  // em-dash prefix for top-level zones

        // Set selection
        if (existingValue && existingValue !== '|') {
            select.value = existingValue;
        } else {
            select.value = ctx.type === 'zone' ? ('zone|' + ctx.id) : 'yard|';
        }
    }

    // ── House / Floor / Room context ───────────────────────────────────────
    else if (ctx.type === 'house' || ctx.type === 'floor' || ctx.type === 'room') {
        var houseOpt = document.createElement('option');
        houseOpt.value = 'house|';
        houseOpt.textContent = 'House (general)';
        select.appendChild(houseOpt);

        var floorsSnap = await userCol('floors').get();
        var floors = floorsSnap.docs
            .map(function(d) { return Object.assign({ id: d.id }, d.data()); })
            .sort(function(a, b) { return (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name); });

        var roomsSnap = await userCol('rooms').get();
        var roomsByFloor = {};
        roomsSnap.forEach(function(doc) {
            var r = Object.assign({ id: doc.id }, doc.data());
            if (!roomsByFloor[r.floorId]) roomsByFloor[r.floorId] = [];
            roomsByFloor[r.floorId].push(r);
        });

        floors.forEach(function(floor) {
            var fo = document.createElement('option');
            fo.value = 'floor|' + floor.id;
            fo.textContent = '\u2014 ' + floor.name;
            select.appendChild(fo);

            (roomsByFloor[floor.id] || [])
                .sort(function(a, b) { return a.name.localeCompare(b.name); })
                .forEach(function(room) {
                    var ro = document.createElement('option');
                    ro.value = 'room|' + room.id;
                    ro.textContent = '\u00a0\u00a0\u2014 ' + room.name;
                    select.appendChild(ro);
                });
        });

        // Set selection
        if (existingValue && existingValue !== '|') {
            select.value = existingValue;
        } else if (ctx.type === 'room')  { select.value = 'room|'  + ctx.id; }
        else if (ctx.type === 'floor') { select.value = 'floor|' + ctx.id; }
        else                           { select.value = 'house|'; }
    }

    // ── Vehicle context ────────────────────────────────────────────────────
    else if (ctx.type === 'vehicle') {
        var vOpt = document.createElement('option');
        vOpt.value = 'vehicle|' + ctx.id;
        vOpt.textContent = ctx.name || 'Vehicle';
        select.appendChild(vOpt);
        select.value = 'vehicle|' + ctx.id;
    }
}

/**
 * Appends one item row (drag handle + indent button + text input + remove button) to the editor.
 * @param {string} value  — Pre-fill text, or empty string for a blank row.
 * @param {number} indent — 0 (normal) or 1 (indented sub-item).
 */
function clAddItemRow(value, indent) {
    var editor = document.getElementById('clTemplateItemsEditor');
    indent = Math.min(2, Math.max(0, parseInt(indent) || 0));

    var row = document.createElement('div');
    row.className    = 'cl-template-item-row' + (indent > 0 ? ' cl-template-item-row--indent-' + indent : '');
    row.dataset.indent = String(indent);

    // Drag handle
    var handle = document.createElement('span');
    handle.className   = 'drag-handle cl-tmpl-drag-handle';
    handle.textContent = '⠿';
    handle.title       = 'Drag to reorder';

    // Indent toggle button: cycles 0→1→2→0; → advances, ← resets from level 2
    var indentBtn = document.createElement('button');
    indentBtn.type        = 'button';
    indentBtn.className   = 'cl-indent-btn';
    indentBtn.title       = indent === 0 ? 'Indent' : indent === 1 ? 'Indent more' : 'Remove indent';
    indentBtn.textContent = indent === 2 ? '←' : '→';
    indentBtn.addEventListener('click', function() {
        var cur  = parseInt(row.dataset.indent || '0');
        var next = cur >= 2 ? 0 : cur + 1;
        row.dataset.indent = String(next);
        row.classList.remove('cl-template-item-row--indent-1', 'cl-template-item-row--indent-2');
        if (next > 0) row.classList.add('cl-template-item-row--indent-' + next);
        indentBtn.textContent = next === 2 ? '←' : '→';
        indentBtn.title       = next === 0 ? 'Indent' : next === 1 ? 'Indent more' : 'Remove indent';
    });

    var input = document.createElement('input');
    input.type        = 'text';
    input.className   = 'cl-item-input';
    input.placeholder = 'Task description…';
    input.value       = value || '';

    input.addEventListener('keydown', function(e) {
        // Enter: add a new blank row (inheriting current indent level)
        if (e.key === 'Enter') {
            e.preventDefault();
            clAddItemRow('', parseInt(row.dataset.indent || '0'));
            var rows = editor.querySelectorAll('.cl-item-input');
            rows[rows.length - 1].focus();
        }
        // Tab: indent more (up to 2); Shift+Tab: unindent
        if (e.key === 'Tab') {
            e.preventDefault();
            var cur  = parseInt(row.dataset.indent || '0');
            var next = e.shiftKey ? Math.max(0, cur - 1) : Math.min(2, cur + 1);
            if (next !== cur) {
                row.dataset.indent = String(next);
                row.classList.remove('cl-template-item-row--indent-1', 'cl-template-item-row--indent-2');
                if (next > 0) row.classList.add('cl-template-item-row--indent-' + next);
                indentBtn.textContent = next === 2 ? '←' : '→';
                indentBtn.title       = next === 0 ? 'Indent' : next === 1 ? 'Indent more' : 'Remove indent';
            }
        }
    });

    var removeBtn = document.createElement('button');
    removeBtn.type        = 'button';
    removeBtn.className   = 'cl-item-remove-btn';
    removeBtn.title       = 'Remove this item';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', function() { row.remove(); });

    row.appendChild(handle);
    row.appendChild(indentBtn);
    row.appendChild(input);
    row.appendChild(removeBtn);
    editor.appendChild(row);
}

/**
 * Initialises (or re-initialises) SortableJS drag-and-drop on the template item editor.
 * Called after rows are rendered in both add and edit modes.
 */
function clInitTemplateSortable() {
    var editor = document.getElementById('clTemplateItemsEditor');
    if (editor._sortable) { editor._sortable.destroy(); }
    if (typeof Sortable !== 'undefined') {
        editor._sortable = Sortable.create(editor, {
            handle: '.cl-tmpl-drag-handle',
            animation: 150
        });
    }
}

/**
 * Reads all non-blank item inputs from the editor, including indent state.
 * @returns {Array<{label: string, indent: number}>}
 */
function clGetItemsFromModal() {
    var rows  = document.querySelectorAll('#clTemplateItemsEditor .cl-template-item-row');
    var items = [];
    rows.forEach(function(row) {
        var input = row.querySelector('.cl-item-input');
        var val   = input ? input.value.trim() : '';
        if (val) items.push({ label: val, indent: parseInt(row.dataset.indent || '0') });
    });
    return items;
}

/**
 * Saves the template (add or edit mode).
 * Reads the Location picker to get targetType / targetId / targetName.
 */
async function clSaveTemplate() {
    var modal   = document.getElementById('checklistTemplateModal');
    var name    = document.getElementById('clTemplateName').value.trim();
    var tagsRaw = (document.getElementById('clTagsInput').value || '').trim();
    var tags    = tagsRaw ? tagsRaw.split(',').map(function(t) { return t.trim(); }).filter(Boolean) : [];
    var items   = clGetItemsFromModal();
    var ctx     = clCurrentContext || { type: 'yard' };

    if (!name) {
        alert('Please enter a template name.');
        document.getElementById('clTemplateName').focus();
        return;
    }
    if (items.length === 0) {
        alert('Please add at least one item to the template.');
        return;
    }

    // Resolve target from picker (or hardcode 'life' for Life context)
    var targetType, targetId, targetName;
    if (ctx.type === 'life') {
        targetType = 'life';
        targetId   = null;
        targetName = 'Life';
    } else {
        var select = document.getElementById('clTemplateTarget');
        var parts  = (select.value || 'yard|').split('|');
        targetType = parts[0] || 'yard';
        targetId   = parts[1] || null;

        // Get the human-readable name from the selected option, stripping indent chars
        var selOpt = select.options[select.selectedIndex];
        targetName = selOpt
            ? selOpt.textContent.replace(/^[\u2014\u00a0\s]+/, '').trim()
            : targetType;
    }

    try {
        var mode = modal.dataset.mode;
        if (mode === 'add') {
            await userCol('checklistTemplates').add({
                name:       name,
                tags:       tags,
                items:      items,
                targetType: targetType,
                targetId:   targetId   || null,
                targetName: targetName,
                createdAt:  firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            await userCol('checklistTemplates').doc(modal.dataset.editId).update({
                name:       name,
                tags:       tags,
                items:      items,
                targetType: targetType,
                targetId:   targetId   || null,
                targetName: targetName
            });
        }
        closeModal('checklistTemplateModal');
        clLoadTemplates();

    } catch (err) {
        console.error('Error saving checklist template:', err);
        alert('Error saving template. Please try again.');
    }
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Formats an ISO date string into a compact month/day label (e.g., "Apr 17").
 * Used for displaying item completion dates inline next to a done item's label.
 * @param {string} isoStr
 * @returns {string}
 */
function clFormatShortDate(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Formats an ISO date string or Firestore Timestamp into a short date.
 * @param {string|Object} val
 * @returns {string}
 */
function clFormatDate(val) {
    if (!val) return '—';
    var d;
    if (typeof val === 'string') {
        d = new Date(val);
    } else if (val && typeof val.toDate === 'function') {
        d = val.toDate();
    } else {
        return '—';
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ============================================================
// EVENT LISTENERS
// ============================================================

document.addEventListener('DOMContentLoaded', function() {

    // Template modal — Save button
    document.getElementById('clTemplateModalSaveBtn').addEventListener('click', clSaveTemplate);

    // Template modal — Cancel button
    document.getElementById('clTemplateModalCancelBtn').addEventListener('click', function() {
        closeModal('checklistTemplateModal');
    });

    // Template modal — close on overlay click
    document.getElementById('checklistTemplateModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal('checklistTemplateModal');
    });

    // Template modal — "+ Add Item" button
    document.getElementById('clAddItemBtn').addEventListener('click', function() {
        clAddItemRow('');
        var inputs = document.querySelectorAll('#clTemplateItemsEditor .cl-item-input');
        if (inputs.length) inputs[inputs.length - 1].focus();
    });
});
