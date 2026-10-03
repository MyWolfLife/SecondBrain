// ============================================================
// Search.js — Global search across all entity types
// Searches all named entities by name/title; results link
// directly to each entity's detail page.
// ============================================================

var searchDebounceTimer = null;
var SEARCH_DEBOUNCE_MS  = 350;   // Wait this long after last keystroke before firing

/**
 * Called by the router when navigating to #search.
 * Auto-focuses the input on desktop and wires the listener (once).
 */
function loadSearchPage() {
    var input   = document.getElementById('searchInput');
    var results = document.getElementById('searchResults');
    var empty   = document.getElementById('searchEmptyState');
    if (!input) return;

    // Clear previous run
    results.innerHTML = '';
    empty.classList.add('hidden');

    // Wire up input handler only once (guard with a data flag)
    if (!input.dataset.wired) {
        input.dataset.wired = 'true';
        input.addEventListener('input', function () {
            clearTimeout(searchDebounceTimer);
            var q = input.value.trim();

            // Need at least 2 chars before searching
            if (q.length < 2) {
                results.innerHTML = '';
                empty.classList.add('hidden');
                return;
            }

            searchDebounceTimer = setTimeout(function () {
                runSearch(q);
            }, SEARCH_DEBOUNCE_MS);
        });
    }

    // Auto-focus on desktop; skip on mobile to avoid the keyboard popping up
    // before the user is ready
    if (window.innerWidth > 640) {
        input.focus();
    }
}

/**
 * Load all docs from all searchable collections, filter by name/title,
 * and render grouped results.
 * @param {string} query - The raw search string entered by the user
 */
