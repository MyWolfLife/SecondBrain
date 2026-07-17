'use strict';

// ---------------------------------------------------------------------------
// Stock Analyzer — scoreboard / tracking loop (Stage 9, completes Phase 1)
// ---------------------------------------------------------------------------
// The "learning journal with receipts": grades every saved scan's candidates
// against what actually happened afterward — 30- and 60-trading-day returns,
// target hits, SPY benchmark — and splits KEPT vs DISMISSED so the user can
// see whether his judgment beats the raw detectors.
//
// Grades are COMPUTED on page load from the price cache, never stored:
// they update automatically as windows complete, and stay consistent with
// the Backtest Lab's entry rule (next trading day's open after the scan).
// ---------------------------------------------------------------------------

var ASB_HORIZONS = [30, 60];   // trading-day checkpoints
var ASB_MAX_SCANS = 25;

// Short detector label for the per-scan table (detector-agnostic).
var ASB_DET_SHORT = { dipA: 'Dip', springD: 'Spring', driftB: 'Drift', revC: 'Revision' };
function _asbDetShort(det) { return ASB_DET_SHORT[det] || det; }

// Permanently delete a saved scan (test/junk cleanup). Removes it from scan
// history AND from any future calibration, since both read `analyzerScans`.
// Confirmed and irreversible; re-renders the Scoreboard on success.
async function _asbDeleteScan(scanId, dateLabel) {
    if (!confirm('Delete the scan from ' + dateLabel + '? It will be permanently removed from your scan history and from future calibration. This cannot be undone.')) return;
    try {
        await userCol('analyzerScans').doc(scanId).delete();
    } catch (e) {
        alert('Could not delete the scan: ' + e.message);
        return;
    }
    loadAnalyzerScoreboardPage();
}

