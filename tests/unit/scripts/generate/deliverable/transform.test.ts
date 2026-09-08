import {
  type BlockDef,
  blockArrayFor,
  type FieldDef,
  sanityDataForFields,
  sanityValueFor,
  type SeedCtx,
} from "#generate/deliverable/seed/transform.ts";

const IMAGE_URL = "https://cdn.example.com/hero.png";

const ctx: SeedCtx = {
  resolveAssetId: (url) => (url === IMAGE_URL ? "a1" : undefined),
  uploadedAssetId: (assetId) => (assetId === "a1" ? "image-uploaded-1" : undefined),
  warn: () => {},
};

function collect(warnings: string[]): SeedCtx {
  return { ...ctx, warn: (message) => warnings.push(message) };
}

const fields: FieldDef[] = [
  { name: "title", type: { type: "text" }, required: true },
  { name: "slug", type: { type: "text" }, required: true },
];

const blockDefs: BlockDef[] = [{ id: "hero", fields: [{ name: "heading", type: { type: "text" }, required: false }] }];

describe("sanityValueFor", () => {
  it("leaves plain scalars untouched", () => {
    expect(sanityValueFor({ type: "number" }, 5, ctx)).toBe(5);
    expect(sanityValueFor({ type: "text" }, "hi", ctx)).toBe("hi");
  });

  it("drops a null or missing value", () => {
    expect(sanityValueFor({ type: "text" }, null, ctx)).toBeUndefined();
    expect(sanityValueFor({ type: "text" }, undefined, ctx)).toBeUndefined();
  });

  it("turns a media ref into an image with the uploaded asset id", () => {
    expect(sanityValueFor({ type: "image" }, { assetId: "a1", alt: "Alt" }, ctx)).toEqual({
      _type: "image",
      alt: "Alt",
      asset: { _type: "reference", _ref: "image-uploaded-1" },
    });
  });

  it("omits an empty alt rather than writing one", () => {
    expect(sanityValueFor({ type: "image" }, { assetId: "a1", alt: "" }, ctx)).toEqual({
      _type: "image",
      asset: { _type: "reference", _ref: "image-uploaded-1" },
    });
  });

  it("builds file and video values the same way, without an alt field", () => {
    const expected = { _type: "file", asset: { _type: "reference", _ref: "image-uploaded-1" } };
    expect(sanityValueFor({ type: "file" }, { assetId: "a1", alt: "Alt" }, ctx)).toEqual(expected);
    expect(sanityValueFor({ type: "video" }, { assetId: "a1" }, ctx)).toEqual(expected);
  });

  it("drops an image whose asset never resolved rather than emitting a dangling ref, and warns", () => {
    const warnings: string[] = [];
    expect(sanityValueFor({ type: "image" }, { assetId: "ffffffff" }, collect(warnings))).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/asset ffffffff has no uploaded Sanity asset/);
  });

  it("drops a media value that carries no assetId at all", () => {
    expect(sanityValueFor({ type: "image" }, { alt: "Alt" }, ctx)).toBeUndefined();
    expect(sanityValueFor({ type: "image" }, "not-an-object", ctx)).toBeUndefined();
  });

  it("writes a reference straight from the deterministic id, with no second pass", () => {
    expect(sanityValueFor({ type: "reference", collectionKey: "post" }, "hello-world", ctx)).toEqual({
      _type: "reference",
      _ref: "post.hello-world",
    });
  });

  it("drops a reference with no collection key or no value", () => {
    expect(sanityValueFor({ type: "reference" }, "hello-world", ctx)).toBeUndefined();
    expect(sanityValueFor({ type: "reference", collectionKey: "post" }, "", ctx)).toBeUndefined();
  });

  it("resolves multiReference entries to deterministic, individually-keyed references", () => {
    const value = sanityValueFor(
      { type: "multiReference", collectionKey: "post" },
      ["hello-world", "second-post", ""],
      ctx,
    ) as { _key: string; _type: string; _ref: string }[];
    expect(value.map((item) => ({ _type: item._type, _ref: item._ref }))).toEqual([
      { _type: "reference", _ref: "post.hello-world" },
      { _type: "reference", _ref: "post.second-post" },
    ]);
    expect(new Set(value.map((item) => item._key)).size).toBe(2);
  });

  it("keys every object member of an array", () => {
    const value = sanityValueFor(
      {
        type: "array",
        element: { type: "group", fields: [{ name: "label", type: { type: "text" }, required: true }] },
      },
      [{ label: "a" }, { label: "b" }],
      ctx,
    ) as { _key: string }[];
    expect(new Set(value.map((item) => item._key)).size).toBe(2);
  });

  it("does not override an element's own fixed _type with a member type name", () => {
    const value = sanityValueFor({ type: "array", element: { type: "image" } }, [{ assetId: "a1" }], ctx) as {
      _type: string;
    }[];
    expect(value[0]?._type).toBe("image");
  });

  it("drops array entries that resolve to nothing", () => {
    const value = sanityValueFor(
      { type: "array", element: { type: "image" } },
      [{ assetId: "a1" }, { assetId: "missing" }],
      collect([]),
    ) as unknown[];
    expect(value).toHaveLength(1);
  });

  it("drops an array with no element type or a non-array value", () => {
    expect(sanityValueFor({ type: "array" }, [], ctx)).toBeUndefined();
    expect(sanityValueFor({ type: "array", element: { type: "text" } }, "nope", ctx)).toBeUndefined();
  });

  it("flattens an array of richText into one Portable Text array instead of nesting one per entry", () => {
    const value = sanityValueFor({ type: "array", element: { type: "richText" } }, ["<p>A</p>", "<p>A</p>"], ctx) as {
      _type: string;
      _key: string;
    }[];
    expect(value).toHaveLength(2);
    expect(value.every((block) => block._type === "block")).toBe(true);
    expect(new Set(value.map((block) => block._key)).size).toBe(2);
  });

  it("converts richText html to portable text, resolving inline images through ctx", () => {
    const value = sanityValueFor({ type: "richText" }, `<p>Hi</p><img src="${IMAGE_URL}">`, ctx) as {
      _type: string;
      asset?: { _ref: string };
    }[];
    expect(value[0]?._type).toBe("block");
    expect(value.find((block) => block._type === "image")?.asset?._ref).toBe("image-uploaded-1");
  });

  it("drops an empty or non-string richText value", () => {
    expect(sanityValueFor({ type: "richText" }, "", ctx)).toBeUndefined();
    expect(sanityValueFor({ type: "richText" }, 12, ctx)).toBeUndefined();
  });

  it("recurses into a group's own fields", () => {
    expect(
      sanityValueFor(
        { type: "group", fields: [{ name: "label", type: { type: "text" }, required: true }] },
        { label: "a", stray: "b" },
        ctx,
      ),
    ).toEqual({ label: "a" });
  });

  it("drops a group with no fields or a non-record value", () => {
    expect(sanityValueFor({ type: "group" }, { label: "a" }, ctx)).toBeUndefined();
    expect(sanityValueFor({ type: "group", fields: [] }, "nope", ctx)).toBeUndefined();
  });
});

