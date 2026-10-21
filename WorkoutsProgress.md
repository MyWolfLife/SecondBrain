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
| 2.1 | Timeline engine | ✅ done |
| 2.2 | Start screen | ⏳ next |
| 2.3 | Guided player UI | ⬜ |
| 2.4 | Voice out + beeps + wake lock | ⬜ |
| 2.5 | Voice commands | ⬜ |
| 2.6 | Finish → save record + linked Activity | ⬜ |
| 2.7 | Finished Workout screen | ⬜ |

## Next up
**2.2 Start screen** (`#workout-start/:id`) — add the route (`ALL_PAGES`, `LIFE_PAGES`, router branch in `js/app.js`; page shell `page-workout-start` in index.html; loader `loadWorkoutStartPage(id)` in `js/workout-player.js`), and a **▶ Start** button on workout list cards + builder (edit mode). Screen: workout name, date (default today, can backfill), mode picker (Guided enabled; Self-paced / Throughout the day shown as "coming soon"), voice on/off, and a per-step **override list** (change sets' reps/time/weight for THIS session only, with a "Save these changes back to the workout" checkbox — saving writes into `sets`/`baseSets` like the builder). Overrides are applied to a deep copy of the workout before `woBuildTimeline()`. Hand off to 2.3 via a module variable (e.g. `window._woSession = {workout, date, mode, voice}`) then `location.hash = '#workout-run'`. 2.1 engine API is documented in the spec ("Workout timeline engine") and at the top of `js/workout-player.js`; it is tested (fake-clock `now` option).

## Notes for the next session (code facts learned)
- Routing: `js/app.js` — add page names to `ALL_PAGES` (~line 195), `LIFE_PAGES` (~224), `TOP_LEVEL_PAGES` (~158, only for nav-link pages), then an `else if (page === ...)` branch in the router (~795, Exercise routes) calling `showPage()` + a loader. Page shells are `<section class="page hidden" id="page-NAME">` in `index.html` (~7655).
- Fitness hub is `loadExercisePage()` in `js/exercise.js` (~210); Life tile label is in `index.html` ~7631; breadcrumbs say "Exercise" in 12 places in `exercise.js` (display-only rename to "Fitness").
- `.landing-tile--coming-soon` CSS class already exists (greyed, non-clickable) + `.coming-soon-badge`.
- Seeding pattern: `seedExerciseTypesIfNeeded()` / `_exEnsureMixedRunType()` in `exercise.js`.
- Backup list: `BACKUP_DATA_COLLECTIONS` in `js/settings.js` (~839); `photos` already included.
- Photo helpers in `js/photos.js`: `compressImage(file, opts)`, `triggerPasteUpload`, `handlePhotoFile`.
- Current versions after 2.1: `sw.js` CACHE_NAME `bishop-v637`; `exercise.js?v=489`, `workouts.js?v=8`, `workout-player.js?v=1`, `app.js?v=489`, `settings.js?v=492`, `photos.js?v=487`.
- **Preview gotcha**: after changing scripts, the preview may serve stale files. Run `location.reload()` (a hash-only `navigate` does NOT reload) and confirm `[...document.scripts]` shows the new `?v=` numbers before testing.
- Preview: `preview_start` name `bishop-dev`; log in with the test account (memory `reference_test_account.md`) via `form_input` on the email/password refs then click Sign In; then drive pages with `location.hash` in `javascript_tool`. `node` is NOT installed, so syntax-check by loading in the preview and reading console errors. A 404 console error about a script fetch is the service worker path and is pre-existing.
- Test frames in preview without file pickers: build canvases and call `woAddFrameData(canvas.toDataURL(...))` while on `#workout-exercise/:id`; `compressImage(new File([blob],'x.png'),{maxDimension:..,maxBase64:..})` can be called directly. File-picker/camera/paste buttons can't be driven in the preview, so they are only code-reviewed.
- **Preview gotchas**: the Browser pane may be hidden → `requestAnimationFrame` never fires and long `javascript_tool` scripts time out; call `tabs_select` on tab `seed` first and prefer `setInterval`/`setTimeout`. Video test: record a canvas with `MediaRecorder` (webm) and pass a `File` to `_woGrabStartVideo`. GIF test: a tiny hand-built 1x2 two-frame GIF decodes with `ImageDecoder` (frame count 2).
- Builder uses ONE delegated listener set on `#wobSteps` (`_woStepClick` / `_woStepInput`) keyed by `data-act` / `data-f` and `data-path` ("2" = step 2, "2.1" = item 1 of circuit 2). In preview tests, synthetic events must be created with `{bubbles:true}`.
- Python edit scripts: write to the scratchpad and run with `python`; read/write with `newline=''` is fine (git normalizes CRLF).
