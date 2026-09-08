import { detailQueryConstName, slugsQueryConstName } from "#generate/steps/scaffold/queries.ts";
import { emitCatchAllRoute, emitDetailRoute, type DetailRouteEntry } from "#generate/steps/scaffold/routes.ts";

const entry: DetailRouteEntry = {
  key: "blog-posts",
  template: [
    { sectionId: "hero", itemFields: ["title"] },
    { sectionId: "body-copy", itemFields: ["body"] },
  ],
  pageBinding: { slugField: "handle", meta: { title: "title", description: "excerpt" } },
};

const ctx = { documentTypeFor: (key: string): string => (key === "blog-posts" ? "blogPost" : key) };

describe("emitCatchAllRoute", () => {
  it("emits generateStaticParams and generateMetadata for the page tree", () => {
    const source = emitCatchAllRoute();

    expect(source).toContain("export async function generateStaticParams");
    expect(source).toContain("export async function generateMetadata");
    expect(source).toContain("PAGE_TREE_QUERY");
  });

  it("resolves a slug through the page-tree helper the studio and the app share", () => {
    const source = emitCatchAllRoute();

    expect(source).toContain('import { routablePaths, type PageTreeNode } from "@/sanity/page-tree";');
    expect(source).toContain("routablePaths(tree)");
  });

  it("renders through the emitted block renderer", () => {
    const source = emitCatchAllRoute();

    expect(source).toContain('import { RenderBlocks } from "@/components/render-blocks";');
    expect(source).toContain("<RenderBlocks blocks={page.content ?? []} />");
  });

  it("fetches live on the render path and with the plain client at build time", () => {
    const source = emitCatchAllRoute();

    expect(source).toContain("await sanityFetch({ query: PAGE_BY_ID_QUERY, params: { id } })");
    expect(source).toContain("await client.fetch(PAGE_TREE_QUERY)");
  });

  it("takes no per-project input, so every project gets the same route", () => {
    expect(emitCatchAllRoute()).toBe(emitCatchAllRoute());
  });
});

describe("emitDetailRoute", () => {
  it("imports the collection's own query constants from the emitted queries module", () => {
    const source = emitDetailRoute(entry, ctx);

    expect(source).toContain(
      `import { ${detailQueryConstName("blogPost")}, ${slugsQueryConstName("blogPost")} } from "@/sanity/queries";`,
    );
  });

  it("imports and renders one component per section binding, in template order", () => {
    const source = emitDetailRoute(entry, ctx);

    expect(source).toContain('import Hero from "@/components/collections/blog-posts/sections/Hero";');
    expect(source).toContain('import BodyCopy from "@/components/collections/blog-posts/sections/BodyCopy";');
    expect(source.indexOf("<Hero {...(doc as unknown as PropsOf<typeof Hero>)} />")).toBeLessThan(
      source.indexOf("<BodyCopy {...(doc as unknown as PropsOf<typeof BodyCopy>)} />"),
    );
  });

  it("wires generateMetadata to the page binding's meta fields", () => {
    const source = emitDetailRoute(entry, ctx);

    expect(source).toContain('title: doc?.["title"]');
    expect(source).toContain('description: doc?.["excerpt"]');
  });

  it("leaves the metadata undefined when the page binding names no meta field", () => {
    const source = emitDetailRoute({ ...entry, pageBinding: { slugField: "handle", meta: {} } }, ctx);

    expect(source).toContain("title: undefined");
    expect(source).toContain("description: undefined");
  });

  it("lists static params from the slugs query, skipping a null slug", () => {
    const source = emitDetailRoute(entry, ctx);

    expect(source).toContain(`await client.fetch(${slugsQueryConstName("blogPost")})`);
    expect(source).toContain('if (typeof row.slug === "string")');
  });
});
