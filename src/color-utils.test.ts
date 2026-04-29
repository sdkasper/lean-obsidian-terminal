import { describe, it, expect } from "vitest";
import { mixHex } from "./color-utils";

describe("mixHex", () => {
  it("ratio 0 returns base unchanged", () => {
    expect(mixHex("#ffffff", "#000000", 0)).toBe("#ffffff");
  });

  it("ratio 1 returns overlay", () => {
    expect(mixHex("#ffffff", "#000000", 1)).toBe("#000000");
  });

  it("ratio 0.5 blends to midpoint", () => {
    // 255 * 0.5 = 127.5 → rounds to 128 = 0x80
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("handles 3-digit shorthand input", () => {
    expect(mixHex("#fff", "#000", 1)).toBe("#000000");
    expect(mixHex("#fff", "#000", 0)).toBe("#ffffff");
  });

  it("returns base when base is invalid hex", () => {
    expect(mixHex("not-a-color", "#000000", 0.5)).toBe("not-a-color");
  });

  it("returns base when overlay is invalid hex", () => {
    // "xyz" has non-hex digits so parseHex returns null
    expect(mixHex("#ffffff", "xyz", 0.5)).toBe("#ffffff");
  });

  it("clamps ratio below 0 to 0", () => {
    expect(mixHex("#ffffff", "#000000", -1)).toBe("#ffffff");
  });

  it("clamps ratio above 1 to 1", () => {
    expect(mixHex("#ffffff", "#000000", 2)).toBe("#000000");
  });

  it("produces a valid 6-digit hex result", () => {
    const result = mixHex("#1e1e1e", "#fc3634", 0.12);
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });
});
