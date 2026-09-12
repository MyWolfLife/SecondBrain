# Native Phone App — Planning Document

## Status
**RESOLVED — superseded, no native app being built.**

Discussion (2026-09-12) traced the idea back to a single root need: reliable offline access during multi-day, zero-signal trips (e.g. the Banff vacation). Once that need was isolated, it turned out the existing PWA (`PwaPlan.md`) can solve it directly — Firestore already has an explicit `disableNetwork()`/`enableNetwork()` pair that maps directly onto a "Go Offline"/"Go Online" button, and a deliberate prefetch step closes the one real gap (automatic caching only holds what's been recently viewed, not guaranteed full trip data).

That's a much smaller change than a separate compiled app, reuses 100% of the existing code, and avoids the iOS distribution cost problem entirely (a PWA installs free via Safari; a compiled app would need an Apple Developer Program membership, ~$99/yr, to stay installed long-term).

**Decision:** no separate native app. The work continues as a new phase in `PwaPlan.md` (Phase 2.5 — Explicit Offline Mode) instead. This document is kept as a record of the reasoning, not an active plan.

---

## Original discussion (kept for reference)

*(Everything below reflects the state of the conversation before the above conclusion was reached.)*

No tech stack chosen, no features chosen, no code written. This document captures the vision as described so far and the open architectural questions that need to be resolved before feature design begins.

Related existing docs (read for context, not yet reconciled with this idea):
- `PwaPlan.md` — an existing, not-yet-built plan to make the *existing web app* installable + offline via a PWA (manifest + service worker + Firestore's built-in `enablePersistence()`). Its Phase 4 already designs a "paste your Firebase config on first run, store it locally" flow — conceptually very close to what's described below for the native app's first-run setup. Its closing note explicitly rejected a full native/Avalonia rewrite in favor of staying web-based. **This new idea is narrower than that (a full rewrite) — a small sister app, not a replacement of the main app — but the overlap needs to be discussed explicitly, see Open Question 1.**
- `MultipleUsers.md`, `SharedHousehold.md` — planned-not-started docs about auth / per-user data isolation, relevant since this new app introduces login.

---

## Motivation
- During a vacation to Banff, Canada, cellular signal was frequently unavailable.
- The existing mitigation was a PDF export feature for Life Projects — read-only, offline, but static and non-interactive (no editing, no sync back).
- Desire: a real companion app that can be used with zero connectivity for extended periods (days), with a small set of chosen capabilities, that reconciles changes with Firestore once back online.

## Vision (as described so far)
- A **sister app** to the existing SecondBrain web app — not a replacement, not full feature parity.
- Runs **natively** on Android and iPhone.
- Ideally a **single codebase** compiled to both platforms (exact feasibility/approach TBD — see Open Questions).
- Exposes a **deliberately limited subset** of the web app's features. *Which* features is explicitly deferred to the next planning phase (see below).
- **Login required** — user authenticates with credentials, similar in spirit to the web app (note: the web app currently has **no auth** — see Open Question 2).
- **First-run setup**: user points the app at their Firestore project; that configuration is then stored on the device so it isn't re-entered every launch.
- **Normal (online) operation**: the exposed features read/write directly to Firestore, live, same as the web app.
- **"Go Offline" button**: explicitly pulls a copy of the necessary data down to the device for offline use. (This is a deliberate, user-triggered prefetch — not reliance on Firestore's automatic cache — because the use case is *multi-day, zero-signal* offline, not brief connectivity blips.)
- **While offline**: user can view pulled data, and edit *certain* data (which fields/entities is TBD — discussed later, per the user).
- **"Go Online" button**: pushes local additions/modifications/deletions back to Firestore.

---

## Open Architecture Questions
Working list — resolved answers get moved into "Decisions" below as the conversation progresses.

1. **Relationship to `PwaPlan.md`** — does this native app replace that plan, run alongside it, or absorb its offline/first-run-config ideas?
2. **Auth model** — the main web app intentionally has no auth today. Does adding login to the native app mean auth is now being introduced (and if so, does the web app get it too, or does the native app layer its own login on top of the still-open web app)?
3. **Cross-platform framework choice** — candidates to weigh: Flutter, React Native, .NET MAUI, Capacitor (wrapping existing web code), others. Tradeoffs depend heavily on answers to Q1 and the developer's comfort (C#/VB.NET background, vanilla-JS web app already in hand).
4. **iOS distribution & cost** — installing a compiled app on an iPhone long-term generally requires an Apple Developer Program membership (~$99/year) or a recurring 7-day free-provisioning resign via a Mac. This sits in tension with the project's "zero cost" principle and needs a conscious decision regardless of framework chosen. Also: does the developer have access to a Mac (needed to build/sign for iOS, one way or another)?
5. **Firestore config storage on-device** — is "pointing to Firestore" about supporting multiple different Firebase projects (e.g., letting others self-host their own data, per `PwaPlan.md` Phase 4), or something narrower (e.g., dev vs. prod project for the same user)?
6. **On-device offline storage mechanism** — what actually holds the pulled-down data on the phone (SQLite, the framework's built-in local DB, Firestore's own offline cache primitives, plain files)?
7. **Sync / conflict resolution model** — when "Go Online" pushes changes, what happens if the same record was also changed elsewhere (web app, or another device) while this phone was offline? Last-write-wins vs. flagging a conflict vs. simply not allowing overlapping edits.
8. **Data scope for offline pull** — "necessary data" is undefined so far; likely tied to whichever features get exposed (Life Projects/travel data is the strongest signal from the motivating story, but not yet confirmed as the only scope).

---

## Explicitly Deferred to the Feature-Design Phase
Per the user's direction, these are **not** being decided in this architectural conversation — they come next, once the foundation above is settled:
- Which specific modules/screens are exposed in the native app (Life Projects/travel? Yard/Bishop? Journal? Health? something else?)
- Which fields/entities are editable while offline vs. read-only
- Exact shape of "necessary data" pulled per module
- UI/UX design of the native app's screens

---

## Decisions
*(none yet — pending discussion)*

---

## Candidate Tech Stacks (for discussion, not decided)
Brief neutral notes, to be expanded once Q1–Q4 above are answered:

| Option | Language | Notes |
|---|---|---|
| Flutter + FlutterFire | Dart | Best-supported official Firebase integration for a true cross-compiled native app; new language for this developer |
| React Native + React Native Firebase | JavaScript | Same language family as the existing web app, but a different UI paradigm (component/hooks) than the existing vanilla JS |
| .NET MAUI | C# | Closest match to developer's primary background (C#/VB.NET); Firebase/Firestore client support is less mature/official on this stack |
| Capacitor (wraps existing web code) | HTML/CSS/JS | Maximum reuse of existing app code and mental model; ships as a native shell around a webview rather than fully native UI |

All options still require an Apple Developer Program membership (or Mac + recurring resign) for iOS distribution — this is a platform-level Apple requirement, not something a framework choice avoids.
