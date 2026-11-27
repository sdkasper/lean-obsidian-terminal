# Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Shell path | Auto-detect | Path to shell executable. Leave empty for auto-detection |
| Startup command | none | Command to run automatically when a new terminal tab opens (e.g. `claude`, `npm run dev`) |
| Font size | 14 | Terminal font size in pixels |
| Font family | Menlo, Monaco, 'Courier New', monospace | Terminal font stack |
| Theme | Obsidian Dark | Color theme for the terminal |
| Icon | terminal | Lucide icon name for the ribbon and panel tab icon |
| Cursor blink | On | Whether the cursor blinks |
| Cursor style | block | Terminal cursor shape: block, bar, or underline. Applies to newly opened tabs |
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
| Search shortcut | Ctrl+Alt+F | Keyboard shortcut to open the in-terminal search bar. On macOS, Option shortcuts with a letter or digit also match by key position. You can also bind the "Search in terminal" command in Obsidian's Hotkeys settings, using different keys from this setting (Cmd+F is already used by note search) |
| Wiki-link autocomplete | Off | Type `[[` in the terminal to open a searchable vault note picker |
| Wiki-link insertion format | Wiki-link | How an accepted note is inserted: `[[Note]]`, vault-relative path, or absolute path |
| Line height | 1.0 | Terminal line height multiplier (1.0-2.0). Changes apply instantly to open tabs |
| Tab bar position | Top | Position of the tab bar: Top (horizontal, default), Left, or Right (vertical stacking) |
