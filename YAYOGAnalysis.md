# You Are Your Own Gym (YAYOG) — what the book does, and what our app needs

*Analysis only — no code changed. Written 2026-10-24 from the user's PDF (Mark Lauren, 2010). The book is paraphrased here, never quoted at length.*

**Purpose:** before the book's exercises and programs are imported, get the data structure and the way workouts *execute* right. This lists what the book does, what our Exercises and Workouts can already do, what is missing, and the decisions needed.

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
| **Variations, easier ↔ harder chain** | Not at all | **The big one.** See §4. |
| **Reps measure**: fixed reps, or time | Reps or time | Add **rep ranges** ("6–12", "1–5") and **"as many as possible / to failure"** for a set. The book never gives 3×10; it gives ranges and failure. |
| One side / both / alternating, with a start side | Yes | Add **"swap the starting side each set"** (several exercises say so) and a **"weaker side first"** start (the book says start with the non-dominant side). Needs a dominant-side setting. |
| Captions on pictures | No | Add an optional caption per frame ("Count 3: perform a push-up"). |
| Household equipment, with substitutes | Equipment list + descriptions (new) | Fits as is. Add household items ("Door", "Towel", "Backpack (weighted)", "Elevated surface", "Pillow"). Descriptions can say what works as a substitute. |
| Precaution / breathing / power note | Cues only | Optional `precaution` note, shown on the Start screen. Small. |
| Where it came from | `isSeeded` only | Add `source` ("YAYOG") for imported exercises, so they can be filtered and left out of any future sharing. |

---

## 4. Variations and progression — the core design decision

How the book progresses you: when you can do more than the rep target, **switch to a harder variation, and eventually to a harder exercise**. If you cannot reach the target reps, go easier. That is bodyweight "adding weight".

Program tables name *variations* directly: "Push Ups w/ hands elevated on platform", "Close Grip Push Ups w/ hands elevated", "Seated Dips w/ feet on ground", "Let Me Ins w/ palms up", "Let Me Ups w/ knees bent". And *modifiers that are not different exercises*: "w/ 1–3 second pause at bottom", "w/ 4–6 second contraction at top", "slow negatives".

**Proposal**
- **A variation is its own exercise record**, linked by a `familyId` (e.g. all the push-up types) with an order inside the family (`easier ← → harder`, plus `level`). Reasons: workouts already point at one exercise; history, PRs, pictures and progression stay per variation; import is simple.
- **The list groups variations by family** (collapsed under the base exercise).
- **Level-up changes**: today progression adds reps or weight. For bodyweight exercises it should instead **suggest the next harder variation in the family** (and the reverse when targets are missed). Same streak logic, new action.
- **Tempo and pause modifiers are on the workout step, not the exercise**: a small field such as "lower 3 s · hold 1 s · lift 1 s". The player can show it and speak it ("lower… hold… up").

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

## 7. Suggested build order

1. **Exercise model additions** (small): level, category, familyId + order, rep range / failure, swap-start-side, weaker-side-first, per-frame captions, source, precaution. Plus a "family" display in the exercise list.
2. **Variant-aware progression**: level-up suggests the next harder variation; tempo/pause on steps.
3. **Block formats** in the builder and player, one at a time, in this order: Interval Sets, Ladder, Superset, Stapper, Tabata, then the rest.
4. **Import tool** (staged review screen, not a blind import). Book → JSON → you approve in batches.
5. **Programs** (templates, levels, today's workout).

---

## 8. Concerns

1. **Copyright and sharing.** The book is copyrighted. Importing into your own private app for personal use is one thing; it must not end up in a shared space that other people see. Plan: mark imported items `source: YAYOG`, keep them out of any future sharing, and import **short paraphrased cues** (the LLM can summarize) rather than whole paragraphs. **The book's photos should not be copied into the app**; take your own pictures or use GIFs you already have.
2. **PDF quality.** The text mostly extracts, but some lines come out garbled (font encoding) and the program tables come out with columns jumbled. I can decode the garbled lines, but the tables need a visual check against the page. This machine has no tool to render PDF pages as images; installing one Python package (PyMuPDF) would fix that.
3. **Size.** 111 exercises plus perhaps 100+ named variations plus 4 programs is a large import. It is feasible, but it must be staged and checked, not done in one go.
4. **Muscle names.** The book's muscle names don't match our 19 muscles one-to-one (traps, forearms, deltoid parts, "core stability"). A mapping table is needed first.
5. **Player complexity.** Ladders and interval sets change rest dynamically, which our clock runner doesn't do yet. This is the riskiest engineering piece; build one format at a time and test each.

---

## 9. Open questions (for the user)

1. **Variations as separate exercise records** (recommended), or nested inside one exercise?
2. **Import scope:** only the 111 base exercises, or also the named variations, or also the 4 programs?
3. **Pictures:** none from the book (own pictures later)? And paraphrased cues, not verbatim?
4. **PDF pages:** OK to install PyMuPDF so I can render the program tables and check them?
5. **Dominant side:** a single setting ("my weaker side is: left/right"), used for "weaker side first"?
6. **Your level:** do you want one level for everything, or Basic/1st/Master/Chief per category?
7. **Formats first:** which format matters most to you, so it is built first? (My guess: Interval Sets and Ladders, since the first six weeks of every program use them.)
