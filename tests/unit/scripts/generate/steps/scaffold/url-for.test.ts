import { syntheticAssetRef } from "#generate/steps/scaffold/input-value.ts";
import {
  emitImageHelper,
  parseImageRef,
  SANITY_ASSET_ROUTE_PREFIX,
  URL_FOR_CHAIN,
} from "#generate/steps/scaffold/url-for.ts";

describe("parseImageRef", () => {
  it("round-trips a synthetic ref through the asset route", () => {
    const ref = syntheticAssetRef({ sha: "b".repeat(40), width: 100, height: 100, ext: "jpg" });
    const parsed = parseImageRef(ref);

    expect(parsed).toEqual({ sha: "b".repeat(40), ext: "jpg" });
  });

  it("round-trips a ref with no measured dimensions", () => {
    const ref = syntheticAssetRef({ sha: "c".repeat(40), ext: "svg" });

    expect(parseImageRef(ref)).toEqual({ sha: "c".repeat(40), ext: "svg" });
  });

  it("returns undefined for a ref that is not a synthetic image ref", () => {
    expect(parseImageRef("image-nope")).toBeUndefined();
    expect(parseImageRef("file-abc123-pdf")).toBeUndefined();
  });

  it("serves the parsed ref from the prefix the harness asset handler mounts", () => {
    const parsed = parseImageRef(syntheticAssetRef({ sha: "d".repeat(40), ext: "png" }));

    expect(parsed).toBeDefined();
    expect(`${SANITY_ASSET_ROUTE_PREFIX}${parsed?.sha ?? ""}.${parsed?.ext ?? ""}`).toBe(
      `/__mig-asset/${"d".repeat(40)}.png`,
    );
  });
});

describe("emitImageHelper", () => {
  it("emits a urlFor builder over the generated sanity client", () => {
    const source = emitImageHelper();

    expect(source).toContain('from "@sanity/image-url"');
    expect(source).toContain('from "./client"');
    expect(source).toContain("export function urlFor");
  });

  it("names every builder method the harness image stub has to fake", () => {
    expect([...URL_FOR_CHAIN]).toEqual(["width", "height", "format", "quality", "fit", "url"]);
  });
});
