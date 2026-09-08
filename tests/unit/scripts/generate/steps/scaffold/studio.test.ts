import { createOverlayDraft } from "#generate/steps/scaffold/overlay.ts";
import { scaffoldStudio, titleFromSourceUrl, type StudioIr } from "#generate/steps/scaffold/studio.ts";
import { blockTypeSchema } from "#ir/blocks.ts";
import { collectionEntrySchema } from "#ir/collections.ts";
import { globalDefSchema } from "#ir/globals.ts";

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
    { name: "title", type: { type: "text" }, required: true },
    { name: "handle", type: { type: "text" }, required: true },
  ],
  pageBinding: { slugField: "handle", meta: {} },
  items: [],
});

const globals = ["header", "footer"].map((name) =>
  globalDefSchema.parse({ name, fields: [{ name: "label", type: { type: "text" }, required: false }], values: {} }),
);

const IR: StudioIr = {
  blocks: [block],
  collections: [collection],
  globals,
  target: { projectId: "abc123", dataset: "production" },
  sourceUrl: "https://nova-x.webflow.io/",
  routeByKey: new Map([["blog-posts", "/blog/:slug"]]),
};

async function runStudio(ir: StudioIr = IR): Promise<{ emitted: Map<string, string | Buffer>; warnings: string[] }> {
  const { draft, emitted } = createOverlayDraft();
  const warnings: string[] = [];
  await scaffoldStudio({ projectPath: "/tmp/nova-x-site", draft, warn: (message) => warnings.push(message) }, ir);
  return { emitted, warnings };
}

function text(emitted: ReadonlyMap<string, string | Buffer>, path: string): string {
  const content = emitted.get(path);
  expect(content, `${path} was not emitted`).toBeDefined();
  return String(content);
}

const SCHEMA_TYPES_DIR = "studio/src/schemaTypes";

function registryImportPaths(index: string): string[] {
  return [...index.matchAll(/from "([^"]+)"/g)].map((match) => match[1] ?? "");
}

describe("titleFromSourceUrl", () => {
  it("titles the studio from the source host", () => {
    expect(titleFromSourceUrl("https://nova-x.webflow.io/")).toBe("nova-x.webflow.io");
  });

  it("produces the same title for the same host with and without www", () => {
    expect(titleFromSourceUrl("https://www.example.com/")).toBe(titleFromSourceUrl("https://example.com/"));
  });
});

