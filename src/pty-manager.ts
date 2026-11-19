import { Platform } from "obsidian";
import { getShellIntegration } from "./shell-integration";
import {
  requireNode,
  nodeProcess,
  type ChildProcessApi,
  type FsApi,
  type PathApi,
} from "./node-api";

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

/**
 * Decides whether it is safe to pass `useConptyDll: true` to node-pty's spawn.
 *
 * Context (see GitHub issue #92): on Windows 10, node-pty's default ConPTY
 * (the in-box conhost) does not forward mouse input to TUI apps. Passing
 * `useConptyDll: true` makes node-pty launch the modern OpenConsole.exe,
 * which does forward mouse input on both Windows 10 and 11.
 *
 * node-pty's native loader resolves conpty.dll and OpenConsole.exe relative
 * to conpty.node, i.e. `prebuilds/<platform>-<arch>/conpty/` - NOT the
 * `third_party/conpty/` source tree of the npm package. This plugin does not
 * bundle node-pty - it downloads a platform-specific zip from GitHub releases
 * at runtime (see binary-manager.ts), and some packages (the 1.4.0 win32-arm64
 * one, see issue #105) shipped the files flat in `prebuilds/<platform>-<arch>/`
 * or only under `third_party`. Enabling the flag without the files at the
 * exact path node-pty loads from makes spawn fail with "Cannot find
 * conpty.dll", so this check gates on that path existing on disk rather than
 * assuming it does.
 */
export function shouldEnableConptyDll(
  fs: FsApi,
  path: PathApi,
  nodePtyDir: string,
  platform: string,
  arch: string
): boolean {
  if (platform !== "win32") return false;

  const conptyDir = path.join(nodePtyDir, "prebuilds", `${platform}-${arch}`, "conpty");
  try {
    return (
      fs.existsSync(path.join(conptyDir, "conpty.dll")) &&
      fs.existsSync(path.join(conptyDir, "OpenConsole.exe"))
    );
  } catch {
    return false;
  }
}

const CONPTY_FILES = ["conpty.dll", "OpenConsole.exe"];

/**
 * Repairs the conpty layout of installs downloaded from the 1.4.0 win32-arm64
 * zip (issue #105): conpty.dll and OpenConsole.exe sit flat in
 * `prebuilds/<platform>-<arch>/` but node-pty loads them from the `conpty/`
 * subfolder next to conpty.node. Copies any missing file into `conpty/` so the
 * Windows 10 mouse fix (see shouldEnableConptyDll) works without a re-download
 * - re-downloading the 1.4.0 asset would reproduce the same flat layout.
 *
 * Best-effort and idempotent: never throws, never overwrites existing files,
 * and does nothing when the flat files are absent. Returns true when it
 * copied at least one file.
 */
export function repairConptyLayout(
  fs: FsApi,
  path: PathApi,
  nodePtyDir: string,
  platform: string,
  arch: string
): boolean {
  if (platform !== "win32") return false;

  try {
    const prebuildDir = path.join(nodePtyDir, "prebuilds", `${platform}-${arch}`);
    const conptyDir = path.join(prebuildDir, "conpty");
    let copied = false;
    for (const name of CONPTY_FILES) {
      const src = path.join(prebuildDir, name);
      const dest = path.join(conptyDir, name);
      if (fs.existsSync(dest) || !fs.existsSync(src)) continue;
      fs.mkdirSync(conptyDir, { recursive: true });
      fs.copyFileSync(src, dest);
      copied = true;
    }
    return copied;
  } catch {
    return false;
  }
}

// Per-session memo so restoring N tabs pays for the lookup once, not N times.
// A string is a resolved package exe; null is a clean "no Store package" answer.
// A failed lookup (timeout, non-zero exit, missing exe) is never stored, so it is
// retried once the cool-off below ends instead of pinning the alias for the session.
const storePwshCache = new Map<string, string | null>();

// After a failed lookup, skip the lookup for a minute. The call is synchronous on
// the UI thread, so a hung AppX service (5 s timeout) would otherwise freeze
// every tab spawn; a minute is still short enough to recover from a transient
// failure without restarting Obsidian.
const STORE_PWSH_RETRY_MS = 60_000;
let storePwshFailedAt: number | null = null;

export function clearStorePwshCache(): void {
  storePwshCache.clear();
  storePwshFailedAt = null;
}

