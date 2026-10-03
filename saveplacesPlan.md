# Bucket List — Save-Places-to-Visit Plan

**Status**: ALL 5 PHASES COMPLETE (2026-10-03).
**Routes as built**: `#bucketlist` (list), `#bucketitem/{id}` (detail).
**Area**: Life → new tile "Bucket List" (🧭)
**Related docs**: `Checkin-Plan.md` (visited places / Foursquare / OSM search), `MyLife-Functional-Spec.md` Part 9 (Places) and Part 10b (LLM), `PwaPlan.md` (offline), `SecondBrain.md` (LLM actions)

---

## 1. The problem

Places worth visiting show up in reels. Today the answer is a screenshot, and hundreds of screenshots are never looked at again. The goal is a **capture-fast, recall-later** list of places and experiences — towns, countries, trails, waterfalls, bars, seasonal sights, events — that can be sliced geographically ("everything in Ireland", "everything in Dublin, Ireland") and by time ("what's good in May").

Capture has to be nearly as fast as taking the screenshot, or the habit won't stick. That is why the LLM import (§6) is a core piece, not a bonus.

---

## 2. Why a new entity (not the existing `places`)

The existing `places` collection is **visited** places: a specific venue with lat/lng, created by a check-in, linked to journal entries. A wish-list item is different:

| | `places` (visited) | Bucket List item |
|---|---|---|
| Granularity | Always a specific venue | Country, town, venue, trail, or an event |
| Coordinates | Required | Optional (a country has none worth using) |
| Timing | n/a | Date, date range, month(s), or season |
| Lifecycle | Exists because you went | Want → planned → visited / dismissed |

Mixing them would force every check-in query and map to filter out aspirational records. Keep a **separate collection** and link the two when an item is visited (§8).

Collection name: `bucketList`. Per-user via `userCol('bucketList')` like everything else.

---

## 3. Data model

```
bucketList/{id}
  name            string   required      "Ladybird Falls"
  kind            string                 town | country | region | trail | waterfall | bar | restaurant | event | scenic | other
  why             string                 the reason: "saw in a reel, 40ft drop, easy 1-mile hike"
  notes           string                 free-form extra info
  tags            string[]               free-form, lowercase ("hike", "fall-color", "christmas")

  // ---- WHERE (see §4) ----
  geo: {
    country       string                 "Ireland"
    countryCode   string                 "IE"
    region        string                 state/province/county: "Leinster", "Georgia"
    city          string                 town/city: "Dublin"
    venue         string                 specific place name if it differs from `name`
    address       string                 free-form / display address
    lat, lng      number | null
    precision     string                 country | region | city | exact
  }

  // ---- WHEN (see §5) ----
  timing: {
    type          string                 none | months | season | date | range
    months        number[]               1-12, e.g. [5] for "flowers in May"; [10,11] for fall color
    season        string?                spring | summer | fall | winter  (UI sugar; expands into `months`)
    startDate     string?                ISO yyyy-mm-dd (type date/range)
    endDate       string?                ISO (type range)
    yearly        boolean                event repeats every year (Christmas lights) vs. one-off
    label         string                 free text: "tulips bloom", "peak foliage"
  }

  // ---- LINKS ----
  website         string                 primary link
  links           [{ url, label }]       any number of extra links (reels, videos, articles)

  // ---- STATE ----
  status          string                 want | planned | visited | dismissed
  priority        number                 1 high, 2 medium, 3 low (default 2)
  visitedDate     string?                ISO
  visitedJournalId string?               link back when visited (§8)
  source          string                 manual | llm-image | llm-text | json-paste
  createdAt, updatedAt

photos            existing `photos` collection, targetType: 'bucketList'  (the original screenshot lives here)
facts             existing `facts` collection, targetType: 'bucketList'   (optional, free key/value extras)
```

Notes on choices:
- **Structured `country / region / city` fields instead of one address string.** This is what makes stacking cheap and reliable (§4).
- **`timing.months` is the one field recall logic reads.** Seasons, "May", and "Oct–Nov" all normalize to a month list. Dates/ranges additionally store real dates for events.
- **`links[]`** is an array of `{url, label}` so several reels/videos can be attached; `website` stays separate because it's the "official" one.
- Photos reuse `photos.js` (Base64, ~100–200KB compression) exactly as other entities do. Keeping the screenshot is valuable: the LLM can misread it, and the reel's visuals are the real memory.

---

## 4. "Stacking" — geographic rollup

Requirement: *show me everything I want to do in Ireland*, or *in Dublin, Ireland*.

**Approach: normalize every item to a country / region / city hierarchy when it's saved, then filter and group on those fields.**

