import { Notice } from "obsidian";
import type { ITheme } from "@xterm/xterm";
import { BUILTIN_THEMES, isObsidianDark } from "./themes";

const USER_THEMES_FILENAME = "themes.json";
const HEX6_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Owns the merged color-scheme catalog (built-ins + user overrides) and
 * loads/validates the user-editable themes.json file from the plugin folder.
 *
 * Load errors never block the plugin — bad entries are skipped with a
 * console warning, and a single Notice summarises failures to the user.
 */
export class ThemeRegistry {
  private merged: Record<string, ITheme> = { ...BUILTIN_THEMES };
  private userLoadErrors: string[] = [];
  private readonly path: typeof import("path");

  constructor(private pluginDir: string) {
    this.path = window.require("path") as typeof import("path");
  }

  /**
   * Re-read themes.json from the plugin folder and rebuild the merged catalog.
   * Safe to call repeatedly (e.g. from a "Reload themes" button). Each call
   * resets to built-ins before merging, so removing an override from the file
   * correctly resurfaces the built-in.
   */
  async load(): Promise<void> {
    this.merged = { ...BUILTIN_THEMES };
    this.userLoadErrors = [];

    const fs = window.require("fs/promises") as typeof import("fs/promises");
    const path = this.getUserFilePath();

    let raw: string;
    try {
      raw = await fs.readFile(path, "utf-8");
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") return; // No user file — built-ins only, silent.
      this.reportFileError(`Lean Terminal: Could not read ${USER_THEMES_FILENAME} (see console).`, err);
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err: unknown) {
      this.reportFileError(`Lean Terminal: ${USER_THEMES_FILENAME} is not valid JSON (see console).`, err);
      return;
    }

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      this.reportFileError(
        `Lean Terminal: ${USER_THEMES_FILENAME} must be a JSON object keyed by theme name.`,
        parsed
      );
      return;
    }

    for (const [name, entry] of Object.entries(parsed as Record<string, unknown>)) {
      const theme = this.validateEntry(name, entry);
      if (theme) this.merged[name] = theme;
    }

    if (this.userLoadErrors.length > 0) {
      new Notice(
        `Lean Terminal: ${this.userLoadErrors.length} custom theme(s) failed to load - see console for details.`
      );
    }
  }

  getNames(): string[] {
    return Object.keys(this.merged).sort();
  }

  get(name: string): ITheme {
    if (name === "system") {
      const resolved = isObsidianDark() ? "obsidian-dark" : "obsidian-light";
      return { ...(this.merged[resolved] ?? BUILTIN_THEMES["obsidian-dark"]) };
    }
    return { ...(this.merged[name] ?? BUILTIN_THEMES["obsidian-dark"]) };
  }

  getUserFilePath(): string {
    return this.path.join(this.pluginDir, USER_THEMES_FILENAME);
  }

  /** Absolute path to the plugin folder — used to open the folder in the OS file manager from settings. */
  getPluginDir(): string {
    return this.pluginDir;
  }

  /**
   * Returns mixed content: user-facing sentences (from file errors) and internal
   * [lean-terminal] log-style strings (from entry validation). Callers typically
   * only need `.length > 0` to detect "had errors"—don't display these strings
   * directly to users since file-level errors already fired their own Notice.
   */
  getUserLoadErrors(): readonly string[] {
    return this.userLoadErrors;
  }

  private validateEntry(name: string, entry: unknown): ITheme | null {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      this.recordEntryError(name, "entry must be an object");
      return null;
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.background !== "string" || !HEX6_RE.test(e.background)) {
      this.recordEntryError(name, "missing or invalid `background` (expected #rrggbb)");
      return null;
    }
    if (typeof e.foreground !== "string" || !HEX6_RE.test(e.foreground)) {
      this.recordEntryError(name, "missing or invalid `foreground` (expected #rrggbb)");
      return null;
    }
    // Pass through — xterm ITheme fields are all optional strings, so once
    // background/foreground validate we accept the rest as-is. Bad color
    // strings for optional fields render as xterm defaults.
    return entry as ITheme;
  }

  private reportFileError(userMessage: string, detail: unknown): void {
    console.warn("[lean-terminal] themes.json load error:", detail);
    this.userLoadErrors.push(userMessage);
    new Notice(userMessage);
  }

  private recordEntryError(name: string, reason: string): void {
    const msg = `[lean-terminal] themes.json entry "${name}" skipped: ${reason}`;
    console.warn(msg);
    this.userLoadErrors.push(msg);
  }
}
