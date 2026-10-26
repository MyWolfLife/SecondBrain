/**
 * beneficiaries.js — "Who gets what" beneficiary assignment
 *
 * Shared helper _renderBeneficiaryRow() is used by house.js, garage.js,
 * structures.js, and collections.js to show the effective beneficiary
 * (own assignment or inherited from a parent entity) on detail pages.
 *
 * loadBeneficiariesPage() drives the #beneficiaries summary page where
 * the user picks a contact (or "All People") and sees everything assigned
 * to them, with a toggle to show/hide inherited items and a print button.
 */

// ============================================================
// SHARED HELPER — used by all entity detail pages
// ============================================================

/**
 * Resolve and render the effective beneficiary for an entity.
 * Shows the entity's own beneficiary, or the nearest parent's if unset.
 *
 * @param {string} rowId   — ID of the <div> to populate
 * @param {object} entity  — Firestore doc data (may have beneficiaryContactId)
 * @param {Array}  parents — [{entity, label}, ...] nearest parent first
 */
function _renderBeneficiaryRow(rowId, entity, parents) {
    var row = document.getElementById(rowId);
    if (!row) return;

    var effective = null;
    if (entity.beneficiaryContactId) {
        effective = { id: entity.beneficiaryContactId, inheritedFrom: null };
    } else {
        for (var i = 0; i < (parents || []).length; i++) {
            var p = parents[i];
            if (p.entity && p.entity.beneficiaryContactId) {
                effective = { id: p.entity.beneficiaryContactId, inheritedFrom: p.label };
                break;
            }
        }
    }

    if (!effective) {
        row.classList.add('hidden');
        row.innerHTML = '';
        return;
    }

    row.classList.remove('hidden');
    row.innerHTML = '<span class="bene-label">Goes to:</span> <span class="bene-loading">\u2026</span>';

    userCol('people').doc(effective.id).get()
        .then(function(doc) {
            var name = doc.exists ? (doc.data().name || '?') : '?';
            row.innerHTML =
                '<span class="bene-label">Goes to:</span> ' +
                '<a href="#contact/' + escapeHtml(effective.id) + '" class="bene-name">' + escapeHtml(name) + '</a>' +
                (effective.inheritedFrom
                    ? ' <span class="bene-inherited">(inherited from ' + escapeHtml(effective.inheritedFrom) + ')</span>'
                    : '');
        })
        .catch(function() { row.classList.add('hidden'); });
}

// ============================================================
// BENEFICIARIES SUMMARY PAGE  (#beneficiaries)
// ============================================================

var _beneCache = null; // { mode: 'person'|'all', groups: [...], label: string }

function loadBeneficiariesPage() {
    var resultEl = document.getElementById('beneResults');
    var noSelEl  = document.getElementById('beneNoSelection');
    var selectEl = document.getElementById('benePersonSelect');
    var toggleEl = document.getElementById('beneShowInherited');
    var printBtn = document.getElementById('benePrintBtn');
    if (!resultEl || !selectEl) return;

    _beneCache = null;
    resultEl.innerHTML = '';
    if (noSelEl) noSelEl.classList.remove('hidden');

    if (toggleEl) {
        toggleEl.checked = false;
        toggleEl.onchange = function() { if (_beneCache) _beneRenderFromCache(); };
    }
    if (printBtn) {
        printBtn.onclick = function() { window.print(); };
    }

    selectEl.innerHTML = '<option value="">Loading\u2026</option>';
    selectEl.onchange = null;

    // Query all 9 collections for direct beneficiary assignments, collect unique contact IDs
    Promise.all([
        userCol('things').get(),
        userCol('subThings').get(),
        userCol('subThingItems').get(),
        userCol('garageThings').get(),
        userCol('garageSubThings').get(),
        userCol('structureThings').get(),
        userCol('structureSubThings').get(),
        shPrivateAndOwnedSnap('collections'),
        shPrivateAndOwnedSnap('collectionItems')
    ]).then(function(snaps) {
        var contactIds = {};
        snaps.forEach(function(snap) {
            snap.forEach(function(doc) {
                var cid = doc.data().beneficiaryContactId;
                if (cid) contactIds[cid] = true;
            });
        });

        var ids = Object.keys(contactIds);
        if (!ids.length) {
            selectEl.innerHTML = '<option value="">No assignments yet</option>';
            return;
        }

        return Promise.all(ids.map(function(id) {
            return userCol('people').doc(id).get().then(function(doc) {
                return { id: id, name: doc.exists ? (doc.data().name || '?') : '?' };
            });
        })).then(function(people) {
            people.sort(function(a, b) { return a.name.localeCompare(b.name); });

            var opts = '<option value="">— Pick a person —</option>';
            opts += '<option value="__ALL__">— All People —</option>';
            people.forEach(function(p) {
                opts += '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + '</option>';
            });
            selectEl.innerHTML = opts;

            selectEl.onchange = function() {
                var val = selectEl.value;
                var label = val ? selectEl.options[selectEl.selectedIndex].text : '';
                resultEl.innerHTML = '';
                _beneCache = null;
                if (!val) {
                    if (noSelEl) noSelEl.classList.remove('hidden');
                    return;
                }
                if (noSelEl) noSelEl.classList.add('hidden');
                if (val === '__ALL__') {
                    _loadAllBeneficiaryResults();
                } else {
                    _loadBeneficiaryResults(val, label);
                }
            };
        });
    }).catch(function(err) {
        console.error('loadBeneficiariesPage error:', err);
        selectEl.innerHTML = '<option value="">Error loading</option>';
    });
}

