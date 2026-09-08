import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertLayerSeams, createOverlayDraft, writeOverlay } from "#generate/steps/scaffold/overlay.ts";

async function projectWith(files: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "overlay-"));
  for (const file of files) {
    await mkdir(join(dir, file, ".."), { recursive: true });
    await writeFile(join(dir, file), "laid");
  }
  return dir;
}

describe("assertLayerSeams", () => {
  it("rejects emission that lands on a file no earlier run of this tool wrote", async () => {
    const projectPath = await projectWith(["studio/schemaTypes/hero.ts"]);
    const { draft, templates, emitted } = createOverlayDraft();
    draft.emit("studio/schemaTypes/hero.ts", "ours");

    expect(() => assertLayerSeams({ projectPath, templates, emitted, previouslyWritten: [] })).toThrow(/hero\.ts/);
  });

  it("allows re-emitting a file this stage wrote on a previous run", async () => {
    const projectPath = await projectWith(["web/src/blocks/hero/config.ts"]);
    const { draft, templates, emitted } = createOverlayDraft();
    draft.emit("web/src/blocks/hero/config.ts", "ours");

    expect(() =>
      assertLayerSeams({
        projectPath,
        templates,
        emitted,
        previouslyWritten: ["web/src/blocks/hero/config.ts"],
      }),
    ).not.toThrow();
  });

  it("rejects an emitted route that claims a URL another route file already owns", async () => {
    const projectPath = await projectWith(["web/src/app/page.tsx"]);
    const { draft, templates, emitted } = createOverlayDraft();
    draft.emit("web/src/app/[[...slug]]/page.tsx", "ours");

    expect(() => assertLayerSeams({ projectPath, templates, emitted, previouslyWritten: [] })).toThrow(
      /two route files claim the same URL/,
    );
  });

  it("ignores a stale route file this run no longer writes", async () => {
    const projectPath = await projectWith(["web/src/app/works/[slug]/page.tsx"]);
    const { draft, templates, emitted } = createOverlayDraft();
    draft.emit("web/src/app/works/[id]/page.tsx", "ours");

    expect(() =>
      assertLayerSeams({
        projectPath,
        templates,
        emitted,
        previouslyWritten: ["web/src/app/works/[slug]/page.tsx"],
      }),
    ).not.toThrow();
  });
});

describe("writeOverlay", () => {
  it("writes both layers and deletes files this stage no longer emits", async () => {
    const projectPath = await projectWith(["studio/sanity.config.ts", "web/src/blocks/old-hero/config.ts"]);
    const { draft, templates, emitted } = createOverlayDraft();
    draft.template("studio/sanity.config.ts", "ours");
    draft.emit("web/src/blocks/hero/config.ts", "ours");

    const result = await writeOverlay({
      projectPath,
      templates,
      emitted,
      previouslyWritten: ["web/src/blocks/old-hero/config.ts"],
    });

    expect(existsSync(join(projectPath, "web/src/blocks/hero/config.ts"))).toBe(true);
    expect(existsSync(join(projectPath, "web/src/blocks/old-hero/config.ts"))).toBe(false);
    expect(result.removed).toEqual(["web/src/blocks/old-hero/config.ts"]);
    expect(result.files).toEqual(["studio/sanity.config.ts", "web/src/blocks/hero/config.ts"]);
  });

  it("keeps a file this run writes again, however the previous run listed it", async () => {
    const projectPath = await projectWith(["studio/sanity.config.ts"]);
    const { draft, templates, emitted } = createOverlayDraft();
    draft.template("studio/sanity.config.ts", "ours");

    const result = await writeOverlay({
      projectPath,
      templates,
      emitted,
      previouslyWritten: ["studio/sanity.config.ts"],
    });

    expect(existsSync(join(projectPath, "studio/sanity.config.ts"))).toBe(true);
    expect(result.removed).toEqual([]);
  });

  it("leaves an env file in place when a rebase no longer emits it", async () => {
    const projectPath = await projectWith(["studio/.env"]);
    const { templates, emitted } = createOverlayDraft();

    const result = await writeOverlay({
      projectPath,
      templates,
      emitted,
      previouslyWritten: ["studio/.env"],
    });

    expect(existsSync(join(projectPath, "studio/.env"))).toBe(true);
    expect(result.removed).toEqual([]);
  });
});
