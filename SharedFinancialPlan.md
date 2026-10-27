# Sharing Credentials and Financial — build plan

*C1 (credentials) and F1 (keys) and F2 (helpers) and F3 (screens) and F4 (sensitive info) and F5 (share a person) and F6 (budgets, household) and F7 (backup) are built: the whole plan is done. Same recipe as Collections, Yard and House (`SharedSpacesBuildPlan.md`, `SharedYardPlan.md`, `SharedHousePlan.md`): groups (Wife / Family / Guest), View only / Can edit per group, owner keeps everything, editors can add/change/delete inside what is shared, only the owner changes sharing or stops it.*

Two separate things, built in this order:

1. **Credentials** — share individual credentials (a Netflix login) with chosen groups. No passphrase involved (credentials are plain text today).
2. **Financial** — share a *person's* whole financial picture (accounts, holdings, Social Security, summary, history). The account's **sensitive info** (account number, username, password) is locked separately for each person with that person's own passphrase.

## 1. Credentials: what gets shared

- **Per credential, not the whole list.** On each credential, a **Share** control picks groups and View / Edit for each (same wording as everywhere else).
- A shared credential is still **one record** (not a copy). The owner sees it in their normal list with a "Shared" badge; others see it under **Shared with me** on the Credentials page.
- **Category and person** are private lists, so a shared credential carries the category name and person name as plain text for the people it is shared with. Linked payment method is shown as text only.
- Editors can change the login and notes. Only the owner changes who it is shared with or deletes it from sharing.
- **Mechanism (no new security rules):** credentials are kept in *audience shares*. Each distinct "who gets it" combination (for example "Family: view") is one share of kind `credentials`. Choosing sharing on a credential moves it into the matching share (created on the fly) with the same record ID; "Stop sharing" moves it back. The existing move engine and rules already handle this.

## 2. Financial: what gets shared

**One share per person** (kind `financialPerson`, one per person tracked: wife, Danielle, Stephen…). It holds everything tied to that person:

| Moves in | Notes |
|---|---|
| accounts and their **holdings**, `ssBenefits`, balance **snapshots/history**, that person's groups and config | rows with that `personId` only |
| **sensitive info** of those accounts | see section 3 |

