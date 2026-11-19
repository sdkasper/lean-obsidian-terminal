import { describe, it, expect } from "vitest";
import { Terminal } from "@xterm/xterm";
import { restoreSeparator, RESTORE_SEPARATOR_TEXT } from "./restore-separator";

const ESC = "\u001b";

// Real xterm parser, as in osc52-clipboard.test.ts: the helper reads parsed
// buffer state, so a mock would only prove the mock.
function make(rows = 10, cols = 40): Terminal {
  return new Terminal({ rows, cols, allowProposedApi: true });
}

function send(terminal: Terminal, data: string): Promise<void> {
  return new Promise<void>((resolve) => terminal.write(data, resolve));
}

function lines(terminal: Terminal): string[] {
  const buf = terminal.buffer.active;
  const out: string[] = [];
  for (let i = 0; i < buf.length; i++) out.push(buf.getLine(i)?.translateToString(true) ?? "");
  return out;
}

// A replay shaped like a Claude Code screen: banner, input box, status line
// below it, and the cursor parked inside the box.
const TUI =
  "banner\r\n" +
  "------------\r\n" +
  "> prompt\r\n" +
  "------------\r\n" +
  "auto mode on" +
  `${ESC}[2A${ESC}[3G`;

describe("restoreSeparator", () => {
  it("prints the separator below the old content, not inside the old input box", async () => {
    const t = make();
    await send(t, TUI);
    expect(t.buffer.active.cursorY).toBe(2); // parked inside the box, as in #129

    await send(t, restoreSeparator(t));
    await send(t, "PROMPT$ ");

    const l = lines(t);
    expect(l.slice(0, 5)).toEqual(["banner", "------------", "> prompt", "------------", "auto mode on"]);
    expect(l[5]).toBe(RESTORE_SEPARATOR_TEXT);
    expect(l[6]).toBe("PROMPT$ ");
  });

  it("styles the separator dim", async () => {
    const t = make();
    await send(t, TUI);
    await send(t, restoreSeparator(t));

    const cell = t.buffer.active.getLine(5)?.getCell(0);
    expect(cell?.isDim()).toBeTruthy();
    // and resets, so the prompt after it is not dim
    await send(t, "X");
    expect(t.buffer.active.getLine(6)?.getCell(0)?.isDim()).toBeFalsy();
  });

  it("scrolls when the old content fills the screen", async () => {
    const t = make(4, 40);
    await send(t, "one\r\ntwo\r\nthree\r\nfour\r\nfive");

    await send(t, restoreSeparator(t));
    await send(t, "PROMPT$ ");

    const l = lines(t).filter((x) => x !== "");
    expect(l).toEqual(["one", "two", "three", "four", "five", RESTORE_SEPARATOR_TEXT, "PROMPT$ "]);
  });

  it("returns an empty string for an empty buffer", async () => {
    const t = make();
    expect(restoreSeparator(t)).toBe("");
    await send(t, "   \r\n  ");
    expect(restoreSeparator(t)).toBe("");
  });

  it("leaves the alternate screen when the replay ended in it", async () => {
    const t = make();
    await send(t, "history line\r\n");
    await send(t, `${ESC}[?1049h` + "alt screen content");
    expect(t.buffer.active.type).toBe("alternate");

    await send(t, restoreSeparator(t));

    expect(t.buffer.active.type).toBe("normal");
    const l = lines(t);
    expect(l[0]).toBe("history line");
    expect(l[1]).toBe(RESTORE_SEPARATOR_TEXT);
  });

  it("resets modes a dead TUI left on", async () => {
    const t = make();
    await send(t, "text");
    await send(t, `${ESC}[?25l${ESC}[?2004h${ESC}[?1000h${ESC}[?1h${ESC}[2;5r`);
    expect(t.modes.bracketedPasteMode).toBe(true);
    expect(t.modes.mouseTrackingMode).toBe("vt200");

    await send(t, restoreSeparator(t));

    expect(t.modes.bracketedPasteMode).toBe(false);
    expect(t.modes.mouseTrackingMode).toBe("none");
    expect(t.modes.applicationCursorKeysMode).toBe(false);
    // scroll region reset: output past the old region still lands on the right rows
    await send(t, "after");
    expect(lines(t).some((x) => x === "after")).toBe(true);
  });

  it("does not stack a second separator on a normal replay of its own output", async () => {
    // A tab saved after one restore replays: old content, separator, new shell
    // output. Each restore adds exactly one separator below everything.
    const t = make();
    await send(t, "old\r\n" + RESTORE_SEPARATOR_TEXT + "\r\nPROMPT$ ls\r\nfile");
    await send(t, restoreSeparator(t));

    const l = lines(t).filter((x) => x !== "");
    expect(l).toEqual(["old", RESTORE_SEPARATOR_TEXT, "PROMPT$ ls", "file", RESTORE_SEPARATOR_TEXT]);
  });
});
