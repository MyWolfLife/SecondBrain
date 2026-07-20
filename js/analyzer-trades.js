'use strict';

// ---------------------------------------------------------------------------
// Stock Analyzer — trade tickets + live tracking (Stage 8)
// ---------------------------------------------------------------------------
// A trade ticket turns a dossier into a tracked position: entry, thesis, and
// the three exits, monitored against the cached daily prices. Closing a trade
// records what happened AND whether the thesis was right — the raw material
// for the Stage 9 scoreboard.
//
// Firestore: userCol('analyzerTrades') — one doc per trade.
// ---------------------------------------------------------------------------

var _atTrades = null;   // cached list (invalidated on writes)

// ---------------------------------------------------------------------------
// Ticket creation (called from the dossier)
// ---------------------------------------------------------------------------

// Creates a trade from the dossier context. Expects the dossier's thesis and
// exit fields to be already saved on the scan candidate (the dossier does
// that before calling). Returns the new doc id.
async function atCreateTrade(opts) {
    // One open ticket per ticker+detector — pyramiding is a Stage-Later debate
    var existing = await _atLoadTrades();
    var dup = existing.find(function(t) {
        return t.status === 'open' && t.ticker === opts.ticker && t.detector === opts.detector;
    });
    if (dup) throw new Error('There is already an open trade for ' + opts.ticker + ' (' + opts.detector + '). Close it first.');

    var trade = {
        createdAt:  new Date().toISOString(),
        ticker:     opts.ticker,
        detector:   opts.detector,
        scanId:     opts.scanId   || null,
        scanDate:   opts.scanDate || null,
        thesis:     opts.thesis   || '',
        entryDate:  opts.entryDate,
        entryPrice: opts.entryPrice,
        shares:     opts.shares != null ? opts.shares : null,
        exits:      opts.exits,
        targetPrice: opts.entryPrice * (1 + opts.exits.targetPct / 100),
        stopPrice:   opts.entryPrice * (1 - opts.exits.stopPct  / 100),
        status:     'open',
        closeDate:  null, closePrice: null, closeReason: null,
        retPct:     null, spyRetPct: null,
        thesisVerdict: null, closeNotes: ''
    };
    var ref = await userCol('analyzerTrades').add(trade);
    _atTrades = null;
    return ref.id;
}

async function _atLoadTrades() {
    if (_atTrades) return _atTrades;
    var snap = await userCol('analyzerTrades').orderBy('createdAt', 'desc').limit(100).get();
    _atTrades = [];
    snap.forEach(function(d) { _atTrades.push(Object.assign({ id: d.id }, d.data())); });
    return _atTrades;
}

// ---------------------------------------------------------------------------
// Live status of an open trade against the cached prices
// ---------------------------------------------------------------------------

// Returns {lastPrice, lastDate, pnlPct, daysHeld, state, stateNote}
// state: 'ok' | 'target' | 'stop' | 'time'
async function _atLiveStatus(trade) {
    var rec = await anaGetPriceHistory(trade.ticker);
    if (!rec || !rec.dates.length) return null;
    var n = rec.dates.length - 1;
    var lastPrice = rec.close[n];
    var entryIdx = anaEngIndexForDate(rec, trade.entryDate);
    // Trading days held = candles strictly after the entry date
    var daysHeld = entryIdx >= 0 ? (n - entryIdx) : 0;

    var state = 'ok', note = '';
    if (lastPrice >= trade.targetPrice)                { state = 'target'; note = '🎯 Target reached'; }
    else if (lastPrice <= trade.stopPrice)             { state = 'stop';   note = '🛑 Stop breached'; }
    else if (daysHeld >= trade.exits.timeStopDays)     { state = 'time';   note = '⏰ Time stop expired'; }

    return {
        lastPrice: lastPrice,
        lastDate:  rec.dates[n],
        pnlPct:    (lastPrice / trade.entryPrice - 1) * 100,
        daysHeld:  daysHeld,
        state:     state,
        stateNote: note
    };
}

