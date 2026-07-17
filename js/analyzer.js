'use strict';

// ---------------------------------------------------------------------------
// Stock Analyzer — short-term trade candidate finder (Life → Financial)
// ---------------------------------------------------------------------------
// Plan document: StockAnalyzerPlan.md
// Built in stages. Stage 1 = scaffolding & navigation (this file's initial
// version). Later stages add: universe manager, price cache (IndexedDB),
// detector engine, Backtest Lab, live scanner, dossiers, trade tickets.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shared breadcrumb helper
// ---------------------------------------------------------------------------

function _analyzerBreadcrumb(trail) {
    // trail = array of {label, href?} — last item is the current page (no link)
    var html = '<a href="#life">Life</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<a href="#investments">Financial</a>';
    trail.forEach(function(t) {
        html += '<span class="separator">&rsaquo;</span>';
        html += t.href ? '<a href="' + t.href + '">' + escapeHtml(t.label) + '</a>'
                       : '<span>' + escapeHtml(t.label) + '</span>';
    });
    document.getElementById('breadcrumbBar').innerHTML = html;
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';
}

// ---------------------------------------------------------------------------
// Hub page (#analyzer) — strategy hub (TradingStrategiesPlan.md Phase 7)
// ---------------------------------------------------------------------------
// One card per trading strategy. Dip & Drift is the original Analyzer
// (Scan/Backtest/Scoreboard/Trades — detectors A–D), now a sub-hub. The
// other strategies are built one at a time; unbuilt ones show as previews.
// ---------------------------------------------------------------------------

function _anaStrategyCard(href, icon, title, desc) {
    if (!href) {
        return '<div class="invest-hub-card ana-strategy-soon">' +
            '<span class="invest-hub-icon">' + icon + '</span>' +
            '<div class="invest-hub-text">' +
                '<div class="invest-hub-title">' + title + ' <span class="ana-soon-badge">coming soon</span></div>' +
                '<div class="invest-hub-desc">' + desc + '</div>' +
            '</div>' +
        '</div>';
    }
    return '<a class="invest-hub-card" href="' + href + '">' +
        '<span class="invest-hub-icon">' + icon + '</span>' +
        '<div class="invest-hub-text">' +
            '<div class="invest-hub-title">' + title + '</div>' +
            '<div class="invest-hub-desc">' + desc + '</div>' +
        '</div>' +
        '<span class="invest-hub-arrow">›</span>' +
    '</a>';
}

function loadAnalyzerPage() {
    _analyzerBreadcrumb([{ label: 'Stock Analyzer' }]);

    var page = document.getElementById('page-analyzer');
    if (!page) return;

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>🎯 Stock Analyzer</h2>' +
        '</div>' +
        '<p class="muted-text" style="max-width:560px">' +
            'Six trading strategies, each with its own tool. Every tool surfaces signals and ' +
            'evidence — the trade decision is always yours. Full write-ups in TradingStrategiesPlan.md.' +
        '</p>' +
        '<div class="invest-hub">' +
            _anaStrategyCard('#analyzer/dipdrift', '📉', 'Dip &amp; Drift',
                'Short-term setups — overreaction dips, post-earnings drift, revision momentum, coiled springs') +
            _anaStrategyCard('#analyzer/dualmomentum', '🌍', 'Dual Momentum',
                'Monthly rotation between US stocks, international stocks, and cash — one check, one verdict') +
            _anaStrategyCard(null, '🚀', 'Stock Momentum',
                'Own the top 20–30 stocks by 12-month momentum, re-ranked monthly') +
            _anaStrategyCard(null, '💎', 'Quality-Value',
                'Good businesses at cheap prices — annual Magic-Formula screen with AI value-trap checks') +
            _anaStrategyCard(null, '📈', 'Earnings Drift (PEAD)',
                'Ride the 30–60 day drift after real earnings surprises — AI reads the call transcript') +
            _anaStrategyCard(null, '📰', 'News Sentiment',
                'Morning AI sweep of watchlist news — scored, logged, and graded before it is trusted') +
        '</div>';
}

// ---------------------------------------------------------------------------
// Dip & Drift sub-hub (#analyzer/dipdrift) — the original Analyzer screens
// ---------------------------------------------------------------------------

