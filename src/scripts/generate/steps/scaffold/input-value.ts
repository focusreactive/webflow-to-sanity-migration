import type { InputResolvers } from "#generate/types.ts";
import { assetIdFromCanonicalUrl } from "#ir/assets.ts";
import type { FieldType } from "#ir/field-type.ts";
import { htmlToPortableText } from "#generate/deliverable/shared/html-to-portable-text.ts";

import { sanityColorValue } from "#generate/deliverable/shared/color.ts";
import { SANITY_ASSET_ROUTE_PREFIX } from "./url-for.ts";

type AssetMeta = NonNullable<ReturnType<InputResolvers["assetMeta"]>>;

export function syntheticAssetRef(meta: { sha: string; width?: number; height?: number; ext: string }): string {
  return `image-${meta.sha}-${String(meta.width ?? 0)}x${String(meta.height ?? 0)}-${meta.ext}`;
}

function syntheticFileRef(meta: AssetMeta): string {
  return `file-${meta.sha}-${meta.ext}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveImageValue(value: unknown, res: InputResolvers): unknown {
  if (!isRecord(value) || typeof value["assetId"] !== "string") return value;
  const meta = res.assetMeta(value["assetId"]);
  if (meta === undefined) return undefined;
  const alt = value["alt"];
  return {
    _type: "image",
    ...(typeof alt === "string" && alt !== "" ? { alt } : {}),
    asset: { _type: "reference", _ref: syntheticAssetRef(meta) },
  };
}

function resolveFileValue(value: unknown, res: InputResolvers): unknown {
  if (!isRecord(value) || typeof value["assetId"] !== "string") return value;
  const meta = res.assetMeta(value["assetId"]);
  if (meta === undefined) return undefined;
  return {
    _type: "file",
    asset: {
      _type: "reference",
      _ref: syntheticFileRef(meta),
      url: `${SANITY_ASSET_ROUTE_PREFIX}${meta.sha}.${meta.ext}`,
    },
  };
}

function resolveRichTextValue(value: unknown, res: InputResolvers): unknown {
  if (typeof value !== "string") return value;
  return htmlToPortableText(value, {
    resolveImage: (url) => {
      const meta = res.assetMeta(assetIdFromCanonicalUrl(url));
      return meta === undefined ? undefined : syntheticAssetRef(meta);
    },
  });
}

function resolveColorValue(value: unknown): unknown {
  const converted = sanityColorValue(value);
  return converted.kind === "empty" ? undefined : converted.value;
}

function resolveNode(type: FieldType, value: unknown, res: InputResolvers): unknown {
  if (value === null || value === undefined) return value;
  switch (type.type) {
    case "richText":
      return resolveRichTextValue(value, res);
    case "color":
      return resolveColorValue(value);
    case "image":
      return resolveImageValue(value, res);
    case "file":
    case "video":
      return resolveFileValue(value, res);
    case "array":
      return Array.isArray(value) ? value.map((item) => resolveNode(type.element, item, res)) : value;
    case "group": {
      if (!isRecord(value)) return value;
      const out: Record<string, unknown> = { ...value };
      for (const field of type.fields) out[field.name] = resolveNode(field.type, value[field.name], res);
      return out;
    }
    default:
      return value;
  }
}

export function resolveInputValue(
  field: { name: string; type: FieldType },
  value: unknown,
  res: InputResolvers,
): unknown {
  if (field.type.type === "reference" && typeof value === "string") {
    return res.resolveDoc(field.type.collectionKey, value);
  }
  if (field.type.type === "multiReference" && Array.isArray(value)) {
    return res.collectionListDocs(field.type.collectionKey, value as string[]);
  }
  return resolveNode(field.type, value, res);
}
