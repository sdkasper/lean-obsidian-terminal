# Key Handler API

Lean Terminal exposes a small public API so **other plugins** can add their own terminal key bindings — Mac-style line navigation, Vim/Emacs bindings, vendor-specific remaps — without forking the plugin or replacing its built-in `[[`-autocomplete and search handling.

xterm.js only supports a single `attachCustomKeyEventHandler`, so calling it directly from another plugin would *replace* Lean Terminal's built-in handler rather than compose with it. This API solves that by maintaining an internal list of handlers that are walked before the built-in logic.

## API

On the plugin instance (`app.plugins.plugins["lean-terminal"]`):

```ts
registerKeyHandler(
  handler: (e: KeyboardEvent, session: TerminalSession) => boolean
): () => void
```

Returns an **unregister function**. Call it when your plugin unloads.

### Parameters

| Name | Type | Description |
|------|------|-------------|
| `e` | `KeyboardEvent` | The DOM keyboard event xterm.js passes to `attachCustomKeyEventHandler`. Carries the full DOM API (`metaKey`, `ctrlKey`, `altKey`, `shiftKey`, `key`, `type`, `preventDefault()`, …). Handlers receive every event type (`keydown`, `keyup`, `keypress`) — filter on `e.type`. |
| `session` | `TerminalSession` | The terminal session the event occurred in. Use `session.pty.write(data)` to send bytes to the shell, `session.terminal` for the xterm instance, etc. |

### Return value (per handler)

| Return | Meaning |
|--------|---------|
| `true` | Not handled — continue to the next handler, and ultimately to the built-in autocomplete/search handling. |
| `false` | Handled — **consume** the event and **stop** the chain (no further custom handlers, no built-in handling). |

## Execution order

Handlers run in **registration order**, before the built-in handling:

```
custom[0] → custom[1] → … → custom[n] → built-in autocomplete/search
```

The first handler to return `false` wins; everything after it (including the built-in handler) is skipped for that event.

## Error isolation

If a handler throws, the error is logged (`console.warn`) and the handler is skipped — the chain continues to the next handler and the terminal is unaffected. A buggy downstream handler can never crash the terminal or block other handlers.

## Event type: DOM `KeyboardEvent`, not `IKeyboardEvent`

The handler receives the DOM `KeyboardEvent` xterm passes to `attachCustomKeyEventHandler` — **not** xterm's internal `IKeyboardEvent`. `IKeyboardEvent` is not part of `@xterm/xterm`'s public type surface (it lives in the library's `src/common` and is not re-exported from `typings/xterm.d.ts`), so it cannot be imported from `@xterm/xterm` and would not compile. The DOM `KeyboardEvent` is what every example here relies on.

## Example: Mac-style line navigation

A companion plugin can add `Cmd`/`Option`+Arrow line navigation in a few lines:

```ts
export default class MacNavPlugin extends Plugin {
  onload() {
    const leanTerm = this.app.plugins.plugins["lean-terminal"];
    if (!leanTerm?.registerKeyHandler) return; // Lean Terminal not installed/updated

    const unregister = leanTerm.registerKeyHandler((e, session) => {
      if (e.type !== "keydown") return true;
      if (e.metaKey && e.key === "ArrowLeft")  { session.pty.write("\x01"); return false; } // ^A  start of line
      if (e.metaKey && e.key === "ArrowRight") { session.pty.write("\x05"); return false; } // ^E  end of line
      if (e.altKey  && e.key === "ArrowLeft")  { session.pty.write("\x1bb"); return false; } // ⎋b  back one word
      if (e.altKey  && e.key === "ArrowRight") { session.pty.write("\x1bf"); return false; } // ⎋f  forward one word
      return true;
    });

    // Ensures the handler is removed when this plugin unloads.
    this.register(unregister);
  }
}
```

## Typing `TerminalSession` in your plugin

`TerminalSession` and the `TerminalKeyHandler` type alias are exported from Lean Terminal's entry module for downstream typing. If you don't depend on Lean Terminal's types directly, you can model the minimal shape you use:

```ts
interface MinimalTerminalSession {
  id: string;
  pty: { write(data: string): void };
  terminal: import("@xterm/xterm").Terminal;
}
```

## Lifecycle notes

- Handlers apply to **all terminal tabs**, current and future, across every terminal view/pane.
- The registry is cleared when Lean Terminal itself unloads; you should still call your unregister function on your own plugin's unload so re-enabling your plugin doesn't double-register.
