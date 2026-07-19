import { Platform } from "obsidian";
import { getShellIntegration } from "./shell-integration";
import { requireNode, nodeProcess, type FsApi, type PathApi } from "./node-api";

interface IPtyProcess {
  pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  onData(callback: (data: string) => void): void;
  onExit(callback: (exitInfo: { exitCode: number; signal?: number }) => void): void;
  kill(): void;
}

interface NodePtyModule {
  spawn(
    file: string,
    args: string[],
    options: {
      name?: string;
      cols?: number;
      rows?: number;
      cwd?: string;
      env?: Record<string, string | undefined>;
      useConpty?: boolean;
      useConptyDll?: boolean;
    }
  ): IPtyProcess;
}

function getNodePtyDir(pluginDir: string): string {
  const path = requireNode("path");
  return path.join(pluginDir, "node_modules", "node-pty");
}

// node-pty is loaded at runtime via Electron's require, not bundled by esbuild.
function loadNodePty(nodePtyDir: string): NodePtyModule {
  try {
    return window.require(nodePtyDir) as NodePtyModule;
  } catch {
    return window.require("node-pty") as NodePtyModule;
  }
}

// Windows conpty arch directory names as laid out under node-pty's
// third_party/conpty/<conptyVersion>/<archDir>/ (conpty.dll + OpenConsole.exe).
const CONPTY_ARCH_DIRS: Record<string, string> = {
  x64: "win10-x64",
  arm64: "win10-arm64",
};

/**
 * Decides whether it is safe to pass `useConptyDll: true` to node-pty's spawn.
 *
 * Context (see GitHub issue #92): on Windows 10, node-pty's default ConPTY
 * (the in-box conhost) does not forward mouse input to TUI apps. Passing
 * `useConptyDll: true` makes node-pty launch the modern OpenConsole.exe it
 * ships under `third_party/conpty/<version>/<archDir>/`, which does forward
 * mouse input on both Windows 10 and 11.
 *
 * This plugin does not bundle node-pty - it downloads a platform-specific
 * zip from GitHub releases at runtime (see binary-manager.ts). That zip is
 * built by .github/workflows/build-node-pty.yml, which only copies
 * `third_party` for the win32-x64 package; the win32-arm64 package is
 * assembled from a separately staged install that never copies
 * `third_party`, so it never contains the OpenConsole.exe/conpty.dll files.
 * Older already-downloaded installs may also predate this fix and lack the
 * files. Enabling the flag without these files present would break spawn
 * (or silently fall back to unwanted behavior), so this check gates on the
 * files actually existing on disk for the host architecture rather than
 * assuming they are there.
 */
export function shouldEnableConptyDll(
  fs: FsApi,
  path: PathApi,
  nodePtyDir: string,
  platform: string,
  arch: string
): boolean {
  if (platform !== "win32") return false;

  const archDir = CONPTY_ARCH_DIRS[arch];
  if (!archDir) return false;

  const conptyRoot = path.join(nodePtyDir, "third_party", "conpty");
  if (!fs.existsSync(conptyRoot)) return false;

  let versionDirs: string[];
  try {
    versionDirs = fs.readdirSync(conptyRoot);
  } catch {
    return false;
  }

  return versionDirs.some((version) => {
    const dll = path.join(conptyRoot, version, archDir, "conpty.dll");
    const exe = path.join(conptyRoot, version, archDir, "OpenConsole.exe");
    return fs.existsSync(dll) && fs.existsSync(exe);
  });
}

function getDefaultShell(): string {
  if (Platform.isWin) {
    const pwshPaths = [
      nodeProcess.env.ProgramFiles + "\\PowerShell\\7\\pwsh.exe",                    // standard installer
      (nodeProcess.env.LOCALAPPDATA || "") + "\\Microsoft\\WindowsApps\\pwsh.exe",   // MS Store
    ];
    try {
      const fs = requireNode("fs");
      for (const p of pwshPaths) {
        if (p && fs.existsSync(p)) return p;
      }
    } catch {
      // ignore
    }
    return nodeProcess.env.COMSPEC || "cmd.exe";
  }
  return nodeProcess.env.SHELL || "/bin/bash";
}

