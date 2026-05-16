// ============================================================
// investments.js — Investments
// Person-scoped financial account tracking.
// Canonical storage for accounts shared with Legacy Financial.
// Encryption via legacy-crypto.js (same passphrase as Legacy).
// ============================================================

// ---------- Constants ----------

var INVEST_ACCOUNT_TYPES = [
    { value: '',                     label: '— Select type —' },
    { value: 'checking',             label: 'Checking' },
    { value: 'savings',              label: 'Savings' },
    { value: 'money-market',         label: 'Money Market' },
    { value: 'cd',                   label: 'CD' },
    { value: 'roth-ira',             label: 'Roth IRA' },
    { value: 'traditional-ira',      label: 'Traditional IRA' },
    { value: 'rollover-ira',         label: 'Rollover IRA' },
    { value: 'roth-401k',            label: 'Roth 401k' },
    { value: 'traditional-401k',     label: 'Traditional 401k' },
    { value: 'self-directed-401k',   label: 'Self-directed 401k' },
    { value: '403b',                 label: '403b' },
    { value: 'brokerage-individual', label: 'Brokerage (Individual)' },
    { value: 'brokerage-joint',      label: 'Brokerage (Joint)' },
    { value: 'hsa',                  label: 'HSA' },
    { value: '529',                  label: '529 College Savings' },
    { value: 'other',                label: 'Other' }
];

// Legacy type groupings — still used by Legacy Financial badge coloring
var _INVEST_BANK_TYPES       = ['checking', 'savings', 'money-market', 'cd'];
var _INVEST_RETIREMENT_TYPES = ['roth-ira', 'traditional-ira', 'roth-401k', 'traditional-401k', 'self-directed-401k', '403b'];
var _INVEST_BROKERAGE_TYPES  = ['brokerage-individual', 'brokerage-joint'];
var _INVEST_TAX_ADV_TYPES    = ['hsa', '529'];

// Tax-category buckets used by portfolio summary grouping
var _INVEST_ROTH_TYPES   = ['roth-ira', 'roth-401k', 'hsa'];
var _INVEST_PRETAX_TYPES = ['traditional-ira', 'rollover-ira', 'traditional-401k', 'self-directed-401k', '403b', '529'];
var _INVEST_BROKER_TYPES = ['brokerage-individual', 'brokerage-joint'];
var _INVEST_CASH_TYPES   = ['checking', 'savings', 'money-market', 'cd'];

function _investTypeLabel(value) {
    var t = INVEST_ACCOUNT_TYPES.find(function(t) { return t.value === value; });
    return (t && t.value) ? t.label : 'Account';
}

// Legacy badge class — used by Legacy Financial account cards
function _investBadgeClass(type) {
    if (_INVEST_BANK_TYPES.indexOf(type) >= 0)       return 'invest-badge--bank';
    if (_INVEST_RETIREMENT_TYPES.indexOf(type) >= 0) return 'invest-badge--retirement';
    if (_INVEST_BROKERAGE_TYPES.indexOf(type) >= 0)  return 'invest-badge--brokerage';
    if (_INVEST_TAX_ADV_TYPES.indexOf(type) >= 0)    return 'invest-badge--tax-adv';
    return 'invest-badge--other';
}

// Tax category badge — used by Investments account cards and portfolio summary
function _investTaxCategoryInfo(type) {
    if (_INVEST_ROTH_TYPES.indexOf(type) >= 0)    return { label: 'Roth',      cls: 'invest-badge--roth' };
    if (_INVEST_PRETAX_TYPES.indexOf(type) >= 0)  return { label: 'Pre-Tax',   cls: 'invest-badge--pretax' };
    if (_INVEST_BROKER_TYPES.indexOf(type) >= 0)  return { label: 'Brokerage', cls: 'invest-badge--brokerage' };
    if (_INVEST_CASH_TYPES.indexOf(type) >= 0)    return { label: 'Cash',      cls: 'invest-badge--cash' };
    return { label: 'Other', cls: 'invest-badge--other' };
}

// ---------- Module State ----------

var _investPersonFilter = 'self';   // 'self' or a people doc ID
var _investPeople       = [];       // [{id, name}] enrolled contacts
var _investAccounts     = [];       // account docs for the current person (may include joint from self)
var _investShowArchived = false;
var _investExpandedIds      = {};    // {accountId: bool}
var _investRevealedIds      = {};    // {accountId: bool} — sensitive fields decrypted & shown
var _investDecryptCache     = {};    // {accountId: {accountNumber, username, password}}
var _investCardTotalsCache  = {};    // {accountId: totalValue} — current value for investment accounts in accordion
var _investRetireConfigOpen = false; // whether the retire widget config (RoR / after-tax) is visible
var _investRetireHelpData   = {};    // populated each render; keyed by stat name; drives the ? popups
var _investHubGroupId       = null;  // selected group on the hub landing page
var _investHubPerfOpen      = localStorage.getItem('investHubPerfOpen')   !== 'false'; // accordion default open
var _investHubRetireOpen    = localStorage.getItem('investHubRetireOpen') !== 'false'; // retire accordion default open
var _investHubAthOpen       = localStorage.getItem('investHubAthOpen')    !== 'false'; // ATH accordion default open
var _investSumRetireOpen    = localStorage.getItem('investSumRetireOpen') !== 'false'; // summary retire accordion
var _investSumAthOpen       = localStorage.getItem('investSumAthOpen')    !== 'false'; // summary ATH accordion
var _investActiveGroupId    = null;  // shared: last group selected on any invest page (persists across pages)

// ---------- Firestore Path ----------

function _investCol() {
    return userCol('investments').doc(_investPersonFilter).collection('accounts');
}

// ---------- Hub Page Loader ----------

// Returns "+$1,234 (+1.23%)" or "−$1,234 (−1.23%)" — compact signed gain string
function _investFmtGain(diff, pct) {
    var sign    = diff >= 0 ? '+' : '\u2212';
    var pctSign = pct  >= 0 ? '+' : '\u2212';
    return sign + '$' +
        Math.abs(diff).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
        ' (' + pctSign + Math.abs(pct).toFixed(2) + '%)';
}

async function loadInvestmentsPage() {
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#life">Life</a><span class="separator">&rsaquo;</span><span>Financial</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';

    await _investEnsureMeGroup();

    // Load people enrollment so retire widget (SS breakdown) can resolve names on this page.
    // _investLoadAll also loads raw accounts as a side-effect; harmless on the hub page.
    await _investLoadAll();

    var page = document.getElementById('page-investments');
    if (!page) return;

    // Render chrome immediately; data fills in async
    page.innerHTML =
        '<div class="page-header">' +
            '<h2>📈 Investments</h2>' +
            '<div class="page-header-actions">' +
                '<a class="btn btn-secondary btn-small" href="#investments/groups">⚙ Groups</a>' +
            '</div>' +
        '</div>' +
        '<div id="investHubGroupSwitcher"></div>' +
        '<div id="investHubBody"><p class="muted-text">Loading…</p></div>' +
        _investHubNavCards();

    await _investLoadGroups();
    await _investLoadConfig();

    _investGroupSwitchHandler = function(gid) {
        _investActiveGroupId = gid;
        _investHubGroupId    = gid;
        localStorage.setItem('investActiveGroupId', gid);
        _investRenderHubBody(gid);
    };

    if (!_investActiveGroupId) {
        var _storedGid = localStorage.getItem('investActiveGroupId');
        if (_storedGid && _investGroups.find(function(g) { return g.id === _storedGid; })) {
            _investActiveGroupId = _storedGid;
        }
    }
    if (!_investHubGroupId && _investActiveGroupId) _investHubGroupId = _investActiveGroupId;
    _investHubGroupId = _investRenderGroupSwitcher('investHubGroupSwitcher', _investHubGroupId);
    await _investRenderHubBody(_investHubGroupId);
}

// Loads live account totals + period baselines for the given group, then renders
// the dashboard card into #investHubBody.
async function _investRenderHubBody(groupId) {
    var body = document.getElementById('investHubBody');
    if (!body) return;

    if (!groupId) {
        body.innerHTML = '<p class="muted-text">No group selected.</p>';
        return;
    }

    body.innerHTML = '<p class="muted-text">Loading…</p>';

    try {
        var group    = _investGroups.find(function(g) { return g.id === groupId; }) || null;
        var accounts = await _investLoadGroupAccounts(group);
        var totals   = _investComputeGroupTotals(accounts);

        // Load period baselines + retire widget data in parallel
        var results   = await Promise.all([
            _investLoadPeriodBaselines(groupId),
            _investGetMeAge(),
            _investLoadBudgets(),                                            // populates _investBudgets / _investDefaultBudgetId
            _investLoadGroupSS(group),
            _investLoadBudgetTotals(_investConfig.selectedBudgetId || null)
        ]);
        var baselines  = results[0];
        var meAgeInfo  = results[1];
        // results[2] is void — _investLoadBudgets uses side-effects
        var ssData     = results[3];
        var budgetData = results[4];

        body.innerHTML = _investHubDashboardHtml(totals, baselines, groupId, {
            group: group, meAgeInfo: meAgeInfo, ssData: ssData, budgetData: budgetData
        });
        _investApplyStaleIndicators();
    } catch (e) {
        console.error('Hub dashboard error', e);
        body.innerHTML = '<p class="muted-text">Error loading portfolio data.</p>';
    }
}

// Builds the dashboard card HTML from computed totals, period baselines, and retire widget data.
// retireData: { group, meAgeInfo, ssData, budgetData }
function _investHubDashboardHtml(totals, baselines, groupId, retireData) {
    var nw       = totals.netWorth || 0;
    var invested = totals.invested || 0;
    retireData   = retireData || {};

    // ---- Performance accordion: Day / Week / Month / YTD stat cards ----
    function statCell(label, baseline) {
        if (!baseline) {
            return '<div class="invest-hub-stat-cell invest-hub-dim">' +
                '<div class="invest-hub-stat-label">' + escapeHtml(label) + '</div>' +
                '<div class="invest-hub-stat-value">—</div>' +
            '</div>';
        }
        var diff    = nw - (baseline.netWorth || 0);
        var base    = baseline.netWorth || 0;
        var pct     = (base > 0) ? (diff / base * 100) : 0;
        var cls     = diff >= 0 ? 'invest-hub-gain' : 'invest-hub-loss';
        var sign    = diff >= 0 ? '+' : '−';
        var pctSign = pct  >= 0 ? '+' : '−';
        return '<div class="invest-hub-stat-cell ' + cls + '">' +
            '<div class="invest-hub-stat-label">' + escapeHtml(label) + '</div>' +
            '<div class="invest-hub-stat-value">' + sign + '$' +
                Math.abs(diff).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) +
            '</div>' +
            '<div class="invest-hub-stat-pct">' + pctSign + Math.abs(pct).toFixed(2) + '%</div>' +
        '</div>';
    }

    var updateBarHtml =
        '<div class="invest-hub-update-bar">' +
            '<button class="btn btn-secondary btn-small" id="investHubUpdateBtn" onclick="_investUpdateHubAllPrices()">📡 Update All Prices</button>' +
            '<span class="invest-update-time-note" id="investHubUpdateNote">' +
                (_investConfig.lastUpdateAllTimestamp ? escapeHtml(_investFmtUpdateTime(_investConfig.lastUpdateAllTimestamp)) : '') +
            '</span>' +
        '</div>';

    var statsHtml =
        '<div class="invest-hub-perf-body-wrap">' +
            updateBarHtml +
            '<div class="invest-hub-stats-row">' +
                statCell('Day',   baselines.daily) +
                statCell('Week',  baselines.weekly) +
                statCell('Month', baselines.monthly) +
                statCell('YTD',   baselines.yearly) +
            '</div>' +
        '</div>';

    var perfHtml = _investBuildAccordion({
        id: 'investHubPerf', title: 'Performance',
        bodyHtml: statsHtml,
        toggleFn: '_investToggleHubPerf', isOpen: _investHubPerfOpen
    });

    // ---- Retire Estimate accordion ----
    var retireHtml = '';
    var group      = retireData.group;
    if (group) {
        var ror          = _investConfig.projectedRoR || 0.06;
        var atp          = _investConfig.afterTaxPct  || 0.82;
        var ssData       = retireData.ssData    || { totalSSMonthly: 0, breakdown: [] };
        var meAgeInfo    = retireData.meAgeInfo || {};
        var budgetData   = retireData.budgetData;
        var investAnnual = nw * ror * atp;
        var ssMonthly    = (ssData.totalSSMonthly || 0) * atp;
        var annual       = investAnnual + ssMonthly * 12;
        var monthly      = annual / 12;
        var selfAge      = (_investConfig.retirementAges || {})['self'] || null;
        var retireTitle  = selfAge
            ? 'If I retire today at age ' + selfAge + ' (after est. taxes)'
            : 'If I retire today (after est. taxes)';

        retireHtml = _investBuildRetireWidget({
            ror: ror, atp: atp, annual: annual, monthly: monthly,
            meAgeInfo: meAgeInfo, retireTitle: retireTitle,
            group: group, ssData: ssData,
            budgetData: budgetData, netWorth: nw
        });
    }
    var retireBarHtml = retireHtml
        ? '<div class="invest-hub-update-bar">' +
              '<a class="btn btn-secondary btn-small invest-ai-entry-btn" href="#investments/ai-analysis" ' +
                  'onclick="_investAiBackRoute=\'investments\'">🤖 Ask AI</a>' +
          '</div>'
        : '';

    var retireAccHtml = retireHtml ? _investBuildAccordion({
        id: 'investHubRetire', title: 'Retire Estimate',
        bodyHtml: retireBarHtml + retireHtml,
        toggleFn: '_investToggleHubRetire', isOpen: _investHubRetireOpen
    }) : '';

    // ---- All-Time Highs accordion ----
    var athBodyHtml = _investBuildAthHtml(groupId, nw);
    var athAccHtml  = athBodyHtml ? _investBuildAccordion({
        id: 'investHubAth', title: 'All-Time Highs',
        bodyHtml: athBodyHtml,
        toggleFn: '_investToggleHubAth', isOpen: _investHubAthOpen
    }) : '';

    return '<div class="invest-hub-dashboard">' +
        '<div class="invest-hub-heroes">' +
            '<div class="invest-hub-hero">' +
                '<div class="invest-hub-hero-label">Net Worth</div>' +
                '<div class="invest-hub-hero-value">' + escapeHtml(_investFmtCurrency(nw)) + '</div>' +
            '</div>' +
            '<div class="invest-hub-hero">' +
                '<div class="invest-hub-hero-label">Invested</div>' +
                '<div class="invest-hub-hero-value">' + escapeHtml(_investFmtCurrency(invested)) + '</div>' +
            '</div>' +
        '</div>' +
        perfHtml +
        retireAccHtml +
        athAccHtml +
    '</div>';
}

// ---------- Shared Accordion Builder ----------

// Builds accordion HTML.  opts:
//   id         – string used to create element IDs (opts.id + 'Body' / opts.id + 'Chevron')
//   title      – plain-text label (escaped internally)
//   bodyHtml   – inner HTML for the collapsible body
//   toggleFn   – JS function name (string) to call on click; null = always-open (no button)
//   isOpen     – initial open state (ignored when toggleFn is null)
function _investBuildAccordion(opts) {
    var titleEsc = escapeHtml(opts.title);
    if (!opts.toggleFn) {
        return '<div class="invest-hub-perf-accordion">' +
            '<div class="invest-hub-perf-toggle invest-hub-perf-toggle--static">' + titleEsc + '</div>' +
            '<div class="invest-hub-perf-body">' + opts.bodyHtml + '</div>' +
        '</div>';
    }
    return '<div class="invest-hub-perf-accordion">' +
        '<button class="invest-hub-perf-toggle" type="button" onclick="' + opts.toggleFn + '()">' +
            titleEsc +
            '<span id="' + opts.id + 'Chevron">' + (opts.isOpen ? '▾' : '▸') + '</span>' +
        '</button>' +
        '<div class="invest-hub-perf-body" id="' + opts.id + 'Body"' + (opts.isOpen ? '' : ' style="display:none"') + '>' +
            opts.bodyHtml +
        '</div>' +
    '</div>';
}

// ---------- ATH HTML Builder (shared between hub and summary) ----------

// Returns the invest-snap-ath-row HTML for a group's all-time highs.
// currentNetWorth is used for the "vs Daily ATH" companion card.
// Returns '' if no ATH data exists for the group.
function _investBuildAthHtml(groupId, currentNetWorth) {
    var athTypes = ['daily', 'weekly', 'monthly', 'yearly'];
    if (!athTypes.some(function(t) { return !!_investConfig[_investAthKey(t, groupId)]; })) return '';
    var html = '<div class="invest-snap-ath-row">';
    athTypes.forEach(function(t) {
        var ath = _investConfig[_investAthKey(t, groupId)];
        if (!ath) return;
        html +=
            '<div class="invest-snap-ath-item">' +
                '<span class="invest-snap-ath-label">' + t.charAt(0).toUpperCase() + t.slice(1) + ' ATH</span>' +
                '<span class="invest-snap-ath-value">' + _investFmtCurrency(ath.value) + '</span>' +
                '<span class="invest-snap-ath-date">' + escapeHtml(ath.date || '') + '</span>' +
            '</div>';
        if (t === 'daily' && ath.value > 0) {
            var athDiff   = currentNetWorth - ath.value;
            var athPct    = athDiff / ath.value * 100;
            var athIsUp   = athDiff >= 0;
            var athPctFmt = (athIsUp ? '+' : '') + athPct.toFixed(2) + '%';
            var athCls    = athIsUp ? 'invest-snap-ath-item--gain' : 'invest-snap-ath-item--loss';
            html +=
                '<div class="invest-snap-ath-item ' + athCls + '">' +
                    '<span class="invest-snap-ath-label">vs Daily ATH</span>' +
                    '<span class="invest-snap-ath-value invest-ath-pct-value">' + escapeHtml(athPctFmt) + '</span>' +
                    '<span class="invest-snap-ath-date">' + _investFmtCurrency(currentNetWorth) + ' now</span>' +
                '</div>';
        }
    });
    html += '</div>';
    return html;
}

// ---------- Hub Accordion Toggle Functions ----------

// Toggles the Performance accordion on the hub and persists state to localStorage.
function _investToggleHubPerf() {
    _investHubPerfOpen = !_investHubPerfOpen;
    localStorage.setItem('investHubPerfOpen', String(_investHubPerfOpen));
    document.getElementById('investHubPerfBody').style.display    = _investHubPerfOpen ? '' : 'none';
    document.getElementById('investHubPerfChevron').textContent   = _investHubPerfOpen ? '▾' : '▸';
}

// Toggles the Retire Estimate accordion on the hub and persists state to localStorage.
function _investToggleHubRetire() {
    _investHubRetireOpen = !_investHubRetireOpen;
    localStorage.setItem('investHubRetireOpen', String(_investHubRetireOpen));
    document.getElementById('investHubRetireBody').style.display  = _investHubRetireOpen ? '' : 'none';
    document.getElementById('investHubRetireChevron').textContent = _investHubRetireOpen ? '▾' : '▸';
}

// Toggles the All-Time Highs accordion on the hub and persists state to localStorage.
function _investToggleHubAth() {
    _investHubAthOpen = !_investHubAthOpen;
    localStorage.setItem('investHubAthOpen', String(_investHubAthOpen));
    document.getElementById('investHubAthBody').style.display     = _investHubAthOpen ? '' : 'none';
    document.getElementById('investHubAthChevron').textContent    = _investHubAthOpen ? '▾' : '▸';
}

// ---------- Summary Page Accordion Toggle Functions ----------

function _investToggleSumRetire() {
    _investSumRetireOpen = !_investSumRetireOpen;
    localStorage.setItem('investSumRetireOpen', String(_investSumRetireOpen));
    document.getElementById('investSumRetireBody').style.display    = _investSumRetireOpen ? '' : 'none';
    document.getElementById('investSumRetireChevron').textContent   = _investSumRetireOpen ? '▾' : '▸';
}

function _investToggleSumAth() {
    _investSumAthOpen = !_investSumAthOpen;
    localStorage.setItem('investSumAthOpen', String(_investSumAthOpen));
    document.getElementById('investSumAthBody').style.display       = _investSumAthOpen ? '' : 'none';
    document.getElementById('investSumAthChevron').textContent      = _investSumAthOpen ? '▾' : '▸';
}

// Returns the static nav-card grid HTML (always shown below the live dashboard).
function _investHubNavCards() {
    return '<div class="invest-hub">' +
        '<a class="invest-hub-card" href="#investments/accounts">' +
            '<span class="invest-hub-icon">🏦</span>' +
            '<div class="invest-hub-text">' +
                '<div class="invest-hub-title">Accounts</div>' +
                '<div class="invest-hub-desc">View and manage all investment and bank accounts</div>' +
            '</div>' +
            '<span class="invest-hub-arrow">›</span>' +
        '</a>' +
        '<a class="invest-hub-card" href="#investments/summary">' +
            '<span class="invest-hub-icon">📊</span>' +
            '<div class="invest-hub-text">' +
                '<div class="invest-hub-title">Summary</div>' +
                '<div class="invest-hub-desc">Net worth, category breakdown, and retirement estimate</div>' +
            '</div>' +
            '<span class="invest-hub-arrow">›</span>' +
        '</a>' +
        '<a class="invest-hub-card" href="#investments/stocks">' +
            '<span class="invest-hub-icon">📈</span>' +
            '<div class="invest-hub-text">' +
                '<div class="invest-hub-title">Stock Rollup</div>' +
                '<div class="invest-hub-desc">All tickers across every account — concentration analysis</div>' +
            '</div>' +
            '<span class="invest-hub-arrow">›</span>' +
        '</a>' +
        '<a class="invest-hub-card" href="#investments/snapshots">' +
            '<span class="invest-hub-icon">📷</span>' +
            '<div class="invest-hub-text">' +
                '<div class="invest-hub-title">Snapshots</div>' +
                '<div class="invest-hub-desc">Capture and browse historical portfolio values</div>' +
            '</div>' +
            '<span class="invest-hub-arrow">›</span>' +
        '</a>' +
        '<a class="invest-hub-card" href="#budget">' +
            '<span class="invest-hub-icon">💰</span>' +
            '<div class="invest-hub-text">' +
                '<div class="invest-hub-title">Budgets</div>' +
                '<div class="invest-hub-desc">Create and manage monthly budgets by lifestyle scenario</div>' +
            '</div>' +
            '<span class="invest-hub-arrow">›</span>' +
        '</a>' +
        '<a class="invest-hub-card" href="#investments/ss-benefits">' +
            '<span class="invest-hub-icon">🏛️</span>' +
            '<div class="invest-hub-text">' +
                '<div class="invest-hub-title">SS Benefits</div>' +
                '<div class="invest-hub-desc">Track projected Social Security benefits by age for each person</div>' +
            '</div>' +
            '<span class="invest-hub-arrow">›</span>' +
        '</a>' +
        '<div class="invest-hub-card invest-hub-card--soon">' +
            '<span class="invest-hub-icon">🧮</span>' +
            '<div class="invest-hub-text">' +
                '<div class="invest-hub-title">Retirement Planner <span class="invest-hub-badge">Soon</span></div>' +
                '<div class="invest-hub-desc">Contribution optimizer and tax bracket analysis</div>' +
            '</div>' +
        '</div>' +
        '<div class="invest-hub-card invest-hub-card--soon">' +
            '<span class="invest-hub-icon">📉</span>' +
            '<div class="invest-hub-text">' +
                '<div class="invest-hub-title">Retirement Projection <span class="invest-hub-badge">Soon</span></div>' +
                '<div class="invest-hub-desc">Growth curves, withdrawal simulation, FIRE analysis</div>' +
            '</div>' +
        '</div>' +
    '</div>';
}

// ---------- Accounts Sub-page Loader ----------

async function loadInvestmentsAccountsPage() {
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#investments">Financial</a><span class="separator">&rsaquo;</span><span>Accounts</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';
    await _investLoadAll();
    _investRenderPage();
}

// ---------- Data Loading ----------

async function _investLoadAll() {
    var settingsDoc = await userCol('settings').doc('investments').get();
    _investPeople = [];
    if (settingsDoc.exists) {
        var enrolledIds = (settingsDoc.data().enrolledPersonIds || []).filter(Boolean);
        var fetches = enrolledIds.map(function(pid) {
            return userCol('people').doc(pid).get().then(function(d) {
                return d.exists ? { id: pid, name: d.data().name || pid } : null;
            });
        });
        var results = await Promise.all(fetches);
        _investPeople = results.filter(Boolean).sort(function(a, b) {
            return a.name.localeCompare(b.name);
        });
    }
    await _investLoadAccounts();
}

async function _investLoadAccounts() {
    _investExpandedIds = {};
    _investRevealedIds = {};
    _investDecryptCache = {};

    var snap = await _investCol().orderBy('sortOrder').get();
    _investAccounts = [];
    snap.forEach(function(doc) {
        _investAccounts.push(Object.assign({ id: doc.id, _ns: _investPersonFilter }, doc.data()));
    });

    // When viewing a contact, also pull joint accounts stored under 'self' that list them as co-owner.
    // These are loaded client-side to avoid needing a composite Firestore index.
    if (_investPersonFilter !== 'self') {
        var selfSnap = await userCol('investments').doc('self').collection('accounts').get();
        selfSnap.forEach(function(doc) {
            var data = doc.data();
            if (data.ownerType === 'joint' && data.primaryContactId === _investPersonFilter) {
                _investAccounts.push(Object.assign({ id: doc.id, _ns: 'self', _joint: true }, data));
            }
        });
    }
}

// ---------- Accounts Page Render ----------

function _investRenderPage() {
    var page = document.getElementById('page-investments-accounts');
    if (!page) return;

    var personOpts = '<option value="self"' + (_investPersonFilter === 'self' ? ' selected' : '') + '>Me</option>';
    _investPeople.forEach(function(p) {
        personOpts += '<option value="' + escapeHtml(p.id) + '"' +
            (_investPersonFilter === p.id ? ' selected' : '') + '>' +
            escapeHtml(p.name) + '</option>';
    });

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>🏦 Accounts</h2>' +
            '<div class="page-header-actions">' +
                '<div class="invest-manage-wrap">' +
                    '<button class="btn btn-secondary" onclick="_investToggleManageMenu(event)">Manage ▾</button>' +
                    '<div class="invest-manage-menu" id="investManageMenu">' +
                        '<button onclick="_investOpenPeopleModal()">Manage People</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div class="invest-person-row">' +
            '<label class="invest-person-label">Person:</label>' +
            '<select id="investPersonSel" onchange="_investOnPersonChange()">' + personOpts + '</select>' +
        '</div>' +
        '<div class="invest-toolbar">' +
            '<button class="btn btn-primary" onclick="window.location.hash=\'#investments/accounts/add\'">+ Add Account</button>' +
            '<button class="btn btn-secondary" id="investShowArchivedBtn" onclick="_investToggleArchived()">' +
                (_investShowArchived ? 'Hide Archived' : 'Show Archived') +
            '</button>' +
        '</div>' +
        '<div id="investAccountList"></div>';

    _investRenderList();
}