describe("scaffoldStudio", () => {
  it("emits a schema module for every block, chrome document and collection", async () => {
    const { emitted } = await runStudio();

    expect(text(emitted, `${SCHEMA_TYPES_DIR}/blocks/hero-banner.ts`)).toContain("export const heroBanner");
    expect(text(emitted, `${SCHEMA_TYPES_DIR}/documents/header.ts`)).toContain("export const header");
    expect(text(emitted, `${SCHEMA_TYPES_DIR}/documents/footer.ts`)).toContain("export const footer");
    expect(text(emitted, `${SCHEMA_TYPES_DIR}/documents/blog-posts.ts`)).toContain("export const blogPosts");
    expect(text(emitted, `${SCHEMA_TYPES_DIR}/documents/page.ts`)).toContain("export const page");
    expect(text(emitted, `${SCHEMA_TYPES_DIR}/page-builder.ts`)).toContain("export const pageBuilder");
  });

  it("emits the shared portableText object type the block schemas reference", async () => {
    const { emitted } = await runStudio();

    const portableText = text(emitted, `${SCHEMA_TYPES_DIR}/objects/portable-text.ts`);
    expect(portableText).toContain("export const portableText = defineType(");
    expect(portableText).toContain('name: "portableText"');
    expect(text(emitted, `${SCHEMA_TYPES_DIR}/blocks/hero-banner.ts`)).toContain('type: "portableText"');
  });

  it("registers portableText in the schema registry alongside every other module", async () => {
    const { emitted } = await runStudio();
    const index = text(emitted, `${SCHEMA_TYPES_DIR}/index.ts`);

    expect(index).toContain('import { portableText } from "./objects/portable-text";');
    expect(index).toMatch(/export const schemaTypes = \[[^\]]*\bportableText\b[^\]]*\]/);
    for (const name of ["heroBanner", "header", "footer", "blogPosts", "page", "pageBuilder"]) {
      expect(index).toMatch(new RegExp(`export const schemaTypes = \\[[^\\]]*\\b${name}\\b`));
    }
  });

  it("registers no schema module it did not also emit", async () => {
    const { emitted } = await runStudio();
    const index = text(emitted, `${SCHEMA_TYPES_DIR}/index.ts`);

    for (const importPath of registryImportPaths(index)) {
      const file = `${SCHEMA_TYPES_DIR}/${importPath.replace(/^\.\//, "")}.ts`;
      expect(emitted.has(file), `${index.includes(importPath) ? importPath : ""} is registered but never emitted`).toBe(
        true,
      );
    }
  });

  it("emits the studio config, cli config, package manifest and tsconfig", async () => {
    const { emitted } = await runStudio();

    const config = text(emitted, "studio/sanity.config.ts");
    expect(config).toContain('title: "nova-x.webflow.io"');
    expect(config).toContain('projectId: "abc123"');
    expect(config).toContain('dataset: "production"');

    expect(text(emitted, "studio/sanity.cli.ts")).toContain('projectId: "abc123"');
    expect(text(emitted, "studio/tsconfig.json")).toContain("scripts/**/*.ts");

    const pkg = JSON.parse(text(emitted, "studio/package.json")) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
    };
    expect(pkg.scripts["typecheck"]).toBe("tsc --noEmit");
    expect(pkg.scripts["seed"]).toBe("tsx scripts/seed.ts");
    for (const dependency of ["@sanity/block-tools", "jsdom", "@portabletext/types"]) {
      expect(pkg.dependencies[dependency], `studio package.json is missing ${dependency}`).toBeTruthy();
    }
  });

  it("emits the structure and presentation modules the studio config imports", async () => {
    const { emitted } = await runStudio();

    const structure = text(emitted, "studio/src/structure.ts");
    expect(structure).toContain('S.documentTypeListItem("blogPosts").title("Blog Posts")');
    expect(structure).toContain('S.documentTypeListItem("header").title("Header")');
    expect(structure).not.toMatch(/__[A-Z][A-Z0-9_]*__/);

    expect(text(emitted, "studio/src/presentation/page-tree.ts")).toContain("export function routablePaths");
    const resolve = text(emitted, "studio/src/presentation/resolve.ts");
    expect(resolve).toContain('"blogPosts": defineLocations(');
    expect(resolve).toContain('slug: "handle.current"');
    expect(resolve).toContain('/blog/${doc?.slug ?? ""}');
  });

  it("ships the seed script with every sibling module it imports", async () => {
    const { emitted } = await runStudio();

    for (const file of [
      "seed.ts",
      "doc-id.ts",
      "transform.ts",
      "html-to-portable-text.ts",
      "color.ts",
      "portable-text.ts",
      "define-wrap.ts",
      "source.ts",
      "document-types.json",
    ]) {
      expect(emitted.has(`studio/scripts/${file}`), `studio/scripts/${file} was not emitted`).toBe(true);
    }
    expect(JSON.parse(text(emitted, "studio/scripts/document-types.json"))).toEqual({ "blog-posts": "blogPosts" });
  });

  it("rewrites every tool alias in the copied seed modules to a flat sibling import", async () => {
    const { emitted } = await runStudio();

    for (const [path, content] of emitted) {
      if (!path.startsWith("studio/scripts/") || !path.endsWith(".ts")) continue;
      expect(String(content), `${path} still imports a tool path alias`).not.toContain("#generate/");
    }
    const transform = text(emitted, "studio/scripts/transform.ts");
    expect(transform).toContain('from "./color.ts"');
    expect(transform).toContain('from "./html-to-portable-text.ts"');
    expect(text(emitted, "studio/scripts/portable-text.ts")).toContain('from "./define-wrap.ts"');
  });

  it("warns and ships no document when a chrome global is missing from the IR", async () => {
    const { emitted, warnings } = await runStudio({ ...IR, globals: [] });

    expect(warnings.some((warning) => warning.includes('chrome "header"'))).toBe(true);
    expect(emitted.has(`${SCHEMA_TYPES_DIR}/documents/header.ts`)).toBe(false);
    expect(text(emitted, `${SCHEMA_TYPES_DIR}/documents/page.ts`)).not.toContain('name: "header"');
  });

  it("warns when the IR has no block types at all", async () => {
    const { warnings } = await runStudio({ ...IR, blocks: [] });

    expect(warnings.some((warning) => warning.startsWith("blocks:"))).toBe(true);
  });
});
