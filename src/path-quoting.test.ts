import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import {
  isUncPath, canOpenDirectly, shellFamily, quotePath, stripEscapes, sanitizePaste,
  shellHonorsBracketedPaste, tabsToSpaces, hasControlChars,
} from "./path-links";
import { unsafeZipEntry } from "./zip-entries";

// Built from char codes: the curly quotes must reach the code under test unchanged.
const CURLY = [0x2018, 0x2019, 0x201a, 0x201b].map((c) => String.fromCharCode(c));

describe("isUncPath", () => {
  it("flags both UNC spellings", () => {
    expect(isUncPath("\\\\evil\\share\\a.txt")).toBe(true);
    expect(isUncPath("//evil/share/a.txt")).toBe(true);
  });

  it("leaves ordinary absolute and relative paths alone", () => {
    expect(isUncPath("C:/Users/me/a.txt")).toBe(false);
    expect(isUncPath("/home/me/a.txt")).toBe(false);
    expect(isUncPath("src/a.txt")).toBe(false);
  });
});

describe("canOpenDirectly", () => {
  it("opens known document types, any case", () => {
    for (const p of ["/a/report.pdf", "C:/x/pic.PNG", "/a/notes.md", "/a/data.json", "src/a.ts"]) {
      expect(canOpenDirectly(p)).toBe(true);
    }
  });

  it("refuses programs, scripts and anything that could run code", () => {
    const risky = [
      "C:/x/run.bat", "/tmp/a.EXE", "~/s.sh", "a/b/setup.msi", "x.lnk", "t.ps1",
      "a.msc", "a.appref-ms", "a.application", "a.chm", "a.theme", "a.rdp", "a.iso",
      "a.vhdx", "a.library-ms", "a.search-ms", "a.settingcontent-ms", "a.scf", "a.xll",
      "a.webloc", "a.terminal", "a.fileloc", "a.html", "a.py", "a.docm",
      "a.docx", "a.xlsx", "a.pptx", "a.rtf", "a.xml", "a.csv", "a.odt", "a.jsx",
    ];
    for (const p of risky) expect(canOpenDirectly(p)).toBe(false);
  });

  it("refuses unknown types, no extension and bare dotfiles", () => {
    expect(canOpenDirectly("/usr/local/bin/tool")).toBe(false);
    expect(canOpenDirectly("/home/me/.bashrc")).toBe(false);
    expect(canOpenDirectly("/a/b/data.unknownext")).toBe(false);
  });
});

