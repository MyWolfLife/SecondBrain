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

// Calibration (ranking plan Phase 6) needs this many GRADED (non-pending,
// 60-trading-day-complete) candidates before the diagnostic is worth building.
var ASB_CALIBRATION_TARGET = 30;

// The kept-vs-dismissed judgment verdict stays neutral until BOTH sides have
// at least this many graded candidates — one lucky keep and one unlucky
// dismissal must not read as "your judgment is adding value".
var ASB_VERDICT_MIN = 5;

// The exact prompt to paste into a fresh Claude Code session when it's time to
// build Phase 6. Kept verbatim here so the "Calibration prompt" button can copy
// it to the clipboard — the user won't have to remember the wording months out.
var AS_CALIBRATION_PROMPT =
'Work on the Stock Analyzer ranking feature. Read StockAnalysisRankingPlan.md — ' +
'I want to build Phase 6 (the calibration diagnostic), the last remaining phase.\n\n' +
'It is gated on having 30+ graded (non-pending, 60-trading-day-complete) candidates ' +
'on the Scoreboard, so first check whether that bar is met (log into the test account ' +
'per CLAUDE.md\'s Preview Verification rule, load the Scoreboard, count the non-pending ' +
'candidates). If we are not there yet, tell me how many we have and stop. If we are, ' +
'build Phase 6 per the plan\'s "Future: calibration phase" section and Execution Plan: ' +
'a read-only report on the Scoreboard page with (1) a grade-vs-outcome bucket table and ' +
'(2) a per-metric correlation table, no automatic weight changes. Follow the plan\'s ' +
'build/verify/commit conventions.';

// Top-of-page calibration progress banner + the copy-prompt button. Shown on
// every Scoreboard render (including the empty state) so the user always sees
// how close they are to being able to calibrate.
function _asbCalibrationBanner(gradedCount, totalScans, capped) {
    var target    = ASB_CALIBRATION_TARGET;
    var remaining = Math.max(0, target - gradedCount);
    var ready     = gradedCount >= target;
    // "25+" when the true total is unknown and we're at the display cap.
    var scanLabel = totalScans + (capped ? '+' : '');
    var msg = ready
        ? '✅ <strong>' + gradedCount + '</strong> graded candidates — enough to calibrate! Tap <strong>Calibration prompt</strong> to copy the instructions for a new Claude Code session.'
        : '📊 <strong>' + scanLabel + '</strong> scan' + (totalScans === 1 && !capped ? '' : 's') + ' run · <strong>' +
          gradedCount + ' of ' + target + '</strong> graded candidates toward calibration (' + remaining +
          ' to go). Candidates grade once they are 60 trading days old.';
    return '<div class="asb-calib-banner' + (ready ? ' asb-calib-ready' : '') + '">' +
        '<span>' + msg + '</span>' +
        '<button class="ana-sp-btn" onclick="_asbCopyCalibrationPrompt(this)">📋 Calibration prompt</button>' +
    '</div>';
}

