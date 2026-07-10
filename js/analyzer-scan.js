'use strict';

// ---------------------------------------------------------------------------
// Stock Analyzer — live scan screen (Stage 6)
// ---------------------------------------------------------------------------
// The Friday-morning view: run the detectors across the universe as of the
// latest cached data, show the market regime, the funnel, and per-detector
// candidate shortlists with evidence chips. Each scan is snapshotted to
// Firestore (analyzerScans) for the Stage 9 tracking loop; dismissals are
// recorded on the scan doc (dismiss-with-memory).
//
// v1 uses the same defaults as the Backtest Lab: dip 12%/15d, gain target
// +10% within 60d, feasibility cutoff = 25% unconditional base rate.
// Strategy-profile configuration UI comes later.
// ---------------------------------------------------------------------------

var AS_DEFAULTS = {
    gainPct: 10, windowDays: 60,
    dipPct: 12, dipDays: 15,
    baseRateCutoff: 0.25,
    maxPerDetector: 15
};

var _asRunning   = false;
var _asLatestScan = null;   // {id, ...doc} of the scan being displayed

var AS_DET_LABELS = { dipA: '📉 Panic dip on quality', springD: '🌀 Compressed spring' };

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

async function loadAnalyzerScanPage() {
    _analyzerBreadcrumb([{ label: 'Stock Analyzer', href: '#analyzer' }, { label: 'Scan' }]);
    var page = document.getElementById('page-analyzer-scan');
    if (!page) return;

    page.innerHTML =
        '<div class="page-header"><h2>📡 Scan</h2></div>' +
        '<div class="ab-form-row">' +
            '<button class="btn-primary" id="asRunBtn" onclick="_asRunScan()">▶ Run scan</button>' +
            '<span class="ab-dim" id="asCacheNote"></span>' +
        '</div>' +
        '<div id="asProgress"></div>' +
        '<div id="asBody"><p class="muted-text">Loading…</p></div>';

    _asCacheNote();

    // Show the most recent scan on entry
    try {
        var snap = await userCol('analyzerScans').orderBy('createdAt', 'desc').limit(1).get();
        var latest = null;
        snap.forEach(function(d) { latest = Object.assign({ id: d.id }, d.data()); });
        _asLatestScan = latest;
        var body = document.getElementById('asBody');
        if (!body) return;
        if (latest) _asRenderScan(latest, body);
        else body.innerHTML = '<p class="muted-text">No scans yet. Make sure price data is up to date (Analyzer hub → Update price data), then tap <strong>Run scan</strong>.</p>';
    } catch (e) {
        var body2 = document.getElementById('asBody');
        if (body2) body2.innerHTML = '<p class="muted-text">Could not load scans: ' + escapeHtml(e.message) + '</p>';
    }
}

async function _asCacheNote() {
    var el = document.getElementById('asCacheNote');
    if (!el) return;
    try {
        var stats = await _anaCacheStats();
        if (stats.count === 0) { el.textContent = 'No price data cached — run Update price data on the hub first.'; return; }
        var when = stats.newestUpdate ? new Date(stats.newestUpdate).toLocaleString() : '—';
        el.textContent = stats.count + ' tickers cached · prices last updated ' + when;
    } catch (e) { /* non-fatal */ }
}

// ---------------------------------------------------------------------------
// Scan runner
// ---------------------------------------------------------------------------

async function _asRunScan() {
    if (_asRunning) return;
    _asRunning = true;
    var btn = document.getElementById('asRunBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Scanning…'; }
    var prog = document.getElementById('asProgress');
    if (prog) prog.innerHTML = '<p class="muted-text" id="asProgText">Loading price cache…</p>';
    var t0 = Date.now();

    try {
        var scan = await _asComputeScan(function(note) {
            var p = document.getElementById('asProgText');
            if (p) p.textContent = note;
        });
        scan.durationMs = Date.now() - t0;

        // Persist (compact) — the tracking loop grades these later
        var ref = await userCol('analyzerScans').add(scan);
        _asLatestScan = Object.assign({ id: ref.id }, scan);

        if (prog) prog.innerHTML = '';
        _asRenderScan(_asLatestScan, document.getElementById('asBody'));
    } catch (e) {
        console.error('[scan] failed:', e);
        if (prog) prog.innerHTML = '<p class="muted-text">✗ Scan failed: ' + escapeHtml(e.message) + '</p>';
    }

    _asRunning = false;
    if (btn) { btn.disabled = false; btn.textContent = '▶ Run scan'; }
}

