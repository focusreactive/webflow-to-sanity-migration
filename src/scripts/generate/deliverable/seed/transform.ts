import { createHash } from "node:crypto";

import { sanityColorValue } from "#generate/deliverable/shared/color.ts";
import { htmlToPortableText } from "#generate/deliverable/shared/html-to-portable-text.ts";

import { documentId } from "./doc-id.ts";

export interface FieldTypeNode {
  type: string;
  element?: FieldTypeNode;
  fields?: FieldDef[];
  collectionKey?: string;
}

export interface FieldDef {
  name: string;
  type: FieldTypeNode;
  required: boolean;
}

export interface BlockDef {
  id: string;
  fields: FieldDef[];
}

export interface LayoutFieldSource {
  kind: "literal";
  value: unknown;
}

export interface BlockRecord {
  order: number;
  blockType: string;
  anchorMigId: string;
  fields: Record<string, LayoutFieldSource>;
}

export interface SeedCtx {
  uploadedAssetId(assetId: string): string | undefined;
  resolveAssetId(url: string): string | undefined;
  slugField?: string;
  warn(message: string): void;
}

function kebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.toLowerCase())
    .join("-");
}

function schemaTypeName(value: string): string {
  const pascal = kebabCase(value)
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);
  return /^[0-9]/.test(camel) ? `_${camel}` : camel;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function keyFor(index: number, content: unknown): string {
  return createHash("sha256")
    .update(`${index}:${JSON.stringify(content)}`)
    .digest("hex")
    .slice(0, 8);
}

function keyedArrayEntry(index: number, entry: unknown, typeName?: string): unknown {
  if (!isRecord(entry)) return entry;
  return { ...entry, _key: keyFor(index, entry), ...(typeName !== undefined ? { _type: typeName } : {}) };
}

function mediaValue(fieldType: "image" | "file" | "video", value: unknown, ctx: SeedCtx): unknown {
  if (!isRecord(value) || typeof value["assetId"] !== "string") return undefined;
  const assetId = value["assetId"];
  const ref = ctx.uploadedAssetId(assetId);
  if (ref === undefined) {
    ctx.warn(`asset ${assetId} has no uploaded Sanity asset — ${fieldType} field left empty`);
    return undefined;
  }
  const asset = { _type: "reference", _ref: ref };
  if (fieldType !== "image") return { _type: "file", asset };
  const alt = value["alt"];
  return { _type: "image", ...(typeof alt === "string" && alt !== "" ? { alt } : {}), asset };
}

function colorValue(value: unknown, ctx: SeedCtx): unknown {
  const converted = sanityColorValue(value);
  if (converted.kind === "empty") return undefined;
  if (converted.kind === "verbatim") {
    ctx.warn(`color "${converted.raw}" is neither a hex nor an rgb() value — stored as-is; re-pick it in the Studio`);
  }
  return converted.value;
}

function referenceValue(collectionKey: string | undefined, value: unknown): unknown {
  if (collectionKey === undefined || typeof value !== "string" || value === "") return undefined;
  return { _type: "reference", _ref: documentId(collectionKey, value) };
}

export function sanityValueFor(
  node: FieldTypeNode,
  value: unknown,
  ctx: SeedCtx,
  path: readonly string[] = [],
): unknown {
  if (value === null || value === undefined) return undefined;
  switch (node.type) {
    case "image":
      return mediaValue("image", value, ctx);
    case "file":
      return mediaValue("file", value, ctx);
    case "video":
      return mediaValue("video", value, ctx);
    case "richText":
      return typeof value === "string" && value !== "" ?
          htmlToPortableText(value, {
            resolveImage: (url) => {
              const assetId = ctx.resolveAssetId(url);
              return assetId === undefined ? undefined : ctx.uploadedAssetId(assetId);
            },
          })
        : undefined;
    case "color":
      return colorValue(value, ctx);
    case "reference":
      return referenceValue(node.collectionKey, value);
    case "multiReference": {
      if (!Array.isArray(value) || node.collectionKey === undefined) return undefined;
      const collectionKey = node.collectionKey;
      return value
        .filter((entry): entry is string => typeof entry === "string" && entry !== "")
        .map((slug, index) => ({
          ...(referenceValue(collectionKey, slug) as Record<string, unknown>),
          _key: keyFor(index, slug),
        }));
    }
    case "array": {
      if (!Array.isArray(value) || node.element === undefined) return undefined;
      const element = node.element;
      const itemPath = [...path, "item"];

      if (element.type === "richText") {
        return value
          .map((entry, index) => [index, sanityValueFor(element, entry, ctx, itemPath)] as const)
          .filter((pair): pair is [number, Record<string, unknown>[]] => Array.isArray(pair[1]))
          .flatMap(([index, blocks]) => blocks.map((block) => ({ ...block, _key: keyFor(index, block["_key"]) })));
      }

      const memberTypeName = element.type === "group" ? schemaTypeName([...path, "item"].join("-")) : undefined;

      return value
        .map((entry, index) => [index, sanityValueFor(element, entry, ctx, itemPath)] as const)
        .filter((pair): pair is [number, unknown] => pair[1] !== undefined)
        .map(([index, entry]) => keyedArrayEntry(index, entry, memberTypeName));
    }
    case "group":
      return isRecord(value) && node.fields !== undefined ?
          sanityDataForFields(node.fields, value, ctx, path)
        : undefined;
    default:
      return value;
  }
}

export function sanityDataForFields(
  fields: FieldDef[],
  record: Record<string, unknown>,
  ctx: SeedCtx,
  path: readonly string[] = [],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (ctx.slugField === field.name) {
      const raw = record[field.name];
      if (typeof raw === "string" && raw !== "") out[field.name] = { _type: "slug", current: raw };
      continue;
    }
    const value = sanityValueFor(field.type, record[field.name], ctx, [...path, field.name]);
    if (value !== undefined) out[field.name] = value;
  }
  return out;
}

function literalFieldsOnly(fields: Record<string, LayoutFieldSource>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, source] of Object.entries(fields)) out[name] = source.value;
  return out;
}

function withoutSlugField(ctx: SeedCtx): SeedCtx {
  if (ctx.slugField === undefined) return ctx;
  return {
    uploadedAssetId: (assetId) => ctx.uploadedAssetId(assetId),
    resolveAssetId: (url) => ctx.resolveAssetId(url),
    warn: (message) => ctx.warn(message),
  };
}

export function blockArrayFor(
  records: readonly BlockRecord[],
  blocks: readonly BlockDef[],
  ctx: SeedCtx,
): Record<string, unknown>[] {
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const blockCtx = withoutSlugField(ctx);
  return [...records]
    .sort((a, b) => a.order - b.order)
    .map((record) => {
      const block = blockById.get(record.blockType);
      if (block === undefined)
        throw new Error(`unknown blockType "${record.blockType}" (anchor ${record.anchorMigId})`);
      return {
        _type: schemaTypeName(record.blockType),
        _key: record.anchorMigId,
        ...sanityDataForFields(block.fields, literalFieldsOnly(record.fields), blockCtx),
      };
    });
}
