import { resolve } from "node:path";

import {
  buildAssetMetaIndex,
  buildAssetPathBySha,
  buildAssetSrcIndex,
} from "#synth/steps/input-build/utils/media-input.ts";

describe("buildAssetSrcIndex", () => {
  it("maps asset ids to absolute /@fs snapshot urls", () => {
    const assets = {
      assets: [
        {
          assetId: "a1",
          kind: "image",
          canonicalUrl: "https://x/img.png",
          status: "downloaded",
          sources: ["img-src"],
          storePath: "assets/img.png",
        },
      ],
    };
    const index = buildAssetSrcIndex("/tmp/project", assets as never);
    expect(index.get("a1")).toBe(`/@fs${resolve("/tmp/project", ".migration/snapshot", "assets/img.png")}`);
  });
});

const SHA_ASSETS = {
  assets: [
    {
      assetId: "a1",
      kind: "image",
      canonicalUrl: "https://x/img.png",
      status: "downloaded",
      sources: ["img-src"],
      storePath: "assets/img.png",
      contentSha256: "abc123",
      contentType: "image/png",
    },
    {
      assetId: "a2",
      kind: "image",
      canonicalUrl: "https://x/no-hash.png",
      status: "downloaded",
      sources: ["img-src"],
      storePath: "assets/no-hash.png",
    },
    {
      assetId: "a3",
      kind: "image",
      canonicalUrl: "https://x/no-ext",
      status: "downloaded",
      sources: ["img-src"],
      storePath: "assets/no-ext",
      contentSha256: "def456",
    },
  ],
};

describe("buildAssetPathBySha", () => {
  it("indexes the snapshot file and its content type by content hash", () => {
    const index = buildAssetPathBySha("/tmp/project", SHA_ASSETS as never);
    expect(index.get("abc123")).toEqual({
      path: resolve("/tmp/project", ".migration/snapshot", "assets/img.png"),
      contentType: "image/png",
    });
  });

  it("omits an asset with no content hash rather than keying it on undefined", () => {
    const index = buildAssetPathBySha("/tmp/project", SHA_ASSETS as never);
    expect(index.size).toBe(2);
    expect([...index.keys()]).toEqual(["abc123", "def456"]);
  });

  it("leaves contentType absent when the record carries none", () => {
    const index = buildAssetPathBySha("/tmp/project", SHA_ASSETS as never);
    expect(index.get("def456")).toEqual({ path: resolve("/tmp/project", ".migration/snapshot", "assets/no-ext") });
  });

  it("returns an empty index when there is no media artifact", () => {
    expect(buildAssetPathBySha("/tmp/project", undefined).size).toBe(0);
  });
});

describe("buildAssetMetaIndex", () => {
  it("indexes the sha and extension by asset id", () => {
    const index = buildAssetMetaIndex(SHA_ASSETS as never);
    expect(index.get("a1")).toEqual({ sha: "abc123", ext: "png" });
  });

  it("drops an asset that cannot form a ref — no hash, or no extension", () => {
    const index = buildAssetMetaIndex(SHA_ASSETS as never);
    expect(index.has("a2")).toBe(false);
    expect(index.has("a3")).toBe(false);
  });

  it("returns an empty index when there is no media artifact", () => {
    expect(buildAssetMetaIndex(undefined).size).toBe(0);
  });
});
