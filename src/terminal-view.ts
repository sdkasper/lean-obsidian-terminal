import { FileSystemAdapter, ItemView, WorkspaceLeaf, type ViewStateResult } from "obsidian";
import { VIEW_TYPE_TERMINAL } from "./constants";
import { TerminalTabManager, type TabManagerOptions, type CreateTabOpts } from "./terminal-tab-manager";
import { pushRecentSession } from "./recent-sessions";
import { requireNode, nodeProcess } from "./node-api";
import type TerminalPlugin from "./main";
import type { SavedViewState, SavedTab } from "./session-state";

export class TerminalView extends ItemView {
  private plugin: TerminalPlugin;
  private tabManager: TerminalTabManager | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeTimer: number | null = null;
  private viewContainer: HTMLElement | null = null;
  /**
   * State passed to setState() before onOpen() has constructed the tab manager.
   * Applied in onOpen() once the manager is ready.
   */
  private pendingState: SavedViewState | null = null;
  /** Tracks whether this leaf is currently active. */
  private isActive = false;

  constructor(leaf: WorkspaceLeaf, plugin: TerminalPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_TERMINAL;
  }

  getDisplayText(): string {
    return "Terminal";
  }

  getIcon(): string {
    return this.plugin.settings.ribbonIcon;
  }

  // async: satisfies ItemView.onOpen() → Promise<void>; no actual async work here
  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("terminal-view-container");
    this.viewContainer = container;
    this.applyTabBarPosition();

    // Tab bar
    const tabBarEl = container.createDiv({ cls: "terminal-tab-bar" });

    // Terminal host (all session containers go here)
    const terminalHostEl = container.createDiv({ cls: "terminal-host" });

    // Determine CWD — vault root
    let cwd: string;
    try {
      cwd = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
    } catch {
      cwd = nodeProcess.cwd();
    }

    // Resolve plugin directory for native module loading
    const path = requireNode("path");
    const pluginDir = path.join(
      (this.plugin.app.vault.adapter as FileSystemAdapter).getBasePath(),
      this.plugin.app.vault.configDir, "plugins", this.plugin.manifest.id
    );

    // Create tab manager and first terminal
    const tabManagerOpts: TabManagerOptions = {
      app: this.app,
      tabBarEl,
      terminalHostEl,
      settings: this.plugin.settings,
      cwd,
      pluginDir,
      binaryManager: this.plugin.binaryManager,
      themeRegistry: this.plugin.themeRegistry,
      keyHandlers: this.plugin.keyHandlerRegistry,
      onTabsEmpty: () => this.leaf.detach(),
      requestSaveLayout: () => { void this.app.workspace.requestSaveLayout(); },
      onSessionClose: (tab) => { void pushRecentSession(this.plugin, tab); },
    };
    this.tabManager = new TerminalTabManager(tabManagerOpts);

    if (this.pendingState) {
      // setState already fired (edge case) — apply its state
      this.applyPendingState();
    } else if (!parseSavedViewState(this.leaf.getViewState().state)) {
      // No saved state incoming — create a default tab.
      // (If saved state IS incoming, setState will fire next and own tab creation.)
      this.tabManager.createTab();
    }