function loadAnalyzerDipDriftPage() {
    _analyzerBreadcrumb([{ label: 'Stock Analyzer', href: '#analyzer' }, { label: 'Dip & Drift' }]);

    var page = document.getElementById('page-analyzer-dipdrift');
    if (!page) return;

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>📉 Dip &amp; Drift</h2>' +
        '</div>' +
        '<p class="muted-text" style="max-width:560px">' +
            'Finds short-term trade setups — quality companies knocked down by emotion, ' +
            'post-earnings drift, and more. The tool assembles the evidence; the decision is yours.' +
        '</p>' +
        '<div class="invest-hub">' +
            '<a class="invest-hub-card" href="#analyzer/backtest">' +
                '<span class="invest-hub-icon">🧪</span>' +
                '<div class="invest-hub-text">' +
                    '<div class="invest-hub-title">Backtest Lab</div>' +
                    '<div class="invest-hub-desc">Walk-forward simulation — how would the detectors have done historically?</div>' +
                '</div>' +
                '<span class="invest-hub-arrow">›</span>' +
            '</a>' +
            '<a class="invest-hub-card" href="#analyzer/scan">' +
                '<span class="invest-hub-icon">📡</span>' +
                '<div class="invest-hub-text">' +
                    '<div class="invest-hub-title">Scan</div>' +
                    '<div class="invest-hub-desc">Run the detectors on the universe and review candidate shortlists</div>' +
                '</div>' +
                '<span class="invest-hub-arrow">›</span>' +
            '</a>' +
            '<a class="invest-hub-card" href="#analyzer/trades">' +
                '<span class="invest-hub-icon">🎫</span>' +
                '<div class="invest-hub-text">' +
                    '<div class="invest-hub-title">Trades</div>' +
                    '<div class="invest-hub-desc">Open positions tracked against your exits, plus your closed-trade record</div>' +
                '</div>' +
                '<span class="invest-hub-arrow">›</span>' +
            '</a>' +
            '<a class="invest-hub-card" href="#analyzer/scoreboard">' +
                '<span class="invest-hub-icon">🏁</span>' +
                '<div class="invest-hub-text">' +
                    '<div class="invest-hub-title">Scoreboard</div>' +
                    '<div class="invest-hub-desc">Past scans graded against what actually happened — and how your judgment did</div>' +
                '</div>' +
                '<span class="invest-hub-arrow">›</span>' +
            '</a>' +
            '<a class="invest-hub-card" href="#analyzer/universe">' +
                '<span class="invest-hub-icon">🌐</span>' +
                '<div class="invest-hub-text">' +
                    '<div class="invest-hub-title">Universe</div>' +
                    '<div class="invest-hub-desc">The tickers being watched — S&amp;P 500, your holdings, and your watchlist</div>' +
                '</div>' +
                '<span class="invest-hub-arrow">›</span>' +
            '</a>' +
        '</div>' +
        '<h3 class="ana-section-title">📊 Price data</h3>' +
        '<div id="anaPriceSection"><p class="muted-text">Loading cache status…</p></div>';

    _anaRenderPriceSection();
}

// ---------------------------------------------------------------------------
// Price data section (Stage 3) — cache status + update job with progress bar
// ---------------------------------------------------------------------------

var _anaUpdateCancelled = false;
var _anaUpdateRunning   = false;

