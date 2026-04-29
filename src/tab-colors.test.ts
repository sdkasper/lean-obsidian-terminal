import { describe, it, expect } from "vitest";
import { findTabColor, DEFAULT_TAB_COLORS, DEFAULT_TINT_STRENGTH } from "./tab-colors";

describe("findTabColor", () => {
  it("returns null for empty hex", () => {
    expect(findTabColor(DEFAULT_TAB_COLORS, "")).toBeNull();
  });

  it("finds exact palette match", () => {
    const result = findTabColor(DEFAULT_TAB_COLORS, "#FC3634");
    expect(result?.name).toBe("Vermilion");
    expect(result?.value).toBe("#FC3634");
    expect(result?.builtin).toBe(true);
  });

  it("match is case-insensitive", () => {
    const result = findTabColor(DEFAULT_TAB_COLORS, "#fc3634");
    expect(result?.name).toBe("Vermilion");
  });

  it("synthesizes entry for unknown hex", () => {
    const result = findTabColor(DEFAULT_TAB_COLORS, "#123456");
    expect(result).not.toBeNull();
    expect(result?.value).toBe("#123456");
    expect(result?.tintStrength).toBe(DEFAULT_TINT_STRENGTH);
    expect(result?.builtin).toBe(false);
  });

  it("synthesizes entry on empty palette", () => {
    const result = findTabColor([], "#aabbcc");
    expect(result?.value).toBe("#aabbcc");
    expect(result?.builtin).toBe(false);
  });
});
