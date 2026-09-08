import { resolveInputValue } from "#generate/steps/scaffold/input-value.ts";
import type { InputResolvers } from "#generate/types.ts";
import type { BlockField } from "#ir/blocks.ts";
import { writeShardJson, type Vertical } from "#lib/synth-store/paths.ts";

import { inputPath } from "../../constants/paths.ts";

import { buildDocIndex, buildFieldsIndex, docResolver, fieldsForCollectionResolver } from "./utils/doc-input.ts";
import { buildAssetMetaIndex, buildAssetSrcIndex, readAssetsData } from "./utils/media-input.ts";

export interface BuildEntityInputOptions {
  fields: BlockField[];
  literals: Record<string, unknown>;
  resolvers: InputResolvers;
}

export function buildEntityInput(opts: BuildEntityInputOptions): Record<string, unknown> {
  const out: Record<string, unknown> = { ...opts.literals };
  for (const field of opts.fields) {
    if (!(field.name in opts.literals)) continue;
    out[field.name] = resolveInputValue(field, opts.literals[field.name], opts.resolvers);
  }
  return out;
}

export interface WriteEntityInputOptions {
  projectPath: string;
  vertical: Vertical;
  entityKey: string;
  fields: BlockField[];
  literals: Record<string, unknown>;
}

export async function buildInputResolvers(
  projectPath: string,
  fields: { type: BlockField["type"] }[],
): Promise<InputResolvers> {
  const assets = await readAssetsData(projectPath);
  const srcIndex = buildAssetSrcIndex(projectPath, assets);
  const metaIndex = buildAssetMetaIndex(assets);
  const docIndex = await buildDocIndex(projectPath, fields);
  const fieldsIndex = await buildFieldsIndex(projectPath, fields);
  const resolveDoc = docResolver(docIndex);

  return {
    assetSrc: (assetId) => srcIndex.get(assetId),
    assetMeta: (assetId) => metaIndex.get(assetId),
    resolveDoc,
    collectionListDocs: (collectionKey, ids) => ids.map((id) => resolveDoc(collectionKey, id)),
    fieldsForCollection: fieldsForCollectionResolver(fieldsIndex),
  };
}

export async function writeEntityInput(opts: WriteEntityInputOptions): Promise<string> {
  const input = buildEntityInput({
    fields: opts.fields,
    literals: opts.literals,
    resolvers: await buildInputResolvers(opts.projectPath, opts.fields),
  });
  const path = inputPath(opts.projectPath, opts.vertical, opts.entityKey);
  await writeShardJson(path, input);
  return path;
}
