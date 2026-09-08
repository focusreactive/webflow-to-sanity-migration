import { resolveInputValue, syntheticAssetRef } from "#generate/steps/scaffold/input-value.ts";
import { SANITY_ASSET_ROUTE_PREFIX } from "#generate/steps/scaffold/url-for.ts";
import type { InputResolvers } from "#generate/types.ts";
import { assetIdFromCanonicalUrl } from "#ir/assets.ts";
import { collectionIdSchema } from "#ir/common.ts";
import type { ContentRecord } from "#ir/content.ts";

const SHA = "a".repeat(64);
const META = { sha: SHA, width: 800, height: 600, ext: "png" };
const IMAGE_URL = "https://cdn.example.com/hero.png";
const IMAGE_URL_ASSET_ID = String(assetIdFromCanonicalUrl(IMAGE_URL));

const record = (id: string): ContentRecord => ({ id, _provenance: "published" });

function resolvers(overrides: Partial<InputResolvers> = {}): InputResolvers {
  return {
    assetSrc: () => undefined,
    assetMeta: (assetId) => (assetId === "asset-1" || assetId === IMAGE_URL_ASSET_ID ? META : undefined),
    resolveDoc: (_collectionKey, id) => record(id),
    collectionListDocs: (_collectionKey, ids) => ids.map(record),
    ...overrides,
  };
}

const POSTS = collectionIdSchema.parse("posts");

describe("syntheticAssetRef", () => {
  it("mints a stable image ref from the asset sha, dimensions and extension", () => {
    expect(syntheticAssetRef(META)).toBe(syntheticAssetRef(META));
    expect(syntheticAssetRef(META)).toBe(`image-${SHA}-800x600-png`);
    expect(syntheticAssetRef(META)).toContain("800x600");
  });

  it("falls back to zero dimensions when the asset has none", () => {
    expect(syntheticAssetRef({ sha: SHA, ext: "svg" })).toBe(`image-${SHA}-0x0-svg`);
  });
});