// Render cached groups, respecting the show-inherited toggle
function _beneRenderFromCache() {
    var resultEl = document.getElementById('beneResults');
    var toggleEl = document.getElementById('beneShowInherited');
    if (!resultEl || !_beneCache) return;

    var showInherited = toggleEl ? toggleEl.checked : false;

    var filtered = _beneCache.groups.map(function(g) {
        return {
            title: g.title,
            items: showInherited ? g.items : g.items.filter(function(i) { return !i.inherited; })
        };
    }).filter(function(g) { return g.items.length > 0; });

    if (!filtered.length) {
        var msg = _beneCache.mode === 'all'
            ? 'No direct assignments found.'
            : 'Nothing assigned directly to ' + escapeHtml(_beneCache.label) + '.' +
              (showInherited ? '' : ' Try enabling "Show inherited".');
        resultEl.innerHTML = '<p class="empty-state">' + msg + '</p>';
        return;
    }

    // Toggle all-mode class for page-break CSS
    resultEl.classList.toggle('bene-all-mode', _beneCache.mode === 'all');

    // Print header: single-person mode only (all-mode already has person names as group titles)
    var printHeader = _beneCache.mode === 'person'
        ? '<div class="bene-print-header">Items for: ' + escapeHtml(_beneCache.label) + '</div>'
        : '';

    var html = printHeader + filtered.map(function(group) {
        var itemsHtml = group.items.map(function(item) {
            return '<div class="bene-result-item">' +
                '<a href="' + escapeHtml(item.hash) + '" class="bene-item-name">' + escapeHtml(item.name) + '</a>' +
                (item.path ? '<span class="bene-item-path">\u00b7 ' + escapeHtml(item.path) + '</span>' : '') +
                (item.inherited
                    ? '<span class="badge badge-secondary bene-badge">inherited</span>'
                    : '<span class="badge badge-primary bene-badge">direct</span>') +
                '</div>';
        }).join('');
        return '<div class="bene-group">' +
            '<h3 class="bene-group-title">' + escapeHtml(group.title) +
            ' <span class="bene-group-count">(' + group.items.length + ')</span></h3>' +
            itemsHtml +
            '</div>';
    }).join('');

    resultEl.innerHTML = html;
}

// Load results for a single person
function _loadBeneficiaryResults(contactId, contactName) {
    var resultEl = document.getElementById('beneResults');
    if (!resultEl) return;
    resultEl.innerHTML = '<p class="empty-state">Loading\u2026</p>';

    Promise.all([
        userCol('things').get(),
        userCol('subThings').get(),
        userCol('subThingItems').get(),
        userCol('garageThings').get(),
        userCol('garageSubThings').get(),
        userCol('structureThings').get(),
        userCol('structureSubThings').get(),
        shPrivateAndOwnedSnap('collections'),
        shPrivateAndOwnedSnap('collectionItems')
    ]).then(function(snaps) {
        var things             = _beneDocsToMap(snaps[0]);
        var subThings          = _beneDocsToMap(snaps[1]);
        var subThingItems      = _beneDocsToMap(snaps[2]);
        var garageThings       = _beneDocsToMap(snaps[3]);
        var garageSubThings    = _beneDocsToMap(snaps[4]);
        var structureThings    = _beneDocsToMap(snaps[5]);
        var structureSubThings = _beneDocsToMap(snaps[6]);
        var collections        = _beneDocsToMap(snaps[7]);
        var collectionItems    = _beneDocsToMap(snaps[8]);

        var groups = [
            _beneHouseGroup(things, subThings, subThingItems, contactId),
            _beneGarageGroup(garageThings, garageSubThings, contactId),
            _beneStructureGroup(structureThings, structureSubThings, contactId),
            _beneCollectionsGroup(collections, collectionItems, contactId)
        ].filter(function(g) { return g.items.length > 0; });

        _beneCache = { mode: 'person', groups: groups, label: contactName };
        _beneRenderFromCache();
    }).catch(function(err) {
        console.error('_loadBeneficiaryResults error:', err);
        resultEl.innerHTML = '<p class="empty-state">Error loading data.</p>';
    });
}

