import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { duplicateNameWarnings, schemaFileName, schemaTypeName, titleCase } from "#blocks/codegen/names.ts";
import { emitBlockSchema } from "#blocks/codegen/schema.ts";
import { emitPortableTextType } from "#generate/deliverable/shared/portable-text.ts";
import type { SanityFieldCtx } from "#generate/sanity-field.ts";
import type { BlockType } from "#ir/blocks.ts";
import type { CollectionEntry } from "#ir/collections.ts";
import { GLOBAL_NAMES, type GlobalDef } from "#ir/globals.ts";
import type { RunConfig } from "#run-config/schema.ts";

import { DELIVERABLE_SRC_DIR } from "../../constants/dirs.ts";
import { readTemplate } from "../../templates/read-template.ts";
import type { ScaffoldCtx } from "../../types.ts";

import { emitChromeDocument, emitCollectionDocument } from "./document-schema.ts";
import { buildDocumentTypeMap } from "./document-type.ts";
import { emitPageBuilder, emitPageDocument } from "./page-schema.ts";
import { emitPresentationResolve, type PresentationCollectionEntry } from "./presentation-resolve.ts";
import { emitSchemaRegistry, type SchemaModuleRef } from "./registry.ts";

export interface StudioIr {
  blocks: BlockType[];
  collections: CollectionEntry[];
  globals: GlobalDef[];
  target: RunConfig["target"];
  sourceUrl: string;
  routeByKey?: ReadonlyMap<string, string>;
}

const SHARED_ALIAS_PREFIX = "#generate/deliverable/shared/";
const sharedDir = join(DELIVERABLE_SRC_DIR, "shared");

function studioPath(...segments: string[]): string {
  return ["studio", ...segments].join("/");
}

function withoutExt(fileName: string): string {
  return fileName.replace(/\.ts$/, "");
}

export function titleFromSourceUrl(sourceUrl: string): string {
  return new URL(sourceUrl).hostname.replace(/^www\./, "");
}

function structureListItem(type: string, title: string): string {
  return `S.documentTypeListItem(${JSON.stringify(type)}).title(${JSON.stringify(title)})`;
}

function rewriteSharedAliasImports(code: string): string {
  return code.replaceAll(SHARED_ALIAS_PREFIX, "./");
}

async function readCopy(dir: string, relativePath: string): Promise<string> {
  return rewriteSharedAliasImports(await readFile(join(dir, relativePath), "utf8"));
}

async function scaffoldSeedScript(
  ctx: ScaffoldCtx,
  documentTypeByKey: Readonly<Record<string, string>>,
): Promise<void> {
  ctx.draft.emit(studioPath("scripts/seed.ts"), await readTemplate("studio/seed.ts.tpl"));
  ctx.draft.emit(studioPath("scripts/doc-id.ts"), await readCopy(DELIVERABLE_SRC_DIR, "seed/doc-id.ts"));
  ctx.draft.emit(studioPath("scripts/transform.ts"), await readCopy(DELIVERABLE_SRC_DIR, "seed/transform.ts"));
  ctx.draft.emit(studioPath("scripts/html-to-portable-text.ts"), await readCopy(sharedDir, "html-to-portable-text.ts"));
  ctx.draft.emit(studioPath("scripts/color.ts"), await readCopy(sharedDir, "color.ts"));
  ctx.draft.emit(studioPath("scripts/portable-text.ts"), await readCopy(sharedDir, "portable-text.ts"));
  ctx.draft.emit(studioPath("scripts/define-wrap.ts"), await readCopy(sharedDir, "define-wrap.ts"));
  ctx.draft.emit(studioPath("scripts/source.ts"), await readCopy(sharedDir, "source.ts"));
  ctx.draft.emit(studioPath("scripts/document-types.json"), `${JSON.stringify(documentTypeByKey, null, 2)}\n`);
}

