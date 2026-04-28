import { Notice, App, FileSystemAdapter } from "obsidian";
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
import { WikiLinkAutocomplete, type AutocompleteEntry } from "./wikilink-autocomplete";

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

const ESC = "\x1b";

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

function quotePath(rawPath: string, shellPath: string): string {
  if (!rawPath.includes(" ")) return rawPath;
  const lower = shellPath.toLowerCase();
  if (lower.includes("bash") || lower.includes("zsh") || lower.includes("sh")) {
    return `'${rawPath}'`;
  }
  return `"${rawPath}"`;
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
  private readonly app: App;

  constructor(
    app: App,
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
    this.app = app;
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
      // Wiki-link autocomplete swallows navigation keys while its dropdown is open.
      const s = this.sessions.find((s) => s.id === id);
      if (s?.autocomplete?.handleKey(e)) return false;

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

    // Resolves the string written to the PTY when the user accepts a suggestion.
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

    const autocomplete = this.settings.wikiLinkAutocomplete
      ? new WikiLinkAutocomplete(
          this.app,
          terminal,
          (d: string) => pty.write(d),
          containerEl,
          resolveInsertion,
        )
      : null;

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
      autocomplete,
    };
    this.sessions.push(session);
    this.switchTab(id);
    this.renderTabBar();
    this.requestSaveLayout?.();

    // Fresh new tabs (no persisted buffer, no saved resumeCommand) inherit the
    // global startup command. Restored sessions keep their own resumeCommand.
    if (!session.resumeCommand && !opts?.bufferSerial && this.settings.startupCommand) {
      session.resumeCommand = this.settings.startupCommand;
    }

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

      // Wire data: xterm -> PTY. Autocomplete may consume data (returns true) to
      // prevent keypress-echoed chars from reaching the PTY while active.
      terminal.onData((data: string) => {
        if (!session.autocomplete?.handleData(data)) pty.write(data);
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

    session.autocomplete?.dispose();

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