// SPY return between two dates (close-to-close), or null.
async function _atSpyReturn(fromDate, toDate) {
    var spy = await anaGetPriceHistory('SPY');
    if (!spy) return null;
    var a = anaEngIndexForDate(spy, fromDate);
    var b = anaEngIndexForDate(spy, toDate);
    if (a < 0 || b <= a) return null;
    return (spy.close[b] / spy.close[a] - 1) * 100;
}

// ---------------------------------------------------------------------------
// Trades page (#analyzer/trades)
// ---------------------------------------------------------------------------

async function loadAnalyzerTradesPage() {
    _analyzerBreadcrumb([{ label: 'Stock Analyzer', href: '#analyzer' }, { label: 'Dip & Drift', href: '#analyzer/dipdrift' }, { label: 'Trades' }]);
    var page = document.getElementById('page-analyzer-trades');
    if (!page) return;
    page.innerHTML = '<p class="muted-text" style="padding:16px">Loading trades…</p>';

    var trades;
    try { trades = await _atLoadTrades(); }
    catch (e) {
        page.innerHTML = '<p class="muted-text" style="padding:16px">Could not load trades: ' + escapeHtml(e.message) + '</p>';
        return;
    }

    var open   = trades.filter(function(t) { return t.status === 'open'; });
    var closed = trades.filter(function(t) { return t.status === 'closed'; });

    var html = '<div class="page-header"><h2>🎫 Trades</h2></div>';

    // ── Open positions ──
    html += '<h3 class="ana-section-title">Open positions (' + open.length + ')</h3>';
    if (!open.length) {
        html += '<p class="muted-text">No open trades. Create one from a candidate’s dossier on the Scan page.</p>';
    } else {
        html += '<div id="atOpenList"><p class="muted-text">Checking prices…</p></div>';
    }

    // ── Closed trades ──
    html += '<h3 class="ana-section-title">Closed trades (' + closed.length + ')</h3>';
    if (!closed.length) {
        html += '<p class="muted-text">Nothing closed yet.</p>';
    } else {
        var wins = closed.filter(function(t) { return t.retPct > 0; });
        var avg  = closed.reduce(function(a, t) { return a + (t.retPct || 0); }, 0) / closed.length;
        var right = closed.filter(function(t) { return t.thesisVerdict === 'right'; }).length;

        // Trading days held per closed trade — the SAME unit the time stop uses
        // (so a time-stopped trade reads ~timeStopDays, not the larger calendar
        // count). From the price cache; calendar-day fallback when uncached.
        var closedTd = {};
        for (var ci = 0; ci < closed.length; ci++) {
            var crec = await anaGetPriceHistory(closed[ci].ticker);
            closedTd[closed[ci].id] = _atTradingDaysHeld(crec, closed[ci].entryDate, closed[ci].closeDate);
        }

        html += '<p class="muted-text">' + wins.length + ' of ' + closed.length + ' profitable · avg ' + _abFmtPct(avg) +
            ' per trade · thesis right ' + right + ' of ' + closed.length + '</p>' +
            '<div class="ab-table-wrap"><table class="ab-table">' +
            '<tr><th>Ticker</th><th>Entry</th><th>Exit</th><th title="Trading days from entry to exit — the same unit as the time stop">Days held</th><th>Ret</th><th>SPY</th><th>Reason</th><th>Thesis</th><th>Notes</th></tr>';
        closed.forEach(function(t) {
            var reasonBadge = t.closeReason === 'target' ? 'ab-badge-win' : (t.closeReason === 'stop' ? 'ab-badge-loss' : 'ab-badge-neutral');
            var verdictIcon = t.thesisVerdict === 'right' ? '✅' : (t.thesisVerdict === 'wrong' ? '❌' : (t.thesisVerdict === 'mixed' ? '➗' : '—'));
            html += '<tr>' +
                '<td><strong>' + escapeHtml(t.ticker) + '</strong></td>' +
                '<td>' + t.entryDate + ' $' + t.entryPrice.toFixed(2) + '</td>' +
                '<td>' + (t.closeDate || '—') + ' $' + (t.closePrice != null ? t.closePrice.toFixed(2) : '—') + '</td>' +
                '<td>' + _atDaysHeldCell(closedTd[t.id], t.entryDate, t.closeDate) + '</td>' +
                '<td class="' + (t.retPct > 0 ? 'ab-pos' : 'ab-neg') + '">' + _abFmtPct(t.retPct) + '</td>' +
                '<td class="ab-dim">' + _abFmtPct(t.spyRetPct) + '</td>' +
                '<td><span class="ab-badge ' + reasonBadge + '">' + escapeHtml(t.closeReason || '—') + '</span></td>' +
                '<td title="' + escapeHtml(t.thesis || '') + '">' + verdictIcon + '</td>' +
                '<td class="ab-dim">' + escapeHtml((t.closeNotes || '').slice(0, 60)) + '</td>' +
            '</tr>';
        });
        html += '</table></div>';
    }

    page.innerHTML = html;

    // Fill in live status for open positions (async per trade, cache-backed)
    if (open.length) {
        var list = document.getElementById('atOpenList');
        var cards = '';
        for (var i = 0; i < open.length; i++) {
            cards += await _atOpenCard(open[i]);
        }
        if (list) list.innerHTML = cards;
    }
}

