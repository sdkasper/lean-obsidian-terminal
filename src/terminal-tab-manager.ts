import { Notice } from "obsidian";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { PtyManager } from "./pty-manager";
import { getTheme } from "./themes";
import type { TerminalPluginSettings } from "./settings";
import type { NotificationSound } from "./settings";
import type { BinaryManager } from "./binary-manager";

export const TAB_COLORS = [
  { name: "None", value: "" },
  { name: "Red", value: "#e54d4d" },
  { name: "Orange", value: "#e8a838" },
  { name: "Yellow", value: "#e5d74e" },
  { name: "Green", value: "#4ec955" },
  { name: "Blue", value: "#4e9de5" },
  { name: "Purple", value: "#b04ee5" },
] as const;

export interface TerminalSession {
  id: string;
  name: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  pty: PtyManager;
  containerEl: HTMLElement;
  color: string;
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

export class TerminalTabManager {
  private sessions: TerminalSession[] = [];
  private activeId: string | null = null;
  private tabBarEl: HTMLElement;
  private terminalHostEl: HTMLElement;
  private settings: TerminalPluginSettings;
  private cwd: string;
  private pluginDir: string;
  private binaryManager: BinaryManager;
  private onActiveChange?: () => void;
  private onTabsEmpty?: () => void;
  private dragSrcId: string | null = null;

  constructor(
    tabBarEl: HTMLElement,
    terminalHostEl: HTMLElement,
    settings: TerminalPluginSettings,
    cwd: string,
    pluginDir: string,
    binaryManager: BinaryManager,
    onActiveChange?: () => void,
    onTabsEmpty?: () => void
  ) {
    this.tabBarEl = tabBarEl;
    this.terminalHostEl = terminalHostEl;
    this.settings = settings;
    this.cwd = cwd;
    this.pluginDir = pluginDir;
    this.binaryManager = binaryManager;
    this.onActiveChange = onActiveChange;
    this.onTabsEmpty = onTabsEmpty;
  }

  createTab(): TerminalSession {
    sessionCounter++;
    const id = `terminal-${sessionCounter}`;
    const name = `Terminal ${sessionCounter}`;

    // Create container for this session
    const containerEl = this.terminalHostEl.createDiv({ cls: "terminal-session" });

    // Create xterm.js instance
    const theme = getTheme(this.settings.theme);
    if (this.settings.backgroundColor) {
      theme.background = this.settings.backgroundColor;
    }
    const terminal = new Terminal({
      fontSize: this.settings.fontSize,
      fontFamily: this.settings.fontFamily,
      cursorBlink: this.settings.cursorBlink,
      scrollback: this.settings.scrollback,
      allowProposedApi: true,
      theme,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const unicode11Addon = new Unicode11Addon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(unicode11Addon);
    terminal.unicode.activeVersion = "11";
    terminal.open(containerEl);

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
      id, name, terminal, fitAddon, pty, containerEl, color: "",
    };
    this.sessions.push(session);
    this.switchTab(id);
    this.renderTabBar();

    // Defer PTY spawn until DOM is laid out so fitAddon gets correct dimensions
    setTimeout(() => {
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
        pty.spawn(this.settings.shellPath, this.cwd, cols, rows);
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
  }

  closeTab(id: string): void {
    const idx = this.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return;

    const session = this.sessions[idx];
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

  destroyAll(): void {
    for (const session of this.sessions) {
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

    for (const c of TAB_COLORS) {
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
        this.renderTabBar();
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
    const theme = getTheme(this.settings.theme);
    if (this.settings.backgroundColor) {
      theme.background = this.settings.backgroundColor;
    }
    for (const session of this.sessions) {
      session.terminal.options.theme = { ...session.terminal.options.theme, background: theme.background };
    }
  }

  private renderTabBar(): void {
    this.tabBarEl.empty();

    for (const session of this.sessions) {
      const tab = this.tabBarEl.createDiv({
        cls: `terminal-tab${session.id === this.activeId ? " active" : ""}`,
      });

      // Apply tab color as left border + active highlight
      if (session.color) {
        tab.style.borderLeft = `3px solid ${session.color}`;
        tab.style.setProperty("--tab-accent", session.color);
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
