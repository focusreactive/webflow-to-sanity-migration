import type { FieldType } from "#ir/field-type.ts";

import { htmlToPortableText } from "./html-to-portable-text.ts";

export interface ResolveRichTextOpts {
  resolveImgSrc: (url: string) => string | undefined;
}

export function resolveRichTextRecord(
  fields: { name: string; type: FieldType }[],
  record: Record<string, unknown>,
  opts: ResolveRichTextOpts,
): Promise<Record<string, unknown>> {
  const richTextNames = fields.filter((f) => f.type.type === "richText").map((f) => f.name);
  if (richTextNames.length === 0) return Promise.resolve(record);
  const out: Record<string, unknown> = { ...record };
  for (const name of richTextNames) {
    const value = record[name];
    if (typeof value === "string") {
      out[name] = htmlToPortableText(value, { resolveImage: opts.resolveImgSrc });
    }
  }
  return Promise.resolve(out);
}
