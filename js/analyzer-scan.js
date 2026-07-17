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
    driftCalendarDays: 21,  // trailing window to look back for recent reports
    // Detector C (estimate-revision momentum) — runs off our weekly snapshots
    revMinEstPct: 3, revMinSpanDays: 28, revMinAnalysts: 3, revMaxWeeks: 12
};

var _asRunning   = false;
var _asLatestScan = null;   // {id, ...doc} of the scan being displayed

var AS_DET_LABELS = { dipA: '📉 Panic dip on quality', springD: '🌀 Compressed spring', driftB: '🚀 Post-earnings drift', revC: '📈 Revision momentum' };

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

        // Record this week's estimate snapshot once (feeds the divergence
        // metric over time). Fire-and-forget — never blocks or fails the scan.
        _asMaybeSnapshotEstimates();
    } catch (e) {
        console.error('[scan] failed:', e);
        if (prog) prog.innerHTML = '<p class="muted-text">✗ Scan failed: ' + escapeHtml(e.message) + '</p>';
    }

    _asRunning = false;
    if (btn) { btn.disabled = false; btn.textContent = '▶ Run scan'; }
}

// Once per week, snapshot the whole universe's analyst EPS consensus so the
// divergence metric has history to compare against. Only runs with an FMP key
// and only if this week has no snapshot yet. Progress shows below the scan.
async function _asMaybeSnapshotEstimates() {
    try {
        if (typeof anaFmpGetKey !== 'function') return;
        if (!(await anaFmpGetKey())) return;
        if (await anaEstCurrentWeekHasSnapshot()) return;
        await Promise.all([_anaLoadSp500(), _anaLoadUniverseCfg(), _anaLoadHoldingTickers()]);
        var tickers = _anaEffectiveUniverse();
        var prog = document.getElementById('asProgress');
        var res = await anaFmpSnapshotEstimates(tickers, function(done, total) {
            if (prog) prog.innerHTML = '<p class="muted-text">📸 Recording estimate snapshot for divergence tracking… ' + done + ' / ' + total + '</p>';
        });
        if (prog) prog.innerHTML = '<p class="muted-text">📸 Estimate snapshot saved (' + res.count + ' tickers).</p>';
    } catch (e) {
        console.log('[scan] estimate snapshot skipped: ' + e.message);
    }
}

// Extract one ticker's ascending EPS-estimate series from the loaded weekly
// snapshot docs → [{date, eps, analysts}] (only weeks that covered the ticker).
function _asExtractEstSeries(snapshotDocs, ticker) {
    var series = [];
    snapshotDocs.forEach(function(doc) {
        var e = doc.data && doc.data[ticker];
        if (e && e.epsCurrY != null) series.push({ date: doc.date, eps: e.epsCurrY, analysts: e.numAnalysts });
    });
    return series;
}

