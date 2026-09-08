import { emitPageBuilder, emitPageDocument } from "#generate/steps/scaffold/page-schema.ts";

describe("emitPageDocument", () => {
  it("emits the page document type", () => {
    const source = emitPageDocument({ chromeNames: [] });
    expect(source).toContain('name: "page"');
    expect(source).toContain('title: "Page"');
    expect(source).toContain('type: "document"');
    expect(source).toContain("export const page = defineType(");
  });

  it("gives the page a required title and a slug sourced from it", () => {
    const source = emitPageDocument({ chromeNames: [] });
    expect(source).toContain('name: "title", title: "Title", type: "string", validation: (rule) => rule.required()');
    expect(source).toContain(
      'name: "slug", title: "Slug", type: "slug", options: { source: "title" }, validation: (rule) => rule.required()',
    );
  });

  it("references itself for the parent field so pages can nest", () => {
    expect(emitPageDocument({ chromeNames: [] })).toContain(
      'name: "parent", title: "Parent", type: "reference", to: [{ type: "page" }]',
    );
  });

  it("carries a hidden isContainer flag and the pageBuilder content field", () => {
    const source = emitPageDocument({ chromeNames: [] });
    expect(source).toContain('name: "isContainer", title: "Is container", type: "boolean", hidden: true');
    expect(source).toContain('name: "content", title: "Content", type: "pageBuilder"');
  });

  it("adds a reference field per chrome name, each pointing at its own type", () => {
    const source = emitPageDocument({ chromeNames: ["header", "footer"] });
    expect(source).toContain('name: "header", title: "Header", type: "reference", to: [{ type: "header" }]');
    expect(source).toContain('name: "footer", title: "Footer", type: "reference", to: [{ type: "footer" }]');
  });

  it("omits the chrome references when there are no chrome globals", () => {
    expect(emitPageDocument({ chromeNames: [] })).not.toContain('name: "header"');
  });

  it("nests the seo object after the chrome references", () => {
    const source = emitPageDocument({ chromeNames: ["header"] });
    expect(source).toContain('name: "seo", title: "SEO", type: "object"');
    expect(source).toContain('name: "metaTitle", title: "Meta title", type: "string"');
    expect(source).toContain('name: "metaDescription", title: "Meta description", type: "string"');
    expect(source.indexOf('name: "header"')).toBeLessThan(source.indexOf('name: "seo"'));
  });

  it("previews on the title with the slug as subtitle", () => {
    expect(emitPageDocument({ chromeNames: [] })).toContain(
      'preview: { select: { title: "title", subtitle: "slug.current" } }',
    );
  });
});

describe("emitPageBuilder", () => {
  it("emits an array type whose members are the camel-cased block schema types", () => {
    const source = emitPageBuilder(["hero-banner", "cta"]);
    expect(source).toContain('name: "pageBuilder"');
    expect(source).toContain('title: "Content"');
    expect(source).toContain('type: "array"');
    expect(source).toContain('of: [defineArrayMember({ type: "heroBanner" }), defineArrayMember({ type: "cta" })]');
    expect(source).toContain("export const pageBuilder = defineType(");
  });

  it("imports defineArrayMember only when there is at least one block", () => {
    expect(emitPageBuilder(["cta"])).toContain('import { defineArrayMember, defineType } from "sanity";');
    expect(emitPageBuilder([])).toContain('import { defineType } from "sanity";');
  });

  it("still emits a valid empty array type with no blocks", () => {
    expect(emitPageBuilder([])).toContain("of: []");
  });

  it("never imports defineField, since a pageBuilder has no fields", () => {
    expect(emitPageBuilder(["cta"])).not.toContain("defineField");
  });
});
