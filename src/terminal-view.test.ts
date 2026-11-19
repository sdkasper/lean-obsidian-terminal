import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({ ItemView: class {}, FileSystemAdapter: class {} }));
vi.mock("./terminal-tab-manager", () => ({ TerminalTabManager: class {} }));
vi.mock("./recent-sessions", () => ({ pushRecentSession: vi.fn() }));

import { TerminalView } from "./terminal-view";

function fakeWindow() {
  let nextId = 0;
  const pending = new Map<number, () => void>();
  return {
    setTimeout: vi.fn((callback: () => void) => {
      pending.set(++nextId, callback);
      return nextId;
    }),
    clearTimeout: vi.fn((id: number) => { pending.delete(id); }),
    getComputedStyle: vi.fn(() => ({ visibility: "visible" })),
    run: () => {
      for (const [id, callback] of [...pending]) { pending.delete(id); callback(); }
    },
    pending,
  };
}

function harness() {
  const win = fakeWindow();
  const status = { getBoundingClientRect: () => ({ left: 100, right: 600, top: 770, bottom: 800, width: 500, height: 30 }) };
  const document = {
    querySelector: vi.fn(() => status as typeof status | null),
    body: { classList: { contains: vi.fn(() => false) } },
  };
  const container = {
    win, ownerDocument: document, isConnected: true, style: { paddingBottom: "" },
    getBoundingClientRect: () => ({ left: 0, right: 600, top: 0, bottom: 800, width: 600, height: 800 }),
  };
  const manager = { fitActive: vi.fn(), focusActive: vi.fn(), destroyAll: vi.fn() };
  const observer = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  const view = Object.create(TerminalView.prototype) as TerminalView;
  Object.assign(view, { viewContainer: container, tabManager: manager, resizeObserver: observer, resizeTimer: null, resizeWindow: null, statusBarEl: null });
  return { view, container, win, document, manager, observer, status };
}

describe("TerminalView layout lifecycle", () => {
  it("coalesces resize notifications and repaints without stealing focus", () => {
    const h = harness();
    h.view.onResize(); h.view.onResize(); h.view.onResize();
    expect(h.win.pending.size).toBe(1);
    h.win.run();
    expect(h.manager.fitActive).toHaveBeenCalledTimes(1);
    expect(h.manager.focusActive).not.toHaveBeenCalled();
    expect(h.container.style.paddingBottom).toBe("30px");
  });

  it("waits until a pane drag finishes before fitting", () => {
    const h = harness();
    h.document.body.classList.contains.mockReturnValue(true);
    h.view.onResize(); h.win.run();
    expect(h.manager.fitActive).not.toHaveBeenCalled();
    h.document.body.classList.contains.mockReturnValue(false);
    h.win.run();
    expect(h.manager.fitActive).toHaveBeenCalledTimes(1);
  });

  it("rebinds the status observer and cancels the old window timer after migration", () => {
    const h = harness();
    h.view.onResize(); h.win.run();
    h.view.onResize();
    const nextWindow = fakeWindow();
    h.container.win = nextWindow;
    h.container.ownerDocument = { ...h.document, querySelector: vi.fn(() => null) };
    h.view.onResize();
    expect(h.win.pending.size).toBe(0);
    nextWindow.run();
    expect(h.observer.unobserve).toHaveBeenCalledWith(h.status);
    expect(h.container.style.paddingBottom).toBe("0px");
  });

  it("does not reserve space for a hidden status bar", () => {
    const h = harness();
    h.win.getComputedStyle.mockReturnValue({ visibility: "hidden" });
    h.view.onResize(); h.win.run();
    expect(h.container.style.paddingBottom).toBe("0px");
  });

  it("does not fit a detached view", () => {
    const h = harness();
    h.view.onResize(); h.container.isConnected = false; h.win.run();
    expect(h.manager.fitActive).not.toHaveBeenCalled();
  });

  it("cancels queued work and disconnects observers on close", async () => {
    const h = harness();
    h.view.onResize();
    await h.view.onClose();
    h.win.run();
    expect(h.observer.disconnect).toHaveBeenCalledOnce();
    expect(h.win.pending.size).toBe(0);
    expect(h.manager.fitActive).not.toHaveBeenCalled();
    expect(h.manager.destroyAll).toHaveBeenCalledOnce();
    h.view.onResize();
    expect(h.win.pending.size).toBe(0);
  });
});