async function _anaRenderPriceSection() {
    var el = document.getElementById('anaPriceSection');
    if (!el) return;

    var stats;
    try {
        stats = await _anaCacheStats();
    } catch (e) {
        el.innerHTML = '<p class="muted-text">Could not read the price cache: ' + escapeHtml(e.message) + '</p>';
        return;
    }

    var note;
    if (stats.count === 0) {
        note = 'No price data cached on this device yet. The first full update fetches 5 years of daily history ' +
               'for every watched ticker — it takes several minutes and must stay in an open tab.';
    } else {
        var when = stats.newestUpdate ? new Date(stats.newestUpdate).toLocaleString() : '—';
        note = stats.count + ' tickers cached on this device (' + stats.totalCandles.toLocaleString() + ' daily candles) · ' +
               stats.freshToday + ' updated today · last update ' + when + '.';
    }

    // FMP fast path indicator (Stage 3.1): direct parallel fetches when a key is set.
    var fmpKey = '';
    try { fmpKey = (typeof anaFmpGetKey === 'function') ? await anaFmpGetKey() : ''; } catch (e) {}
    if (fmpKey) note += ' ⚡ FMP fast path active (updates run in parallel).';

    // Provider health line (Stage 3.5): config presence only, no API calls.
    var finnhubKey = '', workerUrl = '';
    try { finnhubKey = (typeof _investGetFinnhubKey === 'function') ? (await _investGetFinnhubKey()) || '' : ''; } catch (e) {}
    try { workerUrl  = (typeof _investGetYahooWorkerUrl === 'function') ? (await _investGetYahooWorkerUrl()) || '' : ''; } catch (e) {}
    function _prov(on, label) { return '<span title="' + (on ? 'active' : 'not configured') + '">' + (on ? '✓' : '—') + ' ' + label + '</span>'; }
    var health = '<p class="muted-text" style="max-width:560px;font-size:0.82rem">Providers: ' +
        _prov(!!fmpKey, 'FMP') + ' · ' + _prov(!!finnhubKey, 'Finnhub') + ' · ' +
        _prov(!!workerUrl, 'Yahoo worker') + ' · ' + _prov(true, 'public proxies') + '</p>';

    el.innerHTML =
        '<p class="muted-text" style="max-width:560px">' + note + '</p>' +
        health +
        '<div class="ana-add-row">' +
            '<button class="btn-primary" id="anaUpdateBtn" onclick="_anaRunPriceUpdate()">📡 Update price data</button>' +
            (fmpKey ? '<button class="ana-sp-btn" id="anaSnapBtn" onclick="_anaRunEstimateSnapshot()">📸 Snapshot estimates</button>' : '') +
        '</div>' +
        '<div id="anaUpdateProgress"></div>';
}

// Manually record a weekly estimate snapshot (also runs automatically once a
// week after a scan). Needs an FMP key. Feeds the Stage 3.2 divergence metric.
async function _anaRunEstimateSnapshot() {
    if (_anaUpdateRunning) return;
    var btn = document.getElementById('anaSnapBtn');
    var box = document.getElementById('anaUpdateProgress');
    if (btn) btn.disabled = true;
    try {
        await Promise.all([_anaLoadSp500(), _anaLoadUniverseCfg(), _anaLoadHoldingTickers()]);
        var tickers = _anaEffectiveUniverse();
        var res = await anaFmpSnapshotEstimates(tickers, function(done, total) {
            if (box) box.innerHTML = '<p class="muted-text">📸 Snapshotting analyst estimates… ' + done + ' / ' + total + '</p>';
        });
        if (box) box.innerHTML = '<p class="muted-text">✓ Estimate snapshot saved for week ' + escapeHtml(res.weekId) + ' (' + res.count + ' tickers' + (res.failures ? ', ' + res.failures + ' skipped' : '') + ').</p>';
    } catch (e) {
        if (box) box.innerHTML = '<p class="muted-text">✗ Snapshot failed: ' + escapeHtml(e.message) + '</p>';
    }
    if (btn) btn.disabled = false;
}

