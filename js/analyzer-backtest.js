'use strict';

// ---------------------------------------------------------------------------
// Stock Analyzer — Backtest Lab (Stage 5)
// ---------------------------------------------------------------------------
// Walk-forward simulation: run the detector engine every Friday from a start
// date, enter each signal at the NEXT trading day's open, grade against the
// exit rules, and score the whole thing against SPY.
//
// Uses ONLY: analyzer-data.js (cached price records) + analyzer-engine.js
// (pure detector math). Results saved to userCol('analyzerBacktests').
// v1 is price-only — quality gates and estimate data are Phase 3.
// ---------------------------------------------------------------------------

var AB_SIGNAL_CAP = 500;   // max signals persisted per run (Firestore doc guard)

var _abCancelled = false;
var _abRunning   = false;
var _abLastRun   = null;   // most recent run result (for re-render without refetch)
var _abSavedRuns = null;   // cached list of saved run docs

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function loadAnalyzerBacktestPage() {
    _analyzerBreadcrumb([{ label: 'Stock Analyzer', href: '#analyzer' }, { label: 'Backtest Lab' }]);
    var page = document.getElementById('page-analyzer-backtest');
    if (!page) return;

    var jan1 = new Date().getFullYear() + '-01-01';
    var today = new Date().toISOString().slice(0, 10);

    page.innerHTML =
        '<div class="page-header"><h2>🧪 Backtest Lab</h2></div>' +
        '<p class="muted-text" style="max-width:600px">Runs the detectors every Friday of the chosen period against the cached price history, ' +
            'enters each signal at the next day\'s open, and grades the results against your exit rules — compared to just holding SPY.</p>' +

        '<div class="ab-bias-banner">⚠️ Honest limits: backtests use <strong>today\'s</strong> S&amp;P membership (survivorship bias) and grade a ' +
            'no-judgment robot that takes <em>every</em> signal — your floor, not your ceiling. Use results to sanity-check thresholds, ' +
            'not to optimize to the decimal.</div>' +

        '<h3 class="ana-section-title">Setup</h3>' +
        '<div class="ab-form">' +
            '<div class="ab-form-row">' +
                '<label>Start date <input type="date" id="abStart" value="' + jan1 + '"></label>' +
                '<label>End date <input type="date" id="abEnd" value="' + today + '"></label>' +
            '</div>' +
            '<div class="ab-form-row">' +
                '<label>Target % <input type="number" id="abTarget" value="10" min="1" max="100" step="0.5"></label>' +
                '<label>Stop % <input type="number" id="abStop" value="7" min="1" max="50" step="0.5"></label>' +
                '<label>Time stop (days) <input type="number" id="abTimeStop" value="60" min="5" max="250" step="1"></label>' +
            '</div>' +
            '<div class="ab-form-row">' +
                '<label class="ab-check"><input type="checkbox" id="abDetA" checked> Detector A — panic dip</label>' +
                '<label>Dip % <input type="number" id="abDropPct" value="12" min="3" max="60" step="0.5"></label>' +
                '<label>within (days) <input type="number" id="abDropDays" value="15" min="3" max="60" step="1"></label>' +
            '</div>' +
            '<div class="ab-form-row">' +
                '<label class="ab-check"><input type="checkbox" id="abDetD" checked> Detector D — compressed spring</label>' +
            '</div>' +
            '<div class="ab-form-row">' +
                '<label class="ab-check ab-check-disabled"><input type="checkbox" id="abDetB" disabled> Detector B — post-earnings drift</label>' +
                '<span class="as-chip as-chip-warn">⚠️ Backtest unavailable on the free tier — Phase 3 unlock</span>' +
            '</div>' +
            '<p class="ab-dim" style="margin:0 0 8px">Finnhub’s free earnings calendar only covers a rolling ~1-month-back-to-forward window (fully-past quarters return nothing), and surprise records give quarter-end dates, not report dates. Historical report dates across a backtest span therefore aren’t available until the paid FMP tier (Phase 3). Detector B still runs live on the Scan page.</p>' +
            '<div class="ab-form-row">' +
                '<button class="btn-primary" id="abRunBtn" onclick="_abStartRun()">▶ Run backtest</button>' +
            '</div>' +
        '</div>' +
        '<div id="abProgress"></div>' +
        '<div id="abResults"></div>' +
        '<h3 class="ana-section-title">Saved runs</h3>' +
        '<div id="abSavedRuns"><p class="muted-text">Loading…</p></div>';

    _abRenderSavedRuns();
}

