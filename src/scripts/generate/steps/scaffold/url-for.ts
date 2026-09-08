export const URL_FOR_CHAIN = ["width", "height", "format", "quality", "fit", "url"] as const;

export const SANITY_ASSET_ROUTE_PREFIX = "/__mig-asset/";

const IMAGE_REF = /^image-([a-f0-9]+)-\d+x\d+-([a-z0-9]+)$/;

export function parseImageRef(ref: string): { sha: string; ext: string } | undefined {
  const match = IMAGE_REF.exec(ref);
  if (match === null) return undefined;
  const [, sha, ext] = match;
  return sha === undefined || ext === undefined ? undefined : { sha, ext };
}

export function emitImageHelper(): string {
  return `import { createImageUrlBuilder, type SanityImageSource } from "@sanity/image-url";

import { client } from "./client";

const builder = createImageUrlBuilder(client);

export function urlFor(source: SanityImageSource) {
  return builder.image(source);
}
`;
}
