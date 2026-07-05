# My Legacy Feature Plan

## Status: Planning — Not Started

---

## Name: DECIDED — "My Legacy"
Icon: 🕊️ | Route: `#legacy` | Tile style: `landing-tile--legacy`

---

## The Problem This Solves

> "If I die, my wife/kids/family need to know everything — accounts, wishes, instructions, letters — and they need to be able to find it all in one place without hunting."

The app is already behind login. The user leaves the login credentials + Legacy Passphrase in a physical envelope. The survivor logs in, opens My Legacy, enters the passphrase, and sees everything.

The "who gets this when I pass away" field on Things is an existing related seed.

---

## Password Encryption Strategy — DECIDED

### Approach: Separate Legacy Passphrase + Web Crypto API

**The passphrase is never stored.** Not in Firestore, not in localStorage, nowhere.

What IS stored in Firestore:
- A random **PBKDF2 salt** (non-sensitive — just a random string to make brute-forcing impractical)

How it works:
1. **First time** user opens My Legacy → prompted to create a Legacy Passphrase + confirm it. Warning shown: "This cannot be recovered. Write it down."
2. **Every session** when user navigates to `#legacy` → passphrase prompt appears. User types it → key derived in memory → section unlocks.
3. The in-memory key is used to decrypt/encrypt sensitive fields. It is cleared when the user navigates away.
4. **If passphrase is forgotten**: encrypted data is unrecoverable by design. User must delete and re-enter sensitive fields.

Why a separate passphrase (not the app login password):
- Using the app password as the key means you can never change your app password — that's unacceptable.
- The separate passphrase can be kept physically (in a safe or sealed envelope) and only needs to be changed if compromised.

### What Gets Encrypted — DECIDED
Only financially sensitive fields:
- `passwordEnc` — login passwords for financial and digital accounts
- `accountNumberEnc` — full account/policy/card numbers
- `ssnEnc` — Social Security Number(s)
- `pinEnc` — phone PIN, safe combo, etc.

What does NOT get encrypted:
- Institution names, URLs, account types, usernames, notes
- Letters (body text is plain — not sensitive enough to encrypt)
- Obituary, service wishes, burial preferences, final message
- Document locations, people-to-notify list

**Encrypted field naming convention**: suffix `Enc` on any Firestore field storing AES-GCM ciphertext.

---

## Sections

### 1. Burial & Remains Preferences

**Disposition type** — single dropdown (mutually exclusive):
- Cremation
- Burial
- Body donation to science
- Natural / green burial
- Other

**My Wishes** — free-form text area. Plain English description of everything: where to scatter ashes, what cemetery, special requests, tone, etc.

**Reference Links** — labeled URL list (add/remove rows):
- Per entry: Label (e.g. "Tombstone I want", "Green burial cemetery near us") + URL
- Opens in new tab
- Stored as array on the doc

**Pre-arrangement** — yes/no toggle. If yes:
- Funeral home name
- Phone number
- Payment status: dropdown — Deposit paid / Paid in full / Not yet paid
- Where the documents/contract are kept (e.g. "filing cabinet in the office, green folder")
- Notes

**Removed from original plan**: Organ & tissue donation — organ transplant donation is handled by the hospital based on driver's license/registry within hours of death. By the time family reads this page, it's already decided. Body donation to science (whole body) is covered by the disposition type dropdown.

**Data fields** (on `legacyMeta/burial` doc):
- `dispositionType` — string
- `wishes` — string (free-form)
- `links[]` — array of `{ label, url }`
- `preArranged` — bool
- `preArrangementName` — string
- `preArrangementPhone` — string
- `preArrangementPayment` — string (deposit-paid / paid-in-full / not-yet-paid)
- `preArrangementDocsLocation` — string
- `preArrangementNotes` — string

