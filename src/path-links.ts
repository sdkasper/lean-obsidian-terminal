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
