import { beforeEach, describe, expect, it, vi } from "vitest";
import { Platform } from "obsidian";
import { getShellIntegration } from "./shell-integration";

describe("PowerShell integration", () => {
  let writtenScript = "";

  beforeEach(() => {
    Platform.isWin = true;
    writtenScript = "";
    vi.stubGlobal("window", {
      require: (id: string) => {
        if (id === "path") return { join: (...parts: string[]) => parts.join("\\") };
        if (id === "fs") {
          return {
            mkdirSync: () => undefined,
            readFileSync: () => { throw new Error("ENOENT"); },
            writeFileSync: (_path: string, content: string) => { writtenScript = content; },
          };
        }
        throw new Error(`Unexpected module: ${id}`);
      },
    });
  });

  it("writes OSC markers with a PowerShell 5.1-compatible escape character", () => {
    getShellIntegration("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "C:\\plugin");

    expect(writtenScript).toContain("$__lot_esc = [char]27");
    expect(writtenScript).not.toContain("`e]133");
    expect(writtenScript).toContain("$__lot_esc]133;D;$ec$__lot_esc\\");
  });
});