// ---------------------------------------------------------------------------
// Run flow
// ---------------------------------------------------------------------------

function _abReadParams() {
    return {
        startDate: document.getElementById('abStart').value,
        endDate:   document.getElementById('abEnd').value,
        cadence:   'weekly-friday',
        exits: {
            targetPct:    parseFloat(document.getElementById('abTarget').value)   || 10,
            stopPct:      parseFloat(document.getElementById('abStop').value)     || 7,
            timeStopDays: parseInt(document.getElementById('abTimeStop').value, 10) || 60
        },
        detectors: {
            dipA: {
                enabled:  document.getElementById('abDetA').checked,
                dropPct:  parseFloat(document.getElementById('abDropPct').value)  || 12,
                dropDays: parseInt(document.getElementById('abDropDays').value, 10) || 15
            },
            springD: { enabled: document.getElementById('abDetD').checked }
        }
    };
}

function _abCancel() { _abCancelled = true; }

async function _abStartRun() {
    if (_abRunning) return;
    var params = _abReadParams();
    if (!params.startDate || !params.endDate || params.startDate >= params.endDate) {
        alert('Please pick a start date before the end date.'); return;
    }
    if (!params.detectors.dipA.enabled && !params.detectors.springD.enabled) {
        alert('Enable at least one detector.'); return;
    }

    _abRunning = true; _abCancelled = false;
    var btn = document.getElementById('abRunBtn');
    if (btn) btn.disabled = true;
    var prog = document.getElementById('abProgress');
    if (prog) {
        prog.innerHTML = '<div class="ana-progress-wrap">' +
            '<div class="ana-progress-bar"><div class="ana-progress-fill" id="abProgFill"></div></div>' +
            '<div class="ana-progress-text" id="abProgText">Loading price cache…</div>' +
            '<button class="ana-sp-btn" onclick="_abCancel()">Cancel</button></div>';
    }

    try {
        var run = await _abRun(params, function(done, total, note) {
            var fill = document.getElementById('abProgFill');
            var text = document.getElementById('abProgText');
            if (fill) fill.style.width = Math.round(done / total * 100) + '%';
            if (text) text.textContent = note;
        }, function() { return _abCancelled; });

        if (prog) prog.innerHTML = run.cancelled ? '<p class="muted-text">⚠️ Cancelled — partial results below.</p>' : '';
        _abLastRun = run;
        _abRenderScorecard(run, document.getElementById('abResults'));

        if (!run.cancelled) {
            await _abSaveRun(run);
            _abSavedRuns = null;
            _abRenderSavedRuns();
        }
    } catch (e) {
        console.error('[backtest] run failed:', e);
        if (prog) prog.innerHTML = '<p class="muted-text">✗ Backtest failed: ' + escapeHtml(e.message) + '</p>';
    }

    _abRunning = false;
    if (btn) btn.disabled = false;
}

// ---------------------------------------------------------------------------
// The walk-forward runner
// ---------------------------------------------------------------------------

// List of calendar Fridays (YYYY-MM-DD) between two dates inclusive.
function _abFridays(startDate, endDate) {
    var out = [];
    var d = new Date(startDate + 'T12:00:00Z');
    var end = new Date(endDate + 'T12:00:00Z');
    while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
    while (d <= end) {
        out.push(d.toISOString().slice(0, 10));
        d.setUTCDate(d.getUTCDate() + 7);
    }
    return out;
}

// Simulates one signal from entryIdx per the exit rules. Returns
// {outcome:'target'|'stop'|'expiry'|'pending', exitIdx, exitPrice, days, retPct}
function _abSimulateTrade(rec, entryIdx, entryPrice, exits) {
    var target = entryPrice * (1 + exits.targetPct / 100);
    var stop   = entryPrice * (1 - exits.stopPct / 100);
    var lastIdx = rec.dates.length - 1;
    var endIdx  = entryIdx + exits.timeStopDays;

    for (var j = entryIdx; j <= Math.min(endIdx, lastIdx); j++) {
        var o = rec.open[j], h = rec.high[j], l = rec.low[j];
        // Gap fills first (you get the open, not your level)
        if (o <= stop)   return _abExit('stop',   j, o,      entryIdx, entryPrice);
        if (o >= target) return _abExit('target', j, o,      entryIdx, entryPrice);
        // Intraday: stop checked before target (conservative when both hit)
        if (l <= stop)   return _abExit('stop',   j, stop,   entryIdx, entryPrice);
        if (h >= target) return _abExit('target', j, target, entryIdx, entryPrice);
    }
    if (endIdx <= lastIdx) {
        return _abExit('expiry', endIdx, rec.close[endIdx], entryIdx, entryPrice);
    }
    // Window extends beyond available data
    return { outcome: 'pending', exitIdx: null, exitPrice: null, days: null, retPct: null };
}

