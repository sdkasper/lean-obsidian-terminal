import { Notice, App, FileSystemAdapter, TFile } from "obsidian";
import type { AppWithDrag, ElectronWithWebUtils, ElectronWithClipboard, FileWithPath } from "./obsidian-internals";
import { Terminal, type ILink } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SerializeAddon } from "@xterm/addon-serialize";
import { SearchAddon } from "@xterm/addon-search";
import type { IDisposable } from "@xterm/xterm";
import { PtyManager } from "./pty-manager";
import { findPathCandidates, splitLineSuffix } from "./path-links";
import { isObsidianDark } from "./themes";
import { mixHex } from "./color-utils";
import { findTabColor, DEFAULT_TINT_STRENGTH, MAX_TINT_STRENGTH } from "./tab-colors";
import { ThemeRegistry } from "./theme-registry";
import type { TerminalPluginSettings, NotificationSound } from "./settings";
import { resolveShellPath } from "./settings";
import type { BinaryManager } from "./binary-manager";
import type { SavedTab } from "./session-state";
import { WikiLinkAutocomplete, type AutocompleteEntry } from "./wikilink-autocomplete";
import type { KeyHandlerRegistry } from "./key-handler-registry";

const SEARCH_DECORATIONS = {
  matchBackground: "#ffff0050",
  matchBorder: "#ffff0090",
  matchOverviewRuler: "#ffff0090",
  activeMatchBackground: "#ff660090",
  activeMatchBorder: "#ff660090",
  activeMatchColorOverviewRuler: "#ff660090",
} as const;

interface ParsedShortcut {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

function parseShortcut(s: string): ParsedShortcut | null {
  if (!s.trim()) return null;
  const parts = s.split("+");
  const key = parts[parts.length - 1];
  const lower = parts.map((p) => p.toLowerCase());
  return {
    ctrl: lower.includes("ctrl"),
    shift: lower.includes("shift"),
    alt: lower.includes("alt"),
    meta: lower.includes("meta") || lower.includes("cmd"),
    key,
  };
}

function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const p = parseShortcut(shortcut);
  if (!p) return false;
  return (
    e.ctrlKey === p.ctrl &&
    e.shiftKey === p.shift &&
    e.altKey === p.alt &&
    e.metaKey === p.meta &&
    e.key.toLowerCase() === p.key.toLowerCase()
  );
}

export interface TerminalSession {
  id: string;
  name: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  serializeAddon: SerializeAddon;
  pty: PtyManager;
  containerEl: HTMLElement;
  color: string;
  /** Working directory the shell was spawned in. */
  cwd: string;
  /** Command to re-run on restore (e.g. "claude --resume <uuid>"). */
  resumeCommand?: string;
  /** Disposables for parser/event handlers — cleaned up on close. */
  parserDisposables: IDisposable[];
  /** Mode 2031 state for terminal color queries. */
  mode2031: boolean;
  /** Whether this tab is pinned and cannot be closed. */
  pinned: boolean;
  autocomplete: WikiLinkAutocomplete | null;
  /** Floating label shown while a file is dragged over the terminal. */
  dragLabel: HTMLElement;
  searchAddon: SearchAddon;
  overlayEl: HTMLElement;
  toggleSearch: () => void;
}

/** Options for restoring a tab from persisted state (via setState). */
export interface CreateTabOpts {
  name?: string;
  color?: string;
  cwd?: string;
  bufferSerial?: string;
  resumeCommand?: string;
  pinned?: boolean;
}

/** Play a notification sound via the Web Audio API. */
function playNotificationSound(sound: NotificationSound, volume: number): void {
  try {
    const ctx = new AudioContext();
    const vol = Math.max(0, Math.min(volume, 100)) / 100;

    switch (sound) {
      case "chime": {
        // Two-tone ascending: 660 Hz → 880 Hz
        const g = ctx.createGain();
        g.gain.value = vol;
        g.connect(ctx.destination);
        const o1 = ctx.createOscillator();
        o1.type = "sine";
        o1.frequency.value = 660;
        o1.connect(g);
        o1.start(ctx.currentTime);
        o1.stop(ctx.currentTime + 0.12);
        const o2 = ctx.createOscillator();
        o2.type = "sine";
        o2.frequency.value = 880;
        o2.connect(g);
        o2.start(ctx.currentTime + 0.12);
        o2.stop(ctx.currentTime + 0.24);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
        window.setTimeout(() => void ctx.close(), 350);
        break;
      }
      case "ping": {
        // Short high triangle wave
        const g = ctx.createGain();
        g.gain.value = vol;
        g.connect(ctx.destination);
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = 1200;
        o.connect(g);
        o.start();
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        o.stop(ctx.currentTime + 0.1);
        window.setTimeout(() => void ctx.close(), 150);
        break;
      }
      case "pop": {
        // Short low sine
        const g = ctx.createGain();
        g.gain.value = vol;
        g.connect(ctx.destination);
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = 400;
        o.connect(g);
        o.start();
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        o.stop(ctx.currentTime + 0.08);
        window.setTimeout(() => void ctx.close(), 130);
        break;
      }
      default: {
        // "beep" — original 880 Hz sine
        const g = ctx.createGain();
        g.gain.value = vol;
        g.connect(ctx.destination);
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = 880;
        o.connect(g);
        o.start();
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        o.stop(ctx.currentTime + 0.15);
        window.setTimeout(() => void ctx.close(), 200);
        break;
      }
    }
  } catch {
    // Audio not available — silently ignore
  }
}

const ESC = "\x1b";

function resolveTerminalTheme(settings: TerminalPluginSettings, registry: ThemeRegistry) {
  const themeName = settings.theme === "auto"
    ? (isObsidianDark() ? "obsidian-dark" : "obsidian-light")
    : settings.theme;
  const theme = registry.get(themeName);
  if (settings.backgroundColor) {
    theme.background = settings.backgroundColor;
  }
  return theme;
}

/** Percent (0..MAX_TINT_STRENGTH) used to mix `color` into the terminal background. */
function tintRatioForColor(color: string, settings: TerminalPluginSettings): number {
  if (!color || !settings.tabColorTintsBackground) return 0;
  const def = findTabColor(settings.tabColors, color);
  const strength = Math.min(MAX_TINT_STRENGTH, Math.max(0, def?.tintStrength ?? DEFAULT_TINT_STRENGTH));
  return strength / 100;
}

