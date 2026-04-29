import { describe, it, expect } from "vitest";
import { ThemeRegistry } from "./theme-registry";

// ThemeRegistry is constructed with a pluginDir but we never call load(),
// so no filesystem access occurs in these tests.

describe("ThemeRegistry (built-ins only)", () => {
  const registry = new ThemeRegistry("/fake/plugin/dir");

  it("list() includes the built-in theme names", () => {
    const names = registry.list();
    expect(names).toContain("obsidian-dark");
    expect(names).toContain("obsidian-light");
  });

  it("getNames() returns the same result as list()", () => {
    expect(registry.getNames()).toEqual(registry.list());
  });

  it("get() returns a theme with background and foreground for a known name", () => {
    const theme = registry.get("obsidian-dark");
    expect(theme.background).toBeDefined();
    expect(theme.foreground).toBeDefined();
  });

  it("get() falls back to obsidian-dark for unknown theme names", () => {
    const fallback = registry.get("no-such-theme");
    const dark = registry.get("obsidian-dark");
    expect(fallback.background).toBe(dark.background);
    expect(fallback.foreground).toBe(dark.foreground);
  });

  it("returned theme is a clone — mutation does not affect the registry", () => {
    const t1 = registry.get("obsidian-dark");
    const originalBg = t1.background;
    t1.background = "#deadbe";
    const t2 = registry.get("obsidian-dark");
    expect(t2.background).toBe(originalBg);
  });
});
