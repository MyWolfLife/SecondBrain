# Workout formats from the book — build plan

*2026-10-24. Follows `YAYOGAnalysis.md` §5. Exercise levels and the exercise/step additions (rep ranges, to-failure, tempo, sides, captions, labels) are already built. Everything here **adds** to the current workouts: ordinary steps, circuits, 3×10 sets and pyramids keep working unchanged.*

## What the player can and can't do today

The clock (`woCreateRunner`) runs a **fixed list of phases** built before the workout starts: work, rest, switch sides. A rest has a fixed length (or waits for a tap). Two things the book's formats need that it can't do yet:

1. **A rest that fills the rest of an interval** (rest = interval length minus how long the set took).
2. **Phases that are decided while you work** (a ladder's peak, a Stapper's number of cycles).

So the formats are built in an order that adds those two abilities one at a time, easiest first.

## The formats and how each maps

| # | Format | The book's rule (plain words) | What it needs |
|---|---|---|---|
| **F1** | **Interval Sets** | Each set starts on a fixed clock (e.g. every 3:00). Go to failure or up to a time cap (1:30), then rest for whatever is left of the interval. 3 sets, 6–12 reps. | **Ability 1.** An interval clock; a work cap shown as a timer that beeps when reached (you still type your reps). |
| **F2** | **Tabata and Timed Sets** | 20 s on / 10 s off × 8 rounds (Tabata); or "W on / R off" repeated for N minutes (Timed Sets, e.g. 20 s on, 40 s off every minute for 20 min). As many reps as you can in each work period. | Static timeline (no new ability) plus a **rep counter** button during timed work; round total saved. |
| **F3** | **Supersets** | A pair done back to back inside one interval (4:00): 1–5 slow reps of the harder exercise, then 6–12 of the other; 2 rounds. Single-limb moves alternate sides every rep. | The **interval group** from F1 (several exercises inside one interval); tempo from E2. |
| **F4** | **Stappers** | Cycle through a short list (10 lunges, 8 pulls, 6 push-ups) as many times as possible in 20 minutes, no planned rest. | **Ability 2.** Phases generated as you go; a round counter; ends when the timer runs out. |
| **F5** | **Ladders** | 1 rep, rest, 2 reps, rest … up to a peak you choose while doing it, then back down. Rest equals the time the last set took. 7.5 minutes per exercise; start another ladder if you reach 1 early. | **Ability 2** plus a rest that equals the previous set's time. A "start coming down" button. |
| **F6** | **The rest** | Easy Gleason (1 rep in minute 1, 2 in minute 2, … until you can't), circuit work/rest (45 s on / 30 s off), Timed Workout (finish a fixed load as fast as you can), 52 Pick-Up (cards decide the next exercise), Active Recovery (a timer with a heart-rate note). | Mostly reuse F1–F5 with parameters. Lower priority. |

## Common design

**A format is a property of a step (or a small block of steps), not a new kind of workout.** A workout stays an ordered list of steps; steps gain a format. That keeps copy, schedule, history and progression working.

- **F1:** an ordinary exercise step with an optional `interval = {seconds, capSec}`.
- **F2:** new step type `tabata` / `timed` with `{items, rounds, workSec, restSec}`.
- **F3:** new step type `superset` with `{items: [A, B], rounds, intervalSec}`.
- **F4/F5:** new step types `stapper` / `ladder`, run by a small "block player" that adds phases live.
- **A "format helper" button** in the builder applies a format to every exercise at once (for example "Make every exercise an Interval Set: 3:00, cap 1:30, 3 sets of 6–12"), because the book's days are one format across a list of exercises.

**Saving:** every format still writes ordinary **set lines** (exercise, level, reps or seconds, side, target range) so Workout History, Last time, Records, Muscle Balance and Progression keep working. Formats that count rounds (Tabata, Stapper) save one line per round (reps) plus a note on the record.

**Progression:** unchanged for steps that use rep ranges; a format step is a success when its sets reach their minimum, and a range counts toward the streak at its top (E1 rules).

**Day mode ("throughout the day"):** a format step just becomes its sets as a checklist (the clock features only apply in the guided player).

**Status:** F1 and F2 built and tested (2026-10-24). F3–F6 to do. (Design note: Tabata / timed sets are a property of an exercise step like intervals — `step.timed` — rather than a new step type, so levels, sides, history and Start keep working.)

## Chunks

| # | Chunk | Done when |
|---|---|---|
| **F1** | Interval Sets: builder control, "apply to all", interval-aware timeline, runner support for a rest that ends with the interval, cap timer, voice, estimates, history. | A 4-exercise day at 3:00 intervals runs with correct rests, the cap beeps, reps are typed, and history looks normal. |
| **F2** | Tabata and Timed Sets with the rep counter. | A Tabata runs 8 rounds and saves reps per round. |
| **F3** | Supersets (interval group). | A pair runs inside one 4:00 interval with the right rest. |
| **F4** | Stappers (live phases, round counter, time-boxed). | A 20-minute Stapper counts cycles and saves them. |
| **F5** | Ladders (live phases, rest = last set's time, coming-down button). | A ladder goes up and down with the right rests. |
| **F6** | Gleason, circuit work/rest, timed workout, 52 Pick-Up, active recovery — as time allows. | Each runs from a preset. |

Per chunk: code → test in the preview (test account) → spec + AppHelp → cache bumps → commit → push.

## F1 in detail (built first)

**Data:** on an exercise step, `interval = {seconds: 180, capSec: 90 | null}`. For such a step the builder hides *Rest between sets* (the interval replaces it). Circuits and circuit items don't get intervals.

**Timeline:** for each set: work phase(s) (the usual left/right pair with the short switch) carrying `interval` info; then a **rest phase** `{kind:'rest', restKind:'interval', untilIntervalEnd: true, intervalSec}` placed after the last side of the set. The set's first work phase is flagged `intervalStart: true`. The runner records when that phase was entered; the rest's length is computed **when it starts**: interval seconds minus the time since the set began (never below zero). Pausing shifts the interval clock by the paused time. The final rest of the whole workout is dropped as usual.

**Work cap:** `capSec` makes a small timer on the work screen ("Work time 0:23 / 1:30"). At zero it beeps once and the voice says "Time". It does **not** end the set — you stop, type your reps and tap DONE (so the number is never guessed).

**Player:** work screen shows the rep target ("6–12" or "MAX"), the cap timer, and the "Did:" box (already there for ranges/failure). Rest screen is the normal countdown, labelled "REST — next set starts in …". Voice: "Start. Up to one minute thirty." then "Rest. Next set in …" using the normal rest announcement.

**Estimates:** an interval step counts `sets × interval seconds`.

**Format helper:** a **⏱ Interval format** button in the builder applies, to every exercise step: 3 sets of the range 6–12 reps (timed steps: 3 sets as long as you can) and an interval of 3:00 with a cap of 1:30 — all editable afterwards.

## Assumptions (tell me if any is wrong)

1. The work cap **does not auto-end** the set; it only beeps and says "Time".
2. The interval rest is **after every set including an exercise's last one**, so the next exercise starts on the clock too (the final rest of the workout is dropped).
3. For one-side-then-the-other exercises the interval covers **both sides** together.
4. Formats are properties of steps; **circuits** stay as they are.
5. Defaults come from the book: interval 3:00, cap 1:30, 3 sets, 6–12 reps.