async function _asComputeScan(onNote) {
    var cfg = AS_DEFAULTS;

    // Fresh FMP quota/plan-limit tracking for this scan (Stage 3.5).
    if (typeof anaFmpResetCounters === 'function') anaFmpResetCounters();

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
        driftCal = await anaEarningsCalendar(calFrom, calTo);
    } catch (e0) {
        console.log('[scan] drift earnings calendar skipped: ' + e0.message);
    }

    // Detector C needs our accumulated weekly estimate snapshots (last 12
    // weeks, ascending). Empty until ≥3 snapshots exist — then it "arms itself".
    var snapshotDocs = [];
    try {
        var snapQ = await userCol('analyzerEstimates').orderBy('date', 'desc').limit(cfg.revMaxWeeks).get();
        snapQ.forEach(function(d) { snapshotDocs.push(d.data()); });
        snapshotDocs.reverse();
    } catch (eS) { console.log('[scan] estimate snapshots unavailable: ' + eS.message); }

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

        // Detector C — estimate-revision momentum (needs ≥3 weekly snapshots)
        if (snapshotDocs.length >= 3) {
            var series = _asExtractEstSeries(snapshotDocs, t);
            var rev = anaEngRevisionTrigger(rec, series, t, {
                minEstPct: cfg.revMinEstPct, minSpanDays: cfg.revMinSpanDays, minAnalysts: cfg.revMinAnalysts
            });
            if (rev) {
                funnel.triggered++;
                candidates.push({
                    ticker: t, detector: 'revC',
                    close: rev.close,
                    estChangePct: rev.estChangePct,
                    priceChangePct: rev.priceChangePct,
                    gapPts: rev.gapPts,
                    weeksCovered: rev.weeksCovered,
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

    var revs = candidates.filter(function(c) { return c.detector === 'revC'; });
    revs.sort(function(a, b) { return b.gapPts - a.gapPts; });

    var shortlist = dips.slice(0, cfg.maxPerDetector)
        .concat(springs.slice(0, cfg.maxPerDetector))
        .concat(drifts.slice(0, cfg.maxPerDetector))
        .concat(revs.slice(0, cfg.maxPerDetector));
    funnel.shortlisted = shortlist.length;

    // Catalyst map (Stage 2.4/3.5): Finnhub earnings calendar is PRIMARY (all
    // symbols in one call); the unified provider silently falls back to FMP if
    // Finnhub throws (no key / rate limit). For every candidate with an upcoming
    // report in the window, also stamp the stock's typical earnings-day move.
    if (onNote) onNote('Checking earnings calendar…');
    var earnings = null;
    try {
        var eFrom = new Date().toISOString().slice(0, 10);
        var eTo   = new Date(Date.now() + cfg.windowDays * 86400000).toISOString().slice(0, 10);
        var cal   = await anaEarningsCalendar(eFrom, eTo);
        earnings = {};
        Object.keys(cal).forEach(function(sym) { earnings[sym] = cal[sym].date; });
    } catch (e) {
        console.log('[scan] earnings calendar unavailable (Finnhub + FMP): ' + e.message);
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
            dc.insiders = await anaInsiders(dc.ticker, since);
        } catch (e3) {
            dc.insiders = { error: e3.message };
        }
    }

    // Analyst evidence + divergence (Stage 3.2, FMP) — only when a key exists.
    var fmpKey = '';
    try { fmpKey = (typeof anaFmpGetKey === 'function') ? await anaFmpGetKey() : ''; } catch (e4) {}
    if (fmpKey) {
        var snapB = await anaEstGetLatestSnapshot();          // latest snapshot overall
        var snapCount = await anaEstCountSnapshots();
        var since60 = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
        for (var a = 0; a < shortlist.length; a++) {
            var ac = shortlist[a];
            // Guardrail (Stage 3.5): a limited/free key answers these with 402.
            // After a few, stop hammering — truncate enrichment cleanly instead
            // of failing per candidate, and label why on the remaining cards.
            if (typeof anaFmpPlanLimited === 'function' && anaFmpPlanLimited()) {
                ac.divergenceNote = 'analyst data not included in the current FMP plan';
                continue;
            }
            if (onNote) onNote('Analyst view ' + (a + 1) + ' / ' + shortlist.length + ' — ' + ac.ticker + '…');
            try { ac.estimates   = await anaFmpEstimates(ac.ticker); }   catch (e5) { ac.estimates = null; }
            try { ac.priceTarget = await anaFmpPriceTarget(ac.ticker); } catch (e6) { ac.priceTarget = null; }
            try { ac.grades      = await anaFmpGrades(ac.ticker, since60); } catch (e7) { ac.grades = null; }

            // Divergence (flagship) — dip candidates with snapshot coverage
            if (ac.detector === 'dipA') {
                var arec  = await anaGetPriceHistory(ac.ticker);
                var snapA = ac.peakDate ? await anaEstGetSnapshotOnOrBefore(ac.peakDate) : null;
                var div   = (arec && snapA && snapB)
                    ? anaEngDivergence(arec, snapA, snapB, ac.ticker, ac.peakDate, arec.dates.length - 1)
                    : null;
                if (div) ac.divergence = div;
                else ac.divergenceNote = (snapCount < 2)
                    ? 'needs ' + (2 - snapCount) + ' more weekly snapshot' + (2 - snapCount === 1 ? '' : 's')
                    : 'not covered by snapshots yet';
            }
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
    // Discover-mode names (Stage 3.4) for non-S&P tickers
    if (typeof _anaUniverseCfg !== 'undefined' && _anaUniverseCfg && Array.isArray(_anaUniverseCfg.discoverList)) {
        var d = _anaUniverseCfg.discoverList.find(function(c) { return c.t === ticker; });
        if (d) return d.n;
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

    ['dipA', 'springD', 'driftB', 'revC'].forEach(function(det) {
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

function _asPct(v)    { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }
function _asPtsStr(v) { return (v >= 0 ? '+' : '') + v.toFixed(1); }

// Plain-language hover tooltip for a scan-card chip, matched by its rendered
// text (native title="" tooltip, same pattern as .loan-calc-tip elsewhere).
// Pattern-matching (rather than tagging every push site) means ONE place
// explains every chip type, including the shared quality/analyst chips.
// Returns '' when no explanation is defined — chip renders with no tooltip.
function _asChipTip(text) {
    if (/^Est .*→.*pts/.test(text))
        return 'Compares how much Wall Street’s earnings estimate for this company changed against how much the price changed. A big gap means the price moved much more than the actual business outlook did — a sign the move is driven by fear or hype, not fundamentals.';
    if (text === '⚠️ Falling knife?')
        return 'A caution flag, not a rejection: this company is both unprofitable and carries heavy debt (debt-to-equity over 2). Stocks like this can keep falling instead of bouncing back — worth a closer look before assuming this is a "buy the dip" situation.';
    if (/^Similar dips:/.test(text))
        return 'Looks at every time in the past 5 years this specific stock fell this hard, this fast. This is how many of those past episodes recovered by +10% within 60 days, and the typical (median) number of days it took.';
    if (/^No similar past dips/.test(text))
        return 'This stock has never fallen this sharply, this quickly, in its available price history — there’s no past episode to compare against, so there’s no track record either way.';
    if (text === 'Revenue beat too')
        return 'The company’s revenue (total sales), not just earnings-per-share, also came in above what analysts expected — a broader sign of a genuinely strong quarter.';
    if (/^Est gap:/.test(text))
        return 'The gap between how much analysts raised their earnings estimate and how much the stock price actually moved. A positive gap means the company’s outlook is improving faster than the price has caught up to yet.';
    if (/^Base rate:/.test(text))
        return 'A historical frequency, not a prediction: looking back over this stock’s own ~5 years of price history, the percentage of all rolling 60-day windows in which the price rose at least 10% at some point. It doesn’t know a dip is happening right now — it just measures how often this stock is capable of a move like that in any 2-month stretch.';
    if (/^⚠️ Earnings/.test(text))
        return 'This company reports earnings on this date, which falls inside your trading window. The ± number is how much this stock has historically swung on its biggest single-day moves — a rough gauge of how much risk that one day adds.';
    if (text === '✅ Profitable' || text === '⚠️ Unprofitable')
        return 'Whether the company’s net profit margin was positive (making money) or negative (losing money) over the trailing twelve months.';
    if (/^Debt\/eq/.test(text))
        return 'Debt-to-equity ratio — how much the company has borrowed compared to what shareholders own. Higher numbers (especially over 2) mean more financial risk, particularly if the business hits a rough patch.';
    if (/^Div \d/.test(text))
        return 'Dividend yield — the annual cash dividend as a percentage of the current share price. Not directly part of the trade setup, but useful context on the kind of company this is.';
    if (/^👤 Insider buys:/.test(text))
        return 'Company insiders (executives, board members) bought shares with their own money since this dip began. One of the stronger confidence signals — insiders have no obligation to buy, and know the business best.';
    if (/^Divergence:/.test(text))
        return 'The flagship price-vs-estimate comparison isn’t ready yet — it needs a few more weeks of the app’s own tracked analyst-estimate history before it can measure the gap for this dip.';
    if (/^Target \$/.test(text))
        return 'The average 12-month price target from Wall Street analysts covering this stock, and how far that is from the current price. Analyst targets can be wrong or slow to update — treat this as one more data point, not a guarantee.';
    if (/^▲/.test(text))
        return 'How many analysts raised (▲) or lowered (▼) their rating on this stock in the last 60 days. More upgrades than downgrades suggests improving sentiment among professional analysts.';
    return '';
}

// Renders one scan-card chip with its tooltip attached (see _asChipTip).
function _asChipSpan(text, cls) {
    var tip = _asChipTip(text);
    return '<span class="as-chip' + (cls ? ' ' + cls : '') + '"' + (tip ? ' title="' + escapeHtml(tip) + '"' : '') + '>' + escapeHtml(text) + '</span>';
}

// Analyst / divergence chips (Stage 3.2). Returns { lead:[], rest:[] } —
// the divergence chip is the FLAGSHIP and leads the whole row. Empty when a
// candidate has no FMP enrichment (old scans, no key) so cards stay compatible.
function _asAnalystChips(c) {
    var lead = [], rest = [];
    if (c.divergence) {
        var d = c.divergence;
        var strong = d.divergencePts >= 5;   // estimates held up much better than price
        lead.push({
            text: 'Est ' + _asPct(d.estChangePct) + ' vs price ' + _asPct(d.priceChangePct) +
                  ' → ' + _asPtsStr(d.divergencePts) + ' pts' + (strong ? ' emotional' : ''),
            cls: strong ? 'as-chip-good' : 'as-chip'
        });
    } else if (c.divergenceNote) {
        rest.push({ text: 'Divergence: ' + c.divergenceNote, cls: 'as-chip' });
    }
    if (c.priceTarget && c.priceTarget.targetConsensus != null && c.close) {
        var pct = (c.priceTarget.targetConsensus / c.close - 1) * 100;
        rest.push({ text: 'Target $' + c.priceTarget.targetConsensus + ' (' + _asPct(pct) + ' vs price)', cls: 'as-chip' });
    }
    if (c.grades && (c.grades.upgrades || c.grades.downgrades)) {
        rest.push({ text: '▲' + c.grades.upgrades + '/▼' + c.grades.downgrades + ' last 60d', cls: 'as-chip' });
    }
    return { lead: lead, rest: rest };
}

// ---------------------------------------------------------------------------
// Candidate scoring (Ranking plan Phase 1 — dipA only so far)
// ---------------------------------------------------------------------------
// Turns a candidate's stamped evidence into a 0–100 composite score + letter
// grade so candidates can be RANKED instead of eyeballed chip-by-chip. The
// weights and band mappings are subjective by design and documented (with
// rationale) in StockAnalysisRankingPlan.md — change them there first.
//
// Missing data is EXCLUDED and the remaining weights renormalized, never
// penalized — a candidate isn't punished because an FMP key isn't configured
// or its history is short. `coverage` (the % of the full model's weight that
// was actually available) is the honesty mechanism: a grade built on 40% of
// the model reads differently from one built on 95%.

// Returns the subscore for the first band whose (exclusive) upper bound the
// value sits under; `bands` = [[upperBound, subscore], ...] in ascending
// order, `topScore` = the subscore when the value clears every upper bound.
function _asBand(value, bands, topScore) {
    for (var i = 0; i < bands.length; i++) {
        if (value < bands[i][0]) return bands[i][1];
    }
    return topScore;
}

// Grade cutoffs sit lower than school grades ON PURPOSE: the band mappings
// top out at 95–100 but realistic values land mid-band, so a hand-computed
// excellent candidate totals ~77 — under school-style cutoffs an A would be
// mathematically unreachable. See the ranking plan's "Why the grade cutoffs
// sit lower" note.
function _asGradeLetter(total) {
    if (total >= 80) return 'A';
    if (total >= 70) return 'B';
    if (total >= 55) return 'C';
    if (total >= 40) return 'D';
    return 'F';
}

// Scores a dipA candidate. Returns:
//   { total, grade, coverage,
//     breakdown:  [{label, raw, subscore, weight, contribution}],   // included metrics
//     excluded:   [{label, why}],                                    // missing data, renormalized away
//     deductions: [{label, points}] }                                // risk flags subtracted at the end
// Returns null when there is nothing at all to score.
function _asScoreDip(c) {
    var inc = [], exc = [], ded = [];
    var qualityOk = !!(c.quality && !c.quality.error);
    var q = qualityOk ? c.quality : {};

    // --- Setup-specific evidence (the strongest signals — see plan rationale) ---
    // Conditional base rate needs >=3 past episodes to be signal rather than noise.
    if (c.condEvents >= 3) {
        inc.push({ label: 'Similar-dips hit rate', raw: c.condHits + ' of ' + c.condEvents,
                   subscore: Math.round(c.condHits / c.condEvents * 100), weight: 20 });
    } else {
        exc.push({ label: 'Similar-dips hit rate',
                   why: (c.condEvents || 0) + ' past episode' + (c.condEvents === 1 ? '' : 's') + ' — needs 3+ to be signal' });
    }

    // Banded, not direct: every candidate already passed the >=25% scan cutoff,
    // so a raw % would drag all scores down equally without separating anyone.
    if (c.baseRate != null) {
        inc.push({ label: 'Base rate', raw: Math.round(c.baseRate * 100) + '%',
                   subscore: _asBand(c.baseRate * 100, [[30, 35], [40, 50], [55, 70], [70, 85]], 95), weight: 8 });
    } else {
        exc.push({ label: 'Base rate', why: 'not recorded on this candidate' });
    }

    if (c.divergence && c.divergence.divergencePts != null) {
        inc.push({ label: 'Divergence', raw: _asPtsStr(c.divergence.divergencePts) + ' pts',
                   subscore: _asBand(c.divergence.divergencePts, [[0, 20], [5, 50], [10, 75], [20, 90]], 100), weight: 13 });
    } else {
        exc.push({ label: 'Divergence', why: c.divergenceNote || 'no FMP analyst data' });
    }

    if (c.rsi != null) {
        inc.push({ label: 'RSI-14', raw: c.rsi.toFixed(0),
                   subscore: _asBand(c.rsi, [[25, 70], [35, 85], [45, 65], [55, 45]], 30), weight: 6 });
    } else {
        exc.push({ label: 'RSI-14', why: 'not recorded on this candidate' });
    }

    if (c.volRatio != null) {
        inc.push({ label: 'Volume ratio', raw: c.volRatio.toFixed(1) + '× normal',
                   subscore: _asBand(c.volRatio, [[1, 40], [1.5, 55], [2.5, 75]], 85), weight: 5 });
    } else {
        exc.push({ label: 'Volume ratio', why: 'not recorded on this candidate' });
    }

    // --- Quality (balance-sheet risk filter, not an edge — see plan rationale) ---
    if (qualityOk && q.netMarginPct != null) {
        inc.push({ label: 'Net margin', raw: q.netMarginPct.toFixed(1) + '%',
                   subscore: _asBand(q.netMarginPct, [[0, 10], [5, 35], [15, 60], [25, 85]], 100), weight: 9 });
    } else {
        exc.push({ label: 'Net margin', why: qualityOk ? 'not reported for this company' : 'no quality data' });
    }

    if (qualityOk && q.debtToEquity != null) {
        inc.push({ label: 'Debt / equity', raw: q.debtToEquity.toFixed(1),
                   subscore: _asBand(q.debtToEquity, [[0.3, 100], [1, 80], [2, 55], [4, 25]], 5), weight: 7 });
    } else {
        exc.push({ label: 'Debt / equity', why: qualityOk ? 'not reported for this company' : 'no quality data' });
    }

    if (qualityOk && q.currentRatio != null) {
        inc.push({ label: 'Current ratio', raw: q.currentRatio.toFixed(1),
                   subscore: _asBand(q.currentRatio, [[1, 20], [1.5, 55], [3, 90]], 70), weight: 3 });
    } else {
        exc.push({ label: 'Current ratio', why: qualityOk ? 'not reported for this company' : 'no quality data' });
    }

    if (qualityOk && q.roePct != null) {
        inc.push({ label: 'Return on equity', raw: q.roePct.toFixed(1) + '%',
                   subscore: _asBand(q.roePct, [[0, 10], [10, 45], [20, 75], [35, 95]], 70), weight: 3 });
    } else {
        exc.push({ label: 'Return on equity', why: qualityOk ? 'not reported for this company' : 'no quality data' });
    }

    // Null dividend on a SUCCESSFUL quality fetch means "pays no dividend"
    // (Finnhub returns null for non-payers) — that's information, not missing
    // data, so it scores as the 0% band instead of being excluded.
    if (qualityOk) {
        var dy = (q.dividendYieldPct != null) ? q.dividendYieldPct : 0;
        inc.push({ label: 'Dividend yield', raw: dy.toFixed(1) + '%',
                   subscore: (dy <= 0) ? 50 : _asBand(dy, [[2, 60], [4, 70]], 60), weight: 4 });
    } else {
        exc.push({ label: 'Dividend yield', why: 'no quality data' });
    }

    // --- Analyst view (corroborating evidence, FMP-gated) ---
    if (c.priceTarget && c.priceTarget.targetConsensus != null && c.close) {
        var upPct = (c.priceTarget.targetConsensus / c.close - 1) * 100;
        inc.push({ label: 'Target upside', raw: _asPct(upPct),
                   subscore: _asBand(upPct, [[0, 20], [10, 50], [25, 75]], 95), weight: 8 });
    } else {
        exc.push({ label: 'Target upside', why: 'no FMP price-target data' });
    }

    if (c.grades) {
        var net = (c.grades.upgrades || 0) - (c.grades.downgrades || 0);
        inc.push({ label: 'Analyst grades (net 60d)', raw: '▲' + (c.grades.upgrades || 0) + '/▼' + (c.grades.downgrades || 0),
                   subscore: _asBand(net, [[-2, 10], [0, 35], [1, 55], [3, 75]], 95), weight: 5 });
    } else {
        exc.push({ label: 'Analyst grades', why: 'no FMP grades data' });
    }

    // --- Insider signal (zero purchases is a real observation, not missing data) ---
    if (c.insiders && !c.insiders.error) {
        var buys = (c.insiders.purchases || []).length;
        inc.push({ label: 'Insider buys', raw: String(buys),
                   subscore: _asBand(buys, [[1, 45], [3, 70]], 95), weight: 9 });
    } else {
        exc.push({ label: 'Insider buys', why: 'no insider data' });
    }

    // --- Risk deductions (flags subtract from the total, they don't reweight) ---
    if (qualityOk && q.profitable === false && q.debtToEquity != null && q.debtToEquity > 2) {
        ded.push({ label: 'Falling knife (unprofitable + heavy debt)', points: 15 });
    }
    if (c.earningsDate) {
        // Flat −5 when the typical-move number is unknown — never assume it exists.
        var pts = (c.eventMovePct != null) ? Math.min(10, Math.round(c.eventMovePct / 2)) : 5;
        ded.push({ label: 'Earnings ' + c.earningsDate + ' inside the window', points: pts });
    }

    // --- Total: renormalize over included weights, subtract deductions, clamp ---
    var wSum = 0, wsSum = 0;
    inc.forEach(function(m) { wSum += m.weight; wsSum += m.weight * m.subscore; });
    if (wSum === 0) return null;   // nothing scoreable at all
    var dedSum = 0;
    ded.forEach(function(d) { dedSum += d.points; });
    var total = Math.round(Math.max(0, Math.min(100, wsSum / wSum - dedSum)));
    inc.forEach(function(m) { m.contribution = Math.round(m.weight * m.subscore / wSum * 10) / 10; });

    return { total: total, grade: _asGradeLetter(total), coverage: wSum,
             breakdown: inc, excluded: exc, deductions: ded };
}

// Scores any candidate — dispatches to the detector's scorer. Returns null
// for detectors whose scorer hasn't shipped yet (spring/drift/revision land
// in Phase 2 of the ranking plan) so callers can skip the badge cleanly.
function _asScoreCard(c) {
    if (!c) return null;
    if (c.detector === 'dipA') return _asScoreDip(c);
    return null;
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
    } else if (c.detector === 'revC') {
        badge  = 'est ' + _asPct(c.estChangePct) + ' vs price ' + _asPct(c.priceChangePct);
        reason = 'Analysts raised this year’s earnings estimate ' + _asPct(c.estChangePct) + ' over ' +
                 c.weeksCovered + ' weeks while the price moved ' + _asPct(c.priceChangePct) + ' — fundamentals outrunning the price.';
        chips.push('Est gap: ' + _asPtsStr(c.gapPts) + ' pts (est vs price)');
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
    var analyst = _asAnalystChips(c);
    // Divergence (flagship) leads the whole row, ahead of everything else.
    analyst.lead.forEach(function(ac) { html += _asChipSpan(ac.text, ac.cls); });
    // Falling-knife flag leads the row (amber) when quality data warrants it.
    _asQualityChips(c).forEach(function(qc) {
        if (qc.lead) html += _asChipSpan(qc.text, qc.cls);
    });
    chips.forEach(function(ch) { html += _asChipSpan(ch); });
    var earnChip = _asEarningsChipText(c);
    if (earnChip) {
        html += _asChipSpan(earnChip, 'as-chip-warn');
    }
    // Quality + insider evidence chips (non-lead) after the base-rate chip.
    _asQualityChips(c).forEach(function(qc) {
        if (!qc.lead) html += _asChipSpan(qc.text, qc.cls);
    });
    // Analyst evidence (target, grades, divergence-note) after quality.
    analyst.rest.forEach(function(ac) { html += _asChipSpan(ac.text, ac.cls); });
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
    // Sentinel scanId 'none' (Stage 3.5) marks a dossier opened outside a scan
    // — e.g. the Stock Rollup "🎯 Show dossier" button on a held ticker. Same
    // page, same evidence, but no candidate record behind it (read-only mode).
    var fromScan = scanId && scanId !== 'none';
    _analyzerBreadcrumb(fromScan ? [
        { label: 'Stock Analyzer', href: '#analyzer' },
        { label: 'Scan', href: '#analyzer/scan' },
        { label: ticker }
    ] : [
        { label: 'Stock Rollup', href: '#investments/stocks' },
        { label: ticker }
    ]);
    var page = document.getElementById('page-analyzer-dossier');
    if (!page) return;
    page.innerHTML = '<p class="muted-text" style="padding:16px">Building dossier…</p>';

    // Price history is the backbone — without it there is no dossier. Auto-
    // fetch on demand (Stage 3.5) when it isn't cached yet — e.g. a Stock
    // Rollup holding that's never been through an Analyzer price update.
    var rec;
    try { rec = await anaGetPriceHistory(ticker); } catch (e) { rec = null; }
    if (!rec || rec.dates.length < 260) {
        page.innerHTML = '<p class="muted-text" style="padding:16px">Fetching price history for ' + escapeHtml(ticker) + '…</p>';
        try { await _anaUpdateTicker(ticker); } catch (e) { /* fall through to the error state below */ }
        try { rec = await anaGetPriceHistory(ticker); } catch (e) { rec = null; }
    }
    if (!rec || rec.dates.length < 260) {
        page.innerHTML = '<p class="muted-text" style="padding:16px">Couldn’t fetch enough price history for ' + escapeHtml(ticker) +
            ' (need about a year of daily candles). It may be an invalid ticker, too newly listed, or not covered by the configured price providers.</p>';
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
                var cal = await anaEarningsCalendar(from120, new Date().toISOString().slice(0, 10));
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

    // Detector C evidence — the ticker's EPS-estimate series from our snapshots.
    if (detector === 'revC') {
        try {
            var snapQ2 = await userCol('analyzerEstimates').orderBy('date', 'desc').limit(AS_DEFAULTS.revMaxWeeks).get();
            var docs2 = []; snapQ2.forEach(function(d) { docs2.push(d.data()); }); docs2.reverse();
            var series = _asExtractEstSeries(docs2, ticker);
            var rtr = anaEngRevisionTrigger(rec, series, ticker, {
                minEstPct: AS_DEFAULTS.revMinEstPct, minSpanDays: AS_DEFAULTS.revMinSpanDays, minAnalysts: AS_DEFAULTS.revMinAnalysts
            });
            ev.revision = { series: series, trigger: rtr };
        } catch (e) { /* leave ev.revision undefined */ }
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
    var isRev   = ctx.detector === 'revC';

    // Header + badge
    var badge;
    if (isRev && ev.revision && ev.revision.trigger)
                                  badge = 'est ' + _asPct(ev.revision.trigger.estChangePct) + ' vs price ' + _asPct(ev.revision.trigger.priceChangePct);
    else if (isDrift && ev.drift) badge = 'beat +' + ev.drift.epsSurprisePct.toFixed(1) + '% · day1 +' + ev.drift.day1RetPct.toFixed(1) + '%';
    else if (isDip && ev.dip)     badge = '−' + ev.dip.dropPct.toFixed(1) + '% in ' + ev.dip.daysSincePeak + 'd';
    else if (!isDip && !isDrift && !isRev && ev.spring) badge = 'vol ' + ev.spring.vol.toFixed(2) + ' · ' + ev.spring.pctFromHigh.toFixed(1) + '% off high';
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
    var adAnalyst = _asAnalystChips(ctx.candidate || {});
    html += '<div class="as-chip-row" style="margin-bottom:12px">';
    adAnalyst.lead.forEach(function(ac) { html += '<span class="as-chip ' + ac.cls + '">' + escapeHtml(ac.text) + '</span>'; });
    _asQualityChips(ctx.candidate || {}).forEach(function(qc) {
        if (qc.lead) html += '<span class="as-chip ' + qc.cls + '">' + escapeHtml(qc.text) + '</span>';
    });
    chips.forEach(function(c) { html += '<span class="as-chip">' + escapeHtml(c) + '</span>'; });
    _asQualityChips(ctx.candidate || {}).forEach(function(qc) {
        if (!qc.lead) html += '<span class="as-chip ' + qc.cls + '">' + escapeHtml(qc.text) + '</span>';
    });
    adAnalyst.rest.forEach(function(ac) { html += '<span class="as-chip ' + ac.cls + '">' + escapeHtml(ac.text) + '</span>'; });
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

    // Estimate-history table (Detector C) — how the consensus EPS moved week by week
    if (isRev && ev.revision) {
        var sers = ev.revision.series || [];
        var trg  = ev.revision.trigger;
        if (trg) {
            html += '<p class="muted-text">📈 Consensus EPS rose ' + _asPct(trg.estChangePct) + ' over ' + trg.weeksCovered +
                ' weekly snapshots while the price moved ' + _asPct(trg.priceChangePct) + ' — a ' + _asPtsStr(trg.gapPts) + '-point gap.</p>';
        }
        if (sers.length) {
            html += '<h3 class="ana-section-title">Estimate history — ' + escapeHtml(ctx.ticker) + '</h3>' +
                '<div class="ab-table-wrap"><table class="ab-table"><tr><th>Snapshot</th><th>Consensus EPS</th><th>Analysts</th></tr>';
            sers.forEach(function(s) {
                html += '<tr><td>' + escapeHtml(s.date) + '</td><td>' + (s.eps != null ? s.eps.toFixed(2) : '—') + '</td><td>' + (s.analysts != null ? s.analysts : '—') + '</td></tr>';
            });
            html += '</table></div>';
        } else {
            html += '<p class="muted-text">No estimate snapshots recorded yet — this detector arms itself once a few weekly snapshots exist.</p>';
        }
    }

    // Quality section (Stage 2.2) — filled async by _adRenderQuality after render
    html += '<h3 class="ana-section-title">🏥 Quality</h3>' +
        '<div id="adQuality"><p class="muted-text">Loading quality data…</p></div>';

    // Analyst view (Stage 3.2) — filled async by _adRenderAnalyst after render
    html += '<h3 class="ana-section-title">🧮 Analyst view</h3>' +
        '<div id="adAnalyst"><p class="muted-text">Loading analyst data…</p></div>';

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

    // Recent news + optional AI read (Stage 2.5; accordion + range chooser
    // Stage 3.5 — a dip that happened weeks ago needs a wider look-back than
    // a fixed 14 days, or the headline that actually explains it gets missed).
    var newsDays  = _adDefaultNewsDays(ev);
    var newsIsPreset = (newsDays === 14 || newsDays === 30 || newsDays === 60);
    html += '<div class="detail-acc open" id="adNewsAcc">' +
        '<div class="detail-acc-header" onclick="toggleDetailAcc(\'adNewsAcc\')">' +
            '<span class="detail-acc-chevron">&#9658;</span>' +
            '<span class="detail-acc-title">📰 Recent news</span>' +
            '<span class="detail-acc-count" id="adNewsCount"></span>' +
        '</div>' +
        '<div class="detail-acc-body">' +
            '<div class="ab-form-row" style="margin-bottom:10px">' +
                '<label>Look back ' +
                    '<select id="adNewsRangeSel" onchange="_adNewsRangeChange()">' +
                        '<option value="14"' + (newsDays === 14 ? ' selected' : '') + '>2 weeks</option>' +
                        '<option value="30"' + (newsDays === 30 ? ' selected' : '') + '>1 month</option>' +
                        '<option value="60"' + (newsDays === 60 ? ' selected' : '') + '>2 months</option>' +
                        '<option value="custom"' + (!newsIsPreset ? ' selected' : '') + '>Custom…</option>' +
                    '</select>' +
                '</label>' +
                '<input type="number" id="adNewsCustomDays" min="1" max="730" step="1" placeholder="# of days" ' +
                    'value="' + (!newsIsPreset ? newsDays : '') + '" style="width:90px' + (newsIsPreset ? ';display:none' : '') + '" ' +
                    'onchange="_adNewsRangeChange()">' +
            '</div>' +
            (newsDays > 14 ? '<p class="muted-text" style="font-size:0.8rem;margin-top:-4px">Widened automatically — this dip started more than 2 weeks ago.</p>' : '') +
            '<div id="adNews"><p class="muted-text">Loading news…</p></div>' +
        '</div>' +
    '</div>';

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
                : '<span class="muted-text">Read-only — ' + (ctx.scanId && ctx.scanId !== 'none'
                    ? 'this dossier’s scan snapshot is missing, so notes can’t be saved.'
                    : 'opened from Stock Rollup rather than a scan, so there’s no candidate record to save notes to.') + '</span>') +
            (ctx.scanId && ctx.scanId !== 'none'
                ? '<a class="ana-sp-btn" href="#analyzer/scan" style="text-decoration:none">← Back to scan</a>'
                : '<a class="ana-sp-btn" href="#investments/stocks" style="text-decoration:none">← Back to Stock Rollup</a>') +
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
    _adRenderAnalyst();
    _adRenderNews(ev, newsDays);
}

// ---------------------------------------------------------------------------
// Metric glossary — "?" info popups on the dossier's 🏥 Quality and 🧮 Analyst
// view sections (Stage 3.5 UX pass). Each entry: `simple` answers "what is
// it" / "why does it matter" / "good vs bad values" in plain language
// (always shown); `deep` is optional — the technical detail (source field,
// formula, caveats) for whoever wants to dig further, shown below the simple
// answer.
// ---------------------------------------------------------------------------
var AD_INFO = {
    'quality-profitable': {
        title: 'Profitable',
        simple: 'Whether the company made money over the last 12 months (Yes) or lost money (No). A profitable company is generally better positioned to survive a rough patch. Unprofitable isn’t automatically bad — plenty of young or fast-growing companies run at a loss on purpose — but paired with heavy debt it’s a warning sign (see the ⚠️ Falling knife? flag).',
        deep: 'Based on trailing-twelve-month net profit margin (net income ÷ revenue) from Finnhub. "Yes" = margin above 0%; "No" = margin at or below 0%.'
    },
    'quality-netmargin': {
        title: 'Net margin',
        simple: 'The share of revenue the company actually keeps as profit after all expenses. A 20% net margin means it keeps $0.20 of every $1 it brings in. Higher is generally better, but margins vary hugely by industry (a grocery chain might run 2–3%, a software company 20–30%+) — compare within the same kind of business rather than to one universal number.',
        deep: 'Trailing-twelve-month net profit margin from Finnhub (`netProfitMarginTTM`, with fallback field names when unavailable).'
    },
    'quality-debteq': {
        title: 'Debt / equity',
        simple: 'How much the company has borrowed compared to what shareholders actually own. A value of 1.0 means debt equals equity; 2.0 means it owes twice what shareholders’ stake is worth. Lower is generally safer — under ~1.0 is conservative, 1.0–2.0 is common for many industries, and above 2.0 is flagged amber here as meaningfully more leveraged, which is riskier if revenue drops or rates rise.',
        deep: 'Total debt ÷ total shareholders’ equity, most recent quarter from Finnhub (annual fallback if the quarterly figure is unavailable). Capital-intensive industries (utilities, real estate, airlines) run structurally higher debt/equity than software or services — the 2.0 amber threshold is a rough universal cutoff, not industry-adjusted.'
    },
    'quality-currentratio': {
        title: 'Current ratio',
        simple: 'Whether the company has enough cash and short-term assets to cover what it owes in the next year. A ratio of 2.0 means $2 of short-term assets for every $1 of short-term debt. Above 1.0 generally means it can cover near-term bills; below 1.0 can be a liquidity warning sign. Very high (3.0+) sometimes just means idle cash — not necessarily bad, just worth noting.',
        deep: 'Current assets ÷ current liabilities, most recent quarter, from Finnhub.'
    },
    'quality-divyield': {
        title: 'Dividend yield',
        simple: 'The annual cash dividend as a percentage of the current share price — a 2% yield means about $2 a year for every $100 invested, just from dividends. Not part of the trade setup itself; shown as extra context. An unusually high yield (8%+) can sometimes signal the market expects a dividend cut, so it’s worth a second look.',
        deep: 'Indicated annual dividend yield (trailing twelve months) from Finnhub.'
    },
    'quality-roe': {
        title: 'Return on equity',
        simple: 'How efficiently the company turns shareholders’ money into profit. A 15% ROE means $15 of profit for every $100 of shareholder equity. Higher is generally better — it’s a classic sign of a well-run, efficient business. Very high ROE (50%+) can sometimes be driven by heavy debt rather than genuine efficiency, so it’s worth checking debt/equity alongside it.',
        deep: 'Net income ÷ shareholders’ equity, trailing twelve months, from Finnhub.'
    },
    'quality-insiders': {
        title: 'Insider open-market purchases',
        simple: 'Whether people who run the company (executives, board members) have bought shares with their own money recently — and if so, who, how many, and at what price. Insider buying is one of the more meaningful signals available: insiders have no obligation to buy, know the business better than anyone, and are putting their own money on the line. Buying during or right after a dip is a strong vote of confidence. No purchases doesn’t necessarily mean anything — most insiders simply don’t trade often.',
        deep: 'Only counts open-market purchases (SEC Form 4 transaction code \'P\') — not stock granted as compensation, option exercises, or other transaction types, which aren’t a confidence signal the same way. Sourced from Finnhub’s insider-transactions feed, with an FMP fallback (Stage 3.5).'
    },
    'analyst-epscurr': {
        title: 'Consensus EPS (this FY)',
        simple: 'What Wall Street analysts, on average, expect this company to earn per share this fiscal year. Not good or bad on its own — what matters is whether it’s rising or falling over time, and whether the stock price is keeping pace. A rising estimate with a falling price is the "divergence" opportunity this tool is built to find (see the flagship chip on the scan card).',
        deep: 'Consensus (average) analyst forecast for the current forward fiscal year, from FMP’s `analyst-estimates` endpoint (annual estimates; "current" year = the next fiscal-year-end on or after today).'
    },
    'analyst-epsnext': {
        title: 'Consensus EPS (next FY)',
        simple: 'The same consensus earnings forecast, but for the fiscal year after this one — a look further out. Useful as a sanity check: if next year’s estimate is much higher than this year’s, analysts expect meaningful growth ahead.',
        deep: 'Same FMP source as the current-FY estimate, one fiscal year further out.'
    },
    'analyst-target': {
        title: 'Price target (consensus)',
        simple: 'The average 12-month price target from analysts who cover this stock, and how far that is from where the price sits right now. A target well above the current price suggests analysts see room to run — but treat it as one data point, not a guarantee. Targets get revised often and can lag reality, especially right after a sharp move.',
        deep: 'Consensus (average) analyst 12-month price target from FMP’s `price-target-consensus` endpoint.'
    },
    'analyst-targetrange': {
        title: 'Target range',
        simple: 'The lowest and highest individual price targets among analysts covering the stock — a measure of how much they actually disagree. A narrow range means broad agreement on where the stock is headed; a wide range means real disagreement, whether because the future is genuinely uncertain or coverage is thin.',
        deep: 'Low and high values from the same FMP `price-target-consensus` endpoint as the consensus target.'
    },
    'analyst-grades': {
        title: 'Analyst actions (last 60d)',
        simple: 'How many analysts raised (▲ upgrade), lowered (▼ downgrade), or kept (maintained) their rating on this stock in the last 60 days, with the most recent actions listed below. More upgrades than downgrades suggests professional sentiment is improving — a tailwind. More downgrades is a headwind, even if the price hasn’t reacted to it yet.',
        deep: 'Sourced from FMP’s `grades` endpoint (rating-change actions from research firms), filtered to the last 60 days client-side since the API’s `limit` parameter isn’t honored (Stage 3.0 finding).'
    }
};

// Renders a small "?" button next to a Quality/Analyst view label that opens
// the AD_INFO popup for that metric. No-op text (empty string) if unknown.
function _adInfoBtn(key) {
    if (!AD_INFO[key]) return '';
    return ' <button type="button" class="ad-info-btn" onclick="_adShowInfo(\'' + key + '\')" aria-label="What is this?">?</button>';
}

// Opens the shared #adInfoModal populated with one AD_INFO entry.
function _adShowInfo(key) {
    var info = AD_INFO[key];
    if (!info) return;
    var titleEl = document.getElementById('adInfoModalTitle');
    var bodyEl  = document.getElementById('adInfoModalBody');
    if (!titleEl || !bodyEl) return;
    titleEl.textContent = info.title;
    var html = '<p>' + escapeHtml(info.simple) + '</p>';
    if (info.deep) {
        html += '<div class="ad-info-modal-deep"><strong>In more depth:</strong> ' + escapeHtml(info.deep) + '</div>';
    }
    bodyEl.innerHTML = html;
    openModal('adInfoModal');
}

// Fill the dossier's Analyst view (Stage 3.2): consensus EPS (current + next
// FY), price-target range vs price, and recent grade actions. Uses the values
// stamped on the scan candidate when present; otherwise (deep link / old scan)
// fetches live from FMP when a key exists.
async function _adRenderAnalyst() {
    var host = document.getElementById('adAnalyst');
    if (!host || !_adCtx) return;
    var cand = _adCtx.candidate || {};
    var est = cand.estimates, tgt = cand.priceTarget, grd = cand.grades;

    if (!est && !tgt && !grd) {
        var key = '';
        try { key = (typeof anaFmpGetKey === 'function') ? await anaFmpGetKey() : ''; } catch (e) {}
        if (key) {
            try { est = await anaFmpEstimates(_adCtx.ticker); } catch (e) {}
            try { tgt = await anaFmpPriceTarget(_adCtx.ticker); } catch (e) {}
            try {
                var since60 = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
                grd = await anaFmpGrades(_adCtx.ticker, since60);
            } catch (e) {}
        }
    }
    host = document.getElementById('adAnalyst');
    if (!host) return;
    if (!est && !tgt && !grd) { host.innerHTML = '<p class="muted-text">Analyst data unavailable.</p>'; return; }

    var html = '';
    // Consensus EPS + target grid
    var rows = [];
    if (est) {
        if (est.epsCurrY != null) rows.push(['Consensus EPS (this FY)', est.epsCurrY.toFixed(2) + (est.numAnalysts ? ' · ' + est.numAnalysts + ' analysts' : ''), 'analyst-epscurr']);
        if (est.epsNextY != null) rows.push(['Consensus EPS (next FY)', est.epsNextY.toFixed(2), 'analyst-epsnext']);
    }
    if (tgt && tgt.targetConsensus != null) {
        var pct = _adCtx.close ? ' (' + _asPct((tgt.targetConsensus / _adCtx.close - 1) * 100) + ' vs price)' : '';
        rows.push(['Price target (consensus)', '$' + tgt.targetConsensus + pct, 'analyst-target']);
        if (tgt.targetLow != null && tgt.targetHigh != null) rows.push(['Target range', '$' + tgt.targetLow + ' – $' + tgt.targetHigh, 'analyst-targetrange']);
    }
    if (rows.length) {
        html += '<div class="ad-quality-grid">';
        rows.forEach(function(r) { html += '<div class="ad-quality-k">' + escapeHtml(r[0]) + _adInfoBtn(r[2]) + '</div><div class="ad-quality-v">' + escapeHtml(r[1]) + '</div>'; });
        html += '</div>';
    }
    // Recent grade actions
    if (grd && grd.latest && grd.latest.length) {
        html += '<p class="muted-text" style="margin-top:10px">Analyst actions (last 60d)' + _adInfoBtn('analyst-grades') + ': ▲' + (grd.upgrades || 0) + ' up · ▼' + (grd.downgrades || 0) + ' down · ' + (grd.maintains || 0) + ' maintained</p>' +
                '<div class="ab-table-wrap"><table class="ab-table"><tr><th>Date</th><th>Firm</th><th>Action</th><th>Rating</th></tr>';
        grd.latest.forEach(function(g) {
            html += '<tr><td>' + escapeHtml(g.date || '') + '</td><td>' + escapeHtml(g.company || '') + '</td><td>' + escapeHtml(g.action || '') + '</td><td>' + escapeHtml(g.to || '') + '</td></tr>';
        });
        html += '</table></div>';
    }
    host.innerHTML = html || '<p class="muted-text">Analyst data unavailable.</p>';
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
            insiders = await anaInsiders(_adCtx.ticker, since);
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
        rows.push(['Profitable',      quality.profitable == null ? '—' : (quality.profitable ? 'Yes' : 'No'), 'quality-profitable']);
        rows.push(['Net margin',      fmtPct(quality.netMarginPct), 'quality-netmargin']);
        rows.push(['Debt / equity',   fmtNum(quality.debtToEquity), 'quality-debteq']);
        rows.push(['Current ratio',   fmtNum(quality.currentRatio), 'quality-currentratio']);
        rows.push(['Dividend yield',  fmtPct(quality.dividendYieldPct), 'quality-divyield']);
        rows.push(['Return on equity', fmtPct(quality.roePct), 'quality-roe']);
    }
    var html = '';
    if (rows.length) {
        html += '<div class="ad-quality-grid">';
        rows.forEach(function(r) {
            html += '<div class="ad-quality-k">' + escapeHtml(r[0]) + _adInfoBtn(r[2]) + '</div>' +
                    '<div class="ad-quality-v">' + escapeHtml(r[1]) + '</div>';
        });
        html += '</div>';
    }
    if (insiders) {
        var buys = insiders.purchases || [];
        html += '<p class="muted-text" style="margin-top:10px">Insider open-market purchases (last few months)' + _adInfoBtn('quality-insiders') + ': ' +
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
var AD_AI_SYSTEM_DIP = "You are an analyst's assistant inside a personal stock-research tool. You NEVER give buy/sell/hold recommendations or price predictions. Your only job: assess whether a stock's recent decline looks EMOTIONAL (sentiment-driven, fundamentals intact) or STRUCTURAL (fundamentals actually impaired), based strictly on the provided headlines and metrics. Output format: line 1 = 'Read: EMOTIONAL', 'Read: STRUCTURAL', or 'Read: MIXED/UNCLEAR (leaning EMOTIONAL)' / 'Read: MIXED/UNCLEAR (leaning STRUCTURAL)'. Only use plain 'Read: MIXED/UNCLEAR' with no lean if the evidence is genuinely balanced with no tilt either way — that should be rare; usually pick the side the evidence leans toward even when it's not clear-cut. Then 2–4 short bullets citing specific provided evidence; then one line starting 'Watch for:' with what would change the read. Under 150 words. If the headlines don't explain the move, say so plainly, but still give your best lean based on the metrics alone.";
var AD_AI_SYSTEM_GENERIC = "You are an analyst's assistant inside a personal stock-research tool. You NEVER give buy/sell/hold recommendations or price predictions. Your only job: assess whether the setup's premise is supported or contradicted by the provided headlines and metrics. Output format: line 1 = 'Read: SUPPORTED', 'Read: CONTRADICTED', or 'Read: MIXED/UNCLEAR (leaning SUPPORTED)' / 'Read: MIXED/UNCLEAR (leaning CONTRADICTED)'. Only use plain 'Read: MIXED/UNCLEAR' with no lean if the evidence is genuinely balanced with no tilt either way — that should be rare; usually pick the side the evidence leans toward even when it's not clear-cut. Then 2–4 short bullets citing specific provided evidence; then one line starting 'Watch for:' with what would change the read. Under 150 words. If the headlines don't explain the setup, say so plainly, but still give your best lean based on the metrics alone.";

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

// Smart default news look-back (Stage 3.5): a plain 14-day window misses the
// headline that actually explains an older dip. If this is a dip candidate,
// widen the default to comfortably cover the peak date (+5 day buffer),
// snapping to the nearest preset (14/30/60) or an exact custom day count
// beyond that, capped at 180d. Non-dip setups (spring/drift) keep 14d.
function _adDefaultNewsDays(ev) {
    if (ev && ev.dip && ev.dip.daysSincePeak != null) {
        var need = ev.dip.daysSincePeak + 5;
        if (need <= 14) return 14;
        if (need <= 30) return 30;
        if (need <= 60) return 60;
        return Math.min(need, 180);
    }
    return 14;
}

// Fetch cap scales with the chosen window so a wider look-back doesn't just
// re-show the same newest 15 items — it actually surfaces older headlines.
function _adNewsFetchCap(days) {
    if (days <= 14) return 15;
    if (days <= 30) return 25;
    if (days <= 60) return 35;
    return 50;
}

// User changed the news range selector/custom-days input — re-fetch and
// re-render the news list at the new window (Stage 3.5).
function _adNewsRangeChange() {
    var sel = document.getElementById('adNewsRangeSel');
    var custom = document.getElementById('adNewsCustomDays');
    if (!sel || !custom || !_adCtx || !_adCtx._ev) return;
    var days;
    if (sel.value === 'custom') {
        custom.style.display = '';
        days = parseInt(custom.value, 10);
        if (!days || days < 1) return;   // wait for a valid number before refetching
        if (days > 730) { days = 730; custom.value = 730; }
    } else {
        custom.style.display = 'none';
        days = parseInt(sel.value, 10);
    }
    _adRenderNews(_adCtx._ev, days);
}

// Fetch + render the news list; add the AI-read button only when an LLM is
// configured. News is ephemeral — never persisted to Firestore. `days`
// (Stage 3.5) controls the look-back window via the accordion's range chooser.
async function _adRenderNews(ev, days) {
    var host = document.getElementById('adNews');
    if (!host || !_adCtx) return;
    _adCtx._ev = ev;   // stash for the AI read + range-change re-renders
    days = days || 14;

    var fetchCap = _adNewsFetchCap(days);
    var items = [];
    try {
        var from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
        var to   = new Date().toISOString().slice(0, 10);
        items = await anaFinnhubNews(_adCtx.ticker, from, to, fetchCap);
    } catch (e) { items = null; }
    _adCtx._newsItems = items || [];

    host = document.getElementById('adNews');
    if (!host) return;

    var countEl = document.getElementById('adNewsCount');
    var rangeLabel = (days === 14) ? '2 weeks' : (days === 30) ? 'month' : (days === 60) ? '2 months' : days + ' days';

    var html = '';
    if (!items) {
        html += '<p class="muted-text">News unavailable.</p>';
        if (countEl) countEl.textContent = '';
    } else if (items.length === 0) {
        html += '<p class="muted-text">No headlines in the last ' + rangeLabel + '.</p>';
        if (countEl) countEl.textContent = '0';
    } else {
        if (countEl) countEl.textContent = items.length;
        html += '<ul class="ad-news-list">';
        items.forEach(function(it) {
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

        var headlines = (ctx._newsItems || []).slice(0, 15).map(function(it) {
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