    // Resize observer for auto-fit. Note: fullscreen mode in detached windows does not
    // trigger proper resize handling — content will not reflow until a command is executed.
    // This is a limitation of how Obsidian handles detached window events with xterm.js.
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeTimer) window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => {
        this.tabManager?.fitActive();
        // Only restore focus if this leaf is active; prevent stealing focus during unrelated pane resizes
        if (this.isActive) {
          this.tabManager?.focusActive();
        }
      }, 50);
    });
    this.resizeObserver.observe(terminalHostEl);

    // Restore focus when this leaf becomes active (e.g. switching from another detached window)
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        this.isActive = leaf === this.leaf;
        if (!leaf || leaf !== this.leaf) return;
        // Defer so Obsidian's own leaf-switch focus logic completes first (prevents racing command palette)
        window.setTimeout(() => this.tabManager?.focusActive(), 0);
      })
    );

    // Periodic save: every 10s, if terminal output happened since the last check,
    // trigger requestSaveLayout. This replaces per-chunk save calls that caused
    // input lag under heavy output (e.g. Claude streaming). Quit still flushes
    // via main.ts's workspace.on("quit") → requestSaveLayout.run().
    this.registerInterval(
      window.setInterval(() => {
        if (this.tabManager?.consumeOutputDirty()) {
          void this.app.workspace.requestSaveLayout();
        }
      }, 10000)
    );
  }

  // async: satisfies ItemView.onClose() → Promise<void>; no actual async work here
  async onClose(): Promise<void> {
    if (this.resizeTimer) window.clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();
    this.tabManager?.destroyAll();
    this.tabManager = null;
  }

  createNewTab(opts?: CreateTabOpts): void {
    this.tabManager?.createTab(opts);
  }

  getTabManager(): TerminalTabManager | null {
    return this.tabManager;
  }

  updateBackgroundColor(): void {
    this.tabManager?.updateBackgroundColor();
  }

  updateCopyOnSelect(): void {
    this.tabManager?.updateCopyOnSelect();
  }

  updateLineHeight(): void {
    this.tabManager?.updateLineHeight();
  }

  applyTabBarPosition(): void {
    if (!this.viewContainer) return;
    this.viewContainer.removeClass("terminal-tabs-left");
    this.viewContainer.removeClass("terminal-tabs-right");
    const pos = this.plugin.settings.tabBarPosition;
    if (pos === "left") this.viewContainer.addClass("terminal-tabs-left");
    else if (pos === "right") this.viewContainer.addClass("terminal-tabs-right");
  }

  getState(): Record<string, unknown> {
    if (!this.tabManager) {
      // Before onOpen runs (or after onClose): hand back any pending state we still have
      return this.pendingState
        ? { tabs: this.pendingState.tabs, activeIndex: this.pendingState.activeIndex }
        : {};
    }
    const state: SavedViewState = {
      tabs: this.tabManager.serializeSessions(),
      activeIndex: this.tabManager.getActiveIndex(),
    };
    return { ...state };
  }

  // async: satisfies View.setState() → Promise<void>; restore is synchronous
  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    result.history = false;
    const parsed = parseSavedViewState(state);
    if (!parsed) return;

    this.pendingState = parsed;
    if (!this.tabManager) return;

    // setState is authoritative: if any tabs exist (e.g. a default tab created
    // by onOpen before the getViewState peek detected incoming state), replace them.
    // Pass saveToRecents=false — the default tab had no user activity.
    if (this.tabManager.getSessions().length > 0) {
      this.tabManager.destroyAll(false);
    }
    this.applyPendingState();
  }

  private applyPendingState(): void {
    const state = this.pendingState;
    if (!state || !this.tabManager) return;
    this.pendingState = null;

    for (const tab of state.tabs) {
      this.tabManager.createTab({
        name: tab.name,
        color: tab.color,
        cwd: tab.cwd,
        bufferSerial: tab.bufferSerial,
        resumeCommand: tab.resumeCommand,
        pinned: tab.pinned,
      });
    }

    if (state.activeIndex >= 0) {
      this.tabManager.switchToIndex(state.activeIndex);
    }
  }
}

// UUID v4 format: validate resumeCommand matches "claude --resume <uuid>" pattern only
const RESUME_CMD_RE = /^claude --resume [0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sanitizeTab(raw: unknown): SavedTab {
  const t = (raw && typeof raw === "object" ? raw : {}) as Partial<SavedTab>;
  return {
    name: typeof t.name === "string" ? t.name : "Terminal",
    color: typeof t.color === "string" ? t.color : "",
    cwd: typeof t.cwd === "string" ? t.cwd : "",
    bufferSerial: typeof t.bufferSerial === "string" ? t.bufferSerial : undefined,
    resumeCommand: typeof t.resumeCommand === "string" && RESUME_CMD_RE.test(t.resumeCommand)
      ? t.resumeCommand
      : undefined,
    pinned: typeof t.pinned === "boolean" ? t.pinned : undefined,
  };
}

/**
 * Validate and narrow an unknown state value to SavedViewState.
 * Returns null for missing, malformed, or empty state.
 */
function parseSavedViewState(state: unknown): SavedViewState | null {
  if (!state || typeof state !== "object") return null;
  const s = state as Partial<SavedViewState>;
  if (!Array.isArray(s.tabs) || s.tabs.length === 0) return null;
  const activeIndex = typeof s.activeIndex === "number" ? s.activeIndex : 0;
  return { tabs: s.tabs.map(sanitizeTab), activeIndex };
}
