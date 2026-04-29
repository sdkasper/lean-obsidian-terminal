import { FileSystemAdapter, Plugin, WorkspaceLeaf, setIcon } from "obsidian";
import { VIEW_TYPE_TERMINAL } from "./constants";
import { TerminalView } from "./terminal-view";
import { TerminalSettingTab, DEFAULT_SETTINGS, type TerminalPluginSettings } from "./settings";
import { BinaryManager } from "./binary-manager";
import { ThemeRegistry } from "./theme-registry";
import { openRecentSessionPicker } from "./recent-sessions";
import { refreshClaudeRegistry, resumeClaudeSession } from "./claude-sessions";
import type { SavedViewState } from "./session-state";
import type { TerminalTabManager } from "./terminal-tab-manager";

export default class TerminalPlugin extends Plugin {
  settings: TerminalPluginSettings = DEFAULT_SETTINGS;
  binaryManager!: BinaryManager;
  themeRegistry!: ThemeRegistry;
  private ribbonEl: HTMLElement | null = null;
  private themeObserver: MutationObserver | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Initialize binary manager
    const path = window.require("path") as typeof import("path");
    const adapter = this.app.vault.adapter as FileSystemAdapter;
    const pluginDir = path.join(
      adapter.getBasePath(),
      this.app.vault.configDir, "plugins", this.manifest.id
    );
    this.binaryManager = new BinaryManager(pluginDir);
    this.binaryManager.checkInstalled();

    // Theme registry — loads optional themes.json from the plugin folder
    this.themeRegistry = new ThemeRegistry(pluginDir);
    await this.themeRegistry.load();

    // Register the terminal view
    this.registerView(VIEW_TYPE_TERMINAL, (leaf: WorkspaceLeaf) => {
      return new TerminalView(leaf, this);
    });

    // Ribbon icon
    this.ribbonEl = this.addRibbonIcon(this.settings.ribbonIcon, "Open terminal", () => {
      void this.activateTerminal();
    });

    // Commands
    this.addCommand({
      id: "open-terminal",
      name: "Open terminal",
      callback: () => void this.activateTerminal(),
    });

    this.addCommand({
      id: "close-terminal",
      name: "Close terminal",
      callback: () => this.closeTerminal(),
    });

    this.addCommand({
      id: "new-terminal-tab",
      name: "New terminal tab",
      callback: () => this.newTab(),
    });

    this.addCommand({
      id: "toggle-terminal",
      name: "Toggle terminal",
      callback: () => this.toggleTerminal(),
    });

    this.addCommand({
      id: "open-terminal-split",
      name: "Open terminal in new pane",
      callback: () => void this.openTerminalInNewPane(),
    });

    this.addCommand({
      id: "restore-recent-terminal-session",
      name: "Restore recent terminal session",
      callback: () => void openRecentSessionPicker(this),
    });

    this.addCommand({
      id: "refresh-claude-session-registry",
      name: "Refresh Claude session registry",
      callback: () => void refreshClaudeRegistry(this),
    });

    // Tab navigation commands
    this.addCommand({
      id: "next-terminal-tab",
      name: "Next terminal tab",
      callback: () => this.navigateTerminalTab(1),
    });

    this.addCommand({
      id: "prev-terminal-tab",
      name: "Previous terminal tab",
      callback: () => this.navigateTerminalTab(-1),
    });

    this.addCommand({
      id: "first-terminal-tab",
      name: "Go to first terminal tab",
      callback: () => {
        const mgr = this.getActiveTabManager();
        if (!mgr) return;
        mgr.switchToIndex(0);
      },
    });

    this.addCommand({
      id: "last-terminal-tab",
      name: "Go to last terminal tab",
      callback: () => {
        const mgr = this.getActiveTabManager();
        if (!mgr) return;
        mgr.switchToIndex(mgr.getSessions().length - 1);
      },
    });

    for (let i = 1; i <= 8; i++) {
      this.addCommand({
        id: `terminal-tab-${i}`,
        name: `Go to terminal tab ${i}`,
        callback: () => {
          const mgr = this.getActiveTabManager();
          if (!mgr) return;
          mgr.switchToIndex(i - 1);
        },
      });
    }

    // URI handler for clickable resume links in the registry note.
    // Gating happens inside resumeClaudeSession — the handler is always registered
    // so that flipping the setting doesn't require a plugin reload.
    this.registerObsidianProtocolHandler("lean-terminal", (params) => {
      if (params.resume) {
        void resumeClaudeSession(this, params.resume);
      }
    });

    // Settings tab
    this.addSettingTab(new TerminalSettingTab(this.app, this));

    // Flush any pending layout save before Obsidian quits. Without this, a
    // typed-then-quickly-quit scenario loses the last few seconds of activity
    // because Obsidian's requestSaveLayout is debounced.
    this.registerEvent(
      this.app.workspace.on("quit", () => {
        void this.app.workspace.requestSaveLayout.run();
      })
    );

