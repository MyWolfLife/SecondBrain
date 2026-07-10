// ============================================================
// help.js — In-app help system
// Fetches AppHelp.md once, parses screen sections, renders
// the Help Page, and handles the "Ask AI" Q&A flow.
// ============================================================

var _helpCache          = null;  // full AppHelp.md text, cached after first fetch
var _helpQA             = [];    // Q&A pairs for the current help page session
var _helpAiOpen         = false; // whether the Ask AI panel is expanded
var _helpLlmConfigured  = null;  // null = unchecked, true/false after first check
var _helpCurrentScreen  = null;  // screenName last loaded -- used by Topics button
var HELP_COMPACT_AT     = 3;     // collapse older Q&A after this many visible pairs

// Maps URL route slugs to AppHelp.md section keys.
//
// Two purposes:
//   1. Remapping — when a route slug doesn't directly match the help section key
//      (e.g. 'investments-ai-analysis' → 'investments-ai')
//   2. Anchor points — multi-segment routes whose slug DOES match the section key
//      are listed here so openHelpForCurrentScreen knows to stop truncating
//      (e.g. 'investments-snapshots' → 'investments-snapshots').
//
// openHelpForCurrentScreen uses longest-prefix-match against this map, trying
// progressively shorter slug prefixes until it finds an entry or reaches the
// first segment. This correctly resolves sub-page routes (investments/snapshots
// → investments-snapshots help) without breaking entity-detail routes that have
// dynamic IDs (contact/{id} → falls back to just "contact").
var HELP_SECTION_MAP = {
    // Single-segment remaps (existing)
    'zones'               : 'zones',
    'home'                : 'zones',   // legacy alias
    'concept-activities'  : 'concept:activities',
    'concept-photos'      : 'concept:photos',
    'concept-facts'       : 'concept:facts',
    'concept-problems'    : 'concept:problems',
    'concept-quicktasks'  : 'concept:quicktasks',
    'health-concern'      : 'health-concern',
    'health-condition'    : 'health-condition',

    // ── Investments sub-routes ──────────────────────────────────
    'investments-snapshots'          : 'investments-snapshots',
    'investments-snapshots-daily'    : 'investments-snapshots',   // dedicated type page
    'investments-snapshots-weekly'   : 'investments-snapshots',
    'investments-snapshots-monthly'  : 'investments-snapshots',
    'investments-snapshots-yearly'   : 'investments-snapshots',
    'investments-accounts'           : 'investments-accounts',
    'investments-accounts-add'       : 'investments-accounts',
    'investments-accounts-edit'      : 'investments-accounts',  // trailing id stripped
    'investments-account'            : 'investments-account',   // trailing {ns}/{id} stripped
    'investments-groups'             : 'investments-groups',
    'investments-group-new'          : 'investments-groups',
    'investments-group-edit'         : 'investments-groups',    // trailing id stripped
    'investments-stocks'             : 'investments-stocks',
    'investments-summary'            : 'investments-summary',
    'investments-ss-benefits'        : 'investments-ss-benefits',
    'investments-ss-benefits-new'    : 'investments-ss-form',
    'investments-ss-benefits-edit'   : 'investments-ss-form',   // trailing person key stripped
    'investments-import'             : 'investments-import',
    'investments-ai-analysis'        : 'investments-ai',        // route slug differs from section key

    // ── Life sub-routes ─────────────────────────────────────────
    'life-calendar'                  : 'lifecalendar',          // route slug differs from section key

    // ── Budget sub-routes ───────────────────────────────────────
    'budget-nonmonthly'              : 'budget-nonmonthly',     // trailing id stripped

    // ── Stock Analyzer sub-routes (placeholders share the hub section until built) ──
    'analyzer-universe'              : 'analyzer-universe',
    'analyzer-backtest'              : 'analyzer-backtest',
    'analyzer-scan'                  : 'analyzer-scan',

    // ── Legacy sub-routes ───────────────────────────────────────
    'legacy-burial'                  : 'legacy-burial',
    'legacy-service'                 : 'legacy-service',
    'legacy-obituary'                : 'legacy-obituary',
    'legacy-social'                  : 'legacy',
    'legacy-accounts'                : 'legacy-accounts',
    'legacy-accounts-accounts'       : 'legacy-accounts',
    'legacy-accounts-loans'          : 'legacy-financial-loans',
    'legacy-accounts-loans-add'      : 'legacy-loans-form',
    'legacy-accounts-loans-edit'     : 'legacy-loans-form',     // trailing id stripped
    'legacy-accounts-bills'          : 'legacy-financial-bills',
    'legacy-accounts-bills-add'      : 'legacy-bills-form',
    'legacy-accounts-bills-edit'     : 'legacy-bills-form',     // trailing id stripped
    'legacy-accounts-insurance'      : 'legacy-financial-insurance',
    'legacy-accounts-insurance-add'  : 'legacy-insurance-form',
    'legacy-accounts-insurance-edit' : 'legacy-insurance-form', // trailing id stripped
    'legacy-accounts-plan'           : 'legacy-financial-plan',
    'legacy-documents'               : 'legacy-documents',
    'legacy-household'               : 'legacy',
    'legacy-pets'                    : 'legacy-pets',
    'legacy-notify'                  : 'legacy-notify',
    'legacy-letters'                 : 'legacy-letters',
    'legacy-letter'                  : 'legacy-letter',         // trailing id stripped
    'legacy-intro'                   : 'legacy',
    'legacy-message'                 : 'legacy-message'
};

