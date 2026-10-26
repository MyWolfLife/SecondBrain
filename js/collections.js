// ============================================================
// collections.js — Collections Feature
// Handles tracking of physical collections:
//   Comics, Records/Albums, Hat Pins, Beanie Babies,
//   Ceramic Stadiums, and Generic collections.
//
// Routes:
//   #collections          → loadCollectionsPage()
//   #collection/:id       → loadCollectionPage(id)
//   #collectionitem/:id   → loadCollectionItemPage(id)
//
// Firestore collections:
//   collections      — { name, type, label1, label2, label3, createdAt }
//   collectionItems  — { collectionId, name, typeData{}, locationRef{},
//                        acquiredDate, pricePaid, estimatedValue, notes, createdAt }
// ============================================================

// ---- Global state ----
/** The collection document currently being viewed. */
window.currentCollection     = null;
/** The collection item document currently being viewed. */
window.currentCollectionItem = null;

// ---- Collection types ----
var COLLECTION_TYPES = [
    'Comics',
    'Records/Albums',
    'Hat Pins',
    'Beanie Babies',
    'Ceramic Stadiums',
    'Books & Magazines',
    'Generic'
];

// ============================================================
// COLLECTIONS LIST PAGE  (#collections)
// ============================================================

/**
 * Load and render the Collections list page.
 * Each collection card shows: name, type badge, item count, total estimated worth.
 * Called by app.js when routing to #collections.
 */
function loadCollectionsPage() {
    var container = document.getElementById('collectionsListContainer');
    if (!container) return;
    container.innerHTML = '<p class="empty-state">Loading&hellip;</p>';

    // The list shows both private and shared collections, so no single share applies here.
    // Cards set the context for themselves when their Edit button is used.
    _shSetCtx(null, 'owner', null);

    // Breadcrumb: House › Collections
    var bar = document.getElementById('breadcrumbBar');
    if (bar) bar.innerHTML = '<a href="#house">House</a><span class="separator">&rsaquo;</span><span>Collections</span>';

    // Wire up Add Collection button (clone to remove stale listeners)
    var addBtn = document.getElementById('addCollectionBtn');
    if (addBtn) {
        var newAddBtn = addBtn.cloneNode(true);
        addBtn.parentNode.replaceChild(newAddBtn, addBtn);
        newAddBtn.addEventListener('click', function() { _shSetCtx(null, 'owner', null); openAddCollectionModal(); });
    }

    // Count + total worth from a list of item snapshots
    function summarize(itemDocs) {
        var totalWorth = 0;
        itemDocs.forEach(function(d) { totalWorth += parseFloat(d.data().estimatedValue) || 0; });
        return { count: itemDocs.length, totalWorth: totalWorth };
    }

    // 1. My own (private) collections
    var privatePromise = userCol('collections').orderBy('name').get().then(function(snapshot) {
        return Promise.all(snapshot.docs.map(function(doc) {
            return userCol('collectionItems').where('collectionId', '==', doc.id).get().then(function(itemSnap) {
                var s = summarize(itemSnap.docs);
                return { id: doc.id, data: doc.data(), count: s.count, totalWorth: s.totalWorth, share: null };
            });
        }));
    });

    // 2. Collections I shared, and collections shared with me. If this can't load (offline,
    //    rules not published) the private list still shows.
    var sharedPromise = shLoadCollectionShares().then(function(shares) {
        return Promise.all(shares.map(function(s) {
            return Promise.all([
                shareCol(s.id, 'collections').doc(s.data.collectionId).get(),
                shareCol(s.id, 'collectionItems').get()
            ]).then(function(r) {
                if (!r[0].exists) return null;
                var sum = summarize(r[1].docs);
                return { id: r[0].id, data: r[0].data(), count: sum.count, totalWorth: sum.totalWorth,
                         share: { id: s.id, role: s.role, data: s.data } };
            });
        }));
    }).catch(function(err) { console.error('Could not load shared collections:', err); return []; });

    Promise.all([privatePromise, sharedPromise])
        .then(function(res) {
            var all = res[0].concat(res[1].filter(function(x) { return x; }));
            container.innerHTML = '';
            if (!all.length) {
                container.innerHTML = '<p class="empty-state">No collections yet. Click &ldquo;+ Add Collection&rdquo; to create one.</p>';
                return;
            }
            all.sort(function(a, b) { return (a.data.name || '').localeCompare(b.data.name || ''); });
            all.forEach(function(col) {
                container.appendChild(buildCollectionCard(col.id, col.data, col.count, col.totalWorth, col.share));
            });
        })
        .catch(function(err) {
            console.error('loadCollectionsPage error:', err);
            container.innerHTML = '<p class="empty-state">Error loading collections.</p>';
        });
}

/**
 * Build a collection card element for the list page.
 * `share` is null for a private collection, otherwise { id, role, data } of the share it lives in.
 */
function buildCollectionCard(id, data, count, totalWorth, share) {
    var card = document.createElement('div');
    card.className = 'collection-card';

    var worthStr = totalWorth > 0
        ? '$' + totalWorth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '$0.00';

    // Small badge on the left, next to the type: who this belongs to / what I may do
    var shareBadge = '';
    if (share) {
        var label = share.role === 'owner' ? 'Shared'
                  : share.role === 'edit'  ? 'Can edit'
                  : 'View only';
        if (share.role !== 'owner') {
            label += ' · from ' + ((share.data.names || {})[share.data.ownerUid] || 'someone');
        }
        shareBadge = '<span class="collection-type-badge" style="background:#eef3ee;">' + escapeHtml(label) + '</span>';
    }

    var canEdit = !share || share.role !== 'view';
    card.innerHTML =
        '<div class="collection-card-main">' +
            '<div class="collection-card-info">' +
                '<a href="#collection/' + id + '" class="collection-card-name">' +
                    escapeHtml(data.name || 'Unnamed Collection') +
                '</a>' +
                '<span class="collection-type-badge">' + escapeHtml(data.type || '') + '</span>' +
                shareBadge +
            '</div>' +
            '<div class="collection-card-stats">' +
                '<span>' + count + ' item' + (count !== 1 ? 's' : '') + '</span>' +
                '<span class="collection-card-worth">' + worthStr + '</span>' +
            '</div>' +
        '</div>' +
        (canEdit ? '<div class="collection-card-actions">' +
            '<button class="btn btn-secondary btn-small collection-edit-btn" data-id="' + id + '">Edit</button>' +
        '</div>' : '');

    // Wire up the edit button (it must point the data helpers at the right place first)
    var editBtn = card.querySelector('.collection-edit-btn');
    if (editBtn) {
        editBtn.addEventListener('click', function(e) {
            e.preventDefault();
            _shSetCtx(share ? share.id : null, share ? share.role : 'owner', share ? share.data : null);
            openEditCollectionModal(id);
        });
    }

    return card;
}

// ============================================================
// ADD / EDIT COLLECTION MODAL
// ============================================================

/**
 * Open the Add Collection modal in add mode.
 */
function openAddCollectionModal() {
    var modal = document.getElementById('collectionModal');
    modal.dataset.mode   = 'add';
    modal.dataset.editId = '';

    document.getElementById('collectionModalTitle').textContent  = 'Add Collection';
    document.getElementById('collectionNameInput').value         = '';
    document.getElementById('collectionTypeSelect').value        = 'Comics';
    document.getElementById('collectionLabel1Input').value       = '';
    document.getElementById('collectionLabel2Input').value       = '';
    document.getElementById('collectionLabel3Input').value       = '';

    // Hide delete button in add mode
    document.getElementById('collectionDeleteBtn').classList.add('hidden');

    buildContactPicker('collBenePicker', { placeholder: 'Search contacts\u2026' });

    // Toggle generic labels section
    toggleGenericLabels();

    openModal('collectionModal');
}

/**
 * Open the collection modal in edit mode, pre-filling fields from Firestore.
 * @param {string} id — collection document ID
 */
function openEditCollectionModal(id) {
    collCol('collections').doc(id).get()
        .then(function(doc) {
            if (!doc.exists) { alert('Collection not found.'); return; }

            var data  = doc.data();
            var modal = document.getElementById('collectionModal');
            modal.dataset.mode   = 'edit';
            modal.dataset.editId = id;

            document.getElementById('collectionModalTitle').textContent  = 'Edit Collection';
            document.getElementById('collectionNameInput').value         = data.name   || '';
            document.getElementById('collectionTypeSelect').value        = data.type   || 'Comics';
            document.getElementById('collectionLabel1Input').value       = data.label1 || '';
            document.getElementById('collectionLabel2Input').value       = data.label2 || '';
            document.getElementById('collectionLabel3Input').value       = data.label3 || '';

            // Show delete button in edit mode (only the owner can delete a whole collection)
            document.getElementById('collectionDeleteBtn').classList.toggle('hidden', !shIsOwner());

            buildContactPicker('collBenePicker', {
                placeholder: 'Search contacts\u2026',
                initialId:   data.beneficiaryContactId || undefined,
                initialName: data.beneficiaryName      || undefined
            });

            toggleGenericLabels();
            openModal('collectionModal');
        })
        .catch(function(err) {
            console.error('openEditCollectionModal error:', err);
        });
}

/**
 * Show/hide the Generic label fields based on the selected type.
 */
