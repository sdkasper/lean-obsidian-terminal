# lean-terminal

Obsidian desktop plugin providing an embedded PTY terminal panel using xterm.js + node-pty. No external windows.

## Stack

- TypeScript 5.8, Obsidian Plugin API (1.5.0+)
- xterm.js 5.5 (terminal rendering) + node-pty 1.0 (pseudo-terminal)
- esbuild (bundler), no test framework

## Commands

```bash
npm install         # Install dependencies
npm run dev         # Watch mode (auto-rebuild on changes)
npm run build       # Production build (minified, type-checked)
node install.mjs    # Copy plugin to D:\LOS Test vault
```

## Architecture

```
src/
  main.ts                # Plugin lifecycle: commands, ribbon icon, settings
  terminal-view.ts       # Obsidian ItemView: container, resize observer, tab manager
  terminal-tab-manager.ts # Tab UI + terminal session lifecycle (spawn, wiring, cleanup)
  pty-manager.ts         # PTY wrapper: platform shell detection, I/O, resize
  binary-manager.ts      # Download/manage node-pty native binaries from GitHub releases
  settings.ts            # Settings UI (shell, font, theme, cursor, scrollback, location)
  themes.ts              # 4 themes: Obsidian Dark/Light, Monokai, Solarized
  constants.ts           # View type & icon constants
```

Plugin > View > TabManager > PtyManager chain. BinaryManager handles native module downloads separately.

## Key details

- **Desktop-only** (`isDesktopOnly: true`)
- **Native modules**: node-pty NOT bundled by esbuild; loaded at runtime via Electron's `require()`
- **Binary download**: Users click "Download binaries" in Settings; fetches platform-specific node-pty from GitHub releases
- **Windows**: winpty backend + ConoutConnection patch (Obsidian's Electron renderer doesn't support Worker threads for ConPTY)
- **Shell auto-detect**: Windows tries PowerShell 7 then cmd.exe; macOS/Linux uses `$SHELL`
- **CI/CD**: Tag `v*` triggers GitHub Actions (build plugin + native binaries + create release)
- **No tests configured**

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
