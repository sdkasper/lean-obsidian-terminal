// Wiki-link `[[` autocomplete for the terminal buffer.
//
// When the user types `[[` inside the terminal, an overlay dropdown appears
// showing vault notes. Arrow keys / Tab / Enter select; Escape dismisses.
// All keystrokes are intercepted at the xterm layer so the feature works
// even inside TUIs (vim, claude-code, etc.).
//
// Ported from internetvin/internetvin-terminal (MIT © 2025 Vin Verma) — see NOTICE.
// Adapted for lean-obsidian-terminal: strict null checks, no `as any`,
// explicit dispose(), isActive() accessor, renamed CSS hooks (`lean-`).

import { App, TFile } from "obsidian";
import type { Terminal, IDisposable } from "@xterm/xterm";

export interface AutocompleteEntry {
  /** Display name (file basename, without extension). */
  name: string;
  /** Display folder (parent path, "" for vault root). */
  folder: string;
  /**
   * Full vault-relative path including extension (e.g. `Folder/Note.md`,
   * `Folder/Drawing.canvas`). Empty string for unresolved entries — they
   * have no on-disk file yet, so path-mode insertion falls back to wikilink.
   */
  path: string;
  isFile: boolean;
  mtime: number;
}

/**
 * Resolves the string written to the PTY when the user accepts a suggestion.
 * Receives the selected entry (or null when none) and the query typed after `[[`.
 * The host owns shell semantics (path resolution, quoting, brackets vs. path)
 * so the autocomplete class stays UI-only.
 */
export type ResolveInsertion = (entry: AutocompleteEntry | null, query: string) => string;

const defaultResolveInsertion: ResolveInsertion = (entry, query) => {
  if (entry) return `${entry.name}]]`;
  if (query.length > 0) return `${query}]]`;
  return "]]";
};

interface UnresolvedLinksMap {
  [sourceFile: string]: { [linkTarget: string]: number };
}

interface ResolvedLinksMap {
  [sourceFile: string]: { [targetPath: string]: number };
}

interface MetadataCacheInternal {
  unresolvedLinks?: UnresolvedLinksMap;
  resolvedLinks?: ResolvedLinksMap;
}

const MAX_RESULTS = 10;
const PREVIEW_LINES = 10;
const PREVIEW_WIDTH = 280;
const DROPDOWN_WIDTH = 300;
const DROPDOWN_HEIGHT = 220;
const FILTER_DEBOUNCE_MS = 16;

export class WikiLinkAutocomplete {
  private readonly app: App;
  private readonly terminal: Terminal;
  private readonly writeToShell: (data: string) => void;
  private readonly containerEl: HTMLElement;
  private readonly resolveInsertion: ResolveInsertion;

  private active = false;
  private query = "";
  private results: AutocompleteEntry[] = [];
  private selectedIndex = 0;
  private lastCharWasBracket = false;

  private dropdownEl: HTMLElement | null = null;
  private previewEl: HTMLElement | null = null;
  private filterTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeDisposable: IDisposable | null = null;
  /** Snapshot of vault entries taken on activate(); avoids O(#files) per keystroke. */
  private cachedEntries: AutocompleteEntry[] | null = null;
  /** Monotonic token; renderPreview discards results whose token is stale. */
  private previewToken = 0;

  constructor(
    app: App,
    terminal: Terminal,
    writeToShell: (data: string) => void,
    containerEl: HTMLElement,
    resolveInsertion: ResolveInsertion = defaultResolveInsertion,
  ) {
    this.app = app;
    this.terminal = terminal;
    this.writeToShell = writeToShell;
    this.containerEl = containerEl;
    this.resolveInsertion = resolveInsertion;

    this.resizeDisposable = this.terminal.onResize(() => {
      if (this.active && this.dropdownEl) this.positionDropdown();
    });
  }

  isActive(): boolean {
    return this.active;
  }

