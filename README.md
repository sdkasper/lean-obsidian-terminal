# Lean Terminal

An embedded terminal panel for [Obsidian](https://obsidian.md), powered by [xterm.js](https://xtermjs.org/) and [node-pty](https://github.com/nicedoc/node-pty). Run shell commands directly inside your vault workspace — no external windows needed.

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

## Installation

### Via BRAT (recommended)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin if you don't have it
2. Open **Settings > BRAT > Add Beta Plugin**
3. Enter: `sdkasper/lean-obsidian-terminal`
4. Enable the plugin in **Settings > Community Plugins**
5. Go to **Settings > Terminal > Download binaries** and click **Download** — this fetches the native terminal binary for your platform
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

## Custom themes

The plugin ships with 12 built-in color schemes selectable from **Settings → Appearance & behavior → Theme**. You can add your own by editing `themes.json` in the plugin folder (`<vault>/.obsidian/plugins/lean-terminal/themes.json`).

Use **Open themes folder** in settings to jump straight to it. The file is a plain JSON object keyed by theme name; user themes override built-ins of the same name.

Minimal example:

```json
{
  "my-dark": {
    "background": "#101010",
    "foreground": "#e0e0e0",
    "cursor": "#ffffff"
  }
}
```

`background` and `foreground` are required; all other xterm `ITheme` fields (`cursor`, `black`, `red`, `green`, … `brightWhite`) are optional — omitted fields use xterm defaults. Colors must be 6-digit hex (`#rrggbb`).

After editing, click **Reload themes** in settings to apply without restarting Obsidian.

## How It Works

The plugin uses xterm.js for terminal rendering and node-pty for native pseudo-terminal support. node-pty spawns a real shell process (PowerShell, bash, etc.) and connects its stdin/stdout to xterm.js via Obsidian's Electron runtime. This gives you a fully interactive terminal — not just command execution.

On Windows, the plugin uses the winpty backend because Obsidian's Electron renderer does not support Worker threads required by ConPTY.

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

## License

[MIT](LICENSE)