function getShellArgs(shellPath: string): string[] {
  if (Platform.isWin) {
    const lower = shellPath.toLowerCase();
    if (lower.includes("pwsh") || lower.includes("powershell")) {
      return ["-NoLogo"];
    }
    return [];
  }
  // macOS/Linux: launch as login shell so ~/.zprofile, ~/.bash_profile etc.
  // are sourced and PATH includes Homebrew, nvm, user-installed CLIs.
  return ["-l"];
}

/**
 * Validates that a shell path points to an existing file.
 * Throws if the path does not exist or is not a file.
 */
function validateShellPath(shellPath: string): void {
  const fs = requireNode("fs");
  try {
    const stat = fs.statSync(shellPath);
    if (!stat.isFile()) {
      throw new Error(`Shell path is not a file: ${shellPath}`);
    }
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      throw new Error(`Shell not found: ${shellPath}`);
    }
    throw err;
  }
}

export class PtyManager {
  private ptyProcess: IPtyProcess | null = null;
  private nodePty: NodePtyModule | null = null;
  private pluginDir: string;
  private _shellPath: string = "";

  constructor(pluginDir: string) {
    this.pluginDir = pluginDir;
  }

  get shellPath(): string {
    return this._shellPath;
  }

  spawn(
    shellPath: string,
    cwd: string,
    cols: number,
    rows: number,
    env?: Record<string, string>
  ): void {
    const nodePtyDir = getNodePtyDir(this.pluginDir);
    this.nodePty = loadNodePty(nodePtyDir);

    const shell = shellPath || getDefaultShell();
    this._shellPath = shell;
    validateShellPath(shell);
    const baseArgs = getShellArgs(shell);

    // Inject shell integration hooks
    const si = getShellIntegration(shell, this.pluginDir);
    const args = si.args.length > 0 ? si.args : baseArgs;

    const ptyEnv = {
      ...nodeProcess.env,
      ...si.env,
      ...env,
    };

    // useConptyDll enables node-pty's bundled OpenConsole.exe instead of the
    // in-box conhost ConPTY. On Windows 10 the in-box conhost does not
    // forward mouse input (clicks/wheel) to TUI apps - see issue #92. Only
    // enabled when the required files are actually present for this host's
    // architecture (see shouldEnableConptyDll doc comment above).
    const useConptyDll = shouldEnableConptyDll(
      requireNode("fs"),
      requireNode("path"),
      nodePtyDir,
      nodeProcess.platform,
      nodeProcess.arch
    );

    this.ptyProcess = this.nodePty.spawn(shell, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: ptyEnv,
      // ConPTY with patched ConoutConnection (inline socket piping, no Worker threads).
      // useConpty defaults to true on Windows — ConPTY has correct UTF-8/emoji support.
      // Fallback: set useConpty: false here if ConPTY deadlocks on your Electron build.
      ...(useConptyDll ? { useConptyDll: true } : {}),
    });
  }

  write(data: string): void {
    this.ptyProcess?.write(data);
  }

  resize(cols: number, rows: number): void {
    try {
      this.ptyProcess?.resize(cols, rows);
    } catch {
      // Ignore resize errors (can happen during rapid resizing)
    }
  }

  onData(callback: (data: string) => void): void {
    this.ptyProcess?.onData(callback);
  }

  onExit(callback: (exitInfo: { exitCode: number; signal?: number }) => void): void {
    this.ptyProcess?.onExit(callback);
  }

  kill(): void {
    try {
      this.ptyProcess?.kill();
    } catch {
      // Process may already be dead
    }
    this.ptyProcess = null;
  }

}
