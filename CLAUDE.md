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
node install.mjs    # Copy plugin to D:\LEAN VAULTS\DEMO vault
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
  path-links.ts             # Pure helpers: find clickable path tokens, split :line[:col] suffix, UNC and open-allowlist checks, per-shell quotePath, paste sanitizing (sanitizePaste, tabsToSpaces, shellHonorsBracketedPaste)
  paste-confirm-modal.ts    # Modal that shows the full text of a multi-line paste before it reaches a shell that runs each line
  zip-entries.ts            # Pure check for unsafe zip entry names (absolute, drive, dot-only segments) before extraction
  tab-cwd.ts                # Pure helper: plan a new tab's cwd with an injected isDir check; empty, whitespace or a missing directory spawns in the vault root, the requested path stays stored
  osc52-clipboard.ts        # OSC 52 parser handler: write-only clipboard support for terminal apps
  update-notice.ts          # Pure helpers: when to show the one-time update notice (minor/major bumps only)
  update-notice-modal.ts    # The update notice modal: what's new list and support link
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
- **Windows 10 mouse support**: `pty-manager.ts`'s `shouldEnableConptyDll()` gates node-pty's `useConptyDll` on conpty.dll + OpenConsole.exe existing at `prebuilds/<platform>-<arch>/conpty/` (where node-pty's native loader resolves them, not `third_party/`), since older downloads (e.g. the 1.4.0 win32-arm64 zip, #105) lack that layout; `repairConptyLayout()` runs just before the gate at spawn and copies flat `prebuilds/<platform>-<arch>/{conpty.dll,OpenConsole.exe}` into `conpty/` to heal such installs without a re-download
- **Shell auto-detect**: Windows (`pickWindowsDefaultShell` in `pty-manager.ts`) tries the standard-installer PowerShell 7, then the Microsoft Store one, then `COMSPEC`/cmd.exe; macOS/Linux uses `$SHELL`. The Store path `%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe` is an app execution alias that does not launch under winpty, so `resolveWindowsStorePwshAlias` resolves it to the package's real `pwsh.exe` via `Get-AppxPackage` (not `where.exe`, which can return another PATH pwsh). It only runs when the alias file exists, with a 5 s timeout and `windowsHide`, cached per session (never a failure; a failed lookup is skipped for 60 s), because the call is synchronous on the UI thread. PowerShell shell integration writes OSC 133 markers with `[char]27`, never `` `e ``, so Windows PowerShell 5.1 works too
- **Tab cwd fallback**: `createTab` runs `planTabCwd` (`tab-cwd.ts`) with a `statSync(...).isDirectory()` check. If a restored tab's saved cwd is empty, not a directory or the stat throws, the shell spawns in the vault root, but `session.cwd` keeps the requested path so a temporarily missing drive is not overwritten on the next layout save. A Notice and `console.warn` ("Folder not available") fire once per affected tab on every restore, not deduplicated. The `statSync` is synchronous on the UI thread, so an unreachable network path (e.g. `\\nas\share`) can block startup for seconds per tab. A restored Claude tab still runs its `resumeCommand` from the vault root after a fallback, so `claude --resume` will likely report "No conversation found"
- **Settings UI**: declarative schema with in-app settings search on Obsidian 1.13+, falling back to imperative rendering on older supported versions (minAppVersion unchanged)
- **CI/CD**: Bare semver tags (`1.4.0`, never `v1.4.0` - must match manifest.json exactly) trigger GitHub Actions (build plugin + native binaries + create release); `arm64-prebuilds/` is no longer tracked in git - CI downloads it from the `arm64-prebuilds-v1` release asset
- **CSS scoping**: every `styles.css` selector must start with `.workspace-leaf-content[data-type="terminal-view"]` or `.lean-`; elements attached to `document.body` use `lean-` classes. `src/styles-scoping.test.ts` enforces this and bans at-rules
- **Paste safety**: `pasteText` in `terminal-tab-manager.ts` runs every clipboard paste (Ctrl+V and the capture-phase `paste` event) through `sanitizePaste` (removes control, bidi, zero-width, variation-selector and Unicode tag characters), turns tabs into spaces unless the shell is inert, and confirms multi-line text via `PasteConfirmModal` unless `shellHonorsBracketedPaste` is true AND xterm's bracketed-paste mode is on. The mode bit alone is never trusted because program output can set it (`ESC[?2004h`). Known limit: an inner program such as `ssh` into a simpler shell is not detected. A `pasting` flag keeps `terminal.paste()` data away from the wiki-link autocomplete
- **Shell quoting**: `shellFamily` returns posix (sh, bash, zsh, dash, ash, ksh, mksh, rbash), fish, powershell, cmd or `unknown`; `quotePath` returns `null` when a name cannot be quoted safely (control characters, cmd `% ! "`, anything non-plain for an `unknown` shell), and callers (drop handler, autocomplete) must handle `null` with a Notice. A leading dash gets a `./` prefix (`.\` for cmd). Never guess quoting rules for a shell not listed
- **Click-to-open**: `resolvePathTarget` rejects UNC paths (no hover stat, avoids SMB/NTLM and UI stalls); `canOpenDirectly` is an allowlist, and every other file is passed to `shell.showItemInFolder` instead of `shell.openPath`. Do not add Office, RTF, XML, CSV, script or shortcut types
- **Binary install**: `BinaryManager.download` is single-flight, checks zip entries with `unsafeZipEntry`, extracts into `node-pty.new`, then swaps with rollback (`.old-<timestamp>`); the old install is deleted only after a successful swap. PowerShell paths use `psSingleQuote`, which doubles curly quotes too
- **Tests**: Vitest suite via `npm test` (262 tests / 21 files as of writing), colocated as `src/*.test.ts` with mocks in `__mocks__/`
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
