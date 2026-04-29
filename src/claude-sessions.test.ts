import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, unlink } from "fs/promises";
import * as nodeFs from "fs";

// readFirstUserPrompt uses window.require("fs") — stub it to Node's fs module.
beforeAll(() => {
  vi.stubGlobal("window", { require: (_mod: string) => nodeFs });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

import { encodeProjectDir, readFirstUserPrompt } from "./claude-sessions";

// encodeProjectDir and the internal cleanPrompt/truncate functions are tested
// via their public exports.

// ---------------------------------------------------------------------------
// encodeProjectDir
// ---------------------------------------------------------------------------

describe("encodeProjectDir", () => {
  it("replaces backslashes and special chars with hyphens", () => {
    expect(encodeProjectDir("C:\\Users\\foo")).toBe("C--Users-foo");
  });

  it("replaces forward slashes with hyphens", () => {
    expect(encodeProjectDir("/home/user/project")).toBe("-home-user-project");
  });

  it("leaves alphanumerics and hyphens unchanged", () => {
    expect(encodeProjectDir("my-project-123")).toBe("my-project-123");
  });

  it("encodes spaces and dots", () => {
    expect(encodeProjectDir("my project.ts")).toBe("my-project-ts");
  });
});

// ---------------------------------------------------------------------------
// readFirstUserPrompt
// ---------------------------------------------------------------------------

async function writeTmp(content: string): Promise<string> {
  const file = join(tmpdir(), `claude-test-${Date.now()}-${Math.random()}.jsonl`);
  await writeFile(file, content, "utf-8");
  return file;
}

describe("readFirstUserPrompt", () => {
  it("reads first user message with string content", async () => {
    const file = await writeTmp(
      `{"type":"assistant","message":{"content":"hi"}}\n` +
      `{"type":"user","message":{"content":"hello from test"}}\n`
    );
    try {
      expect(await readFirstUserPrompt(file)).toBe("hello from test");
    } finally {
      await unlink(file);
    }
  });

  it("reads from array-format content (C1 regression)", async () => {
    const file = await writeTmp(
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "array prompt" }] },
      }) + "\n"
    );
    try {
      expect(await readFirstUserPrompt(file)).toBe("array prompt");
    } finally {
      await unlink(file);
    }
  });

  it("skips isMeta messages and returns next real user message", async () => {
    const file = await writeTmp(
      JSON.stringify({ type: "user", isMeta: true, message: { content: "meta" } }) + "\n" +
      JSON.stringify({ type: "user", message: { content: "real" } }) + "\n"
    );
    try {
      expect(await readFirstUserPrompt(file)).toBe("real");
    } finally {
      await unlink(file);
    }
  });

  it("skips non-user message types", async () => {
    const file = await writeTmp(
      JSON.stringify({ type: "assistant", message: { content: "assistant reply" } }) + "\n" +
      JSON.stringify({ type: "user", message: { content: "user turn" } }) + "\n"
    );
    try {
      expect(await readFirstUserPrompt(file)).toBe("user turn");
    } finally {
      await unlink(file);
    }
  });

  it("skips malformed JSONL lines without throwing", async () => {
    const file = await writeTmp(
      "not json at all\n" +
      JSON.stringify({ type: "user", message: { content: "after bad line" } }) + "\n"
    );
    try {
      expect(await readFirstUserPrompt(file)).toBe("after bad line");
    } finally {
      await unlink(file);
    }
  });

  it("returns empty string for an empty file", async () => {
    const file = await writeTmp("");
    try {
      expect(await readFirstUserPrompt(file)).toBe("");
    } finally {
      await unlink(file);
    }
  });

  it("truncates prompts longer than 100 characters", async () => {
    const long = "x".repeat(150);
    const file = await writeTmp(
      JSON.stringify({ type: "user", message: { content: long } }) + "\n"
    );
    try {
      const result = await readFirstUserPrompt(file);
      expect(result.length).toBe(100);
      expect(result.endsWith("…")).toBe(true);
    } finally {
      await unlink(file);
    }
  });
});
