export interface ParsedShortcut {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

export function parseShortcut(s: string): ParsedShortcut | null {
  if (!s.trim()) return null;
  const parts = s.split("+");
  const key = parts[parts.length - 1];
  const lower = parts.map((p) => p.toLowerCase());
  return {
    ctrl: lower.includes("ctrl"),
    shift: lower.includes("shift"),
    alt: lower.includes("alt") || lower.includes("opt") || lower.includes("option"),
    meta: lower.includes("meta") || lower.includes("cmd"),
    key,
  };
}

export type ShortcutEventLike = Pick<
  KeyboardEvent,
  "ctrlKey" | "shiftKey" | "altKey" | "metaKey" | "key" | "code"
>;

/** Physical-key code for a single letter or digit (`F` -> `KeyF`, `1` -> `Digit1`). */
function codeForKey(key: string): string | null {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return null;
}

/**
 * `isMac` gates the physical-key fallback. It is only needed on macOS, where Option rewrites
 * `e.key`; elsewhere Ctrl+Alt is AltGr on Windows and layouts differ, so matching stays by character.
 */
export function matchesShortcut(e: ShortcutEventLike, shortcut: string, isMac: boolean): boolean {
  const p = parseShortcut(shortcut);
  if (!p) return false;
  if (
    e.ctrlKey !== p.ctrl ||
    e.shiftKey !== p.shift ||
    e.altKey !== p.alt ||
    e.metaKey !== p.meta
  ) {
    return false;
  }
  if (e.key.toLowerCase() === p.key.toLowerCase()) return true;
  // On macOS, Option changes e.key (Option+F -> "ƒ"), so with Option held also match the physical key.
  if (isMac && p.alt) {
    const code = codeForKey(p.key);
    return code !== null && e.code === code;
  }
  return false;
}
