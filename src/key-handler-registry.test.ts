import { describe, it, expect, vi, beforeEach } from "vitest";
import { KeyHandlerRegistry, type TerminalKeyHandler } from "./key-handler-registry";
import type { TerminalSession } from "./terminal-tab-manager";

// The registry never inspects the event or session internals — only the handlers do —
// so minimal stand-ins are sufficient and keep the test free of xterm/Obsidian runtime.
const ev = (over: Partial<KeyboardEvent> = {}): KeyboardEvent =>
  ({ type: "keydown", key: "a", ...over }) as unknown as KeyboardEvent;
const session = { id: "s1" } as unknown as TerminalSession;

describe("KeyHandlerRegistry", () => {
  let reg: KeyHandlerRegistry;
  beforeEach(() => { reg = new KeyHandlerRegistry(); });

  it("dispatch with no handlers does not consume (returns true)", () => {
    expect(reg.dispatch(ev(), session)).toBe(true);
  });

  it("passes the event and session through to the handler", () => {
    const e = ev({ key: "ArrowLeft", altKey: true });
    const handler = vi.fn<TerminalKeyHandler>(() => true);
    reg.register(handler);
    reg.dispatch(e, session);
    expect(handler).toHaveBeenCalledWith(e, session);
  });

  it("a handler returning true lets the chain fall through (dispatch true)", () => {
    reg.register(() => true);
    expect(reg.dispatch(ev(), session)).toBe(true);
  });

  it("a handler returning false consumes the event (dispatch false)", () => {
    reg.register(() => false);
    expect(reg.dispatch(ev(), session)).toBe(false);
  });

  it("runs handlers in registration order and stops at the first that consumes", () => {
    const calls: number[] = [];
    reg.register(() => { calls.push(1); return true; });
    reg.register(() => { calls.push(2); return false; }); // consumes
    reg.register(() => { calls.push(3); return true; });  // must not run
    expect(reg.dispatch(ev(), session)).toBe(false);
    expect(calls).toEqual([1, 2]);
  });

  it("isolates a throwing handler: logs, skips it, continues the chain", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const after = vi.fn<TerminalKeyHandler>(() => true);
    reg.register(() => { throw new Error("boom"); });
    reg.register(after);
    expect(reg.dispatch(ev(), session)).toBe(true);
    expect(after).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("a throwing handler does not prevent a later handler from consuming", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reg.register(() => { throw new Error("boom"); });
    reg.register(() => false);
    expect(reg.dispatch(ev(), session)).toBe(false);
    warn.mockRestore();
  });

  it("unregister removes the handler", () => {
    const handler = vi.fn<TerminalKeyHandler>(() => false);
    const off = reg.register(handler);
    off();
    expect(reg.dispatch(ev(), session)).toBe(true); // no longer consumes
    expect(handler).not.toHaveBeenCalled();
  });

  it("unregister is idempotent", () => {
    const a = vi.fn<TerminalKeyHandler>(() => true);
    const b = vi.fn<TerminalKeyHandler>(() => true);
    const offA = reg.register(a);
    reg.register(b);
    offA();
    offA(); // second call must be a no-op, must not remove b
    expect(reg.size).toBe(1);
    reg.dispatch(ev(), session);
    expect(b).toHaveBeenCalledOnce();
  });

  it("a handler that unregisters another mid-dispatch does not corrupt iteration", () => {
    const calls: string[] = [];
    let offB: () => void = () => {};
    reg.register(() => { calls.push("a"); offB(); return true; }); // removes b during dispatch
    offB = reg.register(() => { calls.push("b"); return true; });
    reg.register(() => { calls.push("c"); return true; });
    // Snapshot semantics: all three present at dispatch start still run this event.
    expect(reg.dispatch(ev(), session)).toBe(true);
    expect(calls).toEqual(["a", "b", "c"]);
    // But b is gone for the next event.
    calls.length = 0;
    reg.dispatch(ev(), session);
    expect(calls).toEqual(["a", "c"]);
  });

  it("size reflects registrations and removals; clear empties", () => {
    expect(reg.size).toBe(0);
    const off1 = reg.register(() => true);
    reg.register(() => true);
    expect(reg.size).toBe(2);
    off1();
    expect(reg.size).toBe(1);
    reg.clear();
    expect(reg.size).toBe(0);
    expect(reg.dispatch(ev(), session)).toBe(true);
  });
});