function _investRenderList() {
    var container = document.getElementById('investAccountList');
    if (!container) return;

    var list = _investAccounts.filter(function(a) {
        return _investShowArchived || !a.archived;
    });

    if (list.length === 0) {
        container.innerHTML = '<div class="empty-state">No accounts yet. Add one above.</div>';
        return;
    }

    var html = '';

    if (_investPersonFilter === 'self') {
        var myAccounts    = list.filter(function(a) { return a.ownerType !== 'joint'; });
        var jointAccounts = list.filter(function(a) { return a.ownerType === 'joint'; });

        if (myAccounts.length > 0) {
            html += '<div class="invest-group-header">My Accounts</div>' +
                    '<div id="investSortableList" class="invest-card-group">';
            myAccounts.forEach(function(a) { html += _investCardHtml(a); });
            html += '</div>';
        }
        if (jointAccounts.length > 0) {
            html += '<div class="invest-group-header">Joint Accounts</div>' +
                    '<div class="invest-card-group">';
            jointAccounts.forEach(function(a) { html += _investCardHtml(a); });
            html += '</div>';
        }
    } else {
        var personName    = (_investPeople.find(function(p) { return p.id === _investPersonFilter; }) || {}).name || 'Accounts';
        var ownAccounts   = list.filter(function(a) { return !a._joint; });
        var jointAccounts = list.filter(function(a) { return !!a._joint; });

        if (ownAccounts.length > 0) {
            html += '<div class="invest-group-header">' + escapeHtml(personName) + '\'s Accounts</div>' +
                    '<div class="invest-card-group">';
            ownAccounts.forEach(function(a) { html += _investCardHtml(a); });
            html += '</div>';
        }
        if (jointAccounts.length > 0) {
            html += '<div class="invest-group-header">Joint Accounts</div>' +
                    '<div class="invest-card-group">';
            jointAccounts.forEach(function(a) { html += _investCardHtml(a); });
            html += '</div>';
        }
    }

    container.innerHTML = html;

    // Only "My Accounts" (non-joint, self namespace) is drag-reorderable
    var sortableEl = document.getElementById('investSortableList');
    if (sortableEl && window.Sortable) {
        Sortable.create(sortableEl, {
            handle: '.invest-drag-handle',
            animation: 150,
            onEnd: function(evt) { _investOnReorder(evt); }
        });
    }
}

