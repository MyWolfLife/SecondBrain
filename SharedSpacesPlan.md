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
| 🔒 | Thoughts / Memories / My Thoughts | Notes: see §3d — each note shareable |
| 🔒 | My Health (meds, conditions, visits, vitals, blood work, etc.) | |
| 🔒 | Exercise data (activities, daily metrics, goals, workout history) | |
| 🔒 | Stock Analyzer (scans, trades, signals) | |
| 🔒 | Places & Check-ins | |
| 🔒 | Bucket List | |
| 🔒 | SecondBrain history, AI usage log, app settings | API keys: see §3d — each key shareable |
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

## 3c. Direction (S7 — decided) — Share Like Google Drive, Built on Spaces

The user's wish list goes beyond one Home space:
- Share **different things with different people** (house with wife, baseball cards with son, albums with nobody)
- **Read/write vs. read-only** (son can view the house info but not change it)
- Others may have **their own** version of a section (son has his own house too)

### Two ways to build it
**A. Google-Drive style (per-item lists)**: every shared thing carries its own list ("House: wife can edit, son can view"). Very flexible, but the House is hundreds of pieces (rooms, things, photos, facts, problems…). Firestore security rules check each piece on its own and can't cheaply look up its parent, so every piece would need its own copy of the list. Changing who can see the house = rewriting hundreds of pieces. Bigger build, more fragile.

**B. Spaces with roles (proposed)**: same feel for the user, much simpler underneath.
- **Each shared thing gets its own "guest list" container.** Sharing the House moves it (once) into its own container; sharing the baseball cards gives them their own container.
- **The guest list has roles**: **Can edit** or **Can view**. Example — House: wife (can edit), son (can view). Baseball cards: son (can edit).
- **Changing who / what permission = editing the guest list only.** The data doesn't move again. Adding a daughter as a viewer is instant.
- Security rules: read if you're on the list; write only if your role is "Can edit" (or you're the owner).
- **What you see in the app**: a **Share** button on shareable sections and items → pick people from your connected people → choose Can edit / Can view. You never have to think about "spaces".
- **Connecting people (one time)**: you and your wife (or son) link accounts once with an invite code. After that they show up in every Share dialog.

### Having more than one of something
- Son builds **his own house** in his own account (private to him).
- When he opens House, he sees **"My House"** and **"Dad's House (view only)"** with a switcher at the top of the section.
- This is the biggest app change: sections that assume "one house / one yard per person" need a **"which one" switcher** when you have access to more than one.

### What stays the same from earlier decisions
- S1 (member lists enforced on the server, invite codes): still true; the "member list" is now per shared thing with roles.
- S2 section map: still the guide for **what makes sense to share** and what stays private, but nothing is shared until you press Share.
- S3/S4 per-item flag: becomes the Share button on items (credential, concern, collection, life project…).
- S5 ("Me" = real person) and S6 (no merging): unchanged.

## 3d. What Gets Its Own Share Button (S8 — decided)

The **unit of sharing** = the thing that gets one guest list. Everything inside/attached to it comes along.

| Section | Share button is on… | Why |
|---|---|---|
| House | The **whole house** (floors, rooms, things, floor plans, breaker panels) | Rooms make no sense alone; a second house = a second unit |
| Yard | The **whole yard** (zones, plants, weeds; chemicals & saved actions come along) | Same as house |
| Garage | The **whole garage** | |
| Structures | **Each structure** (shed, barn…) | They're independent buildings |
| Vehicles | **Each vehicle** (+ its mileage logs) | Son might get "his" truck only |
| Collections | **Each collection** | Baseball cards yes, albums no |
| Contacts | The **whole contact list** | Sharing contact-by-contact would be tedious; per-contact "keep private" could come later |
| Neighbors | **Each neighborhood** | |
| Life Projects | **Each project** | A trip with wife vs. a family trip |
| Calendar | **Each calendar** — you can have several ("My calendar", "Family", "Us"), like Google Calendar; new events pick which calendar | Events attached to a plant/room/car still follow their parent |
| Budgets | **Each budget** | |
| Investments | The **whole investments section** | Accounts/snapshots/groups are tightly linked |
| Insurance | The **whole insurance list** | |
| Checklists | **Each checklist template** (its runs come along) | |
| Credentials | **Each credential** | Default private |
| Health for others | **Each person's health** (e.g. son's), and **each concern** can be kept private | |
| Workouts | The **whole library** (exercises + workouts + muscles) | Workouts reference exercises — sharing one without the other breaks |
| Notes | **Each note** (S9) | Most stay private; share the odd one. Shared notes appear for the other person in a **"Shared with me"** notebook (they can move it into one of their own). Sharing a whole notebook could come later |
| API keys | **Each key** (S10) | Pick who can use it (e.g. AI key → wife, not kids). Usage logged per person |
| My Legacy | Not shareable yet | Can add later |
| Journal, Vault, Thoughts/Memories/My Thoughts, My Health, Exercise data, Stock Analyzer, Places, Bucket List, SecondBrain history, other settings | **No Share button** — always private | |

## 3e. Roles (S12)