function toggleGenericLabels() {
    var typeSelect    = document.getElementById('collectionTypeSelect');
    var labelsSection = document.getElementById('collectionGenericLabels');
    if (!labelsSection) return;
    var isGeneric = typeSelect && typeSelect.value === 'Generic';
    labelsSection.classList.toggle('hidden', !isGeneric);
}

/**
 * Save handler for the Add/Edit Collection modal.
 * Saves to collCol('collections').
 */
function handleCollectionModalSave() {
    var modal = document.getElementById('collectionModal');
    var name  = (document.getElementById('collectionNameInput').value || '').trim();

    if (!name) {
        alert('Collection name is required.');
        return;
    }

    var type   = document.getElementById('collectionTypeSelect').value;
    var label1 = (document.getElementById('collectionLabel1Input').value || '').trim();
    var label2 = (document.getElementById('collectionLabel2Input').value || '').trim();
    var label3 = (document.getElementById('collectionLabel3Input').value || '').trim();

    // For Generic type, default blank labels to "Label 1" / "Label 2" / "Label 3"
    if (type === 'Generic') {
        if (!label1) label1 = 'Label 1';
        if (!label2) label2 = 'Label 2';
        if (!label3) label3 = 'Label 3';
    }

    var payload = {
        name:                 name,
        type:                 type,
        label1:               label1,
        label2:               label2,
        label3:               label3,
        beneficiaryContactId: document.getElementById('collBenePicker_id').value || null
    };

    var mode   = modal.dataset.mode;
    var editId = modal.dataset.editId;

    // "Goes to" points at the owner's private contacts, so only the owner may change it
    if (!shIsOwner()) delete payload.beneficiaryContactId;

    if (mode === 'edit' && editId) {
        collCol('collections').doc(editId).update(shMaybeStamp(payload, false))
            .then(function() {
                closeModal('collectionModal');
                loadCollectionsPage();
            })
            .catch(function(err) { console.error('Update collection error:', err); });
    } else {
        payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        collCol('collections').add(payload)
            .then(function() {
                closeModal('collectionModal');
                loadCollectionsPage();
            })
            .catch(function(err) { console.error('Add collection error:', err); });
    }
}

/**
 * Delete the current collection and all its items.
 * Confirms with the user before deleting.
 */
function handleCollectionDelete() {
    var modal  = document.getElementById('collectionModal');
    var editId = modal.dataset.editId;
    if (!editId) return;

    if (window.currentShareId) {
        // A shared collection: only the owner gets here (the button is hidden for editors).
        // Contents go first, then the share itself.
        if (!shIsOwner()) return;
        if (!confirm('Delete this shared collection and ALL its items and photos? The people it is shared with lose it too. This cannot be undone.')) return;
        shDeleteSharedCollection(window.currentShareId)
            .then(function() {
                _shSetCtx(null, 'owner', null);
                closeModal('collectionModal');
                window.location.hash = '#collections';
            })
            .catch(function(err) {
                console.error('Delete shared collection error:', err);
                alert('Error deleting collection. Please try again.');
            });
        return;
    }

    if (!confirm('Delete this collection and ALL its items? This cannot be undone.')) return;

    // Delete all items first, then delete the collection doc
    collCol('collectionItems').where('collectionId', '==', editId).get()
        .then(function(itemSnap) {
            var batch = db.batch();
            itemSnap.forEach(function(doc) {
                batch.delete(doc.ref);
            });
            return batch.commit();
        })
        .then(function() {
            return collCol('collections').doc(editId).delete();
        })
        .then(function() {
            closeModal('collectionModal');
            window.location.hash = '#collections';
        })
        .catch(function(err) {
            console.error('Delete collection error:', err);
            alert('Error deleting collection. Please try again.');
        });
}

// ============================================================
// COLLECTION DETAIL PAGE  (#collection/:id)
// ============================================================

/**
 * Load the Collection Detail page — shows the item list with filter bar.
 * @param {string} id — collection document ID
 */
function loadCollectionPage(id) {
    // First find out whether this collection is private or lives in a share, so every
    // read and write below (collCol) goes to the right place.
    // If the page is asked for twice at nearly the same time (e.g. after closing a dialog),
    // only the latest request goes on to draw it.
    var seq = ++_collPageSeq;
    shResolveCollectionContext(id)
        .catch(function(err) { console.error('shResolveCollectionContext:', err); })
        .then(function() { if (seq === _collPageSeq) _loadCollectionPageInner(id); });
}
var _collPageSeq = 0;
var _collItemPageSeq = 0;

/**
 * Shows the Private / Shared / Can edit / View only badge and the Share button on the
 * collection detail page, and hides Add buttons when the person can only view.
 */
function _collApplyShareUi(collData) {
    var row   = document.getElementById('collShareRow');
    var badge = document.getElementById('collShareBadge');
    var info  = document.getElementById('collShareInfo');
    var btn   = document.getElementById('collShareBtn');
    var addBtn = document.getElementById('addCollectionItemBtn');
    if (!row) return;

    var role = window.currentShareRole;
    row.style.display = 'flex';
    info.textContent = '';
    if (!window.currentShareId) {
        badge.textContent = 'Private';
        btn.textContent = 'Share…';
        btn.classList.remove('hidden');
    } else if (role === 'owner') {
        badge.textContent = 'Shared';
        btn.textContent = 'Sharing…';
        btn.classList.remove('hidden');
        var groupIds = Object.keys((window.currentShareData && window.currentShareData.shareGroups) || {});
        _shLoadGroups().then(function(groups) {
            var roles = window.currentShareData.shareGroups;
            info.textContent = 'With: ' + groups.filter(function(g) { return roles[g.id]; })
                .map(function(g) { return g.name + ' (' + (roles[g.id] === 'edit' ? 'can edit' : 'view') + ')'; }).join(', ');
        }).catch(function() {});
    } else {
        badge.textContent = role === 'edit' ? 'Can edit' : 'View only';
        info.textContent = 'Shared by ' + (((window.currentShareData || {}).names || {})[(window.currentShareData || {}).ownerUid] || 'someone');
        btn.classList.add('hidden');
    }
    if (addBtn) addBtn.classList.toggle('hidden', !shCanEdit());
    var photoBtn = document.getElementById('collectionFromPicBtn');
    if (photoBtn && !shCanEdit()) photoBtn.classList.add('hidden');
}

function _loadCollectionPageInner(id) {
    var nameEl    = document.getElementById('collectionDetailName');
    var statsEl   = document.getElementById('collectionDetailStats');
    var crumbEl   = document.getElementById('breadcrumbBar');
    var listEl    = document.getElementById('collectionItemsList');
    var filterEl  = document.getElementById('collectionFilterInput');
    var addBtn    = document.getElementById('addCollectionItemBtn');

    if (!nameEl || !listEl) return;

    nameEl.textContent  = 'Loading…';
    statsEl.textContent = '';
    listEl.innerHTML    = '<p class="empty-state">Loading&hellip;</p>';
    if (crumbEl) crumbEl.innerHTML = '<a href="#house">House</a><span class="separator">&rsaquo;</span><a href="#collections">Collections</a>';

    collCol('collections').doc(id).get()
        .then(function(doc) {
            if (!doc.exists) {
                listEl.innerHTML = '<p class="empty-state">Collection not found.</p>';
                return Promise.reject('not-found');
            }

            var data = doc.data();
            window.currentCollection = { id: id, ...data };
            _collApplyShareUi(data);

            nameEl.textContent = data.name || 'Collection';
            _renderBeneficiaryRow('collGoesToRow', { id: id, ...data }, []);

            // Update breadcrumb with collection name
            if (crumbEl) {
                crumbEl.innerHTML =
                    '<a href="#house">House</a>' +
                    '<span class="separator">&rsaquo;</span>' +
                    '<a href="#collections">Collections</a>' +
                    '<span class="separator">&rsaquo;</span>' +
                    '<span>' + escapeHtml(data.name || 'Collection') + '</span>';
            }

            // Set filter placeholder based on type
            if (filterEl) {
                if (data.type === 'Comics') {
                    filterEl.placeholder = 'Filter by series…';
                } else if (data.type === 'Records/Albums') {
                    filterEl.placeholder = 'Filter by artist…';
                } else if (data.type === 'Books & Magazines') {
                    filterEl.placeholder = 'Filter by title or author…';
                } else {
                    filterEl.placeholder = 'Search by name…';
                }
            }

            // Wire up Add Item button
            if (addBtn) {
                var newAddBtn = addBtn.cloneNode(true);
                addBtn.parentNode.replaceChild(newAddBtn, addBtn);
                newAddBtn.addEventListener('click', function() {
                    openAddCollectionItemModal(id);
                });
            }

            // Wire up +Photo button and check LLM config
            collectionCheckLlmForPhotoBtn();
            var photoBtn = document.getElementById('collectionFromPicBtn');
            if (photoBtn) {
                var newPhotoBtn = photoBtn.cloneNode(true);
                photoBtn.parentNode.replaceChild(newPhotoBtn, photoBtn);
                newPhotoBtn.addEventListener('click', (function(collId, collTypeVal) {
                    return function() {
                        _collPicContext = { collectionId: collId, collType: collTypeVal };
                        openLlmPhotoStaging('Add ' + (collTypeVal || 'Collection') + ' Photo', function(images) {
                            collectionSendToLlm(images);
                        });
                    };
                })(id, data.type || ''));
            }

            // Load items
            return collCol('collectionItems')
                .where('collectionId', '==', id)
                .get();
        })
        .then(function(itemSnap) {
            if (!itemSnap) return;

            var items = [];
            itemSnap.forEach(function(doc) {
                items.push({ id: doc.id, ...doc.data() });
            });

            // Compute stats
            var totalWorth = 0;
            items.forEach(function(item) {
                totalWorth += parseFloat(item.estimatedValue) || 0;
            });

            var worthStr = totalWorth > 0
                ? '$' + totalWorth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : '$0.00';

            statsEl.textContent = items.length + ' item' + (items.length !== 1 ? 's' : '') + ' · ' + worthStr;

            // Sort items per type
            var collType = window.currentCollection ? window.currentCollection.type : '';
            sortCollectionItems(items, collType);

            // Store for client-side filtering
            window._collectionItemsCache = items;

            renderCollectionItemsList(items, collType, listEl);

            // Wire up filter input (clone to remove stale listeners)
            if (filterEl) {
                var newFilter = filterEl.cloneNode(true);
                filterEl.parentNode.replaceChild(newFilter, filterEl);
                newFilter.value = '';
                newFilter.addEventListener('input', function() {
                    var term = this.value.toLowerCase().trim();
                    var filtered = filterCollectionItems(window._collectionItemsCache, collType, term);
                    renderCollectionItemsList(filtered, collType, listEl);
                });
            }
        })
        .catch(function(err) {
            if (err !== 'not-found') {
                console.error('loadCollectionPage error:', err);
                listEl.innerHTML = '<p class="empty-state">Error loading collection.</p>';
            }
        });
}