### 2. Funeral / Memorial Service Wishes
- Service type: Traditional funeral / Graveside only / Celebration of life / No service / Memorial later / Other
- Preferred location (church, funeral home, backyard, park, no preference)
- Preferred officiant or speaker (link to Contact or free-form)
- Songs list: title, artist, context (entry / during / closing / reception) — add/remove rows
- Readings or passages: text or description, who should read it
- Tone/vibe note ("I want people to laugh and remember the good times")
- Flowers: yes / no / donations instead / specific flowers
- Dress code preference
- Guest scope: open to all / family only / close friends and family
- Free-form additional wishes

### 3. My Obituary
Three sections on one page, top to bottom:

**Box 1 — My Planning Notes**
Free-form brain dump: facts, stories, things to cover, people to mention — anything
you'd want included. No structure required.
- If LLM is enabled in Settings: **"Ask AI to Write"** button below this box
  - Sends the planning notes to the LLM with a prompt to write a full obituary
  - Generated text populates Box 2 (My Draft)
  - If Box 2 already has content: confirm before overwriting ("Replace your current draft?")

**Box 2 — My Draft**
The written obituary. Populated manually or by the AI button from Box 1.
- Plain textarea (no rich text needed for an obituary)
- Can be edited freely after AI generates it

**Box 3 — Instructions for the Writer**
A note to whoever will write or finalize the real obituary.
Examples: "keep it under 300 words", "make sure you mention my love of fishing",
"don't mention [X]", "publish in the Star Tribune"

**Data fields** (all on `legacyMeta` doc):
- `obituaryNotes` — planning notes (Box 1)
- `obituaryDraft` — the written draft (Box 2)
- `obituaryInstructions` — writer instructions (Box 3)

**LLM prompt** (when "Ask AI to Write" is clicked):
> "Write a warm, personal obituary based on the following notes from the person themselves. Use first-person information naturally. Keep it to 3-4 paragraphs suitable for a newspaper or memorial program.\n\n[obituaryNotes]"

### 4. Social Media & Digital Memorial Preferences
Per platform: platform name, username/profile URL, what to do after death
- Action options: Memorialize / Delete / Leave as-is / Transfer to someone (name who)
- Notes per platform ("my photos are in Google Photos — download them first before deleting")
- Platforms to prompt: Facebook, Instagram, Twitter/X, LinkedIn, TikTok, YouTube, Reddit, etc.
- **Facebook Legacy Contact**: note that Facebook has a formal process — document who the legacy contact should be
- Phone PIN/passcode (encrypted) — so family can access the phone for photos, contacts, etc.
- Password manager entry: which app, where to find it, master password (encrypted)

### 5. Financial & Account Access
Each entry: institution, account type, URL, username, password (encrypted), account number (encrypted), beneficiary, notes, contact/phone

#### 5a. Bank & Credit Accounts
Types: Checking, Savings, Money Market, CD, Credit Card, HELOC, Other

#### 5b. Investment & Retirement Accounts
Types: 401(k), IRA, Roth IRA, Pension, Brokerage, HSA, 529, Other
Extra fields: beneficiary on file, how to access/withdraw instructions

#### 5c. Life Insurance
Extra fields: policy number (encrypted), face value, beneficiary, agent contact, where paper policy is kept

#### 5d. Debts & Loans
Types: Mortgage, Car loan, Student loan, Personal loan, Credit card (balance), Other
Extra fields: monthly payment, auto-pay yes/no

#### 5e. Other Financial & Personal Info
- Social Security Number (encrypted) — yours and spouse's (separate entries or same form?)
- Safe deposit box: bank, box number, what's inside, where the key is
- Physical cash: location, approximate amount
- Tax preparer: name, contact info
- Business interests, partnerships, side income (free-form)

#### 5f. Retirement & Investment Instructions for Spouse
Free-form rich text: withdrawal strategy, RMDs, Social Security timing, who to call, philosophy
- Link to financial advisor Contact

### 6. Important Documents & Where to Find Them

**DECIDED — Design:**

Single unified list of document entries (online and physical together). User controls order via drag-and-drop (most important at top). Clicking a row expands it inline (accordion) to show details. Edit/Delete buttons inside the expanded view open an edit modal.

