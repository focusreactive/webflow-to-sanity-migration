import { resolve } from "node:path";

import type { CollectionId } from "#ir/common.ts";
import {
  buildAssetMetaIndex,
  buildAssetPathBySha,
  buildAssetSrcIndex,
  resolveMediaRecord,
  type FieldsForCollection,
} from "#synth/steps/input-build/utils/media-input.ts";

const srcOf = (assetId: string): string | undefined =>
  assetId === "a1" ? "/@fs/snap/img.png"
  : assetId === "v1" ? "/@fs/snap/hero.mp4"
  : undefined;

describe("resolveMediaRecord", () => {
  it("maps {assetId, alt} to {src, alt} for image/file/video fields, recursing into arrays and groups", () => {
    const fields = [
      { name: "photo", type: { type: "image" as const } },
      {
        name: "gallery",
        type: { type: "array" as const, element: { type: "image" as const } },
      },
      {
        name: "card",
        type: {
          type: "group" as const,
          fields: [{ name: "icon", type: { type: "image" as const }, required: false }],
        },
      },
      { name: "clip", type: { type: "video" as const } },
      { name: "title", type: { type: "text" as const } },
    ];
    const record = {
      photo: { assetId: "a1", alt: "hero" },
      gallery: [{ assetId: "a1" }],
      card: { icon: { assetId: "missing" } },
      clip: { assetId: "v1" },
      title: "hi",
    };
    const noFields: FieldsForCollection = () => [];
    expect(resolveMediaRecord(fields, record, srcOf, noFields)).toEqual({
      photo: { src: "/@fs/snap/img.png", alt: "hero" },
      gallery: [{ src: "/@fs/snap/img.png" }],
      card: { icon: { src: "" } },
      clip: { src: "/@fs/snap/hero.mp4" },
      title: "hi",
    });
  });

  it("recurses into reference/multiReference values to resolve media fields nested in the referenced doc", () => {
    const projectsKey = "projects" as CollectionId;
    const projectFields = [{ name: "heroImage", type: { type: "image" as const } }];
    const fieldsForCollection: FieldsForCollection = (collectionKey) =>
      collectionKey === projectsKey ? projectFields : [];

    const single = [
      { name: "project", type: { type: "reference" as const, collectionKey: projectsKey } },
    ];
    expect(
      resolveMediaRecord(
        single,
        { project: { id: "p1", heroImage: { assetId: "a1", alt: "Hero" } } },
        srcOf,
        fieldsForCollection,
      ),
    ).toEqual({ project: { id: "p1", heroImage: { src: "/@fs/snap/img.png", alt: "Hero" } } });

    const many = [
      { name: "projects", type: { type: "multiReference" as const, collectionKey: projectsKey } },
    ];
    expect(
      resolveMediaRecord(
        many,
        { projects: [{ id: "p1", heroImage: { assetId: "a1" } }, { id: "p2", heroImage: { assetId: "missing" } }] },
        srcOf,
        fieldsForCollection,
      ),
    ).toEqual({
      projects: [{ id: "p1", heroImage: { src: "/@fs/snap/img.png" } }, { id: "p2", heroImage: { src: "" } }],
    });
  });
});

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
