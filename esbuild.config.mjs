import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { readFile } from "fs/promises";
import { resolve, dirname } from "path";

const prod = process.argv[2] === "production";

// Allows importing any file as a raw string with the `?raw` suffix.
// Usage: import patch from "../patches/foo.js?raw"
const rawTextPlugin = {
  name: "raw-text",
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: resolve(dirname(args.importer), args.path.replace(/\?raw$/, "")),
      namespace: "raw-text",
    }));
    build.onLoad({ filter: /.*/, namespace: "raw-text" }, async (args) => {
      const text = await readFile(args.path, "utf8");
      return { contents: `export default ${JSON.stringify(text)}`, loader: "js" };
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  plugins: [rawTextPlugin],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    "node-pty",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