/** Theme with the per-session tab color mixed into the background.
 *  resolveTerminalTheme already returns a fresh object (ThemeRegistry.get
 *  clones), so we mutate its background in place rather than spreading again. */
function resolveSessionTheme(
  session: Pick<TerminalSession, "color">,
  settings: TerminalPluginSettings,
  registry: ThemeRegistry,
) {
  const theme = resolveTerminalTheme(settings, registry);
  const ratio = tintRatioForColor(session.color, settings);
  if (ratio > 0 && theme.background) {
    theme.background = mixHex(theme.background, session.color, ratio);
  }
  return theme;
}

function quotePath(rawPath: string, shellPath: string): string {
  if (!rawPath.includes(" ")) return rawPath;
  const lower = shellPath.toLowerCase();
  if (lower.includes("bash") || lower.includes("zsh") || lower.includes("sh")) {
    return `'${rawPath.replace(/'/g, "'\\''")}'`;
  }
  return `"${rawPath.replace(/"/g, '\\"')}"`;
}

/** Raster image extensions that TUIs such as Claude Code attach as vision input. */
const IMAGE_PATH_PATTERN = /\.(png|jpe?g|gif|webp|bmp)$/i;

function isImagePath(path: string): boolean {
  return IMAGE_PATH_PATTERN.test(path);
}

/**
 * Wrap text in bracketed-paste markers (ESC[200~ … ESC[201~). A raw `pty.write`
 * arrives as individually typed characters; CLI apps like Claude Code only treat
 * an incoming file path as a pasted image attachment when it is delivered as a
 * single bracketed paste, matching what a real terminal paste sends.
 */
function bracketedPaste(text: string): string {
  return `\x1b[200~${text}\x1b[201~`;
}

/** Monotonic counter so rapid pastes in the same millisecond get unique names. */
let pasteImageCounter = 0;

/**
 * If the OS clipboard holds an image, persist it to a temp PNG and write the
 * path to the PTY as a bracketed paste so the running app attaches it.
 * Returns true when an image was handled, false to fall through to text paste.
 *
 * The temp file is deleted after a short delay: the receiving app reads the
 * image as soon as the path is pasted, so it is no longer needed afterwards.
 */
function pasteClipboardImage(pty: PtyManager): boolean {
  try {
    const { clipboard } = window.require("electron") as ElectronWithClipboard;
    const image = clipboard.readImage();
    if (!image || image.isEmpty()) return false;
    const os = window.require("os") as { tmpdir(): string };
    const fs = window.require("fs") as {
      writeFileSync(p: string, d: Uint8Array, opts?: { mode?: number }): void;
      unlinkSync(p: string): void;
    };
    const path = window.require("path") as { join(...p: string[]): string };
    const name = `lean-terminal-paste-${Date.now()}-${pasteImageCounter++}.png`;
    const file = path.join(os.tmpdir(), name);
    fs.writeFileSync(file, image.toPNG(), { mode: 0o600 });
    pty.write(bracketedPaste(file));
    window.setTimeout(() => {
      try { fs.unlinkSync(file); } catch (e) {
        console.warn("[lean-terminal] temp file cleanup failed:", e);
      }
    }, 30000);
    return true;
  } catch (err) {
    console.warn("[lean-terminal] Image paste failed:", err);
    return false;
  }
}

function extractDropPath(e: DragEvent, app: App): string | null {
  // OS file drag via text/uri-list (file:// URLs in Electron)
  const uriList = e.dataTransfer?.getData("text/uri-list");
  if (uriList) {
    const uri = uriList.split("\n")[0].trim();
    if (uri.startsWith("file://")) {
      return (window.require("url") as { fileURLToPath: (u: string) => string }).fileURLToPath(uri);
    }
  }

  // OS file drag via dataTransfer.files — webUtils.getPathForFile (Electron 32+) with .path fallback
  if (e.dataTransfer?.files.length) {
    const file = e.dataTransfer.files[0];
    try {
      const { webUtils } = window.require("electron") as ElectronWithWebUtils;
      const p = webUtils.getPathForFile(file);
      if (p) return p;
    } catch {
      const p = (file as FileWithPath).path;
      if (p) return p;
    }
  }

  // Obsidian internal file drag
  const draggable = (app as AppWithDrag).dragManager?.draggable;
  if (draggable?.file) {
    const adapter = app.vault.adapter as FileSystemAdapter;
    const pathMod = window.require("path") as { join: (...p: string[]) => string; sep: string };
    const vaultPath = draggable.file.path.split("/").join(pathMod.sep);
    return pathMod.join(adapter.getBasePath(), vaultPath);
  }

  return null;
}


/** A resolved path either opens inside the vault or in the system default app. */
type PathTarget =
  | { kind: "vault"; linkpath: string }
  | { kind: "external"; absPath: string };

/** Cache stat results so hovering/redrawing lines does not re-hit the disk. */
const fileExistsCache = new Map<string, boolean>();

/** True if the absolute path exists and is a regular file (cached). */
function isExistingFile(absPath: string): boolean {
  const cached = fileExistsCache.get(absPath);
  if (cached !== undefined) return cached;
  let result = false;
  try {
    const fs = window.require("fs") as { statSync(p: string): { isFile(): boolean } };
    result = fs.statSync(absPath).isFile();
  } catch {
    result = false;
  }
  if (fileExistsCache.size > 1000) fileExistsCache.clear();
  fileExistsCache.set(absPath, result);
  return result;
}

/**
 * Resolve a path candidate to an open target, or null if it is not a real file.
 * Vault files (relative, bare name, or absolute-inside-vault) open in Obsidian;
 * absolute paths outside the vault open in the system default application.
 */
