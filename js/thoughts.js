// ============================================================
// thoughts.js — Thoughts section landing page
// ============================================================

function loadThoughtsPage() {
    // Count Top 10 Lists and update the tile label
    userCol('top10lists').get().then(function(snap) {
        var el = document.getElementById('top10ListsCount');
        if (el) el.textContent = 'Top 10 Lists (' + snap.size + ')';
    }).catch(function(err) {
        console.error('loadThoughtsPage top10lists error:', err);
    });

    // Count Memories and update the tile label
    mmCounts().then(function(c) {      // mine (private + shares I own) and, separately, shared with me (sharememory.js)
        var el = document.getElementById('memoriesCount');
        if (el) el.textContent = 'Memories (' + c.own + (c.shared ? ' + ' + c.shared + ' shared' : '') + ')';
    }).catch(function(err) {
        console.error('loadThoughtsPage memories error:', err);
    });

    // Count My Views and update the tile label
    thCounts().then(function(c) {      // mine (private + shares I own) and, separately, shared with me (sharethought.js)
        var el = document.getElementById('viewsCount');
        if (el) el.textContent = 'My Thoughts (' + c.own + (c.shared ? ' + ' + c.shared + ' shared' : '') + ')';
    }).catch(function(err) {
        console.error('loadThoughtsPage views error:', err);
    });
}
