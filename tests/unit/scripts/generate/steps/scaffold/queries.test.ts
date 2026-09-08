import {
  chromeQueryConstName,
  detailQueryConstName,
  emitQueries,
  slugsQueryConstName,
  type QueriesIr,
} from "#generate/steps/scaffold/queries.ts";
import { collectionEntrySchema } from "#ir/collections.ts";
import { globalDefSchema } from "#ir/globals.ts";

const posts = collectionEntrySchema.parse({
  key: "blog-posts",
  label: "Blog Posts",
  fields: [
    { name: "handle", type: { type: "text" }, required: true },
    { name: "title", type: { type: "text" }, required: true },
    { name: "cover", type: { type: "image" }, required: false },
    { name: "author", type: { type: "reference", collectionKey: "authors" }, required: false },
  ],
  pageBinding: { slugField: "handle", meta: { title: "title" } },
  items: [],
});

const authors = collectionEntrySchema.parse({
  key: "authors",
  label: "Authors",
  fields: [
    { name: "slug", type: { type: "text" }, required: true },
    { name: "name", type: { type: "text" }, required: true },
  ],
  pageBinding: { slugField: "slug", meta: {} },
  items: [],
});

const header = globalDefSchema.parse({
  name: "header",
  fields: [{ name: "label", type: { type: "text" }, required: false }],
  values: {},
});

const identity = (key: string): string => key;

function ir(overrides: Partial<QueriesIr> = {}): QueriesIr {
  return { blocks: [], collections: [], documentTypeFor: identity, ...overrides };
}

describe("emitQueries", () => {
  it("wraps every query in defineQuery so typegen can see it", () => {
    const source = emitQueries({ blocks: [], collections: [], documentTypeFor: (key) => key });
    const defineQueryCount = source.split("defineQuery(").length - 1;

    expect(defineQueryCount).toBeGreaterThan(0);
    expect(source).toContain("PAGE_TREE_QUERY");
  });

  it("wraps the detail and slug queries of every collection too", () => {
    const source = emitQueries(ir({ collections: [posts, authors], globals: [header] }));
    const exported = [...source.matchAll(/export const (\w+) =/g)].map((match) => match[1] ?? "");

    expect(exported).toContain("PAGE_TREE_QUERY");
    expect(exported).toContain("PAGE_BY_ID_QUERY");
    expect(exported).toContain(chromeQueryConstName("header"));
    expect(exported).toContain(detailQueryConstName("blog-posts"));
    expect(exported).toContain(slugsQueryConstName("blog-posts"));
    expect(source.split("defineQuery(").length - 1).toBe(exported.length);
  });

  it("imports defineQuery from next-sanity", () => {
    expect(emitQueries(ir())).toContain('import { defineQuery } from "next-sanity";');
  });

  it("projects the slug field through .current so a route can match on it", () => {
    const source = emitQueries(ir({ collections: [posts] }));

    expect(source).toContain('"handle": handle.current');
    expect(source).toContain("handle.current == $slug");
  });

  it("dereferences a reference field one level and stops there", () => {
    const source = emitQueries(ir({ collections: [posts, authors] }));

    expect(source).toContain("author->{ _id");
    expect(source).toContain('"slug": slug.current');
    expect(source).not.toContain("author->{ _id, author->");
  });

  it("expands an image field to its asset document", () => {
    expect(emitQueries(ir({ collections: [posts] }))).toContain("cover{ ..., asset->{ _id, url, metadata } }");
  });

  it("matches a block fragment on the camelCased schema type the studio declares", () => {
    const source = emitQueries(
      ir({
        blocks: [
          {
            id: "hero-banner",
            fields: [{ name: "heading", type: { type: "text" }, required: true }],
            content: {},
          },
        ],
      }),
    );

    expect(source).toContain('_type == "heroBanner" => { _key, _type, heading }');
  });

  it("projects the raw content array when the IR has no block types", () => {
    const source = emitQueries(ir());

    expect(source).toContain("\n  content\n}");
    expect(source).not.toContain("content[]{");
  });

  it("names each chrome document by its own role so the layout can fetch it", () => {
    const source = emitQueries(ir({ globals: [header] }));

    expect(source).toContain('export const HEADER_QUERY = defineQuery(`*[_type == "header"][0]{ _id, name, label }`);');
    expect(source).toContain("header->{ _id, name, label }");
  });

  it("renames a collection query through documentTypeFor rather than its raw key", () => {
    const source = emitQueries(ir({ collections: [posts], documentTypeFor: () => "blogPost2" }));

    expect(source).toContain(detailQueryConstName("blogPost2"));
    expect(source).toContain('_type == "blogPost2"');
  });
});
