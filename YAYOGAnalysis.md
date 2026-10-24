# You Are Your Own Gym (YAYOG) — what the book does, and what our app needs

*Analysis only — no code changed. Written 2026-10-24 from the user's PDF (Mark Lauren, 2010). The book is paraphrased here, never quoted at length.*

**Purpose:** before the book's exercises and programs are imported, get the data structure and the way workouts *execute* right. This lists what the book does, what our Exercises and Workouts can already do, what is missing, and the decisions needed.

---

## 0. Decisions so far (user, 2026-10-24)

- **Personal app, never sold or shared.** (Softens concern 1 in §8: no redistribution worry; imported text still best kept short/paraphrased, and out of any future Shared Space.)
- **Keep everything we have and add the book's ways.** Weights stay: **3×10** (same reps every set) and **10 / 5 / 3** (per-set reps and weights) both remain. The book's ranges, failure sets and formats are *additions*.
- **Escalation lives at the exercise level.** It must work for push-ups against a wall / table / chair / floor, for the book's variations, and for yoga poses that have easier and harder versions of the same pose. It will touch a lot of the existing code, so it is designed once, carefully, before anything is imported.

---

## 1. What the book is (structure)

| Part | What it contains | Why it matters to us |
|---|---|---|
| **111 exercises** (ch. 11) | Grouped **Push / Pull / Core / Legs & Glutes**, plus "Butt Kickers" (full body). | The import target. |
| **Training tools** (ch. 10) | Named workout *formats*: Ladders, Interval Sets, Supersets, Stappers, Tabatas, Timed Sets, Timed Workout, Easy Gleason, 52 Pick-Up, Circuit (e.g. 45 on / 30 off), Active Recovery. | These are not "3 sets of 10". They need new ways for the player to run. |
| **Intensity** (ch. 9) | Every workout rated **1–4** for intensity. Techniques for going past failure (easier variant after failure, slow negatives, pauses, partial reps). | Intensity rating; "after failure" options. |
| **The Program** (ch. 12) | **4 levels** (Basic, 1st Class, Master, Chief) × **10 weeks** × **4 blocks** (Endurance → Strength → Power → Undulating), 4–5 days a week, 20–30 min. | The Programs feature. |
| **Appendices** | Household equipment substitutes; 6 training principles; periodization science. | Equipment list; progression rules. |

The key idea in the book: **the program outline never changes, only the exercises in its slots change as you get stronger.** A "Push day" slot gets Push Ups with hands elevated at Basic level and one-arm or handstand push-ups at Chief level.

---

## 2. How each exercise is described