describe("sanityValueFor color fields", () => {
  it("wraps a hex string as the color object the schema declares", () => {
    expect(sanityValueFor({ type: "color" }, "#FFAA00", ctx)).toEqual({ _type: "color", hex: "#ffaa00" });
  });

  it("converts the rgb() form getComputedStyle actually returns", () => {
    expect(sanityValueFor({ type: "color" }, "rgb(255, 0, 12)", ctx)).toEqual({ _type: "color", hex: "#ff000c" });
  });

  it("carries alpha through from rgba()", () => {
    expect(sanityValueFor({ type: "color" }, "rgba(255, 0, 12, 0.5)", ctx)).toEqual({
      _type: "color",
      hex: "#ff000c",
      alpha: 0.5,
    });
  });

  it("keeps a value it cannot parse rather than dropping the site's real color, and warns", () => {
    const warnings: string[] = [];
    expect(sanityValueFor({ type: "color" }, "rebeccapurple", collect(warnings))).toEqual({
      _type: "color",
      hex: "rebeccapurple",
    });
    expect(warnings.join("\n")).toMatch(/neither a hex nor an rgb\(\) value/);
  });

  it("omits an empty color rather than writing an empty object", () => {
    expect(sanityValueFor({ type: "color" }, "  ", ctx)).toBeUndefined();
  });

  it("never writes a bare string into the object-typed field", () => {
    for (const raw of ["#fff", "rgb(1,2,3)", "rebeccapurple"]) {
      expect(typeof sanityValueFor({ type: "color" }, raw, collect([]))).toBe("object");
    }
  });
});

