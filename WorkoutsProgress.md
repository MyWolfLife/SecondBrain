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
| 2.2 | Start screen | ✅ done |
| 2.3 | Guided player UI | ✅ done |
| 2.4 | Voice out + beeps + wake lock | ✅ done |
| 2.5 | Voice commands | ✅ done (logic verified with a fake recogniser; real mic not testable in the preview) |
| 2.6 | Finish → save record + linked Activity | ✅ done |
| 2.7 | Finished Workout screen | ✅ done |
| 3.3 | Workout History list | ✅ done |
| 3.4 + 3.5 | Activity screen for workout entries + linked delete | ✅ done |
| 3.2 | Last time on Start screen | ✅ done |
| 3.1 | Self-paced mode | ✅ done |
| 3.6 | Personal records | ✅ done |
| 4.1–4.3 | Throughout-the-day mode (checklist, in-progress card, finish/discard) | ✅ done |
| 5.1–5.3 | Progression: streaks, level-up, comeback, reset to base | ✅ done |
| 5.4 | Per-exercise history + records chart | ✅ done |
| 5.5 | Muscle balance view | ✅ done |

## Next up
User asked for **Phase 5 only (NOT Phase 6)**. 5.1–5.3 done (`js/workout-progress.js`). Remaining: **5.6** calendar scheduling (read `js/calendar.js` + the `calendarEvents` model; add a 📅 Schedule action on workouts that creates an event with `targetType:'workout'`, `targetId`; event cards get a ▶ Start link). Then final docs. Do NOT start Phase 6.

## Notes for the next session (code facts learned)
- Routing: `js/app.js` — add page names to `ALL_PAGES` (~line 195), `LIFE_PAGES` (~224), `TOP_LEVEL_PAGES` (~158, only for nav-link pages), then an `else if (page === ...)` branch in the router (~795, Exercise routes) calling `showPage()` + a loader. Page shells are `<section class="page hidden" id="page-NAME">` in `index.html` (~7655).
- Fitness hub is `loadExercisePage()` in `js/exercise.js` (~210); Life tile label is in `index.html` ~7631; breadcrumbs say "Exercise" in 12 places in `exercise.js` (display-only rename to "Fitness").
- `.landing-tile--coming-soon` CSS class already exists (greyed, non-clickable) + `.coming-soon-badge`.
- Seeding pattern: `seedExerciseTypesIfNeeded()` / `_exEnsureMixedRunType()` in `exercise.js`.
- Backup list: `BACKUP_DATA_COLLECTIONS` in `js/settings.js` (~839); `photos` already included.
- Photo helpers in `js/photos.js`: `compressImage(file, opts)`, `triggerPasteUpload`, `handlePhotoFile`.
- Current versions after 2.6: `sw.js` CACHE_NAME (see sw.js); `exercise.js?v=490`, `workouts.js?v=9`, `workout-player.js?v=8`, `workout-voice.js?v=2`, `workout-commands.js?v=2`, `app.js?v=491`, `styles.css?v=493`, `app.js?v=489`, `settings.js?v=492`, `photos.js?v=487`.
- **Preview gotcha**: after changing scripts, the preview may serve stale files. Run `location.reload()` (a hash-only `navigate` does NOT reload) and confirm `[...document.scripts]` shows the new `?v=` numbers before testing.
- Preview: `preview_start` name `bishop-dev`; log in with the test account (memory `reference_test_account.md`) via `form_input` on the email/password refs then click Sign In; then drive pages with `location.hash` in `javascript_tool`. `node` is NOT installed, so syntax-check by loading in the preview and reading console errors. A 404 console error about a script fetch is the service worker path and is pre-existing.
- Test frames in preview without file pickers: build canvases and call `woAddFrameData(canvas.toDataURL(...))` while on `#workout-exercise/:id`; `compressImage(new File([blob],'x.png'),{maxDimension:..,maxBase64:..})` can be called directly. File-picker/camera/paste buttons can't be driven in the preview, so they are only code-reviewed.
- **Preview gotchas**: the Browser pane may be hidden → `requestAnimationFrame` never fires and long `javascript_tool` scripts time out; call `tabs_select` on tab `seed` first and prefer `setInterval`/`setTimeout`. Video test: record a canvas with `MediaRecorder` (webm) and pass a `File` to `_woGrabStartVideo`. GIF test: a tiny hand-built 1x2 two-frame GIF decodes with `ImageDecoder` (frame count 2).
- Builder uses ONE delegated listener set on `#wobSteps` (`_woStepClick` / `_woStepInput`) keyed by `data-act` / `data-f` and `data-path` ("2" = step 2, "2.1" = item 1 of circuit 2). In preview tests, synthetic events must be created with `{bubbles:true}`.
- Preview screenshot quirk: the FIRST screenshot right after a page change often looks washed out (page fade-in) — take a second one. Player is `position:fixed`, so check layout fit with `#woPlayer.scrollHeight === clientHeight`. Test player flow by calling `_woP.runner.skip()/done()` and reading the DOM; `window._woFinished` holds the run for saving.
- Voice test hooks: set `window.woSpeakHook = t => ...` and `window.woBeepHook = (f,ms) => ...` to capture speech/beeps; drive a player without the UI by setting `window._woSession` (see 2.4 test) and `location.hash='#workout-run'`. The preview browser DENIES wake lock (NotAllowedError) — mock `navigator.wakeLock` to test.
- Voice-command tests: the preview Chromium exposes BOTH `window.SpeechRecognition` and `webkitSpeechRecognition` — fake BOTH (`window.SpeechRecognition = window.webkitSpeechRecognition = Fake`) or the real one will request the (blocked) mic. Drive commands with `woHandleTranscript('done')` or by calling the fake instance's `onresult({resultIndex:0, results:[Object.assign([{transcript:'done'}],{isFinal:true})]})`; reset `_woV.speaking=false; _woV.lastSpeechEnd=0;` first because the app's own speech blocks commands for a moment.
- Python edit scripts: write to the scratchpad and run with `python`; read/write with `newline=''` is fine (git normalizes CRLF).

- **CSS cache bump**: `css/styles.css?v=` in index.html is ALSO versioned (was 490 → 491 at 2.3). Bump it in every commit that touches styles.css (earlier chunks 1.1–2.2 forgot).