// Topic index — shown on #help/main as a clickable hub
var HELP_TOPIC_MAP = [
    {
        section: 'Yard & Garden',
        topics: [
            { label: 'Yard Home (Zones)',     key: 'zones'        },
            { label: 'Zone Detail',           key: 'zone'         },
            { label: 'Plant Detail',          key: 'plant'        },
            { label: 'Weeds',                 key: 'weeds'        },
            { label: 'Weed Detail',           key: 'weed'         },
            { label: 'Chemicals & Products',  key: 'chemicals'    },
            { label: 'Chemical Detail',       key: 'chemical'     },
            { label: 'Saved Actions',         key: 'actions'      },
            { label: 'Calendar Events',       key: 'calendar'     },
            { label: 'Activity Report',       key: 'activityreport'},
            { label: 'Yard Problems',         key: 'yard-problems'},
            { label: 'Yard Quick Tasks',      key: 'yard-projects'}
        ]
    },
    {
        section: 'Concepts',
        topics: [
            { label: 'Activities',  key: 'concept-activities' },
            { label: 'Photos',      key: 'concept-photos'     },
            { label: 'Facts',       key: 'concept-facts'      },
            { label: 'Problems',    key: 'concept-problems'   },
            { label: 'Quick Tasks', key: 'concept-quicktasks' }
        ]
    },
    {
        section: 'House',
        topics: [
            { label: 'House Home',          key: 'house'           },
            { label: 'Floor Detail',        key: 'floor'           },
            { label: 'Room Detail',         key: 'room'            },
            { label: 'Thing Detail',        key: 'thing'           },
            { label: 'Sub-Thing Detail',    key: 'subthing'        },
            { label: 'Floor Plan',          key: 'floorplan'       },
            { label: 'Floor Plan Item',     key: 'floorplanitem'   },
            { label: 'House Problems',      key: 'house-problems'  },
            { label: 'House Quick Tasks',   key: 'house-projects'  }
        ]
    },
    {
        section: 'Health',
        topics: [
            { label: 'Health Home',       key: 'health'                },
            { label: 'Appointments',      key: 'health-appointments'   },
            { label: 'Health Visits',     key: 'health-visits'         },
            { label: 'Concerns',          key: 'health-concerns'       },
            { label: 'Conditions',        key: 'health-conditions'     },
            { label: 'Medications',       key: 'health-medications'    },
            { label: 'Supplements',       key: 'health-supplements'    },
            { label: 'Blood Work',        key: 'health-bloodwork'      },
            { label: 'Vitals',            key: 'health-vitals'         },
            { label: 'Insurance',         key: 'health-insurance'      },
            { label: 'Emergency Info',    key: 'health-emergency'      },
            { label: 'Allergies',         key: 'health-allergies'      },
            { label: 'Vaccinations',      key: 'health-vaccinations'   },
            { label: 'Eye / Glasses',     key: 'health-eye'            },
            { label: 'My Care Team',      key: 'health-care-team'      }
        ]
    },
    {
        section: 'Vehicles & Storage',
        topics: [
            { label: 'Vehicles',          key: 'vehicles'   },
            { label: 'Garage',            key: 'garage'     },
            { label: 'Structures',        key: 'structures' },
            { label: 'Collections',       key: 'collections'}
        ]
    },
    {
        section: 'Life',
        topics: [
            { label: 'Life Home',       key: 'life'         },
            { label: 'Journal',         key: 'journal'      },
            { label: 'Contacts',        key: 'contacts'     },
            { label: 'Notes',           key: 'notes'        },
            { label: 'Life Calendar',   key: 'lifecalendar' }
        ]
    },
    {
        section: 'Thoughts',
        topics: [
            { label: 'Thoughts Home',  key: 'thoughts'   },
            { label: 'Top 10 Lists',   key: 'top10lists' },
            { label: 'Memories',       key: 'memories'   },
            { label: 'My Views',       key: 'views'      }
        ]
    },
    {
        section: 'App Setup',
        topics: [
            { label: 'Settings & AI Setup', key: 'settings' }
        ]
    }
];