  /**
   * Call from the host's `terminal.onData` listener, before writing to the PTY.
   * Detects `[[` (consecutive or within a paste) and activates the dropdown.
   * Never consumes data — the brackets still reach the shell so the user sees
   * their input echoed. The dropdown appears as an overlay.
   */
  handleData(data: string): void {
    if (this.active) return;

    if (data.length > 1) {
      if (data.includes("[[")) this.activate();
      this.lastCharWasBracket = data.endsWith("[");
      return;
    }

    if (data === "[") {
      if (this.lastCharWasBracket) {
        this.lastCharWasBracket = false;
        this.activate();
      } else {
        this.lastCharWasBracket = true;
      }
    } else {
      this.lastCharWasBracket = false;
    }
  }

  /**
   * Call from the host's `attachCustomKeyEventHandler` callback, before any
   * other handling. Returns `true` when the key was consumed (host should
   * `return false` from the xterm callback to suppress default behavior).
   */
  handleKey(e: KeyboardEvent): boolean {
    if (!this.active) return false;
    // Only consume keydown — keypress / keyup must flow through so IME
    // composition and other host listeners keep working while the dropdown
    // is open.
    if (e.type !== "keydown") return false;

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        this.selectedIndex = Math.max(0, this.selectedIndex - 1);
        this.renderDropdown();
        return true;
      case "ArrowDown":
        e.preventDefault();
        this.selectedIndex = Math.min(this.results.length - 1, this.selectedIndex + 1);
        this.renderDropdown();
        return true;
      case "Enter":
      case "Tab":
        e.preventDefault();
        this.accept();
        return true;
      case "Escape":
        e.preventDefault();
        this.dismiss();
        return true;
      case "Backspace":
        e.preventDefault();
        if (this.query.length > 0) {
          this.query = this.query.slice(0, -1);
          this.filterResults();
        } else {
          this.dismiss();
        }
        return true;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          this.query += e.key;
          this.filterResults();
          return true;
        }
        // Let any mod-combo (Ctrl+V, Cmd+C, Alt+...) fall through to the host
        // handler — including Alt-based shortcuts (e.g. Alt+Tab, terminal Alt
        // chords). Only unmodified keystrokes that didn't match the named cases
        // above are non-character (function keys, etc.) — also let those through.
        return !(e.metaKey || e.ctrlKey || e.altKey);
    }
  }

  dispose(): void {
    if (this.filterTimer) {
      clearTimeout(this.filterTimer);
      this.filterTimer = null;
    }
    this.resizeDisposable?.dispose();
    this.resizeDisposable = null;
    this.removePreview();
    this.removeDropdown();
    this.active = false;
  }

  private activate(): void {
    this.active = true;
    this.query = "";
    this.results = [];
    this.selectedIndex = 0;
    // Refresh the entry cache on each activation so newly created notes
    // appear without restarting the terminal session.
    this.cachedEntries = null;
    this.filterResults();
  }

  private accept(): void {
    const entry =
      this.results.length > 0 && this.selectedIndex < this.results.length
        ? this.results[this.selectedIndex]
        : null;
    this.writeToShell(this.resolveInsertion(entry, this.query));
    this.deactivate();
  }

  private dismiss(): void {
    if (this.query.length > 0) this.writeToShell(this.query);
    this.deactivate();
  }

  private deactivate(): void {
    this.active = false;
    this.query = "";
    this.results = [];
    this.selectedIndex = 0;
    this.cachedEntries = null;
    if (this.filterTimer) {
      clearTimeout(this.filterTimer);
      this.filterTimer = null;
    }
    this.removeDropdown();
  }

  /**
   * Builds the full entry list from the vault. Files are deduped by full
   * path (not basename) so notes with identical names in different folders
   * both appear. Unresolved targets that don't already correspond to a
   * file's basename are added with `isFile: false` and an empty path.
   */
  private getAllEntries(): AutocompleteEntry[] {
    const entries: AutocompleteEntry[] = [];
    const fileBasenames = new Set<string>();

    for (const f of this.app.vault.getFiles()) {
      entries.push({
        name: f.basename,
        folder: f.parent?.path ?? "",
        path: f.path,
        isFile: true,
        mtime: f.stat.mtime,
      });
      fileBasenames.add(f.basename.toLowerCase());
    }

    const internal = this.app.metadataCache as unknown as MetadataCacheInternal;
    const unresolved = internal.unresolvedLinks;
    if (unresolved) {
      const seenUnresolved = new Set<string>();
      for (const sourceFile of Object.values(unresolved)) {
        for (const linkTarget of Object.keys(sourceFile)) {
          const key = linkTarget.toLowerCase();
          if (fileBasenames.has(key) || seenUnresolved.has(key)) continue;
          seenUnresolved.add(key);
          entries.push({ name: linkTarget, folder: "", path: "", isFile: false, mtime: 0 });
        }
      }
    }

    return entries;
  }

  private filterResults(): void {
    if (this.filterTimer) clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => {
      // Late timer fires after dismiss/accept could otherwise resurrect the dropdown.
      if (!this.active) return;
      const q = this.query.toLowerCase();
      // Cache snapshot once per activation — avoids O(#files) per keystroke.
      if (!this.cachedEntries) this.cachedEntries = this.getAllEntries();
      const all = this.cachedEntries;

      if (q.length === 0) {
        this.results = [...all].sort((a, b) => b.mtime - a.mtime).slice(0, MAX_RESULTS);
      } else {
        const prefix: AutocompleteEntry[] = [];
        const contains: AutocompleteEntry[] = [];
        for (const entry of all) {
          const name = entry.name.toLowerCase();
          if (name.startsWith(q)) prefix.push(entry);
          else if (name.includes(q)) contains.push(entry);
        }
        this.results = [...prefix, ...contains].slice(0, MAX_RESULTS);
      }

      this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.results.length - 1));
      this.renderDropdown();
    }, FILTER_DEBOUNCE_MS);
  }

  private renderDropdown(): void {
    if (!this.dropdownEl) {
      this.dropdownEl = this.containerEl.createDiv({ cls: "lean-wikilink-dropdown" });
    }

    this.positionDropdown();

    this.dropdownEl.empty();
    const header = this.dropdownEl.createDiv({ cls: "lean-wikilink-header" });
    header.setText(`[[${this.query}`);

    if (this.results.length === 0) {
      this.dropdownEl.createDiv({ cls: "lean-wikilink-empty", text: "No matches" });
    } else {
      const list = this.dropdownEl.createDiv({ cls: "lean-wikilink-list" });
      this.results.forEach((entry, i) => {
        const itemClasses = ["lean-wikilink-item"];
        if (i === this.selectedIndex) itemClasses.push("is-selected");
        if (!entry.isFile) itemClasses.push("is-unresolved");
        const item = list.createDiv({ cls: itemClasses.join(" ") });
        item.dataset.index = String(i);
        item.createSpan({ cls: "lean-wikilink-name", text: entry.name });

        if (entry.isFile && entry.folder && entry.folder !== "/") {
          item.createSpan({ cls: "lean-wikilink-path", text: entry.folder });
        } else if (!entry.isFile) {
          item.createSpan({ cls: "lean-wikilink-path", text: "no file yet" });
        }

        item.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.selectedIndex = i;
          this.accept();
        });
      });
    }

    void this.renderPreview();
  }

  private positionDropdown(): void {
    if (!this.dropdownEl) return;

    const buf = this.terminal.buffer.active;
    const cursorX = buf.cursorX;
    const cursorY = buf.cursorY;

    const screen = this.containerEl.querySelector(".xterm-screen");
    if (!screen) return;

    const screenRect = screen.getBoundingClientRect();
    const containerRect = this.containerEl.getBoundingClientRect();
    const cellW = screenRect.width / this.terminal.cols;
    const cellH = screenRect.height / this.terminal.rows;

    const offsetX = screenRect.left - containerRect.left;
    const offsetY = screenRect.top - containerRect.top;
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    let left = offsetX + cursorX * cellW;
    if (left + DROPDOWN_WIDTH > containerWidth) {
      left = Math.max(4, containerWidth - DROPDOWN_WIDTH - 4);
    }

    const cursorBottom = offsetY + (cursorY + 1) * cellH;
    if ((containerHeight - cursorBottom) > DROPDOWN_HEIGHT || cursorY < this.terminal.rows / 2) {
      this.dropdownEl.style.top = `${cursorBottom}px`;
      this.dropdownEl.style.bottom = "";
    } else {
      this.dropdownEl.style.bottom = `${containerHeight - (offsetY + cursorY * cellH)}px`;
      this.dropdownEl.style.top = "";
    }
    this.dropdownEl.style.left = `${left}px`;
  }

  private removeDropdown(): void {
    this.removePreview();
    if (this.dropdownEl) {
      this.dropdownEl.remove();
      this.dropdownEl = null;
    }
  }

  private async renderPreview(): Promise<void> {
    const entry = this.results[this.selectedIndex];
    if (!entry || !entry.isFile || !entry.path) {
      this.removePreview();
      return;
    }

    // Capture a token before any await; if selection changes while we're
    // reading the file, a later renderPreview() will bump the token and
    // we'll discard our stale result on resume.
    const token = ++this.previewToken;

    if (!this.previewEl) {
      this.previewEl = this.containerEl.createDiv({ cls: "lean-wikilink-preview" });
    }
    this.positionPreview();

    const file = this.app.vault.getAbstractFileByPath(entry.path);
    if (!(file instanceof TFile)) {
      if (token !== this.previewToken || !this.previewEl) return;
      this.previewEl.empty();
      this.previewEl.createDiv({ cls: "lean-preview-empty", text: "File not found" });
      return;
    }

    const content = await this.app.vault.cachedRead(file);
    if (token !== this.previewToken || !this.previewEl) return;

    const preview = content.split("\n").slice(0, PREVIEW_LINES).join("\n");

    const cache = this.app.metadataCache.getFileCache(file);
    const inlineTags = cache?.tags?.map((t) => t.tag) ?? [];
    const fmTagsRaw = cache?.frontmatter?.tags;
    const fmTags: string[] = Array.isArray(fmTagsRaw)
      ? fmTagsRaw.map(String)
      : typeof fmTagsRaw === "string"
        ? [fmTagsRaw]
        : [];
    const allTags = Array.from(new Set<string>([...inlineTags, ...fmTags]));

    const resolved = (this.app.metadataCache as unknown as MetadataCacheInternal).resolvedLinks ?? {};
    let backlinkCount = 0;
    for (const source of Object.keys(resolved)) {
      if (resolved[source]?.[file.path]) backlinkCount++;
    }

    const dateStr = new Date(file.stat.mtime).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    this.previewEl.empty();
    const meta = this.previewEl.createDiv({ cls: "lean-preview-meta" });
    meta.createSpan({ cls: "lean-preview-date", text: dateStr });
    meta.createSpan({
      cls: "lean-preview-backlinks",
      text: `${backlinkCount} backlink${backlinkCount !== 1 ? "s" : ""}`,
    });

    if (allTags.length > 0) {
      const tagRow = this.previewEl.createDiv({ cls: "lean-preview-tags" });
      for (const t of allTags) tagRow.createSpan({ cls: "lean-preview-tag", text: t });
    }

    this.previewEl.createDiv({ cls: "lean-preview-content", text: preview });
  }

  private positionPreview(): void {
    if (!this.previewEl || !this.dropdownEl) return;

    const dropRect = this.dropdownEl.getBoundingClientRect();
    const containerRect = this.containerEl.getBoundingClientRect();
    const rightSpace = containerRect.right - dropRect.right;

    if (rightSpace >= PREVIEW_WIDTH) {
      this.previewEl.style.left = `${dropRect.right - containerRect.left + 4}px`;
    } else {
      this.previewEl.style.left = `${dropRect.left - containerRect.left - PREVIEW_WIDTH - 4}px`;
    }
    this.previewEl.style.top = this.dropdownEl.style.top;
    this.previewEl.style.bottom = this.dropdownEl.style.bottom;
    this.previewEl.style.width = `${PREVIEW_WIDTH}px`;
  }

  private removePreview(): void {
    if (this.previewEl) {
      this.previewEl.remove();
      this.previewEl = null;
    }
  }
}
