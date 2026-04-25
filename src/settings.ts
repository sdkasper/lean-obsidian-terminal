import { App, ColorComponent, DropdownComponent, Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import type TerminalPlugin from "./main";
import {
  DEFAULT_TAB_COLORS,
  DEFAULT_TINT_STRENGTH,
  MAX_TINT_STRENGTH,
  type TabColorDef,
} from "./tab-colors";

export type NotificationSound = "beep" | "chime" | "ping" | "pop";

export interface TerminalPluginSettings {
  shellPath: string;
  fontSize: number;
  fontFamily: string;
  theme: string;
  backgroundColor: string;
  cursorBlink: boolean;
  copyOnSelect: boolean;
  scrollback: number;
  ribbonIcon: string;
  defaultLocation: "right" | "bottom";
  notifyOnCompletion: boolean;
  notificationSound: NotificationSound;
  notificationVolume: number;
  searchShortcut: string;
  tabColorTintsBackground: boolean;
  tabColors: TabColorDef[];
}

export const DEFAULT_SETTINGS: TerminalPluginSettings = {
  shellPath: "",
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
  tabColorTintsBackground: true,
  tabColors: DEFAULT_TAB_COLORS.map((c) => ({ ...c })),
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
    new Setting(container).setName("Tab colors").setHeading();

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
      row.addText((text) =>
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
          }),
      );

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

    // --- Binary Management ---
    new Setting(containerEl).setName("Terminal binary").setHeading();

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
      statusDesc = `Downloading\u2026 ${bm.getStatusMessage()}`;
    } else {
      statusDesc = `Not installed - ${platform}-${arch}`;
    }

    new Setting(containerEl).setName("Status").setDesc(statusDesc);

    new Setting(containerEl)
      .setName("Download binaries")
      .setDesc("Download platform-specific node-pty binaries from GitHub")
      .addButton((btn) => {
        btn
          .setButtonText(status === "downloading" ? "Downloading\u2026" : "Download")
          .setDisabled(status === "ready" || status === "downloading")
          .onClick(async () => {
            btn.setButtonText("Downloading\u2026");
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

    // --- Appearance & Behavior ---
    new Setting(containerEl).setName("Appearance & behavior").setHeading();

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
      .setName("Font size")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.fontSize))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.fontSize = num;
              await this.plugin.saveSettings();
            }
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

          // Repopulate dropdown options in place.
          // The `if` guard is defensive — the addDropdown callback runs
          // synchronously above, so themeDropdown is always assigned before
          // this handler can fire.
          if (themeDropdown) {
            themeDropdown.selectEl.empty();
            for (const name of this.plugin.themeRegistry.getNames()) {
              themeDropdown.addOption(name, name);
            }

            // Keep current selection if still valid, else fall back to obsidian-dark
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
          // Sync color picker if value is a valid hex color
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

    new Setting(containerEl)
      .setName("Tab color tints terminal background")
      .setDesc("Mix a colored tab's swatch into the terminal background. Per-color tint strength is configured below.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.tabColorTintsBackground).onChange(async (value) => {
          this.plugin.settings.tabColorTintsBackground = value;
          await this.plugin.saveSettings();
          this.plugin.updateTerminalBackgrounds();
        }),
      );

    this.renderTabColorsSection(containerEl);

    new Setting(containerEl)
      .setName("Cursor blink")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.cursorBlink).onChange(async (value) => {
          this.plugin.settings.cursorBlink = value;
          await this.plugin.saveSettings();
        })
      );

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
      .setName("Default location")
      .setDesc("Where to open new terminal panels")
      .addDropdown((dropdown) => {
        dropdown.addOption("bottom", "Bottom");
        dropdown.addOption("right", "Right");
        dropdown.setValue(this.plugin.settings.defaultLocation);
        dropdown.onChange(async (value: string) => {
          this.plugin.settings.defaultLocation = value as "right" | "bottom";
          await this.plugin.saveSettings();
        });
      });

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
      .setDesc("Volume for the notification sound (0\u2013100)")
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

    // --- About ---
    new Setting(containerEl).setName("About").setHeading();

    new Setting(containerEl)
      .setName("Plugin version")
      .setDesc(`Lean Obsidian Terminal v${this.plugin.manifest.version}`);
  }
}
