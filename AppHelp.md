# MyLife App — Help Guide

This document describes every screen and feature in the MyLife app.
It is used by the in-app AI assistant to answer your questions.

---

## screen:main

**What this screen is for:** The main landing page. From here you reach every section of the app.

**Sections available:**
- **Yard** — Track plants, zones, weeds, chemicals, and yard activities
- **House** — Track floors, rooms, things (appliances/fixtures), floor plans, and electrical panels
- **Life** — Journal, contacts, notes, life projects (vacation planner), life calendar
- **Thoughts** — Top 10 lists, memories, personal thoughts (views, reflections, advice, reviews)
- **Vehicles** — Track vehicles and their maintenance
- **Garage** — Track garage rooms and stored items
- **Structures** — Outdoor structures (sheds, pergolas, fences, etc.)
- **Collections** — Track collectibles, sets, or any grouped items
- **Health** — Vitals, medications, visits, conditions, blood work, insurance, and more

**Buttons on this screen:**
- **⚡ QuickLog** — AI assistant. Type or speak anything in plain English — log activities, add tasks, record problems, log exercise, track health metrics, add plants or weeds, move items, set reminders, and more. 25 commands total. See the QuickLog help screen (tap ?) for the full list.
- **📍 Check In** — GPS-based location check-in. Records where you are right now.

---

## screen:secondbrain

**What this screen is for:** QuickLog — the AI assistant that lets you log anything in the app by typing or speaking in plain English. Tap ⚡ QuickLog from the main screen to open it.

### How it works
- Type or speak a command in plain English and tap Send (or use the mic button to speak)
- The AI interprets your command, shows you a confirmation screen with the parsed details, and lets you review or adjust before saving
- Attach a photo first to include it with the logged item

### Full command list

| Icon | Command | What it does | Example phrases |
|------|---------|-------------|-----------------|
| 📓 | **Add Journal Entry** | Log a diary entry, thought, or personal note | "This morning I had a great walk", "Feeling tired today" |
| 📅 | **Add Calendar Event** | Schedule a future reminder or recurring event | "Remind me to change the oil on April 15th", "Schedule fertilizer every 6 weeks" |
| 🌿 | **Log Activity** | Record a task done on any plant, zone, vehicle, room, or item | "I just mowed the back yard", "Washed the truck", "Painted the office walls" |
| ⚠️ | **Add Problem** | Flag an issue or concern with any entity | "The shed roof is leaking", "The rose bush has black spots" |
| 📋 | **Add Fact** | Record a factual detail — dimensions, specs, dates | "The front garden bed is 120 square feet", "The shed was built in 2018" |
| 🔨 | **Add Project** | Track a future improvement or multi-step effort | "I want to install drip irrigation", "Replace the carpet in the office" |
| ✅ | **Add Task** | Add a quick to-do item | "Add a task to the back yard — trim the hedges", "I need to clean the gutters" |
| 🎂 | **Add Important Date** | Record a birthday or anniversary for a person | "Jake's birthday is March 15th", "Connie and I got married on June 3rd 2001" |
| 🚗 | **Log Mileage** | Record the current odometer reading on a vehicle | "The truck is at 87,500 miles", "Just hit 45,000 on the SUV" |
| 👥 | **Log Interaction** | Log a conversation, visit, or time with someone | "Had lunch with Jake", "Called my brother about Thanksgiving" |
| 🌱 | **Add Weed** | Record a weed; attach a photo for AI identification | "There's crabgrass along the back fence", "Found wild onions near the mailbox" |
| 🪴 | **Add Plant** | Add a new plant to a zone; attach a photo for AI ID | "I planted a new azalea in the front yard", "Put 3 mums in the back garden bed" |
| 🧪 | **Add Product** | Add a product to your chemicals/products list | "Add Roundup to my products", "I bought Scotts Turf Builder" |
| 📊 | **Add Tracking Entry** | Log a personal health or life metric | "My weight today is 182", "Blood pressure was 118 over 76", "Slept 7.5 hours" |
| 🏃 | **Log Exercise** | Log a workout — run, walk, bike, gym, mowing, etc. | "I just ran 5 miles in 5303", "Did 45 minutes of weights", "Mowed for an hour and a half" |
| 📦 | **Add Item** | Add a tracked item to a room, garage area, or structure | "Add this lamp to the office", "Add this tool to the shed shelves" |
| 🚚 | **Move Item** | Move tracked items to a new location | "I moved the chainsaw from the shed to the garage", "Move the drill to the workbench" |
| 📷 | **Attach Photos** | Attach photos to an existing record | "Add these photos to the back yard", "Attach this to the shed" |
| 📝 | **Add Note** | Add a note to a notebook | "Add a note to pay my taxes", "Note that the azalea was blooming today" |
| 🛠️ | **Dev Note** | Leave feedback for the developer | "Note to developer: the speech button gets stuck", "Dev note — fix the photo layout" |
| 🗓️ | **Add Personal Event** | Add a life event to your personal calendar | "I'm going to the AC/DC concert on Sept 26", "Golf trip to Scottsdale next March" |
| 🔍 | **Find Item** | Locate where something is stored or tracked | "Where is my gator hat?", "Find the chainsaw", "Where did I put the router manual?" |
| ⏰ | **Add Reminder** | Set a time-based reminder; syncs to Google Calendar | "Remind me in 30 days to change the hot tub filter", "Remind me tomorrow to call the groomer" |
| 📍 | **Check In** | Check in at a real-world place | "Check in at Smokey Bones", "I'm at Home Depot" |
| 💡 | **Help Question** | Ask how to use the app | "How do I add a plant?", "Where do I log a doctor's visit?" |

### Tips
- **Voice input**: Tap the mic button to speak. Punctuation commands work the same as in the journal ("period", "comma", "new line", etc.)
- **Photos**: Attach a photo before sending to include it with the result (plant ID, weed ID, item add, etc.)
- **Tap the ? button** on the QuickLog screen to see the full command list with examples inside the app
- **Duration shorthand for exercise**: A 4-digit number like "5303" is read as MM:SS (53 minutes 03 seconds)
- **Plant matching by common name**: Set a Common Name on a plant (in Plant Care Info) and the AI will match it by that name. Say "I trimmed the Japanese Maple" and it will find a plant named "Acer palmatum" with common name "Japanese Maple". Without a common name, the AI matches on the formal name and zone location.

---

## screen:zones

### Quick Help
- The Yard home page — shows all your top-level yard zones (Front Yard, Back Yard, etc.)
- Tap any zone card to drill in and see its plants and sub-zones (up to 3 levels deep)
- Add zones with **+ Add Zone**; edit or delete with the pencil icon on a card
- **Shortcut:** Use **⚡ QuickLog** on the main screen to log activities without navigating here — just say "I sprayed the front yard"

### Details

**What is a zone?** A zone is a named area of your yard, organized in up to 3 levels:
- Level 1: Major zone (e.g., Front Yard, Back Yard, Creek, Woods)
- Level 2: Sub-zone (e.g., By Mailbox, Behind Garage)
- Level 3: Detail zone (e.g., Left Flower Bed)

**Common tasks:**
- **Add a zone:** Tap **+ Add Zone** and enter the name
- **Open a zone:** Tap any zone card to drill into it and see its plants and sub-zones
- **Edit or delete a zone:** Tap the pencil icon on a zone card
- **Navigate back:** Use the breadcrumb bar at the top to jump to any ancestor level

**Tips:**
- You cannot delete a zone that has sub-zones or plants still inside it. Move or remove those first.
- Plants can be assigned to any zone level — you don't need to go three levels deep if two is enough.