    // Keep terminal themes in sync with Obsidian's dark/light mode toggle.
    // Only fires when the dark/light class actually flips, not on every class change.
    let lastDark = document.body.classList.contains("theme-dark");
    this.themeObserver = new MutationObserver(() => {
      const isDark = document.body.classList.contains("theme-dark");
      if (isDark === lastDark) return;
      lastDark = isDark;
      this.updateTheme();
    });
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  onunload(): void {
    this.themeObserver?.disconnect();
    this.themeObserver = null;

    // Detach after a tick to avoid disrupting the settings modal
    setTimeout(() => {
      this.app.workspace.detachLeavesOfType(VIEW_TYPE_TERMINAL);
    }, 0);
  }

  async activateTerminal(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
    if (existing.length > 0) {
      void this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    let leaf: WorkspaceLeaf | null;
    switch (this.settings.defaultLocation) {
      case "right":
        leaf = this.app.workspace.getRightLeaf(false);
        break;
      case "tab":
        leaf = this.app.workspace.getLeaf("tab");
        break;
      case "split-right":
        leaf = this.app.workspace.getLeaf("split", "vertical");
        break;
      default: // "bottom"
        leaf = this.app.workspace.getLeaf("split", "horizontal");
        break;
    }

    if (leaf) {
      const savedState = this.settings.lastViewState;
      await leaf.setViewState({
        type: VIEW_TYPE_TERMINAL,
        active: true,
        state: (savedState ?? {}) as Record<string, unknown>,
      });
      void this.app.workspace.revealLeaf(leaf);

      if (savedState) {
        this.settings.lastViewState = undefined;
        void this.saveSettings();
      }
    }
  }

  closeTerminal(): void {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
    if (leaves.length > 0) {
      const view = leaves[0].view as TerminalView;
      const state = view.getState() as Record<string, unknown>;
      if (Array.isArray(state.tabs) && state.tabs.length > 0 && typeof state.activeIndex === "number") {
        this.settings.lastViewState = state as unknown as SavedViewState;
        void this.saveSettings();
      }
    }
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_TERMINAL);
  }

  toggleTerminal(): void {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
    if (existing.length > 0) {
      this.closeTerminal();
    } else {
      void this.activateTerminal();
    }
  }

  private newTab(): void {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
    if (leaves.length > 0) {
      const view = leaves[0].view as TerminalView;
      view.createNewTab();
    } else {
      // Open terminal first, then it auto-creates a tab
      void this.activateTerminal();
    }
  }

  async openTerminalInNewPane(): Promise<void> {
    const leaf = this.app.workspace.getLeaf("split", "horizontal");
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_TERMINAL, active: true });
      void this.app.workspace.revealLeaf(leaf);
    }
  }

  private getActiveTabManager(): TerminalTabManager | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
    if (!leaves.length) return null;
    return (leaves[0].view as TerminalView).getTabManager() ?? null;
  }

  private navigateTerminalTab(delta: -1 | 1): void {
    const mgr = this.getActiveTabManager();
    if (!mgr) return;
    const count = mgr.getSessions().length;
    if (count < 2) return;
    const next = ((mgr.getActiveIndex() + delta) + count) % count;
    mgr.switchToIndex(next);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    // tabColors is the only array in settings. Object.assign is shallow,
    // so on a fresh install (data.json has no tabColors) the merged
    // settings would share the reference with DEFAULT_SETTINGS, and any
    // push/filter mutation would leak into the module-level default.
    // Deep-clone here so the default array stays immutable.
    this.settings.tabColors = this.settings.tabColors.map((c) => ({ ...c }));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  updateTerminalBackgrounds(): void {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
    for (const leaf of leaves) {
      const view = leaf.view as TerminalView;
      view.updateBackgroundColor();
    }
  }

  updateTabBarPosition(): void {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
    for (const leaf of leaves) {
      (leaf.view as TerminalView).applyTabBarPosition();
    }
  }

  updateIcon(name: string): void {
    const safeName = name || "terminal";
    if (this.ribbonEl) setIcon(this.ribbonEl, safeName);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL)) {
      // tabHeaderInnerIconEl is undocumented but stable across Obsidian versions
      const iconEl = (leaf as WorkspaceLeaf & { tabHeaderInnerIconEl?: HTMLElement }).tabHeaderInnerIconEl;
      if (iconEl) setIcon(iconEl, safeName);
    }
  }

  updateCopyOnSelect(): void {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
    for (const leaf of leaves) {
      const view = leaf.view as TerminalView;
      view.updateCopyOnSelect();
    }
  }

  updateTheme(): void {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
    for (const leaf of leaves) {
      (leaf.view as TerminalView).getTabManager()?.updateTheme();
    }
  }
}
