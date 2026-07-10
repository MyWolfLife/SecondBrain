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
// Hub page (#analyzer)
// ---------------------------------------------------------------------------

function loadAnalyzerPage() {
    _analyzerBreadcrumb([{ label: 'Stock Analyzer' }]);

    var page = document.getElementById('page-analyzer');
    if (!page) return;

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>🎯 Stock Analyzer</h2>' +
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

    el.innerHTML =
        '<p class="muted-text" style="max-width:560px">' + note + '</p>' +
        '<div class="ana-add-row">' +
            '<button class="btn-primary" id="anaUpdateBtn" onclick="_anaRunPriceUpdate()">📡 Update price data</button>' +
        '</div>' +
        '<div id="anaUpdateProgress"></div>';
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
    return _anaUniverseCfg;
}

async function _anaSaveUniverseCfg() {
    await userCol('analyzerConfig').doc('universe').set({
        watchlist: _anaUniverseCfg.watchlist,
        excluded:  _anaUniverseCfg.excluded,
        updatedAt: new Date().toISOString()
    }, { merge: true });
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
    _analyzerBreadcrumb([{ label: 'Stock Analyzer', href: '#analyzer' }, { label: 'Universe' }]);

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

// Effective universe = (S&P ∪ holdings ∪ watchlist) − excluded
function _anaEffectiveUniverse() {
    var set = {};
    _anaSp500.companies.forEach(function(c) { set[c.t] = true; });
    (_anaHoldTickers || []).forEach(function(t) { set[t] = true; });
    _anaUniverseCfg.watchlist.forEach(function(t) { set[t] = true; });
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

