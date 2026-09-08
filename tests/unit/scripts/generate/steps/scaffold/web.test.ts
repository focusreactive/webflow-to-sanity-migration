import { createOverlayDraft } from "#generate/steps/scaffold/overlay.ts";
import { scaffoldWeb, type WebIr } from "#generate/steps/scaffold/web.ts";
import { blockTypeSchema } from "#ir/blocks.ts";
import { collectionEntrySchema } from "#ir/collections.ts";
import { globalDefSchema } from "#ir/globals.ts";
import { designTokensDataSchema } from "#tokens/schemas/design-tokens.ts";

const TOKENS = designTokensDataSchema.parse({
  primitive: {
    color: {
      "ink-900": {
        $type: "color",
        $value: { colorSpace: "oklch", components: [0.223, 0.0313, 264.7732], alpha: 1, hex: "#141b2a" },
      },
      "paper-50": {
        $type: "color",
        $value: { colorSpace: "oklch", components: [1, 0, 0], alpha: 1, hex: "#ffffff" },
      },
    },
    fontFamily: { sans: { $type: "fontFamily", $value: ["Inter", "sans-serif"] } },
    fontSize: { base: { $type: "dimension", $value: { value: 16, unit: "px" } } },
    fontWeight: {},
    lineHeight: {},
    letterSpacing: {},
    spacing: { md: { $type: "dimension", $value: { value: 16, unit: "px" } } },
    radius: {},
    shadow: {},
    breakpoint: {},
  },
  semantic: {
    color: {
      surface: { $type: "color", $value: "{primitive.color.paper-50}" },
      text: { $type: "color", $value: "{primitive.color.ink-900}" },
    },
  },
});

const block = blockTypeSchema.parse({
  id: "hero-banner",
  name: "Hero Banner",
  fields: [
    { name: "heading", type: { type: "text" }, required: true },
    { name: "body", type: { type: "richText" }, required: false },
  ],
  content: {},
});

const collection = collectionEntrySchema.parse({
  key: "blog-posts",
  label: "Blog Posts",
  fields: [
    { name: "handle", type: { type: "text" }, required: true },
    { name: "title", type: { type: "text" }, required: true },
    { name: "excerpt", type: { type: "text" }, required: false },
  ],
  pageBinding: { slugField: "handle", meta: { title: "title", description: "excerpt" } },
  items: [],
  template: [{ sectionId: "hero", itemFields: ["title"] }],
});

const header = globalDefSchema.parse({
  name: "header",
  fields: [{ name: "label", type: { type: "text" }, required: false }],
  values: {},
});

const BLOCK_COMPONENT =
  'import RichTextBody from "./richtext/body.tsx";\n\nexport default function HeroBanner() {\n  return <RichTextBody />;\n}\n';

const IR: WebIr = {
  blocks: [{ block, component: BLOCK_COMPONENT, richText: { body: "export default function RichTextBody() {}\n" } }],
  collections: [
    {
      entry: collection,
      routePattern: "/blog/:slug",
      sections: { hero: "export default function Hero() {\n  return <section />;\n}\n" },
    },
  ],
  globals: [{ global: header, component: "export default function Header() {\n  return <header />;\n}\n" }],
  sourceUrl: "https://nova-x.webflow.io/",
  apiVersion: "2026-09-01",
  tokens: TOKENS,
};

async function runWeb(ir: WebIr = IR): Promise<{ emitted: Map<string, string | Buffer>; warnings: string[] }> {
  const { draft, emitted } = createOverlayDraft();
  const warnings: string[] = [];
  await scaffoldWeb({ projectPath: "/tmp/nova-x-site", draft, warn: (message) => warnings.push(message) }, ir);
  return { emitted, warnings };
}

function text(emitted: ReadonlyMap<string, string | Buffer>, path: string): string {
  const content = emitted.get(path);
  expect(content, `${path} was not emitted`).toBeDefined();
  return String(content);
}

const FRONTEND = "web/src/app/(frontend)";

