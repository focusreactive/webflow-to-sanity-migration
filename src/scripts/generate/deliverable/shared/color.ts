export interface SanityColor {
  _type: "color";
  hex: string;
  alpha?: number;
}

export type ColorConversion =
  { kind: "empty" } | { kind: "converted"; value: SanityColor } | { kind: "verbatim"; raw: string; value: SanityColor };

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_COLOR = /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/i;

function hexByte(value: number): string {
  return Math.min(255, Math.max(0, Math.round(value)))
    .toString(16)
    .padStart(2, "0");
}

function rgbToHex(raw: string): SanityColor | undefined {
  const match = RGB_COLOR.exec(raw);
  if (match === null) return undefined;
  const [, r, g, b, a] = match;
  if (r === undefined || g === undefined || b === undefined) return undefined;
  const hex = `#${hexByte(Number(r))}${hexByte(Number(g))}${hexByte(Number(b))}`;
  const alpha = a === undefined ? undefined : Number(a);
  return alpha === undefined || Number.isNaN(alpha) ? { _type: "color", hex } : { _type: "color", hex, alpha };
}

export function sanityColorValue(value: unknown): ColorConversion {
  if (typeof value !== "string") return { kind: "empty" };
  const raw = value.trim();
  if (raw === "") return { kind: "empty" };
  if (HEX_COLOR.test(raw)) return { kind: "converted", value: { _type: "color", hex: raw.toLowerCase() } };
  const converted = rgbToHex(raw);
  if (converted !== undefined) return { kind: "converted", value: converted };
  return { kind: "verbatim", raw, value: { _type: "color", hex: raw } };
}
