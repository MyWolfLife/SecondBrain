'use strict';

// ---------------------------------------------------------------------------
// Earnings Drift (PEAD) strategy (#analyzer/earningsdrift)
// ---------------------------------------------------------------------------
// Plan document: TradingStrategiesPlan.md (sections 5.4, 6.4, 7.4).
// Frozen rules: scan the last 7 days of earnings reports across the effective
// universe. A candidate needs the surprise trifecta-minus-guidance (EPS beat
// >10% AND revenue beat) plus the market's first vote (day-after close-to-
// close ≥ +5% on ≥2× volume, gap held). Enter within 1-3 days, exit by ~45
// trading days / before the next report, bail if price closes below the
// announcement-day low. The LLM (Piece B) rules organic vs cosmetic.
//
// Data: one Finnhub all-symbol earnings-calendar call + the shared price
// cache for day-1 reactions. Candidates are logged idempotently to Firestore
// `peadSignals` (doc id TICKER_DATE) — the strategy's graded scoreboard.
// ---------------------------------------------------------------------------

var PEAD_SCAN_DAYS    = 7;      // look back this many days for reports
var PEAD_MIN_EPS_SURP = 0.10;   // EPS beat must exceed +10%
var PEAD_MIN_DAY1     = 0.05;   // day-after move must be >= +5%
var PEAD_MIN_VOLX     = 2.0;    // ... on >= 2x the 20-day average volume
var PEAD_EXIT_TDAYS   = 45;     // grading/exit horizon in trading days

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

// Day-1 reaction for one report from the price cache, or null when the
// day-after candle doesn't exist yet (too recent) / data missing.
// hour: 'bmo' = before open (report date IS day 1), else day 1 = next candle.
function _peadDay1(rec, reportDate, hour) {
    var idx = anaEngIndexForDate(rec, reportDate);
    if (idx < 1) return null;
    var day1 = (hour === 'bmo' && rec.dates[idx] === reportDate) ? idx : idx + 1;
    if (day1 <= 0 || day1 >= rec.dates.length) return null;
    var move = rec.close[day1] / rec.close[day1 - 1] - 1;
    var volSum = 0, volN = 0;
    for (var i = Math.max(0, day1 - 21); i < day1; i++) { volSum += rec.volume[i]; volN++; }
    var volX = (volN > 0 && volSum > 0) ? rec.volume[day1] / (volSum / volN) : null;
    return {
        date: rec.dates[day1], move: move, volX: volX,
        gapHeld: rec.close[day1] >= rec.open[day1],
        annLow: rec.low[day1]
    };
}

