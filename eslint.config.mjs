import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
  {
    ignores: [
      "main.js",
      "esbuild.config.mjs",
      "eslint.config.mjs",
      "install.mjs",
      "version-bump.mjs",
      "scripts/**",
      "__mocks__/**",
      "arm64-prebuilds/**",
      "patches/**",
    ],
  },
  // Includes typescript-eslint recommended-type-checked for TS files
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "obsidianmd/ui/sentence-case": [
        "error",
        {
          brands: ["Claude Code", "Claude", "Obsidian", "PowerShell", "Wiki-link", "Windows", "macOS", "Linux"],
          // Literal syntax and example paths in settings copy, not prose:
          // [[Note]] wiki-link syntax, file-path examples, shell command examples.
          ignoreRegex: ["\\[\\[.*\\]\\]", "[\\w~./\\\\-]+[/\\\\][\\w~./\\\\-]+", "\\(e\\.g\\..*\\)"],
        },
      ],
    },
  },
);
