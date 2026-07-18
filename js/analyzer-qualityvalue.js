'use strict';

// ---------------------------------------------------------------------------
// Quality-Value strategy (#analyzer/qualityvalue)
// ---------------------------------------------------------------------------
// Plan document: TradingStrategiesPlan.md (sections 5.3, 6.3, 7.3).
// Frozen rules (Magic-Formula style): rank the S&P 500 (minus Financials,
// Utilities, Real Estate — the metrics lie there) on earnings yield TTM and
// return on capital TTM, sum the two ranks, hold the top 25 equal-weighted
// with a max of 4 per sector. Re-screen ANNUALLY; hold ~1 year.
//
// Data: 2 FMP calls per ticker (key-metrics-ttm + ratios-ttm) through the
// shared _anaFmpGet choke-point (~900 calls per run — fine at annual cadence).
// Results are stored in Firestore `qvScreens` so the screen is viewable all
// year without refetching. Grading (Piece B) compares each stored screen's
// list vs SPY since its screen date, computed from the price cache on render.
// ---------------------------------------------------------------------------

var QV_TOP_N          = 25;
var QV_SECTOR_CAP     = 4;
var QV_EXCLUDED       = ['financials', 'utilities', 'real estate'];
var QV_RESCREEN_DAYS  = 335;   // ~11 months → "time to re-screen" nudge

var _qvRunning   = false;
var _qvCancelled = false;

// ---------------------------------------------------------------------------
// Screen job
// ---------------------------------------------------------------------------

// Fundamentals for one ticker: { ey, roc } (either may be null → caller skips).
async function _qvFetchMetrics(ticker) {
    var km = null, rt = null;
    try { km = (await _anaFmpGet('key-metrics-ttm?symbol=' + encodeURIComponent(ticker)))[0] || null; } catch (e) {}
    try { rt = (await _anaFmpGet('ratios-ttm?symbol='      + encodeURIComponent(ticker)))[0] || null; } catch (e) {}
    function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
    var ey  = km ? num(km.earningsYieldTTM) : null;
    var roc = null;
    if (rt) roc = num(rt.returnOnCapitalEmployedTTM);
    if (roc == null && km) roc = num(km.returnOnInvestedCapitalTTM);
    return { ey: ey, roc: roc };
}

