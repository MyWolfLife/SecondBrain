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
| 5.6 | Calendar scheduling | ✅ done |

## Next up
**Phases 1–5 are complete.** The user asked for Phase 5 only — **do NOT start Phase 6** unless they ask (Phase 6 = Programs, EMOM/AMRAP/Tabata presets, AI workout builder, SecondBrain action + help entry per CLAUDE.md). Other open items: Shared Spaces (SharedSpacesPlan.md) is a separate later effort; known gaps — leaving the guided/self-paced player mid-workout discards the run; the "in progress" card isn't on the app's home screen; voice, speech and wake lock are untested on real hardware; editing set lines on the Finished screen doesn't re-run progression or personal records; completing a scheduled workout's calendar event doesn't create a workout record.

## Phase 6 — PAUSED while the user tests Phases 1–5 (2026-10-22)

> **2026-10-24 (L5):** Exercise levels **L5 (player: level label, per-level pictures with fallback, spoken name; set lines store the level; day checklist, Finished screen, activity summary, per-level set numbers) is built and pushed**. Next: **L6 (records, last-time and exercise history per level)**.
> **2026-10-24 (L4):** Exercise levels **L4 (Start screen: first-time question, Level today dropdown, Make this my level, run-level stamp) is built and pushed**. Next: **L5 (player and saving: level in timeline, pictures, spoken name, set lines store levelId/levelLabel)**.
> **2026-10-24 (L3):** Exercise levels **L3 (workout steps: Start at My level / pinned, picker level count, fallback notice) is built and pushed**. Next: **L4 (Start screen: first-time 'Which version can you do?', per-step level selector, resolve + snapshot)**.
> **2026-10-24 (build):** Exercise levels **L1 (data layer) and L2 (editor level tabs, per-level pictures, View card tabs, list chip) are built and pushed**. Next: **L3 (steps: Start-at My level / pinned level in the builder)**, then L4–L8 per `ExerciseLevelsPlan.md`.
> **2026-10-24 (plan):** `ExerciseLevelsPlan.md` is the agreed build plan for exercise levels (chunks L1–L8). Next: build L1 then L2 when the user says go. Formats, rep ranges, programs and import come after.
> **2026-10-24:** the user supplied the YAYOG book. Read it and wrote `YAYOGAnalysis.md` (what the book does, gaps in our exercise/workout model, proposed block formats, programs, build order, open questions). Answer its §9 questions before changing the data model or importing anything.
Discuss first, then build. Open questions already prepared:
- **Programs** (needs a full planning conversation): fixed multi-week plan (YAYOG-style) vs rotation of own workouts? scheduling (fixed weekdays vs "next in list")? weekly difficulty ramp vs the §5a progression? missed days / breaks? build-your-own vs starters? where it lives (greyed Programs tile on the Fitness hub).
- **Presets** (EMOM / AMRAP / Tabata / Ladder): which ones? AMRAP counts rounds not sets (needs player + record changes) — tap "round done"?
- **AI workout builder**: only existing exercises or may invent new ones? use recent history / muscle balance?
- **SecondBrain action**: log a past workout only, or also start one? (Follow the 7-step new-action checklist in memory + SB_HELP_ACTIONS.)
Fix anything the user finds while testing before starting Phase 6.

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
