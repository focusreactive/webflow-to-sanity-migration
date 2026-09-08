import { kebabCase, schemaTypeName } from "#blocks/codegen/names.ts";
import type { CollectionEntry } from "#ir/collections.ts";
import type { ScalarType } from "#ir/field-type.ts";
import type { GlobalDef } from "#ir/globals.ts";

const MAX_DEREFERENCE_DEPTH = 1;

export type QueryFieldType =
  | { type: ScalarType }
  | { type: "reference"; collectionKey: string }
  | { type: "multiReference"; collectionKey: string }
  | { type: "option"; values: string[] }
  | { type: "unsupported" }
  | { type: "array"; element: QueryFieldType }
  | { type: "group"; fields: QueryField[] };

export interface QueryField {
  name: string;
  type: QueryFieldType;
  required: boolean;
}

export interface QueryBlock {
  id: string;
  fields: readonly QueryField[];
  content: Record<string, unknown>;
}

export interface QueriesIr {
  blocks: readonly QueryBlock[];
  collections: readonly CollectionEntry[];
  globals?: readonly Pick<GlobalDef, "name" | "fields">[];
  documentTypeFor: (collectionKey: string) => string;
}

interface QueryCtx {
  collectionsByKey: ReadonlyMap<string, CollectionEntry>;
  depth: number;
}

function projectFields(fields: readonly QueryField[], ctx: QueryCtx, slugField?: string): string {
  return fields
    .map((field) =>
      field.name === slugField ?
        `"${field.name}": ${field.name}.current`
      : fieldProjection(field.name, field.type, ctx),
    )
    .join(", ");
}

function referenceProjection(name: string, collectionKey: string, isArray: boolean, ctx: QueryCtx): string {
  const arrow = isArray ? "[]->" : "->";
  if (ctx.depth >= MAX_DEREFERENCE_DEPTH) return name;

  const target = ctx.collectionsByKey.get(collectionKey);
  const inner =
    target ? projectFields(target.fields, { ...ctx, depth: ctx.depth + 1 }, target.pageBinding.slugField) : undefined;
  return `${name}${arrow}{ _id${inner ? `, ${inner}` : ""} }`;
}

function arrayFieldProjection(name: string, element: QueryFieldType, ctx: QueryCtx): string {
  if (element.type === "group") return `${name}[]{ ${projectFields(element.fields, ctx)} }`;
  if (element.type === "reference" || element.type === "multiReference") {
    return referenceProjection(name, element.collectionKey, true, ctx);
  }
  return name;
}

function fieldProjection(name: string, type: QueryFieldType, ctx: QueryCtx): string {
  switch (type.type) {
    case "reference":
      return referenceProjection(name, type.collectionKey, false, ctx);
    case "multiReference":
      return referenceProjection(name, type.collectionKey, true, ctx);
    case "image":
    case "file":
    case "video":
      return `${name}{ ..., asset->{ _id, url, metadata } }`;
    case "group":
      return `${name}{ ${projectFields(type.fields, ctx)} }`;
    case "array":
      return arrayFieldProjection(name, type.element, ctx);
    case "text":
    case "richText":
    case "number":
    case "boolean":
    case "date":
    case "color":
    case "url":
    case "email":
    case "phone":
    case "option":
    case "unsupported":
      return name;
  }
}

function blockFragment(block: QueryBlock, ctx: QueryCtx): string {
  const fields = projectFields(block.fields, ctx);
  const body = fields ? `_key, _type, ${fields}` : "_key, _type";
  return `_type == "${schemaTypeName(block.id)}" => { ${body} }`;
}

function chromeFieldsBody(global: Pick<GlobalDef, "name" | "fields">, ctx: QueryCtx): string {
  const fields = projectFields(global.fields, ctx);
  return fields ? `_id, name, ${fields}` : "_id, name";
}

function chromeProjection(global: Pick<GlobalDef, "name" | "fields">, ctx: QueryCtx): string {
  return `${global.name}->{ ${chromeFieldsBody(global, ctx)} }`;
}

function screamingSnakeCase(value: string): string {
  const result = kebabCase(value).toUpperCase().replace(/-/g, "_");
  return /^[0-9]/.test(result) ? `_${result}` : result;
}

export function chromeQueryConstName(name: string): string {
  return `${screamingSnakeCase(name)}_QUERY`;
}

function chromeQuery(global: Pick<GlobalDef, "name" | "fields">, ctx: QueryCtx): string {
  return `export const ${chromeQueryConstName(global.name)} = defineQuery(\`*[_type == "${global.name}"][0]{ ${chromeFieldsBody(global, ctx)} }\`);`;
}

export function detailQueryConstName(typeName: string): string {
  return `${screamingSnakeCase(typeName)}_BY_SLUG_QUERY`;
}

export function slugsQueryConstName(typeName: string): string {
  return `${screamingSnakeCase(typeName)}_SLUGS_QUERY`;
}

function detailQuery(entry: CollectionEntry, documentTypeFor: (key: string) => string, ctx: QueryCtx): string {
  const typeName = documentTypeFor(String(entry.key));
  const fields = projectFields(entry.fields, ctx, entry.pageBinding.slugField);
  const body = fields ? `_id, ${fields}` : "_id";
  return `export const ${detailQueryConstName(typeName)} = defineQuery(\`*[_type == "${typeName}" && ${entry.pageBinding.slugField}.current == $slug][0]{ ${body} }\`);`;
}

function slugsQuery(entry: CollectionEntry, documentTypeFor: (key: string) => string): string {
  const typeName = documentTypeFor(String(entry.key));
  const slugField = entry.pageBinding.slugField;
  return `export const ${slugsQueryConstName(typeName)} = defineQuery(\`*[_type == "${typeName}" && defined(${slugField}.current)]{ "slug": ${slugField}.current }\`);`;
}

export function emitQueries(ir: QueriesIr): string {
  const collectionsByKey = new Map(ir.collections.map((entry) => [String(entry.key), entry]));
  const ctx: QueryCtx = { collectionsByKey, depth: 0 };

  const blockArms = ir.blocks.map((block) => blockFragment(block, ctx)).join(",\n    ");
  const content = blockArms ? `content[]{\n    ${blockArms}\n  }` : "content";

  const bodyLines = [
    "_id",
    "title",
    "slug",
    "seo",
    ...(ir.globals ?? []).map((global) => chromeProjection(global, ctx)),
    content,
  ];

  const detailQueries = ir.collections
    .map((entry) => `${detailQuery(entry, ir.documentTypeFor, ctx)}\n\n${slugsQuery(entry, ir.documentTypeFor)}`)
    .join("\n\n");

  const chromeQueries = (ir.globals ?? []).map((global) => chromeQuery(global, ctx)).join("\n\n");

  const trailingQueries = [chromeQueries, detailQueries].filter((block) => block !== "").join("\n\n");

  return `import { defineQuery } from "next-sanity";

export const PAGE_TREE_QUERY = defineQuery(\`*[_type == "page"]{ _id, slug, "parentId": parent._ref, isContainer }\`);

export const PAGE_BY_ID_QUERY = defineQuery(\`*[_id == $id][0]{
  ${bodyLines.join(",\n  ")}
}\`);
${trailingQueries ? `\n${trailingQueries}\n` : ""}`;
}
