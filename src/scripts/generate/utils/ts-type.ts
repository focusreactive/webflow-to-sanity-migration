import type { FieldType } from "#ir/field-type.ts";

const PROP_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function propKey(name: string): string {
  return PROP_KEY.test(name) ? name : JSON.stringify(name);
}

export function sanityTsType(type: FieldType): string {
  switch (type.type) {
    case "text":
    case "url":
    case "email":
    case "phone":
    case "date":
    case "unsupported":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "color":
      return "{ hex: string }";
    case "richText":
      return "PortableTextBlock[]";
    case "image":
      return "SanityImage";
    case "file":
    case "video":
      return "SanityFile";
    case "option":
      return type.values.map((value) => JSON.stringify(value)).join(" | ");
    case "reference":
      return "{ _id: string } & Record<string, unknown>";
    case "multiReference":
      return "({ _id: string } & Record<string, unknown>)[]";
    case "array": {
      if (type.element.type === "richText") return "PortableTextBlock[]";
      const elementType = sanityTsType(type.element);
      const needsParens = type.element.type === "option";
      return needsParens ? `(${elementType})[]` : `${elementType}[]`;
    }
    case "group":
      return `{ ${type.fields
        .map((field) => `${propKey(field.name)}${field.required ? "" : "?"}: ${sanityTsType(field.type)}`)
        .join("; ")} }`;
  }
}
