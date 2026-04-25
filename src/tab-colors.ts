// Tab color palette: built-in entries seeded on first run, plus any
// user-defined colors added in Settings. Each entry carries its own tint
// strength so users can dial the terminal-background mix per color
// (e.g. softer red for CLIs with lots of red output).

export interface TabColorDef {
  name: string;
  value: string;        // "" for the None entry, otherwise 6-digit hex
  tintStrength: number; // percent, 0..30 (stored as a percent integer)
  builtin: boolean;     // true = seeded preset, not deletable/renamable
}

export const DEFAULT_TAB_COLORS: TabColorDef[] = [
  { name: "None",      value: "",        tintStrength: 0,  builtin: true },
  { name: "Vermilion", value: "#FC3634", tintStrength: 12, builtin: true },
  { name: "Sky Blue",  value: "#25D0F7", tintStrength: 12, builtin: true },
  { name: "Gold",      value: "#FFD700", tintStrength: 12, builtin: true },
  { name: "Mint",      value: "#18BC9C", tintStrength: 12, builtin: true },
  { name: "Azure",     value: "#007BFF", tintStrength: 12, builtin: true },
  { name: "Purple",    value: "#A991D4", tintStrength: 12, builtin: true },
];

export const MAX_TINT_STRENGTH = 30;
export const DEFAULT_TINT_STRENGTH = 12;

/** Look up the palette entry matching `hex`. Falls back to a synthetic
 *  entry using the default tint strength when the session was colored with
 *  a hex no longer present in the palette. */
export function findTabColor(palette: TabColorDef[], hex: string): TabColorDef | null {
  if (!hex) return null;
  const match = palette.find((c) => c.value.toLowerCase() === hex.toLowerCase());
  if (match) return match;
  return { name: hex, value: hex, tintStrength: DEFAULT_TINT_STRENGTH, builtin: false };
}
