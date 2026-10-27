// ============================================================
// memories.js — Memories section (Thoughts > Memories)
// ============================================================

// ── Module state ────────────────────────────────────────────
var _memId             = null;   // current memory doc ID
var _memIsNew          = false;  // true while in the create flow
var _memOriginal       = null;   // snapshot of data on page load (for cancel/revert)
var _memSaveTimer      = null;   // debounce handle for auto-save
var _memCachedList     = [];     // last-loaded list (for filter toggle)
var _memSortable       = null;   // SortableJS instance on the list page
var _memCurrentTags    = [];     // live tag names for the memory being edited
var _memAllTags        = [];     // all tags from memoryTags collection (alphabetical)
var _memPeopleCache    = null;   // [{id, name, nickname}] — lazy-loaded once
var _memMentionedIds   = new Set(); // person IDs added via @-mention
var _memFreeformNames  = [];     // plain-text names added via ++Name

// ============================================================
// LIST PAGE — #memories
// ============================================================

function loadMemoriesPage() {
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML =
        '<a href="#thoughts">Thoughts</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<span>Memories</span>';

    var addBtn = document.getElementById('addMemoryBtn');
    if (addBtn) addBtn.onclick = function() { window.location.hash = '#memory-create'; };

    var filterEl = document.getElementById('memoriesInProgressFilter');
    if (filterEl) {
        filterEl.checked = false;
        filterEl.onchange = function() {
            _memRenderList(_memCachedList, filterEl.checked);
        };
    }

    userCol('memories').orderBy('sortOrder', 'asc').get().then(function(snap) {
        _memCachedList = snap.docs.map(function(doc) {
            return Object.assign({ id: doc.id }, doc.data());
        });
        var filter = document.getElementById('memoriesInProgressFilter');
        _memRenderList(_memCachedList, filter && filter.checked);
        _memInitDragSort();
    }).catch(function(err) {
        console.error('loadMemoriesPage error:', err);
        var container = document.getElementById('memoriesList');
        if (container) container.innerHTML = '<p class="memory-empty-msg">Error loading memories.</p>';
    });
}

function _memRenderList(memories, filterInProgress) {
    var container = document.getElementById('memoriesList');
    if (!container) return;

    var list = filterInProgress
        ? memories.filter(function(m) { return m.inProgress; })
        : memories;

    if (list.length === 0) {
        container.innerHTML = '<p class="memory-empty-msg">' +
            (filterInProgress ? 'No in-progress memories.' : 'No memories yet. Click "+ New Memory" to add one.') +
            '</p>';
        return;
    }

    container.innerHTML = list.map(function(m) {
        var progressTag = m.inProgress
            ? '<span class="memory-in-progress-tag">In Progress</span>'
            : '';
        var dateSpan = m.dateText
            ? '<span class="memory-list-date">' + _memEscape(m.dateText) + '</span>'
            : '';
        return '<div class="memory-list-row" data-id="' + m.id + '" data-sort-order="' + (m.sortOrder || 0) + '">' +
            '<span class="memory-drag-handle" title="Drag to reorder">&#8942;</span>' +
            '<div class="memory-list-content" onclick="window.location.hash=\'#memory-edit/' + m.id + '\'">' +
                progressTag +
                '<span class="memory-list-title">' + _memEscape(m.title || 'Untitled') + '</span>' +
                dateSpan +
            '</div>' +
        '</div>';
    }).join('');
}

function _memInitDragSort() {
    var list = document.getElementById('memoriesList');
    if (!list || !window.Sortable) return;

    if (_memSortable) { _memSortable.destroy(); _memSortable = null; }

    _memSortable = Sortable.create(list, {
        handle:    '.memory-drag-handle',
        animation: 150,
        onEnd: function(evt) {
            var rows = Array.from(list.querySelectorAll('.memory-list-row'));
            var draggedRow = rows[evt.newIndex];
            if (!draggedRow) return;

            var draggedId  = draggedRow.dataset.id;
            var prevOrder  = evt.newIndex > 0
                ? parseFloat(rows[evt.newIndex - 1].dataset.sortOrder)
                : null;
            var nextOrder  = evt.newIndex < rows.length - 1
                ? parseFloat(rows[evt.newIndex + 1].dataset.sortOrder)
                : null;

            var newOrder;
            if (prevOrder === null && nextOrder === null) {
                newOrder = 10000;
            } else if (prevOrder === null) {
                newOrder = nextOrder / 2;
            } else if (nextOrder === null) {
                newOrder = prevOrder + 10000;
            } else {
                newOrder = (prevOrder + nextOrder) / 2;
            }

            draggedRow.dataset.sortOrder = newOrder;

            var cached = _memCachedList.find(function(m) { return m.id === draggedId; });
            if (cached) cached.sortOrder = newOrder;

            userCol('memories').doc(draggedId).update({ sortOrder: newOrder })
                .catch(function(err) { console.error('sortOrder update error:', err); });
        }
    });
}

// ============================================================
// CREATE PAGE — #memory-create
// ============================================================

