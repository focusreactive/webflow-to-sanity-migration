import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { writeArtifact, writeNdjsonArtifact } from "#ir/artifact.ts";
import { blocksArtifact, type BlocksData } from "#ir/blocks.ts";
import { collectionsArtifact } from "#ir/collections.ts";
import { collectionIdSchema } from "#ir/common.ts";
import { globalDefSchema, globalsArtifact, type GlobalsData } from "#ir/globals.ts";
import { layoutRouteArtifactFor } from "#ir/layout.ts";
import { pagesArtifact } from "#ir/pages.ts";
import { initManifest } from "#lib/manifest/index.ts";
import { synthEntryDir } from "#lib/synth-store/paths.ts";
import { writeRunConfig } from "#run-config/load.ts";
import { designTokensArtifact, designTokensDataSchema } from "#tokens/schemas/design-tokens.ts";

export const SOURCE_URL = "https://acme.example";
export const PROJECT_ID = "abc123xy";

export const MINIMAL_TOKENS = designTokensDataSchema.parse({
  primitive: {
    color: {
      ink: {
        $type: "color",
        $value: { colorSpace: "oklch", components: [0.223, 0.0313, 264.7732], alpha: 1, hex: "#141b2a" },
      },
      paper: {
        $type: "color",
        $value: { colorSpace: "oklch", components: [1, 0, 0], alpha: 1, hex: "#ffffff" },
      },
    },
    fontFamily: { sans: { $type: "fontFamily", $value: ["Inter", "sans-serif"] } },
    fontSize: { base: { $type: "dimension", $value: { value: 16, unit: "px" } } },
    fontWeight: {},
    lineHeight: {},
    letterSpacing: {},
    spacing: {},
    radius: {},
    shadow: {},
    breakpoint: {},
  },
  semantic: {
    color: {
      surface: { $type: "color", $value: "{primitive.color.paper}" },
      text: { $type: "color", $value: "{primitive.color.ink}" },
    },
  },
});

const COLLECTION_SECTION_TSX = `interface HeroProps {
  doc: { title?: string | null } | null;
}

export default function Hero({ doc }: HeroProps) {
  return <h1>{doc?.title ?? ""}</h1>;
}
`;

function globalComponentTsx(role: string): string {
  const name = role.charAt(0).toUpperCase() + role.slice(1);
  return (
    `import type { ${name}Props } from "./props.ts";\n\n`
    + `export default function ${name}(props: ${name}Props) {\n`
    + `  return <div data-role="${role}">{Object.keys(props).length}</div>;\n}\n`
  );
}

export interface MinimalScaffoldFixtureOptions {
  blocks?: BlocksData;
  globals?: GlobalsData;
}

export async function buildMinimalScaffoldFixture(
  projectPath: string,
  opts: MinimalScaffoldFixtureOptions = {},
): Promise<void> {
  await initManifest(projectPath, { toolVersion: "0.0.0-test", sourceUrl: SOURCE_URL });
  await writeRunConfig(projectPath, {
    sourceUrl: SOURCE_URL,
    projectName: "acme",
    workspacePath: projectPath,
    target: { projectId: PROJECT_ID, dataset: "production" },
  });

  await writeArtifact(projectPath, pagesArtifact, {
    provenance: "published",
    data: {
      pages: [
        { route: "/", kind: "static", sources: ["crawl"] },
        { route: "/works/alpha", kind: "item", collectionKey: "works", slug: "alpha", sources: ["crawl"] },
      ],
      collections: [{ key: "works", routePattern: "/works/:slug", itemCount: 1 }],
    },
  });
  await writeArtifact(projectPath, blocksArtifact, { provenance: "ai", data: opts.blocks ?? { blocks: [] } });

  const globals: GlobalsData = opts.globals ?? {
    globals: [
      globalDefSchema.parse({ name: "header", fields: [], values: {} }),
      globalDefSchema.parse({ name: "footer", fields: [], values: {} }),
    ],
  };
  await writeArtifact(projectPath, globalsArtifact, { provenance: "ai", data: globals });

  await writeArtifact(projectPath, collectionsArtifact, {
    provenance: "ai",
    data: {
      collections: [
        {
          key: collectionIdSchema.parse("works"),
          label: "Works",
          fields: [
            { name: "slug", type: { type: "text" }, required: true },
            { name: "title", type: { type: "text" }, required: true },
            { name: "excerpt", type: { type: "text" }, required: false },
          ],
          pageBinding: { slugField: "slug", meta: { title: "title", description: "excerpt" } },
          items: [{ id: "alpha", _provenance: "ai", slug: "alpha", title: "Alpha", excerpt: "First entry" }],
          template: [{ sectionId: "hero", itemFields: ["title"] }],
        },
      ],
    },
  });
  await writeArtifact(projectPath, designTokensArtifact, { provenance: "ai", data: MINIMAL_TOKENS });
  await writeNdjsonArtifact(projectPath, layoutRouteArtifactFor("index"), {
    provenance: "ai",
    items: [],
    extraMeta: { unitKind: "static", route: "/" },
  });

  const heroSectionDir = join(synthEntryDir(projectPath, "collections", "works"), "sections", "hero");
  await mkdir(heroSectionDir, { recursive: true });
  await writeFile(join(heroSectionDir, "Component.tsx"), COLLECTION_SECTION_TSX);

  for (const def of globals.globals) {
    const dir = synthEntryDir(projectPath, "globals", def.name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "Component.tsx"), globalComponentTsx(def.name));
  }
}

export async function stageBlockComponent(
  projectPath: string,
  blockId: string,
  componentTsx: string,
  richText: Readonly<Record<string, string>> = {},
): Promise<void> {
  const dir = synthEntryDir(projectPath, "blocks", blockId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "Component.tsx"), componentTsx);

  const fields = Object.entries(richText);
  if (fields.length === 0) return;
  await mkdir(join(dir, "richtext"), { recursive: true });
  for (const [field, source] of fields) await writeFile(join(dir, "richtext", `${field}.tsx`), source);
}