function _atCalDays(fromDate, toDate) {
    if (!fromDate || !toDate) return '—';
    return Math.round((new Date(toDate) - new Date(fromDate)) / 86400000);
}

// Trading days between entry and close from a price record — candles strictly
// after the entry date, through the close date. Matches the open-card counter
// (`n - entryIdx`) and the time-stop unit. null when uncomputable.
function _atTradingDaysHeld(rec, fromDate, toDate) {
    if (!rec || !rec.dates || !toDate) return null;
    var i0 = anaEngIndexForDate(rec, fromDate);
    var i1 = anaEngIndexForDate(rec, toDate);
    if (i0 < 0 || i1 < i0) return null;
    return i1 - i0;
}

// Closed-trade "Days held" cell: trading days (consistent with the time stop),
// calendar days shown on hover; calendar-day fallback (tagged) when the ticker
// isn't cached so no trading-day count is available.
function _atDaysHeldCell(tradingDays, fromDate, toDate) {
    var cal = _atCalDays(fromDate, toDate);
    if (tradingDays != null)
        return '<span title="' + cal + ' calendar days">' + tradingDays + '</span>';
    return '<span title="calendar days — no cached prices for a trading-day count">' + cal + ' cal</span>';
}

async function _atOpenCard(t) {
    var live = await _atLiveStatus(t);
    var name = _asName(t.ticker);

    var stateHtml = '';
    if (live && live.state !== 'ok') {
        var cls = live.state === 'target' ? 'as-regime-good' : (live.state === 'stop' ? 'as-regime-bad' : 'as-regime-warn');
        stateHtml = '<div class="as-regime ' + cls + '" style="margin:6px 0">' + live.stateNote + ' — review and close below.</div>';
    }

    var html = '<div class="as-card">' +
        '<div class="as-card-top">' +
            '<span class="as-card-ticker">' + escapeHtml(t.ticker) +
                (name ? ' <span class="as-card-name">' + escapeHtml(name) + '</span>' : '') + '</span>' +
            (live ? '<span class="' + (live.pnlPct >= 0 ? 'ab-pos' : 'ab-neg') + '" style="font-weight:700">' + _abFmtPct(live.pnlPct) + '</span>' : '') +
        '</div>' +
        '<p class="as-card-reason">Entered ' + escapeHtml(t.entryDate) + ' at $' + t.entryPrice.toFixed(2) +
            (t.shares ? ' · ' + t.shares + ' shares' : '') +
            (live ? ' · now $' + live.lastPrice.toFixed(2) + ' (data ' + escapeHtml(live.lastDate) + ')' : ' · no cached prices — update price data') +
            (t.shares && live ? ' · P&amp;L $' + ((live.lastPrice - t.entryPrice) * t.shares).toFixed(0) : '') +
        '</p>' +
        stateHtml +
        '<div class="as-chip-row">' +
            '<span class="as-chip">🎯 $' + t.targetPrice.toFixed(2) + ' (+' + t.exits.targetPct + '%)</span>' +
            '<span class="as-chip">🛑 $' + t.stopPrice.toFixed(2) + ' (−' + t.exits.stopPct + '%)</span>' +
            '<span class="as-chip">⏰ trading day ' + (live ? live.daysHeld : '—') + ' of ' + t.exits.timeStopDays + '</span>' +
        '</div>' +
        (t.thesis ? '<p class="ab-dim" style="margin:6px 0 0">💭 ' + escapeHtml(t.thesis) + '</p>' : '') +
        '<div class="ab-form-row" style="margin:8px 0 0">' +
            '<button class="ana-sp-btn" onclick="_atShowCloseForm(\'' + t.id + '\')">Close trade</button>' +
        '</div>' +
        '<div id="atClose_' + t.id + '"></div>' +
    '</div>';
    return html;
}

