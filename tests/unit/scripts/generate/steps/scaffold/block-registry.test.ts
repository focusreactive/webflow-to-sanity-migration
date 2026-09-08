import { emitBlockRenderer } from "#generate/steps/scaffold/block-registry.ts";
import { blockTypeIdSchema, type BlockTypeId } from "#ir/common.ts";

const ids = (...values: string[]): BlockTypeId[] => values.map((value) => blockTypeIdSchema.parse(value));

describe("emitBlockRenderer", () => {
  it("imports the component and its props type from the block's own directory", () => {
    const source = emitBlockRenderer(ids("hero-banner"));
    expect(source).toContain('import HeroBanner from "@/components/blocks/hero-banner";');
    expect(source).toContain(
      'import type { HeroBannerProps } from "@/components/blocks/hero-banner/props";',
    );
  });

  it("switches on the camel-cased schema type name, not the kebab block id", () => {
    const source = emitBlockRenderer(ids("hero-banner"));
    expect(source).toContain('case "heroBanner":');
    expect(source).not.toContain('case "hero-banner":');
  });

  it("casts each block entry to that block's own props type", () => {
    expect(emitBlockRenderer(ids("hero-banner"))).toContain(
      "return <HeroBanner key={block._key} {...(block as unknown as HeroBannerProps)} />;",
    );
  });

  it("emits a case arm per block, in the order given", () => {
    const source = emitBlockRenderer(ids("hero-banner", "cta-strip"));
    expect(source).toContain('case "heroBanner":');
    expect(source).toContain('case "ctaStrip":');
    expect(source.indexOf('case "heroBanner":')).toBeLessThan(source.indexOf('case "ctaStrip":'));
  });

  it("always declares BlockNode, RenderBlocks and a null default arm", () => {
    const source = emitBlockRenderer(ids("cta"));
    expect(source).toContain("interface BlockNode {");
    expect(source).toContain("export function RenderBlocks({ blocks }: { blocks: BlockNode[] }) {");
    expect(source).toContain("default:\n            return null;");
  });

  it("emits no import section at all when there are no blocks", () => {
    const source = emitBlockRenderer([]);
    expect(source.startsWith("interface BlockNode {")).toBe(true);
    expect(source).not.toContain("@/components/blocks/");
  });
});