function runSearch(query) {
    var q         = query.toLowerCase();
    var resultsEl = document.getElementById('searchResults');
    var emptyEl   = document.getElementById('searchEmptyState');

    resultsEl.innerHTML = '<p class="search-loading">Searching…</p>';
    emptyEl.classList.add('hidden');

    // Define every collection to search.
    // urlFn builds the hash URL to navigate to when the user clicks a result.
    // nameField: which doc field holds the display name ('name' or 'title').
    var colDefs = [
        // ── Yard ──
        { col: 'plants',             label: 'Plants',               icon: '🌱', nameField: 'name',  urlFn: function(id) { return '#plant/'           + id; } },
        { col: 'zones',              label: 'Zones',                icon: '🗺️',  nameField: 'name',  urlFn: function(id) { return '#zone/'            + id; } },
        { col: 'chemicals',          label: 'Chemicals',            icon: '🧪', nameField: 'name',  urlFn: function(id) { return '#chemical/'        + id; } },
        { col: 'weeds',              label: 'Weeds',                icon: '🌿', nameField: 'name',  urlFn: function(id) { return '#weed/'            + id; } },
        // ── House ──
        { col: 'floors',             label: 'Floors',               icon: '🏠', nameField: 'name',  urlFn: function(id) { return '#floor/'           + id; } },
        { col: 'rooms',              label: 'Rooms',                icon: '🚪', nameField: 'name',  urlFn: function(id) { return '#room/'            + id; } },
        { col: 'things',             label: 'Things',               icon: '📦', nameField: 'name',  urlFn: function(id) { return '#thing/'           + id; } },
        { col: 'subThings',          label: 'Sub-Things',           icon: '🔩', nameField: 'name',  urlFn: function(id) { return '#subthing/'        + id; } },
        // ── Structures ──
        { col: 'structures',         label: 'Structures',           icon: '🏗️', nameField: 'name',  urlFn: function(id) { return '#structure/'       + id; } },
        { col: 'structureThings',    label: 'Structure Things',     icon: '📦', nameField: 'name',  urlFn: function(id) { return '#structurething/'  + id; } },
        { col: 'structureSubThings', label: 'Structure Sub-Things', icon: '🔩', nameField: 'name',  urlFn: function(id) { return '#structuresubthing/' + id; } },
        // ── Garage ──
        { col: 'garageRooms',        label: 'Garage Areas',         icon: '🚗', nameField: 'name',  urlFn: function(id) { return '#garageroom/'      + id; } },
        { col: 'garageThings',       label: 'Garage Things',        icon: '📦', nameField: 'name',  urlFn: function(id) { return '#garagething/'     + id; } },
        { col: 'garageSubThings',    label: 'Garage Sub-Things',    icon: '🔩', nameField: 'name',  urlFn: function(id) { return '#garagesubthing/' + id; } },
        // ── Vehicles ──
        { col: 'vehicles',           label: 'Vehicles',             icon: '🚙', nameField: 'name',  urlFn: function(id) { return '#vehicle/'         + id; } },
        // ── Collections ──
        { col: 'collections',        label: 'Collections',          icon: '🗃️', nameField: 'name',  urlFn: function(id) { return '#collection/'      + id; } },
        { col: 'collectionItems',    label: 'Collection Items',     icon: '🏷️', nameField: 'name',  urlFn: function(id) { return '#collectionitem/'  + id; } },
        // ── Life ──
        { col: 'people',             label: 'Contacts',             icon: '👤', nameField: 'name',  urlFn: function(id) { return '#contact/'         + id; } },
        { col: 'notebooks',          label: 'Notebooks',            icon: '📓', nameField: 'name',  urlFn: function(id) { return '#notebook/'        + id; } },
        { col: 'places',             label: 'Places',               icon: '📍', nameField: 'name',  urlFn: function(id) { return '#place/'           + id; } },
        { col: 'bucketList',         label: 'Bucket List',          icon: '🗺️', nameField: 'name',  urlFn: function(id) { return '#bucketitem/'      + id; } },
        { col: 'lifeProjects',       label: 'Life Projects',        icon: '✈️', nameField: 'title', urlFn: function(id) { return '#life-project/'    + id; } },
        // ── Thoughts ──
        { col: 'memories',           label: 'Memories',             icon: '💭', nameField: 'title',       urlFn: function(id)       { return '#memory-edit/'     + id; } },
        { col: 'views',              label: 'My Views',             icon: '💬', nameField: 'title',       urlFn: function(id)       { return '#view/'            + id; } },
        { col: 'top10lists',         label: 'Top 10 Lists',         icon: '🔟', nameField: 'title',       urlFn: function(id)       { return '#top10list-edit/'  + id; } },
        // ── Activities ──
        { col: 'activities',         label: 'Activities',           icon: '📋', nameField: 'description', urlFn: function(id, data) { return _activityTargetRoute(data); } },
        // ── Checklists ──
        { col: 'checklistTemplates', label: 'Checklist Templates',  icon: '📋',
          nameField: 'name',
          matchFn: function(d, q) {
              if ((d.name || '').toLowerCase().indexOf(q) !== -1) return true;
              if ((d.tags || []).some(function(t) { return t.toLowerCase().indexOf(q) !== -1; })) return true;
              if ((d.items || []).some(function(i) { return (i.label || '').toLowerCase().indexOf(q) !== -1; })) return true;
              return false;
          },
          urlFn: function(id, data) {
              var t  = data.targetType || 'yard';
              var ti = data.targetId   || '';
              return '#checklists/' + t + (ti ? '/' + ti : '');
          }
        },
        { col: 'checklistRuns',      label: 'Active Lists',         icon: '✅',
          nameField: 'templateName',
          matchFn: function(d, q) {
              if (d.archived) return false;
              if ((d.templateName || '').toLowerCase().indexOf(q) !== -1) return true;
              if ((d.tags || []).some(function(t) { return t.toLowerCase().indexOf(q) !== -1; })) return true;
              if ((d.items || []).some(function(i) { return (i.label || '').toLowerCase().indexOf(q) !== -1; })) return true;
              return false;
          },
          urlFn: function(id, data) {
              var t  = data.targetType || 'yard';
              var ti = data.targetId   || '';
              return '#checklist-focus/' + id + '/' + t + (ti ? '/' + ti : '');
          }
        },
        // ── Notes ──
        { col: 'notes',              label: 'Notes',                icon: '📝',
          nameField: 'body',
          matchFn: function(d, q) {
              return (d.body || '').toLowerCase().indexOf(q) !== -1;
          },
          urlFn: function(id, data) { return '#notebook/' + (data.notebookId || ''); }
        },
    ];

    var includeJournal = !!(document.getElementById('searchIncludeJournal') || {}).checked;

    // Fetch ALL docs from every collection in parallel.
    // We load everything (not just matches) so we can build cross-reference
    // name maps — e.g. show which zone a plant lives in.
    var promises = colDefs.map(function (def) {
        return userCol(def.col).get().then(function (snap) {
            var all = [];
            snap.forEach(function (doc) {
                all.push({ id: doc.id, data: doc.data() });
            });
            return { def: def, all: all };
        });
    });

    // Optionally fetch journal entries separately (body-text search, heavier)
    var journalPromise = includeJournal
        ? userCol('journalEntries').get().then(function(snap) {
            var all = [];
            snap.forEach(function(doc) { all.push({ id: doc.id, data: doc.data() }); });
            return all;
          })
        : Promise.resolve(null);

    Promise.all([Promise.all(promises), journalPromise]).then(function (both) {
        var loaded       = both[0];
        var journalDocs  = both[1]; // null when toggle off

        // Build name maps keyed by collection → { docId: name }
        // Used to add helpful hints under each result (e.g. zone name for a plant)
        var nameMap = {};
        loaded.forEach(function (g) {
            nameMap[g.def.col] = {};
            g.all.forEach(function (item) {
                nameMap[g.def.col][item.id] = item.data.name || item.data.title || '';
            });
        });

        // Filter each collection's docs by the search term
        resultsEl.innerHTML = '';
        var totalFound = 0;

        loaded.forEach(function (g) {
            var matches = g.all.filter(function (item) {
                if (g.def.matchFn) return g.def.matchFn(item.data, q);
                var val = (item.data[g.def.nameField] || '').toLowerCase();
                return val.indexOf(q) !== -1;
            });

            if (matches.length === 0) return;
            totalFound += matches.length;
            resultsEl.appendChild(renderSearchGroup(g.def, matches, nameMap));
        });

        // Journal entries — body-text search with excerpt display
        if (journalDocs) {
            var journalMatches = journalDocs.filter(function(item) {
                return (item.data.entryText || '').toLowerCase().indexOf(q) !== -1;
            });
            if (journalMatches.length > 0) {
                totalFound += journalMatches.length;
                resultsEl.appendChild(renderJournalGroup(journalMatches, q));
            }
        }

        if (totalFound === 0) {
            emptyEl.textContent = 'No results found for "' + escapeHtml(query) + '".';
            emptyEl.classList.remove('hidden');
        }

    }).catch(function (err) {
        console.error('Search error:', err);
        resultsEl.innerHTML = '';
        emptyEl.textContent = 'Search error — please try again.';
        emptyEl.classList.remove('hidden');
    });
}