- **Your own ("Me") is never shared by accident.** The kids see only the people shared with them. A person's share contains nothing of yours.
- **Joint accounts** (stored under "Me") and **budgets** are household things. They get their own shares: a **Household** share (joint accounts) and **per-budget** sharing, so the kids never get your budget. (Questions below.)
- **Dropdown:** a person shared with you appears in your Financial drop-down, marked "shared by …". Role View only hides buy/sell, edit and delete; Can edit allows them (the kids editing their own).
- **Update All Prices:** anyone who can edit may run it, using **their own** price-service key from their own Settings (the owner's key is never shared). With no key set, the button asks them to add one first. Updated prices are the one shared data, so everyone sees them.
- Rules: holdings sit one level deeper than the current share rules cover, so **one small rules change** is needed (documented in `FirestoreRules.md`, deployed by you in the console, once).

## 3. Sensitive info (account number, username, password)

Today it is locked with *your* passphrase and nobody else can open it. A piece of data can't have two passphrases, so it works in two layers:

- The sensitive info is stored **once**, locked with a random **data key**.
- The data key is stored in a small locked **envelope for each person** with access. Each person's own passphrase opens only their own envelope; the envelope gives them the data key; the data key opens the info.
- So everyone with access types **their own passphrase**. Nothing is copied except the tiny envelopes.

How envelopes are made without anyone telling you a passphrase: each person gets a **lock-and-key pair**. The public lock is stored where the owner can use it; the private key is protected by that person's own passphrase. The owner locks the data key for them with their public lock; only their passphrase can open it.

| Situation | What happens |
|---|---|
| You change a password on a shared account | Everyone's view updates (same stored data) |
| Daughter forgets her passphrase | She sets a new one; you (the owner) open the data key and make her a new envelope. Nothing lost |
| You remove someone | Their envelope is deleted and the data key is **replaced** (info re-locked) so what they held no longer opens anything |
| You forget **your** passphrase | Still unrecoverable, same as today (no recovery, backups hold only locked data) |
| Recipient has not set a passphrase yet | Sensitive box shows "Waiting for <name> to set a passphrase"; everything else is visible; once they set it you finish their envelope |
| View only person | Can *see* sensitive info (needs it), cannot change it (rules enforce) |

Recipients **use the same passphrase they already use** for their own Legacy/Private vault if they have one; otherwise they are asked to create one the first time they open a sensitive box.

## 4. Decisions

| # | Decision |
|---|---|
| F1 | One share per **person**; Household (joint) and **per-budget** shares separate. |
| F2 | Credentials: **per-credential** sharing through audience shares, no rules change. |
| F3 | Sensitive info: **one stored copy, per-person envelopes** (section 3). Owner can reset others. |
| F4 | Per-person **View / Edit by group** as everywhere else; owner-only: share, stop, delete the person. |
| F5 | Summary, snapshots and all-time highs belong to a **Financial group**, not a person. A person's share includes the group that holds only that person (kids are tracked as their own group); groups of several people (me + wife) belong to the Household share; my own group stays private. The highs (`allTimeHigh*_<groupId>`) live in the single `investmentConfig` doc beside the private price key, so they are split out into the right share. |
| F6 | "Show who added/modified" setting applies. |
| F7 | Move engine reused, extended to handle the nested holdings. |
| F8 | Backup/restore include shared financial people and credential audiences, and the envelopes/lock pairs (locked data only). |

## 5. Build chunks

| # | Chunk | Result |
|---|---|---|
| **C1 ✅** | **Credentials sharing (built 2026-10-27):** Share control per credential, audience shares, Shared with me list, badge, view-only guard, backup. Two-account test. | Netflix login shared with the family |
| **F1 ✅** | **Key plumbing (built and verified 2026-10-27; rules published):** lock-and-key pairs protected by passphrase, data keys, envelopes, "waiting for" state. | Nothing changes for anyone |
| **F2 ✅** | **Financial plumbing (built and verified 2026-10-27 in js/sharefin.js; Accounts page drop-down only):** `finCol` helpers, rules change for holdings, active-person resolve, dropdown lists shared people. | Nothing changes for anyone |
| **F3 ✅** | **Financial screens (built and verified 2026-10-27; not yet: Stock Rollup of others' people, Import page, Ask AI)** switched to the helpers: accounts, holdings, Social Security, summary, snapshots, groups; view-only guard. Tested with a seeded share. | Works as owner, editor, viewer |
| **F4 ✅** | **Sensitive info (built and verified 2026-10-27)** via data key + envelopes; reset; rotate on remove. | Each person unlocks with their passphrase |
| **F5 ✅** | **Share / Stop sharing a person (built and verified 2026-10-27)** (dialog, move engine with holdings, "Shared with me"). Two-account test with a real kid-style account. | Wife and kids can see their people |
| **F6 ✅** | **Household (built and verified 2026-10-27):** joint accounts share; **per-budget** sharing. | Budget with the wife, not the kids |
| **F7 ✅** | **Backup/restore (built and verified 2026-10-27)**, spec, AppHelp, phone-width check. | Docs and backup complete |

Every chunk: test in the preview with the test accounts, update spec and AppHelp where behavior changed, bump `sw.js` and the `?v=` tags, commit, notify, push.

## 6. Risks

- **Passphrase lock-outs** are the main risk; the reset and "waiting for" states exist for that. Real accounts' sensitive info is never rewritten during testing.
- **Nested holdings** need the one-time rules change and an extension of the move engine.
- **Existing sensitive info** is re-locked under a data key only when an account is first shared; unshared accounts stay exactly as today.
- **Size:** many holdings per person; batches are size-aware and a backup file downloads first.

## 7. Questions — all settled (yes to each)

1. Does the wife see **balance history / performance** for shared people? Recommend yes (view).
2. **Budgets:** share one budget at a time (so kids never get yours). Recommend yes.
3. Recipients **reuse their existing passphrase** if they have one. Recommend yes.
4. **Update All Prices** for anyone who can edit, each using their own key (decided; replaces owner-only).

## 8. Not in this plan

Sharing Garage, Vehicles, Structures, Contacts, Health, Legacy, Journal; offline access to shared data.