/**
 * Sort an array of collection items in-place according to type rules.
 * @param {Array}  items    — item objects
 * @param {string} collType — collection type string
 */
function sortCollectionItems(items, collType) {
    items.sort(function(a, b) {
        if (collType === 'Comics') {
            var seriesA = ((a.typeData && a.typeData.series) || '').toLowerCase();
            var seriesB = ((b.typeData && b.typeData.series) || '').toLowerCase();
            if (seriesA !== seriesB) return seriesA < seriesB ? -1 : 1;
            // Sort by issue number numerically
            var numA = parseFloat((a.typeData && a.typeData.issueNumber) || 0) || 0;
            var numB = parseFloat((b.typeData && b.typeData.issueNumber) || 0) || 0;
            return numA - numB;
        }
        if (collType === 'Records/Albums') {
            var fmtA = ((a.typeData && a.typeData.format) || '').toLowerCase();
            var fmtB = ((b.typeData && b.typeData.format) || '').toLowerCase();
            if (fmtA !== fmtB) return fmtA < fmtB ? -1 : 1;
            var artA = ((a.typeData && a.typeData.artist) || '').toLowerCase();
            var artB = ((b.typeData && b.typeData.artist) || '').toLowerCase();
            if (artA !== artB) return artA < artB ? -1 : 1;
            return (a.name || '').toLowerCase() < (b.name || '').toLowerCase() ? -1 : 1;
        }
        // All others: name A→Z
        return (a.name || '').toLowerCase() < (b.name || '').toLowerCase() ? -1 : 1;
    });
}

/**
 * Filter items by the appropriate field for the collection type.
 * @param {Array}  items    — all items (sorted)
 * @param {string} collType — collection type
 * @param {string} term     — lower-case search term
 * @returns {Array} filtered array
 */
function filterCollectionItems(items, collType, term) {
    if (!term) return items;
    return items.filter(function(item) {
        if (collType === 'Comics') {
            return ((item.typeData && item.typeData.series) || '').toLowerCase().indexOf(term) !== -1;
        }
        if (collType === 'Records/Albums') {
            return ((item.typeData && item.typeData.artist) || '').toLowerCase().indexOf(term) !== -1;
        }
        if (collType === 'Books & Magazines') {
            return (item.name || '').toLowerCase().indexOf(term) !== -1 ||
                   ((item.typeData && item.typeData.author) || '').toLowerCase().indexOf(term) !== -1;
        }
        return (item.name || '').toLowerCase().indexOf(term) !== -1;
    });
}

/**
 * Render collection item rows into the list container.
 */
