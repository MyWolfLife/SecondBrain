# ChecklistBoardEnhancements.md — Checklists page: manual board layout, tags, filtering

**Area:** Life / Yard / House → Checklists (`js/checklists.js`, `#checklists`)
**Status:** Design agreed on the big rocks; a few small assumptions await confirmation (marked ⚠️). No code written yet.

This plan covers a set of 6 changes to the **Active runs** area of the Checklists page. Completed and Archived sections are unchanged.

---

## The six requests (user's words, condensed)

1. Kill the dead space under short cards — stop treating cards as rows locked to the tallest card's height; think of them as **columns, each a vertical stack of lists**.
2. **3 columns** on the computer (currently 2).
3. Cards should be **collapsible to the header row**, with the item count shown in the label.
4. **Add/remove tags after** a list is created (today tags are only set from the template at start).
5. A **unique-tag filter**: a checkbox list of tags on the far left (desktop) / a collapsible accordion under the filter (phone). Checking tags **narrows** the visible lists (AND). Check `races`, then also `ultra`, and it filters further.
6. **Drag-and-drop reorder.** Reordering is disabled whenever any filter is active (no full-collection context to order against).

---

## Key design decisions (agreed)

### Manual 2-D board instead of a 1-D sort index
Rather than one flat sort index (which forces a reflow when you drag), each list stores a **2-D position**:

- `boardCol` — integer `0..2`, which of the 3 desktop columns it lives in.
- `boardOrder` — number, its position within that column (top = lowest).

Dragging sets the card's target column + slot; **nothing else moves**. Dead space becomes entirely the user's choice, not something the layout imposes. This is a manual/kanban-style board for the Active section.

Because SortableJS cannot drag inside a CSS multi-column (`columns:3`) layout, the board is rendered as **3 real flex/stack column `<div>`s** side by side, with a shared SortableJS group so cards drag between columns.

### Desktop is the source of truth; phone is derived + read-only
A 2-D coordinate assumes a fixed column count, but the page is 3 columns on desktop and 1 on phone. Resolution:

- **Desktop (wide): 3-column editable board.** The only place you drag to arrange.
- **Phone / narrow: single column, read-only order**, derived from the board by **row-major reading**:
  `(order 1: col1, col2, col3), (order 2: col1, col2, col3), (order 3: …)` — read across each row, top to bottom. No dragging on phone (there are no columns to arrange).
- This also matches request #6's principle: you can only reorder when the full board is visible.

### Backfill (first load / migration)
Existing runs have no `boardCol`/`boardOrder`. On first load, distribute the current order (today's pinned-first, newest-started-first) **row-major** across the 3 columns:
list 1 → col0/order0, list 2 → col1/order0, list 3 → col2/order0, list 4 → col0/order1, …
Row-major backfill means the phone's derived order **equals today's order**, so nothing appears to jump.

### Star = highlight + one-time "bump to top" (agreed)
The star is a **highlight/marker** (still used for filtering/search), and the **act of starring** moves the list to **column 1, top position** as a one-time bump — then the user can reorder it freely and it stays put. **Unstarring only clears the ★; it does not move the list.**

- On star: set `boardCol = 0` and `boardOrder = (min boardOrder in col 0) − 1` so it lands on top **without renumbering** the other column-0 cards.
- On unstar: clear the flag only; no position change.

This keeps one board with one `(col, order)` per list — no separate favorites/non-favorites order spaces.

### Tag filter = AND, combined with the text filter
Checking multiple tags narrows progressively (list must have ALL checked tags). Combined with the existing text filter (both must match). Reorder is disabled whenever the text filter OR any tag is active.

---

## Open confirmations (⚠️ — small, not blockers)

- **Collapse persistence:** proposed **per-device via localStorage** keyed by run id (collapse is ephemeral view state; avoids a Firestore write per toggle). Could instead sync via a Firestore `collapsed` field if you want it shared across devices.
- **Unique-tag source:** proposed tags drawn from the **Active runs in the current context**. (Could include completed/archived.)
- **Medium/tablet width:** proposed **3-col editable when wide enough, else single-column read-only** — no 2-column intermediate, to keep the coordinate model clean. Revisit if a tablet layout feels needed.
- **Retire the existing phone 1/2-column ⊞ toggle** (`clColumnLayout` in localStorage) — superseded by the new responsive system.

---

## Data model changes

`checklistRuns` gains two fields (no new collection → no `settings.js` backup change needed):

| Field | Type | Meaning |
|-------|------|---------|
| `boardCol` | int (0–2) | Desktop column the list sits in |
| `boardOrder` | number | Position within its column (top = lowest) |

`tags[]` already exists on runs — reused for #4/#5, edited in place (does not touch the source template).

Collapse state: `localStorage` (proposed), not Firestore.

---

## Phased implementation (verify each phase in the preview before moving on)

**Phase 1 — Board layout + migration (no drag yet) — ✅ COMPLETE**
- Render Active runs into 3 flex columns by `(boardCol, boardOrder)` (`clRenderActiveBoard`).
- Row-major backfill for runs missing the fields; written back on first load (`clBackfillBoardPositions`).
- Phone/narrow (< 880px): single column, read-only, row-major derived order; mode chosen in JS via `matchMedia`, re-renders on breakpoint cross.
- New runs land at top of column 1 (`clNewBoardPosition`).
- Retired the ⊞ 1/2-col toggle + `localStorage.clColumnLayout`.
- Cache: `checklists.js?v=554`, `styles.css?v=783`, `sw.js` v554.

**Phase 2 — Drag-and-drop reorder**
- SortableJS shared group across the 3 columns.
- On drop: set `boardCol` = target column; recompute `boardOrder` for the affected column(s) from DOM order; persist.
- Enabled only in the 3-col editable view AND when no filter is active; otherwise hide handles + show a hint.

**Phase 3 — Collapsible cards**
- Chevron toggle per card; collapsed = header row + `· N items`.
- Persist collapse state (localStorage).

**Phase 4 — Edit tags on a run**
- In card ✏️ edit mode: existing tags shown as removable chips + an "add tag" input with autocomplete (datalist) of existing unique tags. Saves to `run.tags[]`.

**Phase 5 — Tag filter sidebar / accordion**
- Desktop: left sidebar column of unique-tag checkboxes → page becomes `[tag sidebar | 3-col board]`.
- Phone: collapsible accordion under the text filter.
- AND logic, combined with the text filter; drives the reorder-disable rule from Phase 2.

---

## Docs / conventions to update alongside code (per CLAUDE.md)
- `MyLife-Functional-Spec.md` → Checklists section.
- `AppHelp.md` → `## screen:checklists`.
- `sw.js` `CACHE_NAME` bump + `index.html` `js/checklists.js?v=` bump each commit.
- Register this file in `AllPlans.md` (done).