// Human-readable labels for screen names used in the page title
var HELP_SCREEN_LABELS = {
    'main'          : 'Getting Started',
    'zones'         : 'Yard — Zones',
    'zone'          : 'Zone Detail',
    'plant'         : 'Plant Detail',
    'weeds'         : 'Weeds',
    'weed'          : 'Weed Detail',
    'chemicals'     : 'Chemicals & Products',
    'chemical'      : 'Chemical Detail',
    'actions'       : 'Saved Actions',
    'calendar'      : 'Calendar Events',
    'activityreport': 'Activity Report',
    'gpsmap'        : 'GPS Map',
    'analyzer'      : 'Stock Analyzer',
    'yardmap'       : 'Yard Map',
    'yard-problems' : 'Yard Problems',
    'yard-projects' : 'Yard Quick Tasks',
    'house'          : 'House',
    'floor'          : 'Floor Detail',
    'room'           : 'Room Detail',
    'thing'          : 'Thing Detail',
    'subthing'       : 'Sub-Thing Detail',
    'floorplan'      : 'Floor Plan',
    'floorplanitem'  : 'Floor Plan Item',
    'house-problems' : 'House Problems',
    'house-projects' : 'House Quick Tasks',
    'health'               : 'Health',
    'health-appointments'  : 'Appointments',
    'health-visits'        : 'Health Visits',
    'health-concerns'      : 'Concerns',
    'health-concern'       : 'Concern Detail',
    'health-conditions'    : 'Conditions',
    'health-condition'     : 'Condition Detail',
    'health-medications'   : 'Medications',
    'health-supplements'   : 'Supplements',
    'health-bloodwork'     : 'Blood Work',
    'health-vitals'        : 'Vitals',
    'health-insurance'     : 'Insurance',
    'health-emergency'     : 'Emergency Info',
    'health-allergies'     : 'Allergies',
    'health-vaccinations'  : 'Vaccinations',
    'health-eye'           : 'Eye / Glasses',
    'health-care-team'     : 'My Care Team',
    'vehicles'             : 'Vehicles',
    'vehicle'              : 'Vehicle Detail',
    'garage'               : 'Garage',
    'garageroom'           : 'Garage Room',
    'garagething'          : 'Garage Thing',
    'garagesubthing'       : 'Garage Sub-Thing',
    'structures'           : 'Structures',
    'structure'            : 'Structure Detail',
    'structurething'       : 'Structure Thing',
    'structuresubthing'    : 'Structure Sub-Thing',
    'collections'          : 'Collections',
    'collection'           : 'Collection Detail',
    'collectionitem'       : 'Collection Item',
    'life'                 : 'Life',
    'journal'              : 'Journal',
    'contacts'             : 'Contacts',
    'notes'                : 'Notes',
    'lifecalendar'         : 'Life Calendar',
    'thoughts'             : 'Thoughts',
    'top10lists'           : 'Top 10 Lists',
    'memories'             : 'Memories',
    'views'                : 'My Views',
    'settings'             : 'Settings & AI Setup'
};

// Maps topics-* route keys to the HELP_TOPIC_MAP section names they show
var HELP_TOPICS_SECTIONS = {
    'topics-yard'     : { label: 'Yard & Garden',      sections: ['Yard & Garden', 'Concepts'] },
    'topics-house'    : { label: 'House',               sections: ['House'] },
    'topics-health'   : { label: 'Health',              sections: ['Health'] },
    'topics-life'     : { label: 'Life',                sections: ['Life'] },
    'topics-vehicles' : { label: 'Vehicles & Storage',  sections: ['Vehicles & Storage'] },
    'topics-thoughts' : { label: 'Thoughts',             sections: ['Thoughts'] }
};

