import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import {
  findPathCandidates,
  splitLineSuffix,
  shellQuoteAlways,
  buildExternalCommand,
  externalCommandMissingFile,
} from "./path-links";

describe("findPathCandidates", () => {
  const values = (text: string): string[] => findPathCandidates(text).map((c) => c.value);

  it("keeps a :line suffix on a path with a slash", () => {
    expect(values("edit src/main.ts:42 please")).toEqual(["src/main.ts:42"]);
  });

  it("keeps a :line suffix on a BARE filename (the common tsc/grep shape)", () => {
    // Regression guard: group 5 previously stopped at the ':' and dropped the line.
    expect(values("open CLAUDE.md:5 now")).toEqual(["CLAUDE.md:5"]);
    expect(values("index.ts:42")).toEqual(["index.ts:42"]);
  });

  it("keeps a :line:col suffix (tsc error format)", () => {
    expect(values("main.ts:10:5 - error TS2345")).toEqual(["main.ts:10:5"]);
  });

  it("still matches a bare filename with no line suffix", () => {
    expect(values("see config.json for details")).toEqual(["config.json"]);
  });

  it("captures quoted paths and Windows drive-absolute paths", () => {
    expect(values('open "my file.ts:9" ok')).toEqual(["my file.ts:9"]);
    expect(values("C:/Users/x/file.ts:42")).toEqual(["C:/Users/x/file.ts:42"]);
  });

  it("strips trailing prose punctuation", () => {
    expect(values("look at notes.md.")).toEqual(["notes.md"]);
  });
});

describe("splitLineSuffix", () => {
  it("returns the candidate unchanged when there is no line suffix", () => {
    expect(splitLineSuffix("src/main.ts")).toEqual({ path: "src/main.ts", line: null });
    expect(splitLineSuffix("CLAUDE.md")).toEqual({ path: "CLAUDE.md", line: null });
  });

  it("peels a trailing :line suffix", () => {
    expect(splitLineSuffix("src/main.ts:42")).toEqual({ path: "src/main.ts", line: 42 });
  });

  it("peels a trailing :line:col suffix, keeping the line", () => {
    expect(splitLineSuffix("src/main.ts:42:10")).toEqual({ path: "src/main.ts", line: 42 });
  });

  it("does not mistake a Windows drive colon for a line separator", () => {
    expect(splitLineSuffix("C:/Users/x/file.ts")).toEqual({ path: "C:/Users/x/file.ts", line: null });
    expect(splitLineSuffix("C:/Users/x/file.ts:42")).toEqual({ path: "C:/Users/x/file.ts", line: 42 });
  });

  it("strips the suffix but nulls the line for out-of-range values (0 / overflow)", () => {
    // Path is still peeled so the file can open — just without a bogus line jump.
    expect(splitLineSuffix("file.ts:0")).toEqual({ path: "file.ts", line: null });
    expect(splitLineSuffix("file.ts:99999999999999999999")).toEqual({ path: "file.ts", line: null });
  });

  it("does not treat a dotted version fragment as a line", () => {
    expect(splitLineSuffix("v1.2.3")).toEqual({ path: "v1.2.3", line: null });
  });
});

describe("shellQuoteAlways", () => {
  it("single-quotes for POSIX shells, and for an UNKNOWN/empty shell (safe default)", () => {
    expect(shellQuoteAlways("/a/b/c.ts", "/bin/zsh")).toBe("'/a/b/c.ts'");
    expect(shellQuoteAlways("/a/b/c.ts", "/bin/bash")).toBe("'/a/b/c.ts'");
    // Empty shell path = the real default before any shell is configured. Must NOT
    // fall to a double-quote branch (which an interpolating shell would expand).
    expect(shellQuoteAlways("/a/b/c.ts", "")).toBe("'/a/b/c.ts'");
  });

  it("neutralizes shell metacharacters in POSIX single quotes", () => {
    expect(shellQuoteAlways("/a/$(rm -rf ~)/c.ts", "/bin/zsh")).toBe("'/a/$(rm -rf ~)/c.ts'");
    expect(shellQuoteAlways("/a/`id`/c.ts", "/bin/bash")).toBe("'/a/`id`/c.ts'");
    expect(shellQuoteAlways("/a/$HOME/c.ts", "/bin/sh")).toBe("'/a/$HOME/c.ts'");
    expect(shellQuoteAlways("/a/x; rm/c.ts", "/bin/bash")).toBe("'/a/x; rm/c.ts'");
  });

  it("escapes embedded single quotes for POSIX shells", () => {
    expect(shellQuoteAlways("/a/it's/c.ts", "/bin/sh")).toBe("'/a/it'\\''s/c.ts'");
  });

  it("uses basename, not substring — C:/Users/Josh/cmd.exe is cmd, not POSIX", () => {
    // "Josh" and the ".exe" path contain "sh"; a substring check would misroute it.
    expect(shellQuoteAlways("C:/a b/c.ts", "C:/Users/Josh/cmd.exe")).toBe('"C:/a b/c.ts"');
  });

  it("doubles embedded single quotes for PowerShell (not the bash escape)", () => {
    expect(shellQuoteAlways("C:/it's/c.ts", "powershell.exe")).toBe("'C:/it''s/c.ts'");
    expect(shellQuoteAlways("C:/a b/c.ts", "C:/Program Files/PowerShell/7/pwsh.exe")).toBe(
      "'C:/a b/c.ts'",
    );
  });

  it("double-quotes for cmd.exe (neutralizing & | < >)", () => {
    expect(shellQuoteAlways("C:/a b/c.ts", "cmd.exe")).toBe('"C:/a b/c.ts"');
    expect(shellQuoteAlways("C:/a&b/c.ts", "cmd.exe")).toBe('"C:/a&b/c.ts"');
  });
});