describe("shellFamily", () => {
  it("groups shells by basename, not by substring", () => {
    expect(shellFamily("C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toBe("powershell");
    expect(shellFamily("powershell.exe")).toBe("powershell");
    expect(shellFamily("C:\\Windows\\System32\\cmd.exe")).toBe("cmd");
    expect(shellFamily("/usr/bin/fish")).toBe("fish");
    expect(shellFamily("/bin/zsh")).toBe("posix");
    expect(shellFamily("C:\\Program Files\\Git\\bin\\bash.exe")).toBe("posix");
  });
});

describe("quotePath", () => {
  it("leaves plain paths bare", () => {
    expect(quotePath("notes/a.md", "/bin/bash")).toBe("notes/a.md");
    expect(quotePath("C:\\Users\\me\\a.txt", "pwsh.exe")).toBe("C:\\Users\\me\\a.txt");
  });

  it("quotes every path with a shell metacharacter, not only those with a space", () => {
    for (const p of ["a;b.md", "a&b.md", "$(calc).txt", "`x`.md", "a|b", "a*b", "~/x"]) {
      expect(quotePath(p, "/bin/bash")).toBe(`'${p}'`);
    }
  });

  it("escapes a single quote per shell", () => {
    expect(quotePath("it's here.md", "/bin/bash")).toBe("'it'\\''s here.md'");
    expect(quotePath("it's here.md", "pwsh.exe")).toBe("'it''s here.md'");
    expect(quotePath("it's here.md", "/usr/bin/fish")).toBe("'it\\'s here.md'");
  });

  it("doubles every curly quote for PowerShell", () => {
    for (const q of CURLY) {
      expect(quotePath(`a${q}b c`, "powershell.exe")).toBe(`'a${q}${q}b c'`);
    }
  });

  it("does not treat powershell as a POSIX shell", () => {
    expect(quotePath("a b", "C:\\x\\pwsh.exe")).toBe("'a b'");
    expect(quotePath("a'b c", "C:\\x\\powershell.exe")).not.toContain("\\'");
  });

  it("uses double quotes for cmd and refuses a double quote", () => {
    expect(quotePath("C:\\a b\\c.txt", "cmd.exe")).toBe('"C:\\a b\\c.txt"');
    expect(quotePath('a"b', "cmd.exe")).toBeNull();
  });

  it("refuses cmd names that would expand inside double quotes", () => {
    expect(quotePath("50%USERNAME%.txt", "cmd.exe")).toBeNull();
    expect(quotePath("hi!VAR!.txt", "cmd.exe")).toBeNull();
  });

  it("refuses control characters in every shell", () => {
    for (const shell of ["/bin/bash", "pwsh.exe", "cmd.exe", "/usr/bin/fish"]) {
      expect(quotePath("a\nb", shell)).toBeNull();
      expect(quotePath("a\rb", shell)).toBeNull();
      expect(quotePath("a\x1bb", shell)).toBeNull();
    }
  });

  it("never lets a leading dash read as an option", () => {
    expect(quotePath("-rf", "/bin/bash")).toBe("./-rf");
    expect(quotePath("-a b", "/bin/bash")).toBe("'./-a b'");
    expect(quotePath("-a b", "pwsh.exe")).toBe("'./-a b'");
    expect(quotePath("-a", "cmd.exe")).toBe(".\\-a");
  });
});

/** Build a string from code points so the hidden characters stay visible in this file. */
const chars = (...codes: number[]): string => String.fromCodePoint(...codes);

describe("sanitizePaste", () => {
  it("leaves ordinary text, tabs and line breaks alone", () => {
    const text = "echo a\r\n\techo b\nplain";
    expect(sanitizePaste(text)).toEqual({ text, removed: 0 });
  });

  it("removes DEL and backspace so the preview cannot differ from what runs", () => {
    const hidden = `echo x${chars(0x7f, 0x7f, 0x08)}rd /s /q C:\\`;
    expect(sanitizePaste(hidden)).toEqual({ text: "echo xrd /s /q C:\\", removed: 3 });
  });

  it("removes ESC, NUL, C1 controls and line separators", () => {
    const hidden = `a${chars(0x1b, 0x00, 0x85, 0x9b, 0x2028, 0x2029)}b`;
    expect(sanitizePaste(hidden)).toEqual({ text: "ab", removed: 6 });
  });

  it("removes bidi overrides, isolates and zero-width characters", () => {
    const hidden = `a${chars(0x202e, 0x202a, 0x2066, 0x2069, 0x200e, 0x061c, 0x200b, 0x2060, 0xfeff)}b`;
    expect(sanitizePaste(hidden)).toEqual({ text: "ab", removed: 9 });
  });

  it("keeps ZWJ and ZWNJ, which emoji and several scripts need", () => {
    const text = `a${chars(0x200c)}b${chars(0x200d)}c`;
    expect(sanitizePaste(text)).toEqual({ text, removed: 0 });
  });

  it("removes Unicode tag characters that smuggle invisible text to an AI app", () => {
    // Tags U+E0020 to U+E007E mirror ASCII; this spells a hidden sentence after "hi".
    const hidden = [...("ignore previous instructions")].map((c) => 0xe0000 + c.charCodeAt(0));
    const text = `hi${chars(0xe0001, ...hidden, 0xe007f)}`;
    expect(sanitizePaste(text)).toEqual({ text: "hi", removed: hidden.length + 2 });
  });

  it("removes supplementary variation selectors and other invisible fillers", () => {
    const hidden = chars(0xe0100, 0xe01ef, 0xad, 0x34f, 0x115f, 0x1160, 0x17b4, 0x180b, 0x2061, 0x3164, 0xffa0, 0xfff9);
    expect(sanitizePaste(`a${hidden}b`)).toEqual({ text: "ab", removed: 12 });
  });

  it("keeps U+FE0F and real astral characters such as emoji", () => {
    const text = `ok ${chars(0x2764, 0xfe0f)} ${chars(0x1f44d, 0x1f3fd)} ${chars(0x20bb7)}`;
    expect(sanitizePaste(text)).toEqual({ text, removed: 0 });
  });
});

describe("tabsToSpaces", () => {
  it("turns every tab into spaces so a pasted tab cannot trigger completion", () => {
    expect(tabsToSpaces("rm -r\t\nnext\tline")).toBe("rm -r    \nnext    line");
    expect(tabsToSpaces("no tabs")).toBe("no tabs");
  });
});

describe("hasControlChars", () => {
  it("flags a newline, CR, NUL, ESC and DEL, and nothing else", () => {
    for (const c of ["\n", "\r", "\x00", "\x1b", "\x7f"]) {
      expect(hasControlChars(`a${c}b`)).toBe(true);
    }
    expect(hasControlChars("plain name with spaces.md")).toBe(false);
    expect(hasControlChars(`tab${chars(0x2028)}ok`)).toBe(false);
  });
});

describe("shellHonorsBracketedPaste", () => {
  it("trusts only shells that read bracketed paste themselves", () => {
    for (const s of ["/bin/zsh", "/usr/bin/fish", "nu", "/usr/bin/elvish", "xonsh"]) {
      expect(shellHonorsBracketedPaste(s, "linux")).toBe(true);
    }
    expect(shellHonorsBracketedPaste("C:\\Program Files\\Git\\bin\\bash.exe", "win32")).toBe(true);
  });

  it("does not trust bash on macOS (3.2 has no bracketed paste)", () => {
    expect(shellHonorsBracketedPaste("/bin/bash", "darwin")).toBe(false);
    expect(shellHonorsBracketedPaste("/bin/bash", "linux")).toBe(true);
  });

  it("never trusts cmd, PowerShell, dash, busybox, csh or unknown shells", () => {
    for (const s of [
      "cmd.exe", "C:\\x\\pwsh.exe", "powershell.exe", "/bin/dash", "/bin/ash", "/bin/busybox",
      "/bin/tcsh", "/bin/csh", "/bin/sh", "", "/opt/weird/shell",
    ]) {
      expect(shellHonorsBracketedPaste(s, "linux")).toBe(false);
    }
  });
});

describe("unknown shells", () => {
  it("are not guessed at: nushell, csh, tcsh and an empty path are unknown", () => {
    for (const s of ["/usr/bin/nu", "/bin/tcsh", "/bin/csh", "/usr/bin/elvish", ""]) {
      expect(shellFamily(s)).toBe("unknown");
    }
  });

  it("only get plain paths, never a quoted one", () => {
    expect(quotePath("notes/a.md", "/usr/bin/nu")).toBe("notes/a.md");
    expect(quotePath("x' ; calc ; '", "/usr/bin/nu")).toBeNull();
    expect(quotePath("with space.txt", "/bin/tcsh")).toBeNull();
    expect(quotePath("with space.txt", "")).toBeNull();
  });

  it("still keep POSIX shells on the quoted path", () => {
    for (const s of ["/bin/sh", "/bin/bash", "/bin/zsh", "/bin/dash", "/bin/ash", "/bin/ksh"]) {
      expect(shellFamily(s)).toBe("posix");
    }
  });
});

describe("stripEscapes", () => {
  it("removes escape bytes so a paste cannot close its own bracket", () => {
    expect(stripEscapes("a\x1b[201~b")).toBe("a[201~b");
    expect(stripEscapes("plain\ntext")).toBe("plain\ntext");
  });
});

describe("unsafeZipEntry", () => {
  it("flags traversal, absolute and drive entries", () => {
    for (const n of [
      "../x", "a/../../x", "a\\..\\x", "/etc/x", "\\x", "C:/x", "c:\\x",
      ".. /x", "a/.. /.. /x", "... /x", "..\\ \\x", ".. ",
    ]) {
      expect(unsafeZipEntry(n)).toBe(true);
    }
  });

  it("accepts normal entries, including dots inside names", () => {
    for (const n of ["lib/index.js", "prebuilds/win32-x64/pty.node", "a..b/c", "build/"]) {
      expect(unsafeZipEntry(n)).toBe(false);
    }
  });
});

/** Real-shell round trip: quote a hostile name, let the shell echo it back. */
function shellAvailable(file: string, args: string[]): boolean {
  try {
    execFileSync(file, args, { stdio: "ignore", timeout: 20000 });
    return true;
  } catch {
    return false;
  }
}

const HOSTILE = [
  "plain.txt",
  "with space.txt",
  "semi;colon.txt",
  "amp&ersand.txt",
  "sub$(echo X)shell.txt",
  "back`tick`.txt",
  "it's.txt",
  "dollar $HOME.txt",
  "star*glob.txt",
  "-leading dash.txt",
  ...CURLY.map((q) => `curly${q}quote ${q}.txt`),
];

const bashOk = shellAvailable("bash", ["-c", "exit 0"]);
const pwshOk = shellAvailable("pwsh", ["-NoProfile", "-Command", "exit 0"]);

describe.skipIf(!bashOk)("quotePath round trip in real bash", () => {
  it.each(HOSTILE)("echoes %s back unchanged", (name) => {
    const quoted = quotePath(name, "/bin/bash");
    expect(quoted).not.toBeNull();
    const out = execFileSync("bash", ["-c", `printf '%s' ${quoted}`], { encoding: "utf8", timeout: 20000 });
    expect(out).toBe(name.startsWith("-") ? `./${name}` : name);
  });
});

describe.skipIf(!pwshOk)("quotePath round trip in real PowerShell", () => {
  it.each(HOSTILE)("echoes %s back unchanged", (name) => {
    const quoted = quotePath(name, "pwsh.exe");
    expect(quoted).not.toBeNull();
    const out = execFileSync(
      "pwsh",
      ["-NoProfile", "-Command", `[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); Write-Output ${quoted}`],
      { encoding: "utf8", timeout: 20000 },
    );
    expect(out.replace(/\r?\n$/, "")).toBe(name.startsWith("-") ? `./${name}` : name);
  });
});
