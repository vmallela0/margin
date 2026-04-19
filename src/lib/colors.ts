import type { CustomColor, HighlightColor } from "./types";
import { BUILTIN_COLORS } from "./types";

// A highlight.color is either a builtin keyword ("yellow" | "pink" | "blue" | "green")
// or a custom-color id. Resolve to a CSS background value for the highlight overlay.
export function resolveHighlightBg(color: HighlightColor, custom: CustomColor[] = []): string {
  if ((BUILTIN_COLORS as readonly string[]).includes(color)) return `var(--hi-${color})`;
  const c = custom.find((x) => x.id === color);
  if (c) return hexToAlpha(c.hex, 0.34);
  return `var(--hi-yellow)`;
}

export function resolveHighlightUnderline(color: HighlightColor, custom: CustomColor[] = []): string {
  if ((BUILTIN_COLORS as readonly string[]).includes(color)) return "";
  const c = custom.find((x) => x.id === color);
  if (c) return `inset 0 -0.14em 0 ${hexToAlpha(c.hex, 0.45)}`;
  return "";
}

export function resolveMeaning(
  color: HighlightColor,
  meanings: Record<string, string>,
  custom: CustomColor[] = [],
): string {
  if (meanings[color]) return meanings[color];
  const c = custom.find((x) => x.id === color);
  return c?.meaning || "";
}

function hexToAlpha(hex: string, alpha: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function allHighlightChoices(
  custom: CustomColor[] = [],
): { id: HighlightColor; bg: string }[] {
  const builtins = (BUILTIN_COLORS as readonly string[]).map((c) => ({ id: c, bg: `var(--hi-${c})` }));
  const customs = custom.map((c) => ({ id: c.id, bg: hexToAlpha(c.hex, 0.34) }));
  return [...builtins, ...customs];
}
