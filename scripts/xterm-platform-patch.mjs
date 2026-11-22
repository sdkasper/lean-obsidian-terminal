import { readFile } from "fs/promises";

// xterm.js 5.5 decides isMac from `isNode ? "node" : navigator.platform`, with
// isNode = typeof process !== "undefined" && "title" in process. Obsidian's
// renderer exposes Node's `process`, so isNode is true, the platform string
// becomes "node" and isMac is false even on a Mac. xterm then handles Option
// like Alt on Linux: Option+L sends ESC l instead of "@" on a German layout,
// and every Option-composed character (@ [ ] { } | \ ~) is lost (#130).
//
// The fix: prefer navigator.platform whenever the renderer has one.
const PLATFORM_PATTERN = /(\w+)\.isNode\?"node":navigator\.platform/g;

/**
 * Rewrites xterm's platform detection in the bundled lib/xterm.js source.
 * Throws unless the expected expression occurs exactly once, so an xterm
 * upgrade that changes it fails the build instead of silently dropping the fix.
 * @param {string} source
 * @returns {string}
 */
export function patchXtermPlatform(source) {
  const count = (source.match(PLATFORM_PATTERN) ?? []).length;
  if (count !== 1) {
    throw new Error(
      `xterm platform patch: expected 1 match in @xterm/xterm/lib/xterm.js, found ${count}. ` +
        "xterm.js changed its platform detection; re-check macOS Option handling (#130).",
    );
  }
  return source.replace(
    PLATFORM_PATTERN,
    (_match, ns) =>
      `(typeof navigator!=="undefined"&&navigator.platform?navigator.platform:${ns}.isNode?"node":"")`,
  );
}

/** esbuild plugin that applies patchXtermPlatform to @xterm/xterm/lib/xterm.js. */
export const xtermPlatformPlugin = {
  name: "xterm-platform",
  setup(build) {
    build.onLoad({ filter: /[\\/]@xterm[\\/]xterm[\\/]lib[\\/]xterm\.js$/ }, async (args) => {
      const source = await readFile(args.path, "utf8");
      return { contents: patchXtermPlatform(source), loader: "js" };
    });
  },
};
