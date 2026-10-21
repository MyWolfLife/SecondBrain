# SharedSpacesPlan.md — Sharing Data Between Accounts

**Status**: 🗣️ In discussion (started 2026-10-21)
**Area**: Whole app (data architecture)
**Started**: 2026-10-21 (came up while planning Workouts — see `WorkoutsPlan.md` D11)

---

## 1. The Problem

Every account has its own private data area today. The user and the user's wife will each have accounts, and some data should be **shared** between them while other data stays **private**.

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

## 3. Approach: "Spaces" with Members (S1 — decided)

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

## 3a. Section Map (S2 — decided)

**Rule: things attached to something live where it lives.** Photos, facts, problems, activities, quick tasks, calendar events attached to a plant/room/vehicle go wherever that plant/room/vehicle goes. So the decision is only made per *section*, never per photo.

| | Section | Notes |
|---|---|---|
| 🏠 **Shared** | Yard (zones, plants, weeds, chemicals, saved actions) | |
| 🏠 | House (floors, rooms, things, floor plans, breaker panels) | |
| 🏠 | Garage, Structures | |
| 🏠 | Vehicles (+ mileage logs) | |
| 🏠 | Collections | |
| 🏠 | Contacts / People (people, important dates, categories, interactions) | |
| 🏠 | Neighbors (neighborhoods, houses, residents) | |
| 🏠 | Life Projects (vacations, etc.) | Trips are usually together |
| 🏠 | Budgets | User said finance |
| 🏠 | Investments | User said finance |
| 🏠 | Insurance policies | |
| 🏠 | Checklists (templates + runs) | |
| 🏠 | Workouts library (exercises, workouts, muscles) | From WorkoutsPlan D11 |
| 🔒 **Private** | Journal | |
| 🔒 | Private Vault (photos, docs, bookmarks) | |
| 🔒 | Thoughts / Memories / My Thoughts / Notes & notebooks | |
| 🔒 | My Health (meds, conditions, visits, vitals, blood work, etc.) | |
| 🔒 | Exercise data (activities, daily metrics, goals, workout history) | |
| 🔒 | Stock Analyzer (scans, trades, signals) | |
| 🔒 | Places & Check-ins | |
| 🔒 | Bucket List | |
| 🔒 | SecondBrain history, AI usage log, app settings & keys | |
| 🏠 **Shared** | **Calendar** | Shared (S2). Events attached to private things still follow their parent |
| 🔀 **Per item** | **Credentials** | Each credential flagged 🔒 Private or 🏠 Shared (S3). New ones default to 🔒 Private |
| 🔒 | **My Legacy** | Private for now; can move to shared later with the section move tool (S2) |
| 🏠 / 🔀 | **Health for others** (tracked contacts — not "Me") | Shared (S4). **Concerns** get the per-item 🔒/🏠 flag; conditions, meds, visits, etc. are shared. Your own ("Me") health stays private |

## 3b. Per-Item Private/Shared Flag (S3)

Some sections mix both: Credentials, and Concerns in Health for others. Each item gets a **🔒 Private / 🏠 Shared** switch.

**How it works (and why it's secure):**
- The switch decides **where the item is physically stored**: your private area or the shared space. It's not just a label on a shared item. A label would still let the other person's browser download it, while physically storing it in your area means the database never sends it to them.
- Flipping the switch **moves** the item, along with everything attached to it (photos, facts, concern updates…), following the "lives where its parent lives" rule.
- List screens read both places and merge them, showing a small 🔒 or 🏠 badge on the left of each card.
- **Links across the line**: a shared item can point to a private one (a shared visit linked to a private concern, or a shared credential whose payment method is private). The other person just sees "🔒 Private item" in that spot.
- Supporting lists (credential categories, etc.) live in the shared space so both private and shared items can use them.

**Defaults:**
- New credential → 🔒 Private (safer — share on purpose)
- New concern for a tracked contact → 🏠 Shared, with the switch on the form
- When credentials are first moved over, **all existing ones start 🔒 Private**; you flip the ones you want to share

**Moving whole sections later**: the same move tool that brings House/Yard/etc. into the space can move any section later (e.g. My Legacy), and back again.

## 4. Big Questions (to discuss)

1. ~~**Which sections are shared vs. private?**~~ — ✅ S2/S3/S4: per section (§3a), plus a per-item flag for Credentials and Concerns (§3b).
2. **Mixed sections**: e.g. Exercise — the Exercises/Workouts *library* shared, but each person's **Workout History, Activities, Daily Metrics** private. Probably common.
3. **Moving existing data**: everything is in the user's personal area today. Need a one-time "move this section to the Home space" migration tool.
4. **Settings/keys**: API keys (LLM, Finnhub, etc.) — per person or per space?
5. **Backup** (`js/settings.js`): back up personal + every space you belong to?
6. **Offline Trip Mode lock**: currently per user — how does it behave on shared data?
7. **Who did it**: stamp `createdBy`/`updatedBy` on shared docs so you can see who logged what?
8. **Cost**: still free tier — no change expected.
9. **"Me" in shared data**: today `personId: null` means "Me" (credentials, health). In a shared space "Me" is ambiguous — whose? Shared items need to point at a real person record instead.
10. **Wife's existing account data**: if she has already entered data in her own account, how does it merge with yours in the space (duplicates of the same house/contacts)?

---

## 5. Rough Phasing (very early)

1. Spaces infrastructure: `spaces` collection, membership, invite code, security rules, `dataCol()` helper
2. First shared section as the pilot — candidate: **Workouts library** (new, so no migration needed)
3. Migration tool + move House/Yard/etc. one section at a time
4. Per-section "lives in" setting UI

---

## 6. Decisions Log

- **S1 (2026-10-21)** — **Member-list spaces with invite codes**, enforced by Firestore security rules on the server. Each person keeps their own login; no shared username/password. Multiple spaces supported; owner can remove members.
- **S2 (2026-10-21)** — **Section map approved** (§3a): shared list and private list as proposed; Calendar shared; My Legacy private for now (movable later).
- **S3 (2026-10-21)** — **Per-item 🔒/🏠 flag** for Credentials (default Private; existing ones start Private). The flag moves the item between areas — real security, not a label. Pattern in §3b, reusable for other sections later.
- **S4 (2026-10-21)** — **Health for others is shared**, except **Concerns**, which get the per-item flag (default Shared). The user's own ("Me") health stays private.
