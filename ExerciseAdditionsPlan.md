# Exercise & step additions (YAYOG step 1, remaining parts) — build plan

*2026-10-24. Follows `YAYOGAnalysis.md` §3 and §7 step 1. Exercise levels (`ExerciseLevelsPlan.md`) are already done. Everything here **adds** to what exists: fixed sets like 3×10 and pyramids like 10 / 5 / 3 keep working exactly as they do now.*

**Status:** E1 and E2 built and tested. E3–E5 to do.

## Chunks

| # | Chunk | What you get |
|---|---|---|
| **E1** | **Rep ranges and "to failure" sets** | A set can be a fixed number (today), a **range** ("6–12 reps"), or **to failure** ("as many as you can"). Builder, Start screen, player and history all understand them. |
| **E2** | **Tempo and pauses on a step** | "Lower 3 s · pause 1 s · lift 1 s · pause 1 s" on any step. Shown in the player and spoken when the set starts. |
| **E3** | **Sides** | Exercise option **"Swap the starting side each set"**, and a start choice **"Weaker side first"** (one setting says which side is weaker). |
| **E4** | **Picture captions** | A short line under each picture ("Count 3: do a push-up"), edited in the exercise editor, shown on the View card and in the player. |
| **E5** | **Labels** | Exercise **category** (push / pull / core / legs / full body), **source** (for imported items), and a **precaution** note (shown on the Start screen and View card). Category filter on the lists. |

Per chunk: code → test in the preview (test account) → spec + AppHelp → cache bumps → commit → push. Each chunk is usable on its own.

## E1 — rep ranges and to-failure sets (the careful one)

**Data (on each set inside `step.sets[]`, and circuit items):** today `{amount, weight}`. New optional fields: `amountMax` (top of a range; `amount` stays the minimum) and `failure: true` (as many as possible; `amount` then means "at least", may be blank). A set with neither is exactly today's set.

**Builder:** each set's amount box gets a small mode control next to it: **fixed / range / to failure**. Range shows two boxes (min–max); to failure shows an optional "at least" box. The quick row (`3 sets × 10 reps`) supports the same modes for every set at once. Estimates use the minimum for ranges and a rough 12 reps for failure sets.

**Start screen:** the same inputs for today's numbers.

**Player (guided and self-paced):** shows "6–12 reps" or "Max reps". Because the real number is unknown, **ranges and failure sets always ask "Did: [reps]"** (like self-paced does today), pre-filled with the minimum, so history records what you actually did. Timed sets are unchanged. Voice says "six to twelve reps" or "as many as you can".

**Saved set lines:** `targetAmount` (min) plus `targetMax` and `failure` when present; `actualAmount` is what you did.

**Progression (existing rules, same meaning):** a set is a success when you reach the **minimum** (`amount`, or 1 for a failure set). Level-up suggestions for ranges: when every set reached the **top** of the range for the usual number of sessions, suggest the next level / more weight; failure sets use the minimum. Nothing changes for fixed sets.

**Other places:** Finished screen shows the target as "6–12" or "max" in the placeholder; Last time and records already use actual numbers, so they need no change.

## E2 — tempo and pauses

`step.tempo = {down, pauseBottom, up, pauseTop}` (seconds, all optional). Builder: four small boxes in a "Tempo (optional)" row on a step. Player: a line under the exercise name ("Tempo: lower 3 · pause 1 · lift 1"). Voice: says it once when the set starts ("Lower for three, hold one, lift one"). No counting aloud in this chunk.

## E3 — sides

Exercise: `swapStart` (boolean) — for "one side, then the other" exercises the starting side alternates every set (left, then right, then left …), and `startSide` gains **"weaker"**. Setting: `settings/workouts.weakerSide` ('left' | 'right'), asked in the Progression/Workouts settings overlay and, the first time an exercise uses "weaker first", on the Start screen. The Start screen resolves it into `runStartSide` per step (like the level stamp), so the player and the day checklist both use it.

## E4 — captions

The `photos` doc already has a `caption` field. Editor: a caption box under each picture of the level being edited. View card: shows the caption of the picture currently playing. Player: same, updating as it flips.

## E5 — labels

`category` ('push' | 'pull' | 'core' | 'legs' | 'full'), `source` (text), `precaution` (text). Editor fields (category select; precaution box; source small box). Exercises list gets a category filter and chip; the Start screen shows a ⚠ line for any step whose exercise has a precaution; the View card shows it. Describe-it fills category and precaution when it can.

## Assumptions (tell me if any is wrong)

1. Ranges and failure sets **always ask for your actual reps** in the guided player too.
2. A range set is a success at its **minimum**; the level-up suggestion waits for the **top** of the range.
3. Tempo is **informational** (shown and spoken once), not counted down.
4. "Weaker side" is **one global setting**, not per exercise.
5. Category is a **separate field** from push/pull (a plank is category core, push/pull neither).