**Modal fields:**
- Online / Physical toggle (radio)
- Document Type (dropdown): Will, Trust, Power of Attorney, Advance Directive / Living Will, Insurance Policy, Real Estate Deed, Vehicle Title, Financial Account, Medical Records, Other
- Title (text, required)
- Why it matters (textarea)
- **If Online**: URL (text)
- **If Physical**: Where is it (multi-line textarea — handles both "filing cabinet in office" and "Attorney John Smith, 123 Main St, 612-555-1234")

**List row (collapsed):** type badge · title · drag handle (≡)
**Expanded:** shows Why it matters + URL (clickable link) or Where is it + Edit / Delete buttons

**Ordering:** `sortOrder` integer on each doc. Drag-and-drop reorders and bulk-updates `sortOrder`. New docs append to end (highest sortOrder + 1).

**Drag-and-drop implementation:** SortableJS via CDN (same pattern as Leaflet/Cropper — external CDN, not cached by service worker). Handles both mouse and touch.

**Firestore:** `legacyDocuments` — `isOnline` (bool), `docType`, `title`, `whyMatters`, `url`, `whereIsIt`, `sortOrder`, `createdAt`

### 7. Medical Wishes / Healthcare Directives
- Resuscitation (CPR): yes / no / depends on circumstances
- Mechanical ventilation: yes / no / time-limited trial
- Feeding tube: yes / no / short-term only
- Hospitalization vs. hospice: prefer hospital / prefer home / prefer hospice / let family decide
- Organ & tissue donation (links to Section 1)
- Preferred hospital (if applicable)
- Healthcare proxy / medical POA (link to Contact)
- Free-form notes ("I want to die at home if at all possible")

### 8. Practical Household Instructions
- Utilities: per utility (gas, electric, water, internet, phone) — provider, account #, how to pay, auto-pay
- HOA: contact, dues, portal login
- Home security system: company, code(s) (encrypted), contact
- Recurring services: lawn, pest control, cleaning, pool, etc.
- Car maintenance: per car — shop, schedule, quirks
- Appliances & manuals location
- Home service contacts (link to Contacts — plumber, electrician, HVAC)
- Free-form "things to know about this house"

### 9. Pets
*Included for all users — fill in if applicable.*
Per pet: name, species, breed, age, vet contact, food/medications, special needs
- Who should take this pet (link to Contact or free-form name)
- Free-form care notes

### 10. People to Notify
When I pass, these people should be contacted:
Per person: name (link to Contact or free-form), relationship, phone, email, notes
- Priority order — sortable list
- Note field per person ("tell her before it goes public")

### 11. Letters to People

**List page (`#legacy/letters`)**
- Card per letter showing: recipient name, letter title, date created, first line of body as a snippet
- "+ Add Letter" button
- Click a card → letter detail/edit page
- Delete from card (with confirm)

**Letter page (`#legacy/letter/:id`)**

Fields:
- **Recipient**: contact picker (search existing contacts) OR fallback to typed name if not in contacts
- **Letter title**: internal label only — shown on card, NOT printed. Helps distinguish multiple letters to the same person.
- **Instructions** (for executor, not recipient): shown in the app, NOT printed.
  - For non-contact recipients: use this to explain who they are and how to reach them
  - For any letter: delivery timing, context ("give this after the service, not before")
- **Letter body**: the actual letter — textarea with speak button (Web Speech API, appends to existing text)
- **Date created**: auto-set on first save, shown on card and printed
- **Print button**: outputs recipient name, date created, and letter body — no title, no instructions, no app chrome

**Multiple letters per person**: allowed — letter title distinguishes them on the card

**Non-contact recipient flow**: show typed name field + instructions box is expanded and labeled "How to reach this person / why you're writing to them"

**Data fields** (`legacyLetters` collection):
- `contactId` — string (nullable — null if free-form recipient)
- `recipientName` — string (contact display name or typed name)
- `title` — string
- `instructions` — string
- `body` — string (plain text)
- `createdAt` — timestamp (auto on first save)
- `updatedAt` — timestamp

