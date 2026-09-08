import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NEVER_REMOVED } from "#generate/constants/dirs.ts";
import { writeSanityEnv } from "#generate/steps/scaffold/app-env.ts";

const TARGET = { projectId: "abc123", dataset: "production", apiVersion: "2026-09-01" };

async function projectDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "sanity-env-"));
}

describe("writeSanityEnv", () => {
  it("never lists an env file for removal on a rebase", () => {
    for (const file of NEVER_REMOVED) expect(["studio/.env", "web/.env.local"]).toContain(file);
  });

  it("writes the project id, dataset and api version into the studio env", async () => {
    const dir = await projectDir();
    await writeSanityEnv({ projectPath: dir, target: TARGET });

    const env = await readFile(join(dir, "studio/.env"), "utf8");
    expect(env).toContain("abc123");
    expect(env).toContain("production");
    expect(env).toContain("2026-09-01");
  });

  it("writes the frontend's own env file next to the web workspace", async () => {
    const dir = await projectDir();
    await writeSanityEnv({ projectPath: dir, target: TARGET });

    const env = await readFile(join(dir, "web/.env.local"), "utf8");
    expect(env).toContain("NEXT_PUBLIC_SANITY_PROJECT_ID=abc123");
    expect(env).toContain("NEXT_PUBLIC_SANITY_DATASET=production");
    expect(env).toContain("NEXT_PUBLIC_SANITY_API_VERSION=2026-09-01");
  });

  it("carries no write token onto disk", async () => {
    const dir = await projectDir();
    await writeSanityEnv({ projectPath: dir, target: TARGET });

    const studio = await readFile(join(dir, "studio/.env"), "utf8");
    const web = await readFile(join(dir, "web/.env.local"), "utf8");
    for (const env of [studio, web]) expect(env).not.toContain("TOKEN");
  });

  it("never overwrites an env file the operator already has", async () => {
    const dir = await projectDir();
    await mkdir(join(dir, "studio"), { recursive: true });
    await writeFile(join(dir, "studio/.env"), "KEEP=1");

    await writeSanityEnv({ projectPath: dir, target: TARGET });

    expect(await readFile(join(dir, "studio/.env"), "utf8")).toBe("KEEP=1");
    expect(await readFile(join(dir, "web/.env.local"), "utf8")).toContain("abc123");
  });
});
