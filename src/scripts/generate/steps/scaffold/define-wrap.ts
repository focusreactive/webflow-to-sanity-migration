import { raw, renderSource, type SourceValue } from "#generate/utils/source.ts";

interface WrapFlags {
  arrayMember: boolean;
}

export interface WrapResult {
  fields: SourceValue[];
  usesArrayMember: boolean;
}

const HELPER_ORDER = ["defineArrayMember", "defineField", "defineType"] as const;

export function helpersImportLine(used: ReadonlySet<string>): string {
  const names = HELPER_ORDER.filter((name) => used.has(name));
  return `import { ${names.join(", ")} } from "sanity";`;
}

export function wrapTopLevelFields(fields: SourceValue[]): WrapResult {
  const flags: WrapFlags = { arrayMember: false };
  const wrapped = fields.map((field) => wrapField(field, flags));
  return { fields: wrapped, usesArrayMember: flags.arrayMember };
}

function wrapField(value: SourceValue, flags: WrapFlags): SourceValue {
  return raw(`defineField(${renderSource(deepWrapContainer(value, flags))})`);
}

function wrapArrayMember(value: SourceValue, flags: WrapFlags): SourceValue {
  flags.arrayMember = true;
  return raw(`defineArrayMember(${renderSource(deepWrapContainer(value, flags))})`);
}

function deepWrapContainer(value: SourceValue, flags: WrapFlags): SourceValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const obj = value as Record<string, SourceValue>;
  const result: Record<string, SourceValue> = { ...obj };
  if (Array.isArray(obj.fields)) {
    result.fields = obj.fields.map((field) => wrapField(field, flags));
  }
  if (Array.isArray(obj.of)) {
    result.of = obj.of.map((member) => wrapArrayMember(member, flags));
  }
  return result;
}
