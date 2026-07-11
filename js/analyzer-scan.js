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
    maxPerDetector: 15,
    // Detector B (post-earnings drift)
    driftMaxAgeDays: 10, driftMinDay1Pct: 2, driftMinSurprisePct: 2,
    driftCalendarDays: 21   // trailing window to look back for recent reports
};

var _asRunning   = false;
var _asLatestScan = null;   // {id, ...doc} of the scan being displayed

var AS_DET_LABELS = { dipA: '📉 Panic dip on quality', springD: '🌀 Compressed spring', driftB: '🚀 Post-earnings drift' };

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

    // Detector B needs recent reports: one trailing earnings-calendar call up
    // front (all symbols in one request). Degrades to {} without a Finnhub key.
    var driftCal = {};
    if (onNote) onNote('Loading recent earnings…');
    try {
        var calFrom = new Date(Date.now() - cfg.driftCalendarDays * 86400000).toISOString().slice(0, 10);
        var calTo   = new Date().toISOString().slice(0, 10);
        driftCal = await anaFinnhubEarningsCalendar(calFrom, calTo);
    } catch (e0) {
        console.log('[scan] drift earnings calendar skipped: ' + e0.message);
    }

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

        // Detector B — post-earnings drift (only if a recent report exists)
        var er = driftCal[t];
        if (er) {
            var drift = anaEngDriftTrigger(rec, er, {
                maxAgeDays: cfg.driftMaxAgeDays,
                minDay1Pct: cfg.driftMinDay1Pct,
                minSurprisePct: cfg.driftMinSurprisePct
            });
            if (drift) {
                funnel.triggered++;
                candidates.push({
                    ticker: t, detector: 'driftB',
                    close: drift.close,
                    reportDate: drift.reportDate,
                    reactionDate: drift.reactionDate,
                    epsSurprisePct: drift.epsSurprisePct,
                    revenueBeat: drift.revenueBeat,
                    day1RetPct: drift.day1RetPct,
                    daysSinceReaction: drift.daysSinceReaction,
                    epsActual: er.epsActual, epsEstimate: er.epsEstimate,
                    baseRate: br.rate,
                    earningsDate: null,
                    dismissed: false
                });
            }
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

    var drifts = candidates.filter(function(c) { return c.detector === 'driftB'; });
    drifts.sort(function(a, b) { return b.epsSurprisePct - a.epsSurprisePct; });

    var shortlist = dips.slice(0, cfg.maxPerDetector)
        .concat(springs.slice(0, cfg.maxPerDetector))
        .concat(drifts.slice(0, cfg.maxPerDetector));
    funnel.shortlisted = shortlist.length;

    // Catalyst map (Stage 2.4): Finnhub earnings calendar is PRIMARY (all
    // symbols in one call); FMP is a silent fallback only if Finnhub throws
    // (no key / rate limit). For every candidate with an upcoming report in the
    // window, also stamp the stock's typical earnings-day move for sizing.
    if (onNote) onNote('Checking earnings calendar…');
    var earnings = null;
    try {
        var eFrom = new Date().toISOString().slice(0, 10);
        var eTo   = new Date(Date.now() + cfg.windowDays * 86400000).toISOString().slice(0, 10);
        var cal   = await anaFinnhubEarningsCalendar(eFrom, eTo);
        earnings = {};
        Object.keys(cal).forEach(function(sym) { earnings[sym] = cal[sym].date; });
    } catch (e) {
        console.log('[scan] Finnhub earnings calendar unavailable, trying FMP: ' + e.message);
        try { earnings = await _asFetchEarningsMap(cfg.windowDays); }
        catch (e2) { console.log('[scan] FMP earnings fallback skipped: ' + e2.message); }
    }
    if (earnings) {
        for (var s = 0; s < shortlist.length; s++) {
            var sc = shortlist[s];
            if (earnings[sc.ticker]) {
                sc.earningsDate = earnings[sc.ticker];
                var srec = await anaGetPriceHistory(sc.ticker);
                if (srec) sc.eventMovePct = anaEngTypicalEventMovePct(srec);
            }
        }
    }

    // Quality + insider enrichment (Stage 2.2, Finnhub) — DIP candidates only.
    // Sequential (the choke-point paces itself at 1.1s), so at most ~15 pairs.
    // Each candidate is wrapped so one bad ticker can't kill the whole scan;
    // the fields ride along on the scan doc as point-in-time evidence.
    var dipShortlist = shortlist.filter(function(c) { return c.detector === 'dipA'; });
    for (var q = 0; q < dipShortlist.length; q++) {
        var dc = dipShortlist[q];
        if (onNote) onNote('Enriching ' + (q + 1) + ' / ' + dipShortlist.length + ' — ' + dc.ticker + '…');
        try {
            dc.quality = await anaFinnhubMetrics(dc.ticker);
        } catch (e2) {
            dc.quality = { error: e2.message };
        }
        try {
            // Buys since the dip's peak = insiders catching their own knife.
            var since = dc.peakDate || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
            dc.insiders = await anaFinnhubInsiders(dc.ticker, since);
        } catch (e3) {
            dc.insiders = { error: e3.message };
        }
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

    ['dipA', 'springD', 'driftB'].forEach(function(det) {
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

// Build the quality/insider/falling-knife chips for a candidate (Stage 2.2).
// Returns [{text, cls, lead}] — `lead` chips render at the FRONT of the row.
// Empty when the candidate has no enrichment data (old scans / fetch errors)
// so cards stay backward-compatible and render cleanly without chips.
function _asQualityChips(c) {
    var out = [];
    var q = c.quality;
    if (q && !q.error) {
        var unprofitable = (q.profitable === false);
        var d2e = q.debtToEquity;
        // Falling-knife flag: unprofitable AND heavily indebted. FLAG, never remove.
        if (unprofitable && d2e != null && d2e > 2) {
            out.push({ text: '⚠️ Falling knife?', cls: 'as-chip-warn', lead: true });
        }
        if (q.profitable === true)  out.push({ text: '✅ Profitable',   cls: 'as-chip-good' });
        if (q.profitable === false) out.push({ text: '⚠️ Unprofitable', cls: 'as-chip-warn' });
        if (d2e != null) {
            out.push({ text: 'Debt/eq ' + d2e.toFixed(1), cls: (d2e > 2 ? 'as-chip-warn' : 'as-chip') });
        }
        if (q.dividendYieldPct != null && q.dividendYieldPct > 0) {
            out.push({ text: 'Div ' + q.dividendYieldPct.toFixed(1) + '%', cls: 'as-chip' });
        }
    }
    var ins = c.insiders;
    if (ins && !ins.error && ins.purchases && ins.purchases.length > 0) {
        out.push({ text: '👤 Insider buys: ' + ins.purchases.length, cls: 'as-chip-good' });
    }
    return out;
}

// Earnings-catalyst chip text (Stage 2.4): the report date plus the stock's
// own typical event move when known. null when no report is in the window.
function _asEarningsChipText(c) {
    if (!c || !c.earningsDate) return null;
    var t = '⚠️ Earnings ' + c.earningsDate;
    if (c.eventMovePct != null) t += ' (±' + c.eventMovePct + '% history)';
    return t;
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
    } else if (c.detector === 'driftB') {
        badge  = 'beat +' + c.epsSurprisePct.toFixed(1) + '% · day1 +' + c.day1RetPct.toFixed(1) + '%';
        reason = 'Beat estimates by ' + c.epsSurprisePct.toFixed(1) + '% on ' + escapeHtml(c.reportDate || '') +
                 '; day-one gain of ' + c.day1RetPct.toFixed(1) + '% held. Day ' + c.daysSinceReaction + ' of the drift window.';
        if (c.revenueBeat === true) chips.push('Revenue beat too');
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
    // Falling-knife flag leads the row (amber) when quality data warrants it.
    _asQualityChips(c).forEach(function(qc) {
        if (qc.lead) html += '<span class="as-chip ' + qc.cls + '">' + escapeHtml(qc.text) + '</span>';
    });
    chips.forEach(function(ch) { html += '<span class="as-chip">' + escapeHtml(ch) + '</span>'; });
    var earnChip = _asEarningsChipText(c);
    if (earnChip) {
        html += '<span class="as-chip as-chip-warn">' + escapeHtml(earnChip) + '</span>';
    }
    // Quality + insider evidence chips (non-lead) after the base-rate chip.
    _asQualityChips(c).forEach(function(qc) {
        if (!qc.lead) html += '<span class="as-chip ' + qc.cls + '">' + escapeHtml(qc.text) + '</span>';
    });
    html += '</div>' +
        '<div class="ab-form-row" style="margin:8px 0 0">' +
            '<button class="ana-sp-btn" onclick="_asOpenDossier(\'' + c.ticker + '\',\'' + c.detector + '\')">Open dossier</button>' +
            '<button class="ana-sp-btn" onclick="_asToggleDismiss(\'' + c.ticker + '\',\'' + c.detector + '\')">Dismiss</button>' +
        '</div>' +
    '</div>';
    return html;
}

function _asOpenDossier(ticker, detector) {
    if (!_asLatestScan || !_asLatestScan.id) return;
    window.location.hash = '#analyzer/dossier/' + _asLatestScan.id + '/' + encodeURIComponent(ticker) + '/' + detector;
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

// ---------------------------------------------------------------------------
// Candidate dossier (Stage 7) — #analyzer/dossier/{scanId}/{ticker}/{detector}
// ---------------------------------------------------------------------------
// The deep-dive page behind a scan card: full evidence recap, a 12-month
// price chart with the setup marked, the stock's own similar-dips history,
// the thesis prompt, and exit fields. Thesis + exits save onto the scan
// doc's candidate entry (thesisDraft / exits) for the Stage 8 trade ticket.
// Evidence is recomputed from the price cache, so deep links and reloads work.
// ---------------------------------------------------------------------------

var _adChart = null;      // live Chart.js instance (destroyed on re-entry)
var _adCtx   = null;      // {scanId, ticker, detector, scan, candidate, close}

async function loadAnalyzerDossierPage(scanId, ticker, detector) {
    _analyzerBreadcrumb([
        { label: 'Stock Analyzer', href: '#analyzer' },
        { label: 'Scan', href: '#analyzer/scan' },
        { label: ticker }
    ]);
    var page = document.getElementById('page-analyzer-dossier');
    if (!page) return;
    page.innerHTML = '<p class="muted-text" style="padding:16px">Building dossier…</p>';

    // Price history is the backbone — without it there is no dossier
    var rec;
    try { rec = await anaGetPriceHistory(ticker); } catch (e) { rec = null; }
    if (!rec || rec.dates.length < 260) {
        page.innerHTML = '<p class="muted-text" style="padding:16px">No cached price history for ' + escapeHtml(ticker) +
            ' — run Update price data on the Analyzer hub first.</p>';
        return;
    }

    // Scan context (for saved thesis/exits). Missing scan → read-only mode.
    var scan = null, candidate = null;
    try {
        var doc = await userCol('analyzerScans').doc(scanId).get();
        if (doc.exists) {
            scan = Object.assign({ id: doc.id }, doc.data());
            candidate = (scan.candidates || []).find(function(c) {
                return c.ticker === ticker && c.detector === detector;
            }) || null;
        }
    } catch (e) { console.error('[dossier] scan load failed:', e); }

    var params = (scan && scan.params) || AS_DEFAULTS;
    var n      = rec.dates.length - 1;
    var close  = rec.close[n];

    // Recompute the full evidence set from the cache
    var ev = {
        close:   close,
        rsi:     anaEngRsi(rec.close, 14, n),
        volRatio: anaEngVolumeRatio(rec.volume, 5, 60, n),
        realVol: anaEngRealizedVol(rec.close, 60, n),
        sma50:   anaEngSma(rec.close, 50, n),
        sma200:  anaEngSma(rec.close, 200, n),
        baseRate: anaEngBaseRate(rec, { gainPct: params.gainPct, windowDays: params.windowDays }),
        dip:     anaEngDipTrigger(rec, { dropPct: params.dipPct, dropDays: params.dipDays }),
        spring:  anaEngSpringTrigger(rec, {}),
        events:  anaEngDipEvents(rec, { dropPct: params.dipPct, dropDays: params.dipDays,
                                        gainPct: params.gainPct, windowDays: params.windowDays })
    };
    var hi52 = -Infinity, lo52 = Infinity;
    for (var i = Math.max(0, n - 251); i <= n; i++) {
        if (rec.high[i] > hi52) hi52 = rec.high[i];
        if (rec.low[i]  < lo52) lo52 = rec.low[i];
    }
    ev.hi52 = hi52; ev.lo52 = lo52;

    // Detector B evidence — use the stamped candidate when present, else
    // reconstruct live from a trailing earnings calendar (deep-link case).
    if (detector === 'driftB') {
        if (candidate && candidate.reportDate) {
            ev.drift = {
                reportDate: candidate.reportDate, reactionDate: candidate.reactionDate,
                epsSurprisePct: candidate.epsSurprisePct, day1RetPct: candidate.day1RetPct,
                daysSinceReaction: candidate.daysSinceReaction, revenueBeat: candidate.revenueBeat,
                epsActual: candidate.epsActual, epsEstimate: candidate.epsEstimate
            };
        } else {
            try {
                var from120 = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
                var cal = await anaFinnhubEarningsCalendar(from120, new Date().toISOString().slice(0, 10));
                var er  = cal[ticker];
                if (er) {
                    var dtr = anaEngDriftTrigger(rec, er, { maxAgeDays: 120 });
                    if (dtr) ev.drift = {
                        reportDate: dtr.reportDate, reactionDate: dtr.reactionDate,
                        epsSurprisePct: dtr.epsSurprisePct, day1RetPct: dtr.day1RetPct,
                        daysSinceReaction: dtr.daysSinceReaction, revenueBeat: dtr.revenueBeat,
                        epsActual: er.epsActual, epsEstimate: er.epsEstimate
                    };
                }
            } catch (e) { /* leave ev.drift undefined — badge falls back */ }
        }
    }

    _adCtx = { scanId: scanId, ticker: ticker, detector: detector, scan: scan, candidate: candidate, close: close };
    _adRender(page, rec, ev, params);
}

function _adRender(page, rec, ev, params) {
    var ctx  = _adCtx;
    var name = _asName(ctx.ticker);
    var saved = (ctx.candidate && ctx.candidate.exits) || {};
    var exits = {
        targetPct:    saved.targetPct    != null ? saved.targetPct    : 10,
        stopPct:      saved.stopPct      != null ? saved.stopPct      : 7,
        timeStopDays: saved.timeStopDays != null ? saved.timeStopDays : 60
    };
    var thesis = (ctx.candidate && ctx.candidate.thesisDraft) || '';
    var isDip   = ctx.detector === 'dipA';
    var isDrift = ctx.detector === 'driftB';

    // Header + badge
    var badge;
    if (isDrift && ev.drift)      badge = 'beat +' + ev.drift.epsSurprisePct.toFixed(1) + '% · day1 +' + ev.drift.day1RetPct.toFixed(1) + '%';
    else if (isDip && ev.dip)     badge = '−' + ev.dip.dropPct.toFixed(1) + '% in ' + ev.dip.daysSincePeak + 'd';
    else if (!isDip && !isDrift && ev.spring) badge = 'vol ' + ev.spring.vol.toFixed(2) + ' · ' + ev.spring.pctFromHigh.toFixed(1) + '% off high';
    else                          badge = 'setup no longer active';

    var html =
        '<div class="page-header"><h2>' + escapeHtml(ctx.ticker) +
            (name ? ' <span class="as-card-name">' + escapeHtml(name) + '</span>' : '') + '</h2></div>' +
        '<div class="ab-form-row">' +
            '<span class="as-badge">' + escapeHtml(badge) + '</span>' +
            '<span class="ab-dim">$' + ev.close.toFixed(2) + ' · data through ' + escapeHtml(rec.dates[rec.dates.length - 1]) + '</span>' +
        '</div>';

    // Evidence chips
    var chips = [];
    if (ev.baseRate) chips.push('Base rate: ' + Math.round(ev.baseRate.rate * 100) + '% of ' + params.windowDays + 'd windows hit +' + params.gainPct + '%');
    if (ev.rsi != null)      chips.push('RSI ' + ev.rsi.toFixed(0));
    if (ev.volRatio != null) chips.push('Volume ' + ev.volRatio.toFixed(1) + '× normal');
    if (ev.realVol != null)  chips.push('Realized vol ' + (ev.realVol * 100).toFixed(0) + '%');
    if (ev.sma50 != null)    chips.push((ev.close > ev.sma50 ? 'Above' : 'Below') + ' 50d avg');
    if (ev.sma200 != null)   chips.push((ev.close > ev.sma200 ? 'Above' : 'Below') + ' 200d avg');
    chips.push('52w range $' + ev.lo52.toFixed(2) + ' – $' + ev.hi52.toFixed(2));
    var adEarnChip = _asEarningsChipText(ctx.candidate);
    if (adEarnChip) chips.push(adEarnChip);
    html += '<div class="as-chip-row" style="margin-bottom:12px">';
    _asQualityChips(ctx.candidate || {}).forEach(function(qc) {
        if (qc.lead) html += '<span class="as-chip ' + qc.cls + '">' + escapeHtml(qc.text) + '</span>';
    });
    chips.forEach(function(c) { html += '<span class="as-chip">' + escapeHtml(c) + '</span>'; });
    _asQualityChips(ctx.candidate || {}).forEach(function(qc) {
        if (!qc.lead) html += '<span class="as-chip ' + qc.cls + '">' + escapeHtml(qc.text) + '</span>';
    });
    html += '</div>';

    // Report line (Detector B) — the earnings beat behind the drift
    if (isDrift && ev.drift) {
        var d = ev.drift;
        var rev = d.revenueBeat === true ? ' · revenue beat' : (d.revenueBeat === false ? ' · revenue missed' : '');
        html += '<p class="muted-text">📊 Report ' + escapeHtml(d.reportDate || '') + ': EPS ' +
            (d.epsActual != null ? d.epsActual : '—') + ' vs ' + (d.epsEstimate != null ? d.epsEstimate : '—') + ' est' +
            ' (beat +' + d.epsSurprisePct.toFixed(1) + '%)' + rev +
            ' · day-one +' + d.day1RetPct.toFixed(1) + '% · day ' + d.daysSinceReaction + ' of the drift window.</p>';
    }

    // Quality section (Stage 2.2) — filled async by _adRenderQuality after render
    html += '<h3 class="ana-section-title">🏥 Quality</h3>' +
        '<div id="adQuality"><p class="muted-text">Loading quality data…</p></div>';

    // Chart
    html += '<div class="ad-chart-wrap"><canvas id="adChart"></canvas></div>';

    // Similar-dips history (dips only)
    if (isDip) {
        var evsDone = ev.events.filter(function(e) { return !e.pending; });
        var hits = evsDone.filter(function(e) { return e.hit === true; }).length;
        html += '<h3 class="ana-section-title">Similar dips — ' + escapeHtml(ctx.ticker) + '’s own history</h3>';
        if (ev.events.length === 0) {
            html += '<p class="muted-text">No comparable dips (≥' + params.dipPct + '% in ' + params.dipDays + 'd) in the cached 5 years — this setup is a first for this stock.</p>';
        } else {
            html += '<p class="muted-text">' + hits + ' of ' + evsDone.length + ' completed episodes reached +' + params.gainPct + '% within ' + params.windowDays + ' trading days.</p>' +
                '<div class="ab-table-wrap"><table class="ab-table">' +
                '<tr><th>Date</th><th>Drop</th><th>Outcome</th><th>Days to +' + params.gainPct + '%</th><th>Max gain</th><th>Worst dip</th><th>End of window</th></tr>';
            ev.events.slice().reverse().forEach(function(e) {
                var badge2 = e.pending ? '<span class="ab-badge ab-badge-neutral">pending</span>'
                    : (e.hit ? '<span class="ab-badge ab-badge-win">hit</span>' : '<span class="ab-badge ab-badge-loss">miss</span>');
                html += '<tr>' +
                    '<td>' + e.date + '</td>' +
                    '<td>−' + e.dropPct.toFixed(1) + '%</td>' +
                    '<td>' + badge2 + '</td>' +
                    '<td>' + (e.daysToHit != null ? e.daysToHit : '—') + '</td>' +
                    '<td class="' + (e.maxGainPct > 0 ? 'ab-pos' : 'ab-dim') + '">' + (e.maxGainPct != null ? _abFmtPct(e.maxGainPct) : '—') + '</td>' +
                    '<td class="ab-neg">' + (e.minRetPct != null ? _abFmtPct(e.minRetPct) : '—') + '</td>' +
                    '<td class="' + (e.finalRetPct > 0 ? 'ab-pos' : 'ab-neg') + '">' + (e.finalRetPct != null ? _abFmtPct(e.finalRetPct) : '—') + '</td>' +
                '</tr>';
            });
            html += '</table></div>';
        }
    }

    // Recent news + optional AI read (Stage 2.5) — filled async by _adRenderNews
    html += '<h3 class="ana-section-title">📰 Recent news</h3>' +
        '<div id="adNews"><p class="muted-text">Loading news…</p></div>';

    // Thesis + exits
    var canSave = !!(ctx.scan && ctx.candidate);
    html += '<h3 class="ana-section-title">Your thesis</h3>' +
        '<p class="muted-text">What has to happen for ' + escapeHtml(ctx.ticker) + ' to rise ' + params.gainPct + '%? Is this dip emotional or structural?</p>' +
        '<textarea id="adThesis" class="ad-thesis" rows="3" placeholder="e.g. Sector-wide selloff, no company-specific news, guidance intact — expect mean reversion once headlines fade."' +
            (canSave ? '' : ' disabled') + '>' + escapeHtml(thesis) + '</textarea>' +

        '<h3 class="ana-section-title">Exit plan</h3>' +
        '<div class="ab-form-row">' +
            '<label>Target % <input type="number" id="adTarget" value="' + exits.targetPct + '" min="1" max="100" step="0.5" oninput="_adUpdateExitPrices()"' + (canSave ? '' : ' disabled') + '></label>' +
            '<label>Stop % <input type="number" id="adStop" value="' + exits.stopPct + '" min="1" max="50" step="0.5" oninput="_adUpdateExitPrices()"' + (canSave ? '' : ' disabled') + '></label>' +
            '<label>Time stop (days) <input type="number" id="adTimeStop" value="' + exits.timeStopDays + '" min="5" max="250" step="1"' + (canSave ? '' : ' disabled') + '></label>' +
        '</div>' +
        '<p class="ab-dim" id="adExitPrices"></p>' +
        '<div class="ab-form-row">' +
            (canSave
                ? '<button class="btn-primary" onclick="_adSaveNotes()">Save thesis &amp; exits</button>' +
                  '<span class="settings-saved-msg hidden" id="adSavedMsg">&#10003; Saved</span>'
                : '<span class="muted-text">Read-only — this dossier’s scan snapshot is missing, so notes can’t be saved.</span>') +
            '<a class="ana-sp-btn" href="#analyzer/scan" style="text-decoration:none">← Back to scan</a>' +
        '</div>';

    // Trade ticket (Stage 8) — turn the dossier into a tracked position
    if (canSave) {
        html += '<h3 class="ana-section-title">🎫 Trade ticket</h3>' +
            '<p class="muted-text">Bought it for real? Record the trade — it will be tracked against your exits on the Trades page.</p>' +
            '<div class="ab-form-row">' +
                '<label>Entry price $ <input type="number" id="adEntryPrice" value="' + ev.close.toFixed(2) + '" step="0.01" min="0" style="width:100px"></label>' +
                '<label>Shares <input type="number" id="adShares" placeholder="optional" step="1" min="0" style="width:90px"></label>' +
                '<button class="btn-primary" onclick="_adCreateTicket()">Create trade ticket</button>' +
            '</div>';
    }

    page.innerHTML = html;
    _adUpdateExitPrices();
    _adDrawChart(rec, ev);
    _adRenderQuality();
    _adRenderNews(rec, ev);
}

// Fill the dossier's Quality section (Stage 2.2). Uses the point-in-time
// quality/insiders stamped on the scan candidate when present; otherwise
// (deep-link with no scan, or an old scan) fetches live from Finnhub.
async function _adRenderQuality() {
    var host = document.getElementById('adQuality');
    if (!host || !_adCtx) return;
    var cand = _adCtx.candidate || {};
    var quality  = (cand.quality  && !cand.quality.error)  ? cand.quality  : null;
    var insiders = (cand.insiders && !cand.insiders.error) ? cand.insiders : null;

    if (!quality) {
        try { quality = await anaFinnhubMetrics(_adCtx.ticker); }
        catch (e) { quality = null; }
    }
    if (!insiders) {
        try {
            var since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
            insiders = await anaFinnhubInsiders(_adCtx.ticker, since);
        } catch (e2) { insiders = null; }
    }
    // The element can be replaced by a re-render while we await — bail if gone.
    host = document.getElementById('adQuality');
    if (!host) return;

    if (!quality && !insiders) {
        host.innerHTML = '<p class="muted-text">Quality data unavailable.</p>';
        return;
    }

    var rows = [];
    if (quality) {
        var fmtPct = function(v) { return v == null ? '—' : v.toFixed(1) + '%'; };
        var fmtNum = function(v) { return v == null ? '—' : v.toFixed(2); };
        rows.push(['Profitable',      quality.profitable == null ? '—' : (quality.profitable ? 'Yes' : 'No')]);
        rows.push(['Net margin',      fmtPct(quality.netMarginPct)]);
        rows.push(['Debt / equity',   fmtNum(quality.debtToEquity)]);
        rows.push(['Current ratio',   fmtNum(quality.currentRatio)]);
        rows.push(['Dividend yield',  fmtPct(quality.dividendYieldPct)]);
        rows.push(['Return on equity', fmtPct(quality.roePct)]);
    }
    var html = '';
    if (rows.length) {
        html += '<div class="ad-quality-grid">';
        rows.forEach(function(r) {
            html += '<div class="ad-quality-k">' + escapeHtml(r[0]) + '</div>' +
                    '<div class="ad-quality-v">' + escapeHtml(r[1]) + '</div>';
        });
        html += '</div>';
    }
    if (insiders) {
        var buys = insiders.purchases || [];
        html += '<p class="muted-text" style="margin-top:10px">Insider open-market purchases (last few months): ' +
                (buys.length ? buys.length : 'none') + '</p>';
        if (buys.length) {
            html += '<div class="ab-table-wrap"><table class="ab-table">' +
                    '<tr><th>Date</th><th>Insider</th><th>Shares</th><th>Price</th></tr>';
            buys.forEach(function(b) {
                html += '<tr><td>' + escapeHtml(b.date || '') + '</td>' +
                        '<td>' + escapeHtml(b.name || '') + '</td>' +
                        '<td>' + (b.shares != null ? b.shares.toLocaleString() : '—') + '</td>' +
                        '<td>' + (b.price != null ? '$' + b.price.toFixed(2) : '—') + '</td></tr>';
            });
            html += '</table></div>';
        }
    }
    host.innerHTML = html || '<p class="muted-text">Quality data unavailable.</p>';
    _adCtx._quality = quality;   // stash for the AI read prompt
}

// ── Recent news + AI read (Stage 2.5) ────────────────────────────────────────

// System prompts — kept verbatim as constants. The tool NEVER gives buy/sell/
// hold advice; the AI only classifies the move as emotional vs structural
// (dips) or premise-supported vs contradicted (non-dip setups).
var AD_AI_SYSTEM_DIP = "You are an analyst's assistant inside a personal stock-research tool. You NEVER give buy/sell/hold recommendations or price predictions. Your only job: assess whether a stock's recent decline looks EMOTIONAL (sentiment-driven, fundamentals intact) or STRUCTURAL (fundamentals actually impaired), based strictly on the provided headlines and metrics. Output format: line 1 = 'Read: EMOTIONAL', 'Read: STRUCTURAL', or 'Read: MIXED/UNCLEAR'; then 2–4 short bullets citing specific provided evidence; then one line starting 'Watch for:' with what would change the read. Under 150 words. If the headlines don't explain the move, say so plainly.";
var AD_AI_SYSTEM_GENERIC = "You are an analyst's assistant inside a personal stock-research tool. You NEVER give buy/sell/hold recommendations or price predictions. Your only job: assess whether the setup's premise is supported or contradicted by the provided headlines and metrics. Output format: line 1 = 'Read: SUPPORTED', 'Read: CONTRADICTED', or 'Read: MIXED/UNCLEAR'; then 2–4 short bullets citing specific provided evidence; then one line starting 'Watch for:' with what would change the read. Under 150 words. If the headlines don't explain the setup, say so plainly.";

// One-line description of the setup for the AI prompt, per detector.
function _adAiDescription(ev) {
    var ctx = _adCtx;
    if (ctx.detector === 'dipA' && ev.dip)
        return 'down ' + ev.dip.dropPct.toFixed(1) + '% in ' + ev.dip.daysSincePeak + ' days from its ' + ev.dip.peakDate + ' peak';
    if (ctx.detector === 'driftB' && ev.drift)
        return 'up after beating earnings estimates by ' + ev.drift.epsSurprisePct.toFixed(1) + '% on ' + ev.drift.reportDate + ' (day ' + ev.drift.daysSinceReaction + ' of the post-earnings drift)';
    if (ctx.detector === 'springD' && ev.spring)
        return 'trading ' + ev.spring.pctFromHigh.toFixed(1) + '% below its 52-week high with volatility compressed to the bottom of its own range';
    return 'showing the ' + ctx.detector + ' setup';
}

// Fetch + render the news list; add the AI-read button only when an LLM is
// configured. News is ephemeral — never persisted to Firestore.
async function _adRenderNews(rec, ev) {
    var host = document.getElementById('adNews');
    if (!host || !_adCtx) return;
    _adCtx._ev = ev;   // stash for the AI read

    var items = [];
    try {
        var from = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
        var to   = new Date().toISOString().slice(0, 10);
        items = await anaFinnhubNews(_adCtx.ticker, from, to);
    } catch (e) { items = null; }
    _adCtx._newsItems = items || [];

    host = document.getElementById('adNews');
    if (!host) return;

    var html = '';
    if (!items) {
        html += '<p class="muted-text">News unavailable.</p>';
    } else if (items.length === 0) {
        html += '<p class="muted-text">No headlines in the last two weeks.</p>';
    } else {
        html += '<ul class="ad-news-list">';
        items.slice(0, 10).forEach(function(it) {
            var head = escapeHtml(it.headline);
            var link = it.url ? '<a href="' + escapeHtml(it.url) + '" target="_blank" rel="noopener">' + head + '</a>' : head;
            html += '<li><span class="ab-dim">' + escapeHtml(it.date || '') +
                    (it.source ? ' · ' + escapeHtml(it.source) : '') + '</span> ' + link + '</li>';
        });
        html += '</ul>';
    }

    // AI read button — only when an LLM is configured (same doc help.js checks)
    var llmOk = false;
    try {
        var doc = await userCol('settings').doc('llm').get();
        llmOk = doc.exists && !!doc.data().apiKey;
    } catch (e) { llmOk = false; }

    host = document.getElementById('adNews');
    if (!host) return;
    if (llmOk) {
        html += '<div class="ab-form-row" style="margin-top:10px">' +
            '<button class="ana-sp-btn" id="adAiReadBtn" onclick="_adAiRead()">🤖 AI read: emotional vs structural</button>' +
            '</div><div id="adAiReadOut"></div>';
    }
    host.innerHTML = html;
}

// Build the prompt from ON-SCREEN evidence only and call the shared LLM helper.
async function _adAiRead() {
    var btn = document.getElementById('adAiReadBtn');
    var out = document.getElementById('adAiReadOut');
    if (!out || !_adCtx) return;
    var ctx = _adCtx, ev = ctx._ev || {};

    if (btn) { btn.disabled = true; btn.textContent = '🤖 Thinking…'; }
    out.innerHTML = '<p class="muted-text">Reading the evidence…</p>';

    try {
        var cfgDoc = await userCol('settings').doc('llm').get();
        var cfg = cfgDoc.exists ? cfgDoc.data() : null;
        if (!cfg || !cfg.provider || !cfg.apiKey) throw new Error('No LLM configured');
        var llm = LLM_PROVIDERS[cfg.provider];
        if (!llm) throw new Error('Unknown LLM provider');

        var q = ctx._quality || (ctx.candidate && ctx.candidate.quality) || {};
        var metrics = [];
        if (q.netMarginPct != null)     metrics.push(q.netMarginPct.toFixed(1) + '% net margin');
        if (q.debtToEquity != null)     metrics.push('debt/equity ' + q.debtToEquity.toFixed(2));
        if (q.dividendYieldPct != null && q.dividendYieldPct > 0) metrics.push('dividend ' + q.dividendYieldPct.toFixed(1) + '%');
        if (ev.rsi != null)             metrics.push('RSI ' + ev.rsi.toFixed(0));

        var headlines = (ctx._newsItems || []).slice(0, 10).map(function(it) {
            return it.date + ' — ' + (it.source || '?') + ' — ' + it.headline;
        }).join('\n');

        var name = _asName(ctx.ticker) || ctx.ticker;
        var user = ctx.ticker + ' (' + name + ') — ' + _adAiDescription(ev) + '. ' +
            'Key metrics: ' + (metrics.length ? metrics.join(', ') : 'not available') + '. ' +
            'Recent headlines (newest first):\n' + (headlines || '(none provided)');

        var system = (ctx.detector === 'dipA') ? AD_AI_SYSTEM_DIP : AD_AI_SYSTEM_GENERIC;
        var content = system + '\n\n' + user;   // helper sends a single user message
        var model = cfg.model || llm.model;
        var resp = await chatCallOpenAICompat(llm, cfg.apiKey, content, model);

        out.innerHTML = '<div class="ad-ai-box">' + escapeHtml(resp).replace(/\n/g, '<br>') +
            '<p class="ad-ai-disclaimer">AI draft — not financial advice. The tool assembles evidence; the decision is yours.</p></div>';
    } catch (e) {
        out.innerHTML = '<p class="as-chip as-chip-warn" style="display:inline-block">AI read failed: ' + escapeHtml(e.message) + '</p>';
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🤖 AI read: emotional vs structural'; }
    }
}

function _adUpdateExitPrices() {
    var el = document.getElementById('adExitPrices');
    if (!el || !_adCtx) return;
    var t = parseFloat((document.getElementById('adTarget') || {}).value) || 10;
    var s = parseFloat((document.getElementById('adStop')   || {}).value) || 7;
    var c = _adCtx.close;
    el.textContent = 'From $' + c.toFixed(2) + ': target $' + (c * (1 + t / 100)).toFixed(2) +
                     ' · stop $' + (c * (1 - s / 100)).toFixed(2);
}

function _adDrawChart(rec, ev) {
    var canvas = document.getElementById('adChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (_adChart) { _adChart.destroy(); _adChart = null; }

    var n     = rec.dates.length;
    var start = Math.max(0, n - 250);
    var labels = rec.dates.slice(start);
    var closes = rec.close.slice(start);

    var t = parseFloat((document.getElementById('adTarget') || {}).value) || 10;
    var s = parseFloat((document.getElementById('adStop')   || {}).value) || 7;
    var close = ev.close;
    var flat = function(v) { return labels.map(function() { return v; }); };

    // Peak marker (dips): nulls everywhere except the trailing-peak date
    var peakData = null;
    if (_adCtx.detector === 'dipA' && ev.dip) {
        peakData = labels.map(function(d) { return d === ev.dip.peakDate ? ev.dip.peakClose : null; });
    }

    // Reaction marker (drift): the post-earnings gap-up day
    var reactData = null;
    if (_adCtx.detector === 'driftB' && ev.drift && ev.drift.reactionDate) {
        var rIdx = anaEngIndexForDate(rec, ev.drift.reactionDate);
        var rClose = (rIdx >= 0) ? rec.close[rIdx] : null;
        reactData = labels.map(function(d) { return d === ev.drift.reactionDate ? rClose : null; });
    }

    var datasets = [
        { label: _adCtx.ticker, data: closes, borderColor: '#2b6cb0', backgroundColor: 'rgba(43,108,176,0.06)',
          borderWidth: 2, pointRadius: 0, fill: true, tension: 0.1 },
        { label: 'Target', data: flat(close * (1 + t / 100)), borderColor: '#2e7d32', borderWidth: 1.5,
          borderDash: [6, 4], pointRadius: 0, fill: false },
        { label: 'Stop', data: flat(close * (1 - s / 100)), borderColor: '#c62828', borderWidth: 1.5,
          borderDash: [6, 4], pointRadius: 0, fill: false }
    ];
    if (peakData) {
        datasets.push({ label: 'Peak', data: peakData, borderColor: '#b7791f', backgroundColor: '#b7791f',
                        pointRadius: 6, pointStyle: 'triangle', showLine: false });
    }
    if (reactData) {
        datasets.push({ label: 'Earnings reaction', data: reactData, borderColor: '#2e7d32', backgroundColor: '#2e7d32',
                        pointRadius: 6, pointStyle: 'rectRot', showLine: false });
    }
    if (_adCtx.detector === 'springD') {
        datasets.push({ label: '52w high', data: flat(ev.hi52), borderColor: '#b7791f', borderWidth: 1.5,
                        borderDash: [2, 3], pointRadius: 0, fill: false });
    }

    _adChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { display: true, labels: { boxWidth: 18, font: { size: 10 } } } },
            scales: {
                x: { ticks: { maxTicksLimit: 8, font: { size: 10 } } },
                y: { ticks: { font: { size: 10 } } }
            }
        }
    });
}

// Create a trade ticket from the dossier (saves thesis/exits first so the
// ticket and the scan candidate agree, then hands off to analyzer-trades.js)
async function _adCreateTicket() {
    var ctx = _adCtx;
    if (!ctx || !ctx.scan || !ctx.candidate) return;
    var entryPrice = parseFloat((document.getElementById('adEntryPrice') || {}).value);
    if (!entryPrice || entryPrice <= 0) { alert('Enter a valid entry price.'); return; }
    var sharesRaw = (document.getElementById('adShares') || {}).value;
    var shares = sharesRaw ? parseFloat(sharesRaw) : null;

    await _adSaveNotes();
    try {
        await atCreateTrade({
            ticker:     ctx.ticker,
            detector:   ctx.detector,
            scanId:     ctx.scan.id,
            scanDate:   ctx.scan.date || null,
            thesis:     ctx.candidate.thesisDraft || '',
            entryDate:  new Date().toISOString().slice(0, 10),
            entryPrice: entryPrice,
            shares:     shares,
            exits:      ctx.candidate.exits || { targetPct: 10, stopPct: 7, timeStopDays: 60 }
        });
        window.location.hash = '#analyzer/trades';
    } catch (e) {
        alert(e.message);
    }
}

// Persist thesis + exits onto the scan doc's candidate entry
async function _adSaveNotes() {
    var ctx = _adCtx;
    if (!ctx || !ctx.scan || !ctx.candidate) return;
    ctx.candidate.thesisDraft = (document.getElementById('adThesis') || {}).value || '';
    ctx.candidate.exits = {
        targetPct:    parseFloat((document.getElementById('adTarget')   || {}).value) || 10,
        stopPct:      parseFloat((document.getElementById('adStop')     || {}).value) || 7,
        timeStopDays: parseInt((document.getElementById('adTimeStop')   || {}).value, 10) || 60
    };
    try {
        await userCol('analyzerScans').doc(ctx.scan.id).update({ candidates: ctx.scan.candidates });
        var msg = document.getElementById('adSavedMsg');
        if (msg) {
            msg.classList.remove('hidden');
            setTimeout(function() { msg.classList.add('hidden'); }, 2500);
        }
    } catch (e) {
        console.error('[dossier] save failed:', e);
        alert('Could not save: ' + e.message);
    }
}
