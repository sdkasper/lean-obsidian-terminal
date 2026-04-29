import { describe, it, expect } from "vitest";
import { BUILTIN_THEMES } from "./themes";

const REQUIRED_KEYS = [
  "background", "foreground", "cursor",
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow",
  "brightBlue", "brightMagenta", "brightCyan", "brightWhite",
] as const;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

describe("BUILTIN_THEMES", () => {
  it("contains at least 4 themes", () => {
    expect(Object.keys(BUILTIN_THEMES).length).toBeGreaterThanOrEqual(4);
  });

  it("includes obsidian-dark and obsidian-light", () => {
    expect(BUILTIN_THEMES).toHaveProperty("obsidian-dark");
    expect(BUILTIN_THEMES).toHaveProperty("obsidian-light");
  });

  it.each(Object.entries(BUILTIN_THEMES))(
    'theme "%s" has all required xterm color keys',
    (_name, theme) => {
      for (const key of REQUIRED_KEYS) {
        expect(theme[key], key).toBeDefined();
      }
    }
  );

  it.each(Object.entries(BUILTIN_THEMES))(
    'theme "%s" has valid 6-digit hex values for all required keys',
    (_name, theme) => {
      for (const key of REQUIRED_KEYS) {
        const value = theme[key as keyof typeof theme] as string | undefined;
        expect(value, key).toMatch(HEX_RE);
      }
    }
  );
});