### See Also
- [Zone Detail](#help/zone)
- [Plant Detail](#help/plant)
- [Calendar Events](#help/calendar)

---

## screen:zone

### Quick Help
- Detail page for one zone — shows its plants, sub-zones, and all tracking data in collapsible accordions
- Tap any section header (Photos, Facts, Problems, Tasks, Activities) to expand or collapse it
- **Add here** for zone-wide events (sprayed the whole yard); **drill into a sub-zone or plant** for targeted tracking
- Quick Tasks shows **this zone's tasks first**, then a "From Sub-zones" divider, then tasks from sub-zones — each rollup item labeled "from: [source]"
- **Shortcut:** Tap **⚡ QuickLog** on the main screen instead of navigating here — say "I watered the back yard"

### Details

**Accordion sections:** Each tracking section is collapsible — tap the header to expand or collapse. They start collapsed to keep the page clean. Expand only what you need.

**Where to add things — zone level vs. going deeper:**
- **Log at zone level** when something applies to the whole zone — e.g., you sprayed the entire front yard, or you want a photo of the zone overview.
- **Navigate into a sub-zone or plant** when you want to track something specific — e.g., one particular azalea is struggling, or you only watered the left flower bed.
- Either approach is valid. Log at whatever level matches how you think about your yard.

**Rollup from children:** The Problems and Quick Tasks sections aggregate data from THIS zone AND everything beneath it — all sub-zones and all plants inside them. Each rolled-up item is labeled "from: [source name]" so you always know where it came from. For Quick Tasks, this zone's own tasks appear first; sub-zone rollup tasks appear below a "From Sub-zones" divider. This lets you see all tasks across a zone hierarchy at a glance without losing track of what belongs directly to this zone.

**Note:** The Activities section shows only activities logged directly at this zone level. It does not pull in activities from sub-zones or plants. For a cross-zone view of all activity, use the Activity Report (History in the nav bar).

**Common tasks:**
- **Add a plant:** Tap **+ Add Plant** to create a new plant record in this zone
- **View a plant:** Tap any plant card to open its detail page
- **View All Plants:** Shows every plant in this zone AND all sub-zones below it in a flat list — tap any to go straight to its detail page
- **Log a zone-wide activity:** Tap **Log Activity** and fill in what was done, when, chemicals used, and notes
- **Add a sub-zone:** Tap **+ Add Sub-Zone** to nest another level (max 3 levels deep)

**What each accordion holds:**
- **Photos** — Reference photos of this zone (before/after, seasonal shots, overview)
- **Facts** — Key-value notes (e.g., "Square Footage = 200 sq ft", "Soil Type = Clay", "Irrigation = Drip")
- **Problems** — Open issues for this zone plus all rolled-up problems from sub-zones and plants beneath it
- **Quick Tasks** — This zone's own tasks first, then (if "Include sub-zones" is checked) a divider and sub-zone rollup tasks below
- **Calendar Events** — Scheduled events linked to this zone
- **Activities** — Only activities logged directly at this zone level

**Tips:**
- The breadcrumb bar (e.g., Front Yard > By Mailbox) shows your position in the hierarchy. Tap any crumb to jump back.
- Resolving a problem auto-creates an activity: "Resolved: [description]" — keeps the history clean.
- You can also reach this zone from a plant's Edit screen — the zone picker links back up the hierarchy.

### See Also
- [Zones — Yard Home](#help/zones)
- [Plant Detail](#help/plant)
- [Yard Problems](#help/yard-problems)
- [Yard Quick Tasks](#help/yard-projects)

---

## screen:plant

### Quick Help
- Detail page for one specific plant — health status, care metadata, and full history
- Set health status (🟢 Healthy / 🟡 Struggling / 🔵 Dormant / 🔴 Dead) from the dropdown — saves instantly, no button needed
- Tap **Log Activity** to record what you did; all sections (Photos, Facts, Problems, Tasks, Activities) are collapsible accordions
- **Shortcut:** Tap **⚡ QuickLog** on the main screen and say "I pruned the big azalea" — no navigation needed

### Details

**Key concept — plants are individual instances:** Each physical plant is its own separate record. Three azalea bushes = three plant records, each with its own photos, activities, and history. This lets you track which specific plant is struggling, when each one was last treated, and so on.

**Accordion sections:** Each tracking section is collapsible — tap the header to expand or collapse. Sections start collapsed. Expand only what you need.

**Health status:** The colored dropdown at the top of the page. Tap and pick a status — it saves the moment you select, no Save button.
- 🟢 Healthy — thriving normally
- 🟡 Struggling — needs attention
- 🔵 Dormant — seasonally inactive (not dead)
- 🔴 Dead — no longer alive

The health indicator also appears on the plant card in the zone view, so you can spot struggling plants at a glance without opening each one.

**Common Name:** The first field in the Plant Care Info section. This is the informal, everyday name you use for the plant — set it so AI QuickLog commands like "I trimmed the Japanese Maple" can match the plant even if its formal name is "Acer palmatum". When set, the common name appears as the plant's title on zone screens and the detail page header; the formal name shows as a small subtitle. Leave blank and everything works exactly as before.

**Metadata tab:** Tap **Edit** to record care preferences:
- **Common Name** — informal/everyday name for AI matching (optional)
- Heat/cold tolerance, watering needs, sun/shade preference
- Bloom months, dormancy months
- Free-form notes about this plant

**Common tasks:**
- **Log an activity:** Tap **Log Activity** — record watering, fertilizing, pruning, spraying, etc. Optionally pick chemicals used and add notes. Pick a Saved Action to pre-fill the form.
- **Add a photo:** Expand the Photos section → **+ Add Photo** (camera, gallery, or clipboard paste)
- **Move to a different zone:** Tap **Edit** → change the zone picker — the plant and all its history moves with it
- **Clone this plant:** Tap **Clone** — copies the name, zone, and metadata to a new record. Photos and activities are NOT copied.
- **AI Plant ID:** On the zone page (not this page), tap **+ Photo** to photograph an unknown plant and have the AI identify it and create the record automatically.

**What each accordion holds:**
- **Photos** — Plant photos; the first one uploaded auto-becomes the card thumbnail visible on the zone page
- **Facts** — Key-value notes (e.g., "Planted = April 2022", "Source = Home Depot", "Bloom Color = Pink")
- **Problems** — Issues for this plant only (pest damage, disease, etc.) with open/resolved tracking. Resolving auto-creates an activity.
- **Quick Tasks** — To-do items just for this plant with optional checklists
- **Calendar Events** — Scheduled care events tied to this specific plant
- **Activities** — Full chronological history of everything logged for this plant, newest first

**Tips:**
- Plants are leaf nodes — Problems and Tasks here show only this plant's own data. There is no rollup from children (plants have no children).
- The Activities section on the plant only shows what was logged directly to this plant. Zone-level activities are separate.
- Use **Clone** when you're adding a new plant of the same type — it saves re-entering all the metadata.

### See Also
- [Zone Detail](#help/zone)
- [Saved Actions](#help/actions)
- [Activity Report](#help/activityreport)

---

## screen:weeds

**What this screen is for:** Tracks weed types found in your yard. Each entry represents a type of weed — not an individual plant.

**Key concept — weeds by type:** You track "Wild Onions" as one entry covering all the wild onions in your yard — not each individual plant. The entry records how to treat it, when to treat it, and which zones it appears in.

**Common tasks:**
- **Add a weed type:** Tap **+ Add Weed** and fill in the name, treatment method, and timing
- **Open a weed:** Tap any weed card to see its detail page with photos and activity history
- **AI Weed ID:** Tap **+ Photo** to photograph an unknown weed. The AI identifies it, suggests treatment, and pre-fills the form. If it matches an existing weed in your collection, it will alert you instead of creating a duplicate.

**Tips:**
- The "Application Timing" field feeds into the calendar view — use it to set seasonal reminders (e.g., "Pre-spring", "Fall", "As needed").
- You can link a weed to multiple zones to track which parts of the yard are affected.

### See Also
- [Weed Detail](#help/weed)
- [Chemicals & Products](#help/chemicals)
- [Calendar Events](#help/calendar)

---

## screen:weed

**What this screen is for:** Detail view for a single weed type — treatment info, affected zones, photos, and activity history.

**Fields:**
- **Treatment Method** — How you treat it (pulling, specific herbicide name, etc.)
- **Application Timing** — When to apply (Pre-spring, Spring, Fall, As-needed, etc.)
- **Zones** — Which zones have this weed (multi-select checkboxes)
- **Notes** — Free-form notes about this weed

**Common tasks:**
- **Log a treatment:** Tap **Log Activity** to record when and how you treated this weed
- **Update zones:** Tap **Edit** and check/uncheck zones as the weed spreads or is eliminated
- **Add photos:** Attach reference photos for identification

### See Also
- [Weeds](#help/weeds)
- [Chemicals & Products](#help/chemicals)

---

## screen:chemicals

**What this screen is for:** Your list of chemicals and products used in the yard (herbicides, fertilizers, pesticides, fungicides, etc.).

**Why this list exists:** When logging an activity, you can select which products were used. The chemicals list is where you manage that catalog.

**Common tasks:**
- **Add a chemical:** Tap **+ Add Chemical** and enter the name and any notes
- **Scan a barcode:** Tap **Scan Barcode** on a chemical — scans the bottle's barcode and looks up product info automatically
- **AI label scan:** Open a chemical → tap **Scan Label** (in edit mode) → photograph the bottle label. The AI extracts mixing ratios, application methods, active ingredients, and safety info and saves them as facts.
- **View usage history:** Open a chemical to see every activity that used it, across all plants, zones, and weeds

### See Also
- [Chemical Detail](#help/chemical)
- [Saved Actions](#help/actions)
- [Activity Report](#help/activityreport)

---

## screen:chemical

**What this screen is for:** Detail view for a single chemical/product — its facts (label info) and full usage history.

**Common tasks:**
- **Edit name or notes:** Tap **Edit**
- **Add a fact manually:** Scroll to Facts → **+ Add Fact** (e.g., "Active Ingredient = Triclopyr")
- **Scan the label:** In edit mode, tap **Scan Label** → photograph the bottle — AI extracts facts automatically
- **View where this was used:** The Usage History section shows every activity that included this product

**Tips:**
- Facts extracted by AI scan include: active ingredients, mixing ratio, reentry interval, application method, safety info.
- The barcode URL is saved as a fact for reference.

### See Also
- [Chemicals & Products](#help/chemicals)
- [Saved Actions](#help/actions)

---

## screen:actions

**What this screen is for:** Saved Actions are reusable activity templates. Instead of retyping the same activity details every time, you save it once and pick it from a list.

**Example:** You spray for weeds in the front yard every spring with the same herbicide. Create a Saved Action called "Front Yard Weed Spray" with the description, chemical, and notes pre-filled. Next time you log the activity, just pick that action.

**Common tasks:**
- **Create a saved action:** Tap **+ Add Action** and fill in the name, description, chemicals, and notes
- **Edit or delete:** Tap the pencil icon on any saved action card
- **Use a saved action:** When logging a new activity on any screen, tap the **Saved Action** dropdown and pick one — it pre-fills the form

**Tips:**
- You can also create a saved action directly from an activity you just logged: open the activity → tap **Save as Action**.
- Saved actions can include multiple chemicals (useful for combination treatments).

### See Also
- [Chemicals & Products](#help/chemicals)
- [Plant Detail](#help/plant)
- [Zone Detail](#help/zone)

---

## screen:calendar

**What this screen is for:** Scheduled events for the yard — one-time tasks and recurring maintenance reminders.

**Event types:**
- **One-time** — A specific date (e.g., "Fertilize roses — May 15")
- **Recurring** — Repeats weekly, monthly, or every X days (e.g., "Check irrigation — every 7 days")

**Common tasks:**
- **Add an event:** Tap **+ Add Event** — set title, description, date, and whether it recurs
- **Complete an event:** Tap **✓ Complete** on any event card — this automatically creates an activity record for any linked zones
- **Edit an event:** Tap **Edit** on the card
- **Copy an event:** Tap **Copy** — creates a new one-time event pre-filled with the same title and description (date is cleared for you to set a new one)
- **Add to Google Calendar:** Tap **+ GCal** on any event card to open a pre-filled Google Calendar "new event" page in a new tab. No sign-in to the app required — this is a direct deep link. The button only appears when Google Calendar sync is not connected.
- **Auto-sync (when connected):** If Google Calendar is connected in Settings, events are pushed to your Google Calendar automatically when you create, edit, complete, cancel, reschedule, or delete them — no button tap required. Recurring events sync as individual all-day events within a 12-month window (10 years for yearly events). Completed occurrences show a ✓ prefix in Google Calendar; cancelled occurrences are removed from Google Calendar.
- **Delete a recurring event:** You'll be asked whether to delete just this occurrence or all future occurrences

**Display range:** Use the dropdown at the top to show 1, 3 (default), 6, or 12 months ahead.

**Overdue section:** Events with past-due uncompleted occurrences appear in an "Overdue" section at the top. You can complete them (logs the activity) or reschedule to a new date.

**Linking events to zones:** When adding an event, you can link it to one or more zones. Completing that event creates an activity for each linked zone.

**Tips:**
- Recurring events use the original date as the anchor — completions and cancellations are tracked per-occurrence without changing the series.
- Delete "this occurrence only" adds the date to a cancelled list — the series continues.

### See Also
- [Zone Detail](#help/zone)
- [Activity Report](#help/activityreport)
- [Saved Actions](#help/actions)

---

## screen:activityreport

**What this screen is for:** A chronological history of all logged activities across the entire yard — plants, zones, and weeds.

**Common tasks:**
- **Browse history:** Scroll through all activities, newest first
- **Filter by date range:** Use the From/To date pickers to narrow the view
- **Filter by type:** Filter to see only Plant activities, Zone activities, or Weed activities

**Each entry shows:**
- Date of the activity
- What was done (description)
- What it was done to (plant name, zone name, or weed name)
- Chemicals used (if any)
- Notes

### See Also
- [Zone Detail](#help/zone)
- [Plant Detail](#help/plant)
- [Saved Actions](#help/actions)

---

## screen:gpsmap

**What this screen is for:** Shows a map view for a zone based on its GPS coordinates.

**Usage:** If a zone has GPS coordinates saved, this page displays that location on an interactive map. Useful for referencing the physical location of a zone.

---

## screen:yardmap

**What this screen is for:** An interactive map of your entire yard where you can mark zone boundaries and locations.

**Usage:** Draw or mark areas on the map to correspond to your yard zones. Helpful for visualizing the layout of your yard.

---

## screen:yard-problems

**What this screen is for:** A rolled-up view of all open problems across every zone and plant in the yard.

**Common tasks:**
- **View all open issues:** See every open problem in one list, labeled with where it came from (e.g., "from: Front Yard Azalea")
- **Open a problem:** Tap any problem to view or edit it
- **Navigate to source:** Each problem shows which zone or plant it belongs to

**Tips:**
- To add a new problem, go to the specific zone or plant and use its Problems section.
- Resolving a problem on a plant or zone auto-creates an activity: "Resolved: {description}".

### See Also
- [Zone Detail](#help/zone)
- [Plant Detail](#help/plant)

---

## screen:yard-projects

**What this screen is for:** A rolled-up view of all quick tasks across every zone and plant in the yard.

**Common tasks:**
- **View all tasks:** See every task in one list, labeled with its source (zone or plant name)
- **Check off items:** Tap checklist items to mark them complete
- **Complete a task:** Tap **Complete** on a task card

**Tips:**
- To add a new task, go to the specific zone or plant and use its Quick Tasks section.
- Completed tasks are hidden by default. Show them with the "Show Completed" toggle.

### See Also
- [Zone Detail](#help/zone)
- [Plant Detail](#help/plant)

---

## concept:activities

**What activities are:** An activity is a logged event — a record of something you did and when. Examples: watered the roses, sprayed for weeds, pruned the hydrangeas, fertilized the lawn.

**Where to log activities:** On any zone, plant, or weed detail page, tap **Log Activity**. Activities can also be logged from journal entries, life events, and other entity types.

**Activity fields:**
- **Description** — What was done (required)
- **Date** — When it was done (defaults to today)
- **Notes** — Free-form notes about the activity
- **Use Saved Action** — Pick a reusable template to pre-fill description, product, and notes (see below)
- **Product** — One or more products/chemicals used (selected from your Chemicals list; not shown for all entity types)
- **Amount Used** — Appears when a product is selected; record how much you used

**Saved Actions:** The **Use Saved Action** dropdown lets you pick a pre-configured template. Selecting one fills in the description, product, and notes automatically — useful for activities you repeat often (e.g., "Spray front beds with Roundup"). You can still edit the pre-filled values before saving.

**Viewing history:** Activities appear newest-first in the Activities section of each zone, plant, or weed. The Activity Report shows all activities across the entire yard.

---

## concept:photos

**What photos are:** Photos can be attached to plants, zones, weeds, chemicals, rooms, vehicles, and more.

**How to add a photo:**
1. Go to the Photos section on any entity's detail page
2. Tap **+ Add Photo**
3. Choose: Camera (take a new photo), Gallery (pick from device), or Paste (from clipboard)
4. Crop the photo if desired, then save

**Viewing photos:**
- Navigate with **Newer** / **Older** buttons
- Tap a photo to view it full-screen
- In full-screen: pinch to zoom, drag to pan when zoomed, long-press (hold for 600ms) to download
- Edit a caption by tapping the caption area
- Delete with the trash icon

**Tips:**
- The first photo you add to a plant, weed, person, or vehicle automatically becomes the profile thumbnail.
- Photos are compressed automatically (targets ~150KB each) to keep storage manageable.
- Up to 4 photos can be submitted at once for AI identification flows (plant ID, weed ID, bottle scan).

---

## concept:facts

**What facts are:** Facts are label/value pairs attached to any entity. Use them to store structured notes that don't fit elsewhere.

**Examples:**
- Label: "Bloom Season" / Value: "April–June"
- Label: "Sun Preference" / Value: "Full Sun"
- Label: "Square Footage" / Value: "200 sq ft"
- Label: "Planted" / Value: "Spring 2021"
- Label: "Mixing Ratio" / Value: "2 oz per gallon"
- Label: "Product URL" / Value: "https://example.com/product"

**How to add facts:** Scroll to the Facts section on any detail page → tap **+ Add Fact** → enter label and value.

**Tips:**
- Facts are sorted alphabetically by label.
- Values that start with `http://` or `https://` become clickable links that open in a new tab.
- Facts on chemicals are often extracted automatically by the AI bottle scan feature.

---

## concept:problems

**What problems are:** Problems (also called concerns) track open issues on plants, zones, rooms, vehicles, or any entity. Examples: pest damage, disease, drainage issues, broken irrigation, structural damage.

**How to add a problem:** Go to the Problems section on any detail page → tap **+ Add Problem** → enter a description and optional notes.

**Status lifecycle:**
- **Open** — Active issue being tracked
- **Resolved** — Closed. When you resolve a problem on a plant or zone, an activity is automatically created: "Resolved: {description}"

**Viewing problems:**
- Open problems are always visible
- Resolved problems are hidden by default — use the "Show Resolved" toggle to see them
- The Yard Problems page shows all open problems across all zones and plants in one list

---

## concept:quicktasks

**What quick tasks are:** Quick Tasks (also called Projects) are to-do items attached to a plant, zone, room, vehicle, or any entity. They can have a checklist of sub-items.

**Examples:**
- "Install drip irrigation" with items: buy tubing, lay lines, test
- "Replace dead azalea" with items: remove old plant, amend soil, plant new
- "Level the front yard" (no checklist needed)

**How to add a task:** Go to the Quick Tasks section on any detail page → tap **+ Add Task** → enter title and optional notes. Add checklist items by typing in the item field and pressing Enter or tapping Add. You can also use **⚡ QuickLog** — say "Add a task to the back yard — trim the hedges" and it will create the task for you.

**Using tasks:**
- Check off individual items — each records a completion timestamp
- Tap **Complete** to close the entire task (records a completion date)
- Tap **Reopen** to reactivate a completed task
- Add notes to individual checklist items with the Notes button

**Tips:**
- Active tasks appear first; completed tasks are hidden by default.
- The Yard Projects page shows all tasks across all zones and plants in one list.
- Sub-zone tasks appear on a parent zone's page with a "from: Sub-zone Name" label.

---

## screen:settings

**What this screen is for:** App settings — including configuring the AI assistant (Ask AI) used in the Help screen and throughout the app.

### AI Assistant (Ask AI) Setup

The **Ask AI** button on every Help screen lets you ask questions about the app in plain language. To use it, you need to connect an AI provider in Settings.

**How to configure:**
1. Open **Settings** from the main screen (gear icon or nav bar)
2. Scroll to the **AI / LLM** section
3. Choose a provider: **OpenAI** or **Grok (xAI)**
4. Paste your API key
5. Optionally set a specific model (or leave blank to use the default)
6. Tap **Save**

**Supported providers:**
- **OpenAI** — uses `gpt-4o` by default. Get a key at [platform.openai.com](https://platform.openai.com)
- **Grok (xAI)** — uses `grok-3` by default. Get a key at [console.x.ai](https://console.x.ai)

**Your API key is stored securely** in your personal Firestore data — it is never shared or sent anywhere except directly to the provider you choose.

**Tips:**
- Once configured, Ask AI works across Help screens AND the SecondBrain / QuickLog AI features.
- If you see an error like "LLM not configured", come back to Settings and verify your key is saved correctly.
- You can switch providers or update your key at any time.

### Google Calendar Sync

Sync your Yard and Life Calendar events to Google Calendar so you get reminders on your phone.

**Two modes — no setup required for the basic one:**
- **No Client ID configured:** An "Add to Google Calendar" button appears on every Yard and Life Calendar event card. Clicking it opens Google Calendar pre-filled with that event. You save it manually and Google handles reminders from there.
- **Client ID configured + connected:** Events sync automatically to a dedicated calendar in Google Calendar whenever you create, edit, or delete them. No manual steps needed.

**Setting up full sync (one-time):**
1. Tap **Help** in the Google Calendar section for the step-by-step walkthrough. **Important:** You already have a Google Cloud project — it's the same one Bishop uses for Firestore. When you go to console.cloud.google.com you'll land right in it. Skip the "create a new project" step.
2. Paste your **Client ID** into the field and tap **Save**.
3. Enter a **Calendar Name** (default: "Bishop") — Bishop will create a dedicated calendar in Google with this name.
4. Set a **Default Reminder** (default: 1 day before).
5. Tap **Connect to Google** and approve the Google consent screen.
6. If you have upcoming events not yet synced, you'll be asked whether to sync them now. If you previously added them manually via "Add to Google Calendar" links, say No to avoid duplicates — you can always run Sync All later.

**Once connected:**
- Events you create or edit in the Yard or Life Calendar automatically appear in your Google Calendar with a reminder.
- Deleting an event in Bishop also removes it from Google Calendar.
- **Sync All Events** — re-pushes all upcoming events from both calendars if anything gets out of sync. Shows a count of events synced when done.
- **Recreate Calendar** — use this if you accidentally deleted the Bishop calendar from Google. It re-creates it and re-syncs everything.
- **Disconnect** — pauses auto-sync without removing anything from Google Calendar. Reconnecting resumes where you left off.

**Note:** If you previously used the "Add to Google Calendar" links to add events manually and then connect the full sync, running Sync All may create duplicates. Delete the duplicates directly in Google Calendar.

### Private Storage Setup

The **Private Storage** accordion in General Settings activates an encrypted personal vault — visible as a **Private** tile on the Life screen once activated.

**What it protects:** Bookmarks, documents, and photos that you never want anyone else to access — not even someone with your app login or direct access to Firestore.

**How it works:** All data is encrypted in your browser using your passphrase before anything leaves your device. The passphrase is never stored anywhere. Without it, the data is permanently unreadable.

**Three steps to activate:**

**Step 1 — Upgrade to Blaze Plan** (one-time, required for Storage):
Firebase Storage is not available on the free Spark plan. The Blaze (pay-as-you-go) plan is required, but it's still effectively free for personal use — you get 5 GB storage and 1 GB/day downloads before any charges apply. Firebase just requires a credit card on file to unlock Storage.
1. Go to console.firebase.google.com and select your project
2. Click the **Spark** badge in the bottom-left corner
3. Click **Upgrade**, select **Blaze**, add a payment method, and confirm

**Step 2 — Enable Firebase Storage** (one-time, in the Firebase console):
1. Click **View Setup Instructions** in this app for the full walkthrough
2. In the Firebase console, click **Storage** in the left nav → **Get Started** → leave "No cost location" selected, pick **US-CENTRAL1** → **Continue** → choose **Start in production mode** → **Create**
3. Paste in the security rules shown in the instructions and click **Publish**

**Step 3 — Activate Private Data:**
1. Click **Activate Private Data**
2. Enter a passphrase and confirm it (must be more than 3 characters)
3. The app tests Firebase Storage, then encrypts a verification token
4. On success: a green **Active** badge appears and the Private tile becomes visible on Life

**Important warnings:**
- Your passphrase is **never stored** and **cannot be recovered**. If you forget it, all private data is permanently inaccessible.
- Do not reuse your app login password as your private passphrase — they serve different purposes.
- The vault auto-locks after 60 minutes of inactivity. Any activity anywhere in the app resets the timer.

---

## screen:firebase-setup

**What this screen is for:** Setting up your own private Firebase project so your data is stored in your own database — not the shared default. Also used for first-time account creation and locking down your Firebase to prevent others from signing up.

### First-Time Setup Flow

New users follow these steps from the login screen:

1. On the login screen, tap **🔥 Set Up My Own Account**
2. Follow the 6-step guide to create a free Firebase project:
   - Create a project at `console.firebase.google.com`
   - Enable Firestore (production mode)
   - Set security rules (auth-gated read/write)
   - Enable Email/Password authentication
   - Get your web app config block
3. Paste the config and tap **Validate & Save** — the app reloads pointing to your Firebase
4. A **Create Account** section appears on the login screen — enter your email and password
5. After sign-in, a one-time prompt shows instructions to disable new sign-ups

### Create Account

The Create Account section only appears on the login screen when you have saved your own Firebase config. Fill in email, password, and confirm password, then tap **Create Account**.

### Lock Down — Disable New Sign-Ups

After creating your account, disable new sign-ups so no one else can register on your project:

1. Go to `console.firebase.google.com` and select your project
2. In the left sidebar click **Build → Authentication**
3. Click the **Settings** tab (not the Users tab)
4. Under **"User actions"**, uncheck **"Enable create (sign-up)"**
5. Click **Save**

Your existing account and password reset still work after this.

---

## screen:house

### Quick Help
- The House home page -- shows all your floors, open problems, quick tasks, and upcoming calendar events
- Tap any floor card to drill in and see its rooms
- **Open Problems** and **All Quick Tasks** cards roll up issues and to-dos from every floor, room, thing, and sub-thing across the whole house
- Access Garage, Vehicles, and Collections from the **More** section at the bottom

### Details

**What the House section tracks:** The interior of your home, organized as a 4-level hierarchy: Floor -> Room -> Thing -> Sub-Thing -> Item. Each level can have photos, facts, problems, quick tasks, activities, and calendar events.

**Stats bar at the top:** Shows a count of upcoming calendar events as a clickable chip -- tapping it opens the House Calendar Events page, which shows events linked to any house entity.

**Open Problems card:** Shows the count of all open problems across the entire house. Clicking it navigates to the House Problems page -- a full rolled-up list of every open problem from every floor, room, thing, and sub-thing, each labeled with its location path (e.g., "1st Floor > Kitchen > Dishwasher").

**All Quick Tasks card:** Shows all active quick tasks across the house in one list, each labeled with its source entity.

**Floors section:** Each floor appears as a clickable card. Tap to open the floor detail page.
- **Add a floor:** Tap **+ Add Floor** and enter the floor name and optional floor number
- **Edit or delete a floor:** Use the pencil icon on the floor card

**More section:** Contains:
- **Checklists** -- count of active checklist runs for house/floor/room entities; navigates to the checklists page
- **Garage** -- navigates to the Garage section
- **Vehicles** -- navigates to the Vehicles section
- **Collections** -- navigates to the Collections section
- **Who Gets What** -- opens the beneficiary summary page where you can pick a contact and see everything assigned to them across House, Garage, Structures, and Collections

**Upcoming calendar events rollup:** Shows the next few scheduled events linked to any house entity, so you can see what is coming up without drilling into individual rooms.

**Breaker Panels section:** If you have breaker/electrical panels recorded, they appear here.

**Tips:**
- Use the Open Problems card as your daily "what needs attention" view -- it aggregates everything without drilling into each room.
- Garage, Vehicles, and Collections are accessed through the More section, not the main nav.
- The hierarchy is Floor > Room > Thing > Sub-Thing > Item. You do not have to use all levels -- a simple house might just be Floors and Rooms.

### See Also
- [Floor Detail](#help/floor)
- [House Problems](#help/house-problems)
- [House Quick Tasks](#help/house-projects)

---

## screen:floor

### Quick Help
- Detail page for one floor -- shows its rooms and all tracking data in collapsible accordions
- Tap any room card to drill into that room
- **View Floor Plan** opens the interactive SVG floor plan for this floor
- Problems and Quick Tasks roll up from all rooms, things, and sub-things below -- each item labeled "from: [source]"

### Details

**What a floor is:** The top level of the house hierarchy. A floor contains rooms. Everything in those rooms (problems, tasks, activities) rolls up to the floor level for easy review.

**Accordion sections:** Each tracking section is collapsible. Tap the header to expand or collapse. Rooms and Calendar Events start expanded; all others start collapsed. Each header shows an item count badge (e.g. "Photos (3)") that loads after the section opens.

**Rooms accordion:** Lists all rooms on this floor as cards. Tap any room card to open its detail page.
- **Add a room:** Tap **+ Add Room** and enter the name. You can link it to a shape on the floor plan later.
- **Edit or delete a room:** Use the pencil icon on the room card.
- **Stairs rooms:** A special room type that connects two floors. Appears with a hatch pattern on the floor plan.

**Floor Plan button:** Shows "View Floor Plan" if a plan exists, or "Add Floor Plan" if not. Opens the interactive SVG drawing tool where you can draw rooms, add doors, windows, fixtures, electrical plates, and plumbing.

**Problems accordion:** Shows all open problems for THIS floor plus rolled-up problems from all rooms, things, and sub-things beneath it. Each rolled-up item is labeled "from: [source name]". Resolving a problem auto-creates an activity.

**Quick Tasks accordion:** Same rollup pattern -- tasks from this floor plus all children.

**Facts accordion:** Key-value pairs for this floor (e.g., "Square Footage = 1,200 sq ft", "Ceiling Height = 9 ft").

**Activities accordion:** Activities logged directly at the floor level only (not rolled up from rooms).

**Photos accordion:** Reference photos for this floor.

**Calendar Events accordion:** Scheduled events linked to this floor.

**Tips:**
- The floor plan is the most powerful feature of this level -- drawing rooms links them to their Firestore records, enables dimension calculation, and makes room navigation visual.
- You can log activities at the floor level for things that apply to the whole floor (e.g., "Replaced HVAC filter").
- Problems and Quick Tasks aggregate from children; Activities do not.

### See Also
- [House Home](#help/house)
- [Room Detail](#help/room)
- [Floor Plan](#help/floorplan)

---

## screen:room

### Quick Help
- Detail page for one room -- shows its things (furniture, appliances, fixtures) and all tracking data
- Tap any thing card to open its detail page
- Problems and Quick Tasks roll up from all things and sub-things in this room
- **Floor Plan** button shows this room on the floor plan with its calculated dimensions

### Details

**What a room is:** A named space on a floor. Rooms contain things (appliances, furniture, fixtures). Each room can have photos, facts, problems, tasks, activities, and calendar events.

**Accordion sections:** All sections start collapsed. Each header shows an item count badge.

**Things accordion:** Lists all things in this room.
- **Add a thing manually:** Tap **+ Add Thing** -- enter name, category, optional description and estimated value.
- **Add a thing via AI photo:** Tap **+ Photo** -- photograph a piece of furniture, appliance, or fixture. The AI identifies it, fills in name, description, and estimated value automatically, and saves it with the photo attached and thumbnail set.
- **Categories:** Furniture, Appliance, Ceiling Fan, Ceiling Light, Electronics, Other. Color-coded badge shown on each thing card.
- **Thumbnail:** The first photo added to a thing auto-sets its profile thumbnail, visible on the room thing list.

**Floor Plan section:** If this room is drawn on the floor plan, a "View in Floor Plan" button appears. Room dimensions (e.g., "12 x 14 ft, 168 sq ft") are calculated from the polygon shape.

**Problems accordion:** Rolled-up problems from this room AND all things and sub-things inside it.

**Quick Tasks accordion:** Same rollup -- tasks from this room and all things/sub-things.

**Facts accordion:** Key-value notes for the room (e.g., "Paint Color = SW Alabaster", "Flooring = Engineered Hardwood", "Square Footage = 168 sq ft").

**Activities accordion:** Activities logged directly at the room level.

**Photos accordion:** Reference photos of the room (before/after renovations, overview shots).

**Calendar Events accordion:** Scheduled events linked to this room.

**Tips:**
- Use the AI photo identification to add things quickly -- photograph a couch, TV, or refrigerator and it fills in the details.
- Facts are great for paint colors, flooring types, and dimensions -- any reference info you would want to look up later.
- The first photo added to a thing auto-sets its thumbnail. To change it, open the thing, go to Photos, and use the "Use as Profile" button on the desired photo.

### See Also
- [Floor Detail](#help/floor)
- [Thing Detail](#help/thing)
- [Floor Plan](#help/floorplan)

---

## screen:thing

### Quick Help
- Detail page for a single item in a room (appliance, furniture, fixture, electronics, etc.)
- Things can have sub-things (drawers in a dresser, shelves in a bookcase, compartments in a cabinet)
- All sections are collapsible accordions -- expand only what you need
- AI photo ID available from the room page -- photograph a new item and it creates the record automatically

### Details

**What a thing is:** A significant item in a room -- a refrigerator, couch, ceiling fan, TV, dresser, etc. Things have a category, optional description, estimated value, and full tracking (photos, facts, problems, tasks, activities, calendar events).

**Categories:**
- **Furniture** -- sofas, beds, chairs, tables, dressers, bookshelves
- **Appliance** -- refrigerator, washer/dryer, dishwasher, oven, HVAC units
- **Ceiling Fan** -- ceiling fans (may also appear on the floor plan)
- **Ceiling Light** -- light fixtures (may also appear on the floor plan)
- **Electronics** -- TVs, computers, speakers, gaming systems
- **Other** -- anything that does not fit the above

**Thumbnail:** Profile photo shown on the room thing list card. Auto-set from the first photo you add. To change it, go to Photos and tap "Use as Profile" on any photo.

**Value field:** Estimated dollar value. Optional -- useful for insurance documentation or home inventory.

**Sub-Things accordion:** Things can contain sub-things -- drawers in a dresser, shelves in a bookcase, compartments in a cabinet.
- **Add a sub-thing:** Tap **+ Add Sub-Thing**
- **AI photo:** Same identification flow as things -- photograph the sub-thing and it auto-fills the record

**Problems accordion:** Problems for this thing only (sub-things are beneath this level and their problems roll up here).

**Quick Tasks accordion:** Tasks for this thing, plus rolled-up tasks from sub-things.

**Facts accordion:** Key-value notes. Most useful facts for things:
- Model number and serial number
- Purchase date and purchase price
- Warranty expiration and warranty contact
- Service contact (plumber, electrician, repair shop, phone number)
- Manufacturer website or product URL
- Installation date

**Activities accordion:** Maintenance history (e.g., "Cleaned refrigerator coils", "Replaced HVAC filter", "Serviced by technician -- notes in facts").

**Photos accordion:** Photos of this thing. First photo auto-sets profile thumbnail.

**Calendar Events accordion:** Scheduled maintenance (e.g., "Replace water filter -- every 6 months", "Annual HVAC service -- every October").

**Tips:**
- Facts are the most practical section for things -- serial numbers, model numbers, purchase dates, and warranty info. If you ever need to call for service or file a warranty claim, it is all in one place.
- Use Activities to log maintenance with dates. You will always know when a filter was last changed, when an appliance was last serviced, and who did the work.
- Sub-things are optional. A simple refrigerator does not need sub-things. A multi-drawer dresser where you track what is in each drawer benefits from them.
- The AI photo identification from the room page can identify most common appliances and furniture. If the AI cannot identify the item, it alerts you and does not save the record -- you can then add it manually.

### See Also
- [Room Detail](#help/room)
- [Sub-Thing Detail](#help/subthing)

---

## screen:subthing

### Quick Help
- Detail page for a sub-thing -- a compartment, drawer, shelf, or section inside a Thing
- Sub-things can contain individual Items (the deepest tracking level in the house hierarchy)
- Use tags to group or categorize sub-things (e.g., "seasonal", "office supplies", "tools")

### Details

**What a sub-thing is:** A subdivision of a thing. Examples: a drawer in a dresser, a shelf in a bookcase, a compartment in a cabinet, a section of a storage unit. Sub-things let you track what is inside large storage items with more precision.

**Tags:** Optional free-form labels for grouping. Multiple tags can be applied to one sub-thing. Tags help you remember the purpose of a sub-thing at a glance and mentally group related sub-things across different rooms (e.g., all sub-things tagged "seasonal" across multiple closets).

**Thumbnail:** Same pattern as things -- first photo auto-sets the thumbnail; "Use as Profile" to override.

**Value field:** Optional estimated value of the contents.

**Items accordion:** The deepest level -- individual named items stored in this sub-thing.
- **Add an item:** Tap **+ Add Item**
- **AI photo:** Same identification flow -- photograph the item and it fills in name, description, and estimated value
- Examples: "Christmas ornaments", "Cordless drill", "Winter scarves", "Spare HDMI cables"

**Problems, Facts, Quick Tasks, Activities, Photos, Calendar Events:** Same collapsible accordion pattern as all other house entities.

**Tips:**
- Items inside a sub-thing are the finest tracking granularity in the house section. Use this for inventories: tools in a drawer, clothes in a storage bin, collectibles in a box.
- Tags on sub-things let you find related sub-things across rooms. Tag all seasonal storage "seasonal" so you can mentally group them at the start of each season.
- If you are tracking just a few things in a storage area, Facts on the sub-thing may be enough (e.g., "Contains = winter blankets, extra pillows"). Only use Items if you need individual per-item tracking.

### See Also
- [Thing Detail](#help/thing)
- [House Home](#help/house)

---

## screen:house-problems

### Quick Help
- Rolled-up view of every open problem across the entire house in one list
- Each problem shows its full location path (Floor > Room > Thing) so you know exactly where it came from
- Tap any problem card to view or edit it on its source entity

### Details

**What this screen shows:** All open problems from every level of the house hierarchy -- floors, rooms, things, and sub-things -- in a single flat list. No drilling required to find what needs attention.

**Location path label:** Each problem card shows its full location path (e.g., "1st Floor > Kitchen > Dishwasher"). Tap the card to navigate to that entity's detail page where you can edit, add notes, or resolve the problem.

**Resolved problems:** Hidden by default. Use the "Show Resolved" toggle to see them alongside open ones.

**How to add a new problem:** Navigate to the specific floor, room, thing, or sub-thing and use its Problems accordion > **+ Add Problem**. Problems cannot be added directly from this rollup list.

**Resolving a problem:** Open the problem on its entity page and tap **Resolve**. This closes the problem and auto-creates an activity: "Resolved: [description]" -- so the history always shows when the issue was fixed.

**Tips:**
- Check this page periodically as a maintenance dashboard. One scroll shows everything that needs attention across the whole house.
- When resolving a problem, add notes before resolving (e.g., "Called plumber 555-1234, fixed April 2026") -- the auto-created activity carries those notes into the history.
- Problems at different levels can overlap -- a leaking pipe might generate a problem on the sink (thing), the bathroom (room), and the 1st floor -- each tracked separately because the impact may be described differently at each level.

### See Also
- [House Home](#help/house)
- [Floor Detail](#help/floor)
- [Room Detail](#help/room)

---

## screen:house-projects

### Quick Help
- Rolled-up view of every quick task across the entire house in one list
- Each task shows its source (floor, room, or thing name)
- Check off checklist items directly from this view without opening the entity

### Details

**What this screen shows:** All active quick tasks from every level of the house hierarchy -- floors, rooms, things, sub-things -- in a single flat list. Each task card shows the task title and its source entity name.

**Checking off items:** Tap any checklist sub-item to mark it complete. Tap **Complete** on the task card to close the whole task and record a completion date.

**Completed tasks:** Hidden by default. Use the "Show Completed" toggle to see them.

**How to add a new task:** Navigate to the specific floor, room, thing, or sub-thing and use its Quick Tasks accordion > **+ Add Task**. Tasks cannot be added directly from this rollup list.

**Tips:**
- Treat this as your house punch list. Before a weekend of home maintenance, check here to see everything outstanding across all areas at once.
- Tasks with checklists show all sub-items here. You can check them off as you go without navigating into each entity.

### See Also
- [House Home](#help/house)
- [Floor Detail](#help/floor)
- [Room Detail](#help/room)

---

## screen:floorplan

### Quick Help
- Interactive SVG floor plan editor for a single floor -- draw room shapes, add doors, windows, fixtures, electrical, and plumbing
- Opens in **View mode** by default (read-only, all items clickable); tap **Edit** to make changes
- Three modes: **Layout** (rooms/doors/windows/fixtures), **Electrical** (wall plates/ceiling lights/recessed lights), **Plumbing** (pipes/fixtures/stub-outs)
- Tap any item then **Details** to jump to that item's full tracking page (facts, problems, maintenance history)

### Details

**View mode vs. Edit mode:**
- **View mode** (default when a plan exists): all items are clickable and selectable. Dragging is disabled. The tool bar is hidden. Tap any item to see its info in the Properties bar at the bottom. "View Room" or "View Marker" opens a read-only info panel. "Details" navigates to that item's full tracking page.
- **Edit mode** (tap **Edit** in the header): full editing -- drag items, draw rooms, add new items, configure them. The **Save** button appears in the header.
- If no plan exists yet, the page opens directly in Edit mode so you can start drawing.

**Three-row toolbar (Edit mode):**

*Row 1 -- Mode bar:*
- **Layout** -- rooms, doors, windows, layout fixtures (toilet/sink/tub). Default.
- **Electrical** -- wall plates, ceiling fixtures, recessed lights
- **Plumbing** -- plumbing fixtures, spigots, stub-outs
Switching modes clears any selection and resets to Select tool.

*Row 2 -- Tool bar (changes by mode):*
- Layout: Select, Room (draw), Type (set dimensions), Door, Window, Fixtures flyout (Toilet / Sink / Tub/Shower)
- Electrical: Select, Plate (wall plate), Ceiling (ceiling fixture), Recessed (recessed light), Dim toggle
- Plumbing: Select, Spigot, Stub-out, Dim toggle

*Row 3 -- Properties bar (appears when an item is selected):*
- Edit mode (non-room items): **Edit Marker**, **Remove**, **Details**
- View mode (non-room items): **View Marker** (read-only), **Details**
- Rooms: **Edit Room** / **View Room** (no Remove, no Details)
- Fixtures: **Rotate** button cycles orientation 0/90/180/270 degrees

**Drawing rooms:**
- Select Room tool. Click corner points to trace the perimeter (rectilinear -- all 90 degree angles; L/T/U shapes supported). Close the shape by clicking the first point.
- A dialog links the shape to an existing room record or creates a new room.
- Snap-to-grid in 0.25 ft (3-inch) increments. Grid tiers: 5ft dark, 1ft medium, 0.5ft light, 0.25ft very faint.

**Room dimensions:** Automatically calculated from the polygon. Shown in the room detail page and floor plan view. The Type tool lets you enter dimensions manually.

**Door subtypes:**
- **Single** -- swing arc with hinge dot and jamb ticks. Swing direction (inward/outward, left/right) configurable.
- **French** -- two panels with center post. Inward or outward only.
- **Sliding** -- two offset panels side by side. No swing.
- **Pocket** -- door slides into the wall cavity. Dashed inset rectangle.

**Ceiling fixtures (Electrical mode):**
- Types: Fan, Fan+Light, Pendant (drop-light), Chandelier, Flush-mount, Solar, Generic
- Click anywhere inside a room to place. Draggable. Configured in Edit Marker.

**Recessed lights (Electrical mode):**
- Small circles placed anywhere inside a room. Draggable.
- Support Facts, Problems, and Activities via their detail page.

**Wall plates (Electrical mode):**
- 1 to 4 slots per plate. Each slot is a switch or outlet.
- Switch subtypes: single-pole, 3-way, dimmer, smart
- Outlet subtypes: standard, GFCI, 220V, USB
- Slots can be linked to ceiling fixtures and recessed lights they control (same room).
- **External switch slots:** A switch can be marked "External" to document it controls items in another room. External targets are picked from a floor/room/item picker and shown as chips on the slot. Slot symbol shows an asterisk when external (e.g., D becomes D*).
- Plate width scales automatically with slot count.

**Layout fixtures -- Toilet, Sink, Tub/Shower (Layout mode Fixtures flyout):**
- Click anywhere inside a room to place. No modal for initial placement.
- Rotate button cycles 0/90/180/270 degrees for wall orientation.
- Edit Marker sets name, orientation, and notes.
- Tub/Shower configurable as tub only, shower only, or combo.

**Plumbing (Plumbing mode):**
- **Spigot** -- outdoor water connection, blue circle with nozzle
- **Stub-out** -- pipe end; cold (blue C), hot (red H), or both (purple C/H)
- **Sprinkler head** -- for outdoor or yard floor plans

**Stairs rooms:** A special room type with a hatch pattern. Label indicates which floor it connects to.

**Coords bar:** Always visible above the canvas. Shows cursor position in feet and, during drawing, the current wall segment length.

**Saving:** Tap **Save** in the header. The plan saves automatically when you confirm the Dimensions dialog.

**Dim toggle:** In Electrical and Plumbing modes. Makes room shapes semi-transparent so items placed inside are easier to see and click.

**Tips:**
- Build in order: draw rooms first, then doors and windows, then switch to Electrical for plates and ceiling fixtures, then Plumbing.
- In View mode, the floor plan is a navigation tool -- tap any room shape to jump to that room without knowing its name or scrolling a list.
- Use "Details" on any item (wall plate, door, recessed light) to open its full tracking page and log facts, problems, or maintenance.
- Document wall plates fully: slot types, breaker numbers as facts, and external targets. This becomes your permanent wiring reference.
- External switch targets answer "what does this switch do?" for every plate in the house, even years later.

### See Also
- [Floor Detail](#help/floor)
- [Room Detail](#help/room)
- [Floor Plan Item](#help/floorplanitem)

---

## screen:floorplanitem

### Quick Help
- Detail page for a specific item on the floor plan -- door, window, ceiling fixture, wall plate, recessed light, or plumbing item
- Supports the full tracking suite: Facts, Problems, Quick Tasks, Activities, Photos, Calendar Events
- Reached by tapping **Details** in the floor plan Properties bar when an item is selected

### Details

**What this screen is for:** Every item placed on a floor plan can be tracked independently. This is where you document issues, maintenance history, wiring facts, and notes for individual floor plan items -- beyond what the floor plan editor itself captures.

**Item types that have detail pages:**
- **Doors** -- track problems (sticking, broken hinge, damaged weatherstripping), log maintenance (painted, hardware replaced, adjusted strike plate)
- **Windows** -- track problems (broken seal causing fogging, failing weatherstripping, damaged sill), log maintenance (re-caulked, cleaned tracks, replaced screen)
- **Ceiling fixtures** -- log bulb replacements with type and date, track problems (flickering, buzzing, broken globe)
- **Recessed lights** -- same as ceiling fixtures; log bulb type/wattage and replacement history
- **Wall plates** -- document wiring details beyond the slot editor, track outlet/switch problems, log replacements
- **Plumbing fixtures** (toilet, sink, tub/shower) -- maintenance history (caulked, replaced flapper, re-grouted), problems (leaking, running, clogged)
- **Plumbing endpoints** (spigot, stub-out) -- notes on pipe age, problems, seasonal shutoff dates

**Tracking sections (all collapsible accordions):**

**Facts** -- the most important section for floor plan items. Examples:
- Door: "Hinge Brand = Schlage", "Painted = SW Extra White", "Replaced = 2021"
- Window: "Type = Double-hung", "Manufacturer = Andersen", "Installed = 2018", "Screen replaced = 2023"
- Ceiling fixture: "Bulb Type = LED A19 60W equivalent", "Installed = January 2023", "Brand = Halo"
- Recessed light: "Bulb = Philips 65W equivalent BR30", "IC-rated = Yes", "Trim = White baffle"
- Wall plate: "Breaker = Panel A / Circuit 7", "Wire Gauge = 12 AWG", "Controls = Overhead light + garbage disposal"
- Toilet: "Brand = Kohler Wellworth", "Model = K-3987", "Installed = 2015", "Flapper replaced = 2024"
- Spigot: "Shutoff location = Basement utility room, left valve", "Winterized = Yes"

**Problems** -- open/resolved issues with description, date logged, status, and notes

**Quick Tasks** -- to-do items (e.g., "Replace weatherstripping before winter", "Fix squeaky hinge", "Replace bathroom exhaust fan")

**Activities** -- maintenance log with date and notes:
- "Replaced bulb -- LED 60W Philips BR30"
- "Re-caulked around tub -- used GE Silicone II"
- "Adjusted door strike plate -- door was not latching"
- "Replaced toilet flapper -- Korky 4010"

**Photos** -- reference photos of repairs, wiring behind a plate before closing a wall, manufacturer labels, serial number stickers, before/after renovations

**Calendar Events** -- recurring maintenance reminders:
- "Check window weatherstripping -- every October"
- "Replace ceiling bulbs -- annually"
- "Winterize outdoor spigots -- every November"
- "Check toilet for running -- every 6 months"

**Tips:**
- Wall plates benefit most from Facts. Document the breaker, wire gauge, and what each slot controls. This creates a permanent wiring reference that survives renovations and forgotten memories.
- For ceiling fixtures and recessed lights, log bulb replacements as Activities with the exact bulb model in the notes. Over time you build a replacement history and never guess what bulb a fixture takes.
- Use Photos to capture the wiring behind a plate before closing a wall, the label on a fixture housing, or the serial number on an appliance before the sticker fades.
- Calendar Events on windows and doors are great for seasonal maintenance -- check weatherstripping every fall, re-caulk windows every few years, winterize spigots each November.
- For toilets and sinks, log the brand and model in Facts. When a part fails, you can order the exact replacement without having to pull the toilet or look up the model.

### See Also
- [Floor Plan](#help/floorplan)
- [Room Detail](#help/room)


---

## screen:health

### Quick Help
- The Health home page -- a tile grid linking to every health tracking area
- **Track Health For** strip at the top lets you switch whose health you're viewing (Me, a family member, or a pet)
- Tap any tile to open that section for the active person

### Details

**What the Health section tracks:** A comprehensive personal health record -- medical history, active conditions and concerns, medications, doctor visits, appointments, blood work, vitals, insurance, and more. Works for you and for anyone else you want to track (family, pets).

**Track Health For strip:**
- Shows cards for all tracked contacts. The active card has a blue border and ✓ badge.
- Tap a card to switch context -- all tiles below will open data for that person.
- **Me** is always first and cannot be removed.
- **+ Add Person** adds any contact to the tracked list.
- **Remove** (on non-Me cards) removes them from tracking without deleting any records.
- Context always resets to Me when you return to this screen; it's remembered while you navigate within the health section.
- **Emergency Info and My Care Team tiles are hidden when viewing a non-Me contact** -- those sections are Me-only.

**Tile grid layout (top to bottom):**
- **Conditions** -- chronic or ongoing medical conditions with a journal, medication links, and visit history
- **Concerns** -- active health worries or symptoms being tracked (can be promoted to a Condition)
- **Appointments** -- upcoming and past medical appointments with overdue alerts
- **Health Visits** -- completed doctor/specialist/urgent care visits with notes, medications, and outcomes
- **Medications** -- current and past medications with dosage, schedule, concern/condition links, and Rx label scanning
- **Supplements** -- vitamins, herbs, and other supplements tracked separately from medications
- **Blood Work** -- lab results with LLM-assisted import from pasted lab text
- **Vitals** -- blood pressure, weight, heart rate, and other measurements over time
- **Insurance** -- health insurance plan details and coverage records
- **Emergency Info** -- critical info card for emergency situations; visible for Me only
- **Vaccinations** -- vaccination history with dates and providers
- **Allergies** -- allergy list with reactions and severity
- **Eye / Glasses** -- prescription history and eye exam records
- **My Care Team** -- your roster of doctors, specialists, dentists, and other providers; visible for Me only

**Tips:**
- To track a pet's health, add the pet as a contact (category: Pet), then use + Add Person to add them to health tracking.
- Start with Conditions and Concerns to establish a health baseline, then add Medications and link them to the right conditions.
- The Appointments flow is the fastest way to log a visit -- mark an appointment Done and it walks you through creating the visit record and adding notes per concern/condition.
- Blood Work import supports pasting raw lab text (from a patient portal PDF) and the AI extracts all markers automatically.

### See Also
- [Health Visits](#help/health-visits)
- [Appointments](#help/health-appointments)
- [Conditions](#help/health-conditions)
- [Concerns](#help/health-concerns)
- [Medications](#help/health-medications)

---

## screen:health-appointments

### Quick Help
- Shows appointments for the person selected in the **Track Health For** strip -- the page title shows their name when it's not you
- Upcoming, overdue, and past medical appointments -- doctor visits, specialists, follow-ups, labs, procedures
- Tap **Mark Done** to convert an appointment into a Health Visit record (captures notes per concern/condition)
- Overdue appointments appear at the top as a reminder
- Cancelled and converted appointments are hidden from the default view

### Details

**What an appointment is:** A scheduled medical event -- a future visit. Once the visit happens, you mark it Done, which converts it into a Health Visit record and walks you through adding notes.

**Appointment types:** Dr. Visit, Specialist, Follow-up, Physical or Annual, Urgent Care, Emergency, Dental, Eye Exam, Lab or Test, Procedure.

**List sections:**
- **Overdue** -- scheduled appointments with a past date that have not been marked Done or cancelled. These appear at the top as urgent reminders.
- **Upcoming** -- scheduled appointments in the future, sorted by date
- **Past** -- completed, converted, or cancelled appointments

**Each appointment card shows:**
- Type badge (color-coded)
- Date and time (tappable -- opens the edit modal, same as the Edit button)
- Facility (tappable link to the contact record if a contact is set)
- Provider name
- Linked concern and condition chips
- Notes
- **Edit**, **Mark Done**, **View Visit** (if already converted) buttons

**Adding an appointment:**
- Tap **+ Add Appointment**
- Fill in: date, time, type, facility (from your Contacts -- Medical Facility), provider (from Contacts -- Medical Professional), concerns and conditions this appointment is for, notes
- Both facility and provider have an "allow create" option -- you can add a new contact inline without leaving the form

**Mark Done -- converting an appointment to a visit (2-step flow):**
- Step 1: A conversion modal opens pre-filled with the appointment data (date, time, type, facility, provider). If the appointment had linked concerns or conditions, the **Reason for Visit** field is automatically filled with their names (comma-separated) -- edit as needed. Confirm or adjust, then Save to create the Health Visit record.
- Step 2: You are taken to the Visit Notes page. For each concern and condition linked to the appointment, you can add notes about what was discussed or decided. A microphone button supports voice-to-text entry. You can also add or link medications from this screen.
- When done, tap "Done -- Visit" to save all notes and go to the visit detail page.
- The appointment is marked "converted" and a "View Visit" link appears on the appointment card.

**Cancelling an appointment:** Open the Edit modal -- a "Cancel Appt" button appears at the bottom left (for active appointments only). This sets the status to cancelled and saves any notes. Delete is also available in the edit modal.

**Tips:**
- Link appointments to concerns and conditions when scheduling -- the links carry forward to the visit automatically when you mark Done.
- Use the Notes field on an appointment for pre-visit questions you want to ask the doctor. Those notes also carry forward to the visit.
- Converted appointments keep a "View Visit" link so you can always navigate from the appointment to the visit record.

### See Also
- [Health Visits](#help/health-visits)
- [Conditions](#help/health-conditions)
- [Concerns](#help/health-concerns)
- [My Care Team](#help/health-care-team)

---

## screen:health-visits

### Quick Help
- Shows visits for the person selected in the **Track Health For** strip -- the page title shows their name when it's not you
- Chronological log of completed medical visits -- doctor, specialist, urgent care, dental, eye, lab, procedures
- Visits are grouped by year, newest first
- Tap any visit card to open its full detail page with notes, medications, and linked concerns/conditions

### Details

**What a health visit is:** A completed medical event with a record of what happened -- provider, reason, outcome, medications prescribed, and notes per concern or condition addressed.

**Visit list:** Reverse-chronological order, grouped by year. Each card shows: date, provider name, type badge.

**Adding a visit manually:**
- Tap **+ Add Visit**
- Fill in: date, time, type (Dr. Visit / Specialist / Follow-up / Physical or Annual / Urgent Care / Emergency / Dental / Eye Exam / Lab or Test / Procedure), facility, provider, reason for visit, what was done, outcome/next steps, cost, notes
- Link concerns and conditions addressed during this visit

**Visit detail page sections:**
- **Header:** Visit type and formatted date. Buttons: Edit, Create Journal / View Journal.
- **Facility:** Tappable link to the contact record if a facility contact is set.
- **Provider:** Tappable link or plain text. Provider type auto-pulled from contact's specialty field.
- **Reason for Visit, What Was Done, Outcome/Next Steps, Cost, Notes:** Free-form text fields.
- **"This visit covered":** Tappable concern chips and condition chips showing which issues were addressed. Hidden if none linked.
- **"Notes & Meds" button:** Opens the Step 2 notes page where you can view and edit per-concern/condition notes from this visit, and manage medications linked to this visit.
- **Visit Notes section:** Displays notes that were entered per concern or condition during the Step 2 flow, shown read-only on the visit detail page.

**Create Journal / View Journal button:**
- **Create Journal:** Automatically assembles the visit data into a journal entry. If an LLM is configured, you are offered an AI-generated personal journal entry (written in your voice, not clinical notes). Otherwise a structured text summary is pre-filled. The journal entry is linked to the visit so you can navigate between them.
- **View Journal:** Navigates to the linked journal entry if one already exists.

**Tips:**
- The fastest way to log a visit is via Appointments: schedule it, then mark it Done. This pre-fills all the visit fields and walks you through the per-concern/condition notes in one flow.
- "Create Journal" is most powerful with an LLM configured -- it reads your full concern and condition history and writes a reflective journal entry, not just a dry summary.
- Cost field is useful for insurance tracking and tax records (medical expense deductions).

### See Also
- [Appointments](#help/health-appointments)
- [Conditions](#help/health-conditions)
- [Concerns](#help/health-concerns)
- [Medications](#help/health-medications)

---

## screen:health-concerns

### Quick Help
- Shows concerns for the person selected in the **Track Health For** strip -- the page title shows their name when it's not you
- Active health worries or symptoms you are tracking -- things you are watching but that may not yet be a diagnosed condition
- Each concern has a journal of updates, linked medications, and a history of visits that addressed it
- Concerns can be promoted to a full Condition when appropriate

### Details

**What a concern is:** A symptom, worry, or health issue you are monitoring. Examples: recurring headaches, knee pain that comes and goes, elevated blood pressure readings, a suspicious mole. Concerns are informal -- they do not require a diagnosis. When a concern becomes a confirmed condition, you promote it.

**Concern list page:** Shows all open concerns. Each card shows the title, body area, status badge (Open / Resolved / Promoted), and since date.

**Adding a concern:**
- Tap **+ Add Concern**
- Enter: title, body area (where in the body), since date, summary, notes

**Concern detail page sections:**

**Summary card:** Title, status badge, body area, since date, summary text. Resolved concerns show the resolved date. Buttons: Edit, Mark Resolved / Reopen.

**Journal Updates (starts expanded):** Chronological log entries -- date, pain scale (0-10), note. Entries added from a visit show a tappable "Visit" chip linking to that visit. Tap **+ Add Entry** to log a new update manually (date, note, pain scale).

**Linked Medications:** Medications whose records include this concern in their concern list. Shows name and dosage. Unlink button removes the link. "Link Medications" opens a picker to add existing medications.

**Appointments and Visits:** All appointments and visits that included this concern in their linked concerns list. Each row shows date (tappable) and provider/type info.

**Photos:** Reference photos (e.g., a rash, a swollen area, a mole over time for comparison).

**Facts:** Key-value notes (e.g., "Triggers = stress, poor sleep", "First noticed = March 2024", "Doctor's initial impression = likely tension headaches").

**Resolving a concern:** Tap **Mark Resolved** -- enters a resolved date and closes the concern. It remains visible with a Resolved badge. Tap **Reopen** to reactivate if the issue returns.

**Promoting a concern to a Condition:**
- Tap **Promote to Condition** at the bottom of the concern page.
- A modal pre-fills the condition name (from concern title) and category (from body area).
- If a condition with the same name already exists, you can choose to create a new condition or merge into the existing one.
- On promotion: all journal updates are copied to the condition's log, photos are re-pointed to the condition, medications and visits are re-linked. The concern is marked "Promoted" and becomes read-only with a link to the new condition.

**Tips:**
- Use concerns for anything you are watching but not yet ready to call a condition. The journal update history lets you show a doctor a chronological record of how a symptom has progressed.
- Pain scale entries (0-10) are optional but useful for tracking whether a symptom is improving or worsening over time.
- Photo-documenting a skin concern (mole, rash, bruise) over time creates a visual timeline that is far more useful to a dermatologist than a verbal description.

### See Also
- [Conditions](#help/health-conditions)
- [Health Visits](#help/health-visits)
- [Medications](#help/health-medications)

---

## screen:health-concern

### Quick Help
- Detail page for a single health concern -- journal log, linked medications, visits, photos, and facts
- Add journal updates to track how the concern progresses over time (with optional pain scale)
- Promote to a Condition when the issue is formally diagnosed

### Details

See the Concerns list page help for full detail on the concern lifecycle and all sections.

**Key actions on this page:**
- **Edit** -- update title, body area, since date, summary, notes
- **Mark Resolved / Reopen** -- close or reactivate the concern
- **+ Add Entry** (in Journal Updates) -- log a new update with date, note, and pain scale; each entry also has **Edit** and **Delete** buttons
- **Link Medications** -- connect existing medications to this concern
- **Promote to Condition** -- migrate this concern to a full condition record (irreversible; concern becomes read-only)

**Archived / Promoted state:** Once promoted, a purple banner appears at the top with the promotion date and a "View Condition" link. All edit controls are hidden -- the concern is read-only.

### See Also
- [Concerns](#help/health-concerns)
- [Conditions](#help/health-conditions)
- [Health Visits](#help/health-visits)

---

## screen:health-conditions

### Quick Help
- Shows conditions for the person selected in the **Track Health For** strip -- the page title shows their name when it's not you
- Chronic or ongoing medical conditions with a full journal, medication links, visit history, and status tracking
- Status cycles: Active, Managed, Resolved -- tap the status button on a condition to advance it
- Tap any condition card to open its full detail page

### Details

**What a condition is:** A diagnosed or formally acknowledged medical condition. Examples: Type 2 Diabetes, Hypertension, Asthma, GERD, Depression, Arthritis. Conditions are the highest-level health tracking entity -- medications, visits, concerns, and blood work all link to conditions.

**Condition status:**
- **Active** -- currently affecting you, being actively managed
- **Managed** -- stable and controlled (still present, but not acutely problematic)
- **Resolved** -- no longer active (e.g., a past infection, a resolved injury)

The status cycles Active -> Managed -> Resolved -> Active. Tap the status badge on the condition detail page to advance it.

**Condition list page:** All conditions with name, status badge, category, and diagnosed date. Tapping a card opens the detail page.

**Adding a condition:**
- Tap **+ Add Condition**
- Enter: name, category (body system or area), diagnosed date, management notes, initial status

### See Also
- [Condition Detail](#help/health-condition)
- [Concerns](#help/health-concerns)
- [Medications](#help/health-medications)

---

## screen:health-condition

### Quick Help
- Detail page for a single condition -- journal log, linked medications, visits, photos, facts, and quick tasks
- Add journal notes to track how the condition evolves over time (with optional pain scale)
- Link medications that treat this condition; link visits that addressed it

### Details

**Summary card:** Condition name, status badge (Active / Managed / Resolved), category, diagnosed date, management notes. Status cycle button advances through Active -> Managed -> Resolved -> Active. Edit and Delete buttons.

**Accordion sections (Journal starts expanded; all others collapsed):**

**Journal:** Chronological log entries from `healthConditionLogs`. Each entry shows date, pain scale (if recorded), note, and type (manual entry, visit note, or imported from concern). Visit-sourced entries show a tappable "Visit" chip. Tap **+ Add Note** to log manually (date, pain scale, free-form note). Each entry has **Edit** and **Delete** buttons. Entries are sorted newest-date first; within the same date, newest entry first.

**Medications:** All medications linked to this condition. Shows name and dosage. Unlink button. "+ Add Med" opens the Add Medication modal with this condition pre-linked. "+ Link Existing" opens a picker to link an already-recorded medication.

**Appointments and Visits:** All appointments and visits where this condition was listed as a linked concern/condition. Date (tappable link), type, provider.

**Photos:** Photos related to this condition (e.g., imaging results, rash progression, wound healing).

**Facts:** Key-value notes (e.g., "Diagnosed by = Dr. Smith", "First HbA1c = 7.2", "Target HbA1c = below 6.5", "Diet changes = low carb since March 2024").

**Projects:** Quick tasks related to managing this condition (e.g., "Schedule follow-up appointment", "Research specialist referrals", "Fill CPAP prescription").

**Tips:**
- The journal is the most important section -- regular entries with pain scale create a data record you can show your doctor to demonstrate trends.
- Linking medications to conditions lets you see at a glance what is treating what. When a medication is discontinued, it stays linked to the condition in history.
- Facts are great for tracking lab targets, diet changes, lifestyle modifications, and doctor-recommended goals.
- Visit-sourced journal entries (tagged with "Visit") appear automatically when you use the Step 2 notes flow after marking an appointment Done.

### See Also
- [Conditions](#help/health-conditions)
- [Concerns](#help/health-concerns)
- [Medications](#help/health-medications)
- [Health Visits](#help/health-visits)

---

## screen:health-medications

### Quick Help
- Shows medications for the person selected in the **Track Health For** strip -- the page title shows their name when it's not you
- Your full medication list -- current prescriptions, past medications, and as-needed drugs
- Link medications to conditions and concerns so you always know what is treating what
- **Scan Rx Label** in the Add/Edit modal lets the AI read a prescription receipt photo and fill in the details automatically

### Details

**What medications track:** Every prescription or regular medication -- name, dosage, type (Ongoing / Short-term / As-needed), prescribing provider, start date, end date (if discontinued), and links to the conditions and concerns it treats.

**Medication list:** All medications shown as cards. Each card shows name, dosage, type badge, and whether it is active or discontinued.

**Adding a medication:**
- Tap **+ Add Medication**
- Fill in: name, dosage, type (Ongoing / Short-term / As-needed), prescribed by, start date, end date (if applicable), notes, linked conditions and concerns
- **Scan Rx Label:** Tap this button to photograph a prescription receipt. The AI reads the label and fills in: name, dosage, prescribed by, start date, type, and notes (Rx number, NDC, quantity, refills, insurance savings). You review and edit before saving. The scanned photo is automatically attached to the medication.

**Medication types:**
- **Ongoing** -- taken indefinitely (e.g., blood pressure medication, diabetes medication)
- **Short-term** -- taken for a defined period (e.g., antibiotic course, steroid taper)
- **As-needed** -- taken only when symptoms arise (e.g., rescue inhaler, antihistamine)

**Photos:** Each medication card has a "Photos" button. Photograph the pill bottle, prescription label, or packaging for reference. Useful for identifying pills by appearance or documenting a label before it fades.

**Linking to conditions and concerns:**
- When adding or editing a medication, a multi-select list shows all your active conditions and open concerns. Check the ones this medication treats.
- Linked medications appear on the condition and concern detail pages, making it easy to see the full treatment picture.

**Discontinued medications:** Setting an end date marks a medication as discontinued. It stays in the list but appears grayed out. The history is preserved -- you can always see what you took and when.

**Tips:**
- The Rx label scan is the fastest way to add a new prescription -- just photograph the bag or receipt from the pharmacy.
- Always link medications to their conditions. This makes the Condition detail page much more useful (you can see what is treating what) and helps when talking to a new doctor.
- Notes field is great for: dosage instructions ("take with food"), side effects you have noticed, pharmacy name and phone, insurance copay, and reminder to ask for generic.

### See Also
- [Conditions](#help/health-conditions)
- [Concerns](#help/health-concerns)
- [Health Visits](#help/health-visits)

---

## screen:health-supplements

### Quick Help
- Shows supplements for the person selected in the **Track Health For** strip -- the page title shows their name when it's not you
- Vitamins, minerals, herbs, and other supplements tracked separately from prescription medications
- Same fields as medications: name, dosage, type, start date, notes, and condition/concern links

### Details

**Why supplements are separate:** Supplements are tracked in their own section so they do not clutter the medication list. They use the same data model but appear in a distinct area.

**Common supplements to track:** Vitamin D, Fish Oil, Magnesium, Zinc, Probiotics, Melatonin, B12, Turmeric, Elderberry, Collagen, Protein powder, Herbal teas taken medicinally.

**Adding a supplement:** Same flow as medications -- name, dosage, type (Ongoing / As-needed / Short-term), start date, notes, and optional condition/concern links.

**Tips:**
- Linking supplements to conditions helps you remember why you started taking something (e.g., Magnesium linked to "Chronic Migraines").
- Notes field is good for: brand preference, form (capsule, powder, gummy), whether it is helping, and when you ran out vs. refilled.

### See Also
- [Medications](#help/health-medications)
- [Conditions](#help/health-conditions)

---

## screen:health-bloodwork

### Quick Help
- Shows blood work for the person selected in the **Track Health For** strip -- the page title shows their name when it's not you
- Blood work and lab results -- import from pasted lab text using AI, or enter markers manually
- Each record is a lab panel with individual markers (value, unit, reference range, flagged status)
- View trends for individual markers over time across multiple panels

### Details

**What blood work tracks:** Lab results from blood tests, urine tests, and other panels. Each record is a single lab report (e.g., "Annual labs -- April 2026") containing multiple markers (e.g., HbA1c, LDL Cholesterol, TSH, Creatinine).

**Adding blood work -- LLM import (fastest):**
- Tap **+ Add Blood Work**
- Select "Paste Lab Text" and paste the raw text from your patient portal (copy/paste from a PDF or web page)
- The AI reads the text and extracts all markers: name, value, unit, reference range, and whether it was flagged as out of range
- You see an editable preview before saving -- you can correct any misread values
- On save, all markers are stored as structured data

**Adding blood work -- manual entry:**
- Tap **+ Add Blood Work** and enter the panel date and name
- Add markers individually: name, value, unit, reference range, flagged status

**Viewing results:**
- Each blood work record expands to show all markers in a table
- Flagged markers (out of reference range) are highlighted
- Tap a marker name to see a trend chart of that marker's values across all your lab records over time

**Tips:**
- The LLM import is dramatically faster than manual entry for a full lab panel. Even a 20-marker panel takes seconds to import.
- After importing, always review the editable preview -- AI occasionally misreads a value or unit. The reference range is especially important to verify.
- Trend tracking is the most valuable feature here -- seeing your HbA1c or cholesterol over 3 years of annual labs is far more informative than any single reading.

### See Also
- [Conditions](#help/health-conditions)
- [Health Visits](#help/health-visits)

---

## screen:health-vitals

### Quick Help
- Shows vitals for the person selected in the **Track Health For** strip -- the page title shows their name when it's not you
- Recurring health measurements over time -- blood pressure, weight, heart rate, blood glucose, oxygen saturation, temperature, and more
- Select a vital type and see all readings in a table with date, value, and notes
- Add readings manually with a date, value, and optional notes

### Details

**What vitals track:** Quantitative measurements taken over time. Unlike blood work (lab panels), vitals are things you can measure at home or at the doctor -- blood pressure, weight, resting heart rate, blood glucose, SpO2, body temperature.

**Adding a vital reading:**
- Tap **+ Add Reading**
- Select the vital type, enter date, value, unit, and optional notes (e.g., "Taken after 5 min rest", "Post-meal reading")

**Viewing a vital type:**
- Select the type from the dropdown to filter to that measurement
- All readings appear in a table, newest first
- Useful for spotting trends: is blood pressure creeping up? Is weight trending down since a diet change?

**Common vital types:** Systolic Blood Pressure, Diastolic Blood Pressure, Heart Rate (BPM), Weight (lbs or kg), Blood Glucose (mg/dL or mmol/L), Oxygen Saturation (SpO2 %), Body Temperature (F or C).

**Tips:**
- Log blood pressure readings at the same time of day (ideally morning, after sitting for 5 minutes) for meaningful trends.
- The notes field is important for vitals -- context matters. "158/92 -- taken at doctor, felt anxious" is more useful than just "158/92".
- If you are managing a condition like diabetes or hypertension, regular vitals logging gives you data to share with your doctor that is far more detailed than what they see in a single office visit.

### See Also
- [Blood Work](#help/health-bloodwork)
- [Conditions](#help/health-conditions)

---

## screen:health-insurance

### Quick Help
- Shows insurance for the person selected in the **Track Health For** strip -- the page title shows their name when it's not you
- Health insurance plan details -- carrier, plan name, policy number, group number, coverage details, and contacts
- Multiple plans supported (primary, secondary, dental, vision, etc.)
- Tap any plan card to open its full detail page

### Details

**What insurance tracks:** Your health insurance plan information in one accessible place. Useful when you need your policy number at a doctor's office, want to verify coverage before a procedure, or need the insurance company's phone number.

**Fields per plan:** Carrier name, plan name, plan type (HMO / PPO / EPO / HDHP / Medicare / Medicaid / Other), policy number, group number, member ID, coverage start date, coverage end date, premium amount, deductible, out-of-pocket maximum, copay amounts (PCP / Specialist / Urgent Care / Emergency), prescription coverage notes, insured name, employer (if employer-sponsored), customer service phone, notes.

**Multiple plans:** Add separate records for primary medical, secondary medical, dental, vision, FSA/HSA, and supplemental coverage.

**Tips:**
- Photograph your insurance card and attach it as a photo to the plan record. If you ever lose your card, the info is here.
- The notes field is great for documenting: prior authorization requirements, covered specialist networks, preferred pharmacy, and any quirks of your plan you have learned over time.

### See Also
- [Emergency Info](#help/health-emergency)
- [My Care Team](#help/health-care-team)

---

## screen:health-emergency

### Quick Help
- **Me-only** -- this tile is hidden when a non-Me contact is selected in the Track Health For strip
- Your critical health information card for emergency situations
- Includes: blood type, organ donor status, emergency contacts, primary conditions, current medications, allergies, and special instructions
- Single page that any first responder or ER staff could read quickly

### Details

**What emergency info is:** A concise summary of the most critical health facts about you -- the information that matters most if you are incapacitated and someone else needs to make medical decisions or understand your health status quickly.

**Fields:**
- Blood type (A+, A-, B+, B-, AB+, AB-, O+, O-)
- Organ donor status
- Do Not Resuscitate (DNR) status and location of documents
- Emergency contacts (name, relationship, phone)
- Primary physician name and phone
- Active conditions summary
- Current medications summary
- Known allergies and reactions
- Special medical instructions (e.g., "Diabetic -- check blood sugar if unconscious", "Carries EpiPen -- right jacket pocket")

**Tips:**
- Keep this page updated whenever you start a new medication or are diagnosed with something new. An ER doctor should be able to read this and immediately understand your situation.
- The special instructions field is the most important field for unusual situations -- pacemaker, insulin pump, severe allergy with specific treatment protocol.
- Consider sharing a screenshot of this page with a family member or putting a medical ID bracelet that references your conditions.

### See Also
- [Allergies](#help/health-allergies)
- [Medications](#help/health-medications)
- [My Care Team](#help/health-care-team)

---

## screen:health-allergies

### Quick Help
- Shows allergies for the person selected in the **Track Health For** strip -- the page title shows their name when it's not you
- Your full allergy list -- medications, foods, environmental, and contact allergens
- Each entry records the allergen, reaction type, severity, and notes
- Linked to Emergency Info so your allergy list is always accessible in a crisis

### Details

**Allergy fields:** Allergen name, category (Medication / Food / Environmental / Contact / Other), reaction description (what happens), severity (Mild / Moderate / Severe / Anaphylactic), first noticed date, notes (e.g., "Carry EpiPen", "Safe alternative = Penicillin family does not trigger this").

**Common allergy categories:**
- **Medication** -- penicillin, sulfa drugs, NSAIDs, contrast dye
- **Food** -- peanuts, tree nuts, shellfish, dairy, gluten, eggs
- **Environmental** -- pollen, pet dander, dust mites, mold
- **Contact** -- latex, nickel, certain soaps or lotions

**Tips:**
- Note both the reaction AND the severity. "Hives" (mild) needs different handling than "throat swelling" (anaphylactic).
- For medication allergies, note the full drug class if known (e.g., "Penicillin allergy -- entire beta-lactam class avoided"). This helps prescribers avoid related drugs.
- Update allergies immediately when you discover a new one, especially medication allergies.

### See Also
- [Emergency Info](#help/health-emergency)
- [Medications](#help/health-medications)

---

## screen:health-vaccinations

### Quick Help
- Shows vaccinations for the person selected in the **Track Health For** strip -- the page title shows their name when it's not you
- Vaccination history -- dates, doses, providers, and lot numbers for every vaccine you have received
- Add records for childhood vaccines, flu shots, COVID vaccines, travel vaccines, and boosters

### Details

**Vaccination fields:** Vaccine name, date received, dose number (for multi-dose vaccines), provider / clinic, facility, lot number, notes, next dose due date (for boosters or series).

**Common vaccines to track:** Influenza (annual), COVID-19 (primary series + boosters), Tdap (tetanus/diphtheria/pertussis), Shingles (Shingrix -- 2 doses), Pneumonia (Prevnar/Pneumovax), HPV, Hepatitis A, Hepatitis B, Meningococcal, travel vaccines (Typhoid, Yellow Fever, Japanese Encephalitis, etc.).

**Tips:**
- Track lot numbers -- useful if there is ever a vaccine recall or adverse event investigation.
- Set the next dose due date for annual vaccines (flu) and boosters so you get a reminder in the Health calendar.
- For childhood vaccines, record the vaccine series (e.g., "DTaP -- Dose 3 of 5") so you know what is complete.

### See Also
- [Health Home](#help/health)

---

## screen:health-eye

### Quick Help
- Shows eye records for the person selected in the **Track Health For** strip -- the page title shows their name when it's not you
- Eye exam history and current glasses/contact prescription
- Track prescription changes over time -- sphere, cylinder, axis, add power, and PD

### Details

**What eye tracking covers:** Your optometry records -- prescription history, exam dates, providers, and current glasses or contact prescription.

**Exam record fields:** Exam date, provider, facility, visual acuity (uncorrected and corrected), prescription (OD and OS: sphere, cylinder, axis, add power), PD (pupillary distance), notes, next exam due date.

**Prescription fields explained:**
- **Sphere (SPH)** -- lens power for nearsightedness (negative) or farsightedness (positive). E.g., -2.50
- **Cylinder (CYL)** -- astigmatism correction amount. E.g., -0.75
- **Axis** -- orientation of the astigmatism correction in degrees (1-180)
- **Add** -- bifocal or progressive addition power for reading (usually for 40+ years old)
- **PD** -- pupillary distance in mm; needed to order glasses online

**Tips:**
- PD is often not printed on prescriptions -- ask your optometrist to include it, or have it measured at an optical shop. Needed for online glasses ordering.
- Track prescription changes over time to see if your vision is stable or shifting year to year.
- Notes field is good for: which frames you bought, where you ordered from, contact lens brand preference, dry eye notes.

### See Also
- [Health Home](#help/health)

---

## screen:health-care-team

### Quick Help
- **Me-only** -- this tile is hidden when a non-Me contact is selected in the Track Health For strip
- Your roster of doctors, specialists, dentists, therapists, and other healthcare providers
- Each team member links to a Contact record -- tap to see their full contact info
- Used in Appointments and Visits to pre-fill provider information

### Details

**What My Care Team is:** A curated list of the providers you see regularly. Team members are drawn from your Contacts -- any contact with a category of "Medical Professional" or "Medical Facility" can be added here.

**Adding team members:** Tap **+ Add Member** -- select from your existing contacts or create a new contact inline. Set their role on your care team (Primary Care, Cardiologist, Dentist, Therapist, Physical Therapist, etc.).

**How care team links to the rest of Health:**
- When scheduling an appointment, the facility and provider pickers show your contacts -- your care team members appear here.
- When logging a visit, the provider field is filled from your contacts.
- Tapping a provider name on an appointment or visit card navigates to their contact record.

**Tips:**
- Keep care team members current -- when you switch doctors or get a new specialist referral, add them here so they are available in the Appointments flow.
- Add the facility (hospital system, medical group) as a separate contact and link staff under it. Then when you pick a facility first in the appointment form, the provider dropdown automatically filters to staff at that facility.

### See Also
- [Appointments](#help/health-appointments)
- [Health Visits](#help/health-visits)


---

## screen:life

### Quick Help
- The Life home page -- a tile grid linking to Journal, Contacts, Health, Notes, Calendar, Projects, and Checklists
- The **Coming Up** section below the tiles shows birthdays, anniversaries, and upcoming life events in the next 30 days
- Today's events show a clickable address and phone number so you can navigate or call without digging

### Details

**What the Life section is:** A personal hub for the non-house, non-yard parts of your life -- your journal, the people you know, your health, your notes, and major events and plans.

**Tile grid:**
- **Journal** -- daily entries, tracking metrics, photos, voice-to-text, check-ins, and the All Activity timeline
- **Contacts** -- everyone you know: personal contacts, doctors, service professionals, businesses, facilities
- **Health** -- full medical tracking hub (conditions, visits, medications, vitals, and more)
- **Notes** -- notebook-organized notes system
- **Calendar** -- Life Calendar for trips, milestones, goals, and major events
- **Projects** -- Life Projects (vacation planner, build projects, etc.)
- **Checklists** -- reusable checklists for life tasks
- **My Legacy** -- private end-of-life information for your loved ones (burial wishes, financial accounts, letters, and more)
- **Credentials** -- passwords, usernames, API keys, and other sensitive data organized by category
- **Private** -- encrypted vault for bookmarks, documents, and photos that only you can access (only visible after activation in General Settings)

---

## screen:credentials

### Quick Help
- The Credentials page stores passwords, usernames, API keys, and other sensitive data
- Data is organized by **category** (outer accordion) and **credential** (inner accordion)
- Use the **Person** filter at the top to switch between your credentials and those you track for family members
- **Copy** buttons grab a value to your clipboard — the clipboard auto-clears after 60 seconds
- **Credential values are masked** by default — tap 👁 to reveal

### Details

**Person filter**: Defaults to "Me". Add family members or others via Manage → Manage People (picks from your Contacts list). Their credentials are stored separately and toggled with the Person dropdown.

**Categories**: Organize credentials into groups (Financial, Streaming, etc.). Categories are shared across all people. Use **Manage → Manage Categories** to reorder (drag), rename, or delete categories. Deleting a category moves its credentials to Uncategorized.

**Uncategorized**: A built-in virtual category for credentials with no category. Always shown last. Cannot be deleted.

**Adding a credential**: Tap **+ Add** (top right) or the **+** button on any category header. All fields are optional. Pick a credential type (Password, API Key, Client Secret, Social Security Number, Code). You can create a new category on the fly from the Add form.

**Editing**: Tap **Edit** inside an expanded credential. The credential value is shown unmasked in the edit form. If you change the credential value and save, the old value automatically moves to the "Previous Credential" field and the Last Updated date is set to today.

**Copy & reveal**: 📋 copies the value to clipboard and shows "Copied!" for 2 seconds. The clipboard is automatically cleared after 60 seconds. 👁 toggles the masked/revealed view for the credential value and previous credential.

**Reordering**: Drag credentials using the ≡ handle to reorder within a category or move to a different category. Reorder categories on the Category Management page.

**Search**: The search box filters by credential name or URL across all categories for the current person. Non-matching categories are hidden while searching.

---

## screen:investments

### Quick Help
- The **Financial** hub shows **Net Worth** and **Invested** totals, then three collapsible accordions — **Performance**, **Retire Estimate**, and **All-Time Highs**
- If you have more than one group, a **Group** selector appears at the top — switch groups to see a different portfolio view
- **Performance** accordion: four cards (Day, Week, Month, YTD) showing $ gain and % vs. your most recent snapshot of each type. "—" means no snapshot of that type yet
- **Retire Estimate** accordion: the same retirement income widget as the Summary page — estimated annual/monthly income, budget comparison, NW Shortfall, % of Target, and the ⚙ settings gear
- **🤖 Ask AI** button (below the Retire Estimate accordion): opens the AI Analysis page and generates a plain-English analysis of your full portfolio picture for the active group
- **All-Time Highs** accordion: four ATH cards (Daily / Weekly / Monthly / Yearly) plus a "vs Daily ATH" companion card showing how far above or below you are right now
- Each accordion remembers its open/closed state across sessions
- Below the dashboard are nav cards linking to **Accounts**, **Summary**, **Stock Rollup**, **Snapshots**, **Budgets**, **SS Benefits**, and two coming-soon sections
- Tap **⚙ Groups** (top right) to create or manage portfolio groups
- **📡 Update All Prices** button (below the group switcher) fetches the latest prices for all tickers in the active group and refreshes the dashboard numbers. The last-updated time (e.g. "5/5 10:15am") is shown beside the button

---

## screen:investments-accounts

### Quick Help
- Tracks financial accounts (bank, retirement, brokerage, HSA, etc.) — one card per account
- Badge shows tax category: green = Roth · orange = Pre-Tax · purple = Brokerage · blue = Cash · gray = Other
- Sensitive fields (account number, username, password) are encrypted and require your Legacy passphrase to reveal
- Use the **Person** dropdown to switch between your accounts and those of people you track
- Joint accounts appear under both the owner ("Me") and the co-owner's view
- Accounts are never deleted — **Archive** hides a closed account; use **Show Archived** to see it again
- Drag the ⠿ handle to reorder personal accounts

### Details

**Person switcher**: Defaults to "Me". Add family members or others via **Manage → Manage People** (picks from your Contacts list). Each person's accounts are stored independently. Changing the person reloads the list.

**Tax category badges**: Derived automatically from account type — green (Roth) = Roth IRA/Roth 401k; orange (Pre-Tax) = Traditional IRA/401k/403b/HSA/529; purple (Brokerage) = Individual/Joint brokerage; blue (Cash) = Checking/Savings/Money Market/CD; gray (Other) = other types.

**Owner field**: Choose **Personal** (default) or **Joint**. Joint accounts are stored under "Me" but appear in the co-owner's account list too. Select the co-owner from enrolled people when choosing Joint.

**Cash Balance**: Optional field for uninvested cash sitting inside an account (e.g. settlement fund in a brokerage). Used in the portfolio summary to separate investable cash from invested assets.

**Adding an account**: Tap **+ Add Account**. Account Type and Nickname are required. Last 4 Digits (optional) shows as ····1234 in the card header.

**Sensitive fields**: Account Number, Username, and Password are encrypted with your Legacy passphrase. Tap "🔓 Unlock Sensitive Fields" in the form, or "🔓 Reveal All" on an expanded card.

**Passphrase**: Same passphrase as the Legacy section. Unlocking in either feature unlocks both for the session. Never stored — must be re-entered each browser session.

**Archive**: Use Archive (not Delete) to close an account. Archived accounts can be restored. Legacy Financial shows only active accounts.

**Reordering**: Drag the ⠿ handle on personal (non-joint) accounts to reorder. Order is saved immediately.

---

## screen:investments-groups

### Quick Help
- Groups define which people's accounts are combined in the Portfolio Summary and Snapshots
- The **Me** group is created automatically on your first visit and cannot be deleted
- Add groups for households, kids' accounts, etc. — each with its own snapshot schedule
- Joint accounts only appear in a group's summary when **all** parties of the joint are in that group

### Details

**Creating a group**: Tap **+ Add Group** → you're taken to the Add Group page. Enter a name, check which people to include (Me is optional — uncheck it to track someone else's accounts separately), and choose which snapshot frequencies apply (Daily / Weekly / Monthly / Yearly). Tap **Save** to return to Manage Groups, or **Cancel** to go back without saving.

**People**: Choose from your enrolled contacts (added via Accounts → Manage People). Each selected person's accounts roll up into that group's portfolio total. "Me" is just another checkbox — you can create a group that excludes yourself (e.g., a group just for your kids' accounts).

**Snapshot frequencies**: Controls which snapshot types are offered when you tap "Capture Snapshot" on the Snapshots page. A "Kids" group might only need Yearly; your household group likely wants all four.

**Editing**: Tap **Edit** on any group card — you're taken to the Edit Group page where you can change the name, people, or frequencies. Tap **Save** or **Cancel** to return to Manage Groups.

**Deleting**: Tap **Delete** on any non-default group. This removes only the group record — no account data is affected.

**Group switcher**: When more than one group exists, a dropdown appears at the top of the Hub, Summary, and Snapshots pages. Hidden when only one group exists. **Selecting a group on one page carries over to the next** — if you pick "Our Household" on the Hub, Summary and Snapshots will open to that same group automatically.

---

## screen:investments-account

### Quick Help
- Shows all holdings for one account in a compact table — ticker, shares, price, cost basis, gain/loss, value, and % of account
- **Total Value** = sum of all holdings × last price + cash balance + pending activity
- Tap **+ Add Holding** to add a stock or mutual fund position
- The cash balance field formats as **$X,XXX.XX** on blur — click it to edit the raw number, click away to reformat
- For bank accounts (Checking/Savings/Money Market/CD): only the balance field is shown — no holdings

### Details

**Holdings table**: One row per holding. Columns: Symbol/Name · Qty · Price · Cost/sh · Gain $ · Gain % · Value · % Acct · ✏🗑 actions. Table scrolls horizontally on narrow screens. A totals row at the bottom shows aggregate value and total gain (when all holdings have a cost basis).

**Gain $ / Gain %**: Calculated as (last price − cost basis) × shares and (last price − cost basis) / cost basis. Shows "—" if no cost basis is set or no price has been fetched.

**% Acct**: Each holding's current value as a percentage of the full account total (holdings + cash balance + pending activity).

**Account Holder dropdown**: The first field on the Add/Edit Account form. Shows "Me" plus any enrolled contacts. Defaults to whoever was selected on the Accounts screen when adding, or the actual owner when editing. You can change it to correct a mistake — if you change the owner on an existing account, all holdings are migrated to the new owner's namespace automatically.

**Adding a holding**: Tap **+ Add Holding** → enter the ticker symbol. Tab off the ticker field and the company/fund name is looked up automatically from Finnhub (only fills in if the name field is empty and a Finnhub key is configured). Enter shares and optionally cost basis per share.

**Editing a holding**: Tap ✏ on any row to update ticker, name, shares, or cost basis.

**Deleting a holding**: Tap 🗑 on any row. Confirmation required.

**Cash Balance**: Labeled "Account Balance" for bank accounts, "Uninvested Cash Balance" for investment accounts. Displays formatted as $X,XXX.XX — click to edit, click away to reformat. Included in the account total and portfolio summary.

**Pending Activity**: A separate row in the holdings table (labeled **PEND / Pending Activity**), always present on investment accounts. Tracks things like unsettled trades, dividends not yet credited, or any temporary cash-equivalent amount that doesn't belong in your permanent cash balance. Can be positive or negative — tap ✏ to edit inline. Rolls up into the **Uninvested Cash** category on the Summary page.

**Total Value**: Σ(shares × last price) + cash balance + pending activity. Holdings without a fetched price contribute $0 until **📡 Update Prices** is tapped.

**📡 Update Prices**: Fetches the latest price for every holding in this account. Works in two phases:

1. **Finnhub** (free API): Tried first for all tickers. Works great for stocks and ETFs. Mutual funds (FXAIX, RDFTX, etc.) are not supported on the free Finnhub tier — those tickers are passed to Phase 2.
2. **Yahoo Finance**: For any ticker Finnhub couldn't price. If a **Cloudflare Worker proxy** is configured in Settings → General Settings → Investments, it's used directly (reliable, no rate-limiting). Otherwise the app tries a chain of free public CORS proxies — these work most of the time but can be inconsistent.

If a ticker still fails both sources, it's shown in the result popup. The most common reason for consistent failures is a **network firewall or security tool (e.g. ZScaler on a work machine)** blocking the public proxy calls. Setting up the Cloudflare Worker bypasses this, since the Worker makes the Yahoo request server-side where your firewall doesn't apply.

**Why not just ask the AI (like ChatGPT)?** When you chat with ChatGPT on the web, it has browsing tools that fetch live data. The raw AI API used by this app is just the language model — it has a training data cutoff and no internet access. Its "prices" would be months or years out of date. That's why we use Finnhub + Yahoo instead.

Requires a Finnhub API key in Settings. Prices persist in Firestore across sessions.

**Edit Account**: Tap **Edit Account** in the header to change account type, nickname, owner, or other fields.

---

## screen:investments-stocks

### Quick Help
- Shows every unique ticker held across ALL your investment accounts, aggregated by symbol
- Each row shows total shares, last known price, total value, and concentration % of your holdings
- **Concentration warnings**: orange badge ≥10%, red badge ≥15% — flags over-concentration in one stock
- Tap any row to expand and see which accounts hold that ticker and how many shares each
- Sort by **Value** (default) or **Ticker** (A–Z) using the buttons at the top

### Details

**What's included**: Every holding with a ticker symbol across all your investment accounts and all enrolled people (Me + any enrolled contacts). Bank/cash accounts have no holdings and are excluded.

**Grid columns**: Symbol · Qty (total shares) · Price (last fetched) · Cost (weighted average cost basis) · Gain $ · Gain % · Value · % Net Worth. Green = gain, red = loss. Dashes (—) appear where cost basis or price is missing.

**% Net Worth**: Each ticker's total value as a percentage of your overall net worth (all accounts combined). Concentration badges highlight risk: orange ≥10%, red ≥15%.

**Expanding a row**: Tap any ticker row to see a per-account breakdown — each account that holds the ticker, with its own shares, price, cost, gain, value, and % of that account's total. Account names are clickable and navigate directly to the holdings page for that account. A breadcrumb at the top of the holdings page takes you back to **Stock Rollup**.

**Prices**: Uses the last fetched price stored on each holding. Tap **📡 Update All Prices** (top right of this page, or on the main hub or Summary page) to refresh prices across all accounts before reviewing the rollup. The Stock Rollup button updates all enrolled people's accounts — not just the current group. The last-updated time (e.g. "5/5 10:15am") is shown beside the button.

**Sort by Value**: Highest-value tickers at the top — shows your largest positions first.

**Sort by Ticker**: Alphabetical A–Z — useful for quickly finding a specific symbol.

---

## screen:investments-snapshots

### Quick Help
- Records a point-in-time snapshot of your portfolio — Net Worth, Invested, and per-category breakdown
- Tap **+ Capture** — you'll be warned if prices haven't been updated today; you can update them right from the dialog
- Tap **↑ Import** to bulk-load historical snapshots from a spreadsheet screenshot using AI
- Sections (Yearly/Monthly/Weekly/Daily) are collapsible — tap the header to expand or collapse; your open/closed state is remembered across visits
- Each section header shows the **most-recent value and count** (e.g. "$1,234,567 (12)") so you can see totals at a glance without expanding
- Each expanded section shows recent snapshots and a **Show all** card at the bottom — tap it to open the full history screen for that type
- Daily rows show the day of the week beside the date (e.g. "2026-05-05 · Tuesday")
- **All-Time Highs** show the highest Net Worth ever recorded for each snapshot type

### Details

**Capturing a snapshot**: Tap **+ Capture** → if prices haven't been updated today, you'll see a prompt — tap OK to update prices first (recommended) or Cancel to proceed with current cached values. While prices are updating, the OK/Capture button is disabled and shows "Updating…" so you can't proceed mid-update → select type → add optional notes → tap **Capture**.

**Prices last updated**: Shown just below the frequency badges. Also shown on the Summary page below the "Update All Prices" button. This tells you at a glance whether your prices are fresh before capturing.

**Snapshot types**: Daily, Weekly, Monthly, Yearly — configured per group in Manage Groups. The "Me" group defaults to all four. A kids' or secondary group might only track Yearly.

**Default list filtering**: Each section shows a focused window of recent data:
- Yearly and Monthly: current calendar year only
- Weekly: last 3 snapshots
- Daily: all snapshots since the most recent Sunday (current week)

**Show all (full history screen)**: Tap the **Show all** card at the bottom of any expanded section to navigate to a dedicated full-history screen for that type (e.g. Financial › Snapshots › Monthly). That screen shows:
- Shows the last 25 snapshots by default
- **Show last N** — change the count
- **Since date** — enter a date to see all snapshots on or after that day (overrides the count); total count shown in the hint
- Tap any row to expand the detail view; tap Delete to remove a snapshot
- Breadcrumbs at the top let you navigate back to Snapshots or Financial

**Expanded view**: Tap any snapshot row to see the full category breakdown (Roth, Pre-Tax, Brokerage, Cash, Uninvested Cash) with values and % of Net Worth at that moment.

**All-Time Highs**: Updated automatically whenever a new snapshot exceeds the previous ATH for that type. Shown in the orange cards at the top. Each type (Daily/Weekly/Monthly/Yearly) tracks its own high-water mark.

**Deleting a snapshot**: Expand the row → tap **Delete** → confirm (prompt shows type and date, e.g. "Delete Monthly snapshot 2026-05-01?"). Deleting a snapshot that was used as a period baseline will cause that period's gain/loss on the Summary page to show "—" again until a new snapshot of that type is captured.

**Group switcher**: If more than one group exists, a dropdown appears to switch between groups. Each group has its own snapshot history.

**↑ Import button**: Opens the Import Snapshots screen where you can upload a spreadsheet screenshot and use AI to bulk-import historical snapshots.

---

## screen:investments-import

### Quick Help
- **One-time tool** — designed for loading historical data when you first set up the app; you won't need it regularly once you're capturing snapshots manually
- Upload a **screenshot image** of your tracking spreadsheet — not a PDF, CSV, or text file; it must be a visual image (PNG, JPG, etc.)
- The spreadsheet needs to follow a specific layout the AI expects — a screenshot of Fidelity, Schwab, or any brokerage website will not work
- Choose the snapshot type before parsing — the AI uses this to interpret the dates correctly
- Review the grid after parsing; yellow columns are ones the AI wasn't sure about — fix those dropdowns before importing
- Click **Import N Snapshots** when the grid looks right

### Details

**When to use this**: Import is a one-time bootstrap tool for loading historical snapshot data you already have in a spreadsheet. Once you're capturing snapshots regularly inside the app, you'll never need Import again. It's not meant for ongoing use.

**What kind of image works**: The file must be an image — PNG, JPG, GIF, or any standard image format. Take a screenshot of your spreadsheet using the Snipping Tool, Print Screen, or your phone camera. PDFs, exported CSV files, and text documents are not supported. A screenshot of your brokerage's website (Fidelity, Schwab, Vanguard, etc.) will not work — the layout won't match what the AI expects.

**What the spreadsheet needs to look like**: The AI is trained on a specific two-section layout:
- **Left section** — summary/category totals: Date, Net Worth, then category columns labeled exactly **Roth**, **PreTax**, **Brokerage**, **Cash**, **Inv Cash**
- **Right section** — individual account columns, one per account, with the account name in the header; a blank column separates the two sections
- Headers that use different labels (e.g. "Traditional" instead of "PreTax", or "Savings" instead of "Cash") will likely come back as yellow uncertain columns — you can correct them in the review grid

**How many rows**: One row or fifty rows — it doesn't matter. The entire visible portion of the screenshot is parsed at once, which is the whole point. Capture a wide date range in one screenshot to bulk-load months or years of history in a single import.

**Step 1 — Upload**: Select the snapshot type, then load your image — choose a file from your device or click **+ Paste** to paste directly from the clipboard. A thumbnail preview confirms the right image is loaded.

**Step 2 — Parse with AI**: Click **Parse with AI**. The app sends the image plus your full account list to your configured AI. The AI reads every column header and every number, then returns a structured mapping of columns to your accounts.

**Step 3 — Review grid**: Every column gets a dropdown in the header showing what the AI thinks it is. Yellow-highlighted columns are uncertain — the AI couldn't confidently identify them. Click the dropdown on each yellow column and pick the correct account or category. The original spreadsheet label is shown below the dropdown to help you cross-check. Set a column to **Ignore** if it shouldn't be imported (e.g. a "Cost Basis" or running total column).

**Duplicate dates**: If a snapshot already exists for a date in the screenshot (same type), that row is tagged "overwrite." The existing snapshot will be deleted and replaced when you click Import. This lets you safely re-import a corrected screenshot without creating duplicates.

**Importing**: Click **Import N Snapshots**. Each row becomes one snapshot with Net Worth, all category totals, and per-account balances. Holdings detail (shares, cost basis, purchase dates) is not imported — only the total dollar balance per account.

**After import**: A confirmation shows how many snapshots were written. They appear immediately on the Snapshots page under their respective type sections (Yearly, Monthly, Weekly, Daily).

---

## screen:investments-ss-benefits

### Quick Help
- Tracks **projected Social Security monthly benefits** by claiming age for each person you follow
- Each year (after visiting SSA.gov), tap **+ Create Snapshot** to record the updated numbers
- The **Most Recent** snapshot for each person is the one used by the Retirement Planner — older snapshots are kept for historical comparison only
- Use the **Person** dropdown to view and manage snapshots for different people (you, your spouse, kids, etc.)

### Details

**Snapshots**: Each snapshot has an "as-of date" (the day you pulled the numbers from SSA.gov) and a list of claiming ages with their projected monthly benefit amounts. You choose which ages to record — the available range is 62 through 70.

**Create New Snapshot**: Pre-fills from the previous snapshot (same ages and amounts as a starting baseline). Update the numbers that changed, delete ages you no longer need, add new ones. The as-of date defaults to today.

**Update Current Snapshot**: Edits the most recent snapshot in-place without creating a new record. For users who don't need year-over-year history — just keep one current set of numbers.

**Historical snapshots**: Any snapshot that isn't the most recent is labeled "Historical — not used in planning." You can still view and edit them, but they do not feed the Retirement Planner.

**Deleting snapshots**: If you delete the most recent snapshot, the previous one automatically becomes the "most recent" used by the planner. A confirmation prompt warns you of this.

**Enrolled people**: The person dropdown shows the same people enrolled in the Investments section. Manage enrolled people via **Accounts → Manage People**.

---

## screen:investments-ai

### Quick Help
- Sends your portfolio data to an AI and returns a plain-English analysis — written like advice from a knowledgeable friend, not a formal advisor
- Optionally type a **specific question** before clicking **✨ Ask AI** (e.g. "Am I on track to retire at 65?") — the AI answers it in addition to the full analysis
- After reading the analysis, use the **Ask a follow-up question** field to ask anything specific without re-running the full analysis
- Results are **cached per group** — come back anytime to read the last analysis without paying for a new LLM call; click **Re-run** to refresh
- The analysis always uses the currently selected group; switch groups to analyze a different portfolio
- Data sent to the AI: accounts + holdings, portfolio category totals, Social Security breakpoints, all budgets (category totals), ages, retirement ages, and your configured return rate

### Analysis Sections
1. **Summary** — 2–4 sentence big-picture overview
2. **Retirement Readiness** — math on whether the portfolio supports retirement at your configured ages
3. **Budget Gap Analysis** — gap or surplus for each budget scenario at retirement
4. **Social Security Strategy** — early vs. delayed claiming tradeoffs
5. **Portfolio Composition** — Roth/Pre-Tax/Brokerage/Cash mix appropriateness
6. **Concentration Risk** — any ticker or account-type that's too large a share
7. **Key Observations** — anything else worth flagging

---

## screen:investments-ss-form

### Quick Help
- **Create New Snapshot**: Records a fresh set of SS projections for a person. Pre-populated from the prior snapshot (ages + amounts) so you only need to update changed numbers.
- **Update Snapshot**: Edits an existing snapshot in-place — change amounts, add ages, or remove ages you no longer track.
- Pick an age from the **age dropdown** and tap **+ Add Age** to add a row; tap **✕** on any row to remove it.
- Ages available: 62 through 70 (SSA's full claiming range).
- **As-of Date** defaults to today — the day you're entering the numbers.
- Tap **Save** when done; the list page shows the updated snapshot immediately.

---

## screen:investments-summary

### Quick Help
- Shows **Net Worth** and **Invested** totals across all accounts in the selected group
- **Retire Estimate** section: six stat cards (Annual, Monthly, Current Income, % To Goal, NW Shortfall, % of Target) — tap **?** on any card to see a plain-English explanation plus the formula with your real numbers; tap ⚙ to configure return rate, after-tax %, ages, and budget
- **🤖 Ask AI** button (below the Retire Estimate accordion): opens the AI Analysis page and generates a plain-English analysis of your full portfolio picture for the active group
- **All-Time Highs** section: four ATH cards plus a "vs Daily ATH" card — collapsible accordion; open/closed state is remembered
- **Category Breakdown**: Roth, Pre-Tax, Brokerage, Cash, and Uninvested Cash totals with % of Net Worth
- **Period Performance**: Day / Week / Month / YTD gain or loss vs the most recent snapshot of each type
- **📡 Update All Prices**: fetches live Finnhub prices for every holding across all accounts in the group; last-updated time (e.g. "5/5 10:15am") is shown below the button

### Details

**Net Worth vs Invested**: Net Worth = Roth + Pre-Tax + Brokerage + Cash + Uninvested Cash. Invested = Net Worth − Uninvested Cash (i.e., includes bank Cash but excludes idle cash sitting in brokerage/investment accounts).

**Tax categories**:
- **Roth** (green): Roth IRA, Roth 401k, HSA — full account total (holdings + uninvested cash + pending activity)
- **Pre-Tax** (orange): Traditional IRA, Traditional 401k, Self-directed 401k, 403b, 529 — full account total
- **Brokerage** (purple): Brokerage Individual, Brokerage Joint — full account total. When at least one brokerage holding has a cost basis recorded, a dimmed "taxable $X" note appears to the left of the total, showing the estimated taxable gain (brokerage total − Σ cost basis).
- **Cash** (blue): Checking, Savings, Money Market, CD — the account's full balance
- **Uninvested Cash**: informational row only — shows the combined idle cash and pending activity sitting inside your Roth/Pre-Tax/Brokerage accounts. Already included in those category totals above; **not** added to Net Worth a second time.

**"If I retire today" widget**: Shows estimated retirement income combining investments and Social Security. Tap **⚙** to open settings:
- **Retirement age per person**: each person in your group gets their own age — picks from 62/63/64/65/67/70 or a custom number. Drives the SS lookup (exact age match in their SS benefits snapshot) and the card title.
- **Return Rate**: decimal (e.g. 0.06 = 6%) — applied to Net Worth for investment income
- **After-Tax %**: decimal (e.g. 0.82 = 82%) — applied to both investment income and SS income
- **Budget**: pick any budget to compare. Default budget shows **Current Income** (your actual income). Other budgets show **Total Expenses** under the budget's name. The **% To Goal** stat shows monthly retirement income ÷ that budget value.
- **NW Shortfall**: answers "how much more net worth do I need to reach 100%?" Backs out the SS contribution first — `investNeeded = budget − (SS × afterTaxPct)` — then computes `targetNW = (investNeeded × 12) / (RoR × afterTaxPct)`. The shortfall is `targetNW − current Net Worth`. Shown in red; turns "At Goal" in green once you're there. Hover for the full formula and target NW amount.
- **% of Target**: your current Net Worth as a percentage of the target NW calculated above. Gives a single at-a-glance number for how close you are to retirement from an investments perspective, with SS already accounted for.
- Each stat card has a **?** button. Tapping it opens a popup with: a plain-English explanation of what the number means, the generic formula, and the same formula with your actual numbers substituted in (copy-pasteable for manual verification). Close by tapping the backdrop or the ✕ button.
- Hover over the Annual or Monthly values to see the exact formula used (with actual rates filled in).
- If no birthday is set for your "me" contact, the widget prompts you to add it (used for age display only — not required for the calculations).

**Group switcher**: If more than one group exists, a dropdown appears at the top to switch between groups. Joint accounts are only included in a group's totals when ALL parties of the joint account are members of that group.

**📡 Update All Prices**: Refreshes prices for every holding across all accounts in the group — including stocks, ETFs, and mutual funds. Works in two phases:

1. **Finnhub** (first): Fast and reliable for stocks and ETFs. Mutual funds are not supported on the free tier.
2. **Yahoo Finance** (fallback): Any ticker Finnhub couldn't price. Uses a Cloudflare Worker proxy if configured in Settings (recommended for mutual funds), otherwise falls back to free public CORS proxies.

Tickers are **deduplicated** before fetching — if FXAIX appears in four different accounts, it's only fetched once, then the updated price is written to all matching holdings.

Results are shown in a popup after the update completes. If any tickers failed and no Cloudflare Worker is configured, the popup includes a tip — consistent failures are often caused by a **network firewall or security tool (e.g. ZScaler on a work machine)** blocking the public proxy calls. The Cloudflare Worker bypasses this. Requires a Finnhub API key in Settings.

**Period Performance**: Four rows — Day, Week, Month, YTD. Each row shows the gain or loss in dollars and percentage versus the most recent snapshot of the matching type (Daily/Weekly/Monthly/Yearly). Rows show "No [type] snapshot yet" until at least one snapshot of that type has been captured on the Snapshots page. Green = gain, red = loss.

**All-Time Highs**: Orange cards showing the highest Net Worth ever recorded per snapshot type. Automatically updated whenever a new snapshot exceeds the stored high. Only appears once at least one snapshot has been captured.

**Per-account breakdown**: Lists every account in the group, grouped by person, showing the account name, tax category badge, and total value. Joint accounts appear in a separate "Joint Accounts" section at the bottom.

---

## screen:budget

### Quick Help
- The **Budgets** page opens directly to your **default budget** — the one you use day-to-day
- Use the **dropdown** at the top to switch between your saved budgets or create a new one
- All edits are held in memory until you tap **Save** — you can freely adjust numbers to run "what if" scenarios without committing anything
- Tap **Discard Changes** to revert everything back to the last saved state
- The **Summary** section at the bottom shows each category subtotal, total income, and leftover (green = surplus, red = deficit) — it updates live as you type

### Non-Monthly Reserve
- Every budget has a **Non-Monthly Reserve** section (purple header) — it's read-only and cannot be deleted
- It shows your computed monthly reserve: the sum of all active non-monthly items divided by 12
- Tap **Manage** to open the Non-Monthly Expenses screen where you add, edit, and toggle items
- The reserve counts toward your Total Expenses and appears in the Summary section

### Managing Budgets
- **Add New Budget**: select from the dropdown → name dialog appears → optionally copy from an existing budget → lands on the new budget page
- **Rename**: tap the ✏️ icon next to the budget name
- **Use as Default**: tap the button on any non-default budget — the default budget shows a "Default Budget" badge instead
- **Archive**: removes the budget from the dropdown but keeps it intact — restore it anytime from the Archives page
- **Delete**: permanently removes the budget and all its data — cannot be undone

### Adding Categories & Items
- Tap **+ Add Category** to pick from quick-picks (Household, Vehicles, Loans, Other, Personal) or type a custom name
- Within a category, tap **+ Add Item** — a new row appears with Name, Amount ($), and Est. Due Day fields
- The due day is for your reference only — it does not trigger any reminders
- Drag the ⠿ handle to reorder items within a category
- Tap the 💬 icon on any item to toggle a note field — the icon is blue when a note exists, gray when empty

### Income Section
- Always at the bottom — add as many lines as you want (one monthly take-home, individual paychecks, side income, etc.)
- Drag the ⠿ handle to reorder income lines

### Archives
- Tap **📦 Archives** (top right of the budget page) to view all archived budgets
- From there you can **Restore** a budget back to the active list or **Delete** it permanently

---

## screen:budget-nonmonthly

### Quick Help
- This screen lists all non-monthly expenses tied to the current budget — things like car registration, HOA dues, holiday spending, or any annual/irregular cost
- **Check the box** next to an item to include it in the monthly reserve; **uncheck** to exclude it without deleting it — great for "what-if" scenarios
- The **Monthly Reserve** bar at the top updates live as you toggle items or change amounts
- All changes **save automatically** — there is no Save button on this screen
- Tap **‹ Back to Budget** to return to the main budget page, which will reflect the updated reserve

### Adding & Editing Items
- Tap **+ Add Item** to append a new row — the name field is focused automatically
- Fill in: **Name**, **Annual $** (the total for the year — use Notes to explain frequency), and optional **Notes**
- Click or tap away from a field to save it
- To delete an item, tap the 🗑 icon and confirm — this cannot be undone

### How the Reserve Works
- Monthly Reserve = sum of all **active** item annual amounts ÷ 12
- Example: car registration $240 + HOA $600 + holiday $1,200 = $2,040 annual → $170/mo reserve
- This figure flows back to the main budget page as the **Non-Monthly Reserve** category and counts toward Total Expenses

---

## screen:private

### Quick Help
- The Private Vault stores bookmarks, documents, and photos — all encrypted, unreadable without your passphrase
- Every visit prompts for your passphrase; vault auto-locks after 60 minutes of inactivity or on page reload
- Wrong passphrase: inline error appears immediately, input clears — try again
- Must be activated in General Settings → Private Vault before first use
- Firebase Storage must be set up (4 steps) before documents and photos will work

### Details

**What the Private Vault is:** An encrypted personal vault for data you never want anyone else to see — not even someone with your app login or direct Firestore access. Everything is encrypted in your browser using AES-256-GCM before it ever leaves your device. The passphrase is never stored anywhere.

**First-time setup (required for documents and photos):**
The vault requires Firebase Storage to store encrypted files. Setup is a one-time process with 4 steps — open the Setup Instructions via the **?** button in General Settings → Private Vault:
1. Upgrade Firebase to the Blaze plan (free credit card required; effectively free for personal use)
2. Enable Firebase Storage in the Firebase console
3. Paste the security rules so only your account can access your files
4. Run one command in Google Cloud Shell to configure CORS (allows your browser to download files)

**Unlocking:**
- Enter your passphrase and tap **Unlock**
- Correct passphrase: vault opens and shows three tiles — Bookmarks, Documents, Photos
- Wrong passphrase: inline error appears, input clears — try again
- Once unlocked, you won't be prompted again for 60 minutes (unless the page is reloaded)

**Auto-lock:**
- Vault locks automatically after 60 minutes of inactivity
- Any click or keypress anywhere in the app resets the 60-minute timer
- Page reload always requires re-entry regardless of the timer

**Bookmarks:**
- Private URL bookmarks stored in a folder tree — not visible to any browser or sync service
- Up to 5 levels deep (folders inside folders)
- Add folders and bookmarks using the toolbar buttons or the **+ Folder** / **+ Bookmark** buttons inside any folder
- Click a bookmark to open its URL in a new tab
- Edit or delete individual bookmarks and folders using the buttons on each row

**Documents:**
- Accepts `.docx` files only
- Both the title and the file itself are encrypted — only you can read them
- Tap **Download** to decrypt and download the file — open it in Word, edit it, then use **Re-upload** to replace the stored copy with your edited version
- **Re-upload**: replaces the encrypted file for an existing document without changing its title (title is editable during re-upload)
- Files are decrypted on-the-fly in your browser — nothing is stored unencrypted on the server

**Photos:**
- Photos are organized into albums
- **Albums page**: shows all your albums as tiles. Tap an album to open its gallery. Use **+ New Album** to create one.
- **Uncategorized**: photos uploaded without selecting an album land here automatically
- **Gallery**: shows medium-sized preview tiles. Tap any photo to open the full-size viewer.
- **Adding photos**: tap **+ Add Photos** inside a gallery — photos are compressed and encrypted in your browser before upload
- **Renaming an album**: open the album, tap **Rename** in the top-right actions
- **Deleting an album**: open the album, tap **Delete Album** — this permanently deletes the album and ALL photos inside it
- **Photo viewer**: shows the photo full-size with **← Older** / **Newer →** navigation, a caption field (auto-saves on blur), **Move to Album**, and **Delete**

**If photos or documents fail to load (warning banner appears):**
Firebase Storage requires a one-time CORS configuration before files can be downloaded. Go to Setup Instructions (the **?** button in General Settings → Private Vault) and follow Step 4. Step 4 walks you through finding the built-in browser terminal in Google Cloud and running one command — takes about two minutes, no software to install.

**If you forget your passphrase:** There is no recovery. The passphrase is never stored anywhere. All private data is permanently inaccessible without it. Store your passphrase somewhere very safe (a password manager, written down in a secure location, etc.).

---

## screen:legacy

### Quick Help
- My Legacy is a private hub of end-of-life information for your loved ones
- Tap any tile to open that section — each section saves independently
- Financial Accounts and Social Media are encrypted and require your Legacy Passphrase

### Details
**What it is:** A place to document everything your family would need if you passed away — burial wishes, funeral preferences, financial accounts, letters to loved ones, and more.

**Passphrase:** Financial Accounts and Social Media sections are protected by a separate Legacy Passphrase. It is never stored — write it down and keep it with your app login instructions. Once entered, it stays unlocked for the browser session.

**Tiles:** Tap any of the 12 section tiles to open that section. Each saves independently.

---

## screen:legacy-obituary

### Quick Help
- Three boxes: plan what you want covered, write your own draft, and leave notes for whoever writes the final version
- If AI is configured in Settings, use "Ask AI to Write" to generate a draft from your planning notes
- All three boxes auto-save when you click away

### Details
**My Planning Notes:** Brain dump anything you'd want in your obituary — facts, stories, people, career highlights, hobbies. No structure needed. This feeds the AI if you use it.

**My Draft:** Write the obituary yourself, or generate one from your planning notes using the AI button. You can edit the AI output freely. The AI will confirm before overwriting anything you've already written.

**Instructions for the Writer:** Leave guidance for whoever writes or finalizes the real obituary — preferred length, tone, what to include or skip, where to publish it.

**Coming Up section:** Shows events and contact dates within the next 30 days. Two sources:
- **Annual contact dates** -- birthdays and anniversaries from your contacts. Shows the person name as a tappable link and a "turns N" age badge if birth year is recorded.
- **Upcoming life calendar events** -- events from the Life Calendar. Shows the title as a tappable link.
- For events happening **today**, the address (clickable Google Maps link) and phone number (clickable call link) appear directly on the card -- no need to open the event.

**Relative time labels:** Each Coming Up item shows "Today!", "Tomorrow", or "In N days."

### See Also
- [Journal](#help/journal)
- [Contacts](#help/contacts)
- [Life Calendar](#help/lifecalendar)
- [Notes](#help/notes)

---

## screen:journal

### Quick Help
- Daily journal entries with photos, voice-to-text, @mentions of contacts, place check-ins, and tracking metrics
- Filter the feed by date range (7/30/60/90 days or custom) -- preference is saved
- **All Activity** toggle replaces the journal with a unified timeline of everything logged across the entire app
- Tap any entry card to open and edit it

### Details

**What the journal is:** A chronological personal log. Write about your day, log a check-in at a place, attach photos, mention people with @mentions, and track numeric metrics (weight, mood, vitals, etc.).

**Journal feed:** Shows entries in reverse-chronological order within the selected date range. Each card shows the date, time, preview text, photos, and any tracking items. Life Calendar mini-log entries also appear in the feed (toggle "Show Event Notes" to show/hide them).

**Date range filter:** Choose 7, 30, 60, or 90 days, or set a custom range. Your selection is saved and persists across sessions.

**Writing an entry:**
- Tap **+ New Entry** (or the date button) to open the entry form
- **Entry text:** Free-form textarea. Supports @mentions (see below). Tab key inserts 4 spaces. A **📋 Copy** button below the textarea copies the full entry text to the clipboard with one tap.
- **Date and time:** Defaults to now; editable. The day of week (e.g., "Friday") appears inline next to the date field as a quick reference.
- **Photos:** Tap Camera (take a new photo), Gallery (pick from device), or paste an image from clipboard. Photos are compressed automatically. Appear as 80x80 thumbnails in the form; full-screen lightbox in the feed.
- **Tracking items:** Log numeric values per category (e.g., "Weight = 183", "Mood = 7"). Categories are managed on the Journal Categories page.
- **Place / Check-in:** Attach a place to the entry. The Check-In button opens a GPS-based picker to find nearby venues (Foursquare-powered) or search by name. After check-in, the venue is locked to the entry. Check-in entries show a "checked in" badge in the feed.

**@Mentions:**
- Type @ in the entry text to trigger an autocomplete dropdown filtered to contacts marked "Include in quick mentions" (set in the contact's edit modal).
- Type @@ to open the full contact list for mentions.
- Mentioned contacts are linked to the entry and the interaction is logged on their contact record.

**Voice-to-text:** Tap the microphone button to speak your entry. The Web Speech API transcribes continuously. Spoken punctuation commands work: say "period", "comma", "question mark", "exclamation point", "colon", "semicolon", "dash", "open paren", "close paren", "ellipsis". Editing commands (spoken as their own phrase): "new line", "new paragraph", "delete last word", "delete last sentence", "clear all".

**Tracking items and categories:**
- Navigate to Journal Tracking (separate page) to view trends for each category over time.
- Navigate to Journal Categories to add, rename, or delete tracking categories.
- In the feed filter panel, pick a category to see only that category's tracking items in the current date range.

**All Activity toggle:** The most powerful feature of the journal. Checking "All Activity" replaces the journal feed with a unified timeline of everything logged across the entire app in the selected date range: journal entries, tracking items, yard activities, calendar events, health visits, appointments, concern updates, condition logs, blood work, vitals, and people interactions -- all in one sorted list. Tap any item to navigate to its source record. Useful for reviewing everything that happened in a given week or month.

**Filter panel options:**
- **Category dropdown** -- show only a specific tracking category (e.g., only weight entries)
- **Check-Ins Only** -- show only entries that are GPS check-ins
- **All Activity** -- the unified cross-app timeline described above

**Life event mini logs:** If you write a mini log on a Life Calendar event, those entries appear in the journal feed alongside regular entries. Toggle "Show Event Notes" to show or hide them. All Activity mode shows them regardless.

**View Visit link:** If an entry was created from a Health Visit (using "Create Journal" on the visit detail page), a "View Visit" button appears on the entry form, linking back to that visit.

**Tips:**
- The @mention system works best when you mark frequently-mentioned people as "Include in quick mentions" in their contact record. This keeps the autocomplete dropdown short and fast.
- Voice-to-text is ideal for longer entries -- speak naturally and use punctuation commands to format. "New paragraph. Delete last sentence." work as standalone phrases with a brief pause before and after.
- All Activity is a powerful retrospective tool -- select a 30-day range and you get a complete picture of your health, yard work, and daily life in one scrollable list.
- Photos on journal entries are stored on the entry document itself (not in the photos collection). They are full-resolution compressed images viewable in a lightbox by tapping.

### See Also
- [Life Home](#help/life)
- [Contacts](#help/contacts)
- [Life Calendar](#help/lifecalendar)

---

## screen:contacts

### Quick Help
- Everyone you know -- personal contacts, doctors, specialists, service professionals, businesses, facilities, pets
- Color-coded by category: green = Personal, blue = Medical Professional, purple = Medical Facility, orange = Service Professional
- Contact detail includes: info, important dates (birthdays/anniversaries), photos, interaction log, shared life events, and facts
- Medical professionals and facilities link to Health Appointments and Visits

### Details

**What contacts are:** A unified address book for every person, provider, and organization you interact with. Contacts power @mentions in the journal, provider pickers in health appointments and visits, facility pickers, and the Coming Up section on the Life home page.

**Contact categories:**
- **Personal** -- friends, family, neighbors, coworkers, acquaintances. Shows a personal type (Friend / Family / Neighbor / etc.). Personal types are user-customizable in Settings > Contact Types.
- **Medical Professional** -- doctors, specialists, therapists, nurses, dentists. Shows specialty (free text with ~35 built-in options). Appears in the health appointment and visit provider pickers.
- **Medical Facility** -- clinics, hospitals, labs, pharmacies. Appears in the health appointment facility picker. Staff sub-contacts (Medical Professionals) can be linked under a facility.
- **Service Professional** -- plumbers, electricians, HVAC, pest control, handyman, etc. Trade is user-customizable in Settings > Contact Types.
- **Business** -- stores, restaurants, hardware stores, etc. Business type is user-customizable.
- **Pet** -- pets as contacts. Shows an **Owner** field (ContactPicker) to link the pet to its owner in your contacts list. The owner's name appears as a tappable link on the pet's detail page. Useful for tracking vet visits, medications, and concerns in Health.
- **Other** -- anything that does not fit above.

**Sub-contacts (hierarchy):** A contact can have sub-contacts linked under it via a parent-child relationship. For Medical Facilities, staff members (Medical Professionals) appear under the facility in a "Staff" section. For Personal contacts, sub-contacts appear under "Family Members." This is useful for tracking a whole family or all staff at a clinic.

**Adding a contact:**
- Tap **+ Add Contact** -- select category, fill in name, type/specialty/trade as applicable, phone, email, address, website, Facebook URL, how you know them, notes, and whether to include in quick @mentions.

**"Me" contact:** A special contact named "Me" is automatically created when you first open Contacts. It represents you and cannot be deleted or renamed. It is used as the default person in Health tracking and by Investments for birthday / retirement calculations. A green **✓ This is me** badge appears on its detail page. You can still edit all other fields (phone, email, photo, important dates, etc.).

**Contact detail page sections:**
- **Contact info:** Phone (tappable tel: link), email (tappable mailto: link), address (tappable Google Maps link), website (external link), Facebook, how known, specialty (Medical Professional), notes.
- **Important Dates:** Birthdays, anniversaries, and other recurring dates. Month and day required; year optional (age calculation requires year). Annual dates feed the Coming Up section on the Life home page. Add with **+ Add Date** -- label (type freely or pick from suggestions: Birthday, Wedding Anniversary, Graduation, Work Anniversary), month, day, optional year, recurrence.
- **Photos:** Full photo gallery with profile photo support. First photo uploaded auto-sets the profile thumbnail shown on the contact list card.
- **Interactions:** A log of times you met, talked, or interacted with this person. Add entries with date and free-form text. Interactions also appear in the All Activity timeline.
- **Shared Life Events:** Life Calendar events that tag this contact appear here, showing what events you have attended or planned together.
- **Facts:** Key-value notes about this contact (e.g., "Kids = Sarah, Tom, Emma", "Favorite restaurant = Mario's", "Parking = Street parking on Oak Ave").
- **Sub-contacts (Staff / Family Members):** Linked sub-contacts listed here with Add and Remove buttons.

**Quick mention flag:** The "Include in quick mentions" checkbox on the contact form controls whether this contact appears in the @ autocomplete in the journal and other text fields. Keep this list to people you mention frequently to keep the dropdown manageable.

**Contact types settings:** Go to Settings > Contact Types to manage custom service trades, personal relationship types, and business categories. You can add, rename, and delete custom types.

**Tips:**
- Medical Professional contacts are most useful when you link them to your Care Team and then use them in Appointments and Visits. Their specialty auto-populates on the visit detail page.
- The interaction log is a lightweight way to track when you last talked to someone -- useful for staying in touch with friends and family you do not see often.
- For Medical Facilities, add staff members as sub-contacts (Medical Professionals) with the facility as parent. Then in the appointment form, selecting the facility will show its staff in the provider dropdown automatically.
- Important dates with a year set show a "turns N" age calculation in the Coming Up section -- great for tracking milestone birthdays.

**Neighbors:** Tap **🏘 Neighbors** (below the "Contacts" heading on the contacts list) to open the Neighborhoods section. There you can create named neighborhoods, upload a map image, and drop pins on houses to track who lives there and when you last interacted.

### See Also
- [Life Home](#help/life)
- [Journal](#help/journal)
- [My Care Team](#help/health-care-team)
- [Neighbors](#help/neighbors)

---

## screen:neighbors

### Quick Help
- Create named **neighborhoods** (e.g., "Townside", "Lake House Area") and upload a map image for each
- Drop draggable **pins** on houses in the map image
- Pin colors show interaction recency: **green** ≤ 60 days, **amber** 61 days – 1 year, **gray** never / stale
- Tap a pin to open the house detail page

### Details

**What Neighbors is:** A visual map for tracking the people who live around you. You upload a screenshot of your neighborhood (e.g. from Google Maps), place pins on houses, and log who lives there and when you last interacted.

**Neighborhoods list:** Tap **🏘 Neighbors** on the Contacts screen. Each card shows the neighborhood name, a notes snippet, and house count. Tap a card to open the map.

**Adding a neighborhood:**
- Tap **+ Add Neighborhood**
- Enter a name (required) and optional notes
- Tap **Upload Map Image** and pick a screenshot from your device — the image is compressed and stored
- Save is disabled until an image is chosen
- Tap the **✏️** button on a neighborhood card to edit its name, notes, or replace the image
- Tap the **🗑** button to delete the neighborhood and all its houses

**Map view:** Your uploaded image fills the screen as a pannable, zoomable map. House pins appear at the positions you placed them. Hover (or tap on mobile) a pin to see the house nickname as a tooltip.

**Pin colors:**
- **Green**: you interacted with a resident within the last 60 days
- **Amber**: last interaction was 61 days to 1 year ago
- **Gray**: never interacted, or it has been over a year

**Adding a house pin:**
1. Tap **+ Add House** — an amber banner appears and the cursor changes to a crosshair
2. Tap anywhere on the map image to place the pin
3. A form appears — enter the house nickname (required) and street address (optional)
4. Tap Save — the pin appears on the map

**Moving a pin:** Drag any pin to reposition it. The new location is saved automatically.

**House detail:** Tap a pin to open the house detail page. It has two sections:

**Residents section:**
- Each resident card shows their name, role (Owner, Spouse, Kid, etc.), and last interaction date
- Tap **▼ Intel** to expand a panel showing their last 2 facts and last 2 recent interactions at a glance
- Tap **Full Profile** to open their full Contact page
- Tap **×** to remove them from this house (does not delete their contact record)
- **+ From Contacts**: search your existing contacts by name, pick one, assign a role, and add them
- **+ New Person**: create a brand-new contact (saved as a Personal / Neighbor contact) and link them in one step

**House Notes section:**
- Free-form observations about the property itself — e.g., "Their landscaper is Green Thumb Co", "Ring doorbell on left side"
- Tap **+ Add Note** to log a note with a date
- Notes can be edited or deleted
- Notes are separate from person intel — they describe the house, not the residents

**When a family moves away:** Tap **Delete** on the house detail page. A dialog gives you two choices:
- **Archive — Family Moved Away**: Preserves all the history. The pin stays on the map (goes gray). You can add a note about the move (e.g., "Moved to Florida"). Then add a new family to the same pin when someone new moves in.
- **Hard Delete**: Permanently removes the pin, all house notes, all resident links, and all archived family history. Your contacts are not affected.

**Previous Families:** If a family was archived, a "Previous Families" section appears at the bottom of the house detail page. Tap an entry to open a read-only view showing who used to live there, their roles, and the archive date. You can still tap "View Contact" to see their full contact record.

**Journal Mentions:** If any current resident has been @-mentioned in a journal entry, a "Journal Mentions" section appears on the house detail page. It shows the 20 most recent journal entries that mention anyone in the house — date and a text preview. Tap a card to open the full journal entry. This section is hidden if no residents are linked or none have journal mentions.

**Pin colors update automatically** — whenever you log an interaction with a contact who is linked to a house, the pin color updates to reflect the most recent interaction date. You do not need to do anything extra.

**Tips:**
- Use a zoomed-in Google Maps screenshot for best pin placement precision
- The nickname is shown on the pin label — keep it short (e.g., "The Smiths", "Wayne & Linda")
- Log interactions via the contact's page or directly from their resident card's Full Profile link — both update the house pin color

### See Also
- [Contacts](#help/contacts)

---

## screen:checklists

### Quick Help
- Create reusable **templates** and run them as interactive to-do lists
- Active checklists stay open until you mark them complete or archive them
- Tap **✏️ Edit** on a card to reorder, add, or remove items — and to edit item text inline
- Use **📝** on any item to add or edit a note

### Details

**Templates vs. runs**: A template is a saved checklist blueprint. Tapping **▶ Start** creates a "run" — a live copy you work through. Runs are independent; edits to a run don't affect the original template.

**Indenting items**: Each item row has a `→` / `←` indent button. Click it to cycle through 3 levels: normal → indented (level 1) → double-indented (level 2) → back to normal. This button appears in both the **template editor** and in **active run cards** (when in edit mode ✏️). In the template editor you can also use **Tab** to indent and **Shift+Tab** to unindent while typing. Indentation carries over from templates into runs.

**Active run cards**:
- Items are shown directly on the card. Undone items are at the top; checked items collapse into a "▶ X completed" toggle.
- **Check an item**: tap the checkbox. A completion date is recorded and shown next to the label.
- **Edit mode** (tap ✏️): drag handles appear for reordering, ✕ buttons appear for removal, and an "Add item" row appears at the bottom. In edit mode, **tap any item's text to edit it inline** — press Enter or tap away to save, Escape to cancel.
- **Add a note to an item**: tap the 📝 icon to open a small text area below the item. Press Enter or tap away to save. Tap the note text (or 📝 again) to re-edit it.
- **Width on phone**: cards default to full-width (1-column) for readability. Use the ⊞ button to switch to a 2-column compact view. Your preference is saved.

**Completing a run**: tap ✓ in the footer — the run moves to the Completed section (toggle "Show completed" to view it).

**Archiving**: tap 📦 to archive a run without marking it complete. Toggle "Show archived" to see archived runs.

---

## screen:notes

### Quick Help
- Notebook-organized notes -- create multiple color-coded notebooks and fill them with notes
- One notebook can be set as your **default** (starred) -- QuickLog's ADD_NOTE action saves there automatically
- Global search works across all note body text
- Tap any note to open and edit it

### Details

**What notes are:** Simple free-form text notes organized into named notebooks. Different from journal entries (which are date-stamped and personal) -- notes are more like reference material, checklists, ideas, or anything you want to keep and retrieve.

**Notebooks:**
- Each notebook has a name and a color (8 preset gradient options rendered as colored cards on the notebook list).
- **Default notebook (built-in):** A "Default" gray notebook auto-created on first visit. Cannot be deleted.
- **Default notebook (user-configured):** Tap the star icon on any notebook's detail page to make it your default. Only one notebook can be the default at a time. The star label "Default" appears in the header. The SecondBrain/QuickLog "ADD_NOTE" voice command saves to your configured default notebook before falling back to the built-in Default.
- **Add a notebook:** Tap **+ Add Notebook** -- enter a name and pick a color.
- **Edit or delete a notebook:** Use the pencil icon on the notebook card. The built-in Default notebook cannot be deleted.
- **Export a notebook:** Tap **Export** on the notebook detail page. Downloads a `.json` file containing all notes and their photos (as Base64). File is named `{NotebookName}-{YYYY-MM-DD}.json`. You can use this to back up a notebook or reconstruct photos from the export.

**Notes within a notebook:**
- Tap any notebook card to open it and see its notes.
- Tap **+ New Note** to create a note. The body is a free-form textarea. Tab key inserts 4 spaces.
- After saving a new note, the app navigates back to the notebook list (not the note page).
- Tap any note card to open and edit it.
- Notes show a preview of the first line in the notebook view.
- Photos attached to a note appear as thumbnails on the note card and in full below the note body when viewing the note.

**Moving a note to a different notebook:**
- Open a note and tap **Edit**.
- A **Move to Notebook** row appears below the text area with a dropdown listing all other notebooks.
- Select the destination notebook and tap **Save** -- the note moves and the app navigates to the destination notebook.
- Leave the dropdown set to "keep in current notebook" to save in place.

**QuickLog "add a note" behavior:**
- If you say "add a note" without naming a notebook, the note goes to your configured default notebook (starred).
- Only name a notebook when you explicitly say it in your voice command (e.g. "add a note to travel"). The QuickLog does **not** infer a notebook from note content.
- If QuickLog mistakenly fires the "Add Dev Note" action (developer feedback), the confirm screen shows a **Save to** dropdown -- select your personal notebook to redirect the note (and any attached photos) there instead.

**Search:** Use the global search (magnifying glass in the nav) to search across all note body text. Results link directly to the matching note.

**Tips:**
- Use notebooks to separate categories of notes: "Work Ideas", "Recipes", "Home Projects", "Travel Research", "Meeting Notes."
- Set the notebook you write in most often as your default. Then you can say "QuickLog: add a note -- [text]" and it lands in the right place without specifying the notebook name.
- Notes are plain text only -- no formatting support. For formatted content, the Journal or Life Projects are better options.

### See Also
- [Life Home](#help/life)
- [Journal](#help/journal)

---

## screen:legacy-documents

### Quick Help
- Tap **+ Add Document** — pick Physical or Online, choose a type, fill in the details
- Drag **⠿** to reorder — put the most critical documents at the top
- Tap any row to expand and see full details
- Tap **Edit** inside an expanded row to change it, **Delete** to remove it

### Details

**What it's for:** A list of every important document your family needs to find — wills, insurance policies, deeds, online accounts, anything that matters. You control the order so the most important things are at the top.

**Adding a document:** Tap **+ Add Document**. Choose:
- **Kind** — Physical (paper) or Online (has a URL)
- **Document Type** — Will, Trust, Power of Attorney, Advance Directive, Insurance Policy, Real Estate Deed, Vehicle Title, Financial Account, Medical Records, or Other
- **Title** — what to call it (required)
- **Why it matters** — a sentence or two so your family knows what this is for
- **URL** (Online only) — the link, shown as a clickable link in the list
- **Where is it** (Physical only) — free-form: "filing cabinet in office, red folder" or "Attorney Jane Smith, 123 Main St, 612-555-1234"

**Reordering:** Grab the **⠿** handle on the left of any row and drag it up or down. Order is saved immediately. Put the will and healthcare directive first — those are what families need most urgently.

**Expanding a row:** Tap anywhere on a row (except the drag handle) to expand it and see all the details. Tap again to collapse.

**Editing / Deleting:** Expand a row, then tap **Edit** or **Delete**. Delete asks for confirmation.

---

## screen:legacy-notify

### Quick Help
- Tap **+ From Contacts** to add someone from your Contacts list — their phone, email, and relationship are pulled in automatically
- Tap **+ Add Manually** to add someone not in your contacts — fill in name, phone, email, address, and how you know them
- Free-form entries are editable — tap anywhere on a row to edit (or delete from inside the edit screen)
- Contact-linked entries can only be deleted (edit their info in the Contacts section instead)
- Email addresses in the list are clickable — tap to open your email app for a single person
- Tap **✉ Notify All** to compose one message and open your email app with all addresses pre-filled

### Details

**What it's for:** A list of people your family should call or notify after you pass — friends, colleagues, organizations, or anyone who should hear the news directly.

**From Contacts:** Tap **+ From Contacts**. An inline search box appears — type a name to search your Contacts list and tap to select. The person is added immediately. Their phone number, email, and "how I know them" are read live from Contacts every time the page loads — if you update their contact record later, the changes appear here automatically. Contacts can only be deleted from this list (not edited here).

**Add Manually:** Tap **+ Add Manually** to open a form. Fill in:
- **Name** (required)
- **Phone**
- **Email**
- **Address**
- **How do I know them** — e.g. "College friend", "neighbor", "book club"

Tap **Save**. To edit later, tap anywhere on that row. To delete, open the edit form and tap **Delete**.

**The list:** Each row shows name · phone · email on the first line, and "how I know them" on the second line. Email addresses are clickable links — tap one to open your email app addressed to that person. Both types (contact-linked and manual) look the same in the list.

**Notify All:** When at least one person has an email address, a **✉ Notify All** button appears in the header. Tap it to open a compose panel where you write a subject and message. Tap **Open in Email** and your email app opens with all email addresses in the To field and your message pre-filled — just hit Send.

---

## screen:legacy-message

### Quick Help
- **Instructions** — tell your family when and how to share this message (read at service, email it out, give to one person)
- **Message** — write whatever you want to say; there are no rules
- Both fields save automatically when you click away

### Details

**What it's for:** A final message in your own words — something to be read at your memorial, sent to your family, or left for whoever finds this section. You decide.

**Instructions (3-line box):** Tell your family what to do with it. Examples: "Read this aloud at my memorial service", "Email a copy to everyone who attended", "Give this to Karen privately."

**Message (tall box):** Write freely — to the room, to your family, to no one in particular. There's no structure, no format, no limit.

**Saving:** Both fields save automatically when you click away. There's no Save button.

---

## screen:legacy-pets

### Quick Help
- Tap **+ Add Pet** to add a pet — it opens automatically so you can fill it in right away
- Tap a pet's name bar to expand or collapse it
- Name and instructions save automatically when you click away
- Tap **Delete** to remove a pet (asks for confirmation)

### Details

**What it's for:** Tell your family what to do with your pets after you're gone — who should take them, feeding routines, vet contact info, medications, anything the new caretaker needs to know.

**Adding a pet:** Tap **+ Add Pet**. A new card appears at the top, already open. Fill in the name and instructions, then click away to save.

**Editing:** Tap any pet's name bar to expand it. Edit the name or instructions directly — saves automatically when you click away.

**Deleting:** Expand a pet card and tap **Delete**. You'll be asked to confirm before it's removed.

---

## screen:legacy-service

### Quick Help
- Choose your service type, location, and who should officiate
- List any songs you want played in the Music box
- Use My Wishes for everything else — flowers, casket, reception, things you don't want
- Auto-saves when you click away from any field

### Details

**Type of Service:** Traditional Funeral, Memorial Service, Celebration of Life, Graveside Only, No Service, or Other.

**Location Preference:** Multi-line text box — a church name, address, outdoor location, or just "no preference."

**Who Should Officiate:** Multi-line text box — a pastor, celebrant, specific family member by name, or "no preference."

**My Wishes:** The catch-all box — flowers vs. donations to charity, open or closed casket, whether you want a reception, specific things you definitely do or don't want. Write in plain English. Tap 🎙️ **Speak** to dictate by voice.

**Music:** Listed last. Multi-line — list as many songs as you want. Include artist and timing if you like (entry, during, closing, reception).

---

## screen:legacy-burial

### Quick Help
- Pick your disposition type, describe your wishes in plain English, and add any reference links
- Check the pre-arrangement box if you've already made funeral arrangements
- Auto-saves when you click away from any field

### Details

**Disposition Type:** Choose how you want your remains handled — Cremation, Burial, Body donation to science, Natural/green burial, or Other.

**My Wishes:** Write anything in plain English — where to scatter ashes, which cemetery, special requests. This is the main thing your family will read.

**Reference Links:** Add labeled links your family should visit — a tombstone you like, a cemetery website, a memorial planner, etc. Each entry has a label and a URL.

**Pre-arrangement:** Check this if you've already made funeral arrangements. Fill in the funeral home name, phone, payment status (paid in full / deposit paid / not yet paid), where the documents are kept, and any notes.

---

## screen:legacy-letters

### Quick Help
- Each card is one letter — tap to open and edit it
- Use **Add Letter** to start a new letter to someone
- Pick from your contacts or just type the person's name
- Tap **Print** to print the letter (only the recipient, date, and letter text print — no titles or instructions)

### Details

**What it's for:** Personal letters to people you love — to be opened and read after you're gone. Each letter is its own record: you can write as many as you want to the same person or different people.

**Adding a letter:** Tap **+ Add Letter** in the header. A blank letter is created and you go straight to the edit page.

**Recipient:** Use the contact search field to link the letter to someone in your contacts. If the person isn't in your contacts, just type their name in the "Not in contacts?" field below the picker. If you select a contact, the typed name is cleared automatically.

**Title:** For your reference only — helps you find the letter in the list. It is not printed.

**Instructions:** Notes about when or how to deliver the letter (e.g., "Open this on your 30th birthday"). Not printed.

**Letter body:** Write freely. Tap **🎙️ Speak** to dictate by voice — it appends spoken words to the text box.

**Printing:** Tap **🖨️ Print** to print the letter. Only the recipient name, date written, and letter body appear on the printed page — nothing else.

**Auto-save:** All fields save automatically when you click away.

---

## screen:legacy-letter

### Quick Help
- Fill in recipient, title (internal only), optional delivery instructions, and your letter
- Tap 🎙️ Speak to dictate the letter by voice
- Tap 🖨️ Print to print — only the recipient name, date, and letter body are printed

### Details

See `screen:legacy-letters` above for full details on the letter form.

---

## screen:legacy-accounts

### Quick Help
- Hub for all financial information your loved ones will need: Accounts, Loans, Bills, Insurance
- Each tile links to a separate list — all protected by your Legacy Passphrase
- Use the person switcher at the top of each tab to filter by enrolled person

### Details

**What Financial Accounts is:** A secure, organized record of every financial obligation and asset your family needs to manage after you're gone — loan payoffs, recurring bills, insurance policies, and existing investment accounts. Everything in one encrypted place.

**Person switcher:** All sub-tabs (Loans, Bills, Insurance) share a person filter. Select the person whose records you want to view or edit. The selection persists as you move between tabs.

**Passphrase:** All content here is encrypted and requires your Legacy Passphrase to view. This is the same passphrase used across all encrypted Legacy sections. Once entered it stays unlocked for the browser session.

**Tabs:**
- **Accounts** — reads from the Investments section; shows financial accounts (bank, retirement, brokerage) linked to each enrolled person
- **Loans** — mortgages, car loans, credit cards, personal loans, and other debts
- **Bills** — recurring expenses and auto-pay items your family will need to continue or cancel
- **Insurance** — life, health, and other insurance policies with claim contact info
- **Financial Plan** — big-picture written instructions *(coming soon)*

---

## screen:legacy-financial-loans

### Quick Help
- Track every loan and debt: mortgage, car, credit cards, student loans, personal loans
- Collapsed cards show lender, balance, and payment method at a glance
- Tap a card to expand and see full details; tap Edit to view or change encrypted fields
- Archive paid-off loans instead of deleting them

### Details

**Card display (collapsed):** Loan type badge · lender · current balance · auto-pay badge (green Auto / yellow Manual).

**Card display (expanded):** All fields plus calculated **Months Left** (based on payoff date) and **Est. Remaining** (months × monthly payment). These are estimates — not stored, recalculated each time.

**Fields:** Loan type (combo — pick or type your own), lender, current balance, monthly payment, interest rate, payoff date, loan start date, account number, whose name the loan is in, how it's paid (Automatic / Manual), what to do upon my death (free text), notes.

**Edit-only fields (not shown in expanded card):** Website URL, username (encrypted), password (encrypted). These are visible only in the Edit form after unlocking.

**Archive vs. Delete:** When a loan is paid off, use Archive to hide it from the main list. Archived loans can be restored. Use "Show Archived" to reveal them.

**Reorder:** Drag the ⠿ handle to set the display order. Prioritize the most important loans at the top.

---

## screen:legacy-loans-form

### Quick Help
- Fill in as much or as little as you know — all fields are optional except type and lender
- Sensitive fields (username, password) are encrypted automatically when saved
- Cancel returns to the loans list without saving

### Details

All fields are optional. Fill in what's relevant. The form collects the same fields as described in `screen:legacy-financial-loans`. Loan type is a combo box — pick from the list or type a custom type. Payoff date drives the calculated Months Left on the card. Username and password are encrypted with your Legacy Passphrase before being stored in Firestore.

---

## screen:legacy-financial-bills

### Quick Help
- Track every recurring expense your family will need to manage: utilities, subscriptions, insurance, mortgage
- Collapsed cards show category, payee, amount, and when it's due
- Tap a card to expand and see full details; tap Edit to view or change encrypted fields
- Archive cancelled or closed bills instead of deleting them

### Details

**Card display (collapsed):** Category badge (teal) · payee · estimated amount · frequency · due date.

**Card display (expanded):** All non-sensitive fields — category, payee, amount, frequency, due date, whose name, payment method, what credit card (if applicable), notes.

**Edit-only fields (not shown in expanded card):** Website URL, username (encrypted), password (encrypted), account number, address. Visible only in the Edit form.

**Due date:** Free-form text — type whatever makes sense: "15th", "1st of month", "March each year", "quarterly in January". No date picker; flexibility is intentional.

**Categories:** Mortgage/Rent, Utilities, Insurance, Subscriptions, Phone, Internet, Car Payment, Medical, Other — or type your own.

**Frequencies:** Monthly, Quarterly, Annually, Weekly, Bi-weekly, Bi-monthly, As Needed.

**Archive vs. Delete:** Archive a bill when it's cancelled or no longer relevant. The record is preserved for reference.

---

## screen:legacy-bills-form

### Quick Help
- Fill in as much or as little as you know — all fields are optional
- Due date is free-form text: type "15th", "March", or whatever describes the billing cycle
- Sensitive fields (username, password) are encrypted automatically when saved

### Details

All fields are optional. Due date is intentionally free-form — type any text that describes when the bill is due. Category is a combo box (pick or type your own). Username and password fields are encrypted with your Legacy Passphrase before being stored. Account number and address are stored in plain text in Firestore.

---

## screen:legacy-financial-insurance

### Quick Help
- Track life insurance, health insurance, and any other policies your family needs to know about
- Collapsed cards show policy type, company, and coverage amount
- Tap a card to expand and see claim contact info and instructions; tap Edit for login credentials

### Details

**Card display (collapsed):** Policy type badge (purple) · company name · coverage amount.

**Card display (expanded):** Policy type, company, policy number, beneficiary, agent name, agent phone, claims phone number, where the paper policy is located, premium amount, premium frequency, and what to do upon my death (your instructions for filing or handling the policy).

**Edit-only fields (not shown in expanded card):** Website URL, username (encrypted), password (encrypted). Visible only in the Edit form after unlocking.

**Policy types:** Term Life, Whole Life, Universal Life, Group / Employer, Other — or type your own.

**What to do upon my death:** Plain text field — use this to tell your family exactly what steps to take: who to call, what forms to file, where to send the death certificate, etc.

**Archive vs. Delete:** Archive lapsed or cancelled policies instead of deleting them.

---

## screen:legacy-insurance-form

### Quick Help
- Fill in as much or as little as you know — all fields are optional
- "What to do upon my death" is the most important field — give your family clear next steps
- Sensitive fields (username, password) are encrypted automatically when saved

### Details

All fields are optional. Policy type is a combo box (pick or type your own). Premium frequency uses the same options as Bills (Monthly, Quarterly, Annually, etc.). Username and password are encrypted with your Legacy Passphrase before being stored in Firestore. The "What to do" field is plain text — no length limit.

---

## screen:legacy-financial-plan

### Quick Help
- Six prompted sections — write as much or as little as you want in each one
- Each section saves automatically when you click away
- Use 🎙️ Speak to dictate instead of type — works great for longer thoughts
- Switch the person at the top to write a plan for a spouse or other enrolled person

### Details

**What it's for:** The big-picture narrative that ties all your financial records together. Each account, loan, and bill already has its own "What to do" field for tactical instructions. This plan is the strategic layer — the human context your loved one needs to understand the full picture and know where to start.

**Sections:**

- **The Big Picture** — Overall situation. Are things in good shape? Any complications upfront?
- **First Things — What to Do** — Week 1–2 priorities. What auto-pays and can wait? What stops? Who to call before any big decisions?
- **Key People to Call** — Financial advisor, accountant, attorney, HR/benefits. Name, firm, phone, why to call. Can also reference Contacts or People to Notify.
- **Investments & Retirement** — What to do (or not do) with investment accounts. Tax implications, rollover guidance, time horizon.
- **My Wishes for the Money** — Keep the house or sell? Help kids/grandkids? Charitable giving? Your intent, in your own words.
- **Anything Else** — Whatever doesn't fit above.

**Tips:**
- Fill in sections in whatever order makes sense — they are independent.
- Leave sections blank if they don't apply to your situation.
- The prompts under each label are guides — ignore them and write freely if you prefer.
- This plan is not encrypted (it is narrative, not credentials), but it is still behind your Legacy Passphrase.

---

## screen:lifecalendar

### Quick Help
- Life Calendar for major events -- trips, concerts, appointments, milestones, goals, relationship events
- Two views: **List** (upcoming/past, filterable) and **Grid** (monthly calendar view)
- Health appointments also appear on this calendar automatically
- Events can have a location, linked people, categories, mini-log notes, and a status

### Details

**What the Life Calendar is:** A place to track significant life events -- things worth remembering and planning for. Different from the Yard Calendar (which tracks recurring maintenance) -- this is for your life: vacations, concerts, weddings, doctor appointments (shown automatically), anniversaries, fitness goals, home projects with a timeline.

**Event status values:**
- **Upcoming** -- scheduled in the future
- **In Progress** -- event spans multiple days and today is within the range
- **Attended / Completed** -- you went / it happened
- **Missed** -- scheduled but did not happen
- **Did Not Go** -- chose not to attend

**List view:**
- Default filter: Upcoming events only (startDate >= today)
- Status filter dropdown: Upcoming, Upcoming + Attended, Attended, Missed, All
- Category filter: filter by custom color-coded categories
- **Show Past 30 Days toggle** (list view only): when ON, extends the date window 30 days back and shows attended/missed events from that period too. Off by default and resets on each page load.
- Health appointments appear automatically in the Upcoming and Upcoming + Attended filters as red "Appt" badge cards. Clicking navigates to the Appointments page.

**Grid view:**
- Monthly calendar grid showing colored event bars on their start dates
- All events visible regardless of status filter -- past, present, future
- Health appointments always appear (non-cancelled) regardless of status filter
- Scroll or use the month navigation to browse any month

**Adding an event:**
- Tap **+ Add Event** (or **+ Life Event** / **+ New**)
- **Title, start date, end date** (optional; end date cannot be before start date)
- **Start time, end time** (optional)
- **Category:** Color-coded category. Manage categories in the category settings.
- **Status:** Set initial status (usually Upcoming for a new event)
- **Location:** Two modes -- Contacts (pick from your contacts list, stores a link) or Manual (type a city, venue, or address). Contacts mode hides Personal contacts by default; check "Show Personal" to include them. On events happening today, the linked contact's address and phone appear as tappable links on the event card.
- **People:** Tag contacts from your contacts list who are involved in this event. Tagged events appear on each person's detail page under "Shared Life Events."
- **Description:** Free-form description of the event.
- **Mini Log:** A journal-style notes area attached directly to the event. Mini log entries appear in the main journal feed (toggle "Show Event Notes" to include/exclude them).
- Saving a new event navigates back to the Life Calendar list. Saving an edited event also returns to the list.

**Event detail page:** Tap any event card in the list to open its edit form. All fields editable. The mini log entries appear below the form.

**Mini logs:** You can add timestamped notes to a life event over its duration (e.g., daily travel diary entries). These flow into the journal's All Activity timeline and appear in the feed with "Show Event Notes" enabled.

**Adding to Google Calendar:** Each event card in the list view shows a **+ Add to Google Calendar** link. Tapping it opens a pre-filled Google Calendar "new event" page in a new tab — no sign-in to the app required. The link is only shown when Google Calendar sync is not connected (once connected, syncing is automatic). Health appointment cards do not show this link.

**Auto-sync (when connected):** If Google Calendar is connected in Settings, life events are pushed to your Google Calendar automatically when you create, edit (including status changes), or delete them. Timed events (with a start time) sync as timed GCal events; events without a time sync as all-day events. Status is reflected in the GCal event title — attended events show ✓, "didn't go" shows ✗.

**Tips:**
- The location-contact link is most useful when the venue has a contact record with an address -- then the address auto-appears as a Maps link on today's events on the Life home page and the calendar card.
- Tag people on events to build a history of shared experiences. A person's contact detail page shows all life events they were tagged in.
- Use categories and colors to distinguish event types at a glance in the grid view: trips (blue), health appointments (auto-red), concerts (orange), family (green).
- Health appointments appear automatically from the Health section -- you do not add them here. Completing them in Health (Mark Done) is what converts them to visits.

### See Also
- [Life Home](#help/life)
- [Journal](#help/journal)
- [Contacts](#help/contacts)
- [Appointments](#help/health-appointments)


---

## screen:vehicles

### Quick Help
- Track your vehicles with full maintenance history, mileage log, photos, and documents
- Each vehicle has a detail page with collapsible sections: info, mileage, photos, activities, calendar, problems, facts, quick tasks
- Archived (sold/gone) vehicles move to a collapsed section -- history is fully preserved
- Log mileage readings over time to track odometer history

### Details

**What vehicles are:** A place to keep a complete record of every vehicle you own or have owned -- car, truck, motorcycle, boat, etc. Each vehicle is its own record with all its history attached.

**Vehicle list page:**
- Cards show year, make, and model as the title; color and license plate as the subtitle; and the profile photo thumbnail if one is set.
- **+ Add Vehicle** opens the add form. Required fields: year, make, model. Optional: trim, color, VIN, license plate, purchase date, purchase price, notes.
- Archived vehicles do not appear in the main list. A collapsed **Archived** section at the bottom of the page shows sold or gone vehicles -- click to expand it.

**Vehicle detail page:**
- All sections are collapsible accordions (tap the section header to expand/collapse).
- **Vehicle Info** -- expanded by default. Shows all vehicle fields in an editable form. Tap **Save** to update. Fields: year, make, model, trim, color, VIN, license plate, purchase date, purchase price, notes.
- **Mileage Log** -- odometer readings over time, newest first. Add an entry with date, odometer reading, and optional notes. Each entry shows a delete button. Useful for tracking oil change intervals or high-mileage milestones.
- **Photos** -- photo gallery with profile photo support. The first photo uploaded auto-sets the thumbnail shown on the vehicle list card.
- **Activity History** -- log maintenance events (oil change, tire rotation, inspection, repairs). Same activity logging used across the entire app.
- **Calendar Events** -- upcoming maintenance reminders, registration renewals, or any vehicle-related calendar event.
- **Problems / Concerns** -- open issues: warning lights, body damage, mechanical concerns. Open/resolved statuses.
- **Facts** -- key facts: insurance policy number, lien holder, extended warranty expiration, garage location.
- **Quick Task List** -- to-do items: "Get snow tires mounted", "Fix passenger window seal".

**Archiving a vehicle:**
- Use the **Archive** button on the vehicle detail page when you sell or dispose of a vehicle. Enter an optional reason ("Sold to John", "Trade-in").
- Archived vehicles disappear from the main list but all history is kept. Expand the Archived section to view them.
- Use **Unarchive** to restore a vehicle to the active list if needed.

**SecondBrain integration:** You can log mileage via SecondBrain ("Add 35K miles to the truck") and it will create a mileage log entry on the matching vehicle.

**Tips:**
- Set a profile photo on each vehicle -- it makes the list much easier to scan than text-only cards.
- Use Facts to store insurance and registration info -- everything in one place, accessible from your phone.
- The Activity log doubles as a maintenance record -- log every oil change, inspection, and repair so you have a timestamped history if you ever sell the vehicle.

### See Also
- [Garage](#help/garage)
- [Structures](#help/structures)

---

## screen:garage

### Quick Help
- Inventory what is stored in your garage and attic -- organized by room (space), things, and sub-things
- Two default spaces are pre-created: Garage and Attic -- rename them or add more
- Things support category badges, photos, activities, problems, facts, quick tasks, and calendar events
- Use the **+ From Photo** AI identification button to identify and log items from photos

### Details

**What the Garage section is:** A structured inventory of your garage and attic (or any storage space). Mirrors the House section structure but is kept separate -- organized as rooms (spaces) → things → sub-things.

**Garage room list page:**
- Two rooms are auto-created on your first visit: **Garage** and **Attic**. You can rename them.
- Tap any room card to open it and see its contents.
- **Rename** a room via the pencil icon on the card.
- Rooms cannot be deleted if they contain things -- remove things first.

**Garage room detail page (collapsible accordions, all collapsed by default):**
- **Photos** -- photos of the room/space itself.
- **Things** -- list of items stored in this space. Each item card shows name, category badge, and a thumbnail. Tap to open the thing detail page.
- **Activity History** -- maintenance activities tied to the room (cleaning, reorganizing, etc.).
- **Calendar Events**, **Problems / Concerns**, **Facts**, **Quick Task List** -- same shared sections as all other entities.

**Things:**
- **+ Add Thing** -- fills in: name (required), category, description, purchase date, estimated worth, notes.
- **Categories**: Furniture, Appliance, Ceiling Fan, Ceiling Light, Electronics, Other. Each renders a colored category badge on the card.
- **+ From Photo** -- AI identification. Select up to 4 photos; the LLM identifies the item and pre-fills the form. Requires LLM to be configured in Settings.
- **Edit** and **Delete** buttons on each card.
- Tap a thing card (not a button) to open the thing detail page.
- A thing can be **moved** to a different room via the Move button on its detail page.

**Thing detail page (collapsible accordions):**
- **Inventory Details** -- purchase date, worth, description, notes in a read-only display.
- **Sub-Things** -- items within or associated with this thing (e.g., accessories, components, manuals).
- **Photos**, **Activity History**, **Calendar Events**, **Problems / Concerns**, **Facts**, **Quick Task List** -- all shared cross-entity sections, same as everywhere else.

**Sub-things:**
- Added from the thing detail page. Fields: name (required), description, purchase date, worth, notes.
- Sub-things have their own detail pages with the same cross-entity sections.
- A sub-thing can be moved to a different parent thing via the Move button.

**Breadcrumbs:** Navigation crumbs at the top of thing and sub-thing pages show the full path (Garage → Attic → Power Tools → Drill) so you always know where you are and can navigate up.

**Goes to (if I die):**
- Each thing and sub-thing has a **Goes to** field in its add/edit form -- pick a contact from your Contacts list.
- If you assign a beneficiary to a Thing, all its Sub-Things inherit that assignment automatically unless overridden.
- The "Goes to" row appears on each detail page (yellow badge). If inherited, it shows "(inherited from [Parent Name])".
- To see everything assigned to a specific person, use **Who Gets What** in the House More section.

**Tips:**
- Use Facts on a thing to record serial numbers, model numbers, and warranty expiration dates -- critical for appliances and electronics.
- The + From Photo button is the fastest way to log items. Point your camera at a tool or appliance and the AI fills in the name, category, and description.
- Rename "Garage" and "Attic" to match how you actually think of your spaces (e.g., "Workshop" or "Storage Loft").

### See Also
- [House](#help/house)
- [Structures](#help/structures)
- [Vehicles](#help/vehicles)

---

## screen:structures

### Quick Help
- Track outdoor structures -- sheds, decks, pergolas, gazebos, pools, fences, etc.
- Each structure has photos, activities, calendar events, problems, facts, and quick tasks
- Mark a structure as "Storage" to unlock a Things inventory section inside it
- Things and sub-things inside storage structures support the same AI photo identification as the Garage

### Details

**What structures are:** A dedicated section for outdoor structures separate from the main house -- anything built in your yard or on your property that you want to track separately. Examples: shed, deck, pergola, gazebo, pool, fence, playhouse, workshop.

**Structure list page:**
- Each card shows the structure name and type. A **Storage** badge appears if the structure is marked as a storage space (shed, etc.).
- **+ Add Structure** -- fields: name (required), type (free text, e.g., "Shed", "Deck"), storage toggle (enables Things section), notes.
- **Edit** and **Delete** buttons on each card. Deleting a structure deletes all its contents.
- Tap a card to open the structure detail page.

**Structure detail page (collapsible accordions, all collapsed by default):**
- **Photos** -- photos of the structure itself.
- **Things** -- only visible if the structure is marked as Storage. Same inventory system as the Garage.
- **Activity History** -- maintenance events (painting, repairs, power washing, sealing).
- **Calendar Events** -- upcoming maintenance, e.g., "Deck staining due in spring".
- **Problems / Concerns** -- open issues: rot, leaks, cracked concrete, pest damage.
- **Facts** -- built year, square footage, builder, permit number, material type.
- **Quick Task List** -- project to-dos: "Restain deck boards", "Replace shed door latch".

**Storage structures -- Things and Sub-Things:**
- Enable the **Is Storage** toggle when adding or editing a structure to unlock the Things section.
- The toggle is disabled (locked) if the structure already has things recorded -- remove things first before toggling off.
- Things inside structures work identically to Garage things: categories, AI photo identification, sub-things, move support, and all cross-entity sections.
- **Thing categories for structures**: Appliance, Auto, Chemical, Electronics, Fixture, Furniture, Power Tools, Tools, Other.
- **+ From Photo** (AI identification) -- stages photos and sends to the LLM to identify the item and pre-fill the form. Requires LLM configured in Settings. An optional "Show AI Response First" toggle lets you review before auto-saving.

**AI identification details:**
- Open a structure thing, tap **+ From Photo**, select photos, and tap Identify.
- The LLM returns a structured response: name, category, description, notes.
- If "Show AI Response First" is toggled on, a review modal appears before saving so you can edit the result.
- Photos are attached to the newly created item automatically.

**Move:** Things and sub-things can be moved between structures (or to a garage room) via the Move button on their detail page.

**Tips:**
- Even if a structure is not for storage, add it here so you have a maintenance history, photos, and problem log in one place.
- The deck, fence, and pool are easy to forget until they need attention. Use Problems to track known issues and Quick Tasks for upcoming repairs.
- Use Facts to store builder info, permit numbers, and warranty details for newer structures.

### See Also
- [Garage](#help/garage)
- [Yard Home (Zones)](#help/zones)
- [House](#help/house)

---

## screen:collections

### Quick Help
- Track physical collectible inventories: comics, records, hats, hat pins, Beanie Babies, Ceramic Stadiums, books/magazines, or any custom Generic collection
- Each collection is typed -- type-specific fields auto-appear for each item (series + issue # for comics, artist + album for records, etc.)
- Use **+ From Photo** to let the AI identify and log collectibles from photos
- Items support photos, acquired date, price paid, estimated value, location reference, and notes

### Details

**What collections are:** A structured inventory for physical collectibles. Instead of one giant list, each collection has a type, and each item within it gets type-specific fields. The app knows that comics have issue numbers and records have formats -- so the right fields show up automatically.

**Collections list page:**
- Each card shows the collection name, type badge, item count, and total estimated worth (sum of all item estimated values).
- **+ Add Collection** -- name (required), type (select from list below), and for Generic type: up to 3 custom label names.
- **Edit** button on each card to rename or change custom labels. Type cannot be changed after items are added.
- Tap a card to open the collection detail page.

**Collection types and their type-specific fields:**

| Type | Type-Specific Fields | Sort Order | Search Field |
|------|---------------------|------------|--------------|
| Comics | Series, Issue #, Variant, Publisher, Year | Series A-Z → Issue # | Series |
| Records/Albums | Format (LP/45/Cassette/CD/8-Track), Artist, Album, Label, Year | Format → Artist → Album | Artist |
| Hats | Style, Color, Brand, Year | Name A-Z | Name |
| Hat Pins | Description | Name A-Z | Name |
| Beanie Babies | Style, Year, Has Tags (checkbox) | Name A-Z | Name |
| Ceramic Stadiums | Team, Year | Name A-Z | Name |
| Books & Magazines | Type (Book/Magazine), Author, Publisher, Year, ISBN, Issue Date | Name A-Z | Title + Author |
| Generic | Three custom-labeled fields (you name them) | Name A-Z | Name |

**Collection detail page:**
- Header shows item count and total estimated worth.
- **Filter bar** -- pre-labeled based on type ("Filter by series...", "Filter by artist...", etc.). Client-side search within the current collection.
- Item rows show: 48×48 thumbnail, name, key field (series/artist/style/team/author), estimated value.
- **+ Add Item** -- opens the item form with type-specific fields injected automatically.
- **+ From Photo** -- AI identification. Takes photos, sends to LLM with type context, and auto-saves the item with photos attached. Thumbnail is set from the first photo. Button only appears if LLM is configured in Settings.

**Collection item detail page:**
- All type-specific fields displayed in a detail card.
- **Acquired Date** -- when you got it.
- **Price Paid** -- what you paid.
- **Estimated Value** -- current estimated worth (used in the collection's total).
- **Location Reference** -- where it is stored: link to a House Room, House Thing, or Garage Room from your existing inventory. Alternatively, free-text location (e.g., "Shelf 3, Box B").
- **Notes** -- free-form notes about the item.
- **Photos** -- full gallery. First photo auto-sets the list thumbnail.
- **Edit** and **Delete** buttons. Deleting is permanent.

**AI photo identification:**
- On the collection detail page, tap **+ From Photo**.
- Select photos of the item (can be multiple angles).
- The LLM receives the photos and your collection type, then returns structured fields appropriate to that type.
- The item is auto-saved with the fields filled in and photos attached.
- A result modal confirms what was saved and offers an "Another" button to immediately identify the next item.

**Location reference:**
- Tap the location button on an item detail page to assign a location.
- Pick from House Rooms, House Things, or Garage Rooms -- categorized in a grouped picker.
- The assigned location appears as a tappable link on the item page, navigating directly to that room or thing.
- Use **Clear Location** to remove an assigned location.

**Goes to (if I die):**
- Each collection and each item has a **Goes to** field in its add/edit form -- pick a contact from your Contacts list.
- If you assign a beneficiary to a Collection, all items in it inherit that assignment automatically unless a specific item overrides it.
- The "Goes to" row appears on the collection detail page and on each item detail page (yellow badge). If inherited, it shows "(inherited from [Collection Name])".
- To see everything assigned to a specific person across all collections, use **Who Gets What** in the House More section.

**Tips:**
- For comics, the series + issue number combination makes the sort and filter extremely useful -- browse by series name instantly.
- For records, the format filter lets you quickly see only your LPs or only your 45s.
- For Generic collections, name the three label fields when creating the collection -- you cannot change them later without losing the label context.
- The Total Estimated Worth on the collection card gives you an at-a-glance valuation as you add items. Great for insurance purposes.
- Photos are stored on the item record -- add multiple angles for valuable items.

### See Also
- [House](#help/house)
- [Garage](#help/garage)

---

## screen:beneficiaries

### Quick Help
- See everything that goes to a specific person if you die -- across House Things, Garage, Structures, and Collections
- The dropdown shows only people who actually have items assigned -- no searching required
- Select "All People" to see everyone's assignments grouped by person
- Use "Show inherited" to include items that inherit a beneficiary from a parent
- Use "Print / PDF" to generate a printable list from your browser

### Details

**What "Who Gets What" is:** A summary page that answers the question "what does [Person] receive?" It reads beneficiary assignments from Things, Sub-Things, Items, Garage Things/Sub-Things, Structure Things/Sub-Things, Collections, and Collection Items, then groups and displays everything assigned to the selected contact.

**How to use it:**
1. Open the House section and tap **More → Who Gets What**.
2. The dropdown is pre-populated with only people who have at least one direct beneficiary assignment.
3. Select a specific person to see their items grouped by section (House Things, Garage Things, etc.).
4. Select **— All People —** to see everyone grouped by person, each showing their total item count.
5. Each row shows the item name, its path (e.g., "House › Pin Collection"), and a **direct** or **inherited** badge -- all on one line.

**Show inherited toggle:** By default, only directly assigned items are shown. Check **Show inherited** to also include items that inherit a beneficiary from a parent entity (e.g., a collection item inheriting from the collection). This is useful if you want to verify complete coverage, but for large collections you may prefer to leave it off.

**Print / PDF:** Tap the **Print / PDF** button to open your browser's print dialog. Select "Save as PDF" as the destination to download a clean printable list. The navigation and controls are hidden from the printed output. When a single person is selected, the printout includes an "Items for: [Name]" heading so it's clear who the list belongs to. When "All People" is selected, each person prints on their own page.

**Setting beneficiaries:**
- Open any Thing, Sub-Thing, Item, Garage Thing/Sub-Thing, Structure Thing/Sub-Thing, Collection, or Collection Item and tap **Edit**.
- The **Goes to (if I die)** field has a contact picker -- search for and select the person.
- Save the record. The yellow "Goes to" row now appears on the detail page.
- To inherit from the parent, simply leave the field empty.
- To clear a direct assignment (reverting to inherited), open Edit and clear the field.

**Inheritance rules:**
- House: SubThingItem → SubThing → Thing (nearest parent with a beneficiary wins)
- Garage: GarageSubThing → GarageThing
- Structures: StructureSubThing → StructureThing
- Collections: CollectionItem → Collection
- If no entity in the chain has a beneficiary, the "Goes to" row is hidden.

**Tips:**
- Assign at the collection/thing level to cover everything at once -- only override individual items when a specific item goes to someone different.
- Use "All People" view to spot gaps -- if someone is missing or has far fewer items than expected, investigate.
- The summary page is useful for estate planning discussions -- quickly verify that every major item is covered.

### See Also
- [House](#help/house)
- [Garage](#help/garage)
- [Collections](#help/collections)

---

## screen:thoughts

### Quick Help
- Thoughts is your personal reflection hub -- three sub-sections: Top 10 Lists, Memories, and My Thoughts
- Tap any tile to jump directly to that sub-section
- thoughtsNav bar at the top links to all three sub-sections from anywhere in Thoughts

### Details

**What Thoughts is:** A section for the more reflective, personal side of your inner life -- ranked lists, recorded memories, and your personal thoughts. Separate from the Journal (which is day-to-day logging) -- Thoughts is for content you want to capture and revisit over time.

**Three sub-sections:**
- **Top 10 Lists** -- ranked lists of anything: favorite movies, best restaurants, top albums, greatest players. Each list is its own document with up to 10 (or more) ranked entries.
- **Memories** -- long-form personal memory records. Richer than a journal entry -- memories have a title, when/where, tags, @mentions of people, linked URLs, linked other memories, and a full body textarea.
- **My Thoughts** -- four types of personal writing: Views (opinions), Reflections (essays on experiences), Advice (guidance you'd pass on), and Reviews (books, movies, experiences). Each thought has versioned history so you can see how your thinking has evolved over time.

**Thoughts landing page:** Shows three tiles with live counts (e.g., "Top 10 Lists (12)"). Tap any tile to enter that sub-section. The thoughtsNav bar at the top always shows Top 10 Lists / Memories / My Thoughts links so you can jump between sub-sections without returning here.

### See Also
- [Top 10 Lists](#help/top10lists)
- [Memories](#help/memories)
- [My Thoughts](#help/views)

---

## screen:top10lists

### Quick Help
- Create and maintain ranked Top 10 Lists for any topic -- movies, books, restaurants, albums, and more
- Sort by Newest, Oldest, A-Z, or By Category -- preference is saved across sessions
- Categories (Books, Movies, Music pre-seeded) keep your lists organized; add your own in Manage Categories

### Details

**What Top 10 Lists are:** A structured way to capture your ranked opinions. Each list has a title, a category, and a set of ranked items (any number -- the name says "Top 10" but you can have more or fewer).

**List page:**
- Lists display in an accordion. Tap a list header to expand it and see its ranked items. Tap again to collapse.
- **Sort control:** Dropdown (Newest First / Oldest First / A–Z / By Category) + Sort button. Your selection is saved and persists across sessions.
- **By Category sort:** Changes to a two-level accordion -- outer groups are categories (None first, then alphabetical), each showing its list count. Inner items are the lists in that category.
- **+ New Top 10 List:** Opens the create page.

**Create / Edit page:**
- **Title** -- name of the list (required).
- **Category** -- pick from your saved categories. Leave blank to leave it uncategorized.
- **Items:** One row per ranked item, numbered automatically. Add items with the + button. Drag to reorder (drag handle on left). Delete individual items with the × button.
- Save returns to the list page with the saved list auto-expanded.
- Cancel returns without saving.

**Categories:**
- Three categories are pre-seeded on first use: Books, Movies, Music. You can add your own.
- Tap **Manage Categories** (link at the top of the list page) to add, rename, or delete categories.

**Tips:**
- Use the "By Category" sort if you have many lists -- grouping by category makes it easy to find a specific list without scrolling through everything.
- Lists can have any number of items -- "Top 5", "Top 20", or however many you want.

### See Also
- [Thoughts Home](#help/thoughts)
- [Memories](#help/memories)
- [My Thoughts](#help/views)

---

## screen:memories

### Quick Help
- Long-form personal memory records -- richer than a journal entry
- Fields: title, when, location, tags, body text, @mentions, people chips (++ trigger), linked URLs, linked memories
- "In Progress" flag marks memories you are still writing or that have unfinished details
- Voice-to-text button in the body area -- tap to speak, transcription appends automatically

### Details

**What Memories are:** A dedicated record for a specific memory, event, or story you want to preserve in detail. More structured than a journal entry -- you record when and where it happened, who was involved, tag it for later retrieval, and can link related memories or reference URLs.

**Memories list page:**
- Each row shows a drag handle, an "In Progress" badge (if applicable), the title, and a subdued date.
- **Drag to reorder:** Grab the handle on the left side of any row and drag it to a new position. Order is saved immediately without affecting any other records.
- **In Progress only toggle:** When checked, hides all completed memories and shows only those marked In Progress. Useful for drafts and memories you are still fleshing out.
- **+ New Memory:** Opens the create/edit page for a new memory.

**Memory edit page -- fields:**
- **Title** -- the name of this memory (required).
- **In Progress checkbox** -- marks the memory as still being worked on.
- **When** -- free-text date field. Enter anything: "Summer 2019", "July 4th, 2022", "Around age 12". No strict format required.
- **Location** -- free-text location: "Grandma's house", "Wrigley Field", "Lake Michigan shore".
- **Tags** -- pill checkboxes shown alphabetically. Tap to toggle a tag on or off. Type in the "Add tag..." input and press Enter to create a new tag instantly. Tags save immediately when toggled.
- **Body** -- main textarea for the full memory text. Supports all mention triggers below.
- **Voice-to-text** -- tap the microphone button above the body to start speaking. Transcription appends to the body continuously. Tap again to stop.
- **@Mentions** -- type @ in the body to see contacts flagged "Include in quick mentions." Type @@ to search all contacts. Tab or Enter selects the first match; tapping an item in the dropdown selects it. Selected contacts appear as teal chip links below the People header.
- **++ Free-form names** -- type ++Name or ++"Full Name" in the body to add a person who is not in your contacts. On space or punctuation, the ++ prefix is stripped from the text and an amber chip appears below.
- **URLs** -- add reference links related to the memory (articles, photos hosted elsewhere, etc.).
- **Linked Memories** -- link to other related memory records. Creates a web of related events.

**In-page help button:** Tap the `?` button (top-right of the edit page) for a quick-reference modal explaining the When field, @mention, and ++ trigger shortcuts.

**Tips:**
- Use tags consistently -- they are your main retrieval tool. Pick a small set of broad tags ("Family", "Travel", "Childhood", "Friends") and apply them reliably.
- The ++ trigger is for people who are not in your contacts list -- family members from the past, characters in a story, anyone you want to name without creating a full contact record.
- Link related memories together using the Linked Memories section. Over time this builds a connected web you can navigate.

### See Also
- [Thoughts Home](#help/thoughts)
- [Top 10 Lists](#help/top10lists)
- [My Thoughts](#help/views)

---

## screen:views

### Quick Help
- My Thoughts -- your personal thoughts organized by type: View, Reflection, Advice, or Review
- Use the type tabs (Views / Reflections / Advice / Reviews) to switch between thought types
- Each type has its own category system so you can organize them independently
- Each thought has versioned history so you can track how your thinking changes over time
- Live search filters by title and short version within the current type tab

### Details

**What My Thoughts are:** A place to record four kinds of personal writing:
- **View** -- your opinions and stances on topics ("My view on remote work", "What I think about diet and health")
- **Reflection** -- essays on experiences or things that shaped you ("What working from home meant to me", "What Raising a Modern Day Knight did for me as a father")
- **Advice** -- guidance you'd pass on to others ("How I talk to my kids about failure", "What I've learned about money")
- **Review** -- your take on a book, movie, restaurant, or experience

Each thought is a living document -- you can update it over time with history preserved.

**Thoughts list page:**
- **Type tabs** at the top (Views / Reflections / Advice / Reviews) -- click a tab to see only thoughts of that type. Each type shows its own category structure.
- **Two-level accordion** -- major categories are the outer accordion; subcategories are inner. Thought cards are inside subcategories.
- Each card shows: title, date of current version, short version preview, type badge, and a history badge if previous versions exist.
- **Search bar** -- live filter by title and short version within the current type. Matching accordions auto-expand; clear to collapse.
- **+ New Thought** -- opens the create page.
- **Manage Categories** -- link at bottom. Each type has its own independent category list.

**New thought page:**
- Select a **Type** first (required) -- this determines which categories load.
- Pick a **Major Category** and **Subcategory** for organization.
- Enter a **Title** (required).
- Click **Create Thought** when all three required fields are filled.

**Thought detail / edit page:**
- **Type** is shown as a colored badge (read-only after creation).
- **Category** -- pick from the two-level category tree for this thought's type.
- **Short version** -- a 1-3 sentence summary. This is what appears in the list preview.
- **Long version** -- the full text. Auto-saves on blur if changed.
- **Archive button** (label varies: "I've Changed My View", "Update My Reflection", etc.) -- archives the current version to history and starts a fresh version. Can only be used once per calendar day.

**Version history:**
- Each time you archive, the previous version is stored with a timestamp.
- Browse past versions via the Previous Versions section at the bottom of the detail page.
- History is read-only -- you cannot revert, but you can see how your thinking evolved.

**Categories:**
- Each thought type has its own independent category list -- "Parenting" under Views is separate from "Parenting" under Reflections.
- Manage categories from the Manage Categories page (type tabs let you switch between types).
- Major categories are top-level groupings; subcategories sit inside them.

### See Also
- [Thoughts Home](#help/thoughts)
- [Top 10 Lists](#help/top10lists)
- [Memories](#help/memories)


---

## screen:backup

### Quick Help
- **Download Backup** exports all your app data as a JSON file — do this monthly
- **Backup Private Data** (shown only if Private Vault is activated) exports a password-protected zip of your decrypted private data — password is your vault passphrase
- To open the private backup zip: use 7-Zip (free) or WinZip and enter your vault passphrase when prompted
- Note: file and folder names inside the zip are visible without the password — only the file contents are protected

### Details

**Download Backup:**
Downloads a JSON file of all your Firestore data (activities, plants, zones, health records, journal entries, etc.). Private vault data is included as ciphertext — it is useless without your passphrase but preserves the Firestore structure for disaster recovery. Check "Create photos file also" to include a separate JSON file with your regular (non-private) photos.

**Backup Private Data (vault only):**
- Only visible when the Private Vault is activated in Settings → General Settings
- Enter your vault passphrase — same passphrase you use to unlock the vault daily
- Wrong passphrase: error shown, nothing downloaded
- A progress indicator updates as each section (bookmarks, documents, photos) is decrypted and packaged
- Downloads `private-backup-YYYY-MM-DD.zip`

**What's in the zip:**
- `bookmarks.html` — Netscape bookmark format, importable directly into Chrome, Firefox, or Edge
- `bookmarks.json` — full bookmark tree with all metadata
- `documents/` — your original `.docx` files, fully decrypted and ready to open
- `photos/` — your original photos organized into subfolders by album name, fully decrypted
- `metadata.json` — export date and item counts
- Photo filenames use the caption first, then original filename, then a date-based fallback

**ZIP encryption details:**
- The zip is AES-256 encrypted (password = your vault passphrase)
- Files inside are the original plaintext files — once you open the zip with the correct password, everything is fully readable with no additional steps
- **Important limitation:** The ZIP format stores folder and file names in plaintext even when the zip is encrypted — anyone who has the zip file can see the names. Only the file contents are protected by the password. This is a limitation of the ZIP format, not the app.
- Treat the backup zip like sensitive data — store it somewhere secure (external drive, encrypted cloud storage, etc.)
- To open: use 7-Zip (free at 7-zip.org) or WinZip. Double-click the zip, enter your vault passphrase when prompted, then extract normally.

**Restore:**
Replaces all current data with a previously downloaded backup file. Data and photos restore independently. This is permanent and cannot be undone.

---

## screen:devnotes

### Quick Help
- Shared scratchpad visible to all users — great for developer feedback and quick cross-device notes
- Default view shows **Open** (unresolved) notes only — click **Fixed** to see resolved ones
- Use the search box to filter by keyword within the active tab
- Mark a note as fixed on its detail page to record the resolution date and description
- Tap **Open** on a card to view the full note, edit it, add photos, or mark it resolved

### Details

**List page (`#devnotes`):**
- **Filter tabs**: "Open" (default, shows unresolved notes) / "Fixed" (shows resolved notes)
- **Search box**: filters within the active tab — searches note text and resolution text
- Fixed note cards show a green "✓ Fixed · date" badge (formatted date, e.g. "May 5, 2026") and a preview of the resolution
- The author line on fixed cards shows "Reported: &lt;date&gt;" to distinguish when the issue was first logged from when it was fixed
- **Open** — navigates to the full-page detail view
- **Delete** — confirms before deleting the note and all its attached photos

**Detail/Edit page (`#devnote/{id}` and `#devnote/new`):**
- Large resizable textarea for note text
- **Doc ID badge** shown at the top for existing notes — click to copy the Firestore document ID to clipboard
- **Mark as Fixed / Resolved** checkbox — when checked reveals:
  - **Reported** — read-only display of when the note was originally created
  - **Fixed Date** — date picker, defaults to today when first checked; change if needed
  - **Resolution** — describe what was done to fix the issue
- Save records all three fields; fixed notes disappear from the default Open view
- **Photos section**: "Add from Gallery" or "Paste" to attach images; you can paste a photo before entering any text — the note is auto-saved as a draft first; click thumbnail to enlarge; delete from lightbox
- **Copy to Notebook…** — copies note text + all photos into a chosen personal notebook
- **Delete Note** — confirms, deletes note and all photos, returns to list

**Filtering explained:**
Open tab = notes where Fixed is unchecked (or never set). Fixed tab = notes where Fixed is checked. Search runs across both the note body and the resolution text within whichever tab is active.

---

## screen:exercise

**What this screen is for:** The Exercise hub. Jump to Activities, Daily Metrics, Goals, or Summary.

### Quick Help
- Tap **Activities** to log and view your workouts
- Tap **Daily Metrics** to track your daily health numbers and habits (sleep, steps, weight, custom habits, etc.)
- Tap **Goals** to set and manage your yearly exercise and weight goals
- **Summary** is coming soon

---

## screen:exercise-goals

**What this screen is for:** Plan your yearly exercise and weight goals — one row per month (Jan–Dec). Set weight targets, exercise session counts, and calorie thresholds. The plan math shows whether your goals will actually get you where you want to go. The color thresholds you enter here automatically highlight your Daily Metrics entries.

### Quick Help

**Year management**
- Use the **year dropdown** at the top to switch between years — always defaults to the current year when you open the screen
- **+ Add New Year** in the dropdown opens a popup defaulting to next year — confirm or type a different year

**Year Constants** (top section — enter once, applies to all calculations)
- **Starting Weight**: your weight at the start of the year — anchors the January projection
- **Height**: feet and inches (e.g. 6 ft 0 in) — used to calculate your base calorie burn each month
- **Birth Year**: your birth year (e.g. 1968) — age is computed automatically; used in base burn formula
- **Gender**: Male or Female — affects the base burn formula by ~166 cal/day
- **Activity Multiplier**: multiplied by your resting metabolic rate to estimate daily non-exercise burn. Default 1.2 = sedentary desk life. Use 1.375 if you're lightly active throughout the day beyond your tracked exercise. Hover the label for details.
- **Calories Per Mile**: average calories you burn per mile running or walking (e.g. 110)
- All fields save automatically when you tab away (or on change for Gender)

**Tracked Exercises** (which exercises appear as grid columns)
- Shows a summary of how many exercises you're tracking and their names
- Click **Manage →** to open the Tracked Exercises screen where you can add, reorder, and remove exercises (see screen:exercise-goal-exercises)

**Monthly Goals Grid** (one row per month)
- Enter **Goal Weight** — what you want to weigh at the end of that month (not calculated — you set this)
- **Goal Weight cascade**: typing a value fills two kinds of later months — (1) months still blank, and (2) months where the existing goal is *higher* than what you just entered (inconsistent with a weight-loss plan). Months already set to a lower weight are left alone.
- Enter **Miles/Day** — your average daily miles goal for that month
- Enter **session counts** for each tracked exercise — how many sessions you plan that month
- All cells save automatically when you tab away or click elsewhere
- **Copy Prev** button (on every row except January) — copies every value from the prior month in one click; ideal when goals don't change month to month

**Calculated columns** (read-only — update automatically)
- **Wt Loss** — difference between this month's goal weight and the previous month's (or starting weight for January)
- **Daily Cal Loss** — how large a daily calorie deficit your weight goal requires: `|Wt Loss| × 3500 ÷ days in month`
- **Burn Miles/Day** — daily calorie burn from your miles goal: `Miles/Day × Cal/Mile`
- **Burn Extra/Day** — daily calorie burn from non-mileage exercise sessions: `sum(sessions × cal/session) ÷ days`
- **Total Ex Burn** — Burn Miles + Burn Extra per day
- **Base Burn** — estimated daily non-exercise calorie burn for this month, calculated using Mifflin-St Jeor applied to the prior month's estimated ending weight × your activity multiplier. Updates each month as weight changes throughout the year.
- **Est Wt Lost** — estimated pounds lost this month: `((Base Burn + Total Ex Burn) − avg food calories) × days ÷ 3500`. Shows in red if negative (plan predicts weight gain).
- **Est End Weight** — rolling chain: previous month's estimated end weight minus Est Wt Lost. Shows **yellow** if higher than your Goal Weight. Adjust exercise goals or food range until they align.

**Color threshold columns** (right side of grid — 18 columns in 7 groups)
- Each column defines a boundary value for one color tier on the Daily Metrics screen
- Column header colors show which tier each threshold controls: **yellow header** = sets the yellow cutoff, **green** = green cutoff, **blue** = blue cutoff, **pale yellow** = food "bad day" cutoff
- Groups: **Food** (min calories, max calories, bad day), **Battery** (low, high), **Steps** (low, good, great), **Burn** (good, great), **Exercise** (low, high), **Cal Loss** (warn, good, great), **Miles** (low, good, great — display location in Daily Metrics TBD)
- Thresholds are per-month — you can ramp them up or down as your goals change throughout the year
- Once set, any Daily Metrics entry for that month is automatically color-coded on the metrics list screen

**On mobile**
- The grid is replaced by compact month cards showing Goal Weight, Miles/Day, and session counts
- Tap **Edit** on any card to open the full single-month form (see screen:exercise-goals-month)

### When to use this
- At the start of the year: set your starting weight, enter constants, add your tracked exercises, then fill in monthly weight targets — use Copy Prev to quickly fill similar months
- Mid-year: update a month's goals when your situation changes (injury, vacation, hitting goal weight early)
- Troubleshoot: if the Est End Weight turns yellow, adjust session counts, miles/day, or food thresholds until the projection aligns with your goal
- Before checking Daily Metrics: set the threshold columns so your past entries are color-coded meaningfully

---

## screen:exercise-goal-exercises

**What this screen is for:** Manage the exercise types you want to track in your monthly goals — add new ones, set their average calorie burn per session, reorder them, and remove them.

### Quick Help
- **+ Add Exercise** button at the top — opens an inline form to add a new tracked exercise
- In the add form: pick from your existing exercise types (or type a new name to add one inline), then enter the average calories you burn per session for that exercise
- Each tracked exercise shows its name, calorie burn per session, reorder arrows, and a **Remove** button
- **↑/↓ arrows**: change the display order — exercises appear as columns in the monthly goals grid in this order, so put your most important ones first
- **Remove**: stops tracking that exercise and removes its column from the grid. Your past logged activities are unaffected.
- Changes take effect immediately in the goals grid when you return to it

### When to use this
- At the start of the year when setting up your goals plan
- When you add a new type of workout you want to goal-track
- To update the average calorie burn estimate for an exercise as your fitness changes

---

## screen:exercise-goals-month

**What this screen is for:** Edit all goal and threshold values for a single month — the mobile-friendly vertical form equivalent of one row in the yearly goals grid.

### Quick Help
- **Copy Previous Month** button (at the top, hidden for January) — copies every value from the prior month in one click; faster than re-entering when months are similar
- Fields are organized into 9 sections: **Weight**, **Exercise Goals**, **Food**, **Battery**, **Steps**, **Burn**, **Exercise**, **Cal Loss**, **Miles**
- Every field saves automatically when you move to the next one (same as the desktop grid)
- **Goal Weight** — what you want to weigh at the end of this month; not calculated, you set it
- **Avg Miles / Day** — your daily miles goal for this month
- **Session counts** — one field per tracked exercise; how many sessions you plan this month
- **Threshold fields** — the boundary values for each color tier on Daily Metrics. Each label explains what color the threshold controls and which direction triggers it (e.g. "Low steps (below → yellow)")
- **← Back to [Year] Goals** button at the bottom returns to the yearly grid

### When to use this
- On mobile — the full grid is desktop-only; this screen is how you edit goals on a phone
- When you want to focus on one month without the visual noise of the full year grid
- Quick updates mid-month when one value changes

---

## screen:exercise-activities

**What this screen is for:** View and manage your logged exercise activities.

### Quick Help
- Tap **+ Activity** to log a new workout
- Use the **range dropdown** to filter by time period (Last 7 / 30 / 90 days, This Month, This Year, All Time, or Custom)
- **Custom**: pick a Start and End date, then press **Load**
- **Go to Date**: shows only activities on that specific day — tap **✕ Clear date** to return to the range filter
- **Manage Types** link lets you rename or delete custom activity types
- Tap any row to view or edit that activity

### Columns explained (desktop)
- **Date** — date of the activity (no time shown)
- **Day** — day of the week
- **Type** — activity type; 🐾 appears if you took the dogs
- **Duration** — shown as MM:SS (e.g. 25:30 = 25 min 30 sec)
- **Miles** — distance; blank for non-mileage types (Weights, Golf, etc.)
- **Pace** — auto-calculated min/mile; blank if miles or duration not recorded
- **Cal** — calories burned
- **Comment** — your notes

### Mobile layout
Each activity shows as a two-line card:
- Line 1: Date + Type (🐾 if with dogs) + Duration
- Line 2: Miles @ Pace + Calories + Comment

### Log via QuickLog (SecondBrain)
You can log an exercise activity hands-free using the QuickLog mic button. Say things like:
- "I just ran 5 miles in 5303" — the AI interprets "5303" as 53:03
- "Walked 3.1 miles in 45 minutes and 20 seconds"
- "Did 45 minutes of weights at the gym"
- "Mowed the lawn for an hour and a half"

The AI matches your description to a known activity type (Running, Walking, Weights, etc.) or falls back to "Other" if it can't identify the type. The confirm screen lets you review and adjust all fields before saving.

---

## screen:exercise-activity

**What this screen is for:** Log a new workout or edit an existing one.

### Quick Help
- **📷 From Picture** — tap this (new workouts only) to select a screenshot from your fitness app; the app reads the image and pre-fills Type, Duration, Miles, and Calories automatically. Requires LLM to be configured in Settings.
- Pick an **Activity Type** from the searchable dropdown — type to filter, then click to select
- Don't see your type? Type its name and tap **➕ Add "[name]" as new type** — you'll be asked two quick questions to set it up
- **Date** defaults to today; **Time** is optional
- **Duration** — type as `MM:SS` (e.g. `45:26`), `H:MM:SS` for over an hour (e.g. `1:15:00`), or decimal minutes (e.g. `45.5`); a friendly label like "45 min 26 sec" or "1 hr 15 min" appears to the right as you type
- **Miles / Walked Miles** appears for types that track distance. For Trail Running, Mixed Run, and Treadmill it's labeled "Walked Miles" — enter only the walked portion
- **Run Miles** appears alongside Walked Miles for Trail Running, Mixed Run, and Treadmill — enter the running portion; **Total Miles** is calculated automatically
- **With Dogs** appears only for types that support it
- **Pace** is calculated automatically once you have miles and duration
- Tap **Save Activity** when done; use the breadcrumb or **Cancel** to go back without saving
- To delete, tap **Delete** at the bottom (only visible in edit mode)

### Field details
| Field | Notes |
|-------|-------|
| From Picture | Tap to select a fitness app screenshot — LLM pre-fills Type, Date, Time, Duration, Miles, and Calories (new mode only, requires LLM configured in Settings). Date/Time default to today/now if not found in the image. |
| Activity Type | Required. Searchable — just start typing |
| Date | Required. Defaults to today |
| Time | Optional — uses the native time picker. Leave blank if you don't need it. |
| Duration | `MM:SS` (e.g. 45:26), `H:MM:SS` (e.g. 1:15:00), or decimal minutes (e.g. 45.5). A friendly label appears to the right as you type |
| Miles / Walked Miles | Only shown for distance-tracking types. Labeled "Walked Miles" for Trail Running, Mixed Run, Treadmill |
| Run Miles | Only shown for Trail Running, Mixed Run, Treadmill — enter the running portion of the workout |
| Total Miles | Read-only sum of Walked Miles + Run Miles (Trail Running, Mixed Run, Treadmill only) |
| Calories | Optional, any type |
| With Dogs | Checkbox — only shown if the type supports it |
| Notes | Free-form notes about the workout |

---

## screen:exercise-types

**What this screen is for:** View and manage your exercise activity types.

### Quick Help
- **Built-in types** (Running, Walking, Hiking, etc.) are shown with a "built-in" badge — they can't be renamed or deleted
- **Custom types** you've added have **Rename** and **Delete** buttons
- **Rename**: click Rename, type the new name, then Save — all past activities automatically show the updated name
- **Delete**: hides the type from the activity dropdown; your past activity history is preserved
- 📏 icon means the type tracks miles (and shows pace); 🐾 means it has a "With Dogs" checkbox

### When to use this
- You added a type on the fly and want to correct the spelling
- You no longer need a custom type and want it out of the dropdown

---

## screen:exercise-metric

**What this screen is for:** Log or edit a single day's health and habit metrics — weight, sleep, steps, calories, and any custom metrics you've set up.

### Quick Help
- **Date field**: shown inline with the day of the week beside it (e.g. "Monday") — updates as you change the date. Defaults to today for a new entry. If a record already exists for that date, the form reloads pre-filled with that record's data. If no record exists for the new date, your in-progress values are kept (only the date updates)
- **Body section**: Weight (decimals OK), Sleep Score, Body Battery
- **Activity section**: Daily Steps, Total Actual Burn (from your watch, usually entered the next day), Food Calories
- **Habits & Custom**: your custom metrics in order — YES/NO metrics are checkboxes; Number metrics have an optional unit label (e.g. oz, cal); Text metrics are free-form
- **📝 button** next to each field: click to open a small note box — add any context for that value. The button turns yellow when a note is saved
- **Save**: writes the record (one record per date — saving again for the same date overwrites it)
- **Cancel**: returns to the Daily Metrics list without saving
- **Delete** (edit mode only): removes the record for that date after confirmation

### When to use this
- Log today's metrics each morning or evening
- Go back and fill in yesterday's Total Actual Burn after your watch syncs
- Edit a previous entry to correct a value or add a note

---

## screen:exercise-metrics

**What this screen is for:** Browse your daily health and habit journal entries. Filter by date range, see summary averages, and tap any record to view or edit it.

### Quick Help
- **Month combo**: choose a specific month (Jan–Dec) or **Year** to see the whole year at once
- **Year combo**: pick any year from 2020 to 2070 — changing either combo reloads the list automatically
- Defaults to the current month and current year when you first open the screen
- **N records** label below the filter bar shows how many entries match
- **Desktop**: data appears as a table with a tinted **summary row** at the top — Weight shows net change for the period (green = lost, red = gained); other columns show averages
- **+/- Diff column** (between Burn and Food): shows `burn − food` for each day — a yellow cell means you ate more than you burned that day; "—" means you were in a deficit (good)
- **Mobile**: a blue **summary card** at the top shows averages and totals for the period (same as the desktop summary row), followed by individual day cards
- **📝 icon**: hover (desktop) to see a note; tap (mobile) to pop up the note text — tap outside or ✕ to close
- Click or tap any row/card to open that day's entry form
- **+ Entry** button: create a new entry for today (or any date)
- **Manage Metrics** link: add, reorder, or remove your custom metric definitions

- **Last 7 Days accordion**: when viewing the current month and year, a green accordion at the top shows a summary of your last 7 days — tap to expand or collapse. Booleans show X / 7 (always out of 7 days). Your expanded/collapsed choice is remembered between visits.
- **Year view**: when you pick "Year" from the month combo, records are grouped into a **monthly accordion** — tap any month header to expand or collapse it; empty months show "No records for this month."

### When to use this
- Review trends for a specific month at a glance
- Switch to Year view to scan the whole year and drill into individual months
- Find a specific day's entry to edit or review

---

## screen:exercise-metric-defs

**What this screen is for:** Create, reorder, and delete your custom daily metric definitions — the extra fields that appear on every daily entry form below the standard metrics.

### Quick Help
- **Standard metrics** (Weight, Sleep Score, Body Battery, Daily Steps, Total Actual Burn, Food Calories) are always present on the entry form and cannot be managed here
- **+ Metric** button opens the add form at the top — fill in a name and pick a type, then Save
- **Types**: YES/NO (boolean checkbox), Number (optional unit label like "oz" or "cal"), Text (free-form)
- **Number type**: check "Allow Decimals" if you need fractional values (e.g. 7.5 hours), and optionally add a unit label shown next to the field
- **Type cannot be changed** after a metric is saved — this preserves the format of historical entries
- **↑ / ↓ buttons**: change the display order of metrics on the entry form
- **Edit**: rename the metric, update its unit label, or add/edit a **Tooltip** description — type stays fixed. The tooltip appears when you hover over that metric's column header in the desktop daily metrics table, and also when you hover over the field label on the daily entry form.
- **Delete**: removes the metric from future entry forms (soft delete — historical data is preserved)

### When to use this
- You want to track a new daily habit or health stat not covered by the standard metrics
- You want to reorder metrics so the most important ones appear first
- You misspelled a metric name and need to fix it
