# Design: Ribbon & Panel Tab Icon Customization

**Date:** 2026-04-15
**Status:** Approved

## Summary

Allow users to customize the icon shown in the Obsidian ribbon (left sidebar) and on the terminal panel tab. The icon is entered as a Lucide icon name with a live preview in the settings UI. Changes apply instantly to both the ribbon and any open terminal panel tabs.

## Scope

- One new setting: `ribbonIcon: string` (default `"terminal"`)
- Updates both ribbon icon and open panel tab icons live on change
- No support for hiding the ribbon icon (out of scope)
- No separate ribbon vs. panel tab icon (one setting controls both)

## Data & Settings

### `TerminalPluginSettings` (settings.ts)

Add one field:

```ts
ribbonIcon: string; // default: "terminal"
```

### `DEFAULT_SETTINGS` (settings.ts)

```ts
ribbonIcon: "terminal",
```

No migration needed - existing users without the field get the default via `Object.assign` in `loadSettings()`.

## Architecture

### `TerminalView.getIcon()` (terminal-view.ts)

Change from returning the `ICON_TERMINAL` constant to reading from settings dynamically:

```ts
getIcon(): string {
  return this.plugin.settings.ribbonIcon;
}
```

New panel tabs opened after a settings change automatically pick up the correct icon.

### `TerminalPlugin` (main.ts)

Store the ribbon element returned by `addRibbonIcon`:

```ts
private ribbonEl: HTMLElement | null = null;

// in onload():
this.ribbonEl = this.addRibbonIcon(
  this.settings.ribbonIcon, "Toggle terminal", () => { this.toggleTerminal(); }
);
```

Add a new `updateIcon(name: string)` method:

```ts
updateIcon(name: string): void {
  // Update ribbon
  if (this.ribbonEl) setIcon(this.ribbonEl, name);
  // Update all open terminal panel tab headers
  // leaf.tabHeaderInnerIconEl is undocumented but stable across Obsidian versions
  for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL)) {
    const iconEl = (leaf as any).tabHeaderInnerIconEl as HTMLElement | undefined;
    if (iconEl) setIcon(iconEl, name);
  }
}
```

`setIcon` is imported from `"obsidian"`. The `(leaf as any)` cast is scoped to this one method with an explanatory comment.

## Settings UI

Added under the "Appearance & behavior" section in `settings.ts`, after the Theme setting:

```
Icon
Enter a Lucide icon name (e.g. "terminal", "code-2", "zap"). Browse icons at lucide.dev.
[text input]  [live preview span]  [Reset button]
```

### Behavior

- **Live preview:** A `<span>` rendered inline next to the input. On each keystroke, call `setIcon(previewEl, value.trim())`. Invalid icon names render nothing in the preview - sufficient feedback without error messages.
- **On change:** Save to settings, call `this.plugin.updateIcon(value.trim())`.
- **Reset button:** Restores `"terminal"`, updates the text input value, re-renders the preview, saves settings, and calls `updateIcon("terminal")`.

### CSS (styles.css)

A small rule sizes the preview span to match Obsidian's standard icon dimensions:

```css
.lean-terminal-icon-preview svg {
  width: 16px;
  height: 16px;
  vertical-align: middle;
  margin-left: 8px;
}
```

## Files Changed

| File | Change |
|------|--------|
| `src/settings.ts` | Add `ribbonIcon` to interface + defaults + settings UI block |
| `src/main.ts` | Store `ribbonEl`, update `addRibbonIcon` call, add `updateIcon()`, import `setIcon` |
| `src/terminal-view.ts` | `getIcon()` reads from `this.plugin.settings.ribbonIcon` |
| `styles.css` | Add `.lean-terminal-icon-preview svg` rule |

## Edge Cases

- **Invalid icon name saved:** The ribbon and tab show nothing (Obsidian silently ignores unknown icon names via `setIcon`). No crash.
- **Empty string:** Treated as invalid - same behavior as unknown name. No special handling needed.
- **Panel tab opened before settings change:** Updated immediately by `updateIcon()` iterating open leaves.
- **Plugin reload:** `addRibbonIcon` is called with the saved `ribbonIcon` value, so the ribbon always reflects the persisted setting on startup.