function resolvePathTarget(candidate: string, app: App): PathTarget | null {
  // Normalise backslashes so Windows paths resolve like POSIX ones.
  const norm = candidate.split("\\").join("/");
  let abs: string | null = null;
  if (norm.startsWith("/") || /^[A-Za-z]:\//.test(norm)) {
    abs = norm; // POSIX or Windows drive-absolute (e.g. C:/Users/...)
  } else if (norm.startsWith("~/")) {
    const os = window.require("os") as { homedir(): string };
    abs = os.homedir().split("\\").join("/") + norm.slice(1);
  }

  if (abs !== null) {
    const adapter = app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
      const base = adapter.getBasePath().split("\\").join("/");
      if (abs.startsWith(base + "/")) {
        const rel = abs.slice(base.length + 1);
        return app.vault.getAbstractFileByPath(rel) instanceof TFile
          ? { kind: "vault", linkpath: rel }
          : null;
      }
    }
    return isExistingFile(abs) ? { kind: "external", absPath: abs } : null;
  }

  const file = app.vault.getAbstractFileByPath(norm);
  if (file instanceof TFile) return { kind: "vault", linkpath: norm };
  // Bare names (e.g. CLAUDE.md) resolve the way Obsidian wiki-links do.
  const dest = app.metadataCache.getFirstLinkpathDest(norm, "");
  return dest ? { kind: "vault", linkpath: dest.path } : null;
}

export interface TabManagerOptions {
  app: App;
  tabBarEl: HTMLElement;
  terminalHostEl: HTMLElement;
  settings: TerminalPluginSettings;
  cwd: string;
  pluginDir: string;
  binaryManager: BinaryManager;
  themeRegistry: ThemeRegistry;
  /** Plugin-level registry of downstream key handlers, shared across all views/tabs. */
  keyHandlers: KeyHandlerRegistry;
  onActiveChange?: () => void;
  onTabsEmpty?: () => void;
  requestSaveLayout?: () => void;
  onSessionClose?: (tab: SavedTab) => void;
}

export class TerminalTabManager {
  private sessions: TerminalSession[] = [];
  private activeId: string | null = null;
  private tabBarEl: HTMLElement;
  private terminalHostEl: HTMLElement;
  private settings: TerminalPluginSettings;
  private cwd: string;
  private pluginDir: string;
  private binaryManager: BinaryManager;
  private themeRegistry: ThemeRegistry;
  private keyHandlers: KeyHandlerRegistry;
  private onActiveChange?: () => void;
  private onTabsEmpty?: () => void;
  private requestSaveLayout?: () => void;
  private onSessionClose?: (tab: SavedTab) => void;
  /** Set true by any terminal write/resize; consumed by the view's periodic save timer. */
  private outputDirty = false;
  private sessionCounter = 0;
  private dragSrcId: string | null = null;
  private readonly app: App;

  constructor(opts: TabManagerOptions) {
    this.app = opts.app;
    this.tabBarEl = opts.tabBarEl;
    this.terminalHostEl = opts.terminalHostEl;
    this.settings = opts.settings;
    this.cwd = opts.cwd;
    this.pluginDir = opts.pluginDir;
    this.binaryManager = opts.binaryManager;
    this.themeRegistry = opts.themeRegistry;
    this.keyHandlers = opts.keyHandlers;
    this.onActiveChange = opts.onActiveChange;
    this.onTabsEmpty = opts.onTabsEmpty;
    this.requestSaveLayout = opts.requestSaveLayout;
    this.onSessionClose = opts.onSessionClose;
  }

  /** Capture a session's current state as a SavedTab (used on close for recents). */
  private captureSession(session: TerminalSession): SavedTab {
    return {
      name: session.name,
      color: session.color,
      cwd: session.cwd,
      bufferSerial: this.settings.persistBuffer ? session.serializeAddon.serialize() : undefined,
      resumeCommand: session.resumeCommand,
      pinned: session.pinned || undefined,
    };
  }

  /**
   * Consume the dirty flag: returns true if output/resize happened since last call,
   * resetting it. Used by the view's periodic save timer.
   */
  consumeOutputDirty(): boolean {
    const was = this.outputDirty;
    this.outputDirty = false;
    return was;
  }

  /**
   * Install an OSC 133 handler + fallback timer that writes `resumeCommand` to the
   * PTY once the shell is ready (signalled by OSC 133 A). Called from createTab
   * before pty.spawn so the handler catches the very first prompt.
   */
  private setupAutoResume(session: TerminalSession, terminal: Terminal): void {
    let executed = false;
    let fallbackTimer: number | null = null;
    let oscDisposable: { dispose: () => void } | null = null;

    const cleanup = (): void => {
      if (fallbackTimer) { window.clearTimeout(fallbackTimer); fallbackTimer = null; }
      if (oscDisposable) { oscDisposable.dispose(); oscDisposable = null; }
    };

    const runCommand = (): void => {
      if (executed || !session.resumeCommand) return;
      executed = true;
      cleanup();
      const command = session.resumeCommand;
      session.resumeCommand = undefined;
      session.pty.write(command + "\r");
      this.requestSaveLayout?.();
    };

    // Primary trigger: shell emits OSC 133 A ("prompt start") when ready for input
    oscDisposable = terminal.parser.registerOscHandler(133, (data) => {
      if (data.startsWith("A")) runCommand();
      return false; // allow other handlers to run
    });

    // Fallback for shells without OSC 133 support (e.g. cmd.exe): run after 2s
    fallbackTimer = window.setTimeout(runCommand, 2000);

    // Ensure the timer and OSC handler are cancelled if the tab closes before
    // the command fires (prevents writes to a dead PTY and handler leaks).
    session.parserDisposables.push({ dispose: cleanup });
  }

  /**
   * Fire `command` once in `session` when the shell is ready (OSC 133 A), with
   * a 2s fallback for shells without OSC 133. Unlike setupAutoResume, the command
   * is held in a local closure and never written to `session.resumeCommand`, so it
   * cannot be accidentally serialized into saved workspace state.
   */
  private setupStartupCommand(session: TerminalSession, terminal: Terminal, command: string): void {
    let executed = false;
    let fallbackTimer: number | null = null;
    let oscDisposable: { dispose: () => void } | null = null;

    const cleanup = (): void => {
      if (fallbackTimer) { window.clearTimeout(fallbackTimer); fallbackTimer = null; }
      if (oscDisposable) { oscDisposable.dispose(); oscDisposable = null; }
    };

    const run = (): void => {
      if (executed) return;
      executed = true;
      cleanup();
      session.pty.write(command + "\r");
    };

    oscDisposable = terminal.parser.registerOscHandler(133, (data) => {
      if (data.startsWith("A")) run();
      return false;
    });

    fallbackTimer = window.setTimeout(run, 2000);

    // Ensure the timer and OSC handler are cancelled if the tab closes before
    // the command fires.
    session.parserDisposables.push({ dispose: cleanup });
  }

