# Stock Analysis Ranking Plan

**Status: 📝 PLANNING ONLY — design decisions locked (2026-07-13), fresh-eyes review pass applied (2026-07-16), weights are a proposed v1, no code written yet.**

## Problem

A scan can shortlist up to ~15 candidates per detector. Every card shows a wall of chips
(base rate, quality, insider buys, divergence, target, grades…) but nothing says
**which candidate is actually better than which other candidate**. The user has to read
every chip on every card and form his own judgment call — for 20 candidates, that's slow,
and it's easy for a genuinely strong setup to get buried next to a mediocre one.

Goal: turn the existing chip data into a single **composite score + letter grade** per
candidate, so the user can sort by grade and research the top 5 instead of all 20 — while
being upfront that any weighting is a subjective judgment call, not a scientific formula.

## Design decisions (locked)

These were decided with the user before writing the weight tables below:

1. **Per-detector scoring models.** The four detectors (dip, spring/breakout, post-earnings
   drift, estimate-revision) surface different evidence. Each gets its own weighted metric
   list tuned to what actually matters for that setup, rather than one blended formula.
2. **Missing data is re-weighted, not penalized.** Optional fields (FMP-gated: divergence,
   price target, grades; insufficient-history-gated: conditional base rate) are dropped from
   the formula when absent, and the remaining weights are renormalized to sum to 100%. A
   candidate isn't punished just because an FMP key isn't configured or history is short —
   but see the confidence-tagging note below, since this also means scores aren't always
   apples-to-apples across candidates with different data coverage.
3. **Calibration against real outcomes is a planned future phase, not built now.** The
   Scoreboard already tracks real 30d/60d returns and hit/miss per candidate, split
   kept-vs-dismissed. Once enough graded candidates exist, a later phase will check whether
   higher-scored candidates actually outperformed — see "Future: calibration phase" below.
   Weights below are fixed (reasoned, not derived) until then.
4. **Presentation:** an overall grade badge on each card (prominent), candidates within a
   detector section sorted by grade instead of today's per-detector heuristic sort, and an
   expandable breakdown (reusing the existing `.detail-acc` accordion pattern) showing the
   per-metric sub-scores and weights that produced the grade.

## Scoring architecture

For a candidate `c`, compute:

```
for each metric i defined for c.detector:
    if the underlying field is present on c → include it, weight w_i, subscore s_i (0–100)
    if absent (no FMP key, insufficient history, etc.) → excluded entirely

rawScore = Σ(w_i * s_i) / Σ(w_i)      // renormalized over available metrics only
score    = clamp(rawScore - riskDeductions, 0, 100)
grade    = A (≥80) / B (70–79) / C (55–69) / D (40–54) / F (<40)
coverage = Σ(w_i included) / 100      // e.g. 78% — how much of the full model this score is based on
```

**Why the grade cutoffs sit lower than school grades (review finding, 2026-07-16):** the
subscore mappings top out at 95–100 but realistic values land mid-band, so a hand-computed
*excellent* dip candidate (80% conditional rate, strong divergence, healthy balance sheet,
insider buys) totals only ~77 under this model. With school-style cutoffs (A=90+) an A would
be mathematically unreachable and everything would grade C/D — zero discrimination. The
cutoffs above are set so that same excellent candidate grades B, with A reserved for
outliers. **Phase 1 must still sanity-check the cutoffs against a real distribution**: score
the sandbox's 20-candidate fixture scan and eyeball the spread before locking the bands.

**Per-metric presence rules** (what "the underlying field is present" means, exactly):

- Quality metrics (margin, D/E, current ratio, ROE, dividend): present iff
  `c.quality && !c.quality.error` AND the individual field is non-null — with **one
  exception**: a null `dividendYieldPct` on a successful quality fetch means "pays no
  dividend" (Finnhub returns null for non-payers, e.g. FLEX), which is information, not
  missing data → score it as the 0% band, don't exclude it. Only exclude dividend when
  quality itself is absent/errored.
