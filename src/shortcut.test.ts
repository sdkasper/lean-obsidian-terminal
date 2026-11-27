import { describe, it, expect } from "vitest";
import { parseShortcut, matchesShortcut, type ShortcutEventLike } from "./shortcut";

const ev = (over: Partial<ShortcutEventLike> = {}): ShortcutEventLike => ({
  key: "f",
  code: "KeyF",
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...over,
});

describe("parseShortcut", () => {
  it("parses Ctrl+Alt+F", () => {
    expect(parseShortcut("Ctrl+Alt+F")).toEqual({ ctrl: true, shift: false, alt: true, meta: false, key: "F" });
  });
  it("reads Opt and Option as Alt", () => {
    expect(parseShortcut("Cmd+Opt+F")).toEqual({ ctrl: false, shift: false, alt: true, meta: true, key: "F" });
    expect(parseShortcut("cmd+option+f")).toEqual({ ctrl: false, shift: false, alt: true, meta: true, key: "f" });
  });
  it("parses Ctrl+Shift+F", () => {
    expect(parseShortcut("Ctrl+Shift+F")).toEqual({ ctrl: true, shift: true, alt: false, meta: false, key: "F" });
  });
  it("returns null for an empty string", () => {
    expect(parseShortcut("")).toBeNull();
    expect(parseShortcut("  ")).toBeNull();
  });
});

describe("matchesShortcut", () => {
  it("matches a macOS Option event by physical key", () => {
    expect(matchesShortcut(ev({ key: "ƒ", code: "KeyF", altKey: true, ctrlKey: true }), "Ctrl+Alt+F")).toBe(true);
  });
  it("matches Cmd+Opt+F on macOS", () => {
    expect(matchesShortcut(ev({ key: "ƒ", code: "KeyF", altKey: true, metaKey: true }), "Cmd+Opt+F")).toBe(true);
  });
  it("matches Ctrl+Shift+F with key F", () => {
    expect(matchesShortcut(ev({ key: "F", ctrlKey: true, shiftKey: true }), "Ctrl+Shift+F")).toBe(true);
  });
  it("rejects wrong modifiers", () => {
    expect(matchesShortcut(ev({ ctrlKey: true }), "Ctrl+Alt+F")).toBe(false);
    expect(matchesShortcut(ev({ key: "ƒ", code: "KeyF", altKey: true }), "Ctrl+Alt+F")).toBe(false);
  });
  it("without Alt, matches by character only (layout kept)", () => {
    expect(matchesShortcut(ev({ key: "x", code: "KeyF", ctrlKey: true }), "Ctrl+F")).toBe(false);
  });
  it("rejects an empty shortcut", () => {
    expect(matchesShortcut(ev(), "")).toBe(false);
  });
});
