import type { TerminalSession } from "./terminal-tab-manager";

/**
 * A key handler registered by a downstream plugin via
 * {@link TerminalPlugin.registerKeyHandler}.
 *
 * The handler receives the DOM {@link KeyboardEvent} that xterm.js passes to
 * `attachCustomKeyEventHandler` — NOT xterm's internal `IKeyboardEvent`, which is
 * not part of `@xterm/xterm`'s public type surface (it lives in `src/common` and is
 * never re-exported from `typings/xterm.d.ts`). The event therefore carries the full
 * DOM API (`metaKey`, `altKey`, `key`, `type`, `preventDefault()`, …) used by the
 * example handlers in the README.
 *
 * Handlers see every event type (`keydown`, `keyup`, `keypress`); filter on
 * `e.type === "keydown"` as the examples do.
 *
 * @param e       the keyboard event
 * @param session the terminal session the event occurred in
 * @returns `true` to let the next handler (and ultimately the built-in
 *          autocomplete/search handling) run; `false` to consume the event and stop
 *          the chain.
 */
export type TerminalKeyHandler = (e: KeyboardEvent, session: TerminalSession) => boolean;

/**
 * Plugin-level registry of downstream key handlers, shared across every terminal tab
 * (current and future) in every terminal view.
 *
 * Dispatch order is registration order: `custom[0] → … → custom[n] → built-in`. The
 * first handler to return `false` consumes the event; remaining handlers and the
 * built-in autocomplete/search handling are skipped.
 *
 * The dispatch logic is intentionally free of any Obsidian or xterm runtime
 * dependency so it can be unit-tested in isolation.
 */
export class KeyHandlerRegistry {
  private handlers: TerminalKeyHandler[] = [];

  /**
   * Register a handler. Returns a disposer that removes it. The disposer is
   * idempotent — calling it more than once is a no-op after the first call.
   */
  register(handler: TerminalKeyHandler): () => void {
    this.handlers.push(handler);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const i = this.handlers.indexOf(handler);
      if (i !== -1) this.handlers.splice(i, 1);
    };
  }

  /**
   * Run the registered handlers in order for one event.
   *
   * @returns `false` as soon as a handler consumes the event (returned `false`) — the
   *          caller must then return `false` to xterm and skip built-in handling.
   *          Returns `true` when no handler consumed the event.
   *
   * A handler that throws is logged and skipped; a misbehaving downstream handler can
   * never break the chain or the terminal.
   */
  dispatch(e: KeyboardEvent, session: TerminalSession): boolean {
    // Iterate a snapshot: a handler may unregister itself (or another) mid-dispatch,
    // which would otherwise mutate the array we are iterating.
    for (const handler of [...this.handlers]) {
      try {
        if (!handler(e, session)) return false; // consumed → stop chain
      } catch (err) {
        console.warn("[lean-terminal] key handler threw; skipping:", err);
        // continue to next handler
      }
    }
    return true; // not consumed → fall through to built-in handling
  }

  /** Number of currently-registered handlers. */
  get size(): number {
    return this.handlers.length;
  }

  /** Remove all handlers. Called on plugin unload. */
  clear(): void {
    this.handlers = [];
  }
}