  private buildXterm(
    containerEl: HTMLElement,
    opts?: CreateTabOpts,
  ): { terminal: Terminal; fitAddon: FitAddon; serializeAddon: SerializeAddon; searchAddon: SearchAddon } {
    const terminal = new Terminal({
      fontSize: this.settings.fontSize,
      fontFamily: this.settings.fontFamily,
      lineHeight: this.settings.lineHeight,
      cursorBlink: this.settings.cursorBlink,
      cursorStyle: this.settings.cursorStyle,
      scrollback: this.settings.scrollback,
      theme: resolveSessionTheme(
        { color: opts?.color ?? "" },
        this.settings,
        this.themeRegistry,
      ),
      linkHandler: {
        activate: (_event: MouseEvent, uri: string) => {
          if (!/^(https?|obsidian):\/\//i.test(uri)) return;
          const { shell } = window.require("electron") as {
            shell: { openExternal: (url: string) => Promise<void> };
          };
          void shell.openExternal(uri);
        },
        allowNonHttpProtocols: true,
      },
    });

    const fitAddon = new FitAddon();
    const WEB_LINK_REGEX =
      /(https?|HTTPS?|obsidian):[/]{2}[^\s"'!*(){}|\\^<>`]*[^\s"':,.!?{}|\\^~[\]`()<>]/;
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      if (!/^(https?|obsidian):\/\//i.test(uri)) return;
      const { shell } = window.require("electron") as {
        shell: { openExternal: (url: string) => Promise<void> };
      };
      void shell.openExternal(uri);
    }, { urlRegex: WEB_LINK_REGEX });
    const serializeAddon = new SerializeAddon();
    const searchAddon = new SearchAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(serializeAddon);
    terminal.loadAddon(searchAddon);
    terminal.open(containerEl);

    terminal.registerLinkProvider({
      provideLinks: (lineNumber: number, callback: (links: ILink[] | undefined) => void) => {
        const line = terminal.buffer.active.getLine(lineNumber - 1);
        if (!line) { callback([]); return; }
        const text = line.translateToString(true);
        const links: ILink[] = [];
        const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
        let match: RegExpExecArray | null;
        while ((match = re.exec(text)) !== null) {
          const name = match[1];
          const start = match.index + 1;
          const end = match.index + match[0].length + 1;
          links.push({
            range: {
              start: { x: start, y: lineNumber },
              end: { x: end, y: lineNumber },
            },
            text: match[0],
            decorations: { pointerCursor: true, underline: true },
            activate: (event: MouseEvent) => {
              // Cmd/Ctrl+click: open a fresh tab first, then resolve the link
              // into it via openLinkText (which handles wiki-link resolution).
              if (event.metaKey || event.ctrlKey) this.app.workspace.getLeaf("tab");
              void this.app.workspace.openLinkText(name, "", false);
            },
          });
        }
        callback(links);
      },
    });

    // Bare file paths open in Obsidian (vault files) or the system app (external).
    // Gated on settings.clickableFilePaths (live check, so toggling the setting
    // applies immediately to already-open tabs, not just newly created ones).
    terminal.registerLinkProvider({
      provideLinks: (lineNumber: number, callback: (links: ILink[] | undefined) => void) => {
        if (!this.settings.clickableFilePaths) { callback([]); return; }
        const line = terminal.buffer.active.getLine(lineNumber - 1);
        if (!line) { callback([]); return; }
        const text = line.translateToString(true);
        const links: ILink[] = [];
        for (const candidate of findPathCandidates(text)) {
          // Resolve the raw token first (so a file literally named "foo:42" still
          // wins); only if that fails, retry after peeling a trailing :line[:col]
          // suffix (e.g. "src/main.ts:42") and carry the line through so the file
          // opens at that position.
          let target = resolvePathTarget(candidate.value, this.app);
          let targetLine: number | null = null;
          if (!target) {
            const { path, line } = splitLineSuffix(candidate.value);
            if (path !== candidate.value) {
              const stripped = resolvePathTarget(path, this.app);
              if (stripped) {
                target = stripped;
                targetLine = line;
              }
            }
          }
          if (!target) continue;
          const resolved = target;
          links.push({
            range: {
              start: { x: candidate.start + 1, y: lineNumber },
              end: { x: candidate.end + 1, y: lineNumber },
            },
            text: candidate.value,
            decorations: { pointerCursor: true, underline: true },
            activate: (_event: MouseEvent) => {
              if (resolved.kind === "vault") {
                const dest = this.app.metadataCache.getFirstLinkpathDest(resolved.linkpath, "");
                if (dest instanceof TFile) {
                  const viewState =
                    targetLine != null ? { eState: { line: targetLine - 1 } } : undefined;
                  void this.app.workspace.getLeaf("tab").openFile(dest, viewState);
                } else {
                  void this.app.workspace.openLinkText(resolved.linkpath, "", true);
                }
              } else {
                const { shell } = window.require("electron") as {
                  shell: { openPath: (p: string) => Promise<string> };
                };
                void shell.openPath(resolved.absPath);
              }
            },
          });
        }
        callback(links);
      },
    });

    return { terminal, fitAddon, serializeAddon, searchAddon };
  }

  private installDragDrop(containerEl: HTMLElement, pty: PtyManager): HTMLElement {
    const dragLabel = activeDocument.body.createDiv({ cls: "terminal-drag-label" });
    dragLabel.setText("Paste path to file");

    const isFileDrag = (e: DragEvent): boolean =>
      !!e.dataTransfer?.types.includes("Files") ||
      !!(this.app as AppWithDrag).dragManager?.draggable;

    const showLabel = (e: DragEvent) => {
      dragLabel.addClass("terminal-drag-label-visible");
      dragLabel.style.left = `${e.clientX + 14}px`;
      dragLabel.style.top = `${e.clientY + 14}px`;
    };
    const hideLabel = () => { dragLabel.removeClass("terminal-drag-label-visible"); };

    containerEl.addEventListener("dragenter", (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      showLabel(e);
    });

    containerEl.addEventListener("dragover", (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy";
      showLabel(e);
    });

    containerEl.addEventListener("dragleave", (e) => {
      if (!containerEl.contains(e.relatedTarget as Node)) hideLabel();
    });

    containerEl.addEventListener("drop", (e) => {
      e.preventDefault();
      hideLabel();
      const path = extractDropPath(e, this.app);
      if (!path) return;
      // Dropped images attach as files; other files insert as a quoted path.
      if (isImagePath(path)) {
        pty.write(bracketedPaste(path));
      } else {
        pty.write(quotePath(path, pty.shellPath));
      }
    });

    return dragLabel;
  }

  private buildSearchOverlay(
    containerEl: HTMLElement,
    terminal: Terminal,
    searchAddon: SearchAddon,
  ): { overlayEl: HTMLElement; toggleSearch: () => void; resultsDisposable: IDisposable } {
    const overlayEl = containerEl.createDiv({ cls: "lean-terminal-search-overlay" });
    const searchInput = overlayEl.createEl("input", { type: "text" });
    searchInput.addClass("lean-terminal-search-input");
    searchInput.placeholder = "Find...";
    const counterEl = overlayEl.createSpan({ cls: "lean-terminal-search-counter" });
    const prevBtn = overlayEl.createEl("button", { cls: "lean-terminal-search-btn", text: "↑" });
    const nextBtn = overlayEl.createEl("button", { cls: "lean-terminal-search-btn", text: "↓" });
    const caseBtn = overlayEl.createEl("button", { cls: "lean-terminal-search-btn", text: "Aa" });
    const closeSearchBtn = overlayEl.createEl("button", { cls: "lean-terminal-search-btn", text: "×" });

    let caseSensitive = false;

    const runSearch = (forward: boolean, incremental = false) => {
      const q = searchInput.value;
      const opts = { caseSensitive, incremental, decorations: SEARCH_DECORATIONS };
      if (forward) searchAddon.findNext(q, opts);
      else searchAddon.findPrevious(q, opts);
    };

    const resultsDisposable = searchAddon.onDidChangeResults((result: { resultIndex: number; resultCount: number } | undefined) => {
      if (!result || result.resultCount === 0) {
        counterEl.setText(searchInput.value ? "No results" : "");
      } else {
        counterEl.setText(`${result.resultIndex + 1} of ${result.resultCount}`);
      }
    });

    const showSearch = () => {
      overlayEl.addClass("lean-terminal-search-overlay--visible");
      if (searchInput.value) runSearch(true, true);
      searchInput.focus();
    };

    const hideSearch = () => {
      overlayEl.removeClass("lean-terminal-search-overlay--visible");
      searchAddon.clearDecorations();
      counterEl.setText("");
      terminal.focus();
    };

    const toggleSearch = () => {
      if (overlayEl.hasClass("lean-terminal-search-overlay--visible")) hideSearch();
      else showSearch();
    };

    searchInput.addEventListener("input", () => runSearch(true, true));
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) runSearch(false);
        else runSearch(true);
      } else if (e.key === "Escape") {
        hideSearch();
      }
    });

    nextBtn.addEventListener("click", () => runSearch(true));
    prevBtn.addEventListener("click", () => runSearch(false));
    caseBtn.addEventListener("click", () => {
      caseSensitive = !caseSensitive;
      caseBtn.toggleClass("lean-terminal-search-btn--active", caseSensitive);
      if (searchInput.value) runSearch(true, true);
    });
    closeSearchBtn.addEventListener("click", () => hideSearch());

    return { overlayEl, toggleSearch, resultsDisposable };
  }

  private installKeyHandler(terminal: Terminal, id: string): void {
    terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      const s = this.sessions.find((s) => s.id === id);

      // Downstream-registered handlers run first, in registration order. If any
      // returns false the event is consumed and the chain — including the built-in
      // autocomplete/search handling below — stops. See KeyHandlerRegistry.
      if (s && !this.keyHandlers.dispatch(e, s)) return false;

      // Wiki-link autocomplete swallows navigation keys while its dropdown is open.
      if (s?.autocomplete?.handleKey(e)) return false;

      if (e.type !== "keydown") return true;

      // Stop Escape from bubbling to Obsidian's document handlers (modal dismiss etc.)
      // xterm still sends \x1b to the PTY via its normal processing (return true)
      if (e.key === "Escape") {
        e.stopPropagation();
        return true;
      }

      const mod = e.metaKey || e.ctrlKey;

      // Search shortcut
      if (matchesShortcut(e, this.settings.searchShortcut)) {
        e.preventDefault();
        const s = this.sessions.find((s) => s.id === id);
        if (s) s.toggleSearch();
        return false;
      }

      // Readline shortcuts (Ctrl+K/U/W/E/L) — gate on settings toggle
      if (this.settings.readlineShortcuts && e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        const readlineCode: Record<string, string> = {
          k: "\x0b",  // kill to end of line
          u: "\x15",  // kill to start of line
          w: "\x17",  // kill previous word
          e: "\x05",  // move to end of line
          l: "\x0c",  // clear screen
        };
        const code = readlineCode[e.key.toLowerCase()];
        if (code) {
          e.preventDefault();
          const s = this.sessions.find((s) => s.id === id);
          if (s) s.pty.write(code);
          return false;
        }
      }

      // Shift+Enter: send newline without submitting
      if (e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        const s = this.sessions.find((s) => s.id === id);
        if (s) s.pty.write("\n");
        return false;
      }

      // Paste: Ctrl+V / Cmd+V / Shift+Insert
      if ((mod && e.key === "v") || (e.shiftKey && e.key === "Insert")) {
        e.preventDefault();
        const s = this.sessions.find((s) => s.id === id);
        // An image on the clipboard is attached as a file; otherwise paste text.
        if (s && pasteClipboardImage(s.pty)) return false;
        navigator.clipboard.readText().then((text) => {
          if (text && s) s.pty.write(text);
        }).catch(() => { /* clipboard unavailable */ });
        return false;
      }

      // Copy: Ctrl+C / Cmd+C when there is a selection (otherwise send SIGINT)
      if (mod && e.key === "c" && terminal.hasSelection()) {
        navigator.clipboard.writeText(terminal.getSelection()).catch(() => {});
        terminal.clearSelection();
        return false;
      }

      return true;
    });
  }

  private buildAutocomplete(
    terminal: Terminal,
    pty: PtyManager,
    containerEl: HTMLElement,
  ): WikiLinkAutocomplete | null {
    if (!this.settings.wikiLinkAutocomplete) return null;

    // The two `[[` chars were already echoed (autocomplete observes data, never
    // consumes), so path modes prepend two DEL chars to erase them before
    // writing the resolved path.
    const ERASE_BRACKETS = "\x7f\x7f";
    const resolveInsertion = (entry: AutocompleteEntry | null, query: string): string => {
      const mode = this.settings.wikiLinkInsertMode;
      // entry.path holds the full vault-relative path with extension
      // (e.g. "Folder/Note.md" or "Drawings/Sketch.canvas"). Path-mode
      // insertion uses it directly so non-markdown notes work too.
      if (entry?.isFile && entry.path && (mode === "vault-path" || mode === "absolute-path")) {
        if (mode === "vault-path") {
          return `${ERASE_BRACKETS}${quotePath(entry.path, pty.shellPath)}`;
        }
        const adapter = this.app.vault.adapter as FileSystemAdapter;
        const path = window.require("path") as { join: (...parts: string[]) => string; sep: string };
        const abs = path.join(adapter.getBasePath(), entry.path.split("/").join(path.sep));
        return `${ERASE_BRACKETS}${quotePath(abs, pty.shellPath)}`;
      }
      // Wiki-link mode (default) and unresolved/empty fallbacks.
      if (entry) return `${entry.name}]]`;
      if (query.length > 0) return `${query}]]`;
      return "]]";
    };

    return new WikiLinkAutocomplete(
      this.app,
      terminal,
      (d: string) => pty.write(d),
      containerEl,
      resolveInsertion,
    );
  }

  private spawnPty(session: TerminalSession, terminal: Terminal, fitAddon: FitAddon, sessionCwd: string): void {
    const pty = session.pty;
    // Double-rAF: first frame renders the container, second guarantees layout is
    // complete so fitAddon reads correct dimensions. More reliable than a fixed
    // 100ms timeout, which is too short on slow startup and wasted on fast ones.
    window.requestAnimationFrame(() => { window.requestAnimationFrame(() => {
      // Abort if the session was destroyed while waiting (e.g. openTabOrView
      // destroy-and-recreate flow replaces a default tab during these two frames)
      if (!this.sessions.some((s) => s.id === session.id)) return;

      try {
        fitAddon.fit();
      } catch {
        // ignore
      }

      const cols = terminal.cols || 80;
      const rows = terminal.rows || 24;

      if (!this.binaryManager.isReady()) {
        terminal.write("\r\n\x1b[33mTerminal binaries not installed.\x1b[0m\r\n");
        terminal.write("Go to Settings → Terminal to download them.\r\n");
        return;
      }

      try {
        pty.spawn(resolveShellPath(this.settings), sessionCwd, cols, rows);
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        console.error("Terminal: failed to spawn shell", err);
        terminal.write(`\r\nFailed to spawn shell: ${message}\r\n`);
        return;
      }

      // Wire data: PTY -> xterm
      pty.onData((data: string) => {
        terminal.write(data);
      });

      // Wire data: xterm -> PTY. Autocomplete may consume data (returns true) to
      // prevent keypress-echoed chars from reaching the PTY while active.
      terminal.onData((data: string) => {
        if (!session.autocomplete?.handleData(data)) pty.write(data);
      });

      pty.onExit((exitInfo) => {
        this.notifyCompletion(session, exitInfo.exitCode);
        this.forceCloseTab(session.id);
      });
    }); });
  }

  createTab(opts?: CreateTabOpts): TerminalSession {
    this.sessionCounter++;
    const id = `terminal-${this.sessionCounter}`;
    const name = opts?.name ?? `Terminal ${this.sessionCounter}`;
    const sessionCwd = opts?.cwd ?? this.cwd;

    const containerEl = this.terminalHostEl.createDiv({ cls: "terminal-session" });
    const { terminal, fitAddon, serializeAddon, searchAddon } = this.buildXterm(containerEl, opts);
    const pty = new PtyManager(this.pluginDir);
    const dragLabel = this.installDragDrop(containerEl, pty);
    const { overlayEl, toggleSearch, resultsDisposable } = this.buildSearchOverlay(containerEl, terminal, searchAddon);

    // Replay prior buffer (from persisted state) before the PTY produces new output.
    // No visual marker is written — markers become part of the serialized buffer and
    // accumulate across restores.
    if (opts?.bufferSerial) terminal.write(opts.bufferSerial);

    // Mark "output changed since last save" so the view's periodic timer can
    // trigger a save. We avoid calling requestSaveLayout on every write because
    // heavy output (e.g. Claude streaming) caused visible input lag when every
    // chunk scheduled a debounced save-which-serializes-the-whole-buffer.
    terminal.onWriteParsed(() => { this.outputDirty = true; });
    terminal.onResize(() => { this.outputDirty = true; });

    // Intercept clipboard shortcuts — Obsidian captures them before xterm.js
    this.installKeyHandler(terminal, id);
    const autocomplete = this.buildAutocomplete(terminal, pty, containerEl);

    const session: TerminalSession = {
      id,
      name,
      terminal,
      fitAddon,
      serializeAddon,
      pty,
      containerEl,
      color: opts?.color ?? "",
      cwd: sessionCwd,
      resumeCommand: opts?.resumeCommand,
      parserDisposables: [],
      mode2031: false,
      pinned: opts?.pinned ?? false,
      autocomplete,
      dragLabel,
      searchAddon,
      overlayEl,
      toggleSearch,
    };
    session.parserDisposables.push(resultsDisposable);

    terminal.onSelectionChange(() => {
      if (!this.settings.copyOnSelect) return;
      const text = terminal.getSelection();
      if (text) void navigator.clipboard.writeText(text);
    });

    this.sessions.push(session);
    this.switchTab(id);
    this.renderTabBar();
    this.requestSaveLayout?.();

    // Fresh new tabs (no persisted buffer, no saved resumeCommand) run the global
    // startup command. A separate path (not session.resumeCommand) keeps it out of
    // serialized workspace state so it never re-fires on restore.
    if (!session.resumeCommand && !opts?.bufferSerial && this.settings.startupCommand) {
      this.setupStartupCommand(session, terminal, this.settings.startupCommand);
    }

    // Install the auto-resume OSC listener before the PTY spawns so the first
    // prompt's OSC 133 A is caught. Any tab with a `resumeCommand` set runs it
    // once the shell is ready. Callers that don't want this just omit the field.
    if (session.resumeCommand) {
      this.setupAutoResume(session, terminal);
    }

    this.spawnPty(session, terminal, fitAddon, sessionCwd);
    return session;
  }

  switchTab(id: string): void {
    this.activeId = id;

    for (const session of this.sessions) {
      if (session.id === id) {
        session.containerEl.removeClass("terminal-session-hidden");
        // One rAF is enough here: the element is already in the DOM, we just
        // need to wait for the CSS visibility change to be painted before fit.
        window.requestAnimationFrame(() => {
          try {
            session.fitAddon.fit();
            session.pty.resize(session.terminal.cols, session.terminal.rows);
            session.terminal.focus();
          } catch {
            // ignore
          }
        });
      } else {
        session.containerEl.addClass("terminal-session-hidden");
      }
    }

    this.renderTabBar();
    this.onActiveChange?.();
    this.requestSaveLayout?.();
  }

  private teardownSession(session: TerminalSession): void {
    session.autocomplete?.dispose();
    for (const d of session.parserDisposables) d.dispose();
    session.parserDisposables = [];
    session.pty.kill();
    session.terminal.dispose();
    session.containerEl.remove();
    session.dragLabel.remove();
  }

  // Used by the PTY exit handler. Bypasses the pin guard intentionally: pinning
  // protects against *user-initiated* close only. When the process itself exits
  // there is nothing left to protect, so the tab is always removed.
  private forceCloseTab(id: string): void {
    const idx = this.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const session = this.sessions[idx];
    this.onSessionClose?.(this.captureSession(session));
    this.teardownSession(session);
    this.sessions.splice(idx, 1);
    if (this.activeId === id) {
      if (this.sessions.length > 0) {
        this.switchTab(this.sessions[Math.min(idx, this.sessions.length - 1)].id);
      } else {
        this.activeId = null;
      }
    }
    if (this.sessions.length === 0 && this.onTabsEmpty) {
      this.onTabsEmpty();
      return;
    }
    this.renderTabBar();
    this.requestSaveLayout?.();
  }

  closeTab(id: string): void {
    const idx = this.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return;

    const session = this.sessions[idx];
    if (session.pinned) return;

    // Capture for recents BEFORE destroying (serialize needs a live xterm)
    this.onSessionClose?.(this.captureSession(session));
    this.teardownSession(session);
    this.sessions.splice(idx, 1);

    // Switch to adjacent tab if we closed the active one
    if (this.activeId === id) {
      if (this.sessions.length > 0) {
        const newIdx = Math.min(idx, this.sessions.length - 1);
        this.switchTab(this.sessions[newIdx].id);
      } else {
        this.activeId = null;
      }
    }

    if (this.sessions.length === 0 && this.onTabsEmpty) {
      this.onTabsEmpty();
      return;
    }

    this.renderTabBar();
    this.requestSaveLayout?.();
  }

  fitActive(): void {
    const active = this.getActiveSession();
    if (!active) return;
    try {
      active.fitAddon.fit();
      active.pty.resize(active.terminal.cols, active.terminal.rows);
    } catch {
      // ignore
    }
  }

  focusActive(): void {
    if (activeDocument.querySelector(".terminal-tab-rename-input")) return;
    this.getActiveSession()?.terminal.focus();
  }

  getActiveSession(): TerminalSession | null {
    return this.sessions.find((s) => s.id === this.activeId) || null;
  }

  getSessions(): TerminalSession[] {
    return this.sessions;
  }

  /**
   * Serialize all sessions into a form suitable for TerminalView.getState().
   * Buffer serialization is gated on the persistBuffer setting.
   */
  serializeSessions(): SavedTab[] {
    return this.sessions.map((s) => this.captureSession(s));
  }

  /** Index of the currently active session (0-based), or -1 if none. */
  getActiveIndex(): number {
    return this.sessions.findIndex((s) => s.id === this.activeId);
  }

  /** Activate a session by its position in the sessions array. */
  switchToIndex(index: number): void {
    if (index < 0 || index >= this.sessions.length) return;
    this.switchTab(this.sessions[index].id);
  }

  /**
   * Destroy all sessions. Pushes each to onSessionClose (recents) by default.
   * Pass `saveToRecents: false` when replacing tabs with restored state
   * (e.g. setState after onOpen's default-tab creation) to avoid polluting recents.
   */
  destroyAll(saveToRecents = true): void {
    activeDocument.querySelector(".terminal-tab-context-menu")?.remove();
    for (const session of this.sessions) {
      if (saveToRecents) {
        this.onSessionClose?.(this.captureSession(session));
      }
      this.teardownSession(session);
    }
    this.sessions = [];
    this.activeId = null;
  }

  private notifyCompletion(session: TerminalSession, exitCode: number): void {
    if (!this.settings.notifyOnCompletion) return;

    const status = exitCode === 0 ? "done" : `exit ${exitCode}`;
    playNotificationSound(this.settings.notificationSound, this.settings.notificationVolume);
    new Notice(`${session.name}: ${status}`);
  }

  private renameTab(id: string, labelEl: HTMLElement): void {
    const session = this.sessions.find((s) => s.id === id);
    if (!session) return;

    // Created via createEl on the label so the input lands in the same document
    // (popout windows have their own); replaceWith then moves it into place.
    const input = labelEl.createEl("input", {
      cls: "terminal-tab-rename-input",
      attr: { type: "text" },
    });
    input.value = session.name;

    labelEl.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      const newName = input.value.trim() || session.name;
      session.name = newName;
      this.renderTabBar();
      this.requestSaveLayout?.();
    };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      } else if (e.key === "Escape") {
        input.value = session.name;
        input.blur();
      }
    });
  }

  private showTabContextMenu(e: MouseEvent, sessionId: string, labelEl: HTMLElement): void {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (!session) return;

    // Remove any existing context menu
    activeDocument.querySelector(".terminal-tab-context-menu")?.remove();

    // createEl on body appends immediately; the menu is fully populated within
    // this same synchronous task, so nothing unfinished ever paints.
    const menu = activeDocument.body.createDiv({ cls: "terminal-tab-context-menu" });
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;

    // Rename option
    const renameItem = menu.createDiv({ cls: "terminal-ctx-item", text: "Rename" });
    renameItem.addEventListener("click", () => {
      menu.remove();
      this.renameTab(sessionId, labelEl);
    });

    // Pin / Unpin option
    const pinItem = menu.createDiv({
      cls: "terminal-ctx-item",
      text: session.pinned ? "Unpin" : "Pin",
    });
    pinItem.addEventListener("click", () => {
      session.pinned = !session.pinned;
      this.renderTabBar();
      menu.remove();
    });

    // Color submenu
    menu.createDiv({ cls: "terminal-ctx-item terminal-ctx-color-label", text: "Color" });
    const colorRow = menu.createDiv({ cls: "terminal-ctx-color-row" });

    for (const c of this.settings.tabColors) {
      const swatch = colorRow.createDiv({ cls: "terminal-ctx-swatch" });
      if (c.value) {
        swatch.style.background = c.value;
      } else {
        swatch.classList.add("terminal-ctx-swatch-none");
      }
      if (session.color === c.value) {
        swatch.classList.add("active");
      }
      swatch.title = c.name;
      swatch.addEventListener("click", () => {
        session.color = c.value;
        // Picking a new color reapplies the session theme so a tinted
        // background reflects the new swatch immediately.
        session.terminal.options.theme = resolveSessionTheme(session, this.settings, this.themeRegistry);
        this.renderTabBar();
        this.requestSaveLayout?.();
        menu.remove();
      });
    }

    // Close on click outside
    const close = (evt: MouseEvent) => {
      if (!menu.contains(evt.target as Node)) {
        menu.remove();
        activeDocument.removeEventListener("click", close, true);
      }
    };
    window.setTimeout(() => activeDocument.addEventListener("click", close, true), 0);
  }

  updateBackgroundColor(): void {
    for (const session of this.sessions) {
      session.terminal.options.theme = resolveSessionTheme(session, this.settings, this.themeRegistry);
    }
  }

  /** Re-apply the full theme to all sessions (used when Obsidian switches dark/light). */
  updateTheme(): void {
    const isDark = isObsidianDark();
    for (const session of this.sessions) {
      session.terminal.options.theme = resolveSessionTheme(session, this.settings, this.themeRegistry);

      // Notify child apps that opted into Mode 2031 color-scheme-change updates
      if (session.mode2031) {
        const mode = isDark ? 1 : 2; // 1 = dark, 2 = light
        session.pty.write(`${ESC}[?997;${mode}n`);
      }
    }
  }

  updateCopyOnSelect(): void {
    // no-op: onSelectionChange listeners read this.settings.copyOnSelect at call time
  }

  updateLineHeight(): void {
    for (const session of this.sessions) {
      session.terminal.options.lineHeight = this.settings.lineHeight;
    }
  }

  private renderTabBar(): void {
    this.tabBarEl.empty();

    for (const session of this.sessions) {
      const classes = ["terminal-tab"];
      if (session.id === this.activeId) classes.push("active");
      if (session.pinned) classes.push("terminal-tab--pinned");
      if (session.color) classes.push("terminal-tab--colored");
      const tab = this.tabBarEl.createDiv({ cls: classes.join(" ") });

      // Tab color drives two CSS variables. All visual rules (border + tinted
      // fill across idle/hover/active states) live in styles.css so we don't
      // hardcode opacity values here.
      if (session.color) {
        tab.style.setProperty("--tab-accent", session.color);
        const def = findTabColor(this.settings.tabColors, session.color);
        tab.style.setProperty("--tab-color-intensity", String(def?.tintStrength ?? DEFAULT_TINT_STRENGTH));
      }

      const label = tab.createSpan({ cls: "terminal-tab-label", text: session.name });
      tab.addEventListener("click", () => this.switchTab(session.id));
      tab.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showTabContextMenu(e, session.id, label);
      });

      if (session.pinned) {
        tab.createSpan({ cls: "terminal-tab-pin-icon", text: "\u{1F512}" });
      }

      if (!session.pinned) {
        const closeBtn = tab.createSpan({ cls: "terminal-tab-close", text: "×" });
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.closeTab(session.id);
        });
      }

      if (this.sessions.length > 1) {
        tab.draggable = true;

        tab.addEventListener("dragstart", (e) => {
          this.dragSrcId = session.id;
          tab.classList.add("dragging");
          e.dataTransfer?.setDragImage(tab, 0, 0);
        });

        tab.addEventListener("dragend", () => {
          this.dragSrcId = null;
          tab.classList.remove("dragging");
          this.tabBarEl.querySelectorAll(".drag-over").forEach((el) =>
            el.classList.remove("drag-over")
          );
        });

        tab.addEventListener("dragover", (e) => {
          e.preventDefault();
          if (this.dragSrcId && this.dragSrcId !== session.id) {
            tab.classList.add("drag-over");
          }
        });

        tab.addEventListener("dragleave", () => {
          tab.classList.remove("drag-over");
        });

        tab.addEventListener("drop", (e) => {
          e.preventDefault();
          tab.classList.remove("drag-over");
          if (!this.dragSrcId || this.dragSrcId === session.id) return;
          const srcIndex = this.sessions.findIndex((s) => s.id === this.dragSrcId);
          const dstIndex = this.sessions.findIndex((s) => s.id === session.id);
          if (srcIndex === -1 || dstIndex === -1) return;
          const [moved] = this.sessions.splice(srcIndex, 1);
          this.sessions.splice(dstIndex, 0, moved);
          this.renderTabBar();
        });
      }
    }

    const addBtn = this.tabBarEl.createDiv({ cls: "terminal-new-tab", text: "+" });
    addBtn.addEventListener("click", () => this.createTab());
  }
}
