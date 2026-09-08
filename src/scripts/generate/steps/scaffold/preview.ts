import { raw, type SourceValue } from "#generate/deliverable/shared/source.ts";

export interface PreviewFieldLike {
  name: string;
  type: { type: string };
}

export function buildDocumentPreview(fields: PreviewFieldLike[], slugField?: string): SourceValue | undefined {
  const first = fields[0];
  if (!first) return undefined;

  const titleField =
    fields.find((field) => field.name === "title") ?? fields.find((field) => field.type.type === "text") ?? first;
  const imageField = fields.find((field) => field.type.type === "image");

  const select: Record<string, SourceValue> = { title: titleField.name };
  if (slugField) select.subtitle = `${slugField}.current`;
  if (imageField) select.media = imageField.name;

  return { select };
}

export function buildBlockPreview(name: string, fields: PreviewFieldLike[]): SourceValue {
  const imageField = fields.find((field) => field.type.type === "image");
  const title = JSON.stringify(name);
  if (!imageField) return { prepare: raw(`() => ({ title: ${title} })`) };

  return {
    select: { media: imageField.name },
    prepare: raw(`({ media }) => ({ title: ${title}, media })`),
  };
}
