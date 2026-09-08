import { sanityColorValue } from "#generate/steps/scaffold/color.ts";

describe("sanityColorValue", () => {
  it("converts a hex colour into sanity's colour object, lowercased", () => {
    expect(sanityColorValue("#FF0000")).toEqual({
      kind: "converted",
      value: { _type: "color", hex: "#ff0000" },
    });
  });

  it("accepts the short, alpha-short and 8-digit hex forms", () => {
    expect(sanityColorValue("#F00")).toEqual({ kind: "converted", value: { _type: "color", hex: "#f00" } });
    expect(sanityColorValue("#F00A")).toEqual({ kind: "converted", value: { _type: "color", hex: "#f00a" } });
    expect(sanityColorValue("#FF0000AA")).toEqual({
      kind: "converted",
      value: { _type: "color", hex: "#ff0000aa" },
    });
  });

  it("converts the rgb form getComputedStyle actually returns", () => {
    expect(sanityColorValue("rgb(255, 0, 0)")).toEqual({
      kind: "converted",
      value: { _type: "color", hex: "#ff0000" },
    });
  });

  it("carries the alpha channel of an rgba value alongside the hex", () => {
    expect(sanityColorValue("rgba(255, 0, 0, 0.5)")).toEqual({
      kind: "converted",
      value: { _type: "color", hex: "#ff0000", alpha: 0.5 },
    });
  });

  it("accepts the space-and-slash rgb syntax too", () => {
    expect(sanityColorValue("rgb(0 128 255 / 0.25)")).toEqual({
      kind: "converted",
      value: { _type: "color", hex: "#0080ff", alpha: 0.25 },
    });
  });

  it("rounds and clamps out-of-range channel values", () => {
    expect(sanityColorValue("rgb(255.6, 300, 0)")).toEqual({
      kind: "converted",
      value: { _type: "color", hex: "#ffff00" },
    });
  });

  it("keeps a negative channel verbatim, since the rgb pattern only accepts digits", () => {
    expect(sanityColorValue("rgb(-20, 0, 0)")).toEqual({
      kind: "verbatim",
      raw: "rgb(-20, 0, 0)",
      value: { _type: "color", hex: "rgb(-20, 0, 0)" },
    });
  });

  it("trims surrounding whitespace before converting", () => {
    expect(sanityColorValue("  #ff0000  ")).toEqual({
      kind: "converted",
      value: { _type: "color", hex: "#ff0000" },
    });
  });

  it("keeps a value it cannot parse verbatim, and reports the raw string alongside it", () => {
    expect(sanityColorValue("linear-gradient(red, blue)")).toEqual({
      kind: "verbatim",
      raw: "linear-gradient(red, blue)",
      value: { _type: "color", hex: "linear-gradient(red, blue)" },
    });
  });

  it("keeps named colours and hsl() verbatim rather than dropping them", () => {
    expect(sanityColorValue("rebeccapurple")).toEqual({
      kind: "verbatim",
      raw: "rebeccapurple",
      value: { _type: "color", hex: "rebeccapurple" },
    });
    expect(sanityColorValue("hsl(210, 50%, 40%)")).toEqual({
      kind: "verbatim",
      raw: "hsl(210, 50%, 40%)",
      value: { _type: "color", hex: "hsl(210, 50%, 40%)" },
    });
  });

  it("reports an empty conversion for a blank or non-string value", () => {
    expect(sanityColorValue(undefined)).toEqual({ kind: "empty" });
    expect(sanityColorValue(null)).toEqual({ kind: "empty" });
    expect(sanityColorValue(0)).toEqual({ kind: "empty" });
    expect(sanityColorValue("  ")).toEqual({ kind: "empty" });
  });
});