/**
 * Build a result group for journal entries.
 * Displays a date + excerpt centered on the match instead of a name.
 */
function renderJournalGroup(matches, q) {
    var section = document.createElement('div');
    section.className = 'search-group';

    var heading = document.createElement('h3');
    heading.className = 'search-group-heading';
    heading.textContent = '📓 Journal Entries (' + matches.length + ')';
    section.appendChild(heading);

    var list = document.createElement('ul');
    list.className = 'search-group-list';

    matches.forEach(function(item) {
        var li  = document.createElement('li');
        var a   = document.createElement('a');
        a.href      = '#journal-entry/' + item.id;
        a.className = 'search-result-name';
        // Show the date as the link text, excerpt below as the hint
        var dateStr = item.data.date || '';
        a.textContent = dateStr ? _formatJournalDate(dateStr) : '(No date)';
        li.appendChild(a);

        var excerpt = _journalExcerpt(item.data.entryText || '', q);
        if (excerpt) {
            var span = document.createElement('span');
            span.className   = 'search-result-hint';
            span.textContent = excerpt;
            li.appendChild(span);
        }

        list.appendChild(li);
    });

    section.appendChild(list);
    return section;
}

/** Format a YYYY-MM-DD date string to "Mon D, YYYY" for display. */
function _formatJournalDate(dateStr) {
    var parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    var d = new Date(parts[0], parseInt(parts[1], 10) - 1, parts[2]);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Extract ~120 chars from text centered around the first match of query.
 * Adds ellipsis where text is trimmed.
 */
function _journalExcerpt(text, query) {
    if (!text) return '';
    var lc  = text.toLowerCase();
    var idx = lc.indexOf(query.toLowerCase());
    if (idx === -1) return text.length > 120 ? text.substring(0, 120) + '…' : text;
    var start   = Math.max(0, idx - 50);
    var end     = Math.min(text.length, idx + query.length + 70);
    return (start > 0 ? '…' : '') + text.substring(start, end) + (end < text.length ? '…' : '');
}

/**
 * Build a DOM element for one result group (one entity type).
 * Adds a subtle hint line beneath each result where useful context exists.
 *
 * @param {object} def     - Collection definition (label, icon, col, urlFn, nameField)
 * @param {Array}  matches - Array of {id, data} objects that matched the query
 * @param {object} nameMap - Cross-reference map: col → {docId: name}
 * @returns {HTMLElement}
 */
function renderSearchGroup(def, matches, nameMap) {
    var section = document.createElement('div');
    section.className = 'search-group';

    // Heading: icon + type label + count
    var heading = document.createElement('h3');
    heading.className = 'search-group-heading';
    heading.textContent = def.icon + '\u2009' + def.label + ' (' + matches.length + ')';
    section.appendChild(heading);

    var list = document.createElement('ul');
    list.className = 'search-group-list';

    matches.forEach(function (item) {
        var li = document.createElement('li');

        // Main clickable link
        var a = document.createElement('a');
        a.href      = def.urlFn(item.id, item.data);
        a.className = 'search-result-name';
        var displayText = item.data[def.nameField] || item.data.name || item.data.title || '(Unnamed)';
        // Truncate long descriptions (activities) to keep results readable
        a.textContent = displayText.length > 80 ? displayText.substring(0, 80) + '…' : displayText;
        li.appendChild(a);

        // Optional secondary hint showing the parent context
        var hint = _searchGetHint(def.col, item.data, nameMap);
        if (hint) {
            var span = document.createElement('span');
            span.className   = 'search-result-hint';
            span.textContent = hint;
            li.appendChild(span);
        }

        list.appendChild(li);
    });

    section.appendChild(list);
    return section;
}

/**
 * Return a short hint string showing the parent entity name, or '' if none.
 */
function _searchGetHint(col, data, nameMap) {
    switch (col) {
        case 'plants':             return (nameMap['zones']          || {})[data.zoneId]          || '';
        case 'things':             return (nameMap['rooms']          || {})[data.roomId]           || '';
        case 'subThings':          return (nameMap['things']         || {})[data.thingId]          || '';
        case 'structureThings':    return (nameMap['structures']     || {})[data.structureId]      || '';
        case 'structureSubThings': return (nameMap['structureThings']|| {})[data.thingId]          || '';
        case 'garageThings':       return (nameMap['garageRooms']    || {})[data.roomId]           || '';
        case 'garageSubThings':    return (nameMap['garageThings']   || {})[data.thingId]          || '';
        case 'collectionItems':    return (nameMap['collections']    || {})[data.collectionId]     || '';
        case 'activities':          return _activityHint(data, nameMap);
        case 'checklistTemplates':  return data.targetName || '';
        case 'checklistRuns':       return (data.targetName ? data.targetName + ' · ' : '') + (data.completedAt ? 'completed' : 'active');
        case 'notes':               return (nameMap['notebooks'] || {})[data.notebookId] || '';
        default:                   return '';
    }
}

/**
 * Map an activity's targetType to its parent entity's detail route.
 * The URL goes to the parent (plant, zone, etc.) since activities have no standalone page.
 */
function _activityTargetRoute(data) {
    var id = data.targetId || '';
    switch (data.targetType) {
        case 'plant':             return '#plant/'           + id;
        case 'zone':              return '#zone/'            + id;
        case 'weed':              return '#weed/'            + id;
        case 'chemical':          return '#chemical/'        + id;
        case 'room':              return '#room/'            + id;
        case 'thing':             return '#thing/'           + id;
        case 'subthing':          return '#subthing/'        + id;
        case 'structure':         return '#structure/'       + id;
        case 'structurething':    return '#structurething/'  + id;
        case 'structuresubthing': return '#structuresubthing/' + id;
        case 'garagething':       return '#garagething/'     + id;
        case 'garagesubthing':    return '#garagesubthing/'  + id;
        case 'vehicle':           return '#vehicle/'         + id;
        case 'place':             return '#place/'           + id;
        default:                  return '#zones';
    }
}

/**
 * Return the parent entity name as a hint for an activity result.
 * Looks up the targetId in whichever nameMap collection matches targetType.
 */
function _activityHint(data, nameMap) {
    var id = data.targetId || '';
    switch (data.targetType) {
        case 'plant':             return (nameMap['plants']           || {})[id] || '';
        case 'zone':              return (nameMap['zones']            || {})[id] || '';
        case 'weed':              return (nameMap['weeds']            || {})[id] || '';
        case 'chemical':          return (nameMap['chemicals']        || {})[id] || '';
        case 'room':              return (nameMap['rooms']            || {})[id] || '';
        case 'thing':             return (nameMap['things']           || {})[id] || '';
        case 'subthing':          return (nameMap['subThings']        || {})[id] || '';
        case 'structure':         return (nameMap['structures']       || {})[id] || '';
        case 'structurething':    return (nameMap['structureThings']  || {})[id] || '';
        case 'structuresubthing': return (nameMap['structureSubThings']|| {})[id] || '';
        case 'garagething':       return (nameMap['garageThings']     || {})[id] || '';
        case 'garagesubthing':    return (nameMap['garageSubThings']  || {})[id] || '';
        case 'vehicle':           return (nameMap['vehicles']         || {})[id] || '';
        case 'place':             return (nameMap['places']           || {})[id] || '';
        default:                  return '';
    }
}
