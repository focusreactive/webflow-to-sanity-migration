import { extname, resolve } from "node:path";

import { readArtifact } from "#ir/artifact.ts";
import { mediaAssetsArtifact, type MediaAssetsData } from "#ir/assets.ts";
import type { CollectionId } from "#ir/common.ts";
import type { FieldType } from "#ir/field-type.ts";
import { SNAPSHOT_DIR } from "#lib/snapshot-store/paths.ts";

export async function readAssetsData(projectPath: string): Promise<MediaAssetsData | undefined> {
  try {
    return (await readArtifact(projectPath, mediaAssetsArtifact)).data;
  } catch {
    return undefined;
  }
}

function resolveStorePath(projectPath: string, storePath: string): string {
  return resolve(projectPath, SNAPSHOT_DIR, storePath);
}

export function buildAssetSrcIndex(projectPath: string, assets: MediaAssetsData | undefined): Map<string, string> {
  const index = new Map<string, string>();
  for (const asset of assets?.assets ?? []) {
    if (asset.storePath === undefined) continue;
    index.set(asset.assetId, `/@fs${resolveStorePath(projectPath, asset.storePath)}`);
  }
  return index;
}

export interface AssetFile {
  path: string;
  contentType?: string;
}

export interface AssetMeta {
  sha: string;
  width?: number;
  height?: number;
  ext: string;
}

export function buildAssetPathBySha(
  projectPath: string,
  assets: MediaAssetsData | undefined,
): Map<string, AssetFile> {
  const index = new Map<string, AssetFile>();
  for (const asset of assets?.assets ?? []) {
    if (asset.storePath === undefined || asset.contentSha256 === undefined) continue;
    index.set(asset.contentSha256, {
      path: resolveStorePath(projectPath, asset.storePath),
      ...(asset.contentType !== undefined ? { contentType: asset.contentType } : {}),
    });
  }
  return index;
}

export function buildAssetMetaIndex(assets: MediaAssetsData | undefined): Map<string, AssetMeta> {
  const index = new Map<string, AssetMeta>();
  for (const asset of assets?.assets ?? []) {
    const named = asset.storePath ?? asset.fileName ?? "";
    const ext = extname(named).slice(1).toLowerCase();
    if (asset.contentSha256 === undefined || ext === "") continue;
    index.set(asset.assetId, { sha: asset.contentSha256, ext });
  }
  return index;
}

export type FieldsForCollection = (collectionKey: CollectionId) => { name: string; type: FieldType }[];
