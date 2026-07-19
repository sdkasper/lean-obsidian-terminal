import { describe, it, expect } from "vitest";
import { shouldEnableConptyDll } from "./pty-manager";
import type { FsApi, PathApi } from "./node-api";

// shouldEnableConptyDll only touches existsSync/readdirSync and path.join,
// so an in-memory fake is enough - no real filesystem or Electron needed.
function fakeFs(files: Set<string>, dirs: Map<string, string[]>): FsApi {
  return {
    existsSync: (p: string) => files.has(p) || dirs.has(p),
    readdirSync: (p: string) => {
      const entries = dirs.get(p);
      if (!entries) throw new Error(`ENOENT: ${p}`);
      return entries;
    },
  } as unknown as FsApi;
}

const posixPath: PathApi = {
  join: (...parts: string[]) => parts.join("/"),
  isAbsolute: (p: string) => p.startsWith("/"),
  sep: "/",
};

const NODE_PTY_DIR = "/plugin/node_modules/node-pty";
const CONPTY_ROOT = `${NODE_PTY_DIR}/third_party/conpty`;
const VERSION = "1.23.251008001";

describe("shouldEnableConptyDll", () => {
  it("returns false on non-Windows platforms", () => {
    const fs = fakeFs(new Set(), new Map());
    expect(shouldEnableConptyDll(fs, posixPath, NODE_PTY_DIR, "darwin", "x64")).toBe(false);
  });

  it("returns false for unsupported Windows architectures", () => {
    const fs = fakeFs(new Set(), new Map());
    expect(shouldEnableConptyDll(fs, posixPath, NODE_PTY_DIR, "win32", "ia32")).toBe(false);
  });

  it("returns false when third_party/conpty is absent (e.g. the win32-arm64 release zip)", () => {
    const fs = fakeFs(new Set(), new Map());
    expect(shouldEnableConptyDll(fs, posixPath, NODE_PTY_DIR, "win32", "arm64")).toBe(false);
  });

  it("returns false when the conpty dir exists but lacks dll/exe for the host arch", () => {
    const dirs = new Map([[CONPTY_ROOT, [VERSION]]]);
    const fs = fakeFs(new Set(), dirs);
    expect(shouldEnableConptyDll(fs, posixPath, NODE_PTY_DIR, "win32", "x64")).toBe(false);
  });

  it("returns true when conpty.dll and OpenConsole.exe exist for the host arch", () => {
    const dirs = new Map([[CONPTY_ROOT, [VERSION]]]);
    const files = new Set([
      `${CONPTY_ROOT}/${VERSION}/win10-x64/conpty.dll`,
      `${CONPTY_ROOT}/${VERSION}/win10-x64/OpenConsole.exe`,
    ]);
    const fs = fakeFs(files, dirs);
    expect(shouldEnableConptyDll(fs, posixPath, NODE_PTY_DIR, "win32", "x64")).toBe(true);
  });

  it("returns false for an arm64 host even when only x64 files are present", () => {
    const dirs = new Map([[CONPTY_ROOT, [VERSION]]]);
    const files = new Set([
      `${CONPTY_ROOT}/${VERSION}/win10-x64/conpty.dll`,
      `${CONPTY_ROOT}/${VERSION}/win10-x64/OpenConsole.exe`,
    ]);
    const fs = fakeFs(files, dirs);
    expect(shouldEnableConptyDll(fs, posixPath, NODE_PTY_DIR, "win32", "arm64")).toBe(false);
  });

  it("returns false when readdirSync throws (e.g. permission error)", () => {
    const fs: FsApi = {
      existsSync: () => true,
      readdirSync: () => {
        throw new Error("EACCES");
      },
    } as unknown as FsApi;
    expect(shouldEnableConptyDll(fs, posixPath, NODE_PTY_DIR, "win32", "x64")).toBe(false);
  });
});
