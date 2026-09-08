import type { BlockField } from "#ir/blocks.ts";
import type { CollectionId } from "#ir/common.ts";
import type { ContentRecord } from "#ir/content.ts";
import type { FieldType } from "#ir/field-type.ts";

export type SlugResolver = (collectionKey: string) => string;

export interface SurfaceShard {
  key: string;
  name: string;
  fields: BlockField[];
  collectionKey?: string;
}

export interface InputResolvers {
  assetSrc: (assetId: string) => string | undefined;
  assetMeta: (assetId: string) => { sha: string; width?: number; height?: number; ext: string } | undefined;
  resolveDoc: (collectionKey: CollectionId, id: string) => ContentRecord;
  collectionListDocs: (collectionKey: CollectionId, ids: string[]) => ContentRecord[];
  fieldsForCollection?: (collectionKey: CollectionId) => { name: string; type: FieldType }[];
}
