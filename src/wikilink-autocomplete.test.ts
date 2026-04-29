import { describe, it, expect } from "vitest";
import { defaultResolveInsertion } from "./wikilink-autocomplete";
import type { AutocompleteEntry } from "./wikilink-autocomplete";

const makeEntry = (name: string): AutocompleteEntry => ({
  name,
  folder: "",
  path: `${name}.md`,
  isFile: true,
  mtime: 0,
});

describe("defaultResolveInsertion", () => {
  it("returns entry name followed by ']]' when an entry is selected", () => {
    expect(defaultResolveInsertion(makeEntry("My Note"), "my")).toBe("My Note]]");
  });

  it("returns query followed by ']]' when no entry is selected but query is non-empty", () => {
    expect(defaultResolveInsertion(null, "partial")).toBe("partial]]");
  });

  it("returns ']]' when no entry is selected and query is empty", () => {
    expect(defaultResolveInsertion(null, "")).toBe("]]");
  });
});