export async function scaffoldStudio(ctx: ScaffoldCtx, ir: StudioIr): Promise<void> {
  const { blocks, collections, globals, target, sourceUrl } = ir;
  const routeByKey: ReadonlyMap<string, string> = ir.routeByKey ?? new Map();

  const { map: documentTypeMap, warnings: documentTypeWarnings } = buildDocumentTypeMap(collections);
  for (const warning of documentTypeWarnings) ctx.warn(warning);
  const documentTypeFor = (key: string): string => documentTypeMap.get(key) ?? schemaTypeName(key);
  const fieldCtx: SanityFieldCtx = { documentTypeFor, path: [] };

  const registry: SchemaModuleRef[] = [];
  const labeled: { label: string; name: string }[] = [];

  for (const block of blocks) {
    const file = schemaFileName(block.id);
    const name = schemaTypeName(block.id);
    ctx.draft.emit(studioPath("src/schemaTypes/blocks", file), emitBlockSchema(block, fieldCtx));
    registry.push({ importPath: `./blocks/${withoutExt(file)}`, name });
    labeled.push({ label: `block id "${block.id}"`, name });
  }

  ctx.draft.emit(studioPath("src/schemaTypes/objects/portable-text.ts"), emitPortableTextType());
  registry.push({ importPath: "./objects/portable-text", name: "portableText" });
  labeled.push({ label: 'the fixed "portableText" object type', name: "portableText" });

  const globalByName = new Map(globals.map((def) => [def.name, def]));
  const chromeNames: string[] = [];
  for (const role of GLOBAL_NAMES) {
    const def = globalByName.get(role);
    if (def === undefined) {
      ctx.warn(`chrome "${role}": the IR has no such global — the studio ships no document for that slot`);
      continue;
    }
    chromeNames.push(role);
    const file = schemaFileName(role);
    const name = schemaTypeName(role);
    ctx.draft.emit(studioPath("src/schemaTypes/documents", file), emitChromeDocument(def, fieldCtx));
    registry.push({ importPath: `./documents/${withoutExt(file)}`, name });
    labeled.push({ label: `chrome "${role}"`, name });
  }

  for (const entry of collections) {
    const typeName = documentTypeFor(String(entry.key));
    const file = schemaFileName(typeName);
    ctx.draft.emit(studioPath("src/schemaTypes/documents", file), emitCollectionDocument(entry, fieldCtx));
    registry.push({ importPath: `./documents/${withoutExt(file)}`, name: typeName });
    labeled.push({ label: `collection "${String(entry.key)}"`, name: typeName });
  }

  ctx.draft.emit(studioPath("src/schemaTypes/documents/page.ts"), emitPageDocument({ chromeNames }));
  registry.push({ importPath: "./documents/page", name: "page" });
  labeled.push({ label: 'the fixed "page" document', name: "page" });

  if (blocks.length === 0) {
    ctx.warn("blocks: the IR has no block types — the page builder ships with no members and every page is empty");
  }
  ctx.draft.emit(
    studioPath("src/schemaTypes/page-builder.ts"),
    emitPageBuilder(blocks.map((block) => String(block.id))),
  );
  registry.push({ importPath: "./page-builder", name: "pageBuilder" });
  labeled.push({ label: 'the fixed "pageBuilder" field type', name: "pageBuilder" });

  for (const warning of duplicateNameWarnings(labeled, "schema constant")) ctx.warn(warning);

  ctx.draft.emit(studioPath("src/schemaTypes/index.ts"), emitSchemaRegistry(registry));

  const contentItems = collections
    .map((entry) => structureListItem(documentTypeFor(String(entry.key)), entry.label))
    .join(",\n              ");
  const siteItems = chromeNames.map((role) => structureListItem(role, titleCase(role))).join(",\n              ");
  ctx.draft.emit(
    studioPath("src/structure.ts"),
    await readTemplate("studio/structure.ts.tpl", { CONTENT_ITEMS: contentItems, SITE_ITEMS: siteItems }),
  );

  const presentationCollectionEntries: PresentationCollectionEntry[] = [];
  for (const entry of collections) {
    const routePattern = routeByKey.get(String(entry.key));
    if (routePattern === undefined) continue;
    presentationCollectionEntries.push({
      documentType: documentTypeFor(String(entry.key)),
      slugField: entry.pageBinding.slugField,
      routePattern,
    });
  }
  ctx.draft.emit(studioPath("src/presentation/page-tree.ts"), await readCopy(DELIVERABLE_SRC_DIR, "page-tree.ts"));
  ctx.draft.emit(studioPath("src/presentation/resolve.ts"), emitPresentationResolve(presentationCollectionEntries));

  ctx.draft.emit(
    studioPath("sanity.config.ts"),
    await readTemplate("studio/sanity.config.ts.tpl", {
      TITLE: titleFromSourceUrl(sourceUrl),
      PROJECT_ID: target.projectId,
      DATASET: target.dataset,
    }),
  );
  ctx.draft.emit(
    studioPath("sanity.cli.ts"),
    await readTemplate("studio/sanity.cli.ts.tpl", { PROJECT_ID: target.projectId, DATASET: target.dataset }),
  );
  ctx.draft.emit(studioPath("package.json"), await readTemplate("studio/package.json.tpl"));
  ctx.draft.emit(studioPath("tsconfig.json"), await readTemplate("studio/tsconfig.json.tpl"));

  const documentTypeByKey = Object.fromEntries(
    collections.map((entry) => [String(entry.key), documentTypeFor(String(entry.key))]),
  );
  await scaffoldSeedScript(ctx, documentTypeByKey);
}