async function loadAnalyzerScoreboardPage() {
    _analyzerBreadcrumb([{ label: 'Stock Analyzer', href: '#analyzer' }, { label: 'Scoreboard' }]);
    var page = document.getElementById('page-analyzer-scoreboard');
    if (!page) return;
    page.innerHTML = '<p class="muted-text" style="padding:16px">Grading past scans…</p>';

    var scans, trades;
    try {
        var snap = await userCol('analyzerScans').orderBy('createdAt', 'desc').limit(ASB_MAX_SCANS).get();
        scans = [];
        snap.forEach(function(d) { scans.push(Object.assign({ id: d.id }, d.data())); });
        trades = (typeof _atLoadTrades === 'function') ? await _atLoadTrades() : [];
    } catch (e) {
        page.innerHTML = '<p class="muted-text" style="padding:16px">Could not load: ' + escapeHtml(e.message) + '</p>';
        return;
    }

    if (!scans.length) {
        page.innerHTML = '<div class="page-header"><h2>🏁 Scoreboard</h2></div>' +
            '<p class="muted-text">No scans saved yet — run one on the Scan page. Once a scan is 30+ trading days old, its candidates get graded here automatically.</p>';
        return;
    }

    var spy = await anaGetPriceHistory('SPY');
    var graded = [];
    for (var i = 0; i < scans.length; i++) {
        graded.push(await _asbGradeScan(scans[i], spy));
    }
    _asbRender(page, graded, trades);
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

// Grades one scan. Returns {scan, rows[], daysElapsed} where each row is
// {ticker, detector, dismissed, entryPrice, ret30, ret60, hit, spy60, pending}
async function _asbGradeScan(scan, spy) {
    var rows = [];
    var maxDays = 0;
    var params = scan.params || { gainPct: 10, windowDays: 60 };
    var cands = scan.candidates || [];

    for (var i = 0; i < cands.length; i++) {
        var c = cands[i];
        var row = { ticker: c.ticker, detector: c.detector, dismissed: !!c.dismissed,
                    entryPrice: null, ret30: null, ret60: null, hit: null, spy60: null, pending: true };
        var rec = await anaGetPriceHistory(c.ticker);
        if (rec && rec.dates.length) {
            var scanIdx  = anaEngIndexForDate(rec, scan.date);
            var entryIdx = scanIdx + 1;
            if (scanIdx >= 0 && entryIdx < rec.dates.length) {
                var entry = rec.open[entryIdx];
                if (entry > 0) {
                    row.entryPrice = entry;
                    var avail = rec.dates.length - 1 - entryIdx;
                    if (avail > maxDays) maxDays = avail;

                    if (avail >= 30) row.ret30 = (rec.close[entryIdx + 30] / entry - 1) * 100;
                    if (avail >= 60) {
                        row.ret60 = (rec.close[entryIdx + 60] / entry - 1) * 100;
                        row.pending = false;
                        // Target hit within the 60d window (backtest fill rule: HIGH touches it)
                        var target = entry * (1 + (params.gainPct || 10) / 100);
                        row.hit = false;
                        for (var j = entryIdx + 1; j <= entryIdx + 60; j++) {
                            if (rec.high[j] >= target) { row.hit = true; break; }
                        }
                        // SPY over the same span
                        if (spy) {
                            var sa = anaEngIndexForDate(spy, rec.dates[entryIdx]);
                            var sb = anaEngIndexForDate(spy, rec.dates[entryIdx + 60]);
                            if (sa >= 0 && sb > sa) row.spy60 = (spy.close[sb] / spy.close[sa] - 1) * 100;
                        }
                    }
                }
            }
        }
        rows.push(row);
    }
    return { scan: scan, rows: rows, daysElapsed: maxDays };
}

function _asbAvg(rows, fn) {
    var vals = rows.map(fn).filter(function(v) { return v != null; });
    if (!vals.length) return null;
    return vals.reduce(function(a, b) { return a + b; }, 0) / vals.length;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function _asbRender(page, graded, trades) {
    var allRows  = [];
    graded.forEach(function(g) { allRows = allRows.concat(g.rows); });
    var complete = allRows.filter(function(r) { return !r.pending; });
    var kept     = complete.filter(function(r) { return !r.dismissed; });
    var dism     = complete.filter(function(r) { return r.dismissed; });

    var html = '<div class="page-header"><h2>🏁 Scoreboard</h2></div>' +
        '<p class="muted-text" style="max-width:620px">Every saved scan, graded against what actually happened — entry at the next day\'s open, ' +
            'checked at 30 and 60 trading days. Kept vs dismissed shows whether your judgment beats the raw detectors.</p>';

    // Overall cards (only once something has completed)
    if (complete.length) {
        var hitRate = complete.filter(function(r) { return r.hit; }).length / complete.length;
        html += '<div class="ana-stat-row">' +
            '<div class="ana-stat"><div class="ana-stat-num">' + complete.length + '</div><div class="ana-stat-label">Graded (of ' + allRows.length + ')</div></div>' +
            '<div class="ana-stat"><div class="ana-stat-num">' + Math.round(hitRate * 100) + '%</div><div class="ana-stat-label">Hit +10% ≤60d</div></div>' +
            '<div class="ana-stat"><div class="ana-stat-num">' + _abFmtPct(_asbAvg(kept, function(r) { return r.ret60; })) + '</div><div class="ana-stat-label">Kept — avg 60d</div></div>' +
            '<div class="ana-stat"><div class="ana-stat-num">' + _abFmtPct(_asbAvg(dism, function(r) { return r.ret60; })) + '</div><div class="ana-stat-label">Dismissed — avg 60d</div></div>' +
            '<div class="ana-stat"><div class="ana-stat-num">' + _abFmtPct(_asbAvg(complete, function(r) { return r.spy60; })) + '</div><div class="ana-stat-label">SPY — avg 60d</div></div>' +
        '</div>';
        if (dism.length && kept.length) {
            var keptAvg = _asbAvg(kept, function(r) { return r.ret60; });
            var dismAvg = _asbAvg(dism, function(r) { return r.ret60; });
            if (keptAvg != null && dismAvg != null) {
                html += '<p class="muted-text">' + (keptAvg > dismAvg
                    ? '✅ What you kept outperformed what you dismissed by ' + (keptAvg - dismAvg).toFixed(1) + ' points — your judgment is adding value.'
                    : '⚠️ What you dismissed did better than what you kept by ' + (dismAvg - keptAvg).toFixed(1) + ' points — worth reviewing your dismissal reasons.') + '</p>';
            }
        }
    } else {
        html += '<p class="muted-text">Nothing graded yet — the newest scans are still inside their 60-day windows. Grades appear automatically as windows complete (keep price data updated).</p>';
    }

    // Closed-trades recap
    var closed = (trades || []).filter(function(t) { return t.status === 'closed'; });
    if (closed.length) {
        var wins  = closed.filter(function(t) { return t.retPct > 0; }).length;
        var right = closed.filter(function(t) { return t.thesisVerdict === 'right'; }).length;
        var avgT  = _asbAvg(closed, function(t) { return t.retPct; });
        var avgS  = _asbAvg(closed, function(t) { return t.spyRetPct; });
        html += '<h3 class="ana-section-title">🎫 Your real trades</h3>' +
            '<div class="as-card"><p class="as-card-reason">' +
                closed.length + ' closed · ' + wins + ' profitable · avg ' + _abFmtPct(avgT) + ' per trade vs SPY ' + _abFmtPct(avgS) +
                ' · thesis right ' + right + ' of ' + closed.length +
            '</p><div class="ab-form-row"><a class="ana-sp-btn" href="#analyzer/trades" style="text-decoration:none">Open Trades page →</a></div></div>';
    }

    // Per-scan sections — each is a COLLAPSED accordion (the page grows over
    // time as scans accumulate) with a Delete button, so test/junk scans can be
    // removed from history and from future calibration. Reuses the shared
    // `.detail-acc` pattern + `toggleDetailAcc` (app.js).
    graded.forEach(function(g) {
        var f = g.scan.funnel || {};
        var completeCount = g.rows.filter(function(r) { return !r.pending; }).length;
        var status = completeCount === g.rows.length && g.rows.length > 0
            ? 'fully graded'
            : (completeCount > 0 ? completeCount + ' of ' + g.rows.length + ' graded'
                                 : 'pending — day ' + Math.min(g.daysElapsed, 60) + ' of 60');
        var accId = 'asb-scan-' + g.scan.id;
        html += '<div class="detail-acc asb-scan-acc" id="' + accId + '">' +
            '<div class="detail-acc-header" onclick="toggleDetailAcc(\'' + accId + '\')">' +
                '<span class="detail-acc-chevron">&#9658;</span>' +
                '<span class="detail-acc-title">Scan ' + escapeHtml(g.scan.date || '') + '</span>' +
                '<span class="detail-acc-count">· ' + (f.shortlisted || g.rows.length) + ' candidates · ' + status + '</span>' +
                '<span class="detail-acc-actions">' +
                    '<button class="ana-sp-btn" onclick="event.stopPropagation(); _asbDeleteScan(\'' + g.scan.id + '\', \'' + escapeHtml(g.scan.date || '') + '\')">🗑 Delete</button>' +
                '</span>' +
            '</div>' +
            '<div class="detail-acc-body">';
        if (!g.rows.length) {
            html += '<p class="muted-text">No candidates in this scan.</p>';
        } else {
            html += '<div class="ab-table-wrap"><table class="ab-table">' +
                '<tr><th>Ticker</th><th>Detector</th><th>Kept?</th><th>Entry</th><th>+30d</th><th>+60d</th><th>Hit +10%?</th><th>SPY 60d</th></tr>';
            g.rows.forEach(function(r) {
                html += '<tr>' +
                    '<td><strong>' + escapeHtml(r.ticker) + '</strong></td>' +
                    '<td>' + _asbDetShort(r.detector) + '</td>' +
                    '<td>' + (r.dismissed ? '<span class="ab-badge ab-badge-neutral">dismissed</span>' : '<span class="ab-badge ab-badge-win">kept</span>') + '</td>' +
                    '<td>' + (r.entryPrice != null ? '$' + r.entryPrice.toFixed(2) : '—') + '</td>' +
                    '<td class="' + (r.ret30 > 0 ? 'ab-pos' : (r.ret30 != null ? 'ab-neg' : 'ab-dim')) + '">' + _abFmtPct(r.ret30) + '</td>' +
                    '<td class="' + (r.ret60 > 0 ? 'ab-pos' : (r.ret60 != null ? 'ab-neg' : 'ab-dim')) + '">' + _abFmtPct(r.ret60) + '</td>' +
                    '<td>' + (r.pending ? '<span class="ab-badge ab-badge-neutral">pending</span>'
                                        : (r.hit ? '<span class="ab-badge ab-badge-win">hit</span>' : '<span class="ab-badge ab-badge-loss">miss</span>')) + '</td>' +
                    '<td class="ab-dim">' + _abFmtPct(r.spy60) + '</td>' +
                '</tr>';
            });
            html += '</table></div>';
        }
        html += '</div></div>';
    });

    html += '<p class="ab-dim" style="max-width:620px">Grades assume a no-judgment robot entering every candidate at the next open — ' +
        'the same rule as the Backtest Lab. Your actual results live on the Trades page.</p>';

    page.innerHTML = html;
}
