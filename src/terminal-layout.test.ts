import { describe, it, expect, vi } from "vitest";
import { getStatusBarInset, fitTerminalSession } from "./terminal-layout";

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height } as DOMRect);

describe("floating status bar", () => {
  it("reserves the observed Things theme overlap, rounded up to a full pixel", () => {
    expect(getStatusBarInset(rect(1109, 75, 598, 837), rect(1185, 881.33, 522, 30.67))).toBe(31);
  });
  it("reserves space through a floating status bar's top when it has a bottom gap", () => {
    expect(getStatusBarInset(rect(0, 0, 600, 800), rect(100, 760, 500, 30))).toBe(40);
  });
  it("does not reserve space for a status bar entirely above the view", () => {
    const container = rect(0, 100, 600, 700);
    expect(getStatusBarInset(container, rect(100, 60, 500, 30))).toBe(0);
    expect(getStatusBarInset(container, rect(100, 70, 500, 30))).toBe(0);
  });
  it("does not reserve space for a status bar docked below the view", () => {
    expect(getStatusBarInset(rect(1109, 75, 598, 806), rect(1185, 881, 522, 31))).toBe(0);
  });
  it("leaves panes above or beside the status bar unchanged", () => {
    const status = rect(1185, 881, 522, 31);
    expect(getStatusBarInset(rect(100, 75, 600, 837), status)).toBe(0);
    expect(getStatusBarInset(rect(1109, 75, 598, 400), status)).toBe(0);
    expect(getStatusBarInset(rect(1109, 75, 598, 837), null)).toBe(0);
    expect(getStatusBarInset(rect(1109, 75, 598, 837), rect(0, 0, 0, 0))).toBe(0);
  });
});

function session(visible = true) {
  return {
    containerEl: { isConnected: true, getBoundingClientRect: () => rect(0, 0, visible ? 600 : 0, visible ? 800 : 0) },
    terminal: { cols: 71, rows: 50, refresh: vi.fn() },
    fitAddon: { fit: vi.fn() },
    pty: { resize: vi.fn(), write: vi.fn(), kill: vi.fn() },
  };
}

describe("terminal moving and repainting", () => {
  it("ignores the transient zero size during pane reparenting", () => {
    const s = session(false);
    fitTerminalSession(s);
    expect(s.fitAddon.fit).not.toHaveBeenCalled();
    expect(s.pty.resize).not.toHaveBeenCalled();
  });
  it("does not fit a detached pane even when its previous dimensions remain available", () => {
    const s = session();
    s.containerEl.isConnected = false;
    fitTerminalSession(s);
    expect(s.pty.resize).not.toHaveBeenCalled();
  });
  it("sends the dimensions produced by fit, rather than the old dimensions", () => {
    const s = session();
    s.fitAddon.fit.mockImplementation(() => { s.terminal.cols = 90; s.terminal.rows = 30; });
    fitTerminalSession(s);
    expect(s.pty.resize).toHaveBeenCalledWith(90, 30);
    expect(s.terminal.refresh).toHaveBeenCalledWith(0, 29);
  });
  it("refreshes every visible row but does not resize the PTY when the dimensions did not change", () => {
    const s = session();
    fitTerminalSession(s);
    expect(s.fitAddon.fit).toHaveBeenCalledOnce();
    expect(s.terminal.refresh).toHaveBeenCalledWith(0, 49);
    expect(s.pty.resize).not.toHaveBeenCalled();
  });
  it("resizes the PTY when only the rows or only the columns changed", () => {
    const rowsOnly = session();
    rowsOnly.fitAddon.fit.mockImplementation(() => { rowsOnly.terminal.rows = 40; });
    fitTerminalSession(rowsOnly);
    expect(rowsOnly.pty.resize).toHaveBeenCalledWith(71, 40);
    const colsOnly = session();
    colsOnly.fitAddon.fit.mockImplementation(() => { colsOnly.terminal.cols = 80; });
    fitTerminalSession(colsOnly);
    expect(colsOnly.pty.resize).toHaveBeenCalledWith(80, 50);
  });
});
