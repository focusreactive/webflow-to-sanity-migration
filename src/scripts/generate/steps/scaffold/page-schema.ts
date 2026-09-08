import { schemaTypeName } from "#blocks/codegen/names.ts";
import { sanityField, type SanityFieldCtx } from "#generate/sanity-field.ts";
import { raw, renderSource, type SourceValue } from "#generate/utils/source.ts";
import type { CollectionId } from "#ir/common.ts";
import type { GroupField } from "#ir/field-type.ts";

import { helpersImportLine } from "./define-wrap.ts";
import { emitDocument } from "./document-schema.ts";
import { buildDocumentPreview } from "./preview.ts";

const PAGE_CTX: SanityFieldCtx = { documentTypeFor: schemaTypeName, path: [], slugField: "slug", slugSource: "title" };

function referenceField(name: string, collectionKey: string, ctx: SanityFieldCtx): SourceValue {
  const field: GroupField = {
    name,
    type: { type: "reference", collectionKey: collectionKey as CollectionId },
    required: false,
  };
  return sanityField(field, ctx);
}

function seoField(): SourceValue {
  return {
    name: "seo",
    title: "SEO",
    type: "object",
    fields: [
      sanityField({ name: "metaTitle", type: { type: "text" }, required: false }, PAGE_CTX),
      sanityField({ name: "metaDescription", type: { type: "text" }, required: false }, PAGE_CTX),
    ],
  };
}

export function emitPageDocument(opts: { chromeNames: string[] }): string {
  const fields: SourceValue[] = [
    sanityField({ name: "title", type: { type: "text" }, required: true }, PAGE_CTX),
    sanityField({ name: "slug", type: { type: "text" }, required: true }, PAGE_CTX),
    referenceField("parent", "page", PAGE_CTX),
    { name: "isContainer", title: "Is container", type: "boolean", hidden: true },
    { name: "content", title: "Content", type: "pageBuilder" },
    ...opts.chromeNames.map((name) => referenceField(name, name, PAGE_CTX)),
    seoField(),
  ];
  const preview = buildDocumentPreview([{ name: "title", type: { type: "text" } }], "slug");
  return emitDocument("page", "Page", fields, preview);
}

export function emitPageBuilder(blockIds: string[]): string {
  const of = blockIds.map((id) => raw(`defineArrayMember({ type: "${schemaTypeName(id)}" })`));
  const used = new Set<string>(["defineType"]);
  if (of.length > 0) used.add("defineArrayMember");
  const body: Record<string, SourceValue> = {
    name: "pageBuilder",
    title: "Content",
    type: "array",
    of,
  };
  return `${helpersImportLine(used)}\n\nexport const pageBuilder = defineType(${renderSource(body)});\n`;
}
