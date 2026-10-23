import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import type { PtyManager } from "./pty-manager";

interface LayoutSession {
  containerEl: Pick<HTMLElement, "isConnected" | "getBoundingClientRect">;
  terminal: Pick<Terminal, "cols" | "rows" | "refresh">;
  fitAddon: Pick<FitAddon, "fit">;
  pty: Pick<PtyManager, "resize">;
}

/** Keep the terminal bottom above an overlapping floating status bar, including any bottom gap. */
export function getStatusBarInset(container: DOMRect, status: DOMRect | null): number {
  if (!status || status.width <= 0 || status.height <= 0 ||
      status.right <= container.left || status.left >= container.right ||
      status.top >= container.bottom || status.bottom <= container.top) return 0;
  return Math.ceil(Math.min(container.height, container.bottom - status.top));
}

/** Refit and repaint without sending input or replacing the running PTY. */
export function fitTerminalSession(session: LayoutSession): void {
  const { containerEl, terminal, fitAddon, pty } = session;
  const rect = containerEl.getBoundingClientRect();
  // Detached/hidden panes briefly report zero dimensions while being moved.
  if (!containerEl.isConnected || rect.width <= 0 || rect.height <= 0) return;
  fitAddon.fit();
  const { cols, rows } = terminal;
  pty.resize(cols, rows);
  terminal.refresh(0, rows - 1);
}