// Major-section cards shown on #help/main
var HELP_MAIN_SECTIONS = [
    { label: 'Yard & Garden',     route: 'topics-yard',      icon: '🌿' },
    { label: 'House',             route: 'topics-house',     icon: '🏠' },
    { label: 'Health',            route: 'topics-health',    icon: '❤️' },
    { label: 'Life',              route: 'topics-life',      icon: '📓' },
    { label: 'Vehicles & Storage',route: 'topics-vehicles',  icon: '🚗' },
    { label: 'Thoughts',          route: 'topics-thoughts',  icon: '💡' }
];

// ── Fetch & Parse ────────────────────────────────────────────

/**
 * Fetches AppHelp.md once and caches the result.
 */
async function _helpFetch() {
    if (_helpCache !== null) return _helpCache;
    var res = await fetch('AppHelp.md');
    if (!res.ok) throw new Error('Could not load help content (HTTP ' + res.status + ').');
    _helpCache = await res.text();
    return _helpCache;
}

/**
 * Extracts the content of a ## screen:key or ## concept:key section.
 * Returns null if not found.
 */
function _helpParseSection(fullText, key) {
    var escaped = key.replace(/[-]/g, '\\-');
    var re = new RegExp('##\\s+(?:screen|concept):' + escaped + '\\b([\\s\\S]*?)(?=\\n##\\s|$)', 'i');
    var m  = fullText.match(re);
    return m ? m[1].trim() : null;
}

// ── Page Load ────────────────────────────────────────────────

/**
 * Called by the router when navigating to #help/{screenName}.
 */
async function loadHelpPage(screenName) {
    // Track current screen so the Topics button can resolve the right section
    _helpCurrentScreen = screenName;

    // Reset session state for this help page
    _helpQA            = [];
    _helpAiOpen        = false;
    _helpLlmConfigured = null;  // re-check config each time (user may have just saved it)

    var sectionKey = HELP_SECTION_MAP[screenName] || screenName || 'main';

    // Determine page title
    var label;
    if (HELP_TOPICS_SECTIONS[screenName]) {
        label = 'Topics: ' + HELP_TOPICS_SECTIONS[screenName].label;
    } else {
        label = HELP_SCREEN_LABELS[screenName] || _helpTitleCase(screenName || 'help');
    }

    // Set page title
    var titleEl = document.getElementById('helpPageTitle');
    if (titleEl) titleEl.textContent = HELP_TOPICS_SECTIONS[screenName] ? label : ('Help: ' + label);

    // Reset Ask AI panel to closed state
    var aiSection = document.getElementById('helpAskAiSection');
    var aiBtn     = document.getElementById('helpAskAiBtn');
    var qaThread  = document.getElementById('helpQaThread');
    var inputEl   = document.getElementById('helpAiInput');
    if (aiSection) aiSection.classList.add('hidden');
    if (aiBtn)     aiBtn.textContent = '? Ask AI';
    if (qaThread)  qaThread.innerHTML = '';
    if (inputEl)   inputEl.value = '';

    // Show loading state in content area
    var contentEl = document.getElementById('helpStaticContent');
    if (contentEl) contentEl.innerHTML = '<p class="help-loading">Loading…</p>';

    try {
        var fullText    = await _helpFetch();
        var sectionText = _helpParseSection(fullText, sectionKey);

        // Fall back to main if no content found for this screen.
        // Topics pages are synthetic indexes with no AppHelp.md section of their own
        // (rendered entirely by _helpRenderSectionTopics below), so they're exempt —
        // otherwise this fallback would stomp the "Topics: X" title already set above.
        if (!sectionText && !HELP_TOPICS_SECTIONS[screenName]) {
            sectionText = _helpParseSection(fullText, 'main');
            if (sectionText && titleEl) titleEl.textContent = 'Help: Getting Started';
        }
        if (!sectionText) sectionText = '_No help content is available for this screen yet._';

        var renderedContent;
        if (HELP_TOPICS_SECTIONS[screenName]) {
            // Section-specific topics page: filtered index + cross-section links
            renderedContent = _helpRenderSectionTopics(screenName);
        } else if (sectionKey === 'main') {
            // Main page: section cards + Getting Started content
            renderedContent = _helpRenderMainSections() + _helpRenderContent(sectionText);
        } else {
            renderedContent = _helpRenderContent(sectionText);
        }
        if (contentEl) contentEl.innerHTML = renderedContent;

        // If SecondBrain routed a help question here, auto-open Ask AI and fire it
        var pendingQ = window._helpPendingQuestion;
        if (pendingQ) {
            window._helpPendingQuestion = null;
            setTimeout(async function() {
                var configured = await _helpCheckLlm();
                if (!configured) { window.location.hash = 'help/settings'; return; }
                _helpAiOpen = true;
                var aiSection = document.getElementById('helpAskAiSection');
                var aiBtn     = document.getElementById('helpAskAiBtn');
                var inputEl   = document.getElementById('helpAiInput');
                if (aiSection) aiSection.classList.remove('hidden');
                if (aiBtn)     aiBtn.textContent = '✕ Close AI';
                if (inputEl)   inputEl.value = pendingQ;
                helpSendQuestion();
            }, 50);
        }

    } catch (e) {
        if (contentEl) {
            contentEl.innerHTML =
                '<p class="help-error">Help content could not be loaded. Check your connection and try again.</p>';
        }
    }
}

