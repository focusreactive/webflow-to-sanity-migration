import { describe, expect, it } from "vitest";

import { planRichText } from "#synth/utils/richtext/index.ts";

const FIELDS = [
  { name: "body", label: "Body", type: { type: "richText" as const }, required: true },
  { name: "heading", label: "Heading", type: { type: "text" as const }, required: true },
];

const span = (text: string, marks: string[] = []) => ({ _type: "span", text, marks });

describe("planRichText", () => {
  it("lists only richText fields", () => {
    const plan = planRichText({ fields: FIELDS, literals: { body: [], heading: "T" } });
    expect(plan.map((entry) => entry.field)).toEqual(["body"]);
  });

  it("lists the tags actually present in the portable text value", () => {
    const literals = {
      body: [
        { _type: "block", style: "h2", markDefs: [], children: [span("Title")] },
        { _type: "block", style: "normal", markDefs: [], children: [span("Body", ["strong"])] },
      ],
    };
    const plan = planRichText({ fields: FIELDS, literals });
    expect(plan[0]?.tags).toEqual(["h2", "p", "strong"]);
  });

  it("reports no tags for a Lexical-shaped value rather than silently accepting it", () => {
    const literals = {
      body: { root: { children: [{ type: "heading", tag: "h2", children: [] }] } },
    };
    expect(planRichText({ fields: FIELDS, literals })[0]?.tags).toEqual([]);
  });

  it("returns an empty plan when there are no richText fields", () => {
    const textOnly = FIELDS.filter((field) => field.type.type === "text");
    expect(planRichText({ fields: textOnly, literals: { heading: "T" } })).toEqual([]);
  });
});
