// Naive 8-bit sRGB channel mixing for terminal background tinting.
//
// We need this because xterm.js's `theme.background` is a solid color
// string (only hex is parsed here), not a CSS expression, so `color-mix(...)`
// can't be used at the xterm layer.
//
// Mixing happens in gamma-encoded sRGB (not sRGB-linear) since the
// difference at the small tint ratios used here (typically <= 0.30) is
// imperceptible and gamma decode/encode would add cost without visible
// gain.
//
// `mixHex("#1e1e1e", "#fc3634", 0.12)` returns "#1e1e1e" tinted 12% toward
// the tab color.

function parseHex(hex: string): [number, number, number] | null {
  const h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return [r, g, b];
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return [r, g, b];
  }
  return null;
}

function toHex(v: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(v)));
  return clamped.toString(16).padStart(2, "0");
}

/**
 * Mix `overlay` into `base` by `ratio` (0 = all base, 1 = all overlay).
 * Returns a 6-digit hex string. If either input fails to parse, returns `base`.
 */
export function mixHex(base: string, overlay: string, ratio: number): string {
  const b = parseHex(base);
  const o = parseHex(overlay);
  if (!b || !o) return base;
  const r = Math.max(0, Math.min(1, ratio));
  const mix = (i: 0 | 1 | 2): number => b[i] * (1 - r) + o[i] * r;
  return `#${toHex(mix(0))}${toHex(mix(1))}${toHex(mix(2))}`;
}
