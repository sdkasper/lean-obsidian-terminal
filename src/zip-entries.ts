/**
 * Pure check for zip entry names, kept apart from binary-manager.ts (which imports
 * `obsidian`) so it can be unit-tested directly.
 */

/**
 * True when extracting an entry with this name could write outside the target
 * folder: an absolute path, a drive letter, or a `..` segment (either separator).
 */
export function unsafeZipEntry(name: string): boolean {
  if (/^[\\/]/.test(name) || /^[A-Za-z]:/.test(name)) return true;
  // Windows drops trailing dots and spaces from a segment, so `.. ` and `...` act
  // as `..`. Any segment made only of dots and spaces (other than a plain `.`) is refused.
  return name.split(/[\\/]/).some((seg) => seg !== "." && /^[. ]+$/.test(seg));
}
