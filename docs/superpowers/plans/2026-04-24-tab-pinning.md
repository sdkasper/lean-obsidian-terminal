# Tab Pinning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `pinned` boolean to each terminal session so pinned tabs cannot be closed, show a lock icon in the tab, and let users toggle pin state via the right-click context menu.

**Architecture:** `pinned: boolean` (default `false`) is added to `TerminalSession`. `closeTab()` returns early when the session is pinned. `renderTabBar()` adds a lock icon span before the label and skips the close button for pinned tabs. The context menu gets a Pin/Unpin item that toggles the field and re-renders.

**Tech Stack:** TypeScript 5.8, Obsidian Plugin API, esbuild (`npm run build`)

---

## File Map

| File | Change |
|------|--------|
| `src/terminal-tab-manager.ts` | Add `pinned` to interface + session literal; guard in `closeTab()`; lock icon + conditional close btn in `renderTabBar()`; Pin/Unpin in `showTabContextMenu()` |
| `styles.css` | Add `.terminal-tab--pinned` and `.terminal-tab-pin-icon` classes |

---

## Task 1: Add `pinned` field to `TerminalSession`

**Files:**
- Modify: `src/terminal-tab-manager.ts`

No test framework exists in this project. Verify each task by running `npm run build` and confirming zero TypeScript errors.

- [ ] **Step 1: Add `pinned` to the `TerminalSession` interface**

In `src/terminal-tab-manager.ts`, find the `TerminalSession` interface (around line 68). Add `pinned: boolean;` after `toggleSearch`:

```ts
export interface TerminalSession {
  id: string;
  name: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  pty: PtyManager;
  containerEl: HTMLElement;
  color: string;
  /** Whether this session has opted into Mode 2031 color-scheme-change notifications. */
  mode2031: boolean;
  /** Disposables for parser handlers (cleaned up on tab close). */
  parserDisposables: IDisposable[];
  dragLabel: HTMLElement;
  searchAddon: SearchAddon;
  overlayEl: HTMLElement;
  toggleSearch: () => void;
  pinned: boolean;
}
```

- [ ] **Step 2: Add `pinned: false` to the session object literal in `createTab()`**

Find the session object literal (around line 535). Add `pinned: false` after `toggleSearch`:

```ts
const session: TerminalSession = {
  id, name, terminal, fitAddon, pty, containerEl, color: "",
  mode2031: false,
  parserDisposables: [],
  dragLabel,
  searchAddon,
  overlayEl,
  toggleSearch,
  pinned: false,
};
```

- [ ] **Step 3: Build and verify no TypeScript errors**

```bash
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/terminal-tab-manager.ts
git commit -m "feat: add pinned field to TerminalSession"
```

---

## Task 2: Add CSS classes for pinned tabs

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Append pinning CSS at the end of `styles.css`**

```css
/* Tab pinning */
.terminal-tab--pinned {}

.terminal-tab-pin-icon {
  font-size: 10px;
  opacity: 0.8;
  flex-shrink: 0;
}
```

Note: `.terminal-tab` already uses `display: flex; align-items: center; gap: 6px;` so the icon aligns automatically with the existing gap. `.terminal-tab--pinned` is a placeholder class for future theme customization.

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "feat: add CSS classes for pinned tab indicator"
```

---

## Task 3: Wire pin behavior - renderTabBar, closeTab, context menu

**Files:**
- Modify: `src/terminal-tab-manager.ts`

This task adds all runtime behavior in one shot so the build is clean at the end.

- [ ] **Step 1: Update `renderTabBar()` - add pinned class, lock icon, skip close button**

Find the `renderTabBar()` method (around line 813). Replace the tab creation block and the close button block:

**Before** (the tab div creation, around line 817):
```ts
      const tab = this.tabBarEl.createDiv({
        cls: `terminal-tab${session.id === this.activeId ? " active" : ""}`,
      });
```

**After:**
```ts
      const tab = this.tabBarEl.createDiv({
        cls: `terminal-tab${session.id === this.activeId ? " active" : ""}${session.pinned ? " terminal-tab--pinned" : ""}`,
      });
