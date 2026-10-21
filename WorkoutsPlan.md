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
| Muscle groups | Optional tags — chest, legs, core… (for history/balance views later) |

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
- **Estimated total time** shown on the workout card (computed from times, rests, and a seconds-per-rep estimate)

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
- **Calories burned** ← from your watch (the main reason you land here)
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

### 5.3 Workout History list
- Every finished workout, newest first; tap one → Finished Workout screen (5.1)
- The Activities list row for a workout links there too

---

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
  - `workoutExercises` — name, instructions, measure (reps/time), defaultAmount, usesWeight, defaultWeight, eachSide, equipment[], muscles[], videoUrl, archived
  - `workouts` — name, description, steps[] (exercise ref + `sets[]` of {amount, weight} + restBetweenSets/restAfter, or circuit groups with rounds), estimatedSeconds, archived. Always store the full `sets[]` array even when every set is the same — one shape, no special cases.
  - `workoutSessions` (= Workout History) — workoutId, workoutName (snapshot), date, mode, status (in-progress/done), startedAt, finishedAt, durationMinutes, calories, sets[] {exerciseId, exerciseName (snapshot), measure, targetAmount, targetWeight, actualAmount, actualWeight, doneAt, skipped, manual (true if added on the edit screen)}, notes, rating, activityId (link to the `exerciseActivities` entry). Array order = display order; set numbers are computed, not stored.
  - `exerciseActivities` gets one new optional field: `workoutSessionId`. When present, the Activity edit screen shows the read-only workout summary + Edit Workout button.
  - Pictures: reuse the existing **`photos`** collection with `targetType: 'workoutExercise'` + a frame order field (Base64, ~100–200 KB each, existing compressor). Keeps each frame in its own doc so the 1 MB doc limit is never an issue.
- **Frames from a video** (D4): pick a short video (record yourself doing 1 rep, or a saved clip) → app shows it with a scrubber → you tap "Grab frame" at start / middle / end (or "Auto: 3 evenly spaced") → each frame is drawn onto a canvas and compressed like any other photo. All in the browser, nothing uploaded, the video itself is **not** stored. Easiest way to get clean motion frames — one video instead of a friend taking 3 photos at the right instant.
- **Paste from web**: reuse `triggerPasteUpload` in `photos.js`. Note: a plain "paste an image URL" box mostly won't work — most sites block other pages from reading their images (CORS), so we can't compress them. Copy image → Paste gets around that.
- **Naming in code** (D5): the section rename to "Fitness" is **display text only** (hub title, Life tile, breadcrumbs, spec/help wording). Routes (`#exercise…`), Firestore collections (`exercise…`), and `exercise.js` stay as-is — renaming them would break saved data and links for no user benefit. Library collection is `workoutExercises` in code (avoids confusion with the existing cardio `exerciseTypes`), shown as "Exercises" in the UI. Rename lands with Phase 1.
- **Timers**: timestamp-based (store "phase ends at" time, not a ticking counter) so a pause, a background tab, or a screen flicker never drifts the clock
- **Voice out**: `speechSynthesis` (free, built into browsers incl. Chromebook + phone); **beeps**: Web Audio API
- **Voice in**: `SpeechRecognition` / `webkitSpeechRecognition` with `continuous` + `interimResults`; auto-restart on `end`; suspend while `speechSynthesis.speaking`; match the final transcript against a synonym table (short phrases only). Feature-detect and hide the mic UI when unsupported. Command table lives in one place in code so new words are easy to add.
- **Wake Lock**: `navigator.wakeLock.request('screen')` — supported on Chrome/Android/Chromebook and iOS Safari 16.4+
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
   - 6a. **Which Activity type?** User ideas: (1) a new type per workout name, or (2) a "Personal Workout" type with the workout name as a sub-type, shown as "PW:[name]". **Current proposal (awaiting OK)**: one new seeded type **"Workout"**; the Activity stores `workoutName` and the list shows **"Workout: Upper Body"**. Summary grids get one "Workout" row (all workouts combined) — a per-workout breakdown can come later. Why not a type per workout: the types list and the Summary grid would grow a row for every workout you build. Why not "PW:": less obvious than spelling out "Workout:".
   - 6b. **Deleting**: if you delete the workout record, delete its Activity too (and vice versa)? Proposal: yes, with a warning that says both go.
   - 6c. **Calories before you edit**: leave blank until you enter them, or put in an estimate? Proposal: blank — your watch number is the real one.
7. **Who uses it** — just you, or would others in the household run workouts on their own accounts? (Per-user isolation already handles this — mostly affects sharing workouts.)
8. **Music** — fine to assume you play music from another app and our beeps/voice play over it?

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
