import { schemaTypeName } from "#blocks/codegen/names.ts";
import { emitBlockSchema } from "#blocks/codegen/schema.ts";
import type { SanityFieldCtx } from "#generate/sanity-field.ts";
import { blockTypeSchema } from "#ir/blocks.ts";

const CTX: SanityFieldCtx = { documentTypeFor: schemaTypeName, path: [] };

const block = blockTypeSchema.parse({
  id: "feature-grid",
  name: "Feature Grid",
  content: {},
  fields: [
    { name: "heading", type: { type: "text" }, required: true },
    { name: "cover", type: { type: "image" }, required: false },
    { name: "body", type: { type: "richText" }, required: false },
    { name: "related", type: { type: "multiReference", collectionKey: "blogPosts" }, required: false },
    {
      name: "items",
      type: {
        type: "array",
        element: { type: "group", fields: [{ name: "label", type: { type: "text" }, required: true }] },
      },
      required: true,
    },
  ],
});

describe("emitBlockSchema", () => {
  const out = emitBlockSchema(block, CTX);

  it("exports a defineType object under the camelCased schema type name", () => {
    expect(out).toContain("export const featureGrid = defineType({");
    expect(out).toContain('name: "featureGrid"');
    expect(out).toContain('title: "Feature Grid"');
    expect(out).toContain('type: "object"');
  });

  it("imports only the sanity helpers the emitted schema actually uses", () => {
    expect(out.split("\n")[0]).toBe('import { defineArrayMember, defineField, defineType } from "sanity";');
  });

  it("omits defineArrayMember when no field is an array", () => {
    const plain = blockTypeSchema.parse({
      id: "hero",
      name: "Hero",
      content: {},
      fields: [{ name: "heading", type: { type: "text" }, required: true }],
    });
    expect(emitBlockSchema(plain, CTX).split("\n")[0]).toBe('import { defineField, defineType } from "sanity";');
  });

  it("wraps every field in defineField at every depth", () => {
    expect(out).toContain('defineField({ name: "heading", title: "Heading", type: "string"');
    expect(out).toContain('defineArrayMember({ name: "itemsItem", type: "object", fields: [defineField(');
  });

  it("maps a richText field onto the shared portableText type", () => {
    expect(out).toContain('name: "body", title: "Body", type: "portableText"');
  });

  it("turns a required flag into a sanity validation rule", () => {
    expect(out).toContain("validation: (rule) => rule.required()");
  });

  it("resolves a reference target through the collection's schema type name", () => {
    expect(out).toContain('to: [{ type: "blogPosts" }]');
  });

  it("previews the block through its first image field", () => {
    expect(out).toContain('preview: { select: { media: "cover" }');
    expect(out).toContain('prepare: ({ media }) => ({ title: "Feature Grid", media })');
  });
});
