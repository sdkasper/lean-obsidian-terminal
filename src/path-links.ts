/**
 * Pure helpers for turning clicked terminal path tokens into open actions.
 *
 * This module holds only pure string transforms (no `obsidian`/`@xterm` imports),
 * so it can be unit-tested directly — the terminal module pulls in xterm, which
 * needs a DOM and cannot be imported under the node test environment. The
 * stateful, filesystem/vault-aware resolution (`resolvePathTarget`) stays in
 * terminal-tab-manager.ts.
 */

/** Trailing characters that are usually prose punctuation, not part of a path. */
const PATH_TRAILING_PUNCTUATION = /[.,;:!?)\]}>'"]+$/;

/**
 * Find path-like tokens on a line: single/double-quoted strings, unquoted runs
 * containing a slash (forward or back, for Windows paths), or a bare
 * `filename.ext` — each optionally followed by a `:line[:col]` suffix. Each result
 * carries the 0-based column span of the token (surrounding quotes excluded) so a
 * link range can be built.
 */
export function findPathCandidates(text: string): { value: string; start: number; end: number }[] {
  const results: { value: string; start: number; end: number }[] = [];
  // 1: Windows drive-absolute  2: 'quoted'  3: "quoted"  4: unquoted path with a slash
  // 5: bare filename.ext with an optional :line[:col] suffix (slash paths already
  //    keep the suffix via group 4's colon-inclusive class; group 5 must opt in).
  const re =
    /([A-Za-z]:[/\\][^"'`<>|?*\n]+)|'([^']+)'|"([^"]+)"|([^\s"'`()<>]*[\\/][^\s"'`()<>]+)|([^\s"'`()<>\\/]+\.[A-Za-z0-9]+(?::\d+(?::\d+)?)?)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const driveAbsolute = match[1];
    if (driveAbsolute !== undefined) {
      const trimmed = driveAbsolute.replace(PATH_TRAILING_PUNCTUATION, "");
      if (trimmed.length > 0) {
        results.push({ value: trimmed, start: match.index, end: match.index + trimmed.length });
      }
      continue;
    }
    const quoted = match[2] ?? match[3];
    if (quoted !== undefined) {
      const start = match.index + 1; // skip the opening quote
      results.push({ value: quoted, start, end: start + quoted.length });
      continue;
    }
    const trimmed = (match[4] ?? match[5]).replace(PATH_TRAILING_PUNCTUATION, "");
    if (trimmed.length === 0) continue;
    results.push({ value: trimmed, start: match.index, end: match.index + trimmed.length });
  }
  return results;
}

/**
 * Split a trailing `:line` or `:line:col` suffix off a path candidate. Editors,
 * compilers, grep, and TUIs such as Claude Code print file references as
 * `path:line[:col]`; the suffix must be removed before the path can resolve to a
 * real file. Returns the bare path and the 1-based line, or `line: null` when
 * there is no suffix OR the number is out of range (0, negative, or beyond the
 * safe-integer range) — in which case the path is still stripped so the file can
 * open, just without a line jump.
 *
 * The path group is lazy so a Windows drive letter (`C:/…`) or a mid-path colon is
 * not mistaken for a line separator — only a trailing `:digits[:digits]` is.
 */
export function splitLineSuffix(candidate: string): { path: string; line: number | null } {
  const match = /^(.*?):(\d+)(?::\d+)?$/.exec(candidate);
  if (!match) return { path: candidate, line: null };
  const parsed = Number(match[2]);
  const line = Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
  return { path: match[1], line };
}

/** Shell families with distinct string-quoting rules. */
type ShellFamily = "posix" | "powershell" | "cmd";

/**
 * Classify a shell by its binary basename (NOT a substring of the full path — a
 * path like `C:\Users\Josh\cmd.exe` must not be read as POSIX because it contains
 * "sh"). An unknown or empty shell falls back to POSIX, whose single-quoting never
 * allows expansion and is therefore the safe default.
 */
function shellFamily(shellPath: string): ShellFamily {
  const base = (shellPath.toLowerCase().replace(/\\/g, "/").split("/").pop() ?? "").replace(
    /\.exe$/,
    "",
  );
  if (base === "pwsh" || base === "powershell") return "powershell";
  if (base === "cmd") return "cmd";
  return "posix"; // bash/zsh/sh/dash/fish/ksh/… and the safe default for unknown
}

/**
 * Quote a path so it survives as a single literal argument in the given shell.
 * Always quotes (unlike `quotePath`, which skips paths without spaces), so paths
 * containing shell metacharacters — `$(…)`, backticks, `$VAR`, `;`, `&`, spaces,
 * `%VAR%` — cannot be interpreted by the shell the command is typed into.
 */
export function shellQuoteAlways(rawPath: string, shellPath: string): string {
  switch (shellFamily(shellPath)) {
    case "powershell":
      // PowerShell single-quoted literal: an embedded ' is escaped by doubling it.
      // (Backslash is NOT an escape char in PowerShell, so the POSIX trick is wrong.)
      return `'${rawPath.replace(/'/g, "''")}'`;
    case "cmd":
      // cmd.exe: double quotes group the injection metacharacters (& | < > ( ) ^),
      // and " is illegal in Windows filenames (escaped defensively regardless).
      // Known limitation: %VAR% still expands inside cmd double quotes; there is no
      // reliable interactive-cmd escape for a literal %, so a filename containing
      // %NAME% matching an env var may open the wrong path. This is a correctness
      // edge, not an injection vector (expansion yields literal text inside quotes).
      return `"${rawPath.replace(/"/g, '\\"')}"`;
    case "posix":
    default:
      // POSIX single-quoted literal: close-quote, escaped quote, reopen-quote.
      return `'${rawPath.replace(/'/g, "'\\''")}'`;
  }
}

/**
 * Build the command run in a new terminal tab for an external file by substituting
 * placeholders in the user's `externalFileCommand` template:
 *   %F — shell-quoted absolute path
 *   %L — 1-based line number (1 when the link carried no line)
 * A single pass is used so characters inside the substituted path are never
 * re-interpreted as placeholders.
 */
export function buildExternalCommand(
  template: string,
  absPath: string,
  line: number | null,
  shellPath: string,
): string {
  return template.replace(/%[FL]/g, (token) =>
    token === "%F"
      ? shellQuoteAlways(absPath, shellPath)
      : line != null
        ? String(line)
        : "1",
  );
}

/** True if a non-empty external-file command template lacks the required `%F`. */
export function externalCommandMissingFile(template: string): boolean {
  const trimmed = template.trim();
  return trimmed.length > 0 && !trimmed.includes("%F");
}