function renderCollectionItemsList(items, collType, listEl) {
    listEl.innerHTML = '';

    if (!items || items.length === 0) {
        listEl.innerHTML = '<p class="empty-state">No items found.</p>';
        return;
    }

    items.forEach(function(item) {
        var row = document.createElement('div');
        row.className = 'collection-item-row';

        // Determine the key field to show based on type
        var keyField = '';
        if (collType === 'Comics' && item.typeData) {
            keyField = item.typeData.series
                ? escapeHtml(item.typeData.series) + (item.typeData.issueNumber ? ' #' + escapeHtml(String(item.typeData.issueNumber)) : '')
                : '';
        } else if (collType === 'Records/Albums' && item.typeData) {
            keyField = item.typeData.artist ? escapeHtml(item.typeData.artist) : '';
        } else if (collType === 'Beanie Babies' && item.typeData) {
            keyField = item.typeData.style ? escapeHtml(item.typeData.style) : '';
        } else if (collType === 'Ceramic Stadiums' && item.typeData) {
            keyField = item.typeData.team ? escapeHtml(item.typeData.team) : '';
        } else if (collType === 'Books & Magazines' && item.typeData) {
            keyField = item.typeData.author ? escapeHtml(item.typeData.author) : '';
        }

        var worthStr = item.estimatedValue
            ? '$' + parseFloat(item.estimatedValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : '';

        var thumbHtml = item.profilePhotoData
            ? '<img class="collection-item-row-thumb" src="' + item.profilePhotoData + '" alt="">'
            : '<div class="collection-item-row-thumb collection-item-row-thumb-placeholder"></div>';

        row.innerHTML =
            thumbHtml +
            '<div class="collection-item-row-info">' +
                '<span class="collection-item-row-name">' + escapeHtml(item.name || 'Unnamed') + '</span>' +
                (keyField ? '<span class="collection-item-row-key">' + keyField + '</span>' : '') +
            '</div>' +
            '<div class="collection-item-row-right">' +
                (worthStr ? '<span class="collection-item-row-worth">' + worthStr + '</span>' : '') +
                '<span class="card-arrow">&rsaquo;</span>' +
            '</div>';

        row.addEventListener('click', function() {
            window.location.hash = '#collectionitem/' + item.id;
        });

        listEl.appendChild(row);
    });
}

// ============================================================
// ADD / EDIT COLLECTION ITEM MODAL
// ============================================================

/**
 * Build and inject type-specific fields into the modal's type-fields div.
 * @param {string} collType — collection type
 * @param {object} typeData — existing typeData values (for edit mode), or null
 * @param {object} colDoc   — the parent collection document data (for Generic labels)
 */
function renderCollectionItemTypeFields(collType, typeData, colDoc) {
    var container = document.getElementById('collectionItemTypeFields');
    if (!container) return;
    container.innerHTML = '';
    typeData = typeData || {};

    if (collType === 'Comics') {
        container.innerHTML =
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label for="ciSeries">Series</label>' +
                    '<input type="text" id="ciSeries" placeholder="e.g., Amazing Spider-Man" value="' + escapeHtml(typeData.series || '') + '">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label for="ciIssueNumber">Issue #</label>' +
                    '<input type="number" id="ciIssueNumber" placeholder="e.g., 434" value="' + escapeHtml(String(typeData.issueNumber || '')) + '">' +
                '</div>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label for="ciPublisher">Publisher</label>' +
                    '<input type="text" id="ciPublisher" placeholder="e.g., Marvel, DC" value="' + escapeHtml(typeData.publisher || '') + '">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label for="ciYear">Year</label>' +
                    '<input type="number" id="ciYear" placeholder="e.g., 1998" value="' + escapeHtml(String(typeData.year || '')) + '">' +
                '</div>' +
            '</div>';

    } else if (collType === 'Records/Albums') {
        var formatOptions = ['LP', '45', 'Cassette', 'CD', '8-Track'];
        var fmtSel = formatOptions.map(function(f) {
            return '<option value="' + f + '"' + (typeData.format === f ? ' selected' : '') + '>' + f + '</option>';
        }).join('');

        container.innerHTML =
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label for="ciArtist">Artist</label>' +
                    '<input type="text" id="ciArtist" placeholder="e.g., Eagles" value="' + escapeHtml(typeData.artist || '') + '">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label for="ciLabel">Label</label>' +
                    '<input type="text" id="ciLabel" placeholder="e.g., Asylum Records" value="' + escapeHtml(typeData.label || '') + '">' +
                '</div>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label for="ciFormat">Format</label>' +
                    '<select id="ciFormat"><option value="">-- Select --</option>' + fmtSel + '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label for="ciYear">Year</label>' +
                    '<input type="number" id="ciYear" placeholder="e.g., 1977" value="' + escapeHtml(String(typeData.year || '')) + '">' +
                '</div>' +
            '</div>';

    } else if (collType === 'Beanie Babies') {
        container.innerHTML =
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label for="ciStyle">Style</label>' +
                    '<input type="text" id="ciStyle" placeholder="e.g., Peanut the Elephant" value="' + escapeHtml(typeData.style || '') + '">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label for="ciYear">Year</label>' +
                    '<input type="number" id="ciYear" placeholder="e.g., 1996" value="' + escapeHtml(String(typeData.year || '')) + '">' +
                '</div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="checkbox-label">' +
                    '<input type="checkbox" id="ciHasTags"' + (typeData.hasTags ? ' checked' : '') + '> Has Tags' +
                '</label>' +
            '</div>';

    } else if (collType === 'Ceramic Stadiums') {
        container.innerHTML =
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label for="ciTeam">Team</label>' +
                    '<input type="text" id="ciTeam" placeholder="e.g., Boston Red Sox" value="' + escapeHtml(typeData.team || '') + '">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label for="ciYear">Year</label>' +
                    '<input type="number" id="ciYear" placeholder="e.g., 2005" value="' + escapeHtml(String(typeData.year || '')) + '">' +
                '</div>' +
            '</div>';

    } else if (collType === 'Books & Magazines') {
        var typeOptions = ['Book', 'Magazine'].map(function(t) {
            return '<option value="' + t + '"' + (typeData.type === t ? ' selected' : '') + '>' + t + '</option>';
        }).join('');
        container.innerHTML =
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label for="ciBmType">Type</label>' +
                    '<select id="ciBmType"><option value="">-- Select --</option>' + typeOptions + '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label for="ciYear">Year</label>' +
                    '<input type="number" id="ciYear" placeholder="e.g., 1987" value="' + escapeHtml(String(typeData.year || '')) + '">' +
                '</div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="ciAuthor">Author / Creator</label>' +
                '<input type="text" id="ciAuthor" placeholder="e.g., Stephen King" value="' + escapeHtml(typeData.author || '') + '">' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label for="ciPublisher">Publisher</label>' +
                    '<input type="text" id="ciPublisher" placeholder="e.g., Doubleday" value="' + escapeHtml(typeData.publisher || '') + '">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label for="ciIsbn">ISBN <span class="label-optional">(optional)</span></label>' +
                    '<input type="text" id="ciIsbn" placeholder="e.g., 978-0-385-33348-1" value="' + escapeHtml(typeData.isbn || '') + '">' +
                '</div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="ciIssueDate">Issue Date <span class="label-optional">(magazines)</span></label>' +
                '<input type="text" id="ciIssueDate" placeholder="e.g., March 1987" value="' + escapeHtml(typeData.issueDate || '') + '">' +
            '</div>';

    } else if (collType === 'Generic') {
        // Use the collection's label names, defaulting to "Label 1" / "Label 2" / "Label 3"
        var l1 = (colDoc && colDoc.label1) ? colDoc.label1 : 'Label 1';
        var l2 = (colDoc && colDoc.label2) ? colDoc.label2 : 'Label 2';
        var l3 = (colDoc && colDoc.label3) ? colDoc.label3 : 'Label 3';

        container.innerHTML =
            '<div class="form-group">' +
                '<label for="ciValue1">' + escapeHtml(l1) + '</label>' +
                '<input type="text" id="ciValue1" value="' + escapeHtml(typeData.value1 || '') + '">' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="ciValue2">' + escapeHtml(l2) + '</label>' +
                '<input type="text" id="ciValue2" value="' + escapeHtml(typeData.value2 || '') + '">' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="ciValue3">' + escapeHtml(l3) + '</label>' +
                '<input type="text" id="ciValue3" value="' + escapeHtml(typeData.value3 || '') + '">' +
            '</div>';

    } else {
        // Hat Pins — no type-specific fields
        container.innerHTML = '';
    }
}

/**
 * Open the Add Collection Item modal.
 * Reads the parent collection to determine which type-specific fields to show.
 * @param {string} collectionId — parent collection document ID
 */
function openAddCollectionItemModal(collectionId) {
    collCol('collections').doc(collectionId).get()
        .then(function(colDoc) {
            if (!colDoc.exists) { alert('Collection not found.'); return; }

            var colData = colDoc.data();
            var modal   = document.getElementById('collectionItemModal');
            modal.dataset.mode         = 'add';
            modal.dataset.editId       = '';
            modal.dataset.collectionId = collectionId;
            modal.dataset.collType     = colData.type || '';

            document.getElementById('collectionItemModalTitle').textContent = 'Add Item';
            document.getElementById('ciName').value          = '';
            document.getElementById('ciAcquiredDate').value  = '';
            document.getElementById('ciPricePaid').value     = '';
            document.getElementById('ciEstValue').value      = '';
            document.getElementById('ciNotes').value         = '';

            renderCollectionItemTypeFields(colData.type, null, colData);
            buildContactPicker('ciBenePicker', { placeholder: 'Search contacts\u2026' });
            openModal('collectionItemModal');
        })
        .catch(function(err) {
            console.error('openAddCollectionItemModal error:', err);
        });
}

/**
 * Open the Edit Collection Item modal.
 * Loads the item + its parent collection to determine type-specific fields.
 * @param {string} itemId — collection item document ID
 */
function openEditCollectionItemModal(itemId) {
    collCol('collectionItems').doc(itemId).get()
        .then(function(itemDoc) {
            if (!itemDoc.exists) { alert('Item not found.'); return; }

            var itemData = itemDoc.data();
            return collCol('collections').doc(itemData.collectionId).get()
                .then(function(colDoc) {
                    var colData = colDoc.exists ? colDoc.data() : {};
                    var modal   = document.getElementById('collectionItemModal');
                    modal.dataset.mode         = 'edit';
                    modal.dataset.editId       = itemId;
                    modal.dataset.collectionId = itemData.collectionId;
                    modal.dataset.collType     = colData.type || '';

                    document.getElementById('collectionItemModalTitle').textContent = 'Edit Item';
                    document.getElementById('ciName').value          = itemData.name          || '';
                    document.getElementById('ciAcquiredDate').value  = itemData.acquiredDate  || '';
                    document.getElementById('ciPricePaid').value     = itemData.pricePaid     !== undefined ? itemData.pricePaid     : '';
                    document.getElementById('ciEstValue').value      = itemData.estimatedValue !== undefined ? itemData.estimatedValue : '';
                    document.getElementById('ciNotes').value         = itemData.notes         || '';

                    renderCollectionItemTypeFields(colData.type, itemData.typeData || {}, colData);
                    buildContactPicker('ciBenePicker', {
                        placeholder: 'Search contacts\u2026',
                        initialId:   itemData.beneficiaryContactId || undefined,
                        initialName: itemData.beneficiaryName      || undefined
                    });
                    openModal('collectionItemModal');
                });
        })
        .catch(function(err) {
            console.error('openEditCollectionItemModal error:', err);
        });
}

/**
 * Save handler for the Add/Edit Collection Item modal.
 * Reads all type-specific fields and saves to collCol('collectionItems').
 */
function handleCollectionItemModalSave() {
    var modal        = document.getElementById('collectionItemModal');
    var name         = (document.getElementById('ciName').value || '').trim();
    var collectionId = modal.dataset.collectionId;
    var collType     = modal.dataset.collType;
    var mode         = modal.dataset.mode;
    var editId       = modal.dataset.editId;

    if (!name) {
        alert('Item name is required.');
        return;
    }

    // Build type-specific typeData object
    var typeData = {};

    if (collType === 'Comics') {
        typeData.series      = (document.getElementById('ciSeries')      ? document.getElementById('ciSeries').value.trim()      : '');
        typeData.issueNumber = (document.getElementById('ciIssueNumber') ? document.getElementById('ciIssueNumber').value.trim() : '');
        typeData.publisher   = (document.getElementById('ciPublisher')   ? document.getElementById('ciPublisher').value.trim()   : '');
        typeData.year        = (document.getElementById('ciYear')        ? document.getElementById('ciYear').value.trim()        : '');
    } else if (collType === 'Records/Albums') {
        typeData.artist = (document.getElementById('ciArtist') ? document.getElementById('ciArtist').value.trim() : '');
        typeData.label  = (document.getElementById('ciLabel')  ? document.getElementById('ciLabel').value.trim()  : '');
        typeData.format = (document.getElementById('ciFormat') ? document.getElementById('ciFormat').value        : '');
        typeData.year   = (document.getElementById('ciYear')   ? document.getElementById('ciYear').value.trim()   : '');
    } else if (collType === 'Beanie Babies') {
        typeData.style   = (document.getElementById('ciStyle')   ? document.getElementById('ciStyle').value.trim() : '');
        typeData.year    = (document.getElementById('ciYear')    ? document.getElementById('ciYear').value.trim()  : '');
        typeData.hasTags = (document.getElementById('ciHasTags') ? document.getElementById('ciHasTags').checked   : false);
    } else if (collType === 'Ceramic Stadiums') {
        typeData.team = (document.getElementById('ciTeam') ? document.getElementById('ciTeam').value.trim() : '');
        typeData.year = (document.getElementById('ciYear') ? document.getElementById('ciYear').value.trim() : '');
    } else if (collType === 'Books & Magazines') {
        typeData.type      = (document.getElementById('ciBmType')    ? document.getElementById('ciBmType').value                : '');
        typeData.author    = (document.getElementById('ciAuthor')    ? document.getElementById('ciAuthor').value.trim()         : '');
        typeData.publisher = (document.getElementById('ciPublisher') ? document.getElementById('ciPublisher').value.trim()      : '');
        typeData.year      = (document.getElementById('ciYear')      ? document.getElementById('ciYear').value.trim()           : '');
        typeData.isbn      = (document.getElementById('ciIsbn')      ? document.getElementById('ciIsbn').value.trim()          : '');
        typeData.issueDate = (document.getElementById('ciIssueDate') ? document.getElementById('ciIssueDate').value.trim()      : '');
    } else if (collType === 'Generic') {
        typeData.value1 = (document.getElementById('ciValue1') ? document.getElementById('ciValue1').value.trim() : '');
        typeData.value2 = (document.getElementById('ciValue2') ? document.getElementById('ciValue2').value.trim() : '');
        typeData.value3 = (document.getElementById('ciValue3') ? document.getElementById('ciValue3').value.trim() : '');
    }
    // Hat Pins — typeData stays {}

    var pricePaid      = document.getElementById('ciPricePaid').value;
    var estimatedValue = document.getElementById('ciEstValue').value;

    var payload = {
        collectionId:         collectionId,
        name:                 name,
        typeData:             typeData,
        acquiredDate:         document.getElementById('ciAcquiredDate').value || '',
        pricePaid:            pricePaid      !== '' ? parseFloat(pricePaid)      : null,
        estimatedValue:       estimatedValue !== '' ? parseFloat(estimatedValue) : null,
        notes:                (document.getElementById('ciNotes').value || '').trim(),
        beneficiaryContactId: document.getElementById('ciBenePicker_id').value || null
    };

    // "Goes to" points at the owner's private contacts, so only the owner may change it
    if (!shIsOwner()) delete payload.beneficiaryContactId;

    if (mode === 'edit' && editId) {
        collCol('collectionItems').doc(editId).update(shMaybeStamp(payload, false))
            .then(function() {
                closeModal('collectionItemModal');
                // Reload the appropriate page
                if (window.currentCollectionItem && window.currentCollectionItem.id === editId) {
                    loadCollectionItemPage(editId);
                } else if (window.currentCollection) {
                    loadCollectionPage(window.currentCollection.id);
                }
            })
            .catch(function(err) { console.error('Update collection item error:', err); });
    } else {
        payload.createdAt   = firebase.firestore.FieldValue.serverTimestamp();
        payload.locationRef = null;
        collCol('collectionItems').add(shMaybeStamp(payload, true))
            .then(function() {
                closeModal('collectionItemModal');
                if (window.currentCollection) {
                    loadCollectionPage(window.currentCollection.id);
                }
            })
            .catch(function(err) { console.error('Add collection item error:', err); });
    }
}

// ============================================================
// COLLECTION ITEM DETAIL PAGE  (#collectionitem/:id)
// ============================================================

/**
 * Load the Collection Item detail page.
 * @param {string} id — collection item document ID
 */
function loadCollectionItemPage(id) {
    // Find out whether this item is private or lives in a share (the page only has the item's ID)
    var seq = ++_collItemPageSeq;
    shResolveItemContext(id)
        .catch(function(err) { console.error('shResolveItemContext:', err); })
        .then(function() { if (seq === _collItemPageSeq) _loadCollectionItemPageInner(id); });
}

function _loadCollectionItemPageInner(id) {
    var nameEl     = document.getElementById('collectionItemDetailName');
    var crumbEl    = document.getElementById('breadcrumbBar');
    var infoCard   = document.getElementById('collectionItemInfoCard');
    var locationEl = document.getElementById('collectionItemLocationDisplay');

    if (!nameEl || !infoCard) return;

    nameEl.textContent = 'Loading…';
    infoCard.innerHTML = '<p class="empty-state">Loading&hellip;</p>';
    if (locationEl) locationEl.innerHTML = '';

    collCol('collectionItems').doc(id).get()
        .then(function(itemDoc) {
            if (!itemDoc.exists) {
                infoCard.innerHTML = '<p class="empty-state">Item not found.</p>';
                return Promise.reject('not-found');
            }

            var itemData = itemDoc.data();
            window.currentCollectionItem = { id: id, ...itemData };

            nameEl.textContent = itemData.name || 'Item';

            // Load parent collection for labels and type
            return collCol('collections').doc(itemData.collectionId).get()
                .then(function(colDoc) {
                    var colData = colDoc.exists ? colDoc.data() : {};

                    // Breadcrumb
                    if (crumbEl) {
                        crumbEl.innerHTML =
                            '<a href="#house">House</a>' +
                            '<span class="separator">&rsaquo;</span>' +
                            '<a href="#collections">Collections</a>' +
                            '<span class="separator">&rsaquo;</span>' +
                            '<a href="#collection/' + itemData.collectionId + '">' +
                                escapeHtml(colData.name || 'Collection') +
                            '</a>';
                    }

                    // Info card
                    renderCollectionItemInfoCard(infoCard, itemData, colData);
                    _renderBeneficiaryRow('ciGoesToRow', itemData, [
                        { entity: { id: itemData.collectionId, ...colData }, label: colData.name || 'Collection' }
                    ]);

                    // Location section
                    renderCollectionItemLocation(locationEl, itemData, id);

                    // Wire Edit button
                    var editBtn = document.getElementById('editCollectionItemBtn');
                    if (editBtn) {
                        var newEditBtn = editBtn.cloneNode(true);
                        editBtn.parentNode.replaceChild(newEditBtn, editBtn);
                        newEditBtn.addEventListener('click', function() {
                            openEditCollectionItemModal(id);
                        });
                    }

                    // Wire Delete button
                    var delBtn = document.getElementById('deleteCollectionItemBtn');
                    if (delBtn) {
                        var newDelBtn = delBtn.cloneNode(true);
                        delBtn.parentNode.replaceChild(newDelBtn, delBtn);
                        newDelBtn.addEventListener('click', function() {
                            handleCollectionItemDelete(id, itemData.collectionId);
                        });
                    }

                    // Wire Location Assign button
                    var locBtn = document.getElementById('collectionItemLocationBtn');
                    if (locBtn) {
                        var newLocBtn = locBtn.cloneNode(true);
                        locBtn.parentNode.replaceChild(newLocBtn, locBtn);
                        newLocBtn.addEventListener('click', function() {
                            openCollectionLocationModal(id);
                        });
                    }

                    // Someone who can only view a shared collection gets no add/edit/delete buttons
                    var canEdit = shCanEdit();
                    ['editCollectionItemBtn', 'deleteCollectionItemBtn', 'collectionItemCameraBtn', 'collectionItemGalleryBtn'].forEach(function(bid) {
                        var b = document.getElementById(bid);
                        if (b) b.style.display = canEdit ? '' : 'none';
                    });
                    var pasteBtn = document.querySelector('#page-collectionitem .paste-photo-btn');
                    if (pasteBtn) pasteBtn.style.display = canEdit ? '' : 'none';
                    // Locations point at the owner's private rooms, so only the owner can set them
                    var locBtn2 = document.getElementById('collectionItemLocationBtn');
                    if (locBtn2) locBtn2.style.display = shIsOwner() ? '' : 'none';

                    // Load photos
                    loadPhotos('collectionitem', id, 'collectionItemPhotoContainer', 'collectionItemPhotoEmpty');
                });
        })
        .catch(function(err) {
            if (err !== 'not-found') {
                console.error('loadCollectionItemPage error:', err);
                infoCard.innerHTML = '<p class="empty-state">Error loading item.</p>';
            }
        });
}

/**
 * Render the info card for the collection item.
 */
function renderCollectionItemInfoCard(infoCard, itemData, colData) {
    var collType = colData.type || '';
    var typeData  = itemData.typeData || {};
    var rows      = [];

    // Type-specific rows
    if (collType === 'Comics') {
        if (typeData.series)      rows.push(['Series',    escapeHtml(typeData.series)]);
        if (typeData.issueNumber) rows.push(['Issue #',   escapeHtml(String(typeData.issueNumber))]);
        if (typeData.publisher)   rows.push(['Publisher', escapeHtml(typeData.publisher)]);
        if (typeData.year)        rows.push(['Year',      escapeHtml(String(typeData.year))]);
    } else if (collType === 'Records/Albums') {
        if (typeData.artist) rows.push(['Artist', escapeHtml(typeData.artist)]);
        if (typeData.label)  rows.push(['Label',  escapeHtml(typeData.label)]);
        if (typeData.format) rows.push(['Format', escapeHtml(typeData.format)]);
        if (typeData.year)   rows.push(['Year',   escapeHtml(String(typeData.year))]);
    } else if (collType === 'Beanie Babies') {
        if (typeData.style)             rows.push(['Style',    escapeHtml(typeData.style)]);
        if (typeData.year)              rows.push(['Year',     escapeHtml(String(typeData.year))]);
        rows.push(['Has Tags', typeData.hasTags ? 'Yes' : 'No']);
    } else if (collType === 'Ceramic Stadiums') {
        if (typeData.team) rows.push(['Team', escapeHtml(typeData.team)]);
        if (typeData.year) rows.push(['Year', escapeHtml(String(typeData.year))]);
    } else if (collType === 'Books & Magazines') {
        if (typeData.type)      rows.push(['Type',       escapeHtml(typeData.type)]);
        if (typeData.author)    rows.push(['Author',     escapeHtml(typeData.author)]);
        if (typeData.publisher) rows.push(['Publisher',  escapeHtml(typeData.publisher)]);
        if (typeData.year)      rows.push(['Year',       escapeHtml(String(typeData.year))]);
        if (typeData.isbn)      rows.push(['ISBN',       escapeHtml(typeData.isbn)]);
        if (typeData.issueDate) rows.push(['Issue Date', escapeHtml(typeData.issueDate)]);
    } else if (collType === 'Generic') {
        var l1 = colData.label1 || 'Label 1';
        var l2 = colData.label2 || 'Label 2';
        var l3 = colData.label3 || 'Label 3';
        rows.push([escapeHtml(l1), escapeHtml(typeData.value1 || '—')]);
        rows.push([escapeHtml(l2), escapeHtml(typeData.value2 || '—')]);
        rows.push([escapeHtml(l3), escapeHtml(typeData.value3 || '—')]);
    }

    // Base fields
    if (itemData.acquiredDate) rows.push(['Acquired', escapeHtml(itemData.acquiredDate)]);
    if (itemData.pricePaid != null && itemData.pricePaid !== '') {
        rows.push(['Price Paid', '$' + parseFloat(itemData.pricePaid).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })]);
    }
    if (itemData.estimatedValue != null && itemData.estimatedValue !== '') {
        rows.push(['Est. Value', '$' + parseFloat(itemData.estimatedValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })]);
    }
    if (itemData.notes) rows.push(['Notes', escapeHtml(itemData.notes)]);

    // Type badge row
    rows.unshift(['Type', escapeHtml(collType)]);

    var html = '<table class="collection-info-table">';
    rows.forEach(function(row) {
        html += '<tr><td class="ci-label">' + row[0] + '</td><td class="ci-value">' + row[1] + '</td></tr>';
    });
    html += '</table>';
    infoCard.innerHTML = html;
}