async function _anaRunPriceUpdate() {
    if (_anaUpdateRunning) return;
    _anaUpdateRunning   = true;
    _anaUpdateCancelled = false;

    var btn = document.getElementById('anaUpdateBtn');
    var box = document.getElementById('anaUpdateProgress');
    if (btn) btn.disabled = true;

    // Build the ticker list: effective universe + market tickers
    var tickers;
    try {
        await Promise.all([_anaLoadSp500(), _anaLoadUniverseCfg(), _anaLoadHoldingTickers()]);
        tickers = ANA_MARKET_TICKERS.concat(_anaEffectiveUniverse());
    } catch (e) {
        if (box) box.innerHTML = '<p class="muted-text">Could not build the ticker list: ' + escapeHtml(e.message) + '</p>';
        _anaUpdateRunning = false;
        if (btn) btn.disabled = false;
        return;
    }

    if (box) {
        box.innerHTML =
            '<div class="ana-progress-wrap">' +
                '<div class="ana-progress-bar"><div class="ana-progress-fill" id="anaProgFill"></div></div>' +
                '<div class="ana-progress-text" id="anaProgText">Starting…</div>' +
                '<button class="ana-sp-btn" onclick="_anaCancelUpdate()">Cancel</button>' +
            '</div>';
    }

    var result = await _anaUpdatePrices(tickers, {
        onProgress: function(done, total, ticker, status) {
            var fill = document.getElementById('anaProgFill');
            var text = document.getElementById('anaProgText');
            if (fill) fill.style.width = Math.round(done / total * 100) + '%';
            if (text) text.textContent = done + ' / ' + total + ' — ' + ticker + ' (' + status + ')';
        },
        shouldCancel: function() { return _anaUpdateCancelled; }
    });

    _anaUpdateRunning = false;

    var summary = '<p>' +
        (result.cancelled ? '⚠️ Cancelled. ' : '✓ Done. ') +
        result.updated + ' updated · ' + result.skipped + ' already fresh' +
        (result.failed.length ? ' · <strong>' + result.failed.length + ' failed</strong>' : '') +
        '</p>';
    if (result.failed.length) {
        summary += '<ul class="muted-text" style="font-size:0.82rem">';
        result.failed.slice(0, 20).forEach(function(f) {
            summary += '<li>' + escapeHtml(f.ticker) + ' — ' + escapeHtml(f.error) + '</li>';
        });
        if (result.failed.length > 20) summary += '<li>… and ' + (result.failed.length - 20) + ' more</li>';
        summary += '</ul>';
    }

    // Re-render the stats note first, then show the run summary beneath it
    // (the progress box lives inside the section, so order matters here)
    await _anaRenderPriceSection();
    var box2 = document.getElementById('anaUpdateProgress');
    if (box2) box2.innerHTML = summary;
}

function _anaCancelUpdate() {
    _anaUpdateCancelled = true;
}

// ---------------------------------------------------------------------------
// Placeholder sub-pages — replaced as each build stage lands
// ---------------------------------------------------------------------------

function _analyzerRenderPlaceholder(pageId, title, icon, desc, stageNote) {
    var page = document.getElementById(pageId);
    if (!page) return;
    page.innerHTML =
        '<div class="page-header">' +
            '<h2>' + icon + ' ' + escapeHtml(title) + '</h2>' +
        '</div>' +
        '<p class="muted-text" style="max-width:560px">' + escapeHtml(desc) + '</p>' +
        '<div class="invest-hub-card invest-hub-card--soon" style="max-width:560px">' +
            '<span class="invest-hub-icon">🚧</span>' +
            '<div class="invest-hub-text">' +
                '<div class="invest-hub-title">Coming soon <span class="invest-hub-badge">' + escapeHtml(stageNote) + '</span></div>' +
                '<div class="invest-hub-desc">This page is scaffolded but not yet built.</div>' +
            '</div>' +
        '</div>';
}

// ---------------------------------------------------------------------------
// Universe manager (Stage 2)
// ---------------------------------------------------------------------------
// The universe = S&P 500 constituents (static data/sp500.json, refreshed
// occasionally) ∪ tickers from investment holdings ∪ user watchlist,
// minus any user-excluded tickers.
// Firestore: userCol('analyzerConfig').doc('universe') = {watchlist[], excluded[]}
// ---------------------------------------------------------------------------

var _anaSp500       = null;   // parsed data/sp500.json — {asOf, count, companies:[{t,n,s}]}
var _anaUniverseCfg = null;   // {watchlist:[], excluded:[]}
var _anaHoldTickers = null;   // unique tickers found in investment holdings
var _anaSpFilter    = '';     // S&P search box value

async function _anaLoadSp500() {
    if (_anaSp500) return _anaSp500;
    var res = await fetch('data/sp500.json');
    if (!res.ok) throw new Error('Could not load S&P 500 list (HTTP ' + res.status + ')');
    _anaSp500 = await res.json();
    return _anaSp500;
}

async function _anaLoadUniverseCfg() {
    var doc = await userCol('analyzerConfig').doc('universe').get();
    _anaUniverseCfg = doc.exists ? doc.data() : {};
    if (!Array.isArray(_anaUniverseCfg.watchlist)) _anaUniverseCfg.watchlist = [];
    if (!Array.isArray(_anaUniverseCfg.excluded))  _anaUniverseCfg.excluded  = [];
    // Discover mode (Stage 3.4) defaults
    if (typeof _anaUniverseCfg.discoverEnabled !== 'boolean') _anaUniverseCfg.discoverEnabled = false;
    if (_anaUniverseCfg.discoverMinMarketCap == null) _anaUniverseCfg.discoverMinMarketCap = 2e9;
    if (_anaUniverseCfg.discoverMinVolume == null)    _anaUniverseCfg.discoverMinVolume    = 1e6;
    if (!Array.isArray(_anaUniverseCfg.discoverList)) _anaUniverseCfg.discoverList = [];
    // Refresh the screener list at most weekly (only when enabled + FMP key)
    try { await _anaRefreshDiscoverList(false); } catch (e) { console.log('[analyzer] discover refresh skipped: ' + e.message); }
    return _anaUniverseCfg;
}