function loadMemoryCreatePage() {
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML =
        '<a href="#thoughts">Thoughts</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<a href="#memories">Memories</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<span>New Memory</span>';

    _memId       = null;
    _memIsNew    = false;
    _memOriginal = null;
    clearTimeout(_memSaveTimer);

    var input = document.getElementById('memoryCreateTitle');
    if (!input) return;
    input.value    = '';
    input.disabled = false;
    setTimeout(function() { input.focus(); }, 100);

    var cancelBtn = document.getElementById('memoryCreateCancel');
    if (cancelBtn) cancelBtn.onclick = function() { window.location.hash = '#memories'; };

    input.onkeydown = function(e) {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    };

    input.onblur = function() {
        var title = input.value.trim();
        if (!title) return;
        input.disabled = true;

        // Load all memories to calculate proper sort position (sortDate null → bottom)
        userCol('memories').orderBy('sortOrder', 'asc').get()
            .then(function(snap) {
                var others = snap.docs.map(function(d) {
                    return { sortOrder: d.data().sortOrder || 0, sortDate: d.data().sortDate || null };
                });
                var sortOrder = _memCalcSortOrder(null, others);

                return userCol('memories').add({
                    title:              title,
                    body:               '',
                    dateText:           '',
                    sortDate:           null,
                    sortOrder:          sortOrder,
                    location:           '',
                    tags:               [],
                    mentionedPersonIds: [],
                    mentionedNames:     [],
                    urls:               [],
                    inProgress:         true,
                    createdAt:          firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt:          firebase.firestore.FieldValue.serverTimestamp()
                });
            })
            .then(function(ref) {
                _memIsNew = true;
                history.replaceState(null, '', '#memory-edit/' + ref.id);
                showPage('memory-edit');
                loadMemoryEditPage(ref.id, { isNew: true });
            })
            .catch(function(err) {
                console.error('Error creating memory:', err);
                if (input) input.disabled = false;
                alert('Error creating memory. Please try again.');
            });
    };
}

// ============================================================
// EDIT PAGE — #memory-edit/:id
// ============================================================

function loadMemoryEditPage(id, opts) {
    _memId    = id;
    _memIsNew = (opts && opts.isNew) || false;
    clearTimeout(_memSaveTimer);

    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML =
        '<a href="#thoughts">Thoughts</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<a href="#memories">Memories</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<span id="memEditCrumbTitle">Memory</span>';

    userCol('memories').doc(id).get().then(function(doc) {
        if (!doc.exists) { window.location.hash = '#memories'; return; }
        var data = doc.data();

        _memOriginal = {
            title:              data.title              || '',
            body:               data.body               || '',
            dateText:           data.dateText           || '',
            sortDate:           data.sortDate           || null,
            sortOrder:          data.sortOrder          || 0,
            location:           data.location           || '',
            inProgress:         data.inProgress !== false,
            tags:               (data.tags               || []).slice(),
            mentionedPersonIds: (data.mentionedPersonIds || []).slice(),
            mentionedNames:     (data.mentionedNames     || []).slice(),
            urls:               (data.urls               || []).map(function(u) { return Object.assign({}, u); })
        };
        _memCurrentTags   = (data.tags               || []).slice();
        _memMentionedIds  = new Set(data.mentionedPersonIds || []);
        _memFreeformNames = (data.mentionedNames     || []).slice();
        _memUrls          = (data.urls               || []).map(function(u) { return Object.assign({}, u); });

        _memPopulateEditFields(data);
        _memWireEditHandlers();
        _memLoadAndRenderTags(data.tags || []);
        _memRenderPeopleChips();
        _memRenderUrls();
        _memLoadLinkedMemories();
    }).catch(function(err) {
        console.error('loadMemoryEditPage error:', err);
    });
}

function _memPopulateEditFields(data) {
    var crumbTitle = document.getElementById('memEditCrumbTitle');
    if (crumbTitle) crumbTitle.textContent = data.title || 'Memory';

    var fld = function(id) { return document.getElementById(id); };

    var titleEl = fld('memoryEditTitle');
    if (titleEl) titleEl.value = data.title || '';

    var ipEl = fld('memoryEditInProgress');
    if (ipEl) ipEl.checked = data.inProgress !== false;

    var dateEl = fld('memoryEditDateText');
    if (dateEl) dateEl.value = data.dateText || '';

    var locEl = fld('memoryEditLocation');
    if (locEl) locEl.value = data.location || '';

    var bodyEl = fld('memoryEditBody');
    if (bodyEl) {
        bodyEl.value = data.body || '';
        bodyEl.style.height = 'auto';
        bodyEl.style.height = Math.max(bodyEl.scrollHeight, 300) + 'px';
    }
}