/**
 * Delete a collection item, confirm first, then navigate to the parent collection.
 */
function handleCollectionItemDelete(itemId, collectionId) {
    if (!confirm('Delete this item? This cannot be undone.')) return;

    collCol('collectionItems').doc(itemId).delete()
        .then(function() {
            window.currentCollectionItem = null;
            window.location.hash = '#collection/' + collectionId;
        })
        .catch(function(err) {
            console.error('Delete collection item error:', err);
            alert('Error deleting item. Please try again.');
        });
}

// ============================================================
// LOCATION SECTION ON ITEM DETAIL PAGE
// ============================================================

/**
 * Render the location display for the item (shows room/thing/garage name).
 * @param {Element} container — element to render into
 * @param {object}  itemData  — collection item data
 * @param {string}  itemId    — item doc ID
 */
function renderCollectionItemLocation(container, itemData, itemId) {
    if (!container) return;

    var locRef = itemData.locationRef;
    if (!locRef || !locRef.locType || !locRef.locId) {
        container.innerHTML = '<p class="empty-state" style="margin:0 0 8px;">No location assigned.</p>';
        return;
    }

    // Fetch the name from the appropriate collection
    var colName;
    if (locRef.locType === 'houseroom') {
        colName = 'rooms';
    } else if (locRef.locType === 'housething') {
        colName = 'things';
    } else if (locRef.locType === 'garageroom') {
        colName = 'garageRooms';
    } else {
        container.innerHTML = '<p>Unknown location type.</p>';
        return;
    }

    userCol(colName).doc(locRef.locId).get()
        .then(function(doc) {
            var locName = doc.exists ? (doc.data().name || 'Unknown')
                        : (window.currentShareId && !shIsOwner() ? 'Private location' : 'Not found');
            var typeLabel = locRef.locType === 'houseroom' ? 'House Room'
                         : locRef.locType === 'housething' ? 'House Thing'
                         : 'Garage Room';

            container.innerHTML =
                '<div class="collection-location-display">' +
                    '<span class="collection-location-type">' + typeLabel + '</span>' +
                    '<span class="collection-location-name">' + escapeHtml(locName) + '</span>' +
                    '<button class="btn btn-secondary btn-small" id="clearCollectionLocationBtn">Clear</button>' +
                '</div>';

            document.getElementById('clearCollectionLocationBtn')
                .addEventListener('click', function() {
                    clearCollectionLocation(itemId);
                });
        })
        .catch(function(err) {
            console.error('renderCollectionItemLocation error:', err);
            container.innerHTML = '<p class="empty-state">Error loading location.</p>';
        });
}

