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

/**
 * True for a UNC path (`\\host\share\x` or `//host/share/x`). A hover on one would
 * make the synchronous existence check hit the network (an SMB/NTLM attempt on
 * Windows, a UI-thread stall everywhere), so these are never resolved.
 */
export function isUncPath(candidate: string): boolean {
  return /^[\\/]{2}/.test(candidate);
}

/**
 * Extensions that are safe to hand to `shell.openPath`: plain text, media and source
 * text that open in a viewer or editor. Office, RTF, XML and CSV are left out on
 * purpose: they open in Office, which can load remote templates or linked objects
 * (an NTLM leak) from files that carry no Mark of the Web. A clicked terminal path is
 * attacker-influenced, and the default handler for anything else (programs,
 * scripts, installers, shortcuts, disk images, management consoles) can run code or
 * leak credentials, so every other file is revealed in the file manager instead.
 */
const OPENABLE_EXTENSIONS = new Set([
  "txt", "md", "markdown", "json", "jsonc", "yaml", "yml", "toml", "ini", "cfg", "conf",
  "log", "pdf", "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico",
  "mp3", "wav", "ogg", "flac", "m4a", "mp4", "mkv", "webm", "mov", "canvas", "base",
  "ts", "tsx", "css", "scss", "rs", "go", "java", "kt", "c", "h", "cpp", "hpp", "cs", "sql",
]);

/**
 * True when the path is a known-safe document type that may be opened with the
 * system default application. Unknown, extensionless and executable types are not.
 */
export function canOpenDirectly(path: string): boolean {
  const name = path.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false;
  return OPENABLE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/**
 * Remove escape bytes from text that is about to be wrapped in a bracketed paste.
 * Without this, pasted text containing `ESC[201~` ends the paste early and the
 * rest reaches the shell as typed input (newline included).
 */
export function stripEscapes(text: string): string {
  return text.split("\x1b").join("");
}

/**
 * Characters that make pasted text show one thing and run another, or hide in it:
 * C0 controls other than tab and line breaks (DEL and backspace erase what the
 * preview shows; ESC would close a bracketed paste), C1 controls, line/paragraph
 * separators, bidi overrides and isolates, invisible zero-width and filler
 * characters, variation selectors other than U+FE0F, and Unicode tag characters
 * (U+E0000 to U+E007F, which carry text a person cannot see but an AI app reads).
 * ZWNJ, ZWJ and U+FE0F stay: scripts and emoji need them.
 */
const DECEPTIVE_PASTE_CHARS =
  // eslint-disable-next-line no-control-regex, no-misleading-character-class -- invisible, combining and control characters are exactly what this matches
  /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b\u200e\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\u3164\ufe00-\ufe0e\ufeff\uffa0\ufff9-\ufffb\u{e0000}-\u{e007f}\u{e0100}-\u{e01ef}]/gu;

/**
 * Clean text for a paste: remove the characters above and report how many were
 * dropped, so the confirm preview shows exactly what will run.
 */
export function sanitizePaste(text: string): { text: string; removed: number } {
  let removed = 0;
  const clean = text.replace(DECEPTIVE_PASTE_CHARS, () => {
    removed++;
    return "";
  });
  return { text: clean, removed };
}

/**
 * Replace tabs with spaces. A shell that does not read bracketed paste treats a
 * pasted tab as completion, so `rm -r <TAB>` plus a newline would run on whichever
 * entry completion picks, which the preview cannot show.
 */
export function tabsToSpaces(text: string): string {
  return text.split("\t").join("    ");
}

/**
 * True for shells that read a bracketed paste themselves, so the terminal's
 * bracketed-paste mode is a reliable sign the paste is inert. Everything else
 * (cmd, dash, busybox ash, csh/tcsh, PowerShell, unknown shells) runs each pasted
 * line on arrival, and terminal output can switch the mode on, so it must not be
 * trusted for them. macOS bash is 3.2 and has no bracketed paste at all.
 */
