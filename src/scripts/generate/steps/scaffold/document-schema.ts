import { schemaTypeName, titleCase } from "#blocks/codegen/names.ts";
import { sanityField, type SanityFieldCtx } from "#generate/sanity-field.ts";
import { renderSource, type SourceValue } from "#generate/deliverable/shared/source.ts";
import type { CollectionEntry } from "#ir/collections.ts";
import type { GlobalDef } from "#ir/globals.ts";

import { helpersImportLine, wrapTopLevelFields } from "#generate/deliverable/shared/define-wrap.ts";
import { buildDocumentPreview } from "./preview.ts";

export function emitDocument(typeName: string, title: string, fields: SourceValue[], preview?: SourceValue): string {
  const { fields: wrapped, usesArrayMember } = wrapTopLevelFields(fields);
  const used = new Set<string>(["defineType"]);
  if (wrapped.length > 0) used.add("defineField");
  if (usesArrayMember) used.add("defineArrayMember");

  const body: Record<string, SourceValue> = {
    name: typeName,
    title,
    type: "document",
    fields: wrapped,
    ...(preview ? { preview } : {}),
  };
  return `${helpersImportLine(used)}\n\nexport const ${typeName} = defineType(${renderSource(body)});\n`;
}

export function emitCollectionDocument(entry: CollectionEntry, ctx: SanityFieldCtx): string {
  const fieldCtx: SanityFieldCtx = { ...ctx, slugField: entry.pageBinding.slugField, slugSource: "title" };
  const fields = entry.fields.map((field) => sanityField(field, fieldCtx));
  const typeName = ctx.documentTypeFor(entry.key);
  const preview = buildDocumentPreview(entry.fields, entry.pageBinding.slugField);
  return emitDocument(typeName, entry.label, fields, preview);
}

export function emitChromeDocument(
  def: GlobalDef,
  ctx: SanityFieldCtx = { documentTypeFor: schemaTypeName, path: [] },
): string {
  const nameFieldBase = sanityField({ name: "name", type: { type: "text" }, required: true }, ctx) as Record<
    string,
    SourceValue
  >;
  const nameField: SourceValue = { ...nameFieldBase, initialValue: titleCase(def.name) };
  const fields = [nameField, ...def.fields.map((field) => sanityField(field, ctx))];
  const typeName = schemaTypeName(def.name);
  return emitDocument(typeName, titleCase(def.name), fields);
}
