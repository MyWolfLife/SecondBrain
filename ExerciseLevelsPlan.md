# Exercise Levels — detailed build plan

*Plan only — no code written yet. 2026-10-24. Design agreed in `YAYOGAnalysis.md` §0 and §4. This is the first build step toward importing the YAYOG book; the other model additions (formats, rep ranges, programs) come after, in their own plans.*

## 1. What we are building

An exercise becomes a **ladder of levels** (easiest → hardest). Push-up: wall → table → chair → floor → feet up → one-arm. A yoga pose: easier and harder versions of the same pose. A weighted exercise stays a **one-level exercise** and behaves exactly as it does today (3×10 and 10/5/3 sets unchanged).

- **Each level has:** label, difficulty 1–4, its own cues, equipment, video, pictures, and optional default amount/weight (blank = inherits the exercise).
- **The exercise keeps:** name, muscles, push/pull, how-it's-done (sides), measure (reps or time), archived flag.
- **"My level"** is remembered per exercise. A workout step either **follows my level** (default for steps you build) or is **pinned** to one level (what the book's programs will use).
- **Progression** for multi-level exercises suggests moving **up/down a level** instead of adding reps or weight.
- **History and records** are kept **per level**.

**Golden rule: a one-level exercise must look and behave as it does today.** No level pickers, tabs, badges or prompts appear for it anywhere.

## 2. Data model

### 2a. `workoutExercises` (library; via `woLibCol`)
New optional field:
```
levels: [ { id, label, difficulty(1-4|null), instructions, equipment[], videoUrl,
            defaultAmount|null, defaultWeight|null } ]
```
- **No migration.** An exercise without `levels` is read as one level `{ id: 'base', label: '', …fields taken from the exercise itself }` through one helper, `woLevelsOf(ex)`. Nothing is rewritten until you add a second level.
- When a second level is added the exercise is saved with `levels` (first entry keeps id `'base'`, so old history and pictures still match).
- **Mirror fields stay at the top level** so every existing reader keeps working: `equipment` = union of all levels' equipment (list/picker filters), `instructions` = first level's cues, `videoUrl` = first level's video.
- Level ids are short random strings (`'base'` for the original). Order in the array = difficulty order. Ids never change; labels and order can.

### 2b. `photos` (pictures; `targetType 'workoutExercise'`)
New optional field `levelId`. Missing = the exercise's first level (`levels[0].id`, i.e. `'base'`). When an exercise becomes multi-level, existing frames are stamped `levelId:'base'` in one batch.

### 2c. NEW personal collection `workoutMyLevels` (`userCol`, doc id = exerciseId)
`{ levelId, updatedAt }`. Personal on purpose (the library may move to a shared space later; your level never should). Added to the `js/settings.js` backup list. Deleted with the exercise.

### 2d. Workout steps (inside `workouts.steps[]`, and circuit items)
New optional fields: `levelMode: 'mine' | 'pinned'` (absent = mine), `levelId` (only when pinned). Existing workouts have neither and keep working.
Progression fields get one addition: `streakLevelId` (the level the current streak was earned at) and `missStreak` (sessions in a row below the minimum, for level-down).

### 2e. Session set lines (`workoutSessions.sets[]`)
New optional `levelId`, `levelLabel` (a **snapshot**, so history stays readable if a level is later renamed or deleted). Old lines have none = first level.

### 2f. Helpers (new `js/workout-levels.js`, loaded early)
`woLevelsOf(ex)`, `woIsMultiLevel(ex)`, `woLevelById(ex,id)`, `woMyLevelId(ex)` (cache from `workoutMyLevels`; falls back to the easiest level), `woSetMyLevel(exId, levelId)`, `woResolveLevel(step, ex)` (pinned → that level if it still exists else the nearest easier one; mine → my level), `woLevelLabel(ex, levelId)` ("Chair"), `woLevelFramesKey(exId, levelId)`, `woRecordKey(line)`.

## 3. Behaviour decisions (assumed unless you say otherwise)

1. **Display name** where space is tight: "Push-up · Chair". The exercise name alone when it has one level or the level has no label.
2. **First time you start a workout** containing a multi-level exercise with no saved level: the Start screen asks once ("Which version can you do?", levels listed with pictures, default = easiest) and saves it.
3. **Changing the level on the Start screen** affects *today only*. Your saved level changes only by accepting a progression suggestion, or by the "Set as my level" link beside the selector, or on the exercise's page.
4. **A pinned step never changes your level.** Accepting a progression suggestion on a pinned step moves the **pin** (saved to the workout, like today's level-up of reps/weight).
5. **Level up/down suggestions** reuse today's streak rule (N good sessions in a row; settings already exist). Level-down is new: after **3** sessions below the minimum target (setting, can be turned off).
6. **Streaks reset when the level changes**; sets keep their numbers (you edit them at Start if the new level needs fewer reps).
7. **Records** (best weight/reps/time) are per exercise **and level**. "Last time" shows the same level if you've done it, else the most recent level with its label.
8. **Deleting a level** that has history, or is used by pinned steps, is **archived, not removed** (hidden from pickers; history keeps its label). Pinned steps that point at a removed/archived level fall back to the nearest easier level and show a notice.
9. **Exercise delete** also removes its `workoutMyLevels` doc and its pictures (as today).
10. **Muscle Balance** is unaffected (levels share the exercise's muscles).

## 4. Where the code changes (inventory)

| File | What changes |
|---|---|
| `js/workout-levels.js` **(new)** | Helpers in §2f. |
| `js/workouts.js` | Exercise editor (level tabs, per-level fields and pictures, add/rename/reorder/archive level); list card "N levels" chip; picker chip; `_woNewStep`; `_woCleanSteps`; builder step card **Start at** control; save mirrors (`equipment` union etc.); copy-workout carries `levelMode`; seeding untouched. |
| `js/workout-view.js` | Level tabs in the View card; "you are here" marker. |
| `js/workout-player.js` | Start screen: first-time level prompt, per-step level selector, resolve + snapshot; timeline phases carry `levelId/levelLabel`; frames loaded by exercise+level; voice name; `woSetLinesFromRun` writes `levelId/levelLabel`; `_woLastTimeMap` per level; `woComputePRs` keyed per level. |
| `js/workout-history.js` | Finished screen and history list show the level; exercise-history page gets a level filter; `woSetNumbers` pairing unchanged (keyed by exercise). |
| `js/workout-day.js` | Level label on checklist rows; same resolve at start. |
| `js/workout-progress.js` | Streak per level (`streakLevelId`); `woSuggestLevelUp` returns a **level** suggestion for multi-level exercises (falls back to reps/weight at the top level); new level-down logic (`missStreak`); accept handlers set my level or the pin; settings overlay adds the level-down setting. |
| `js/workout-voice.js` | Spoken name includes the level label. |
| `js/workout-ai.js` | Later chunk: optional `levels` in the AI answer. |
| `js/settings.js` | Add `workoutMyLevels` to backup list. |
| `MyLife-Functional-Spec.md`, `AppHelp.md` | New "Exercise levels" section; screen help for exercise, workout, workout-start, workout-view, workout-run, workout-done, workout-exercise-history, workouts progression. |
| `index.html`, `css/styles.css`, `sw.js` | New script tag, cache bumps, level tab/chip styles. |

## 5. Chunks (each shippable and tested on its own)

Per chunk: code → test in the preview (test account) → spec + AppHelp → cache bumps → commit → notify → push.

| # | Chunk | Done when |
|---|---|---|
| **L1** | **Data layer.** `workout-levels.js` helpers; `workoutMyLevels` load/save + backup entry; frame grouping helper. No visible change. | Helpers return one synthetic `base` level for every existing exercise; unit-style console checks pass. |
| **L2** | **Exercise editor + View card.** Level tabs (hidden until a second level is added), add / rename / reorder / archive, per-level fields and pictures (frames get `levelId`), mirror fields on save, list "N levels" chip, View card level tabs. | Create Push-up with 3 levels, pictures per level; one-level exercises look unchanged. |
| **L3** | **Steps.** `levelMode`/`levelId` on steps and circuit items, builder **Start at** control, picker chip, copy, cleanup, fallback when a pinned level is gone. | Build a workout with a following step and a pinned step; save/reload keeps both. |
| **L4** | **Start screen.** First-time "Which version can you do?", per-step level selector, "Set as my level", resolved level snapshot. | Start a workout whose exercise has no saved level → asked once; later starts don't ask. |
| **L5** | **Player and saving.** Level in timeline, pictures, spoken name; set lines store `levelId/levelLabel`; day-mode labels; finished/history text. | A guided run shows the chosen level's pictures and name; saved history shows "Push-up · Chair". |
| **L6** | **Records and history.** PRs per level; exercise-history level filter; last-time per level. | Two levels of one exercise keep separate records and last-time lines. |
| **L7** | **Progression.** Streak per level; level-up and level-down suggestions; accept sets my level or the pin; settings. | After the configured number of good sessions the Start screen offers the next level; accepting changes my level; a pinned step moves its pin. |
| **L8** | **Describe-it and docs pass.** Optional `levels` from the AI ("push-ups: wall, table, chair, floor"); final spec/AppHelp review; progress file update. | One sentence can create a multi-level exercise for review. |

Suggested order: L1 → L2 → L3 → L4 → L5 → L6 → L7 → L8. L1–L2 can ship first and are safe to test against real data.

## 6. Risks and how we handle them

- **Touches many files.** Mitigation: all level logic lives in `workout-levels.js`; other files call helpers; one-level exercises take the old path.
- **Old data.** Mitigation: no migration; missing fields mean "first level / mine".
- **Player flicker or wrong pictures.** Mitigation: frames keyed `exerciseId|levelId`; fallback to the exercise's first level if a level has no pictures.
- **History looks wrong after edits.** Mitigation: set lines carry label snapshots; levels are archived, not deleted.
- **Streak confusion.** Mitigation: `streakLevelId`; changing level always resets it, and the suggestion text says why ("3 good sessions at Chair").
- **Editor gets crowded.** Mitigation: tabs appear only for multi-level exercises; per-level fields are a compact group; pictures stay in the existing frames UI, scoped to the selected tab.

## 7. Not in this plan (next plans)

Rep ranges and "to failure" sets; tempo/pause on steps; swap-starting-side and weaker-side-first; per-picture captions; `category` / `source` / `precaution` fields; the book's workout formats (Interval Sets, Ladders, Supersets, Stappers, Tabatas); Programs; the import tool. See `YAYOGAnalysis.md` §5–§7.

## 8. Questions that can wait until we are building

1. Should the first-time level prompt also be reachable later from the exercise page ("Reset my level")? (Assumed yes.)
2. Should the level label be required, or may a level be unnamed ("Level 2")? (Assumed: unnamed shows "Level N".)
3. Level-down after how many misses by default? (Assumed 3, off-switch in settings.)
