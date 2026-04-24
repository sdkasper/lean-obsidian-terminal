# Search in Terminal - Design Spec

**Date:** 2026-04-24
**Status:** Approved
**Feature:** Scrollback search with a top-overlay bar, configurable shortcut, plain-text matching, and case-sensitivity toggle.

---

## Overview

Add a find-in-terminal search bar to Lean Obsidian Terminal, powered by xterm.js `SearchAddon`. The bar slides in as a top overlay on the active terminal session and supports forward/backward navigation with a case-sensitivity toggle.

---

## Architecture

### New dependencies

- `@xterm/addon-search@^0.11.0` - new package, not currently installed. Matches the version band of `@xterm/addon-web-links@^0.11.0` already in use. Add via `npm install @xterm/addon-search`.

### `TerminalSession` interface changes (`terminal-tab-manager.ts`)

Two new fields:

```ts
searchAddon: SearchAddon;
overlayEl: HTMLElement;
```

No other fields needed. Query string and case flag are stored in the overlay's own DOM (input value + toggle state), not on the session object.

### Settings (`settings.ts`)

One new field in `TerminalPluginSettings`:

```ts
searchShortcut: string; // default: "Ctrl+Shift+F"
```

Displayed in the "Appearance & behavior" section as a plain text input with placeholder hint `e.g. Ctrl+Shift+F`.

---

## Overlay UI

**Placement:** `position:absolute; top:0; left:0; right:0; z-index: <above terminal canvas>` inside `containerEl` (which is already `position:relative`). Hidden by default via a CSS class; shown by removing it.

**Contents (left to right):**

| Element | Role |
|---------|------|
| Text input (`flex:1`) | Search query; autofocused on open |
| Counter label | `"3 of 12"` when matches found; `"No results"` when query is non-empty and resultCount is 0; blank when query is empty |
| Prev button (↑) | `searchAddon.findPrevious()` |
| Next button (↓) | `searchAddon.findNext()` |
| Case toggle (`Aa`) | Toggles `caseSensitive`; visually active when on; default off |
| Close button (✕) | Hides overlay, clears highlights, refocuses terminal |

---

## Data Flow

1. User presses configured shortcut - `attachCustomKeyEventHandler` intercepts it - calls `showSearch(session)`: overlay visible class applied, input focused.
2. User types - `input` event fires - `searchAddon.findNext(query, {caseSensitive, incremental: true})` highlights all matches and centers on the first.
3. `searchAddon.onDidChangeResults({resultCount, resultIndex})` - updates counter label.
4. **Next:** Enter key or ↓ button - `searchAddon.findNext(query, opts)`.
5. **Prev:** Shift+Enter or ↑ button - `searchAddon.findPrevious(query, opts)`.
6. **Case toggle:** click - flips `caseSensitive` flag, re-runs current query.
7. **Close:** Escape or ✕ - `searchAddon.findNext('', opts)` (clears all highlights), overlay hidden, `session.terminal.focus()`.

---

## Shortcut Parsing

A `parseShortcut(s: string)` utility converts `"Ctrl+Shift+F"` into `{ctrl, shift, alt, meta, key}`. Called per keydown event inside `attachCustomKeyEventHandler` (not cached - simple enough to be negligible). Matching checks modifier flags and case-insensitive key comparison. Unrecognized strings simply never match - no error thrown.

---

## Initialization (`createTab()`)

`SearchAddon` is loaded and attached alongside the existing addons (`FitAddon`, `WebLinksAddon`, `Unicode11Addon`):

```ts
const searchAddon = new SearchAddon();
terminal.loadAddon(searchAddon);
```

The overlay element is created and appended to `containerEl` immediately after. All overlay event listeners (input, buttons, Escape) are wired at creation time.

`attachCustomKeyEventHandler` gets a new branch: if the keydown matches `this.settings.searchShortcut`, call `toggleSearch(session)` and return `false`.

---

## Teardown

`closeTab()` and `destroyAll()` already call `session.terminal.dispose()` (which cleans up addons) and remove `containerEl` from the DOM (which removes the overlay). No additional teardown logic required.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Tab not yet spawned (binaries not installed) | Overlay opens; search returns no results. No special handling. |
| Search open during tab switch | Each session has its own overlay inside its `containerEl`. Switching tabs hides `containerEl` (existing behavior), naturally hiding the overlay. State preserved per-tab. |
| Terminal resize while search open | Overlay uses CSS absolute positioning - adapts automatically. |
| Empty query | `findNext("")` clears highlights. Counter shows `"0 of 0"`. SearchAddon handles this natively. |
| Shortcut conflicts with PTY signals | User responsibility. Settings hint notes the trade-off. No validation. |

---

## Files Changed

| File | Change |
|------|--------|
| `src/terminal-tab-manager.ts` | Add `searchAddon` + `overlayEl` to `TerminalSession`; wire up in `createTab()`; add shortcut branch in key handler; add `showSearch` / `hideSearch` / `toggleSearch` helpers |
| `src/settings.ts` | Add `searchShortcut` to interface + defaults + settings UI row |
| `styles.css` (or equivalent) | Add overlay CSS classes |
| `package.json` | Add `@xterm/addon-search` if not already present |
