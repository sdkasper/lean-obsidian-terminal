import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { patchXtermPlatform as patch } from "../scripts/xterm-platform-patch.mjs";

// Mirrors the shape of xterm 5.5's minified Platform module.
const snippet = 't.isNode=typeof process!="undefined"&&"title"in process;' +
  'let i=t.isNode?"node":navigator.userAgent,s=t.isNode?"node":navigator.platform;' +
  't.isMac=["Macintosh","MacIntel","MacPPC","Mac68K"].includes(s);';

// Runs the fixed snippet in an isolated context that looks like Obsidian's
// Electron renderer: navigator exists and Node's process is visible too.
function isMacAfter(source: string, platform: string): boolean {
  const t: { isMac?: boolean } = {};
  runInNewContext(source, { t, navigator: { platform, userAgent: "Electron" }, process: { title: "Obsidian" } });
  return t.isMac === true;
}

describe("patchXtermPlatform (#130)", () => {
  it("reproduces the bug: unpatched xterm says not-a-Mac inside Electron", () => {
    expect(isMacAfter(snippet, "MacIntel")).toBe(false);
  });

  it("detects macOS from navigator.platform when Node's process is present", () => {
    expect(isMacAfter(patch(snippet), "MacIntel")).toBe(true);
  });

  it("keeps non-Mac platforms non-Mac", () => {
    expect(isMacAfter(patch(snippet), "Win32")).toBe(false);
    expect(isMacAfter(patch(snippet), "Linux x86_64")).toBe(false);
  });

  it("falls back to the old behaviour when navigator.platform is empty", () => {
    expect(isMacAfter(patch(snippet), "")).toBe(false);
  });

  it("throws when the expression is missing or ambiguous", () => {
    expect(() => patch("nothing to patch")).toThrow(/found 0/);
    expect(() => patch(snippet + snippet)).toThrow(/found 2/);
  });

  it("matches the installed xterm.js exactly once", () => {
    const lib = readFileSync(resolve(__dirname, "../node_modules/@xterm/xterm/lib/xterm.js"), "utf8");
    expect(() => patch(lib)).not.toThrow();
  });
});
