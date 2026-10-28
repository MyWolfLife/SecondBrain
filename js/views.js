// ============================================================
// views.js — My Thoughts section (Views, Reflections, Advice, Reviews)
// ============================================================

var THOUGHT_TYPES  = ['view', 'reflection', 'advice', 'review'];
var THOUGHT_TYPE_LABELS = { view: 'View', reflection: 'Reflection', advice: 'Advice', review: 'Review' };

// ─────── Seed Data ───────
var _viewsCategorySeed = [
    { name: 'Politics & Society', subs: ['Politics', 'Government', 'Culture', 'Society', 'Media'] },
    { name: 'Personal Beliefs',   subs: ['Religion / Faith', 'Ethics & Morality', 'Philosophy'] },
    { name: 'Life & Family',      subs: ['Parenting', 'Relationships', 'Marriage', 'Family'] },
    { name: 'Practical',          subs: ['Finance & Money', 'Health & Medicine', 'Education', 'Career & Work', 'Technology'] },
    { name: 'Other',              subs: ['Environment', 'Sports', 'Food & Lifestyle'] }
];

var _reviewsCategorySeed    = ['Book', 'Movie', 'TV Show', 'Restaurant', 'Experience', 'Product'];
var _adviceCategorySeed     = ['Parenting', 'Career', 'Faith', 'Money'];
var _reflectionCategorySeed = ['General'];

