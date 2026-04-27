import { Notice, type App, FileSystemAdapter } from "obsidian";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SerializeAddon } from "@xterm/addon-serialize";
import type { IDisposable } from "@xterm/xterm";
import { PtyManager } from "./pty-manager";
import { isObsidianDark } from "./themes";
import { mixHex } from "./color-utils";
import { findTabColor, DEFAULT_TINT_STRENGTH, MAX_TINT_STRENGTH } from "./tab-colors";
import { ThemeRegistry } from "./theme-registry";
import type { TerminalPluginSettings, NotificationSound } from "./settings";
import type { BinaryManager } from "./binary-manager";
import type { SavedTab } from "./session-state";

const SEARCH_DECORATIONS = {
  matchBackground: "#ffff00",
  matchBorder: "#ffff00",
  matchOverviewRuler: "#ffff00",
  activeMatchBackground: "#ff6600",
  activeMatchBorder: "#ff0000",
  activeMatchColorOverviewRuler: "#ff0000",
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
}

/** Options for restoring a tab from persisted state (via setState). */
export interface CreateTabOpts {
  name?: string;
  color?: string;
  cwd?: string;
  bufferSerial?: string;
  resumeCommand?: string;
}

let sessionCounter = 0;

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
        setTimeout(() => void ctx.close(), 350);
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
        setTimeout(() => void ctx.close(), 150);
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
        setTimeout(() => void ctx.close(), 130);
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
        setTimeout(() => void ctx.close(), 200);
        break;
      }
    }
  } catch {
    // Audio not available — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Terminal color reporting helpers (OSC 10/11, Mode 2031)
// ---------------------------------------------------------------------------

const ESC = "\x1b";
const BEL = "\x07";
const HEX6_RE = /^#[0-9a-fA-F]{6}$/;

/** Convert "#RRGGBB" hex to X11 "rgb:RRRR/GGGG/BBBB" (16-bit per component). */
function hexToX11(hex: string): string {
  if (!HEX6_RE.test(hex)) return "rgb:0000/0000/0000";
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `rgb:${r}${r}/${g}${g}/${b}${b}`;
}

/** Get the effective foreground color for a session. */
function sessionForeground(session: TerminalSession): string {
  return (session.terminal.options.theme?.foreground) || "#d4d4d4";
}

/** Get the effective background color for a session. */
function sessionBackground(session: TerminalSession): string {
  return (session.terminal.options.theme?.background) || "#1e1e1e";
}

function resolveTerminalTheme(settings: TerminalPluginSettings, registry: ThemeRegistry) {
  const theme = registry.get(settings.theme);
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

/**
 * Register OSC 10/11 query handlers and Mode 2031 / CSI ?996n handlers
 * on a terminal session. Responses are written back to the PTY so the child
 * app reads them from stdin — matching real terminal behavior.
 */
function registerColorReporting(session: TerminalSession): void {
  const { terminal, pty } = session;
  const d: IDisposable[] = session.parserDisposables;

  // --- OSC 10 ; ? — query default foreground color ---
  d.push(terminal.parser.registerOscHandler(10, (data: string) => {
    if (data !== "?") return false; // not a query, let default handler run
    const color = hexToX11(sessionForeground(session));
    pty.write(`${ESC}]10;${color}${BEL}`);
    return true;
  }));

  // --- OSC 11 ; ? — query default background color ---
  d.push(terminal.parser.registerOscHandler(11, (data: string) => {
    if (data !== "?") return false;
    const color = hexToX11(sessionBackground(session));
    pty.write(`${ESC}]11;${color}${BEL}`);
    return true;
  }));

  // --- CSI ? 996 n — one-shot dark/light mode query ---
  d.push(terminal.parser.registerCsiHandler({ prefix: "?", final: "n" }, (params) => {
    if (params[0] !== 996) return false;
    const mode = isObsidianDark() ? 1 : 2; // 1 = dark, 2 = light
    pty.write(`${ESC}[?997;${mode}n`);
    return true;
  }));

  // --- CSI ? 2031 h — enable Mode 2031 (color-scheme-change notifications) ---
  d.push(terminal.parser.registerCsiHandler({ prefix: "?", final: "h" }, (params) => {
    if (params[0] !== 2031) return false;
    session.mode2031 = true;
    return true;
  }));

  // --- CSI ? 2031 l — disable Mode 2031 ---
  d.push(terminal.parser.registerCsiHandler({ prefix: "?", final: "l" }, (params) => {
    if (params[0] !== 2031) return false;
    session.mode2031 = false;
    return true;
  }));
}

function quotePath(rawPath: string, shellPath: string): string {
  if (!rawPath.includes(' ')) return rawPath;
  const lower = shellPath.toLowerCase();
  if (lower.includes('bash') || lower.includes('zsh') || lower.includes('sh')) {
    return `'${rawPath}'`;
  }
  return `"${rawPath}"`;
}

interface ElectronFile extends File { path?: string; }
interface ObsidianAppInternal extends App {
  dragManager?: { draggable?: { file?: { path: string } } };
}

function extractDropPath(e: DragEvent, app: App): string | null {
  // OS file drag via text/uri-list (file:// URLs in Electron)
  const uriList = e.dataTransfer?.getData('text/uri-list');
  if (uriList) {
    const uri = uriList.split('\n')[0].trim();
    if (uri.startsWith('file://')) {
      const path = window.require('url').fileURLToPath(uri);
      return path;
    }
  }

  // OS file drag via dataTransfer.files — use Electron webUtils (Electron 32+) with .path fallback
  if (e.dataTransfer?.files.length) {
    const file = e.dataTransfer.files[0];
    try {
      const { webUtils } = window.require('electron') as { webUtils: { getPathForFile: (file: File) => string } };
      const p = webUtils.getPathForFile(file);
      if (p) return p;
    } catch {
      const p = (file as ElectronFile).path;
      if (p) return p;
    }
  }

  // Obsidian internal file drag
  const draggable = (app as ObsidianAppInternal).dragManager?.draggable;
  if (draggable?.file) {
    const basePath = (app.vault.adapter as FileSystemAdapter).getBasePath();
    const vaultPath = draggable.file.path.split('/').join(window.require('path').sep);
    const fullPath = window.require('path').join(basePath, vaultPath);
    return fullPath;
  }

  return null;
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
  private onActiveChange?: () => void;
  private onTabsEmpty?: () => void;
  private requestSaveLayout?: () => void;
  private onSessionClose?: (tab: SavedTab) => void;
  /** Set true by any terminal write/resize; consumed by the view's periodic save timer. */
  private outputDirty = false;

  constructor(
    tabBarEl: HTMLElement,
    terminalHostEl: HTMLElement,
    settings: TerminalPluginSettings,
    cwd: string,
    pluginDir: string,
    binaryManager: BinaryManager,
    themeRegistry: ThemeRegistry,
    onActiveChange?: () => void,
    onTabsEmpty?: () => void,
    requestSaveLayout?: () => void,
    onSessionClose?: (tab: SavedTab) => void
  ) {
    this.tabBarEl = tabBarEl;
    this.terminalHostEl = terminalHostEl;
    this.settings = settings;
    this.cwd = cwd;
    this.pluginDir = pluginDir;
    this.binaryManager = binaryManager;
    this.themeRegistry = themeRegistry;
    this.onActiveChange = onActiveChange;
    this.onTabsEmpty = onTabsEmpty;
    this.requestSaveLayout = requestSaveLayout;
    this.onSessionClose = onSessionClose;
  }

  /** Capture a session's current state as a SavedTab (used on close for recents). */
  private captureSession(session: TerminalSession): SavedTab {
    return {
      name: session.name,
      color: session.color,
      cwd: session.cwd,
      bufferSerial: this.settings.persistBuffer ? session.serializeAddon.serialize() : undefined,
      resumeCommand: session.resumeCommand,
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
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let oscDisposable: { dispose: () => void } | null = null;

    const cleanup = (): void => {
      if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
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
    fallbackTimer = setTimeout(runCommand, 2000);
  }

  createTab(opts?: CreateTabOpts): TerminalSession {
    sessionCounter++;
    const id = `terminal-${sessionCounter}`;
    const name = opts?.name ?? `Terminal ${sessionCounter}`;
    const sessionCwd = opts?.cwd ?? this.cwd;

    // Create container for this session
    const containerEl = this.terminalHostEl.createDiv({ cls: "terminal-session" });

    // Create xterm.js instance
    const terminal = new Terminal({
      fontSize: this.settings.fontSize,
      fontFamily: this.settings.fontFamily,
      cursorBlink: this.settings.cursorBlink,
      scrollback: this.settings.scrollback,
      theme: resolveSessionTheme(
        { color: opts?.color ?? "" },
        this.settings,
        this.themeRegistry,
      ),
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const serializeAddon = new SerializeAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(serializeAddon);
    terminal.open(containerEl);

    // Replay prior buffer (from persisted state) before the PTY produces new output.
    // No visual marker is written — markers become part of the serialized buffer and
    // accumulate across restores.
    if (opts?.bufferSerial) {
      terminal.write(opts.bufferSerial);
    }

    // Mark "output changed since last save" so the view's periodic timer can
    // trigger a save. We avoid calling requestSaveLayout on every write because
    // heavy output (e.g. Claude streaming) caused visible input lag when every
    // chunk scheduled a debounced save-which-serializes-the-whole-buffer.
    terminal.onWriteParsed(() => { this.outputDirty = true; });
    terminal.onResize(() => { this.outputDirty = true; });

    // Intercept clipboard shortcuts — Obsidian captures them before xterm.js
    terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type !== "keydown") return true;
      const mod = e.metaKey || e.ctrlKey;

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
        navigator.clipboard.readText().then((text) => {
          if (text) {
            const s = this.sessions.find((s) => s.id === id);
            if (s) s.pty.write(text);
          }
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

    const pty = new PtyManager(this.pluginDir);
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
      pinned: false,
    };
    this.sessions.push(session);
    this.switchTab(id);
    this.renderTabBar();
    this.requestSaveLayout?.();

    // Install the auto-resume OSC listener before the PTY spawns so the first
    // prompt's OSC 133 A is caught. Any tab with a `resumeCommand` set runs it
    // once the shell is ready. Callers that don't want this just omit the field.
    if (session.resumeCommand) {
      this.setupAutoResume(session, terminal);
    }

    // Defer PTY spawn until DOM is laid out so fitAddon gets correct dimensions
    setTimeout(() => {
      // Abort if the session was destroyed while waiting (e.g. openTabOrView
      // destroy-and-recreate flow replaces a default tab during this 100ms window)
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
        terminal.write("Go to Settings \u2192 Terminal to download them.\r\n");
        return;
      }

      try {
        pty.spawn(this.settings.shellPath, sessionCwd, cols, rows);
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

      // Wire data: xterm -> PTY
      terminal.onData((data: string) => {
        pty.write(data);
      });

      pty.onExit(() => {
        this.closeTab(session.id);
      });
    }, 100);

    return session;
  }

  switchTab(id: string): void {
    this.activeId = id;

    for (const session of this.sessions) {
      if (session.id === id) {
        session.containerEl.removeClass("terminal-session-hidden");
        // Fit after showing
        setTimeout(() => {
          try {
            session.fitAddon.fit();
            session.pty.resize(session.terminal.cols, session.terminal.rows);
            session.terminal.focus();
          } catch {
            // ignore
          }
        }, 10);
      } else {
        session.containerEl.addClass("terminal-session-hidden");
      }
    }

    this.renderTabBar();
    this.onActiveChange?.();
    this.requestSaveLayout?.();
  }

  closeTab(id: string): void {
    const idx = this.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return;

    const session = this.sessions[idx];

    // Capture for recents BEFORE destroying (serialize needs a live xterm)
    this.onSessionClose?.(this.captureSession(session));

    session.pty.kill();
    session.terminal.dispose();
    session.containerEl.remove();
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
    document.querySelector(".terminal-tab-context-menu")?.remove();
    for (const session of this.sessions) {
      if (saveToRecents) {
        this.onSessionClose?.(this.captureSession(session));
      }
      session.pty.kill();
      session.terminal.dispose();
      session.containerEl.remove();
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

    const input = document.createElement("input");
    input.type = "text";
    input.value = session.name;
    input.className = "terminal-tab-rename-input";

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
    document.querySelector(".terminal-tab-context-menu")?.remove();

    const menu = document.createElement("div");
    menu.className = "terminal-tab-context-menu";
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;

    // Rename option
    const renameItem = menu.createDiv({ cls: "terminal-ctx-item", text: "Rename" });
    renameItem.addEventListener("click", () => {
      menu.remove();
      this.renameTab(sessionId, labelEl);
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

    document.body.appendChild(menu);

    // Close on click outside
    const close = (evt: MouseEvent) => {
      if (!menu.contains(evt.target as Node)) {
        menu.remove();
        document.removeEventListener("click", close, true);
      }
    };
    setTimeout(() => document.addEventListener("click", close, true), 0);
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

      const closeBtn = tab.createSpan({ cls: "terminal-tab-close", text: "\u00d7" });
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeTab(session.id);
      });
    }

    const addBtn = this.tabBarEl.createDiv({ cls: "terminal-new-tab", text: "+" });
    addBtn.addEventListener("click", () => this.createTab());
  }
}