function _memWireEditHandlers() {
    var fld = function(id) { return document.getElementById(id); };

    ['memoryEditTitle', 'memoryEditLocation', 'memoryEditBody'].forEach(function(elId) {
        var el = fld(elId);
        if (!el) return;
        el.oninput = function() {
            if (elId === 'memoryEditBody') _memGrowTextarea(el);
            if (elId === 'memoryEditTitle') {
                var span = document.getElementById('memEditCrumbTitle');
                if (span) span.textContent = el.value.trim() || 'Memory';
            }
            _memScheduleSave();
        };
    });

    // dateText: oninput triggers auto-save; onblur also recalculates sortDate + sortOrder
    var dateEl = fld('memoryEditDateText');
    if (dateEl) {
        dateEl.oninput = _memScheduleSave;
        dateEl.onblur  = _memHandleDateBlur;
    }

    var ipEl = fld('memoryEditInProgress');
    if (ipEl) ipEl.onchange = _memScheduleSave;

    // Speak button — reuse journal.js voice-to-text helper
    initVoiceToText('memoryEditBody', 'memorySpeakBtn');

    // Help button (M10)
    var helpBtn = fld('memoryHelpBtn');
    if (helpBtn) helpBtn.onclick = function() { openModal('memoryHelpModal'); };

    // Link picker button (M9)
    var linkBtn = fld('memoryLinkBtn');
    if (linkBtn) linkBtn.onclick = _memOpenLinkPicker;

    var addUrlBtn = fld('memoryAddUrlBtn');
    if (addUrlBtn) addUrlBtn.onclick = function() { _memOpenUrlForm(-1); };

    var cancelBtn = fld('memoryEditCancel');
    if (cancelBtn) cancelBtn.onclick = _memHandleCancel;

    var deleteBtn = fld('memoryEditDelete');
    if (deleteBtn) deleteBtn.onclick = _memHandleDelete;

    _memInitMentions();
}

// ── Date blur: recalculate sortDate + sortOrder ────────────

function _memHandleDateBlur() {
    if (!_memId) return;
    var dateEl  = document.getElementById('memoryEditDateText');
    var dateText = dateEl ? dateEl.value.trim() : '';
    var newSortDate = _memParseSortDate(dateText);

    // Fetch all other memories to compute correct insertion position
    userCol('memories').orderBy('sortOrder', 'asc').get().then(function(snap) {
        var others = snap.docs
            .filter(function(d) { return d.id !== _memId; })
            .map(function(d) {
                return { sortOrder: d.data().sortOrder || 0, sortDate: d.data().sortDate || null };
            });

        var newSortOrder = _memCalcSortOrder(newSortDate, others);
        clearTimeout(_memSaveTimer);

        var data = _memCollectFields();
        data.sortDate   = newSortDate;
        data.sortOrder  = newSortOrder;
        data.updatedAt  = firebase.firestore.FieldValue.serverTimestamp();

        return userCol('memories').doc(_memId).update(data)
            .then(function() {
                return _memRebalanceIfNeeded(snap.docs, newSortOrder);
            });
    }).catch(function(err) {
        console.error('_memHandleDateBlur error:', err);
    });
}

// ── Auto-save ─────────────────────────────────────────────

function _memScheduleSave() {
    clearTimeout(_memSaveTimer);
    _memSaveTimer = setTimeout(_memDoSave, 1500);
}

function _memDoSave() {
    if (!_memId) return;
    var data = _memCollectFields();
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    userCol('memories').doc(_memId).update(data)
        .catch(function(err) { console.error('Memory auto-save error:', err); });
}

function _memCollectFields() {
    var fld = function(id) { return document.getElementById(id); };
    return {
        title:              (fld('memoryEditTitle')      || {}).value || '',
        body:               (fld('memoryEditBody')       || {}).value || '',
        dateText:           (fld('memoryEditDateText')   || {}).value || '',
        location:           (fld('memoryEditLocation')   || {}).value || '',
        inProgress:         !!((fld('memoryEditInProgress') || {}).checked),
        mentionedPersonIds: Array.from(_memMentionedIds),
        mentionedNames:     _memFreeformNames.slice()
    };
}

// ── Cancel ────────────────────────────────────────────────

