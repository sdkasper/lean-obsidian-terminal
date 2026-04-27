import type { ITheme } from "@xterm/xterm";
import { BUILTIN_THEMES } from "./themes";

/**
 * ThemeRegistry loads built-in themes plus optional themes.json from the plugin folder.
 * Users can extend or override built-in themes at runtime.
 */
export class ThemeRegistry {
  private themes: Record<string, ITheme>;
  private pluginDir: string;
  private loadErrors: string[] = [];

  constructor(pluginDir: string) {
    this.pluginDir = pluginDir;
    this.themes = { ...BUILTIN_THEMES };
  }

  async load(): Promise<void> {
    const path = window.require("path") as typeof import("path");
    const fs = (window.require("fs") as typeof import("fs")).promises;

    const themesPath = path.join(this.pluginDir, "themes.json");
    try {
      const content = await fs.readFile(themesPath, "utf-8");
      const data = JSON.parse(content) as Record<string, ITheme>;
      // Merge user themes with built-ins (user can override)
      this.themes = { ...this.themes, ...data };
    } catch (err) {
      // themes.json doesn't exist or can't be parsed — just use built-ins
      if (err instanceof Error && !err.message.includes("ENOENT")) {
        this.loadErrors.push(`Failed to load themes.json: ${err.message}`);
      }
    }
  }

  /**
   * Get a theme by name. Returns a clone so mutations don't affect the registry.
   */
  get(name: string): ITheme {
    const theme = this.themes[name] || this.themes["obsidian-dark"];
    // Return a shallow clone so callers can mutate without side effects
    return { ...theme };
  }

  /**
   * Get the list of available theme names.
   */
  list(): string[] {
    return Object.keys(this.themes);
  }

  /**
   * Alias for list() — expected by settings.ts
   */
  getNames(): string[] {
    return this.list();
  }

  /**
   * Return the plugin directory.
   */
  getPluginDir(): string {
    return this.pluginDir;
  }

  /**
   * Return any errors that occurred during load.
   */
  getUserLoadErrors(): string[] {
    return this.loadErrors;
  }
}
