import { schemaTypeName } from "#blocks/codegen/names.ts";
import { sanityField, type SanityFieldCtx } from "#generate/sanity-field.ts";
import { helpersImportLine, wrapTopLevelFields } from "#generate/steps/scaffold/define-wrap.ts";
import { buildBlockPreview } from "#generate/steps/scaffold/preview.ts";
import { renderSource, type SourceValue } from "#generate/utils/source.ts";
import type { BlockType } from "#ir/blocks.ts";

export function emitBlockSchema(block: BlockType, ctx: SanityFieldCtx): string {
  const { fields, usesArrayMember } = wrapTopLevelFields(block.fields.map((field) => sanityField(field, ctx)));
  const used = new Set<string>(["defineType"]);
  if (fields.length > 0) used.add("defineField");
  if (usesArrayMember) used.add("defineArrayMember");

  const typeName = schemaTypeName(block.id);
  const body: Record<string, SourceValue> = {
    name: typeName,
    title: block.name,
    type: "object",
    fields,
    preview: buildBlockPreview(block.name, block.fields),
  };

  return `${helpersImportLine(used)}\n\nexport const ${typeName} = defineType(${renderSource(body)});\n`;
}