// Runs the full screen: fetch → rank → sector-cap → save to qvScreens.
async function _qvRunScreen() {
    if (_qvRunning) return;
    _qvRunning = true; _qvCancelled = false;

    var btn = document.getElementById('qvRunBtn');
    var box = document.getElementById('qvProgress');
    if (btn) btn.disabled = true;

    try {
        var key = await anaFmpGetKey();
        if (!key) throw new Error('the screen needs an FMP API key (Settings → Stock Analyzer)');

        var sp = await _anaLoadSp500();
        var universe = sp.companies.filter(function(c) {
            return QV_EXCLUDED.indexOf((c.s || '').toLowerCase()) === -1;
        });

        var rows = [], skipped = 0;
        for (var i = 0; i < universe.length; i++) {
            if (_qvCancelled) throw new Error('cancelled');
            var c = universe[i];
            if (box && i % 5 === 0) {
                box.innerHTML = '<p class="muted-text">💎 Screening ' + (i + 1) + ' / ' + universe.length +
                    ' (' + skipped + ' skipped) — about ' + Math.ceil((universe.length - i) / 60) + ' min left… ' +
                    '<button class="ana-sp-btn" onclick="_qvCancelled = true">Cancel</button></p>';
            }
            var m = await _qvFetchMetrics(c.t);
            if (m.ey == null || m.roc == null) { skipped++; continue; }
            rows.push({ t: c.t, n: c.n, sector: c.s || '', ey: m.ey, roc: m.roc });
        }
        if (rows.length < QV_TOP_N) throw new Error('only ' + rows.length + ' tickers had usable fundamentals');

        // Combined rank: sum of the two metric ranks (1 = best), lowest wins.
        var byEy  = rows.slice().sort(function(a, b) { return b.ey  - a.ey;  });
        var byRoc = rows.slice().sort(function(a, b) { return b.roc - a.roc; });
        var rankEy = {}, rankRoc = {};
        byEy.forEach(function(r, i)  { rankEy[r.t]  = i + 1; });
        byRoc.forEach(function(r, i) { rankRoc[r.t] = i + 1; });
        rows.forEach(function(r) { r.score = rankEy[r.t] + rankRoc[r.t]; });
        rows.sort(function(a, b) { return a.score - b.score; });

        // Fill top 25 with the sector cap.
        var top = [], perSector = {};
        for (var j = 0; j < rows.length && top.length < QV_TOP_N; j++) {
            var r = rows[j];
            var sec = r.sector || '?';
            if ((perSector[sec] || 0) >= QV_SECTOR_CAP) continue;
            perSector[sec] = (perSector[sec] || 0) + 1;
            r.rank = top.length + 1;
            top.push(r);
        }

        await userCol('qvScreens').add({
            date: new Date().toISOString().slice(0, 10),
            universeCount: universe.length, ranked: rows.length, skipped: skipped,
            rows: top,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        if (box) box.innerHTML = '';
    } catch (e) {
        if (box) box.innerHTML = '<p class="muted-text">✗ Screen ' +
            (e.message === 'cancelled' ? 'cancelled' : 'failed: ' + escapeHtml(e.message)) + '</p>';
        _qvRunning = false;
        if (btn) btn.disabled = false;
        return;
    }
    _qvRunning = false;
    _qvRender();   // re-render with the new screen
}

// ---------------------------------------------------------------------------
// LLM value-trap thesis (Piece B)
// ---------------------------------------------------------------------------
// The screen's blind spot: trailing numbers can't tell "cheap because hated"
// from "cheap because dying". The LLM reads the metrics + a month of news
// headlines and rules on it. Saved onto the screen doc so it's a one-time
// cost per name per screen.

async function _qvThesis(screenId, ticker, btn) {
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
        var screens = await _qvLoadScreens();
        var screen = screens.find(function(s) { return s.id === screenId; });
        var row = screen && screen.rows.find(function(r) { return r.t === ticker; });
        if (!row) throw new Error('row not found');

        var headlines = [];
        try {
            var to = _anaTodayStr();
            var d = new Date(); d.setDate(d.getDate() - 30);
            var items = await anaFinnhubNews(ticker, d.toISOString().slice(0, 10), to, 15);
            headlines = (items || []).map(function(it) { return '- ' + (it.headline || ''); }).filter(function(h) { return h.length > 3; });
        } catch (e) { /* news optional — thesis still runs on metrics alone */ }

        var reply = await _investAiCallLLM([
            { role: 'system', content:
                'You are a skeptical value-investing analyst reviewing a Magic-Formula screen result ' +
                '(cheap + profitable stocks). Your one job: is this company cheap because it is HATED ' +
                '(fine business, bad narrative — a value opportunity) or cheap because it is DYING ' +
                '(structural decline, melting ice cube — a value trap)? Start your reply with exactly one line: ' +
                '"TRAP RISK: LOW", "TRAP RISK: MEDIUM", or "TRAP RISK: HIGH". Then 3-5 plain sentences of reasoning. ' +
                'Be blunt about structural threats (secular decline, disruption, leverage). No investment advice — ' +
                'the user decides.' },
            { role: 'user', content:
                ticker + ' (' + (row.n || '') + ', sector: ' + (row.sector || '?') + ') screened at rank ' + row.rank +
                '. Earnings yield ' + (row.ey * 100).toFixed(1) + '%, return on capital ' + (row.roc * 100).toFixed(1) + '%.\n\n' +
                (headlines.length ? 'Recent news headlines (last 30 days):\n' + headlines.join('\n') : 'No recent news available.') }
        ]);

        var m = /TRAP RISK:\s*(LOW|MEDIUM|HIGH)/i.exec(reply || '');
        row.trapRisk = m ? m[1].toUpperCase() : 'UNKNOWN';
        row.thesis = (reply || '').trim();
        await userCol('qvScreens').doc(screenId).update({ rows: screen.rows });
        _qvRender();
    } catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = '🤖'; }
        alert('Thesis failed: ' + e.message);
    }
}

var QV_RISK_BADGE = { LOW: '🟢 low', MEDIUM: '🟡 medium', HIGH: '🔴 HIGH', UNKNOWN: '⚪ ?' };

// ---------------------------------------------------------------------------
// Grading — each stored screen's list vs SPY since its screen date
// ---------------------------------------------------------------------------

