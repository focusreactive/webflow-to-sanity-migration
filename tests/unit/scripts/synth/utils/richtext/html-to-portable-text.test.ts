import { describe, expect, it } from "vitest";

import { htmlToPortableText } from "#synth/utils/richtext/html-to-portable-text.ts";
import { richTextTagsUsed } from "#synth/utils/richtext/tags-used.ts";

const noImages = { resolveImage: () => undefined };

describe("htmlToPortableText", () => {
  it("converts a heading and a paragraph into blocks with their styles", () => {
    const blocks = htmlToPortableText("<h2>Title</h2><p>Body copy</p>", noImages);
    expect(blocks.map((b) => b.style)).toEqual(["h2", "normal"]);
  });

  it("keeps a link as a mark definition rather than dropping it", () => {
    const blocks = htmlToPortableText('<p>see <a href="https://example.com/">this</a></p>', noImages);
    expect(JSON.stringify(blocks)).toContain("https://example.com/");
  });

  it("assigns deterministic keys so two runs of the same html are byte-identical", () => {
    const html = "<p>stable</p>";
    expect(htmlToPortableText(html, noImages)).toEqual(htmlToPortableText(html, noImages));
  });

  it("drops an image whose asset never resolved rather than emitting a dangling ref", () => {
    const blocks = htmlToPortableText('<p>a</p><img src="https://cdn.example.com/x.png" />', noImages);
    expect(blocks.some((block) => block._type === "image")).toBe(false);
  });

  it("emits a resolved image as an asset reference block", () => {
    const blocks = htmlToPortableText('<img src="https://cdn.example.com/x.png" />', {
      resolveImage: () => "image-abc123-10x10-png",
    });
    expect(JSON.stringify(blocks)).toContain("image-abc123-10x10-png");
  });
});

describe("richTextTagsUsed", () => {
  it("reads tags out of a portable text array", () => {
    const blocks = htmlToPortableText("<h2>Title</h2><p>Body <strong>copy</strong></p>", noImages);
    expect(richTextTagsUsed(blocks)).toContain("h2");
    expect(richTextTagsUsed(blocks)).toContain("strong");
  });

  it("reports the list container and its item tag for a list", () => {
    const blocks = htmlToPortableText("<ul><li>one</li></ul>", noImages);
    expect(richTextTagsUsed(blocks)).toEqual(["li", "ul"]);
  });

  it("reports a link annotation as an anchor tag", () => {
    const blocks = htmlToPortableText('<p>see <a href="https://example.com/">this</a></p>', noImages);
    expect(richTextTagsUsed(blocks)).toContain("a");
  });

  it("returns an empty list for a value that is not portable text", () => {
    expect(richTextTagsUsed({ root: {} })).toEqual([]);
  });
});