describe("resolveInputValue", () => {
  it("passes a scalar value through untouched", () => {
    expect(resolveInputValue({ name: "title", type: { type: "text" } }, "Hello", resolvers())).toBe("Hello");
  });

  it("passes null and undefined through untouched", () => {
    expect(resolveInputValue({ name: "title", type: { type: "text" } }, null, resolvers())).toBeNull();
    expect(resolveInputValue({ name: "title", type: { type: "text" } }, undefined, resolvers())).toBeUndefined();
  });

  it("turns an image literal into an image object with a synthetic asset ref", () => {
    expect(
      resolveInputValue({ name: "cover", type: { type: "image" } }, { assetId: "asset-1", alt: "Hero" }, resolvers()),
    ).toEqual({
      _type: "image",
      alt: "Hero",
      asset: { _type: "reference", _ref: `image-${SHA}-800x600-png` },
    });
  });

  it("omits alt when the image literal has none", () => {
    expect(
      resolveInputValue({ name: "cover", type: { type: "image" } }, { assetId: "asset-1", alt: "" }, resolvers()),
    ).toEqual({
      _type: "image",
      asset: { _type: "reference", _ref: `image-${SHA}-800x600-png` },
    });
  });

  it("drops an image whose asset never resolved rather than emitting a dangling ref", () => {
    expect(
      resolveInputValue({ name: "cover", type: { type: "image" } }, { assetId: "missing" }, resolvers()),
    ).toBeUndefined();
  });

  it("leaves a value that is not an image literal alone", () => {
    expect(resolveInputValue({ name: "cover", type: { type: "image" } }, "not-a-literal", resolvers())).toBe(
      "not-a-literal",
    );
  });

  it("gives a file field a file ref plus a harness asset route url", () => {
    expect(resolveInputValue({ name: "doc", type: { type: "file" } }, { assetId: "asset-1" }, resolvers())).toEqual({
      _type: "file",
      asset: {
        _type: "reference",
        _ref: `file-${SHA}-png`,
        url: `${SANITY_ASSET_ROUTE_PREFIX}${SHA}.png`,
      },
    });
  });

  it("treats a video field exactly like a file field", () => {
    expect(resolveInputValue({ name: "clip", type: { type: "video" } }, { assetId: "asset-1" }, resolvers())).toEqual(
      resolveInputValue({ name: "doc", type: { type: "file" } }, { assetId: "asset-1" }, resolvers()),
    );
  });

  it("drops a file whose asset never resolved", () => {
    expect(
      resolveInputValue({ name: "doc", type: { type: "file" } }, { assetId: "missing" }, resolvers()),
    ).toBeUndefined();
  });

  it("stores a colour as the same object the seed writes", () => {
    expect(resolveInputValue({ name: "bg", type: { type: "color" } }, "rgb(255, 0, 0)", resolvers())).toEqual({
      _type: "color",
      hex: "#ff0000",
    });
  });

  it("drops a colour that converts to nothing", () => {
    expect(resolveInputValue({ name: "bg", type: { type: "color" } }, "   ", resolvers())).toBeUndefined();
  });

  it("converts rich text html into portable text blocks", () => {
    const value = resolveInputValue(
      { name: "body", type: { type: "richText" } },
      "<p>Hi <strong>there</strong></p>",
      resolvers(),
    );
    expect(Array.isArray(value)).toBe(true);
    const blocks = value as { _type: string; children: { text: string; marks: string[] }[] }[];
    expect(blocks[0]?._type).toBe("block");
    expect(blocks[0]?.children.map((child) => child.text)).toEqual(["Hi ", "there"]);
    expect(blocks[0]?.children[1]?.marks).toEqual(["strong"]);
  });

  it("resolves an inline image by hashing its url back into an asset id", () => {
    const value = resolveInputValue(
      { name: "body", type: { type: "richText" } },
      `<p><img src="${IMAGE_URL}"></p>`,
      resolvers(),
    );
    const images = (value as { _type: string; asset?: { _ref: string } }[]).filter(
      (node) => node._type === "image",
    );
    expect(images).toHaveLength(1);
    expect(images[0]?.asset?._ref).toBe(`image-${SHA}-800x600-png`);
  });

  it("leaves an unresolved inline image out of the portable text", () => {
    const value = resolveInputValue(
      { name: "body", type: { type: "richText" } },
      '<p><img src="https://cdn.example.com/unknown.png"></p>',
      resolvers(),
    );
    expect((value as { _type: string }[]).some((node) => node._type === "image")).toBe(false);
  });

  it("resolves a reference field to the document the resolver returns", () => {
    expect(
      resolveInputValue({ name: "author", type: { type: "reference", collectionKey: POSTS } }, "post-1", resolvers()),
    ).toEqual(record("post-1"));
  });

  it("leaves a reference field alone when its value is not an id string", () => {
    expect(
      resolveInputValue({ name: "author", type: { type: "reference", collectionKey: POSTS } }, null, resolvers()),
    ).toBeNull();
  });

  it("resolves a multiReference field to the list of documents", () => {
    expect(
      resolveInputValue(
        { name: "related", type: { type: "multiReference", collectionKey: POSTS } },
        ["a", "b"],
        resolvers(),
      ),
    ).toEqual([record("a"), record("b")]);
  });

  it("resolves each element of an array field", () => {
    expect(
      resolveInputValue(
        { name: "gallery", type: { type: "array", element: { type: "image" } } },
        [{ assetId: "asset-1" }],
        resolvers(),
      ),
    ).toEqual([{ _type: "image", asset: { _type: "reference", _ref: `image-${SHA}-800x600-png` } }]);
  });

  it("leaves an array field alone when its value is not an array", () => {
    expect(
      resolveInputValue({ name: "gallery", type: { type: "array", element: { type: "image" } } }, "x", resolvers()),
    ).toBe("x");
  });

  it("resolves each declared member of a group and keeps undeclared keys", () => {
    expect(
      resolveInputValue(
        {
          name: "style",
          type: { type: "group", fields: [{ name: "bg", type: { type: "color" }, required: false }] },
        },
        { bg: "#FF0000", label: "Card" },
        resolvers(),
      ),
    ).toEqual({ bg: { _type: "color", hex: "#ff0000" }, label: "Card" });
  });
});