// Load results for ALL people, grouped by person
function _loadAllBeneficiaryResults() {
    var resultEl = document.getElementById('beneResults');
    if (!resultEl) return;
    resultEl.innerHTML = '<p class="empty-state">Loading\u2026</p>';

    Promise.all([
        userCol('things').get(),
        userCol('subThings').get(),
        userCol('subThingItems').get(),
        userCol('garageThings').get(),
        userCol('garageSubThings').get(),
        userCol('structureThings').get(),
        userCol('structureSubThings').get(),
        shPrivateAndOwnedSnap('collections'),
        shPrivateAndOwnedSnap('collectionItems')
    ]).then(function(snaps) {
        var things             = _beneDocsToMap(snaps[0]);
        var subThings          = _beneDocsToMap(snaps[1]);
        var subThingItems      = _beneDocsToMap(snaps[2]);
        var garageThings       = _beneDocsToMap(snaps[3]);
        var garageSubThings    = _beneDocsToMap(snaps[4]);
        var structureThings    = _beneDocsToMap(snaps[5]);
        var structureSubThings = _beneDocsToMap(snaps[6]);
        var collections        = _beneDocsToMap(snaps[7]);
        var collectionItems    = _beneDocsToMap(snaps[8]);

        var byPerson = {}; // contactId → [items]
        function addItem(cid, item) {
            if (!byPerson[cid]) byPerson[cid] = [];
            byPerson[cid].push(item);
        }

        Object.values(things).forEach(function(t) {
            if (t.beneficiaryContactId)
                addItem(t.beneficiaryContactId, { name: t.name || 'Thing', path: 'House \u203a Thing', hash: '#thing/' + t.id, inherited: false });
        });

        Object.values(subThings).forEach(function(st) {
            var parent = things[st.thingId];
            if (st.beneficiaryContactId) {
                addItem(st.beneficiaryContactId, { name: st.name || 'Sub-item', path: 'House \u203a ' + (parent ? parent.name : 'Thing'), hash: '#subthing/' + st.id, inherited: false });
            } else if (parent && parent.beneficiaryContactId) {
                addItem(parent.beneficiaryContactId, { name: st.name || 'Sub-item', path: 'House \u203a ' + (parent.name || 'Thing'), hash: '#subthing/' + st.id, inherited: true });
            }
        });

        Object.values(subThingItems).forEach(function(item) {
            var pSt = subThings[item.subThingId];
            var pT  = pSt ? things[pSt.thingId] : null;
            var path = 'House \u203a ' + (pT ? pT.name + ' \u203a ' : '') + (pSt ? pSt.name : 'Sub-item');
            if (item.beneficiaryContactId) {
                addItem(item.beneficiaryContactId, { name: item.name || 'Item', path: path, hash: '#item/' + item.id, inherited: false });
            } else if (pSt && pSt.beneficiaryContactId) {
                addItem(pSt.beneficiaryContactId, { name: item.name || 'Item', path: path, hash: '#item/' + item.id, inherited: true });
            } else if (pT && pT.beneficiaryContactId) {
                addItem(pT.beneficiaryContactId, { name: item.name || 'Item', path: path, hash: '#item/' + item.id, inherited: true });
            }
        });

        Object.values(garageThings).forEach(function(t) {
            if (t.beneficiaryContactId)
                addItem(t.beneficiaryContactId, { name: t.name || 'Thing', path: 'Garage \u203a Thing', hash: '#garagething/' + t.id, inherited: false });
        });

        Object.values(garageSubThings).forEach(function(st) {
            var parent = garageThings[st.thingId];
            if (st.beneficiaryContactId) {
                addItem(st.beneficiaryContactId, { name: st.name || 'Sub-item', path: 'Garage \u203a ' + (parent ? parent.name : 'Thing'), hash: '#garagesubthing/' + st.id, inherited: false });
            } else if (parent && parent.beneficiaryContactId) {
                addItem(parent.beneficiaryContactId, { name: st.name || 'Sub-item', path: 'Garage \u203a ' + (parent.name || 'Thing'), hash: '#garagesubthing/' + st.id, inherited: true });
            }
        });

        Object.values(structureThings).forEach(function(t) {
            if (t.beneficiaryContactId)
                addItem(t.beneficiaryContactId, { name: t.name || 'Thing', path: 'Structures \u203a Thing', hash: '#structurething/' + t.id, inherited: false });
        });

        Object.values(structureSubThings).forEach(function(st) {
            var parent = structureThings[st.thingId];
            if (st.beneficiaryContactId) {
                addItem(st.beneficiaryContactId, { name: st.name || 'Sub-item', path: 'Structures \u203a ' + (parent ? parent.name : 'Thing'), hash: '#structuresubthing/' + st.id, inherited: false });
            } else if (parent && parent.beneficiaryContactId) {
                addItem(parent.beneficiaryContactId, { name: st.name || 'Sub-item', path: 'Structures \u203a ' + (parent.name || 'Thing'), hash: '#structuresubthing/' + st.id, inherited: true });
            }
        });

        Object.values(collections).forEach(function(col) {
            if (col.beneficiaryContactId)
                addItem(col.beneficiaryContactId, { name: col.name || 'Collection', path: 'Collections', hash: '#collection/' + col.id, inherited: false });
        });

        Object.values(collectionItems).forEach(function(item) {
            var parent = collections[item.collectionId];
            if (item.beneficiaryContactId) {
                addItem(item.beneficiaryContactId, { name: item.name || 'Item', path: 'Collections \u203a ' + (parent ? parent.name : 'Collection'), hash: '#collectionitem/' + item.id, inherited: false });
            } else if (parent && parent.beneficiaryContactId) {
                addItem(parent.beneficiaryContactId, { name: item.name || 'Item', path: (parent.name || 'Collection'), hash: '#collectionitem/' + item.id, inherited: true });
            }
        });

        var contactIds = Object.keys(byPerson);
        if (!contactIds.length) {
            resultEl.innerHTML = '<p class="empty-state">No assignments found.</p>';
            return;
        }

        return Promise.all(contactIds.map(function(id) {
            return userCol('people').doc(id).get().then(function(doc) {
                return { id: id, name: doc.exists ? (doc.data().name || '?') : '?' };
            });
        })).then(function(people) {
            people.sort(function(a, b) { return a.name.localeCompare(b.name); });
            var groups = people.map(function(p) {
                return { title: p.name, items: byPerson[p.id] || [] };
            }).filter(function(g) { return g.items.length > 0; });

            _beneCache = { mode: 'all', groups: groups, label: 'all people' };
            _beneRenderFromCache();
        });
    }).catch(function(err) {
        console.error('_loadAllBeneficiaryResults error:', err);
        resultEl.innerHTML = '<p class="empty-state">Error loading data.</p>';
    });
}

