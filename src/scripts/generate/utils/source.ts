const RAW = Symbol("raw");
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export interface RawSource {
  [RAW]: string;
}

export type SourceValue = string | number | boolean | null | RawSource | SourceValue[] | { [key: string]: SourceValue };

export function raw(code: string): RawSource {
  return { [RAW]: code };
}

function isRaw(value: SourceValue): value is RawSource {
  return typeof value === "object" && value !== null && RAW in value;
}

export function renderSource(value: SourceValue): string {
  if (isRaw(value)) return value[RAW];
  if (Array.isArray(value)) return `[${value.map(renderSource).join(", ")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).map(
      ([key, entry]) => `${IDENTIFIER.test(key) ? key : JSON.stringify(key)}: ${renderSource(entry)}`,
    );
    return `{ ${entries.join(", ")} }`;
  }
  return JSON.stringify(value);
}
