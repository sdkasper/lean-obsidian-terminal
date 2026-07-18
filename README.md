# Lean Terminal

[![Release](https://img.shields.io/github/release/sdkasper/lean-obsidian-terminal?logo=obsidian&logoColor=A991D4&style=flat-square&labelColor=000000&color=25D0F7)](https://github.com/sdkasper/lean-obsidian-terminal/releases)
[![Obsidian](https://img.shields.io/badge/Obsidian-v1.5.0+-A991D4?style=flat-square&labelColor=000000)](https://obsidian.md)
[![Issues](https://img.shields.io/github/issues/sdkasper/lean-obsidian-terminal?logo=obsidian&logoColor=A991D4&style=flat-square&labelColor=000000&color=FC3634)](https://github.com/sdkasper/lean-obsidian-terminal/issues)
[![Closed](https://img.shields.io/github/issues-closed/sdkasper/lean-obsidian-terminal?logo=obsidian&logoColor=A991D4&style=flat-square&labelColor=000000&color=18BC9C)](https://github.com/sdkasper/lean-obsidian-terminal/issues?q=is%3Aissue+is%3Aclosed)
[![Downloads](https://img.shields.io/github/downloads/sdkasper/lean-obsidian-terminal/total?logo=obsidian&logoColor=A991D4&style=flat-square&labelColor=000000&color=25D0F7)](https://github.com/sdkasper/lean-obsidian-terminal/releases)
[![Stars](https://img.shields.io/github/stars/sdkasper/lean-obsidian-terminal?logo=obsidian&logoColor=A991D4&style=flat-square&labelColor=000000&color=000000)](https://github.com/sdkasper/lean-obsidian-terminal/stargazers)
[![License](https://img.shields.io/badge/License-MIT-007BFF?style=flat-square&labelColor=000000)](https://github.com/sdkasper/lean-obsidian-terminal/blob/master/LICENSE)
[![Discord](https://img.shields.io/badge/Discord-Join%20Server-5865F2?style=flat-square&labelColor=000000&logo=discord&logoColor=5865F2)](https://discord.gg/sbMg6PP2vq)

An embedded terminal panel for [Obsidian](https://obsidian.md), powered by [xterm.js](https://xtermjs.org/) and [node-pty](https://github.com/nicedoc/node-pty). Run shell commands directly inside your vault workspace - no external windows needed.

**Desktop only.** Requires Obsidian 1.5.0+.

## Features

### Terminal Core

- Full PTY terminal (not a simple command runner) with interactive shell support
- Auto-detects your shell: PowerShell 7 (including Microsoft Store installs) / Windows PowerShell / cmd.exe on Windows, `$SHELL` on macOS/Linux; execution policy bypass applied automatically so shell-integration scripts are never blocked
- Windows 10 mouse support in TUI apps (vim, htop, etc.) via node-pty's bundled OpenConsole.exe - auto-enabled when the downloaded binaries include it
- Startup command: configure a command that runs automatically in every new tab once the shell is ready (e.g. `claude`, `npm run dev`)
- Clipboard support: Ctrl+V / Cmd+V paste, Ctrl+C / Cmd+C copy (with selection)
- Clickable URLs in terminal output
- Auto-resize as the panel resizes
- Shift+Enter inserts a newline without submitting (muscle memory for Claude Code users)
- Readline shortcuts: Ctrl+K (kill to end), Ctrl+U (kill to start), Ctrl+W (kill word), Ctrl+E (end of line), Ctrl+L (clear screen) - toggle under Settings > Behavior > Readline shortcuts
- The **Open terminal** command focuses an already-open terminal pane instead of only revealing it, so keyboard input lands in the shell immediately
- **Note:** Fullscreen mode in detached windows is not supported — terminal content will not reflow to the new width until a command is executed

### Tab Management

- Multiple tabs with rename, color-coding, and pinning support
- Drag tabs to reorder them in the tab bar
- Keyboard shortcuts: Next/Previous (with wrap-around), Jump to Tab 1-8, Jump to last - bindable under Settings > Hotkeys
- Tab bar positioning: Top (default), Left, or Right side for wide-monitor layouts

### Vault Integration

- Opens in vault root by default; command palette to open in the current file's folder; right-click any file or folder to open a terminal there
- Drag files or images from the Obsidian file explorer or Windows Explorer into the terminal to insert the absolute path (spaces auto-quoted); paste clipboard images directly to attach in Claude Code sessions
- Clickable file paths: any valid file path in terminal output becomes a clickable link that opens the file in Obsidian (vault files) or your system's default app (files outside the vault); recognizes Windows drive letters, vault-relative paths, quoted paths with spaces, and a trailing `path:line[:col]` suffix that jumps straight to that line. On by default - toggle off under Settings > Behavior > Clickable file paths to disable path links while leaving URL and hyperlink clicking unaffected
- Wiki-link autocomplete: type `[[` in the terminal to pick any vault note and insert as a wiki-link, vault-relative path, or absolute path

### Search & Selection

- In-terminal search bar (Ctrl+Alt+F): match counter, case-sensitive toggle, and highlight decorations
- Copy on select: automatically copies selected text to the clipboard as you highlight

### Appearance & Configuration

- 12 built-in color themes (Obsidian Dark, Obsidian Light, Monokai, Solarized Dark, and more); extend or override via themes.json
- **Auto theme:** terminal theme automatically follows Obsidian's dark/light mode toggle (new default for fresh installs)
- Custom background color override with color picker (match your vault theme)
- Customizable ribbon and panel tab icon (any Lucide icon name)
- Configurable: per-OS shell path (separate Windows / macOS / Linux settings), font size, font family, cursor style (block/bar/underline), cursor blink, scrollback, panel location
- Settings appear in Obsidian's in-app settings search on Obsidian 1.13+

### Sessions & Persistence

- Session persistence: tab names, colors, working directories, and scrollback are restored when Obsidian reopens
- Rescue recently closed tabs from the command palette (ring buffer of the last 10 sessions)
- Notification sounds when background tab commands finish (4 sound types, adjustable volume)
- Optional [Claude Code](https://claude.com/claude-code) integration: auto-maintained session registry with clickable Resume links and URI handler

### Extensibility

- Public `registerKeyHandler()` API: downstream plugins can compose custom key handlers that run before built-in autocomplete/search handling, enabling terminal customization without forking

## Installation

### Via Obsidian Community Plugins (recommended)

1. Open **Settings > Community Plugins**
2. Search for "Lean Terminal"
3. Click **Install**
4. Enable the plugin in **Settings > Community Plugins**
5. Go to **Settings > Terminal > Download binaries** and click **Download** - this fetches the native terminal binary for your platform (the platform-specific `node-pty` zip from the GitHub release; Obsidian itself only uses `main.js`, `manifest.json`, and `styles.css`)
6. Open the terminal via the ribbon icon or command palette

Or install directly: [community.obsidian.md/plugins/lean-terminal](https://community.obsidian.md/plugins/lean-terminal)

### Troubleshooting Binary Download (ARM64 Windows)

If you see "Failed to download binaries" on an ARM64 Windows device (Surface Pro X, Windows Dev Kit, etc.):

1. **Close all terminal tabs** in Obsidian (the binary may be locked in use)
2. **Disable the plugin** in Settings, then re-enable it
3. **Restart Obsidian** completely (not just reload)
4. **Manually delete** the plugin's `node_modules` folder: browse to `.obsidian/plugins/lean-terminal/node_modules/` in your vault and delete it
5. **Try downloading binaries again**

If the issue persists, check that:
- You have write permissions to the plugin directory
- Your `.obsidian` folder is not synced to a cloud service (OneDrive, iCloud, Dropbox) that may lock files during sync
- Your antivirus software is not blocking file extraction

### Via BRAT (beta releases)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin if you don't have it
2. Open **Settings > BRAT > Add Beta Plugin**
3. Enter: `sdkasper/lean-obsidian-terminal`
4. Enable the plugin in **Settings > Community Plugins**
5. Download binaries and enable as above

### Manual Installation

1. Clone this repository
2. Run `npm install && npm run build`
3. Run `node install.mjs "/path/to/your/vault"`
4. Restart Obsidian and enable the plugin in **Settings > Community Plugins**

## How It Works

The plugin uses xterm.js for terminal rendering and node-pty for native pseudo-terminal support. node-pty spawns a real shell process (PowerShell, bash, etc.) and connects its stdin/stdout to xterm.js via Obsidian's Electron runtime. This gives you a fully interactive terminal - not just command execution.

On Windows, the plugin uses the ConPTY backend (correct UTF-8 and emoji support). A patched `windowsConoutConnection.js` replaces node-pty's Worker thread with inline socket piping so ConPTY works inside Obsidian's Electron renderer, which does not support Worker thread construction.

## Key Handler API (for plugin developers)

Companion plugins can add their own terminal key bindings — Mac-style line navigation, Vim/Emacs bindings, vendor remaps — without forking, via a small public API on the plugin instance:

```ts
registerKeyHandler(
  handler: (e: KeyboardEvent, session: TerminalSession) => boolean
): () => void   // returns an unregister function
```

**Execution order.** Registered handlers run in registration order, *before* the built-in autocomplete/search handling:

```
custom[0] → custom[1] → … → custom[n] → built-in autocomplete/search
```

**Return semantics.** Return `true` to let the next handler (and ultimately the built-in handling) run; return `false` to consume the event and stop the chain. Handlers see every event type (`keydown`, `keyup`, `keypress`) — filter on `e.type === "keydown"` as below. A handler that throws is logged and skipped, never breaking the chain.

> **Event type note:** the handler receives the DOM `KeyboardEvent` that xterm.js passes to `attachCustomKeyEventHandler` (with `metaKey`, `altKey`, `key`, `type`, `preventDefault()`, …) — *not* xterm's internal `IKeyboardEvent`, which is not part of `@xterm/xterm`'s public type surface.

**Example — Mac-style line navigation in a companion plugin:**

```ts
const leanTerm = this.app.plugins.plugins["lean-terminal"];
const unregister = leanTerm.registerKeyHandler((e, session) => {
  if (e.type !== "keydown") return true;
  if (e.metaKey && e.key === "ArrowLeft")  { session.pty.write("\x01"); return false; } // ^A → start of line
  if (e.metaKey && e.key === "ArrowRight") { session.pty.write("\x05"); return false; } // ^E → end of line
  if (e.altKey  && e.key === "ArrowLeft")  { session.pty.write("\x1bb"); return false; } // ⎋b → back one word
  if (e.altKey  && e.key === "ArrowRight") { session.pty.write("\x1bf"); return false; } // ⎋f → forward one word
  return true;
});

// Call the returned disposer in your plugin's onunload():
this.register(unregister);
```

See [Key Handler API](https://github.com/sdkasper/lean-obsidian-terminal/blob/master/docs/key-handler-api.md) for the full reference.

## Related documents

See [Usage](https://github.com/sdkasper/lean-obsidian-terminal/blob/master/docs/usage.md) for the full command reference.

See [Settings](https://github.com/sdkasper/lean-obsidian-terminal/blob/master/docs/settings.md) for all configuration options.

See [Session Persistence](https://github.com/sdkasper/lean-obsidian-terminal/blob/master/docs/session-persistence.md) for how tab state is saved and restored.

See [Claude Code Integration](https://github.com/sdkasper/lean-obsidian-terminal/blob/master/docs/claude-code-integration.md) for setup and usage.

See [URI Handler](https://github.com/sdkasper/lean-obsidian-terminal/blob/master/docs/uri-handler.md) for the `obsidian://lean-terminal` protocol reference.

See [Key Handler API](https://github.com/sdkasper/lean-obsidian-terminal/blob/master/docs/key-handler-api.md) for the downstream key-handler registration API.

See [Security](https://github.com/sdkasper/lean-obsidian-terminal/blob/master/docs/security.md) for the security review summary.

## Changelog

See [CHANGELOG.md](https://github.com/sdkasper/lean-obsidian-terminal/blob/master/CHANGELOG.md) for release history and feature documentation by version.

## Feedback

Use this repo to report bugs, request features, or ask questions.

- [Report a Bug](https://github.com/sdkasper/lean-obsidian-terminal/issues/new?assignees=&labels=bug&template=bug_report.md)
- [Request a Feature](https://github.com/sdkasper/lean-obsidian-terminal/issues/new?assignees=&labels=enhancement&template=feature_request.md)
- [Report a Performance Issue](https://github.com/sdkasper/lean-obsidian-terminal/issues/new?assignees=&labels=performance&template=performance_issue.md)
- [Ask a Question / Share Feedback](https://github.com/sdkasper/lean-obsidian-terminal/discussions)

If you want to support my work, you can use this link to [buy me a drink](https://kspr.me/cheers) - thank you, I appreciate you.

## Development

```bash
npm install
npm run dev          # Watch mode (auto-rebuild on save)
npm run build        # Production build
npm test             # Run the Vitest suite
npm run lint         # Run ESLint (typescript-eslint + eslint-plugin-obsidianmd)
node install.mjs     # Install to default vault (D:\LOS Test)
```

## Contributors

This plugin is built and maintained by a dedicated community. Special thanks to:

- **[@FarhadGSRX](https://github.com/FarhadGSRX)** - Session persistence, session rescue buffer, Claude Code integration with registry generation and resume links, color scheme catalog with themes.json support
- **[@ckelsoe](https://github.com/ckelsoe)** - Per-tab color tint customization with editable palette, wiki-link autocomplete with path-insertion modes
- **[@c00llin](https://github.com/c00llin)** - Terminal location options (Tab Right, Split Tab Right)
- **[@kkugot](https://github.com/kkugot)** - Emoji rendering fixes, system theme detection with terminal color reporting protocol
- **[@CHodder5](https://github.com/CHodder5)** - Zsh startup file forwarding (.zshenv and .zprofile) via ZDOTDIR override

## License

[MIT](https://github.com/sdkasper/lean-obsidian-terminal/blob/master/LICENSE)
