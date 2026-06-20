# Multi-User Support Plan

## Overview

Add true per-user data isolation so you and a friend can share the same
app and Firebase project but each see only their own data.

## Current Baseline
- App version at time of writing: **v=140**
- Firebase project: **bishop-62d43**
- Hosting: **https://mywolflife.github.io/SecondBrain**
- **Steve's User UID: `70oTpUHGGoMy1OXr9eAtgNt65d13`** (needed for MU-3 migration)

---

### Good News — Auth Is Already Done
`auth.js` already has a complete login screen, Firebase Auth sign-in/out,
and auth-state routing. **No login UI work is needed.** The phases below
are purely about wiring Auth into the database layer.

---

## How It Works (The Core Idea)

**Today** — all data lives in flat, shared top-level collections:
```
/things/{docId}          ← everyone shares this
/zones/{docId}           ← everyone shares this
...
```

**After this plan** — each user gets their own namespace:
```
/users/steveUID/things/{docId}    ← only Steve's data
/users/steveUID/zones/{docId}
/users/bobUID/things/{docId}      ← only Bob's data
/users/bobUID/zones/{docId}
```

The trick: add a single helper function `userCol('things')` that
automatically prepends the logged-in user's path. Then every
`db.collection('things')` becomes `userCol('things')` — a mechanical
find-and-replace across 14 JS files (~212 total occurrences).

---

## Complete Collection List (All 20)

These are every Firestore collection in use. All must be migrated and
all query references must be updated.

| Collection | Used by |
|---|---|
| activities | activities.js |
| breakerPanels | house.js |
| calendarEvents | calendar.js |
| chemicals | chemicals.js |
| facts | facts.js |
| floorPlans | floorplan.js |
| floors | house.js |
| gpsShapes | gps.js |
| photos | photos.js |
| plants | plants.js |
| problems | problems.js |
| projects | projects.js |
| rooms | house.js |
| savedActions | activities.js |
| settings | settings.js |
| subThings | house.js |
| tags | house.js |
| things | house.js |
| weeds | weeds.js |
| zones | zones.js, gps.js |

---

## Refactor Scope By File

| File | Collection refs | Phase |
|---|---|---|
| house.js | 76 | MU-8 |
| gps.js | 17 | MU-6 |
| calendar.js | 24 | MU-7 |
| projects.js | 19 | MU-7 |
| plants.js | 12 | MU-6 |
| activities.js | 11 | MU-6 |
| floorplan.js | 10 | MU-8 |
| weeds.js | 10 | MU-6 |
| zones.js | 9 | MU-6 |
| chemicals.js | 7 | MU-5 |
| problems.js | 6 | MU-5 |
| photos.js | 4 | MU-5 |
| facts.js | 4 | MU-5 |
| settings.js | 3 | MU-5 |
| **Total** | **~212** | |

---

## Phases

---

### Phase MU-1 — Firebase Console Setup
**Who:** You (manual steps in browser, ~15 minutes)
**Automated work:** None

