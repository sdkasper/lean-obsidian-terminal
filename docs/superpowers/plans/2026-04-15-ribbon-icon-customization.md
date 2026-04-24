# Ribbon & Panel Tab Icon Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users type a Lucide icon name to customize the plugin's ribbon and panel tab icon, with a live preview in settings.

**Architecture:** Add one `ribbonIcon` setting field; store the ribbon `HTMLElement` returned by `addRibbonIcon` so it can be updated live; add `updateIcon()` to the plugin that refreshes both the ribbon and all open panel tab headers using Obsidian's `setIcon()` API. `TerminalView.getIcon()` reads from settings dynamically so new panels open with the correct icon.

**Tech Stack:** TypeScript 5.8, Obsidian Plugin API (`setIcon`, `Setting`, `WorkspaceLeaf`), esbuild

---

## File Map

| File | Change |
|------|--------|
| `src/settings.ts` | Add `ribbonIcon` to interface + `DEFAULT_SETTINGS` + icon setting UI block |
| `src/main.ts` | Store `ribbonEl`, update `addRibbonIcon` call, add `updateIcon()`, import `setIcon` |
| `src/terminal-view.ts` | `getIcon()` reads `this.plugin.settings.ribbonIcon` instead of constant |
| `styles.css` | Add `.lean-terminal-icon-preview svg` sizing rule |

---

## Task 1: Add `ribbonIcon` to settings data

**Files:**
- Modify: `src/settings.ts`

- [ ] **Step 1: Add field to `TerminalPluginSettings` interface**

In `src/settings.ts`, add `ribbonIcon` to the interface (after `scrollback`):

```ts
export interface TerminalPluginSettings {
  shellPath: string;
  fontSize: number;
  fontFamily: string;
  theme: string;
  backgroundColor: string;
  cursorBlink: boolean;
  scrollback: number;
  ribbonIcon: string;
  defaultLocation: "right" | "bottom";
  notifyOnCompletion: boolean;
  notificationSound: NotificationSound;
  notificationVolume: number;
}
```

- [ ] **Step 2: Add default value to `DEFAULT_SETTINGS`**

In `src/settings.ts`, add `ribbonIcon` to `DEFAULT_SETTINGS` (after `scrollback`):

```ts
export const DEFAULT_SETTINGS: TerminalPluginSettings = {
  shellPath: "",
  fontSize: 14,
  fontFamily: "Menlo, Monaco, 'Courier New', monospace",
  theme: "obsidian-dark",
  backgroundColor: "",
  cursorBlink: true,
  scrollback: 5000,
  ribbonIcon: "terminal",
  defaultLocation: "bottom",
  notifyOnCompletion: false,
  notificationSound: "beep",
  notificationVolume: 50,
};
```

- [ ] **Step 3: Build to verify no type errors**

```bash
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/settings.ts
git commit -m "feat: add ribbonIcon setting field with default terminal"
```

---

## Task 2: Store ribbon element and add `updateIcon()` to plugin

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Import `setIcon` from obsidian**

In `src/main.ts`, update the import line:

```ts
import { FileSystemAdapter, Plugin, WorkspaceLeaf, setIcon } from "obsidian";
```

- [ ] **Step 2: Add `ribbonEl` field to the plugin class**

In `src/main.ts`, add the field after `binaryManager`:

```ts
export default class TerminalPlugin extends Plugin {
  settings: TerminalPluginSettings = DEFAULT_SETTINGS;
  binaryManager!: BinaryManager;
  private ribbonEl: HTMLElement | null = null;
```

- [ ] **Step 3: Store the return value of `addRibbonIcon` and use dynamic icon name**

In `src/main.ts` inside `onload()`, replace:

```ts
    // Ribbon icon
    this.addRibbonIcon(ICON_TERMINAL, "Toggle terminal", () => {
      this.toggleTerminal();
    });
```

With:

```ts
    // Ribbon icon
    this.ribbonEl = this.addRibbonIcon(this.settings.ribbonIcon, "Toggle terminal", () => {
      this.toggleTerminal();
    });
```

- [ ] **Step 4: Add `updateIcon()` method**

In `src/main.ts`, add this method after `updateTerminalBackgrounds()`:

```ts
  updateIcon(name: string): void {
    if (this.ribbonEl) setIcon(this.ribbonEl, name);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL)) {
      // leaf.tabHeaderInnerIconEl is undocumented but stable across Obsidian versions
      const iconEl = (leaf as any).tabHeaderInnerIconEl as HTMLElement | undefined;
      if (iconEl) setIcon(iconEl, name);
    }
  }
```

- [ ] **Step 5: Build to verify no type errors**

```bash
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat: store ribbon element and add updateIcon() for live refresh"
```

---

## Task 3: Make `getIcon()` read from settings

**Files:**
- Modify: `src/terminal-view.ts`

- [ ] **Step 1: Update `getIcon()` to read from plugin settings**

In `src/terminal-view.ts`, replace:

```ts
  getIcon(): string {
    return ICON_TERMINAL;
  }
```

With:

```ts
  getIcon(): string {
    return this.plugin.settings.ribbonIcon;
  }
```

- [ ] **Step 2: Remove unused `ICON_TERMINAL` import from `terminal-view.ts`**

In `src/terminal-view.ts`, update:

```ts
import { VIEW_TYPE_TERMINAL, ICON_TERMINAL } from "./constants";
```

To:

```ts
import { VIEW_TYPE_TERMINAL } from "./constants";
```

- [ ] **Step 3: Remove unused `ICON_TERMINAL` import from `main.ts`**

After Task 2, `main.ts` uses `this.settings.ribbonIcon` instead of `ICON_TERMINAL`. Update the import in `src/main.ts`:

```ts
import { VIEW_TYPE_TERMINAL } from "./constants";
```

- [ ] **Step 4: Build to verify no type errors**

```bash
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/terminal-view.ts src/main.ts
git commit -m "feat: getIcon() reads ribbonIcon from settings dynamically"
```

---

## Task 4: Add icon setting UI

**Files:**
- Modify: `src/settings.ts`

- [ ] **Step 1: Import `setIcon` from obsidian**

In `src/settings.ts`, update the import line:

```ts
import { App, Notice, PluginSettingTab, Setting, ColorComponent, setIcon } from "obsidian";
```

- [ ] **Step 2: Add the Icon setting block after the Theme setting**

In `src/settings.ts`, locate the Theme setting block (ends after the `dropdown.onChange` closure). Insert the following immediately after it, before the Background color setting:

```ts
    const iconSetting = new Setting(containerEl)
      .setName("Icon")
      .setDesc("Enter a Lucide icon name (e.g. \"terminal\", \"code-2\", \"zap\"). Browse icons at lucide.dev.");

    let previewEl: HTMLElement | null = null;

    iconSetting.addText((text) => {
      text
        .setValue(this.plugin.settings.ribbonIcon)
        .onChange(async (value) => {
          const name = value.trim();
          this.plugin.settings.ribbonIcon = name;
          await this.plugin.saveSettings();
          this.plugin.updateIcon(name);
          if (previewEl) setIcon(previewEl, name);
        });
    });

    previewEl = iconSetting.controlEl.createSpan({ cls: "lean-terminal-icon-preview" });
    setIcon(previewEl, this.plugin.settings.ribbonIcon);

    iconSetting.addButton((btn) => {
      btn.setButtonText("Reset").onClick(async () => {
        this.plugin.settings.ribbonIcon = "terminal";
        await this.plugin.saveSettings();
        this.plugin.updateIcon("terminal");
        this.display();
      });
    });
```

- [ ] **Step 3: Build to verify no type errors**

```bash
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/settings.ts
git commit -m "feat: add icon setting UI with live preview and reset button"
```

---

## Task 5: Add CSS for icon preview

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Append preview icon rule to `styles.css`**

Add the following at the end of `styles.css`:

```css
/* Icon setting preview */
.lean-terminal-icon-preview {
  display: inline-flex;
  align-items: center;
  margin-left: 8px;
}

.lean-terminal-icon-preview svg {
  width: 16px;
  height: 16px;
}
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style: add icon preview sizing for settings UI"
```

---

## Task 6: Install and manual test

**Files:** none (install + test only)

- [ ] **Step 1: Install to test vault**

```bash
node install.mjs
```

Expected: plugin files copied to `D:\LOS Test\.obsidian\plugins\lean-terminal\`.

- [ ] **Step 2: Reload plugin in Obsidian**

In Obsidian (with `D:\LOS Test` vault open): open Settings > Community plugins > disable then re-enable "Lean Terminal". Or use the "Reload app without saving" command.

- [ ] **Step 3: Verify default ribbon icon**

Check the ribbon (left sidebar). The terminal icon should appear as before (`"terminal"` icon). No visual change expected at this point.

- [ ] **Step 4: Open a terminal panel**

Run the "Open terminal" command. Verify the panel tab shows the terminal icon.

- [ ] **Step 5: Change icon to `"zap"` in settings**

Open Settings > Lean Terminal. In the Icon field, clear the text and type `zap`.

Expected:
- Preview span next to the input shows a lightning bolt icon immediately.
- Ribbon icon updates to the lightning bolt without plugin reload.
- Open terminal panel tab icon updates to the lightning bolt.

- [ ] **Step 6: Test invalid icon name**

Clear the Icon field and type `not-a-real-icon`.

Expected:
- Preview span shows nothing (blank).
- Ribbon shows nothing (blank) - this is acceptable behavior.
- No crash or error in the console.

- [ ] **Step 7: Test Reset button**

Click "Reset" in the Icon setting.

Expected:
- Text input reverts to `"terminal"`.
- Preview shows the terminal icon.
- Ribbon and any open panel tabs revert to the terminal icon.

- [ ] **Step 8: Test persistence across reload**

Set icon to `"code-2"`. Close and reopen Obsidian (or reload the plugin).

Expected: ribbon still shows the `"code-2"` icon on startup.

---

## Task 7: Bump version and final commit

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`

- [ ] **Step 1: Bump patch version**

In `manifest.json`, update `"version"` from `"0.6.3"` to `"0.6.4"`.

In `package.json`, update `"version"` from `"0.6.3"` to `"0.6.4"`.

- [ ] **Step 2: Commit and tag**

```bash
git add manifest.json package.json
git commit -m "chore: bump to v0.6.4"
git tag 0.6.4
git push origin master --tags
```

Expected: CI triggers and builds release `0.6.4`.
