import { SANITY_ASSET_ROUTE_PREFIX, parseImageRef } from "#generate/steps/scaffold/url-for.ts";
import { URL_FOR_CHAIN, urlFor } from "#harness/image-stub.ts";

const source = { _type: "image", asset: { _type: "reference", _ref: "image-abc123-800x600-png" } };

describe("parseImageRef", () => {
  it("recovers the sha and extension from a synthetic image ref", () => {
    expect(parseImageRef("image-abc123-800x600-png")).toEqual({ sha: "abc123", ext: "png" });
  });

  it("returns undefined for anything that is not a synthetic image ref", () => {
    expect(parseImageRef("file-abc123-pdf")).toBeUndefined();
    expect(parseImageRef("")).toBeUndefined();
  });
});

describe("urlFor", () => {
  it("resolves a synthetic ref to the harness asset route", () => {
    expect(urlFor(source).url()).toBe(`${SANITY_ASSET_ROUTE_PREFIX}abc123.png`);
  });

  it("ignores every transform in the chain and still serves the original bytes", () => {
    expect(urlFor(source).width(100).height(50).format("webp").quality(80).fit("crop").url()).toBe(
      `${SANITY_ASSET_ROUTE_PREFIX}abc123.png`,
    );
  });

  it("returns an empty url rather than throwing for a missing or unparseable asset", () => {
    expect(urlFor(undefined).url()).toBe("");
    expect(urlFor({}).url()).toBe("");
    expect(urlFor({ asset: { _ref: "nonsense" } }).url()).toBe("");
  });

  it("implements exactly the advertised chain", () => {
    const builder = urlFor(source) as unknown as Record<string, unknown>;
    expect(Object.keys(builder).sort()).toEqual([...URL_FOR_CHAIN].sort());
  });
});
