import { App, ColorComponent, DropdownComponent, Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import type TerminalPlugin from "./main";

export type NotificationSound = "beep" | "chime" | "ping" | "pop";

export interface TerminalPluginSettings {
  shellPath: string;
  fontSize: number;
  fontFamily: string;
  theme: string;
  backgroundColor: string;
  cursorBlink: boolean;
  scrollback: number;
  ribbonIcon: string;
  defaultLocation: "right" | "bottom";
  notifyOnCompletion: boolean;
  notificationSound: NotificationSound;
  notificationVolume: number;
}

export const DEFAULT_SETTINGS: TerminalPluginSettings = {
  shellPath: "",
  fontSize: 14,
  fontFamily: "Menlo, Monaco, 'Courier New', monospace",
  theme: "obsidian-dark",
  backgroundColor: "",
  cursorBlink: true,
  scrollback: 5000,
  ribbonIcon: "terminal",
  defaultLocation: "bottom",
  notifyOnCompletion: false,
  notificationSound: "beep",
  notificationVolume: 50,
};

export class TerminalSettingTab extends PluginSettingTab {
  plugin: TerminalPlugin;

  constructor(app: App, plugin: TerminalPlugin) {
    super(app, plugin);
    this.plugin = plugin;
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
      statusDesc = `Installed (v${version}) \u2014 ${platform}-${arch}`;
    } else if (status === "error") {
      statusDesc = `Error: ${bm.getStatusMessage()}`;
    } else if (status === "downloading") {
      statusDesc = `Downloading\u2026 ${bm.getStatusMessage()}`;
    } else {
      statusDesc = `Not installed \u2014 ${platform}-${arch}`;
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
      .setName("Cursor blink")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.cursorBlink).onChange(async (value) => {
          this.plugin.settings.cursorBlink = value;
          await this.plugin.saveSettings();
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
  }
}