async function _asComputeScan(onNote) {
    var cfg = AS_DEFAULTS;

    // Universe + records
    await Promise.all([_anaLoadSp500(), _anaLoadUniverseCfg(), _anaLoadHoldingTickers()]);
    var tickers = _anaEffectiveUniverse();
    var spy = await anaGetPriceHistory('SPY');
    var vix = await anaGetPriceHistory('^VIX');
    if (!spy) throw new Error('SPY history missing — run Update price data on the hub first.');

    var regime = anaEngRegime(spy, vix);

    var funnel = { scanned: 0, passedBaseRate: 0, triggered: 0, shortlisted: 0 };
    var candidates = [];

    for (var i = 0; i < tickers.length; i++) {
        var t = tickers[i];
        var rec = await anaGetPriceHistory(t);
        if (!rec || rec.dates.length < 260) continue;
        funnel.scanned++;
        if (onNote && funnel.scanned % 100 === 0) onNote('Scanning… ' + funnel.scanned + ' / ' + tickers.length);

        // Feasibility: unconditional base rate
        var br = anaEngBaseRate(rec, { gainPct: cfg.gainPct, windowDays: cfg.windowDays });
        if (!br || br.rate < cfg.baseRateCutoff) continue;
        funnel.passedBaseRate++;

        // Detector A
        var dip = anaEngDipTrigger(rec, { dropPct: cfg.dipPct, dropDays: cfg.dipDays });
        if (dip) {
            funnel.triggered++;
            var cond = anaEngConditionalBaseRate(rec, {
                dropPct: cfg.dipPct, dropDays: cfg.dipDays,
                gainPct: cfg.gainPct, windowDays: cfg.windowDays
            });
            candidates.push({
                ticker: t, detector: 'dipA',
                close: dip.close, dropPct: dip.dropPct, daysSincePeak: dip.daysSincePeak,
                peakDate: dip.peakDate, rsi: dip.rsi14,
                volRatio: anaEngVolumeRatio(rec.volume, 5, 60, rec.dates.length - 1),
                baseRate: br.rate,
                condEvents: cond ? cond.events : 0,
                condHits: cond ? cond.hits : 0,
                condMedianDays: cond ? cond.medianDaysToHit : null,
                earningsDate: null,
                dismissed: false
            });
        }

        // Detector D
        var spr = anaEngSpringTrigger(rec, {});
        if (spr) {
            funnel.triggered++;
            candidates.push({
                ticker: t, detector: 'springD',
                close: spr.close, vol: spr.vol, pctFromHigh: spr.pctFromHigh,
                baseRate: br.rate,
                earningsDate: null,
                dismissed: false
            });
        }
    }

    // Rank within detector, cap shortlists
    var dips = candidates.filter(function(c) { return c.detector === 'dipA'; });
    dips.sort(function(a, b) {
        var ra = a.condEvents ? a.condHits / a.condEvents : 0;
        var rb = b.condEvents ? b.condHits / b.condEvents : 0;
        return (rb - ra) || (b.dropPct - a.dropPct);
    });
    var springs = candidates.filter(function(c) { return c.detector === 'springD'; });
    springs.sort(function(a, b) { return a.pctFromHigh - b.pctFromHigh; });

    var shortlist = dips.slice(0, cfg.maxPerDetector).concat(springs.slice(0, cfg.maxPerDetector));
    funnel.shortlisted = shortlist.length;

    // Optional FMP enrichment: one earnings-calendar call flags catalysts in the window
    if (onNote) onNote('Checking earnings calendar…');
    try {
        var earnings = await _asFetchEarningsMap(cfg.windowDays);
        if (earnings) {
            shortlist.forEach(function(c) {
                if (earnings[c.ticker]) c.earningsDate = earnings[c.ticker];
            });
        }
    } catch (e) {
        console.log('[scan] earnings enrichment skipped: ' + e.message);
    }

    return {
        createdAt: new Date().toISOString(),
        date: new Date().toISOString().slice(0, 10),
        params: JSON.parse(JSON.stringify(AS_DEFAULTS)),
        regime: regime,
        funnel: funnel,
        candidates: shortlist
    };
}

