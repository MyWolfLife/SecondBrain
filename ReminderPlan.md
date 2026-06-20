# Reminder & Google Calendar Integration Plan

## Problem Statement

The Bishop calendar page is passive — users must open the app to see upcoming events.
The goal is **push-based reminders**: events surface in the user's daily flow (phone notifications,
email, etc.) without requiring them to check the app.

---

## Options Evaluated

### Option A: ntfy.sh + GitHub Actions cron
- A scheduled GitHub Actions workflow reads Firestore and sends ntfy.sh push notifications
- Pros: zero cost, uses already-familiar tools (ntfy.sh is already wired up for git push)
- Cons: reminder timing is approximate (job runs on a schedule); duplicates what Google Calendar already does natively
- **Decision: Skip** — GCal integration is a better long-term solution and makes this redundant

### Option B: "Add to Google Calendar" deep link
- Construct a URL that opens Google Calendar pre-filled with the event
- User clicks a button on each event card → GCal opens in browser → user saves it manually
- GCal handles reminders natively after that
- Pros: zero setup, no API, no credentials, works immediately
- Cons: manual step per event; one-way (Bishop changes don't auto-update GCal)
- **Decision: Keep as the fallback when no GCal Client ID is configured**

### Option C: ICS Feed on GitHub Pages
- Generate a static `.ics` file (via GitHub Action on each push) that Google Calendar subscribes to
- GCal polls it automatically and picks up new/changed events
- Pros: fully automatic after initial subscribe; zero ongoing effort
- Cons: GCal refresh lag (12–24 hours); harder to delete individual events from GCal
- **Decision: Punted to FutureEnhancements.md** — GCal API is more capable and cleaner

### Option D: Google Calendar API (full integration) ← CHOSEN
- OAuth2 browser flow — user pastes Client ID, clicks Connect, approves Google popup
- Events created/edited/deleted in Bishop are auto-mirrored to Google Calendar
- GCal handles reminders natively (phone push, email, etc.)
- **Decision: Primary path** — most powerful, aligns with existing "configure once in settings"
  pattern used for LLM and Foursquare

---

## Scope: Two Calendars

| Calendar | Firestore Collection | Event Type | GCal Event Type |
|----------|---------------------|------------|-----------------|
| Yard/Bishop Calendar | `calendarEvents` | One-time + recurring, date only | All-day events |
| Life Calendar | `lifeEvents` | One-time, start/end date + optional time | Timed or all-day depending on whether startTime is set |

Both calendars sync to the same dedicated Bishop GCal calendar. All decisions about OAuth,
settings, disconnect, Sync All, and token management apply to both.

---

## Chosen Architecture: Client-ID-gated Dual Mode

```
Settings → Google Calendar section
  ├── Client ID configured + connected?
  │     YES → Auto-sync all Bishop calendar events to GCal
  │     NO  → Show "Add to Google Calendar" deep link button on each event card
  └── Help button → walks user through Google Cloud Console setup (like LLM / Foursquare help)
```

### Mode 1: No Client ID configured ("Add to GCal" link)
- Both **Yard Calendar** and **Life Calendar** event cards show an **"Add to Google Calendar"** button
- Clicking it opens `https://calendar.google.com/calendar/render?action=TEMPLATE&text=...&dates=...&details=...`
- User manually saves in GCal; GCal handles reminders from that point forward
- Settings available even in this mode:
  - **Default reminder lead time** (e.g., 1 day before) — embedded in the deep link URL

### Mode 2: Client ID configured (full auto-sync)
- User has completed Google Cloud Console setup and stored Client ID in Bishop settings
- Bishop initiates an OAuth2 consent flow (Google popup) — user grants calendar access
- OAuth token stored in `userCol('settings').doc('googleCalendar')`
- **Every Bishop calendar event auto-syncs to GCal** when created or edited
- A **"Sync All" button** is available to re-push all events in case something gets out of sync
- Event operations:
  - **Create** → POST to Google Calendar API; store returned `gcalEventId` in Firestore event doc
  - **Edit** → PATCH to Google Calendar API using stored `gcalEventId`
  - **Delete** → DELETE to Google Calendar API using stored `gcalEventId`
  - **Complete (one-time)** → PATCH GCal event title to prepend "✓ " (e.g., "✓ Groomer")
  - **Complete (recurring occurrence)** → PATCH that occurrence's GCal event title to prepend "✓ "
  - **Cancel (recurring occurrence)** → DELETE that occurrence's GCal event; remove from ID map
- **Target calendar**: a dedicated named calendar inside GCal (default name: "Bishop")
  - User can customize the calendar name in Settings
  - On first sync, Bishop creates the calendar in GCal and stores its `calendarId`
  - If renamed in Settings, Bishop renames the GCal calendar via API (no migration needed)
  - If user deletes the Bishop calendar from GCal manually: Bishop auto-detects the 404 on next
    sync, re-creates the calendar, and re-syncs all events. A "Recreate Calendar" button also
    available in Settings as a manual recovery option.
- **Recurring events**: each generated occurrence syncs as its own one-time GCal event
  (simpler than translating Bishop's recurrence rules to GCal's RRULE format)
- **Source of truth**: Bishop — one-way sync only. Changes made directly in GCal will be
  overwritten the next time Bishop syncs that event.
- **Yard calendar events**: all-day GCal events (date only; no time fields exist)
- **Life calendar events**: timed GCal events if `startTime` is set; all-day if not. Multi-day
  events use `startDate` → `endDate` span. Field mapping: see Life Calendar section below.

---

## Decisions Made

| Question | Decision |
|----------|----------|
| OAuth complexity acceptable? | Yes — users not forced to use it; deep link is always the fallback |
| Which calendar? | Dedicated named calendar (default: "Bishop"); user can rename in Settings |
| Calendar naming | User-configurable; Bishop creates/renames it in GCal via API |
| Sync behavior | Auto-sync when API is connected; plus a "Sync All" recovery button |
| Recurring events | Simple — each occurrence as its own one-time GCal event |
| Sync direction | One-way (Bishop → GCal); Bishop is source of truth |

---

## Settings Screen Changes

Add a **Google Calendar** section to the Settings page (alongside LLM and Foursquare sections):

| Field | Notes |
|-------|-------|
| Google Client ID | OAuth2 client ID from Google Cloud Console |
| Calendar name | Name of the dedicated GCal calendar to create (default: "Bishop") |
| Default reminder (minutes before) | Used in both deep link and API-synced events |
| Connect / Disconnect button | Triggers OAuth popup or revokes access; shows connected status |
| Sync All button | Re-pushes all Bishop events to GCal (only visible when connected) |
| Help button | Walks user through GCP setup step-by-step |

---

## Google Calendar API Setup Help Flow

A help modal (like the LLM and Foursquare setup guides) that walks the user through:

1. Go to [Google Cloud Console](https://console.cloud.google.com) → create a new project
2. Enable the **Google Calendar API** for that project
3. Go to **APIs & Services → Credentials** → Create credentials → **OAuth client ID**
4. Application type: **Web application**
5. Add your Bishop app URL as an **Authorized JavaScript origin**
   (e.g., `https://mywolflife.github.io`)
6. Copy the **Client ID** and paste it into Bishop Settings → Google Calendar
7. Click **Connect** → approve Google's consent screen
8. Done — Bishop will now automatically sync events to your Google Calendar

---

## Life Calendar GCal Sync

### Field Mapping: `lifeEvents` → Google Calendar

| lifeEvents field | GCal field | Notes |
|-----------------|-----------|-------|
| `title` | `summary` | Direct map; status prefix prepended (see Status Changes below) |
| `startDate` + `startTime` | `start` | If startTime present → datetime; if absent → date (all-day) |
| `endDate` + `endTime` | `end` | If endDate absent, use startDate. If endTime present → datetime |
| `location` / `locationContactId` | `location` | Resolve contact name if contact mode |
| `description` | `description` | Event description + category name if set (e.g., "Category: Races") |
| `categoryId` | `description` (appended) | Resolve to category name, append to description |
| `cost` | (not mapped) | Not synced |
| `outcome` | (not mapped) | Not synced (changes post-event, causes noisy updates) |
| `peopleIds` | (not mapped) | Not synced |

### Status Changes → GCal Title
When a Life event's status changes, PATCH the GCal event title:
- `upcoming` → no prefix (or strip existing prefix)
- `attended` → prepend "✓ " (e.g., "✓ Boston Marathon")
- `didntgo` → prepend "✗ " (e.g., "✗ Boston Marathon")

### Life Calendar `gcalEventId`
Simple string (not a map) — Life Calendar has no recurring events, so one ID per event doc.

### Life Calendar Sync Operations
- **Create** → POST; store `gcalEventId`
- **Edit** → PATCH using `gcalEventId`
- **Delete** → DELETE using `gcalEventId`
- **Status change** → PATCH GCal title prefix (✓ attended, ✗ didntgo, none for upcoming)
- No recurring event logic needed for Life Calendar

### Sync All for Life Calendar
- Same "Sync All" button covers both calendars
- Scope: `lifeEvents` with `startDate` ≥ today

---

## Firestore Data Model Changes

### `calendarEvents` collection (Yard Calendar) — fields to add:
| Field | Type | Purpose |
|-------|------|---------|
| `gcalEventId` | string or null | GCal event ID for one-time events; null if not yet synced |
| `gcalEventIds` | map or null | Recurring only: `{ "2026-04-22": "gcalId1", "2026-05-22": "gcalId2" }` — one entry per synced occurrence |

### `lifeEvents` collection (Life Calendar) — field to add:
| Field | Type | Purpose |
|-------|------|---------|
| `gcalEventId` | string or null | GCal event ID; null if not yet synced |

### `settings/googleCalendar` document (per user, in `userCol('settings')`):
| Field | Type | Purpose |
|-------|------|---------|
| `clientId` | string | Google OAuth2 client ID |
| `accessToken` | string | OAuth access token (short-lived) |
| `tokenExpiry` | number | Unix timestamp when access token expires |
| `gcalCalendarId` | string | ID of the dedicated Bishop calendar in GCal |
| `calendarName` | string | Display name for the Bishop calendar (default: "Bishop") |
| `defaultReminderMinutes` | number | Lead time for reminders (used in deep link and API) |
| `connected` | bool | Whether the user has granted OAuth consent |

> Note: No refresh token stored. When the access token expires, the user re-authorizes
> via the Connect button. See Token Expiry section below.

---

## Technical Notes

### OAuth Token Expiry — Chosen Approach: Silent re-auth first, toast on failure
Google OAuth2 access tokens expire after ~1 hour. Using Google Identity Services (GIS) library.

**Flow before every GCal API call:**
1. Check stored `tokenExpiry` timestamp
2. If expired: call GIS `requestAccessToken({ prompt: '' })` — empty prompt means Google tries
   silently first (no popup if the user has already approved). Returns a fresh token invisibly.
3. If silent re-auth fails (access revoked, first-time error): GIS shows the Google popup automatically
4. If popup is also declined/closed: show a toast — *"Google Calendar disconnected — reconnect in Settings"*

**Result for the user**: 99% of the time, completely invisible. A popup only appears if they've
revoked access or been offline for an extended period. No manual "click to reconnect" interruptions
during normal use.

### "Sync All" Behavior
- Iterates all `calendarEvents` documents in Firestore
- **Scope: future events only** — events with a date of today or later (past events excluded)
- For events with `gcalEventId`: sends a PATCH (update in GCal)
- For events without `gcalEventId`: sends a POST (create in GCal) and stores the returned ID
- Shows a result toast: *"Synced 12 events to Google Calendar"* (or error count if any failed)

### Recurring Event Sync Window
Each generated occurrence syncs as its own one-time GCal event. Window rules:
- **Yearly recurrence** (interval ≥ 365 days): sync **10 years** of occurrences
  — handles birthdays, anniversaries, annual reminders without needing a special flag
- **All other recurrence** (weekly, monthly, every X days): sync **12 months** of occurrences
- These windows apply to both auto-sync (on create/edit) and "Sync All"

### First-Connect Bulk Sync Prompt
When the user first successfully connects GCal (OAuth approved):
- Count Bishop events with date ≥ today that have no `gcalEventId`
- If count > 0: show modal — *"You have X upcoming events not yet in Google Calendar. Sync them now?"*
  - Yes → run Sync All (future only)
  - No → dismiss; user can hit "Sync All" manually later
- If count = 0: skip the prompt

### Recurring Event GCal ID Storage
One Firestore document = one recurring rule, but N GCal events (one per occurrence).

Storage: `gcalEventIds` map on the calendarEvents doc — key is the occurrence date string, value is the GCal event ID.

**On create/edit of recurring event:**
1. Generate all occurrences within the sync window (12 months or 10 years for yearly)
2. For each occurrence date:
   - Not cancelled + in `gcalEventIds` map → PATCH (title/description may have changed)
   - Not cancelled + NOT in map → POST, add to map
   - Is cancelled (`cancelledDates[]`) + in map → DELETE from GCal, remove from map
   - Is cancelled + NOT in map → skip
3. Remove any map entries for dates no longer in the generated window (e.g., rule changed)

**On delete of recurring event:** DELETE every GCal event in `gcalEventIds` map, then delete Firestore doc.

**On occurrence completed (`completedDates[]`):** PATCH that occurrence's GCal event — prepend "✓ " to title.

**On occurrence cancelled (`cancelledDates[]`):** DELETE that occurrence from GCal; remove from `gcalEventIds` map.

### Disconnect Behavior — Soft Disconnect
When user clicks Disconnect:
- Clear `accessToken` and `tokenExpiry` in Firestore settings doc
- Set `connected: false`
- Do NOT revoke OAuth on Google's side (no API call needed)
- Do NOT clear `gcalEventIds` / `gcalEventId` from any events
- GCal events remain in Google Calendar untouched
- Auto-sync pauses (Bishop checks `connected` flag before every sync call)

**On reconnect:** OAuth flow runs again, gets a new token, sets `connected: true`.
All `gcalEventIds` are still intact — auto-sync resumes seamlessly with no duplicates.

**Why soft over hard revoke:** Hard revoke requires an extra API call and offers no benefit here —
the GCal events themselves are unaffected by revocation, and the stored IDs remain valid for
future PATCH/DELETE operations. User can always fully revoke from Google's own account settings if desired.

### Stale GCal Calendar (calendar deleted from GCal manually)
If any sync call returns a calendar-not-found error (HTTP 404 at the calendar level):
1. Auto-create a new Bishop calendar in GCal via API
2. Store new `gcalCalendarId` in settings
3. Clear all `gcalEventId` / `gcalEventIds` in Firestore (old IDs reference the deleted calendar)
4. Run a full Sync All automatically to re-populate
A manual "Recreate Calendar" button in Settings triggers the same flow on demand.

### Stale GCal Event References (event deleted from GCal manually)
If a PATCH or DELETE call returns 404 at the event level:
- For PATCH: re-create via POST, store new ID
- For DELETE: ignore — already gone from GCal, desired state achieved

### Mode 1 → Mode 2 Duplicate Warning
If a user was in deep link mode and manually added Bishop events to GCal, then configures the
API and runs Sync All, duplicates will appear in GCal. Bishop has no way to detect manually
added events. The help text and first-connect prompt will warn about this explicitly.

### Implementation Checklist Items
- Add Google Identity Services (GIS) script tag to `index.html`
- Add `gcalEventId` and `gcalEventIds` fields to calendarEvents Firestore docs
- Add `gcalEventId` field to lifeEvents Firestore docs
- Add `settings/googleCalendar` document to Firestore (per user)
- Add Google Calendar section to Settings page
- Add "Add to GCal" deep link button to Yard Calendar event cards (Mode 1)
- Add "Add to GCal" deep link button to Life Calendar event cards (Mode 1)
- Add GCal sync logic to calendar.js for Yard Calendar (Mode 2)
- Add GCal sync logic to lifecalendar.js for Life Calendar (Mode 2)
- Add "Sync All" button to Settings (visible when connected; covers both calendars)
- Add "Recreate Calendar" button to Settings (visible when connected)
- Add first-connect bulk sync prompt (counts unsynced events from both calendars)
- Add GIS library OAuth flow + token management
- **Add Google Calendar setup help modal to Settings** — step-by-step walkthrough (like
  LLM and Foursquare help modals): Google Cloud Console → enable API → create OAuth client ID
  → add authorized origin → paste Client ID → Connect
- **Update `AppHelp.md`** — sections to update or author:
  - `## screen:settings` — add Google Calendar section description (Client ID, calendar name,
    reminder lead time, Connect/Disconnect, Sync All, Recreate Calendar, Help button)
  - `## screen:calendar` — add note about "Add to GCal" button (Mode 1) and auto-sync behavior (Mode 2)
  - `## screen:lifecalendar` — add note about "Add to GCal" button (Mode 1) and auto-sync behavior (Mode 2)
- **Update `MyLife-Functional-Spec.md`** — sections to update:
  - Settings section: add Google Calendar subsection (dual-mode architecture, fields, OAuth flow)
  - Yard Calendar section: add GCal sync behavior (all-day events, auto-sync, Sync All)
  - Life Calendar section: add GCal sync behavior (timed/all-day, field mapping, status prefixes)
  - Firestore data model table: add `gcalEventId`/`gcalEventIds` to calendarEvents; `gcalEventId`
    to lifeEvents; new `settings/googleCalendar` document
- Bump cache version (`?v=N`) on all changed JS/CSS files in `index.html`
- Bump `CACHE_NAME` in `sw.js`

---

## Decisions Made (Round 2)

| Question | Decision |
|----------|----------|
| Delete in Bishop = delete in GCal? | Yes — auto-delete from GCal when deleted in Bishop |
| Sync All scope | Future events only (today and later); past events never synced |
| Token expiry UX | Silent re-auth via GIS first; toast only if that fails |
| Recurring sync window | Yearly recurrence → 10 years; all others → 12 months |
| First connect prompt | Yes — prompt to bulk sync existing events; "No" defers to "Sync All" button |
| Recurring gcalEventId storage | `gcalEventIds` map on the event doc — key: date string, value: GCal event ID |
| Completed events in GCal | Prepend "✓ " to GCal event title on completion |
| Cancelled recurring occurrence | Delete from GCal; remove from `gcalEventIds` map |
| Disconnect behavior | Soft disconnect — clear token locally, keep GCal events and stored IDs intact |
| GCal calendar deleted manually | Auto-detect 404, re-create calendar, re-sync all; "Recreate Calendar" button in Settings |
| Mode 1→2 duplicate risk | Warn in help text and first-connect prompt; no auto-resolution possible |

---

## What Was Punted

- ICS feed (Option C) — viable but inferior to API; added to FutureEnhancements.md
- ntfy.sh cron (Option A) — redundant once GCal integration is in place
- Two-way sync — too complex; one-way (Bishop → GCal) is sufficient for now
- Native GCal recurring events (RRULE) — punted; simple per-occurrence sync is good enough

---

## Decisions Made (Round 3)

| Question | Decision |
|----------|----------|
| Sync All results UX | Simple toast ("Synced X events"); failure count shown if any errors |
| Default reminder lead time | 1 day (1440 minutes) |
| GCal event description | Bishop event description as-is; no app link appended |

---

## Decisions Made (Round 4)

| Question | Decision |
|----------|----------|
| Which calendars to sync? | Both — Yard Calendar (all-day) and Life Calendar (timed or all-day) |
| Yard calendar event type in GCal | All-day (no time fields exist in calendarEvents) |
| Life calendar event type in GCal | Timed if startTime set; all-day if not. Multi-day if endDate set. |

---

## Decisions Made (Round 5)

| Question | Decision |
|----------|----------|
| Life Calendar GCal description | Event description + category name appended if set; no cost or outcome |
| Life Calendar status → GCal title | ✓ prefix for attended, ✗ for didntgo, no prefix for upcoming |
| "Add to GCal" deep link scope | Both Yard Calendar and Life Calendar event cards |

---

## Status: READY TO CODE — all decisions made, no open questions

---

## Implementation

Six phases. Each is self-contained and ends with a working, committable increment.
Phases GC-1 and GC-2 deliver immediate visible value (Settings UI + deep links) before
any API integration work begins.

---

### Phase GC-1: Foundation — `gcal.js` Module + Settings UI

**Goal:** All the shared plumbing and the Settings section. No sync behavior yet — just
the infrastructure everything else will call.

**New file: `js/gcal.js`**
- `gcalLoadSettings()` — read `userCol('settings').doc('googleCalendar')` and cache in memory
- `gcalSaveSettings(fields)` — merge-update the settings doc
- `gcalIsConnected()` — returns true if `connected === true` and `clientId` is set
- `gcalEnsureToken()` — check `tokenExpiry`; if expired, call GIS `requestAccessToken({ prompt: '' })`
  for silent re-auth; show toast and return false if that fails
- `gcalApiCall(method, url, body)` — wraps fetch with Authorization header; calls `gcalEnsureToken()`
  first; on 401 retries once after re-auth; returns parsed JSON or throws
- `gcalEnsureCalendar()` — if `gcalCalendarId` is already in settings, return it; otherwise POST
  to create a new calendar named `calendarName`, store the returned `id` in settings, return it
- `gcalConnect()` — initiate GIS `requestAccessToken` with full prompt; on success store
  `accessToken`, `tokenExpiry`, `connected: true` in settings; call `gcalEnsureCalendar()`
- `gcalDisconnect()` — clear `accessToken`, `tokenExpiry`, set `connected: false` in settings;
  do NOT revoke on Google's side
- `gcalRecreateCalendar()` — delete `gcalCalendarId` from settings, call `gcalEnsureCalendar()`
  to create a fresh one, then trigger Sync All (implemented in GC-5)
- `gcalHandleCalendarNotFound()` — called when any API response is HTTP 404 at the calendar level;
  clears all `gcalEventId` / `gcalEventIds` across both collections, then calls `gcalRecreateCalendar()`

**`index.html` changes**
- Add GIS script tag: `<script src="https://accounts.google.com/gsi/client" async defer></script>`
- Add Google Calendar section to the Settings page, below the existing LLM / Foursquare sections:
  - **Help button** — opens the GCal setup help modal (step-by-step GCP walkthrough)
  - **Client ID** text input — paste from Google Cloud Console
  - **Calendar name** text input — default "Bishop"
  - **Default reminder** number input — default 1440 (minutes); label shows "1 day"
  - **Save** button — writes Client ID, calendar name, reminder to Firestore settings doc
  - **Connect** button (shown when Client ID saved but not connected) — calls `gcalConnect()`
  - **Connection status badge** — "Connected ✓" or "Not connected"
  - **Disconnect** link (shown when connected) — calls `gcalDisconnect()`
  - **Sync All** button (shown when connected) — calls `gcalSyncAll()` (wired in GC-5)
  - **Recreate Calendar** button (shown when connected) — calls `gcalRecreateCalendar()`
- Add GCal setup help modal (like LLM/Foursquare modals):
  - Title: "Set Up Google Calendar Sync"
  - Numbered steps matching the help flow documented above
  - Note about Mode 1 → Mode 2 duplicate risk

**`js/settings.js` (or wherever Settings page logic lives)**
- On Settings page load: call `gcalLoadSettings()`, populate fields, show/hide buttons based on
  `gcalIsConnected()`
- Wire Save, Connect, Disconnect, Sync All, Recreate Calendar button handlers

**Cache:** bump `?v=N` on `gcal.js`, `index.html`, any changed CSS; bump `CACHE_NAME` in `sw.js`

---

### Phase GC-2: Deep Link Mode (Mode 1 — both calendars)

**Goal:** "Add to Google Calendar" button on every event card in both calendars when the user
is NOT connected to the API. Zero API calls — just URL construction.

**Yard Calendar (`js/calendar.js`)**
- Add helper `gcalDeepLink(event)` — builds the GCal template URL for a yard event:
  - `text` = event title
  - `dates` = `YYYYMMDD/YYYYMMDD` (all-day format; same date for one-time, window for recurring occurrence)
  - `details` = event description
  - `crm` = `POPUP` with reminder offset from `defaultReminderMinutes` setting
- On each rendered event card: if `!gcalIsConnected()`, render an "Add to Google Calendar" button
  that opens `gcalDeepLink(event)` in a new tab
- For recurring event cards, pass the specific occurrence date being rendered

**Life Calendar (`js/lifecalendar.js`)**
- Add helper `gcalLifeDeepLink(event)` — builds the GCal template URL for a life event:
  - `text` = title (with ✓/✗ prefix if status is attended/didntgo)
  - `dates` = timed format `YYYYMMDDTHHmmssZ/...` if startTime set; date-only if not
  - `enddate` = endDate if set, otherwise same as startDate
  - `location` = resolved location text (contact name or manual text)
  - `details` = description + "\nCategory: X" if categoryId set (resolve to name)
  - `crm` = reminder offset from settings
- On each rendered life event card: if `!gcalIsConnected()`, render "Add to Google Calendar" button

**Cache:** bump versions

---

### Phase GC-3: Yard Calendar Auto-Sync (Mode 2)

**Goal:** Every create/edit/delete/complete/cancel action on a yard calendar event automatically
mirrors to GCal when connected. Covers both one-time and recurring events.

**New functions in `js/gcal.js` (or `js/calendar.js`)**

`gcalBuildYardEventBody(event, occurrenceDate)` — builds the GCal API request body:
- `summary` = event title (with "✓ " prefix if completed)
- `start` / `end` = `{ date: 'YYYY-MM-DD' }` (all-day format)
- `reminders` = `{ useDefault: false, overrides: [{ method: 'popup', minutes: defaultReminderMinutes }] }`

`gcalSyncYardEvent(eventDoc)` — main sync function for a single yard calendarEvents doc:
- If one-time event:
  - No `gcalEventId` → POST, store returned ID
  - Has `gcalEventId` → PATCH; on 404 → re-POST, store new ID
- If recurring event:
  - Generate all occurrences within sync window (12 months, or 10 years if interval ≥ 365 days)
  - For each occurrence date:
    - Cancelled (in `cancelledDates[]`) + in map → DELETE, remove from map
    - Cancelled + not in map → skip
    - Not cancelled + in map → PATCH; on 404 → re-POST, update map
    - Not cancelled + not in map → POST, add to map
  - Remove map entries for dates no longer in window
  - Write updated `gcalEventIds` map back to Firestore

`gcalDeleteYardEvent(eventDoc)` — called on event delete:
- One-time: DELETE using `gcalEventId` (ignore 404)
- Recurring: DELETE every entry in `gcalEventIds` map (ignore 404s), then delete Firestore doc

`gcalCompleteYardOccurrence(eventDoc, occurrenceDate)` — PATCH that occurrence's GCal event
to prepend "✓ " to title

`gcalCancelYardOccurrence(eventDoc, occurrenceDate)` — DELETE that occurrence from GCal,
remove from `gcalEventIds` map, update Firestore

**Hook into `calendar.js`**
- After save (create or edit): if `gcalIsConnected()` → call `gcalSyncYardEvent(savedDoc)`
- After delete: if `gcalIsConnected()` → call `gcalDeleteYardEvent(eventDoc)`
- After marking complete: if `gcalIsConnected()` → call `gcalCompleteYardOccurrence(...)`
- After cancelling occurrence: if `gcalIsConnected()` → call `gcalCancelYardOccurrence(...)`

**Cache:** bump versions

---

### Phase GC-4: Life Calendar Auto-Sync (Mode 2)

**Goal:** Every create/edit/delete/status-change on a life calendar event automatically mirrors
to GCal when connected. No recurring events — simpler than GC-3.

**New functions in `js/gcal.js` (or `js/lifecalendar.js`)**

`gcalBuildLifeEventBody(event, categoryName, resolvedLocation)` — builds GCal API request body:
- `summary` = title with status prefix: "" / "✓ " / "✗ " based on `event.status`
- `start`:
  - startTime present → `{ dateTime: 'YYYY-MM-DDTHH:mm:ss', timeZone: userTimeZone }`
  - startTime absent → `{ date: 'YYYY-MM-DD' }`
- `end`:
  - endDate present + endTime present → `{ dateTime: ... }`
  - endDate present + no endTime → `{ date: endDate }`
  - endDate absent → same as start (single-day/time)
- `location` = resolvedLocation (empty string if none)
- `description` = event.description + (categoryName ? `\nCategory: ${categoryName}` : '')
- `reminders` = `{ useDefault: false, overrides: [{ method: 'popup', minutes: defaultReminderMinutes }] }`

`gcalResolveLifeEventLocation(event)` — returns location string:
- If `locationContactId` set: look up contact, return name (loaded from memory or quick Firestore fetch)
- If `location` set: return it
- Otherwise: return ''

`gcalResolveCategoryName(categoryId)` — look up category name from loaded category list

`gcalSyncLifeEvent(eventDoc)` — main sync function:
- Build body using helpers above
- No `gcalEventId` → POST, store returned ID in `lifeEvents` doc
- Has `gcalEventId` → PATCH; on 404 → re-POST, store new ID
- Writes `gcalEventId` back to Firestore

`gcalDeleteLifeEvent(eventDoc)` — DELETE using `gcalEventId` (ignore 404)

**Hook into `lifecalendar.js`**
- After save (create or edit): if `gcalIsConnected()` → call `gcalSyncLifeEvent(savedDoc)`
- After delete: if `gcalIsConnected()` → call `gcalDeleteLifeEvent(eventDoc)`
- After status change (attended/didntgo/upcoming): if `gcalIsConnected()` → call
  `gcalSyncLifeEvent(updatedDoc)` (PATCH updates the title prefix automatically via the body builder)

**Cache:** bump versions

---

### Phase GC-5: Sync All & First-Connect Prompt

**Goal:** The recovery path — bulk sync both calendars, first-connect prompt, and stale calendar
recovery. Ties together everything built in GC-3 and GC-4.

**`gcalSyncAll()` in `js/gcal.js`**
- Ensure connected; call `gcalEnsureCalendar()`
- Query `calendarEvents` where `date >= today` (one-time) + all recurring events (no date filter —
  recurring events generate future occurrences regardless of their base date)
- Query `lifeEvents` where `startDate >= today`
- For each yard event → call `gcalSyncYardEvent(doc)`
- For each life event → call `gcalSyncLifeEvent(doc)`
- Count successes and failures
- Show toast: "Synced X events to Google Calendar" or "Synced X events (Y failed)"
- On any calendar-level 404 during the loop → call `gcalHandleCalendarNotFound()` and abort
  (it will re-create the calendar and call `gcalSyncAll()` again automatically)

**First-Connect Prompt**
- Called at the end of `gcalConnect()` after OAuth succeeds
- Count `calendarEvents` with `date >= today` and no `gcalEventId` +
  `lifeEvents` with `startDate >= today` and no `gcalEventId`
- If total > 0: show modal —
  *"You have X upcoming events not yet in Google Calendar. If you previously added events
  manually using the 'Add to Google Calendar' links, syncing now may create duplicates.
  Sync anyway?"*
  - Yes → call `gcalSyncAll()`
  - No → dismiss (user can use Sync All button later)
- If total = 0: skip modal, show toast "Google Calendar connected"

**Wire buttons in Settings**
- Sync All button → `gcalSyncAll()`; disable during sync, show spinner
- Recreate Calendar button → `gcalRecreateCalendar()` with confirm dialog:
  *"This will re-create your Bishop calendar in Google and re-sync all events. Continue?"*

**Cache:** bump versions

---

### Phase GC-6: Documentation

**Goal:** All three documentation deliverables in one commit. No code changes.

**`AppHelp.md`**
- `## screen:settings` — add Google Calendar subsection:
  - Explain dual-mode (deep link vs. API sync)
  - List each field: Client ID, calendar name, reminder lead time
  - Connect/Disconnect, Sync All, Recreate Calendar buttons
  - Help modal walkthrough pointer
- `## screen:calendar` — add GCal subsection:
  - Mode 1: "Add to Google Calendar" button on each event card
  - Mode 2: events auto-sync when created/edited/deleted; completed events get ✓; cancelled
    recurring occurrences are removed from GCal
- `## screen:lifecalendar` — add GCal subsection:
  - Mode 1: "Add to Google Calendar" button on each event card
  - Mode 2: auto-sync on create/edit/delete/status-change; ✓ and ✗ title prefixes on status change

**`MyLife-Functional-Spec.md`**
- Settings section: add Google Calendar Integration subsection (dual-mode architecture, all
  settings fields, OAuth flow, Connect/Disconnect behavior, Sync All, Recreate Calendar)
- Yard Calendar section: add GCal Sync subsection (all-day events, auto-sync triggers,
  recurring occurrence map, complete/cancel behavior)
- Life Calendar section: add GCal Sync subsection (timed vs. all-day, field mapping table,
  status prefix behavior)
- Firestore data model table:
  - `calendarEvents`: add `gcalEventId`, `gcalEventIds` columns
  - `lifeEvents`: add `gcalEventId` column
  - Add new `settings/googleCalendar` row

**No cache bump needed** — documentation only, no JS/HTML/CSS changes.

---

## Phase Summary

| Phase | What It Delivers | Key Files Touched |
|-------|-----------------|-------------------|
| GC-1 | Shared GCal module, Settings UI, Help modal, OAuth connect/disconnect | `gcal.js` (new), `index.html`, settings logic |
| GC-2 | "Add to Google Calendar" deep link buttons on both calendars (no API needed) | `calendar.js`, `lifecalendar.js`, `index.html` |
| GC-3 | Full auto-sync for Yard Calendar (one-time + recurring) | `gcal.js`, `calendar.js` |
| GC-4 | Full auto-sync for Life Calendar (timed/all-day, status prefixes) | `gcal.js`, `lifecalendar.js` |
| GC-5 | Sync All, first-connect prompt, stale calendar recovery | `gcal.js`, `index.html` (buttons) |
| GC-6 | AppHelp.md + MyLife-Functional-Spec.md updates | `AppHelp.md`, `MyLife-Functional-Spec.md` |
