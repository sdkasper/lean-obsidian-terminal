import { Platform } from "obsidian";

// node-pty is loaded at runtime via Electron's require, not bundled by esbuild.
function loadNodePty(pluginDir: string): any {
  const electronRequire = (window as any).require;
  if (!electronRequire) {
    throw new Error("Cannot access Electron require — this plugin only works on desktop.");
  }
  const path = electronRequire("path");
  const explicitPath = path.join(pluginDir, "node_modules", "node-pty");

  try {
    return electronRequire(explicitPath);
  } catch {
    return electronRequire("node-pty");
  }
}

function getDefaultShell(): string {
  if (Platform.isWin) {
    const pwsh = process.env.ProgramFiles + "\\PowerShell\\7\\pwsh.exe";
    try {
      const fs = (window as any).require("fs");
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
  const fs = (window as any).require("fs");
  try {
    const stat = fs.statSync(shellPath);
    if (!stat.isFile()) {
      throw new Error(`Shell path is not a file: ${shellPath}`);
    }
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error(`Shell not found: ${shellPath}`);
    }
    throw err;
  }
}

export class PtyManager {
  private ptyProcess: any = null;
  private nodePty: any = null;
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
    const args = getShellArgs(shell);

    const ptyEnv = {
      ...process.env,
      ...env,
    };

    this.ptyProcess = this.nodePty.spawn(shell, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: ptyEnv,
      // Force winpty backend on Windows. Conpty requires Worker threads
      // which Obsidian's Electron renderer does not support.
      useConpty: false,
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
