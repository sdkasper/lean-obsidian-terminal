import { describe, it, expect } from "vitest";
import { parseShortcut, matchesShortcut, type ShortcutEventLike } from "./shortcut";

const MAC = true;
const OTHER = false;

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
    expect(matchesShortcut(ev({ key: "ƒ", code: "KeyF", altKey: true, ctrlKey: true }), "Ctrl+Alt+F", MAC)).toBe(true);
  });
  it("matches Cmd+Opt+F on macOS", () => {
    expect(matchesShortcut(ev({ key: "ƒ", code: "KeyF", altKey: true, metaKey: true }), "Cmd+Opt+F", MAC)).toBe(true);
  });
  it("matches Ctrl+Shift+F with key F", () => {
    expect(matchesShortcut(ev({ key: "F", ctrlKey: true, shiftKey: true }), "Ctrl+Shift+F", MAC)).toBe(true);
  });
  it("rejects wrong modifiers", () => {
    expect(matchesShortcut(ev({ ctrlKey: true }), "Ctrl+Alt+F", MAC)).toBe(false);
    expect(matchesShortcut(ev({ key: "ƒ", code: "KeyF", altKey: true }), "Ctrl+Alt+F", MAC)).toBe(false);
  });
  it("without Alt, matches by character only (layout kept)", () => {
    expect(matchesShortcut(ev({ key: "x", code: "KeyF", ctrlKey: true }), "Ctrl+F", MAC)).toBe(false);
  });
  it("rejects an empty shortcut", () => {
    expect(matchesShortcut(ev(), "", MAC)).toBe(false);
  });
  it("matches by character when Alt is held and e.key matches (Windows/Linux)", () => {
    expect(matchesShortcut(ev({ key: "f", code: "KeyF", ctrlKey: true, altKey: true }), "Ctrl+Alt+F", OTHER)).toBe(true);
  });
  it("does not use the physical-key fallback off macOS (AltGr types a character)", () => {
    expect(matchesShortcut(ev({ key: "[", code: "KeyF", ctrlKey: true, altKey: true }), "Ctrl+Alt+F", OTHER)).toBe(false);
  });
  it("on macOS, rejects an Alt event whose code is a different key", () => {
    expect(matchesShortcut(ev({ key: "ƒ", code: "KeyG", altKey: true, ctrlKey: true }), "Ctrl+Alt+F", MAC)).toBe(false);
  });
  it("on macOS, matches a digit by physical key under Alt", () => {
    expect(matchesShortcut(ev({ key: "¡", code: "Digit1", altKey: true, metaKey: true }), "Cmd+Opt+1", MAC)).toBe(true);
  });
  it("on macOS, has no fallback for non-letter keys under Alt", () => {
    expect(matchesShortcut(ev({ key: "÷", code: "Slash", altKey: true, ctrlKey: true }), "Ctrl+Alt+/", MAC)).toBe(false);
  });
  it("on macOS, matches by character when Alt is held and e.key already matches", () => {
    expect(matchesShortcut(ev({ key: "f", code: "KeyF", altKey: true, ctrlKey: true }), "Ctrl+Alt+F", MAC)).toBe(true);
  });
});
