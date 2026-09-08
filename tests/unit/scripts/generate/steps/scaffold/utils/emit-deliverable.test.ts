import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  loadWebBlocks,
  loadWebCollections,
  loadWebFonts,
  loadWebGlobals,
  readOptional,
} from "#generate/steps/scaffold/utils/emit-deliverable.ts";
import { blockTypeSchema } from "#ir/blocks.ts";
import { collectionEntrySchema } from "#ir/collections.ts";
import { globalDefSchema } from "#ir/globals.ts";
import { FONT_ASSETS_DIR, FONTS_CSS_RELATIVE_PATH } from "#lib/snapshot-store/fonts.ts";
import { SNAPSHOT_DIR } from "#lib/snapshot-store/paths.ts";
import { synthEntryDir } from "#lib/synth-store/paths.ts";

const BLOCK = blockTypeSchema.parse({ id: "hero", name: "Hero", content: {}, fields: [] });
const GLOBAL = globalDefSchema.parse({ name: "header", fields: [], values: {} });
const COLLECTION = collectionEntrySchema.parse({
  key: "works",
  label: "Works",
  fields: [{ name: "slug", type: { type: "text" }, required: true }],
  pageBinding: { slugField: "slug", meta: {} },
  items: [],
  template: [{ sectionId: "hero", itemFields: [] }],
});

async function project(): Promise<string> {
  return mkdtemp(join(tmpdir(), "emit-deliverable-utils-"));
}

async function stage(dir: string, files: Readonly<Record<string, string>>): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const file = join(dir, relativePath);
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, content);
  }
}

describe("loadWebBlocks", () => {
  it("carries a block's component and its richText wrappers", async () => {
    const projectPath = await project();
    await stage(synthEntryDir(projectPath, "blocks", "hero"), {
      "Component.tsx": "export default function Hero() {\n  return null;\n}\n",
      "richtext/body.tsx": "export default function RichTextBody() {\n  return null;\n}\n",
      "richtext/notes.md": "ignored",
    });

    const [entry] = await loadWebBlocks(projectPath, [BLOCK]);

    expect(entry?.component).toContain("function Hero");
    expect(Object.keys(entry?.richText ?? {})).toEqual(["body"]);
  });

  it("names the block when its component is missing", async () => {
    const projectPath = await project();

    await expect(loadWebBlocks(projectPath, [BLOCK])).rejects.toThrow(/block "hero" is missing Component\.tsx/);
  });

  it("leaves richText off a block that staged none", async () => {
    const projectPath = await project();
    await stage(synthEntryDir(projectPath, "blocks", "hero"), { "Component.tsx": "export default () => null;\n" });

    const [entry] = await loadWebBlocks(projectPath, [BLOCK]);

    expect(entry).not.toHaveProperty("richText");
  });
});

describe("loadWebGlobals", () => {
  it("carries a chrome role's component", async () => {
    const projectPath = await project();
    await stage(synthEntryDir(projectPath, "globals", "header"), {
      "Component.tsx": "export default function Header() {\n  return null;\n}\n",
    });

    const [entry] = await loadWebGlobals(projectPath, [GLOBAL]);

    expect(entry?.component).toContain("function Header");
  });

  it("names the chrome role when its component is missing", async () => {
    const projectPath = await project();

    await expect(loadWebGlobals(projectPath, [GLOBAL])).rejects.toThrow(/global "header" is missing Component\.tsx/);
  });
});

describe("loadWebCollections", () => {
  it("carries the staged sections and the collection's route pattern", async () => {
    const projectPath = await project();
    await stage(join(synthEntryDir(projectPath, "collections", "works"), "sections", "hero"), {
      "Component.tsx": "export default function Hero() {\n  return null;\n}\n",
      "richtext/body.tsx": "export default function RichTextBody() {\n  return null;\n}\n",
    });

    const [entry] = await loadWebCollections(projectPath, [COLLECTION], new Map([["works", "/works/:slug"]]));

    expect(entry?.routePattern).toBe("/works/:slug");
    expect(entry?.sections["hero"]).toContain("function Hero");
    expect(entry?.richText?.["hero"]?.["body"]).toContain("RichTextBody");
  });

  it("leaves a section out rather than throwing, so scaffoldWeb can warn and skip the route", async () => {
    const projectPath = await project();

    const [entry] = await loadWebCollections(projectPath, [COLLECTION], new Map());

    expect(entry?.sections).toEqual({});
    expect(entry).not.toHaveProperty("routePattern");
  });
});

describe("loadWebFonts", () => {
  it("returns undefined when the snapshot staged no fonts.css", async () => {
    expect(await loadWebFonts(await project())).toBeUndefined();
  });

  it("carries the css and every font asset beside it", async () => {
    const projectPath = await project();
    await stage(join(projectPath, SNAPSHOT_DIR), {
      [FONTS_CSS_RELATIVE_PATH]: "@font-face{font-family:Inter}",
      [join(FONT_ASSETS_DIR, "inter.woff2")]: "binary",
    });

    const fonts = await loadWebFonts(projectPath);

    expect(fonts?.css).toContain("Inter");
    expect([...(fonts?.assets.keys() ?? [])]).toEqual(["inter.woff2"]);
  });
});

describe("readOptional", () => {
  it("returns the data when the reader resolves and undefined when it throws", async () => {
    expect(await readOptional(() => Promise.resolve({ data: 1 }))).toBe(1);
    expect(await readOptional(() => Promise.reject(new Error("no artifact")))).toBeUndefined();
  });
});