describe("sanityDataForFields", () => {
  it("wraps the page-binding field as a slug", () => {
    expect(sanityDataForFields(fields, { slug: "hello" }, { ...ctx, slugField: "slug" })).toMatchObject({
      slug: { _type: "slug", current: "hello" },
    });
  });

  it("omits the page-binding field when its value is empty", () => {
    expect(sanityDataForFields(fields, { title: "T", slug: "" }, { ...ctx, slugField: "slug" })).toEqual({
      title: "T",
    });
  });

  it("copies only declared fields, dropping the provenance keys the record carries", () => {
    const data = sanityDataForFields(fields, { title: "T", _provenance: "ai", _confidence: 0.9 }, ctx);
    expect(data).toEqual({ title: "T" });
  });

  it("skips fields absent from the record instead of writing them as null", () => {
    expect(sanityDataForFields(fields, { title: "T" }, ctx)).toEqual({ title: "T" });
  });

  it("stamps a group array member's runtime _type from the field's own path", () => {
    const faqFields: FieldDef[] = [
      {
        name: "faqs",
        type: {
          type: "array",
          element: { type: "group", fields: [{ name: "question", type: { type: "text" }, required: true }] },
        },
        required: false,
      },
    ];
    const faqs = sanityDataForFields(faqFields, { faqs: [{ question: "Q1" }] }, ctx)["faqs"] as {
      _type: string;
      question: string;
    }[];
    expect(faqs[0]).toMatchObject({ _type: "faqsItem", question: "Q1" });
  });
});

describe("blockArrayFor", () => {
  it("keys page builder members off the layout anchor", () => {
    const blocks = blockArrayFor([{ order: 0, blockType: "hero", anchorMigId: "m42", fields: {} }], blockDefs, ctx);
    expect(blocks[0]).toMatchObject({ _type: "hero", _key: "m42" });
  });

  it("sorts by order and resolves each block's own literal fields", () => {
    const blocks = blockArrayFor(
      [
        { order: 1, blockType: "hero", anchorMigId: "second", fields: { heading: { kind: "literal", value: "B" } } },
        { order: 0, blockType: "hero", anchorMigId: "first", fields: { heading: { kind: "literal", value: "A" } } },
      ],
      blockDefs,
      ctx,
    );
    expect(blocks.map((block) => block["_key"])).toEqual(["first", "second"]);
    expect(blocks.map((block) => block["heading"])).toEqual(["A", "B"]);
  });

  it("does not mutate the caller's record order", () => {
    const records = [
      { order: 1, blockType: "hero", anchorMigId: "second", fields: {} },
      { order: 0, blockType: "hero", anchorMigId: "first", fields: {} },
    ];
    blockArrayFor(records, blockDefs, ctx);
    expect(records.map((record) => record.anchorMigId)).toEqual(["second", "first"]);
  });

  it("throws on a layout record whose blockType has no matching block def", () => {
    expect(() =>
      blockArrayFor([{ order: 0, blockType: "ghost", anchorMigId: "m1", fields: {} }], blockDefs, ctx),
    ).toThrow(/unknown blockType "ghost" \(anchor m1\)/);
  });

  it("camelCases a multi-word blockType for _type, matching the studio's own schema type name", () => {
    const blocks = blockArrayFor(
      [{ order: 0, blockType: "feature-grid", anchorMigId: "m1", fields: {} }],
      [{ id: "feature-grid", fields: [] }],
      ctx,
    );
    expect(blocks[0]).toMatchObject({ _type: "featureGrid", _key: "m1" });
  });

  it("does not wrap a block field named after the enclosing document's slugField as a slug", () => {
    const blocks = blockArrayFor(
      [
        {
          order: 0,
          blockType: "hero",
          anchorMigId: "m1",
          fields: { slug: { kind: "literal", value: "not-a-real-slug" } },
        },
      ],
      [{ id: "hero", fields: [{ name: "slug", type: { type: "text" }, required: false }] }],
      { ...ctx, slugField: "slug" },
    );
    expect(blocks[0]?.["slug"]).toBe("not-a-real-slug");
  });

  it("still resolves a block's assets and warnings through the caller's ctx", () => {
    const warnings: string[] = [];
    const blocks = blockArrayFor(
      [
        {
          order: 0,
          blockType: "hero",
          anchorMigId: "m1",
          fields: { image: { kind: "literal", value: { assetId: "missing" } } },
        },
      ],
      [{ id: "hero", fields: [{ name: "image", type: { type: "image" }, required: false }] }],
      { ...collect(warnings), slugField: "slug" },
    );
    expect(blocks[0]).toEqual({ _type: "hero", _key: "m1" });
    expect(warnings).toHaveLength(1);
  });
});