### Section 11: Letters — DECIDED
- Multiple letters per person: yes
- Letter title: yes, internal only, not printed
- Date created: yes, shown on card and printed
- Instructions box: on all letters — for executor, not recipient, not printed
- Non-contact fallback: typed name field + instructions box auto-expanded with "how to reach / why writing"
- Print: recipient name + date + body only
- Speak button: Web Speech API, appends to existing text

### 12. Final Message
A single open message to whoever reads this. No structure — just say what you want to say.
- Rich text, no length limit
- Not encrypted
- Toggle: "Show this first when someone opens My Legacy"

---

## Legacy Landing Page (`#legacy`) — DECIDED: Tile Grid

Same style as the Life main page — a grid of tiles, one per section.

| Tile | Icon | Route |
|------|------|-------|
| Burial & Remains | ⚱️ | `#legacy/burial` |
| Service Wishes | 🕊️ | `#legacy/service` |
| My Obituary | 📜 | `#legacy/obituary` |
| Social Media | 📱 | `#legacy/social` |
| Financial Accounts | 💰 | `#legacy/accounts` |
| Documents | 📁 | `#legacy/documents` |
| Medical Wishes | 🏥 | `#legacy/medical` |
| Household | 🏠 | `#legacy/household` |
| Pets | 🐾 | `#legacy/pets` |
| People to Notify | 📞 | `#legacy/notify` |
| Letters | ✉️ | `#legacy/letters` |
| Final Message | 💬 | `#legacy/message` |

3-column grid, flat (no grouping). Sort order to be decided later — user will prompt a re-sort.

Page header note: *"This information is private and intended for your loved ones. Keep your Legacy Passphrase stored safely alongside your app login."*

---

## Passphrase UX Flow — DECIDED: Only on Financial Section

The passphrase gate only appears when navigating to `#legacy/accounts` (Financial) and `#legacy/social` (which contains phone PIN and password manager — both encrypted). All other sections (burial, service, obituary, letters, etc.) open freely — no gate.

**Flow for gated sections:**
1. User navigates to `#legacy/accounts` or `#legacy/social`
2. Passphrase prompt modal:
   - **First time**: "Create your Legacy Passphrase" + confirm field + warning ("Write this down — it cannot be recovered")
   - **Returning**: "Enter your Legacy Passphrase to view financial info"
3. Passphrase derives the in-memory key via PBKDF2 + stored salt
4. Section unlocks for the session; key stays in memory as long as the user is on `#legacy/*` routes
5. On navigating away from Legacy entirely: key cleared from memory
6. "Forgot passphrase?" link: "Encrypted data cannot be recovered without this passphrase. You will need to delete and re-enter all financial login and account info."

**Sections that require the passphrase**: Financial Accounts (`#legacy/accounts`), Social Media & Digital (`#legacy/social`)
**Sections that are freely accessible**: Everything else

---

## Data Model (Proposed Firestore)

All under `userCol()`.

| Collection | Key Fields |
|------------|------------|
| `legacyMeta` | (single doc) `passphraseSetup` (bool), `pbkdf2Salt` (hex), `burialPrefs{}`, `servicePrefs{}`, `obituaryDraft`, `obituaryFacts{}`, `finalMessage`, `showFinalMessageFirst` (bool), `medicalWishes{}`, `householdNotes`, `retirementInstructions`, `lastUpdatedAt` |
| `legacyAccounts` | `category`, `name`, `accountType`, `url`, `username`, `passwordEnc`, `accountNumberEnc`, `beneficiary`, `notes`, `sortOrder`, `createdAt` |
| `legacyPersonalIds` | (single doc or small collection) `ssnEnc`, `spouseSsnEnc`, `notes` |
| `legacyDocuments` | `docType`, `exists`, `locationPhysical`, `locationDigital`, `notes` |
| `legacyLetters` | `contactId?`, `recipientName`, `body` (plain text), `createdAt`, `updatedAt` |
| `legacyNotifyList` | `contactId?`, `name`, `relationship`, `phone?`, `email?`, `notes`, `sortOrder` |
| `legacyPets` | `name`, `species`, `breed?`, `age?`, `vetContactId?`, `vetName?`, `food`, `medications?`, `guardianContactId?`, `guardianName?`, `notes` |

