/* Migration seed (generated). Run once from the deliverable app dir:
 *   pnpm seed
 * Reads the migration IR from .migration/, so this is an OPERATOR step — a cloned repo without
 * .migration/ cannot re-run it.
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { createClient, type SanityClient } from "@sanity/client";

import { assertNoIdCollisions, documentId, type SeedDocRef } from "./doc-id.ts";
import {
  blockArrayFor,
  sanityDataForFields,
  type BlockDef,
  type BlockRecord,
  type FieldDef,
  type FieldTypeNode,
  type LayoutFieldSource,
  type SeedCtx,
} from "./transform.ts";

const SEED_API_VERSION = "2024-01-01";
const MUTATION_BATCH_SIZE = 100;

const CHROME_ROLES: readonly string[] = ["header", "footer"];

function findMigrationRoot(start: string): string {
  let current = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(current, ".migration", "manifest.json"))) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error("could not find .migration/manifest.json above the working directory");
    current = parent;
  }
}

const MIGRATION_ROOT = findMigrationRoot(process.cwd());
const ARTIFACTS_DIR = path.join(MIGRATION_ROOT, ".migration", "artifacts");
const SNAPSHOT_DIR = path.join(MIGRATION_ROOT, ".migration", "snapshot");

const warnings: string[] = [];
const warn = (message: string): void => {
  warnings.push(message);
  console.warn(`[seed] warn: ${message}`);
};

async function readEnvelope<T>(relativePath: string): Promise<T | undefined> {
  try {
    const raw = JSON.parse(await readFile(path.join(ARTIFACTS_DIR, relativePath), "utf8")) as { data: T };
    return raw.data;
  } catch {
    return undefined;
  }
}

interface AssetRecord {
  assetId: string;
  canonicalUrl: string;
  status: string;
  kind?: string;
  storePath?: string;
  contentType?: string;
}

interface CollectionData {
  key: string;
  fields: FieldDef[];
  pageBinding: { slugField: string };
  items: Record<string, unknown>[];
}

interface GlobalData {
  name: string;
  fields: FieldDef[];
  values: Record<string, unknown>;
}

interface PageNode {
  path: string;
  slug: string;
  parentPath: string | null;
  route: string | null;
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
}

interface RunConfigTarget {
  projectId?: string;
  dataset?: string;
}

async function loadTarget(): Promise<{ projectId: string; dataset: string }> {
  const raw = JSON.parse(await readFile(path.join(MIGRATION_ROOT, ".migration", "run-config.json"), "utf8")) as {
    target: RunConfigTarget;
  };
  const { target } = raw;
  if (target.projectId === undefined || target.dataset === undefined) {
    throw new Error("run-config.json has no target projectId/dataset — re-run init-project");
  }
  return { projectId: target.projectId, dataset: target.dataset };
}

function parseNdjson(raw: string): { meta: Record<string, unknown>; records: unknown[] } {
  const lines = raw.split("\n").filter((line) => line !== "");
  const meta = lines[0] === undefined ? {} : (JSON.parse(lines[0]) as Record<string, unknown>);
  return { meta, records: lines.slice(1).map((line) => JSON.parse(line) as unknown) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function literalFieldsOnly(fields: Record<string, LayoutFieldSource>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, source] of Object.entries(fields)) out[name] = source.value;
  return out;
}

const IMG_SRC_RE = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;

function extractImgSrcs(html: string): string[] {
  return [...html.matchAll(IMG_SRC_RE)].map((match) => match[1]).filter((src): src is string => src !== undefined);
}

function collectAssetIds(
  node: FieldTypeNode,
  value: unknown,
  ids: Set<string>,
  resolveAssetId: (url: string) => string | undefined,
): void {
  if (value === null || value === undefined) return;
  switch (node.type) {
    case "image":
    case "file":
    case "video":
      if (isRecord(value) && typeof value["assetId"] === "string") ids.add(value["assetId"]);
      return;
    case "richText":
      if (typeof value === "string") {
        for (const url of extractImgSrcs(value)) {
          const id = resolveAssetId(url);
          if (id !== undefined) ids.add(id);
        }
      }
      return;
    case "array":
      if (Array.isArray(value) && node.element !== undefined) {
        for (const entry of value) collectAssetIds(node.element, entry, ids, resolveAssetId);
      }
      return;
    case "group":
      if (isRecord(value) && node.fields !== undefined) {
        for (const field of node.fields) collectAssetIds(field.type, value[field.name], ids, resolveAssetId);
      }
      return;
    default:
      return;
  }
}

function referencedAssetIds(opts: {
  collections: CollectionData[];
  blocks: BlockDef[];
  layoutFiles: readonly { route: string; records: BlockRecord[] }[];
  globals: GlobalData[];
  resolveAssetId: (url: string) => string | undefined;
}): Set<string> {
  const ids = new Set<string>();
  for (const collection of opts.collections) {
    for (const record of collection.items) {
      for (const field of collection.fields) collectAssetIds(field.type, record[field.name], ids, opts.resolveAssetId);
    }
  }
  const blockById = new Map(opts.blocks.map((block) => [block.id, block]));
  for (const file of opts.layoutFiles) {
    for (const record of file.records) {
      const block = blockById.get(record.blockType);
      if (block === undefined) continue;
      const literal = literalFieldsOnly(record.fields);
      for (const field of block.fields) collectAssetIds(field.type, literal[field.name], ids, opts.resolveAssetId);
    }
  }
  for (const def of opts.globals) {
    for (const field of def.fields) collectAssetIds(field.type, def.values[field.name], ids, opts.resolveAssetId);
  }
  return ids;
}

async function uploadAssets(
  client: SanityClient,
  assets: AssetRecord[],
  referenced: Set<string>,
): Promise<Map<string, string>> {
  const byId = new Map(assets.map((asset) => [asset.assetId, asset]));
  const uploaded = new Map<string, string>();
  for (const assetId of [...referenced].sort()) {
    const asset = byId.get(assetId);
    if (asset === undefined) {
      warn(`referenced asset ${assetId} is not in assets/media.json`);
      continue;
    }
    if (asset.status !== "downloaded" || asset.storePath === undefined) {
      warn(`asset ${assetId} (${asset.canonicalUrl}) was not downloaded — skipped`);
      continue;
    }
    const bytes = await readFile(path.resolve(SNAPSHOT_DIR, asset.storePath));
    const assetType: "image" | "file" = asset.kind === "image" ? "image" : "file";
    const uploadedAsset = await client.assets.upload(assetType, bytes, {
      filename: path.basename(asset.storePath),
      ...(asset.contentType !== undefined ? { contentType: asset.contentType } : {}),
    });
    uploaded.set(assetId, uploadedAsset._id);
  }
  return uploaded;
}

export type SeedDoc = Record<string, unknown> & { _id: string; _type: string };

interface DocEntry {
  doc: SeedDoc;
  ref: SeedDocRef;
}

function buildCollectionDocs(
  collections: CollectionData[],
  documentTypeFor: (key: string) => string,
  ctx: SeedCtx,
): DocEntry[] {
  const entries: DocEntry[] = [];
  for (const collection of collections) {
    const itemCtx: SeedCtx = { ...ctx, slugField: collection.pageBinding.slugField };
    for (const record of collection.items) {
      const migrationId = record["id"];
      if (typeof migrationId !== "string" || migrationId === "") {
        warn(`${collection.key}: item with no "id" — skipped`);
        continue;
      }
      const slugValue = record[collection.pageBinding.slugField];
      if (typeof slugValue !== "string" || slugValue === "") {
        warn(
          `${collection.key} item "${migrationId}" has no "${collection.pageBinding.slugField}" value — slug left empty`,
        );
      }
      const id = documentId(collection.key, migrationId);
      const data = sanityDataForFields(collection.fields, record, itemCtx);
      entries.push({
        doc: { _id: id, _type: documentTypeFor(collection.key), ...data },
        ref: { id, type: collection.key, slug: migrationId },
      });
    }
  }
  return entries;
}

function chromeDisplayName(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function buildChromeDocs(globals: GlobalData[], ctx: SeedCtx): DocEntry[] {
  return globals.map((def) => {
    const id = documentId(def.name, def.name);
    const data = sanityDataForFields(def.fields, def.values, ctx);
    return {
      doc: { _id: id, _type: def.name, name: chromeDisplayName(def.name), ...data },
      ref: { id, type: def.name, slug: def.name },
    };
  });
}

function buildPageDocs(
  nodes: PageNode[],
  layoutByRoute: ReadonlyMap<string, BlockRecord[]>,
  blocks: BlockDef[],
  chromeIds: ReadonlyMap<string, string>,
  ctx: SeedCtx,
): DocEntry[] {
  return nodes.map((node) => {
    const records = node.route === null ? [] : (layoutByRoute.get(node.route) ?? []);
    const content = blockArrayFor(records, blocks, ctx);
    const id = documentId("page", node.path);

    const doc: SeedDoc = {
      _id: id,
      _type: "page",
      title: node.title,
      slug: { _type: "slug", current: node.slug },
      isContainer: node.route === null,
      content,
      ...(node.parentPath === null ?
        {}
      : { parent: { _type: "reference", _ref: documentId("page", node.parentPath) } }),
      ...(node.metaTitle === null && node.metaDescription === null ?
        {}
      : {
          seo: {
            ...(node.metaTitle === null ? {} : { metaTitle: node.metaTitle }),
            ...(node.metaDescription === null ? {} : { metaDescription: node.metaDescription }),
          },
        }),
    };
    for (const [role, chromeId] of chromeIds) doc[role] = { _type: "reference", _ref: chromeId };

    return { doc, ref: { id, type: "page", slug: node.path } };
  });
}

async function commitInBatches(client: SanityClient, docs: readonly SeedDoc[]): Promise<void> {
  for (let start = 0; start < docs.length; start += MUTATION_BATCH_SIZE) {
    const batch = docs.slice(start, start + MUTATION_BATCH_SIZE);
    const transaction = client.transaction();
    for (const doc of batch) transaction.createOrReplace(doc);
    await transaction.commit();
  }
}

async function main(): Promise<void> {
  const token = process.env["SANITY_API_WRITE_TOKEN"];
  if (token === undefined || token === "") {
    throw new Error("SANITY_API_WRITE_TOKEN must be set in the operator's own shell environment");
  }
  const { projectId, dataset } = await loadTarget();
  const client = createClient({ projectId, dataset, apiVersion: SEED_API_VERSION, token, useCdn: false });

  const documentTypeByKey = JSON.parse(
    await readFile(path.join(import.meta.dirname, "document-types.json"), "utf8"),
  ) as Record<string, string>;
  const documentTypeFor = (key: string): string => documentTypeByKey[key] ?? key;

  const collections = (await readEnvelope<{ collections: CollectionData[] }>("collections.json"))?.collections ?? [];
  const blocks = (await readEnvelope<{ blocks: BlockDef[] }>("blocks.json"))?.blocks ?? [];
  const globals = ((await readEnvelope<{ globals: GlobalData[] }>("globals.json"))?.globals ?? []).filter((def) =>
    CHROME_ROLES.includes(def.name),
  );
  const assets = (await readEnvelope<{ assets: AssetRecord[] }>("assets/media.json"))?.assets ?? [];

  let pageNodes: PageNode[];
  try {
    const raw = JSON.parse(await readFile(path.join(ARTIFACTS_DIR, "generate", "page-tree.json"), "utf8")) as {
      nodes: PageNode[];
    };
    pageNodes = raw.nodes;
  } catch {
    throw new Error(
      "generate/page-tree.json is missing — run generate:scaffold before seeding, or pages would be silently omitted",
    );
  }

  const layoutFiles: { route: string; records: BlockRecord[] }[] = [];
  const routesDir = path.join(ARTIFACTS_DIR, "layout", "routes");
  let routeFiles: string[] = [];
  try {
    routeFiles = (await readdir(routesDir, { recursive: true })).filter((file) => file.endsWith(".ndjson"));
  } catch {
    warn("layout/routes is missing — no page content seeded");
  }
  for (const file of routeFiles) {
    const parsed = parseNdjson(await readFile(path.join(routesDir, file), "utf8"));
    const route = typeof parsed.meta["route"] === "string" ? parsed.meta["route"] : undefined;
    if (route === undefined) {
      warn(`layout/routes/${file}: meta has no route — skipped`);
      continue;
    }
    layoutFiles.push({ route, records: parsed.records as BlockRecord[] });
  }
  const layoutByRoute = new Map(layoutFiles.map((file) => [file.route, file.records]));

  const urlToAssetId = new Map(assets.map((asset) => [asset.canonicalUrl, asset.assetId]));
  const resolveAssetId = (url: string): string | undefined => urlToAssetId.get(url);

  const referenced = referencedAssetIds({ collections, blocks, layoutFiles, globals, resolveAssetId });
  const uploaded = await uploadAssets(client, assets, referenced);

  const ctx: SeedCtx = {
    uploadedAssetId: (assetId) => uploaded.get(assetId),
    resolveAssetId,
    warn,
  };

  const collectionEntries = buildCollectionDocs(collections, documentTypeFor, ctx);
  const chromeEntries = buildChromeDocs(globals, ctx);
  const chromeIds = new Map(chromeEntries.map((entry) => [entry.ref.type, entry.ref.id]));
  const pageEntries = buildPageDocs(pageNodes, layoutByRoute, blocks, chromeIds, ctx);

  const allEntries = [...collectionEntries, ...chromeEntries, ...pageEntries];
  assertNoIdCollisions(allEntries.map((entry) => entry.ref));

  await commitInBatches(
    client,
    allEntries.map((entry) => entry.doc),
  );

  const summary = {
    assetsUploaded: uploaded.size,
    items: Object.fromEntries(collections.map((collection) => [collection.key, collection.items.length])),
    chrome: chromeEntries.map((entry) => entry.ref.type),
    pages: pageEntries.length,
    warnings,
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
