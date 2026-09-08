import { describe, expect, it } from "vitest";

import { resolveRichTextRecord } from "#synth/utils/richtext/verify-input.ts";

describe("resolveRichTextRecord", () => {
  it("converts richText string fields to Portable Text and leaves others untouched", async () => {
    const out = await resolveRichTextRecord(
      [
        { name: "body", type: { type: "richText" } },
        { name: "title", type: { type: "text" } },
      ],
      { body: "<h2>Hello</h2><p>World</p>", title: "Keep me" },
      { resolveImgSrc: () => undefined },
    );
    expect(out.title).toBe("Keep me");
    expect(Array.isArray(out.body)).toBe(true);
    expect((out.body as { style?: string }[]).map((block) => block.style)).toEqual(["h2", "normal"]);
  });

  it("passes non-string richText through unchanged", async () => {
    const already = [{ _type: "block", style: "normal", markDefs: [], children: [] }];
    const out = await resolveRichTextRecord(
      [{ name: "body", type: { type: "richText" } }],
      { body: already },
      { resolveImgSrc: () => undefined },
    );
    expect(out.body).toBe(already);
  });

  it("returns the record untouched when no field is richText", async () => {
    const record = { title: "T" };
    const out = await resolveRichTextRecord([{ name: "title", type: { type: "text" } }], record, {
      resolveImgSrc: () => undefined,
    });
    expect(out).toBe(record);
  });
});