/**
 * Clear the location assignment from a collection item.
 */
function clearCollectionLocation(itemId) {
    collCol('collectionItems').doc(itemId).update({ locationRef: null })
        .then(function() {
            if (window.currentCollectionItem) {
                window.currentCollectionItem.locationRef = null;
            }
            var container = document.getElementById('collectionItemLocationDisplay');
            if (container) {
                container.innerHTML = '<p class="empty-state" style="margin:0 0 8px;">No location assigned.</p>';
            }
        })
        .catch(function(err) {
            console.error('clearCollectionLocation error:', err);
        });
}

// ============================================================
// LOCATION ASSIGNMENT MODAL
// ============================================================

/**
 * Open the collection location picker modal.
 * Loads House Rooms, House Things, and Garage Rooms into groups.
 * @param {string} itemId — collection item document ID
 */
function openCollectionLocationModal(itemId) {
    var modal  = document.getElementById('collectionLocationModal');
    var listEl = document.getElementById('collectionLocationList');

    if (!modal || !listEl) return;

    modal.dataset.itemId = itemId;
    listEl.innerHTML = '<p class="empty-state">Loading…</p>';

    // Wire Assign and Clear buttons (clone to remove stale listeners)
    var assignBtn = document.getElementById('collectionLocationAssignBtn');
    var cancelBtn = document.getElementById('collectionLocationCancelBtn');
    var clearBtn  = document.getElementById('collectionLocationClearBtn');

    [assignBtn, cancelBtn, clearBtn].forEach(function(btn) {
        if (!btn) return;
        var clone = btn.cloneNode(true);
        btn.parentNode.replaceChild(clone, btn);
    });

    document.getElementById('collectionLocationCancelBtn')
        .addEventListener('click', function() { closeModal('collectionLocationModal'); });

    document.getElementById('collectionLocationClearBtn')
        .addEventListener('click', function() {
            closeModal('collectionLocationModal');
            clearCollectionLocation(itemId);
        });

    document.getElementById('collectionLocationAssignBtn')
        .addEventListener('click', function() {
            var selected = listEl.querySelector('.location-item-row.selected');
            if (!selected) { alert('Please select a location.'); return; }

            var locType = selected.dataset.locType;
            var locId   = selected.dataset.locId;

            collCol('collectionItems').doc(itemId).update({
                locationRef: { locType: locType, locId: locId }
            })
            .then(function() {
                closeModal('collectionLocationModal');
                // Refresh location display
                if (window.currentCollectionItem) {
                    window.currentCollectionItem.locationRef = { locType: locType, locId: locId };
                    var container = document.getElementById('collectionItemLocationDisplay');
                    renderCollectionItemLocation(container, window.currentCollectionItem, itemId);
                }
            })
            .catch(function(err) { console.error('Assign location error:', err); });
        });

    // Load all three groups
    Promise.all([
        userCol('rooms').orderBy('name').get(),
        userCol('things').orderBy('name').get(),
        userCol('garageRooms').orderBy('order').get()
    ])
    .then(function(results) {
        listEl.innerHTML = '';
        var roomSnap    = results[0];
        var thingSnap   = results[1];
        var garageSnap  = results[2];

        function buildGroup(label, snap, locType) {
            if (snap.empty) return;
            var header = document.createElement('div');
            header.className = 'location-group-header';
            header.textContent = label;
            listEl.appendChild(header);

            snap.forEach(function(doc) {
                var row = document.createElement('div');
                row.className      = 'location-item-row';
                row.dataset.locType = locType;
                row.dataset.locId   = doc.id;
                row.textContent    = doc.data().name || 'Unnamed';

                row.addEventListener('click', function() {
                    listEl.querySelectorAll('.location-item-row').forEach(function(r) {
                        r.classList.remove('selected');
                    });
                    row.classList.add('selected');
                });

                listEl.appendChild(row);
            });
        }

        buildGroup('House Rooms', roomSnap, 'houseroom');
        buildGroup('House Things', thingSnap, 'housething');
        buildGroup('Garage', garageSnap, 'garageroom');

        if (listEl.children.length === 0) {
            listEl.innerHTML = '<p class="empty-state">No locations available.</p>';
        }
    })
    .catch(function(err) {
        console.error('openCollectionLocationModal error:', err);
        listEl.innerHTML = '<p class="empty-state">Error loading locations.</p>';
    });

    openModal('collectionLocationModal');
}

// ============================================================
// DOM READY — Wire up modal buttons
// ============================================================