#### Steps
1. Go to [console.firebase.google.com](https://console.firebase.google.com)
   and open project **bishop-62d43**
2. In the left nav: **Build → Authentication → Get started**
3. Click **Email/Password** provider → Enable it → Save
4. Click the **Users** tab → **Add user**:
   - Add yourself: your email + a strong password
   - After adding, note your **User UID** shown in the Users table
     (looks like `xK3mN8abc...`) — you will need it for MU-3
5. Repeat **Add user** for your friend when ready (or add them later
   after everything is working)

#### Done when
You can load the app, see the login screen, sign in with your
email/password, and reach the main page.

---

### Phase MU-2 — `userCol()` Helper Function
**Who:** Claude
**Estimated coding time:** ~30 minutes
**Risk:** Low — additive only, nothing breaks yet

#### What happens
A new helper function is added to `firebase-config.js`:

```javascript
function userCol(collectionName) {
    var uid = firebase.auth().currentUser
              ? firebase.auth().currentUser.uid
              : '__nouser__';
    return db.collection('users').doc(uid).collection(collectionName);
}
```

This is the only new piece of code all other phases depend on.
The existing flat collections are untouched — the app continues to
work exactly as before.

#### Done when
Function exists in `firebase-config.js` and is deployed. No visible
change to the app.

---

### Phase MU-3 — Data Migration Script
**Who:** Claude codes it (~1–2 hrs of coding); you click one button to run it (~5 min of your time)
**Risk:** Safe — original flat-collection data is NOT deleted. Script
can be re-run safely if anything goes wrong.

#### What happens
A standalone migration page (`migrate.html`) is created in the project
root. You open it in your browser while signed in, click one button, and it:

1. Reads every document from all 20 flat collections
2. Writes an identical copy into your user namespace:
   `/users/{yourUID}/things/{docId}`, etc.
3. Shows a live progress log and a "Done ✓" confirmation when complete

#### Collections migrated (all 20)
activities, breakerPanels, calendarEvents, chemicals, facts, floorPlans,
floors, gpsShapes, photos, plants, problems, projects, rooms, savedActions,
settings, subThings, tags, things, weeds, zones

#### ⚠️ Important: Run this BEFORE Phases MU-5 through MU-8 are deployed
Once the refactored code goes live it looks in `/users/{uid}/...` only.
If migration hasn't run yet, the app will show empty. Running migration
first means zero downtime.

#### Done when
Migration page shows 100% complete with no errors. Verify in Firebase
console: **Firestore → Data → users → {yourUID} → things** — you should
see your items there.

---

### Phase MU-4 — Firestore Security Rules
**Who:** Claude writes the rules; you paste them into Firebase console (~20 min total)
**Risk:** Low

#### What happens
Current Firestore rules likely allow open read/write. They are updated to:
- Allow a signed-in user to read/write only their own `/users/{uid}/` path
- Block all unauthenticated access
- Block User A from reading User B's data

#### Rules Claude will generate
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;
    }
  }
}
```

#### Your steps (Firebase console)
1. **Build → Firestore Database → Rules tab**
2. Replace existing rules with the new ones above
3. Click **Publish**

#### Done when
Rules published. App works when signed in; an incognito tab (not signed in)
sees no data.

---

### Phase MU-5 — Refactor: Small Modules
**Who:** Claude
**Files:** `settings.js`, `photos.js`, `facts.js`, `problems.js`, `chemicals.js`
**Estimated coding time:** ~45 minutes
**~24 collection references**

Smallest files, lowest risk. Every `db.collection('x')` becomes
`userCol('x')`. A good smoke test before the larger files.

---

### Phase MU-6 — Refactor: Yard Modules
**Who:** Claude
**Files:** `zones.js`, `plants.js`, `activities.js`, `weeds.js`, `gps.js`
**Estimated coding time:** ~1–1.5 hours
**~59 collection references**

All yard-side features including the GPS/map overlays. After this phase
the entire Yard section is user-isolated.

---

### Phase MU-7 — Refactor: Calendar & Projects
**Who:** Claude
**Files:** `calendar.js`, `projects.js`
**Estimated coding time:** ~1 hour
**~43 collection references**

Calendar has recurring-event logic; projects has checklist sub-items.
Both are straightforward substitutions.

---

### Phase MU-8 — Refactor: House Modules
**Who:** Claude
**Files:** `house.js`, `floorplan.js`
**Estimated coding time:** ~1.5 hours
**~86 collection references**

The largest chunk. `house.js` alone covers floors, rooms, things,
sub-things, breaker panels, etc. Tackled last because it benefits
from lessons learned in earlier phases.

---

### Phase MU-9 — Testing & Friend Account
**Who:** You (manual testing) + Claude (any bug fixes)
**Estimated time:** ~30 minutes

#### Test checklist
- [ ] Sign in as yourself — all existing data visible, app works normally
- [ ] Sign out → login screen appears, app data hidden
- [ ] Sign in as friend → empty app (correct — no data yet)
- [ ] Friend adds a zone or thing → visible to friend only
- [ ] Sign back in as yourself → friend's data NOT visible
- [ ] Both accounts work simultaneously on different devices

#### Optional cleanup (not urgent — do whenever)
The old flat collections (`/things`, `/zones`, etc.) still exist in
Firestore but are unused after the migration. They can be deleted
manually in the Firebase console at any time to reclaim storage space.
Not required — they just sit there harmlessly until removed.

---

## Sequencing Summary

```
MU-1  YOU:    Enable Email/Password Auth in console; create your account   [COMPLETE ✓]
MU-2  Claude: Add userCol() helper to firebase-config.js                   [Code ~30 min]
MU-3  Claude: Build migration script → YOU run it once in the browser      [Code + Manual]
MU-4  Claude: Write security rules → YOU paste into Firebase console       [Code + Manual ~20 min]
         ↓
         *** MU-3 migration must be confirmed complete before deploying MU-5 ***
         ↓
MU-5  Claude: Refactor settings, photos, facts, problems, chemicals        [Code ~45 min]
MU-6  Claude: Refactor zones, plants, activities, weeds, gps               [Code ~1–1.5 hr]
MU-7  Claude: Refactor calendar, projects                                  [Code ~1 hr]
MU-8  Claude: Refactor house, floorplan                                    [Code ~1.5 hr]
MU-9  YOU:    Test both accounts; optional flat-collection cleanup          [Manual ~30 min]
```

---

## Risk & Rollback

- **No existing data is deleted** at any point until you manually
  clean up old flat collections in MU-9 (completely optional)
- If anything goes wrong in MU-5 through MU-8, reverting to the
  previous git commit instantly restores the app to flat collections
- Each code phase is a separate commit — progress is checkpointed
- The migration script is safe to re-run — it overwrites, does not duplicate

---

## Additional Notes

- `auth.js` is already complete — login screen, sign-in/out, and
  auth-state routing all exist and work. Zero auth UI work required.
- The `settings` collection (stores app name override, etc.) moves to
  user namespace so each person has their own app name.
- The `tags` collection (sub-thing tag autocomplete) moves to user
  namespace so each person manages their own tag list.
- `gps.js` was identified late — it uses `gpsShapes` and `zones`.
  Both are included in MU-6.
- After MU-1, you can create a second Firebase Auth account for your
  friend at any time — even before any code phases run. They just
  won't see isolated data until MU-9.