describe("buildExternalCommand", () => {
  it("substitutes %F (quoted path) and %L (line)", () => {
    expect(buildExternalCommand("micro +%L -- %F", "/a/b.ts", 42, "/bin/zsh")).toBe(
      "micro +42 -- '/a/b.ts'",
    );
  });

  it("defaults %L to 1 when no line is known", () => {
    expect(buildExternalCommand("micro +%L -- %F", "/a/b.ts", null, "/bin/zsh")).toBe(
      "micro +1 -- '/a/b.ts'",
    );
  });

  it("does not re-interpret placeholder-looking characters inside the path", () => {
    expect(buildExternalCommand("micro +%L -- %F", "/a/%Lb.ts", 7, "/bin/bash")).toBe(
      "micro +7 -- '/a/%Lb.ts'",
    );
  });

  it("supports multiple occurrences of each placeholder", () => {
    expect(buildExternalCommand("echo %L; open %F %F", "/a/b.ts", 3, "/bin/zsh")).toBe(
      "echo 3; open '/a/b.ts' '/a/b.ts'",
    );
  });
});

describe("externalCommandMissingFile", () => {
  it("is false for an empty template and for one containing %F", () => {
    expect(externalCommandMissingFile("")).toBe(false);
    expect(externalCommandMissingFile("   ")).toBe(false);
    expect(externalCommandMissingFile("micro +%L -- %F")).toBe(false);
  });

  it("is true for a non-empty template without %F", () => {
    expect(externalCommandMissingFile("micro +%L")).toBe(true);
  });
});

// Contract test: prove the quoted path survives a REAL POSIX shell as exactly one
// literal argument — the ultimate check that shellQuoteAlways prevents injection.
// Runs only where bash is available (ubuntu CI + macOS); skipped on Windows.
// --noprofile --norc AND a cleared BASH_ENV: non-interactive bash still sources
// $BASH_ENV even with --norc (some setups point it at a shell-integration script
// that emits OSC markers), so clear it to test pure bash quoting/parsing.
const cleanBashEnv = { ...process.env, BASH_ENV: "", ENV: "" };
const hasBash = (() => {
  try {
    execFileSync("bash", ["--noprofile", "--norc", "-c", "true"], { env: cleanBashEnv });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasBash)("shellQuoteAlways — real bash round-trip", () => {
  const roundTrip = (path: string): string =>
    execFileSync(
      "bash",
      ["--noprofile", "--norc", "-c", `printf %s ${shellQuoteAlways(path, "/bin/bash")}`],
      { encoding: "utf8", env: cleanBashEnv },
    );

  const adversarial = [
    "/tmp/plain.ts",
    "/tmp/with space.ts",
    "/tmp/$(touch pwned).ts",
    "/tmp/`touch pwned`.ts",
    "/tmp/$HOME.ts",
    "/tmp/a;rm -rf b.ts",
    "/tmp/a&&b.ts",
    "/tmp/it's a file.ts",
    "/tmp/quote\"and'both.ts",
    "/tmp/pipe|redirect>.ts",
  ];

  for (const path of adversarial) {
    it(`passes ${JSON.stringify(path)} through as a single literal argument`, () => {
      expect(roundTrip(path)).toBe(path);
    });
  }
});
