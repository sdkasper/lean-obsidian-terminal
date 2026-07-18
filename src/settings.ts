import {
  App,
  ColorComponent,
  DropdownComponent,
  Notice,
  Platform,
  PluginSettingTab,
  requireApiVersion,
  Setting,
  setIcon,
  type ButtonComponent,
  type SettingDefinitionItem,
  type SettingGroupItem,
  type SliderComponent,
} from "obsidian";
import type TerminalPlugin from "./main";
import type { RecentSession, SavedViewState } from "./session-state";
import {
  DEFAULT_TAB_COLORS,
  DEFAULT_TINT_STRENGTH,
  MAX_TINT_STRENGTH,
  type TabColorDef,
} from "./tab-colors";

export type NotificationSound = "beep" | "chime" | "ping" | "pop";

/**
 * How an accepted wiki-link suggestion is written to the shell.
 * - "wikilink": classic `[[Note Name]]` (default, vault-friendly).
 * - "vault-path": vault-relative path (`Folder/Note.md`), for tools that resolve from the vault root.
 * - "absolute-path": absolute filesystem path. Useful when piping to CLI tools (Claude Code,
 *   ripgrep, cat, etc.) that expect a real file path argument rather than a wikilink.
 */
export type WikiLinkInsertMode = "wikilink" | "vault-path" | "absolute-path";

export type CursorStyle = "block" | "bar" | "underline";

export interface TerminalPluginSettings {
  shellPath: string;      // legacy — kept for migration, not surfaced in UI
  shellPathWin: string;
  shellPathMac: string;
  shellPathLinux: string;
  startupCommand: string;
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  theme: string;
  backgroundColor: string;
  cursorBlink: boolean;
  cursorStyle: CursorStyle;
  copyOnSelect: boolean;
  scrollback: number;
  ribbonIcon: string;
  defaultLocation: "bottom" | "right" | "tab" | "split-right";
  notifyOnCompletion: boolean;
  notificationSound: NotificationSound;
  notificationVolume: number;
  searchShortcut: string;
  persistBuffer: boolean;
  recentSessionsMax: number;
  recentSessions: RecentSession[];
  // Claude Code integration — all gated on enableClaudeIntegration
  enableClaudeIntegration: boolean;
  claudeSessionsDir: string;
  claudeRegistryPath: string;
  claudeSessionsMax: number;
  tabColorTintsBackground: boolean;
  tabColors: TabColorDef[];
  tabBarPosition: "top" | "left" | "right";
  wikiLinkAutocomplete: boolean;
  wikiLinkInsertMode: WikiLinkInsertMode;
  readlineShortcuts: boolean;
  /** Saved by closeTerminal(); restored by activateTerminal(). Cleared after restore. */
  lastViewState?: SavedViewState;
}

export const DEFAULT_SETTINGS: TerminalPluginSettings = {
  shellPath: "",
  shellPathWin: "",
  shellPathMac: "",
  shellPathLinux: "",
  startupCommand: "",
  fontSize: 14,
  fontFamily: "Menlo, Monaco, 'Courier New', monospace",
  lineHeight: 1.0,
  theme: "auto",
  backgroundColor: "",
  cursorBlink: true,
  cursorStyle: "block",
  copyOnSelect: false,
  scrollback: 5000,
  ribbonIcon: "terminal",
  defaultLocation: "bottom",
  notifyOnCompletion: false,
  notificationSound: "beep",
  notificationVolume: 50,
  searchShortcut: "Ctrl+Alt+F",
  persistBuffer: true,
  recentSessionsMax: 10,
  recentSessions: [],
  enableClaudeIntegration: false,
  claudeSessionsDir: "",
  claudeRegistryPath: "claude-sessions.md",
  claudeSessionsMax: 25,
  tabColorTintsBackground: true,
  tabColors: DEFAULT_TAB_COLORS.map((c) => ({ ...c })),
  tabBarPosition: "top",
  wikiLinkAutocomplete: false,
  wikiLinkInsertMode: "wikilink",
  readlineShortcuts: true,
};

export function resolveShellPath(settings: TerminalPluginSettings): string {
  if (Platform.isWin) return settings.shellPathWin || settings.shellPath;
  if (Platform.isMacOS) return settings.shellPathMac || settings.shellPath;
  return settings.shellPathLinux || settings.shellPath;
}

export class TerminalSettingTab extends PluginSettingTab {
  plugin: TerminalPlugin;
  private pendingNewColorName = "";
  private pendingNewColorHex = "#888888";

