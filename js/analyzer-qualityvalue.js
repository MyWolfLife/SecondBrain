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
            '<th>#</th><th>Ticker</th><th>Name</th><th>Sector</th><th>Earnings yield</th><th>Return on capital</th>' +
            '</tr></thead><tbody>';
        for (var i = 0; i < latest.rows.length; i++) {
            var r = latest.rows[i];
            html += '<tr>' +
                '<td>' + r.rank + '</td>' +
                '<td><strong>' + escapeHtml(r.t) + '</strong></td>' +
                '<td>' + escapeHtml(r.n || '') + '</td>' +
                '<td>' + escapeHtml(r.sector || '') + '</td>' +
                '<td>' + _qvPct(r.ey) + '</td>' +
                '<td>' + _qvPct(r.roc) + '</td>' +
            '</tr>';
        }
        html += '</tbody></table></div>';
    }

    el.innerHTML = html;
}