---

## Routing

| Route | Page |
|-------|------|
| `#legacy` | Landing tile grid + passphrase gate |
| `#legacy/burial` | Burial & Remains |
| `#legacy/service` | Funeral / Service Wishes |
| `#legacy/obituary` | My Obituary |
| `#legacy/social` | Social Media & Digital Memorial |
| `#legacy/accounts` | Financial & Account Access |
| `#legacy/documents` | Important Documents |
| `#legacy/medical` | Medical Wishes |
| `#legacy/household` | Household Instructions |
| `#legacy/pets` | Pets |
| `#legacy/notify` | People to Notify |
| `#legacy/letters` | Letters list |
| `#legacy/letter/{id}` | Letter detail / edit |
| `#legacy/message` | Final Message |

---

## Printable Access Card — DECIDED: Yes

A button on the Legacy landing page (or in Settings) that generates a clean printable page:
- App URL
- "Log in with your email and password"
- "Navigate to Life → My Legacy"
- "Enter your Legacy Passphrase: _______________"
- Space to handwrite the passphrase before sealing in envelope

---

## UX & Design Notes

- Slightly muted/dignified color palette — different feel from the rest of the app
- No pressure to complete any section — empty = "not started", not broken
- Auto-save pattern same as rest of app
- Password fields: show/hide 👁 toggle
- All encrypted fields show a 🔒 icon to indicate they are protected
- Mobile-first — a survivor may access this on their phone in a difficult moment
- Print stylesheet for letters (clean single-column output)

---

## Decisions Log
| Decision | Choice |
|----------|--------|
| Feature name | My Legacy |
| Encryption key | Separate Legacy Passphrase, never stored |
| Key derivation | PBKDF2 + random salt stored in Firestore |
| Encryption algo | AES-GCM 256-bit via Web Crypto API |
| Encrypted fields | Passwords, account numbers, SSN, PINs only |
| Letters encrypted? | No — plain text |
| Landing page style | Tile grid (same as Life page) |
| Printable access card | Yes |
| Print button on letters | Yes |
| Veteran benefits section | Not included |
| Pets section | Included (for other users) |
| Landing grid | 3-column flat; sort order TBD (user will prompt) |
| SSN placement | Inside Financial section (5e) |
| Passphrase gate scope | Financial + Social sections only |
| Passphrase session | Unlocked once per browser session |

---

## Questions — Overall — ALL DECIDED ✅

| Question | Decision |
|----------|----------|
| Landing grid layout | 3-column flat tile grid; sort order deferred (user will prompt later) |
| SSN placement | Inside Financial section (Section 5e) |
| Passphrase session scope | Stays unlocked for the entire browser session once entered |

---

## Questions — Per Section (Ask When Building Each One)

### Section 1: Burial & Remains — DECIDED
- Disposition type: single dropdown (Cremation / Burial / Body donation to science / Natural/green burial / Other)
- My Wishes: free-form text area
- Reference Links: labeled URL list, add/remove rows, opens in new tab
- Pre-arrangement: yes/no toggle + funeral home name, phone, docs location, notes
- Organ donation removed (hospital-handled, not a day-after decision)

### Section: People to Notify — DECIDED
- Two add buttons: "From Contacts" (contact picker) and "Add Manually" (modal)
- **Contact-linked entries**: runtime lookup from `people` for name, phone, email, howDoIKnowThem — nothing stored except `contactId`; row has delete button only
- **Free-form entries**: modal with name, phone, email, address, howDoIKnowThem; clicking row re-opens edit modal; delete inside modal
- **List display**: name · phone · email on line 1; "how do I know them" on line 2 (both types identical shape)
- Firestore: `legacyNotify` — `contactId` (nullable), `name`, `phone`, `email`, `address`, `howDoIKnowThem`, `createdAt`

