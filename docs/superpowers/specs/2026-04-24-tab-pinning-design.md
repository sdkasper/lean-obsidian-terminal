# Tab Pinning - Design Spec

**Date:** 2026-04-24
**Status:** Approved
**Feature:** Pin terminal tabs to prevent accidental closure, with a lock icon indicator and context menu toggle.

---

## Overview

Add the ability to pin individual terminal tabs. A pinned tab cannot be closed until unpinned. Pinned tabs are visually distinguished by a lock icon before the tab label. All other tab behavior (drag reorder, rename, color, switching) is unchanged.

---

## Architecture

### `TerminalSession` interface change (`terminal-tab-manager.ts`)

One new field:

```ts
pinned: boolean; // default: false
```

No other interface changes. Pin state is stored on the session object, consistent with `color` and `mode2031`.

### Pin state persistence

Runtime only. Not persisted to `data.json`. Pin state resets when Obsidian restarts. No migration risk.

---

## UI

### Tab appearance (pinned)

```
[🔒 Terminal 1]   [Terminal 2 ×]   [Terminal 3 ×]
```

- A `🔒` text node (U+1F512) is prepended before the label span
- The `×` close button is not rendered at all (never created for pinned tabs)
- CSS class `terminal-tab--pinned` is added to the tab `div` for future theming

### Context menu

The existing context menu (Rename, Color) gets a new item after Color:

- When tab is unpinned: shows **"Pin"** - clicking sets `session.pinned = true` and calls `renderTabBar()`
- When tab is pinned: shows **"Unpin"** - clicking sets `session.pinned = false` and calls `renderTabBar()`

### Drag reorder

Pinned tabs are freely draggable, same as unpinned tabs. No position locking.

---

## Behavior

### `closeTab(id)`

Guard added at the top of the method:

```ts
if (session.pinned) return;
```

This silently blocks closure. Covers all close paths: close button (already hidden), command palette, and any future callers.

### `destroyAll()`

No change. Plugin unload closes all sessions including pinned ones - correct behavior.

---

## Files Changed

| File | Change |
|------|--------|
| `src/terminal-tab-manager.ts` | Add `pinned: boolean` to `TerminalSession`; guard in `closeTab()`; lock icon + no close button in `renderTabBar()`; Pin/Unpin item in `showTabContextMenu()` |
| `styles.css` | Add `.terminal-tab--pinned` class |

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Close pinned tab via close button | Close button is not rendered - impossible |
| Close pinned tab via command palette or other caller | `closeTab()` guard returns early - no-op |
| Drag pinned tab | Allowed - drags freely like any other tab |
| Rename pinned tab | Allowed - rename is unaffected |
| Color pinned tab | Allowed - color is unaffected |
| Obsidian restart | Pin state lost - tab opens unpinned next session |
| Last tab is pinned | Closing is blocked; user must unpin first to close |
| All tabs are pinned | No tabs can be closed until at least one is unpinned |
