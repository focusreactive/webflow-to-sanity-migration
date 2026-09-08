import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { requireEnv } from "#lib/migrate-config/index.ts";
import { loadRunConfig } from "#run-config/load.ts";

import { SANITY_API_VERSION } from "../../constants/versions.ts";

const execFileAsync = promisify(execFile);

const DEFAULT_DATASET = "production";

export interface SanityPreflightChecks {
  hasPnpm: () => Promise<boolean>;
  token: () => string | undefined;
  datasetReachable: (dataset: string) => Promise<boolean>;
  datasetWritable: (dataset: string) => Promise<boolean>;
}

type ConfigResolution = { kind: "ok"; projectId: string; dataset: string } | { kind: "no-run-config" };

async function resolveSanityConfig(projectPath: string): Promise<ConfigResolution> {
  try {
    const runConfig = await loadRunConfig(projectPath);
    return { kind: "ok", projectId: runConfig.target.projectId, dataset: runConfig.target.dataset };
  } catch {
    return { kind: "no-run-config" };
  }
}

function datasetOf(config: ConfigResolution): string {
  return config.kind === "ok" ? config.dataset : DEFAULT_DATASET;
}

function unreachableReason(config: ConfigResolution): string {
  switch (config.kind) {
    case "no-run-config":
      return "no run-config.json found for this project — run init-project first";
    case "ok":
      return "check SANITY_API_WRITE_TOKEN and network access";
  }
}

function defaultChecks(config: ConfigResolution): SanityPreflightChecks {
  return {
    hasPnpm: async () => {
      try {
        await execFileAsync("pnpm", ["--version"]);
        return true;
      } catch {
        return false;
      }
    },
    token: () => {
      try {
        return requireEnv("SANITY_API_WRITE_TOKEN");
      } catch {
        return undefined;
      }
    },
    datasetReachable: async (dataset) => {
      if (config.kind !== "ok") return false;
      try {
        const token = requireEnv("SANITY_API_WRITE_TOKEN");
        const url = `https://${config.projectId}.api.sanity.io/v${SANITY_API_VERSION}/data/query/${dataset}?query=*[0]`;
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        return response.ok;
      } catch {
        return false;
      }
    },
    datasetWritable: async (dataset) => {
      if (config.kind !== "ok") return false;
      try {
        const token = requireEnv("SANITY_API_WRITE_TOKEN");
        const url = `https://${config.projectId}.api.sanity.io/v${SANITY_API_VERSION}/data/mutate/${dataset}?dryRun=true`;
        const response = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({
            mutations: [{ createOrReplace: { _id: "migration.preflight.probe", _type: "migrationPreflightProbe" } }],
          }),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}

export async function runSanityPreflight(opts: {
  projectPath: string;
  checks?: SanityPreflightChecks;
}): Promise<string[]> {
  const config = await resolveSanityConfig(opts.projectPath);
  const dataset = datasetOf(config);
  const checks = opts.checks ?? defaultChecks(config);
  const problems: string[] = [];

  if (!(await checks.hasPnpm())) {
    problems.push("pnpm is not on PATH — the deliverable is a pnpm workspace");
  }
  if (checks.token() === undefined) {
    problems.push("SANITY_API_WRITE_TOKEN is not set — required to seed content and check the dataset");
  }
  if (!(await checks.datasetReachable(dataset))) {
    problems.push(`dataset "${dataset}" is not reachable — ${unreachableReason(config)}`);
  } else if (!(await checks.datasetWritable(dataset))) {
    problems.push(
      `dataset "${dataset}" is reachable but SANITY_API_WRITE_TOKEN cannot write to it — the seed `
        + "gate needs a token with Editor (or higher) permissions on this dataset",
    );
  }

  return problems;
}