```

**Before** (the lock icon section does not exist yet; the label creation, around line 827):
```ts
      const label = tab.createSpan({ cls: "terminal-tab-label", text: session.name });
```

**After:**
```ts
      if (session.pinned) {
        tab.createSpan({ cls: "terminal-tab-pin-icon", text: "\u{1F512}" });
      }

      const label = tab.createSpan({ cls: "terminal-tab-label", text: session.name });
```

**Before** (the close button block, around line 835):
```ts
      const closeBtn = tab.createSpan({ cls: "terminal-tab-close", text: "×" });
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeTab(session.id);
      });
```

**After:**
```ts
      if (!session.pinned) {
        const closeBtn = tab.createSpan({ cls: "terminal-tab-close", text: "×" });
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.closeTab(session.id);
        });
      }
```

- [ ] **Step 2: Update `closeTab()` - add pinned guard**

Find `closeTab()` (around line 628). Add the pinned guard immediately after the `idx === -1` check:

**Before:**
```ts
  closeTab(id: string): void {
    const idx = this.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return;

    const session = this.sessions[idx];
    for (const d of session.parserDisposables) d.dispose();
```

**After:**
```ts
  closeTab(id: string): void {
    const idx = this.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return;

    const session = this.sessions[idx];
    if (session.pinned) return;

    for (const d of session.parserDisposables) d.dispose();
```

- [ ] **Step 3: Update `showTabContextMenu()` - add Pin/Unpin item**

Find `showTabContextMenu()` (around line 734). The method ends with `document.body.appendChild(menu)` followed by the click-outside handler. Add the Pin/Unpin item between the color row block and `document.body.appendChild(menu)`:

**Before:**
```ts
    document.body.appendChild(menu);

    // Close on click outside
```

**After:**
```ts
    // Pin / Unpin option
    const pinItem = menu.createDiv({
      cls: "terminal-ctx-item",
      text: session.pinned ? "Unpin" : "Pin",
    });
    pinItem.addEventListener("click", () => {
      session.pinned = !session.pinned;
      this.renderTabBar();
      menu.remove();
    });

    document.body.appendChild(menu);

    // Close on click outside
```

- [ ] **Step 4: Build and verify no TypeScript errors**

```bash
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/terminal-tab-manager.ts
git commit -m "feat: wire tab pinning behavior - lock icon, close guard, context menu"
```

---

## Task 4: Install and manually verify

**Files:**
- No code changes - build, install, and test.

- [ ] **Step 1: Install to test vault**

```bash
node install.mjs
```

- [ ] **Step 2: Open Obsidian and open the terminal**

Open the terminal panel with at least two tabs open.

- [ ] **Step 3: Test - pin a tab via context menu**

Right-click a tab. Context menu shows "Pin". Click it. The tab now shows 🔒 before its name. The × close button disappears. The context menu item now reads "Unpin" when right-clicking that tab again.

- [ ] **Step 4: Test - cannot close a pinned tab**

With a tab pinned, try to close it: the close button is gone so clicking where it was does nothing. Use the command palette or any other close path - the tab stays open.

- [ ] **Step 5: Test - unpin restores close button**

Right-click the pinned tab and choose "Unpin". The 🔒 disappears, the × close button reappears, and the tab can be closed normally.

- [ ] **Step 6: Test - drag still works**

With a tab pinned, drag it to a different position in the tab bar. It should reorder freely like any other tab.

- [ ] **Step 7: Test - rename and color still work**

Right-click a pinned tab. "Rename" and "Color" options are still present and functional alongside "Unpin".

- [ ] **Step 8: Test - multiple pinned tabs**

Pin two tabs. Both show 🔒. Neither can be closed. Unpin one - only that one gets its close button back.

- [ ] **Step 9: Commit any fixes**

If any issues were found and fixed during testing:

```bash
git add -p
git commit -m "fix: tab pinning <describe what was fixed>"
```