function _abExit(outcome, exitIdx, exitPrice, entryIdx, entryPrice) {
    return {
        outcome:  outcome,
        exitIdx:  exitIdx,
        exitPrice: exitPrice,
        days:     exitIdx - entryIdx,
        retPct:   (exitPrice / entryPrice - 1) * 100
    };
}

async function _abRun(params, onProgress, shouldCancel) {
    // 1. Universe + price records
    await Promise.all([_anaLoadSp500(), _anaLoadUniverseCfg(), _anaLoadHoldingTickers()]);
    var tickers = _anaEffectiveUniverse();
    var records = {};
    var loaded = 0;
    for (var i = 0; i < tickers.length; i++) {
        var r = await anaGetPriceHistory(tickers[i]);
        if (r && r.dates.length > 60) records[tickers[i]] = r;
        loaded++;
        if (loaded % 50 === 0 && onProgress) onProgress(0, 1, 'Loading price cache… ' + loaded + ' / ' + tickers.length);
    }
    var spy = await anaGetPriceHistory('SPY');
    if (!spy) throw new Error('SPY history missing — run Update price data on the hub first.');

    var fridays = _abFridays(params.startDate, params.endDate);
    if (fridays.length === 0) throw new Error('No Fridays in the chosen period.');

    // 2. Walk forward
    var signals = [];
    var openUntil = {};   // key ticker|detector → exit date string (dedup while open)
    var cancelled = false;

    for (var f = 0; f < fridays.length; f++) {
        if (shouldCancel && shouldCancel()) { cancelled = true; break; }
        var friday = fridays[f];
        if (onProgress) onProgress(f + 1, fridays.length, 'Friday ' + (f + 1) + ' / ' + fridays.length + ' — ' + friday + ' · ' + signals.length + ' signals');
        // Yield to the UI thread once per Friday
        await new Promise(function(res) { setTimeout(res, 0); });

        for (var t in records) {
            var rec = records[t];
            var asOf = anaEngIndexForDate(rec, friday);
            if (asOf < 0 || asOf + 1 >= rec.dates.length) continue;   // no next-day open available
            // Skip stale series (delisted tickers whose data stops well before this Friday)
            if (rec.dates[asOf] < _abDaysBefore(friday, 10)) continue;

            var trigs = [];
            if (params.detectors.dipA.enabled && asOf >= params.detectors.dipA.dropDays) {
                var a = anaEngDipTrigger(rec, { dropPct: params.detectors.dipA.dropPct, dropDays: params.detectors.dipA.dropDays, asOfIndex: asOf });
                if (a) trigs.push({ det: 'dipA', info: '−' + a.dropPct.toFixed(1) + '% / ' + a.daysSincePeak + 'd' });
            }
            if (params.detectors.springD.enabled) {
                var d = anaEngSpringTrigger(rec, { asOfIndex: asOf });
                if (d) trigs.push({ det: 'springD', info: 'vol ' + d.vol.toFixed(2) + ' · ' + d.pctFromHigh.toFixed(1) + '% off high' });
            }

            for (var g = 0; g < trigs.length; g++) {
                var key = t + '|' + trigs[g].det;
                if (openUntil[key] && openUntil[key] >= friday) continue;

                var entryIdx   = asOf + 1;
                var entryPrice = rec.open[entryIdx];
                if (!entryPrice || entryPrice <= 0) continue;
                var sim = _abSimulateTrade(rec, entryIdx, entryPrice, params.exits);

                // SPY benchmark over the same dates
                var spyRet = null;
                var sEntry = anaEngIndexForDate(spy, rec.dates[entryIdx]);
                if (sEntry >= 0 && sim.exitIdx != null) {
                    var sExit = anaEngIndexForDate(spy, rec.dates[sim.exitIdx]);
                    if (sExit > sEntry && spy.open[sEntry] > 0) {
                        spyRet = (spy.close[sExit] / spy.open[sEntry] - 1) * 100;
                    }
                }

                signals.push({
                    friday:    friday,
                    ticker:    t,
                    detector:  trigs[g].det,
                    info:      trigs[g].info,
                    entryDate: rec.dates[entryIdx],
                    entry:     entryPrice,
                    outcome:   sim.outcome,
                    exitDate:  sim.exitIdx != null ? rec.dates[sim.exitIdx] : null,
                    days:      sim.days,
                    retPct:    sim.retPct,
                    spyRetPct: spyRet
                });
                openUntil[key] = sim.exitIdx != null ? rec.dates[sim.exitIdx]
                                                     : rec.dates[rec.dates.length - 1];
            }
        }
    }

    // 3. Aggregate per detector
    var results = { perDetector: [] };
    ['dipA', 'springD'].forEach(function(det) {
        if (det === 'dipA'    && !params.detectors.dipA.enabled)    return;
        if (det === 'springD' && !params.detectors.springD.enabled) return;
        var sig = signals.filter(function(s) { return s.detector === det; });
        var completed = sig.filter(function(s) { return s.outcome !== 'pending'; });
        var hits    = completed.filter(function(s) { return s.outcome === 'target'; });
        var stops   = completed.filter(function(s) { return s.outcome === 'stop'; });
        var expiry  = completed.filter(function(s) { return s.outcome === 'expiry'; });
        var wins    = completed.filter(function(s) { return s.retPct > 0; });
        var losses  = completed.filter(function(s) { return s.retPct <= 0; });
        var mean = function(arr, fn) {
            if (!arr.length) return null;
            return arr.reduce(function(a, s) { return a + fn(s); }, 0) / arr.length;
        };
        var hitDays = hits.map(function(s) { return s.days; }).sort(function(a, b) { return a - b; });
        var withSpy = completed.filter(function(s) { return s.spyRetPct != null; });
        results.perDetector.push({
            detectorId:   det,
            signals:      sig.length,
            completed:    completed.length,
            targetHits:   hits.length,
            stopOuts:     stops.length,
            expiries:     expiry.length,
            pending:      sig.length - completed.length,
            hitRate:      completed.length ? hits.length / completed.length : null,
            medianDaysToTarget: hitDays.length ? hitDays[Math.floor(hitDays.length / 2)] : null,
            avgWinPct:    mean(wins,   function(s) { return s.retPct; }),
            avgLossPct:   mean(losses, function(s) { return s.retPct; }),
            avgRetPct:    mean(completed, function(s) { return s.retPct; }),
            avgSpyRetPct: mean(withSpy, function(s) { return s.spyRetPct; })
        });
    });

    return {
        createdAt: new Date().toISOString(),
        params:    params,
        universeSize: tickers.length,
        fridays:   fridays.length,
        results:   results,
        signals:   signals,
        cancelled: cancelled
    };
}