document.addEventListener('DOMContentLoaded', function() {

    // ---- Collection modal buttons ----
    var collectionTypeSelect = document.getElementById('collectionTypeSelect');
    if (collectionTypeSelect) {
        collectionTypeSelect.addEventListener('change', toggleGenericLabels);
    }

    var collectionModalSaveBtn = document.getElementById('collectionModalSaveBtn');
    if (collectionModalSaveBtn) {
        collectionModalSaveBtn.addEventListener('click', handleCollectionModalSave);
    }

    var collectionModalCancelBtn = document.getElementById('collectionModalCancelBtn');
    if (collectionModalCancelBtn) {
        collectionModalCancelBtn.addEventListener('click', function() {
            closeModal('collectionModal');
        });
    }

    var collectionDeleteBtn = document.getElementById('collectionDeleteBtn');
    if (collectionDeleteBtn) {
        collectionDeleteBtn.addEventListener('click', handleCollectionDelete);
    }

    // ---- Collection item modal buttons ----
    var collectionItemModalSaveBtn = document.getElementById('collectionItemModalSaveBtn');
    if (collectionItemModalSaveBtn) {
        collectionItemModalSaveBtn.addEventListener('click', handleCollectionItemModalSave);
    }

    var collectionItemModalCancelBtn = document.getElementById('collectionItemModalCancelBtn');
    if (collectionItemModalCancelBtn) {
        collectionItemModalCancelBtn.addEventListener('click', function() {
            closeModal('collectionItemModal');
        });
    }

    // ---- Photo buttons on item detail page ----
    var cameraBtn = document.getElementById('collectionItemCameraBtn');
    if (cameraBtn) {
        cameraBtn.addEventListener('click', function() {
            if (window.currentCollectionItem) {
                triggerCameraUpload('collectionitem', window.currentCollectionItem.id);
            }
        });
    }

    var galleryBtn = document.getElementById('collectionItemGalleryBtn');
    if (galleryBtn) {
        galleryBtn.addEventListener('click', function() {
            if (window.currentCollectionItem) {
                triggerGalleryUpload('collectionitem', window.currentCollectionItem.id);
            }
        });
    }

    // ---- Collection +Photo camera input ----
    var collCamInput = document.getElementById('collectionCamInput');
    if (collCamInput) {
        collCamInput.addEventListener('change', function() {
            if (this.files && this.files.length > 0) {
                collectionHandleFromPicture(Array.from(this.files));
            }
        });
    }

    // ---- From-pic result modal buttons ----
    var collPicDoneBtn = document.getElementById('collPicResultDoneBtn');
    if (collPicDoneBtn) {
        collPicDoneBtn.addEventListener('click', function() {
            closeModal('collectionFromPicResultModal');
            _collPicContext = null;
        });
    }

    var collPicAnotherBtn = document.getElementById('collPicResultAnotherBtn');
    if (collPicAnotherBtn) {
        collPicAnotherBtn.addEventListener('click', function() {
            closeModal('collectionFromPicResultModal');
            if (!_collPicContext) return;
            var ctx = _collPicContext; // keep context
            openLlmPhotoStaging('Add ' + (ctx.collType || 'Collection') + ' Photo', function(images) {
                collectionSendToLlm(images);
            });
        });
    }
});

// ============================================================
// COLLECTION FROM PICTURE  — LLM Quick-Add
// ============================================================

/** Context for the active +Photo session (set when user clicks +Photo). */
var _collPicContext = null;

/**
 * Check Firestore for LLM config; show/hide the +Photo button accordingly.
 */
async function collectionCheckLlmForPhotoBtn() {
    try {
        var doc = await userCol('settings').doc('llm').get();
        var ok  = doc.exists && doc.data().provider && doc.data().apiKey;
        var btn = document.getElementById('collectionFromPicBtn');
        if (btn) btn.classList.toggle('hidden', !ok || !shCanEdit());
    } catch (e) { /* leave hidden */ }
}

/**
 * Returns the LLM prompt string for the given collection type.
 */
function getCollectionIdPrompt(collType) {
    var base = [
        'Return ONLY a valid JSON object. No explanation, no markdown, no code blocks.',
        'Your entire response must be parseable by JSON.parse().',
        'If a field cannot be determined from the image, return "" for that field.',
        ''
    ];

    if (collType === 'Comics') {
        return base.concat([
            'You are a comic book identification assistant. Analyze the comic cover image.',
            'Return this exact JSON:',
            '{ "name": "", "series": "", "issueNumber": "", "publisher": "", "year": "", "estimatedValue": "", "additionalMessage": "" }',
            '',
            '- name: series + issue combined, e.g. "Amazing Spider-Man #223"',
            '- series: the comic series name, e.g. "Amazing Spider-Man"',
            '- issueNumber: the issue number as a string, e.g. "223"',
            '- publisher: e.g. "Marvel", "DC", or "" if unknown',
            '- year: 4-digit publication year string, or "" if unknown',
            '- estimatedValue: estimated collector value as a number string e.g. "12.50", or "" if unknown',
            '- additionalMessage: note any issues (unclear image, etc). Leave "" if none.'
        ]).join('\n');
    }

    if (collType === 'Records/Albums') {
        return base.concat([
            'You are a music record identification assistant. Analyze the record or album cover.',
            'Return this exact JSON:',
            '{ "name": "", "artist": "", "label": "", "format": "", "year": "", "estimatedValue": "", "additionalMessage": "" }',
            '',
            '- name: the album or record title',
            '- artist: the performing artist or band',
            '- label: the record label, or "" if unknown',
            '- format: one of exactly: "LP", "45", "Cassette", "CD", "8-Track", or "" if unknown',
            '- year: 4-digit release year string, or "" if unknown',
            '- estimatedValue: estimated collector value as a number string, or "" if unknown',
            '- additionalMessage: note any issues. Leave "" if none.'
        ]).join('\n');
    }

    if (collType === 'Hat Pins') {
        return base.concat([
            'You are a hat pin collectible identification assistant. Analyze the pin image.',
            'Return this exact JSON:',
            '{ "name": "", "notes": "", "estimatedValue": "", "additionalMessage": "" }',
            '',
            '- name: descriptive name of what the pin depicts, e.g. "US Navy Eagle Pin"',
            '- notes: brief description of the pin, under 100 characters',
            '- estimatedValue: estimated collector value as a number string, or "" if unknown',
            '- additionalMessage: note any issues. Leave "" if none.'
        ]).join('\n');
    }

    if (collType === 'Beanie Babies') {
        return base.concat([
            'You are a Beanie Baby collectible identification assistant. Analyze the image.',
            'Return this exact JSON:',
            '{ "name": "", "style": "", "year": "", "hasTags": "", "estimatedValue": "", "additionalMessage": "" }',
            '',
            '- name: the Beanie Baby\'s official name, e.g. "Peanut the Elephant"',
            '- style: the animal or character type, e.g. "Elephant", "Bear"',
            '- year: birth year from the tag as a string, or "" if unknown',
            '- hasTags: "yes" if you can see a hang tag or tush tag, "no" if clearly absent, "" if unclear',
            '- estimatedValue: estimated collector value as a number string, or "" if unknown',
            '- additionalMessage: note any issues. Leave "" if none.'
        ]).join('\n');
    }

    if (collType === 'Ceramic Stadiums') {
        return base.concat([
            'You are a ceramic baseball stadium collectible identification assistant. Analyze the image.',
            'Return this exact JSON:',
            '{ "name": "", "team": "", "estimatedValue": "", "additionalMessage": "" }',
            '',
            '- name: the stadium name, e.g. "Fenway Park", "Wrigley Field"',
            '- team: the MLB team, e.g. "Boston Red Sox", or "" if not determinable',
            '- estimatedValue: estimated collector value as a number string, or "" if unknown',
            '- additionalMessage: note any issues. Leave "" if none.'
        ]).join('\n');
    }

    if (collType === 'Books & Magazines') {
        return base.concat([
            'You are a book and magazine identification assistant. Analyze the cover image.',
            'Return this exact JSON:',
            '{ "name": "", "type": "", "author": "", "publisher": "", "year": "", "isbn": "", "issueDate": "", "estimatedValue": "", "additionalMessage": "" }',
            '',
            '- name: the full title of the book or magazine',
            '- type: exactly "Book" or "Magazine" based on what is shown',
            '- author: the author(s) for books; the primary featured person or topic for magazines; "" if unclear',
            '- publisher: the publishing house or magazine publisher, or "" if unknown',
            '- year: 4-digit publication year string, or "" if unknown',
            '- isbn: the ISBN (10 or 13 digit) if you can determine it from your knowledge of this specific edition; leave "" if not confident — do not guess',
            '- issueDate: for magazines only, the cover date string e.g. "March 1987" or "Vol. 12 No. 4"; leave "" for books',
            '- estimatedValue: estimated collector or used value as a number string e.g. "8.50", or "" if unknown',
            '- additionalMessage: note any issues (unclear image, multiple editions, etc). Leave "" if none.'
        ]).join('\n');
    }

    // Generic (default)
    return base.concat([
        'You are a collectible item identification assistant. Analyze the image.',
        'Return this exact JSON:',
        '{ "name": "", "notes": "", "estimatedValue": "", "additionalMessage": "" }',
        '',
        '- name: a clear descriptive name for this item',
        '- notes: a brief description of the item, under 150 characters',
        '- estimatedValue: estimated value in USD as a number string, or "" if unknown',
        '- additionalMessage: note any issues. Leave "" if none.'
    ]).join('\n');
}

/**
 * Legacy handler: compress a single photo file from the camera input, then send to LLM.
 * The +Photo button now opens the staging flow instead; this handles any legacy path.
 */
async function collectionHandleFromPicture(files) {
    if (!files || files.length === 0) return;
    if (!_collPicContext) return;

    try {
        var images = [];
        images.push(await compressImage(files[0]));
        await collectionSendToLlm(images);
    } catch (err) {
        console.error('Collection pic error:', err);
    } finally {
        var camInput = document.getElementById('collectionCamInput');
        if (camInput) camInput.value = '';
    }
}

/**
 * Send already-compressed base64 images to the LLM for collection item identification.
 * Called from both the legacy camera path and the staging (+Photo) flow.
 * Requires _collPicContext to be set before calling.
 * @param {string[]} images - Array of base64 data URL strings (already compressed)
 */
