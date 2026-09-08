import { join } from "node:path";

import { readArtifact } from "#ir/artifact.ts";
import { blocksArtifact } from "#ir/blocks.ts";
import { collectionsArtifact, type CollectionEntry } from "#ir/collections.ts";
import { globalsArtifact } from "#ir/globals.ts";
import { pagesArtifact } from "#ir/pages.ts";
import { writeFileAtomic } from "#lib/fs.ts";
import { loadRunConfig } from "#run-config/load.ts";
import { designTokensArtifact } from "#tokens/schemas/design-tokens.ts";

import { DELIVERABLE_FILES_ARTIFACT_PATH } from "../../constants/paths.ts";
import { SANITY_API_VERSION } from "../../constants/versions.ts";
import type { ScaffoldCtx } from "../../types.ts";

import { writeSanityEnv } from "./app-env.ts";
import { createOverlayDraft, readPreviouslyWritten, writeOverlay } from "./overlay.ts";
import { scaffoldRoot } from "./root.ts";
import { scaffoldStudio } from "./studio.ts";
import {
  loadWebBlocks,
  loadWebCollections,
  loadWebFonts,
  loadWebGlobals,
  readOptional,
  writePageTreeArtifact,
} from "./utils/emit-deliverable.ts";
import { scaffoldWeb } from "./web.ts";

export async function emitDeliverable(args: { projectPath: string }): Promise<{ files: string[]; warnings: string[] }> {
  const { projectPath } = args;
  const warnings: string[] = [];
  const warn = (message: string): void => void warnings.push(message);

  const runConfig = await loadRunConfig(projectPath);
  const { target } = runConfig;

  const blocks = (await readArtifact(projectPath, blocksArtifact)).data.blocks;
  const globals = (await readArtifact(projectPath, globalsArtifact)).data.globals;
  const tokens = (await readArtifact(projectPath, designTokensArtifact)).data;
  const pages = (await readArtifact(projectPath, pagesArtifact)).data;
  const collections: CollectionEntry[] =
    (await readOptional(() => readArtifact(projectPath, collectionsArtifact)))?.collections ?? [];

  const routeByKey = new Map(pages.collections.map((collection) => [collection.key, collection.routePattern]));

  const { draft, templates, emitted } = createOverlayDraft();
  const previouslyWritten = await readPreviouslyWritten(projectPath);
  const ctx: ScaffoldCtx = { projectPath, draft, warn };

  await scaffoldRoot(ctx);
  await scaffoldStudio(ctx, { blocks, collections, globals, target, sourceUrl: runConfig.sourceUrl, routeByKey });
  await writePageTreeArtifact({ projectPath, pages, warn });

  const fonts = await loadWebFonts(projectPath);
  await scaffoldWeb(ctx, {
    blocks: await loadWebBlocks(projectPath, blocks),
    collections: await loadWebCollections(projectPath, collections, routeByKey),
    globals: await loadWebGlobals(projectPath, globals),
    sourceUrl: runConfig.sourceUrl,
    apiVersion: SANITY_API_VERSION,
    tokens,
    ...(fonts !== undefined ? { fonts } : {}),
  });

  const { files, removed } = await writeOverlay({ projectPath, templates, emitted, previouslyWritten });
  await writeFileAtomic(
    join(projectPath, DELIVERABLE_FILES_ARTIFACT_PATH),
    `${JSON.stringify({ files, removed, warnings }, null, 2)}\n`,
  );

  await writeSanityEnv({
    projectPath,
    target: { projectId: target.projectId, dataset: target.dataset, apiVersion: SANITY_API_VERSION },
  });

  return { files, warnings };
}
