import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { syntheticAssetRef } from "#generate/steps/scaffold/input-value.ts";
import type { InputResolvers } from "#generate/types.ts";
import { writeArtifact } from "#ir/artifact.ts";
import { mediaAssetsArtifact } from "#ir/assets.ts";
import type { AssetId, CollectionId } from "#ir/common.ts";
import { buildEntityInput, writeEntityInput } from "#synth/steps/input-build/build-entity-input.ts";

const SHA = "b".repeat(64);
const META = { sha: SHA, ext: "png" };

function resolvers(overrides: Partial<InputResolvers> = {}): InputResolvers {
  return {
    assetSrc: () => undefined,
    assetMeta: (assetId) => (assetId === "a1" ? META : undefined),
    resolveDoc: () => {
      throw new Error("resolveDoc is not stubbed in this test");
    },
    collectionListDocs: () => {
      throw new Error("collectionListDocs is not stubbed in this test");
    },
    ...overrides,
  };
}

describe("buildEntityInput", () => {
  it("passes plain text fields through untouched", () => {
    const result = buildEntityInput({
      fields: [{ name: "heading", label: "Heading", type: { type: "text" }, required: true }],
      literals: { heading: "Title" },
      resolvers: resolvers(),
    });
    expect(result).toEqual({ heading: "Title" });
  });

  it("turns an image field into a Sanity image with a synthetic asset reference", () => {
    const result = buildEntityInput({
      fields: [{ name: "image", label: "Image", type: { type: "image" }, required: true }],
      literals: { image: { assetId: "a1", alt: "Shot" } },
      resolvers: resolvers(),
    });
    expect(result).toEqual({
      image: { _type: "image", alt: "Shot", asset: { _type: "reference", _ref: syntheticAssetRef(META) } },
    });
  });

  it("drops an unresolved asset rather than emitting a dangling reference", () => {
    const result = buildEntityInput({
      fields: [{ name: "image", label: "Image", type: { type: "image" }, required: true }],
      literals: { image: { assetId: "missing", alt: "Shot" } },
      resolvers: resolvers(),
    });
    expect(result["image"]).toBeUndefined();
  });

  it("converts a richText field to Portable Text and resolves its inline images to the same ref shape", () => {
    const url = "https://cdn.example.com/inline.png";
    const result = buildEntityInput({
      fields: [{ name: "body", label: "Body", type: { type: "richText" }, required: false }],
      literals: { body: `<p>Hi</p><p><img src="${url}"></p>` },
      resolvers: resolvers({ assetMeta: () => META }),
    });
    const blocks = result["body"] as { _type: string; asset?: { _ref: string } }[];
    const images = blocks.filter((block) => block._type === "image");
    expect(blocks[0]?._type).toBe("block");
    expect(images).toHaveLength(1);
    expect(images[0]?.asset?._ref).toBe(syntheticAssetRef(META));
  });

  it("resolves a reference field into the referenced document, not the id it was stored as", () => {
    const teamKey = "team-key" as CollectionId;
    const author = { id: "wilson-tomales", _provenance: "ai" as const, name: "Wilson Tomales" };
    const result = buildEntityInput({
      fields: [
        { name: "author", label: "Author", type: { type: "reference", collectionKey: teamKey }, required: true },
      ],
      literals: { author: "wilson-tomales" },
      resolvers: resolvers({
        resolveDoc: (collectionKey, id) => {
          expect(collectionKey).toBe(teamKey);
          expect(id).toBe("wilson-tomales");
          return author;
        },
      }),
    });
    expect(result).toEqual({ author });
  });

  it("resolves a multiReference field into an array of referenced documents", () => {
    const postKey = "post-key" as CollectionId;
    const posts = [
      { id: "post-a", _provenance: "ai" as const, title: "Post A" },
      { id: "post-b", _provenance: "ai" as const, title: "Post B" },
    ];
    const result = buildEntityInput({
      fields: [
        {
          name: "relatedPosts",
          label: "Related posts",
          type: { type: "multiReference", collectionKey: postKey },
          required: false,
        },
      ],
      literals: { relatedPosts: ["post-a", "post-b"] },
      resolvers: resolvers({
        collectionListDocs: (collectionKey, ids) => {
          expect(collectionKey).toBe(postKey);
          return ids.map((id) => {
            const post = posts.find((candidate) => candidate.id === id);
            if (post === undefined) throw new Error(`unexpected id ${id}`);
            return post;
          });
        },
      }),
    });
    expect(result).toEqual({ relatedPosts: posts });
  });

  it("resolves a media field nested in a referenced document through that collection's own fields", () => {
    const projectsKey = "projects" as CollectionId;
    const result = buildEntityInput({
      fields: [
        { name: "project", label: "Project", type: { type: "reference", collectionKey: projectsKey }, required: true },
      ],
      literals: { project: "p1" },
      resolvers: resolvers({
        resolveDoc: () => ({ id: "p1", _provenance: "ai" as const, heroImage: { assetId: "a1" } }),
        fieldsForCollection: () => [{ name: "heroImage", type: { type: "image" } }],
      }),
    });
    expect(result).toEqual({
      project: {
        id: "p1",
        _provenance: "ai",
        heroImage: { _type: "image", asset: { _type: "reference", _ref: syntheticAssetRef(META) } },
      },
    });
  });
});

describe("writeEntityInput", () => {
  it("writes an input.json whose image field carries the synthetic reference built from media.json", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "synth-input-build-"));
    await writeArtifact(projectPath, mediaAssetsArtifact, {
      provenance: "ai",
      data: {
        assets: [
          {
            assetId: "a1" as AssetId,
            kind: "image",
            canonicalUrl: "https://cdn.example.com/hero.png",
            status: "downloaded",
            sources: ["img-src"],
            storePath: "assets/hero.png",
            contentSha256: SHA,
            contentType: "image/png",
          },
        ],
      },
    });

    const path = await writeEntityInput({
      projectPath,
      vertical: "blocks",
      entityKey: "hero",
      fields: [{ name: "image", label: "Image", type: { type: "image" }, required: true }],
      literals: { image: { assetId: "a1", alt: "Hero" } },
    });

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      image: { _type: "image", alt: "Hero", asset: { _type: "reference", _ref: `image-${SHA}-0x0-png` } },
    });
  });
});