async function collectionSendToLlm(images) {
    if (!_collPicContext) return;

    var collectionId = _collPicContext.collectionId;
    var collType     = _collPicContext.collType;

    var titleEl    = document.getElementById('collPicResultTitle');
    var bodyEl     = document.getElementById('collPicResultBody');
    var anotherBtn = document.getElementById('collPicResultAnotherBtn');
    var doneBtn    = document.getElementById('collPicResultDoneBtn');

    if (titleEl) { titleEl.textContent = 'Identifying\u2026'; titleEl.style.color = ''; }
    if (bodyEl)  bodyEl.innerHTML = '<p class="empty-state">Please wait\u2026</p>';
    if (anotherBtn) anotherBtn.disabled = true;
    if (doneBtn)    doneBtn.disabled    = true;
    openModal('collectionFromPicResultModal');

    try {
        // Load LLM config
        var cfgDoc = await userCol('settings').doc('llm').get();
        var cfg    = cfgDoc.exists ? cfgDoc.data() : null;
        if (!cfg || !cfg.provider || !cfg.apiKey) {
            if (titleEl) { titleEl.textContent = 'Not Configured'; titleEl.style.color = '#c62828'; }
            if (bodyEl)  bodyEl.innerHTML = '<p>LLM not configured. Go to Settings.</p>';
            return;
        }
        var llm = LLM_PROVIDERS[cfg.provider];
        if (!llm) {
            if (titleEl) { titleEl.textContent = 'Error'; titleEl.style.color = '#c62828'; }
            if (bodyEl)  bodyEl.innerHTML = '<p>Unknown LLM provider.</p>';
            return;
        }

        // Build content: prompt + already-compressed images
        var prompt  = getCollectionIdPrompt(collType);
        var content = [{ type: 'text', text: prompt }];
        images.forEach(function(url) {
            content.push({ type: 'image_url', image_url: { url: url } });
        });

        var activeModel  = cfg.model || llm.model;
        var responseText = await chatCallOpenAICompat(llm, cfg.apiKey, content, activeModel);
        var parsed       = collectionParseLlmResponse(responseText);
        var identified   = !!(parsed.name && parsed.name.trim());

        if (identified) {
            await collectionAutoSaveFromLlm(parsed, images, collectionId, collType);
        }

        collectionShowResultModal(parsed, collType, identified);

        // Refresh item list in background AFTER modal is shown, so the re-render
        // doesn't race with collectionShowResultModal updating the modal DOM.
        if (identified && window.currentCollection && window.currentCollection.id === collectionId) {
            setTimeout(function() { loadCollectionPage(collectionId); }, 100);
        }

    } catch (err) {
        console.error('Collection pic error:', err);
        if (titleEl) { titleEl.textContent = 'Error'; titleEl.style.color = '#c62828'; }
        if (bodyEl)  bodyEl.innerHTML = '<p>Error: ' + escapeHtml(err.message || String(err)) + '</p>';
    } finally {
        if (anotherBtn) anotherBtn.disabled = false;
        if (doneBtn)    doneBtn.disabled    = false;
        var camInput = document.getElementById('collectionCamInput');
        if (camInput) camInput.value = '';
    }
}

/**
 * Parse the LLM's JSON response, stripping any markdown fences.
 */
function collectionParseLlmResponse(text) {
    try {
        var clean = text.trim()
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i,     '')
            .replace(/```\s*$/i,     '');
        return JSON.parse(clean);
    } catch (e) {
        return { name: '', additionalMessage: 'Could not parse LLM response.' };
    }
}

/**
 * Save a collection item built from LLM-parsed data, including its photo.
 */
async function collectionAutoSaveFromLlm(parsed, images, collectionId, collType) {
    var name           = (parsed.name           || '').trim();
    var notes          = (parsed.notes          || '').trim();
    var estimatedValue = parsed.estimatedValue ? parseFloat(parsed.estimatedValue) : null;
    if (isNaN(estimatedValue)) estimatedValue = null;

    var typeData = {};

    if (collType === 'Comics') {
        typeData = {
            series:      (parsed.series      || '').trim(),
            issueNumber: (parsed.issueNumber || '').trim(),
            publisher:   (parsed.publisher   || '').trim(),
            year:        String(parsed.year  || '').trim()
        };
        // Build name from series + issue if LLM didn't provide it
        if (!name && typeData.series) {
            name = typeData.series + (typeData.issueNumber ? ' #' + typeData.issueNumber : '');
        }
    } else if (collType === 'Records/Albums') {
        typeData = {
            artist: (parsed.artist || '').trim(),
            label:  (parsed.label  || '').trim(),
            format: (parsed.format || '').trim(),
            year:   String(parsed.year || '').trim()
        };
    } else if (collType === 'Beanie Babies') {
        typeData = {
            style:   (parsed.style || '').trim(),
            year:    String(parsed.year || '').trim(),
            hasTags: (parsed.hasTags === 'yes' || parsed.hasTags === true)
        };
    } else if (collType === 'Ceramic Stadiums') {
        typeData = {
            team: (parsed.team || '').trim(),
            year: ''
        };
    } else if (collType === 'Books & Magazines') {
        typeData = {
            type:      (parsed.type      || '').trim(),
            author:    (parsed.author    || '').trim(),
            publisher: (parsed.publisher || '').trim(),
            year:      String(parsed.year || '').trim(),
            isbn:      (parsed.isbn      || '').trim(),
            issueDate: (parsed.issueDate || '').trim()
        };
    }
    // Hat Pins and Generic: typeData stays {}

    var docRef = await collCol('collectionItems').add(shMaybeStamp({
        collectionId:   collectionId,
        name:           name || 'Unknown Item',
        typeData:       typeData,
        acquiredDate:   '',
        pricePaid:      null,
        estimatedValue: estimatedValue,
        notes:          notes,
        locationRef:    null,
        createdAt:      firebase.firestore.FieldValue.serverTimestamp()
    }, true));

    // Save the photos
    for (var i = 0; i < images.length; i++) {
        await collCol('photos').add(shMaybeStamp({
            targetType: 'collectionitem',
            targetId:   docRef.id,
            imageData:  images[i],
            caption:    '',
            createdAt:  firebase.firestore.FieldValue.serverTimestamp()
        }, true));
    }

    // Auto-set thumbnail from the first photo
    if (images.length > 0 && typeof _compressToThumb === 'function') {
        try {
            var thumbData = await _compressToThumb(images[0]);
            await collCol('collectionItems').doc(docRef.id).update({ profilePhotoData: thumbData });
        } catch (thumbErr) {
            console.warn('Could not auto-set collection item thumbnail:', thumbErr);
        }
    }

    return docRef.id;
}

/**
 * Populate the result modal with identified (or failed) info.
 */
function collectionShowResultModal(parsed, collType, identified) {
    var titleEl = document.getElementById('collPicResultTitle');
    var bodyEl  = document.getElementById('collPicResultBody');
    if (!titleEl || !bodyEl) return;

    if (identified) {
        titleEl.textContent = '\u2713 Saved!';
        titleEl.style.color = '#2e7d32';
    } else {
        titleEl.textContent = '\u26a0 Could Not Identify';
        titleEl.style.color = '#e65100';
    }

    var rows = [];
    if (parsed.name) rows.push(['Name', parsed.name]);

    if (collType === 'Comics') {
        if (parsed.series)      rows.push(['Series',    parsed.series]);
        if (parsed.issueNumber) rows.push(['Issue #',   String(parsed.issueNumber)]);
        if (parsed.publisher)   rows.push(['Publisher', parsed.publisher]);
        if (parsed.year)        rows.push(['Year',      String(parsed.year)]);
    } else if (collType === 'Records/Albums') {
        if (parsed.artist)  rows.push(['Artist',  parsed.artist]);
        if (parsed.format)  rows.push(['Format',  parsed.format]);
        if (parsed.label)   rows.push(['Label',   parsed.label]);
        if (parsed.year)    rows.push(['Year',    String(parsed.year)]);
    } else if (collType === 'Beanie Babies') {
        if (parsed.style)   rows.push(['Style',    parsed.style]);
        if (parsed.year)    rows.push(['Year',     String(parsed.year)]);
        if (parsed.hasTags) rows.push(['Has Tags', parsed.hasTags]);
    } else if (collType === 'Ceramic Stadiums') {
        if (parsed.team) rows.push(['Team', parsed.team]);
    } else if (collType === 'Books & Magazines') {
        if (parsed.type)      rows.push(['Type',       parsed.type]);
        if (parsed.author)    rows.push(['Author',     parsed.author]);
        if (parsed.publisher) rows.push(['Publisher',  parsed.publisher]);
        if (parsed.year)      rows.push(['Year',       String(parsed.year)]);
        if (parsed.isbn)      rows.push(['ISBN',       parsed.isbn]);
        if (parsed.issueDate) rows.push(['Issue Date', parsed.issueDate]);
    } else {
        // Hat Pins and Generic
        if (parsed.notes) rows.push(['Notes', parsed.notes]);
    }

    if (parsed.estimatedValue) rows.push(['Est. Value', '$' + parsed.estimatedValue]);
    if (parsed.additionalMessage) rows.push(['Note', parsed.additionalMessage]);

    if (rows.length > 0) {
        var html = '<table style="width:100%;border-collapse:collapse;">';
        rows.forEach(function(r) {
            html += '<tr>' +
                '<td style="font-weight:600;padding:4px 8px 4px 0;white-space:nowrap;vertical-align:top;color:#555;">' + escapeHtml(r[0]) + '</td>' +
                '<td style="padding:4px 0;vertical-align:top;">' + escapeHtml(r[1]) + '</td>' +
                '</tr>';
        });
        html += '</table>';
        bodyEl.innerHTML = html;
    } else {
        bodyEl.innerHTML = '<p class="empty-state">No information could be determined from the image.</p>';
    }
}