async function _qvGrade(screen) {
    var spyRec = await anaGetPriceHistory('SPY');
    if (!spyRec) return null;
    var s0 = anaEngIndexForDate(spyRec, screen.date);
    var s1 = spyRec.close.length - 1;
    if (s0 < 0 || s1 <= s0) return null;
    var sum = 0, n = 0;
    for (var i = 0; i < screen.rows.length; i++) {
        var rec = await anaGetPriceHistory(screen.rows[i].t);
        if (!rec) continue;
        var i0 = anaEngIndexForDate(rec, screen.date);
        var i1 = rec.close.length - 1;
        if (i0 < 0 || i1 <= i0 || !(rec.close[i0] > 0)) continue;
        sum += rec.close[i1] / rec.close[i0] - 1;
        n++;
    }
    if (n === 0) return null;
    return { list: sum / n, spy: spyRec.close[s1] / spyRec.close[s0] - 1, n: n };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function loadAnalyzerQualityValuePage() {
    _analyzerBreadcrumb([{ label: 'Stock Analyzer', href: '#analyzer' }, { label: 'Quality-Value' }]);
    var page = document.getElementById('page-analyzer-qualityvalue');
    if (!page) return;
    page.innerHTML =
        '<div class="page-header"><h2>💎 Quality-Value</h2></div>' +
        '<p class="muted-text" style="max-width:560px">Good businesses at cheap prices — the S&amp;P 500 ' +
        '(minus financials, utilities, and real estate) ranked on earnings yield + return on capital, ' +
        'Magic-Formula style. Screen once a year, hold the list about a year. ' +
        'Slow by design; the droughts are the moat.</p>' +
        '<div id="qvContent"><p class="muted-text">Loading…</p></div>';
    _qvRender();
}

function _qvPct(v) {
    if (v == null) return '—';
    return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
}

async function _qvLoadScreens() {
    var snap = await userCol('qvScreens').get();
    var out = [];
    snap.forEach(function(d) { out.push(Object.assign({ id: d.id }, d.data())); });
    out.sort(function(a, b) { return a.date < b.date ? -1 : 1; });
    return out;
}

async function _qvRender() {
    var el = document.getElementById('qvContent');
    if (!el) return;

    var screens;
    try {
        screens = await _qvLoadScreens();
    } catch (e) {
        el.innerHTML = '<p class="muted-text">✗ Could not load screens: ' + escapeHtml(e.message) + '</p>';
        return;
    }

    var latest = screens.length ? screens[screens.length - 1] : null;
    var html = '';

    // Run/re-run control with annual-cadence guidance.
    var ageDays = latest ? _anaDaysBetween(latest.date, _anaTodayStr()) : null;
    if (!latest) {
        html += '<p class="muted-text" style="max-width:560px">No screen run yet. The first run fetches ' +
            'fundamentals for the whole universe (~10 minutes, needs an FMP key) and stores the result — ' +
            'after that you only look at it, and re-screen about once a year.</p>';
    } else if (ageDays > QV_RESCREEN_DAYS) {
        html += '<div class="dm-change-banner">🗓️ This screen is <strong>' + Math.round(ageDays / 30) +
            ' months old</strong> — Quality-Value re-screens annually. Time to run a fresh one.</div>';
    }
    html += '<div class="ana-add-row">' +
        '<button class="btn-primary" id="qvRunBtn" onclick="_qvRunScreen()">💎 Run ' + (latest ? 'a fresh' : 'the first') + ' screen</button>' +
    '</div><div id="qvProgress"></div>';

    if (latest) {
        html += '<h3 class="ana-section-title">📋 Current list — screened ' + escapeHtml(latest.date) +
            (ageDays != null ? ' (' + (ageDays < 45 ? ageDays + ' days' : Math.round(ageDays / 30) + ' months') + ' ago)' : '') + '</h3>' +
            '<p class="muted-text" style="max-width:560px">' + latest.ranked + ' of ' + latest.universeCount +
            ' companies had usable fundamentals (' + latest.skipped + ' skipped) · max ' + QV_SECTOR_CAP + ' per sector.</p>';
        html += '<div class="dm-history"><table class="dm-table"><thead><tr>' +
            '<th>#</th><th>Ticker</th><th>Name</th><th>Sector</th><th>Earnings yield</th><th>Return on capital</th><th>Trap check</th>' +
            '</tr></thead><tbody>';
        for (var i = 0; i < latest.rows.length; i++) {
            var r = latest.rows[i];
            var trapCell = r.thesis
                ? '<a href="javascript:void(0)" onclick="_qvToggleThesis(\'' + escapeHtml(r.t) + '\')">' + (QV_RISK_BADGE[r.trapRisk] || r.trapRisk) + '</a>'
                : '<button class="ana-sp-btn" onclick="_qvThesis(\'' + latest.id + '\',\'' + escapeHtml(r.t) + '\', this)">🤖</button>';
            html += '<tr>' +
                '<td>' + r.rank + '</td>' +
                '<td><strong>' + escapeHtml(r.t) + '</strong></td>' +
                '<td>' + escapeHtml(r.n || '') + '</td>' +
                '<td>' + escapeHtml(r.sector || '') + '</td>' +
                '<td>' + _qvPct(r.ey) + '</td>' +
                '<td>' + _qvPct(r.roc) + '</td>' +
                '<td>' + trapCell + '</td>' +
            '</tr>';
            if (r.thesis) {
                html += '<tr class="qv-thesis-row" id="qvThesis-' + escapeHtml(r.t) + '" style="display:none">' +
                    '<td colspan="7"><div class="qv-thesis">' + escapeHtml(r.thesis).replace(/\n/g, '<br>') + '</div></td></tr>';
            }
        }
        html += '</tbody></table></div>';
        html += '<p class="muted-text" style="max-width:560px">🤖 = ask the AI whether the name is cheap-because-hated ' +
            'or cheap-because-dying (reads the metrics + a month of news). Run it on any name you\'re considering — ' +
            'the verdict saves onto this screen.</p>';

        // Screen history, graded from the price cache (never stored).
        html += '<h3 class="ana-section-title">🏁 Screen history</h3>';
        html += '<div class="dm-history"><table class="dm-table"><thead><tr>' +
            '<th>Screened</th><th>Top pick</th><th>List vs SPY since screen</th>' +
            '</tr></thead><tbody>';
        for (var si = screens.length - 1; si >= 0; si--) {
            var s = screens[si];
            var g = null;
            try { g = await _qvGrade(s); } catch (eG) {}
            var gradeHtml = g
                ? _qvPct(g.list) + ' <span class="muted-text">(SPY ' + _qvPct(g.spy) + ', ' + g.n + ' of ' + s.rows.length + ' priced)</span> ' + (g.list >= g.spy ? '✅' : '❌')
                : '<span class="muted-text">— (needs tickers in the price cache)</span>';
            html += '<tr>' +
                '<td>' + escapeHtml(s.date) + '</td>' +
                '<td>' + escapeHtml(s.rows.length ? s.rows[0].t : '—') + '</td>' +
                '<td>' + gradeHtml + '</td>' +
            '</tr>';
        }
        html += '</tbody></table></div>' +
            '<p class="muted-text" style="max-width:560px">Remember the timescale: this strategy is judged across ' +
            '<strong>years, not months</strong> — a losing first year is normal and expected sometimes.</p>';
    }

    // Teach panel — section 5.3 recap
    html += '<details class="dm-teach"><summary>📖 How this works — and when it looks broken</summary>' +
        '<div class="dm-teach-body">' +
        '<p><strong>The rules:</strong> rank the universe on earnings yield (cheapness) and return on capital ' +
        '(quality), add the two ranks, hold the ~25 best combined scores about a year, re-screen, rotate. ' +
        'Max ' + QV_SECTOR_CAP + ' per sector. Financials/utilities/real estate excluded (the metrics lie there).</p>' +
        '<p><strong>Why it works:</strong> markets overextrapolate — great stories get priced as if growth lasts ' +
        'forever, troubled ones as if the trouble is permanent. Quality removes the truly dying companies from ' +
        'the cheap list. What remains is good businesses having a bad year. This is systematized Buffett.</p>' +
        '<p><strong>Why it still works:</strong> time arbitrage. The payoff horizon is years, and value can trail ' +
        'growth for a DECADE (2010–2020) — no professional survives waiting that long, but you can. ' +
        'Greenblatt: "it still works because it doesn\'t always work." The droughts ARE the moat.</p>' +
        '<p><strong>It is broken only if</strong> the screen history above loses to SPY across a full cycle ' +
        '(think 5+ years). Quitting in year 2 of a drought is the classic failure — the best fund of 2000–2010 ' +
        'made 18%/yr while its average investor lost money by quitting at the bottoms.</p>' +
        '<p><strong>Buying the list means</strong> owning unloved things (homebuilders in 2022, tobacco, ' +
        'mature tech) and never owning the exciting stuff. That discomfort is the edge. Don\'t override the ' +
        'rank on vibes — use the 🤖 trap check instead, then decide.</p>' +
        '<p><strong>Taxes:</strong> the one strategy of the five that\'s reasonable in a taxable account — ' +
        'low turnover, mostly long-term gains. Greenblatt\'s trick: sell losers just BEFORE the 1-year mark ' +
        '(short-term loss offsets more), winners just AFTER it (long-term rate). ' +
        'Full write-up: TradingStrategiesPlan.md sections 5.3 and 6.3.</p>' +
        '</div></details>';

    el.innerHTML = html;
}

function _qvToggleThesis(ticker) {
    var row = document.getElementById('qvThesis-' + ticker);
    if (row) row.style.display = (row.style.display === 'none') ? '' : 'none';
}