describe("scaffoldWeb", () => {
  it("writes the package files the install and build gates need", async () => {
    const { emitted } = await runWeb();

    expect([...emitted.keys()]).toEqual(
      expect.arrayContaining([
        "web/package.json",
        "web/next.config.ts",
        "web/tsconfig.json",
        "web/postcss.config.mjs",
        "web/eslint.config.mjs",
      ]),
    );
    expect(text(emitted, "web/package.json")).toContain('"name": "web"');
  });

  it("writes into the directory typegen generates web/sanity.types.ts in", async () => {
    const { emitted } = await runWeb();
    const rootFiles = [...emitted.keys()].filter((path) => !path.slice("web/".length).includes("/"));

    expect(rootFiles).toContain("web/package.json");
    expect(rootFiles.every((path) => path.startsWith("web/"))).toBe(true);
  });

  it("emits the catch-all route the page tree resolves against", async () => {
    const { emitted } = await runWeb();

    const route = text(emitted, `${FRONTEND}/[[...slug]]/page.tsx`);
    expect(route).toContain("export async function generateStaticParams");
    expect(route).toContain("PAGE_TREE_QUERY");
  });

  it("emits a detail route under the collection's own route pattern", async () => {
    const { emitted } = await runWeb();

    const route = text(emitted, `${FRONTEND}/blog/[slug]/page.tsx`);
    expect(route).toContain("BLOG_POSTS_BY_SLUG_QUERY");
    expect(emitted.has("web/src/components/collections/blog-posts/sections/Hero.tsx")).toBe(true);
  });

  it("emits one component folder per block plus the renderer that switches over them", async () => {
    const { emitted } = await runWeb();

    expect(emitted.has("web/src/components/blocks/hero-banner/index.tsx")).toBe(true);
    expect(text(emitted, "web/src/components/blocks/hero-banner/props.ts")).toContain(
      "export interface HeroBannerProps",
    );
    expect(text(emitted, "web/src/components/render-blocks.tsx")).toContain('case "heroBanner":');
  });

  it("flattens a block's richText wrapper beside its component and rewrites the import", async () => {
    const { emitted } = await runWeb();

    expect(emitted.has("web/src/components/blocks/hero-banner/rich-text-body.tsx")).toBe(true);
    expect(text(emitted, "web/src/components/blocks/hero-banner/index.tsx")).toContain('from "./rich-text-body"');
  });

  it("emits one chrome component folder per global", async () => {
    const { emitted } = await runWeb();

    expect(emitted.has("web/src/components/chrome/header/index.tsx")).toBe(true);
    expect(text(emitted, "web/src/components/chrome/header/props.ts")).toContain("export interface HeaderProps");
    expect(text(emitted, `${FRONTEND}/layout.tsx`)).toContain('import Header from "@/components/chrome/header";');
  });

  it("carries the theme variables in globals.css", async () => {
    const { emitted } = await runWeb();

    const css = text(emitted, `${FRONTEND}/globals.css`);
    expect(css).toContain('@import "tailwindcss";');
    expect(css).toContain("@theme {");
    expect(css).toContain("--color-paper-50: oklch(1 0 0);");
    expect(css).toContain("--color-surface: var(--color-paper-50);");
    expect(css).toContain("background-color: var(--color-surface);");
  });

  it("writes the api version into the sanity client and shares the page-tree helper source", async () => {
    const { emitted } = await runWeb();

    expect(text(emitted, "web/src/sanity/client.ts")).toContain("2026-09-01");
    expect(text(emitted, "web/src/sanity/page-tree.ts")).toContain("export function routablePaths");
    expect(text(emitted, "web/src/sanity/queries.ts")).toContain("defineQuery(");
  });

  it("warns and ships an empty fonts.css when the snapshot staged no fonts", async () => {
    const { emitted, warnings } = await runWeb();

    expect(warnings).toContainEqual(expect.stringContaining("no staged fonts.css"));
    expect(text(emitted, `${FRONTEND}/fonts.css`)).toBe("");
  });

  it("rewrites staged font urls to the public font route and emits the font bytes", async () => {
    const { emitted, warnings } = await runWeb({
      ...IR,
      fonts: {
        css: "@font-face { src: url(../assets/fonts/inter.woff2); }",
        assets: new Map([["inter.woff2", Buffer.from("FONT")]]),
      },
    });

    expect(warnings).not.toContainEqual(expect.stringContaining("no staged fonts.css"));
    expect(text(emitted, `${FRONTEND}/fonts.css`)).toContain("/fonts/inter.woff2");
    expect(emitted.get("web/public/fonts/inter.woff2")).toEqual(Buffer.from("FONT"));
  });

  it("skips the detail route of a collection with no route pattern", async () => {
    const { emitted, warnings } = await runWeb({
      ...IR,
      collections: [{ entry: collection, sections: { hero: "export default function Hero() {}\n" } }],
    });

    expect(warnings).toContainEqual('collection "blog-posts": no route pattern — no detail route generated');
    expect([...emitted.keys()].some((path) => path.includes("[slug]"))).toBe(false);
  });

  it("skips the detail route when a templated section was never staged", async () => {
    const { emitted, warnings } = await runWeb({
      ...IR,
      collections: [{ entry: collection, routePattern: "/blog/:slug", sections: {} }],
    });

    expect(warnings).toContainEqual(
      'collection "blog-posts": staged section "hero" missing — no detail route generated',
    );
    expect(emitted.has(`${FRONTEND}/blog/[slug]/page.tsx`)).toBe(false);
  });
});
