'use strict';

// ---------------------------------------------------------------------------
// Stock Analyzer — short-term trade candidate finder (Life → Financial)
// ---------------------------------------------------------------------------
// Plan document: StockAnalyzerPlan.md
// Built in stages. Stage 1 = scaffolding & navigation (this file's initial
// version). Later stages add: universe manager, price cache (IndexedDB),
// detector engine, Backtest Lab, live scanner, dossiers, trade tickets.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shared breadcrumb helper
// ---------------------------------------------------------------------------

function _analyzerBreadcrumb(trail) {
    // trail = array of {label, href?} — last item is the current page (no link)
    var html = '<a href="#life">Life</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<a href="#investments">Financial</a>';
    trail.forEach(function(t) {
        html += '<span class="separator">&rsaquo;</span>';
        html += t.href ? '<a href="' + t.href + '">' + escapeHtml(t.label) + '</a>'
                       : '<span>' + escapeHtml(t.label) + '</span>';
    });
    document.getElementById('breadcrumbBar').innerHTML = html;
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';
}

// ---------------------------------------------------------------------------
// Hub page (#analyzer)
// ---------------------------------------------------------------------------

function loadAnalyzerPage() {
    _analyzerBreadcrumb([{ label: 'Stock Analyzer' }]);

    var page = document.getElementById('page-analyzer');
    if (!page) return;

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>🎯 Stock Analyzer</h2>' +
        '</div>' +
        '<p class="muted-text" style="max-width:560px">' +
            'Finds short-term trade setups — quality companies knocked down by emotion, ' +
            'post-earnings drift, and more. The tool assembles the evidence; the decision is yours.' +
        '</p>' +
        '<div class="invest-hub">' +
            '<a class="invest-hub-card" href="#analyzer/backtest">' +
                '<span class="invest-hub-icon">🧪</span>' +
                '<div class="invest-hub-text">' +
                    '<div class="invest-hub-title">Backtest Lab</div>' +
                    '<div class="invest-hub-desc">Walk-forward simulation — how would the detectors have done historically?</div>' +
                '</div>' +
                '<span class="invest-hub-arrow">›</span>' +
            '</a>' +
            '<a class="invest-hub-card" href="#analyzer/scan">' +
                '<span class="invest-hub-icon">📡</span>' +
                '<div class="invest-hub-text">' +
                    '<div class="invest-hub-title">Scan</div>' +
                    '<div class="invest-hub-desc">Run the detectors on the universe and review candidate shortlists</div>' +
                '</div>' +
                '<span class="invest-hub-arrow">›</span>' +
            '</a>' +
            '<a class="invest-hub-card" href="#analyzer/universe">' +
                '<span class="invest-hub-icon">🌐</span>' +
                '<div class="invest-hub-text">' +
                    '<div class="invest-hub-title">Universe</div>' +
                    '<div class="invest-hub-desc">The tickers being watched — S&amp;P 500, your holdings, and your watchlist</div>' +
                '</div>' +
                '<span class="invest-hub-arrow">›</span>' +
            '</a>' +
        '</div>';
}

// ---------------------------------------------------------------------------
// Placeholder sub-pages — replaced as each build stage lands
// ---------------------------------------------------------------------------

function _analyzerRenderPlaceholder(pageId, title, icon, desc, stageNote) {
    var page = document.getElementById(pageId);
    if (!page) return;
    page.innerHTML =
        '<div class="page-header">' +
            '<h2>' + icon + ' ' + escapeHtml(title) + '</h2>' +
        '</div>' +
        '<p class="muted-text" style="max-width:560px">' + escapeHtml(desc) + '</p>' +
        '<div class="invest-hub-card invest-hub-card--soon" style="max-width:560px">' +
            '<span class="invest-hub-icon">🚧</span>' +
            '<div class="invest-hub-text">' +
                '<div class="invest-hub-title">Coming soon <span class="invest-hub-badge">' + escapeHtml(stageNote) + '</span></div>' +
                '<div class="invest-hub-desc">This page is scaffolded but not yet built.</div>' +
            '</div>' +
        '</div>';
}

function loadAnalyzerUniversePage() {
    _analyzerBreadcrumb([{ label: 'Stock Analyzer', href: '#analyzer' }, { label: 'Universe' }]);
    _analyzerRenderPlaceholder('page-analyzer-universe', 'Universe', '🌐',
        'Manage the ticker list the analyzer watches: the S&P 500 constituents, tickers pulled in from your holdings, and any watchlist additions.',
        'Stage 2');
}

function loadAnalyzerBacktestPage() {
    _analyzerBreadcrumb([{ label: 'Stock Analyzer', href: '#analyzer' }, { label: 'Backtest Lab' }]);
    _analyzerRenderPlaceholder('page-analyzer-backtest', 'Backtest Lab', '🧪',
        'Simulate running the detectors every Friday from a past start date, grade every signal against what actually happened, and see a success/failure scorecard.',
        'Stage 5');
}

function loadAnalyzerScanPage() {
    _analyzerBreadcrumb([{ label: 'Stock Analyzer', href: '#analyzer' }, { label: 'Scan' }]);
    _analyzerRenderPlaceholder('page-analyzer-scan', 'Scan', '📡',
        'Run the detectors across the universe: market regime, funnel stats, and per-detector candidate shortlists with the evidence attached.',
        'Stage 6');
}
