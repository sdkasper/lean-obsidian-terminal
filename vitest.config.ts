import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { obsidian: path.resolve(__dirname, "__mocks__/obsidian.ts") },
  },
  test: {
    environment: "node",
    // Restrict collection to this checkout's src - without this, vitest also
    // picks up test files from agent worktrees under .claude/worktrees/ and
    // inflates the suite with duplicates.
    include: ["src/**/*.test.ts"],
  },
});
