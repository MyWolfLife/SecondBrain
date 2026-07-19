# HoldingsHealthPlan.md — Portfolio Health Check (Goal 2)

## Purpose

The original Stock Analyzer brief had **two goals**. Goal 1 (find short-term buys) shipped as
Dip & Drift + the ranking system. **Goal 2 — a forward-looking health check on the stocks you
already own — has never been built** beyond the Stock Rollup → dossier bridge. This doc freezes
the design and the build for **Holdings Health**: its own tool that runs a battery of
exit-oriented checks per held ticker and emits a plain verdict — **✅ Healthy / 👀 Watch /
⚠️ Review exit** — with the evidence behind it.

It is the mirror image of the buy side: the same ingredients we already compute (estimate
snapshots, quality metrics, analyst grades/targets, trend, regime), read for *deterioration*
instead of *opportunity*. **The tool surfaces evidence; the user decides every exit.**

---

## Locked design decisions

1. **Forward-looking only — holding duration is irrelevant.** "Been in too long" was the brief's
   instinct, but time held is sunk-cost thinking. The only honest question is: *given what's true
   now and what the next few months look like, would you buy this today?* If no, that's a
   review-exit signal whether you've held it three weeks or three years. **No entry date, no
   holding-duration input, anywhere.** (Entry dates aren't reliably tracked on holdings anyway —
   and by this philosophy they don't matter.)
2. **Its own tool, not a buy strategy.** The six hub strategies *find buys*; this *reviews what
   you own*. It gets its own entry point, visually distinct from the six-strategy grid (a
   "Portfolio" mini-heading below the grid), and the hub's "six trading strategies" copy is
   updated to acknowledge a portfolio tool.
3. **Verdict = flag-count, not a 0–100 score.** A precise number would imply exit-timing precision
   the data can't support (nobody trusts "Sell: 34/100"). Each check emits Healthy / Watch /
   Concern; the verdict counts concerns, with the **estimate-deterioration check weighted heavier**
   (it's the flagship — the mirror of Detector C). Reads like a checklist a human would run.
4. **Evidence, never advice.** "Review exit" is the strongest verdict — a prompt to look, not a
   sell order. Same honest-coverage machinery as the candidate grades: a check with no data is
   **excluded and shown as "not checked," never counted against the stock**; a verdict built on
   thin coverage says so.
5. **Snapshot coverage is already handled** (verified 2026-07-19): the weekly estimate snapshot
   (`_asMaybeSnapshotEstimates`) records `_anaEffectiveUniverse()`, which is `S&P ∪ holdings ∪
   watchlist`. Held tickers already accrue EPS history, so the flagship check has data today for
   anything FMP covers. **No coverage fix needed** — this is what makes the feature mostly assembly.

---

## The checks (each maps to a function that already exists)

Run per held ticker (`_anaLoadHoldingTickers` → the same read path as Stock Rollup). Each check
returns `{ status: 'healthy'|'watch'|'concern'|'na', label, detail, weight }`.

| # | Check | Concern when… | Weight | Source |
|---|-------|---------------|:---:|--------|
| 1 | **Estimate trajectory** (flagship) | consensus EPS is *falling* over the weekly snapshots (mirror of `anaEngRevisionTrigger`, downward) | **2** | `_asExtractEstSeries` + new `anaEngDeteriorationCheck` |
| 2 | **Trend** | price below BOTH 50d and 200d averages | 1 | `anaEngSma` |
| 3 | **Analyst momentum** | net downgrades over last 60d, or consensus target now at/below price | 1 | `anaFmpGrades`, `anaFmpPriceTarget` |
| 4 | **Quality** | unprofitable AND heavy debt (the "falling knife" test, on something you own) | 1 | `anaFinnhubMetrics` |
| 5 | **Earnings risk** | a report lands inside the next ~window, with a large ±typical move | 1 | `anaEarningsCalendar`, `anaEngTypicalEventMovePct` |
| — | **Regime** | page-level context banner, NOT a per-stock check | — | `anaEngRegime` |

**Verdict rollup (flag-count):** sum the weight of every check whose status is `concern`
(flagship counts 2, others 1); `watch` statuses count as ½. Missing (`na`) checks are excluded
from both numerator and the coverage line, never penalized.

- **⚠️ Review exit** — flagship is a concern on its own, OR total concern-weight ≥ 3.
- **👀 Watch** — total concern-weight ≥ 1 but below the review bar.
- **✅ Healthy** — no concerns.
- Each verdict chip also shows a coverage note (how many checks had data), same honesty rule as
  the buy-side grade pill. A verdict on 2-of-5 checks is a weaker statement than one on 5-of-5.

Thresholds (the exact EPS-decline %, the ±move size that trips earnings risk, the target-vs-price
margin) are **first-pass judgment calls, tuned during Piece A against real holdings**, and
documented in the About page — same convention as the ranking plan's bands.

---

## Routing & placement

- New route `#analyzer/holdingshealth` → `loadAnalyzerHoldingsHealthPage()` in a new file
  `js/analyzer-holdingshealth.js` (matches the one-file-per-strategy convention:
  `analyzer-stockmomentum.js`, `analyzer-dualmomentum.js`).
- New page section `page-analyzer-holdingshealth` in index.html; script tag + `sw.js` asset entry.
- Hub (`loadAnalyzerHub` in analyzer.js): add the tile below the six-strategy grid under a
  "Portfolio" heading; update the intro copy.
- Breadcrumb: `Stock Analyzer › Holdings Health`.
- Reuses the `AS_CHIP_INFO` tap-for-detail registry pattern for every check chip (or a parallel
  `HH_CHECK_INFO` if the shapes diverge) so each check explains itself in plain language + depth.

---

## Execution Plan (resumable pieces — write each as you finish it)

Follow the CLAUDE.md pre-commit checklist on every piece: spec (Part 8-analyzer) + AppHelp
(new `## screen:analyzer-holdingshealth`) in the SAME commit, bump the changed JS `?v=` in
index.html AND `sw.js` CACHE_NAME, notify-before-push, commit+push.

### Piece A — Checks engine + verdict (pure logic, verifiable in isolation)
- `anaEngDeteriorationCheck(rec, series, opts)` in analyzer-engine.js — downward mirror of
  `anaEngRevisionTrigger` (EPS falling, price not already fully reflecting it). Returns the
  deterioration magnitude or null.
- `_hhRunChecks(ticker, rec, ...)` and `_hhVerdict(checks)` in analyzer-holdingshealth.js —
  the five checks + flag-count rollup + coverage.
- **Verify:** hand-computed cases through the real functions in the preview (healthy name,
  flagship-only → Review exit, thin-coverage → weak verdict, all-na → "not checked"). No page yet.

### Piece B — The page + verdict chips
- `loadAnalyzerHoldingsHealthPage()`: load holdings, regime banner, one card per holding sorted
  worst-verdict-first, each with its verdict chip + tappable check chips + a refresh note.
- Wire the hub tile + route + section + registry entries.
- **Verify:** login test account, load the page, confirm real holdings render with sensible
  verdicts and no console errors; screenshot.

### Piece C — Docs, help, About page
- `## screen:analyzer-holdingshealth` in AppHelp (Quick Help + Details), spec section, an
  **📖 About Holdings Health** education page (why forward-looking, what each check means, the
  flag-count logic, the honest limits), AppHelp registration, AllPlans.md row, this doc's status.

---

## Build Log (newest first)

- **2026-07-19 — ✅ Piece A COMPLETE (checks engine + verdict, pure logic).** Added
  `anaEngDeteriorationCheck(rec, snapshots, opts)` to analyzer-engine.js — the exit-side mirror
  of `anaEngRevisionTrigger` (fires on consensus EPS revised DOWN; does not gate on price lag
  since a falling estimate concerns a holder regardless, but reports `priceReacted` to flag the
  urgent "price hasn't caught down yet" case). New `js/analyzer-holdingshealth.js` with the five
  pure checks (`_hhCheckEstimates` [flagship, weight 2], `_hhCheckTrend`, `_hhCheckAnalysts`,
  `_hhCheckQuality`, `_hhCheckEarnings`), the flag-count `_hhVerdict`, and the async `_hhRunChecks`
  orchestrator that fetches (FMP grades/target, Finnhub metrics) and delegates. Thresholds are
  module consts (`HH_*`) for easy tuning. **Verified in preview** against the real functions:
  `anaEngDeteriorationCheck` exact on 5 cases (−20% cut detected; rising/too-few/thin-analysts/
  short-span all → null); every check's na/healthy/watch/concern path; verdict rollup (flagship-
  alone → review, 3 concerns → review, 2 → watch, watches → watch, thin/zero coverage counted
  honestly); and `_hhRunChecks` end-to-end on real FLEX candles — no-key path degrades to 3/5
  checked without throwing, synthetic-deterioration path → Review exit. No console errors. No
  user-visible surface yet (no route/page/tile) — that is Piece B. Bumps: analyzer-engine.js v8,
  analyzer-holdingshealth.js v1 (new), sw v508.
- **2026-07-19 — Plan frozen.** Design locked with the user: own tool, forward-looking only (no
  duration), flag-count verdict (flagship weighted 2×), evidence-not-advice, honest coverage.
  Key finding: snapshot coverage already includes holdings, so no early fix — the feature is
  assembly of existing signals. Three resumable pieces defined. No code yet.