function _investCardHtml(acct) {
    var isExpanded = !!_investExpandedIds[acct.id];
    var taxInfo    = _investTaxCategoryInfo(acct.accountType || '');
    var typeLabel  = _investTypeLabel(acct.accountType || '');
    var isJoint    = !!acct._joint;       // came from self namespace via second-query
    var isDraggable = (_investPersonFilter === 'self') && (acct.ownerType !== 'joint') && !isJoint;

    var titleParts = [escapeHtml(acct.nickname || '(untitled)')];
    if (acct.institution) titleParts.push(escapeHtml(acct.institution));

    var header =
        '<div class="invest-card-header" onclick="_investToggleCard(\'' + acct.id + '\')">' +
            (isDraggable ? '<span class="invest-drag-handle" onclick="event.stopPropagation()">⠿</span>' : '') +
            '<span class="invest-type-badge ' + escapeHtml(taxInfo.cls) + '">' + escapeHtml(taxInfo.label) + '</span>' +
            '<span class="invest-card-title">' + titleParts.join(' — ') +
                (acct.last4 ? '<span class="invest-last4"> ····' + escapeHtml(acct.last4) + '</span>' : '') +
            '</span>' +
            (acct.archived ? '<span class="invest-archived-badge">Closed</span>' : '') +
            (isJoint ? '<span class="invest-joint-badge">Joint</span>' : '') +
            '<span class="invest-chevron">' + (isExpanded ? '▾' : '›') + '</span>' +
        '</div>';

    var body = '';
    if (isExpanded) {
        var isRevealed = !!_investRevealedIds[acct.id];
        var cache      = _investDecryptCache[acct.id] || {};
        var hasEnc     = acct.accountNumberEnc || acct.usernameEnc || acct.passwordEnc;

        body = '<div class="invest-card-body">';

        // Account type detail row
        body += '<div class="invest-detail-row">' +
            '<span class="invest-detail-label">Type</span>' +
            '<span class="invest-detail-value">' + escapeHtml(typeLabel) + '</span>' +
            '</div>';

        // Owner info
        if (acct.ownerType === 'joint') {
            var coOwnerName = '';
            if (acct.primaryContactId) {
                var contact = _investPeople.find(function(p) { return p.id === acct.primaryContactId; });
                coOwnerName = contact ? contact.name : acct.primaryContactId;
            }
            body += '<div class="invest-detail-row">' +
                '<span class="invest-detail-label">Owner</span>' +
                '<span class="invest-detail-value">Joint' +
                    (coOwnerName ? ' with ' + escapeHtml(coOwnerName) : '') +
                '</span>' +
                '</div>';
        }

        // Value display: investment accounts show "Current Value" (sum of holdings); bank accounts show "Cash Balance"
        var isCashAcct = _INVEST_CASH_TYPES.indexOf(acct.accountType || '') >= 0;
        if (isCashAcct) {
            if (acct.cashBalance !== undefined && acct.cashBalance !== null && acct.cashBalance !== '') {
                body += '<div class="invest-detail-row">' +
                    '<span class="invest-detail-label">Cash Balance</span>' +
                    '<span class="invest-detail-value">$' + parseFloat(acct.cashBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</span>' +
                    '</div>';
            }
        } else {
            var cachedTotal = _investCardTotalsCache[acct.id];
            body += '<div class="invest-detail-row">' +
                '<span class="invest-detail-label">Current Value</span>' +
                '<span class="invest-detail-value">' +
                    (cachedTotal !== undefined ? _investFmtCurrency(cachedTotal) : 'Loading…') +
                '</span>' +
                '</div>';
        }

        if (acct.url) {
            body += '<div class="invest-detail-row">' +
                '<span class="invest-detail-label">URL</span>' +
                '<span class="invest-detail-value"><a href="' + escapeHtml(acct.url) + '" target="_blank" rel="noopener">' + escapeHtml(acct.url) + '</a></span>' +
                '</div>';
        }
        if (acct.loginNotes) {
            body += '<div class="invest-detail-row">' +
                '<span class="invest-detail-label">Login Notes</span>' +
                '<span class="invest-detail-value">' + escapeHtml(acct.loginNotes) + '</span>' +
                '</div>';
        }
        if (acct.beneficiary) {
            body += '<div class="invest-detail-row">' +
                '<span class="invest-detail-label">Beneficiary</span>' +
                '<span class="invest-detail-value">' + escapeHtml(acct.beneficiary) + '</span>' +
                '</div>';
        }

        if (hasEnc) {
            body += '<div class="invest-sensitive-box">';
            if (!legacyIsUnlocked()) {
                body +=
                    '<div class="invest-sensitive-lock">' +
                        '<span>Sensitive fields are encrypted.</span>' +
                        '<button class="btn btn-secondary btn-small"' +
                            ' onclick="event.stopPropagation();_investRevealAccount(\'' + acct.id + '\')">' +
                            '🔓 Reveal Sensitive Info</button>' +
                    '</div>';
            } else {
                if (!isRevealed) {
                    body += '<button class="btn btn-secondary btn-small invest-reveal-btn"' +
                        ' onclick="event.stopPropagation();_investRevealAccount(\'' + acct.id + '\')">' +
                        '🔓 Reveal All</button>';
                } else {
                    body += '<button class="btn btn-secondary btn-small invest-reveal-btn"' +
                        ' onclick="event.stopPropagation();_investHideAccount(\'' + acct.id + '\')">' +
                        '🔒 Hide</button>';

                    if (acct.accountNumberEnc) {
                        body += '<div class="invest-detail-row">' +
                            '<span class="invest-detail-label">Account #</span>' +
                            '<span class="invest-detail-value invest-sensitive-val">' +
                            escapeHtml(cache.accountNumber || '(decrypt failed)') + '</span></div>';
                    }
                    if (acct.usernameEnc) {
                        body += '<div class="invest-detail-row">' +
                            '<span class="invest-detail-label">Username</span>' +
                            '<span class="invest-detail-value invest-sensitive-val">' +
                            escapeHtml(cache.username || '(decrypt failed)') + '</span></div>';
                    }
                    if (acct.passwordEnc) {
                        body += '<div class="invest-detail-row">' +
                            '<span class="invest-detail-label">Password</span>' +
                            '<span class="invest-detail-value invest-sensitive-val">' +
                            escapeHtml(cache.password || '(decrypt failed)') + '</span></div>';
                    }
                }
            }
            body += '</div>';
        }

        var acctNs = escapeHtml(acct._ns || _investPersonFilter);
        body +=
            '<div class="invest-card-actions">' +
                '<a class="btn btn-primary btn-small"' +
                    ' href="#investments/account/' + acctNs + '/' + acct.id + '"' +
                    ' onclick="event.stopPropagation()">Positions</a>' +
                '<button class="btn btn-secondary btn-small"' +
                    ' onclick="event.stopPropagation();_investEditAccount(\'' + acct.id + '\',\'' + acctNs + '\')">Edit</button>' +
                (acct.archived
                    ? '<button class="btn btn-secondary btn-small"' +
                        ' onclick="event.stopPropagation();_investRestore(\'' + acct.id + '\')">Restore</button>'
                    : '<button class="btn btn-secondary btn-small"' +
                        ' onclick="event.stopPropagation();_investArchive(\'' + acct.id + '\')">Archive</button>') +
            '</div>' +
        '</div>';
    }

    return '<div class="invest-card' +
        (acct.archived  ? ' invest-card--archived'  : '') +
        (isExpanded     ? ' invest-card--expanded'  : '') +
        '" data-id="' + acct.id + '">' + header + body + '</div>';
}

// ---------- Card Interactions ----------

async function _investToggleCard(id) {
    _investExpandedIds[id] = !_investExpandedIds[id];
    if (!_investExpandedIds[id]) {
        delete _investRevealedIds[id];
        delete _investDecryptCache[id];
    } else {
        // For investment accounts, load holdings total if not yet cached
        var acct = _investAccounts.find(function(a) { return a.id === id; });
        if (acct && _INVEST_CASH_TYPES.indexOf(acct.accountType || '') < 0
                 && _investCardTotalsCache[id] === undefined) {
            var ns = acct._ns || _investPersonFilter;
            var snap = await _investHoldingCol(ns, id).get();
            var total = 0;
            snap.forEach(function(doc) {
                var h = doc.data();
                if (h.shares != null && h.lastPrice != null) total += h.shares * h.lastPrice;
            });
            total += parseFloat(acct.cashBalance    || 0) || 0;
            total += parseFloat(acct.pendingActivity || 0) || 0;
            _investCardTotalsCache[id] = total;
        }
    }
    _investRenderList();
}

async function _investRevealAccount(id) {
    if (!legacyIsUnlocked()) {
        _legacyRequireUnlock(function() { _investRevealAccount(id); });
        return;
    }
    var acct = _investAccounts.find(function(a) { return a.id === id; });
    if (!acct) return;

    var cache = {};
    try {
        if (acct.accountNumberEnc) cache.accountNumber = await legacyDecrypt(acct.accountNumberEnc) || '';
        if (acct.usernameEnc)      cache.username      = await legacyDecrypt(acct.usernameEnc)      || '';
        if (acct.passwordEnc)      cache.password      = await legacyDecrypt(acct.passwordEnc)      || '';
    } catch (e) {
        console.error('Investments decrypt error', e);
    }
    _investDecryptCache[id] = cache;
    _investRevealedIds[id]  = true;
    _investExpandedIds[id]  = true;
    _investRenderList();
}

function _investHideAccount(id) {
    delete _investRevealedIds[id];
    delete _investDecryptCache[id];
    _investRenderList();
}

// Navigate to edit form, switching person filter to the account's actual namespace first
function _investEditAccount(id, ns) {
    if (ns && ns !== _investPersonFilter) {
        _investPersonFilter = ns;
    }
    window.location.hash = '#investments/accounts/edit/' + id;
}

// ---------- Person Switcher ----------

async function _investOnPersonChange() {
    var sel = document.getElementById('investPersonSel');
    if (sel) _investPersonFilter = sel.value || 'self';
    await _investLoadAccounts();
    _investRenderList();
}

// ---------- Manage Menu ----------

function _investToggleManageMenu(e) {
    if (e) e.stopPropagation();
    var menu = document.getElementById('investManageMenu');
    var isOpen = menu.classList.toggle('open');
    if (isOpen) {
        setTimeout(function() {
            document.addEventListener('click', _investCloseManageMenu, { once: true });
        }, 0);
    }
}

function _investCloseManageMenu() {
    var menu = document.getElementById('investManageMenu');
    if (menu) menu.classList.remove('open');
}

// ---------- Manage People ----------

function _investOpenPeopleModal() {
    _investCloseManageMenu();
    _investRenderPeopleModal();
    openModal('investPeopleModal');
}

function _investRenderPeopleModal() {
    var body = document.getElementById('investPeopleListBody');
    if (!body) return;

    if (_investPeople.length === 0) {
        body.innerHTML = '<p class="invest-people-empty">No additional people added yet.</p>';
    } else {
        var html = '';
        _investPeople.forEach(function(p) {
            html += '<div class="invest-people-row">' +
                '<span>' + escapeHtml(p.name) + '</span>' +
                '<button class="btn btn-danger btn-small"' +
                    ' onclick="_investRemovePerson(\'' + escapeHtml(p.id) + '\')">Remove</button>' +
            '</div>';
        });
        body.innerHTML = html;
    }

    if (typeof buildContactPicker === 'function') {
        buildContactPicker('investPeoplePicker', {
            placeholder: 'Search contacts to add…',
            onSelect: function(contactId, contactName) {
                _investAddPerson(contactId, contactName);
            }
        });
    }
}

async function _investAddPerson(contactId, contactName) {
    if (_investPeople.find(function(p) { return p.id === contactId; })) return;
    _investPeople.push({ id: contactId, name: contactName });
    _investPeople.sort(function(a, b) { return a.name.localeCompare(b.name); });
    var ids = _investPeople.map(function(p) { return p.id; });
    await userCol('settings').doc('investments').set({ enrolledPersonIds: ids }, { merge: true });
    _investRenderPeopleModal();
    var searchInput = document.getElementById('investPeoplePicker_search');
    if (searchInput) searchInput.focus();
}

async function _investRemovePerson(contactId) {
    _investPeople = _investPeople.filter(function(p) { return p.id !== contactId; });
    var ids = _investPeople.map(function(p) { return p.id; });
    await userCol('settings').doc('investments').set({ enrolledPersonIds: ids }, { merge: true });
    if (_investPersonFilter === contactId) _investPersonFilter = 'self';
    _investRenderPeopleModal();
}

// ---------- Add / Edit Form Page ----------

var _investFormEditId      = null;  // null = add mode; account ID = edit mode
var _investFormDraft       = null;  // basic field values preserved across passphrase unlock
var _investFormReturnTo    = null;  // 'summary' or null (defaults back to Accounts list)
var _investAccountReturnTo = null;  // 'summary' or 'stocks' or null (defaults back to Accounts list)
var _investFormOriginalNs  = 'self'; // namespace the account was loaded from (for migration on owner change)

async function loadInvestmentsFormPage(id) {
    _investFormEditId = id || null;
    var isNew = !id;
    var acct  = id ? _investAccounts.find(function(a) { return a.id === id; }) : null;

    // If navigated directly (e.g. back/forward) without the list in memory, load it first
    if (id && !acct) {
        await _investLoadAll();
        acct = _investAccounts.find(function(a) { return a.id === id; });
    }

    // Record original namespace so save can detect an owner change
    _investFormOriginalNs = _investPersonFilter || 'self';

    var returnHref  = _investFormReturnTo === 'summary' ? '#investments/summary' : '#investments/accounts';
    var returnLabel = _investFormReturnTo === 'summary' ? 'Summary'              : 'Accounts';
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#investments">Financial</a><span class="separator">&rsaquo;</span>' +
        '<a href="' + returnHref + '">' + returnLabel + '</a><span class="separator">&rsaquo;</span>' +
        '<span>' + (isNew ? 'Add Account' : 'Edit Account') + '</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';

    var typeOpts = '';
    INVEST_ACCOUNT_TYPES.forEach(function(t) {
        typeOpts += '<option value="' + escapeHtml(t.value) + '">' + escapeHtml(t.label) + '</option>';
    });

    // Build joint-contact options from enrolled people
    var jointOpts = '<option value="">— Select person —</option>';
    _investPeople.forEach(function(p) {
        jointOpts += '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + '</option>';
    });

    var page = document.getElementById('page-investments-form');
    if (!page) return;

    // Build person dropdown — Me + each enrolled contact
    var personOpts = '<option value="self">Me</option>';
    _investPeople.forEach(function(p) {
        personOpts += '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + '</option>';
    });
    var personDisabled = _investPeople.length === 0 ? ' disabled' : '';

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>' + (isNew ? 'Add Account' : 'Edit Account') + '</h2>' +
        '</div>' +
        '<div class="invest-form">' +
            '<div class="form-group">' +
                '<label>Account Holder</label>' +
                '<select id="investFormPersonNs"' + personDisabled + '>' + personOpts + '</select>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Account Type *</label>' +
                '<select id="investFormType" onchange="_investFormTypeChange()">' + typeOpts + '</select>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Nickname *</label>' +
                '<input type="text" id="investFormNickname" placeholder="e.g. Fidelity Roth IRA">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Owner</label>' +
                '<div class="invest-owner-radios">' +
                    '<label class="invest-radio-label">' +
                        '<input type="radio" name="investOwnerType" value="personal" onchange="_investToggleJointField()"> Personal' +
                    '</label>' +
                    '<label class="invest-radio-label">' +
                        '<input type="radio" name="investOwnerType" value="joint" onchange="_investToggleJointField()"> Joint' +
                    '</label>' +
                '</div>' +
            '</div>' +
            '<div class="form-group" id="investFormJointWrap" style="display:none">' +
                '<label>Joint With</label>' +
                '<select id="investFormJointContact">' + jointOpts + '</select>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Institution</label>' +
                '<input type="text" id="investFormInstitution" placeholder="e.g. Fidelity Investments">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Last 4 Digits</label>' +
                '<input type="text" id="investFormLast4" placeholder="1234" maxlength="4">' +
            '</div>' +
            '<div class="form-group" id="investFormCashBalanceGroup">' +
                '<label>Cash Balance ($)</label>' +
                '<input type="text" inputmode="decimal" id="investFormCashBalance" placeholder="$0.00"' +
                    ' onfocus="_investUnfmtCashField(this)" onblur="_investFmtCashField(this)">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>URL</label>' +
                '<input type="url" id="investFormUrl" placeholder="https://...">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Login Notes</label>' +
                '<textarea id="investFormLoginNotes" rows="3"' +
                    ' placeholder="2FA method, authenticator app, etc."></textarea>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Beneficiary</label>' +
                '<input type="text" id="investFormBeneficiary"' +
                    ' placeholder="Who inherits this account">' +
            '</div>' +
            '<div class="invest-form-sensitive-section">' +
                '<div class="invest-modal-sensitive-header">Sensitive Fields</div>' +
                '<div id="investFormSensitiveContent"></div>' +
            '</div>' +
            '<div class="invest-form-actions">' +
                '<button class="btn btn-primary" onclick="_investSaveForm()">Save</button>' +
                '<button class="btn btn-secondary" onclick="_investCancelForm()">Cancel</button>' +
            '</div>' +
        '</div>';

    // Populate fields — use preserved draft values if returning from passphrase prompt
    var d = _investFormDraft;
    // Set person dropdown — draft wins, then original ns, then current filter
    _investVal('investFormPersonNs', d ? d.personNs : _investFormOriginalNs);

    _investVal('investFormType',        d ? d.accountType   : (acct ? acct.accountType  || '' : ''));
    _investVal('investFormNickname',    d ? d.nickname      : (acct ? acct.nickname     || '' : ''));
    _investVal('investFormInstitution', d ? d.institution   : (acct ? acct.institution  || '' : ''));
    _investVal('investFormLast4',       d ? d.last4         : (acct ? acct.last4        || '' : ''));
    _investVal('investFormCashBalance', d ? d.cashBalance   : (acct ? acct.cashBalance  != null ? acct.cashBalance : '' : ''));
    _investVal('investFormUrl',         d ? d.url           : (acct ? acct.url          || '' : ''));
    _investVal('investFormLoginNotes',  d ? d.loginNotes    : (acct ? acct.loginNotes   || '' : ''));
    _investVal('investFormBeneficiary', d ? d.beneficiary   : (acct ? acct.beneficiary  || '' : ''));

    // Set owner type radio
    var ownerType = d ? d.ownerType : (acct ? acct.ownerType || 'personal' : 'personal');
    var radios = document.querySelectorAll('input[name="investOwnerType"]');
    radios.forEach(function(r) { r.checked = (r.value === ownerType); });
    _investToggleJointField();

    // Set joint contact select
    var primaryContactId = d ? d.primaryContactId : (acct ? acct.primaryContactId || '' : '');
    _investVal('investFormJointContact', primaryContactId);

    _investFormDraft = null; // consumed

    // Format the cash balance field with $ on initial render, and show/hide based on type
    var cashEl = document.getElementById('investFormCashBalance');
    if (cashEl && cashEl.value !== '') _investFmtCashField(cashEl);
    _investFormTypeChange();

    await _investRenderSensitiveFields(acct);
}

function _investToggleJointField() {
    var selectedRadio = document.querySelector('input[name="investOwnerType"]:checked');
    var wrap = document.getElementById('investFormJointWrap');
    if (wrap) {
        wrap.style.display = (selectedRadio && selectedRadio.value === 'joint') ? '' : 'none';
    }
}

async function _investRenderSensitiveFields(acct) {
    var container = document.getElementById('investFormSensitiveContent');
    if (!container) return;

    if (!legacyIsUnlocked()) {
        container.innerHTML =
            '<div class="invest-modal-lock">' +
                '<span>Enter your Legacy passphrase to edit Account Number, Username, and Password.</span>' +
                '<button class="btn btn-secondary" onclick="_investUnlockForForm()">🔓 Unlock Sensitive Fields</button>' +
            '</div>';
        return;
    }

    var acctNum = '', uname = '', pwd = '';
    if (acct) {
        try {
            if (acct.accountNumberEnc) acctNum = await legacyDecrypt(acct.accountNumberEnc) || '';
            if (acct.usernameEnc)      uname   = await legacyDecrypt(acct.usernameEnc)      || '';
            if (acct.passwordEnc)      pwd     = await legacyDecrypt(acct.passwordEnc)      || '';
        } catch (e) { console.error('Investments form decrypt error', e); }
    }

    container.innerHTML =
        '<div class="form-group">' +
            '<label>Account Number</label>' +
            '<input type="text" id="investFormAcctNum" placeholder="Full account number"' +
                ' oninput="_investAutoLast4(this.value)">' +
        '</div>' +
        '<div class="form-group">' +
            '<label>Username</label>' +
            '<input type="text" id="investFormUsername" autocomplete="off" placeholder="Login username">' +
        '</div>' +
        '<div class="form-group">' +
            '<label>Password</label>' +
            '<input type="text" id="investFormPassword" autocomplete="off" placeholder="Login password">' +
        '</div>';

    _investVal('investFormAcctNum',  acctNum);
    _investVal('investFormUsername', uname);
    _investVal('investFormPassword', pwd);
}

function _investUnlockForForm() {
    // Capture what the user has typed so it survives the page re-render after unlock
    var selectedRadio = document.querySelector('input[name="investOwnerType"]:checked');
    _investFormDraft = {
        personNs:         (document.getElementById('investFormPersonNs')     || {}).value || _investFormOriginalNs,
        accountType:      (document.getElementById('investFormType')         || {}).value || '',
        nickname:         (document.getElementById('investFormNickname')     || {}).value || '',
        ownerType:        selectedRadio ? selectedRadio.value : 'personal',
        primaryContactId: (document.getElementById('investFormJointContact') || {}).value || '',
        institution:      (document.getElementById('investFormInstitution')  || {}).value || '',
        last4:            (document.getElementById('investFormLast4')        || {}).value || '',
        cashBalance:      (document.getElementById('investFormCashBalance')  || {}).value || '',
        url:              (document.getElementById('investFormUrl')          || {}).value || '',
        loginNotes:       (document.getElementById('investFormLoginNotes')   || {}).value || '',
        beneficiary:      (document.getElementById('investFormBeneficiary')  || {}).value || ''
    };
    _legacyRequireUnlock(function() {
        loadInvestmentsFormPage(_investFormEditId);
    });
}

async function _investSaveForm() {
    var accountType = (document.getElementById('investFormType')     || {}).value || '';
    var nickname    = ((document.getElementById('investFormNickname') || {}).value || '').trim();

    if (!accountType) { alert('Please select an account type.'); return; }
    if (!nickname)    { alert('Please enter a nickname.'); return; }

    var selectedRadio    = document.querySelector('input[name="investOwnerType"]:checked');
    var ownerType        = selectedRadio ? selectedRadio.value : 'personal';
    var primaryContactId = ownerType === 'joint'
        ? ((document.getElementById('investFormJointContact') || {}).value || '')
        : '';

    var cashBalanceRaw = ((document.getElementById('investFormCashBalance') || {}).value || '').trim().replace(/[^0-9.]/g, '');
    var cashBalance    = cashBalanceRaw !== '' ? parseFloat(cashBalanceRaw) : null;

    var selectedNs = (document.getElementById('investFormPersonNs') || {}).value || _investFormOriginalNs;
    var id    = _investFormEditId;
    var isNew = !id;

    var data = {
        accountType:      accountType,
        nickname:         nickname,
        ownerType:        ownerType,
        primaryContactId: primaryContactId,
        institution:      ((document.getElementById('investFormInstitution') || {}).value || '').trim(),
        last4:            ((document.getElementById('investFormLast4')       || {}).value || '').replace(/\D/g, '').slice(0, 4),
        url:              ((document.getElementById('investFormUrl')         || {}).value || '').trim(),
        loginNotes:       ((document.getElementById('investFormLoginNotes')  || {}).value || '').trim(),
        beneficiary:      ((document.getElementById('investFormBeneficiary') || {}).value || '').trim()
    };

    if (cashBalance !== null && !isNaN(cashBalance)) {
        data.cashBalance = cashBalance;
    } else if (!isNew) {
        // FieldValue.delete() is only valid in update() — for new docs just omit the field
        data.cashBalance = firebase.firestore.FieldValue.delete();
    }

    // Encrypt sensitive fields only if passphrase is unlocked and fields are rendered
    if (legacyIsUnlocked() && document.getElementById('investFormAcctNum')) {
        var existing    = id ? _investAccounts.find(function(a) { return a.id === id; }) : null;
        var acctNumVal  = ((document.getElementById('investFormAcctNum')  || {}).value || '').trim();
        var usernameVal = ((document.getElementById('investFormUsername') || {}).value || '').trim();
        var passwordVal = ((document.getElementById('investFormPassword') || {}).value || '').trim();

        if (acctNumVal) {
            data.accountNumberEnc = await legacyEncrypt(acctNumVal);
        } else if (existing && existing.accountNumberEnc) {
            data.accountNumberEnc = firebase.firestore.FieldValue.delete();
        }
        if (usernameVal) {
            data.usernameEnc = await legacyEncrypt(usernameVal);
        } else if (existing && existing.usernameEnc) {
            data.usernameEnc = firebase.firestore.FieldValue.delete();
        }
        if (passwordVal) {
            data.passwordEnc = await legacyEncrypt(passwordVal);
        } else if (existing && existing.passwordEnc) {
            data.passwordEnc = firebase.firestore.FieldValue.delete();
        }
    }

    var targetCol = userCol('investments').doc(selectedNs).collection('accounts');

    if (isNew) {
        data.sortOrder = _investAccounts.filter(function(a) { return !a.archived; }).length;
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await targetCol.add(data);
    } else if (selectedNs !== _investFormOriginalNs) {
        // Owner changed — migrate account + all holdings to new namespace
        var newRef    = targetCol.doc();
        var oldAcctRef = userCol('investments').doc(_investFormOriginalNs).collection('accounts').doc(id);
        data.sortOrder = 0;
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await newRef.set(data);

        // Copy then delete holdings in batches
        var holdSnap = await oldAcctRef.collection('holdings').get();
        if (!holdSnap.empty) {
            var batch = firebase.firestore().batch();
            holdSnap.forEach(function(hdoc) {
                batch.set(newRef.collection('holdings').doc(hdoc.id), hdoc.data());
                batch.delete(hdoc.ref);
            });
            await batch.commit();
        }
        await oldAcctRef.delete();
        _investPersonFilter = selectedNs; // show the new owner on return
    } else {
        await userCol('investments').doc(selectedNs).collection('accounts').doc(id).update(data);
    }

    var dest = _investFormReturnTo === 'summary' ? '#investments/summary' : '#investments/accounts';
    _investFormEditId   = null;
    _investFormDraft    = null;
    _investFormReturnTo = null;
    window.location.hash = dest;
}

function _investFormTypeChange() {
    var type  = (document.getElementById('investFormType') || {}).value || '';
    var group = document.getElementById('investFormCashBalanceGroup');
    if (!group) return;
    // Cash balance only applies to bank/cash accounts; investment accounts manage it via the holdings table
    var isCash = _INVEST_CASH_TYPES.indexOf(type) >= 0 || type === 'other' || type === '';
    group.style.display = isCash ? '' : 'none';
}

function _investCancelForm() {
    var dest = _investFormReturnTo === 'summary' ? '#investments/summary' : '#investments/accounts';
    _investFormEditId   = null;
    _investFormDraft    = null;
    _investFormReturnTo = null;
    window.location.hash = dest;
}

// ---------- Archive / Restore ----------

async function _investArchive(id) {
    if (!confirm('Archive this account? It will be hidden from the main list. You can restore it anytime with "Show Archived".')) return;
    await _investCol().doc(id).update({ archived: true });
    delete _investExpandedIds[id];
    await _investLoadAccounts();
    _investRenderList();
}

async function _investRestore(id) {
    await _investCol().doc(id).update({ archived: false });
    await _investLoadAccounts();
    _investRenderList();
}

// ---------- Drag-to-Reorder ----------

async function _investOnReorder(evt) {
    if (evt.oldIndex === evt.newIndex) return;
    // Only reorder personal (non-joint) accounts in self namespace
    var list = _investAccounts.filter(function(a) { return (!a.archived) && (!a._joint) && (a.ownerType !== 'joint'); });
    var moved = list.splice(evt.oldIndex, 1)[0];
    list.splice(evt.newIndex, 0, moved);

    var batch = firebase.firestore().batch();
    list.forEach(function(acct, i) {
        batch.update(_investCol().doc(acct.id), { sortOrder: i });
    });
    await batch.commit();
    await _investLoadAccounts();
}

// ---------- Show/Hide Archived ----------

function _investToggleArchived() {
    _investShowArchived = !_investShowArchived;
    var btn = document.getElementById('investShowArchivedBtn');
    if (btn) btn.textContent = _investShowArchived ? 'Hide Archived' : 'Show Archived';
    _investRenderList();
}

// ---------- Helpers ----------

function _investAutoLast4(value) {
    var digits = value.replace(/\D/g, '');
    if (digits.length >= 4) {
        _investVal('investFormLast4', digits.slice(-4));
    }
}

function _investVal(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value !== undefined && value !== null ? value : '';
}

// ============================================================
// GROUPS  (investmentGroups collection)
// ============================================================

var _investGroups      = [];    // [{id, name, personIds, snapshotFrequencies, isDefault}]
var _investGroupEditId = null;  // null = add mode; group doc ID = edit mode

// ---------- Investment Config State ----------

var _investConfig         = { projectedRoR: 0.06, afterTaxPct: 0.82, retirementAges: {}, selectedBudgetId: null };
var _investSummaryGroupId = null;  // selected group on the summary page
var _investBudgets        = [];    // [{id, name}] all non-archived budgets
var _investDefaultBudgetId = null; // from settings/app.defaultBudgetId

// ---------- Snapshot page state ----------

// Caches full snapshot arrays (per type) for the "More" modal
var _investSnapshotsAll = {};

// Returns the ISO date string (YYYY-MM-DD) of the most-recent Sunday <= today.
function _investWeekStart() {
    var d = new Date();
    d.setDate(d.getDate() - d.getDay()); // back to Sunday
    return d.toISOString().split('T')[0];
}

function _investConfigCol() {
    return userCol('investmentConfig');
}

async function _investLoadConfig() {
    try {
        var doc = await _investConfigCol().doc('main').get();
        if (doc.exists) {
            _investConfig = Object.assign({ projectedRoR: 0.06, afterTaxPct: 0.82, retirementAges: {}, selectedBudgetId: null }, doc.data());
        } else {
            // Auto-create with defaults
            await _investConfigCol().doc('main').set({ projectedRoR: 0.06, afterTaxPct: 0.82, retirementAges: {}, selectedBudgetId: null });
        }
    } catch (e) { console.error('Error loading investmentConfig', e); }
}

function _investToggleRetireConfig() {
    _investRetireConfigOpen = !_investRetireConfigOpen;
    var cfg = document.getElementById('investRetireConfig');
    if (cfg) cfg.style.display = _investRetireConfigOpen ? '' : 'none';
    var btn = document.getElementById('investRetireGearBtn');
    if (btn) btn.classList.toggle('invest-retire-gear--active', _investRetireConfigOpen);
}

async function _investSaveConfig() {
    var rorRaw = ((document.getElementById('investConfigRoR')      || {}).value || '').trim();
    var atpRaw = ((document.getElementById('investConfigAfterTax') || {}).value || '').trim();
    var ror    = parseFloat(rorRaw);
    var atp    = parseFloat(atpRaw);
    if (isNaN(ror) || ror <= 0 || ror > 1) { alert('Enter a decimal rate (e.g. 0.06 for 6%).'); return; }
    if (isNaN(atp) || atp <= 0 || atp > 1) { alert('Enter a decimal fraction (e.g. 0.82 for 82%).'); return; }
    _investConfig.projectedRoR = ror;
    _investConfig.afterTaxPct  = atp;

    // Read per-person retirement ages
    var ages = {};
    document.querySelectorAll('.invest-retire-age-row').forEach(function(row) {
        var pid = row.dataset.personId;
        var sel = row.querySelector('.invest-retire-age-sel');
        var txt = row.querySelector('.invest-retire-age-txt');
        if (!pid || !sel) return;
        var val = sel.value === 'other' ? parseInt((txt || {}).value || '') : parseInt(sel.value);
        if (val > 0) ages[pid] = val;
    });
    _investConfig.retirementAges = ages;

    // Read selected budget
    var budgetSel = document.getElementById('investConfigBudget');
    _investConfig.selectedBudgetId = budgetSel ? (budgetSel.value || null) : _investConfig.selectedBudgetId;

    await _investConfigCol().doc('main').set(_investConfig);
    await _investRenderSummaryPage();
}

function _investGroupCol() {
    return userCol('investmentGroups');
}

async function _investLoadGroups() {
    var snap = await _investGroupCol().orderBy('createdAt').get();
    _investGroups = [];
    snap.forEach(function(doc) {
        _investGroups.push(Object.assign({ id: doc.id }, doc.data()));
    });
}

// Auto-create the "Me" group on first visit if no groups exist yet.
async function _investEnsureMeGroup() {
    var snap = await _investGroupCol().limit(1).get();
    if (!snap.empty) return;
    await _investGroupCol().add({
        name:                'Me',
        personIds:           ['self'],
        snapshotFrequencies: ['daily', 'weekly', 'monthly', 'yearly'],
        isDefault:           true,
        createdAt:           firebase.firestore.FieldValue.serverTimestamp()
    });
}

// ---------- Manage Groups Page ----------

async function loadInvestmentsGroupsPage() {
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#investments">Financial</a><span class="separator">&rsaquo;</span><span>Manage Groups</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';

    if (_investPeople.length === 0) await _investLoadAll();
    await _investLoadGroups();
    _investRenderGroupsPage();
}

function _investRenderGroupsPage() {
    var page = document.getElementById('page-investments-groups');
    if (!page) return;

    var html =
        '<div class="page-header">' +
            '<h2>⚙ Groups</h2>' +
            '<div class="page-header-actions">' +
                '<a class="btn btn-primary" href="#investments/group/new">+ Add Group</a>' +
            '</div>' +
        '</div>' +
        '<p class="invest-groups-desc">Groups define which people\'s accounts are combined in the Portfolio Summary and Snapshots. The <strong>Me</strong> group is created automatically and cannot be deleted.</p>' +
        '<div class="invest-groups-list">';

    if (_investGroups.length === 0) {
        html += '<div class="empty-state">No groups yet.</div>';
    } else {
        _investGroups.forEach(function(g) { html += _investGroupCardHtml(g); });
    }

    html += '</div>';
    page.innerHTML = html;
}

function _investGroupCardHtml(g) {
    var peopleLabels = (g.personIds || []).map(function(pid) {
        if (pid === 'self') return 'Me';
        var p = _investPeople.find(function(p) { return p.id === pid; });
        return p ? escapeHtml(p.name) : pid;
    });

    var freqLabels = {
        daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly'
    };
    var freqs = (g.snapshotFrequencies || []).map(function(f) {
        return '<span class="invest-freq-badge">' + (freqLabels[f] || f) + '</span>';
    }).join('');

    return '<div class="invest-group-card">' +
        '<div class="invest-group-card-header">' +
            '<span class="invest-group-name">' + escapeHtml(g.name) + '</span>' +
            (g.isDefault ? '<span class="invest-group-default-badge">Default</span>' : '') +
        '</div>' +
        '<div class="invest-group-detail">' +
            '<span class="invest-group-detail-label">People:</span> ' +
            escapeHtml(peopleLabels.join(', ')) +
        '</div>' +
        '<div class="invest-group-detail">' +
            '<span class="invest-group-detail-label">Snapshots:</span> ' +
            (freqs || '<em style="color:#aaa">none selected</em>') +
        '</div>' +
        '<div class="invest-group-card-actions">' +
            '<a class="btn btn-secondary btn-small" href="#investments/group/edit/' + g.id + '">Edit</a>' +
            (!g.isDefault
                ? '<button class="btn btn-danger btn-small" onclick="_investDeleteGroup(\'' + g.id + '\')">Delete</button>'
                : '') +
        '</div>' +
    '</div>';
}

// ---------- Add/Edit Group Page ----------

async function loadInvestmentsGroupEditPage(groupId) {
    _investGroupEditId = groupId || null;
    var isNew = !groupId;

    if (_investPeople.length === 0) await _investLoadAll();
    if (_investGroups.length === 0) await _investLoadGroups();

    var g = groupId ? _investGroups.find(function(x) { return x.id === groupId; }) : null;
    var title = isNew ? 'Add Group' : 'Edit Group';

    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#investments">Financial</a><span class="separator">&rsaquo;</span>' +
        '<a href="#investments/groups">Manage Groups</a><span class="separator">&rsaquo;</span>' +
        '<span>' + title + '</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';

    // People checkboxes
    var selectedIds = g ? (g.personIds || []) : ['self'];
    var meChecked = selectedIds.indexOf('self') >= 0;
    var peopleHtml =
        '<label class="ig-edit-row">' +
            '<input type="checkbox" name="investGroupPerson" value="self"' +
                (meChecked ? ' checked' : '') + '> Me' +
        '</label>';
    _investPeople.forEach(function(p) {
        var checked = selectedIds.indexOf(p.id) >= 0;
        peopleHtml +=
            '<label class="ig-edit-row">' +
                '<input type="checkbox" name="investGroupPerson" value="' + escapeHtml(p.id) + '"' +
                    (checked ? ' checked' : '') + '> ' +
                escapeHtml(p.name) +
            '</label>';
    });

    // Frequency checkboxes
    var selectedFreqs = g ? (g.snapshotFrequencies || []) : ['daily', 'weekly', 'monthly', 'yearly'];
    var freqItems = [
        { val: 'daily', label: 'Daily' }, { val: 'weekly', label: 'Weekly' },
        { val: 'monthly', label: 'Monthly' }, { val: 'yearly', label: 'Yearly' }
    ];
    var freqHtml = freqItems.map(function(f) {
        var checked = selectedFreqs.indexOf(f.val) >= 0;
        return '<label class="ig-edit-row">' +
            '<input type="checkbox" name="investGroupFreq" value="' + f.val + '"' +
                (checked ? ' checked' : '') + '> ' + f.label +
        '</label>';
    }).join('');

    var page = document.getElementById('page-investments-group-edit');
    if (!page) return;

    page.innerHTML =
        '<div class="page-header"><h2>' + escapeHtml(title) + '</h2></div>' +
        '<div class="ig-edit-form">' +
            '<div class="form-group">' +
                '<label>Group Name *</label>' +
                '<input type="text" id="investGroupName" placeholder="e.g. Our Household" value="' +
                    escapeHtml(g ? g.name : '') + '">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>People</label>' +
                '<div class="ig-edit-list">' + peopleHtml + '</div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Snapshot Frequencies</label>' +
                '<div class="ig-edit-list">' + freqHtml + '</div>' +
            '</div>' +
            '<div class="ig-edit-actions">' +
                '<button class="btn btn-primary" onclick="_investSaveGroup()">Save</button>' +
                '<a class="btn btn-secondary" href="#investments/groups">Cancel</a>' +
            '</div>' +
        '</div>';

    var nameEl = document.getElementById('investGroupName');
    if (nameEl) setTimeout(function() { nameEl.focus(); }, 50);
}

async function _investSaveGroup() {
    var name = ((document.getElementById('investGroupName') || {}).value || '').trim();
    if (!name) { alert('Please enter a group name.'); return; }

    // Collect selected people (Me / self is now an optional checkbox like any other)
    var personIds = [];
    document.querySelectorAll('input[name="investGroupPerson"]:checked').forEach(function(cb) {
        if (cb.value && personIds.indexOf(cb.value) < 0) personIds.push(cb.value);
    });
    if (personIds.length === 0) { alert('Please select at least one person for this group.'); return; }

    // Collect selected frequencies
    var freqs = [];
    document.querySelectorAll('input[name="investGroupFreq"]:checked').forEach(function(cb) {
        freqs.push(cb.value);
    });

    var isNew = !_investGroupEditId;
    var data  = { name: name, personIds: personIds, snapshotFrequencies: freqs };

    if (isNew) {
        data.isDefault = false;
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await _investGroupCol().add(data);
    } else {
        // Preserve isDefault on the Me group
        var existing = _investGroups.find(function(g) { return g.id === _investGroupEditId; });
        if (existing && existing.isDefault) data.isDefault = true;
        await _investGroupCol().doc(_investGroupEditId).update(data);
    }

    await _investLoadGroups();
    window.location.hash = '#investments/groups';
}

async function _investDeleteGroup(groupId) {
    var g = _investGroups.find(function(x) { return x.id === groupId; });
    if (!g || g.isDefault) return;
    if (!confirm('Delete group "' + (g.name || 'this group') + '"? This cannot be undone.')) return;
    await _investGroupCol().doc(groupId).delete();
    await _investLoadGroups();
    _investRenderGroupsPage();
}

// ---------- Group Switcher Component ----------
// Renders a group dropdown into containerId. Returns the active group ID.
// Renders nothing (empty container) if only one group exists.
function _investRenderGroupSwitcher(containerId, selectedGroupId) {
    var container = document.getElementById(containerId);
    if (!container) return selectedGroupId;

    if (_investGroups.length <= 1) {
        container.innerHTML = '';
        return (_investGroups.length === 1) ? _investGroups[0].id : null;
    }

    var opts = _investGroups.map(function(g) {
        return '<option value="' + escapeHtml(g.id) + '"' +
            (g.id === selectedGroupId ? ' selected' : '') + '>' +
            escapeHtml(g.name) + '</option>';
    }).join('');

    container.innerHTML =
        '<div class="invest-group-switcher">' +
            '<label class="invest-group-switcher-label">Group:</label>' +
            '<select id="investGroupSelect" onchange="_investOnGroupSwitch(this.value)">' + opts + '</select>' +
        '</div>';

    return selectedGroupId || (_investGroups[0] ? _investGroups[0].id : null);
}

// Set by each page that uses the group switcher; called when the dropdown changes
var _investGroupSwitchHandler = null;
function _investOnGroupSwitch(groupId) {
    if (typeof _investGroupSwitchHandler === 'function') {
        _investGroupSwitchHandler(groupId);
    }
}

// ============================================================
// FINNHUB PRICE FETCHING
// ============================================================

var _investFinnhubApiKey  = null;  // null = not yet loaded from Firestore
var _investYahooWorkerUrl = null;  // null = not yet loaded; '' = not configured

function _investInvalidateFinnhubKey() { _investFinnhubApiKey  = null; }
function _investInvalidateYahooWorkerUrl() { _investYahooWorkerUrl = null; }

async function _investGetFinnhubKey() {
    if (_investFinnhubApiKey !== null) return _investFinnhubApiKey;
    try {
        var doc = await userCol('settings').doc('investments').get();
        _investFinnhubApiKey = (doc.exists && doc.data().finnhubApiKey) ? doc.data().finnhubApiKey : '';
    } catch (e) {
        _investFinnhubApiKey = '';
    }
    return _investFinnhubApiKey;
}

async function _investGetYahooWorkerUrl() {
    if (_investYahooWorkerUrl !== null) return _investYahooWorkerUrl;
    try {
        var doc = await userCol('settings').doc('investments').get();
        _investYahooWorkerUrl = (doc.exists && doc.data().yahooWorkerUrl) ? doc.data().yahooWorkerUrl.trim() : '';
    } catch (e) {
        _investYahooWorkerUrl = '';
    }
    return _investYahooWorkerUrl;
}

// Fetch the current price for a single ticker from Finnhub.
// Returns numeric price (current if market open, previous close if closed), or throws on error.
// Try Finnhub for one ticker. Returns price (number) or null; throws only on invalid key.
async function _investFetchPriceFinnhub(ticker, apiKey) {
    var url  = 'https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(ticker) +
               '&token=' + encodeURIComponent(apiKey);
    var resp = await fetch(url);
    if (resp.status === 401) throw new Error('invalid key');
    if (!resp.ok) { console.log('[prices] Finnhub ' + resp.status + ' for ' + ticker); return null; }
    var data = await resp.json();
    if (data.error) { console.log('[prices] Finnhub error for ' + ticker + ': ' + data.error); return null; }
    var price = (data.c && data.c > 0) ? data.c : (data.pc && data.pc > 0 ? data.pc : null);
    return price;
}

// Yahoo Finance price lookup for tickers Finnhub missed.
// If a Cloudflare Worker URL is configured in Settings, uses it directly (reliable, no CORS issues).
// Otherwise falls back to a chain of free public CORS proxies with retry logic.
// Returns { ticker: price } for tickers that resolved; missing entries = not found.
async function _investFetchYahooBatch(tickers) {
    if (!tickers.length) return {};
    var map = {};
    var workerUrl = await _investGetYahooWorkerUrl();

    if (workerUrl) {
        // Cloudflare Worker path — no delays needed, no proxy chain
        var base = workerUrl.replace(/\/$/, '');
        for (var ti = 0; ti < tickers.length; ti++) {
            var ticker = tickers[ti];
            try {
                var resp  = await fetch(base + '?ticker=' + encodeURIComponent(ticker));
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                var data  = await resp.json();
                var price = data && data.chart && data.chart.result &&
                            data.chart.result[0] && data.chart.result[0].meta &&
                            data.chart.result[0].meta.regularMarketPrice;
                if (price && price > 0) {
                    console.log('[prices] Worker ' + ticker + ' = ' + price);
                    map[ticker] = price;
                } else {
                    throw new Error('no price in response');
                }
            } catch (e) {
                console.log('[prices] Worker failed for ' + ticker + ': ' + e.message);
            }
        }
    } else {
        // Free CORS proxy chain — sequential with delays to avoid rate limiting
        for (var ti = 0; ti < tickers.length; ti++) {
            if (ti > 0) await new Promise(function(r) { setTimeout(r, 800); });
            var ticker      = tickers[ti];
            var yahooTarget = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
                              encodeURIComponent(ticker) + '?interval=1d&range=1d';
            var proxies = [
                'https://api.allorigins.win/raw?url=' + encodeURIComponent(yahooTarget),
                'https://corsproxy.io/?' + encodeURIComponent(yahooTarget),
                'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(yahooTarget)
            ];
            for (var i = 0; i < proxies.length; i++) {
                var attempts = (i === 0) ? 2 : 1; // retry proxy 0 once after a delay (cold rate-limit recovery)
                var success  = false;
                for (var attempt = 0; attempt < attempts && !success; attempt++) {
                    if (attempt > 0) await new Promise(function(r) { setTimeout(r, 1200); });
                    try {
                        var resp  = await fetch(proxies[i]);
                        if (!resp.ok) throw new Error('HTTP ' + resp.status);
                        var data  = await resp.json();
                        var price = data && data.chart && data.chart.result &&
                                    data.chart.result[0] && data.chart.result[0].meta &&
                                    data.chart.result[0].meta.regularMarketPrice;
                        if (price && price > 0) {
                            console.log('[prices] Yahoo ' + ticker + ' = ' + price + ' via proxy ' + i + (attempt > 0 ? ' (retry)' : ''));
                            map[ticker] = price;
                            success = true;
                        } else {
                            throw new Error('no price in response');
                        }
                    } catch (e) {
                        console.log('[prices] Yahoo proxy ' + i + ' attempt ' + attempt + ' failed for ' + ticker + ': ' + e.message);
                    }
                }
                if (success) break;
            }
        }
    }
    return map;
}

// Show a modal with price update results. Auto-closes after 2s if all succeeded.
function _investShowPriceResultModal(updatedCount, failed, failedMsg, workerUrl) {
    var body = document.getElementById('investPriceResultBody');
    if (!body) return;
    var html = '';
    if (failed.length === 0) {
        html = '<p class="invest-price-ok">✓ All ' + updatedCount + ' price' + (updatedCount !== 1 ? 's' : '') + ' updated successfully.</p>';
        body.innerHTML = html;
        openModal('investPriceResultModal');
        setTimeout(function() { closeModal('investPriceResultModal'); }, 2000);
    } else {
        html += '<p><strong>' + updatedCount + '</strong> updated · <strong>' + failed.length + '</strong> failed</p>';
        html += '<ul class="invest-price-fail-list">';
        failed.forEach(function(t) {
            html += '<li><strong>' + escapeHtml(t) + '</strong> — ' + escapeHtml(failedMsg[t] || 'not found') + '</li>';
        });
        html += '</ul>';
        if (!workerUrl) {
            html += '<div class="invest-price-tip">💡 Failures are often caused by a network firewall or security tool ' +
                    '(e.g. ZScaler on a work machine) blocking the public proxy calls. Setting up a ' +
                    '<strong>Cloudflare Worker proxy</strong> in <strong>Settings → General Settings → Investments</strong> ' +
                    'bypasses this and gives reliable prices for stocks and mutual funds.</div>';
        }
        body.innerHTML = html;
        openModal('investPriceResultModal');
    }
}

// Update prices for all holdings in the currently displayed account.
async function _investUpdateAccountPrices() {
    var btn    = document.getElementById('investUpdatePricesBtn');
    var status = document.getElementById('investPricesStatus');
    if (!btn) return;

    var apiKey = await _investGetFinnhubKey();
    if (!apiKey) {
        if (status) {
            status.textContent = 'Finnhub API key not configured — add it in Settings \u2192 General Settings';
            status.style.color = '#c62828';
        }
        return;
    }

    btn.disabled    = true;
    btn.textContent = '\u23f3 Updating\u2026';
    if (status) { status.textContent = ''; }

    var ns     = _investCurrentAccountNs;
    var aid    = _investCurrentAccountId;
    var failed    = [];
    var failedMsg = {};

    // Deduplicate tickers
    var priceMap = {};
    _investCurrentHoldings.forEach(function(h) {
        if (h.ticker) priceMap[h.ticker] = null;
    });

    // Phase 1: Finnhub for all tickers
    var needYahoo = [];
    for (var ticker in priceMap) {
        try {
            var p = await _investFetchPriceFinnhub(ticker, apiKey);
            if (p && p > 0) { priceMap[ticker] = p; }
            else             { needYahoo.push(ticker); }
        } catch (e) {
            if (e.message === 'invalid key') {
                if (status) { status.textContent = 'Invalid Finnhub API key'; status.style.color = '#c62828'; }
                btn.disabled = false; btn.textContent = '📡 Update Prices';
                return;
            }
            needYahoo.push(ticker);
        }
    }

    // Phase 2: one batched Yahoo request for everything Finnhub missed
    if (needYahoo.length > 0) {
        console.log('[prices] Yahoo batch for: ' + needYahoo.join(', '));
        var yahooMap = await _investFetchYahooBatch(needYahoo);
        needYahoo.forEach(function(t) {
            if (yahooMap[t]) { priceMap[t] = yahooMap[t]; }
            else             { failed.push(t); failedMsg[t] = 'not found in Finnhub or Yahoo'; }
        });
    }

    // Batch-write updated prices to Firestore
    var now   = new Date().toISOString();
    var batch = firebase.firestore().batch();
    _investCurrentHoldings.forEach(function(h) {
        if (h.ticker && priceMap[h.ticker] != null) {
            batch.update(_investHoldingCol(ns, aid).doc(h.id), {
                lastPrice:     priceMap[h.ticker],
                lastPriceDate: now
            });
        }
    });
    await batch.commit();

    // Reload holdings and re-render the full detail page
    var holdSnap = await _investHoldingCol(ns, aid).orderBy('ticker').get();
    _investCurrentHoldings = [];
    holdSnap.forEach(function(doc) {
        _investCurrentHoldings.push(Object.assign({ id: doc.id }, doc.data()));
    });
    var acctDoc = await userCol('investments').doc(ns).collection('accounts').doc(aid).get();
    _investRenderAccountDetail(Object.assign({ id: aid, _ns: ns }, acctDoc.data()));

    // Update button and status after re-render (elements were replaced)
    btn    = document.getElementById('investUpdatePricesBtn');
    status = document.getElementById('investPricesStatus');
    if (btn) { btn.disabled = false; btn.textContent = '\ud83d\udce1 Update Prices'; }
    if (status) {
        if (failed.length > 0) {
            var workerUrl = await _investGetYahooWorkerUrl();
            status.innerHTML = 'Updated \u2014 failed: ' + failed.map(function(t) { return '<strong>' + escapeHtml(t) + '</strong>'; }).join(', ') +
                (!workerUrl ? ' &nbsp;<a href="#settings-general" class="invest-price-tip-link">Set up Cloudflare proxy?</a>' : '');
            status.style.color = '#c62828';
        } else {
            status.textContent = '\u2713 Updated just now';
            status.style.color = '#2e7d32';
        }
    }
}

// ============================================================
// ACCOUNT DETAIL PAGE  (#investments/account/:ns/:id)
// ============================================================

// ---------- Account Detail State ----------

var _investCurrentAccountNs      = 'self';
var _investCurrentAccountId      = null;
var _investCurrentAccountCashBal      = null; // cache for % of account calc in holdings table
var _investCurrentAccountPendingAct   = 0;    // cache for pending activity (can be negative)
var _investQtyEditMode           = false; // true when mass qty/cost editing is active
var _investCurrentHoldings   = [];
var _investHoldingEditId     = null;   // null = add mode; holding doc ID = edit mode

// ---------- Firestore Path for Holdings ----------

function _investHoldingCol(ns, accountId) {
    return userCol('investments').doc(ns).collection('accounts').doc(accountId).collection('holdings');
}

// ---------- Account Detail Page Loader ----------

async function loadInvestmentsAccountPage(ns, accountId) {
    _investCurrentAccountNs = ns || 'self';
    _investCurrentAccountId = accountId;

    // Ensure person context matches this account's namespace
    if (_investPersonFilter !== ns) {
        _investPersonFilter = ns;
    }

    // Load people list (needed to show co-owner name) and the account doc
    if (_investPeople.length === 0) {
        await _investLoadAll();
    }

    var acctDoc = await userCol('investments').doc(ns).collection('accounts').doc(accountId).get();
    if (!acctDoc.exists) {
        document.getElementById('page-investments-account').innerHTML =
            '<div class="page-header"><h2>Account Not Found</h2></div>' +
            '<p><a href="#investments/accounts">← Back to Accounts</a></p>';
        return;
    }
    var acct = Object.assign({ id: accountId, _ns: ns }, acctDoc.data());
    _investCurrentAccountCashBal    = acct.cashBalance    != null ? parseFloat(acct.cashBalance)    : 0;
    _investCurrentAccountPendingAct = acct.pendingActivity != null ? parseFloat(acct.pendingActivity) : 0;

    // Load holdings
    var holdSnap = await _investHoldingCol(ns, accountId).orderBy('ticker').get();
    _investCurrentHoldings = [];
    holdSnap.forEach(function(doc) {
        _investCurrentHoldings.push(Object.assign({ id: doc.id }, doc.data()));
    });

    var returnHref  = _investAccountReturnTo === 'summary' ? '#investments/summary'
                    : _investAccountReturnTo === 'stocks'  ? '#investments/stocks'
                    : '#investments/accounts';
    var returnLabel = _investAccountReturnTo === 'summary' ? 'Summary'
                    : _investAccountReturnTo === 'stocks'  ? 'Stock Rollup'
                    : 'Accounts';
    _investAccountReturnTo = null;
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#investments">Financial</a><span class="separator">&rsaquo;</span>' +
        '<a href="' + returnHref + '">' + returnLabel + '</a><span class="separator">&rsaquo;</span>' +
        '<span>' + escapeHtml(acct.nickname || 'Account') + '</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';

    _investRenderAccountDetail(acct);
}

// ---------- Account Detail Render ----------

function _investRenderAccountDetail(acct) {
    var page = document.getElementById('page-investments-account');
    if (!page) return;

    var taxInfo   = _investTaxCategoryInfo(acct.accountType || '');
    var typeLabel = _investTypeLabel(acct.accountType || '');
    var isCash    = _INVEST_CASH_TYPES.indexOf(acct.accountType || '') >= 0;

    var coOwnerName = '';
    if (acct.ownerType === 'joint' && acct.primaryContactId) {
        var contact = _investPeople.find(function(p) { return p.id === acct.primaryContactId; });
        coOwnerName = contact ? contact.name : acct.primaryContactId;
    }

    var totals = _investComputeAccountTotals(_investCurrentHoldings, acct.cashBalance, acct.pendingActivity);

    // Gain/loss across all holdings that have cost basis
    var totalGain = null;
    _investCurrentHoldings.forEach(function(h) {
        if (h.costBasis != null && h.lastPrice != null && h.shares != null) {
            if (totalGain === null) totalGain = 0;
            totalGain += (h.lastPrice - h.costBasis) * h.shares;
        }
    });

    // Header
    var html =
        '<div class="page-header">' +
            '<h2>' + escapeHtml(acct.nickname || 'Account') + '</h2>' +
            '<div class="page-header-actions">' +
                (acct.url ? '<a class="btn btn-secondary btn-small invest-holdings-url-btn" href="' + escapeHtml(acct.url) + '" target="_blank" rel="noopener" title="Visit site">↗ Visit Site</a>' : '') +
                '<a class="btn btn-secondary" href="#investments/accounts/edit/' + acct.id + '">Edit Account</a>' +
            '</div>' +
        '</div>' +
        '<div class="invest-acct-meta">' +
            (acct.institution ? '<span class="invest-acct-institution">' + escapeHtml(acct.institution) + '</span>' : '') +
            '<span class="invest-type-badge ' + escapeHtml(taxInfo.cls) + '">' + escapeHtml(taxInfo.label) + '</span>' +
            '<span class="invest-acct-type-label">' + escapeHtml(typeLabel) + '</span>' +
        '</div>' +
        (acct.ownerType === 'joint' && coOwnerName
            ? '<div class="invest-acct-owner">Joint with ' + escapeHtml(coOwnerName) + '</div>'
            : '') +

        // Totals card
        '<div class="invest-totals-card">' +
            '<div class="invest-total-main">' +
                '<span class="invest-total-label">Total Value</span>' +
                '<span class="invest-total-value">' + _investFmtCurrency(totals.total) + '</span>' +
            '</div>' +
            (!isCash
                ? '<div class="invest-total-row">' +
                    '<span class="invest-total-sublabel">Holdings</span>' +
                    '<span class="invest-total-subvalue">' + _investFmtCurrency(totals.holdings) + '</span>' +
                  '</div>' +
                  '<div class="invest-total-row">' +
                    '<span class="invest-total-sublabel">Cash Balance</span>' +
                    '<span class="invest-total-subvalue">' + _investFmtCurrency(totals.cash) + '</span>' +
                  '</div>' +
                  '<div class="invest-total-row">' +
                    '<span class="invest-total-sublabel">Pending Activity</span>' +
                    '<span class="invest-total-subvalue ' + (totals.pending < 0 ? 'invest-total-loss' : '') + '">' + _investFmtPending(totals.pending) + '</span>' +
                  '</div>' +
                  (totalGain !== null
                    ? '<div class="invest-total-row">' +
                        '<span class="invest-total-sublabel">Gain / Loss</span>' +
                        '<span class="invest-total-subvalue ' + (totalGain >= 0 ? 'invest-total-gain' : 'invest-total-loss') + '">' +
                            (totalGain >= 0 ? '+' : '−') + _investFmtCurrency(Math.abs(totalGain)) +
                        '</span>' +
                      '</div>'
                    : '')
                : '') +
        '</div>';

    // Bank/cash accounts: keep the simple balance editor
    if (isCash) {
        var cashFmtVal = acct.cashBalance != null
            ? '$' + parseFloat(acct.cashBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : '';
        html +=
            '<div class="invest-cash-section">' +
                '<div class="invest-section-header">Account Balance ($)</div>' +
                '<div class="invest-cash-row">' +
                    '<input type="text" inputmode="decimal" id="investDetailCash" class="invest-cash-input"' +
                        ' placeholder="$0.00"' +
                        ' value="' + escapeHtml(cashFmtVal) + '"' +
                        ' onfocus="_investUnfmtCashField(this)"' +
                        ' onblur="_investFmtCashField(this)"' +
                        ' oninput="_investCashDirty()">' +
                    '<button class="btn btn-primary btn-small" id="investCashSaveBtn"' +
                        ' onclick="_investSaveCashBalance()" disabled>Save</button>' +
                '</div>' +
            '</div>';
    }

    // Holdings section — only for non-cash accounts; cash row is inside the table
    if (!isCash) {
        html +=
            '<div class="invest-section-header-row" id="investHoldingsHeaderRow">' +
                '<div class="invest-section-header">Holdings</div>' +
                _investHoldingsHeaderBtns() +
            '</div>' +
            '<div id="investHoldingsList">' + _investHoldingsHtml() + '</div>';
    }

    // Update Prices bar (active for investment accounts)
    if (!isCash) {
        html +=
            '<div class="invest-update-prices-bar">' +
                '<button class="btn btn-secondary" id="investUpdatePricesBtn" onclick="_investUpdateAccountPrices()">\ud83d\udce1 Update Prices</button>' +
                '<span class="invest-prices-note" id="investPricesStatus"></span>' +
            '</div>';
    }

    page.innerHTML = html;
}

function _investHoldingsHeaderBtns() {
    if (_investQtyEditMode) {
        return '<div class="iht-header-btns">' +
            '<button class="btn btn-primary btn-small" onclick="_investSaveQtyEdits()">Save Qty</button>' +
            '<button class="btn btn-secondary btn-small" onclick="_investCancelQtyEdit()">Cancel</button>' +
        '</div>';
    }
    return '<div class="iht-header-btns">' +
        '<button class="btn btn-secondary btn-small" onclick="_investToggleQtyEdit()">Edit Qty</button>' +
        '<button class="btn btn-primary btn-small" onclick="_investOpenHoldingModal(null)">+ Add Holding</button>' +
    '</div>';
}

function _investToggleQtyEdit() {
    _investQtyEditMode = true;
    _investRefreshHoldingsUI();
}

function _investCancelQtyEdit() {
    _investQtyEditMode = false;
    _investRefreshHoldingsUI();
}

function _investRefreshHoldingsUI() {
    var hdr = document.getElementById('investHoldingsHeaderRow');
    if (hdr) hdr.innerHTML = '<div class="invest-section-header">Holdings</div>' + _investHoldingsHeaderBtns();
    var list = document.getElementById('investHoldingsList');
    if (list) list.innerHTML = _investHoldingsHtml();
}

async function _investSaveQtyEdits() {
    var btn = document.querySelector('.iht-header-btns .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    var ns  = _investCurrentAccountNs;
    var aid = _investCurrentAccountId;
    var writes = [];

    document.querySelectorAll('.iht-qty-input').forEach(function(input) {
        var id  = input.dataset.id;
        var qty = parseFloat(input.value);
        if (!id || isNaN(qty) || qty < 0) return;
        // also read the matching cost/sh input
        var costEl = document.querySelector('.iht-cost-input[data-id="' + id + '"]');
        var cost   = costEl ? parseFloat(costEl.value) : NaN;
        var update = { shares: qty };
        if (!isNaN(cost) && cost >= 0) update.costBasis = cost;
        writes.push(userCol('investments').doc(ns).collection('accounts').doc(aid)
            .collection('holdings').doc(id).update(update));
        // patch local cache so re-render is correct
        var h = _investCurrentHoldings.find(function(x) { return x.id === id; });
        if (h) { h.shares = qty; if (!isNaN(cost) && cost >= 0) h.costBasis = cost; }
    });

    try {
        await Promise.all(writes);
    } catch(e) {
        alert('Save failed: ' + (e.message || e));
    }

    _investQtyEditMode = false;
    _investRefreshHoldingsUI();
}

function _investHoldingsHtml() {
    // Total account value (holdings + cash) used for % of account column
    var holdingsTotal = _investCurrentHoldings.reduce(function(sum, h) {
        return (h.lastPrice != null && h.shares != null) ? sum + h.shares * h.lastPrice : sum;
    }, 0);
    var accountTotal = holdingsTotal + (parseFloat(_investCurrentAccountCashBal) || 0) + (_investCurrentAccountPendingAct || 0);

    var rows = '';
    var totalValue = 0, totalGain = 0, totalGainHasBasis = true;

    if (_investCurrentHoldings.length === 0) {
        rows = '<tr><td colspan="9" class="iht-dim" style="text-align:center;padding:12px">No holdings yet. Add one above.</td></tr>';
    }

    _investCurrentHoldings.forEach(function(h) {
        var hasPrice  = h.lastPrice != null && h.shares != null;
        var hasBasis  = h.costBasis != null && h.shares != null && hasPrice;
        var value     = hasPrice ? h.shares * h.lastPrice : null;
        var gainVal   = hasBasis ? (h.lastPrice - h.costBasis) * h.shares : null;
        var gainPct   = (hasBasis && h.costBasis > 0) ? (h.lastPrice - h.costBasis) / h.costBasis * 100 : null;
        var pctAcct   = (value != null && accountTotal > 0) ? value / accountTotal * 100 : null;

        if (value  != null) totalValue += value;
        if (gainVal != null) totalGain += gainVal; else totalGainHasBasis = false;

        var gainCls = gainVal != null ? (gainVal >= 0 ? 'iht-gain' : 'iht-loss') : 'iht-dim';

        function fmtGainCell(val, suffix) {
            if (val == null) return '<td class="iht-dim">—</td>';
            var sign = val >= 0 ? '+' : '−';
            return '<td class="' + gainCls + '">' + sign + suffix(Math.abs(val)) + '</td>';
        }

        rows +=
            '<tr>' +
                '<td class="iht-symbol-cell">' +
                    '<div class="iht-sym-wrap">' +
                        '<span class="iht-ticker">' + escapeHtml(h.ticker || '') + '</span>' +
                        (h.companyName ? '<span class="iht-name">' + escapeHtml(h.companyName) + '</span>' : '') +
                    '</div>' +
                '</td>' +
                (_investQtyEditMode
                    ? '<td><input class="iht-qty-input" type="number" data-id="' + h.id + '" data-price="' + (h.lastPrice != null ? h.lastPrice : '') + '" value="' + (h.shares != null ? h.shares : '') + '" step="any" min="0" oninput="_investQtyInputChanged(this)"></td>'
                    : '<td>' + (h.shares != null ? Number(h.shares).toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—') + '</td>') +
                '<td>' + (h.lastPrice != null ? '$' + h.lastPrice.toFixed(2) : '—') + '</td>' +
                (_investQtyEditMode
                    ? '<td><input class="iht-cost-input" type="number" data-id="' + h.id + '" value="' + (h.costBasis != null ? h.costBasis : '') + '" step="any" min="0"></td>'
                    : '<td>' + (h.costBasis != null ? '$' + h.costBasis.toFixed(2) : '—') + '</td>') +
                (_investQtyEditMode
                    ? '<td class="iht-dim">—</td><td class="iht-dim">—</td>'
                    : fmtGainCell(gainVal, function(v) { return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }) +
                      fmtGainCell(gainPct, function(v) { return v.toFixed(2) + '%'; })) +
                '<td id="iht-val-' + h.id + '">' + (value != null ? _investFmtCurrency(value) : '—') + '</td>' +
                '<td>' + (pctAcct != null ? pctAcct.toFixed(1) + '%' : '—') + '</td>' +
                '<td class="iht-actions-cell">' +
                    (!_investQtyEditMode ? '<button class="iht-btn" title="Edit" onclick="_investOpenHoldingModal(\'' + h.id + '\')">✏</button>' : '') +
                    (!_investQtyEditMode ? '<button class="iht-btn iht-btn-del" title="Delete" onclick="_investDeleteHolding(\'' + h.id + '\')">🗑</button>' : '') +
                '</td>' +
            '</tr>';
    });

    // Cash row — always present, editable inline
    var cashVal  = parseFloat(_investCurrentAccountCashBal) || 0;
    var cashFmt  = _investFmtCurrency(cashVal);
    var cashPct  = accountTotal > 0 ? (cashVal / accountTotal * 100).toFixed(1) + '%' : '—';
    rows +=
        '<tr id="investCashRow">' +
            '<td class="iht-symbol-cell">' +
                '<div class="iht-sym-wrap">' +
                    '<span class="iht-ticker iht-cash-ticker">CASH</span>' +
                    '<span class="iht-name">Uninvested Cash</span>' +
                '</div>' +
            '</td>' +
            '<td class="iht-dim">—</td>' +
            '<td class="iht-dim">—</td>' +
            '<td class="iht-dim">—</td>' +
            '<td class="iht-dim">—</td>' +
            '<td class="iht-dim">—</td>' +
            '<td id="investCashValueCell">' + cashFmt + '</td>' +
            '<td>' + cashPct + '</td>' +
            '<td class="iht-actions-cell">' +
                '<button class="iht-btn" id="investCashEditBtn" title="Edit cash balance" onclick="_investEditCashInline()">✏</button>' +
            '</td>' +
        '</tr>';

    // Pending Activity row — always present, editable inline, can be negative
    var pendingVal  = _investCurrentAccountPendingAct || 0;
    var pendingFmt  = _investFmtPending(pendingVal);
    var pendingPct  = accountTotal > 0 ? (pendingVal / accountTotal * 100).toFixed(1) + '%' : '—';
    var pendingCls  = pendingVal < 0 ? 'iht-loss' : '';
    rows +=
        '<tr id="investPendingRow">' +
            '<td class="iht-symbol-cell">' +
                '<div class="iht-sym-wrap">' +
                    '<span class="iht-ticker iht-cash-ticker">PEND</span>' +
                    '<span class="iht-name">Pending Activity</span>' +
                '</div>' +
            '</td>' +
            '<td class="iht-dim">—</td>' +
            '<td class="iht-dim">—</td>' +
            '<td class="iht-dim">—</td>' +
            '<td class="iht-dim">—</td>' +
            '<td class="iht-dim">—</td>' +
            '<td id="investPendingValueCell" class="' + pendingCls + '">' + pendingFmt + '</td>' +
            '<td>' + pendingPct + '</td>' +
            '<td class="iht-actions-cell">' +
                '<button class="iht-btn" id="investPendingEditBtn" title="Edit pending activity" onclick="_investEditPendingInline()">✏</button>' +
            '</td>' +
        '</tr>';

    // Totals footer row (holdings + cash + pending)
    var grandTotal = totalValue + cashVal + pendingVal;
    var footGain = totalGainHasBasis && _investCurrentHoldings.length > 0
        ? '<td class="' + (totalGain >= 0 ? 'iht-gain' : 'iht-loss') + ' iht-foot">' +
            (totalGain >= 0 ? '+' : '−') + '$' + Math.abs(totalGain).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</td>' +
            '<td></td>'
        : '<td></td><td></td>';

    var html =
        '<div class="invest-holdings-table-wrap">' +
            '<table class="invest-holdings-table">' +
                '<thead><tr>' +
                    '<th class="iht-col-symbol">Symbol</th>' +
                    '<th>Qty</th>' +
                    '<th>Price</th>' +
                    '<th>Cost/sh</th>' +
                    '<th>Tot Gain $</th>' +
                    '<th>Tot Gain %</th>' +
                    '<th>Value</th>' +
                    '<th>% Acct</th>' +
                    '<th></th>' +
                '</tr></thead>' +
                '<tbody>' + rows + '</tbody>' +
                '<tfoot><tr class="iht-foot-row">' +
                    '<td class="iht-foot">Total</td>' +
                    '<td></td><td></td><td></td>' +
                    footGain +
                    '<td class="iht-foot">' + _investFmtCurrency(grandTotal) + '</td>' +
                    '<td></td><td></td>' +
                '</tr></tfoot>' +
            '</table>' +
        '</div>';

    return html;
}

// ---------- Holding Modal ----------

function _investOpenHoldingModal(holdingId) {
    _investHoldingEditId = holdingId || null;
    var isNew = !holdingId;
    var h = holdingId ? _investCurrentHoldings.find(function(x) { return x.id === holdingId; }) : null;

    document.getElementById('investHoldingModalTitle').textContent = isNew ? 'Add Holding' : 'Edit Holding';
    _investVal('investHoldingTicker',    h ? h.ticker      || '' : '');
    _investVal('investHoldingCompany',   h ? h.companyName || '' : '');
    _investVal('investHoldingShares',    h ? h.shares    != null ? h.shares    : '' : '');
    var cbEl = document.getElementById('investHoldingCostBasis');
    var cbVal = h && h.costBasis != null ? h.costBasis : '';
    if (cbEl) {
        cbEl.value = cbVal;
        if (cbVal !== '') _investFmtCashField(cbEl);
    }

    openModal('investHoldingModal');
    var tickerEl = document.getElementById('investHoldingTicker');
    if (tickerEl) setTimeout(function() { tickerEl.focus(); }, 50);
}

async function _investSaveHolding() {
    var ticker         = ((document.getElementById('investHoldingTicker')    || {}).value || '').trim().toUpperCase();
    var companyName    = ((document.getElementById('investHoldingCompany')   || {}).value || '').trim();
    var sharesRaw      = ((document.getElementById('investHoldingShares')    || {}).value || '').trim();
    var costBasisRaw   = ((document.getElementById('investHoldingCostBasis') || {}).value || '').trim().replace(/[^0-9.]/g, '');

    if (!ticker)      { alert('Please enter a ticker symbol.'); return; }
    if (!companyName) { alert('Please enter a company or fund name.'); return; }

    var shares = sharesRaw !== '' ? parseFloat(sharesRaw) : null;
    if (sharesRaw !== '' && (isNaN(shares) || shares < 0)) {
        alert('Please enter a valid number of shares.');
        return;
    }

    var costBasis = costBasisRaw !== '' ? parseFloat(costBasisRaw) : null;
    if (costBasisRaw !== '' && (isNaN(costBasis) || costBasis < 0)) {
        alert('Please enter a valid cost basis per share.');
        return;
    }

    var data = { ticker: ticker, companyName: companyName, shares: shares, costBasis: costBasis };

    var ns  = _investCurrentAccountNs;
    var aid = _investCurrentAccountId;

    if (_investHoldingEditId) {
        await _investHoldingCol(ns, aid).doc(_investHoldingEditId).update(data);
    } else {
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await _investHoldingCol(ns, aid).add(data);
    }

    var wasAdd = !_investHoldingEditId;
    closeModal('investHoldingModal');

    // Reload holdings and re-render
    var holdSnap = await _investHoldingCol(ns, aid).orderBy('ticker').get();
    _investCurrentHoldings = [];
    holdSnap.forEach(function(doc) {
        _investCurrentHoldings.push(Object.assign({ id: doc.id }, doc.data()));
    });

    // Refresh the holdings list and totals in-place
    var acctDoc = await userCol('investments').doc(ns).collection('accounts').doc(aid).get();
    var acct    = Object.assign({ id: aid, _ns: ns }, acctDoc.data());
    _investRenderAccountDetail(acct);

    // After an add, return focus to "+ Add Holding" so the user can press Enter to add another
    if (wasAdd) {
        setTimeout(function() {
            var addBtn = document.querySelector('.iht-header-btns .btn-primary');
            if (addBtn) addBtn.focus();
        }, 50);
    }
}

async function _investDeleteHolding(holdingId) {
    var h     = _investCurrentHoldings.find(function(x) { return x.id === holdingId; });
    var label = h ? (h.ticker || h.companyName || 'this holding') : 'this holding';
    if (!confirm('Delete ' + label + '? This cannot be undone.')) return;
    var ns  = _investCurrentAccountNs;
    var aid = _investCurrentAccountId;
    await _investHoldingCol(ns, aid).doc(holdingId).delete();
    _investCurrentHoldings = _investCurrentHoldings.filter(function(h) { return h.id !== holdingId; });

    var holdingsList = document.getElementById('investHoldingsList');
    if (holdingsList) holdingsList.innerHTML = _investHoldingsHtml();

    // Re-render to update totals
    var acctDoc = await userCol('investments').doc(ns).collection('accounts').doc(aid).get();
    var acct    = Object.assign({ id: aid, _ns: ns }, acctDoc.data());
    _investRenderAccountDetail(acct);
}

// ---------- Cash Balance Save ----------

async function _investSaveCashBalance() {
    var ns  = _investCurrentAccountNs;
    var aid = _investCurrentAccountId;
    var raw = ((document.getElementById('investDetailCash') || {}).value || '').trim().replace(/[^0-9.]/g, '');
    var val = raw !== '' ? parseFloat(raw) : null;

    if (raw !== '' && isNaN(val)) { alert('Please enter a valid dollar amount.'); return; }

    _investCurrentAccountCashBal = val || 0;
    var btn = document.getElementById('investCashSaveBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saved'; }
    var update = (val !== null) ? { cashBalance: val } : { cashBalance: firebase.firestore.FieldValue.delete() };
    await userCol('investments').doc(ns).collection('accounts').doc(aid).update(update);

    // Re-render with updated account
    var acctDoc = await userCol('investments').doc(ns).collection('accounts').doc(aid).get();
    var acct    = Object.assign({ id: aid, _ns: ns }, acctDoc.data());
    _investRenderAccountDetail(acct);
}

// ---------- Inline Cash Editing (in holdings table) ----------

/**
 * If qty-edit mode is active, read the current input values back into
 * _investCurrentHoldings so that a full re-render preserves unsaved edits.
 * Called before any re-render that happens while qty-edit mode may be open.
 */
/**
 * Called oninput on a qty field — updates the Value cell for that row in real time.
 */
function _investQtyInputChanged(inp) {
    var id    = inp.dataset.id;
    var price = parseFloat(inp.dataset.price);
    var qty   = parseFloat(inp.value);
    var cell  = document.getElementById('iht-val-' + id);
    if (!cell) return;
    if (!isNaN(price) && !isNaN(qty) && qty >= 0) {
        cell.textContent = _investFmtCurrency(price * qty);
    } else {
        cell.textContent = '—';
    }
}

function _investCaptureQtyEdits() {
    if (!_investQtyEditMode) return;
    document.querySelectorAll('.iht-qty-input').forEach(function(inp) {
        var id = inp.dataset.id;
        var h  = _investCurrentHoldings.find(function(x) { return x.id === id; });
        if (!h) return;
        var v = inp.value.trim();
        h.shares = v !== '' ? parseFloat(v) : null;
    });
    document.querySelectorAll('.iht-cost-input').forEach(function(inp) {
        var id = inp.dataset.id;
        var h  = _investCurrentHoldings.find(function(x) { return x.id === id; });
        if (!h) return;
        var v = inp.value.trim();
        h.costBasis = v !== '' ? parseFloat(v) : null;
    });
}

function _investEditCashInline() {
    var cell    = document.getElementById('investCashValueCell');
    var editBtn = document.getElementById('investCashEditBtn');
    if (!cell) return;

    var rawVal = parseFloat(_investCurrentAccountCashBal) || 0;
    cell.innerHTML =
        '<input type="text" inputmode="decimal" id="investCashInlineInput" class="iht-cash-inline"' +
            ' value="' + rawVal + '"' +
            ' onkeydown="if(event.key===\'Enter\')this.blur(); if(event.key===\'Escape\'){_investCancelCashInline(); return;}"' +
            ' onblur="_investCommitCashInline()">';
    if (editBtn) editBtn.style.visibility = 'hidden';
    var inp = document.getElementById('investCashInlineInput');
    if (inp) inp.select();
}

function _investCancelCashInline() {
    var cell    = document.getElementById('investCashValueCell');
    var editBtn = document.getElementById('investCashEditBtn');
    if (cell) cell.innerHTML = _investFmtCurrency(parseFloat(_investCurrentAccountCashBal) || 0);
    if (editBtn) editBtn.style.visibility = '';
}

async function _investCommitCashInline() {
    var inp = document.getElementById('investCashInlineInput');
    if (!inp) return; // already committed (blur can fire twice)

    var raw = (inp.value || '').replace(/[^0-9.]/g, '');
    var val = raw !== '' ? parseFloat(raw) : 0;
    if (isNaN(val)) val = 0;

    var ns  = _investCurrentAccountNs;
    var aid = _investCurrentAccountId;
    _investCurrentAccountCashBal = val;

    var update = val > 0
        ? { cashBalance: val }
        : { cashBalance: firebase.firestore.FieldValue.delete() };
    await userCol('investments').doc(ns).collection('accounts').doc(aid).update(update);

    // Preserve any unsaved qty edits before re-rendering
    _investCaptureQtyEdits();

    // Re-render to update totals card and % acct column
    var acctDoc = await userCol('investments').doc(ns).collection('accounts').doc(aid).get();
    _investRenderAccountDetail(Object.assign({ id: aid, _ns: ns }, acctDoc.data()));
}

// ---------- Pending Activity Inline Editing ----------

function _investFmtPending(val) {
    var n = parseFloat(val) || 0;
    var abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 ? '-$' : '$') + abs;
}

function _investEditPendingInline() {
    var cell    = document.getElementById('investPendingValueCell');
    var editBtn = document.getElementById('investPendingEditBtn');
    if (!cell) return;

    var rawVal = _investCurrentAccountPendingAct || 0;
    cell.innerHTML =
        '<input type="text" inputmode="decimal" id="investPendingInlineInput" class="iht-cash-inline"' +
            ' value="' + rawVal + '"' +
            ' onkeydown="if(event.key===\'Enter\')this.blur(); if(event.key===\'Escape\'){_investCancelPendingInline(); return;}"' +
            ' onblur="_investCommitPendingInline()">';
    cell.className = '';
    if (editBtn) editBtn.style.visibility = 'hidden';
    var inp = document.getElementById('investPendingInlineInput');
    if (inp) inp.select();
}

function _investCancelPendingInline() {
    var cell    = document.getElementById('investPendingValueCell');
    var editBtn = document.getElementById('investPendingEditBtn');
    var val     = _investCurrentAccountPendingAct || 0;
    if (cell) { cell.innerHTML = _investFmtPending(val); cell.className = val < 0 ? 'iht-loss' : ''; }
    if (editBtn) editBtn.style.visibility = '';
}

async function _investCommitPendingInline() {
    var inp = document.getElementById('investPendingInlineInput');
    if (!inp) return;

    var val = parseFloat(inp.value);
    if (isNaN(val)) val = 0;

    var ns  = _investCurrentAccountNs;
    var aid = _investCurrentAccountId;
    _investCurrentAccountPendingAct = val;

    var update = val !== 0
        ? { pendingActivity: val }
        : { pendingActivity: firebase.firestore.FieldValue.delete() };
    await userCol('investments').doc(ns).collection('accounts').doc(aid).update(update);

    // Preserve any unsaved qty edits before re-rendering
    _investCaptureQtyEdits();

    var acctDoc = await userCol('investments').doc(ns).collection('accounts').doc(aid).get();
    _investRenderAccountDetail(Object.assign({ id: aid, _ns: ns }, acctDoc.data()));
}

// ---------- Totals Computation ----------

function _investComputeAccountTotals(holdings, cashBalance, pendingActivity) {
    var holdingsValue = holdings.reduce(function(sum, h) {
        if (h.lastPrice != null && h.shares != null) {
            return sum + h.shares * h.lastPrice;
        }
        return sum;
    }, 0);
    var cash    = parseFloat(cashBalance    || 0) || 0;
    var pending = parseFloat(pendingActivity || 0) || 0;
    return { holdings: holdingsValue, cash: cash, pending: pending, total: holdingsValue + cash + pending };
}

// ---------- Currency Formatter ----------

function _investFmtCurrency(val) {
    if (val == null || isNaN(val)) return '—';
    return '$' + parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Formats an ISO timestamp as "M/D h:mmam/pm" (e.g. "5/5 10:15am")
function _investFmtUpdateTime(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    var h    = d.getHours();
    var ampm = h >= 12 ? 'pm' : 'am';
    var h12  = h % 12 || 12;
    var m    = d.getMinutes() < 10 ? '0' + d.getMinutes() : '' + d.getMinutes();
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + h12 + ':' + m + ampm;
}

// ---------- Cash Field Blur/Focus Formatting ----------
// On blur: display "$1,234.56"; on focus: strip to raw number for editing.
function _investFmtCashField(el) {
    var num = parseFloat((el.value || '').replace(/[^0-9.]/g, ''));
    if (!isNaN(num)) {
        el.value = '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
}
function _investUnfmtCashField(el) {
    var num = parseFloat((el.value || '').replace(/[^0-9.]/g, ''));
    el.value = !isNaN(num) ? num : '';
}
function _investCashDirty() {
    var btn = document.getElementById('investCashSaveBtn');
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
}

// ---------- Ticker → Company Name Lookup (shared) ----------
// Tries: 1) Finnhub profile  2) Finnhub search  3) LLM fallback.
// Returns the name string, or null if all sources fail.
async function _investLookupCompanyName(ticker, finnhubApiKey) {
    var name = null;

    // 1. Finnhub stock profile (works for equities)
    if (finnhubApiKey) {
        try {
            var resp = await fetch(
                'https://finnhub.io/api/v1/stock/profile2?symbol=' + encodeURIComponent(ticker) +
                '&token=' + encodeURIComponent(finnhubApiKey)
            );
            var json = await resp.json();
            if (json && json.name) name = json.name;
        } catch (e) { console.warn('Finnhub profile lookup failed', e); }
    }

    // 2. Finnhub symbol search (catches ETFs, mutual funds, etc.)
    if (!name && finnhubApiKey) {
        try {
            var sresp = await fetch(
                'https://finnhub.io/api/v1/search?q=' + encodeURIComponent(ticker) +
                '&token=' + encodeURIComponent(finnhubApiKey)
            );
            var sdata = await sresp.json();
            if (sdata && sdata.result) {
                var match = sdata.result.find(function(r) {
                    return (r.symbol || '').toUpperCase()        === ticker ||
                           (r.displaySymbol || '').toUpperCase() === ticker;
                });
                if (match && match.description) name = match.description;
            }
        } catch (e) { console.warn('Finnhub search lookup failed', e); }
    }

    // 3. LLM fallback — ask the configured AI for the fund name
    if (!name) {
        try {
            var llmDoc = await userCol('settings').doc('llm').get();
            if (llmDoc.exists) {
                var cfg      = llmDoc.data();
                var provider = cfg.provider || 'openai';
                var llmKey   = cfg.apiKey   || '';
                var llmModel = cfg.model    || (provider === 'grok' ? 'grok-3' : 'gpt-4o');
                var epUrl    = provider === 'grok'
                    ? 'https://api.x.ai/v1/chat/completions'
                    : 'https://api.openai.com/v1/chat/completions';

                var llmResp = await fetch(epUrl, {
                    method : 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + llmKey },
                    body   : JSON.stringify({
                        model   : llmModel,
                        messages: [
                            { role: 'system', content: 'You are a financial data assistant. Reply with only the requested data — no explanation, no punctuation, no extra words.' },
                            { role: 'user',   content: 'What is the full company or fund name for the ticker symbol ' + ticker + '? Reply with just the name.' }
                        ],
                        max_completion_tokens: 40
                    })
                });
                if (llmResp.ok) {
                    var llmData = await llmResp.json();
                    var llmName = (llmData.choices[0].message.content || '').trim();
                    if (llmName) name = llmName;
                }
            }
        } catch (e) { console.warn('LLM company name fallback failed', e); }
    }

    return name;
}

// Called onblur of the ticker field in the holding modal.
// Only fills in the company name if the field is currently empty.
async function _investAutoFillCompanyName() {
    var tickerEl  = document.getElementById('investHoldingTicker');
    var companyEl = document.getElementById('investHoldingCompany');
    if (!tickerEl || !companyEl) return;
    var ticker = (tickerEl.value || '').trim().toUpperCase();
    if (!ticker || companyEl.value.trim()) return;

    var apiKey = await _investGetFinnhubKey();

    var prevPlaceholder = companyEl.placeholder;
    companyEl.placeholder = 'Looking up…';
    try {
        var name = await _investLookupCompanyName(ticker, apiKey);
        if (name) companyEl.value = name;
    } finally {
        companyEl.placeholder = prevPlaceholder;
    }
}

// ============================================================
// HISTORICAL SNAPSHOTS PAGE  (#investments/snapshots)
// ============================================================

// ---------- Snapshot State ----------

var _investSnapshotsGroupId = null;

function _investSnapshotCol() {
    return userCol('investmentSnapshots');
}

async function loadInvestmentsSnapshotsPage() {
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#investments">Financial</a><span class="separator">&rsaquo;</span><span>Snapshots</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';

    await Promise.all([_investLoadGroups(), _investLoadConfig(), _investLoadAll()]);

    _investGroupSwitchHandler = function(gid) {
        _investActiveGroupId    = gid;
        _investSnapshotsGroupId = gid;
        localStorage.setItem('investActiveGroupId', gid);
        _investRenderSnapshotsPage();
    };

    if (!_investSnapshotsGroupId) {
        _investSnapshotsGroupId = _investActiveGroupId || (_investGroups.length > 0 ? _investGroups[0].id : null);
    }

    await _investRenderSnapshotsPage();
}

async function _investLoadSnapshots(groupId) {
    // Single-field orderBy (auto-indexed); filter by groupId client-side to avoid composite index
    var snap = await _investSnapshotCol().orderBy('date', 'desc').get();
    var list = [];
    snap.forEach(function(doc) {
        var data = doc.data();
        if (data.groupId === groupId) {
            list.push(Object.assign({ id: doc.id }, data));
        }
    });
    return list;
}

// Recompute group-scoped ATH from actual snapshot history.
// Runs whenever the snapshot page loads — self-heals missing or stale ATH keys
// (e.g. after migrating from the old global key format to group-scoped keys).
async function _investRecomputeGroupATH(snapshots, groupId) {
    var best = {}; // type → {value, date}
    snapshots.forEach(function(s) {
        var t   = s.type;
        var nw  = s.netWorth || 0;
        if (!best[t] || nw > best[t].value) {
            best[t] = { value: nw, date: s.date };
        }
    });

    var patch = {};
    var changed = false;
    Object.keys(best).forEach(function(t) {
        var key     = _investAthKey(t, groupId);
        var current = _investConfig[key];
        if (!current || best[t].value > (current.value || 0)) {
            _investConfig[key] = best[t];
            patch[key]         = best[t];
            changed = true;
        }
    });
    if (changed) {
        await _investConfigCol().doc('main').set(patch, { merge: true });
    }
}

async function _investRenderSnapshotsPage() {
    var page = document.getElementById('page-investments-snapshots');
    if (!page) return;
    page.innerHTML = '<div class="invest-summary-loading">Loading…</div>';

    var group = _investGroups.find(function(g) { return g.id === _investSnapshotsGroupId; })
             || (_investGroups[0] || null);
    if (!group) {
        page.innerHTML = '<div class="empty-state">No groups found.</div>';
        return;
    }

    var snapshots = await _investLoadSnapshots(group.id);

    // Self-heal: recompute group-scoped ATH from snapshot history.
    // This migrates any data from the old global ATH key format and
    // ensures ATH is always correct even after key-format changes.
    await _investRecomputeGroupATH(snapshots, group.id);

    // Group switcher
    var switcherHtml = '';
    if (_investGroups.length > 1) {
        var opts = _investGroups.map(function(g) {
            return '<option value="' + escapeHtml(g.id) + '"' +
                (g.id === group.id ? ' selected' : '') + '>' + escapeHtml(g.name) + '</option>';
        }).join('');
        switcherHtml =
            '<div class="invest-group-switcher">' +
                '<label class="invest-group-switcher-label">Group:</label>' +
                '<select id="investGroupSelect" onchange="_investOnGroupSwitch(this.value)">' + opts + '</select>' +
            '</div>';
    }

    // Group's configured frequencies
    var freqBadges = (group.snapshotFrequencies || []).map(function(f) {
        return '<span class="invest-freq-badge">' + f.charAt(0).toUpperCase() + f.slice(1) + '</span>';
    }).join(' ');

    // All-Time Highs — group-scoped so each group tracks its own ATH
    var athTypes  = ['daily', 'weekly', 'monthly', 'yearly'];
    var athItems  = athTypes.filter(function(t) {
        return !!_investConfig[_investAthKey(t, group.id)];
    });
    var athHtml   = '';
    if (athItems.length > 0) {
        athHtml = '<div class="invest-snap-ath-row">';
        athItems.forEach(function(t) {
            var ath = _investConfig[_investAthKey(t, group.id)];
            athHtml +=
                '<div class="invest-snap-ath-item">' +
                    '<span class="invest-snap-ath-label">' + t.charAt(0).toUpperCase() + t.slice(1) + ' ATH</span>' +
                    '<span class="invest-snap-ath-value">' + _investFmtCurrency(ath.value) + '</span>' +
                    '<span class="invest-snap-ath-date">' + escapeHtml(ath.date) + '</span>' +
                '</div>';
        });
        athHtml += '</div>';
    }

    // Snapshot list grouped by type — default view is filtered to a recent window.
    // Full history is accessible via the "More" button on each section.
    var typeOrder = ['yearly', 'monthly', 'weekly', 'daily'];
    var grouped   = {};
    typeOrder.forEach(function(t) { grouped[t] = []; });
    snapshots.forEach(function(s) { if (grouped[s.type]) grouped[s.type].push(s); });

    // Store full arrays for the More modal (module-level so onclick handlers can reach them)
    _investSnapshotsAll = grouped;

    var curYear    = new Date().toISOString().split('T')[0].slice(0, 4);
    var weekStart  = _investWeekStart();

    // How many items to show by default per type
    var typeFilters = {
        yearly:  function(a) { return a.filter(function(s) { return s.date && s.date.slice(0, 4) === curYear; }); },
        monthly: function(a) { return a.filter(function(s) { return s.date && s.date.slice(0, 4) === curYear; }); },
        weekly:  function(a) { return a.slice(0, 3); },
        daily:   function(a) { return a.filter(function(s) { return s.date >= weekStart; }); }
    };

    var listHtml = '';
    typeOrder.forEach(function(type) {
        var all = grouped[type];
        if (all.length === 0) return;
        var filtered = typeFilters[type](all);
        var hasMore  = all.length > filtered.length;
        var label    = type.charAt(0).toUpperCase() + type.slice(1);
        var moreBtn  = hasMore
            ? '<button class="invest-snap-more-btn" onclick="_investOpenSnapMoreModal(\'' + type + '\')">More ›</button>'
            : '';
        listHtml += '<div class="invest-snap-type-section">';
        listHtml += '<div class="invest-snap-type-header"><span class="invest-snap-type-title">' +
                        escapeHtml(label) + '</span>' + moreBtn + '</div>';
        if (filtered.length === 0) {
            listHtml += '<div class="invest-snap-empty-period">No ' + label.toLowerCase() +
                        ' snapshots for the current period.</div>';
        } else {
            filtered.forEach(function(s) { listHtml += _investSnapshotRowHtml(s); });
        }
        listHtml += '</div>';
    });
    if (snapshots.length === 0) {
        listHtml = '<div class="empty-state">No snapshots yet — tap "+ Capture" to record your first.</div>';
    }

    // Last prices-update notice for this page
    var pricesNote = _investConfig.lastUpdateAllDate
        ? '<div class="invest-snap-prices-note">Prices last updated: <strong>' +
              escapeHtml(_investConfig.lastUpdateAllDate) + '</strong></div>'
        : '';

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>📷 Snapshots</h2>' +
            '<div class="page-header-actions">' +
                '<a class="btn btn-secondary" href="#investments/import">↑ Import</a>' +
                '<button class="btn btn-primary" onclick="_investOpenSnapModal()">+ Capture</button>' +
            '</div>' +
        '</div>' +
        (switcherHtml ? '<div class="invest-summary-switcher-row">' + switcherHtml + '</div>' : '') +
        '<div class="invest-snap-group-freqs">Tracking: ' + freqBadges + '</div>' +
        pricesNote +
        (athHtml ? '<div class="invest-summary-section-title">All-Time Highs</div>' + athHtml : '') +
        '<div class="invest-summary-section-title">History</div>' +
        '<div class="invest-snap-list">' + listHtml + '</div>';
}

// opts: { suffix: string, noDelete: bool }
// suffix — unique ID prefix used by the More modal to avoid duplicate DOM IDs
// noDelete — hides the Delete button (used in the More modal)
function _investSnapshotRowHtml(s, opts) {
    var suffix   = (opts && opts.suffix)   || '';
    var noDelete = !!(opts && opts.noDelete);

    var rowId    = 'snapRow-'    + s.id + suffix;
    var detailId = 'snapDetail-' + s.id + suffix;
    var toggleFn = suffix
        ? '_investToggleSnapDetailById(\'' + rowId + '\',\'' + detailId + '\')'
        : '_investToggleSnapDetail(\'' + s.id + '\')';

    // For daily snapshots, append the day-of-week name next to the date
    var dateLabel = s.date || '—';
    if (s.type === 'daily' && s.date) {
        var dp = s.date.split('-');
        var dow = new Date(+dp[0], +dp[1] - 1, +dp[2]).toLocaleDateString('en-US', { weekday: 'long' });
        dateLabel = s.date + ' · ' + dow;
    }

    var perCat = s.perCategory || {};
    var catRows =
        _investCategoryRow('Roth',            perCat.roth,      s.netWorth, 'invest-badge--roth') +
        _investCategoryRow('Pre-Tax',         perCat.preTax,    s.netWorth, 'invest-badge--pretax') +
        _investCategoryRow('Brokerage',       perCat.brokerage, s.netWorth, 'invest-badge--brokerage') +
        _investCategoryRow('Cash',            perCat.cash,      s.netWorth, 'invest-badge--cash') +
        _investCategoryRow('Uninvested Cash', perCat.invCash,   s.netWorth, 'invest-badge--other');

    return '<div class="invest-snap-row" id="' + rowId + '">' +
        '<div class="invest-snap-row-main" onclick="' + toggleFn + '">' +
            '<div class="invest-snap-row-left">' +
                '<span class="invest-snap-date">' + escapeHtml(dateLabel) + '</span>' +
                (s.notes ? '<span class="invest-snap-notes">' + escapeHtml(s.notes) + '</span>' : '') +
            '</div>' +
            '<div class="invest-snap-row-right">' +
                '<span class="invest-snap-networth">' + _investFmtCurrency(s.netWorth) + '</span>' +
                '<span class="invest-snap-invested">Invested: ' + _investFmtCurrency(s.invested) + '</span>' +
            '</div>' +
            '<span class="invest-snap-chevron">›</span>' +
        '</div>' +
        '<div class="invest-snap-detail hidden" id="' + detailId + '">' +
            '<div class="invest-snap-detail-cats">' + catRows + '</div>' +
            _investSnapAccountsHtml(s.perAccount) +
            (!noDelete
                ? '<div class="invest-snap-detail-actions">' +
                      '<button class="btn btn-danger btn-small" onclick="_investDeleteSnapshot(\'' + s.id + '\')">Delete</button>' +
                  '</div>'
                : '') +
        '</div>' +
    '</div>';
}

// Toggle expand/collapse by explicit row and detail element IDs — used by the More modal.
function _investToggleSnapDetailById(rowId, detailId) {
    var detail = document.getElementById(detailId);
    if (!detail) return;
    detail.classList.toggle('hidden');
    var row = document.getElementById(rowId);
    var chevron = row ? row.querySelector('.invest-snap-chevron') : null;
    if (chevron) chevron.textContent = detail.classList.contains('hidden') ? '›' : '⌄';
}

function _investSnapAccountsHtml(perAccount) {
    if (!perAccount || Object.keys(perAccount).length === 0) return '';
    // Support old format (id → number) and new format (id → object)
    var entries = Object.entries(perAccount).map(function(pair) {
        var key = pair[0], v = pair[1];
        return (typeof v === 'object' && v !== null) ? v : { id: key, name: null, type: '', ns: '', total: v };
    });
    // Skip old-format snapshots with no names
    var hasNames = entries.some(function(e) { return e.name; });
    if (!hasNames) return '';
    entries.sort(function(a, b) { return (b.total || 0) - (a.total || 0); });
    var rows = entries.map(function(e) {
        var typeLabel = e.type ? INVEST_ACCOUNT_TYPES.find(function(t) { return t.value === e.type; }) : null;
        var typeTxt   = typeLabel ? typeLabel.label : (e.type || '');
        var holdHref  = (e.ns && e.id) ? '#investments/account/' + encodeURIComponent(e.ns) + '/' + encodeURIComponent(e.id) : '';
        return '<div class="invest-snap-acct-row">' +
            '<div class="invest-snap-acct-name">' + escapeHtml(e.name || 'Account') +
                (typeTxt ? '<span class="invest-snap-acct-type">' + escapeHtml(typeTxt) + '</span>' : '') +
            '</div>' +
            '<div class="invest-snap-acct-right">' +
                '<span class="invest-snap-acct-total">' + _investFmtCurrency(e.total || 0) + '</span>' +
                (holdHref ? '<a class="iht-btn invest-snap-acct-link" href="' + holdHref + '" title="View holdings">📋</a>' : '') +
            '</div>' +
        '</div>';
    }).join('');
    return '<div class="invest-snap-detail-accounts">' +
        '<div class="invest-snap-acct-header">Accounts</div>' +
        rows +
    '</div>';
}

function _investToggleSnapDetail(snapId) {
    var detail  = document.getElementById('snapDetail-' + snapId);
    var row     = document.getElementById('snapRow-' + snapId);
    var chevron = row ? row.querySelector('.invest-snap-chevron') : null;
    if (!detail) return;
    detail.classList.toggle('hidden');
    if (chevron) chevron.textContent = detail.classList.contains('hidden') ? '›' : '⌄';
}

async function _investDeleteSnapshot(snapId) {
    if (!confirm('Delete this snapshot? This cannot be undone.')) return;
    await _investSnapshotCol().doc(snapId).delete();
    closeModal('investSnapMoreModal');
    await _investRenderSnapshotsPage();
}

// ---------- Snapshot "More" Modal ----------

function _investOpenSnapMoreModal(type) {
    var label = type.charAt(0).toUpperCase() + type.slice(1);
    var titleEl = document.getElementById('investSnapMoreTitle');
    if (titleEl) titleEl.textContent = label + ' Snapshots — Full History';

    var modal = document.getElementById('investSnapMoreModal');
    if (modal) modal.dataset.type = type;

    // Reset filters to defaults
    var countEl = document.getElementById('investSnapMoreCount');
    var sinceEl = document.getElementById('investSnapMoreSince');
    if (countEl) countEl.value = '10';
    if (sinceEl) sinceEl.value = '';

    _investRenderMoreModalList(type);
    openModal('investSnapMoreModal');
}

function _investRenderMoreModalList(type) {
    var listEl  = document.getElementById('investSnapMoreList');
    if (!listEl) return;

    var all     = (_investSnapshotsAll[type] || []);
    var countEl = document.getElementById('investSnapMoreCount');
    var sinceEl = document.getElementById('investSnapMoreSince');
    var since   = sinceEl ? sinceEl.value.trim() : '';
    var count   = parseInt(countEl ? countEl.value : '10') || 10;

    var filtered;
    if (since) {
        // Since-date takes precedence over count
        filtered = all.filter(function(s) { return s.date >= since; });
    } else {
        filtered = all.slice(0, count);
    }

    if (filtered.length === 0) {
        listEl.innerHTML = '<div class="empty-state" style="padding:24px 0;">No snapshots match the filter.</div>';
        return;
    }

    listEl.innerHTML = filtered.map(function(s) {
        return _investSnapshotRowHtml(s, { suffix: '-more', noDelete: false });
    }).join('');
}

// ---------- Capture Snapshot ----------

function _investOpenSnapModal() {
    var group = _investGroups.find(function(g) { return g.id === _investSnapshotsGroupId; })
             || (_investGroups[0] || null);
    if (!group) return;

    var freqs = group.snapshotFrequencies || ['daily', 'weekly', 'monthly', 'yearly'];
    document.getElementById('investSnapType').innerHTML = freqs.map(function(f) {
        return '<option value="' + escapeHtml(f) + '">' + f.charAt(0).toUpperCase() + f.slice(1) + '</option>';
    }).join('');
    document.getElementById('investSnapNotes').value  = '';
    document.getElementById('investSnapStatus').textContent = '';

    openModal('investSnapModal');
}

async function _investCaptureSnapshot() {
    var typeEl   = document.getElementById('investSnapType');
    var notesEl  = document.getElementById('investSnapNotes');
    var statusEl = document.getElementById('investSnapStatus');
    var saveBtn  = document.getElementById('investSnapSaveBtn');

    var type  = typeEl  ? typeEl.value.trim()  : '';
    var notes = notesEl ? notesEl.value.trim() : '';

    if (!type) { alert('Please select a snapshot type.'); return; }

    var group = _investGroups.find(function(g) { return g.id === _investSnapshotsGroupId; });
    if (!group) return;

    // Warn if prices haven't been updated today
    var snapToday = new Date().toISOString().split('T')[0];
    var lastUpdate = _investConfig.lastUpdateAllDate || null;
    if (!lastUpdate || lastUpdate < snapToday) {
        var staleMsg = lastUpdate
            ? 'Prices were last updated on ' + lastUpdate + ', not today. Update all prices first for an accurate snapshot?'
            : 'Prices have not been updated today. Update all prices first for an accurate snapshot?';
        if (confirm(staleMsg)) {
            // Update prices before capturing — runs without requiring the summary-page button
            if (saveBtn)  { saveBtn.disabled = true; saveBtn.textContent = 'Updating…'; }
            if (statusEl) { statusEl.textContent = 'Updating prices…'; statusEl.style.color = '#555'; }
            await _investUpdateAllPrices();
            if (statusEl) { statusEl.textContent = ''; }
        }
    }

    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Computing…'; }
    if (statusEl) { statusEl.textContent = 'Loading current account values…'; statusEl.style.color = '#555'; }

    var accounts = await _investLoadGroupAccounts(group);
    var cats     = _investComputeGroupTotals(accounts);

    // perAccount: map of accountId → { id, name, type, ns, holdings, cash, pending, total }
    var perAccount = {};
    accounts.forEach(function(acct) {
        var t = acct._totals || {};
        perAccount[acct.id] = {
            id:       acct.id,
            name:     acct.nickname    || acct.name || 'Unknown',
            type:     acct.accountType || '',
            ns:       acct._ns         || '',
            holdings: t.holdings || 0,
            cash:     t.cash     || 0,
            pending:  t.pending  || 0,
            total:    t.total    || 0
        };
    });

    var date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    await _investSnapshotCol().add({
        groupId:     group.id,
        type:        type,
        date:        date,
        netWorth:    cats.netWorth,
        invested:    cats.invested,
        perAccount:  perAccount,
        perCategory: {
            roth:      cats.roth,
            preTax:    cats.preTax,
            brokerage: cats.brokerage,
            cash:      cats.cash,
            invCash:   cats.invCash
        },
        notes:       notes || null,
        createdAt:   firebase.firestore.FieldValue.serverTimestamp()
    });

    await _investCheckAndUpdateATH(type, cats.netWorth, date, group.id);

    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Capture'; }
    closeModal('investSnapModal');
    await _investRenderSnapshotsPage();
}

// ATH keys are group-scoped: allTimeHighDaily_<groupId> etc.
// This prevents one group's ATH from bleeding into another group's display.
function _investAthKey(type, groupId) {
    return 'allTimeHigh' + type.charAt(0).toUpperCase() + type.slice(1) + '_' + groupId;
}

async function _investCheckAndUpdateATH(type, netWorth, date, groupId) {
    var key     = _investAthKey(type, groupId);
    var current = _investConfig[key];
    if (!current || netWorth > (current.value || 0)) {
        _investConfig[key] = { value: netWorth, date: date };
        var patch = {};
        patch[key] = { value: netWorth, date: date };
        await _investConfigCol().doc('main').set(patch, { merge: true });
    }
}

// ============================================================
// BUDGET HELPERS  (used by retire widget)
// ============================================================

async function _investLoadBudgets() {
    try {
        var [budgetsSnap, settingsDoc] = await Promise.all([
            userCol('budgets').where('isArchived', '==', false).get(),
            userCol('settings').doc('app').get()
        ]);
        _investBudgets = [];
        budgetsSnap.forEach(function(d) {
            _investBudgets.push({ id: d.id, name: d.data().name || 'Budget' });
        });
        _investDefaultBudgetId = (settingsDoc.exists && settingsDoc.data().defaultBudgetId) || null;
    } catch (e) { console.error('_investLoadBudgets error', e); }
}

async function _investLoadBudgetTotals(budgetId) {
    if (!budgetId) return null;
    try {
        var ref = userCol('budgets').doc(budgetId);
        var results = await Promise.all([
            ref.get(),
            ref.collection('categories').orderBy('sortOrder').get(),
            ref.collection('lineItems').get(),
            ref.collection('incomeItems').get(),
            ref.collection('nonMonthlyItems').get()
        ]);
        var budgetDoc = results[0], catsSnap = results[1], itemsSnap = results[2],
            incomeSnap = results[3], nonMonthlySnap = results[4];
        if (!budgetDoc.exists) return null;
        var cats = catsSnap.docs.map(function(d) { return Object.assign({ localId: d.id }, d.data()); });
        var byCat = {};
        itemsSnap.docs.forEach(function(d) {
            var item = d.data();
            if (item.categoryId && item.amount) byCat[item.categoryId] = (byCat[item.categoryId] || 0) + (parseFloat(item.amount) || 0);
        });
        var nonMonthlyReserve = Math.round(
            nonMonthlySnap.docs
                .filter(function(d) { return d.data().isActive !== false; })
                .reduce(function(s, d) { return s + (parseFloat(d.data().amount) || 0); }, 0) / 12
        );
        var totalExpenses = cats.reduce(function(s, c) { return s + (byCat[c.localId] || 0); }, 0) + nonMonthlyReserve;
        var totalIncome   = incomeSnap.docs.reduce(function(s, d) { return s + (parseFloat(d.data().amount) || 0); }, 0);
        return {
            id: budgetId,
            name: budgetDoc.data().name || 'Budget',
            isDefault: budgetId === _investDefaultBudgetId,
            totalExpenses: totalExpenses,
            totalIncome: totalIncome
        };
    } catch (e) { console.error('_investLoadBudgetTotals error', e); return null; }
}

// Loads SS monthly income for each person in the group at their configured retirement age.
// Returns { totalSSMonthly, breakdown: [{personId, name, age, ssMonthly}] }
async function _investLoadGroupSS(group) {
    var personIds      = group.personIds || ['self'];
    var retirementAges = _investConfig.retirementAges || {};
    var result         = { totalSSMonthly: 0, breakdown: [] };
    try {
        var allSnap = await userCol('ssBenefits').get();
        var byPerson = {};
        allSnap.forEach(function(d) {
            var data = d.data();
            if (!byPerson[data.personId]) byPerson[data.personId] = [];
            byPerson[data.personId].push(data);
        });
        Object.keys(byPerson).forEach(function(pid) {
            byPerson[pid].sort(function(a, b) { return (b.asOfDate || '').localeCompare(a.asOfDate || ''); });
        });
        personIds.forEach(function(pid) {
            var retireAge = parseInt(retirementAges[pid] || 0);
            if (!retireAge) return;
            var snapshots = byPerson[pid] || [];
            if (!snapshots.length) return;
            var entries   = snapshots[0].entries || [];
            var entry     = entries.find(function(e) { return parseInt(e.age) === retireAge; });
            if (!entry) return;
            var monthly = parseFloat(entry.monthly) || 0;
            result.totalSSMonthly += monthly;
            var name = pid === 'self' ? 'Me' : ((_investPeople.find(function(p) { return p.id === pid; }) || {}).name || pid);
            result.breakdown.push({ personId: pid, name: name, age: retireAge, ssMonthly: monthly });
        });
    } catch (e) { console.error('_investLoadGroupSS error', e); }
    return result;
}

// ============================================================
// "ME" CONTACT — birthday lookup helpers
// ============================================================

// Returns { age, meContactId, meContactName } on success.
// Returns { noBirthday, meContactId, meContactName } if isMe contact exists but has no birthday with year.
// Returns { noContact } if no contact has isMe === true.
async function _investGetMeAge() {
    try {
        var snap = await userCol('people').where('isMe', '==', true).limit(1).get();
        if (snap.empty) return { noContact: true };
        var meDoc  = snap.docs[0];
        var meId   = meDoc.id;
        var meName = meDoc.data().name || 'Me';

        var datesSnap = await userCol('peopleImportantDates').where('personId', '==', meId).get();
        var entry = null;
        datesSnap.forEach(function(d) {
            var lbl = (d.data().label || '').toLowerCase().replace(/\s+/g, '');
            if (lbl === 'birthday' || lbl === 'bday' || lbl === 'birthdate') entry = d.data();
        });

        if (!entry || !entry.year) return { noBirthday: true, meContactId: meId, meContactName: meName };

        var today = new Date();
        var age   = today.getFullYear() - parseInt(entry.year);
        var m = entry.month || 0, dy = entry.day || 0;
        if (m && dy && (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < dy))) age--;
        return { age: age, meContactId: meId, meContactName: meName };
    } catch (e) {
        console.error('_investGetMeAge error', e);
        return { noContact: true };
    }
}

// Creates a "Me" contact with isMe=true and saves a Birthday important date on it.
// Clears isMe from any existing contacts first. Returns the new contact ID, or null on error.
async function _investCreateMeContactWithBirthday(month, day, year) {
    try {
        var existing = await userCol('people').where('isMe', '==', true).get();
        if (!existing.empty) {
            var clrBatch = db.batch();
            existing.forEach(function(doc) { clrBatch.update(doc.ref, { isMe: false }); });
            await clrBatch.commit();
        }
        var meRef = await userCol('people').add({
            name: 'Me', isMe: true, quickMention: false, category: 'Personal',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await userCol('peopleImportantDates').add({
            personId: meRef.id, label: 'Birthday',
            month: month, day: day, year: year,
            recurrence: 'annual',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return meRef.id;
    } catch (e) {
        console.error('_investCreateMeContactWithBirthday error', e);
        return null;
    }
}

// Returns the birthday prompt HTML to embed in the retire widget, or '' if age is known.
function _investBirthdayPromptHtml(meAgeInfo) {
    if (meAgeInfo.age !== undefined) return ''; // age known — no prompt needed

    if (meAgeInfo.noBirthday) {
        // isMe contact exists but has no birthday — link to their contact page
        return '<div class="invest-bday-prompt">' +
            '⚠ <a href="#contact/' + meAgeInfo.meContactId + '">Add your birthday</a> ' +
            'to enable retirement age calculations.' +
        '</div>';
    }

    // No isMe contact — show inline birthday entry form
    var monthOpts = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        .map(function(m, i) { return '<option value="' + (i + 1) + '">' + m + '</option>'; }).join('');
    return '<div class="invest-bday-prompt">' +
        '<span>Enter your birthday to enable retirement age calculations:</span>' +
        '<div class="invest-bday-form">' +
            '<select id="investBdayMonth"><option value="">Month</option>' + monthOpts + '</select>' +
            '<input type="number" id="investBdayDay" min="1" max="31" placeholder="Day">' +
            '<input type="number" id="investBdayYear" min="1900" max="2099" placeholder="Year">' +
            '<button id="investBdaySaveBtn" class="btn btn-primary btn-small" onclick="_investSaveBirthdayPrompt()">Save</button>' +
        '</div>' +
    '</div>';
}

// Called when user submits the inline birthday form on the summary card (no-contact case).
async function _investSaveBirthdayPrompt() {
    var month = parseInt(document.getElementById('investBdayMonth').value) || 0;
    var day   = parseInt(document.getElementById('investBdayDay').value)   || 0;
    var year  = parseInt(document.getElementById('investBdayYear').value)  || 0;
    if (!month || !day || !year) { alert('Please enter month, day, and year.'); return; }
    var btn = document.getElementById('investBdaySaveBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    await _investCreateMeContactWithBirthday(month, day, year);
    await _investRenderSummaryPage();
}

// ============================================================
// PORTFOLIO SUMMARY PAGE  (#investments/summary)
// ============================================================

async function loadInvestmentsSummaryPage() {
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#investments">Financial</a><span class="separator">&rsaquo;</span><span>Summary</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';

    await Promise.all([_investLoadGroups(), _investLoadConfig(), _investLoadAll()]);

    // Each time the group switcher changes, re-render this page
    _investGroupSwitchHandler = function(gid) {
        _investActiveGroupId  = gid;
        _investSummaryGroupId = gid;
        localStorage.setItem('investActiveGroupId', gid);
        _investRenderSummaryPage();
    };

    if (!_investSummaryGroupId) {
        _investSummaryGroupId = _investActiveGroupId || (_investGroups.length > 0 ? _investGroups[0].id : null);
    }

    await _investRenderSummaryPage();
}

// Builds the full HTML for the "If I Retire Today" widget on the summary page.
function _investBuildRetireWidget(p) {
    var ror = p.ror, atp = p.atp, annual = p.annual, monthly = p.monthly;
    var meAgeInfo = p.meAgeInfo, retireTitle = p.retireTitle;
    var group = p.group, ssData = p.ssData, budgetData = p.budgetData;
    var netWorth = p.netWorth || 0;

    // Tooltip math strings
    var rorPct   = Math.round(ror * 100 * 10) / 10;   // e.g. 6
    var atpPct   = Math.round(atp * 100);               // e.g. 82
    var ssNote   = ssData.totalSSMonthly > 0 ? ' + (SS × ' + atpPct + '%)' : '';
    var annualTip = '(Investments × ' + rorPct + '% × ' + atpPct + '%)' + ssNote;
    var monthlyTip = annualTip + ' ÷ 12';

    // Build ? popup help data for Annual and Monthly
    var ssRaw = ssData.totalSSMonthly || 0;
    var rorStr = rorPct + '%';
    var atpStr = atpPct + '%';
    var investAnnualAmt = netWorth * ror * atp;
    _investRetireHelpData = {
        annual: {
            title: 'Annual Retirement Income',
            explanation: 'Your estimated total yearly income if you retired today. It combines what your investment portfolio generates at your expected return rate with your Social Security benefit — both reduced by your estimated tax rate.',
            generic: ssRaw > 0
                ? '(Net Worth × Return Rate × After-Tax %) + (SS Monthly × After-Tax % × 12)'
                : 'Net Worth × Return Rate × After-Tax %',
            real: ssRaw > 0
                ? '(' + _investFmtCurrency(netWorth) + ' × ' + rorStr + ' × ' + atpStr + ')' +
                  ' + (' + _investFmtCurrency(ssRaw) + ' × ' + atpStr + ' × 12)' +
                  ' = ' + _investFmtCurrency(annual)
                : _investFmtCurrency(netWorth) + ' × ' + rorStr + ' × ' + atpStr + ' = ' + _investFmtCurrency(annual)
        },
        monthly: {
            title: 'Monthly Retirement Income',
            explanation: 'Your annual retirement income divided by 12 — the amount you would receive each month in retirement.',
            generic: 'Annual Retirement Income ÷ 12',
            real: _investFmtCurrency(annual) + ' ÷ 12 = ' + _investFmtCurrency(monthly)
        }
    };

    // Budget comparison stat
    var budgetStatHtml = '';
    var pctGoalHtml    = '';
    var shortfallHtml  = '';
    var nwGoalPctHtml  = '';
    if (budgetData) {
        var isDefault   = budgetData.isDefault;
        var budgetVal   = isDefault ? budgetData.totalIncome : budgetData.totalExpenses;
        var budgetLabel = isDefault ? 'Current Income' : budgetData.name;
        var pctGoal     = budgetVal > 0 ? Math.round(monthly / budgetVal * 100) : 0;
        budgetStatHtml =
            '<div class="invest-summary-retire-stat invest-summary-retire-stat--budget">' +
                '<span class="invest-summary-retire-label">' + escapeHtml(budgetLabel) + '</span>' +
                '<span class="invest-summary-retire-val">' + _investFmtCurrency(budgetVal) + '</span>' +
            '</div>';
        pctGoalHtml =
            '<div class="invest-summary-retire-stat invest-summary-retire-stat--pct">' +
                '<span class="invest-summary-retire-label">% To Goal</span>' +
                '<span class="invest-summary-retire-val invest-retire-pct' + (pctGoal >= 100 ? ' invest-retire-pct--good' : '') + '">' + pctGoal + '%</span>' +
            '</div>';

        // Shortfall: how much more NW is needed so investments (after SS) cover 100% of budget.
        // investMonthlyNeeded = budget − SS(after-tax)  →  the gap investments must fill each month
        // nwNeeded = (investMonthlyNeeded × 12) / (RoR × afterTaxPct)
        var ssAfterTax          = (ssData.totalSSMonthly || 0) * atp;
        var investMonthlyNeeded = budgetVal - ssAfterTax;
        var nwNeeded            = (investMonthlyNeeded > 0 && ror > 0 && atp > 0)
                                    ? (investMonthlyNeeded * 12) / (ror * atp)
                                    : 0;
        var shortfall           = Math.max(0, nwNeeded - netWorth);
        var pctOfTarget         = nwNeeded > 0 ? Math.min(999, Math.round(netWorth / nwNeeded * 100)) : 100;
        var atGoal              = shortfall <= 0;
        var shortfallTip        = 'Target NW: ' + _investFmtCurrency(nwNeeded) +
                                  ' = (Budget − SS after-tax) × 12 / (RoR × ATP)';
        shortfallHtml =
            '<div class="invest-summary-retire-stat invest-summary-retire-stat--shortfall">' +
                '<span class="invest-summary-retire-label">NW Shortfall</span>' +
                '<span class="invest-summary-retire-val' + (atGoal ? ' invest-retire-pct--good' : ' invest-retire-shortfall--deficit') + '"' +
                    ' title="' + escapeHtml(shortfallTip) + '">' +
                    (atGoal ? 'At Goal' : _investFmtCurrency(shortfall)) +
                '</span>' +
            '</div>';
        nwGoalPctHtml =
            '<div class="invest-summary-retire-stat invest-summary-retire-stat--nwpct">' +
                '<span class="invest-summary-retire-label">% of Target</span>' +
                '<span class="invest-summary-retire-val invest-retire-pct' + (pctOfTarget >= 100 ? ' invest-retire-pct--good' : '') + '"' +
                    ' title="' + escapeHtml(shortfallTip) + '">' +
                    pctOfTarget + '%' +
                '</span>' +
            '</div>';

        // ? popup help data for budget-dependent stats
        _investRetireHelpData.budget = {
            title: 'Income Target — ' + budgetLabel,
            explanation: isDefault
                ? 'Your current monthly income — the benchmark you want retirement to match. This comes from your default budget\'s total income. You are trying to replace this number with retirement income.'
                : 'Your selected budget\'s total monthly expenses, used as your retirement income target.',
            generic: isDefault ? 'Default budget → Total Income' : 'Selected budget → Total Expenses',
            real: budgetLabel + ' = ' + _investFmtCurrency(budgetVal) + ' / month'
        };
        _investRetireHelpData.pctGoal = {
            title: '% of Income Goal Covered',
            explanation: 'What percentage of your income target is covered by your projected retirement income (investments + Social Security). When this reaches 100%, retirement income fully replaces your current income.',
            generic: '(Monthly Retirement Income ÷ Income Target) × 100',
            real: '(' + _investFmtCurrency(monthly) + ' ÷ ' + _investFmtCurrency(budgetVal) + ') × 100 = ' + pctGoal + '%'
        };
        _investRetireHelpData.shortfall = {
            title: 'Net Worth Shortfall',
            explanation: 'How much more net worth you would need today — in today\'s dollars — for your investments alone to cover the gap between Social Security and your income target. Social Security is subtracted first because it is fixed and does not depend on your portfolio. The remaining gap must come from investment returns.',
            generic: [
                'Step 1 — Investment gap:  Income Target − (SS Monthly × After-Tax %)',
                'Step 2 — Target NW:       (Investment Gap × 12) ÷ (Return Rate × After-Tax %)',
                'Step 3 — Shortfall:       max(0, Target NW − Current NW)'
            ],
            real: [
                'Step 1 — Investment gap:  ' + _investFmtCurrency(budgetVal) + ' − (' + _investFmtCurrency(ssRaw) + ' × ' + atpStr + ') = ' + _investFmtCurrency(investMonthlyNeeded),
                'Step 2 — Target NW:       (' + _investFmtCurrency(investMonthlyNeeded) + ' × 12) ÷ (' + rorStr + ' × ' + atpStr + ') = ' + _investFmtCurrency(nwNeeded),
                'Step 3 — Shortfall:       max(0, ' + _investFmtCurrency(nwNeeded) + ' − ' + _investFmtCurrency(netWorth) + ') = ' + (atGoal ? 'At Goal ($0)' : _investFmtCurrency(shortfall))
            ]
        };
        _investRetireHelpData.pctTarget = {
            title: '% of Target Net Worth',
            explanation: 'Your current net worth as a percentage of the target net worth needed for your investments to cover 100% of your income goal — with Social Security already accounted for. When this reaches 100% your shortfall is zero and you are fully retirement-ready.',
            generic: '(Current NW ÷ Target NW) × 100',
            real: '(' + _investFmtCurrency(netWorth) + ' ÷ ' + _investFmtCurrency(nwNeeded) + ') × 100 = ' + pctOfTarget + '%'
        };
    }

    // Gear panel — per-person age rows
    var personIds  = group.personIds || ['self'];
    var ages       = _investConfig.retirementAges || {};
    var ageOptions = [62, 63, 64, 65, 67, 70];
    var ageRowsHtml = personIds.map(function(pid) {
        var pName    = pid === 'self' ? (meAgeInfo.meContactName || 'Me') : ((_investPeople.find(function(p) { return p.id === pid; }) || {}).name || pid);
        var curAge   = ages[pid] || '';
        var isOther  = curAge && ageOptions.indexOf(parseInt(curAge)) === -1;
        var selHtml  = '<select class="invest-config-input invest-retire-age-sel" onchange="_investToggleOtherAge(this)">' +
            '<option value="">— Age —</option>' +
            ageOptions.map(function(a) {
                return '<option value="' + a + '"' + (parseInt(curAge) === a ? ' selected' : '') + '>' + a + '</option>';
            }).join('') +
            '<option value="other"' + (isOther ? ' selected' : '') + '>Other</option>' +
        '</select>';
        var txtHtml = '<input type="number" class="invest-config-input invest-retire-age-txt" min="40" max="85" placeholder="Age"' +
            ' value="' + (isOther ? curAge : '') + '"' +
            ' style="' + (isOther ? '' : 'display:none') + '">';
        return '<div class="invest-summary-retire-config-row invest-retire-age-row" data-person-id="' + escapeHtml(pid) + '">' +
            '<label>' + escapeHtml(pName) + ' retires at</label>' + selHtml + txtHtml +
        '</div>';
    }).join('');

    // Gear panel — budget dropdown
    var budgetOpts = '<option value="">— No budget —</option>';
    _investBudgets.forEach(function(b) {
        var sel = (_investConfig.selectedBudgetId === b.id) ? ' selected' : '';
        budgetOpts += '<option value="' + escapeHtml(b.id) + '"' + sel + '>' + escapeHtml(b.name) + '</option>';
    });
    var budgetRowHtml = _investBudgets.length > 0
        ? '<div class="invest-summary-retire-config-row">' +
              '<label>Budget</label>' +
              '<select id="investConfigBudget" class="invest-config-input invest-config-budget-sel">' + budgetOpts + '</select>' +
          '</div>'
        : '';

    var helpBtn = function(key) {
        return '<button class="invest-retire-help-btn" type="button" onclick="_investRetireHelp(\'' + key + '\')" title="What does this mean?">?</button>';
    };

    return '<div class="invest-summary-retire">' +
        // Shared help popup (hidden until a ? button is clicked)
        '<div class="invest-retire-help-overlay" id="investRetireHelpOverlay" style="display:none" onclick="_investRetireHelpClose()">' +
            '<div class="invest-retire-help-popup" onclick="event.stopPropagation()">' +
                '<div class="invest-retire-help-popup-header">' +
                    '<span class="invest-retire-help-popup-title" id="investRetireHelpTitle"></span>' +
                    '<button class="invest-retire-help-close" type="button" onclick="_investRetireHelpClose()">✕</button>' +
                '</div>' +
                '<div class="invest-retire-help-popup-body" id="investRetireHelpBody"></div>' +
            '</div>' +
        '</div>' +
        '<div class="invest-summary-retire-title">' +
            escapeHtml(retireTitle) +
            '<button class="invest-retire-gear" id="investRetireGearBtn" onclick="_investToggleRetireConfig()" title="Settings">⚙</button>' +
        '</div>' +
        '<div class="invest-summary-retire-amounts">' +
            '<div class="invest-summary-retire-stat">' +
                '<span class="invest-summary-retire-label">Annual ' + helpBtn('annual') + '</span>' +
                '<span class="invest-summary-retire-val" title="' + escapeHtml(annualTip) + '">' + _investFmtCurrency(annual) + '</span>' +
            '</div>' +
            '<div class="invest-summary-retire-stat">' +
                '<span class="invest-summary-retire-label">Monthly ' + helpBtn('monthly') + '</span>' +
                '<span class="invest-summary-retire-val" title="' + escapeHtml(monthlyTip) + '">' + _investFmtCurrency(monthly) + '</span>' +
            '</div>' +
            (budgetData ?
                '<div class="invest-summary-retire-stat invest-summary-retire-stat--budget">' +
                    '<span class="invest-summary-retire-label">' + escapeHtml(budgetData.isDefault ? 'Current Income' : budgetData.name) + ' ' + helpBtn('budget') + '</span>' +
                    '<span class="invest-summary-retire-val">' + _investFmtCurrency(budgetData.isDefault ? budgetData.totalIncome : budgetData.totalExpenses) + '</span>' +
                '</div>' +
                '<div class="invest-summary-retire-stat invest-summary-retire-stat--pct">' +
                    '<span class="invest-summary-retire-label">% To Goal ' + helpBtn('pctGoal') + '</span>' +
                    '<span class="invest-summary-retire-val invest-retire-pct' + (pctGoal >= 100 ? ' invest-retire-pct--good' : '') + '">' + pctGoal + '%</span>' +
                '</div>' +
                shortfallHtml.replace('>NW Shortfall<', '>NW Shortfall ' + helpBtn('shortfall') + '<') +
                nwGoalPctHtml.replace('>% of Target<', '>% of Target ' + helpBtn('pctTarget') + '<')
            : '') +
        '</div>' +
        _investBirthdayPromptHtml(meAgeInfo) +
        '<div class="invest-summary-retire-config" id="investRetireConfig" style="' + (_investRetireConfigOpen ? '' : 'display:none') + '">' +
            ageRowsHtml +
            '<div class="invest-summary-retire-config-row">' +
                '<label>Return Rate</label>' +
                '<input type="number" id="investConfigRoR" class="invest-config-input" step="0.001" min="0.001" max="1" placeholder="0.06" value="' + ror + '">' +
            '</div>' +
            '<div class="invest-summary-retire-config-row">' +
                '<label>After-Tax %</label>' +
                '<input type="number" id="investConfigAfterTax" class="invest-config-input" step="0.01" min="0.01" max="1" placeholder="0.82" value="' + atp + '">' +
            '</div>' +
            budgetRowHtml +
            '<button class="btn btn-secondary btn-small" onclick="_investSaveConfig()">Recalculate</button>' +
        '</div>' +
    '</div>';
}

// Shows/hides the "other age" text input when user picks "Other" from age dropdown.
function _investToggleOtherAge(sel) {
    var row = sel.closest('.invest-retire-age-row');
    if (!row) return;
    var txt = row.querySelector('.invest-retire-age-txt');
    if (!txt) return;
    txt.style.display = sel.value === 'other' ? '' : 'none';
    if (sel.value === 'other') txt.focus();
}

// Opens the ? help popup for a retire widget stat.
function _investRetireHelp(key) {
    var item = _investRetireHelpData[key];
    if (!item) return;
    var overlay = document.getElementById('investRetireHelpOverlay');
    if (!overlay) return;

    document.getElementById('investRetireHelpTitle').textContent = item.title;

    var body = '<p class="invest-retire-help-exp">' + escapeHtml(item.explanation) + '</p>';

    body += '<div class="invest-retire-help-block">';
    body += '<div class="invest-retire-help-block-label">Formula</div>';
    if (Array.isArray(item.generic)) {
        item.generic.forEach(function(line) {
            body += '<div class="invest-retire-help-line"><code>' + escapeHtml(line) + '</code></div>';
        });
    } else {
        body += '<div class="invest-retire-help-line"><code>' + escapeHtml(item.generic) + '</code></div>';
    }
    body += '</div>';

    body += '<div class="invest-retire-help-block invest-retire-help-block--real">';
    body += '<div class="invest-retire-help-block-label">With your numbers</div>';
    if (Array.isArray(item.real)) {
        item.real.forEach(function(line) {
            body += '<div class="invest-retire-help-line"><code>' + escapeHtml(line) + '</code></div>';
        });
    } else {
        body += '<div class="invest-retire-help-line"><code>' + escapeHtml(item.real) + '</code></div>';
    }
    body += '</div>';

    document.getElementById('investRetireHelpBody').innerHTML = body;
    overlay.style.display = 'flex';
}

function _investRetireHelpClose() {
    var overlay = document.getElementById('investRetireHelpOverlay');
    if (overlay) overlay.style.display = 'none';
}

async function _investRenderSummaryPage() {
    var page = document.getElementById('page-investments-summary');
    if (!page) return;

    page.innerHTML = '<div class="invest-summary-loading">Loading…</div>';

    var group = _investGroups.find(function(g) { return g.id === _investSummaryGroupId; })
             || (_investGroups[0] || null);

    if (!group) {
        page.innerHTML = '<div class="empty-state">No groups found. <a href="#investments/groups">Create a group</a>.</div>';
        return;
    }

    var accounts  = await _investLoadGroupAccounts(group);
    var cats      = _investComputeGroupTotals(accounts);
    var results   = await Promise.all([
        _investLoadPeriodBaselines(group.id),
        _investGetMeAge(),
        _investLoadBudgets(),
        _investLoadGroupSS(group),
        _investLoadBudgetTotals(_investConfig.selectedBudgetId || null)
    ]);
    var baselines   = results[0];
    var meAgeInfo   = results[1];
    // _investLoadBudgets populates _investBudgets/_investDefaultBudgetId as side-effects (result[2] is void)
    var ssData      = results[3];
    var budgetData  = results[4];

    // Self-heal ATH from baselines (each baseline is the most recent snapshot of its type).
    // Lightweight alternative to loading all snapshots — enough to catch the common migration case.
    await _investRecomputeGroupATH(Object.values(baselines).filter(Boolean), group.id);

    var ror           = _investConfig.projectedRoR || 0.06;
    var atp           = _investConfig.afterTaxPct  || 0.82;
    var investAnnual  = cats.netWorth * ror * atp;
    var ssMonthly     = (ssData.totalSSMonthly || 0) * atp;
    var annual        = investAnnual + ssMonthly * 12;
    var monthly       = annual / 12;

    // Self person's retirement age (drives card title)
    var selfAge       = (_investConfig.retirementAges || {})['self'] || null;

    // Build retire card title
    var retireTitle   = selfAge
        ? 'If I retire today at age ' + selfAge + ' (after est. taxes)'
        : 'If I retire today (after est. taxes)';

    // Group switcher (only shown when >1 group exists)
    var switcherHtml = '';
    if (_investGroups.length > 1) {
        var opts = _investGroups.map(function(g) {
            return '<option value="' + escapeHtml(g.id) + '"' +
                (g.id === group.id ? ' selected' : '') + '>' + escapeHtml(g.name) + '</option>';
        }).join('');
        switcherHtml =
            '<div class="invest-group-switcher">' +
                '<label class="invest-group-switcher-label">Group:</label>' +
                '<select id="investGroupSelect" onchange="_investOnGroupSwitch(this.value)">' + opts + '</select>' +
            '</div>';
    }

    // Per-account breakdown grouped by person
    var personIds    = group.personIds || ['self'];
    var breakdownHtml = '';
    personIds.forEach(function(pid) {
        var personAccts = accounts.filter(function(a) { return a._ns === pid && !a._joint; });
        if (personAccts.length === 0) return;
        var pName = pid === 'self' ? 'Me'
                  : ((_investPeople.find(function(p) { return p.id === pid; }) || {}).name || pid);
        breakdownHtml +=
            '<div class="invest-summary-person-section">' +
                '<div class="invest-summary-person-name">' + escapeHtml(pName) + '</div>';
        personAccts.forEach(function(a) { breakdownHtml += _investSummaryAccountRow(a); });
        breakdownHtml += '</div>';
    });
    var jointAccts = accounts.filter(function(a) { return !!a._joint; });
    if (jointAccts.length > 0) {
        breakdownHtml +=
            '<div class="invest-summary-person-section">' +
                '<div class="invest-summary-person-name">Joint Accounts</div>';
        jointAccts.forEach(function(a) { breakdownHtml += _investSummaryAccountRow(a); });
        breakdownHtml += '</div>';
    }

    // All-Time Highs — use shared builder (also used on the hub page)
    var athBodyHtml = _investBuildAthHtml(group.id, cats.netWorth);

    var html =
        '<div class="page-header">' +
            '<h2>📊 Portfolio Summary</h2>' +
            '<div class="page-header-actions">' +
                '<button class="btn btn-secondary" id="investUpdateAllBtn" onclick="_investUpdateAllPrices()">📡 Update All Prices</button>' +
            '</div>' +
        '</div>' +
        (switcherHtml ? '<div class="invest-summary-switcher-row">' + switcherHtml + '</div>' : '') +
        '<div class="invest-prices-note" id="investSummaryPricesStatus">' +
            (_investConfig.lastUpdateAllTimestamp
                ? 'Prices last updated: <strong>' + escapeHtml(_investFmtUpdateTime(_investConfig.lastUpdateAllTimestamp)) + '</strong>'
                : (_investConfig.lastUpdateAllDate
                    ? 'Prices last updated: <strong>' + escapeHtml(_investConfig.lastUpdateAllDate) + '</strong>'
                    : '')) +
        '</div>' +

        // Hero cards
        '<div class="invest-summary-heroes">' +
            '<div class="invest-summary-hero">' +
                '<div class="invest-summary-hero-label">Net Worth</div>' +
                '<div class="invest-summary-hero-value">' + _investFmtCurrency(cats.netWorth) + '</div>' +
            '</div>' +
            '<div class="invest-summary-hero">' +
                '<div class="invest-summary-hero-label">Invested</div>' +
                '<div class="invest-summary-hero-value">' + _investFmtCurrency(cats.invested) + '</div>' +
            '</div>' +
        '</div>' +

        // Retirement widget — sticky collapsible accordion
        _investBuildAccordion({
            id: 'investSumRetire', title: 'Retire Estimate',
            bodyHtml: _investBuildRetireWidget({
                ror: ror, atp: atp, annual: annual, monthly: monthly,
                meAgeInfo: meAgeInfo, retireTitle: retireTitle,
                group: group, ssData: ssData,
                budgetData: budgetData, netWorth: cats.netWorth
            }),
            toggleFn: '_investToggleSumRetire', isOpen: _investSumRetireOpen
        }) +

        '<div class="invest-ai-entry-wrap">' +
            '<a class="btn btn-secondary btn-small invest-ai-entry-btn" href="#investments/ai-analysis" ' +
                'onclick="_investAiBackRoute=\'investments/summary\'">🤖 Ask AI</a>' +
        '</div>' +

        // All-Time Highs — sticky collapsible accordion
        (athBodyHtml ? _investBuildAccordion({
            id: 'investSumAth', title: 'All-Time Highs',
            bodyHtml: athBodyHtml,
            toggleFn: '_investToggleSumAth', isOpen: _investSumAthOpen
        }) : '') +

        // Period Performance (above category breakdown)
        '<div class="invest-summary-section-title">Period Performance</div>' +
        '<div class="invest-summary-perf">' +
            _investPerfRowLive('Day',   'daily',   baselines.daily,   cats.netWorth) +
            _investPerfRowLive('Week',  'weekly',  baselines.weekly,  cats.netWorth) +
            _investPerfRowLive('Month', 'monthly', baselines.monthly, cats.netWorth) +
            _investPerfRowLive('YTD',   'yearly',  baselines.yearly,  cats.netWorth) +
        '</div>' +

        // Category breakdown (now below ATH + performance)
        '<div class="invest-summary-section-title">Category Breakdown</div>' +
        '<div class="invest-summary-categories">' +
            _investCategoryRow('Roth',            cats.roth,      cats.netWorth, 'invest-badge--roth') +
            _investCategoryRow('Pre-Tax',         cats.preTax,    cats.netWorth, 'invest-badge--pretax') +
            _investCategoryRow('Brokerage',       cats.brokerage, cats.netWorth, 'invest-badge--brokerage',
                cats.brokerageCostBasisKnown
                    ? 'taxable ' + _investFmtCurrency(cats.brokerage - cats.brokerageCostBasisTotal)
                    : null) +
            _investCategoryRow('Cash',            cats.cash,      cats.netWorth, 'invest-badge--cash') +
            _investCategoryRow('Uninvested Cash', cats.invCash,   cats.netWorth, 'invest-badge--other') +
            '<div class="invest-summary-cat-row invest-summary-cat-total">' +
                '<div class="invest-summary-cat-label">Net Worth</div>' +
                '<div class="invest-summary-cat-value">' + _investFmtCurrency(cats.netWorth) + '</div>' +
                '<div class="invest-summary-cat-pct"></div>' +
            '</div>' +
        '</div>' +

        // Per-account breakdown
        '<div class="invest-summary-section-title">Accounts</div>' +
        '<div class="invest-summary-accounts">' + breakdownHtml + '</div>';

    page.innerHTML = html;
    _investApplyStaleIndicators();
}

// ---------- Summary Helpers ----------

function _investCategoryRow(label, value, total, badgeCls, taxableNote) {
    var pct = (total > 0) ? (value / total * 100).toFixed(1) + '%' : '—';
    var noteHtml = taxableNote
        ? '<span class="invest-cat-taxable-note">' + escapeHtml(taxableNote) + '</span>'
        : '';
    return '<div class="invest-summary-cat-row">' +
        '<div class="invest-summary-cat-label">' +
            '<span class="invest-type-badge ' + escapeHtml(badgeCls) + '">' + escapeHtml(label) + '</span>' +
        '</div>' +
        '<div class="invest-summary-cat-value">' + noteHtml + _investFmtCurrency(value) + '</div>' +
        '<div class="invest-summary-cat-pct">' + escapeHtml(pct) + '</div>' +
    '</div>';
}

function _investPerfRow(label) {
    return '<div class="invest-summary-perf-row">' +
        '<span class="invest-summary-perf-label">' + escapeHtml(label) + '</span>' +
        '<span class="invest-summary-perf-value">—</span>' +
    '</div>';
}

// Load the most recent snapshot of each type for a group (client-side filter, no composite index needed)
async function _investLoadPeriodBaselines(groupId) {
    var snap = await _investSnapshotCol().orderBy('date', 'desc').limit(200).get();
    var b    = { daily: null, weekly: null, monthly: null, yearly: null };
    snap.forEach(function(doc) {
        var data = doc.data();
        if (data.groupId === groupId && b[data.type] === null) {
            b[data.type] = Object.assign({ id: doc.id }, data);
        }
    });
    return b;
}

function _investPerfRowLive(label, snapshotType, baseline, currentNetWorth) {
    if (!baseline) {
        return '<div class="invest-summary-perf-row">' +
            '<span class="invest-summary-perf-label">' + escapeHtml(label) + '</span>' +
            '<span class="invest-summary-perf-value invest-perf-dim">No ' + escapeHtml(snapshotType) + ' snapshot yet</span>' +
        '</div>';
    }

    var diff    = currentNetWorth - (baseline.netWorth || 0);
    var base    = baseline.netWorth || 0;
    var pct     = (base > 0) ? (diff / base * 100) : 0;
    var isGain  = diff >= 0;
    var diffFmt = (isGain ? '+' : '\u2212') + '$' +
        Math.abs(diff).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var pctFmt  = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
    var cls     = isGain ? 'invest-perf-gain' : 'invest-perf-loss';

    return '<div class="invest-summary-perf-row ' + cls + '">' +
        '<div class="invest-summary-perf-left">' +
            '<span class="invest-summary-perf-label">' + escapeHtml(label) + '</span>' +
            '<span class="invest-summary-perf-baseline">vs ' + escapeHtml(baseline.date) + '</span>' +
        '</div>' +
        '<div class="invest-summary-perf-right">' +
            '<span class="invest-summary-perf-diff">' + escapeHtml(diffFmt) + '</span>' +
            '<span class="invest-summary-perf-pct">' + escapeHtml(pctFmt) + '</span>' +
        '</div>' +
    '</div>';
}

function _investEditFromSummary(ns, id) {
    _investAccountReturnTo = 'summary';
    window.location.hash = '#investments/account/' + encodeURIComponent(ns) + '/' + id;
}

function _investSummaryAccountRow(acct) {
    var taxInfo = _investTaxCategoryInfo(acct.accountType || '');
    var t       = acct._totals || { total: 0 };
    return '<div class="invest-summary-acct-row">' +
        '<div class="invest-summary-acct-info">' +
            '<span class="invest-summary-acct-name">' + escapeHtml(acct.nickname || '(untitled)') + '</span>' +
            '<span class="invest-type-badge ' + escapeHtml(taxInfo.cls) + '">' + escapeHtml(taxInfo.label) + '</span>' +
        '</div>' +
        '<div class="invest-summary-acct-right">' +
            '<div class="invest-summary-acct-value">' + _investFmtCurrency(t.total) + '</div>' +
            (acct.url ? '<a class="iht-btn invest-summary-acct-url" href="' + escapeHtml(acct.url) + '" target="_blank" rel="noopener" title="Visit site"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg></a>' : '') +
            '<button class="iht-btn invest-summary-acct-edit" title="View holdings"' +
                ' onclick="_investEditFromSummary(\'' + escapeHtml(acct._ns) + '\',\'' + acct.id + '\')">✏️</button>' +
        '</div>' +
    '</div>';
}

// ---------- Load Accounts + Holdings for a Group ----------

async function _investLoadGroupAccounts(group) {
    var personIds   = (group && group.personIds) ? group.personIds : ['self'];
    var allAccounts = [];

    // Personal (non-joint) accounts for each person in the group
    for (var i = 0; i < personIds.length; i++) {
        var ns   = personIds[i];
        var snap = await userCol('investments').doc(ns).collection('accounts').get();
        snap.forEach(function(doc) {
            var data = doc.data();
            if (!data.archived && data.ownerType !== 'joint') {
                allAccounts.push(Object.assign({ id: doc.id, _ns: ns }, data));
            }
        });
    }

    // Joint accounts (stored under 'self') — only included when ALL parties are in the group
    if (personIds.indexOf('self') >= 0) {
        var selfSnap = await userCol('investments').doc('self').collection('accounts').get();
        selfSnap.forEach(function(doc) {
            var data = doc.data();
            if (data.ownerType === 'joint' && !data.archived && data.primaryContactId) {
                var alreadyIn      = allAccounts.find(function(a) { return a.id === doc.id; });
                var coOwnerInGroup = personIds.indexOf(data.primaryContactId) >= 0;
                if (!alreadyIn && coOwnerInGroup) {
                    allAccounts.push(Object.assign({ id: doc.id, _ns: 'self', _joint: true }, data));
                }
            }
        });
    }

    // Load holdings for each account and attach computed totals
    for (var j = 0; j < allAccounts.length; j++) {
        var acct     = allAccounts[j];
        var holdSnap = await _investHoldingCol(acct._ns, acct.id).get();
        acct._holdings = [];
        holdSnap.forEach(function(hdoc) {
            acct._holdings.push(Object.assign({ id: hdoc.id }, hdoc.data()));
        });
        acct._totals = _investComputeAccountTotals(acct._holdings, acct.cashBalance, acct.pendingActivity);
    }

    return allAccounts;
}

// ---------- Category Totals ----------

function _investComputeGroupTotals(accounts) {
    var t = { roth: 0, preTax: 0, brokerage: 0, cash: 0, invCash: 0,
              brokerageCostBasisTotal: 0, brokerageCostBasisKnown: false };

    accounts.forEach(function(acct) {
        var type   = acct.accountType || '';
        var isCash = _INVEST_CASH_TYPES.indexOf(type) >= 0;
        var totals = acct._totals || { holdings: 0, cash: 0, total: 0 };

        if (isCash) {
            t.cash += totals.total;
        } else {
            // Category buckets include the full account total (holdings + cash + pending)
            if      (_INVEST_ROTH_TYPES.indexOf(type)   >= 0) t.roth      += totals.total;
            else if (_INVEST_PRETAX_TYPES.indexOf(type) >= 0) t.preTax    += totals.total;
            else if (_INVEST_BROKER_TYPES.indexOf(type) >= 0) {
                t.brokerage += totals.total;
                // Sum cost basis for brokerage holdings (costBasis is per-share)
                (acct._holdings || []).forEach(function(h) {
                    if (h.costBasis != null && h.shares != null) {
                        t.brokerageCostBasisTotal += h.costBasis * h.shares;
                        t.brokerageCostBasisKnown  = true;
                    }
                });
            }
            // invCash tracked separately so the Uninvested Cash row shows what portion is idle
            t.invCash += totals.cash + (totals.pending || 0);
        }
    });

    // invCash is already inside roth/preTax/brokerage — don't add it again to netWorth
    t.netWorth = t.roth + t.preTax + t.brokerage + t.cash;
    t.invested = t.netWorth - t.invCash;
    return t;
}

// ---------- Update All Prices ----------

async function _investUpdateAllPrices() {
    var btn    = document.getElementById('investUpdateAllBtn');
    var status = document.getElementById('investSummaryPricesStatus');
    // btn may not exist when called from the snapshot-capture flow — that's fine

    var apiKey = await _investGetFinnhubKey();
    if (!apiKey) {
        if (status) {
            status.textContent = 'Finnhub API key not configured — add it in Settings → General Settings';
            status.style.color = '#c62828';
        }
        return;
    }

    var group = _investGroups.find(function(g) { return g.id === _investSummaryGroupId; });
    if (!group) return;

    if (btn) { btn.disabled = true; btn.textContent = '⏳ Updating…'; }
    if (status) { status.textContent = ''; }

    var accounts = await _investLoadGroupAccounts(group);

    // Deduplicate tickers across all accounts
    var priceMap = {};
    accounts.forEach(function(acct) {
        (acct._holdings || []).forEach(function(h) {
            if (h.ticker) priceMap[h.ticker] = null;
        });
    });

    var failed    = [];
    var failedMsg = {};

    // Phase 1: Finnhub for all tickers
    var needYahoo = [];
    for (var ticker in priceMap) {
        try {
            var p = await _investFetchPriceFinnhub(ticker, apiKey);
            if (p && p > 0) { priceMap[ticker] = p; }
            else             { needYahoo.push(ticker); }
        } catch (e) {
            if (e.message === 'invalid key') {
                if (status) { status.textContent = 'Invalid Finnhub API key'; status.style.color = '#c62828'; }
                if (btn) { btn.disabled = false; btn.textContent = '📡 Update All Prices'; }
                return;
            }
            needYahoo.push(ticker);
        }
    }

    // Phase 2: Yahoo batch for anything Finnhub missed
    if (needYahoo.length > 0) {
        console.log('[prices] Yahoo batch for: ' + needYahoo.join(', '));
        var yahooMap = await _investFetchYahooBatch(needYahoo);
        needYahoo.forEach(function(t) {
            if (yahooMap[t]) { priceMap[t] = yahooMap[t]; }
            else             { failed.push(t); failedMsg[t] = 'not found'; }
        });
    }

    // Batch-write updated prices
    var now   = new Date().toISOString();
    var batch = firebase.firestore().batch();
    accounts.forEach(function(acct) {
        (acct._holdings || []).forEach(function(h) {
            if (h.ticker && priceMap[h.ticker] != null) {
                batch.update(_investHoldingCol(acct._ns, acct.id).doc(h.id), {
                    lastPrice:     priceMap[h.ticker],
                    lastPriceDate: now
                });
            }
        });
    });
    await batch.commit();

    // Record when prices were last updated
    var todayDate = new Date().toISOString().split('T')[0];
    var timestamp = new Date().toISOString();
    _investConfig.lastUpdateAllDate      = todayDate;
    _investConfig.lastUpdateAllTimestamp = timestamp;
    await _investConfigCol().doc('main').set({ lastUpdateAllDate: todayDate, lastUpdateAllTimestamp: timestamp }, { merge: true });

    // Re-render the page (will reload fresh holdings from Firestore)
    await _investRenderSummaryPage();

    btn = document.getElementById('investUpdateAllBtn');
    if (btn) { btn.disabled = false; btn.textContent = '📡 Update All Prices'; }

    var updatedCount = Object.keys(priceMap).filter(function(t) { return priceMap[t] != null; }).length;
    _investShowPriceResultModal(updatedCount, failed, failedMsg, await _investGetYahooWorkerUrl());
}

// Called from the main hub page Update All button.
// Routes through _investUpdateAllPrices using the hub's active group.
async function _investUpdateHubAllPrices() {
    var btn  = document.getElementById('investHubUpdateBtn');
    var note = document.getElementById('investHubUpdateNote');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Updating…'; }

    // Temporarily set _investSummaryGroupId so _investUpdateAllPrices uses the hub group
    var prev = _investSummaryGroupId;
    _investSummaryGroupId = _investHubGroupId;
    try {
        await _investUpdateAllPrices();
    } finally {
        _investSummaryGroupId = prev;
    }

    // Refresh the hub dashboard numbers
    await _investRenderHubBody(_investHubGroupId);

    btn = document.getElementById('investHubUpdateBtn');
    if (btn) { btn.disabled = false; btn.textContent = '📡 Update All Prices'; }
    note = document.getElementById('investHubUpdateNote');
    if (note) note.textContent = _investFmtUpdateTime(_investConfig.lastUpdateAllTimestamp);
    _investApplyStaleIndicators();
}

// Applies or removes the stale-price visual indicator on all Update All Prices buttons and
// date labels across the hub, summary, and stocks pages.  A stale date means prices were
// last updated before today and the user should refresh them.
function _investApplyStaleIndicators() {
    var today    = new Date().toISOString().split('T')[0];
    var lastDate = _investConfig.lastUpdateAllDate || null;
    var isStale  = !lastDate || lastDate < today;

    var btnIds  = ['investHubUpdateBtn', 'investUpdateAllBtn', 'investStocksUpdateBtn'];
    var noteIds = ['investHubUpdateNote', 'investStocksUpdateNote', 'investSummaryPricesStatus'];

    btnIds.forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('invest-update-stale-btn', isStale);
    });
    noteIds.forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('invest-update-stale-note', isStale);
    });
}

// ============================================================
// STOCK ROLLUP PAGE  (#investments/stocks)
// ============================================================

var _investStocksSort      = 'value';   // 'value' | 'ticker'
var _investStocksExpandIds = {};         // { ticker: bool } — which rows are expanded

async function loadInvestmentsStocksPage() {
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#investments">Financial</a><span class="separator">&rsaquo;</span><span>Stock Rollup</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';

    if (_investPeople.length === 0) await _investLoadAll();

    await _investRenderStocksPage();
}

async function _investRenderStocksPage() {
    var page = document.getElementById('page-investments-stocks');
    if (!page) return;
    page.innerHTML = '<div class="invest-summary-loading">Loading…</div>';

    var accounts      = await _investLoadAllAccountsForStocks();
    var result        = _investAggregateByTicker(accounts);
    var tickers       = result.tickers;
    var overallNW     = result.overallNetWorth;

    // Sort
    if (_investStocksSort === 'ticker') {
        tickers.sort(function(a, b) { return a.ticker.localeCompare(b.ticker); });
    } else {
        tickers.sort(function(a, b) { return b.totalValue - a.totalValue; });
    }

    var totalHeld = tickers.reduce(function(s, t) { return s + t.totalValue; }, 0);

    var sortBtns =
        '<div class="invest-stocks-sort-bar">' +
            '<span class="invest-stocks-sort-label">Sort:</span>' +
            '<button class="btn btn-small ' + (_investStocksSort === 'value'  ? 'btn-primary' : 'btn-secondary') +
                '" onclick="_investSetStocksSort(\'value\')">Value</button>' +
            '<button class="btn btn-small ' + (_investStocksSort === 'ticker' ? 'btn-primary' : 'btn-secondary') +
                '" onclick="_investSetStocksSort(\'ticker\')">Ticker</button>' +
        '</div>';

    var tableHtml;
    if (tickers.length === 0) {
        tableHtml = '<div class="empty-state">No holdings with tickers found. Add holdings to your investment accounts first.</div>';
    } else {
        var headerRow =
            '<div class="ist-row ist-header-row">' +
                '<div class="ist-cell ist-cell-sym">SYMBOL</div>' +
                '<div class="ist-cell ist-cell-num">QTY</div>' +
                '<div class="ist-cell ist-cell-num">PRICE</div>' +
                '<div class="ist-cell ist-cell-num">COST/SH</div>' +
                '<div class="ist-cell ist-cell-num">TOT GAIN $</div>' +
                '<div class="ist-cell ist-cell-num">TOT GAIN %</div>' +
                '<div class="ist-cell ist-cell-num">VALUE</div>' +
                '<div class="ist-cell ist-cell-num">% NW</div>' +
                '<div class="ist-cell ist-cell-chev"></div>' +
            '</div>';
        var rows = tickers.map(function(t) { return _investStocksRowHtml(t, overallNW); }).join('');
        tableHtml = '<div class="ist-table-wrap">' + headerRow + rows + '</div>';
    }

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>📈 Stock Rollup</h2>' +
            '<div class="page-header-actions">' +
                '<button class="btn btn-secondary btn-small" id="investStocksUpdateBtn" onclick="_investUpdateStocksAllPrices()">📡 Update All Prices</button>' +
                (_investConfig.lastUpdateAllTimestamp ? '<span class="invest-update-time-note" id="investStocksUpdateNote">' + escapeHtml(_investFmtUpdateTime(_investConfig.lastUpdateAllTimestamp)) + '</span>' : '<span class="invest-update-time-note" id="investStocksUpdateNote"></span>') +
            '</div>' +
        '</div>' +
        '<div class="invest-stocks-summary">' +
            '<div class="invest-stocks-summary-stat">' +
                '<span class="invest-stocks-summary-label">Unique Tickers</span>' +
                '<span class="invest-stocks-summary-val">' + tickers.length + '</span>' +
            '</div>' +
            '<div class="invest-stocks-summary-stat">' +
                '<span class="invest-stocks-summary-label">Holdings Value</span>' +
                '<span class="invest-stocks-summary-val">' + _investFmtCurrency(totalHeld) + '</span>' +
            '</div>' +
        '</div>' +
        sortBtns +
        tableHtml;
    _investApplyStaleIndicators();
}

async function _investUpdateStocksAllPrices() {
    var btn = document.getElementById('investStocksUpdateBtn');
    if (!btn) return;

    var apiKey = await _investGetFinnhubKey();
    if (!apiKey) { alert('Finnhub API key not configured — add it in Settings → General Settings'); return; }

    btn.disabled = true; btn.textContent = '⏳ Updating…';

    var accounts = await _investLoadAllAccountsForStocks();
    var priceMap = {};
    accounts.forEach(function(acct) {
        (acct._holdings || []).forEach(function(h) { if (h.ticker) priceMap[h.ticker] = null; });
    });

    var failed = {}, failedList = [];

    var needYahoo = [];
    for (var ticker in priceMap) {
        try {
            var p = await _investFetchPriceFinnhub(ticker, apiKey);
            if (p && p > 0) { priceMap[ticker] = p; }
            else             { needYahoo.push(ticker); }
        } catch (e) {
            if (e.message === 'invalid key') { alert('Invalid Finnhub API key'); btn.disabled = false; btn.textContent = '📡 Update All Prices'; return; }
            needYahoo.push(ticker);
        }
    }
    if (needYahoo.length > 0) {
        var yahooMap = await _investFetchYahooBatch(needYahoo);
        needYahoo.forEach(function(t) {
            if (yahooMap[t]) { priceMap[t] = yahooMap[t]; }
            else             { failedList.push(t); failed[t] = 'not found in Finnhub or Yahoo'; }
        });
    }

    var now = new Date().toISOString();
    var batch = firebase.firestore().batch();
    accounts.forEach(function(acct) {
        (acct._holdings || []).forEach(function(h) {
            if (h.ticker && priceMap[h.ticker] != null) {
                batch.update(_investHoldingCol(acct._ns, acct.id).doc(h.id), { lastPrice: priceMap[h.ticker], lastPriceDate: now });
            }
        });
    });
    await batch.commit();

    var todayDate = new Date().toISOString().split('T')[0];
    var timestamp = new Date().toISOString();
    _investConfig.lastUpdateAllDate      = todayDate;
    _investConfig.lastUpdateAllTimestamp = timestamp;
    await _investConfigCol().doc('main').set({ lastUpdateAllDate: todayDate, lastUpdateAllTimestamp: timestamp }, { merge: true });

    var updatedCount = Object.keys(priceMap).filter(function(t) { return priceMap[t] != null; }).length;
    await _investRenderStocksPage();

    btn = document.getElementById('investStocksUpdateBtn');
    if (btn) { btn.disabled = false; btn.textContent = '📡 Update All Prices'; }
    var stocksNote = document.getElementById('investStocksUpdateNote');
    if (stocksNote) stocksNote.textContent = _investFmtUpdateTime(timestamp);

    _investShowPriceResultModal(updatedCount, failedList, failed, await _investGetYahooWorkerUrl());
}

function _investStocksRowHtml(t, overallNW) {
    var isExp   = !!_investStocksExpandIds[t.ticker];
    var safeId  = t.ticker.replace(/\./g, '_');

    var price   = t.lastPrice;
    var wavg    = t.weightedAvgCost;
    var gain    = (price != null && wavg != null && t.totalShares > 0)
                  ? (price - wavg) * t.totalShares : null;
    var gainPct = (gain != null && wavg != null && wavg !== 0)
                  ? (price - wavg) / wavg * 100 : null;
    var pctNW   = (overallNW > 0 && t.totalValue > 0) ? t.totalValue / overallNW * 100 : 0;
    var concCls = pctNW >= 15 ? 'invest-conc-high' : (pctNW >= 10 ? 'invest-conc-warn' : 'invest-conc-ok');

    // --- shared format helpers ---
    function fmtShares(s) {
        return s != null ? Number(s).toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—';
    }
    function fmtPx(p) { return p != null ? '$' + Number(p).toFixed(2) : '—'; }
    function fmtGainAmt(g) {
        if (g == null) return '<span class="ist-dim">—</span>';
        var cls  = g >= 0 ? 'ist-gain' : 'ist-loss';
        var sign = g >= 0 ? '+' : '\u2212';
        return '<span class="' + cls + '">' + sign + _investFmtCurrency(Math.abs(g)).replace('$','$') + '</span>';
    }
    function fmtGainPct(p) {
        if (p == null) return '<span class="ist-dim">—</span>';
        var cls  = p >= 0 ? 'ist-gain' : 'ist-loss';
        var sign = p >= 0 ? '+' : '\u2212';
        return '<span class="' + cls + '">' + sign + Math.abs(p).toFixed(2) + '%</span>';
    }

    // --- sub-rows (one per account holding this ticker) ---
    var subRows = t.accounts.map(function(a) {
        var aGain    = (price != null && a.costBasis != null && a.shares != null)
                       ? (price - a.costBasis) * a.shares : null;
        var aGainPct = (aGain != null && a.costBasis != null && a.costBasis !== 0)
                       ? (price - a.costBasis) / a.costBasis * 100 : null;
        var aPct     = (a.accountTotal > 0 && a.value > 0) ? a.value / a.accountTotal * 100 : null;
        var label    = escapeHtml((a.ownerName !== 'Me' ? a.ownerName + ' \u2014 ' : '') + a.nickname);

        return '<div class="ist-row ist-sub-row">' +
            '<div class="ist-cell ist-cell-sym ist-sub-label">' +
                '<a class="ist-acct-link" href="#investments/account/' + encodeURIComponent(a.ns) + '/' + a.id +
                    '" onclick="_investStocksNavToAccount(\'' + escapeHtml(a.ns) + '\',\'' + a.id + '\');event.stopPropagation()">' +
                    label + '</a>' +
            '</div>' +
            '<div class="ist-cell ist-cell-num">' + fmtShares(a.shares) + '</div>' +
            '<div class="ist-cell ist-cell-num ist-dim">' + fmtPx(price) + '</div>' +
            '<div class="ist-cell ist-cell-num">' + fmtPx(a.costBasis) + '</div>' +
            '<div class="ist-cell ist-cell-num">' + fmtGainAmt(aGain) + '</div>' +
            '<div class="ist-cell ist-cell-num">' + fmtGainPct(aGainPct) + '</div>' +
            '<div class="ist-cell ist-cell-num ist-val">' + _investFmtCurrency(a.value) + '</div>' +
            '<div class="ist-cell ist-cell-num">' +
                (aPct != null ? '<span class="ist-pct-acct">' + aPct.toFixed(1) + '%</span>' : '<span class="ist-dim">—</span>') +
            '</div>' +
            '<div class="ist-cell ist-cell-chev"></div>' +
        '</div>';
    }).join('');

    // --- main (collapsed) row ---
    return '<div class="ist-row-wrap">' +
        '<div class="ist-row ist-main-row" onclick="_investToggleStocksRow(\'' + escapeHtml(t.ticker) + '\')">' +
            '<div class="ist-cell ist-cell-sym">' +
                '<div class="iht-sym-wrap">' +
                    '<span class="iht-ticker">' + escapeHtml(t.ticker) + '</span>' +
                    '<span class="iht-name">' + escapeHtml(t.companyName) + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="ist-cell ist-cell-num">' + fmtShares(t.totalShares) + '</div>' +
            '<div class="ist-cell ist-cell-num">' + fmtPx(price) + '</div>' +
            '<div class="ist-cell ist-cell-num">' + fmtPx(wavg) + '</div>' +
            '<div class="ist-cell ist-cell-num">' + fmtGainAmt(gain) + '</div>' +
            '<div class="ist-cell ist-cell-num">' + fmtGainPct(gainPct) + '</div>' +
            '<div class="ist-cell ist-cell-num ist-val">' + _investFmtCurrency(t.totalValue) + '</div>' +
            '<div class="ist-cell ist-cell-num">' +
                '<span class="invest-stocks-pct ' + concCls + '">' + pctNW.toFixed(1) + '%</span>' +
            '</div>' +
            '<div class="ist-cell ist-cell-chev">' + (isExp ? '\u2304' : '\u203a') + '</div>' +
        '</div>' +
        '<div class="ist-detail' + (isExp ? '' : ' hidden') + '" id="stocksDetail-' + escapeHtml(safeId) + '">' +
            subRows +
        '</div>' +
    '</div>';
}

function _investToggleStocksRow(ticker) {
    _investStocksExpandIds[ticker] = !_investStocksExpandIds[ticker];
    var isExp  = _investStocksExpandIds[ticker];
    var safeId = ticker.replace(/\./g, '_');
    var detail = document.getElementById('stocksDetail-' + safeId);
    if (!detail) return;
    detail.classList.toggle('hidden', !isExp);
    var mainRow = detail.previousElementSibling;
    if (mainRow) {
        var chev = mainRow.querySelector('.ist-cell-chev');
        if (chev) chev.textContent = isExp ? '\u2304' : '\u203a';
    }
}

function _investStocksNavToAccount(ns, id) {
    _investAccountReturnTo = 'stocks';
    window.location.hash = '#investments/account/' + encodeURIComponent(ns) + '/' + id;
}

function _investSetStocksSort(sort) {
    _investStocksSort = sort;
    _investRenderStocksPage();
}

// ---------- Load All Accounts Across All Persons ----------

async function _investLoadAllAccountsForStocks() {
    // _investPeople already loaded by loadInvestmentsStocksPage()
    var allNs       = ['self'].concat(_investPeople.map(function(p) { return p.id; }));
    var personNames = { self: 'Me' };
    _investPeople.forEach(function(p) { personNames[p.id] = p.name; });

    var allAccounts = [];
    for (var i = 0; i < allNs.length; i++) {
        var ns   = allNs[i];
        var snap = await userCol('investments').doc(ns).collection('accounts').get();
        snap.forEach(function(doc) {
            var data = doc.data();
            if (!data.archived) {
                allAccounts.push(Object.assign({ id: doc.id, _ns: ns, _ownerName: personNames[ns] || ns }, data));
            }
        });
    }

    for (var j = 0; j < allAccounts.length; j++) {
        var acct     = allAccounts[j];
        var holdSnap = await _investHoldingCol(acct._ns, acct.id).get();
        acct._holdings = [];
        holdSnap.forEach(function(hdoc) {
            acct._holdings.push(Object.assign({ id: hdoc.id }, hdoc.data()));
        });
        acct._totals = _investComputeAccountTotals(acct._holdings, acct.cashBalance, acct.pendingActivity);
    }

    return allAccounts;
}

// ---------- Ticker Aggregation ----------

function _investAggregateByTicker(accounts) {
    var tickerMap      = {};
    var totalInvested  = 0;
    var overallNetWorth = 0;

    accounts.forEach(function(acct) {
        var isCash = _INVEST_CASH_TYPES.indexOf(acct.accountType || '') >= 0;
        if (!isCash) totalInvested += (acct._totals || {}).holdings || 0;
        overallNetWorth += (acct._totals || {}).total || 0;

        var acctTotal = (acct._totals || {}).total || 0;

        (acct._holdings || []).forEach(function(h) {
            if (!h.ticker) return;
            var shares    = h.shares    != null ? h.shares    : 0;
            if (!shares) return;  // zero or missing qty — would corrupt weighted-avg cost
            var price     = h.lastPrice != null ? h.lastPrice : null;
            var costBasis = h.costBasis != null ? h.costBasis : null;
            var value     = (price != null && shares) ? shares * price : 0;

            if (!tickerMap[h.ticker]) {
                tickerMap[h.ticker] = {
                    ticker:               h.ticker,
                    companyName:          h.companyName || '',
                    lastPrice:            price,
                    lastPriceDate:        h.lastPriceDate || null,
                    totalShares:          0,
                    totalValue:           0,
                    totalCostBasisAmount: 0,   // sum of (shares × costBasis) for weighted avg
                    hasCostBasis:         true, // false if any holding is missing costBasis
                    accounts:             []
                };
            }
            var entry = tickerMap[h.ticker];
            entry.totalShares += shares;
            entry.totalValue  += value;
            if (price != null) entry.lastPrice = price;
            if (costBasis != null) {
                entry.totalCostBasisAmount += shares * costBasis;
            } else {
                entry.hasCostBasis = false;
            }

            entry.accounts.push({
                id:           acct.id,
                ns:           acct._ns,
                nickname:     acct.nickname || '(untitled)',
                ownerName:    acct._ownerName || 'Me',
                shares:       h.shares,
                costBasis:    costBasis,
                value:        value,
                accountTotal: acctTotal
            });
        });
    });

    var tickers = Object.keys(tickerMap).map(function(k) {
        var t = tickerMap[k];
        // Weighted avg cost per share across all accounts holding this ticker
        t.weightedAvgCost = (t.hasCostBasis && t.totalShares > 0)
            ? t.totalCostBasisAmount / t.totalShares
            : null;
        return t;
    });

    return { tickers: tickers, totalInvested: totalInvested, overallNetWorth: overallNetWorth };
}

// ============================================================
// SOCIAL SECURITY BENEFITS  (#investments/ss-benefits)
// Per-person annual snapshots of SSA.gov projected benefits.
// Each snapshot: asOfDate + array of {age, monthly} entries.
// Only the most recent snapshot per person is used for planning.
// ============================================================

// ---------- SS Benefits Module State ----------

var _ssBenefitsPersonFilter = 'self';  // 'self' or contact ID
var _ssBenefitsPeople       = [];      // [{id, name}] — same enrolled list as accounts
var _ssBenefitsSnapshots    = [];      // snapshot docs for current person, ordered newest-first

// SS claiming ages offered in the dropdown (SSA's full range)
var _SS_AGES = [62, 63, 64, 65, 66, 67, 68, 69, 70];

// ---------- Firestore Helper ----------

function _ssBenefitsCol() {
    return userCol('ssBenefits');
}

// ---------- People Loading ----------

async function _ssBenefitsLoadPeople() {
    var settingsDoc = await userCol('settings').doc('investments').get();
    _ssBenefitsPeople = [];
    if (settingsDoc.exists) {
        var enrolledIds = (settingsDoc.data().enrolledPersonIds || []).filter(Boolean);
        var fetches = enrolledIds.map(function(pid) {
            return userCol('people').doc(pid).get().then(function(d) {
                return d.exists ? { id: pid, name: d.data().name || pid } : null;
            });
        });
        var results = await Promise.all(fetches);
        _ssBenefitsPeople = results.filter(Boolean).sort(function(a, b) {
            return a.name.localeCompare(b.name);
        });
    }
}

// ---------- Snapshots Loading ----------

async function _ssBenefitsLoadSnapshots() {
    _ssBenefitsSnapshots = [];
    // Load all docs then filter/sort client-side — avoids composite index requirement.
    // Volume is negligible (a handful of snapshots total).
    var snap = await _ssBenefitsCol().get();
    var docs = [];
    snap.forEach(function(doc) {
        var data = doc.data();
        if (data.personId === _ssBenefitsPersonFilter) {
            docs.push(Object.assign({ id: doc.id }, data));
        }
    });
    docs.sort(function(a, b) {
        if ((a.asOfDate || '') > (b.asOfDate || '')) return -1;
        if ((a.asOfDate || '') < (b.asOfDate || '')) return 1;
        return 0;
    });
    _ssBenefitsSnapshots = docs;
}

// ---------- SS Benefits List Page ----------

async function loadInvestmentsSsBenefitsPage() {
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#investments">Financial</a><span class="separator">&rsaquo;</span><span>SS Benefits</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';

    var page = document.getElementById('page-investments-ss-benefits');
    if (page) page.innerHTML = '<p class="muted-text">Loading…</p>';

    try {
        await _ssBenefitsLoadPeople();
        await _ssBenefitsLoadSnapshots();
        _ssBenefitsRenderListPage();
    } catch (err) {
        console.error('SS Benefits load error:', err);
        if (page) page.innerHTML = '<p class="empty-state">Error loading SS Benefits: ' + escapeHtml(String(err)) + '</p>';
    }
}

function _ssBenefitsRenderListPage() {
    var page = document.getElementById('page-investments-ss-benefits');
    if (!page) return;

    // Person switcher options
    var personOpts = '<option value="self"' + (_ssBenefitsPersonFilter === 'self' ? ' selected' : '') + '>Me</option>';
    _ssBenefitsPeople.forEach(function(p) {
        personOpts += '<option value="' + escapeHtml(p.id) + '"' +
            (_ssBenefitsPersonFilter === p.id ? ' selected' : '') + '>' +
            escapeHtml(p.name) + '</option>';
    });

    var personLabel = _ssBenefitsPersonFilter === 'self'
        ? 'Me'
        : ((_ssBenefitsPeople.find(function(p) { return p.id === _ssBenefitsPersonFilter; }) || {}).name || 'Person');

    // Build snapshot list HTML
    var listHtml = '';
    if (_ssBenefitsSnapshots.length === 0) {
        listHtml = '<p class="empty-state">No snapshots recorded for ' + escapeHtml(personLabel) + ' yet.<br>' +
            'Log into SSA.gov and tap <strong>+ Create Snapshot</strong> to record projected benefits.</p>';
    } else {
        _ssBenefitsSnapshots.forEach(function(snap, idx) {
            var isMostRecent = idx === 0;
            var entries      = snap.entries || [];
            var ages         = entries.map(function(e) { return e.age; }).sort(function(a, b) { return a - b; });
            var ageRange     = ages.length === 0 ? 'No ages'
                : ages.length === 1 ? 'Age ' + ages[0]
                : 'Ages ' + ages[0] + '–' + ages[ages.length - 1];

            var dateStr = snap.asOfDate
                ? new Date(snap.asOfDate + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                : '(no date)';

            var rowsHtml = '';
            entries.slice().sort(function(a, b) { return a.age - b.age; }).forEach(function(e) {
                rowsHtml +=
                    '<tr>' +
                        '<td>Age ' + escapeHtml(String(e.age)) + '</td>' +
                        '<td>' + _investFmtCurrency(e.monthly || 0) + ' / mo</td>' +
                    '</tr>';
            });

            listHtml +=
                '<div class="ss-snapshot-card' + (isMostRecent ? ' ss-snapshot-card--current' : '') + '">' +
                    '<div class="ss-snapshot-header">' +
                        '<div class="ss-snapshot-meta">' +
                            '<span class="ss-snapshot-date">' + escapeHtml(dateStr) + '</span>' +
                            (isMostRecent ? '<span class="ss-snapshot-badge">Most Recent</span>' : '<span class="ss-snapshot-historical">Historical — not used in planning</span>') +
                        '</div>' +
                        '<div class="ss-snapshot-summary">' + escapeHtml(ageRange) + ' &mdash; ' + entries.length + ' age' + (entries.length === 1 ? '' : 's') + ' recorded</div>' +
                    '</div>' +
                    (rowsHtml ? '<table class="ss-snapshot-table"><tbody>' + rowsHtml + '</tbody></table>' : '') +
                    '<div class="ss-snapshot-actions">' +
                        (isMostRecent
                            ? '<a class="btn btn-secondary btn-small" href="#investments/ss-benefits/edit/' + encodeURIComponent(snap.id) + '">Update Current</a>'
                            : '<a class="btn btn-secondary btn-small" href="#investments/ss-benefits/edit/' + encodeURIComponent(snap.id) + '">Edit</a>') +
                        '<button class="btn btn-danger btn-small" onclick="_ssBenefitsDeleteSnapshot(\'' + escapeHtml(snap.id) + '\',' + isMostRecent + ')">Delete</button>' +
                    '</div>' +
                '</div>';
        });
    }

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>📋 SS Benefits</h2>' +
            '<div class="page-header-actions">' +
                '<a class="btn btn-primary" href="#investments/ss-benefits/new">+ Create Snapshot</a>' +
            '</div>' +
        '</div>' +
        '<div class="invest-person-bar">' +
            '<label for="ssBenefitsPersonSelect">Person:</label>' +
            '<select id="ssBenefitsPersonSelect" onchange="_ssBenefitsSwitchPerson(this.value)">' +
                personOpts +
            '</select>' +
        '</div>' +
        '<div id="ssBenefitsListBody">' + listHtml + '</div>';
}

function _ssBenefitsSwitchPerson(personId) {
    _ssBenefitsPersonFilter = personId;
    _ssBenefitsLoadSnapshots().then(_ssBenefitsRenderListPage);
}

async function _ssBenefitsDeleteSnapshot(snapshotId, isMostRecent) {
    var msg = isMostRecent
        ? 'Delete this snapshot? It is the most recent one — the previous snapshot (if any) will become the one used for planning.'
        : 'Delete this historical snapshot?';
    if (!confirm(msg)) return;
    await _ssBenefitsCol().doc(snapshotId).delete();
    await _ssBenefitsLoadSnapshots();
    _ssBenefitsRenderListPage();
}

// ---------- SS Benefits Form Page ----------

var _ssBenefitsFormEntries = [];  // [{age, monthly}] being edited in the form
var _ssBenefitsFormEditId  = null; // null = create new, string = editing existing snapshot ID
var _ssBenefitsFormIsNew   = true; // true = "Create New Snapshot", false = "Update Current"

async function loadInvestmentsSsFormPage(snapshotId) {
    _ssBenefitsFormEditId = snapshotId || null;
    _ssBenefitsFormIsNew  = !snapshotId;

    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#investments">Financial</a><span class="separator">&rsaquo;</span>' +
        '<a href="#investments/ss-benefits">SS Benefits</a><span class="separator">&rsaquo;</span>' +
        '<span>' + (_ssBenefitsFormIsNew ? 'Create Snapshot' : 'Edit Snapshot') + '</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';

    await _ssBenefitsLoadPeople();

    // Determine starting entries:
    // - Edit mode: load the snapshot being edited
    // - Create mode: clone the most recent snapshot (ages + amounts) if one exists; else blank
    var asOfDate = _investTodayIso();

    if (snapshotId) {
        // Editing an existing snapshot
        var doc = await _ssBenefitsCol().doc(snapshotId).get();
        if (doc.exists) {
            var data = doc.data();
            asOfDate = data.asOfDate || asOfDate;
            _ssBenefitsFormEntries = (data.entries || []).slice().sort(function(a, b) { return a.age - b.age; });
            _ssBenefitsPersonFilter = data.personId || 'self';
        } else {
            _ssBenefitsFormEntries = [];
        }
    } else {
        // Creating new — pre-fill from most recent snapshot for current person
        await _ssBenefitsLoadSnapshots();
        if (_ssBenefitsSnapshots.length > 0) {
            _ssBenefitsFormEntries = (_ssBenefitsSnapshots[0].entries || [])
                .slice()
                .sort(function(a, b) { return a.age - b.age; })
                .map(function(e) { return { age: e.age, monthly: e.monthly }; });
        } else {
            _ssBenefitsFormEntries = [];
        }
    }

    _ssBenefitsRenderFormPage(asOfDate);
}

function _ssBenefitsRenderFormPage(asOfDate) {
    var page = document.getElementById('page-investments-ss-form');
    if (!page) return;

    // Person switcher (only shown when creating new — editing locks to the snapshot's person)
    var personPickerHtml = '';
    if (_ssBenefitsFormIsNew) {
        var personOpts = '<option value="self"' + (_ssBenefitsPersonFilter === 'self' ? ' selected' : '') + '>Me</option>';
        _ssBenefitsPeople.forEach(function(p) {
            personOpts += '<option value="' + escapeHtml(p.id) + '"' +
                (_ssBenefitsPersonFilter === p.id ? ' selected' : '') + '>' +
                escapeHtml(p.name) + '</option>';
        });
        personPickerHtml =
            '<div class="form-group">' +
                '<label>Person</label>' +
                '<select id="ssFormPerson" onchange="_ssBenefitsPersonFilter=this.value">' + personOpts + '</select>' +
            '</div>';
    }

    // Age rows
    var rowsHtml = _ssBenefitsRenderEntryRows();

    // Available ages for the "+ Add Age" dropdown (exclude already-added ages)
    var usedAges = _ssBenefitsFormEntries.map(function(e) { return e.age; });
    var availAges = _SS_AGES.filter(function(a) { return usedAges.indexOf(a) < 0; });
    var addAgeOpts = '<option value="">— Select age —</option>';
    availAges.forEach(function(a) {
        addAgeOpts += '<option value="' + a + '">' + a + '</option>';
    });

    var title = _ssBenefitsFormIsNew ? 'Create New Snapshot' : 'Update Snapshot';

    page.innerHTML =
        '<div class="page-header"><h2>' + escapeHtml(title) + '</h2></div>' +
        '<div class="form-body">' +
            personPickerHtml +
            '<div class="form-group">' +
                '<label for="ssFormDate">As-of Date</label>' +
                '<input type="date" id="ssFormDate" value="' + escapeHtml(asOfDate) + '">' +
                '<div class="form-hint">Date you pulled these numbers from SSA.gov</div>' +
            '</div>' +
            '<div class="form-section-label">Monthly Benefit by Age</div>' +
            '<div id="ssFormRows">' + rowsHtml + '</div>' +
            '<div class="ss-add-age-row">' +
                '<select id="ssAddAgeSelect">' + addAgeOpts + '</select>' +
                '<button class="btn btn-secondary btn-small" onclick="_ssBenefitsAddAgeRow()">+ Add Age</button>' +
            '</div>' +
            '<div class="form-actions">' +
                '<button class="btn btn-primary" onclick="_ssBenefitsSaveSnapshot()">Save</button>' +
                '<a class="btn btn-secondary" href="#investments/ss-benefits">Cancel</a>' +
            '</div>' +
        '</div>';
}

function _ssBenefitsRenderEntryRows() {
    if (_ssBenefitsFormEntries.length === 0) {
        return '<p class="muted-text">No ages added yet. Use "+ Add Age" below to add claiming ages.</p>';
    }
    var html = '<div class="ss-entry-rows">';
    _ssBenefitsFormEntries.forEach(function(entry, idx) {
        html +=
            '<div class="ss-entry-row" data-idx="' + idx + '">' +
                '<span class="ss-entry-age">Age ' + escapeHtml(String(entry.age)) + '</span>' +
                '<div class="ss-entry-amount">' +
                    '<span class="ss-entry-dollar">$</span>' +
                    '<input type="number" class="ss-entry-input" min="0" step="1" ' +
                        'value="' + escapeHtml(String(entry.monthly || '')) + '" ' +
                        'placeholder="0" ' +
                        'oninput="_ssBenefitsUpdateEntry(' + idx + ', this.value)">' +
                    '<span class="ss-entry-label">/ mo</span>' +
                '</div>' +
                '<button class="ss-entry-delete" onclick="_ssBenefitsRemoveEntry(' + idx + ')" title="Remove">✕</button>' +
            '</div>';
    });
    html += '</div>';
    return html;
}

function _ssBenefitsUpdateEntry(idx, val) {
    if (_ssBenefitsFormEntries[idx]) {
        _ssBenefitsFormEntries[idx].monthly = parseFloat(val) || 0;
    }
}

function _ssBenefitsAddAgeRow() {
    var sel = document.getElementById('ssAddAgeSelect');
    if (!sel || !sel.value) return;
    var age = parseInt(sel.value, 10);
    if (isNaN(age)) return;

    _ssBenefitsFormEntries.push({ age: age, monthly: 0 });
    _ssBenefitsFormEntries.sort(function(a, b) { return a.age - b.age; });

    // Re-render rows and the age dropdown
    document.getElementById('ssFormRows').innerHTML = _ssBenefitsRenderEntryRows();
    var usedAges  = _ssBenefitsFormEntries.map(function(e) { return e.age; });
    var availAges = _SS_AGES.filter(function(a) { return usedAges.indexOf(a) < 0; });
    var opts = '<option value="">— Select age —</option>';
    availAges.forEach(function(a) { opts += '<option value="' + a + '">' + a + '</option>'; });
    sel.innerHTML = opts;
    sel.value = '';
}

function _ssBenefitsRemoveEntry(idx) {
    var removedAge = _ssBenefitsFormEntries[idx] ? _ssBenefitsFormEntries[idx].age : null;
    _ssBenefitsFormEntries.splice(idx, 1);
    document.getElementById('ssFormRows').innerHTML = _ssBenefitsRenderEntryRows();

    // Add the removed age back to the "Add Age" dropdown
    if (removedAge !== null) {
        var sel = document.getElementById('ssAddAgeSelect');
        if (sel) {
            var opt = document.createElement('option');
            opt.value       = removedAge;
            opt.textContent = String(removedAge);
            // Insert in numeric order
            var inserted = false;
            for (var i = 1; i < sel.options.length; i++) {
                if (parseInt(sel.options[i].value, 10) > removedAge) {
                    sel.insertBefore(opt, sel.options[i]);
                    inserted = true;
                    break;
                }
            }
            if (!inserted) sel.appendChild(opt);
        }
    }
}

async function _ssBenefitsSaveSnapshot() {
    var dateEl = document.getElementById('ssFormDate');
    var asOfDate = dateEl ? dateEl.value.trim() : '';
    if (!asOfDate) {
        alert('Please enter an as-of date.');
        return;
    }
    if (_ssBenefitsFormEntries.length === 0) {
        alert('Please add at least one age/amount row before saving.');
        return;
    }

    // Read latest values from DOM inputs (in case oninput didn't fire for all)
    var rows = document.querySelectorAll('.ss-entry-row');
    rows.forEach(function(row) {
        var idx   = parseInt(row.dataset.idx, 10);
        var input = row.querySelector('.ss-entry-input');
        if (!isNaN(idx) && _ssBenefitsFormEntries[idx] !== undefined && input) {
            _ssBenefitsFormEntries[idx].monthly = parseFloat(input.value) || 0;
        }
    });

    var personId = _ssBenefitsFormIsNew
        ? (_ssBenefitsPersonFilter || 'self')
        : ((_ssBenefitsSnapshots.find(function(s) { return s.id === _ssBenefitsFormEditId; }) || {}).personId || _ssBenefitsPersonFilter);

    var payload = {
        personId:  personId,
        asOfDate:  asOfDate,
        entries:   _ssBenefitsFormEntries.map(function(e) { return { age: e.age, monthly: e.monthly }; }),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (_ssBenefitsFormEditId) {
        await _ssBenefitsCol().doc(_ssBenefitsFormEditId).update(payload);
    } else {
        payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await _ssBenefitsCol().add(payload);
    }

    window.location.hash = '#investments/ss-benefits';
}

// Helper: today as YYYY-MM-DD
function _investTodayIso() {
    var d = new Date();
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
}
