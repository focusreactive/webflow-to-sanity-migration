import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { readNdjsonArtifact } from "#ir/artifact.ts";
import type { BlockType } from "#ir/blocks.ts";
import type { CollectionEntry } from "#ir/collections.ts";
import type { GlobalDef } from "#ir/globals.ts";
import { layoutRouteArtifactFor } from "#ir/layout.ts";
import type { PagesData } from "#ir/pages.ts";
import { writeFileAtomic } from "#lib/fs.ts";
import { routeDir } from "#lib/route-dir.ts";
import { FONT_ASSETS_DIR, FONTS_CSS_RELATIVE_PATH } from "#lib/snapshot-store/fonts.ts";
import { SNAPSHOT_DIR } from "#lib/snapshot-store/paths.ts";
import { synthEntryDir } from "#lib/synth-store/paths.ts";

import { LOCALE_CODE } from "../../../constants/locale.ts";
import { PAGE_TREE_ARTIFACT_PATH } from "../../../constants/paths.ts";
import { buildPageTreeArtifact } from "../page-meta.ts";
import type { WebBlockEntry, WebCollectionEntry, WebFonts, WebGlobalEntry } from "../web.ts";

export async function readOptional<T>(reader: () => Promise<{ data: T }>): Promise<T | undefined> {
  try {
    return (await reader()).data;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function readRichTextDir(dir: string): Promise<Record<string, string> | undefined> {
  if (!existsSync(dir)) return undefined;
  const files = (await readdir(dir)).filter((file) => file.endsWith(".tsx")).sort();
  if (files.length === 0) return undefined;
  const entries = await Promise.all(
    files.map(async (file) => [file.replace(/\.tsx$/, ""), await readFile(join(dir, file), "utf8")] as const),
  );
  return Object.fromEntries(entries);
}

export async function loadWebFonts(projectPath: string): Promise<WebFonts | undefined> {
  const cssPath = join(projectPath, SNAPSHOT_DIR, FONTS_CSS_RELATIVE_PATH);
  if (!existsSync(cssPath)) return undefined;
  const css = await readFile(cssPath, "utf8");

  const assetsDir = join(projectPath, SNAPSHOT_DIR, FONT_ASSETS_DIR);
  const assets = new Map<string, Buffer>();
  if (existsSync(assetsDir)) {
    for (const file of (await readdir(assetsDir)).sort()) assets.set(file, await readFile(join(assetsDir, file)));
  }
  return { css, assets };
}

export async function loadWebBlocks(projectPath: string, blocks: readonly BlockType[]): Promise<WebBlockEntry[]> {
  const entries: WebBlockEntry[] = [];
  for (const block of blocks) {
    const id = String(block.id);
    const dir = synthEntryDir(projectPath, "blocks", id);
    const componentPath = join(dir, "Component.tsx");
    if (!existsSync(componentPath)) {
      throw new Error(`block "${id}" is missing Component.tsx — run the synth blocks stage for it first`);
    }
    const component = await readFile(componentPath, "utf8");
    const richText = await readRichTextDir(join(dir, "richtext"));
    entries.push({ block, component, ...(richText !== undefined ? { richText } : {}) });
  }
  return entries;
}

export async function loadWebGlobals(projectPath: string, globals: readonly GlobalDef[]): Promise<WebGlobalEntry[]> {
  const entries: WebGlobalEntry[] = [];
  for (const global of globals) {
    const dir = synthEntryDir(projectPath, "globals", global.name);
    const componentPath = join(dir, "Component.tsx");
    if (!existsSync(componentPath)) {
      throw new Error(`global "${global.name}" is missing Component.tsx — run the synth globals stage for it first`);
    }
    const component = await readFile(componentPath, "utf8");
    const richText = await readRichTextDir(join(dir, "richtext"));
    entries.push({ global, component, ...(richText !== undefined ? { richText } : {}) });
  }
  return entries;
}

export async function loadWebCollections(
  projectPath: string,
  collections: readonly CollectionEntry[],
  routeByKey: ReadonlyMap<string, string>,
): Promise<WebCollectionEntry[]> {
  const entries: WebCollectionEntry[] = [];
  for (const entry of collections) {
    const key = String(entry.key);
    const sections: Record<string, string> = {};
    const richText: Record<string, Record<string, string>> = {};
    for (const binding of entry.template) {
      const sectionDir = join(synthEntryDir(projectPath, "collections", key), "sections", binding.sectionId);
      const sectionPath = join(sectionDir, "Component.tsx");
      if (!existsSync(sectionPath)) continue;
      sections[binding.sectionId] = await readFile(sectionPath, "utf8");
      const sectionRichText = await readRichTextDir(join(sectionDir, "richtext"));
      if (sectionRichText !== undefined) richText[binding.sectionId] = sectionRichText;
    }
    const routePattern = routeByKey.get(key);
    entries.push({
      entry,
      sections,
      ...(Object.keys(richText).length > 0 ? { richText } : {}),
      ...(routePattern !== undefined ? { routePattern } : {}),
    });
  }
  return entries;
}

export async function writePageTreeArtifact(opts: {
  projectPath: string;
  pages: PagesData;
  warn: (message: string) => void;
}): Promise<void> {
  const staticRoutes = opts.pages.pages.filter((page) => page.kind === "static").map((page) => page.route);

  for (const route of staticRoutes) {
    try {
      await readNdjsonArtifact(opts.projectPath, layoutRouteArtifactFor(routeDir(route)));
    } catch {
      opts.warn(`static route "${route}": layout/routes artifact missing — the page will be seeded with no content`);
    }
  }

  const nodes = await buildPageTreeArtifact({ projectPath: opts.projectPath, routes: staticRoutes });
  await writeFileAtomic(
    join(opts.projectPath, PAGE_TREE_ARTIFACT_PATH),
    `${JSON.stringify({ localeCode: LOCALE_CODE, nodes }, null, 2)}\n`,
  );
}
