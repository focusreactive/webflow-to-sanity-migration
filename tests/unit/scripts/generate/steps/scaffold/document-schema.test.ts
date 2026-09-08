import { schemaTypeName } from "#blocks/codegen/names.ts";
import type { SanityFieldCtx } from "#generate/sanity-field.ts";
import {
  emitChromeDocument,
  emitCollectionDocument,
  emitDocument,
} from "#generate/steps/scaffold/document-schema.ts";
import { collectionEntrySchema } from "#ir/collections.ts";
import { globalDefSchema } from "#ir/globals.ts";

const CTX: SanityFieldCtx = { documentTypeFor: schemaTypeName, path: [] };

const entry = collectionEntrySchema.parse({
  key: "blog-posts",
  label: "Blog Posts",
  fields: [
    { name: "title", type: { type: "text" }, required: true },
    { name: "handle", type: { type: "text" }, required: true },
    { name: "cover", type: { type: "image" }, required: false },
  ],
  pageBinding: { slugField: "handle", meta: {} },
  items: [],
});

describe("emitDocument", () => {
  it("emits a defineType call for a document type with its own name and title", () => {
    const source = emitDocument("thing", "Thing", []);
    expect(source).toContain("defineType(");
    expect(source).toContain('name: "thing"');
    expect(source).toContain('title: "Thing"');
    expect(source).toContain('type: "document"');
    expect(source).toContain("export const thing = defineType(");
  });

  it("imports only defineType when the document has no fields", () => {
    expect(emitDocument("thing", "Thing", [])).toContain('import { defineType } from "sanity";');
  });

  it("imports defineField once the document has fields", () => {
    const source = emitDocument("thing", "Thing", [{ name: "a", type: "string" }]);
    expect(source).toContain('import { defineField, defineType } from "sanity";');
    expect(source).toContain('defineField({ name: "a", type: "string" })');
  });

  it("imports defineArrayMember when a field carries array members", () => {
    const source = emitDocument("thing", "Thing", [
      { name: "tags", type: "array", of: [{ type: "string" }] },
    ]);
    expect(source).toContain('import { defineArrayMember, defineField, defineType } from "sanity";');
    expect(source).toContain('defineArrayMember({ type: "string" })');
  });

  it("omits the preview key entirely when no preview is given", () => {
    expect(emitDocument("thing", "Thing", [])).not.toContain("preview");
  });

  it("renders the preview it is given", () => {
    const source = emitDocument("thing", "Thing", [], { select: { title: "title" } });
    expect(source).toContain('preview: { select: { title: "title" } }');
  });
});

describe("emitCollectionDocument", () => {
  it("emits a defineType call whose name is the collection's schema type", () => {
    const source = emitCollectionDocument(entry, CTX);
    expect(source).toContain("defineType(");
    expect(source).toContain('name: "blogPosts"');
    expect(source).toContain('type: "document"');
    expect(source).toContain('title: "Blog Posts"');
    expect(source).toContain("export const blogPosts = defineType(");
  });

  it("names the document type through the context's resolver, not the raw key", () => {
    const source = emitCollectionDocument(entry, { ...CTX, documentTypeFor: () => "renamed" });
    expect(source).toContain('name: "renamed"');
    expect(source).toContain("export const renamed = defineType(");
  });

  it("turns the page binding's slug field into a slug field sourced from title", () => {
    const source = emitCollectionDocument(entry, CTX);
    expect(source).toContain('name: "handle", title: "Handle", type: "slug", options: { source: "title" }');
  });

  it("previews on the title field with the slug as subtitle and the image as media", () => {
    const source = emitCollectionDocument(entry, CTX);
    expect(source).toContain('preview: { select: { title: "title", subtitle: "handle.current", media: "cover" } }');
  });

  it("marks required fields with a required validation rule", () => {
    expect(emitCollectionDocument(entry, CTX)).toContain("validation: (rule) => rule.required()");
  });
});

describe("emitChromeDocument", () => {
  const header = globalDefSchema.parse({
    name: "header",
    fields: [{ name: "logo", type: { type: "image" }, required: false }],
    values: {},
  });

  it("emits a document named after the global, title-cased", () => {
    const source = emitChromeDocument(header);
    expect(source).toContain('name: "header"');
    expect(source).toContain('title: "Header"');
    expect(source).toContain('type: "document"');
    expect(source).toContain("export const header = defineType(");
  });

  it("prepends a required name field whose initial value is the global's title", () => {
    const source = emitChromeDocument(header);
    expect(source).toContain(
      'defineField({ name: "name", title: "Name", type: "string", validation: (rule) => rule.required(), initialValue: "Header" })',
    );
    expect(source.indexOf('name: "name"')).toBeLessThan(source.indexOf('name: "logo"'));
  });

  it("emits the global's own fields after the name field", () => {
    expect(emitChromeDocument(header)).toContain('name: "logo", title: "Logo", type: "image"');
  });

  it("emits no preview for a chrome document", () => {
    expect(emitChromeDocument(header)).not.toContain("preview");
  });

  it("accepts an explicit field context", () => {
    const source = emitChromeDocument(header, { ...CTX, path: [] });
    expect(source).toBe(emitChromeDocument(header));
  });
});