// Copies the calibration prompt to the clipboard; brief inline confirmation.
// Uses the async Clipboard API when available, else a legacy textarea +
// execCommand fallback. Never alert()s (a blocking dialog is bad UX and can
// hang) — a failure just flips the button to a brief error label.
function _asbCopyCalibrationPrompt(btn) {
    var orig = btn.textContent;
    var flash = function(text) {
        btn.textContent = text;
        setTimeout(function() { btn.textContent = orig; }, 2000);
    };
    var legacyCopy = function() {
        try {
            var ta = document.createElement('textarea');
            ta.value = AS_CALIBRATION_PROMPT;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            flash(ok ? '✓ Copied!' : '⚠️ Copy failed');
        } catch (e) {
            flash('⚠️ Copy failed');
        }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(AS_CALIBRATION_PROMPT)
            .then(function() { flash('✓ Copied!'); })
            .catch(legacyCopy);
    } else {
        legacyCopy();
    }
}

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
    _analyzerBreadcrumb([{ label: 'Stock Analyzer', href: '#analyzer' }, { label: 'Dip & Drift', href: '#analyzer/dipdrift' }, { label: 'Scoreboard' }]);
    var page = document.getElementById('page-analyzer-scoreboard');
    if (!page) return;
    page.innerHTML = '<p class="muted-text" style="padding:16px">Grading past scans…</p>';

    var scans, trades, totalScans, capped = false;
    try {
        var snap = await userCol('analyzerScans').orderBy('createdAt', 'desc').limit(ASB_MAX_SCANS).get();
        scans = [];
        snap.forEach(function(d) { scans.push(Object.assign({ id: d.id }, d.data())); });
        trades = (typeof _atLoadTrades === 'function') ? await _atLoadTrades() : [];
        // True total scan count (may exceed the ASB_MAX_SCANS we grade/display),
        // via the count aggregation when available; else the loaded length, which
        // caps at ASB_MAX_SCANS — flag that so the banner can show "25+".
        totalScans = scans.length;
        try {
            var cs = await userCol('analyzerScans').count().get();
            totalScans = cs.data().count;
        } catch (eCount) {
            if (scans.length >= ASB_MAX_SCANS) capped = true;
        }
    } catch (e) {
        page.innerHTML = '<p class="muted-text" style="padding:16px">Could not load: ' + escapeHtml(e.message) + '</p>';
        return;
    }

    if (!scans.length) {
        page.innerHTML = '<div class="page-header"><h2>🏁 Scoreboard</h2></div>' +
            _asbCalibrationBanner(0, 0, false) +
            '<p class="muted-text">No scans saved yet — run one on the Scan page. Once a scan is 30+ trading days old, its candidates get graded here automatically.</p>';
        return;
    }

    var spy = await anaGetPriceHistory('SPY');
    var graded = [];
    for (var i = 0; i < scans.length; i++) {
        graded.push(await _asbGradeScan(scans[i], spy));
    }
    _asbRender(page, graded, trades, totalScans, capped);
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
        var row = { ticker: c.ticker, detector: c.detector, dismissed: !!c.dismissed, scanId: scan.id,
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

function _asbRender(page, graded, trades, totalScans, capped) {
    var allRows  = [];
    graded.forEach(function(g) { allRows = allRows.concat(g.rows); });

    // One price outcome per ticker per scan: a ticker that fired two detectors
    // in the same scan (e.g. FLEX under dipA AND revC) has ONE entry price and
    // ONE outcome — counting both rows would double-weight it in every
    // top-line stat (hit rate, averages, verdict n's, calibration count).
    // De-dupe here; the per-scan tables below still show each detector's row.
    // On a mixed dupe, kept wins over dismissed — if it was kept under either
    // detector, the exposure was real.
    var byKey = {}, unique = [];
    allRows.forEach(function(r) {
        var k = (r.scanId || '') + '|' + r.ticker;
        if (!byKey[k]) { byKey[k] = r; unique.push(r); }
        else if (byKey[k].dismissed && !r.dismissed) {
            unique[unique.indexOf(byKey[k])] = r;
            byKey[k] = r;
        }
    });
    var dupCount = allRows.length - unique.length;
    var complete = unique.filter(function(r) { return !r.pending; });
    var kept     = complete.filter(function(r) { return !r.dismissed; });
    var dism     = complete.filter(function(r) { return r.dismissed; });
    if (totalScans == null) totalScans = graded.length;

    var html = '<div class="page-header"><h2>🏁 Scoreboard</h2></div>' +
        _asbCalibrationBanner(complete.length, totalScans, capped) +
        '<p class="muted-text" style="max-width:620px">Every saved scan, graded against what actually happened — entry at the next day\'s open, ' +
            'checked at 30 and 60 trading days. Kept vs dismissed shows whether your judgment beats the raw detectors.</p>';

    // Overall cards (only once something has completed)
    if (complete.length) {
        var hitRate = complete.filter(function(r) { return r.hit; }).length / complete.length;
        html += '<div class="ana-stat-row">' +
            '<div class="ana-stat"><div class="ana-stat-num">' + complete.length + '</div><div class="ana-stat-label">Graded (of ' + unique.length + ')</div></div>' +
            '<div class="ana-stat"><div class="ana-stat-num">' + Math.round(hitRate * 100) + '%</div><div class="ana-stat-label">Hit +10% ≤60d</div></div>' +
            '<div class="ana-stat"><div class="ana-stat-num">' + _abFmtPct(_asbAvg(kept, function(r) { return r.ret60; })) + '</div><div class="ana-stat-label">Kept — avg 60d</div></div>' +
            '<div class="ana-stat"><div class="ana-stat-num">' + _abFmtPct(_asbAvg(dism, function(r) { return r.ret60; })) + '</div><div class="ana-stat-label">Dismissed — avg 60d</div></div>' +
            '<div class="ana-stat"><div class="ana-stat-num">' + _abFmtPct(_asbAvg(complete, function(r) { return r.spy60; })) + '</div><div class="ana-stat-label">SPY — avg 60d</div></div>' +
        '</div>';
        if (dupCount > 0) {
            html += '<p class="ab-dim">' + dupCount + ' duplicate row' + (dupCount === 1 ? '' : 's') +
                ' (same stock flagged by two detectors in one scan) counted once in the stats above — the per-scan tables below still show every detector’s row.</p>';
        }
        if (dism.length && kept.length) {
            var keptAvg = _asbAvg(kept, function(r) { return r.ret60; });
            var dismAvg = _asbAvg(dism, function(r) { return r.ret60; });
            if (keptAvg != null && dismAvg != null) {
                // Sample-size guard: below ASB_VERDICT_MIN per side, a verdict
                // would be noise dressed as insight — show the n's, stay neutral.
                var ns = ' (kept n=' + kept.length + ' · dismissed n=' + dism.length + ')';
                if (kept.length < ASB_VERDICT_MIN || dism.length < ASB_VERDICT_MIN) {
                    html += '<p class="muted-text">⏳ Kept averaged ' + _abFmtPct(keptAvg) + ' vs dismissed ' + _abFmtPct(dismAvg) + ns +
                        ' — too few graded candidates to mean anything yet. A verdict appears once both sides have ' + ASB_VERDICT_MIN + '+.</p>';
                } else {
                    html += '<p class="muted-text">' + (keptAvg > dismAvg
                        ? '✅ What you kept outperformed what you dismissed by ' + (keptAvg - dismAvg).toFixed(1) + ' points' + ns + ' — your judgment is adding value.'
                        : '⚠️ What you dismissed did better than what you kept by ' + (dismAvg - keptAvg).toFixed(1) + ' points' + ns + ' — worth reviewing your dismissal reasons.') + '</p>';
                }
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