function seedViewCategories() {
    // Merged read (private + shares I own) so categories moved into my all-thoughts share are not seeded again (sharethought.js)
    thCol('viewCategories').get().then(function(snap) {
        if (snap.empty) {
            // No categories yet — seed fresh
            var batch = db.batch();
            _viewsCategorySeed.forEach(function(cat, catIdx) {
                var catRef = thNewRef('viewCategories');
                batch.set(catRef, { name: cat.name, order: catIdx, thoughtType: 'view', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                var generalRef = catRef.collection('subcategories').doc();
                batch.set(generalRef, { name: 'General', order: 0, isDefault: true, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                cat.subs.forEach(function(subName, subIdx) {
                    var subRef = catRef.collection('subcategories').doc();
                    batch.set(subRef, { name: subName, order: subIdx + 1, isDefault: false, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                });
            });
            batch.commit().catch(function(err) { console.error('seedViewCategories error:', err); });
        } else {
            // Migrate existing categories that are missing thoughtType — treat them as 'view'
            var needsMigration = snap.docs.filter(function(d) { return !d.data().thoughtType; });
            if (needsMigration.length > 0) {
                var batch = db.batch();
                needsMigration.forEach(function(d) { batch.update(d.ref, { thoughtType: 'view' }); });
                batch.commit().catch(function(err) { console.error('seedViewCategories migrate error:', err); });
            }

            // Seed Review, Advice, Reflection categories if none exist yet for each type
            [
                { type: 'review',     names: _reviewsCategorySeed },
                { type: 'advice',     names: _adviceCategorySeed },
                { type: 'reflection', names: _reflectionCategorySeed }
            ].forEach(function(seed) {
                var exists = snap.docs.some(function(d) { return d.data().thoughtType === seed.type; });
                if (!exists) {
                    var batch2 = db.batch();
                    seed.names.forEach(function(name, idx) {
                        var catRef = thNewRef('viewCategories');
                        batch2.set(catRef, { name: name, order: idx, thoughtType: seed.type, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                        var genRef = catRef.collection('subcategories').doc();
                        batch2.set(genRef, { name: 'General', order: 0, isDefault: true, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                    });
                    batch2.commit().catch(function(err) { console.error('seed ' + seed.type + ' categories error:', err); });
                }
            });
        }
    }).catch(function(err) { console.error('seedViewCategories check error:', err); });
}

// ─────── Module State ───────
var _viewId                = null;   // Firestore ID of current thought (null = new)
var _viewData              = null;   // current thought document data
var _viewCatsData          = [];     // [{id, name, order, subs:[{id,name,isDefault,order}]}]
var _viewUrls              = [];     // [{label, url}]
var _viewLongLast          = '';     // last-saved long version (change detection)
var _viewAiPrevSuggestions = [];
var _viewAiCurrentTopics   = [];
var _viewCurrentType       = 'view'; // active type tab on list page
var _catPageCurrentType    = 'view'; // active type on categories page
var _viewTargetShareId     = null;   // new-thought page: the share a new thought is added to (someone's all-thoughts share), or null
var _viewReadOnly          = false;  // true while a thought shared View only is open

// ─────── Helpers ───────
function _viewEsc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _viewFormatDate(ts) {
    if (!ts) return '';
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function _viewIsToday(ts) {
    if (!ts) return false;
    var d     = ts.toDate ? ts.toDate() : new Date(ts);
    var today = new Date();
    return d.getFullYear() === today.getFullYear() &&
           d.getMonth()    === today.getMonth()    &&
           d.getDate()     === today.getDate();
}

// Returns the type-appropriate label for the archive/update button
function _viewChangedBtnLabel(thoughtType) {
    var map = { view: "I've Changed My View", reflection: 'Update My Reflection', advice: 'Update My Advice', review: 'Update My Review' };
    return map[thoughtType] || "Update This Thought";
}

// ─────── Load Category Data (filtered by type) ───────
function _viewLoadCatsData(thoughtType, opts) {
    // opts.shareId: also the categories of a share (a thought shared with me, or adding to someone's all-thoughts share with opts.only)
    return thCatDocs(opts)
        .then(function(catDocs) {
            var filteredDocs = catDocs
                .filter(function(d) { var t = d.data().thoughtType; return t === thoughtType || (!t && thoughtType === 'view'); })
                .sort(function(a, b) { return (a.data().order || 0) - (b.data().order || 0); });

            var subPromises = filteredDocs.map(function(catDoc) {
                return catDoc.ref.collection('subcategories').orderBy('order').get()
                    .then(function(subSnap) {
                        return {
                            id:    catDoc.id,
                            name:  catDoc.data().name,
                            order: catDoc.data().order,
                            subs:  subSnap.docs.map(function(s) { return Object.assign({ id: s.id }, s.data()); })
                        };
                    });
            });
            return Promise.all(subPromises);
        });
}

// ─────── Dropdown Builders ───────
function _viewBuildMajorOptions(cats, selectedCatId) {
    return cats.map(function(cat) {
        return '<option value="' + cat.id + '"' + (cat.id === selectedCatId ? ' selected' : '') + '>' +
            _viewEsc(cat.name) + '</option>';
    }).join('');
}
function _viewBuildSubOptions(subs, selectedSubId) {
    return subs.map(function(sub) {
        return '<option value="' + sub.id + '"' + (sub.id === selectedSubId ? ' selected' : '') + '>' +
            _viewEsc(sub.name) + '</option>';
    }).join('');
}
function _viewBuildSubOptionsForCat(catId, selectedSubId) {
    if (!catId) return '';
    var cat = _viewCatsData.find(function(c) { return c.id === catId; });
    if (!cat) return '';
    return _viewBuildSubOptions(cat.subs, selectedSubId || '');
}

// ─────── Category change handler (shared by new and detail pages) ───────
function _viewOnMajorCatChange(newCatId, saveToFirestore) {
    var subSelect = document.getElementById('viewSubCatSelect');
    if (!subSelect) return;
    if (!newCatId) {
        subSelect.disabled = true;
        subSelect.innerHTML = '';
        if (saveToFirestore && _viewId) _viewSaveCategory();
        _viewCheckNewPageUnlock();
        return;
    }
    var cat = _viewCatsData.find(function(c) { return c.id === newCatId; });
    if (!cat) return;
    var generalSub = cat.subs.find(function(s) { return s.isDefault; }) || cat.subs[0];
    subSelect.disabled = false;
    subSelect.innerHTML = _viewBuildSubOptions(cat.subs, generalSub ? generalSub.id : '');
    if (saveToFirestore && _viewId) _viewSaveCategory();
    _viewCheckNewPageUnlock();
}

// Called when type changes on the new thought page — reloads categories for that type
function _viewOnTypeChange(newType) {
    var majorEl = document.getElementById('viewMajorCatSelect');
    var subEl   = document.getElementById('viewSubCatSelect');
    if (majorEl) { majorEl.innerHTML = '<option value="">— Loading… —</option>'; majorEl.disabled = true; }
    if (subEl)   { subEl.innerHTML   = ''; subEl.disabled = true; }
    _viewCheckNewPageUnlock();

    // Show/hide AI topic button based on type (Views only)
    var aiBtn = document.getElementById('viewAskAiBtn');
    if (aiBtn) aiBtn.classList.toggle('hidden', newType !== 'view');

    _viewLoadCatsData(newType, _viewTargetShareId ? { shareId: _viewTargetShareId, only: true } : null).then(function(cats) {
        _viewCatsData = cats;
        if (majorEl) {
            // If only one category exists, auto-select it
            if (cats.length === 1) {
                majorEl.innerHTML = _viewBuildMajorOptions(cats, cats[0].id);
                majorEl.disabled  = false;
                _viewOnMajorCatChange(cats[0].id, false);
            } else {
                majorEl.innerHTML = '<option value="">— Select —</option>' + _viewBuildMajorOptions(cats, '');
                majorEl.disabled  = false;
            }
        }
        _viewCheckNewPageUnlock();
    });
}

// Enables Create button once type + title + category are all set
function _viewCheckNewPageUnlock() {
    if (_viewId) return;
    var typeEl  = document.getElementById('viewTypeSelect');
    var titleEl = document.getElementById('viewTitleInput');
    var majorEl = document.getElementById('viewMajorCatSelect');
    var btn     = document.getElementById('viewCreateBtn');
    if (!btn) return;
    var hasType  = typeEl  && typeEl.value;
    var hasTitle = titleEl && titleEl.value.trim().length > 0;
    var hasCat   = majorEl && majorEl.value;
    btn.disabled = !(hasType && hasTitle && hasCat);
}

// ══════════════════════════════════════════════════════════════
// THOUGHTS LIST PAGE  (#views)
// ══════════════════════════════════════════════════════════════
function loadViewsPage() {
    seedViewCategories();

    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML =
        '<a href="#thoughts">Thoughts</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<span>My Thoughts</span>';

    // Render type tabs
    var tabsEl = document.getElementById('viewsTypeTabs');
    if (tabsEl) {
        tabsEl.innerHTML = THOUGHT_TYPES.map(function(type) {
            return '<button class="view-type-tab' + (type === _viewCurrentType ? ' active' : '') + '" ' +
                'data-type="' + type + '" ' +
                'onclick="_viewLoadForType(\'' + type + '\')">' +
                THOUGHT_TYPE_LABELS[type] + 's' +
                '</button>';
        }).join('');
    }

    var searchEl = document.getElementById('viewsSearchInput');
    if (searchEl) { searchEl.value = ''; searchEl.oninput = function() { _viewSearch(this.value); }; }

    thRenderListControls();      // Share all… button (sharethought.js)

    _viewLoadForType(_viewCurrentType);
}

function _viewLoadForType(thoughtType) {
    _viewCurrentType = thoughtType;

    // Update tab active state
    var tabs = document.querySelectorAll('.view-type-tab');
    tabs.forEach(function(t) {
        t.classList.toggle('active', t.dataset.type === thoughtType);
    });

    var container = document.getElementById('viewsAccordion');
    if (!container) return;
    container.innerHTML = '<p class="views-empty-state">Loading...</p>';
    thRenderSharedWithMe(thoughtType);     // thoughts other people shared with me, above mine

    // Fetch all docs and filter client-side — avoids composite index requirements
    Promise.all([
        thCol('viewCategories').get(),
        thCol('views').get()
    ]).then(function(results) {
        var allCatDocs  = results[0].docs.filter(function(d) { var t = d.data().thoughtType; return t === thoughtType || (!t && thoughtType === 'view'); });
        var allViewDocs = results[1].docs.filter(function(d) { return d.data().thoughtType === thoughtType; });

        // Update tile count with total across all types
        var tileEl = document.getElementById('viewsCount');
        if (tileEl) tileEl.textContent = 'My Thoughts (' + results[1].size + ')';

        var viewsBySubId  = {};
        var uncategorized = [];
        allViewDocs.forEach(function(doc) {
            var data = doc.data(); data.id = doc.id;
            var subId = data.subcategoryId || null;
            if (!subId) { uncategorized.push(data); }
            else {
                if (!viewsBySubId[subId]) viewsBySubId[subId] = [];
                viewsBySubId[subId].push(data);
            }
        });

        var typeLabel = THOUGHT_TYPE_LABELS[thoughtType] || 'Thought';
        if (allCatDocs.length === 0 && uncategorized.length === 0) {
            container.innerHTML = '<p class="views-empty-state">No ' + typeLabel.toLowerCase() +
                's yet. Click <strong>+ New Thought</strong> to get started.</p>';
            return;
        }

        allCatDocs.sort(function(a, b) { return (a.data().order || 0) - (b.data().order || 0); });

        var subPromises = allCatDocs.map(function(catDoc) {
            return catDoc.ref.collection('subcategories').orderBy('order').get()
                .then(function(subSnap) { return { catDoc: catDoc, subDocs: subSnap.docs }; });
        });

        Promise.all(subPromises).then(function(catData) {
            _viewRenderAccordion(container, catData, viewsBySubId, uncategorized, thoughtType);
        });

    }).catch(function(err) {
        console.error('_viewLoadForType error:', err);
        container.innerHTML = '<p class="views-empty-state">Error: ' + (err.message || err) + '</p>';
    });
}

function _viewRenderAccordion(container, catData, viewsBySubId, uncategorized, thoughtType) {
    var html       = '';
    var anyVisible = false;
    var typeLabel  = THOUGHT_TYPE_LABELS[thoughtType] || 'Thought';

    catData.forEach(function(cd) {
        var cat = cd.catDoc.data(); cat.id = cd.catDoc.id;
        var catTotal = 0;
        var subHtml  = '';

        cd.subDocs.forEach(function(subDoc) {
            var sub   = subDoc.data(); sub.id = subDoc.id;
            var views = viewsBySubId[sub.id] || [];
            if (views.length === 0) return;
            catTotal += views.length;
            subHtml +=
                '<div class="views-sub-accordion" data-sub-id="' + sub.id + '">' +
                    '<div class="views-sub-header" onclick="_viewToggleSub(this)">' +
                        '<span class="views-chevron">&#9654;</span>' +
                        '<span class="views-sub-name">' + _viewEsc(sub.name) + '</span>' +
                        '<span class="views-sub-count">(' + views.length + ')</span>' +
                    '</div>' +
                    '<div class="views-sub-body hidden">' + views.map(_viewRenderCard).join('') + '</div>' +
                '</div>';
        });

        if (catTotal === 0) return;
        anyVisible = true;
        html +=
            '<div class="views-major-accordion" data-cat-id="' + cat.id + '">' +
                '<div class="views-major-header" onclick="_viewToggleMajor(this)">' +
                    '<span class="views-chevron">&#9654;</span>' +
                    '<span class="views-major-name">' + _viewEsc(cat.name) + '</span>' +
                    '<span class="views-major-count">(' + catTotal + ')</span>' +
                '</div>' +
                '<div class="views-major-body hidden">' + subHtml + '</div>' +
            '</div>';
    });

    if (uncategorized.length > 0) {
        anyVisible = true;
        html +=
            '<div class="views-major-accordion" data-cat-id="uncategorized">' +
                '<div class="views-major-header" onclick="_viewToggleMajor(this)">' +
                    '<span class="views-chevron">&#9654;</span>' +
                    '<span class="views-major-name">Uncategorized</span>' +
                    '<span class="views-major-count">(' + uncategorized.length + ')</span>' +
                '</div>' +
                '<div class="views-major-body hidden">' + uncategorized.map(_viewRenderCard).join('') + '</div>' +
            '</div>';
    }

    container.innerHTML = anyVisible
        ? html
        : '<p class="views-empty-state">No ' + typeLabel.toLowerCase() + 's yet. Click <strong>+ New Thought</strong> to get started.</p>';
}

function _viewRenderCard(v) {
    var dateStr   = _viewFormatDate(v.currentDate || v.createdAt);
    var typeLabel = v.thoughtType ? THOUGHT_TYPE_LABELS[v.thoughtType] : '';
    var typeBadge = typeLabel
        ? '<span class="view-type-badge view-type-badge--' + _viewEsc(v.thoughtType) + '">' + _viewEsc(typeLabel) + '</span>'
        : '';
    var shortHtml = v.shortVersion ? '<p class="views-card-short">' + _viewEsc(v.shortVersion) + '</p>' : '';
    var histBadge = (v.historyCount && v.historyCount > 0)
        ? '<span class="views-history-badge">' + v.historyCount + ' previous version' + (v.historyCount !== 1 ? 's' : '') + '</span>'
        : '';
    var footer = (typeBadge || histBadge)
        ? '<div class="views-card-footer">' + typeBadge + histBadge + '</div>'
        : '';
    return '<a href="#view/' + v.id + '" class="views-card">' +
        '<div class="views-card-header">' +
            '<span class="views-card-title">' + _viewEsc(v.title || '(Untitled)') + '</span>' +
            (dateStr ? '<span class="views-card-date">' + dateStr + '</span>' : '') +
        '</div>' + shortHtml + footer +
    '</a>';
}

function _viewToggleMajor(header) {
    var body = header.nextElementSibling;
    var chev = header.querySelector('.views-chevron');
    var open = !body.classList.contains('hidden');
    body.classList.toggle('hidden', open);
    chev.style.transform = open ? '' : 'rotate(90deg)';
}
function _viewToggleSub(header) {
    var body = header.nextElementSibling;
    var chev = header.querySelector('.views-chevron');
    var open = !body.classList.contains('hidden');
    body.classList.toggle('hidden', open);
    chev.style.transform = open ? '' : 'rotate(90deg)';
}

function _viewSearch(term) {
    var lc = term.toLowerCase().trim();
    var container = document.getElementById('viewsAccordion');
    if (!container) return;
    var majors = container.querySelectorAll('.views-major-accordion');

    if (!lc) {
        majors.forEach(function(major) {
            major.classList.remove('hidden');
            var body = major.querySelector('.views-major-body');
            var chev = major.querySelector('.views-major-header .views-chevron');
            body.classList.add('hidden');
            if (chev) chev.style.transform = '';
            major.querySelectorAll('.views-sub-accordion').forEach(function(sub) {
                sub.classList.remove('hidden');
                var sb = sub.querySelector('.views-sub-body');
                var sc = sub.querySelector('.views-sub-header .views-chevron');
                if (sb) sb.classList.add('hidden');
                if (sc) sc.style.transform = '';
                sub.querySelectorAll('.views-card').forEach(function(c) { c.classList.remove('hidden'); });
            });
            major.querySelectorAll('.views-major-body > .views-card').forEach(function(c) { c.classList.remove('hidden'); });
        });
        var nr = document.getElementById('viewsNoResults');
        if (nr) nr.remove();
        return;
    }

    var anyHit = false;
    majors.forEach(function(major) {
        var majorHit  = false;
        var majorBody = major.querySelector('.views-major-body');
        var majorChev = major.querySelector('.views-major-header .views-chevron');

        major.querySelectorAll('.views-major-body > .views-card').forEach(function(card) {
            var match = _viewCardMatches(card, lc);
            card.classList.toggle('hidden', !match);
            if (match) majorHit = true;
        });

        major.querySelectorAll('.views-sub-accordion').forEach(function(sub) {
            var subHit  = false;
            var subBody = sub.querySelector('.views-sub-body');
            var subChev = sub.querySelector('.views-sub-header .views-chevron');
            sub.querySelectorAll('.views-card').forEach(function(card) {
                var match = _viewCardMatches(card, lc);
                card.classList.toggle('hidden', !match);
                if (match) subHit = true;
            });
            sub.classList.toggle('hidden', !subHit);
            if (subHit) {
                majorHit = true;
                if (subBody) subBody.classList.remove('hidden');
                if (subChev) subChev.style.transform = 'rotate(90deg)';
            }
        });

        major.classList.toggle('hidden', !majorHit);
        if (majorHit) {
            anyHit = true;
            if (majorBody) majorBody.classList.remove('hidden');
            if (majorChev) majorChev.style.transform = 'rotate(90deg)';
        }
    });

    var noResults = document.getElementById('viewsNoResults');
    if (!anyHit) {
        if (!noResults) {
            var msg = document.createElement('p');
            msg.id = 'viewsNoResults';
            msg.className = 'views-empty-state';
            msg.textContent = 'No thoughts match "' + term.trim() + '"';
            container.appendChild(msg);
        }
    } else {
        if (noResults) noResults.remove();
    }
}

function _viewCardMatches(card, lc) {
    var t = (card.querySelector('.views-card-title') || {}).textContent || '';
    var s = (card.querySelector('.views-card-short') || {}).textContent || '';
    return t.toLowerCase().includes(lc) || s.toLowerCase().includes(lc);
}

// ══════════════════════════════════════════════════════════════
// THOUGHT DETAIL PAGE  (#view/:id  or  #view/new)
// ══════════════════════════════════════════════════════════════
function loadViewDetailPage(id) {
    _viewId   = (id === 'new') ? null : id;
    _viewData = null;
    _viewUrls = [];

    var container = document.getElementById('viewDetailContent');
    if (!container) return;
    container.innerHTML = '<p class="views-empty-state">Loading...</p>';

    if (_viewId === null) {
        // New thought — start with empty cats, type selector drives the load
        _viewTargetShareId = _viewNewShareId;     // "+ New thought in …" (sharethought.js) says where it goes
        _viewNewShareId = null;
        _viewCatsData = [];
        _viewRenderNewPage();
    } else {
        _viewReadOnly = false;
        thDocGet('views', _viewId).then(function(doc) {
            if (!doc.exists) {
                container.innerHTML = '<p class="views-empty-state">Thought not found. <a href="#views">Back to My Thoughts</a></p>';
                return;
            }
            _viewData = Object.assign({ id: doc.id }, doc.data());
            _viewUrls = (_viewData.urls || []).map(function(u) { return Object.assign({}, u); });
            var type  = _viewData.thoughtType || 'view';
            // a thought shared with me brings its own category names
            var viewShare = thShareOf(_viewId);
            _viewLoadCatsData(type, viewShare && !_thOwn[viewShare] ? { shareId: viewShare } : null).then(function(cats) {
                _viewCatsData = cats;
                _viewRenderExistingPage();
                thRenderDetailControls(_viewId);       // Share… button, badge, View-only look (sharethought.js)
            });
        }).catch(function(err) {
            console.error('loadViewDetailPage error:', err);
            container.innerHTML = '<p class="views-empty-state">Error loading thought.</p>';
        });
    }
}

// ── New Thought Page ──
function _viewRenderNewPage() {
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML =
        '<a href="#thoughts">Thoughts</a><span class="separator">&rsaquo;</span>' +
        '<a href="#views">My Thoughts</a><span class="separator">&rsaquo;</span>' +
        '<span>New Thought</span>';

    _viewAiPrevSuggestions = [];

    var container = document.getElementById('viewDetailContent');
    container.innerHTML =
        '<div class="view-detail-container">' +
            '<h2 class="view-new-heading">New Thought</h2>' +

            // Type selector (required — drives category options)
            '<div class="view-field-group">' +
                '<label class="view-field-label">Type <span class="view-required">*</span></label>' +
                '<select id="viewTypeSelect" class="form-control">' +
                    '<option value="">— Select type —</option>' +
                    THOUGHT_TYPES.map(function(t) {
                        return '<option value="' + t + '">' + THOUGHT_TYPE_LABELS[t] + '</option>';
                    }).join('') +
                '</select>' +
            '</div>' +

            // Category row
            '<div class="view-category-row">' +
                '<div class="view-field-group">' +
                    '<label class="view-field-label">Major Category <span class="view-required">*</span></label>' +
                    '<select id="viewMajorCatSelect" class="form-control" disabled>' +
                        '<option value="">— Select type first —</option>' +
                    '</select>' +
                '</div>' +
                '<div class="view-field-group">' +
                    '<label class="view-field-label">Subcategory</label>' +
                    '<select id="viewSubCatSelect" class="form-control" disabled>' +
                        '<option value="">— Select major first —</option>' +
                    '</select>' +
                '</div>' +
            '</div>' +

            // Title
            '<div class="view-field-group">' +
                '<label class="view-field-label">Title <span class="view-required">*</span></label>' +
                '<input type="text" id="viewTitleInput" class="form-control" placeholder="What is this about?">' +
                '<button id="viewAskAiBtn" class="btn btn-secondary btn-small view-ask-ai-btn hidden" ' +
                    'onclick="_viewAskAiForTopic(false)">✨ Ask AI For a Topic</button>' +
            '</div>' +

            '<div class="view-create-actions">' +
                '<button id="viewCreateBtn" class="btn btn-primary" onclick="_viewCreateNew()" disabled>Create Thought</button>' +
                '<a href="#views" class="btn btn-secondary">Cancel</a>' +
            '</div>' +
        '</div>';

    var typeEl  = document.getElementById('viewTypeSelect');
    var titleEl = document.getElementById('viewTitleInput');
    var majorEl = document.getElementById('viewMajorCatSelect');
    if (typeEl)  {
        typeEl.onchange = function() {
            if (this.value) _viewOnTypeChange(this.value);
            _viewCheckNewPageUnlock();
        };
        // Pre-select the type the user was browsing
        if (_viewCurrentType) {
            typeEl.value = _viewCurrentType;
            _viewOnTypeChange(_viewCurrentType);
        } else {
            typeEl.focus();
        }
    }
    if (titleEl) { titleEl.oninput = _viewCheckNewPageUnlock; }
    if (majorEl) {
        majorEl.onchange = function() { _viewOnMajorCatChange(this.value, false); _viewCheckNewPageUnlock(); };
    }

    // AI topic button only available for Views and only when LLM is configured
    if (_viewCurrentType === 'view') {
        userCol('settings').doc('llm').get().then(function(doc) {
            if (doc.exists && doc.data().provider && doc.data().apiKey) {
                var btn = document.getElementById('viewAskAiBtn');
                if (btn) btn.classList.remove('hidden');
            }
        });
    }
}

function _viewCreateNew() {
    var typeEl  = document.getElementById('viewTypeSelect');
    var titleEl = document.getElementById('viewTitleInput');
    var majorEl = document.getElementById('viewMajorCatSelect');
    var subEl   = document.getElementById('viewSubCatSelect');

    var thoughtType = typeEl  ? typeEl.value        : '';
    var title       = titleEl ? titleEl.value.trim() : '';
    var catId       = majorEl ? majorEl.value        : '';
    var subId       = subEl   ? subEl.value          : '';

    if (!thoughtType) { alert('Please select a type.'); if (typeEl) typeEl.focus(); return; }
    if (!title)       { alert('Please enter a title.'); if (titleEl) titleEl.focus(); return; }
    if (!catId)       { alert('Please select a major category.'); if (majorEl) majorEl.focus(); return; }

    var btn = document.getElementById('viewCreateBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

    // Where it goes: the share chosen with "+ New thought in …", my all-thoughts share, or private
    var createCol = _viewTargetShareId ? shareCol(_viewTargetShareId, 'views') : thCol('views');
    createCol.add({
        title:         title,
        shortVersion:  '',
        longVersion:   '',
        urls:          [],
        thoughtType:   thoughtType,
        categoryId:    catId || null,
        subcategoryId: subId || null,
        historyCount:  0,
        currentDate:   firebase.firestore.FieldValue.serverTimestamp(),
        createdAt:     firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt:     firebase.firestore.FieldValue.serverTimestamp()
    }).then(function(ref) {
        if (_viewTargetShareId) _thIdx.views[ref.id] = _viewTargetShareId;
        window.location.hash = '#view/' + ref.id;
    }).catch(function(err) {
        console.error('_viewCreateNew error:', err);
        if (btn) { btn.disabled = false; btn.textContent = 'Create Thought'; }
        alert('Error creating thought. Please try again.');
    });
}

// ══════════════════════════════════════════════════════════════
// AI TOPIC SUGGESTIONS
// ══════════════════════════════════════════════════════════════
async function _viewAskAiForTopic(isRetry) {
    var typeEl  = document.getElementById('viewTypeSelect');
    var majorEl = document.getElementById('viewMajorCatSelect');
    var subEl   = document.getElementById('viewSubCatSelect');
    var thoughtType = typeEl  ? typeEl.value  : 'view';
    var catId       = majorEl ? majorEl.value : '';
    var subId       = subEl   ? subEl.value   : '';

    if (!catId) { alert('Please select a major category first.'); return; }

    var cat     = _viewCatsData.find(function(c) { return c.id === catId; });
    var catName = cat ? cat.name : 'Unknown';
    var subName = '';
    if (subId && cat) {
        var sub = cat.subs.find(function(s) { return s.id === subId; });
        subName = sub ? sub.name : '';
    }

    var cfgDoc = await userCol('settings').doc('llm').get().catch(function() { return null; });
    if (!cfgDoc || !cfgDoc.exists) { alert('LLM not configured. Go to Settings > AI.'); return; }
    var cfg = cfgDoc.data();
    var llm = (typeof LLM_PROVIDERS !== 'undefined') ? LLM_PROVIDERS[cfg.provider] : null;
    if (!llm) { alert('Unknown LLM provider. Check Settings > AI.'); return; }

    var snap = await thCol('views').where('categoryId', '==', catId).get();
    var existingTitles = [];
    snap.forEach(function(doc) { var t = doc.data().title; if (t) existingTitles.push(t); });

    var categoryDesc = subName && subName !== 'General'
        ? '"' + catName + '" › "' + subName + '"'
        : '"' + catName + '"';

    var typeContextMap = {
        view:       'log their personal opinions and views',
        reflection: 'write personal reflections on experiences, people, and things that shaped them',
        advice:     'record personal advice and guidance they would pass on to others',
        review:     'write reviews and share their thoughts on books, movies, and experiences'
    };
    var typeContext = typeContextMap[thoughtType] || 'record their thoughts';

    var prompt =
        'You are helping an everyday working person ' + typeContext + '. ' +
        'This person is a regular working adult — someone dealing with real life: paying bills, ' +
        'raising a family, holding down a job. They likely have a high school diploma or an associate\'s degree. ' +
        'They are NOT academics or political theorists. Keep language plain and grounded.\n\n' +
        'They want to write about something in the category ' + categoryDesc + '.\n\n' +
        'Suggest exactly 10 topic titles using this breakdown:\n' +
        '- Topics 1–5: Current or highly relatable topics that most people deal with or talk about.\n' +
        '- Topics 6–8: Timeless topics that come up in everyday conversation.\n' +
        '- Topics 9–10: A little outside the box — designed for someone who wants to think deeper.\n\n' +
        'All topics should be written as short, clear titles (not full questions). ' +
        'Avoid jargon, academic language, or anything that sounds like a college essay prompt.\n\n';

    if (existingTitles.length > 0) {
        prompt += 'Topics already logged (do not suggest these or close variants):\n';
        existingTitles.forEach(function(t) { prompt += '- ' + t + '\n'; });
        prompt += '\n';
    }
    if (isRetry && _viewAiPrevSuggestions.length > 0) {
        prompt += 'Previously suggested topics (do not suggest any of these either):\n';
        _viewAiPrevSuggestions.forEach(function(t) { prompt += '- ' + t + '\n'; });
        prompt += '\n';
    }
    prompt += 'Return ONLY a JSON array of exactly 10 topic strings and nothing else. ' +
        'Example format: ["Topic 1", "Topic 2", "Topic 3", "Topic 4", "Topic 5", ' +
        '"Topic 6", "Topic 7", "Topic 8", "Topic 9", "Topic 10"]';

    var catLabelEl = document.getElementById('viewAiTopicsCatLabel');
    if (catLabelEl) {
        catLabelEl.textContent = subName && subName !== 'General'
            ? catName + ' › ' + subName
            : catName;
    }
    _viewShowAiTopicsModal(null);

    try {
        var activeModel = cfg.model || llm.model;
        var raw         = await chatCallOpenAICompat(llm, cfg.apiKey, prompt, activeModel);
        var jsonMatch   = raw.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('Could not parse AI response.');
        var topics = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(topics) || topics.length === 0) throw new Error('Empty suggestion list.');
        _viewAiPrevSuggestions = _viewAiPrevSuggestions.concat(topics);
        _viewShowAiTopicsModal(topics);
    } catch (err) {
        console.error('AI topic error:', err);
        var bodyEl = document.getElementById('viewAiTopicsBody');
        if (bodyEl) bodyEl.innerHTML = '<p class="views-ai-error">Error: ' + _viewEsc(err.message) + '</p>';
    }
}

function _viewShowAiTopicsModal(topics) {
    var bodyEl   = document.getElementById('viewAiTopicsBody');
    var retryBtn = document.getElementById('viewAiRetryBtn');
    if (!bodyEl) return;
    openModal('viewAiTopicsModal');
    if (!topics) {
        bodyEl.innerHTML = '<p class="views-ai-loading">✨ Asking AI for suggestions…</p>';
        if (retryBtn) retryBtn.disabled = true;
        return;
    }
    _viewAiCurrentTopics = topics;
    bodyEl.innerHTML = topics.map(function(topic, i) {
        return '<button class="views-ai-topic-btn" onclick="_viewSelectAiTopic(_viewAiCurrentTopics[' + i + '])">' +
            '<span class="views-ai-topic-num">' + (i + 1) + '</span>' +
            '<span class="views-ai-topic-text">' + _viewEsc(topic) + '</span>' +
            '</button>';
    }).join('');
    if (retryBtn) retryBtn.disabled = false;
}

function _viewSelectAiTopic(topic) {
    var titleEl = document.getElementById('viewTitleInput');
    if (titleEl) {
        titleEl.value = topic;
        titleEl.dispatchEvent(new Event('input'));
        _viewCheckNewPageUnlock();
    }
    closeModal('viewAiTopicsModal');
}

// ── Existing Thought Detail Page ──
function _viewRenderExistingPage() {
    var d        = _viewData;
    var dateStr  = _viewFormatDate(d.currentDate || d.createdAt);
    var shortVal = d.shortVersion || '';
    var longVal  = d.longVersion  || '';
    var type     = d.thoughtType  || 'view';
    var typeLabel = THOUGHT_TYPE_LABELS[type] || 'Thought';

    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML =
        '<a href="#thoughts">Thoughts</a><span class="separator">&rsaquo;</span>' +
        '<a href="#views">My Thoughts</a><span class="separator">&rsaquo;</span>' +
        '<span id="viewDetailCrumb">' + _viewEsc(d.title || 'Thought') + '</span>';

    var subOptions = d.categoryId ? _viewBuildSubOptionsForCat(d.categoryId, d.subcategoryId) : '';

    var canChange     = !_viewIsToday(d.currentDate);
    var changedLabel  = _viewChangedBtnLabel(type);

    var container = document.getElementById('viewDetailContent');
    container.innerHTML =
        '<div class="view-detail-container">' +

            // Title row
            '<div class="view-title-row">' +
                '<input type="text" id="viewTitleInput" class="form-control view-title-input" ' +
                    'value="' + _viewEsc(d.title || '') + '" placeholder="Title">' +
                '<button class="btn btn-small btn-secondary" onclick="_viewSaveTitle()">Save</button>' +
            '</div>' +

            // Type badge (read-only) + category row
            '<div class="view-category-row">' +
                '<div class="view-field-group">' +
                    '<label class="view-field-label">Type</label>' +
                    '<span class="view-type-badge view-type-badge--' + _viewEsc(type) + ' view-type-badge--detail">' + _viewEsc(typeLabel) + '</span>' +
                '</div>' +
                '<div class="view-field-group">' +
                    '<label class="view-field-label">Major Category</label>' +
                    '<select id="viewMajorCatSelect" class="form-control" onchange="_viewOnMajorCatChange(this.value, true)">' +
                        '<option value="">— Uncategorized —</option>' +
                        _viewBuildMajorOptions(_viewCatsData, d.categoryId || '') +
                    '</select>' +
                '</div>' +
                '<div class="view-field-group">' +
                    '<label class="view-field-label">Subcategory</label>' +
                    '<select id="viewSubCatSelect" class="form-control" onchange="_viewSaveCategory()"' +
                        (d.categoryId ? '' : ' disabled') + '>' +
                        subOptions +
                    '</select>' +
                '</div>' +
            '</div>' +

            // Action buttons
            '<div class="view-header-actions">' +
                '<button class="btn btn-secondary"' +
                    (canChange ? ' onclick="_viewOpenChangedModal()"' : ' disabled title="You\'ve already archived this today"') + '>' +
                    _viewEsc(changedLabel) + '</button>' +
                '<button class="btn btn-danger btn-small" onclick="_viewDeleteView()">Delete</button>' +
            '</div>' +

            // Short Version
            '<div class="view-field-section">' +
                '<div class="view-field-label-row">' +
                    '<label class="view-field-label">Short Version</label>' +
                    '<span class="view-char-counter" id="viewShortCounter">' + shortVal.length + ' / 500</span>' +
                '</div>' +
                '<textarea id="viewShortInput" class="form-control" rows="3" maxlength="500" ' +
                    'placeholder="Brief summary (optional)...">' +
                    _viewEsc(shortVal) + '</textarea>' +
                '<button class="btn btn-small btn-secondary view-save-btn" onclick="_viewSaveShort()">Save</button>' +
            '</div>' +

            // Long Version
            '<div class="view-field-section">' +
                '<div class="view-field-label-row">' +
                    '<label class="view-field-label">Long Version</label>' +
                    (dateStr ? '<span class="view-current-date">Current since ' + dateStr + '</span>' : '') +
                '</div>' +
                '<textarea id="viewLongInput" class="form-control view-long-textarea" ' +
                    'placeholder="Your full thoughts...">' +
                    _viewEsc(longVal) + '</textarea>' +
                '<button class="btn btn-small btn-secondary view-save-btn" onclick="_viewSaveLong()">Save</button>' +
            '</div>' +

            // Links
            '<div class="view-field-section">' +
                '<label class="view-field-label">Links</label>' +
                '<div id="viewUrlsList"></div>' +
                '<button class="btn btn-small btn-secondary view-add-link-btn" onclick="_viewOpenUrlForm(-1)">+ Add Link</button>' +
            '</div>' +

            // Previous Versions
            '<div class="view-field-section">' +
                '<label class="view-field-label">Previous Versions</label>' +
                '<div id="viewHistoryList"><p class="view-history-empty">Loading...</p></div>' +
            '</div>' +

        '</div>';

    _viewLongLast = longVal;
    _viewWireDetailHandlers();
    _viewRenderUrls();
    _viewLoadHistory();
}

function _viewWireDetailHandlers() {
    var shortEl = document.getElementById('viewShortInput');
    var longEl  = document.getElementById('viewLongInput');
    if (shortEl) shortEl.oninput = function() {
        var c = document.getElementById('viewShortCounter');
        if (c) c.textContent = this.value.length + ' / 500';
    };
    if (longEl) {
        longEl.onblur = function() {
            if (this.value !== _viewLongLast) _viewSaveLong();
        };
    }
}

// ─────── Save Functions ───────
function _viewSaveTitle() {
    if (!_viewId || _viewReadOnly) return;
    var el    = document.getElementById('viewTitleInput');
    var title = el ? el.value.trim() : '';
    if (!title) { alert('Title cannot be empty.'); return; }
    thRef('views', _viewId).update({
        title:     title,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function() {
        var crumb = document.getElementById('viewDetailCrumb');
        if (crumb) crumb.textContent = title;
    }).catch(function(err) { console.error('_viewSaveTitle error:', err); });
}

function _viewSaveShort() {
    if (!_viewId || _viewReadOnly) return;
    var el  = document.getElementById('viewShortInput');
    var val = el ? el.value : '';
    thRef('views', _viewId).update({
        shortVersion: val,
        updatedAt:    firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function(err) { console.error('_viewSaveShort error:', err); });
}

function _viewSaveLong() {
    if (!_viewId || _viewReadOnly) return;
    var el  = document.getElementById('viewLongInput');
    var val = el ? el.value : '';
    _viewLongLast = val;
    thRef('views', _viewId).update({
        longVersion: val,
        updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function(err) { console.error('_viewSaveLong error:', err); });
}

function _viewSaveCategory() {
    if (!_viewId || _viewReadOnly) return;
    var majorEl = document.getElementById('viewMajorCatSelect');
    var subEl   = document.getElementById('viewSubCatSelect');
    var catId   = majorEl ? majorEl.value : '';
    var subId   = subEl   ? subEl.value   : '';
    thRef('views', _viewId).update({
        categoryId:    catId || null,
        subcategoryId: subId || null,
        updatedAt:     firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function(err) { console.error('_viewSaveCategory error:', err); });
}

function _viewDeleteView() {
    if (!_viewId) return;
    if (!confirm('Delete this thought and all its history? This cannot be undone.')) return;
    var delId = _viewId;
    thRef('views', _viewId).collection('history').get().then(function(snap) {
        var batch = db.batch();
        snap.docs.forEach(function(d) { batch.delete(d.ref); });
        batch.delete(thRef('views', _viewId));
        return batch.commit();
    }).then(function() { return thFinishDelete(delId); })     // a thought shared on its own: remove its share too (sharethought.js)
    .then(function() {
        window.location.hash = '#views';
    }).catch(function(err) { console.error('_viewDeleteView error:', err); });
}

// ══════════════════════════════════════════════════════════════
// ARCHIVE PREVIOUS VERSION FLOW
// ══════════════════════════════════════════════════════════════
function _viewOpenChangedModal() {
    var shortEl = document.getElementById('viewShortInput');
    var longEl  = document.getElementById('viewLongInput');
    document.getElementById('viewChangedShort').value  = shortEl ? shortEl.value : '';
    document.getElementById('viewChangedLong').value   = longEl  ? longEl.value  : '';
    document.getElementById('viewChangedPrompt').value = '';

    // Update modal title to match thought type
    var titleEl = document.getElementById('viewChangedModalTitle');
    if (titleEl && _viewData) {
        titleEl.textContent = _viewChangedBtnLabel(_viewData.thoughtType || 'view');
    }

    openModal('viewChangedModal');
}

function _viewSaveChangedView() {
    if (!_viewId) return;
    var shortVal  = document.getElementById('viewChangedShort').value;
    var longVal   = document.getElementById('viewChangedLong').value;
    var promptVal = (document.getElementById('viewChangedPrompt').value || '').trim();

    var saveBtn = document.getElementById('viewChangedSaveBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

    var histRef = thRef('views', _viewId).collection('history').doc();
    var batch   = db.batch();
    batch.set(histRef, {
        shortVersion: shortVal,
        longVersion:  longVal,
        prompt:       promptVal || null,
        archivedAt:   firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.update(thRef('views', _viewId), {
        currentDate:  firebase.firestore.FieldValue.serverTimestamp(),
        historyCount: firebase.firestore.FieldValue.increment(1),
        updatedAt:    firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.commit().then(function() {
        closeModal('viewChangedModal');
        loadViewDetailPage(_viewId);
    }).catch(function(err) {
        console.error('_viewSaveChangedView error:', err);
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Archive & Continue'; }
    });
}

// ══════════════════════════════════════════════════════════════
// HISTORY LIST  (on detail page)
// ══════════════════════════════════════════════════════════════
function _viewLoadHistory() {
    var container = document.getElementById('viewHistoryList');
    if (!container) return;
    thRef('views', _viewId).collection('history')
        .orderBy('archivedAt', 'desc').get()
        .then(function(snap) {
            if (snap.empty) {
                container.innerHTML = '<p class="view-history-empty">No previous versions yet.</p>';
                return;
            }
            var html = snap.docs.map(function(doc) {
                var dateStr = _viewFormatDate(doc.data().archivedAt);
                return '<div class="view-history-row">' +
                    '<a href="#view-history/' + _viewId + '/' + doc.id + '" class="view-history-link">' +
                        dateStr + '</a>' +
                    '<button class="view-url-btn" title="Delete" ' +
                        'onclick="_viewDeleteHistoryEntry(\'' + doc.id + '\')">&#x2715;</button>' +
                '</div>';
            }).join('');
            container.innerHTML = html;
        }).catch(function(err) {
            console.error('_viewLoadHistory error:', err);
            container.innerHTML = '<p class="view-history-empty">Error loading history.</p>';
        });
}

function _viewDeleteHistoryEntry(historyId) {
    if (!confirm('Delete this archived version? This cannot be undone.')) return;
    var batch = db.batch();
    batch.delete(thRef('views', _viewId).collection('history').doc(historyId));
    batch.update(thRef('views', _viewId), {
        historyCount: firebase.firestore.FieldValue.increment(-1),
        updatedAt:    firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.commit().then(function() { _viewLoadHistory(); })
        .catch(function(err) { console.error('_viewDeleteHistoryEntry error:', err); });
}

// ══════════════════════════════════════════════════════════════
// HISTORY DETAIL PAGE  (#view-history/:viewId/:historyId)
// ══════════════════════════════════════════════════════════════
function loadViewHistoryPage(viewId, historyId) {
    var container = document.getElementById('viewHistoryContent');
    if (!container) return;
    container.innerHTML = '<p class="views-empty-state">Loading...</p>';

    thDocGet('views', viewId).then(function(vDoc) {      // finds the thought wherever it lives (sharethought.js)
        return thRef('views', viewId).collection('history').doc(historyId).get().then(function(hDoc) { return [vDoc, hDoc]; });
    }).then(function(results) {
        var viewDoc = results[0];
        var histDoc = results[1];

        if (!viewDoc.exists || !histDoc.exists) {
            container.innerHTML = '<p class="views-empty-state">Entry not found. <a href="#views">Back to My Thoughts</a></p>';
            return;
        }

        var vd      = viewDoc.data();
        var hd      = histDoc.data();
        var title   = vd.title || 'Untitled';
        var dateStr = _viewFormatDate(hd.archivedAt);

        var crumb = document.getElementById('breadcrumbBar');
        if (crumb) crumb.innerHTML =
            '<a href="#thoughts">Thoughts</a><span class="separator">&rsaquo;</span>' +
            '<a href="#views">My Thoughts</a><span class="separator">&rsaquo;</span>' +
            '<a href="#view/' + viewId + '">' + _viewEsc(title) + '</a>' +
            '<span class="separator">&rsaquo;</span>' +
            '<span>' + _viewEsc(dateStr) + '</span>';

        container.innerHTML =
            '<div class="view-detail-container">' +

                '<div class="view-history-page-header">' +
                    '<h2 class="view-new-heading">' + _viewEsc(title) + '</h2>' +
                    '<span class="view-history-page-date">Archived ' + _viewEsc(dateStr) + '</span>' +
                '</div>' +

                '<div class="view-history-badge-readonly">Previous Version — Read Only</div>' +

                (hd.prompt ?
                    '<div class="view-field-section">' +
                        '<label class="view-field-label">What prompted this change?</label>' +
                        '<p class="view-history-prompt">' + _viewEsc(hd.prompt) + '</p>' +
                    '</div>' : '') +

                '<div class="view-field-section">' +
                    '<label class="view-field-label">Short Version</label>' +
                    (hd.shortVersion
                        ? '<p class="view-history-text">' + _viewEsc(hd.shortVersion) + '</p>'
                        : '<p class="view-history-empty">No short version recorded.</p>') +
                '</div>' +

                '<div class="view-field-section">' +
                    '<label class="view-field-label">Long Version</label>' +
                    (hd.longVersion
                        ? '<div class="view-history-long">' + _viewEsc(hd.longVersion).replace(/\n/g, '<br>') + '</div>'
                        : '<p class="view-history-empty">No long version recorded.</p>') +
                '</div>' +

                '<div class="view-history-actions">' +
                    '<a href="#view/' + viewId + '" class="btn btn-secondary">&larr; Back</a>' +
                    '<button class="btn btn-danger" ' +
                        'onclick="_viewDeleteHistoryPage(\'' + viewId + '\', \'' + historyId + '\')">' +
                        'Delete This Entry</button>' +
                '</div>' +

            '</div>';
        thRenderHistoryControls(viewId);        // View-only look (sharethought.js)
    }).catch(function(err) {
        console.error('loadViewHistoryPage error:', err);
        container.innerHTML = '<p class="views-empty-state">Error loading entry.</p>';
    });
}

function _viewDeleteHistoryPage(viewId, historyId) {
    if (!confirm('Delete this archived version? This cannot be undone.')) return;
    var batch = db.batch();
    batch.delete(thRef('views', viewId).collection('history').doc(historyId));
    batch.update(thRef('views', viewId), {
        historyCount: firebase.firestore.FieldValue.increment(-1),
        updatedAt:    firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.commit().then(function() {
        window.location.hash = '#view/' + viewId;
    }).catch(function(err) { console.error('_viewDeleteHistoryPage error:', err); });
}

// ══════════════════════════════════════════════════════════════
// LINKS SECTION
// ══════════════════════════════════════════════════════════════
function _viewRenderUrls() {
    var container = document.getElementById('viewUrlsList');
    if (!container) return;
    if (_viewUrls.length === 0) { container.innerHTML = ''; return; }
    var html = _viewUrls.map(function(entry, i) {
        var display = _viewEsc(entry.label || entry.url || '(no URL)');
        var href    = _viewEsc(entry.url || '');
        return '<div class="view-url-row" data-index="' + i + '">' +
            '<a href="' + href + '" target="_blank" rel="noopener" class="view-url-link">&#128279; ' + display + '</a>' +
            '<button class="view-url-btn" title="Edit" onclick="_viewOpenUrlForm(' + i + ')">&#9998;</button>' +
            '<button class="view-url-btn" title="Remove" onclick="_viewDeleteUrl(' + i + ')">&times;</button>' +
        '</div>';
    }).join('');
    container.innerHTML = html;
}

function _viewDeleteUrl(index) {
    _viewUrls.splice(index, 1);
    _viewRenderUrls();
    _viewSaveUrls();
}

function _viewOpenUrlForm(index) {
    var container = document.getElementById('viewUrlsList');
    if (!container) return;
    var existing = index >= 0 ? _viewUrls[index] : { label: '', url: '' };
    var formHtml =
        '<div class="view-url-form" id="viewUrlForm">' +
            '<input type="url" id="viewUrlInput" class="form-control" placeholder="https://..." ' +
                'value="' + _viewEsc(existing.url) + '">' +
            '<input type="text" id="viewUrlLabelInput" class="form-control" placeholder="Label (optional)" ' +
                'value="' + _viewEsc(existing.label) + '">' +
            '<div class="view-url-form-btns">' +
                '<button class="btn btn-small btn-primary" onclick="_viewSubmitUrlForm(' + index + ')">Save</button>' +
                '<button class="btn btn-small btn-secondary" onclick="_viewRenderUrls()">Cancel</button>' +
            '</div>' +
        '</div>';
    if (index >= 0) {
        var rows = container.querySelectorAll('.view-url-row');
        if (rows[index]) { rows[index].outerHTML = formHtml; }
        else { container.insertAdjacentHTML('beforeend', formHtml); }
    } else {
        container.insertAdjacentHTML('beforeend', formHtml);
    }
    var urlInput = document.getElementById('viewUrlInput');
    if (urlInput) urlInput.focus();
}

function _viewSubmitUrlForm(index) {
    var urlInput   = document.getElementById('viewUrlInput');
    var labelInput = document.getElementById('viewUrlLabelInput');
    var url   = urlInput   ? urlInput.value.trim()   : '';
    var label = labelInput ? labelInput.value.trim() : '';
    if (!url) { if (urlInput) urlInput.focus(); return; }
    if (index >= 0) { _viewUrls[index] = { label: label, url: url }; }
    else            { _viewUrls.push({ label: label, url: url }); }
    _viewRenderUrls();
    _viewSaveUrls();
}

function _viewSaveUrls() {
    if (!_viewId || _viewReadOnly) return;
    thRef('views', _viewId).update({
        urls:      _viewUrls.slice(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function(err) { console.error('_viewSaveUrls error:', err); });
}

// ══════════════════════════════════════════════════════════════
// CATEGORY MAINTENANCE PAGE  (#views-categories)
// ══════════════════════════════════════════════════════════════

var _catPageData     = [];
var _catDragType     = null;
var _catDragId       = null;
var _catDragParentId = null;
var _catDragOverEl   = null;

function loadViewsCategoriesPage() {
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML =
        '<a href="#thoughts">Thoughts</a><span class="separator">&rsaquo;</span>' +
        '<a href="#views">My Thoughts</a><span class="separator">&rsaquo;</span>' +
        '<span>Manage Categories</span>';

    var container = document.getElementById('viewsCategoriesContent');
    if (!container) return;
    container.innerHTML = '<p class="views-empty-state">Loading...</p>';

    _viewLoadCatsData(_catPageCurrentType).then(function(cats) {
        _catPageData = cats;
        _viewCatRenderPage();
    }).catch(function(err) {
        console.error('loadViewsCategoriesPage error:', err);
        container.innerHTML = '<p class="views-empty-state">Error loading categories.</p>';
    });
}

function _viewCatSwitchType(newType) {
    _catPageCurrentType = newType;
    var container = document.getElementById('viewsCategoriesContent');
    if (container) container.innerHTML = '<p class="views-empty-state">Loading...</p>';
    _viewLoadCatsData(newType).then(function(cats) {
        _catPageData = cats;
        _viewCatRenderPage();
    });
}

function _viewCatRenderPage() {
    var container = document.getElementById('viewsCategoriesContent');
    if (!container) return;

    // Type selector at top
    var typeSelector =
        '<div class="vcat-type-selector">' +
        THOUGHT_TYPES.map(function(t) {
            return '<button class="view-type-tab' + (t === _catPageCurrentType ? ' active' : '') + '" ' +
                'data-type="' + t + '" onclick="_viewCatSwitchType(\'' + t + '\')">' +
                THOUGHT_TYPE_LABELS[t] + 's</button>';
        }).join('') +
        '</div>';

    var html = typeSelector +
        '<div class="vcat-page"><div id="vcatMajorList">';
    _catPageData.forEach(function(cat) { html += _viewCatMajorHtml(cat); });
    html += '</div>' +
        '<button class="btn btn-secondary vcat-add-major-btn" onclick="_viewCatAddMajor()">+ Add Major Category</button>' +
        '</div>';

    container.innerHTML = html;
}

function _viewCatMajorHtml(cat) {
    var cid = cat.id;
    return (
        '<div class="vcat-major-row" data-cat-id="' + cid + '" draggable="true" ' +
            'ondragstart="_catOnDragStart(event,this,\'major\',\'' + cid + '\',null)" ' +
            'ondragover="_catOnDragOver(event,this,\'major\',null)" ' +
            'ondrop="_catOnDrop(event,this,\'major\',\'' + cid + '\',null)" ' +
            'ondragend="_catOnDragEnd(event,this)">' +
            '<span class="vcat-drag-handle" title="Drag to reorder">&#8942;</span>' +
            '<span class="vcat-row-name" id="vcatMajorName_' + cid + '">' + _viewEsc(cat.name) + '</span>' +
            '<div class="vcat-row-actions">' +
                '<button class="vcat-btn" onclick="_viewCatRename(\'major\',\'' + cid + '\',null)">Rename</button>' +
                '<button class="vcat-btn vcat-btn-danger" onclick="_viewCatDeleteMajor(\'' + cid + '\')">Delete</button>' +
            '</div>' +
        '</div>' +
        '<div class="vcat-sub-list" data-parent-id="' + cid + '">' +
            cat.subs.map(function(sub) { return _viewCatSubHtml(cid, sub); }).join('') +
            '<button class="btn btn-small btn-secondary vcat-add-sub-btn" onclick="_viewCatAddSub(\'' + cid + '\')">+ Add Subcategory</button>' +
        '</div>'
    );
}

function _viewCatSubHtml(catId, sub) {
    var sid  = sub.id;
    var drag = !sub.isDefault
        ? ' draggable="true"' +
          ' ondragstart="_catOnDragStart(event,this,\'sub\',\'' + sid + '\',\'' + catId + '\')"' +
          ' ondragover="_catOnDragOver(event,this,\'sub\',\'' + catId + '\')"' +
          ' ondrop="_catOnDrop(event,this,\'sub\',\'' + sid + '\',\'' + catId + '\')"' +
          ' ondragend="_catOnDragEnd(event,this)"'
        : '';
    return (
        '<div class="vcat-sub-row' + (sub.isDefault ? ' vcat-general-row' : '') + '"' +
            ' data-sub-id="' + sid + '" data-cat-id="' + catId + '"' + drag + '>' +
            (!sub.isDefault
                ? '<span class="vcat-drag-handle" title="Drag to reorder">&#8942;</span>'
                : '<span class="vcat-drag-spacer"></span>') +
            '<span class="vcat-row-name" id="vcatSubName_' + sid + '">' + _viewEsc(sub.name) + '</span>' +
            (sub.isDefault ? '<span class="vcat-default-badge">default</span>' : '') +
            '<div class="vcat-row-actions">' +
                '<button class="vcat-btn" onclick="_viewCatRename(\'sub\',\'' + catId + '\',\'' + sid + '\')">Rename</button>' +
                (!sub.isDefault
                    ? '<button class="vcat-btn vcat-btn-danger" onclick="_viewCatDeleteSub(\'' + catId + '\',\'' + sid + '\')">Delete</button>'
                    : '') +
            '</div>' +
        '</div>'
    );
}

function _viewCatAddMajor() {
    var name = prompt('New major category name:');
    if (!name || !name.trim()) return;
    name = name.trim();
    var maxOrd = _catPageData.length
        ? Math.max.apply(null, _catPageData.map(function(c) { return c.order || 0; })) + 1 : 0;
    var catRef = thNewRef('viewCategories');
    var genRef = catRef.collection('subcategories').doc();
    var batch  = db.batch();
    batch.set(catRef, { name: name, order: maxOrd, thoughtType: _catPageCurrentType, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    batch.set(genRef, { name: 'General', order: 0, isDefault: true, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    batch.commit().then(function() { loadViewsCategoriesPage(); })
        .catch(function(err) { console.error('_viewCatAddMajor error:', err); });
}

function _viewCatAddSub(catId) {
    var name = prompt('New subcategory name:');
    if (!name || !name.trim()) return;
    name = name.trim();
    var cat    = _catPageData.find(function(c) { return c.id === catId; });
    var maxOrd = (cat && cat.subs.length)
        ? Math.max.apply(null, cat.subs.map(function(s) { return s.order || 0; })) + 1 : 1;
    thRef('viewCategories', catId).collection('subcategories').add({
        name: name, order: maxOrd, isDefault: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function() { loadViewsCategoriesPage(); })
        .catch(function(err) { console.error('_viewCatAddSub error:', err); });
}

function _viewCatRename(type, catId, subId) {
    var elemId   = type === 'major' ? 'vcatMajorName_' + catId : 'vcatSubName_' + subId;
    var nameEl   = document.getElementById(elemId);
    if (!nameEl) return;
    var original = nameEl.textContent;

    var input = document.createElement('input');
    input.type = 'text'; input.value = original;
    input.className = 'form-control vcat-rename-input';
    nameEl.replaceWith(input);
    input.focus(); input.select();

    function restore() {
        var span = document.createElement('span');
        span.id = elemId; span.className = 'vcat-row-name'; span.textContent = original;
        if (input.parentNode) input.replaceWith(span);
    }
    function save() {
        var val = input.value.trim();
        if (!val) { restore(); return; }
        var span = document.createElement('span');
        span.id = elemId; span.className = 'vcat-row-name'; span.textContent = val;
        input.onblur = null;
        if (input.parentNode) input.replaceWith(span);
        if (type === 'major') {
            thRef('viewCategories', catId).update({ name: val })
                .catch(function(e) { console.error('rename major:', e); });
            var c = _catPageData.find(function(c) { return c.id === catId; });
            if (c) c.name = val;
        } else {
            thRef('viewCategories', catId).collection('subcategories').doc(subId).update({ name: val })
                .catch(function(e) { console.error('rename sub:', e); });
            var c2 = _catPageData.find(function(c) { return c.id === catId; });
            if (c2) { var s = c2.subs.find(function(s) { return s.id === subId; }); if (s) s.name = val; }
        }
    }
    input.onblur = save;
    input.onkeydown = function(e) {
        if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.onblur = null; restore(); }
    };
}

function _viewCatDeleteMajor(catId) {
    thCol('views').where('categoryId', '==', catId).limit(1).get().then(function(snap) {
        if (!snap.empty) {
            alert('This category still has thoughts assigned to it. Move or delete those thoughts first.');
            return;
        }
        var cat = _catPageData.find(function(c) { return c.id === catId; });
        if (!confirm('Delete "' + (cat ? cat.name : 'this category') + '" and all its subcategories? This cannot be undone.')) return;
        thRef('viewCategories', catId).collection('subcategories').get().then(function(subSnap) {
            var batch = db.batch();
            subSnap.docs.forEach(function(d) { batch.delete(d.ref); });
            batch.delete(thRef('viewCategories', catId));
            return batch.commit();
        }).then(function() { loadViewsCategoriesPage(); })
          .catch(function(err) { console.error('_viewCatDeleteMajor error:', err); });
    }).catch(function(err) { console.error('_viewCatDeleteMajor check:', err); });
}

function _viewCatDeleteSub(catId, subId) {
    thCol('views').where('subcategoryId', '==', subId).get().then(function(snap) {
        var cat     = _catPageData.find(function(c) { return c.id === catId; });
        var sub     = cat ? cat.subs.find(function(s) { return s.id === subId; }) : null;
        var general = cat ? cat.subs.find(function(s) { return s.isDefault; }) : null;
        var subName = sub ? sub.name : 'this subcategory';
        var msg = snap.size > 0
            ? 'Delete "' + subName + '"? ' + snap.size + ' thought' + (snap.size !== 1 ? 's' : '') + ' will be moved to General. Continue?'
            : 'Delete "' + subName + '"?';
        if (!confirm(msg)) return;
        var batch = db.batch();
        if (snap.size > 0 && general) {
            snap.docs.forEach(function(d) { batch.update(d.ref, { subcategoryId: general.id }); });
        }
        batch.delete(thRef('viewCategories', catId).collection('subcategories').doc(subId));
        batch.commit().then(function() { loadViewsCategoriesPage(); })
            .catch(function(err) { console.error('_viewCatDeleteSub error:', err); });
    }).catch(function(err) { console.error('_viewCatDeleteSub check:', err); });
}

// ── Drag-and-drop handlers ──
function _catOnDragStart(event, el, type, id, parentId) {
    _catDragType = type; _catDragId = id; _catDragParentId = parentId;
    event.dataTransfer.effectAllowed = 'move';
    setTimeout(function() { el.classList.add('vcat-dragging'); }, 0);
}

function _catOnDragOver(event, el, type, parentId) {
    if (type !== _catDragType) return;
    if (type === 'sub' && parentId !== _catDragParentId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (_catDragOverEl && _catDragOverEl !== el) _catDragOverEl.classList.remove('vcat-drag-over');
    _catDragOverEl = el;
    el.classList.add('vcat-drag-over');
}

function _catOnDrop(event, el, type, targetId, targetParentId) {
    event.preventDefault();
    if (_catDragOverEl) { _catDragOverEl.classList.remove('vcat-drag-over'); _catDragOverEl = null; }
    if (!_catDragId || _catDragId === targetId || _catDragType !== type) return;
    if (type === 'sub' && _catDragParentId !== targetParentId) return;
    if (type === 'major') { _catReorderMajors(_catDragId, targetId); }
    else                  { _catReorderSubs(_catDragParentId, _catDragId, targetId); }
}

function _catOnDragEnd(event, el) {
    el.classList.remove('vcat-dragging');
    if (_catDragOverEl) { _catDragOverEl.classList.remove('vcat-drag-over'); _catDragOverEl = null; }
    _catDragType = _catDragId = _catDragParentId = null;
}

function _catReorderMajors(draggedId, targetId) {
    var cats = _catPageData.slice();
    var fi = cats.findIndex(function(c) { return c.id === draggedId; });
    var ti = cats.findIndex(function(c) { return c.id === targetId; });
    if (fi < 0 || ti < 0) return;
    cats.splice(ti, 0, cats.splice(fi, 1)[0]);
    var batch = db.batch();
    cats.forEach(function(c, i) { c.order = i; batch.update(thRef('viewCategories', c.id), { order: i }); });
    _catPageData = cats;
    batch.commit().catch(function(err) { console.error('_catReorderMajors error:', err); });
    _viewCatRenderPage();
}

function _catReorderSubs(catId, draggedId, targetId) {
    var cat = _catPageData.find(function(c) { return c.id === catId; });
    if (!cat) return;
    var subs = cat.subs.slice();
    var fi = subs.findIndex(function(s) { return s.id === draggedId; });
    var ti = subs.findIndex(function(s) { return s.id === targetId; });
    if (fi < 0 || ti < 0 || subs[ti].isDefault) return;
    subs.splice(ti, 0, subs.splice(fi, 1)[0]);
    var batch = db.batch();
    subs.forEach(function(s, i) { s.order = i; batch.update(thRef('viewCategories', catId).collection('subcategories').doc(s.id), { order: i }); });
    cat.subs = subs;
    batch.commit().catch(function(err) { console.error('_catReorderSubs error:', err); });
    _viewCatRenderPage();
}