// ---------------------------------------------------------------------------
// Close flow
// ---------------------------------------------------------------------------

async function _atShowCloseForm(tradeId) {
    var box = document.getElementById('atClose_' + tradeId);
    if (!box) return;
    var trades = await _atLoadTrades();
    var t = trades.find(function(x) { return x.id === tradeId; });
    if (!t) return;

    var live = await _atLiveStatus(t);
    var suggestedPrice  = live ? live.lastPrice : t.entryPrice;
    var suggestedReason = live && live.state !== 'ok' ? live.state : 'manual';

    box.innerHTML =
        '<div class="ab-form" style="border-top:1px solid #eee; margin-top:8px; padding-top:8px">' +
            '<div class="ab-form-row">' +
                '<label>Close price $ <input type="number" id="atClosePrice_' + tradeId + '" value="' + suggestedPrice.toFixed(2) + '" step="0.01" min="0" style="width:90px"></label>' +
                '<label>Reason <select id="atCloseReason_' + tradeId + '">' +
                    ['target', 'stop', 'time', 'manual'].map(function(r) {
                        return '<option value="' + r + '"' + (r === suggestedReason ? ' selected' : '') + '>' + r + '</option>';
                    }).join('') +
                '</select></label>' +
                '<label>Thesis was <select id="atVerdict_' + tradeId + '">' +
                    '<option value="">—</option><option value="right">right</option>' +
                    '<option value="wrong">wrong</option><option value="mixed">mixed</option>' +
                '</select></label>' +
            '</div>' +
            '<div class="ab-form-row">' +
                '<input type="text" id="atCloseNotes_' + tradeId + '" placeholder="Close notes (optional)" style="flex:1; max-width:400px; padding:6px 8px; border:1px solid #ccc; border-radius:8px">' +
            '</div>' +
            '<div class="ab-form-row">' +
                '<button class="btn-primary" onclick="_atCloseTrade(\'' + tradeId + '\')">Confirm close</button>' +
                '<button class="ana-sp-btn" onclick="document.getElementById(\'atClose_' + tradeId + '\').innerHTML=\'\'">Cancel</button>' +
            '</div>' +
        '</div>';
}

async function _atCloseTrade(tradeId) {
    var trades = await _atLoadTrades();
    var t = trades.find(function(x) { return x.id === tradeId; });
    if (!t) return;

    var closePrice = parseFloat((document.getElementById('atClosePrice_' + tradeId) || {}).value);
    if (!closePrice || closePrice <= 0) { alert('Enter a valid close price.'); return; }
    var closeDate = new Date().toISOString().slice(0, 10);

    var update = {
        status:      'closed',
        closeDate:   closeDate,
        closePrice:  closePrice,
        closeReason: (document.getElementById('atCloseReason_' + tradeId) || {}).value || 'manual',
        retPct:      (closePrice / t.entryPrice - 1) * 100,
        spyRetPct:   await _atSpyReturn(t.entryDate, closeDate),
        thesisVerdict: (document.getElementById('atVerdict_' + tradeId) || {}).value || null,
        closeNotes:  (document.getElementById('atCloseNotes_' + tradeId) || {}).value || ''
    };
    try {
        await userCol('analyzerTrades').doc(tradeId).update(update);
        _atTrades = null;
        loadAnalyzerTradesPage();
    } catch (e) {
        console.error('[trades] close failed:', e);
        alert('Could not close the trade: ' + e.message);
    }
}
