# WorkoutsProgress.md — Build Progress Tracker

**Purpose**: resume point for the Workouts build. When the user says *"resume"*, read this file, then `WorkoutsPlan.md` §11 (work inventory), and continue at **Next up**.

**Rules while building** (from CLAUDE.md): each chunk = one commit with spec (Part 8e) + AppHelp + `sw.js` CACHE_NAME bump + `?v=` bump on every changed script tag + backup list for new collections. Announce each chunk on screen ("▶ Starting 1.3 …"). Notify before push (ntfy), then push. Test in preview (`bishop-dev`, test account from memory `reference_test_account.md`).

## Status

| Chunk | What | State |
|---|---|---|
| 1.1 | Scaffolding, Fitness rename, routes | ✅ done |
| 1.2 | Seed muscles/exercises, Workout activity type | ✅ done |
| 1.3 | Exercises list + filters | ✅ done |
| 1.4 | Exercise editor | ✅ done |
| 1.5 | Frames (camera/gallery/paste) + flipbook | ✅ done |
| 1.6 | Frames from video / GIF | ✅ done |
| 1.7 | Workouts list + builder (basic) | ✅ done |
| 1.8 | Builder advanced (custom sets, circuits, inline new exercise, push/pull) | ✅ done |
| 2.1 | Timeline engine | ⏳ next |
| 2.2 | Start screen | ⬜ |
| 2.3 | Guided player UI | ⬜ |
| 2.4 | Voice out + beeps + wake lock | ⬜ |
| 2.5 | Voice commands | ⬜ |
| 2.6 | Finish → save record + linked Activity | ⬜ |
| 2.7 | Finished Workout screen | ⬜ |

## Next up
**Phase 1 is complete.** Next: **2.1 Timeline engine** (no UI) — new file `js/workout-player.js` (add `<script src="js/workout-player.js?v=1">` after workouts.js in index.html; add to nothing else). Expand a workout doc (see data model comment at the top of the builder block in `js/workouts.js`: exercise steps with `sets[]` = CURRENT numbers, circuits with `items[]`/`rounds`) into a flat phase list: `getready` (10 s) → per step/set: `work` (timed amount, or reps → wait-for-done), `side switch` when `eachSide` (run the set twice: "Left side" then "Right side" with a short switch pause), `rest` (timed or tap) — rest-between-sets after each non-final set, rest-after after the last set; circuits: round × items with `restBetweenItems`, `restBetweenRounds` after each round except the last, `restAfter` at the end. Each phase: `{kind, label, exerciseId, setIndex, setCount, round, rounds, amount, weight, measure, side, durationSec|null (null = tap), next: <preview of the next work phase for the UP NEXT display>, section}`. Timestamp-based clock (store `phaseEndsAt`, not a ticking counter) with pause/resume/skip/back/+15 s. Verify with console checks on a circuit + pyramid workout (the numbers: a 3×10 timed/rep mix, a 10/5/3 pyramid, a 4-round 2-exercise circuit with tap rest between rounds).

## Notes for the next session (code facts learned)
- Routing: `js/app.js` — add page names to `ALL_PAGES` (~line 195), `LIFE_PAGES` (~224), `TOP_LEVEL_PAGES` (~158, only for nav-link pages), then an `else if (page === ...)` branch in the router (~795, Exercise routes) calling `showPage()` + a loader. Page shells are `<section class="page hidden" id="page-NAME">` in `index.html` (~7655).
- Fitness hub is `loadExercisePage()` in `js/exercise.js` (~210); Life tile label is in `index.html` ~7631; breadcrumbs say "Exercise" in 12 places in `exercise.js` (display-only rename to "Fitness").
- `.landing-tile--coming-soon` CSS class already exists (greyed, non-clickable) + `.coming-soon-badge`.
- Seeding pattern: `seedExerciseTypesIfNeeded()` / `_exEnsureMixedRunType()` in `exercise.js`.
- Backup list: `BACKUP_DATA_COLLECTIONS` in `js/settings.js` (~839); `photos` already included.
- Photo helpers in `js/photos.js`: `compressImage(file, opts)`, `triggerPasteUpload`, `handlePhotoFile`.
- Current versions after 1.8: `sw.js` CACHE_NAME `bishop-v636`; `exercise.js?v=489`, `workouts.js?v=8`, `app.js?v=489`, `settings.js?v=492`, `photos.js?v=487`.
- **Preview gotcha**: after changing scripts, the preview may serve stale files. Run `location.reload()` (a hash-only `navigate` does NOT reload) and confirm `[...document.scripts]` shows the new `?v=` numbers before testing.
- Preview: `preview_start` name `bishop-dev`; log in with the test account (memory `reference_test_account.md`) via `form_input` on the email/password refs then click Sign In; then drive pages with `location.hash` in `javascript_tool`. `node` is NOT installed, so syntax-check by loading in the preview and reading console errors. A 404 console error about a script fetch is the service worker path and is pre-existing.
- Test frames in preview without file pickers: build canvases and call `woAddFrameData(canvas.toDataURL(...))` while on `#workout-exercise/:id`; `compressImage(new File([blob],'x.png'),{maxDimension:..,maxBase64:..})` can be called directly. File-picker/camera/paste buttons can't be driven in the preview, so they are only code-reviewed.
- **Preview gotchas**: the Browser pane may be hidden → `requestAnimationFrame` never fires and long `javascript_tool` scripts time out; call `tabs_select` on tab `seed` first and prefer `setInterval`/`setTimeout`. Video test: record a canvas with `MediaRecorder` (webm) and pass a `File` to `_woGrabStartVideo`. GIF test: a tiny hand-built 1x2 two-frame GIF decodes with `ImageDecoder` (frame count 2).
- Builder uses ONE delegated listener set on `#wobSteps` (`_woStepClick` / `_woStepInput`) keyed by `data-act` / `data-f` and `data-path` ("2" = step 2, "2.1" = item 1 of circuit 2). In preview tests, synthetic events must be created with `{bubbles:true}`.
- Python edit scripts: write to the scratchpad and run with `python`; read/write with `newline=''` is fine (git normalizes CRLF).
