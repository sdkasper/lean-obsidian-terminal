import { App, ColorComponent, DropdownComponent, Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import type TerminalPlugin from "./main";
import type { RecentSession } from "./session-state";
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

export interface TerminalPluginSettings {
  shellPath: string;
  startupCommand: string;
  fontSize: number;
  fontFamily: string;
  theme: string;
  backgroundColor: string;
  cursorBlink: boolean;
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
  claudeRegistryPath: string;
  claudeSessionsMax: number;
  tabColorTintsBackground: boolean;
  tabColors: TabColorDef[];
  wikiLinkAutocomplete: boolean;
  wikiLinkInsertMode: WikiLinkInsertMode;
}

export const DEFAULT_SETTINGS: TerminalPluginSettings = {
  shellPath: "",
  startupCommand: "",
  fontSize: 14,
  fontFamily: "Menlo, Monaco, 'Courier New', monospace",
  theme: "obsidian-dark",
  backgroundColor: "",
  cursorBlink: true,
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
  claudeRegistryPath: "claude-sessions.md",
  claudeSessionsMax: 25,
  tabColorTintsBackground: true,
  tabColors: DEFAULT_TAB_COLORS.map((c) => ({ ...c })),
  wikiLinkAutocomplete: false,
  wikiLinkInsertMode: "wikilink",
};

export class TerminalSettingTab extends PluginSettingTab {
  plugin: TerminalPlugin;
  private pendingNewColorName = "";
  private pendingNewColorHex = "#888888";

  constructor(app: App, plugin: TerminalPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private renderTabColorsSection(container: HTMLElement): void {
    container.createDiv({
      cls: "setting-item-description",
      text:
        "Palette shown in each tab's right-click menu. Built-in colors keep their name and hex, but their tint can be adjusted. Custom colors below can be fully edited (name, hex, tint) or deleted. Tint strength is per-color (0-" +
        MAX_TINT_STRENGTH +
        "%) so each color can be dialed to stay readable in the CLI it gets paired with.",
    });

    for (const color of this.plugin.settings.tabColors) {
      if (!color.value) continue; // skip "None"
      this.renderTabColorRow(container, color);
    }

    this.renderAddColorRow(container);

    new Setting(container)
      .addButton((btn) =>
        btn
          .setButtonText("Reset palette to defaults")
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.tabColors = DEFAULT_TAB_COLORS.map((c) => ({ ...c }));
            await this.plugin.saveSettings();
            this.plugin.updateTerminalBackgrounds();
            this.display();
          }),
      );
  }

  private renderTabColorRow(container: HTMLElement, color: TabColorDef): void {
    const row = new Setting(container);

    const swatch = row.nameEl.createSpan({ cls: "lean-color-swatch" });
    swatch.style.background = color.value;
    row.nameEl.createSpan({ text: color.name });
    row.setDesc(color.builtin ? `${color.value} - built-in` : color.value);

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
        text.inputEl.addEventListener("blur", () => this.display());
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

    row.addSlider((slider) =>
      slider
        .setLimits(0, MAX_TINT_STRENGTH, 1)
        .setValue(color.tintStrength)
        .setDynamicTooltip()
        .onChange(async (value) => {
          color.tintStrength = value;
          await this.plugin.saveSettings();
          this.plugin.updateTerminalBackgrounds();
        }),
    );

    if (color.builtin) {
      row.addButton((btn) =>
        btn
          .setButtonText("Reset")
          .setTooltip("Reset tint to default")
          .onClick(async () => {
            color.tintStrength = DEFAULT_TINT_STRENGTH;
            await this.plugin.saveSettings();
            this.plugin.updateTerminalBackgrounds();
            this.display();
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
            this.display();
          }),
      );
    }
  }

  private renderAddColorRow(container: HTMLElement): void {
    const setting = new Setting(container).setName("Add custom color");

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
          this.display();
        }),
    );
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // --- Terminal binary ---
    new Setting(containerEl).setName("Terminal binary").setHeading();

    new Setting(containerEl)
      .setName(`Lean Obsidian Terminal v${this.plugin.manifest.version}`);

    const bm = this.plugin.binaryManager;
    const { platform, arch } = bm.getPlatformInfo();
    const version = bm.getVersion();
    const status = bm.getStatus();

    let statusDesc: string;
    if (status === "ready") {
      statusDesc = `node-pty v${version} installed - ${platform}-${arch}`;
    } else if (status === "error") {
      statusDesc = `Error: ${bm.getStatusMessage()}`;
    } else if (status === "downloading") {
      statusDesc = `Downloading… ${bm.getStatusMessage()}`;
    } else {
      statusDesc = `Not installed - ${platform}-${arch}`;
    }

    new Setting(containerEl).setName("Status").setDesc(statusDesc);

    new Setting(containerEl)
      .setName("Download binaries")
      .setDesc("Download platform-specific node-pty binaries from GitHub")
      .addButton((btn) => {
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
            this.display();
          });
      });

    new Setting(containerEl)
      .setName("Remove binaries")
      .setDesc("Delete downloaded node-pty binaries")
      .addButton((btn) => {
        btn
          .setButtonText("Remove")
          .setDisabled(status !== "ready")
          .onClick(() => {
            bm.remove();
            new Notice("Terminal binaries removed.");
            this.display();
          });
      });

    // --- Behavior ---
    new Setting(containerEl).setName("Behavior").setHeading();

    new Setting(containerEl)
      .setName("Shell path")
      .setDesc("Leave empty to auto-detect your default shell")
      .addText((text) =>
        text
          .setPlaceholder("Auto-detect")
          .setValue(this.plugin.settings.shellPath)
          .onChange(async (value) => {
            this.plugin.settings.shellPath = value;
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
          this.display();
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

    // --- Appearance ---
    new Setting(containerEl).setName("Appearance").setHeading();

    new Setting(containerEl)
      .setName("Font size")
      .setDesc("Terminal font size in pixels (8-32)")
      .addSlider((slider) =>
        slider
          .setLimits(8, 32, 1)
          .setValue(this.plugin.settings.fontSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.fontSize = value;
            await this.plugin.saveSettings();
          })
      );

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

    const iconSetting = new Setting(containerEl)
      .setName("Icon")
      .setDesc("Lucide icon name for the ribbon and tab (e.g. \"terminal\", \"code-2\", \"zap\"). Browse icons at lucide.dev.");

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
        this.display();
      });
    });

    new Setting(containerEl)
      .setName("Cursor blink")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.cursorBlink).onChange(async (value) => {
          this.plugin.settings.cursorBlink = value;
          await this.plugin.saveSettings();
        })
      );

    const bgSetting = new Setting(containerEl)
      .setName("Background color")
      .setDesc("Override the theme background. Leave empty for theme default.");

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

    let themeDropdown: DropdownComponent | undefined;

    const themeSetting = new Setting(containerEl)
      .setName("Theme")
      .setDesc(
        "Color scheme for the terminal. Add custom themes by editing themes.json in the plugin folder."
      );

    themeSetting.addDropdown((dropdown) => {
      themeDropdown = dropdown;
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
            if (available.includes(current)) {
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

    // --- Tab colors ---
    new Setting(containerEl).setName("Tab colors").setHeading();

    new Setting(containerEl)
      .setName("Tab color tints terminal background")
      .setDesc("Mix a colored tab's swatch into the terminal background. Per-color tint strength is configured below.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.tabColorTintsBackground).onChange(async (value) => {
          this.plugin.settings.tabColorTintsBackground = value;
          await this.plugin.saveSettings();
          this.plugin.updateTerminalBackgrounds();
          this.display();
        }),
      );

    if (this.plugin.settings.tabColorTintsBackground) {
      this.renderTabColorsSection(containerEl);
    }

    // --- Notifications ---
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
      .addSlider((slider) =>
        slider
          .setLimits(0, 100, 1)
          .setValue(this.plugin.settings.notificationVolume)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.notificationVolume = value;
            await this.plugin.saveSettings();
          })
      );

    // --- Session persistence ---
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
                this.plugin.settings.recentSessions.length = num;
              }
              await this.plugin.saveSettings();
            }
          })
      );

    // --- Claude code integration ---
    new Setting(containerEl).setName("Claude code integration").setHeading();

    new Setting(containerEl)
      .setName("Enable Claude code integration")
      .setDesc(
        "Detect Claude sessions, register a uri handler for in-app resume links, and show Claude sessions in the restore picker."
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableClaudeIntegration).onChange(async (value) => {
          this.plugin.settings.enableClaudeIntegration = value;
          await this.plugin.saveSettings();
          this.display();
        })
      );

    if (this.plugin.settings.enableClaudeIntegration) {
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
}
