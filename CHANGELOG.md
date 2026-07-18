# Changelog

All notable changes to Lean Obsidian Terminal are documented here.

## 1.2.0-beta.1 - May 26, 2026

## arm64-prebuilds-v1 - July 18, 2026

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
- @glebo309 made their first contribution in https://github.com/sdkasper/lean-obsidian-terminal/pull/80
- @BrandonABarringer made their first contribution in https://github.com/sdkasper/lean-obsidian-terminal/pull/82

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

## 1.1.2-beta.1 - May 19, 2026

### Improvements

- Release v1.1.1
- docs: update CHANGELOG, settings, and README for v1.1.1

## 1.1.1 - May 18, 2026

### Improvements

- docs: explain extra release files (node-pty zips, checksums.json)
- Release v1.1.0 - ARM64 Windows support + official marketplace
- merge: v1.1.0 release into master

### Bug fixes

- fix: CSS lint and source code warnings (0.16.3)
- fix: replace text-decoration sub-properties with shorthand (0.16.4)
- fix: create tmp directory before binary download (0.16.5)

## 1.1.1-beta.7 - May 18, 2026

## 1.1.1-beta.6 - May 18, 2026

## 1.1.1-beta.5 - May 18, 2026

## 1.1.1-beta.4 - May 18, 2026

## 1.1.1-beta.3 - May 18, 2026

## 1.1.1-beta.2 - May 18, 2026

## 1.1.1-beta.1 - May 18, 2026

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

### Improvements

- @FarhadGSRX made their first contribution in https://github.com/sdkasper/lean-obsidian-terminal/pull/12

## 0.8.0 - April 21, 2026

### Improvements

- @kkugot made their first contribution in https://github.com/sdkasper/lean-obsidian-terminal/pull/5

### Bug fixes

- Fix emoji rendering and add system theme with terminal color reporting

## 0.7.0 - April 20, 2026

## 0.6.5 - April 15, 2026

### Improvements

- @CHodder5 made their first contribution in https://github.com/sdkasper/lean-obsidian-terminal/pull/10

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
