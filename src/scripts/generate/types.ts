import type { BlockField } from "#ir/blocks.ts";

export type SlugResolver = (collectionKey: string) => string;

export interface SurfaceShard {
  key: string;
  name: string;
  fields: BlockField[];
  collectionKey?: string;
}
