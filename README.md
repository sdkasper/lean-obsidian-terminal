# Lean Terminal

[![Release](https://img.shields.io/github/release/sdkasper/lean-obsidian-terminal?logo=obsidian&logoColor=A991D4&style=flat-square&labelColor=000000&color=25D0F7)](https://github.com/sdkasper/lean-obsidian-terminal/releases)
[![Obsidian](https://img.shields.io/badge/Obsidian-v1.5.0+-A991D4?style=flat-square&labelColor=000000)](https://obsidian.md)
[![Issues](https://img.shields.io/github/issues/sdkasper/lean-obsidian-terminal?logo=obsidian&logoColor=A991D4&style=flat-square&labelColor=000000&color=FC3634)](https://github.com/sdkasper/lean-obsidian-terminal/issues)
[![Closed](https://img.shields.io/github/issues-closed/sdkasper/lean-obsidian-terminal?logo=obsidian&logoColor=A991D4&style=flat-square&labelColor=000000&color=18BC9C)](https://github.com/sdkasper/lean-obsidian-terminal/issues?q=is%3Aissue+is%3Aclosed)
[![Downloads](https://img.shields.io/github/downloads/sdkasper/lean-obsidian-terminal/total?logo=obsidian&logoColor=A991D4&style=flat-square&labelColor=000000&color=25D0F7)](https://github.com/sdkasper/lean-obsidian-terminal/releases)
[![Stars](https://img.shields.io/github/stars/sdkasper/lean-obsidian-terminal?logo=obsidian&logoColor=A991D4&style=flat-square&labelColor=000000&color=000000)](https://github.com/sdkasper/lean-obsidian-terminal/stargazers)
[![License](https://img.shields.io/badge/License-MIT-007BFF?style=flat-square&labelColor=000000)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-Join%20Server-5865F2?style=flat-square&labelColor=000000&logo=discord&logoColor=5865F2)](https://discord.gg/sbMg6PP2vq)

An embedded terminal panel for [Obsidian](https://obsidian.md), powered by [xterm.js](https://xtermjs.org/) and [node-pty](https://github.com/nicedoc/node-pty). Run shell commands directly inside your vault workspace - no external windows needed.

**Desktop only.** Requires Obsidian 1.5.0+.

## Features

### Terminal Core

- Full PTY terminal (not a simple command runner) with interactive shell support
- Auto-detects your shell: PowerShell 7 / Windows PowerShell / cmd.exe on Windows, `$SHELL` on macOS/Linux
- Startup command: configure a command that runs automatically in every new tab once the shell is ready (e.g. `claude`, `npm run dev`)
- Clipboard support: Ctrl+V / Cmd+V paste, Ctrl+C / Cmd+C copy (with selection)
- Clickable URLs in terminal output
- Auto-resize as the panel resizes
- Shift+Enter inserts a newline without submitting (muscle memory for Claude Code users)

### Tab Management

- Multiple tabs with rename, color-coding, and pinning support
- Drag tabs to reorder them in the tab bar
- Keyboard shortcuts: Next/Previous (with wrap-around), Jump to Tab 1-8, Jump to last - bindable under Settings > Hotkeys
- Tab bar positioning: Top (default), Left, or Right side for wide-monitor layouts

### Vault Integration

- Opens in vault root by default; command palette to open in the current file's folder; right-click any file or folder to open a terminal there
- Drag files from the Obsidian file explorer or Windows Explorer into the terminal to insert the absolute path (spaces auto-quoted)
- Wiki-link autocomplete: type `[[` in the terminal to pick any vault note and insert as a wiki-link, vault-relative path, or absolute path

### Search & Selection

- In-terminal search bar (Ctrl+Alt+F): match counter, case-sensitive toggle, and highlight decorations
- Copy on select: automatically copies selected text to the clipboard as you highlight

### Appearance & Configuration

- 12 built-in color themes (Obsidian Dark, Obsidian Light, Monokai, Solarized Dark, and more); extend or override via themes.json
- Custom background color override with color picker (match your vault theme)
- Customizable ribbon and panel tab icon (any Lucide icon name)
- Configurable: shell path, font size, font family, cursor blink, scrollback, panel location

### Sessions & Persistence

- Session persistence: tab names, colors, working directories, and scrollback are restored when Obsidian reopens
- Rescue recently closed tabs from the command palette (ring buffer of the last 10 sessions)
- Notification sounds when background tab commands finish (4 sound types, adjustable volume)
- Optional [Claude Code](https://claude.com/claude-code) integration: auto-maintained session registry with clickable Resume links and URI handler

## Installation

### Via BRAT (recommended)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin if you don't have it
2. Open **Settings > BRAT > Add Beta Plugin**
3. Enter: `sdkasper/lean-obsidian-terminal`
4. Enable the plugin in **Settings > Community Plugins**
5. Go to **Settings > Terminal > Download binaries** and click **Download** - this fetches the native terminal binary for your platform
6. Open the terminal via the ribbon icon or command palette

### Manual Installation

1. Clone this repository
2. Run `npm install && npm run build`
3. Run `node install.mjs "/path/to/your/vault"`
4. Restart Obsidian and enable the plugin in **Settings > Community Plugins**

## Usage

| Action | How |
|--------|-----|
| Open terminal | Click the terminal icon in the ribbon, or run **Open terminal** from the command palette |
| Toggle terminal | Command palette: **Toggle terminal**, or click the ribbon icon again |
| New tab | Command palette: **New terminal tab**, or click the **+** button in the tab bar |
| Rename tab | Right-click the tab label |
| Pin tab | Right-click the tab - **Pin** - hides the close button and blocks accidental close |
| Reorder tabs | Drag a tab left or right when two or more tabs are open |
| Drop file path | Drag a file from the file explorer or Windows Explorer into the terminal |
| Search terminal output | Press **Ctrl+Alt+F** (configurable) to open the search bar |
| Close tab | Click the **x** on the tab |
| Open terminal in current file's folder | Command palette: **Open terminal in current file's directory** (only visible when a file is active) |
| Open terminal in any folder | Right-click a file or folder in the file explorer - **Open terminal here** |
| Split pane | Command palette: **Open terminal in new pane** |
| Restore closed tab | Command palette: **Restore recent terminal session** - pick from recently closed tabs (and Claude sessions, if integration enabled) |
| Refresh Claude session registry | Command palette: **Refresh Claude session registry** - rewrites the registry note (requires Claude integration enabled) |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Shell path | Auto-detect | Path to shell executable. Leave empty for auto-detection |
| Startup command | none | Command to run automatically when a new terminal tab opens (e.g. `claude`, `npm run dev`) |
| Font size | 14 | Terminal font size in pixels |
| Font family | Menlo, Monaco, 'Courier New', monospace | Terminal font stack |
| Theme | Obsidian Dark | Color theme for the terminal |
| Icon | terminal | Lucide icon name for the ribbon and panel tab icon |
| Cursor blink | On | Whether the cursor blinks |
| Scrollback | 5000 | Number of lines kept in scroll history |
| Background color | Theme default | Override the theme background with any CSS color (hex, RGB, etc.) |
| Default location | Bottom | Where new terminal panels open (Bottom or Right) |
| Notify on completion | Off | Sound + notice when a background tab command finishes |
| Notification sound | Beep | Choose from Beep, Chime, Ping, or Pop |
| Notification volume | 50 | Volume for notification sounds (0–100) |
| Persist terminal buffer | On | Save scrollback history across restarts. Disable to reduce workspace.json size |
| Recent sessions to keep | 10 | Closed-tab rescue buffer size. Set to 0 to disable |
| Enable Claude Code integration | Off | Scan `~/.claude/` for sessions, register the `obsidian://lean-terminal` URI handler, include Claude sessions in the restore picker |
| Registry note path | claude-sessions.md | Vault-relative path to the auto-maintained Claude sessions registry |
| Registry sessions to keep | 25 | Max Claude sessions listed in the registry note and picker |
| Copy on select | Off | Automatically copy selected text to the clipboard |
| Search shortcut | Ctrl+Alt+F | Keyboard shortcut to open the in-terminal search bar |
| Wiki-link autocomplete | Off | Type `[[` in the terminal to open a searchable vault note picker |
| Wiki-link insertion format | Wiki-link | How an accepted note is inserted: `[[Note]]`, vault-relative path, or absolute path |
| Tab bar position | Top | Position of the tab bar: Top (horizontal, default), Left, or Right (vertical stacking) |

## How It Works

The plugin uses xterm.js for terminal rendering and node-pty for native pseudo-terminal support. node-pty spawns a real shell process (PowerShell, bash, etc.) and connects its stdin/stdout to xterm.js via Obsidian's Electron runtime. This gives you a fully interactive terminal - not just command execution.

On Windows, the plugin uses the ConPTY backend (correct UTF-8 and emoji support). A patched `windowsConoutConnection.js` replaces node-pty's Worker thread with inline socket piping so ConPTY works inside Obsidian's Electron renderer, which does not support Worker thread construction.

## Session Persistence

Each terminal tab's name, color, working directory, and scrollback buffer are saved to the workspace layout on close and on Obsidian quit. On next launch, tabs are restored with their history visible and a fresh shell spawned in the saved directory. This is visual/history restore - the underlying shell process does not survive quit.

Closing a tab (**x** button) pushes its state to a rescue ring buffer stored in plugin data. Use **Restore recent terminal session** from the command palette to re-open a closed tab at any point.

## Claude Code Integration

Disabled by default. When enabled in settings, the plugin:

- Scans `~/.claude/projects/` for conversation sessions associated with the current vault
- Generates a markdown registry note on demand (**Refresh Claude session registry** command) with clickable Resume links
- Registers the `obsidian://lean-terminal?resume=<session-id>` URI so links in the registry (or any note) open a new terminal tab and run `claude --resume <session-id>` once the shell is ready
- Includes Claude sessions alongside recently closed tabs in the **Restore recent terminal session** picker, sorted by most recent

Sessions started by typing `claude` manually inside a tab are not auto-tracked, but appear in the picker on its next open (the scan runs fresh each time) - click to resume.

## URI Handler

The plugin registers the `obsidian://lean-terminal` protocol handler, usable from any note link, dashboard button, or external script:

| Parameter | Description | Example |
|-----------|-------------|---------|
| `cwd` | Open a terminal tab in the given directory (URL-encoded path) | `obsidian://lean-terminal?cwd=%2Fhome%2Fuser%2Fprojects%2Fmy-app` |
| `resume` | Open a terminal tab and run `claude --resume <session-id>` once the shell is ready (requires Claude integration enabled) | `obsidian://lean-terminal?resume=<uuid>` |

The `cwd` parameter is useful for dashboards and launchers. In an Obsidian note with Dataview JS or a custom button plugin:

```js
app.workspace.openLinkText("obsidian://lean-terminal?cwd=" + encodeURIComponent("/path/to/project"), "");
```

Or as a plain Markdown link (paths must be URL-encoded):

```markdown
[Open project terminal](obsidian://lean-terminal?cwd=%2Fpath%2Fto%2Fproject)
```

If the terminal panel is already open, the URI opens a new tab in the target directory. If it is closed, a fresh panel opens there.

## Security

A full security review of the codebase was conducted covering code-level vulnerabilities, native module handling, and supply chain risks. Here is what was checked and what was found.

**Checks performed:**
- Command/shell injection in PTY spawn, shell path handling, and ZIP extraction
- Path traversal in file operations
- Input validation at all user-facing and URI-handler boundaries
- Integrity verification of downloaded native binaries
- XSS and prototype pollution in the Obsidian UI layer
- Hardcoded secrets, sensitive data in logs, and dynamic code execution
- GitHub Actions workflow supply chain (trigger conditions, action pinning)
- npm dependency audit for known CVEs

**No issues found in:**
- Shell command construction (all paths fed into `execSync` are system-controlled, not user-supplied)
- Claude session resume commands (UUID-validated before PTY write)
- Obsidian UI rendering (no `innerHTML` or `eval` usage)
- Hardcoded credentials or tokens

**Binary download integrity:**

When the plugin downloads native `node-pty` binaries from GitHub Releases, it verifies their SHA-256 checksum against a `checksums.json` file published alongside the release. Checksum verification is mandatory - if `checksums.json` is unreachable or does not contain an entry for the downloaded asset, the installation is aborted.

SHA-256 checksums for each release are also published in `checksums.json` attached to every [GitHub Release](https://github.com/sdkasper/lean-obsidian-terminal/releases) for manual verification.

## Feedback

Use this repo to report bugs, request features, or ask questions.

- [Report a Bug](https://github.com/sdkasper/lean-obsidian-terminal/issues/new?assignees=&labels=bug&template=bug_report.md)
- [Request a Feature](https://github.com/sdkasper/lean-obsidian-terminal/issues/new?assignees=&labels=enhancement&template=feature_request.md)
- [Report a Performance Issue](https://github.com/sdkasper/lean-obsidian-terminal/issues/new?assignees=&labels=performance&template=performance_issue.md)
- [Ask a Question / Share Feedback](https://github.com/sdkasper/lean-obsidian-terminal/discussions)

## Development

```bash
npm install
npm run dev          # Watch mode (auto-rebuild on save)
npm run build        # Production build
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

[MIT](LICENSE)
