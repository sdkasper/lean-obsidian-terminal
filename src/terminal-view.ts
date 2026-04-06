import { FileSystemAdapter, ItemView, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_TERMINAL } from "./constants";
import { TerminalTabManager } from "./terminal-tab-manager";
import type TerminalPlugin from "./main";

export class TerminalView extends ItemView {
  private plugin: TerminalPlugin;
  private tabManager: TerminalTabManager | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;

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
      tabBarEl,
      terminalHostEl,
      this.plugin.settings,
      cwd,
      pluginDir,
      this.plugin.binaryManager,
      undefined,
      () => this.leaf.detach()
    );
    this.tabManager.createTab();

    // Resize observer for auto-fit
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        this.tabManager?.fitActive();
      }, 50);
    });
    this.resizeObserver.observe(terminalHostEl);
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

  updateTheme(): void {
    this.tabManager?.updateTheme();
  }
}
