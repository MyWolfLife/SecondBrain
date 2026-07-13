# Stock Analysis Ranking Plan

**Status: 📝 PLANNING ONLY — design decisions locked (2026-07-13), weights are a proposed v1, no code written yet.**

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
grade    = A (90–100) / B (80–89) / C (65–79) / D (50–64) / F (<50)
coverage = Σ(w_i included) / 100      // e.g. 78% — how much of the full model this score is based on
```

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

The richest data set: quality + insiders + divergence/target/grades all apply.

| Metric | Weight | Subscore mapping |
|---|---:|---|
| Conditional base rate (similar dips hit-rate) † | 22 | direct % (hits/events × 100) |
| Unconditional base rate | 10 | direct % |
| Divergence (est-vs-price gap, pts) | 14 | <0→20 · 0–5→50 · 5–10→75 · 10–20→90 · >20→100 |
| Profitability / net margin | 10 | unprofitable→10 · 0–5%→35 · 5–15%→60 · 15–25%→85 · >25%→100 |
| Debt / equity | 8 | <0.3→100 · 0.3–1→80 · 1–2→55 · 2–4→25 · >4→5 |
| Current ratio | 4 | <1→20 · 1–1.5→55 · 1.5–3→90 · >3→70 |
| Return on equity | 3 | <0→10 · 0–10%→45 · 10–20%→75 · 20–35%→95 · >35%→70 (very high ROE can mean leverage-driven, so it tapers) |
| Price target upside vs current price | 8 | <0→20 · 0–10%→50 · 10–25%→75 · >25%→95 |
| Analyst grades, net (60d) | 5 | ≤−3→10 · −2..−1→35 · 0→55 · 1–2→75 · ≥3→95 |
| Insider buys (open-market, since dip start) | 10 | 0→45 · 1–2→70 · ≥3→95 |
| Dividend yield | 6 | 0%→50 · 0–2%→60 · 2–4%→70 · >4%→60 (unusually high yield can flag distress, so it caps rather than climbing further) |

† Confidence guard: if `condEvents < 3` (fewer than 3 historical similar-dip episodes to
judge from), drop this metric entirely and let the unconditional base rate's weight absorb
it via renormalization — a rate computed from 1–2 events is noise, not signal.

**Risk deductions:** Falling knife flag (unprofitable + debt/eq > 2) → **−15**. Earnings
inside the trading window → **−min(10, round(eventMovePct / 2))**.

## Detector D — Spring / breakout (`springD`)

Thinnest data set today — no quality/insider enrichment, no divergence (those only run for
dip candidates). Only base rate + analyst view + the detector's own trigger fields apply.

| Metric | Weight | Subscore mapping |
|---|---:|---|
| Breakout strength (% from high — smaller is stronger) | 35 | 0–2%→95 · 2–5%→80 · 5–10%→60 · >10%→35 |
| Unconditional base rate | 25 | direct % |
| Price target upside vs current price | 20 | same bands as dipA |
| Analyst grades, net (60d) | 20 | same bands as dipA |

**Risk deductions:** Earnings inside the trading window → same formula as dipA.

*Open implementation question: `anaEngSpringTrigger`'s `vol` field needs a closer look before
coding — if it turns out to be a normalized volume ratio (not a raw share count), it should
replace one of the above weights as a "breakout confirmed by volume" component. Flagging
here rather than guessing at its shape from this doc alone.*

## Detector B — Post-earnings drift (`driftB`)

| Metric | Weight | Subscore mapping |
|---|---:|---|
| EPS surprise magnitude | 25 | <0%→15 · 0–5%→45 · 5–15%→70 · 15–30%→90 · >30%→100 |
| Revenue beat (bool) | 10 | true→90 · false→40 · unknown→50 |
| Day-1 reaction strength | 10 | <2%→30 · 2–5%→60 · 5–10%→85 · >10%→95 |
| Unconditional base rate | 25 | direct % |
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
| Unconditional base rate | 25 | direct % |
| Price target upside vs current price | 12 | same bands as dipA |
| Analyst grades, net (60d) | 8 | same bands as dipA |
| Analyst coverage breadth (# analysts in the estimate series) | 10 | <3→30 · 3–7→60 · 8–15→85 · >15→95 |

**Risk deductions:** Earnings inside the trading window → same formula as dipA.

## Presentation

- **Badge:** small colored pill on each card, e.g. `B+ · 82` or `B · 82% data`, using new
  CSS classes `.as-grade-a/.as-grade-b/.as-grade-c/.as-grade-d/.as-grade-f` (green→red, same
  visual language as the existing `.as-chip-good`/`.as-chip-warn`).
- **Sort:** each detector section sorts its live candidates by `score.total` descending,
  replacing today's per-detector heuristic sort (conditional-hit-rate for dips, etc.) — the
  score already incorporates that same signal as its top-weighted component, so nothing is
  lost, and dismissed candidates still render last as they do now.
- **Breakdown:** clicking the badge expands a `.detail-acc` row (same accordion pattern as
  the dossier's news section) listing every included metric: raw value → subscore → weight
  → contribution to the total, plus a line for any excluded metrics and why ("Divergence
  excluded — no FMP key configured").

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

## Open questions / things to confirm before/during implementation

- Confirm `anaEngSpringTrigger`'s `vol` field shape (see Detector D note above) before
  finalizing that table.
- Exact threshold numbers everywhere in this doc (bands, deduction sizes, grade cutoffs) are
  a reasoned first pass, not derived from data — expect to tune them once real scores are
  visible against real candidates in the sandbox, before or during the "verify in preview"
  pass for whichever stage implements this.
- Decide whether the breakdown accordion is per-card (always available) or a shared modal
  like the dossier's `#adInfoModal` — leaning per-card accordion since the breakdown is
  candidate-specific data, not a reusable glossary entry.

## Build Log

*(Empty — implementation not started. First stage would be the dipA scorer, since it has
the richest and most-tested data set, then spring/drift/revision, then presentation, per the
usual stage-by-stage pattern used elsewhere in this project.)*