function _beneDocsToMap(snap) {
    var map = {};
    snap.forEach(function(doc) { map[doc.id] = Object.assign({ id: doc.id }, doc.data()); });
    return map;
}

function _beneHouseGroup(things, subThings, subThingItems, contactId) {
    var items = [];

    Object.values(things).forEach(function(t) {
        if (t.beneficiaryContactId === contactId)
            items.push({ name: t.name || 'Thing', path: 'House \u203a Thing', hash: '#thing/' + t.id, inherited: false });
    });

    Object.values(subThings).forEach(function(st) {
        if (st.beneficiaryContactId === contactId) {
            var parent = things[st.thingId];
            items.push({ name: st.name || 'Sub-item', path: 'House \u203a ' + (parent ? parent.name : 'Thing'), hash: '#subthing/' + st.id, inherited: false });
        } else if (!st.beneficiaryContactId) {
            var p = things[st.thingId];
            if (p && p.beneficiaryContactId === contactId)
                items.push({ name: st.name || 'Sub-item', path: 'House \u203a ' + (p.name || 'Thing'), hash: '#subthing/' + st.id, inherited: true });
        }
    });

    Object.values(subThingItems).forEach(function(item) {
        if (item.beneficiaryContactId === contactId) {
            var pSt = subThings[item.subThingId];
            var pT  = pSt ? things[pSt.thingId] : null;
            items.push({ name: item.name || 'Item', path: 'House \u203a ' + (pT ? pT.name + ' \u203a ' : '') + (pSt ? pSt.name : 'Sub-item'), hash: '#item/' + item.id, inherited: false });
        } else if (!item.beneficiaryContactId) {
            var st = subThings[item.subThingId];
            if (st) {
                if (st.beneficiaryContactId === contactId) {
                    var tName = things[st.thingId] ? things[st.thingId].name : 'Thing';
                    items.push({ name: item.name || 'Item', path: 'House \u203a ' + tName + ' \u203a ' + (st.name || 'Sub-item'), hash: '#item/' + item.id, inherited: true });
                } else if (!st.beneficiaryContactId) {
                    var t = things[st.thingId];
                    if (t && t.beneficiaryContactId === contactId)
                        items.push({ name: item.name || 'Item', path: 'House \u203a ' + (t.name || 'Thing') + ' \u203a ' + (st.name || 'Sub-item'), hash: '#item/' + item.id, inherited: true });
                }
            }
        }
    });

    return { title: 'House Things', items: items };
}