// One FMP earnings-calendar call → { TICKER: 'YYYY-MM-DD' } for the next windowDays.
// Returns null when no FMP key is configured (feature degrades silently).
async function _asFetchEarningsMap(windowDays) {
    var doc = await userCol('settings').doc('investments').get();
    var key = (doc.exists && doc.data().fmpApiKey) ? doc.data().fmpApiKey : '';
    if (!key) return null;

    var from = new Date().toISOString().slice(0, 10);
    var to   = new Date(Date.now() + windowDays * 86400000).toISOString().slice(0, 10);
    var url  = 'https://financialmodelingprep.com/stable/earnings-calendar?from=' + from + '&to=' + to + '&apikey=' + encodeURIComponent(key);
    var resp = await fetch(url);
    if (!resp.ok) throw new Error('FMP earnings calendar HTTP ' + resp.status);
    var data = await resp.json();
    if (!Array.isArray(data)) throw new Error('unexpected earnings calendar response');
    var map = {};
    data.forEach(function(row) {
        // Keep the EARLIEST upcoming report date per symbol; FMP uses dashes for classes (BRK-B)
        var sym = (row.symbol || '').replace(/-/g, '.');
        if (sym && row.date && (!map[sym] || row.date < map[sym])) map[sym] = row.date;
    });
    return map;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

var AS_REGIME_STYLES = {
    'bullish':          { cls: 'as-regime-good',    text: 'Bullish — SPY above 50d and 200d averages' },
    'bullish-volatile': { cls: 'as-regime-warn',    text: 'Bullish but volatile — uptrend intact, VIX elevated' },
    'pullback':         { cls: 'as-regime-warn',    text: 'Pullback — SPY below 50d, above 200d (dip-hunting weather)' },
    'recovering':       { cls: 'as-regime-warn',    text: 'Recovering — SPY above 50d, still below 200d' },
    'bearish':          { cls: 'as-regime-bad',     text: 'Bearish — SPY below both averages; almost nothing hits +10%' },
    'panic':            { cls: 'as-regime-bad',     text: 'Panic — downtrend with VIX ≥30; deep dips everywhere, patience required' }
};

function _asName(ticker) {
    if (_anaSp500) {
        var hit = _anaSp500.companies.find(function(c) { return c.t === ticker; });
        if (hit) return hit.n;
    }
    return null;
}

function _asRenderScan(scan, container) {
    if (!container) return;
    var r = scan.regime || {};
    var rs = AS_REGIME_STYLES[r.label] || { cls: 'as-regime-warn', text: r.label || 'unknown' };
    var f = scan.funnel || {};

    var html =
        '<p class="muted-text">Scan of ' + escapeHtml(scan.date || '') +
            (scan.durationMs ? ' · ' + (scan.durationMs / 1000).toFixed(1) + 's' : '') +
            ' · data through ' + escapeHtml(r.date || '—') + '</p>' +

        '<div class="as-regime ' + rs.cls + '">🧭 ' + escapeHtml(rs.text) +
            (r.vix != null ? ' · VIX ' + r.vix.toFixed(1) : '') + '</div>' +

        '<div class="ana-stat-row">' +
            '<div class="ana-stat"><div class="ana-stat-num">' + (f.scanned || 0) + '</div><div class="ana-stat-label">Scanned</div></div>' +
            '<div class="ana-stat"><div class="ana-stat-num">' + (f.passedBaseRate || 0) + '</div><div class="ana-stat-label">Passed base rate</div></div>' +
            '<div class="ana-stat"><div class="ana-stat-num">' + (f.triggered || 0) + '</div><div class="ana-stat-label">Triggered</div></div>' +
            '<div class="ana-stat"><div class="ana-stat-num">' + (f.shortlisted || 0) + '</div><div class="ana-stat-label">Shortlisted</div></div>' +
        '</div>';

    ['dipA', 'springD'].forEach(function(det) {
        var all = (scan.candidates || []).filter(function(c) { return c.detector === det; });
        var live = all.filter(function(c) { return !c.dismissed; });
        var dismissed = all.length - live.length;
        html += '<h3 class="ana-section-title">' + AS_DET_LABELS[det] +
            ' <span class="ab-dim">· ' + live.length + ' candidate' + (live.length !== 1 ? 's' : '') +
            (dismissed ? ' · ' + dismissed + ' dismissed' : '') + '</span></h3>';
        if (!live.length) {
            html += '<p class="muted-text">' + (all.length ? 'All candidates dismissed.' : 'No candidates this scan.') + '</p>';
        } else {
            live.forEach(function(c) { html += _asCandidateCard(c); });
        }
        if (dismissed) {
            html += '<p class="ab-dim">Dismissed: ';
            all.forEach(function(c) {
                if (c.dismissed) html += '<button class="ana-sp-btn" style="margin-right:6px" onclick="_asToggleDismiss(\'' + c.ticker + '\',\'' + c.detector + '\')">↩ ' + escapeHtml(c.ticker) + '</button>';
            });
            html += '</p>';
        }
    });

    container.innerHTML = html;
}

function _asCandidateCard(c) {
    var name = _asName(c.ticker);
    var badge, reason, chips = [];

    if (c.detector === 'dipA') {
        badge  = '−' + c.dropPct.toFixed(1) + '% in ' + c.daysSincePeak + 'd';
        reason = 'Down ' + c.dropPct.toFixed(1) + '% from its ' + escapeHtml(c.peakDate || '') + ' peak.' +
                 (c.rsi != null ? ' RSI ' + c.rsi.toFixed(0) + '.' : '') +
                 (c.volRatio != null ? ' Volume ' + c.volRatio.toFixed(1) + '× normal.' : '');
        if (c.condEvents > 0) {
            chips.push('Similar dips: ' + c.condHits + ' of ' + c.condEvents + ' hit +10% ≤60d' +
                (c.condMedianDays != null ? ' · median ' + c.condMedianDays + 'd' : ''));
        } else {
            chips.push('No similar past dips in 5y — first of its kind');
        }
    } else {
        badge  = 'vol ' + (c.vol != null ? c.vol.toFixed(2) : '—') + ' · ' + c.pctFromHigh.toFixed(1) + '% off high';
        reason = 'Volatility compressed to the bottom decile of its own history, sitting ' + c.pctFromHigh.toFixed(1) + '% from its 52-week high.';
    }
    chips.push('Base rate: ' + Math.round(c.baseRate * 100) + '% of 60d windows hit +10%');

    var html = '<div class="as-card">' +
        '<div class="as-card-top">' +
            '<span class="as-card-ticker">' + escapeHtml(c.ticker) +
                (name ? ' <span class="as-card-name">' + escapeHtml(name) + '</span>' : '') + '</span>' +
            '<span class="as-badge">' + escapeHtml(badge) + '</span>' +
        '</div>' +
        '<p class="as-card-reason">' + reason + '</p>' +
        '<div class="as-chip-row">';
    chips.forEach(function(ch) { html += '<span class="as-chip">' + escapeHtml(ch) + '</span>'; });
    if (c.earningsDate) {
        html += '<span class="as-chip as-chip-warn">⚠️ Earnings ' + escapeHtml(c.earningsDate) + '</span>';
    }
    html += '</div>' +
        '<div class="ab-form-row" style="margin:8px 0 0">' +
            '<button class="ana-sp-btn" disabled title="Coming in Stage 7">Open dossier</button>' +
            '<button class="ana-sp-btn" onclick="_asToggleDismiss(\'' + c.ticker + '\',\'' + c.detector + '\')">Dismiss</button>' +
        '</div>' +
    '</div>';
    return html;
}

// Dismiss / un-dismiss a candidate on the displayed scan (persisted to the scan doc).
async function _asToggleDismiss(ticker, detector) {
    var scan = _asLatestScan;
    if (!scan || !scan.id) return;
    var hit = (scan.candidates || []).find(function(c) { return c.ticker === ticker && c.detector === detector; });
    if (!hit) return;
    hit.dismissed = !hit.dismissed;
    try {
        await userCol('analyzerScans').doc(scan.id).update({ candidates: scan.candidates });
    } catch (e) {
        console.error('[scan] dismiss save failed:', e);
        hit.dismissed = !hit.dismissed;   // revert on failure
    }
    _asRenderScan(scan, document.getElementById('asBody'));
}
