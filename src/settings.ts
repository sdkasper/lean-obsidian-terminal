import { App, Notice, PluginSettingTab, Setting, ColorComponent } from "obsidian";
import type TerminalPlugin from "./main";
import { THEME_NAMES } from "./themes";

export type NotificationSound = "beep" | "chime" | "ping" | "pop";

export interface TerminalPluginSettings {
  shellPath: string;
  fontSize: number;
  fontFamily: string;
  theme: string;
  backgroundColor: string;
  cursorBlink: boolean;
  scrollback: number;
  defaultLocation: "bottom" | "right" | "tab" | "split-right";
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

    new Setting(containerEl)
      .setName("Theme")
      .addDropdown((dropdown) => {
        for (const name of THEME_NAMES) {
          dropdown.addOption(name, name);
        }
        dropdown.setValue(this.plugin.settings.theme);
        dropdown.onChange(async (value) => {
          this.plugin.settings.theme = value;
          await this.plugin.saveSettings();
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
