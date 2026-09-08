import {
  buildBlockPreview,
  buildDocumentPreview,
  type PreviewFieldLike,
} from "#generate/steps/scaffold/preview.ts";
import { renderSource } from "#generate/utils/source.ts";

const field = (name: string, type: string): PreviewFieldLike => ({ name, type: { type } });

describe("buildDocumentPreview", () => {
  it("returns undefined when there are no fields to preview", () => {
    expect(buildDocumentPreview([])).toBeUndefined();
  });

  it("prefers a field literally called title", () => {
    const preview = buildDocumentPreview([field("body", "text"), field("title", "text")]);
    expect(preview).toEqual({ select: { title: "title" } });
  });

  it("falls back to the first text field when there is no title field", () => {
    const preview = buildDocumentPreview([field("count", "number"), field("heading", "text")]);
    expect(preview).toEqual({ select: { title: "heading" } });
  });

  it("falls back to the very first field when nothing else matches", () => {
    expect(buildDocumentPreview([field("count", "number")])).toEqual({ select: { title: "count" } });
  });

  it("adds the slug field's current value as the subtitle", () => {
    expect(buildDocumentPreview([field("title", "text")], "handle")).toEqual({
      select: { title: "title", subtitle: "handle.current" },
    });
  });

  it("adds the first image field as media", () => {
    expect(buildDocumentPreview([field("title", "text"), field("cover", "image")], "slug")).toEqual({
      select: { title: "title", subtitle: "slug.current", media: "cover" },
    });
  });

  it("omits media when there is no image field", () => {
    expect(buildDocumentPreview([field("title", "text")])).toEqual({ select: { title: "title" } });
  });
});

describe("buildBlockPreview", () => {
  it("prepares a constant title when the block has no image field", () => {
    const preview = buildBlockPreview("Feature Grid", [field("heading", "text")]);
    expect(renderSource(preview)).toBe('{ prepare: () => ({ title: "Feature Grid" }) }');
  });

  it("selects the first image field as media and passes it through prepare", () => {
    const preview = buildBlockPreview("Hero", [field("heading", "text"), field("cover", "image")]);
    expect(renderSource(preview)).toBe(
      '{ select: { media: "cover" }, prepare: ({ media }) => ({ title: "Hero", media }) }',
    );
  });

  it("escapes a block name that needs quoting", () => {
    expect(renderSource(buildBlockPreview('He said "hi"', []))).toContain('title: "He said \\"hi\\""');
  });
});