async function _peadRunScan() {
    var btn = document.getElementById('peadScanBtn');
    var box = document.getElementById('peadProgress');
    if (btn) btn.disabled = true;
    if (box) box.innerHTML = '<p class="muted-text">📈 Fetching the earnings calendar…</p>';

    try {
        await Promise.all([_anaLoadSp500(), _anaLoadUniverseCfg(), _anaLoadHoldingTickers()]);
        var universe = {};
        _anaEffectiveUniverse().forEach(function(t) { universe[t] = true; });

        var to = _anaTodayStr();
        var d = new Date(); d.setDate(d.getDate() - PEAD_SCAN_DAYS);
        var cal = await anaFinnhubEarningsCalendar(d.toISOString().slice(0, 10), to);

        // Surprise trifecta filter (EPS beat >10% + revenue beat).
        var passing = [];
        Object.keys(cal).forEach(function(sym) {
            if (!universe[sym]) return;
            var r = cal[sym];
            if (r.epsActual == null || r.epsEstimate == null || !r.epsEstimate) return;
            var epsSurp = (r.epsActual - r.epsEstimate) / Math.abs(r.epsEstimate);
            if (epsSurp < PEAD_MIN_EPS_SURP) return;
            if (r.revenueActual == null || r.revenueEstimate == null ||
                r.revenueActual <= r.revenueEstimate) return;
            passing.push({ t: sym, date: r.date, hour: r.hour, epsSurp: epsSurp,
                           revSurp: r.revenueActual / r.revenueEstimate - 1 });
        });

        // Market's-first-vote filter from the price cache.
        var candidates = [], tooRecent = 0, noPrices = 0, fadedGap = 0;
        for (var i = 0; i < passing.length; i++) {
            var p = passing[i];
            if (box) box.innerHTML = '<p class="muted-text">📈 Checking day-1 reactions… ' + (i + 1) + ' / ' + passing.length + '</p>';
            var rec = await anaGetPriceHistory(p.t);
            if (!rec) { noPrices++; continue; }
            var d1 = _peadDay1(rec, p.date, p.hour);
            if (!d1) { tooRecent++; continue; }
            if (d1.move < PEAD_MIN_DAY1 || !d1.gapHeld ||
                (d1.volX != null && d1.volX < PEAD_MIN_VOLX)) { fadedGap++; continue; }
            candidates.push({
                t: p.t, name: (typeof _asName === 'function') ? (_asName(p.t) || '') : '',
                reportDate: p.date, epsSurp: p.epsSurp, revSurp: p.revSurp,
                day1Date: d1.date, day1Move: d1.move, volX: d1.volX, annLow: d1.annLow
            });
        }

        // Log new candidates idempotently (doc id = TICKER_DATE).
        var logged = 0;
        for (var c = 0; c < candidates.length; c++) {
            var cand = candidates[c];
            var id = cand.t + '_' + cand.reportDate;
            var ref = userCol('peadSignals').doc(id);
            var snap = await ref.get();
            if (!snap.exists) {
                await ref.set(Object.assign({ createdAt: firebase.firestore.FieldValue.serverTimestamp() }, cand));
                logged++;
            }
        }

        if (box) box.innerHTML = '<p class="muted-text">✓ ' + Object.keys(cal).length + ' reports in the window · ' +
            passing.length + ' passed the surprise filter · ' + candidates.length + ' passed the market\'s-first-vote filter (' +
            logged + ' new) · skipped: ' + fadedGap + ' faded/weak, ' + tooRecent + ' too recent for a day-1 candle, ' +
            noPrices + ' not in the price cache.</p>';
    } catch (e) {
        if (box) box.innerHTML = '<p class="muted-text">✗ Scan failed: ' + escapeHtml(e.message) + '</p>';
        if (btn) btn.disabled = false;
        return;
    }
    if (btn) btn.disabled = false;
    _peadRenderSignals();
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function loadAnalyzerEarningsDriftPage() {
    _analyzerBreadcrumb([{ label: 'Stock Analyzer', href: '#analyzer' }, { label: 'Earnings Drift' }]);
    var page = document.getElementById('page-analyzer-earningsdrift');
    if (!page) return;
    page.innerHTML =
        '<div class="page-header"><h2>📈 Earnings Drift (PEAD)</h2></div>' +
        '<div class="ana-add-row"><a class="ana-sp-btn" href="#analyzer/earningsdrift/about">📖 About Strategy</a></div>' +
        '<p class="muted-text" style="max-width:560px">After a genuine earnings surprise, stocks keep drifting the ' +
        'same direction for 30–60 days. This scans the last week of reports for real beats the market confirmed, ' +
        'then tracks each signal. Enter within 1–3 days, exit by ~45 trading days or the next report — and bail if ' +
        'price closes below the announcement-day low.</p>' +
        '<div class="ana-add-row">' +
            '<button class="btn-primary" id="peadScanBtn" onclick="_peadRunScan()">📈 Scan recent earnings</button>' +
        '</div>' +
        '<div id="peadProgress"></div>' +
        '<div id="peadSignals"><p class="muted-text">Loading signals…</p></div>';
    _peadRenderSignals();
}

function _peadPct(v) {
    if (v == null) return '—';
    return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
}

async function _peadLoadSignals() {
    var snap = await userCol('peadSignals').get();
    var out = [];
    snap.forEach(function(d) { out.push(Object.assign({ id: d.id }, d.data())); });
    out.sort(function(a, b) { return a.reportDate < b.reportDate ? 1 : -1; });   // newest first
    return out;
}

async function _peadRenderSignals() {
    var el = document.getElementById('peadSignals');
    if (!el) return;

    var signals;
    try {
        signals = await _peadLoadSignals();
    } catch (e) {
        el.innerHTML = '<p class="muted-text">✗ Could not load signals: ' + escapeHtml(e.message) + '</p>';
        return;
    }

    if (!signals.length) {
        el.innerHTML = '<p class="muted-text" style="max-width:560px">No signals yet. Run a scan the morning after ' +
            'earnings days — candidates appear here and are tracked automatically. Scans need a reasonably fresh ' +
            'price cache (<a href="#analyzer/dipdrift">update on Dip &amp; Drift</a>) and a Finnhub key.</p>';
        return;
    }

    var html = '<h3 class="ana-section-title">🏁 Signals (' + signals.length + ')</h3>';
    for (var i = 0; i < signals.length; i++) {
        html += await _peadSignalCard(signals[i]);
    }
    el.innerHTML = html;
}

// One signal card: the setup facts + live grading from the price cache.
async function _peadSignalCard(s) {
    var grade = '', invalid = false, exitNote = '';
    try {
        var rec = await anaGetPriceHistory(s.t);
        if (rec) {
            var i1 = anaEngIndexForDate(rec, s.day1Date);
            var last = rec.dates.length - 1;
            if (i1 >= 0 && last > i1) {
                var elapsed = last - i1;
                var end = Math.min(i1 + PEAD_EXIT_TDAYS, last);
                var ret = rec.close[end] / rec.close[i1] - 1;
                // Invalidation: any close below the announcement-day low.
                for (var k = i1 + 1; k <= end; k++) {
                    if (rec.close[k] < s.annLow) { invalid = true; break; }
                }
                var spyRec = await anaGetPriceHistory('SPY');
                var spyTxt = '';
                if (spyRec) {
                    var s1 = anaEngIndexForDate(spyRec, s.day1Date);
                    var sEnd = Math.min(s1 + PEAD_EXIT_TDAYS, spyRec.dates.length - 1);
                    if (s1 >= 0 && sEnd > s1) {
                        var spyRet = spyRec.close[sEnd] / spyRec.close[s1] - 1;
                        spyTxt = ' <span class="muted-text">(SPY ' + _peadPct(spyRet) + ')</span> ' + (ret >= spyRet ? '✅' : '❌');
                    }
                }
                grade = (elapsed >= PEAD_EXIT_TDAYS ? 'Final (+' + PEAD_EXIT_TDAYS + 'td): ' : '+' + elapsed + 'td so far: ') +
                        _peadPct(ret) + spyTxt;
                if (elapsed >= PEAD_EXIT_TDAYS) exitNote = '⏱️ Window complete — the strategy would be out by now.';
                else if (elapsed >= PEAD_EXIT_TDAYS - 5) exitNote = '⏱️ Exit window approaching (~' + (PEAD_EXIT_TDAYS - elapsed) + ' trading days).';
            }
        }
    } catch (e) { /* grading is best-effort */ }

    return '<div class="dm-verdict-card" style="margin-bottom:10px">' +
        '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">' +
            '<strong>' + escapeHtml(s.t) + (s.name ? ' — ' + escapeHtml(s.name) : '') + '</strong>' +
            '<span class="muted-text">reported ' + escapeHtml(s.reportDate) + '</span>' +
        '</div>' +
        '<div class="muted-text" style="margin:4px 0">EPS beat ' + _peadPct(s.epsSurp) + ' · revenue beat ' + _peadPct(s.revSurp) +
            ' · day-1 ' + _peadPct(s.day1Move) + (s.volX != null ? ' on ' + s.volX.toFixed(1) + '× volume' : '') + ' (gap held)</div>' +
        '<div class="muted-text">Invalidation: close below $' + (s.annLow != null ? s.annLow.toFixed(2) : '—') +
            ' (announcement-day low)' + (invalid ? ' — <strong>⚠️ INVALIDATED (closed below it)</strong>' : '') + '</div>' +
        (grade ? '<div style="margin-top:4px">' + grade + (exitNote ? ' <span class="muted-text">' + exitNote + '</span>' : '') + '</div>' : '') +
    '</div>';
}
