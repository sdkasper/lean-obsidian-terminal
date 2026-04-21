import { Platform } from "obsidian";
import { getShellIntegration } from "./shell-integration";

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
    }
  ): IPtyProcess;
}

// node-pty is loaded at runtime via Electron's require, not bundled by esbuild.
function loadNodePty(pluginDir: string): NodePtyModule {
  const path = window.require("path") as typeof import("path");
  const explicitPath = path.join(pluginDir, "node_modules", "node-pty");

  try {
    return window.require(explicitPath) as NodePtyModule;
  } catch {
    return window.require("node-pty") as NodePtyModule;
  }
}

function getDefaultShell(): string {
  if (Platform.isWin) {
    const pwsh = process.env.ProgramFiles + "\\PowerShell\\7\\pwsh.exe";
    try {
      const fs = window.require("fs") as typeof import("fs");
      if (fs.existsSync(pwsh)) return pwsh;
    } catch {
      // ignore
    }
    return process.env.COMSPEC || "cmd.exe";
  }
  return process.env.SHELL || "/bin/bash";
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
  const fs = window.require("fs") as typeof import("fs");
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

  constructor(pluginDir: string) {
    this.pluginDir = pluginDir;
  }

  spawn(
    shellPath: string,
    cwd: string,
    cols: number,
    rows: number,
    env?: Record<string, string>
  ): void {
    this.nodePty = loadNodePty(this.pluginDir);

    const shell = shellPath || getDefaultShell();
    validateShellPath(shell);
    const baseArgs = getShellArgs(shell);

    // Inject shell integration hooks
    const si = getShellIntegration(shell, this.pluginDir);
    const args = si.args.length > 0 ? si.args : baseArgs;

    const ptyEnv = {
      ...process.env,
      ...si.env,
      ...env,
    };

    this.ptyProcess = this.nodePty.spawn(shell, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: ptyEnv,
      // ConPTY with patched ConoutConnection (inline socket piping, no Worker threads).
      // useConpty defaults to true on Windows — ConPTY has correct UTF-8/emoji support.
      // Fallback: set useConpty: false here if ConPTY deadlocks on your Electron build.
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

  get pid(): number | undefined {
    return this.ptyProcess?.pid;
  }
}