export function shellHonorsBracketedPaste(shellPath: string, platform: string): boolean {
  const base = (shellPath.split(/[\\/]/).pop() ?? "").toLowerCase().replace(/\.exe$/, "");
  if (base === "bash") return platform !== "darwin";
  return ["zsh", "fish", "nu", "nushell", "elvish", "xonsh"].includes(base);
}

/**
 * Single-quote a string for PowerShell. Every quote-like character (`'` and the
 * curly variants PowerShell also treats as quotes) is doubled.
 */
export function psSingleQuote(text: string): string {
  return `'${text.replace(/['\u2018\u2019\u201A\u201B]/g, (c) => c + c)}'`;
}

export type ShellFamily = "posix" | "fish" | "powershell" | "cmd" | "unknown";

/** Shells whose single-quote rules are the POSIX ones (`'` closes, `'\''` reopens). */
const POSIX_SHELLS = new Set(["sh", "bash", "zsh", "dash", "ash", "ksh", "mksh", "rbash"]);

/**
 * Group a shell executable path by the quoting rules it follows. A shell this does
 * not recognize (nushell, csh/tcsh, elvish, xonsh, ...) is `unknown`: its escape
 * rules are not guessed, so only plain paths are inserted for it.
 */
export function shellFamily(shellPath: string): ShellFamily {
  const base = (shellPath.split(/[\\/]/).pop() ?? "").toLowerCase().replace(/\.exe$/, "");
  if (base === "powershell" || base === "pwsh") return "powershell";
  if (base === "cmd") return "cmd";
  if (base === "fish") return "fish";
  return POSIX_SHELLS.has(base) ? "posix" : "unknown";
}

/** Characters that need no quoting in any family (no globbing, expansion or separators). */
const SAFE_PATH = /^(?!-)[A-Za-z0-9_./:+-]+$/;
const SAFE_PATH_WINDOWS = /^(?!-)[A-Za-z0-9_./\\:+-]+$/;

/** True when the text holds a control character (a newline would submit the line). */
export function hasControlChars(text: string): boolean {
  // eslint-disable-next-line no-control-regex -- control bytes are exactly what this detects
  return /[\x00-\x1f\x7f]/.test(text);
}

/**
 * Quote a file path for insertion at the prompt of the given shell, or return
 * null when it cannot be quoted safely. Plain paths stay bare; everything else is
 * wrapped with that shell's own escape rule, so a file name never splits into
 * several words or expands into code.
 *
 * - posix/fish: single quotes, `'` becomes `'\''` (fish also doubles `\`).
 * - unknown shell: only plain paths; anything that needs quoting is refused.
 * - PowerShell: single quotes, every quote-like character (`'` and the curly
 *   variants PowerShell treats as quotes) is doubled.
 * - cmd: double quotes; a `"` cannot be escaped there (Windows forbids it in
 *   names), so it is refused.
 * Control characters (a newline would submit the line) are always refused.
 */
export function quotePath(rawPath: string, shellPath: string): string | null {
  if (hasControlChars(rawPath)) return null;
  // A leading dash would be read as an option by most commands; ./ keeps it a path.
  const family = shellFamily(shellPath);
  // cmd reads `./-x` as a switch, so it gets a backslash prefix.
  if (rawPath.startsWith("-")) rawPath = family === "cmd" ? `.\\${rawPath}` : `./${rawPath}`;
  if ((family === "powershell" || family === "cmd" ? SAFE_PATH_WINDOWS : SAFE_PATH).test(rawPath)) {
    return rawPath;
  }
  switch (family) {
    case "powershell":
      return psSingleQuote(rawPath);
    case "cmd":
      // `%VAR%` and `!VAR!` still expand inside double quotes, and `"` cannot be escaped.
      return /["%!]/.test(rawPath) ? null : `"${rawPath}"`;
    case "fish":
      return `'${rawPath.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
    case "unknown":
      // Unrecognized shell: no quoting rule is safe to guess, so only plain paths pass.
      return null;
    default:
      return `'${rawPath.replace(/'/g, "'\\''")}'`;
  }
}
