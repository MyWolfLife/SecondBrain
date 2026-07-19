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
// LLM verdict: organic vs cosmetic beat (Piece B)
// ---------------------------------------------------------------------------
// Headline numbers are priced in minutes; the QUALITY of the beat is not.
// Preferred evidence: the earnings-call transcript (FMP; falls through on a
// limited plan). Fallback: two weeks of Finnhub news around the report.

async function _peadFetchTranscript(ticker, reportDate) {
    // The report usually covers the fiscal quarter ~45 days before the call.
    var d = new Date(reportDate + 'T00:00:00Z');
    d.setDate(d.getDate() - 45);
    var year = d.getUTCFullYear(), quarter = Math.floor(d.getUTCMonth() / 3) + 1;
    var data = await _anaFmpGet('earning-call-transcript?symbol=' + encodeURIComponent(ticker) +
                                '&year=' + year + '&quarter=' + quarter);
    var content = Array.isArray(data) && data[0] && data[0].content;
    if (!content) throw new Error('no transcript');
    return content.slice(0, 8000);   // enough for tone + guidance; caps token cost
}

async function _peadVerdict(signalId, btn) {
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
        var ref = userCol('peadSignals').doc(signalId);
        var snap = await ref.get();
        if (!snap.exists) throw new Error('signal not found');
        var s = snap.data();

        // Evidence: transcript preferred, news fallback.
        var evidence = '', evidenceKind = '';
        try {
            evidence = await _peadFetchTranscript(s.t, s.reportDate);
            evidenceKind = 'earnings-call transcript (excerpt)';
        } catch (e1) {
            try {
                var d = new Date(s.reportDate + 'T00:00:00Z'); d.setDate(d.getDate() - 3);
                var to = new Date(s.reportDate + 'T00:00:00Z'); to.setDate(to.getDate() + 10);
                var items = await anaFinnhubNews(s.t, d.toISOString().slice(0, 10), to.toISOString().slice(0, 10), 15);
                evidence = (items || []).map(function(it) {
                    return '- ' + it.headline + (it.summary ? ' — ' + it.summary.slice(0, 200) : '');
                }).join('\n');
                evidenceKind = 'news around the report';
            } catch (e2) { /* metrics-only read below */ }
        }

        var reply = await _investAiCallLLM([
            { role: 'system', content:
                'You are an earnings analyst evaluating a post-earnings-announcement-drift (PEAD) candidate. ' +
                'The stock beat estimates and the market confirmed with a strong day-one reaction. Your ONE question: ' +
                'is this an ORGANIC beat (real operating strength — volume/margin/demand — with strengthening guidance) ' +
                'or a COSMETIC beat (one-time items, tax benefits, buybacks shrinking the share count, easy comparisons, ' +
                'hedged or lowered guidance)? Drift follows organic beats; cosmetic beats fade. Start your reply with ' +
                'exactly one line: "VERDICT: ORGANIC", "VERDICT: COSMETIC", or "VERDICT: UNCLEAR". Then 3-5 plain ' +
                'sentences of reasoning. No investment advice — the user decides.' },
            { role: 'user', content:
                s.t + (s.name ? ' (' + s.name + ')' : '') + ' reported ' + s.reportDate + '. EPS beat estimates by ' +
                (s.epsSurp * 100).toFixed(1) + '%, revenue beat by ' + (s.revSurp * 100).toFixed(1) + '%. Day-after: ' +
                (s.day1Move * 100).toFixed(1) + '% on ' + (s.volX != null ? s.volX.toFixed(1) : '?') + 'x volume, gap held.\n\n' +
                (evidence ? 'Evidence (' + evidenceKind + '):\n' + evidence : 'No transcript or news available — judge from the numbers alone and say so.') }
        ]);

        var m = /VERDICT:\s*(ORGANIC|COSMETIC|UNCLEAR)/i.exec(reply || '');
        await ref.update({
            verdict: m ? m[1].toUpperCase() : 'UNCLEAR',
            verdictReason: (reply || '').trim(),
            verdictEvidence: evidenceKind || 'metrics only'
        });
        _peadRenderSignals();
    } catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = '🤖 Real beat?'; }
        alert('Verdict failed: ' + e.message);
    }
}

var PEAD_VERDICT_BADGE = { ORGANIC: '🟢 ORGANIC', COSMETIC: '🔴 COSMETIC', UNCLEAR: '⚪ UNCLEAR' };

function _peadToggleReason(id) {
    var el = document.getElementById('peadReason-' + id);
    if (el) el.style.display = (el.style.display === 'none') ? '' : 'none';
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

    // Teach panel — section 5.4 recap
    html += '<details class="dm-teach"><summary>📖 How this works — and when it looks broken</summary>' +
        '<div class="dm-teach-body">' +
        '<p><strong>The rules:</strong> a candidate needs a real surprise (EPS beat >10% AND revenue beat — revenue ' +
        'is much harder to massage) plus the market\'s first vote (day-after ≥+5% on ≥2× volume, gap held into the ' +
        'close). Enter within 1–3 days — no chasing the open; the drift is measured in weeks. Exit by ~45 trading ' +
        'days and always before the next report. Bail early if price closes below the announcement-day low: the gap ' +
        'failed and the thesis is dead.</p>' +
        '<p><strong>Why it works:</strong> investors underreact to earnings news. Analysts raise estimates and ' +
        'targets one by one over weeks (the revision conveyor belt), each upgrade pulling in another wave of buyers. ' +
        'And surprises come in streaks — one big beat is usually chapter one of a multi-quarter story priced as a ' +
        'one-off. The headline is priced in minutes; the QUALITY of the beat is not — that\'s what the 🤖 verdict reads.</p>' +
        '<p><strong>Expectations:</strong> this is a batting-average strategy — winners drift ~+3–7% over the window, ' +
        'losers get cut at the invalidation level, and trades cluster in the four earnings seasons with quiet gaps ' +
        'between. All gains are short-term: <strong>strongly prefers an IRA</strong>, and use limit orders — thin ' +
        'edges can\'t afford sloppy fills.</p>' +
        '<p><strong>It is broken only if</strong> the graded signals persistently lose to SPY across several ' +
        'seasons. Individual losers are routine and expected. In a bear market, drift is weaker and stops trigger ' +
        'more — smaller or no positions when SPY is below its 200-day average is the canonical play. ' +
        'Full write-up: 📖 About Strategy, and TradingStrategiesPlan.md sections 5.4 and 6.4.</p>' +
        '</div></details>';

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
        '<div style="margin-top:6px">' +
            (s.verdict
                ? '<a href="javascript:void(0)" onclick="_peadToggleReason(\'' + escapeHtml(s.id) + '\')">' +
                  (PEAD_VERDICT_BADGE[s.verdict] || s.verdict) + '</a> <span class="muted-text">(' + escapeHtml(s.verdictEvidence || '') + ')</span>'
                : '<button class="ana-sp-btn" onclick="_peadVerdict(\'' + escapeHtml(s.id) + '\', this)">🤖 Real beat?</button>') +
        '</div>' +
        (s.verdictReason
            ? '<div class="qv-thesis" id="peadReason-' + escapeHtml(s.id) + '" style="display:none;margin-top:6px">' +
              escapeHtml(s.verdictReason).replace(/\n/g, '<br>') + '</div>'
            : '') +
    '</div>';
}