async function _anaSaveUniverseCfg() {
    // Small fields only — the (large) discoverList is saved by the refresh job.
    await userCol('analyzerConfig').doc('universe').set({
        watchlist: _anaUniverseCfg.watchlist,
        excluded:  _anaUniverseCfg.excluded,
        discoverEnabled:      _anaUniverseCfg.discoverEnabled,
        discoverMinMarketCap: _anaUniverseCfg.discoverMinMarketCap,
        discoverMinVolume:    _anaUniverseCfg.discoverMinVolume,
        updatedAt: new Date().toISOString()
    }, { merge: true });
}

// Refresh the Discover screener list (cached weekly on the config doc). No-op
// unless Discover is on and an FMP key exists. `force` bypasses the 7-day cache.
async function _anaRefreshDiscoverList(force) {
    var cfg = _anaUniverseCfg;
    if (!cfg || !cfg.discoverEnabled) return;
    if (typeof anaFmpGetKey !== 'function' || !(await anaFmpGetKey())) return;
    var age = cfg.discoverFetchedAt ? (Date.now() - new Date(cfg.discoverFetchedAt).getTime()) : Infinity;
    var stale = force || age > 7 * 86400000 || !cfg.discoverList || cfg.discoverList.length === 0;
    if (!stale) return;
    var rows = await anaFmpScreener(cfg.discoverMinMarketCap, cfg.discoverMinVolume);
    cfg.discoverList      = rows.map(function(r) { return { t: r.symbol, n: r.companyName }; });
    cfg.discoverFetchedAt = new Date().toISOString();
    await userCol('analyzerConfig').doc('universe').set({
        discoverList: cfg.discoverList, discoverFetchedAt: cfg.discoverFetchedAt
    }, { merge: true });
}

async function _anaToggleDiscover(on) {
    _anaUniverseCfg.discoverEnabled = !!on;
    await _anaSaveUniverseCfg();
    if (on) { try { await _anaRefreshDiscoverList(false); } catch (e) { console.log('[analyzer] discover refresh failed: ' + e.message); } }
    _anaRenderUniverse();
}

async function _anaSaveDiscoverThresholds() {
    var capB = parseFloat((document.getElementById('anaDiscoverCap') || {}).value);
    var volM = parseFloat((document.getElementById('anaDiscoverVol') || {}).value);
    if (isFinite(capB) && capB > 0) _anaUniverseCfg.discoverMinMarketCap = capB * 1e9;
    if (isFinite(volM) && volM > 0) _anaUniverseCfg.discoverMinVolume    = volM * 1e6;
    await _anaSaveUniverseCfg();
    // New thresholds → force a re-fetch so the list matches
    if (_anaUniverseCfg.discoverEnabled) { try { await _anaRefreshDiscoverList(true); } catch (e) { console.log('[analyzer] discover refresh failed: ' + e.message); } }
    _anaRenderUniverse();
}

async function _anaRefreshDiscoverNow() {
    try { await _anaRefreshDiscoverList(true); } catch (e) { console.log('[analyzer] discover refresh failed: ' + e.message); }
    _anaRenderUniverse();
}