### Section: Pets — DECIDED
- Add Pet button creates a new Firestore doc in `legacyPets` and prepends an auto-expanded card
- Cards show pet name as collapsed preview; click header to expand/collapse
- Expanded card: name input + instructions textarea (both inline-editable), delete button with confirmation
- Auto-save on blur for name and instructions
- Firestore: `legacyPets` — `name`, `instructions`, `createdAt`

### Section 2: Service Wishes — DECIDED
- **Service type**: dropdown — Traditional Funeral, Memorial Service, Celebration of Life, Graveside Only, No Service, Other
- **Location preference**: single-line text input (free-form — church name, address, outdoor location, "no preference", etc.)
- **Who should officiate**: single-line text input (pastor name, family member, specific person, "no preference")
- **Music**: multi-line textarea (list songs, artists, context — whatever format works for the user)
- **My Wishes**: large free-form textarea — everything else (flowers vs. donations, open/closed casket, reception, things you don't want, etc.)
- All fields auto-save on blur/change to `legacyMeta/service`
- Firestore fields: `serviceType`, `location`, `officiant`, `music`, `wishes`

### Section 3: Obituary — DECIDED
- Three boxes: Planning Notes → My Draft → Instructions for Writer
- "Ask AI to Write" button on Planning Notes box (only shown if LLM is enabled)
- AI output populates My Draft box; confirms before overwriting existing content
- Plain textarea for all three boxes (no rich text)

### Section 4: Social Media
- Do you have a password manager (1Password, iCloud Keychain, etc.)? If so, we'll add a specific "Password Manager" entry type with master password field (encrypted).
- Phone PIN — store here under Social/Digital, or in Financial > Other?

### Section 5: Financial Accounts
- Account numbers — full number encrypted, or last-4 plain + full encrypted? (Last-4 plain lets you identify the account without unlocking.)
- Should the Financial section have a "Retirement Instructions" as a big free-form text area, or structured fields?

### Section 6: Documents
- Fixed checklist + free-form extras (as planned), or all free-form?
- Photo attachment per document (scan of the actual doc)? Uses Base64 pattern — adds Firestore doc size.

### Section 7: Medical Wishes
- Do you already have a Healthcare Directive on file somewhere? Helps us know if the "where is it located" field matters.

### Section 8: Household Instructions
- Utilities — structured per-utility entries (with encrypted account numbers), or free-form text?
- Should this pull from your existing House/Zone data in any way, or stand alone?

### Section 9: Pets
- Do you have pets? (Just for testing purposes — feature is generic for other users.)

### Section 10: People to Notify
- Flat list or priority tiers ("notify immediately" vs. "notify within a week")?

### Section 11: Letters
- One letter per person, or multiple letters to the same person allowed?
- Letter type tag (e.g., "love letter", "life advice", "thank you") or no categorization?

### Section 12: Final Message
- Plain textarea or formatted rich text?
- "Show this first" toggle — include it?

---

## Build Order (When Ready)

1. `js/legacy-crypto.js` — Web Crypto API utility (PBKDF2 key derivation, AES-GCM encrypt/decrypt)
2. Legacy routing skeleton + passphrase gate modal
3. Life main page tile ("My Legacy")
4. Section: Burial & Remains
5. Section: Service Wishes
6. Section: Obituary
7. Section: Financial Accounts (most complex)
8. Section: Documents
9. Section: Social Media & Digital
10. Section: Medical Wishes
11. Section: Household Instructions
12. Section: Pets
13. Section: People to Notify
14. Section: Letters + print stylesheet
15. Section: Final Message
16. Printable access card page
17. Spec + AppHelp + cache bump — final commit

---

## Related Files
- `MyLife-Functional-Spec.md` — update when implemented
- `AppHelp.md` — add `## screen:legacy*` sections when implemented
