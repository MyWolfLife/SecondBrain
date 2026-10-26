# Shared Spaces — hand-off prompt for a new session

Paste everything below the line into a new Claude Code session opened in `C:\Personal\git\SecondBrain`.

---

I want to start building **Shared Spaces** in the Bishop app (my personal yard/house/life tracker, repo `C:\Personal\git\SecondBrain`). This is the follow-on to the Workouts and Programs work, which is finished and pushed.

**Read these first, in this order, before asking me anything:**
1. `CLAUDE.md` (project rules: spec and AppHelp updates, cache bumps, always commit and push with the ntfy notification first, preview verification with the test account).
2. `SharedSpacesPlan.md` — the whole design is already decided (decisions S1–S14, section map, roles, Firestore layout, security-rules outline, phasing). **Read §8 "Context for a new session" carefully**: it lists what changed since the plan was written, which Workouts/Programs collections should be shared vs personal, and the open design problem about progression state living inside shared workouts.
3. `MyLife-Functional-Spec.md` (Part 8e for Workouts/Programs, and the architecture section for `userCol()`), `FirebaseSetup.md`, `MultipleUsers.md`, `Backup.md`.
4. `js/firebase-config.js` (`userCol`, `_guardFirestoreRef`, the Offline Trip Mode lock) and `woLibCol()` at the top of `js/workouts.js` (the designed hook for the shared library).
5. `FutureEnhancements.md` → "Fitness: open items" (so you know what else is outstanding and not part of this).

**What I want from this session:**
- Start with the plan, not code. Tell me in a few lines what you understood and anything in `SharedSpacesPlan.md` that looks out of date or risky.
- Then settle the one open design problem with me (**§8b.1: per-person progression stored inside shared workouts**) — give me a recommendation and let me decide.
- Then write a chunked build plan for **Phase 1 (foundation)** and **Phase 3 (the Workouts library pilot)** in a new doc, in the same style as `ProgramsPlan.md` (chunks with results, decisions, open questions), index it in `AllPlans.md`, and have me approve it before you write code.
- Security rules live in the Firebase console, not in the repo. Draft `firestore.rules` as a file for me to review and deploy myself — never assume it is deployed.

**How I like to work:**
- Short replies. Ask me one plain question at a time, with your recommendation. If I say "you decide", decide.
- Build one chunk at a time, test it in the preview server with the test account (credentials are in the `reference_test_account` memory — there is only one test account and my real data is not reachable, so propose how to test with two users), then update the spec and AppHelp, bump the caches, commit and push (with the ntfy curl before `git push`).
- Other sessions may be editing the same checkout. Commit only your own files and never overwrite someone else's uncommitted changes.
- The app is personal: no selling or sharing of the code is planned, but the repo and GitHub Pages site are public, so never commit private data or book-derived files (`import-data/` is gitignored).

Start by reading the documents above and giving me your short summary.
