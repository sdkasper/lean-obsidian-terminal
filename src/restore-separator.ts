import type { Terminal } from "@xterm/xterm";

/** Text of the dim marker printed between a restored buffer and the new shell (#129). */
export const RESTORE_SEPARATOR_TEXT = "--- restored output, new session ---";

const ESC = "\u001b";

/**
 * Escape sequence that closes off a replayed buffer before a new shell starts.
 *
 * A restored buffer is only history: whatever program produced it (for example
 * Claude Code) is gone, but the replay leaves the cursor where that program had
 * it, usually inside its input box with a status line below. Without this, the
 * new shell prompt lands in the middle of the old UI and looks like a frozen
 * live session.
 *
 * The sequence leaves the alternate screen if the replay ended in it, resets the
 * terminal modes a TUI may have left on (hidden cursor, mouse reporting,
 * bracketed paste, application cursor keys, scroll region, origin mode, colours),
 * moves to the last row of old content, then prints a dim separator on the next
 * line. Returns an empty string when the buffer holds no content, so a blank tab
 * stays blank.
 *
 * Call it only after the replayed data has been parsed (the write callback), so
 * the buffer state it reads is final.
 */
export function restoreSeparator(terminal: Pick<Terminal, "rows" | "buffer">): string {
  // After leaving the alternate screen the normal buffer is the one that counts,
  // so read content from it even if the replay ended in the alternate one.
  const normal = terminal.buffer.normal;
  let lastContent = -1;
  for (let i = normal.length - 1; i >= 0; i--) {
    const line = normal.getLine(i);
    if (line && line.translateToString(true).trim() !== "") {
      lastContent = i;
      break;
    }
  }
  if (lastContent < 0) return "";

  // The separator goes right under the last content, wherever the old cursor was:
  // above it (inside a TUI input box) or below it (blank rows after the output).
  const row = Math.min(Math.max(lastContent - normal.baseY, 0), terminal.rows - 1);

  return (
    // Only sent when needed: leaving a screen that is not active would restore
    // a stale saved cursor.
    (terminal.buffer.active.type === "alternate" ? `${ESC}[?1049l` : "") +
    `${ESC}[0m` +
    `${ESC}[?25h` + // show cursor
    `${ESC}[?1l` + // application cursor keys off
    `${ESC}[?6l` + // origin mode off
    `${ESC}[?1000l${ESC}[?1002l${ESC}[?1003l${ESC}[?1006l` + // mouse reporting off
    `${ESC}[?1004l` + // focus reporting off
    `${ESC}[?2004l` + // bracketed paste off (the new shell turns it on if it wants it)
    `${ESC}[r` + // reset scroll region (moves the cursor home, so position after)
    `${ESC}[${row + 1};1H` +
    `\r\n${ESC}[2m${RESTORE_SEPARATOR_TEXT}${ESC}[0m\r\n`
  );
}