Every entry has:
1. **Name** (often quirky: "Let Me Ins", "Dive Bombers", "Toyotas").
2. **Muscles worked, in descending order of emphasis**, plus a **difficulty rating 1–4**. Often a *range* ("1–4") because the rating depends on the variation.
3. A description of **one rep**.
4. **Variations**: easier versions (higher hands, feet further back) and a **"Kick it up a notch"** harder version (one limb, unstable surface, pause, extra weight).
5. Often a **sequence of pictures with captions** (4-Count Bodybuilder, Burpee: one picture per count).
6. Equipment is usually **household stuff**: a door, a table or desk, a towel, a backpack of books, a pillow, a chair, phone books, a basketball, a pole.
7. A few have a precaution ("be warmed up first"), a breathing note, or are done for a distance or for as long as you can (Bear Walk, Pec Crawl, Farmer's Walk).

---

## 3. What our Exercises already cover vs. what is missing

| Book feature | Ours today | Gap / proposal |
|---|---|---|
| Name, cues, video, pictures, equipment, muscles (★ main / also) | Yes | Muscle list needs a few additions (e.g. traps, forearms, quads naming — to be mapped at import). |
| **Difficulty 1–4** | No | Add `level` (1–4). |
| **Section Push / Pull / Core / Legs / Full body** | We have push/pull/both/neither and muscle areas, but not the book's four-way section | Add `category`: push, pull, core, legs, full. Programs need it to pick exercises for a slot. |
| **Variations, easier ↔ harder chain** | Not at all | **The big one.** Nested levels on the exercise plus "my level" — see §4. |
| **Reps measure**: fixed reps, or time | Reps or time | Add **rep ranges** ("6–12", "1–5") and **"as many as possible / to failure"** for a set. The book never gives 3×10; it gives ranges and failure. |
| One side / both / alternating, with a start side | Yes | Add **"swap the starting side each set"** (several exercises say so) and a **"weaker side first"** start (the book says start with the non-dominant side). Needs a dominant-side setting. |
| Captions on pictures | No | Add an optional caption per frame ("Count 3: perform a push-up"). |
| Household equipment, with substitutes | Equipment list + descriptions (new) | Fits as is. Add household items ("Door", "Towel", "Backpack (weighted)", "Elevated surface", "Pillow"). Descriptions can say what works as a substitute. |
| Precaution / breathing / power note | Cues only | Optional `precaution` note, shown on the Start screen. Small. |
| Where it came from | `isSeeded` only | Add `source` ("YAYOG") for imported exercises, so they can be filtered and left out of any future sharing. |

---

## 4. Escalation at the exercise level (revised design)

**The idea:** an exercise is a *family of levels*, easiest to hardest. One exercise ("Push-up") holds an ordered ladder: wall → table → chair → floor → feet up → one-arm. A yoga pose works the same: "Downward dog" with its easier and harder versions. Weighted exercises are simply a one-level exercise whose escalation is weight and reps, exactly as today.

**Why nested levels beat separate linked records**
- **"My level" lives on the exercise.** You are at level 3 of Push-up. Workouts say "Push-up" and play *your* level. When progression moves you up, **every workout that uses Push-up follows automatically**. With separate records you would have to edit each workout. This is the book's own rule ("the outline never changes, only the exercises change") built in.
- **It fits yoga, wall/chair/floor push-ups and the book's variations with one mechanism.**
- **Existing exercises keep working**: today's exercises become exercises with one level.

**What a level holds** (all optional except a label): label ("Hands on chair"), difficulty 1–4, its own cues, its own pictures, its own equipment, optional video, and optional overrides of the default amount, measure (e.g. a 20 s hold for yoga) and weight. **Shared at the exercise level:** name, muscles, category, push/pull, side mode.

**How it plays out**
- **Workout step:** `exerciseId` + either *follow my level* (default) or *pinned to level N*. Step keeps its own sets/reps as today.
- **History and records:** stored against exercise **and** level, so "Push-up (floor)" records don't mix with "Push-up (wall)".
- **Progression (existing streak logic):**
  - Weighted one-level exercises: level-up still adds reps/weight (unchanged).
  - Multi-level exercises: when you beat the target for N sessions, suggest **the next level**; if you can't reach the minimum, suggest **the previous level**. Accepting changes "my level" on the exercise.
  - Level change optionally resets the streak and Comeback logic per level.
- **Tempo / pause modifiers** ("lower 3 s, hold 1 s") stay on the *step*, not the level.
- **Step display:** "Push-up · Chair (level 2 of 6)" with a quick change-level control while building or starting a workout.

**Decision (user, 2026-10-24): the workout chooses.** Each workout step has a **Start at** setting: **My level** or **a specific level**.
- **My level** (default for steps you build yourself): the step plays whichever level the exercise says you are at.
- **A specific level** (used for the book's programs, which name exact variations such as "hands elevated"): the step always plays that level, whatever your level is.
- You can change it per step when building a workout, and flip it while starting a workout ("start one level easier today").

**How the app knows "my level"** (proposal):
1. Each exercise stores *my level*. It starts at the **easiest** level.
2. **First time you start a workout** that includes a multi-level exercise you've never set, the Start screen asks once: "Which version can you do?" with the levels listed (with pictures). That sets it.
3. After that it changes only when you **accept a progression suggestion** (next level up, or back down) or change it by hand (on the exercise, or on the Start screen).
4. Optional later: quick "too easy / too hard" buttons after a set.
5. A pinned step never changes your level; only "My level" steps and progression do.

**Open sub-questions**
1. Should a workout step *follow my level* by default, or pin a level? (Recommendation: follow by default; pin as an option.)
2. Is level order a simple 1…N list, or can a ladder branch (e.g. two different harder versions)? (Recommendation: a simple list; the book's few branches become separate exercises.)
3. When a level is added or reordered, existing "my level" values are kept by level id, not by number.

---

## 5. Workouts: the book's formats

Our workout today = ordered steps (exercise with sets and rests, or a circuit with rounds). The book's days are **a format applied to a list of exercises**, and a week can use a different format each day. The formats, in plain words:

| Format | What it is | What the player must do that it can't today |
|---|---|---|
| **Ladder** | 1 rep, rest, 2 reps, rest … up to a peak, then back down to 1. Rest = the time the last set took. In the program each exercise gets **7.5 minutes** of ladders; if you reach 1 before time ends, start another ladder. Stay away from failure. | **Dynamic rest** (equal to the last set's time). **Peak chosen on the fly** ("start coming down" button). **Time box per exercise.** Alternating-side exercises do both sides before resting. |
| **Interval sets** | 3 sets, 6–12 reps, every **3 minutes**: start the clock, go to failure or up to 1.5 min, rest for whatever is left of the interval. Single-limb moves: weaker side first, switch straight away. | **Rest = interval minus work time**. Work ends when you tap Done (or at the 1.5 min cap). |
| **Superset** | A pair done back to back every **4 minutes**, 2 rounds. First exercise: 1–5 reps, slow and controlled (2–3 s down, ~1 s up, 1 s pauses), *not* to failure. Second: 6–12 reps. Single-limb: alternate sides every rep. | **Pairs** as a unit; tempo cues; interval clock. |
| **Stapper** | Cycle through a short list (e.g. 10 lunges, 8 pulls, 6 push-ups) as many times as possible in **20 minutes**, no planned rest. | **AMRAP timer with a round counter**; records cycles completed. |
| **Tabata** | **20 s on / 10 s off × 8** = 4 minutes, one exercise per Tabata, as many reps as possible each time. The program lists 3 exercises = 3 Tabatas with rest between. | Mostly there (timed work and rest). Needs **rep tapping** to count reps per round, and a rest between Tabatas. |
| **Timed sets** | Most reps possible in a time limit (e.g. 20 s on / 40 s off each minute for 20 min). | Timed work with a rep counter. |
| **Timed workout** | Finish a fixed workload as fast as you can. | Stopwatch mode; records the time. |
| **Easy Gleason** | A running clock: 1 rep in minute 1, 2 in minute 2, 3 in minute 3 … as long as you can. | Interval clock with growing targets. |
| **Circuit with work/rest** | e.g. 45 s on / 30 s off through a list. | Our circuits are rounds-based; add a **timed work/rest** circuit. |
| **52 Pick-Up** | Cards decide which category to do next. | A "random next exercise" mode. Fun, low priority. |
| **Active recovery** | Back-to-back easy exercises to keep a target heart rate for 20–60 min (170 − age; minimum 10 below). | Just a timer plus a heart-rate note; low priority. |

**Proposal:** add **block step types** next to our existing exercise step and circuit: `ladder`, `intervalSets`, `superset`, `stapper`, `tabata`, `timedSets`, `gleason`. A workout is a list of blocks. A circuit is simply one block type. Each block carries its own parameters (interval length, rep range, time box, work/rest seconds, rounds) and a list of exercises.

**Logging:** each block type writes a summary line (ladder: the rungs reached; stapper: cycles and partial; tabata: reps per round or total; interval sets: reps per set) into Workout History, so Records and Muscle Balance keep working.

**Intensity:** each workout gets a **1–4 intensity** tag, plus a block label (Endurance / Strength / Power / Undulating) and the book's suggested rest ranges (30–60 s, 90–120 s, 2.5–5 min).

---

## 6. Programs (the paused Phase 6)

What the book gives: **Program → level → weeks 1–10 → days → a format + exercises.**
- Weeks 1–2 Ladders (4 days: Push/Pull, Legs/Core, Push/Pull, Legs/Core)
- Weeks 3–4 Interval Sets (Push, Legs, Pull, Core days)
- Weeks 5–6 Supersets
- Weeks 7–10 Undulating: five days, a different format each day, rotating each week, plus a Stapper day.
- Finish → rest a week or two → start the next cycle with harder exercises.

**What our Programs need:**
- A **program template** (10 weeks × days × format) separate from the **level** (which exercises fill the slots). Same outline, four exercise sets.
- A **user level** (Basic / 1st Class / Master / Chief), possibly per category (strong pulls, weak pushes).
- **Slot-filling by category**: the book's rule — never swap a push for a leg exercise; keep the rep target reachable but not exceeded.
- A **"today's workout" screen**: which week and day you're on, start it, mark done, auto-advance, optional calendar scheduling.
- **Cycle repeat** with the option to bump exercises up a level.
This depends on §4 and §5 being built first.

---

> **Status update (2026-10-24):** the rest of step 1 is now built too (`ExerciseAdditionsPlan.md`, E1–E5). Still to do: the workout formats (§5), the import tool and Programs.

> **Status (2026-10-24):** step 1's levels part and step 2 are **built** (see `ExerciseLevelsPlan.md`, chunks L1–L8). The other model additions in step 1 and everything from step 3 on are still to do.

## 7. Suggested build order

1. **Exercise model additions** (the large one): **levels ladder + "my level"**, category, rep range / failure, swap-start-side, weaker-side-first, per-frame captions, source, precaution. Plus a "family" display in the exercise list.
2. **Level-aware progression and history**: level-up moves "my level"; records per level; tempo/pause on steps.
3. **Block formats** in the builder and player, one at a time, in this order: Interval Sets, Ladder, Superset, Stapper, Tabata, then the rest.
4. **Import tool** (staged review screen, not a blind import). Book → JSON → you approve in batches.
5. **Programs** (templates, levels, today's workout).

---

## 8. Concerns

1. **Copyright.** The user says the app is personal, never sold and never shared, so the earlier worry is much smaller. Still: mark imported items `source: YAYOG`, prefer short paraphrased cues over long verbatim paragraphs, and don't copy the book's photos (own pictures or GIFs instead). Keep these out of any future shared space.
2. **PDF quality.** The text mostly extracts, but some lines come out garbled (font encoding) and the program tables come out with columns jumbled. I can decode the garbled lines, but the tables need a visual check against the page. This machine has no tool to render PDF pages as images; installing one Python package (PyMuPDF) would fix that.
3. **Size.** 111 exercises plus perhaps 100+ named variations plus 4 programs is a large import. It is feasible, but it must be staged and checked, not done in one go.
4. **Muscle names.** The book's muscle names don't match our 19 muscles one-to-one (traps, forearms, deltoid parts, "core stability"). A mapping table is needed first.
5. **Player complexity.** Ladders and interval sets change rest dynamically, which our clock runner doesn't do yet. This is the riskiest engineering piece; build one format at a time and test each.

---

## 9. Open questions (for the user)

1. ~~Variations as separate records or nested?~~ **Decided direction: nested levels on the exercise (§4).** Still open: do steps follow "my level" by default?
2. **Import scope:** only the 111 base exercises, or also the named variations, or also the 4 programs?
3. **Pictures:** none from the book (own pictures later)? Paraphrased cues are fine for a personal app, but short is still easier to read while exercising.
4. **PDF pages:** OK to install PyMuPDF so I can render the program tables and check them?
5. **Dominant side:** a single setting ("my weaker side is: left/right"), used for "weaker side first"?
6. **Your level:** do you want one level for everything, or Basic/1st/Master/Chief per category?
7. **Formats first:** which format matters most to you, so it is built first? (My guess: Interval Sets and Ladders, since the first six weeks of every program use them.)
