import { schemaTypeName } from "#blocks/codegen/names.ts";

export const RESERVED_DOCUMENT_TYPES: ReadonlySet<string> = new Set([
  "page",
  "header",
  "footer",
  "pageBuilder",
  "portableText",
  "media",
  "sanity.imageAsset",
  "sanity.fileAsset",
]);

export interface DocumentTypeAssignment {
  map: Map<string, string>;
  warnings: string[];
}

export function buildDocumentTypeMap(collections: readonly { key: string }[]): DocumentTypeAssignment {
  const used = new Set<string>(RESERVED_DOCUMENT_TYPES);
  const map = new Map<string, string>();
  const warnings: string[] = [];

  for (const collection of collections) {
    const key = String(collection.key);
    const base = schemaTypeName(key);
    const collidesWithReserved = RESERVED_DOCUMENT_TYPES.has(base);

    let type = base;
    let n = 2;
    while (used.has(type)) {
      type = `${base}${n}`;
      n += 1;
    }

    if (type !== base) {
      warnings.push(
        collidesWithReserved
          ? `collection "${key}": document type "${base}" collides with a reserved Sanity type; renamed to "${type}"`
          : `collection "${key}": document type "${base}" collides with another migrated collection; renamed to "${type}"`,
      );
    }

    used.add(type);
    map.set(key, type);
  }

  return { map, warnings };
}
