import { schemaTypeName, titleCase } from "#blocks/codegen/names.ts";
import { raw, type SourceValue } from "#generate/deliverable/shared/source.ts";
import type { FieldType, GroupField } from "#ir/field-type.ts";

export interface SanityFieldCtx {
  slugField?: string;
  slugSource?: string;
  documentTypeFor: (collectionKey: string) => string;
  path: string[];
}

export function sanityFieldType(type: FieldType, ctx: SanityFieldCtx): SourceValue {
  switch (type.type) {
    case "text":
    case "url":
    case "email":
    case "phone":
    case "unsupported":
      return { type: "string" };
    case "color":
      return { type: "color" };
    case "richText":
      return { type: "portableText" };
    case "number":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "date":
      return { type: "datetime" };
    case "image":
      return { type: "image", options: { hotspot: true }, fields: [{ name: "alt", title: "Alt", type: "string" }] };
    case "file":
    case "video":
      return { type: "file" };
    case "option":
      return { type: "string", options: { list: type.values.map((value) => ({ title: value, value })) } };
    case "reference":
      return { type: "reference", to: [{ type: ctx.documentTypeFor(type.collectionKey) }] };
    case "multiReference":
      return {
        type: "array",
        of: [{ type: "reference", to: [{ type: ctx.documentTypeFor(type.collectionKey) }] }],
      };
    case "array":
      if (type.element.type === "richText") return { type: "portableText" };
      return { type: "array", of: [arrayMember(type.element, ctx)] };
    case "group":
      return { type: "object", fields: type.fields.map((field) => sanityField(field, ctx)) };
  }
}

function arrayMember(element: FieldType, ctx: SanityFieldCtx): SourceValue {
  const emitted = sanityFieldType(element, childCtx(ctx, "item"));
  if (isInlineObjectType(emitted)) {
    return { name: memberName(ctx), ...emitted };
  }
  return emitted;
}

function isInlineObjectType(value: SourceValue): value is Record<string, SourceValue> {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && "type" in value
    && value["type"] === "object"
  );
}

function memberName(ctx: SanityFieldCtx): string {
  return schemaTypeName([...ctx.path, "item"].join("-"));
}

const childCtx = (ctx: SanityFieldCtx, name: string): SanityFieldCtx => ({ ...ctx, path: [...ctx.path, name] });

export function sanityField(
  field: GroupField & { label?: string | undefined },
  ctx: SanityFieldCtx,
): SourceValue {
  const isSlug = ctx.slugField === field.name;
  const body =
    isSlug ?
      { type: "slug", ...(ctx.slugSource === undefined ? {} : { options: { source: ctx.slugSource } }) }
    : sanityFieldType(field.type, childCtx(ctx, field.name));
  return {
    name: field.name,
    title: field.label ?? titleCase(field.name),
    ...(body as Record<string, SourceValue>),
    ...(field.required ? { validation: raw("(rule) => rule.required()") } : {}),
  };
}
