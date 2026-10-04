# Changelog

All notable changes to Lean Obsidian Terminal are documented here.

## 1.5.0 - October 4, 2026

### Improvements

- **Update notice:** a one-time pop-up after minor and major releases with a what's-new list and a link to support development. Patch releases never show it, and you can turn it off under Settings > Lean Terminal > Show update notice.
- **Split panes:** tab commands now target the focused pane (#104).
- **Escape:** keeps focus in the terminal instead of switching panes, and you can turn that off in settings (#97).
- **Contrast:** new minimum contrast setting for readable grey and dim text (#106).

### Bug fixes

- **Windows ARM64:** fixed the missing `conpty.dll` error, with automatic repair of existing installs (#105).

## 1.4.1 - October 4, 2026

### New

- New: "Minimum contrast ratio" setting (1 to 21, default 4.5) that raises the contrast of grey and dim text, applied live to open terminals. Set it to 1 to restore the previous rendering (#106)

### Bug fixes

- Fix: Windows ARM64 terminal failed to start with "Cannot find conpty.dll" because the 1.4.0 package had the ConPTY files in the wrong folder. The modern ConPTY is now only enabled when the files are where node-pty loads them from, and existing ARM64 installs repair themselves the first time a terminal opens, no re-download needed (#105)
- Fix: next, previous, first, last and "go to tab N" commands, and "New terminal tab", now act on the focused terminal pane instead of always the first pane (#104)
- Fix: pressing Escape in the terminal (vim, helix, Claude Code) no longer moves focus out of the terminal. New setting "Keep focus in terminal on escape", on by default (#97)

## 1.4.0 - July 19, 2026

### New

- New: readline keybindings Ctrl+K/U/W/E/L (toggle in settings)
- New: setting to toggle clickable file paths in terminal output (#96)
- New: settings search support via the declarative settings API on Obsidian 1.13+

### Improvements

- Improvement: Open terminal now focuses the existing pane instead of doing nothing

### Bug fixes

- Fix: Windows 10 mouse support - modern ConPTY (OpenConsole.exe) is enabled only when its files exist on disk (#92)
- Fix: Windows ARM64 package now ships the ConPTY files so the Windows 10 mouse fix works there too
- Fix: file links that carry a :line[:col] suffix now open correctly

## 1.3.0 - June 9, 2026

### New

- feat: attach images on paste and drop
- feat: make file paths clickable
- feat: public registerKeyHandler API for composable terminal key bindings (#76)

### Improvements

- **v1.3.0 release: image paste/drop, clickable paths, key handler API, and 4 critical security fixes**
- **Image paste/drop**: Clipboard images and dropped images are now pasted as file attachments
- **Clickable file paths**: Terminal output containing file paths are now rendered as clickable links to open files in Obsidian
- **Public registerKeyHandler API**: New extensibility API allowing plugins to register custom key handlers with the terminal
- **SEC-01 [HIGH]**: Shell injection in quotePath — now escapes embedded quotes (POSIX \'\'\' and Windows \"\")
- **SEC-02 [HIGH]**: Unsanitized resumeCommand from workspace state — now validates against claude --resume uuid pattern
- **SEC-03 [MEDIUM]**: Path traversal in Claude session scan — now validates claudeSessionsDir is absolute with no .. segments
- **SEC-04 [MEDIUM]**: Temp clipboard image files world-readable — now created with 0o600 (owner-only) permissions
- docs: update README for v1.2.0 shell detection and per-OS path settings
- Release: v1.3.0 - Image paste/drop and clickable file paths (PR #80 + #81)
- Release 1.3.0: Image paste/drop, clickable paths, key handler API, security fixes
- bump: version 1.3.0

### Bug fixes

- Fix: resolve merge conflict markers
- Fix: replace deprecated activeLeaf API

## 1.2.0 - June 3, 2026

### Improvements

- docs: update CHANGELOG for v1.1.2
- Release v1.2.0

## 1.1.2 - May 19, 2026

### Improvements

- Release v1.1.1
- docs: update CHANGELOG, settings, and README for v1.1.1
- Release v1.1.2 — fix tab rename focus regression

## 1.1.1 - May 18, 2026

### Improvements

- docs: explain extra release files (node-pty zips, checksums.json)
- Release v1.1.0 - ARM64 Windows support + official marketplace
- merge: v1.1.0 release into master

### Bug fixes

- fix: CSS lint and source code warnings (0.16.3)
- fix: replace text-decoration sub-properties with shorthand (0.16.4)
- fix: create tmp directory before binary download (0.16.5)

## 1.1.0 - May 15, 2026

## 0.16.5 - May 13, 2026

### Bug fixes

- fix: create tmp directory before binary download (0.16.5)

## 0.16.4 - May 13, 2026

### Improvements

- docs: explain extra release files (node-pty zips, checksums.json)

### Bug fixes

- fix: replace text-decoration sub-properties with shorthand (0.16.4)

## 0.16.3 - May 13, 2026

### Bug fixes

- fix: CSS lint and source code warnings (0.16.3)

## 0.16.2 - May 13, 2026

### New

- Add links to related documents in README

### Improvements

- chore: bump version to 0.16.0
- docs: extract reference sections into standalone docs
- Update README to consolidate usage and settings sections
- chore: add changelog automation

### Bug fixes

- fix: remove os module to resolve plugin submission security warning
- fix: eliminate require(os) from bundle (0.16.2)

## 0.16.1 - May 13, 2026

### New

- Add links to related documents in README

### Improvements

- chore: bump version to 0.16.0
- docs: extract reference sections into standalone docs
- Update README to consolidate usage and settings sections
- chore: add changelog automation

## 0.16.0 - May 11, 2026

### New

- feat: Clickable [[wikilinks]] and obsidian:// URI support

### Improvements

- docs: add line height setting to README

## 0.15.0 - May 7, 2026

### New

- feat: URI protocol handler for directory-specific terminal launch (v0.14.0)
- Add donation link to README
- feat: clickable URLs + lineHeight live updates (fixes #41, #42)

### Improvements

- docs: reorganize features section into logical groups
- ci: auto-add new issues to LOT Feedback Tracker project

## 0.14.0 - May 4, 2026

### Improvements

- docs: add shields.io badges to README
- docs: restyle badges to LeanProductivity brand colors
- docs: per-badge brand colors for issues open/closed
- docs: fix badge color scheme
- revert: badge color scheme changes from PR #31
- docs: finalize badge colors to LP brand spec
- docs: set value bg to black for stars, manifest, downloads
- docs: add Obsidian and License badges
- docs: consolidate issues badges
- docs: refresh badge lineup

## 0.12.4 - April 29, 2026

### New

- feat: keyboard shortcuts for terminal tab navigation (v0.12.4)

## 0.12.3 - April 29, 2026

### Improvements

- Release v0.12.3 - Vitest test framework, code quality fixes, plugin requirements compliance

## 0.12.2 - April 28, 2026

## 0.12.0 - April 28, 2026

## 0.11.0 - April 28, 2026

## 0.9.6 - April 24, 2026

## 0.9.5 - April 24, 2026

## 0.9.4 - April 23, 2026

## 0.9.2 - April 23, 2026

## 0.9.1 - April 22, 2026

## 0.9.0 - April 21, 2026

### New

- Add 8 built-in color schemes + user-editable themes.json

## 0.8.0 - April 21, 2026

### Bug fixes

- Fix emoji rendering and add system theme with terminal color reporting

## 0.7.0 - April 20, 2026

## 0.6.5 - April 15, 2026

### Bug fixes

- fix(zsh): forward .zshenv and .zprofile through ZDOTDIR override

## 0.6.4 - April 15, 2026

## 0.6.3 - April 2, 2026

## 0.6.2 - April 2, 2026

## 0.6.1 - April 1, 2026

## 0.6.0 - April 1, 2026

## 0.5.0 - March 31, 2026

## 0.4.1 - March 26, 2026

## 0.4.0 - March 26, 2026

## v0.3.0 - March 26, 2026

## v0.2.0 - March 25, 2026

## v0.1.1 - March 25, 2026

## v0.1.0 - March 25, 2026

Older releases and more details: [GitHub Releases](https://github.com/sdkasper/lean-obsidian-terminal/releases)