// Collects the unique set of tickers across all investment holdings.
// Mirrors the read path used by Stock Rollup in investments.js
// (settings/investments.enrolledPersonIds → investments/{ns}/accounts/{id}/holdings).
async function _anaLoadHoldingTickers() {
    var tickers = {};
    try {
        var settingsDoc = await userCol('settings').doc('investments').get();
        var allNs = ['self'];
        if (settingsDoc.exists) {
            allNs = allNs.concat((settingsDoc.data().enrolledPersonIds || []).filter(Boolean));
        }
        for (var i = 0; i < allNs.length; i++) {
            var acctSnap = await userCol('investments').doc(allNs[i]).collection('accounts').get();
            var accts = [];
            acctSnap.forEach(function(d) { if (!d.data().archived) accts.push(d.id); });
            for (var j = 0; j < accts.length; j++) {
                var holdSnap = await userCol('investments').doc(allNs[i])
                    .collection('accounts').doc(accts[j]).collection('holdings').get();
                holdSnap.forEach(function(h) {
                    var t = (h.data().ticker || '').trim().toUpperCase();
                    if (t) tickers[t] = true;
                });
            }
        }
    } catch (e) {
        console.error('[analyzer] holdings ticker load failed:', e);
    }
    _anaHoldTickers = Object.keys(tickers).sort();
    return _anaHoldTickers;
}

async function loadAnalyzerUniversePage() {
    _analyzerBreadcrumb([{ label: 'Stock Analyzer', href: '#analyzer' }, { label: 'Dip & Drift', href: '#analyzer/dipdrift' }, { label: 'Universe' }]);

    var page = document.getElementById('page-analyzer-universe');
    if (!page) return;
    page.innerHTML = '<p class="muted-text" style="padding:16px">Loading universe…</p>';

    try {
        await Promise.all([_anaLoadSp500(), _anaLoadUniverseCfg(), _anaLoadHoldingTickers()]);
    } catch (e) {
        page.innerHTML = '<p class="muted-text" style="padding:16px">Could not load universe: ' + escapeHtml(e.message) + '</p>';
        return;
    }
    _anaSpFilter = '';
    _anaRenderUniverse();
}

// Effective universe = (S&P ∪ holdings ∪ watchlist ∪ Discover) − excluded
function _anaEffectiveUniverse() {
    var set = {};
    _anaSp500.companies.forEach(function(c) { set[c.t] = true; });
    (_anaHoldTickers || []).forEach(function(t) { set[t] = true; });
    _anaUniverseCfg.watchlist.forEach(function(t) { set[t] = true; });
    if (_anaUniverseCfg.discoverEnabled && Array.isArray(_anaUniverseCfg.discoverList)) {
        _anaUniverseCfg.discoverList.forEach(function(c) { set[c.t] = true; });
    }
    _anaUniverseCfg.excluded.forEach(function(t) { delete set[t]; });
    return Object.keys(set);
}

function _anaSpName(ticker) {
    var hit = _anaSp500.companies.find(function(c) { return c.t === ticker; });
    return hit ? hit.n : null;
}

