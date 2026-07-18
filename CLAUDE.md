# lean-terminal

Obsidian desktop plugin providing an embedded PTY terminal panel using xterm.js + node-pty. No external windows.

## Stack

- TypeScript 5.8, Obsidian Plugin API (minAppVersion 1.7.2; declarative settings on 1.13+)
- xterm.js 5.5 (terminal rendering) + node-pty 1.0 (pseudo-terminal)
- esbuild (bundler), Vitest (tests), ESLint (lint gate)

## Commands

```bash
npm install         # Install dependencies
npm run dev         # Watch mode (auto-rebuild on changes)
npm run build       # Production build (minified, type-checked)
npm test            # Run Vitest suite
npm run lint        # Run ESLint (typescript-eslint type-checked + eslint-plugin-obsidianmd)
node install.mjs    # Copy plugin to D:\LOS Test vault
```

## Architecture

```
src/
  main.ts                   # Plugin lifecycle: commands, ribbon icon, settings
  terminal-view.ts          # Obsidian ItemView: container, resize observer, tab manager
  terminal-tab-manager.ts   # Tab UI + terminal session lifecycle (spawn, wiring, cleanup)
  terminal-opener.ts        # Opens a tab in an existing terminal view, or spins up a new one
  pty-manager.ts            # PTY wrapper: platform shell detection, I/O, resize, ConPTY dll gating
  binary-manager.ts         # Download/manage node-pty native binaries from GitHub releases
  node-api.ts               # Structural types for Node APIs used via Electron's require() (no @types/node)
  path-links.ts             # Pure helpers: find clickable path tokens, split :line[:col] suffix
  key-handler-registry.ts   # Registry backing the public registerKeyHandler() API
  wikilink-autocomplete.ts  # [[ ]] autocomplete overlay for vault notes inside the terminal
  claude-sessions.ts        # Scans Claude Code project sessions for the session registry
  recent-sessions.ts        # Rescue buffer (FuzzySuggestModal) for recently closed tabs
  session-state.ts          # Shared types for terminal session persistence (SavedTab, etc.)
  shell-integration.ts      # OSC 133 shell integration init scripts (bash/zsh/pwsh)
  settings.ts               # Settings UI (shell, font, theme, cursor, scrollback, location)
  themes.ts                 # 12 built-in themes: Obsidian Dark/Light, Monokai, Solarized, Dracula, Nord, etc.
  theme-registry.ts         # Loads built-in themes + optional themes.json overrides
  tab-colors.ts             # Tab color palette: built-in presets + user-defined colors
  color-utils.ts            # sRGB hex mixing for tab-tinted terminal backgrounds
  obsidian-internals.ts     # Typed access to undocumented Obsidian internals (drag manager)
  constants.ts              # View type & icon constants
```

Plugin > View > TabManager > PtyManager chain. BinaryManager handles native module downloads separately. TerminalOpener bridges commands, the session registry, and the recent-sessions rescue buffer into View/TabManager.

## Key details

- **Desktop-only** (`isDesktopOnly: true`)
- **Native modules**: node-pty NOT bundled by esbuild; loaded at runtime via Electron's `require()`
- **Binary download**: Users click "Download binaries" in Settings; fetches platform-specific node-pty from GitHub releases
- **Windows**: winpty backend + ConoutConnection patch (Obsidian's Electron renderer doesn't support Worker threads for ConPTY)
- **Windows 10 mouse support**: `pty-manager.ts`'s `shouldEnableConptyDll()` gates node-pty's `useConptyDll` on the bundled OpenConsole.exe/conpty.dll actually existing on disk for the host arch, since the win32-arm64 binary package and older downloads may not have them
- **Shell auto-detect**: Windows tries PowerShell 7 then cmd.exe; macOS/Linux uses `$SHELL`
- **Settings UI**: declarative schema with in-app settings search on Obsidian 1.13+, falling back to imperative rendering on older supported versions (minAppVersion unchanged)
- **CI/CD**: Bare semver tags (`1.4.0`, never `v1.4.0` - must match manifest.json exactly) trigger GitHub Actions (build plugin + native binaries + create release); `arm64-prebuilds/` is no longer tracked in git - CI downloads it from the `arm64-prebuilds-v1` release asset
- **Tests**: Vitest suite via `npm test` (100 tests / 10 files as of writing), colocated as `src/*.test.ts` with mocks in `__mocks__/`
- **Lint**: `npm run lint` runs ESLint (typescript-eslint type-checked + eslint-plugin-obsidianmd). Node API access must go through `src/node-api.ts` structural types - the Obsidian review bot type-checks without `@types/node`

## Agile Artifacts

Stored in the Obsidian vault at `$VAULT_PATH/01 Projects/LP Products/Lean Obsidian Terminal/`. Includes Epics, User Stories, NFRs, and Test Cases following the standard artifact format.

## Plugin commands

- `open-terminal` / `close-terminal` / `toggle-terminal`
- `new-terminal-tab`
- `open-terminal-split`

## Executor-Advisor Workflow (Automated)

**Auto-Applied Advisor Tier** — Requires Opus review before merge:
1. **Plugin Lifecycle & Permissions** (main.ts changes: command registration, ribbon modifications, plugin enable/disable hooks)
   - Validation check: Does the command/ribbon change affect plugin discovery or Obsidian integration?
   - Example: Adding a new ribbon icon, changing command palettes, modifying plugin load sequence
2. **Native Module Changes** (PTY manager, BinaryManager, node-pty version updates)
   - Validation check: Are platform-specific behaviors preserved (Windows/macOS/Linux)? Are fallbacks in place?
   - Example: node-pty upgrades, Electron require() modifications, Windows ConoutConnection patches
3. **Terminal Session Lifecycle** (terminal-tab-manager.ts, pty-manager.ts: spawn, cleanup, I/O wiring)
   - Validation check: Are all PTY instances cleaned up on close? Does tab switching preserve session state?
   - Example: PTY spawn logic, signal handling (SIGTERM, SIGKILL), zombie process prevention
4. **Settings & Persistence** (settings.ts: user config storage, defaults)
   - Validation check: Are existing user settings migrated/handled if schema changes? No data loss on upgrade?
   - Example: Adding new shell options, changing config serialization, theme storage changes

**Executor-Only Tier** — Default fast path, escalate if needed:
Default fast path — implement with Haiku, no mandatory Opus gate. Escalate to Opus if implementation reveals the change touches Tier 1 concerns or unexpected complexity:
- Terminal UI/UX tweaks (xterm.js styling, tab appearance, resize behavior)
- Theme additions or color refinements
- Shell detection improvements (non-breaking, additive)
- Error messages, logging, documentation
- Tests (once framework is added)

**When to escalate:** If the change interacts with plugin lifecycle, affects PTY session management, alters platform-specific behavior, or has unintended side effects on Electron's require() chain → pause and request Opus validation before merge.

**Implementation Pattern:**
1. Haiku executor implements the full change
2. Determine which tier it belongs to (review the categories above)
3. If Tier 1: Submit the change for Opus validation with the relevant check listed above
4. Merge after validation or executor-only changes are complete
