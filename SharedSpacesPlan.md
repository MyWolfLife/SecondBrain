# SharedSpacesPlan.md — Sharing Data Between Accounts

**Status**: 🗣️ Early idea — first thoughts only, nothing decided
**Area**: Whole app (data architecture)
**Started**: 2026-10-21 (came up while planning Workouts — see `WorkoutsPlan.md` D11)

---

## 1. The Problem

Every account has its own private data area today. The user and his wife will each have accounts, and some data should be **shared** between them while other data stays **private**.

- **Share**: House, Yard, Garage, Vehicles, Contacts, Finance, Exercises/Workouts library, etc.
- **Keep private**: Journal, secret space, personal notes, etc.
- **Possibly more than one shared space** (e.g. household + a different group), so it has to be secure per space.

User's first idea: a "3rd shared space" protected by its own username/password, entered alongside the personal login. Open to other answers.

---

## 2. How Data Is Stored Today

- Every read/write goes through `userCol('collectionName')` in `js/firebase-config.js`
- That resolves to `users/{uid}/{collectionName}` — each account's private area
- Security rules (set in the Firebase console, not in this repo) presumably allow a user only into `users/{their uid}/…`
- One exception already exists: `sharedDevNotes` is a top-level collection everyone shares

---

## 3. First-Pass Recommendation: "Spaces" with Members (not a shared password)

**Idea**: a **Space** is a shared data area with a **member list**. You're already signed in with Firebase Auth, so Firebase knows exactly who you are — the security rules just check "is this person on the member list?"

```
spaces/{spaceId}                 ← name ("Kasputis Home"), members: [uid1, uid2], owner
spaces/{spaceId}/houseRooms/…    ← shared data lives under the space
spaces/{spaceId}/workoutExercises/…
users/{uid}/journal/…            ← private data stays where it is
```

- **Joining**: the owner creates the space and shares an **invite code** (or invites by email). The other person enters the code once while logged in → added to members. No second password to remember.
- **Security**: enforced by Firestore rules on the server (`request.auth.uid in members`), so it can't be bypassed from the browser. Multiple spaces work naturally — each has its own member list.
- **Removing someone**: owner removes them from the member list → instantly locked out.
- **In the app**: each *section* is set to live in either **Personal** or a **Space**. E.g. House → "Home" space, Journal → Personal. Code calls a helper like `dataCol('house', 'rooms')` that knows which one to use.

**Why not a shared username/password?**
- A password is only as secure as where it's checked. In a browser-only app, a "shared password" check would be in JavaScript the user can see and skip — the real gate has to be Firestore security rules, and those work on *who you're signed in as*, not a typed password.
- Passwords get shared/forgotten/reused; a member list can be revoked per person.
- A second Firebase account just for the space would work, but then everything written there looks like "the shared user" — you lose who-did-what, and both people need to juggle two logins.

---

## 4. Big Questions (to discuss)

1. **Which sections are shared vs. private?** Fixed per section, or chosen per item ("this contact is private")? Per-section is far simpler.
2. **Mixed sections**: e.g. Exercise — the Exercises/Workouts *library* shared, but each person's **Workout History, Activities, Daily Metrics** private. Probably common.
3. **Moving existing data**: everything is in the user's personal area today. Need a one-time "move this section to the Home space" migration tool.
4. **Settings/keys**: API keys (LLM, Finnhub, etc.) — per person or per space?
5. **Backup** (`js/settings.js`): back up personal + every space you belong to?
6. **Offline Trip Mode lock**: currently per user — how does it behave on shared data?
7. **Who did it**: stamp `createdBy`/`updatedBy` on shared docs so you can see who logged what?
8. **Cost**: still free tier — no change expected.

---

## 5. Rough Phasing (very early)

1. Spaces infrastructure: `spaces` collection, membership, invite code, security rules, `dataCol()` helper
2. First shared section as the pilot — candidate: **Workouts library** (new, so no migration needed)
3. Migration tool + move House/Yard/etc. one section at a time
4. Per-section "lives in" setting UI

---

## 6. Decisions Log

_(empty)_