export function resolveWindowsStorePwshAlias(
  shellPath: string,
  fs: FsApi,
  childProcess: ChildProcessApi
): string {
  const normalized = shellPath.split("/").join("\\").toLowerCase();
  if (!normalized.endsWith("\\microsoft\\windowsapps\\pwsh.exe")) return shellPath;
  // A missing alias fails validation anyway; don't pay for the lookup.
  if (!fs.existsSync(shellPath)) return shellPath;

  const cached = storePwshCache.get(normalized);
  if (cached === null) return shellPath;
  if (cached !== undefined) {
    try {
      // A Store update moves the versioned folder, so re-check before reuse.
      if (fs.statSync(cached).isFile()) return cached;
    } catch {
      // Stale entry: look the package up again.
    }
  }

  if (storePwshFailedAt !== null) {
    // A negative elapsed time means the clock was set back; don't wait for it.
    const elapsed = Date.now() - storePwshFailedAt;
    if (elapsed >= 0 && elapsed < STORE_PWSH_RETRY_MS) return shellPath;
  }

  try {
    const resolved = lookUpStorePwsh(fs, childProcess);
    storePwshCache.set(normalized, resolved);
    storePwshFailedAt = null;
    return resolved ?? shellPath;
  } catch {
    // Leave the alias; the normal shell validation reports any failure.
    storePwshFailedAt = Date.now();
    return shellPath;
  }
}

// Asks Windows for the installed Store package directly. where.exe is not
// used: the package folder is not on PATH, and it would return whichever
// other pwsh.exe is (scoop, dotnet tool) instead of the Store build.
// Returns null for a clean empty answer and throws on any failure.
function lookUpStorePwsh(fs: FsApi, childProcess: ChildProcessApi): string | null {
  const output = childProcess.execFileSync(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-AppxPackage -Name Microsoft.PowerShell | Sort-Object { [version]$_.Version } -Descending | Select-Object -First 1 -ExpandProperty InstallLocation",
    ],
    { encoding: "utf8", timeout: 5000, windowsHide: true }
  );
  // The last line is the path; Windows PowerShell 5.1 can print warnings before it.
  const installLocation = output.trim().split(/\r?\n/).pop()?.trim();
  if (!installLocation) return null;

  const candidate = `${installLocation}\\pwsh.exe`;
  if (!fs.statSync(candidate).isFile()) throw new Error(`Not a file: ${candidate}`);
  return candidate;
}

/**
 * Picks the default Windows shell: PowerShell 7 from the standard installer,
 * then the Microsoft Store build, then COMSPEC. The Store alias is only
 * resolved when it actually exists, so machines without PowerShell 7 never
 * pay for the powershell.exe lookup (can block up to 5 s, once per session, or
 * once per minute while it keeps failing).
 */
export function pickWindowsDefaultShell(
  env: Record<string, string | undefined>,
  fs: FsApi,
  childProcess: ChildProcessApi
): string {
  const standardPwsh = (env.ProgramFiles || "") + "\\PowerShell\\7\\pwsh.exe";
  const storeAlias = (env.LOCALAPPDATA || "") + "\\Microsoft\\WindowsApps\\pwsh.exe";
  try {
    if (env.ProgramFiles && fs.existsSync(standardPwsh)) return standardPwsh;
    if (env.LOCALAPPDATA && fs.existsSync(storeAlias)) {
      return resolveWindowsStorePwshAlias(storeAlias, fs, childProcess);
    }
    // existsSync above is also checked inside the resolver, kept here so a
    // missing alias falls through to COMSPEC instead of returning a dead path.
  } catch {
    // ignore
  }
  return env.COMSPEC || "cmd.exe";
}

function getDefaultShell(): string {
  if (Platform.isWin) {
    try {
      return pickWindowsDefaultShell(
        nodeProcess.env,
        requireNode("fs"),
        requireNode("child_process")
      );
    } catch {
      return nodeProcess.env.COMSPEC || "cmd.exe";
    }
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

    // getDefaultShell() already resolves the Store alias; only a configured
    // shell path needs it here, so the lookups don't run twice per tab.
    const shell =
      shellPath && Platform.isWin
        ? resolveWindowsStorePwshAlias(shellPath, requireNode("fs"), requireNode("child_process"))
        : shellPath || getDefaultShell();
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
    // enabled when conpty.dll and OpenConsole.exe exist where node-pty loads
    // them from, prebuilds/<platform>-<arch>/conpty/ (see shouldEnableConptyDll
    // doc comment above).
    const nodeFs = requireNode("fs");
    const nodePath = requireNode("path");
    // Heal installs from the 1.4.0 win32-arm64 zip first (issue #105).
    repairConptyLayout(nodeFs, nodePath, nodePtyDir, nodeProcess.platform, nodeProcess.arch);
    const useConptyDll = shouldEnableConptyDll(
      nodeFs,
      nodePath,
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

  /** True once a shell has been spawned and until it is killed. */
  get isRunning(): boolean {
    return this.ptyProcess !== null;
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