  constructor(app: App, plugin: TerminalPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /**
   * Feature-detected access to SettingTab APIs that only exist on Obsidian
   * 1.13+. The structural cast keeps the calls honest on older runtimes
   * (undefined check instead of a crash) while manifest minAppVersion is
   * below 1.13.
   */
  private modernTab(): { update?: () => void; refreshDomState?: () => void } {
    return this;
  }

  /** Re-render the tab: declaratively on Obsidian 1.13+, imperatively before that. */
  private refresh(): void {
    const modern = this.modernTab();
    if (modern.update) {
      modern.update.call(this);
    } else {
      this.renderImperative();
    }
  }

  /**
   * Style a button as destructive. setDestructive() only exists on Obsidian
   * 1.13+; setWarning() is its pre-1.13 equivalent (deprecated in 1.13).
   * Feature-detected through a structural type so neither the unsupported
   * nor the deprecated symbol is referenced directly.
   */
  private applyDestructiveStyle(btn: ButtonComponent): void {
    const style = btn as unknown as { setDestructive?: () => unknown; setWarning?: () => unknown };
    if (requireApiVersion("1.13.0") && style.setDestructive) {
      style.setDestructive.call(btn);
    } else {
      style.setWarning?.call(btn);
    }
  }

  /**
   * Pre-1.13 Obsidian does not show the slider value inline, so the tooltip
   * (setDynamicTooltip, deprecated in 1.13) is the only way to surface it
   * there. No-op on 1.13+ where the value is always shown.
   */
  private applyLegacySliderTooltip(slider: SliderComponent): void {
    if (requireApiVersion("1.13.0")) return;
    const legacy = slider as unknown as { setDynamicTooltip?: () => unknown };
    legacy.setDynamicTooltip?.call(slider);
  }

  private binaryStatusDesc(): string {
    const bm = this.plugin.binaryManager;
    const { platform, arch } = bm.getPlatformInfo();
    const version = bm.getVersion();
    const status = bm.getStatus();
    if (status === "ready") return `node-pty v${version} installed - ${platform}-${arch}`;
    if (status === "error") return `Error: ${bm.getStatusMessage()}`;
    if (status === "downloading") return `Downloading… ${bm.getStatusMessage()}`;
    return `Not installed - ${platform}-${arch}`;
  }

  private paletteIntroText(): string {
    return (
      "Palette shown in each tab's right-click menu. Built-in colors keep their name and hex, but their tint can be adjusted. Custom colors below can be fully edited (name, hex, tint) or deleted. Tint strength is per-color (0-" +
      MAX_TINT_STRENGTH +
      "%) so each color can be dialed to stay readable in the CLI it gets paired with."
    );
  }

  /**
   * Declarative settings for Obsidian 1.13+ (rendering and settings search).
   * On older versions this method is never called and display() below renders
   * the tab imperatively - keep both in sync when adding or changing a setting.
   * Complex rows are shared with display() via the build*Row helpers.
   */
  getSettingDefinitions(): SettingDefinitionItem[] {
    const settings = () => this.plugin.settings;
    const tintOn = () => settings().tabColorTintsBackground;
    const claudeOn = () => settings().enableClaudeIntegration;
    const shellPathDesc =
      "Leave empty to auto-detect. Separate paths let you switch devices without reconfiguring.";

    return [
      {
        type: "group",
        heading: "Terminal binary",
        items: [
          { name: `Lean Obsidian Terminal v${this.plugin.manifest.version}`, searchable: false },
          { name: "Status", desc: this.binaryStatusDesc(), searchable: false },
          {
            name: "Download binaries",
            desc: "Download platform-specific node-pty binaries from GitHub",
            render: (setting) => this.buildDownloadRow(setting),
          },
          {
            name: "Remove binaries",
            desc: "Delete downloaded node-pty binaries",
            render: (setting) => this.buildRemoveRow(setting),
          },
        ],
      },
      {
        type: "group",
        heading: "Behavior",
        items: [
          {
            name: "Shell path (Windows)",
            desc: shellPathDesc,
            control: { type: "text", key: "shellPathWin", placeholder: "Auto-detect" },
          },
          {
            name: "Shell path (macOS)",
            desc: shellPathDesc,
            control: { type: "text", key: "shellPathMac", placeholder: "Auto-detect" },
          },
          {
            name: "Shell path (Linux)",
            desc: shellPathDesc,
            control: { type: "text", key: "shellPathLinux", placeholder: "Auto-detect" },
          },
          {
            name: "Startup command",
            desc: "Run this command automatically when a new terminal tab opens (e.g. claude, npm run dev)",
            control: { type: "text", key: "startupCommand", placeholder: "None" },
          },
          {
            name: "Default location",
            desc: "Where to open the first terminal view",
            control: {
              type: "dropdown",
              key: "defaultLocation",
              options: {
                bottom: "Split tab bottom",
                right: "Right panel",
                tab: "New tab",
                "split-right": "Split vertical",
              },
            },
          },
          {
            name: "Copy on select",
            desc: "Automatically copy selected text to the clipboard",
            control: { type: "toggle", key: "copyOnSelect" },
          },
          {
            name: "Scrollback lines",
            control: {
              type: "number",
              key: "scrollback",
              min: 1,
              step: 1,
              validate: (value) =>
                Number.isInteger(value) && value > 0 ? undefined : "Enter a positive whole number.",
            },
          },
          {
            name: "Search shortcut",
            desc: "Keyboard shortcut to open the in-terminal search bar. Avoid shortcuts already bound in Obsidian's hotkeys (e.g. Ctrl+Shift+F). Use Ctrl+Alt+F or similar.",
            control: { type: "text", key: "searchShortcut", placeholder: "Ctrl+Alt+F" },
          },
          {
            name: "Wiki-link autocomplete",
            desc: "Type [[ in the terminal to open a dropdown of vault notes. Applies to newly opened tabs.",
            control: { type: "toggle", key: "wikiLinkAutocomplete" },
          },
          {
            name: "Wiki-link insertion format",
            desc: "What to write when you accept a suggestion. Use a path mode to hand off to CLI tools (Claude Code, ripgrep, cat) that expect a file path instead of [[Note]].",
            visible: () => settings().wikiLinkAutocomplete,
            control: {
              type: "dropdown",
              key: "wikiLinkInsertMode",
              options: {
                wikilink: "Wiki-link ([[Note]])",
                "vault-path": "Vault-relative path (Folder/Note.md)",
                "absolute-path": "Absolute path",
              },
            },
          },
          {
            name: "Readline shortcuts",
            desc:
              "Enable Ctrl+K (kill to end), Ctrl+U (kill to start), Ctrl+W (kill word), " +
              "Ctrl+E (end of line), Ctrl+L (clear screen). Applies to all open and new tabs.",
            control: { type: "toggle", key: "readlineShortcuts" },
          },
        ],
      },
      {
        type: "group",
        heading: "Appearance",
        items: [
          {
            name: "Font size",
            desc: "Terminal font size in pixels (8-32)",
            control: { type: "slider", key: "fontSize", min: 8, max: 32, step: 1 },
          },
          {
            name: "Font family",
            control: { type: "text", key: "fontFamily" },
          },
          {
            name: "Line height",
            desc: "Terminal line height multiplier (default 1.0)",
            control: {
              type: "slider",
              key: "lineHeight",
              min: 1.0,
              max: 2.0,
              step: 0.05,
              displayFormat: (value) => value.toFixed(2),
            },
          },
          {
            name: "Icon",
            desc: 'Lucide icon name for the ribbon and tab (e.g. "terminal", "code-2", "zap"). Browse icons at lucide.dev.',
            render: (setting) => this.buildIconRow(setting),
          },
          {
            name: "Cursor blink",
            control: { type: "toggle", key: "cursorBlink" },
          },
          {
            name: "Cursor style",
            desc: "Shape of the terminal cursor. Applies to newly opened tabs.",
            control: {
              type: "dropdown",
              key: "cursorStyle",
              options: { block: "Block", bar: "Bar ( | )", underline: "Underline ( _ )" },
            },
          },
          {
            name: "Background color",
            desc: "Override the theme background. Leave empty for theme default.",
            render: (setting) => this.buildBackgroundRow(setting),
          },
          {
            name: "Theme",
            desc: "Color scheme for the terminal. Add custom themes by editing themes.json in the plugin folder.",
            render: (setting) => this.buildThemeRow(setting),
          },
          {
            name: "Tab bar position",
            desc: "Position of the tab bar within the terminal panel.",
            control: {
              type: "dropdown",
              key: "tabBarPosition",
              options: { top: "Top", left: "Left", right: "Right" },
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Tab colors",
        items: [
          {
            name: "Tab color tints terminal background",
            desc: "Mix a colored tab's swatch into the terminal background. Per-color tint strength is configured below.",
            control: { type: "toggle", key: "tabColorTintsBackground" },
          },
          { name: "", desc: this.paletteIntroText(), searchable: false, visible: tintOn },
          ...settings()
            .tabColors.filter((color) => color.value)
            .map(
              (color): SettingGroupItem => ({
                name: color.name,
                desc: color.builtin ? `${color.value} - built-in` : color.value,
                searchable: false,
                visible: tintOn,
                render: (setting) => this.buildTabColorRow(setting, color),
              }),
            ),
          {
            name: "Add custom color",
            searchable: false,
            visible: tintOn,
            render: (setting) => this.buildAddColorRow(setting),
          },
          {
            name: "",
            searchable: false,
            visible: tintOn,
            render: (setting) => this.buildResetPaletteRow(setting),
          },
        ],
      },
      {
        type: "group",
        heading: "Notifications",
        items: [
          {
            name: "Notify on command completion",
            desc: "Play a sound and show a notice when a command finishes in a background tab",
            control: { type: "toggle", key: "notifyOnCompletion" },
          },
          {
            name: "Notification sound",
            desc: "Sound to play when a background command finishes",
            control: {
              type: "dropdown",
              key: "notificationSound",
              options: { beep: "Beep", chime: "Chime", ping: "Ping", pop: "Pop" },
            },
          },
          {
            name: "Notification volume",
            desc: "Volume for the notification sound (0–100)",
            control: { type: "slider", key: "notificationVolume", min: 0, max: 100, step: 1 },
          },
        ],
      },
      {
        type: "group",
        heading: "Session persistence",
        items: [
          {
            name: "Persist terminal buffer",
            desc: "Save scrollback history across restarts so restored tabs show prior output. Disable to reduce workspace.json size.",
            control: { type: "toggle", key: "persistBuffer" },
          },
          {
            name: "Recent sessions to keep",
            desc: 'When a tab is closed, its state is kept for rescue via "restore recent terminal session". Set to 0 to disable.',
            control: {
              type: "number",
              key: "recentSessionsMax",
              min: 0,
              step: 1,
              validate: (value) =>
                Number.isInteger(value) && value >= 0 ? undefined : "Enter a whole number of 0 or more.",
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Claude Code integration",
        items: [
          {
            name: "Enable Claude Code integration",
            desc: "Detect Claude sessions, register a uri handler for in-app resume links, and show Claude sessions in the restore picker.",
            control: { type: "toggle", key: "enableClaudeIntegration" },
          },
          {
            name: "Claude sessions directory",
            desc: "Path to your Claude Code sessions folder. Example: /Users/yourname/.claude/projects (macOS/Linux) or C:\\Users\\yourname\\.claude\\projects (Windows). Leave empty to disable session history.",
            visible: claudeOn,
            control: { type: "text", key: "claudeSessionsDir", placeholder: "~/.claude/projects" },
          },
          {
            name: "Registry note path",
            desc: "Vault-relative path to the auto-generated Claude sessions registry note. Created on first refresh.",
            visible: claudeOn,
            control: { type: "text", key: "claudeRegistryPath", placeholder: "claude-sessions.md" },
          },
          {
            name: "Registry sessions to keep",
            desc: "Maximum number of most-recent Claude sessions to list in the registry note and picker. Older sessions remain accessible via /resume.",
            visible: claudeOn,
            control: {
              type: "number",
              key: "claudeSessionsMax",
              min: 1,
              step: 1,
              validate: (value) =>
                Number.isInteger(value) && value > 0 ? undefined : "Enter a positive whole number.",
            },
          },
        ],
      },
    ];
  }

  /**
   * Persist a declarative control change through the plugin's settings flow,
   * mirroring the transforms and side effects of the imperative onChange
   * handlers in display().
   */
  async setControlValue(key: string, value: unknown): Promise<void> {
    // Input transforms (parity with the display() onChange handlers).
    if (key === "searchShortcut" && typeof value === "string") {
      value = value.trim() || DEFAULT_SETTINGS.searchShortcut;
    } else if (key === "claudeSessionsDir" && typeof value === "string") {
      value = value.trim();
    } else if (key === "claudeRegistryPath" && typeof value === "string") {
      value = value.trim() || DEFAULT_SETTINGS.claudeRegistryPath;
    } else if (key === "lineHeight" && typeof value === "number") {
      value = Math.round(value * 100) / 100;
    }

    // Number controls can emit NaN from a cleared input; never persist that.
    if (
      (key === "scrollback" || key === "recentSessionsMax" || key === "claudeSessionsMax") &&
      (typeof value !== "number" || !Number.isFinite(value))
    ) {
      return;
    }

    (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;

    if (
      key === "recentSessionsMax" &&
      typeof value === "number" &&
      this.plugin.settings.recentSessions.length > value
    ) {
      this.plugin.settings.recentSessions.splice(value);
    }

    await this.plugin.saveSettings();

    // Side effects (parity with the display() onChange handlers).
    switch (key) {
      case "copyOnSelect":
        this.plugin.updateCopyOnSelect();
        break;
      case "lineHeight":
        this.plugin.updateLineHeight();
        break;
      case "tabBarPosition":
        this.plugin.updateTabBarPosition();
        break;
      case "tabColorTintsBackground":
        this.plugin.updateTerminalBackgrounds();
        this.modernTab().refreshDomState?.();
        break;
      case "wikiLinkAutocomplete":
      case "enableClaudeIntegration":
        this.modernTab().refreshDomState?.();
        break;
    }
  }

  private renderTabColorsSection(container: HTMLElement): void {
    container.createDiv({
      cls: "setting-item-description",
      text: this.paletteIntroText(),
    });

    for (const color of this.plugin.settings.tabColors) {
      if (!color.value) continue; // skip "None"
      const row = new Setting(container);
      row.nameEl.createSpan({ text: color.name });
      row.setDesc(color.builtin ? `${color.value} - built-in` : color.value);
      this.buildTabColorRow(row, color);
    }

    this.buildAddColorRow(new Setting(container).setName("Add custom color"));
    this.buildResetPaletteRow(new Setting(container));
  }

  private buildResetPaletteRow(setting: Setting): void {
    setting.addButton((btn) => {
      this.applyDestructiveStyle(btn);
      btn
        .setButtonText("Reset palette to defaults")
        .onClick(async () => {
          this.plugin.settings.tabColors = DEFAULT_TAB_COLORS.map((c) => ({ ...c }));
          await this.plugin.saveSettings();
          this.plugin.updateTerminalBackgrounds();
          this.refresh();
        });
    });
  }

  /** Adds the swatch and edit controls for one palette color. The row's name
   *  and description are set by the caller (or the declarative framework). */
  private buildTabColorRow(row: Setting, color: TabColorDef): void {
    const swatch = row.nameEl.createSpan({ cls: "lean-color-swatch" });
    swatch.style.background = color.value;
    row.nameEl.prepend(swatch);

    if (!color.builtin) {
      row.addText((text) => {
        text
          .setPlaceholder("Name")
          .setValue(color.name)
          .onChange(async (value) => {
            const trimmed = value.trim();
            if (!trimmed) return;
            if (
              this.plugin.settings.tabColors.some((c) => c !== color && c.name === trimmed)
            ) {
              return;
            }
            color.name = trimmed;
            await this.plugin.saveSettings();
          });
        text.inputEl.addEventListener("blur", () => this.refresh());
      });

      row.addColorPicker((picker) =>
        picker.setValue(color.value).onChange(async (value) => {
          color.value = value;
          await this.plugin.saveSettings();
          this.plugin.updateTerminalBackgrounds();
          swatch.style.background = value;
        }),
      );
    }

    row.addSlider((slider) => {
      this.applyLegacySliderTooltip(slider);
      slider
        .setLimits(0, MAX_TINT_STRENGTH, 1)
        .setValue(color.tintStrength)
        .onChange(async (value) => {
          color.tintStrength = value;
          await this.plugin.saveSettings();
          this.plugin.updateTerminalBackgrounds();
        });
    });

    if (color.builtin) {
      row.addButton((btn) =>
        btn
          .setButtonText("Reset")
          .setTooltip("Reset tint to default")
          .onClick(async () => {
            color.tintStrength = DEFAULT_TINT_STRENGTH;
            await this.plugin.saveSettings();
            this.plugin.updateTerminalBackgrounds();
            this.refresh();
          }),
      );
    } else {
      row.addExtraButton((btn) =>
        btn
          .setIcon("trash")
          .setTooltip("Delete color")
          .onClick(async () => {
            this.plugin.settings.tabColors = this.plugin.settings.tabColors.filter(
              (c) => c !== color,
            );
            await this.plugin.saveSettings();
            this.plugin.updateTerminalBackgrounds();
            this.refresh();
          }),
      );
    }
  }

  /** Adds the name/color/add controls for the add-custom-color row. The row's
   *  name is set by the caller (or the declarative framework). */
  private buildAddColorRow(setting: Setting): void {
    setting.addText((text) =>
      text
        .setPlaceholder("Name")
        .setValue(this.pendingNewColorName)
        .onChange((value) => {
          this.pendingNewColorName = value;
        }),
    );

    setting.addColorPicker((picker) =>
      picker.setValue(this.pendingNewColorHex).onChange((value) => {
        this.pendingNewColorHex = value;
      }),
    );

    setting.addButton((btn) =>
      btn
        .setButtonText("Add")
        .setCta()
        .onClick(async () => {
          const name = this.pendingNewColorName.trim();
          if (!name) {
            new Notice("Color name is required.");
            return;
          }
          if (this.plugin.settings.tabColors.some((c) => c.name === name)) {
            new Notice("A color with that name already exists.");
            return;
          }
          this.plugin.settings.tabColors.push({
            name,
            value: this.pendingNewColorHex,
            tintStrength: DEFAULT_TINT_STRENGTH,
            builtin: false,
          });
          this.pendingNewColorName = "";
          this.pendingNewColorHex = "#888888";
          await this.plugin.saveSettings();
          this.refresh();
        }),
    );
  }

  private buildDownloadRow(setting: Setting): void {
    const bm = this.plugin.binaryManager;
    const status = bm.getStatus();
    setting.addButton((btn) => {
      btn
        .setButtonText(status === "downloading" ? "Downloading…" : "Download")
        .setDisabled(status === "ready" || status === "downloading")
        .onClick(async () => {
          btn.setButtonText("Downloading…");
          btn.setDisabled(true);
          try {
            await bm.download();
            new Notice("Terminal binaries installed successfully.");
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            new Notice(`Failed to download binaries: ${msg}`);
          }
          this.refresh();
        });
    });
  }

  private buildRemoveRow(setting: Setting): void {
    const bm = this.plugin.binaryManager;
    setting.addButton((btn) => {
      btn
        .setButtonText("Remove")
        .setDisabled(bm.getStatus() !== "ready")
        .onClick(() => {
          bm.remove();
          new Notice("Terminal binaries removed.");
          this.refresh();
        });
    });
  }

  private renderBinarySection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Terminal binary").setHeading();

    new Setting(containerEl)
      .setName(`Lean Obsidian Terminal v${this.plugin.manifest.version}`);

    new Setting(containerEl).setName("Status").setDesc(this.binaryStatusDesc());

    this.buildDownloadRow(
      new Setting(containerEl)
        .setName("Download binaries")
        .setDesc("Download platform-specific node-pty binaries from GitHub"),
    );

    this.buildRemoveRow(
      new Setting(containerEl)
        .setName("Remove binaries")
        .setDesc("Delete downloaded node-pty binaries"),
    );
  }

  private renderBehaviorSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Behavior").setHeading();

    new Setting(containerEl)
      .setName("Shell path (Windows)")
      .setDesc("Leave empty to auto-detect. Separate paths let you switch devices without reconfiguring.")
      .addText((text) =>
        text
          .setPlaceholder("Auto-detect")
          .setValue(this.plugin.settings.shellPathWin)
          .onChange(async (value) => {
            this.plugin.settings.shellPathWin = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Shell path (macOS)")
      .setDesc("Leave empty to auto-detect. Separate paths let you switch devices without reconfiguring.")
      .addText((text) =>
        text
          .setPlaceholder("Auto-detect")
          .setValue(this.plugin.settings.shellPathMac)
          .onChange(async (value) => {
            this.plugin.settings.shellPathMac = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Shell path (Linux)")
      .setDesc("Leave empty to auto-detect. Separate paths let you switch devices without reconfiguring.")
      .addText((text) =>
        text
          .setPlaceholder("Auto-detect")
          .setValue(this.plugin.settings.shellPathLinux)
          .onChange(async (value) => {
            this.plugin.settings.shellPathLinux = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Startup command")
      .setDesc("Run this command automatically when a new terminal tab opens (e.g. claude, npm run dev)")
      .addText((text) =>
        text
          .setPlaceholder("None")
          .setValue(this.plugin.settings.startupCommand)
          .onChange(async (value) => {
            this.plugin.settings.startupCommand = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default location")
      .setDesc("Where to open the first terminal view")
      .addDropdown((dropdown) => {
        dropdown.addOption("bottom", "Split tab bottom");
        dropdown.addOption("right", "Right panel");
        dropdown.addOption("tab", "New tab");
        dropdown.addOption("split-right", "Split vertical");
        dropdown.setValue(this.plugin.settings.defaultLocation);
        dropdown.onChange(async (value: string) => {
          this.plugin.settings.defaultLocation = value as TerminalPluginSettings["defaultLocation"];
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Copy on select")
      .setDesc("Automatically copy selected text to the clipboard")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.copyOnSelect).onChange(async (value) => {
          this.plugin.settings.copyOnSelect = value;
          await this.plugin.saveSettings();
          this.plugin.updateCopyOnSelect();
        })
      );

    new Setting(containerEl)
      .setName("Scrollback lines")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.scrollback))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.scrollback = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Search shortcut")
      .setDesc("Keyboard shortcut to open the in-terminal search bar. Avoid shortcuts already bound in Obsidian's hotkeys (e.g. Ctrl+Shift+F). Use Ctrl+Alt+F or similar.")
      .addText((text) =>
        text
          .setPlaceholder("Ctrl+Alt+F")
          .setValue(this.plugin.settings.searchShortcut)
          .onChange(async (value) => {
            this.plugin.settings.searchShortcut = value.trim() || "Ctrl+Alt+F";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Wiki-link autocomplete")
      .setDesc(
        "Type [[ in the terminal to open a dropdown of vault notes. Applies to newly opened tabs.",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.wikiLinkAutocomplete).onChange(async (value) => {
          this.plugin.settings.wikiLinkAutocomplete = value;
          await this.plugin.saveSettings();
          this.refresh();
        }),
      );

    if (this.plugin.settings.wikiLinkAutocomplete) {
      new Setting(containerEl)
        .setName("Wiki-link insertion format")
        .setDesc(
          "What to write when you accept a suggestion. Use a path mode to hand off to CLI tools (Claude Code, ripgrep, cat) that expect a file path instead of [[Note]].",
        )
        .addDropdown((dropdown) => {
          dropdown.addOption("wikilink", "Wiki-link ([[Note]])");
          dropdown.addOption("vault-path", "Vault-relative path (Folder/Note.md)");
          dropdown.addOption("absolute-path", "Absolute path");
          dropdown.setValue(this.plugin.settings.wikiLinkInsertMode);
          dropdown.onChange(async (value: string) => {
            this.plugin.settings.wikiLinkInsertMode = value as WikiLinkInsertMode;
            await this.plugin.saveSettings();
          });
        });
    }

    new Setting(containerEl)
      .setName("Readline shortcuts")
      .setDesc(
        "Enable Ctrl+K (kill to end), Ctrl+U (kill to start), Ctrl+W (kill word), " +
        "Ctrl+E (end of line), Ctrl+L (clear screen). Applies to all open and new tabs.",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.readlineShortcuts).onChange(async (value) => {
          this.plugin.settings.readlineShortcuts = value;
          await this.plugin.saveSettings();
        }),
      );
  }

  private buildIconRow(iconSetting: Setting): void {
    let previewEl: HTMLElement | null = null;

    iconSetting.addText((text) => {
      text
        .setValue(this.plugin.settings.ribbonIcon)
        .onChange(async (value) => {
          const name = value.trim();
          this.plugin.settings.ribbonIcon = name;
          await this.plugin.saveSettings();
          this.plugin.updateIcon(name);
          if (previewEl) setIcon(previewEl, name || "terminal");
        });
    });

    previewEl = iconSetting.controlEl.createSpan({ cls: "lean-terminal-icon-preview" });
    setIcon(previewEl, this.plugin.settings.ribbonIcon);

    iconSetting.addButton((btn) => {
      btn.setButtonText("Reset").onClick(async () => {
        this.plugin.settings.ribbonIcon = DEFAULT_SETTINGS.ribbonIcon;
        await this.plugin.saveSettings();
        this.plugin.updateIcon(DEFAULT_SETTINGS.ribbonIcon);
        this.refresh();
      });
    });
  }

  private buildBackgroundRow(bgSetting: Setting): void {
    let bgTextInput: HTMLInputElement;
    let bgColorPicker: ColorComponent | undefined;

    bgSetting.addText((text) => {
      bgTextInput = text.inputEl;
      text
        .setPlaceholder("Theme default")
        .setValue(this.plugin.settings.backgroundColor)
        .onChange(async (value) => {
          this.plugin.settings.backgroundColor = value;
          if (/^#[0-9a-fA-F]{6}$/.test(value) && bgColorPicker) {
            bgColorPicker.setValue(value);
          }
          await this.plugin.saveSettings();
          this.plugin.updateTerminalBackgrounds();
        });
    });

    bgSetting.addColorPicker((picker) => {
      bgColorPicker = picker;
      const current = this.plugin.settings.backgroundColor;
      if (/^#[0-9a-fA-F]{6}$/.test(current)) {
        picker.setValue(current);
      }
      picker.onChange(async (value) => {
        this.plugin.settings.backgroundColor = value;
        if (bgTextInput) bgTextInput.value = value;
        await this.plugin.saveSettings();
        this.plugin.updateTerminalBackgrounds();
      });
    });

    bgSetting.addButton((btn) => {
      btn.setButtonText("Reset").onClick(async () => {
        this.plugin.settings.backgroundColor = "";
        if (bgTextInput) bgTextInput.value = "";
        if (bgColorPicker) bgColorPicker.setValue("#000000");
        await this.plugin.saveSettings();
        this.plugin.updateTerminalBackgrounds();
      });
    });
  }

  private buildThemeRow(themeSetting: Setting): void {
    let themeDropdown: DropdownComponent | undefined;

    themeSetting.addDropdown((dropdown) => {
      themeDropdown = dropdown;
      dropdown.addOption("auto", "Auto (follow Obsidian)");
      for (const name of this.plugin.themeRegistry.getNames()) {
        dropdown.addOption(name, name);
      }
      dropdown.setValue(this.plugin.settings.theme);
      dropdown.onChange(async (value) => {
        this.plugin.settings.theme = value;
        await this.plugin.saveSettings();
        this.plugin.updateTerminalBackgrounds();
      });
    });

    themeSetting.addButton((btn) => {
      btn
        .setButtonText("Open themes folder")
        .setTooltip("Open the plugin folder so you can create or edit themes.json")
        .onClick(async () => {
          // Inline type: electron isn't declared as a dependency, so typeof import("electron") doesn't resolve.
          const { shell } = window.require("electron") as {
            shell: { openPath: (path: string) => Promise<string> };
          };
          await shell.openPath(this.plugin.themeRegistry.getPluginDir());
        });
    });

    themeSetting.addButton((btn) => {
      btn
        .setButtonText("Reload themes")
        .setTooltip("Re-read themes.json and refresh the list")
        .onClick(async () => {
          await this.plugin.themeRegistry.load();

          // The `if` guard is defensive — the addDropdown callback runs
          // synchronously above, so themeDropdown is always assigned before
          // this handler can fire.
          if (themeDropdown) {
            themeDropdown.selectEl.empty();
            for (const name of this.plugin.themeRegistry.getNames()) {
              themeDropdown.addOption(name, name);
            }

            const current = this.plugin.settings.theme;
            const available = this.plugin.themeRegistry.getNames();
            if (current === "auto" || available.includes(current)) {
              themeDropdown.setValue(current);
            } else {
              this.plugin.settings.theme = "obsidian-dark";
              await this.plugin.saveSettings();
              themeDropdown.setValue("obsidian-dark");
            }
          }

          this.plugin.updateTerminalBackgrounds();

          const count = this.plugin.themeRegistry.getNames().length;
          const errors = this.plugin.themeRegistry.getUserLoadErrors();
          if (errors.length === 0) {
            new Notice(`Lean Terminal: Themes reloaded (${count} total).`);
          }
          // If there were errors, the registry's load() already showed its own Notice.
        });
    });
  }

  private renderAppearanceSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Appearance").setHeading();

    new Setting(containerEl)
      .setName("Font size")
      .setDesc("Terminal font size in pixels (8-32)")
      .addSlider((slider) => {
        this.applyLegacySliderTooltip(slider);
        slider
          .setLimits(8, 32, 1)
          .setValue(this.plugin.settings.fontSize)
          .onChange(async (value) => {
            this.plugin.settings.fontSize = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Font family")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.fontFamily)
          .onChange(async (value) => {
            this.plugin.settings.fontFamily = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Line height")
      .setDesc("Terminal line height multiplier (default 1.0)")
      .addSlider((slider) => {
        this.applyLegacySliderTooltip(slider);
        slider
          .setLimits(1.0, 2.0, 0.05)
          .setValue(this.plugin.settings.lineHeight)
          .onChange(async (value) => {
            this.plugin.settings.lineHeight = Math.round(value * 100) / 100;
            await this.plugin.saveSettings();
            this.plugin.updateLineHeight();
          });
      });

    this.buildIconRow(
      new Setting(containerEl)
        .setName("Icon")
        .setDesc("Lucide icon name for the ribbon and tab (e.g. \"terminal\", \"code-2\", \"zap\"). Browse icons at lucide.dev."),
    );

    new Setting(containerEl)
      .setName("Cursor blink")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.cursorBlink).onChange(async (value) => {
          this.plugin.settings.cursorBlink = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Cursor style")
      .setDesc("Shape of the terminal cursor. Applies to newly opened tabs.")
      .addDropdown((dropdown) => {
        dropdown.addOption("block", "Block");
        dropdown.addOption("bar", "Bar ( | )");
        dropdown.addOption("underline", "Underline ( _ )");
        dropdown.setValue(this.plugin.settings.cursorStyle);
        dropdown.onChange(async (value: string) => {
          this.plugin.settings.cursorStyle = value as CursorStyle;
          await this.plugin.saveSettings();
        });
      });

    this.buildBackgroundRow(
      new Setting(containerEl)
        .setName("Background color")
        .setDesc("Override the theme background. Leave empty for theme default."),
    );

    this.buildThemeRow(
      new Setting(containerEl)
        .setName("Theme")
        .setDesc(
          "Color scheme for the terminal. Add custom themes by editing themes.json in the plugin folder."
        ),
    );
  }

  private renderTabBarSection(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName("Tab bar position")
      .setDesc("Position of the tab bar within the terminal panel.")
      .addDropdown((dropdown) => {
        dropdown.addOption("top", "Top");
        dropdown.addOption("left", "Left");
        dropdown.addOption("right", "Right");
        dropdown.setValue(this.plugin.settings.tabBarPosition);
        dropdown.onChange(async (value: string) => {
          this.plugin.settings.tabBarPosition = value as "top" | "left" | "right";
          await this.plugin.saveSettings();
          this.plugin.updateTabBarPosition();
        });
      });

    new Setting(containerEl).setName("Tab colors").setHeading();

    new Setting(containerEl)
      .setName("Tab color tints terminal background")
      .setDesc("Mix a colored tab's swatch into the terminal background. Per-color tint strength is configured below.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.tabColorTintsBackground).onChange(async (value) => {
          this.plugin.settings.tabColorTintsBackground = value;
          await this.plugin.saveSettings();
          this.plugin.updateTerminalBackgrounds();
          this.refresh();
        }),
      );

    if (this.plugin.settings.tabColorTintsBackground) {
      this.renderTabColorsSection(containerEl);
    }
  }

  private renderNotificationsSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Notifications").setHeading();

    new Setting(containerEl)
      .setName("Notify on command completion")
      .setDesc("Play a sound and show a notice when a command finishes in a background tab")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.notifyOnCompletion).onChange(async (value) => {
          this.plugin.settings.notifyOnCompletion = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Notification sound")
      .setDesc("Sound to play when a background command finishes")
      .addDropdown((dropdown) => {
        dropdown.addOption("beep", "Beep");
        dropdown.addOption("chime", "Chime");
        dropdown.addOption("ping", "Ping");
        dropdown.addOption("pop", "Pop");
        dropdown.setValue(this.plugin.settings.notificationSound);
        dropdown.onChange(async (value: string) => {
          this.plugin.settings.notificationSound = value as NotificationSound;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Notification volume")
      .setDesc("Volume for the notification sound (0–100)")
      .addSlider((slider) => {
        this.applyLegacySliderTooltip(slider);
        slider
          .setLimits(0, 100, 1)
          .setValue(this.plugin.settings.notificationVolume)
          .onChange(async (value) => {
            this.plugin.settings.notificationVolume = value;
            await this.plugin.saveSettings();
          });
      });
  }

  private renderPersistenceSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Session persistence").setHeading();

    new Setting(containerEl)
      .setName("Persist terminal buffer")
      .setDesc(
        "Save scrollback history across restarts so restored tabs show prior output. Disable to reduce workspace.json size."
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.persistBuffer).onChange(async (value) => {
          this.plugin.settings.persistBuffer = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Recent sessions to keep")
      .setDesc(
        "When a tab is closed, its state is kept for rescue via \"restore recent terminal session\". Set to 0 to disable."
      )
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.recentSessionsMax))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num >= 0) {
              this.plugin.settings.recentSessionsMax = num;
              if (this.plugin.settings.recentSessions.length > num) {
                this.plugin.settings.recentSessions.splice(num);
              }
              await this.plugin.saveSettings();
            }
          })
      );
  }

  private renderClaudeSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Claude Code integration").setHeading();

    new Setting(containerEl)
      .setName("Enable Claude Code integration")
      .setDesc(
        "Detect Claude sessions, register a uri handler for in-app resume links, and show Claude sessions in the restore picker."
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableClaudeIntegration).onChange(async (value) => {
          this.plugin.settings.enableClaudeIntegration = value;
          await this.plugin.saveSettings();
          this.refresh();
        })
      );

    if (this.plugin.settings.enableClaudeIntegration) {
      new Setting(containerEl)
        .setName("Claude sessions directory")
        .setDesc(
          "Path to your Claude Code sessions folder. Example: /Users/yourname/.claude/projects (macOS/Linux) or C:\\Users\\yourname\\.claude\\projects (Windows). Leave empty to disable session history."
        )
        .addText((text) =>
          text
            .setPlaceholder("~/.claude/projects")
            .setValue(this.plugin.settings.claudeSessionsDir)
            .onChange(async (value) => {
              this.plugin.settings.claudeSessionsDir = value.trim();
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Registry note path")
        .setDesc(
          "Vault-relative path to the auto-generated Claude sessions registry note. Created on first refresh."
        )
        .addText((text) =>
          text
            .setPlaceholder("claude-sessions.md")
            .setValue(this.plugin.settings.claudeRegistryPath)
            .onChange(async (value) => {
              this.plugin.settings.claudeRegistryPath = value.trim() || "claude-sessions.md";
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Registry sessions to keep")
        .setDesc(
          "Maximum number of most-recent Claude sessions to list in the registry note and picker. Older sessions remain accessible via /resume."
        )
        .addText((text) =>
          text
            .setValue(String(this.plugin.settings.claudeSessionsMax))
            .onChange(async (value) => {
              const num = parseInt(value, 10);
              if (!isNaN(num) && num > 0) {
                this.plugin.settings.claudeSessionsMax = num;
                await this.plugin.saveSettings();
              }
            })
        );
    }
  }

  display(): void {
    this.renderImperative();
  }

  private renderImperative(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.renderBinarySection(containerEl);
    this.renderBehaviorSection(containerEl);
    this.renderAppearanceSection(containerEl);
    this.renderTabBarSection(containerEl);
    this.renderNotificationsSection(containerEl);
    this.renderPersistenceSection(containerEl);
    this.renderClaudeSection(containerEl);
  }
}