function _anaRenderUniverse() {
    var page = document.getElementById('page-analyzer-universe');
    if (!page) return;

    var cfg      = _anaUniverseCfg;
    var spSet    = {};
    _anaSp500.companies.forEach(function(c) { spSet[c.t] = true; });
    var holdExtra = (_anaHoldTickers || []).filter(function(t) { return !spSet[t]; });
    var effective = _anaEffectiveUniverse();

    var html =
        '<div class="page-header"><h2>🌐 Universe</h2></div>' +
        '<p class="muted-text" style="max-width:560px">The tickers the analyzer watches. ' +
            'S&amp;P 500 constituents and your holdings are included automatically; add anything else to the watchlist.</p>' +

        '<div class="ana-stat-row">' +
            '<div class="ana-stat"><div class="ana-stat-num">' + effective.length + '</div><div class="ana-stat-label">Watched</div></div>' +
            '<div class="ana-stat"><div class="ana-stat-num">' + _anaSp500.count + '</div><div class="ana-stat-label">S&amp;P 500</div></div>' +
            '<div class="ana-stat"><div class="ana-stat-num">' + (_anaHoldTickers || []).length + '</div><div class="ana-stat-label">Holdings</div></div>' +
            '<div class="ana-stat"><div class="ana-stat-num">' + cfg.watchlist.length + '</div><div class="ana-stat-label">Watchlist</div></div>' +
        '</div>';

    // ── Discover mode (Stage 3.4) ──
    var capB = (cfg.discoverMinMarketCap || 2e9) / 1e9;
    var volM = (cfg.discoverMinVolume || 1e6) / 1e6;
    html += '<h3 class="ana-section-title">🔭 Discover mode</h3>' +
        '<p class="muted-text" style="max-width:560px">Off by default, the analyzer only watches the S&amp;P 500, your holdings, and your watchlist. ' +
        'Turn Discover on to expand to the whole liquid market via a screener — the largest companies above your size and volume floor, ' +
        '<strong>hard-capped at the 2,000 biggest</strong>. A bigger universe means a longer first price update (~5–8 min for +1,000 names) and more on-device storage. Needs an FMP key.</p>' +
        '<div class="ana-add-row">' +
            '<label class="ab-check"><input type="checkbox" id="anaDiscoverToggle"' + (cfg.discoverEnabled ? ' checked' : '') +
                ' onchange="_anaToggleDiscover(this.checked)"> Enable Discover mode</label>' +
        '</div>' +
        '<div class="ab-form-row">' +
            '<label>Min market cap $ <input type="number" id="anaDiscoverCap" value="' + capB + '" min="0.1" step="0.5" style="width:80px"> B</label>' +
            '<label>Min avg volume <input type="number" id="anaDiscoverVol" value="' + volM + '" min="0.1" step="0.5" style="width:80px"> M</label>' +
            '<button class="ana-sp-btn" onclick="_anaSaveDiscoverThresholds()">Save thresholds</button>' +
        '</div>';
    if (cfg.discoverEnabled) {
        var when = cfg.discoverFetchedAt ? new Date(cfg.discoverFetchedAt).toLocaleDateString() : '—';
        html += '<p class="muted-text">Discover list: <strong>' + (cfg.discoverList || []).length + '</strong> names · fetched ' + escapeHtml(when) +
            ' · <button class="ana-sp-btn" onclick="_anaRefreshDiscoverNow()">🔄 Refresh list now</button></p>';
    }

    // ── Watchlist ──
    html += '<h3 class="ana-section-title">⭐ Watchlist</h3>' +
        '<div class="ana-add-row">' +
            '<input type="text" id="anaWatchlistInput" placeholder="Ticker (e.g. TGT)" maxlength="10" ' +
                'onkeydown="if(event.key===\'Enter\'){_anaAddWatchlist();}">' +
            '<button class="btn-primary" onclick="_anaAddWatchlist()">+ Add</button>' +
        '</div>';
    if (cfg.watchlist.length === 0) {
        html += '<p class="muted-text">No watchlist tickers yet. Add any ticker you want watched beyond the S&amp;P 500 and your holdings.</p>';
    } else {
        html += '<div class="ana-chip-wrap">';
        cfg.watchlist.forEach(function(t) {
            var name = _anaSpName(t);
            html += '<span class="ana-chip">' + escapeHtml(t) +
                (name ? '<span class="ana-chip-note">' + escapeHtml(name) + '</span>' : '') +
                '<button class="ana-chip-x" title="Remove from watchlist" onclick="_anaRemoveWatchlist(\'' + t + '\')">✕</button></span>';
        });
        html += '</div>';
    }

    // ── Holdings ──
    html += '<h3 class="ana-section-title">💼 From your holdings</h3>';
    if ((_anaHoldTickers || []).length === 0) {
        html += '<p class="muted-text">No tickers found in your investment accounts.</p>';
    } else {
        html += '<p class="muted-text">Auto-included from your investment accounts' +
            (holdExtra.length ? ' (' + holdExtra.length + ' not already in the S&amp;P 500)' : '') + ':</p>' +
            '<div class="ana-chip-wrap">';
        _anaHoldTickers.forEach(function(t) {
            var excluded = cfg.excluded.indexOf(t) !== -1;
            html += '<span class="ana-chip' + (excluded ? ' ana-chip--off' : '') + '">' + escapeHtml(t) +
                (spSet[t] ? '<span class="ana-chip-note">S&amp;P</span>' : '') +
                '<button class="ana-chip-x" title="' + (excluded ? 'Include' : 'Exclude') + '" ' +
                    'onclick="_anaToggleExclude(\'' + t + '\')">' + (excluded ? '↩' : '✕') + '</button></span>';
        });
        html += '</div>';
    }

    // ── S&P 500 ──
    html += '<h3 class="ana-section-title">🏛️ S&amp;P 500</h3>' +
        '<p class="muted-text">' + _anaSp500.count + ' companies · list as of ' + escapeHtml(_anaSp500.asOf) +
            ' · search to view or exclude individual companies:</p>' +
        '<div class="ana-add-row">' +
            '<input type="text" id="anaSpSearch" placeholder="Search ticker, company, or sector…" ' +
                'value="' + escapeHtml(_anaSpFilter) + '" oninput="_anaSpSearchChanged(this.value)">' +
        '</div>' +
        '<div id="anaSpResults">' + _anaSpResultsHtml() + '</div>';

    // ── Excluded ──
    var excludedList = cfg.excluded.slice().sort();
    if (excludedList.length > 0) {
        html += '<h3 class="ana-section-title">🚫 Excluded (' + excludedList.length + ')</h3>' +
            '<div class="ana-chip-wrap">';
        excludedList.forEach(function(t) {
            var name = _anaSpName(t);
            html += '<span class="ana-chip ana-chip--off">' + escapeHtml(t) +
                (name ? '<span class="ana-chip-note">' + escapeHtml(name) + '</span>' : '') +
                '<button class="ana-chip-x" title="Include again" onclick="_anaToggleExclude(\'' + t + '\')">↩</button></span>';
        });
        html += '</div>';
    }

    page.innerHTML = html;
}

