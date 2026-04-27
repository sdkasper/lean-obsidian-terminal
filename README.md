# Lean Terminal

An embedded terminal panel for [Obsidian](https://obsidian.md), powered by [xterm.js](https://xtermjs.org/) and [node-pty](https://github.com/nicedoc/node-pty). Run shell commands directly inside your vault workspace - no external windows needed.

**Desktop only.** Requires Obsidian 1.5.0+.

## Features

- Full PTY terminal (not a simple command runner) with interactive shell support
- Multiple terminal tabs with rename and color-coding support
- Auto-detects your shell: PowerShell 7 / Windows PowerShell / cmd.exe on Windows, `$SHELL` on macOS/Linux
- Four built-in color themes: Obsidian Dark, Obsidian Light, Monokai, Solarized Dark
- Customizable ribbon and panel tab icon (any Lucide icon name)
- Clickable URLs in terminal output
- Auto-resize on panel resize
- Opens at vault root by default
- Clipboard support: Ctrl+V / Cmd+V paste, Ctrl+C / Cmd+C copy (with selection)
- Notification sounds when background tab commands finish (4 sound types, adjustable volume)
- Shift+Enter inserts a newline instead of submitting (muscle memory friendly for Claude Code users)
- Custom background color override with color picker (match your vault theme)
- Configurable: shell path, font size, font family, cursor blink, scrollback, panel location
- Session persistence: tabs, names, colors, working directories, and scrollback are restored when Obsidian reopens
- Rescue recently closed tabs via command palette (ring buffer of the last 10 closed sessions by default)
- Optional [Claude Code](https://claude.com/claude-code) integration: auto-maintained registry of sessions with clickable Resume links

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
| Close tab | Click the **x** on the tab |
| Split pane | Command palette: **Open terminal in new pane** |
| Restore closed tab | Command palette: **Restore recent terminal session** - pick from recently closed tabs (and Claude sessions, if integration enabled) |
| Refresh Claude session registry | Command palette: **Refresh Claude session registry** - rewrites the registry note (requires Claude integration enabled) |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Shell path | Auto-detect | Path to shell executable. Leave empty for auto-detection |
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

## How It Works

The plugin uses xterm.js for terminal rendering and node-pty for native pseudo-terminal support. node-pty spawns a real shell process (PowerShell, bash, etc.) and connects its stdin/stdout to xterm.js via Obsidian's Electron runtime. This gives you a fully interactive terminal - not just command execution.

On Windows, the plugin uses the winpty backend because Obsidian's Electron renderer does not support Worker threads required by ConPTY.

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

When the plugin downloads native `node-pty` binaries from GitHub Releases, it verifies their SHA-256 checksum against a `checksums.json` file published alongside the release. Checksum verification is mandatory — if `checksums.json` is unreachable or does not contain an entry for the downloaded asset, the installation is aborted.

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

- **[@sdkasper](https://github.com/sdkasper)** (Sascha Kasper) — Core architecture, terminal lifecycle management, Windows/macOS/Linux platform support, binary download system, plugin distribution, and ongoing maintenance
- **[@FarhadGSRX](https://github.com/FarhadGSRX)** — Session persistence, session rescue buffer, Claude Code integration with registry generation and resume links, color scheme catalog with themes.json support
- **[@ckelsoe](https://github.com/ckelsoe)** — Per-tab color tint customization with editable palette, wiki-link autocomplete with path-insertion modes
- **[@c00llin](https://github.com/c00llin)** — Terminal location options (Tab Right, Split Tab Right)
- **[@kkugot](https://github.com/kkugot)** — Emoji rendering fixes, system theme detection with terminal color reporting protocol
- **[@CHodder5](https://github.com/CHodder5)** — Zsh startup file forwarding (.zshenv and .zprofile) via ZDOTDIR override

## License

[MIT](LICENSE)
