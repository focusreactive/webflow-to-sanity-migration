import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runSanityPreflight, type SanityPreflightChecks } from "#generate/steps/scaffold/preflight.ts";
import { writeRunConfig } from "#run-config/load.ts";

const OK: SanityPreflightChecks = {
  hasPnpm: () => Promise.resolve(true),
  token: () => "sk-test",
  datasetReachable: () => Promise.resolve(true),
  datasetWritable: () => Promise.resolve(true),
};

async function project(dataset = "production"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "preflight-"));
  await writeRunConfig(dir, {
    sourceUrl: "https://acme.example",
    projectName: "acme",
    workspacePath: dir,
    target: { projectId: "abc123xy", dataset },
  });
  return dir;
}

describe("runSanityPreflight", () => {
  it("reports nothing when every check passes", async () => {
    expect(await runSanityPreflight({ projectPath: await project(), checks: OK })).toEqual([]);
  });

  it("reports every gap at once rather than stopping at the first", async () => {
    const problems = await runSanityPreflight({
      projectPath: await project(),
      checks: { ...OK, hasPnpm: () => Promise.resolve(false), token: () => undefined },
    });

    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toContain("pnpm is not on PATH");
    expect(problems.join("\n")).toContain("SANITY_API_WRITE_TOKEN is not set");
  });

  it("names the dataset the run config points at", async () => {
    const problems = await runSanityPreflight({
      projectPath: await project("staging"),
      checks: { ...OK, datasetReachable: () => Promise.resolve(false) },
    });

    expect(problems[0]).toContain('dataset "staging" is not reachable');
    expect(problems[0]).toContain("check SANITY_API_WRITE_TOKEN and network access");
  });

  it("blames the missing run config, not the network, when there is no run config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "preflight-bare-"));

    const problems = await runSanityPreflight({
      projectPath: dir,
      checks: { ...OK, datasetReachable: () => Promise.resolve(false) },
    });

    expect(problems[0]).toContain("no run-config.json found");
  });

  it("separates a read-only token from an unreachable dataset", async () => {
    const problems = await runSanityPreflight({
      projectPath: await project(),
      checks: { ...OK, datasetWritable: () => Promise.resolve(false) },
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("cannot write to it");
    expect(problems[0]).toContain("Editor");
  });
});
