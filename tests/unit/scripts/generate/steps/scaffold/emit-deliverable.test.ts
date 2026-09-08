import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DELIVERABLE_FILES_ARTIFACT_PATH, PAGE_TREE_ARTIFACT_PATH } from "#generate/constants/paths.ts";
import { SANITY_API_VERSION } from "#generate/constants/versions.ts";
import { emitDeliverable } from "#generate/steps/scaffold/emit-deliverable.ts";
import { blockTypeSchema } from "#ir/blocks.ts";

import { buildMinimalScaffoldFixture, PROJECT_ID, stageBlockComponent } from "../../fixtures/minimal-scaffold.ts";

const HERO = blockTypeSchema.parse({
  id: "hero",
  name: "Hero",
  content: {},
  fields: [{ name: "heading", type: { type: "text" }, required: true }],
});

const HERO_COMPONENT =
  'import type { HeroProps } from "./props.ts";\n\n'
  + "export default function Hero(props: HeroProps) {\n  return <div>{props.heading}</div>;\n}\n";

async function project(): Promise<string> {
  return mkdtemp(join(tmpdir(), "emit-deliverable-"));
}

async function emitMinimal(projectPath: string): Promise<{ files: string[]; warnings: string[] }> {
  await buildMinimalScaffoldFixture(projectPath, { blocks: { blocks: [HERO] } });
  await stageBlockComponent(projectPath, "hero", HERO_COMPONENT);
  return emitDeliverable({ projectPath });
}

describe("emitDeliverable", () => {
  it("lays the workspace root, the studio and the web app in one pass", async () => {
    const projectPath = await project();

    const { files } = await emitMinimal(projectPath);

    for (const relativePath of [
      "package.json",
      "pnpm-workspace.yaml",
      "turbo.json",
      "studio/sanity.config.ts",
      "studio/src/schemaTypes/index.ts",
      "studio/src/schemaTypes/blocks/hero.ts",
      "studio/scripts/seed.ts",
      "web/package.json",
      "web/src/sanity/queries.ts",
      "web/src/components/blocks/hero/index.tsx",
      "web/src/components/render-blocks.tsx",
      "web/src/app/(frontend)/layout.tsx",
      "web/src/app/(frontend)/[[...slug]]/page.tsx",
      "web/src/app/(frontend)/works/[slug]/page.tsx",
    ]) {
      expect(files, `${relativePath} was not emitted`).toContain(relativePath);
    }
    await expect(readFile(join(projectPath, "web/src/components/blocks/hero/props.ts"), "utf8")).resolves.toContain(
      "HeroProps",
    );
  });

  it("records every written path, the removals and the warnings in the deliverable ledger", async () => {
    const projectPath = await project();

    const { files, warnings } = await emitMinimal(projectPath);
    const ledger = JSON.parse(await readFile(join(projectPath, DELIVERABLE_FILES_ARTIFACT_PATH), "utf8")) as {
      files: string[];
      removed: string[];
      warnings: string[];
    };

    expect(ledger.files).toEqual(files);
    expect(ledger.removed).toEqual([]);
    expect(ledger.warnings).toEqual(warnings);
  });

  it("removes a file the previous run wrote and this one no longer emits", async () => {
    const projectPath = await project();
    await emitMinimal(projectPath);
    const stale = "web/src/components/blocks/hero/index.tsx";
    await expect(readFile(join(projectPath, stale), "utf8")).resolves.toContain("Hero");

    await rm(join(projectPath, ".migration/artifacts/blocks.json"));
    await buildMinimalScaffoldFixture(projectPath, { blocks: { blocks: [] } });
    await emitDeliverable({ projectPath });

    await expect(readFile(join(projectPath, stale), "utf8")).rejects.toThrow();
    const ledger = JSON.parse(await readFile(join(projectPath, DELIVERABLE_FILES_ARTIFACT_PATH), "utf8")) as {
      removed: string[];
    };
    expect(ledger.removed).toContain(stale);
  });

  it("writes the page-tree artifact the seed script reads", async () => {
    const projectPath = await project();

    await emitMinimal(projectPath);

    const tree = JSON.parse(await readFile(join(projectPath, PAGE_TREE_ARTIFACT_PATH), "utf8")) as {
      localeCode: string;
      nodes: { path: string }[];
    };
    expect(tree.localeCode).toBe("en");
    expect(tree.nodes.map((node) => node.path)).toContain("home");
  });

  it("writes both env files from the run config's target and the pinned api version", async () => {
    const projectPath = await project();

    await emitMinimal(projectPath);

    const studioEnv = await readFile(join(projectPath, "studio/.env"), "utf8");
    const webEnv = await readFile(join(projectPath, "web/.env.local"), "utf8");
    expect(studioEnv).toContain(`SANITY_STUDIO_PROJECT_ID=${PROJECT_ID}`);
    expect(studioEnv).toContain(`SANITY_STUDIO_API_VERSION=${SANITY_API_VERSION}`);
    expect(webEnv).toContain(`NEXT_PUBLIC_SANITY_PROJECT_ID=${PROJECT_ID}`);
    expect(webEnv).toContain(`NEXT_PUBLIC_SANITY_API_VERSION=${SANITY_API_VERSION}`);
  });

  it("pins the web client to the same api version the env files carry", async () => {
    const projectPath = await project();

    await emitMinimal(projectPath);

    expect(await readFile(join(projectPath, "web/src/sanity/client.ts"), "utf8")).toContain(SANITY_API_VERSION);
  });

  it("keeps an env file an operator already edited", async () => {
    const projectPath = await project();
    await buildMinimalScaffoldFixture(projectPath, { blocks: { blocks: [] } });
    await emitDeliverable({ projectPath });
    await writeFile(join(projectPath, "studio/.env"), "SANITY_STUDIO_PROJECT_ID=edited-by-hand\n");

    await emitDeliverable({ projectPath });

    expect(await readFile(join(projectPath, "studio/.env"), "utf8")).toContain("edited-by-hand");
  });

  it("warns instead of failing when no fonts were staged", async () => {
    const projectPath = await project();

    const { warnings } = await emitMinimal(projectPath);

    expect(warnings.join("\n")).toContain("fonts");
  });

  it("refuses to emit a project with a hole in it when a block component is missing", async () => {
    const projectPath = await project();
    await buildMinimalScaffoldFixture(projectPath, { blocks: { blocks: [HERO] } });

    await expect(emitDeliverable({ projectPath })).rejects.toThrow(/block "hero" is missing Component\.tsx/);
  });
});
