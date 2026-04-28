import { FileSystemAdapter, ItemView, WorkspaceLeaf, type ViewStateResult } from "obsidian";
import { VIEW_TYPE_TERMINAL } from "./constants";
import { TerminalTabManager } from "./terminal-tab-manager";
import { pushRecentSession } from "./recent-sessions";
import type TerminalPlugin from "./main";
import type { SavedViewState } from "./session-state";

export class TerminalView extends ItemView {
  private plugin: TerminalPlugin;
  private tabManager: TerminalTabManager | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * State passed to setState() before onOpen() has constructed the tab manager.
   * Applied in onOpen() once the manager is ready.
   */
  private pendingState: SavedViewState | null = null;

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

  // eslint-disable-next-line @typescript-eslint/require-await -- onOpen must satisfy Promise<void> return type of parent ItemView; no actual async work here
  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("terminal-view-container");

    // Tab bar
    const tabBarEl = container.createDiv({ cls: "terminal-tab-bar" });

    // Terminal host (all session containers go here)
    const terminalHostEl = container.createDiv({ cls: "terminal-host" });

    // Determine CWD — vault root
    let cwd: string;
    try {
      cwd = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
    } catch {
      cwd = process.cwd();
    }

    // Resolve plugin directory for native module loading
    const path = window.require("path") as typeof import("path");
    const pluginDir = path.join(
      (this.plugin.app.vault.adapter as FileSystemAdapter).getBasePath(),
      this.plugin.app.vault.configDir, "plugins", this.plugin.manifest.id
    );

    // Create tab manager and first terminal
    this.tabManager = new TerminalTabManager(
      this.app,
      tabBarEl,
      terminalHostEl,
      this.plugin.settings,
      cwd,
      pluginDir,
      this.plugin.binaryManager,
      this.plugin.themeRegistry,
      undefined,
      () => this.leaf.detach(),
      () => { void this.app.workspace.requestSaveLayout(); },
      (tab) => { void pushRecentSession(this.plugin, tab); }
    );

    if (this.pendingState) {
      // setState already fired (edge case) — apply its state
      this.applyPendingState();
    } else if (!parseSavedViewState(this.leaf.getViewState().state)) {
      // No saved state incoming — create a default tab.
      // (If saved state IS incoming, setState will fire next and own tab creation.)
      this.tabManager.createTab();
    }

    // Resize observer for auto-fit
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        this.tabManager?.fitActive();
      }, 50);
    });
    this.resizeObserver.observe(terminalHostEl);

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

  // eslint-disable-next-line @typescript-eslint/require-await -- onClose must satisfy Promise<void> return type of parent ItemView; no actual async work here
  async onClose(): Promise<void> {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();
    this.tabManager?.destroyAll();
    this.tabManager = null;
  }

  createNewTab(): void {
    this.tabManager?.createTab();
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

  // eslint-disable-next-line @typescript-eslint/require-await -- async required by parent View.setState signature; restore is synchronous
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
      });
    }

    if (state.activeIndex >= 0) {
      this.tabManager.switchToIndex(state.activeIndex);
    }
  }
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
  return { tabs: s.tabs, activeIndex };
}
