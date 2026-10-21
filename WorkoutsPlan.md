# WorkoutsPlan.md — Workouts Feature

**Status**: 🗣️ Discussion / planning — nothing built yet
**Area**: Life → Exercise → Workouts
**Started**: 2026-10-21

---

## 1. The Vision (one paragraph)

Build workouts once, then *do* them with the phone propped up across the room. The app runs the show: big countdown, the exercise you're on (with a flipbook of pictures showing the motion), a voice calling out what's next, and during rest it shows the exercise that's coming. When it's done, it logs what you actually did — and next time it reminds you what you did last time and nudges you to do a bit more. Inspired by YAYOG's "set it and watch" timer, but also supports self-paced lifting and "spread it across the day" workouts.

---

## 2. Raw Notes (user's original, preserved)

```
1) create exercises
	Name / Explanation / picture(s) / Video?
2) Create a workout
	Name the workout
		list of Exercises — reps or time, weight
		add rest between (timer or user says done with rest)
3) do a workout
	pick the workout, date, override the reps, override the weight

cool to have ...
when I do a workout it asks 1) all at once 2) timer/countdown 3) ongoing during the day
it shows the movement and I mark done
if timer, then it shows the time till done or time until rest is done ... think about YAYOG
I am either doing all at once ... or split up over the day
```

---

## 2a. Words We Use (D5)

| Word in the UI | Means |
|---|---|
| **Fitness** | The Life section (renamed from "Exercise" — display label only) |
| **Exercises** | The library of movements (Push-up, Goblet Squat…) |
| **Workouts** | A routine you built from exercises |
| **Workout History** | Workouts you've actually done (each one = a dated record) |
| **Activities** | Unchanged — the existing cardio/activity log (walks, runs, golf…) |
| **Programs** | *(later)* A multi-week plan made of workouts (Week 1 → Week 10, getting harder). Hub card shows "Coming soon" until built (D6) |

## 3. Organized: The Three Building Blocks

### 3.1 Exercises (the library)
A reusable catalog of movements. Built once, used in many workouts.