- **Source of the hierarchy** (in priority order):
  1. LLM import returns `country/region/city` (§6), then
  2. a Nominatim forward-geocode of the name + hints (free, already used by `placesGeocodeLocation` / `placesSearchOSM`) with `addressdetails=1` fills `countryCode`, `region`, `city`, `lat`, `lng` and verifies/overrides the LLM's guess,
  3. manual edit always possible.
- **Entering a place by hand**: reuse the Check-In search UI pattern (source toggle Foursquare / OpenStreetMap, location bias box). Picking a result fills the whole `geo` block. A "country only" or "town only" item just leaves the lower fields empty and sets `precision` accordingly. "Use coordinates" (lat/lng pair) is supported for places with no name.
- **Filtering**: client-side. Expected volume is hundreds of items, so load the collection once and filter in memory — no composite indexes, same pattern as places. Filter = any combination of country, region, city, kind, status, month, tag.
  - "Ireland" matches every item whose `geo.country == Ireland`, including a country-level item and all towns/venues under it.
  - "Dublin, Ireland" narrows to `geo.city == Dublin` within that country.
- **Browse UI**: a drill-down list *Country (count) → Region (count) → City (count) → items*, with the same breadcrumb pattern used elsewhere. A free-text search box searches name, why, notes, tags.
- **Map view with clustering**: Leaflet (already in the app for place detail) plus the free **Leaflet.markercluster** plugin (CDN, one extra script + stylesheet in `index.html`). Zoomed out, nearby pins merge into a numbered circle (e.g. a "3" over Atlanta); zooming in splits it into smaller circles (a "1" and a "2"), and at full zoom the individual pins appear. Tapping a circle zooms into its contents; tapping a pin shows a popup (name, location, timing, link to detail page). The map follows the active filters (country, kind, month, status, priority). Items with only a town/region get a geocoded center point so they still cluster and count; items that can't be placed on the map are listed beside it. Like the existing maps, tiles need a connection, so the map isn't available in Go Offline mode.
- **Optional cheap extra**: a small static `countryCode → continent` table gives a "Europe" level above country with no new data entry.
- Normalize spelling on save (trim, consistent country names from Nominatim's `country`) so "Ireland" and "ireland" never become two groups. Group keys compare case-insensitively.

---

## 5. Time — "when is this worth doing"

Four shapes, one picker:

| Shape | Example | Stored as |
|---|---|---|
| None | A bar in Savannah | `type: none` |
| Month(s) / season | Fall color, Oct–Nov; tulips in May | `type: months`, `months: [10,11]`, optional `season` |
| One date | A concert | `type: date`, `startDate` |
| Date range | Christmas lights, Nov 28 – Jan 1 | `type: range`, `startDate`, `endDate`, `yearly: true/false` |

Recall behaviors:
- **"Good this month / next 60 days" view**: month-based items whose month list includes the window, plus dated events overlapping it. This is the "what can I do right now" screen.
- **Event expiry**: a non-yearly dated item whose end date has passed shows an "Expired" badge but **stays in lists until the user dismisses it** (decided).
- **Yearly events** (a town's Christmas light show) roll forward — treated as active whenever the month/day window is upcoming, since exact dates for next year are rarely known; the notes field can hold "dates TBD".
- **Optional calendar tie-in (Phase 4)**: a "Remind me" button creates a Life Calendar event (`lifeEvents`) a few weeks before the window opens.

---

## 6. LLM import from a screenshot

### Flow
1. **Import** button (and, later, SecondBrain / share-target entry points) → modal with three image sources, identical to the existing Rx-scan pattern in `health.js`: **Paste** (clipboard), **Gallery**, **Camera**. Multiple images allowed (a reel often spans 2–3 screenshots). Optional text box: paste the caption/URL/hashtags or add a hint ("this is in Ireland").
2. Images are compressed client-side (same routine as photos) and sent as `image_url` parts through the existing `chatCallOpenAICompat(llm, apiKey, content, model)` helper, as `weeds.js` and `house.js` do.
3. The LLM returns JSON (below).
4. **Review screen — always.** Unlike the weed flow, which auto-saves, results are shown as editable cards with a checkbox each (default on), because OCR on a reel screenshot can be wrong and a hallucinated place looks just like a real one. Saving creates one `bucketList` doc per checked card, attaches the screenshot(s) as photos on each, and sets `source: 'llm-image'`.
5. After review, each saved item is geocoded through Nominatim (§4) in the background to fill/verify lat/lng and hierarchy. Failure to geocode never blocks the save.

### One screenshot can hold several places
A "Top 5 waterfalls in Georgia" reel is five records. The response is therefore always an **array**.

### Response contract (what the prompt demands)
```json
{
  "items": [
    {
      "name": "Amicalola Falls",
      "kind": "waterfall",
      "country": "United States",
      "region": "Georgia",
      "city": "Dawsonville",
      "venue": null,
      "lat": null,
      "lng": null,
      "timing": {
        "type": "months",
        "months": [4, 5],
        "startDate": null,
        "endDate": null,
        "yearly": false,
        "label": "spring runoff is strongest"
      },
      "why": "Tallest cascading waterfall in Georgia, 729 ft",
      "notes": "Stairs available; short viewing-platform walk too",
      "website": null,
      "tags": ["waterfall", "hike", "georgia"],
      "confidence": "high",
      "evidence": "Text overlay read: 'Amicalola Falls — best in spring'"
    }
  ],
  "unreadable": false,
  "message": null
}
```

Prompt rules (written into a `BUCKETLIST_ID_PROMPT` constant, same style as `WEED_ID_PROMPT`):
- Return **only** JSON, no prose or fences. (Parser still strips fences defensively, as `weedParseLlmResponse` does.)
- **Use `null` rather than guess** for anything not visible or reliably known — especially `website`, `lat/lng`, and dates. Same fabricate-nothing rule as `placesFetchEnrichment`.
- Pass today's date and the user's `cityState` so "this December" and "nearby" resolve; year inferred only when stated or obvious.
- `evidence` is a short quote of what in the image justified the record. Shown on the review card so a bad read is spotted instantly.
- `confidence` low → card is pre-flagged and unchecked by default.
- If the image has no identifiable place: `items: []`, `unreadable: true`, `message` explains (surfaced like the weed "additionalMessage").
- Distinguish a **person/account name** (the reel creator's handle) from the place — a common failure on social screenshots.

### Alternate path: JSON paste
Because the user may prefer to run the screenshot through a chat app they already use, the Import modal also has:
- **Copy prompt** — copies the exact prompt text.
- **Paste JSON** — a textarea that accepts the same contract and goes straight to the review screen.

This costs almost nothing (same parser, same review screen) and makes the feature usable with no LLM key configured.

### Implementation notes
- **OpenAI params**: use `max_completion_tokens`, never `max_tokens` (CLAUDE.md rule). Confirm `chatCallOpenAICompat` already complies when wiring this.
- **Vision support**: defaults are `gpt-4o-mini` (vision OK) and `grok-3` (verify it accepts images; the existing weed/house photo flows set the precedent for how a non-vision model is handled — match it).
- Show the usual "show LLM response" debug toggle used in the weed flow, for tuning the prompt.

---

## 7. UI

**Entry**: Life landing tile "Bucket List" 🧭 → `#bucketlist`.

**List page** (`#bucketlist`)
- Top bar: **+ Add**, **📷 Import from screenshot**, search box.
- Filter chips/selects: Where (country → city drill-down), Kind, Status (default: Want + Planned), Month, Tag, Priority.
- Toggle **List / Map**. Sort: newest, name, nearest to me (GPS), soonest window.
- A **"Good now"** shortcut that applies the current-month filter.
- Cards: name, kind icon, location line ("Dublin, Ireland"), timing badge (e.g. "May", "Nov 28 – Jan 1", "Expired"), priority badge (High/Med/Low), thumbnail of the screenshot if present. Badges left-aligned (standing preference — never right-align status badges).

**Detail page** (`#bucketlist/{id}`)
- Everything above, plus: map (if coords), **Open in Maps** link, links list with add/remove, photos (full gallery via `photos.js`), facts, **Mark visited** (§8), Edit, Delete.
- Shared-entity features come for free by following the `targetType` pattern: photos, facts, and optionally problems/activities are not needed here.

**Add/Edit modal**: name, kind, location search (reuse check-in search) or manual country/region/city, timing picker (None / Month(s)-Season / Date / Range + yearly), why, notes, website, extra links, tags, priority (High/Medium/Low). Follows the standard `openModal`/`dataset.mode`/`dataset.editId` pattern; confirm-before-close on unsaved edits like other modals.

**Mobile**: this is mostly used from a phone — large tap targets, Import reachable in one tap, list readable at 375px.

**Offline**: pure Firestore reads, so it works in the PWA's Go Offline mode — useful when deciding what to do while traveling. The existing global write guard on `userCol()` already blocks writes in read-only mode, so no extra work.

---

## 8. Integrations

- **Mark visited**: sets `status: 'visited'`, `visitedDate`. Optionally "Create journal entry / check-in" which, for items with coordinates, runs the normal check-in path so a real `places` record is created and `visitedJournalId` links back. Visited items drop out of default lists but stay searchable (and a "Places I've been" count per country is a free by-product).
- **Life Projects (Vacation template)**: "Add to trip" on an item copies it into a vacation project's itinerary/to-do. Phase 4 — lets the wish list feed trip planning, which is its natural purpose.
- **Life Calendar**: "Remind me" (§5).
- **SecondBrain LLM actions** (Phase 4): `add_bucket_list` ("save Ladybird Falls in Georgia for spring, saw it on a reel") and `query_bucket_list` ("what do I want to see in Ireland?"). Follow the full wiring checklist for new SecondBrain actions: `SB_ICONS`, `SB_LABELS`, `SB_HELP_ACTIONS`, the `screen:secondbrain` AppHelp table row, and the remaining steps from the saved memory checklist — the CLAUDE.md summary is not the complete list.
- **Search page**: include `bucketList` in global search if the search page indexes by collection.

---

## 9. Phases

| Phase | Scope | Result |
|---|---|---|
| **1 — Core ✅ COMPLETE** | `bucketList` CRUD, add/edit modal with location search + timing picker, list with filters/search, detail page, photos/facts, Life tile, route, AppHelp screen section | Usable manual wish list |
| **2 — Stacking & map ✅ COMPLETE** | Nominatim normalization to country/region/city, drill-down browse with counts, Leaflet map view, "Good now" month view, expired-badge logic | The "everything in Ireland" payoff |
| **3 — LLM import ✅ COMPLETE** | Import modal (paste/gallery/camera + text hint), prompt, JSON parser, review screen, screenshot attached as photo, background geocode, **Paste JSON** + **Copy prompt** path | The "skip the screenshot graveyard" payoff |
| **4 — Integrations ✅ COMPLETE** | Mark visited → journal/check-in link, Add to trip, calendar reminder, SecondBrain actions + help, global search | Wish list feeds the rest of the app |
| **5 — Share target ✅ COMPLETE** | PWA Web Share Target: share a screenshot or reel link from the phone's share sheet directly into Import | Capture in two taps, no screenshot step to forget |

Phase 5 note: a reel's **link alone can't be read by the LLM** (no fetching Instagram), so a shared link is saved as an item/`links[]` entry for manual completion, while a shared **image** goes through the §6 flow. It needs a `share_target` in `manifest.json` and a service-worker handler; scope it after the PWA install flow is confirmed solid on the phone.

---

**As built (Phase 4)**: SecondBrain actions are `ADD_BUCKET_ITEM` and `QUERY_BUCKET_LIST`; "Mark visited" stays one-tap and a separate **Log visit in journal** button does the journal link (it marks the item visited when the entry is saved); "Add to trip" adds a trip **Location** (not an itinerary day) and sets the item to Planned; the calendar button offers the event itself or a reminder. Global search already covered the collection from Phase 1.

**As built (Phase 5)**: Android Chrome only (no iOS support for Web Share Target). Shared images open the import dialog (the user still taps Read with AI); shared text/link opens the Add form; a shared link is kept on imported items as a "Shared link". Details in the functional spec, Part 1 → Share Target.

## 10. Housekeeping checklist (every phase, same commit as the code)

- `MyLife-Functional-Spec.md`: new Part for Bucket List + Firestore table row + routes; state which sections changed.
- `AppHelp.md`: new `## screen:bucketlist` (and detail/import sections); check `concept:photos` and `concept:facts` if their behavior is touched.
- `AllPlans.md`: add this file under Planned/Active (done with this draft).
- **Backup**: add `bucketList` to the `js/settings.js` backup logic (new-collection checklist).
- **Cache busting**: bump `CACHE_NAME` in `sw.js` **and** the `?v=` on every changed `<script>` tag in `index.html`.
- New JS file `js/bucketlist.js`, registered in `index.html`, router (`handleRoute`, `TOP_LEVEL_PAGES` in `app.js`) and the Life landing grid.
- Verify in the preview server with the test account (empty/isolated — seed a few items by hand).
- Do **not** hard-code API keys; LLM key comes from `settings/llm`.

---

## 11. Decisions (resolved 2026-10-03)

1. **Name**: "Bucket List" (collection `bucketList`, route `#bucketlist`, file `js/bucketlist.js`).
2. **Status**: Want / Planned / Visited / Dismissed.
3. **Kind and tags**: both — fixed `kind` for filtering plus free-form tags.
4. **Priority**: 3 levels (High / Medium / Low).
5. **Expired dated events**: stay visible with an Expired badge until the user dismisses them.
6. **Share target**: nice-to-have, stays as the last phase.
