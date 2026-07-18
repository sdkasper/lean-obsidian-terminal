import { describe, it, expect } from "vitest";
import { findPathCandidates, splitLineSuffix } from "./path-links";

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