function _memHandleCancel() {
    clearTimeout(_memSaveTimer);

    if (_memIsNew) {
        if (!confirm('Discard this memory?')) return;
        userCol('memories').doc(_memId).delete()
            .catch(function(err) { console.error('Error discarding new memory:', err); });
        _memId = null;
        window.location.hash = '#memories';
    } else {
        if (!confirm('Discard your changes?')) return;
        var restore = Object.assign({}, _memOriginal, {
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        userCol('memories').doc(_memId).update(restore)
            .catch(function(err) { console.error('Error reverting memory:', err); });
        window.location.hash = '#memories';
    }
}

// ── Delete ────────────────────────────────────────────────

function _memHandleDelete() {
    if (!confirm('Permanently delete this memory? This cannot be undone.')) return;
    clearTimeout(_memSaveTimer);

    var id = _memId;
    userCol('memoryLinks').where('memoryIds', 'array-contains', id).get()
        .then(function(snap) {
            var batch = db.batch();
            snap.docs.forEach(function(linkDoc) { batch.delete(linkDoc.ref); });
            batch.delete(userCol('memories').doc(id));
            return batch.commit();
        })
        .then(function() {
            _memId = null;
            window.location.hash = '#memories';
        })
        .catch(function(err) {
            console.error('Error deleting memory:', err);
            alert('Error deleting memory. Please try again.');
        });
}

// ============================================================
// M3 — DATE PARSER + SORT ORDER
// ============================================================

var _MEM_MONTHS = {
    january:1, february:2, march:3, april:4, may:5, june:6,
    july:7, august:8, september:9, october:10, november:11, december:12,
    jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8,
    sep:9, oct:10, nov:11, dec:12
};
var _MEM_SEASONS = { spring:'04', summer:'07', fall:'10', autumn:'10', winter:'01' };

function _memParseSortDate(text) {
    if (!text) return null;
    var t = text.toLowerCase().trim().replace(/\s+/g, ' ');
    var m;

    // ISO: 1990-06-15
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

    // Month Day, Year — "june 15, 1990" / "june 15 1990"
    m = t.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (m && _MEM_MONTHS[m[1]]) {
        return m[3] + '-' + _memPad(_MEM_MONTHS[m[1]]) + '-' + _memPad(parseInt(m[2]));
    }

    // Named holidays + year
    m = t.match(/christmas\s+(\d{4})/);   if (m) return m[1] + '-12-25';
    m = t.match(/thanksgiving\s+(\d{4})/); if (m) return m[1] + '-11-01';
    m = t.match(/new year'?s?\s+(\d{4})/); if (m) return m[1] + '-01-01';
    m = t.match(/easter\s+(\d{4})/);       if (m) return m[1] + '-04-01';

    // Month + Year — "march 1992"
    m = t.match(/^([a-z]+)\s+(\d{4})$/);
    if (m && _MEM_MONTHS[m[1]]) {
        return m[2] + '-' + _memPad(_MEM_MONTHS[m[1]]) + '-01';
    }

    // Season [of/in] ['YY | YYYY] — "fall of '87" / "summer 1994" / "spring '01"
    m = t.match(/^(spring|summer|fall|autumn|winter)(?:\s+(?:of|in))?\s+(?:'(\d{2})|(\d{4}))$/);
    if (m) {
        var yr = m[3] || _memExpandYear(m[2]);
        return yr + '-' + _MEM_SEASONS[m[1]] + '-01';
    }
    // Season with no year — "last fall", "one summer" → null (can't sort)
    m = t.match(/^(spring|summer|fall|autumn|winter)$/);
    if (m) return null;

    // Decade prefix — "early 80's" / "mid 1980s" / "late 70s"
    m = t.match(/^(early|mid|late)\s+(\d{2,4})(?:'?s)?$/);
    if (m) {
        var n = parseInt(m[2]);
        if (n < 100) n = (n >= 30 ? 1900 : 2000) + n;
        n = Math.floor(n / 10) * 10;
        var offset = m[1] === 'early' ? 0 : m[1] === 'mid' ? 4 : 7;
        return (n + offset) + '-01-01';
    }

    // Year only — "1995"
    if (/^\d{4}$/.test(t)) return t + '-01-01';

    // Two-digit year with apostrophe — "'87"
    m = t.match(/^'(\d{2})$/);
    if (m) return _memExpandYear(m[1]) + '-01-01';

    return null;
}

function _memExpandYear(twoDigit) {
    var n = parseInt(twoDigit);
    return String(n >= 30 ? 1900 + n : 2000 + n);
}

function _memPad(n) {
    return String(n).padStart(2, '0');
}

// Calculate a sortOrder float that slots newSortDate between the right neighbors.
// others: [{sortOrder, sortDate}] sorted by sortOrder asc, excluding the current memory.
function _memCalcSortOrder(newSortDate, others) {
    if (others.length === 0) return 10000;

    // null sortDate goes to the bottom
    if (!newSortDate) {
        return (others[others.length - 1].sortOrder || 0) + 10000;
    }

    // Find first neighbor whose sortDate is after ours (or has no sortDate)
    var insertBefore = -1;
    for (var i = 0; i < others.length; i++) {
        var o = others[i];
        if (!o.sortDate || o.sortDate > newSortDate) {
            insertBefore = i;
            break;
        }
    }

    if (insertBefore === -1) {
        // Goes after everything
        return (others[others.length - 1].sortOrder || 0) + 10000;
    }
    if (insertBefore === 0) {
        // Goes before the first item
        return (others[0].sortOrder || 10000) / 2;
    }
    var prev = others[insertBefore - 1].sortOrder || 0;
    var next = others[insertBefore].sortOrder || (prev + 20000);
    return (prev + next) / 2;
}

// Rebalance sortOrder if the new value landed too close to a neighbor.
function _memRebalanceIfNeeded(snapDocs, newSortOrder) {
    var needsRebalance = snapDocs.some(function(d) {
        return Math.abs((d.data().sortOrder || 0) - newSortOrder) < 0.0001 && d.id !== _memId;
    });
    if (!needsRebalance) return Promise.resolve();

    // Re-read full list in order and assign clean integer multiples
    return userCol('memories').orderBy('sortOrder', 'asc').get().then(function(snap) {
        var batch = db.batch();
        snap.docs.forEach(function(d, i) {
            batch.update(d.ref, { sortOrder: (i + 1) * 10000 });
        });
        return batch.commit();
    });
}

// ============================================================
// M4 — TAGS
// ============================================================

function _memLoadAndRenderTags(activeTags) {
    userCol('memoryTags').orderBy('name', 'asc').get().then(function(snap) {
        _memAllTags = snap.docs.map(function(d) { return d.data().name; });
        _memRenderTagPills(_memAllTags, activeTags);

        // Show the tags section now that it has content
        var section = document.getElementById('memoryTagsSection');
        if (section) section.classList.remove('hidden');
    }).catch(function(err) {
        console.error('_memLoadAndRenderTags error:', err);
    });
}

function _memRenderTagPills(allTags, activeTags) {
    var container = document.getElementById('memoryEditTags');
    if (!container) return;

    var pipsHtml = allTags.map(function(name) {
        var checked = activeTags.indexOf(name) !== -1 ? ' checked' : '';
        var activeClass = checked ? ' active' : '';
        return '<label class="memory-tag-pill' + activeClass + '">' +
            '<input type="checkbox" value="' + _memEscape(name) + '"' + checked + '>' +
            _memEscape(name) +
        '</label>';
    }).join('');

    var addInputHtml =
        '<div class="memory-new-tag-row">' +
            '<input type="text" id="memoryNewTagInput" class="memory-new-tag-input"' +
                ' placeholder="Add tag..." maxlength="40">' +
        '</div>';

    container.innerHTML = '<div class="memory-tag-pills-row">' + pipsHtml + '</div>' + addInputHtml;

    // Wire checkbox changes
    container.querySelectorAll('.memory-tag-pill input').forEach(function(cb) {
        cb.onchange = function() {
            var label = cb.parentElement;
            label.classList.toggle('active', cb.checked);
            _memToggleTag(cb.value, cb.checked);
        };
    });

    // Wire add-tag input
    var newInput = document.getElementById('memoryNewTagInput');
    if (newInput) {
        newInput.onkeydown = function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                var name = newInput.value.trim();
                if (name) _memAddNewTag(name);
            }
        };
    }
}

function _memToggleTag(tagName, isChecked) {
    if (isChecked) {
        if (_memCurrentTags.indexOf(tagName) === -1) _memCurrentTags.push(tagName);
    } else {
        _memCurrentTags = _memCurrentTags.filter(function(t) { return t !== tagName; });
    }
    if (_memId) {
        userCol('memories').doc(_memId).update({
            tags:      _memCurrentTags.slice(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function(err) { console.error('Tag save error:', err); });
    }
}

function _memAddNewTag(name) {
    // Normalise to lowercase for consistency
    var normalised = name.toLowerCase().trim();
    if (!normalised) return;

    var newInput = document.getElementById('memoryNewTagInput');

    // Check if tag already exists in allTags
    var exists = _memAllTags.some(function(t) { return t.toLowerCase() === normalised; });

    var saveToFirestore = exists
        ? Promise.resolve()
        : userCol('memoryTags').add({
            name: normalised,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

    saveToFirestore.then(function() {
        if (!exists) _memAllTags.push(normalised);
        _memAllTags.sort();

        // Add to current memory's tags if not already there
        if (_memCurrentTags.indexOf(normalised) === -1) {
            _memCurrentTags.push(normalised);
        }

        _memRenderTagPills(_memAllTags, _memCurrentTags);

        if (_memId) {
            userCol('memories').doc(_memId).update({
                tags:      _memCurrentTags.slice(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(function(err) { console.error('Tag save error:', err); });
        }
        // Re-focus add input for quick multi-tag entry
        var inp = document.getElementById('memoryNewTagInput');
        if (inp) inp.focus();
    }).catch(function(err) {
        console.error('_memAddNewTag error:', err);
    });
}

// ============================================================
// M5 — @-MENTION AUTOCOMPLETE
// ============================================================

async function _memLoadPeopleCache() {
    if (_memPeopleCache) return _memPeopleCache;
    try {
        var snap = await pplCol('people').get();
        _memPeopleCache = [];
        snap.forEach(function(doc) {
            var d = doc.data();
            _memPeopleCache.push({ id: doc.id, name: d.name || '', nickname: d.nickname || '', howKnown: d.howKnown || '', quickMention: !!d.quickMention });
        });
        _memPeopleCache.sort(function(a, b) { return a.name.localeCompare(b.name); });
    } catch (err) {
        console.error('_memLoadPeopleCache:', err);
        _memPeopleCache = [];
    }
    return _memPeopleCache;
}

function _memGetMentionPrefix(ta) {
    var before = ta.value.substring(0, ta.selectionStart);
    var match  = before.match(/(@@?)(\w*)$/);
    if (!match) return null;
    return { text: match[2], full: match[1].length === 2 };
}

async function _memHandleBodyInput() {
    var ta = document.getElementById('memoryEditBody');
    if (!ta) return;

    // ++ free-form name detection (M6)
    _memScanPlusPlus(ta);

    // @-mention autocomplete
    var result = _memGetMentionPrefix(ta);
    if (result === null) { _memHideMentionDropdown(); return; }

    var people = await _memLoadPeopleCache();
    var lower   = result.text.toLowerCase();
    var matches = people.filter(function(p) {
        var nameMatch = p.name.toLowerCase().startsWith(lower) ||
                        (p.nickname && p.nickname.toLowerCase().startsWith(lower));
        // Single @ → quick list only; @@ → full list
        return nameMatch && (result.full || p.quickMention);
    }).slice(0, 7);
    _memShowMentionDropdown(matches);
}

function _memShowMentionDropdown(matches) {
    var drop = document.getElementById('memoryMentionDropdown');
    if (!drop) return;
    drop.innerHTML = '';
    if (!matches.length) { drop.classList.add('hidden'); return; }

    matches.forEach(function(person) {
        var item = document.createElement('div');
        item.className     = 'mention-item';
        item._mentionPerson = person;
        var label = _memEscape(person.name);
        if (person.nickname) label += ' <span class="mention-item-nick">(' + _memEscape(person.nickname) + ')</span>';
        if (person.howKnown) label += ' <span class="mention-item-nick">' + _memEscape(person.howKnown) + '</span>';
        item.innerHTML = label;
        item.addEventListener('mousedown', function(e) { e.preventDefault(); _memSelectMention(person); });
        item.addEventListener('touchend',  function(e) { e.preventDefault(); _memSelectMention(person); });
        drop.appendChild(item);
    });
    drop.classList.remove('hidden');
}

function _memHideMentionDropdown() {
    var drop = document.getElementById('memoryMentionDropdown');
    if (drop) drop.classList.add('hidden');
}

function _memSelectMention(person) {
    var ta = document.getElementById('memoryEditBody');
    if (!ta) return;
    var result = _memGetMentionPrefix(ta);
    if (result === null) { _memHideMentionDropdown(); return; }

    var pos     = ta.selectionStart;
    var atCount = result.full ? 2 : 1;
    var before  = ta.value.substring(0, pos - result.text.length - atCount);
    var after   = ta.value.substring(pos);
    var name   = person.nickname || person.name.split(' ')[0];
    ta.value   = before + '@' + name + ' ' + after;
    var newPos = before.length + 1 + name.length + 1;
    ta.selectionStart = ta.selectionEnd = newPos;

    _memMentionedIds.add(person.id);
    _memHideMentionDropdown();
    ta.focus();
    _memRenderPeopleChips();
    _memScheduleSave();
}

function _memInitMentions() {
    var ta = document.getElementById('memoryEditBody');
    if (!ta) return;

    ta.removeEventListener('input', _memHandleBodyInput);
    ta.addEventListener('input', _memHandleBodyInput);

    ta.addEventListener('blur', function() {
        setTimeout(_memHideMentionDropdown, 180);
        _memScanPlusPlusOnBlur(ta);
    });

    ta.addEventListener('keydown', function(e) {
        var drop = document.getElementById('memoryMentionDropdown');
        if (!drop || drop.classList.contains('hidden') || !drop.children.length) return;
        if (e.key === 'Escape') {
            _memHideMentionDropdown();
        } else if (e.key === 'Tab' || e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            var first = drop.children[0];
            if (first && first._mentionPerson) _memSelectMention(first._mentionPerson);
        }
    });

    _memLoadPeopleCache();
}

function _memRenderPeopleChips() {
    var container = document.getElementById('memoryPeopleChips');
    var section   = document.getElementById('memoryPeopleSection');
    if (!container) return;

    var hasContacts  = _memMentionedIds.size > 0;
    var hasFreeform  = _memFreeformNames.length > 0;
    if (!hasContacts && !hasFreeform) {
        container.innerHTML = '';
        if (section) section.classList.add('hidden');
        return;
    }

    if (section) section.classList.remove('hidden');

    var html = '';

    // Contact chips — link to contact detail page
    var cacheById = {};
    if (_memPeopleCache) _memPeopleCache.forEach(function(p) { cacheById[p.id] = p; });
    _memMentionedIds.forEach(function(id) {
        var p    = cacheById[id];
        var name = p ? (p.nickname || p.name.split(' ')[0]) : '...';
        html += '<a href="#contact/' + id + '" class="mention-chip">@' + _memEscape(name) + '</a>';
    });

    // Free-form chips — plain text with × remove button
    _memFreeformNames.forEach(function(name) {
        html += '<span class="mention-chip mention-chip--freeform">' +
            _memEscape(name) +
            ' <button class="mention-chip-remove" data-name="' + _memEscape(name) + '" title="Remove">&times;</button>' +
        '</span>';
    });

    container.innerHTML = html;

    container.querySelectorAll('.mention-chip-remove').forEach(function(btn) {
        btn.onclick = function(e) {
            e.preventDefault();
            var removeName = btn.dataset.name;
            _memFreeformNames = _memFreeformNames.filter(function(n) { return n !== removeName; });
            _memRenderPeopleChips();
            _memScheduleSave();
        };
    });
}

// ============================================================
// M6 — ++ FREE-FORM NAME CHIPS
// ============================================================

// Scan text up to cursor for completed ++ patterns (followed by space/punct or end-of-before)
function _memScanPlusPlus(ta) {
    // Only process text before the cursor, requiring pattern ends before cursor
    var text       = ta.value;
    var cursorPos  = ta.selectionStart;
    var re         = /\+\+(?:"([^"]+)"|(\S+))(?=[\s,.!?]|$)/g;
    var match;
    var newText    = text;
    var newCursor  = cursorPos;
    var offset     = 0;
    var anyFound   = false;

    while ((match = re.exec(text)) !== null) {
        var matchEnd = match.index + match[0].length;
        if (matchEnd > cursorPos) continue; // still being typed — skip

        var rawName    = match[1] || match[2];
        if (!rawName) continue;
        var normalized = rawName.trim();
        if (!normalized) continue;

        var lower      = normalized.toLowerCase();
        var alreadyHas = _memFreeformNames.some(function(n) { return n.toLowerCase() === lower; });
        if (!alreadyHas) { _memFreeformNames.push(normalized); anyFound = true; }

        // Replace ++Name → Name in newText (track cumulative offset)
        var start    = match.index + offset;
        var fullLen  = match[0].length;
        var repLen   = normalized.length;
        newText      = newText.substring(0, start) + normalized + newText.substring(start + fullLen);
        var delta    = repLen - fullLen;
        if (newCursor > start + fullLen)       newCursor += delta;
        else if (newCursor > start)            newCursor  = start + repLen;
        offset      += delta;
    }

    if (newText !== text) {
        ta.value = newText;
        ta.selectionStart = ta.selectionEnd = Math.max(0, newCursor);
    }
    if (anyFound) { _memRenderPeopleChips(); _memScheduleSave(); }
}

// Full-text scan on blur — catches anything not yet followed by a space
function _memScanPlusPlusOnBlur(ta) {
    var re    = /\+\+(?:"([^"]+)"|(\S+))/g;
    var match;
    var newText   = ta.value;
    var anyFound  = false;
    var offset    = 0;

    while ((match = re.exec(ta.value)) !== null) {
        var rawName    = match[1] || match[2];
        if (!rawName) continue;
        var normalized = rawName.trim();
        if (!normalized) continue;

        var lower      = normalized.toLowerCase();
        var alreadyHas = _memFreeformNames.some(function(n) { return n.toLowerCase() === lower; });
        if (!alreadyHas) { _memFreeformNames.push(normalized); anyFound = true; }

        // Replace in newText
        var start   = match.index + offset;
        var fullLen = match[0].length;
        newText     = newText.substring(0, start) + normalized + newText.substring(start + fullLen);
        offset     += normalized.length - fullLen;
    }

    if (newText !== ta.value) ta.value = newText;
    if (anyFound) { _memRenderPeopleChips(); _memScheduleSave(); }
}

// ============================================================
// M9 — LINKED MEMORIES
// ============================================================

var _memLinkedDocs = []; // [{linkDocId, otherId, title, dateText}]

function _memLoadLinkedMemories() {
    if (!_memId) return;
    var section = document.getElementById('memoryLinkedSection');
    if (section) section.classList.remove('hidden');

    userCol('memoryLinks').where('memoryIds', 'array-contains', _memId).get()
        .then(function(snap) {
            if (snap.empty) { _memLinkedDocs = []; _memRenderLinkedList(); return; }

            var otherIds = snap.docs.map(function(d) {
                var ids = d.data().memoryIds || [];
                return { linkDocId: d.id, otherId: ids.find(function(i) { return i !== _memId; }) || null };
            }).filter(function(x) { return x.otherId; });

            // Fetch the other memory docs in parallel
            var promises = otherIds.map(function(x) {
                return userCol('memories').doc(x.otherId).get().then(function(doc) {
                    return {
                        linkDocId: x.linkDocId,
                        otherId:   x.otherId,
                        title:     doc.exists ? (doc.data().title || 'Untitled') : '(deleted)',
                        dateText:  doc.exists ? (doc.data().dateText || '') : ''
                    };
                });
            });

            return Promise.all(promises).then(function(results) {
                _memLinkedDocs = results;
                _memRenderLinkedList();
            });
        })
        .catch(function(err) { console.error('_memLoadLinkedMemories error:', err); });
}

function _memRenderLinkedList() {
    var container = document.getElementById('memoryLinkedList');
    if (!container) return;

    if (_memLinkedDocs.length === 0) {
        container.innerHTML = '<p class="memory-empty-msg" style="margin:4px 0 8px;">No linked memories yet.</p>';
        return;
    }

    container.innerHTML = _memLinkedDocs.map(function(item) {
        var dateSpan = item.dateText
            ? ' <span class="memory-list-date">' + _memEscape(item.dateText) + '</span>'
            : '';
        return '<div class="memory-linked-row">' +
            '<a href="#memory-edit/' + item.otherId + '" class="memory-linked-title">' +
                '&#128214; ' + _memEscape(item.title) + dateSpan +
            '</a>' +
            '<button class="memory-url-btn memory-url-delete-btn memory-linked-unlink-btn"' +
                ' data-link-id="' + _memEscape(item.linkDocId) + '" title="Unlink">&times;</button>' +
        '</div>';
    }).join('');

    container.querySelectorAll('.memory-linked-unlink-btn').forEach(function(btn) {
        btn.onclick = function() {
            var linkId = btn.dataset.linkId;
            userCol('memoryLinks').doc(linkId).delete()
                .then(function() {
                    _memLinkedDocs = _memLinkedDocs.filter(function(d) { return d.linkDocId !== linkId; });
                    _memRenderLinkedList();
                })
                .catch(function(err) { console.error('Unlink error:', err); });
        };
    });
}

function _memOpenLinkPicker() {
    openModal('memoryLinkPickerModal');

    var searchEl = document.getElementById('memoryLinkSearch');
    var listEl   = document.getElementById('memoryLinkPickerList');
    if (!listEl) return;

    listEl.innerHTML = '<p class="memory-empty-msg">Loading...</p>';
    if (searchEl) { searchEl.value = ''; }

    var alreadyLinkedIds = new Set(_memLinkedDocs.map(function(d) { return d.otherId; }));

    userCol('memories').orderBy('sortOrder', 'asc').get().then(function(snap) {
        var candidates = snap.docs
            .filter(function(d) { return d.id !== _memId && !alreadyLinkedIds.has(d.id); })
            .map(function(d) {
                return { id: d.id, title: d.data().title || 'Untitled', dateText: d.data().dateText || '' };
            });

        function render(filter) {
            var lower  = (filter || '').toLowerCase();
            var shown  = lower
                ? candidates.filter(function(c) { return c.title.toLowerCase().includes(lower) || c.dateText.toLowerCase().includes(lower); })
                : candidates;

            if (!shown.length) {
                listEl.innerHTML = '<p class="memory-empty-msg">No memories found.</p>';
                return;
            }
            listEl.innerHTML = shown.map(function(c) {
                var dateSpan = c.dateText
                    ? ' <span class="memory-list-date">' + _memEscape(c.dateText) + '</span>'
                    : '';
                return '<div class="memory-link-picker-row" data-id="' + c.id + '">' +
                    '<span class="memory-linked-title">' + _memEscape(c.title) + '</span>' + dateSpan +
                '</div>';
            }).join('');

            listEl.querySelectorAll('.memory-link-picker-row').forEach(function(row) {
                row.onclick = function() { _memCreateLink(row.dataset.id); };
            });
        }

        render('');
        if (searchEl) {
            searchEl.oninput = function() { render(searchEl.value); };
            setTimeout(function() { searchEl.focus(); }, 80);
        }
    }).catch(function(err) {
        console.error('_memOpenLinkPicker error:', err);
        if (listEl) listEl.innerHTML = '<p class="memory-empty-msg">Error loading memories.</p>';
    });
}

function _memCreateLink(otherId) {
    if (!_memId || !otherId) return;
    var ids    = [_memId, otherId].sort();
    var docId  = ids[0] + '_' + ids[1];

    userCol('memoryLinks').doc(docId).set({
        memoryIds: ids,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function() {
        closeModal('memoryLinkPickerModal');
        _memLoadLinkedMemories(); // re-fetch to get title + dateText
    }).catch(function(err) { console.error('_memCreateLink error:', err); });
}

// ============================================================
// M7 — URL LIST
// ============================================================

var _memUrls = []; // [{label, url}]

function _memRenderUrls() {
    var container = document.getElementById('memoryEditUrls');
    var section   = document.getElementById('memoryUrlsSection');
    if (!container) return;

    if (section) section.classList.remove('hidden'); // always visible once wired

    if (_memUrls.length === 0) {
        container.innerHTML = '';
        return;
    }

    var html = _memUrls.map(function(entry, i) {
        var display = _memEscape(entry.label || entry.url || '(no URL)');
        var href    = _memEscape(entry.url || '');
        return '<div class="memory-url-row" data-index="' + i + '">' +
            '<a href="' + href + '" target="_blank" rel="noopener" class="memory-url-link">' +
                '&#128279; ' + display +
            '</a>' +
            '<button class="memory-url-btn memory-url-edit-btn" title="Edit" data-index="' + i + '">&#9998;</button>' +
            '<button class="memory-url-btn memory-url-delete-btn" title="Remove" data-index="' + i + '">&times;</button>' +
        '</div>';
    }).join('');

    container.innerHTML = html;

    container.querySelectorAll('.memory-url-edit-btn').forEach(function(btn) {
        btn.onclick = function() { _memOpenUrlForm(parseInt(btn.dataset.index)); };
    });
    container.querySelectorAll('.memory-url-delete-btn').forEach(function(btn) {
        btn.onclick = function() {
            _memUrls.splice(parseInt(btn.dataset.index), 1);
            _memRenderUrls();
            _memSaveUrls();
        };
    });
}

// Show an inline edit/add form.  index = -1 means "new".
function _memOpenUrlForm(index) {
    var container = document.getElementById('memoryEditUrls');
    if (!container) return;

    var existing = index >= 0 ? _memUrls[index] : { label: '', url: '' };

    // Replace the target row (or append) with an inline form
    var rows = container.querySelectorAll('.memory-url-row');
    var formHtml =
        '<div class="memory-url-edit-form">' +
            '<input type="text" class="memory-url-form-label" placeholder="Label (optional)" value="' + _memEscape(existing.label) + '" maxlength="100">' +
            '<input type="url"  class="memory-url-form-url"   placeholder="https://..." value="' + _memEscape(existing.url) + '" maxlength="2048">' +
            '<div class="memory-url-form-btns">' +
                '<button class="btn btn-primary btn-sm" id="memUrlSaveBtn">Save</button>' +
                '<button class="btn btn-secondary btn-sm" id="memUrlCancelBtn">Cancel</button>' +
            '</div>' +
        '</div>';

    if (index >= 0 && rows[index]) {
        rows[index].outerHTML = formHtml;
    } else {
        container.insertAdjacentHTML('beforeend', formHtml);
    }

    var form     = container.querySelector('.memory-url-edit-form');
    var labelInp = form.querySelector('.memory-url-form-label');
    var urlInp   = form.querySelector('.memory-url-form-url');

    form.querySelector('#memUrlSaveBtn').onclick = function() {
        var label = labelInp.value.trim();
        var url   = urlInp.value.trim();
        if (!url) { urlInp.focus(); return; }
        if (index >= 0) {
            _memUrls[index] = { label: label, url: url };
        } else {
            _memUrls.push({ label: label, url: url });
        }
        _memRenderUrls();
        _memSaveUrls();
    };

    form.querySelector('#memUrlCancelBtn').onclick = function() {
        _memRenderUrls();
    };

    urlInp.focus();
}

function _memSaveUrls() {
    if (!_memId) return;
    userCol('memories').doc(_memId).update({
        urls:      _memUrls.slice(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function(err) { console.error('URL save error:', err); });
}

// ============================================================
// UTILITIES
// ============================================================

function _memGrowTextarea(el) {
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, 300) + 'px';
}

function _memEscape(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