| Can… | View | Edit | Owner |
|---|---|---|---|
| See everything in it | ✓ | ✓ | ✓ |
| Add / change / delete things inside it (rooms, photos, activities…) | | ✓ | ✓ |
| Change who it's shared with / their role | | | ✓ |
| Delete the whole thing (entire house) | | | ✓ |
| Un-share it (pulls it back to the owner's private area) | | | ✓ |

## 3f. Behind-the-Scenes Defaults (S13 — decided)

**Moving data when you first press Share** (answers Q3):
- The first time you share something private (e.g. the House), the app **copies** it and everything attached into its new shared container, checks the copy, then removes the private original. Progress bar while it runs.
- **Automatic backup first** — a backup is taken right before any move, so nothing can be lost.
- Un-sharing does the same in reverse (back to the owner's private area).
- After that first move, changing people/roles never moves data again.

**Backup** (answers Q5):
- Your backup includes **your private data + everything you own**, shared or not.
- Things others shared with you are the owner's to back up — but a checkbox **"Also include things shared with me"** lets you keep your own copy.
- Restoring puts shared things back in their shared containers (owner only).

**Offline Trip Mode** (answers Q6):
- Going offline downloads your private data **and** everything shared with you, so it's all readable on the trip.
- The read-only lock stays **per person**: it only locks *your own other devices*, never other people's. Your wife can keep editing the shared house while you're away.
- You **can** edit shared things while offline (e.g. the vacation itinerary). They sync when you're back. If you both changed the *same field* of the *same item*, the later sync wins — rare in practice.

## 3g. Connecting People (PROPOSAL — under review)

- **Settings → Sharing → People** lists everyone you're connected with.
- **"Invite someone"** makes a short code (e.g. `K7Q-2MX`) — **single use, expires in 7 days**. Text it to them.
- They sign in to their own account → **Settings → Sharing → "Enter invite code"** → you're connected (both directions). They pick which of their Contacts records is "you" and vice versa (links to S5).
- Connected people then show up in every Share dialog.
- **Disconnect** someone → they're removed from every guest list you own, instantly. Things they shared with you disappear from your view (still theirs).
- A **"Shared with me"** page lists everything others have shared with you, with the owner and your role.

## 4. Big Questions (to discuss)

1. ~~**Which sections are shared vs. private?**~~ — ✅ S2/S3/S4: per section (§3a), plus a per-item flag for Credentials and Concerns (§3b).
2. **Mixed sections**: e.g. Exercise — the Exercises/Workouts *library* shared, but each person's **Workout History, Activities, Daily Metrics** private. Probably common.
3. ~~**Moving existing data**~~ — ✅ S13 (§3f).
4. ~~**Settings/keys**~~ — ✅ S10: settings personal; each API key shareable with chosen people.
5. ~~**Backup**~~ — ✅ S13 (§3f).
6. ~~**Offline Trip Mode lock**~~ — ✅ S13 (§3f).
7. ~~**Who did it**~~ — ✅ S11: stamp and show added-by / last-changed-by on shared items.
8. **Cost**: still free tier — no change expected.
9. ~~**"Me" in shared data**~~ — ✅ S5: each member is linked to a real person record in shared Contacts; "Me" = the person linked to whoever is logged in.
10. ~~**Wife's existing account data**~~ — ✅ S6: none; only the user has data. No merge tool needed.

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
- **S5 (2026-10-21)** — **"Me" becomes a real person.** Each space member is linked to their own person record in the shared Contacts (`spaces/{id}.members[] {uid, personId}`). Shared items store that personId instead of `null`. The UI still says "Me" for the logged-in member's own person. Migration converts `personId: null` → the owner's person record when moving credentials/health into the space.
- **S6 (2026-10-21)** — **No merging needed.** The user is the only one with data today. Migration = move the owner's sections into the space; other members join empty and see the shared data. (Test account stays separate and isolated.)
- **S7 (2026-10-21)** — **Drive-style sharing built on spaces** (§3c): Share button on shareable things → pick connected people → **Can edit** or **Can view**. Each shared thing gets its own guest-list container; changing people/roles never moves data. People connect once via invite code. Sections get a "which one" switcher when you can see more than one (e.g. My House / Dad's House). Read-only enforced by Firestore rules.
- **S8 (2026-10-21)** — **Share units approved** (§3d). Two levels: whole sections (House, Yard, Garage, Contacts, Investments, Insurance, Workouts library) and individual items (vehicle, structure, collection, neighborhood, life project, budget, checklist, credential, person's health/concern, calendar).
- **S9 (2026-10-21)** — **Individual notes are shareable** (not whole notebooks, for now). Received notes show in a "Shared with me" notebook. Checklists already shareable per template.
- **S10 (2026-10-21)** — **API keys are shareable per key** with chosen people. Caveat accepted: whoever can use a key can technically see it (browser app). AI usage log records who made each call.
- **S11 (2026-10-21)** — **Who-did-it stamps.** Every doc in a shared container gets `createdBy`, `createdAt`, `updatedBy`, `updatedAt` (uid → shown as the person's name). Detail screens and activity/history lines show "Added by X · date" / "Last changed by X" on shared items only (private items stay uncluttered).
- **S12 (2026-10-21)** — **Roles: View / Edit / Owner** (§3e). Only the owner changes the guest list, deletes the whole shared thing, or un-shares it. Editors fully maintain what's inside.
- **S13 (2026-10-21)** — **Behind-the-scenes defaults approved** (§3f): first share copies → verifies → removes private original, with an automatic backup first; backup covers what you own (+ optional "shared with me"); Offline Trip Mode downloads shared things too, locks only your own devices, offline edits to shared things sync later (last write wins per field).