| Field | Notes |
|---|---|
| Name | "Push-up", "Goblet Squat" |
| Instructions / cues | Free text. How to do it, form cues ("elbows at 45°, squeeze glutes") |
| Pictures (frames) | **2–4 photos that together show the motion** — start / middle / end. In the player these auto-cycle like a flipbook so you see the movement. Ordered. |
| Picture sources (D4) | All of these feed the same frame list, mix and match: 📷 **Camera** (take it now), 🖼️ **Gallery** (photo on the device, incl. web images you saved), 📋 **Paste** (right-click a web image → Copy image → Paste — already exists in the app's photo code), 🎞️ **Grab frames from a video** (new — see below) |
| Video link | Optional URL (YouTube etc.) — a "watch demo" link, not embedded playback. Free, no storage cost. |
| Default measure | **Reps** or **Time** |
| Default amount | e.g. 10 reps, or 30 sec |
| Uses weight? | Yes/No. If yes, default weight + unit (lb) |
| Each side? | For one-arm/one-leg moves. If yes, the player runs it twice: "Left side" then "Right side" (with an optional short switch pause) |
| Equipment | Optional tags — none / dumbbell / band / pull-up bar / kettlebell… (lets us filter "workouts I can do in a hotel") |
| Push / Pull (D17) | **Push**, **Pull**, **Both**, or **Neither** (holds like plank, pure cardio). Curl = Pull, bench press = Push, burpee = Both. One value per exercise |
| Targets (D14) | Tags for what it works — specific muscles (Calves, Hamstrings…) and/or Cardio. The body **area** (Lower Body, Upper Body…) is filled in automatically from the muscles. See §3.4 |

### 3.1a Starter Library (D13)
Seeded once, the first time Exercises is opened. No pictures. Fully editable / deletable / archivable. Each comes with 2–3 short form cues.

| # | Exercise | Measure | Default | Equipment | Each side | Push/Pull | Targets (★ = main) |
|---|---|---|---|---|---|---|---|
| 1 | Push-up | Reps | 10 | None | | Push | ★Chest, Triceps, Front shoulders, Abs |
| 2 | Squat (bodyweight) | Reps | 15 | None | | Push | ★Quads, ★Glutes, Hamstrings |
| 3 | Lunge | Reps | 10 | None | ✓ | Push | ★Quads, ★Glutes, Hamstrings, Calves |
| 4 | Plank | Time | 30 sec | None | | Neither | ★Abs, Obliques, Lower back, Shoulders |
| 5 | Side plank | Time | 20 sec | None | ✓ | Neither | ★Obliques, Abs, Hips |
| 6 | Glute bridge | Reps | 15 | None | | Push | ★Glutes, Hamstrings, Lower back |
| 7 | Burpee | Reps | 8 | None | | Both | ★Cardio, Chest, Quads, Shoulders |
| 8 | Mountain climbers | Time | 30 sec | None | | Neither | ★Cardio, ★Abs, Shoulders, Hips |
| 9 | Jumping jacks | Time | 30 sec | None | | Neither | ★Cardio, Calves, Shoulders |
| 10 | Dips (chair/bench) | Reps | 10 | Chair | | Push | ★Triceps, Chest, Front shoulders |
| 11 | Pull-up | Reps | 5 | Pull-up bar | | Pull | ★Lats, Biceps, Upper back, Forearms |
| 12 | Superman hold | Time | 20 sec | None | | Neither | ★Lower back, Glutes, Upper back |
| 13 | Crunch | Reps | 15 | None | | Neither | ★Abs |
| 14 | Wall sit | Time | 45 sec | None | | Neither | ★Quads, Glutes, Calves |
| 15 | Goblet squat | Reps | 10 @ 25 lb | Dumbbell | | Push | ★Quads, ★Glutes, Abs |
| 16 | Dumbbell row | Reps | 10 @ 25 lb | Dumbbell | ✓ | Pull | ★Lats, Upper back, Biceps, Rear shoulders |
| 17 | Shoulder press | Reps | 10 @ 20 lb | Dumbbells | | Push | ★Shoulders, Triceps, Upper back |
| 18 | Bicep curl | Reps | 12 @ 20 lb | Dumbbells | | Pull | ★Biceps, Forearms |
| 19 | Romanian deadlift | Reps | 10 @ 30 lb | Dumbbells | | Pull | ★Hamstrings, ★Glutes, Lower back |
| 20 | Farmer carry | Time | 45 sec @ 40 lb | Dumbbells | | Neither | ★Forearms, Traps, Abs, Cardio |

### 3.2 Workouts (the recipe)
An ordered list of steps.

- **Name** + optional description/notes
- **Steps**, each one is:
  - An **exercise** with: sets, reps **or** time, weight (optional), rest between sets, rest after the exercise
  - **Each set can have its own reps/time and weight** (D3). Two ways to enter it:
    - **Quick**: "3 sets × 10 @ 25 lb" — all sets the same (most common, one line)
    - **Custom sets**: tap "Customize sets" and it expands to one row per set, pre-filled from the quick values:
      ```
      Set 1   10 reps   25 lb
      Set 2    5 reps   45 lb
      Set 3    3 reps   60 lb
      [+ Add set]
      ```
    - Collapsing back to Quick is allowed only while all rows match (otherwise it stays in Custom view)
    - Same idea for timed exercises (e.g. plank 30s / 45s / 60s)
    - The player shows the right numbers for each set: "Set 2 of 3 — 5 reps @ 45 lb", and during rest "Up next: Set 3 — 3 reps @ 60 lb" (so you can load the weight)
  - Or a **circuit / superset**: a group of exercises done back-to-back, repeated N rounds, with rest between rounds (this is how most YAYOG/HIIT workouts are built)
- **Rest** can be:
  - ⏱️ **Timed** — counts down, auto-advances
  - ✋ **Tap when ready** — waits for "I'm ready" (good for heavy sets)
- Optional **warm-up / cool-down** sections (same structure, just labeled)
- Reorder steps (↑/↓), duplicate a step, copy a whole workout ("Copy as new")
- **+ New exercise inline** (D16): if the exercise you want isn't in the library, create it right from the builder — quick form (name, reps/time, default amount, weight?, push/pull) → saved to the library and added to the workout. Pictures, cues and targets can be filled in later from the library.
- **Push/pull balance** (D17): each step shows a small Push / Pull badge, and the builder shows a running tally ("Push 4 · Pull 2"). A gentle hint (never a block) when 3+ pushes or pulls land in a row on the same area — "Consider alternating with a pull (e.g. Dumbbell row)", suggesting pulls that hit the same area.
- **Estimated total time** shown on the workout card (computed from times, rests, and a seconds-per-rep estimate)

### 3.4 Targets: Areas & Muscles (D14)
Each exercise is tagged with everything it works. Two levels — tag the **muscle**, and the **area** comes for free:

| Area | Muscles |
|---|---|
| **Cardio** | *(tagged directly — no muscles under it)* |
| **Upper Body** | Chest, Front shoulders, Shoulders, Rear shoulders, Upper back, Lats, Traps, Biceps, Triceps, Forearms |
| **Core** | Abs, Obliques, Lower back |
| **Lower Body** | Glutes, Hips, Quads, Hamstrings, Calves |

- One exercise → many tags (a burpee hits Cardio + Chest + Quads + Shoulders)
- **Main vs. also-works** (D15): in the exercise editor, muscles show as chips — tap once = ★ main target, tap again = also works, tap again = off. Filters list ★ main matches first, then also-works.
- The muscle list is seeded but editable (add "Adductors", "Neck", etc.)
- **"What works my calves?"** — Exercises library has a target filter:
  - Pick an **area** (Lower Body) → every exercise touching any muscle in it
  - Pick a **muscle** (Calves) → exactly those; ★ main-target ones listed first
- **Workout card** shows its combined targets ("Legs · Core · Cardio") computed from its exercises
- **Later ideas**: a body-outline "muscle map" coloring what a workout hits, and a "this week you've hit…" balance view from Workout History (spot neglected areas) — Phase 5

### 3.3 Doing a Workout (the session)
Pick a workout → **Start screen** → choose mode → go.

**Start screen** (pre-flight):
- Date (defaults to today — can backfill a past date)
- Mode: **Guided** / **Self-paced** / **Throughout the day** (see §4)
- Override list: each exercise shows target reps/time/weight — tap to change *for this session only* (doesn't change the saved workout). Option: "Save these changes back to the workout."
- Shows "Last time: 3×12 @ 25 lb on Oct 14" next to each exercise

---

## 4. The Three Modes

### 4.1 🎬 Guided (the YAYOG experience) — the headline feature
Phone propped up, hands-free, just watch and follow.

- **Big countdown** (ring + giant numbers), readable from 8–10 feet away
- **During work**: exercise name, flipbook pictures, "Set 2 of 3", target reps/weight
- **During rest**: big rest countdown + **"UP NEXT: Goblet Squat — 12 reps @ 25 lb"** with its pictures, so you can grab the right weight
- **Voice cues** (built-in browser speech — free): "Push-ups. 30 seconds. Go." … "10 seconds." … "3, 2, 1, rest." … "Up next: squats."
- **Beeps** at 3-2-1 and on transitions (for when music is playing)
- **Screen stays awake** (Wake Lock API) — phone won't sleep mid-workout
- Controls (big, tap-anywhere friendly): ⏸ Pause, ⏭ Skip, ⏮ Back, +15s rest, "Done early"
- **Get-ready countdown** before the first exercise (e.g. 10 sec)
- Progress bar for the whole workout + time remaining
- Landscape layout for a phone on its side; portrait also works

**Reps vs. time in Guided mode** (decided — see §10, D1, D2): a **timed** step counts down and auto-advances. A **reps** step shows the target ("12 push-ups") and **waits for Done** — said out loud (voice commands, §4.1a) or by tapping anywhere on the screen.

### 4.1a 🎙️ Voice Commands (built in from the start — D2)
Talk to the phone from across the room. Uses the browser's built-in speech recognition (free, no API key).

**Starter command list** (each has a few synonyms so you don't have to remember the exact word):

| Say | Does |
|---|---|
| **"Done"** / "Next" / "Finished" | Finish this set → start rest (or move on) |
| **"Pause"** / "Stop" / "Hold on" | Pause the clock |
| **"Go"** / "Resume" / "Start" | Resume |
| **"Ready"** | End rest early, start the next exercise |
| **"Skip"** | Skip this exercise |
| **"Back"** / "Previous" | Go back one step |
| **"More time"** / "Add time" | +15 sec to the current countdown |
| **"Repeat"** / "What?" | Re-speak what you're doing now |
| **"What's next"** | Speak the next exercise |
| **"How long"** / "Time" | Speak the time left (this step + whole workout) |
| **"Change weight 30"** / "Did 10" | Log a different weight or rep count for the set just done (stretch goal) |
| **"End workout"** | Finish early → summary (asks "Are you sure?" out loud first) |

**How it behaves:**
- Mic indicator on screen (🎙️ listening / muted); tap it to mute/unmute. A "Voice commands on/off" switch on the Start screen.
- When a command is heard: a quick chime + the word flashes on screen ("NEXT ✓") so you know it got it.
- **Ignores itself**: listening pauses while the app's own voice is talking, so "Up next: squats" doesn't trigger "Next".
- Only short exact commands count — a word buried in a long sentence (or a song lyric) is ignored.
- Tapping always works as a backup.

**Limits to know about (honest list):**
- Works in **Chrome** (desktop, Chromebook, Android). iPhone Safari support is spotty — tap fallback covers it.
- Chrome sends the audio to Google to turn it into text (free, no key). Needs a connection — fine, app is online-only.
- Chrome stops listening after a stretch of silence; the app quietly restarts it. On some Android phones each restart makes a tiny system beep — we'll test and see how annoying it is.
- Loud music near the phone can drown out commands. Talking a bit louder / closer usually fixes it.
- First use asks for microphone permission (one time).

### 4.2 ✅ Self-paced (gym / lifting style — like Strong or Hevy)
- Shows the current exercise + pictures; you do the set, tap **Done**
- Quick-adjust actual reps/weight before tapping Done (did 10 instead of 12? one tap)
- **Rest timer auto-starts** after tapping Done; shows "up next" during rest
- Can jump around (do exercises out of order if equipment is busy)

### 4.3 🌤️ Throughout the day ("grease the groove")
- Starting it creates an **open session for the day**
- Shows a checklist of every set: "Push-ups — set 1 ☐ set 2 ☐ set 3 ☐"
- Tap a set when you do it (timestamps recorded); come back anytime — session persists in Firestore so it works across devices
- Home screen / Exercise hub shows a **"Workout in progress: 4 of 9 sets done"** card
- Closes at end of day (or manually "Finish"); unfinished sets logged as skipped

---

## 5. After the Workout (D7)

**When you finish** (any mode):
1. A **Workout History record** is saved — every set as its own line, target vs. actual
2. An **Activities entry is created automatically** (linked to the history record) so it flows into Daily Metrics / Summary grids — no double entry
3. The app **takes you straight to the finished workout's edit screen** so you can type in calories from your watch

### 5.1 Finished Workout screen (`#workout-done/:id` — edit screen for a Workout History record)
**Top — summary** (editable):
- Workout name, date, start time, duration
- **Calories burned** ← from your watch (the main reason you land here) — starts **blank**, no estimate (D10)
- Notes, effort rating (1–5)
- Totals (read-only, computed): sets, reps, volume (reps × weight), any PRs 🏆

**Below — one line per set** (everything editable):
```
 ↑↓  Push-ups        Set 1   12 reps            ✏️ 🗑️
 ↑↓  Push-ups        Set 2   10 reps            ✏️ 🗑️
 ↑↓  Goblet Squat    Set 1   10 reps   25 lb    ✏️ 🗑️
 ↑↓  Plank           Set 1   45 sec             ✏️ 🗑️
 [+ Add line]
```
- Edit any value on a line (reps/time, weight) or delete the line
- Skipped sets show greyed out with "skipped" — edit to fill them in, or delete
- **+ Add line**: pick an exercise from the library, type reps/time + weight → it's added at the bottom; move it into place with ↑/↓ (the reorder pattern used elsewhere in the app). Set numbers renumber automatically.
- Save writes the history record **and** updates the linked Activity (calories, duration, date) so they never disagree

### 5.2 Activity screen for a workout-created entry
- Shows a **read-only summary** of the workout (name, duration, calories, compact list of exercises/sets)
- **"Edit Workout"** button → goes to the Finished Workout screen (5.1)
- Calories/duration/date are edited on the workout, not here — the workout is the source of truth and pushes its values to the Activity

### 5.4 Deleting a linked workout / activity (D9)
- Deleting either one asks: **"Also delete the linked Activity?"** (or "…linked Workout?") → **Delete both** / **Delete only this one** / Cancel
- **Delete only this one** → the survivor is **unlinked**, not broken:
  - Activity kept alone → becomes a normal, fully editable Activity (keeps its calories, duration, date, and "Workout: [name]" label)
  - Workout kept alone → its Finished Workout screen shows a **"Create Activity"** button to re-link a new one if wanted

### 5.3 Workout History list
- Every finished workout, newest first; tap one → Finished Workout screen (5.1)
- Workouts with no calories entered show a small **"No calories"** badge (left side of the card) as a reminder
- The Activities list row for a workout links there too

---

## 5a. Progression — Getting Stronger Over Time (PROPOSAL, awaiting OK)

User's requirements: suggest increases only after **many** successful sessions (e.g. 10, user-settable — not after 1–3); don't lose the starting numbers; handle **long breaks** (stops for months sometimes); same exercise in different workouts may use different set patterns (3×10 vs 10/5/3).

### What trainers actually do (research summary)
- **Double progression** (most common for non-competitive lifters, dates to 1911): pick a rep range (e.g. 8–12). Keep the weight, add reps until you hit the top of the range on **all** sets **consistently** → raise the weight a small step, drop back to the bottom of the range, repeat.
- **Weight steps**: smallest available step, usually **+5 lb** (dumbbells often 2.5–5 lb).
- **Bodyweight** (YAYOG style): add reps, then move to a harder version of the move. **Timed** holds: add a few seconds.
- **After a break**: strength holds for ~3 weeks, then drops faster. Common advice after **4+ weeks off: restart at ~50–60% of your old weights and build back over ~4 weeks** — "muscle memory" makes the climb back much faster than the first time.

### Proposed design
**1. Base vs. Current — kept per workout step, not by copying workouts**
- Each step in a workout stores two sets of numbers: **Base** (what you built — never changes on its own) and **Current** (where you are now — what the player uses).
- No duplicate workouts. A "Reset to base" button on the step (and on the whole workout) for a fresh start.
- **Current lives on the workout step, not on the exercise.** Curls in "Upper A" (3×10) and curls in "Arms Pyramid" (10/5/3) progress separately — they're different jobs. The Start screen still shows "Last time you did curls (any workout): …" for reference.

**2. When it suggests an increase**
- Each step counts **successful sessions in a row** = every set hit its Current target.
- Miss a target → counter resets to 0 (no penalty, Current stays).
- When the counter reaches **N** (default **10**, user-settable in Fitness settings and overridable per step) → Start screen shows **"⬆ Ready to level up"** with the suggestion. **Accept** → Current updates, counter resets. **Not yet** → asks again next time.

**3. What the suggestion is** (automatic, by exercise kind)
| Kind | Suggestion |
|---|---|
| Weighted, all sets same (3×10 @ 20 lb) | **Double progression**: +1 rep per set up to a top (default base reps + 2, e.g. 12); once at the top → +5 lb and back to base reps |
| Weighted, custom sets (10 @ 25 / 5 @ 45 / 3 @ 60) | Keep the reps pattern, **+5 lb on every set** |
| Bodyweight reps (push-ups 3×10) | +1 rep per set (later: "try a harder version" link) |
| Timed (plank 30s) | +5 sec |
- Step sizes (+5 lb, +1 rep, +5 sec, top-of-range) are settings, editable per step.

**4. Coming back after a break**
- Start screen checks when you last did each step. If it's been **4+ weeks** (setting): **"Welcome back — it's been 3 months since Upper A."** Choices: **Comeback (recommended): start at 60% of Current** / Start at Base / Start at Current.
- **Comeback ramp**: each completed session climbs ~10% back toward your old Current (no 10-session wait) until you're back. Then normal progression resumes.
- The old Current is remembered as **"Previous best"** so the ramp knows where to stop.

**5. Nothing is ever lost** — Workout History keeps every set you actually did, so charts/PRs show the full story regardless of Base/Current changes.

Sources: [Alpha Progression — double progression](https://alphaprogression.com/en/glossary/double-progression), [Fitbudd — double progression](https://www.fitbudd.com/academy/double-progression-definition-and-examples), [RDL Fitness — how to progress](https://www.rdlfitness.com/blog/how-to-make-lifting-progress), [PureGym — returning after a break](https://www.puregym.com/us/blog/ready-to-get-back-into-weight-training-after-a-long-break), [Art of Manliness — training hiatus](https://www.artofmanliness.com/strength/fitness/took-a-training-hiatus-heres-how-to-gain-back-the-muscle-you-lost/)

## 6. "Best App Anyone Has Seen" — ideas borrowed from the field

What the good apps do, and what we'd take:

| App | What it does well | Take it? |
|---|---|---|
| **YAYOG** | Hands-free countdown, "up next" during rest, structured progressive programs | ✅ Core of Guided mode; programs later |
| **Seven / 7-Minute apps** | Voice coach, dead-simple big-timer UI | ✅ Voice cues |
| **Strong / Hevy** | Shows last session's numbers inline; rest timer auto-starts; PRs; volume charts | ✅ "Last time" + PRs + history |
| **Stronglifts / Fitbod** | Automatic progression ("you hit all reps — add 5 lb next time") | ✅ Progression suggestions (Phase 5) |
| **Interval timer apps** (Seconds, Tabata) | Rounds, circuits, EMOM/AMRAP/Tabata presets | ✅ Circuits; presets later |
| **Nike Training Club / Apple Fitness** | Demo visuals, end-of-workout summary, streaks | ✅ Flipbook frames, summary, streak |
| **Down Dog** | Never the same workout twice | 💡 Maybe later: "shuffle" variant |

**Ideas unique to us** (because it's part of a bigger life app):
- **Auto-logs to the existing Exercise Activities / Daily Metrics** — no other workout app talks to your calorie/weight tracking the way ours can
- **Calendar**: schedule workouts ("Mon/Wed/Fri — Upper Body") using the existing recurring calendar events; tap the event to start the workout
- **AI help** (existing LLM plumbing): "Build me a 20-minute no-equipment workout" → creates the workout from your exercise library; or "write form cues for Bulgarian split squat"
- **SecondBrain action**: "I did my upper body workout this morning" → logs it
- **Workout types/presets** (later): EMOM (every minute on the minute), AMRAP (as many rounds as possible in X min — counts rounds), Tabata (20/10 × 8), Ladder (1-2-3-4-5 reps)

---

## 7. Technical Notes (first pass)

- **New file**: `js/workouts.js` (keep `exercise.js` from growing further)
- **Routes** (proposal): `#workouts` (list), `#workout/:id` (builder), `#workout-exercises`, `#workout-exercise/:id`, `#workout-run/:sessionId` (player), `#workout-history`
- **Firestore collections** (per-user via `userCol()`):
  - `workoutExercises` — name, instructions, measure (reps/time), defaultAmount, usesWeight, defaultWeight, eachSide, equipment[], targets[] {muscleId, main: bool}, pushPull ('push'|'pull'|'both'|'neither'), videoUrl, archived, isSeeded
  - `workoutMuscles` — name, area (cardio/upper/core/lower), sortOrder — seeded from §3.4, editable. Cardio is one row with area 'cardio'. Area is looked up from the muscle, never stored on the exercise.
  - `workouts` — name, description, steps[] (exercise ref + `sets[]` of {amount, weight} + restBetweenSets/restAfter, or circuit groups with rounds), estimatedSeconds, archived. Always store the full `sets[]` array even when every set is the same — one shape, no special cases.
  - `workoutSessions` (= Workout History) — workoutId, workoutName (snapshot), date, mode, status (in-progress/done), startedAt, finishedAt, durationMinutes, calories, sets[] {exerciseId, exerciseName (snapshot), measure, targetAmount, targetWeight, actualAmount, actualWeight, doneAt, skipped, manual (true if added on the edit screen)}, notes, rating, activityId (link to the `exerciseActivities` entry). Array order = display order; set numbers are computed, not stored.
  - `exerciseActivities` gets two new optional fields: `workoutSessionId` and `workoutName` (snapshot, so the list can show "Workout: Upper Body" without an extra lookup). Activity `typeId` = the new seeded **Workout** type (added to the default types list in `exercise.js`; also seeded into existing accounts that don't have it). When present, the Activity edit screen shows the read-only workout summary + Edit Workout button.
  - Pictures: reuse the existing **`photos`** collection with `targetType: 'workoutExercise'` + a frame order field (Base64, ~100–200 KB each, existing compressor). Keeps each frame in its own doc so the 1 MB doc limit is never an issue.
- **Frames from a video** (D4): pick a short video (record yourself doing 1 rep, or a saved clip) → app shows it with a scrubber → you tap "Grab frame" at start / middle / end (or "Auto: 3 evenly spaced") → each frame is drawn onto a canvas and compressed like any other photo. All in the browser, nothing uploaded, the video itself is **not** stored. Easiest way to get clean motion frames — one video instead of a friend taking 3 photos at the right instant.
- **Paste from web**: reuse `triggerPasteUpload` in `photos.js`. Note: a plain "paste an image URL" box mostly won't work — most sites block other pages from reading their images (CORS), so we can't compress them. Copy image → Paste gets around that.
- **Naming in code** (D5): the section rename to "Fitness" is **display text only** (hub title, Life tile, breadcrumbs, spec/help wording). Routes (`#exercise…`), Firestore collections (`exercise…`), and `exercise.js` stay as-is — renaming them would break saved data and links for no user benefit. Library collection is `workoutExercises` in code (avoids confusion with the existing cardio `exerciseTypes`), shown as "Exercises" in the UI. Rename lands with Phase 1.
- **Timers**: timestamp-based (store "phase ends at" time, not a ticking counter) so a pause, a background tab, or a screen flicker never drifts the clock
- **Music (D12)**: assume music is playing from another app. Voice cues should be loud/clear and preceded by a short beep so they cut through; Android usually lowers the music briefly while our voice speaks. Voice commands may need a louder/closer voice over music — test early.
- **Voice out**: `speechSynthesis` (free, built into browsers incl. Chromebook + phone); **beeps**: Web Audio API
- **Voice in**: `SpeechRecognition` / `webkitSpeechRecognition` with `continuous` + `interimResults`; auto-restart on `end`; suspend while `speechSynthesis.speaking`; match the final transcript against a synonym table (short phrases only). Feature-detect and hide the mic UI when unsupported. Command table lives in one place in code so new words are easy to add.
- **Wake Lock**: `navigator.wakeLock.request('screen')` — supported on Chrome/Android/Chromebook and iOS Safari 16.4+
- **Sharing-ready** (D11): all workout data access goes through one small helper per kind — e.g. `woLibCol(name)` for the shared-later library (`workoutExercises`, `workouts`, exercise photos) and `userCol()` for personal data (`workoutSessions`). Today `woLibCol` just returns `userCol(name)`; when Shared Spaces lands it points at the space instead — a one-line change, no rewrite.
- **Backup**: add all new collections to `js/settings.js` backup logic
- Spec + AppHelp + cache-bump rules apply to every phase

---

## 8. Open Questions (to discuss, one at a time)

1. ~~**Reps in Guided mode**~~ — ✅ decided (D1): a step is reps **or** time, never both; reps steps wait for a tap.
   - 1b. ✅ decided (D2): voice commands are built in from day one (§4.1a).
2. ~~**Weight tracking depth**~~ — ✅ decided (D3): every set has its own reps/time and weight; quick entry when they're all the same.
3. ~~**Pictures**~~ — ✅ decided (D4): both. Camera, gallery, paste, and grab-frames-from-video.
   - 3b. Animated GIFs from the web (common for exercise demos): flattening them loses the motion. Option: keep a small GIF as-is and play it instead of the flipbook. Decide when building Phase 1.
4. ~~**Naming**~~ — ✅ decided (D5): section → **Fitness**; **Exercises** (library), **Workouts** (built routines), **Workout History** (ones you've done).
5. ~~**Programs**~~ — ✅ decided (D6): yes, eventually. Start with workouts; a "Programs — Coming soon" card goes on the hub in Phase 1 as a reminder.
6. ~~**Activity log integration**~~ — ✅ decided (D7): auto-create, then land on the Finished Workout screen to enter watch calories. See §5.
   - 6a. ~~**Which Activity type?**~~ — ✅ decided (D8): one new seeded type **"Workout"**, list shows **"Workout: [name]"**.
   - 6b. ~~**Deleting**~~ — ✅ decided (D9): ask "Also delete the linked …?" with a choice; keeping it unlinks it. See §5.4.
   - 6c. ~~**Calories before you edit**~~ — ✅ decided (D10): blank until entered; "No calories" badge as a reminder.
7. ~~**Who uses it**~~ — ✅ decided (D11): user + wife on separate accounts; library shared, history personal. Sharing mechanism → `SharedSpacesPlan.md`.
8. ~~**Music**~~ — ✅ decided (D12): yes, music from another app; our voice + beeps play over it.
9. ~~**Starter library**~~ — ✅ decided (D13): seed the 20 in §3.1a.
10. ~~**Create exercises while building a workout**~~ — ✅ decided (D16): yes, inline "+ New exercise" in the builder.
11. ~~**Throughout-the-day reminders**~~ — ✅ decided (D18): no reminders; hub card only.
12. **Progression** — 🔶 researched; proposal in §5a (Base vs. Current per step, level-up after N=10 successes, comeback ramp after breaks). Awaiting OK.
13. ~~**Main vs. also-works targets**~~ — ✅ decided (D15): yes, ★ main vs. also-works.

---

## 9. Proposed Phasing (draft — will firm up after questions)

| Phase | Scope |
|---|---|
| 1 | Exercise library (CRUD, frames, cues, video link) + Workout builder (steps, sets, rest, circuits) + Exercise → Fitness rename + hub cards (Exercises, Workouts, disabled **Programs — Coming soon**) |
| 2 | **Guided player** — countdown, flipbook, up-next, spoken cues, beeps, wake lock, pause/skip, **voice commands** (§4.1a) |
| 3 | Self-paced mode + session logging (target vs. actual) + summary + "last time" + auto Exercise Activity |
| 4 | Throughout-the-day mode + in-progress card on hub/home |
| 5 | History & PRs per exercise, progression suggestions, calendar scheduling |
| 6 | Programs, EMOM/AMRAP/Tabata presets, AI workout builder, SecondBrain action |

---

## 10. Decisions Log

- **D1 (2026-10-21)** — Each exercise step is measured by **reps or time, not both**. Timed steps count down and auto-advance in Guided mode; reps steps wait for the user to tap Done (whole screen = Done button). No "time window" or seconds-per-rep estimates. Estimated workout length uses a rough seconds-per-rep figure for display only.
- **D2 (2026-10-21)** — **Voice commands are part of the Guided player from the start** (not a later add-on). Say "Done"/"Next" to advance, plus pause/resume/skip/back/more time/repeat/what's next/how long. Tap anywhere is always the backup. Starter word list in §4.1a.
- **D3 (2026-10-21)** — **Sets can differ.** Each set of an exercise has its own reps (or time) and weight — e.g. 10 @ 25 lb, 5 @ 45 lb, 3 @ 60 lb — or they can all be the same (3 × 10 @ 25 lb). Builder offers a one-line quick entry and an expandable per-set view. Stored as a `sets[]` array always.
- **D4 (2026-10-21)** — **Pictures come from anywhere**: own photos (camera/gallery) and web images (paste, or saved then picked from gallery). Plus a new **grab frames from a video** tool to make motion frames easily. Video itself not stored.
- **D5 (2026-10-21)** — **Names**: rename the section **Exercise → Fitness** (display only; code/routes/data untouched). Inside it: **Exercises** (library), **Workouts** (routines), **Workout History** (done), **Activities** (existing log, unchanged). User priority: words must be obvious.
- **D6 (2026-10-21)** — **Programs later, workouts first.** Programs (multi-week plans built from workouts) are wanted eventually. Phase 1 adds a greyed-out "Programs — Coming soon" card on the Fitness hub as a reminder. Design workouts as standalone, reusable pieces so a program can just reference them by ID later.
- **D7 (2026-10-21)** — **Finishing a workout auto-creates a linked Activity** and lands on the Finished Workout edit screen to enter watch calories. Every set is its own editable/deletable line; lines can be added manually (pick exercise, enter values) and reordered. Activity screen shows a read-only summary + Edit Workout button; the workout record is the source of truth and pushes calories/duration/date to the Activity.
- **D8 (2026-10-21)** — **Activity type**: one new built-in type **"Workout"** (not a type per workout, not "PW:"). Activities list shows **"Workout: [name]"**. Summary grids get a single combined Workout row; per-workout breakdown is a possible later add.
- **D9 (2026-10-21)** — **Deleting linked records gives a choice**: "Also delete the linked Activity/Workout?" → Delete both / Only this one. Keeping one unlinks it cleanly (orphan Activity becomes normal; orphan Workout offers "Create Activity"). User expects to usually delete both but wants the option.
- **D10 (2026-10-21)** — **Calories start blank** on a finished workout (and its Activity) until the user enters the watch number — no estimate. Workout History cards show a "No calories" badge as a reminder.
- **D11 (2026-10-21)** — **Shared library, personal history.** User and wife will each have accounts. **Exercises + Workouts (and their pictures)** should be shared between them; **Workout History, Activities, Daily Metrics** stay personal. Sharing itself is a bigger app-wide design (`SharedSpacesPlan.md`). Workouts doesn't wait for it: build on personal storage now, routed through a helper so the library can move to a shared space later with minimal change.
- **D12 (2026-10-21)** — **Music plays from another app** during workouts; our spoken cues and beeps play over it. No in-app music.
- **D13 (2026-10-21)** — **Seed a 20-exercise starter library** (§3.1a) — bodyweight + dumbbell, cues, defaults, no pictures. Editable; more can be added any time.
- **D14 (2026-10-21)** — **Exercises are tagged with targets**: specific muscles (and/or Cardio), many per exercise. Areas (Upper Body / Core / Lower Body / Cardio) roll up automatically. Library filter answers "what works my calves?" by muscle or by area.
- **D15 (2026-10-21)** — **Targets are ★ main or also-works.** Tap-to-cycle chips in the editor; filters rank main matches first.
- **D16 (2026-10-21)** — **Create exercises inline** from the workout builder (quick form → saved to library + added to workout).
- **D17 (2026-10-21)** — **Each exercise is Push, Pull, Both, or Neither.** Builder shows badges + a push/pull tally and gently suggests alternating pushes and pulls on the same area.
- **D18 (2026-10-21)** — **No reminders for throughout-the-day workouts.** The in-progress card on the hub is enough.