function _helpTitleCase(str) {
    return str.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

/**
 * Maps a screen name to its major section key ('yard','house','health','life','vehicles').
 * Returns null for settings, main, topics pages, and anything else without a clear section.
 */
function _helpMajorSection(screenName) {
    var yardScreens = ['zones','zone','home','plant','weeds','weed','chemicals','chemical',
                       'actions','calendar','activityreport','gpsmap','yardmap',
                       'yard-problems','yard-projects',
                       'concept-activities','concept-photos','concept-facts',
                       'concept-problems','concept-quicktasks'];
    var houseScreens = ['house','floor','room','thing','subthing','floorplan','floorplanitem',
                        'house-problems','house-projects'];
    var healthScreens = ['health','health-appointments','health-visits','health-concerns',
                         'health-concern','health-conditions','health-condition',
                         'health-medications','health-supplements','health-bloodwork',
                         'health-vitals','health-insurance','health-emergency',
                         'health-allergies','health-vaccinations','health-eye','health-care-team'];
    var lifeScreens = ['life','journal','contacts','notes','lifecalendar','life-calendar'];
    var vehicleScreens = ['vehicles','vehicle','garage','garageroom','garagething','garagesubthing',
                          'structures','structure','structurething','structuresubthing',
                          'collections','collection','collectionitem'];

    if (yardScreens.indexOf(screenName) !== -1)    return 'yard';
    if (houseScreens.indexOf(screenName) !== -1)   return 'house';
    if (healthScreens.indexOf(screenName) !== -1)  return 'health';
    if (lifeScreens.indexOf(screenName) !== -1)    return 'life';
    if (vehicleScreens.indexOf(screenName) !== -1) return 'vehicles';
    var thoughtsScreens = ['thoughts','top10lists','top10list','memories','memory','views','view'];
    if (thoughtsScreens.indexOf(screenName) !== -1) return 'thoughts';
    return null;
}

/**
 * Called by the ☰ Topics button on the help page.
 * Navigates to the section-specific topics page based on the current help screen.
 */
function helpOpenTopics() {
    var section = _helpMajorSection(_helpCurrentScreen || '');
    window.location.hash = section ? ('help/topics-' + section) : 'help/main';
}

/**
 * Renders section text as HTML.
 * Parses optional sub-sections: ### Quick Help, ### Details, ### See Also.
 * Quick Help is always shown; Details is behind "Show more ▾"; See Also is a styled link list.
 */
function _helpRenderContent(sectionText) {
    // Strip See Also block before further parsing so it doesn't bleed into Details
    var seeAlsoHtml  = '';
    var seeAlsoMatch = sectionText.match(/###\s+See Also\s*\n([\s\S]*?)(?=###\s|$)/i);
    if (seeAlsoMatch) {
        seeAlsoHtml  = '<div class="help-see-also"><strong>See Also:</strong>' +
                       marked.parse(seeAlsoMatch[1].trim()) + '</div>';
        sectionText  = sectionText.replace(seeAlsoMatch[0], '');
    }

    var quickMatch   = sectionText.match(/###\s+Quick Help\s*\n([\s\S]*?)(?=###\s+Details|$)/i);
    var detailsMatch = sectionText.match(/###\s+Details\s*\n([\s\S]*?)(?=###\s|$)/i);

    var mainHtml;
    if (quickMatch && detailsMatch) {
        var quickHtml   = marked.parse(quickMatch[1].trim());
        var detailsHtml = marked.parse(detailsMatch[1].trim());
        mainHtml = '<div class="help-quick">' + quickHtml + '</div>' +
                   '<div class="help-details-toggle">' +
                   '<button class="help-show-more-btn" onclick="helpToggleDetails(this)" aria-expanded="false">' +
                   'Show more ▾</button>' +
                   '</div>' +
                   '<div class="help-details hidden">' + detailsHtml + '</div>';
    } else {
        mainHtml = marked.parse(sectionText);
    }

    return mainHtml + seeAlsoHtml;
}

/**
 * Renders the clickable topic index for #help/main.
 */
function _helpRenderIndex() {
    var html = '<div class="help-index">';
    HELP_TOPIC_MAP.forEach(function(group) {
        html += '<div class="help-index-section"><h3>' + _helpEscape(group.section) + '</h3><ul class="help-index-list">';
        group.topics.forEach(function(t) {
            html += '<li><a class="help-index-link" href="#help/' + t.key + '">' + _helpEscape(t.label) + '</a></li>';
        });
        html += '</ul></div>';
    });
    html += '</div>';
    return html;
}

/**
 * Renders the main help landing page — section cards linking to each topics page,
 * followed by Getting Started content.
 */
function _helpRenderMainSections() {
    var html = '<div class="help-main-sections">';
    HELP_MAIN_SECTIONS.forEach(function(s) {
        html += '<a class="help-main-section-card" href="#help/' + s.route + '">' +
                '<span class="help-main-section-icon">' + s.icon + '</span>' +
                '<span class="help-main-section-label">' + _helpEscape(s.label) + '</span>' +
                '</a>';
    });
    html += '</div>';
    return html;
}

/**
 * Renders a section-specific topics page: filtered topic index + cross-section links at bottom.
 */
function _helpRenderSectionTopics(routeKey) {
    var config = HELP_TOPICS_SECTIONS[routeKey];
    if (!config) return '';

    // Filtered topic index
    var html = '<div class="help-index">';
    HELP_TOPIC_MAP.forEach(function(group) {
        if (config.sections.indexOf(group.section) === -1) return;
        html += '<div class="help-index-section"><h3>' + _helpEscape(group.section) + '</h3><ul class="help-index-list">';
        group.topics.forEach(function(t) {
            html += '<li><a class="help-index-link" href="#help/' + t.key + '">' + _helpEscape(t.label) + '</a></li>';
        });
        html += '</ul></div>';
    });
    html += '</div>';

    // Cross-section cards at bottom — same style as #help/main section launcher
    html += '<div class="help-cross-sections"><p>Didn\'t find it here? Browse other sections:</p>' +
            '<div class="help-main-sections">';
    HELP_MAIN_SECTIONS.forEach(function(s) {
        if (s.route === routeKey) return; // skip current section
        html += '<a class="help-main-section-card" href="#help/' + s.route + '">' +
                '<span class="help-main-section-icon">' + s.icon + '</span>' +
                '<span class="help-main-section-label">' + _helpEscape(s.label) + '</span>' +
                '</a>';
    });
    html += '</div></div>';

    return html;
}

/**
 * Toggles the Details section open/closed.
 */
function helpToggleDetails(btn) {
    var detailsEl  = btn.closest('.help-static-content').querySelector('.help-details');
    var isNowOpen  = detailsEl.classList.toggle('hidden') === false;
    btn.textContent    = isNowOpen ? 'Show less ▴' : 'Show more ▾';
    btn.setAttribute('aria-expanded', isNowOpen ? 'true' : 'false');
}

// ── Ask AI panel ─────────────────────────────────────────────

/**
 * Checks whether an LLM is configured. Caches the result in _helpLlmConfigured.
 */
async function _helpCheckLlm() {
    if (_helpLlmConfigured !== null) return _helpLlmConfigured;
    try {
        var doc = await userCol('settings').doc('llm').get();
        _helpLlmConfigured = doc.exists && !!(doc.data().apiKey);
    } catch (e) {
        _helpLlmConfigured = false;
    }
    return _helpLlmConfigured;
}

/**
 * Toggles the Ask AI input panel open/closed.
 * If LLM is not configured, redirects to #help/settings instead of opening.
 */
async function helpToggleAskAi() {
    // If closing, just close — no config check needed
    if (_helpAiOpen) {
        _helpAiOpen = false;
        var aiSection = document.getElementById('helpAskAiSection');
        var aiBtn     = document.getElementById('helpAskAiBtn');
        if (aiSection) aiSection.classList.add('hidden');
        if (aiBtn)     aiBtn.textContent = '? Ask AI';
        return;
    }

    var configured = await _helpCheckLlm();
    if (!configured) {
        window.location.hash = '#help/settings';
        return;
    }

    _helpAiOpen = true;
    var aiSection = document.getElementById('helpAskAiSection');
    var aiBtn     = document.getElementById('helpAskAiBtn');
    if (aiSection) aiSection.classList.remove('hidden');
    if (aiBtn)     aiBtn.textContent = '✕ Close AI';
    var inputEl = document.getElementById('helpAiInput');
    if (inputEl) inputEl.focus();
}

/**
 * Sends the typed question to the LLM and appends the answer.
 * Called by the Send button and Enter (Shift+Enter inserts a newline instead).
 */
async function helpSendQuestion() {
    var inputEl = document.getElementById('helpAiInput');
    var sendBtn = document.getElementById('helpAiSendBtn');
    var question = (inputEl ? inputEl.value : '').trim();
    if (!question) return;

    // Safety net: if LLM somehow not configured, redirect instead of erroring
    var configured = await _helpCheckLlm();
    if (!configured) {
        window.location.hash = '#help/settings';
        return;
    }

    // Clear input and disable while waiting
    inputEl.value    = '';
    inputEl.disabled = true;
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '…'; }

    // Add Q with null answer (shows "Thinking…")
    _helpQA.push({ question: question, answer: null });
    _helpRenderQaThread();

    try {
        var answer = await _helpCallLLM(question);
        _helpQA[_helpQA.length - 1].answer = answer;
    } catch (e) {
        _helpQA[_helpQA.length - 1].answer = '_Sorry, there was an error: ' + e.message + '_';
    }

    inputEl.disabled = false;
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send'; }
    _helpRenderQaThread();
    if (inputEl) inputEl.focus();
}

// ── Q&A Thread ───────────────────────────────────────────────

/**
 * Re-renders the Q&A thread. The 3 most recent pairs are always visible;
 * older pairs are collapsed into a toggle.
 */
function _helpRenderQaThread() {
    var el = document.getElementById('helpQaThread');
    if (!el) return;
    if (_helpQA.length === 0) { el.innerHTML = ''; return; }

    var html         = '';
    var collapseCount = Math.max(0, _helpQA.length - HELP_COMPACT_AT);

    // Collapsible section for older Q&A pairs
    if (collapseCount > 0) {
        var olderLabel = 'Show ' + collapseCount + ' earlier question' +
                         (collapseCount > 1 ? 's' : '') + ' ▾';
        html += '<div class="help-qa-collapse">';
        html += '<button class="help-qa-collapse-btn" onclick="helpToggleOlderQa(this)">' +
                olderLabel + '</button>';
        html += '<div class="help-qa-older hidden">';
        // Render older pairs newest-first within the collapsed section
        for (var i = collapseCount - 1; i >= 0; i--) {
            html += _helpQaPairHtml(_helpQA[i]);
        }
        html += '</div></div>';
    }

    // The most recent pairs (up to HELP_COMPACT_AT), newest first
    for (var j = _helpQA.length - 1; j >= collapseCount; j--) {
        html += _helpQaPairHtml(_helpQA[j]);
    }

    el.innerHTML = html;
}

function _helpQaPairHtml(pair) {
    var answerHtml = (pair.answer === null)
        ? '<div class="help-qa-answer help-qa-pending">Thinking…</div>'
        : '<div class="help-qa-answer">' + marked.parse(pair.answer) + '</div>';

    return '<div class="help-qa-pair">' +
           '<div class="help-qa-question">' + _helpEscape(pair.question) + '</div>' +
           answerHtml +
           '</div>';
}

/**
 * Toggles the collapsed older-questions section.
 */
function helpToggleOlderQa(btn) {
    var olderDiv = btn.nextElementSibling;
    var isNowHidden = olderDiv.classList.toggle('hidden');
    var count = Math.max(0, _helpQA.length - HELP_COMPACT_AT);
    btn.textContent = isNowHidden
        ? 'Show ' + count + ' earlier question' + (count > 1 ? 's' : '') + ' ▾'
        : 'Hide earlier questions ▲';
}

function _helpEscape(str) {
    return (str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ── LLM Call ─────────────────────────────────────────────────

/**
 * Sends the question to the configured LLM with the full AppHelp.md as context.
 * Prior answered Q&A pairs are included as conversation history so follow-up
 * questions (e.g., "where exactly is that?") have the context they need.
 */
async function _helpCallLLM(question) {
    var fullHelp = await _helpFetch();

    var doc = await userCol('settings').doc('llm').get();
    if (!doc.exists) {
        throw new Error('LLM not configured. Go to Settings to add your API key.');
    }

    var cfg      = doc.data();
    var provider = cfg.provider || 'openai';
    var apiKey   = cfg.apiKey   || '';
    var model    = cfg.model    || '';

    var ENDPOINTS = {
        openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o'  },
        grok:   { url: 'https://api.x.ai/v1/chat/completions',       model: 'grok-3'  }
    };
    var ep = ENDPOINTS[provider] || ENDPOINTS.openai;

    var systemPrompt =
        'You are a helpful assistant for the MyLife personal tracking app. ' +
        'Answer the user\'s question using only the help documentation provided below. ' +
        'Be concise, friendly, and direct. If the answer is not covered in the documentation, say so clearly.\n\n' +
        '--- BEGIN HELP DOCUMENTATION ---\n' + fullHelp + '\n--- END HELP DOCUMENTATION ---';

    // Build messages: system prompt, then all prior answered Q&A as conversation turns,
    // then the new question. This gives the LLM context for follow-up questions.
    var messages = [{ role: 'system', content: systemPrompt }];
    _helpQA.forEach(function(pair) {
        if (pair.answer !== null && !pair.answer.startsWith('_Sorry')) {
            messages.push({ role: 'user',      content: pair.question });
            messages.push({ role: 'assistant', content: pair.answer   });
        }
    });
    messages.push({ role: 'user', content: question });

    var res = await fetch(ep.url, {
        method : 'POST',
        headers: {
            'Content-Type' : 'application/json',
            'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
            model   : model || ep.model,
            messages: messages
        })
    });

    if (!res.ok) {
        var errData = await res.json().catch(function() { return {}; });
        throw new Error((errData.error && errData.error.message) || 'LLM error: HTTP ' + res.status);
    }
    var data = await res.json();
    return data.choices[0].message.content;
}

// ── Nav Helper ───────────────────────────────────────────────

/**
 * Called by the ? link in all nav bars.
 * Reads the current hash and navigates to #help/{screenName}.
 */
function openHelpForCurrentScreen(e) {
    e.preventDefault();
    var hash = window.location.hash.slice(1) || 'main';
    // Don't recurse into help/help
    if (hash.split('/')[0] === 'help') return;

    // Longest-prefix match against HELP_SECTION_MAP.
    // We convert slashes to dashes and try progressively shorter prefixes
    // until we find an entry in the map or fall back to the first segment.
    //
    // This handles two cases correctly:
    //   Sub-page routes:   investments/snapshots  → investments-snapshots (has a map entry)
    //   Entity-id routes:  contact/{id}           → contact (no match, falls to 1st segment)
    var parts = hash.split('/');
    for (var i = parts.length; i >= 1; i--) {
        var candidate = parts.slice(0, i).join('-');
        if (candidate in HELP_SECTION_MAP || i === 1) {
            window.location.hash = '#help/' + candidate;
            return;
        }
    }
}

// ── Init ─────────────────────────────────────────────────────

// Wire Enter key on the AI input: Enter sends, Shift+Enter inserts newline.
// Done via addEventListener (more reliable than inline onkeydown on textarea).
document.addEventListener('DOMContentLoaded', function() {
    var inputEl = document.getElementById('helpAiInput');
    if (!inputEl) return;
    inputEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            helpSendQuestion();
        }
    });
});