function _beneGarageGroup(garageThings, garageSubThings, contactId) {
    var items = [];

    Object.values(garageThings).forEach(function(t) {
        if (t.beneficiaryContactId === contactId)
            items.push({ name: t.name || 'Thing', path: 'Garage \u203a Thing', hash: '#garagething/' + t.id, inherited: false });
    });

    Object.values(garageSubThings).forEach(function(st) {
        if (st.beneficiaryContactId === contactId) {
            var parent = garageThings[st.thingId];
            items.push({ name: st.name || 'Sub-item', path: 'Garage \u203a ' + (parent ? parent.name : 'Thing'), hash: '#garagesubthing/' + st.id, inherited: false });
        } else if (!st.beneficiaryContactId) {
            var p = garageThings[st.thingId];
            if (p && p.beneficiaryContactId === contactId)
                items.push({ name: st.name || 'Sub-item', path: 'Garage \u203a ' + (p.name || 'Thing'), hash: '#garagesubthing/' + st.id, inherited: true });
        }
    });

    return { title: 'Garage Things', items: items };
}

function _beneStructureGroup(structureThings, structureSubThings, contactId) {
    var items = [];

    Object.values(structureThings).forEach(function(t) {
        if (t.beneficiaryContactId === contactId)
            items.push({ name: t.name || 'Thing', path: 'Structures \u203a Thing', hash: '#structurething/' + t.id, inherited: false });
    });

    Object.values(structureSubThings).forEach(function(st) {
        if (st.beneficiaryContactId === contactId) {
            var parent = structureThings[st.thingId];
            items.push({ name: st.name || 'Sub-item', path: 'Structures \u203a ' + (parent ? parent.name : 'Thing'), hash: '#structuresubthing/' + st.id, inherited: false });
        } else if (!st.beneficiaryContactId) {
            var p = structureThings[st.thingId];
            if (p && p.beneficiaryContactId === contactId)
                items.push({ name: st.name || 'Sub-item', path: 'Structures \u203a ' + (p.name || 'Thing'), hash: '#structuresubthing/' + st.id, inherited: true });
        }
    });

    return { title: 'Structure Things', items: items };
}

function _beneCollectionsGroup(collections, collectionItems, contactId) {
    var items = [];

    Object.values(collections).forEach(function(col) {
        if (col.beneficiaryContactId === contactId)
            items.push({ name: col.name || 'Collection', path: 'Collections', hash: '#collection/' + col.id, inherited: false });
    });

    Object.values(collectionItems).forEach(function(item) {
        if (item.beneficiaryContactId === contactId) {
            var parent = collections[item.collectionId];
            items.push({ name: item.name || 'Item', path: 'Collections \u203a ' + (parent ? parent.name : 'Collection'), hash: '#collectionitem/' + item.id, inherited: false });
        } else if (!item.beneficiaryContactId) {
            var p = collections[item.collectionId];
            if (p && p.beneficiaryContactId === contactId)
                items.push({ name: item.name || 'Item', path: (p.name || 'Collection'), hash: '#collectionitem/' + item.id, inherited: true });
        }
    });

    return { title: 'Collections', items: items };
}
