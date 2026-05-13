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
5. Go to **Settings > Terminal > Download binaries** and click **Download** - this fetches the native terminal binary for your platform (the platform-specific `node-pty` zip from the GitHub release; Obsidian itself only uses `main.js`, `manifest.json`, and `styles.css`)
6. Open the terminal via the ribbon icon or command palette

### Manual Installation

1. Clone this repository
2. Run `npm install && npm run build`
3. Run `node install.mjs "/path/to/your/vault"`
4. Restart Obsidian and enable the plugin in **Settings > Community Plugins**

## How It Works

The plugin uses xterm.js for terminal rendering and node-pty for native pseudo-terminal support. node-pty spawns a real shell process (PowerShell, bash, etc.) and connects its stdin/stdout to xterm.js via Obsidian's Electron runtime. This gives you a fully interactive terminal - not just command execution.

On Windows, the plugin uses the ConPTY backend (correct UTF-8 and emoji support). A patched `windowsConoutConnection.js` replaces node-pty's Worker thread with inline socket piping so ConPTY works inside Obsidian's Electron renderer, which does not support Worker thread construction.

## Related documents

See [Usage](docs/usage.md) for the full command reference.

See [Settings](docs/settings.md) for all configuration options.

See [Session Persistence](docs/session-persistence.md) for how tab state is saved and restored.

See [Claude Code Integration](docs/claude-code-integration.md) for setup and usage.

See [URI Handler](docs/uri-handler.md) for the `obsidian://lean-terminal` protocol reference.

See [Security](docs/security.md) for the security review summary.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history and feature documentation by version.

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