function _anaSpResultsHtml() {
    var q = _anaSpFilter.trim().toLowerCase();
    if (!q) return '';
    var matches = _anaSp500.companies.filter(function(c) {
        return c.t.toLowerCase().indexOf(q) !== -1 ||
               c.n.toLowerCase().indexOf(q) !== -1 ||
               c.s.toLowerCase().indexOf(q) !== -1;
    });
    var shown = matches.slice(0, 50);
    var html = '<div class="ana-sp-list">';
    shown.forEach(function(c) {
        var excluded = _anaUniverseCfg.excluded.indexOf(c.t) !== -1;
        html += '<div class="ana-sp-row' + (excluded ? ' ana-sp-row--off' : '') + '">' +
            '<span class="ana-sp-ticker">' + escapeHtml(c.t) + '</span>' +
            '<span class="ana-sp-name">' + escapeHtml(c.n) + '</span>' +
            '<span class="ana-sp-sector">' + escapeHtml(c.s) + '</span>' +
            '<button class="ana-sp-btn" onclick="_anaToggleExclude(\'' + c.t + '\')">' +
                (excluded ? 'Include' : 'Exclude') + '</button>' +
        '</div>';
    });
    html += '</div>';
    if (matches.length > 50) {
        html += '<p class="muted-text">Showing 50 of ' + matches.length + ' matches — refine the search.</p>';
    }
    if (matches.length === 0) {
        html += '<p class="muted-text">No matches.</p>';
    }
    return html;
}

function _anaSpSearchChanged(value) {
    _anaSpFilter = value;
    var el = document.getElementById('anaSpResults');
    if (el) el.innerHTML = _anaSpResultsHtml();
}

async function _anaAddWatchlist() {
    var input = document.getElementById('anaWatchlistInput');
    if (!input) return;
    var t = input.value.trim().toUpperCase();
    if (!t) return;
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(t)) { alert('That does not look like a valid ticker symbol.'); return; }
    if (_anaUniverseCfg.watchlist.indexOf(t) !== -1) { alert(t + ' is already on the watchlist.'); return; }
    var inSp = !!_anaSpName(t);
    var inHold = (_anaHoldTickers || []).indexOf(t) !== -1;
    if ((inSp || inHold) && _anaUniverseCfg.excluded.indexOf(t) === -1) {
        alert(t + ' is already watched (' + (inSp ? 'S&P 500' : 'holdings') + ').');
        return;
    }
    // If it was excluded, adding to the watchlist un-excludes it
    _anaUniverseCfg.excluded = _anaUniverseCfg.excluded.filter(function(x) { return x !== t; });
    if (!inSp && !inHold) _anaUniverseCfg.watchlist.push(t);
    await _anaSaveUniverseCfg();
    _anaRenderUniverse();
}

async function _anaRemoveWatchlist(t) {
    _anaUniverseCfg.watchlist = _anaUniverseCfg.watchlist.filter(function(x) { return x !== t; });
    await _anaSaveUniverseCfg();
    _anaRenderUniverse();
}

async function _anaToggleExclude(t) {
    var idx = _anaUniverseCfg.excluded.indexOf(t);
    if (idx === -1) _anaUniverseCfg.excluded.push(t);
    else _anaUniverseCfg.excluded.splice(idx, 1);
    await _anaSaveUniverseCfg();
    _anaRenderUniverse();
}

