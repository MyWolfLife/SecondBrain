# Programs — plan

*Plan only — no code written yet. 2026-10-25. Builds on `YAYOGAnalysis.md` §6 and `WorkoutsPlan.md` D6 ("workouts first, programs reference them by ID"). Everything the programs need to execute (levels, Interval Sets, Supersets, Stappers, Tabatas, Ladders) is already built.*

## 1. What the book's Program is

**Four programs**, one per ability level: **Basic**, **1st Class**, **Master**, **Chief**. Each is **10 weeks, 4–5 days a week, 20–30 minutes**, in four blocks. The outline is identical for every level; only the exercises in the slots change.

| Weeks | Block | Format | Days |
|---|---|---|---|
| 1–2 | Muscular Endurance | **Ladders** (7.5 min per exercise) | 4: Push/Pull, Legs/Core, Push/Pull, Legs/Core (the same 4 days repeat in week 2) |
| 3–4 | Strength | **Interval Sets** (3 sets × 6–12 reps, 3-min interval, 1.5-min cap) | 4: Push, Legs, Pull, Core |
| 5–6 | Power | **Supersets** (4-min interval, 1–5 reps then 6–12 reps, 2 sets per pair) | 4: Push, Legs, Pull, Core |
| 7–10 | Undulating | all of them, rotating | **5 days a week**: Push, Legs, Pull, Core, plus a **Stapper** day (the 20-minute "10 back lunges, 8 Let Me Ins, 6 push-ups" style). Each week gives each day a *different* format (week 7 push = Ladders, week 8 push = Tabatas, week 9 push = Interval Sets, week 10 push = Supersets) |

After week 10: **rest a week or two, then start again**, swapping in harder exercises. The book also says slots keep their category (never replace a leg move with a push move), keep the rep target reachable but not exceeded, and prefer compound moves.

**Size:** weeks 1–2 (4 days) + 3–4 (4) + 5–6 (4) + 7–10 (4 weeks × 5 days = 20) = **32 distinct workouts per level, 128 for all four.**

**Source problem:** the program tables extract from the PDF as jumbled columns (the Undulating block especially). The exercise lists have to be read from the rendered pages, which this machine cannot do. ChatGPT can (as it did for pictures), so the data comes from a prompt I write, the same way the exercises did.

## 2. Decisions (assumptions — tell me which are wrong)

1. **A program is a template that points at workouts.** Each day is a normal workout in your Workouts list (built from the book's slot text, steps pinned to the book's named variation). Programs never contain their own exercise logic, so everything you can already do with a workout works.
2. **The book's workouts are created by an import, like the exercises.** A JSON file (`bishop-programs-v1`) holds the programs and the day workouts; the Import screen creates the workouts first, then the program that references them. Review screen first, a remove-an-import option after.
3. **Hiding them:** imported workouts get the same **tag** as the exercises (`yayog`), and the Workouts list gets the same only/hide tag chips, so 128 book workouts don't bury your own.
4. **Schedule = "next up", not fixed weekdays.** You start a run; the app always shows "Week 3 · Day 2 — Legs". Finishing the workout marks the day done and moves on. You can skip, go back, or pause. (Optional later: "put the next 7 days on my calendar".)
5. **Missed days don't break anything.** The run waits for you. A banner shows the last time you trained.
6. **One program run at a time** (v1). A finished run can be restarted or followed by the next level's program (see §6).
7. **Levels are separate programs** ("YAYOG Basic", "YAYOG 1st Class" …). The finished screen offers the next one; no automatic exercise bumping.

## 3. Data model

New collections (add to the backup list in `js/settings.js`):

**`programs`** — the template.
`name`, `description`, `source`, `tags[]`, `weeks[]`, `archived`, `createdAt`.
`weeks[i] = { from, to, block, note, days[] }` — `from..to` lets weeks 1–2 share one definition. `days[j] = { label, workoutId | null }` (null = rest day). Weeks 7, 8, 9 and 10 are separate entries because their days differ.

**`programRuns`** — one active (or finished) run.
`programId`, `programName` (snapshot), `status` (`active` | `paused` | `finished`), `startedAt`, `position {week, day}` (the next-up day), `done[]` of `{week, day, sessionId, date}` and `skipped[]`, `finishedAt`.

**Link to history:** a `workoutSessions` doc gets optional `programRunId`, `programWeek`, `programDay`, so History can say "Basic · Week 3 · Day 2" and a day is marked done from the session.

Workouts also gain `tags[]` / `source` (same shape as exercises) so the existing tag filter works there.

## 4. Screens

- **Programs hub tile** (currently greyed "Coming soon") opens **`#programs`**: your programs, the active run card on top ("Week 3 · Day 2 — Legs · **Start**"), and ⬆ Import.
- **Program page** `#program/:id`: the 10 weeks as a grid of days (done ✓ / today / upcoming), block labels, tap a day to preview its workout.
- **Run view:** current week/day with the workout's summary, **Start** (opens the normal start screen), **Skip this day**, **Go back one day**, **Pause**, **End program**.
- **Today card** on the Fitness hub when a run is active.
- **Workout Finished screen:** if the session belongs to a run, a "Day done — next up: Week 3 · Day 3" line.
- **Workouts list:** the tag chips and tag labels (reuse `workout-tags.js`).

## 5. Build chunks

| # | Chunk | Result |
|---|---|---|
| P1 | **Data + tags for workouts.** `tags`/`source` on workouts, tag chips and labels on the Workouts list and the picker; backup list | Book workouts can be hidden |
| P2 | **Programs hub + program editor.** `#programs` list; build your own program: weeks (ranges), days → pick a workout or rest | You can make a program by hand |
| P3 | **Runs.** Start a run, next-up logic, skip / back / pause / end, Today card on the hub | A program can be followed |
| P4 | **Session link.** Sessions carry the program position; finishing marks the day done and advances; History shows the program/week/day | Following it is automatic |
| P5 | **Program page.** The 10-week grid with progress | You can see where you are |
| P6 | **Import for programs and workouts.** `bishop-programs-v1`: day workouts built with pinned levels and formats, resolved by exercise name + level label, unresolved names reported in the review screen; remove-an-import | The book's programs arrive |
| P7 | **Next cycle.** After week 10: a finished screen with Restart this program / Start the next level program | Endless cycles |

P1–P5 are useful on their own for programs you write yourself; P6 is the book's data.

## 6. Decisions on the open questions (2026-10-25)

1. **All four programs are imported** (Basic, 1st Class, Master, Chief; 128 workouts), tagged `yayog`.
2. **"Next up"**, not fixed weekdays.
3. **End of a cycle:** a "finished — rest a week or two" prompt with **Restart this program** or **Start the next level** (Basic → 1st Class → Master → Chief). No automatic bumping of exercises: the four level programs already do that job (the book: the outline never changes, only the exercises do). P7 becomes "finish screen + restart / next level".
4. **Swapping exercises in a slot:** v1 has no swap button; edit the program's day workouts like any workout. A swap helper can come later.
5. **Building the data:** same method as the exercises — a prompt for ChatGPT to read the rendered program pages and return `bishop-programs-v1` JSON; I check it against the exercise list (names, level labels, formats) before import.

## 7. Not in scope

Calendar auto-scheduling, per-category levels (strong pulls / weak pushes), a rest-week timer, sharing programs between accounts (`SharedSpacesPlan.md`).