// dateStr minus n calendar days → YYYY-MM-DD
function _abDaysBefore(dateStr, n) {
    var d = new Date(dateStr + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Scorecard rendering
// ---------------------------------------------------------------------------

var AB_DET_LABELS = { dipA: '📉 Panic dip on quality', springD: '🌀 Compressed spring', driftB: '🚀 Post-earnings drift' };

function _abFmtPct(v, digits) {
    if (v == null) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(digits != null ? digits : 1) + '%';
}

function _abRenderScorecard(run, container, opts) {
    if (!container) return;
    opts = opts || {};
    var p = run.params;

    var html = '<h3 class="ana-section-title">' + (opts.title || 'Results') + '</h3>' +
        '<p class="muted-text">' + escapeHtml(p.startDate) + ' → ' + escapeHtml(p.endDate) +
        ' · ' + run.fridays + ' Fridays · universe ' + run.universeSize +
        ' · exits +' + p.exits.targetPct + '% / −' + p.exits.stopPct + '% / ' + p.exits.timeStopDays + 'd' +
        (p.detectors.dipA.enabled ? ' · dip ≥' + p.detectors.dipA.dropPct + '%/' + p.detectors.dipA.dropDays + 'd' : '') +
        '</p>';

    html += '<div class="ab-det-grid">';
    run.results.perDetector.forEach(function(d) {
        html += '<div class="ab-det-card">' +
            '<div class="ab-det-title">' + (AB_DET_LABELS[d.detectorId] || d.detectorId) + '</div>' +
            '<div class="ab-det-big">' + (d.hitRate != null ? Math.round(d.hitRate * 100) + '%' : '—') +
                '<span class="ab-det-big-label"> hit rate</span></div>' +
            '<div class="ab-det-rows">' +
                '<div>Signals: <strong>' + d.signals + '</strong>' + (d.pending ? ' (' + d.pending + ' pending)' : '') + '</div>' +
                '<div>🎯 ' + d.targetHits + ' target · 🛑 ' + d.stopOuts + ' stop · ⏰ ' + d.expiries + ' expiry</div>' +
                '<div>Median days to target: <strong>' + (d.medianDaysToTarget != null ? d.medianDaysToTarget : '—') + '</strong></div>' +
                '<div>Avg win ' + _abFmtPct(d.avgWinPct) + ' · avg loss ' + _abFmtPct(d.avgLossPct) + '</div>' +
                '<div>Avg per trade: <strong>' + _abFmtPct(d.avgRetPct) + '</strong> vs SPY ' + _abFmtPct(d.avgSpyRetPct) + '</div>' +
            '</div>' +
        '</div>';
    });
    html += '</div>';

    // Signals table
    if (!opts.hideSignals && run.signals && run.signals.length) {
        var rows = run.signals.slice(0, 200);
        html += '<h3 class="ana-section-title">Signals (' + run.signals.length + (run.signals.length > 200 ? ', first 200 shown' : '') + ')</h3>' +
            '<div class="ab-table-wrap"><table class="ab-table">' +
            '<tr><th>Friday</th><th>Ticker</th><th>Detector</th><th>Trigger</th><th>Entry</th><th>Outcome</th><th>Days</th><th>Ret</th><th>SPY</th></tr>';
        rows.forEach(function(s) {
            var badge = s.outcome === 'target' ? 'ab-badge-win' : (s.outcome === 'stop' ? 'ab-badge-loss' : 'ab-badge-neutral');
            html += '<tr>' +
                '<td>' + s.friday + '</td>' +
                '<td><strong>' + escapeHtml(s.ticker) + '</strong></td>' +
                '<td>' + ({ dipA: 'Dip', springD: 'Spring', driftB: 'Drift' }[s.detector] || s.detector) + '</td>' +
                '<td class="ab-dim">' + escapeHtml(s.info || '') + '</td>' +
                '<td>$' + (s.entry != null ? s.entry.toFixed(2) : '—') + '</td>' +
                '<td><span class="ab-badge ' + badge + '">' + s.outcome + '</span></td>' +
                '<td>' + (s.days != null ? s.days : '—') + '</td>' +
                '<td class="' + (s.retPct > 0 ? 'ab-pos' : 'ab-neg') + '">' + _abFmtPct(s.retPct) + '</td>' +
                '<td class="ab-dim">' + _abFmtPct(s.spyRetPct) + '</td>' +
            '</tr>';
        });
        html += '</table></div>';
    }
    container.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Saved runs (Firestore)
// ---------------------------------------------------------------------------

async function _abSaveRun(run) {
    var doc = {
        createdAt:    run.createdAt,
        params:       run.params,
        universeSize: run.universeSize,
        fridays:      run.fridays,
        results:      run.results,
        signalsTruncated: run.signals.length > AB_SIGNAL_CAP,
        signals:      run.signals.slice(0, AB_SIGNAL_CAP)
    };
    await userCol('analyzerBacktests').add(doc);
}

async function _abLoadSavedRuns() {
    if (_abSavedRuns) return _abSavedRuns;
    var snap = await userCol('analyzerBacktests').orderBy('createdAt', 'desc').limit(25).get();
    _abSavedRuns = [];
    snap.forEach(function(d) { _abSavedRuns.push(Object.assign({ id: d.id }, d.data())); });
    return _abSavedRuns;
}

async function _abRenderSavedRuns() {
    var el = document.getElementById('abSavedRuns');
    if (!el) return;
    var runs;
    try { runs = await _abLoadSavedRuns(); }
    catch (e) { el.innerHTML = '<p class="muted-text">Could not load saved runs: ' + escapeHtml(e.message) + '</p>'; return; }

    if (!runs.length) { el.innerHTML = '<p class="muted-text">No saved runs yet — results are saved automatically after each completed run.</p>'; return; }

    var html = '<div class="ab-runs-list">';
    runs.forEach(function(r) {
        var d0 = r.results.perDetector[0];
        html += '<div class="ab-run-row">' +
            '<label class="ab-run-pick"><input type="checkbox" class="ab-cmp-box" value="' + r.id + '" onchange="_abCmpLimit(this)"></label>' +
            '<div class="ab-run-main">' +
                '<strong>' + escapeHtml(r.params.startDate) + ' → ' + escapeHtml(r.params.endDate) + '</strong>' +
                '<span class="ab-dim"> · dip ≥' + r.params.detectors.dipA.dropPct + '%/' + r.params.detectors.dipA.dropDays + 'd' +
                ' · exits +' + r.params.exits.targetPct + '/−' + r.params.exits.stopPct + '/' + r.params.exits.timeStopDays + 'd' +
                ' · ' + (d0 && d0.hitRate != null ? Math.round(d0.hitRate * 100) + '% hit' : '—') +
                ' · ' + new Date(r.createdAt).toLocaleString() + '</span>' +
            '</div>' +
            '<button class="ana-sp-btn" onclick="_abViewRun(\'' + r.id + '\')">View</button>' +
            '<button class="ana-sp-btn" onclick="_abDeleteRun(\'' + r.id + '\')">Delete</button>' +
        '</div>';
    });
    html += '</div>' +
        '<div class="ab-form-row" style="margin-top:8px"><button class="ana-sp-btn" onclick="_abCompareSelected()">Compare selected (2)</button></div>' +
        '<div id="abCompare"></div>';
    el.innerHTML = html;
}

function _abCmpLimit(box) {
    var checked = document.querySelectorAll('.ab-cmp-box:checked');
    if (checked.length > 2) box.checked = false;
}

async function _abViewRun(id) {
    var runs = await _abLoadSavedRuns();
    var r = runs.find(function(x) { return x.id === id; });
    if (!r) return;
    _abRenderScorecard(r, document.getElementById('abResults'), { title: 'Saved run — ' + new Date(r.createdAt).toLocaleString() });
    var resEl = document.getElementById('abResults');
    if (resEl) resEl.scrollIntoView({ behavior: 'smooth' });
}

async function _abDeleteRun(id) {
    if (!confirm('Delete this saved backtest run?')) return;
    await userCol('analyzerBacktests').doc(id).delete();
    _abSavedRuns = null;
    _abRenderSavedRuns();
}

async function _abCompareSelected() {
    var picked = Array.from(document.querySelectorAll('.ab-cmp-box:checked')).map(function(b) { return b.value; });
    var el = document.getElementById('abCompare');
    if (picked.length !== 2) { if (el) el.innerHTML = '<p class="muted-text">Pick exactly two runs to compare.</p>'; return; }
    var runs = await _abLoadSavedRuns();
    var a = runs.find(function(x) { return x.id === picked[0]; });
    var b = runs.find(function(x) { return x.id === picked[1]; });
    if (!a || !b || !el) return;

    function detRow(run, det) {
        return run.results.perDetector.find(function(d) { return d.detectorId === det; }) || null;
    }
    var html = '<div class="ab-table-wrap"><table class="ab-table">' +
        '<tr><th>Metric</th><th>Run A<br><span class="ab-dim">' + a.params.startDate + '→' + a.params.endDate + ' dip≥' + a.params.detectors.dipA.dropPct + '%</span></th>' +
        '<th>Run B<br><span class="ab-dim">' + b.params.startDate + '→' + b.params.endDate + ' dip≥' + b.params.detectors.dipA.dropPct + '%</span></th></tr>';
    ['dipA', 'springD'].forEach(function(det) {
        var da = detRow(a, det), db = detRow(b, det);
        if (!da && !db) return;
        html += '<tr><th colspan="3">' + (AB_DET_LABELS[det] || det) + '</th></tr>';
        var rows = [
            ['Signals',        function(d) { return d ? d.signals : '—'; }],
            ['Hit rate',       function(d) { return d && d.hitRate != null ? Math.round(d.hitRate * 100) + '%' : '—'; }],
            ['Median days',    function(d) { return d && d.medianDaysToTarget != null ? d.medianDaysToTarget : '—'; }],
            ['Avg per trade',  function(d) { return d ? _abFmtPct(d.avgRetPct) : '—'; }],
            ['vs SPY',         function(d) { return d ? _abFmtPct(d.avgSpyRetPct) : '—'; }]
        ];
        rows.forEach(function(row) {
            html += '<tr><td>' + row[0] + '</td><td>' + row[1](da) + '</td><td>' + row[1](db) + '</td></tr>';
        });
    });
    html += '</table></div>';
    el.innerHTML = html;
}
