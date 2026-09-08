import { type BlockTypeId } from "#ir/common.ts";

function ensureValidIdentifierStart(value: string): string {
  return /^[0-9]/.test(value) ? `_${value}` : value;
}

export function blockComponentName(id: BlockTypeId): string {
  return ensureValidIdentifierStart(
    String(id)
      .split(/[^a-z0-9]+/i)
      .filter(Boolean)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(""),
  );
}

export function blockDirName(id: BlockTypeId): string {
  return String(id);
}

export function blockPropsInterfaceName(id: BlockTypeId): string {
  return `${blockComponentName(id)}Props`;
}

export function kebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.toLowerCase())
    .join("-");
}

const parts = (value: string): string[] => kebabCase(value).split("-");

const pascal = (value: string): string =>
  ensureValidIdentifierStart(
    parts(value)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(""),
  );

const camel = (value: string): string => {
  const value_ = pascal(value);
  return value_.charAt(0).toLowerCase() + value_.slice(1);
};

export const pascalCase = pascal;
export const schemaTypeName = camel;
export const schemaFileName = (id: string): string => `${kebabCase(id)}.ts`;
export const componentDirName = kebabCase;
export const propsInterfaceName = (id: string): string => `${pascal(id)}Props`;
export const richTextWrapperName = (field: string): string => `RichText${pascal(field)}`;
export const richTextWrapperFile = (field: string): string => `rich-text-${kebabCase(field)}.tsx`;

export function duplicateNameWarnings(entries: readonly { label: string; name: string }[], subject: string): string[] {
  const groups = new Map<string, string[]>();
  for (const { label, name } of entries) {
    const group = groups.get(name);
    if (group === undefined) groups.set(name, [label]);
    else group.push(label);
  }

  const warnings: string[] = [];
  for (const [name, labels] of groups) {
    if (labels.length < 2) continue;
    warnings.push(
      `${labels.join(" and ")} both resolve to the same ${subject} "${name}" — this will fail to compile with a duplicate identifier`,
    );
  }
  return warnings;
}

export function collisionWarnings(ids: readonly string[], nameFor: (id: string) => string, subject: string): string[] {
  return duplicateNameWarnings(
    ids.map((id) => ({ label: `block id "${id}"`, name: nameFor(id) })),
    subject,
  );
}

export function titleCase(name: string): string {
  const joined = kebabCase(name).split("-").join(" ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}