- Divergence: present iff `c.divergence` exists (`c.divergenceNote` = absent, excluded with
  the note's text shown in the breakdown as the "why").
- Insiders: present iff `c.insiders && !c.insiders.error` (zero purchases is a real
  observation → the 0 band, not an exclusion). Note the data layer caps `purchases` at 5.
- Price target / grades / estimates: present iff the object exists with the needed field
  non-null (all FMP-gated).
- Conditional base rate: present iff `condEvents >= 3` (see the † guard below).

`coverage` is shown alongside the grade (small, e.g. "B · 78% data") so the user can tell a
high grade built on 40% of the model from one built on 95% of it — this is the honesty
mechanism for decision #2 above.

Implementation lands as one new function per detector (`_asScoreDip(c)`, `_asScoreSpring(c)`,
`_asScoreDrift(c)`, `_asScoreRevision(c)`), each returning
`{ total, grade, coverage, breakdown: [{label, raw, subscore, weight, contribution}] }`,
dispatched by a single `_asScoreCard(c)` that switches on `c.detector`. Scored at render time
(not stored on the scan doc) initially, since the underlying chip data is already stored —
recomputing is cheap and means grading logic improvements apply retroactively to old scans.
*(Revisit if this proves slow — cache on the card DOM element per render pass.)*

## Ranking philosophy — why these priorities

Asked to rank "is profitability more important than net margin vs current ratio" — the
short answer is there's no universal formula, but there IS a rough consensus in how
professional equity analysis weights these things, which the tables below lean on:

1. **A track record specific to this exact setup and this exact stock** outweighs generic
   fundamentals — "this stock has recovered from dips like this 8 of 10 times, median 22
   days" is a much stronger fact than "this company has a healthy balance sheet." This is
   why conditional base rate / earnings-surprise-history / gap-momentum lead every table.
2. **Balance-sheet quality (profitability, debt, liquidity) is a risk filter, not an edge.**
   It doesn't predict a bounce; it predicts whether the company can survive being wrong.
   This is standard "quality investing" logic (Graham-style: avoid companies that can't
   weather a rough patch) — weighted meaningfully but below the setup-specific evidence.
3. **Analyst sentiment (estimate divergence, price target, rating changes) is corroborating
   evidence**, not the core thesis — professional opinion can lag or be wrong, but multiple
   analysts moving the same direction is a real, documented signal (post-earnings drift and
   analyst-revision literature both show this has some predictive value).
4. **Insider buying is a strong-but-rare signal** when present (executives have no
   obligation to buy and know the business best — a well-documented behavioral-finance
   signal), but absence of buying isn't a red flag, just no signal — hence a low neutral
   floor rather than a penalty when zero purchases are found.
5. **Dividend yield is context, not signal** — it says what kind of company this is, not
   whether the trade will work — hence the smallest weight everywhere it appears.

## Detector A — Dip / reversal (`dipA`)

The richest data set: quality + insiders + divergence/target/grades all apply — **plus two
technical fields the scan already stamps but the first draft of this plan overlooked**:
`rsi` (RSI-14 at trigger) and `volRatio` (5-day vs 60-day average volume). Both are free,
always present (no API gating), and are the two classic technical confirmations of a
dip-reversal setup (oversold + capitulation flush), so they earn seats at the table.

| Metric | Weight | Subscore mapping |
|---|---:|---|
| Conditional base rate (similar dips hit-rate) † | 20 | direct % (hits/events × 100) — a conditional rate can genuinely span 0–100, so direct is fair here |
| Unconditional base rate | 8 | banded, NOT direct: <30%→35 · 30–40%→50 · 40–55%→70 · 55–70%→85 · >70%→95. (Every candidate already passed the ≥25% scan cutoff, so raw % would just drag all scores down ~40 points without separating anyone.) |
| Divergence (est-vs-price gap, pts) | 13 | <0→20 · 0–5→50 · 5–10→75 · 10–20→90 · >20→100 |
| RSI-14 (oversold confirmation) | 6 | <25→70 (extreme — bounce fuel but knife risk, tapered) · 25–35→85 · 35–45→65 · 45–55→45 · >55→30 (not oversold; the dip may be stale or already recovering) |
| Volume ratio (capitulation flush) | 5 | ≥2.5→85 (panic flush — sellers exhausting) · 1.5–2.5→75 · 1–1.5→55 · <1→40 (quiet drift down, no flush) |
| Profitability / net margin | 9 | unprofitable→10 · 0–5%→35 · 5–15%→60 · 15–25%→85 · >25%→100 |
| Debt / equity | 7 | <0.3→100 · 0.3–1→80 · 1–2→55 · 2–4→25 · >4→5 |
| Current ratio | 3 | <1→20 · 1–1.5→55 · 1.5–3→90 · >3→70 |
| Return on equity | 3 | <0→10 · 0–10%→45 · 10–20%→75 · 20–35%→95 · >35%→70 (very high ROE can mean leverage-driven, so it tapers) |
| Price target upside vs current price | 8 | <0→20 · 0–10%→50 · 10–25%→75 · >25%→95 |
| Analyst grades, net (60d) | 5 | ≤−3→10 · −2..−1→35 · 0→55 · 1–2→75 · ≥3→95 |
| Insider buys (open-market, since dip start) | 9 | 0→45 · 1–2→70 · ≥3→95 |
| Dividend yield | 4 | 0%→50 · 0–2%→60 · 2–4%→70 · >4%→60 (unusually high yield can flag distress, so it caps rather than climbing further) |

† Confidence guard: if `condEvents < 3` (fewer than 3 historical similar-dip episodes to
judge from), drop this metric entirely and let the unconditional base rate's weight absorb
it via renormalization — a rate computed from 1–2 events is noise, not signal.

*Considered and deliberately left out:* dip depth (`dropPct`) and dip age (`daysSincePeak`)
— the trigger itself already gates on depth, and the conditional base rate is computed from
episodes of exactly this shape, so scoring them again would double-count the same fact.

**Risk deductions:** Falling knife flag (unprofitable + debt/eq > 2) → **−15**. Earnings
inside the trading window → **−min(10, round(eventMovePct / 2))**, or a flat **−5** when
`earningsDate` is known but `eventMovePct` is null (price record was unavailable at scan
time — the formula must not assume the move number exists).

## Detector D — Spring / breakout (`springD`)

Thinnest data set today — no quality/insider enrichment, no divergence (those only run for
dip candidates). Only base rate + analyst view + the detector's own trigger fields apply.

**Open question RESOLVED (2026-07-16, read the engine):** `vol` is neither share volume nor
a volume ratio — it's the **annualized realized volatility** from `anaEngRealizedVol`, and
the trigger also computes `volCutoff` (the stock's own bottom-decile threshold that `vol`
had to be under to fire). `vol / volCutoff` is therefore a natural **"spring tightness"**
ratio: ≤1 by construction at trigger time, and lower = the coil is wound tighter than the
detector even required. One catch: the scan currently copies only `close/vol/pctFromHigh`
onto the candidate — **Phase 2 must also stamp `volCutoff`** (one-line scan change; old
scans lack it and the metric simply renormalizes away on them).

| Metric | Weight | Subscore mapping |
|---|---:|---|
| Breakout proximity (% from high — smaller is stronger) | 30 | 0–2%→95 · 2–5%→80 · 5–10%→60 · >10%→35 |
| Spring tightness (vol / volCutoff) | 15 | ≤0.6→95 · 0.6–0.8→80 · 0.8–1.0→65 (needs `volCutoff` stamped — new scans only) |
| Unconditional base rate | 25 | same bands as dipA (banded, not direct) |
| Price target upside vs current price | 15 | same bands as dipA |
| Analyst grades, net (60d) | 15 | same bands as dipA |

**Risk deductions:** Earnings inside the trading window → same formula as dipA.

## Detector B — Post-earnings drift (`driftB`)

| Metric | Weight | Subscore mapping |
|---|---:|---|
| EPS surprise magnitude | 25 | <0%→15 · 0–5%→45 · 5–15%→70 · 15–30%→90 · >30%→100 |
| Revenue beat (bool) | 10 | true→90 · false→40 · unknown→50 |
| Day-1 reaction strength | 10 | <2%→30 · 2–5%→60 · 5–10%→85 · >10%→95 |
| Unconditional base rate | 25 | same bands as dipA (banded, not direct) |
| Price target upside vs current price | 12 | same bands as dipA |
| Analyst grades, net (60d) | 8 | same bands as dipA |
| Freshness (days since reaction, within window) | 10 | 0–2d→95 · 3–5d→75 · 6–10d→50 · >10d→25 (more of the drift's expected run is still ahead) |

**Risk deductions:** Earnings inside the trading window (a second, future report) → same
formula as dipA, when applicable.

## Detector C — Estimate-revision momentum (`revC`)

| Metric | Weight | Subscore mapping |
|---|---:|---|
| Estimate-vs-price gap (pts) | 30 | <0→20 · 0–5→50 · 5–10→75 · 10–20→90 · >20→100 |
| Trend duration (weeks covered) | 15 | 3wk→50 · 4–6wk→75 · >6wk→95 (longer confirmed trend = more confidence) |
| Unconditional base rate | 25 | same bands as dipA (banded, not direct) |
| Price target upside vs current price | 12 | same bands as dipA |
| Analyst grades, net (60d) | 8 | same bands as dipA |
| Analyst coverage breadth (# analysts) | 10 | <3→30 · 3–7→60 · 8–15→85 · >15→95 |

**Data gap found in review (2026-07-16):** the first draft's "# analysts in the estimate
series" referenced a field that doesn't exist on the candidate — `anaEngRevisionTrigger`
computes the analyst count internally (its ≥3 gate) but returns only
`{estChangePct, priceChangePct, gapPts, weeksCovered, close}`. Phase 2 fixes this two ways:
(a) add `analysts` to the trigger's return (one-line engine change, it's already computed)
and stamp it in the scan for new scans; (b) fall back to `c.estimates.numAnalysts` (the FMP
enrichment field, stamped on all shortlist candidates when a key exists) for old scans.
When neither exists, the metric renormalizes away as usual.

**Risk deductions:** Earnings inside the trading window → same formula as dipA.

## Presentation

- **Badge:** small colored pill on each card, e.g. `B · 74 · 82% data` (plain letters only —
  no +/− sub-grades; the numeric score right beside the letter already carries the finer
  resolution), using new CSS classes `.as-grade-a/.as-grade-b/.as-grade-c/.as-grade-d/`
  `.as-grade-f` (green→red, same visual language as the existing `.as-chip-good`/`.as-chip-warn`).
  Cards have no whole-card click handler (verified — only the Open dossier / Dismiss
  buttons), so a clickable badge introduces no event conflicts.
- **Sort:** each detector section sorts its live candidates by `score.total` descending,
  replacing today's per-detector heuristic sort (conditional-hit-rate for dips, etc.) — the
  score already incorporates that same signal as its top-weighted component, so nothing is
  lost, and dismissed candidates still render last as they do now.
- **Breakdown:** clicking the badge expands a `.detail-acc` row (same accordion pattern as
  the dossier's news section) listing every included metric: raw value → subscore → weight
  → contribution to the total, plus a line for any excluded metrics and why ("Divergence
  excluded — no FMP key configured").
- **Dossier too (review addition):** the whole point is "research the top 5" — and research
  happens on the dossier page, so the grade badge + the same breakdown must appear there as
  well (in the dossier header area), or the user loses the score the moment they click
  through. Works automatically for Stock-Rollup-opened dossiers when enough evidence was
  fetchable; degrades to no badge when it isn't.

**Scope notes (things intentionally NOT in the score):**

- **Market regime** (bullish/pullback/panic banner): constant across every candidate in a
  scan, so it can't change the ranking within one — leaving it out is deliberate, not an
  oversight. It still frames how to read absolute grades ("a B during panic ≠ a B during a
  bull run"), which belongs in the AppHelp text, not the formula.
- **The shortlist cap runs before scoring can exist.** Candidates are ranked by the old
  heuristics and capped at 15-per-detector BEFORE quality/analyst enrichment happens, and
  the score needs that enrichment — so the score cannot influence which 15 make the cut.
  A candidate that would have scored well can, in principle, be cut at the cap by the
  heuristic. Fixing that would mean enriching every triggered candidate (API cost blowup);
  accepted as a known limitation.
- **Cross-detector comparability:** each detector has its own table, so an 82 dip and an 82
  spring are not the same statement. The sections are separate and sorted independently,
  which is exactly the within-detector ranking the score is for — but the AppHelp text
  should say plainly: compare grades within a section, not across sections.

## Future: calibration phase (not now)

Once the Scoreboard has a meaningful sample of **graded** (non-pending) candidates — a
reasonable bar is 30+, given this is a personal tool and sample sizes will stay small — add
a diagnostic (not an automatic reweighing) that:

1. Buckets closed candidates by grade (A/B/C/D/F) and shows the actual hit-rate and average
   ret60 per bucket, next to the Scoreboard's existing hit-rate stat.
2. Computes a simple correlation between each individual metric's subscore and actual
   outcome (hit/miss, ret60) across graded candidates, surfaced as a table — "is conditional
   base rate actually correlated with outcomes in your data, or is insider buying pulling
   more weight than it deserves?"
3. Leaves weight changes as a manual decision for the user to make from that evidence,
   rather than auto-adjusting — with this few data points, an automatic fit would overfit
   noise, not find truth.

This deliberately stays a read-only report, not a feedback loop that silently changes
grades between visits.

**Why render-time scoring makes this work retroactively:** scores are computed from the
chip data already stamped on the scan docs, not stored — so the calibration phase simply
calls `_asScoreCard(c)` on every historical candidate using the *current* weight tables.
That's the right diagnostic ("does today's model predict yesterday's outcomes?") and it
means no schema change and no waiting for scores to accumulate: the day this ships, every
past graded candidate is already usable calibration data.

## Open questions / things to confirm before/during implementation

- ~~Confirm `anaEngSpringTrigger`'s `vol` field shape~~ **RESOLVED 2026-07-16** — it's
  annualized realized volatility; the tightness metric is now in the Detector D table, with
  the `volCutoff` stamping requirement noted there.
- Exact threshold numbers everywhere in this doc (bands, deduction sizes, grade cutoffs) are
  a reasoned first pass, not derived from data — Phase 1 now explicitly includes scoring the
  sandbox's 20-candidate fixture scan and reviewing the distribution before locking the
  grade cutoffs.
- Decide whether the breakdown accordion is per-card (always available) or a shared modal
  like the dossier's `#adInfoModal` — leaning per-card accordion since the breakdown is
  candidate-specific data, not a reusable glossary entry.

## Execution Plan

Phased so each stage ships something independently verifiable, richest/best-tested data
first — matching the stage-by-stage pattern used elsewhere in this project.

### Phase 1 — Core scoring engine (dipA only)
- `_asScoreDip(c)` in `analyzer-scan.js`: per-metric subscore functions for the dipA table
  above, renormalization over available metrics (per the presence rules in "Scoring
  architecture"), risk deductions, grade banding, `coverage`.
- `_asScoreCard(c)` dispatcher (detector switch; other detectors fall through to `null` until
  their phase lands).
- No UI change yet — verify by hand-calling `_asScoreCard()` in the console against real
  enriched dip candidates from the sandbox and a couple of synthetic edge cases (no FMP key,
  `condEvents < 3`, falling-knife flag, earnings-in-window, null `eventMovePct`,
  null-dividend-on-successful-quality).
- **Grade-cutoff distribution check:** score the 20-candidate fixture scan
  (`vj2ZUouu64RFXXzEbnSj`) + the enriched 2026-07-11 scan, eyeball the spread, and adjust
  the A/B/C/D/F cutoffs if the distribution says they're wrong — BEFORE any badge ships.

### Phase 2 — Remaining detector scorers (+ two small stamping fixes)
- Engine: `anaEngRevisionTrigger` returns `analysts` (already computed internally); scan
  stamps it on revC candidates. Scan also stamps `volCutoff` on springD candidates (the
  trigger already returns it). Both are additive — old scans just renormalize those metrics
  away. These touch `analyzer-engine.js` + the scan compute loop → version bumps for both.
- `_asScoreSpring(c)`, `_asScoreDrift(c)`, `_asScoreRevision(c)` following the Phase 1
  pattern (revision's analyst count falls back to `c.estimates.numAnalysts` on old scans).
- Verify each against real/synthetic candidates the same way as Phase 1.

### Phase 3 — Badge + sort on the scan page
- New CSS: `.as-grade-a` … `.as-grade-f`.
- `_asCandidateCard(c)` renders the grade badge (e.g. `B · 74 · 82% data`).
- `_asRenderScan` sorts each detector's live candidates by `score.total` descending
  (replacing today's per-detector heuristic sort), dismissed candidates still last.
- Verify visually in preview across all four detector sections.

### Phase 4 — Expandable breakdown (scan cards + dossier)
- Per-card `.detail-acc` accordion (reusing the existing pattern) listing each included
  metric's raw value → subscore → weight → contribution, plus excluded metrics and why.
- Same badge + breakdown in the dossier header (`_adRender`) — the score must follow the
  user to where the actual research happens.
- Verify the numbers in the accordion sum to the badge's total.

### Phase 5 — Docs & close-out
- Update `MyLife-Functional-Spec.md` Part 8f (scoring/grading behavior) and `AppHelp.md`
  `screen:analyzer-scan` (what the grade means, in plain language).
- Version bumps (`analyzer-scan.js`, `styles.css`) + `sw.js` CACHE_NAME bump.
- Commit + push per usual cadence.

### Phase 6 (later, gated on data volume) — Calibration diagnostic
- Not scheduled as part of this execution — revisit once the Scoreboard has 30+ graded
  candidates. Read-only correlation report per "Future: calibration phase" above; no
  automatic weight changes.

## Build Log

- **2026-07-16 — Fresh-eyes review pass (planning only, no code).** Cross-checked the plan
  against the actual engine/scan code and fixed what it found: (1) grade cutoffs were
  mathematically unreachable — a hand-computed excellent dip candidate scored ~77 under
  A=90 bands → cutoffs lowered to A≥80/B≥70/C≥55/D≥40 with a mandatory Phase-1 distribution
  check; (2) base-rate direct-% mapping replaced with bands (every candidate already passed
  the ≥25% cutoff, so raw % was pure drag); (3) dipA gains RSI-14 + volume-ratio metrics —
  both already stamped on every dip candidate, overlooked by the first draft; (4) the spring
  `vol` open question resolved: it's realized volatility, and `vol/volCutoff` becomes a
  "spring tightness" metric (needs `volCutoff` stamped — Phase 2); (5) revC's analyst-count
  metric referenced a field that doesn't exist on candidates — trigger will return it +
  `estimates.numAnalysts` fallback; (6) per-metric presence rules spelled out (null dividend
  = "pays none" not missing; `divergenceNote` = excluded-with-reason; null `eventMovePct` →
  flat −5); (7) grade badge + breakdown extended to the dossier page; (8) scope notes added
  (regime deliberately excluded, pre-enrichment shortlist cap limitation, within-detector
  comparability); (9) dropped the "B+" sub-grade inconsistency (plain letters only);
  (10) noted render-time scoring makes calibration retroactive over all historical scans.

*(Implementation not started. Phase 1 is next: the dipA scorer.)*
