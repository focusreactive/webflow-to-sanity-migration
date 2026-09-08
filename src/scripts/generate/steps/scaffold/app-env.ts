import { existsSync } from "node:fs";
import { join } from "node:path";

import { writeFileAtomic } from "#lib/fs.ts";

const DEV_PREVIEW_ORIGIN = "http://localhost:3000";

export interface SanityEnvTarget {
  projectId: string;
  dataset: string;
  apiVersion: string;
}

async function writeIfAbsent(path: string, content: string): Promise<void> {
  if (existsSync(path)) return;
  await writeFileAtomic(path, content);
}

export async function writeSanityEnv(opts: { projectPath: string; target: SanityEnvTarget }): Promise<void> {
  const { projectPath, target } = opts;

  await writeIfAbsent(
    join(projectPath, "studio/.env"),
    [
      `SANITY_STUDIO_PROJECT_ID=${target.projectId}`,
      `SANITY_STUDIO_DATASET=${target.dataset}`,
      `SANITY_STUDIO_API_VERSION=${target.apiVersion}`,
      `SANITY_STUDIO_PREVIEW_ORIGIN=${DEV_PREVIEW_ORIGIN}`,
      "",
    ].join("\n"),
  );

  await writeIfAbsent(
    join(projectPath, "web/.env.local"),
    [
      `NEXT_PUBLIC_SANITY_PROJECT_ID=${target.projectId}`,
      `NEXT_PUBLIC_SANITY_DATASET=${target.dataset}`,
      `NEXT_PUBLIC_SANITY_API_VERSION=${target.apiVersion}`,
      "",
    ].join("\n"),
  );
}
