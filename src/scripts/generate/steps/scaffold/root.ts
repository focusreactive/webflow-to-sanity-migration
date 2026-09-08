import { basename } from "node:path";

import { APP_DIRS } from "../../constants/dirs.ts";
import type { ScaffoldCtx } from "../../types.ts";

const PRETTIER_VERSION = "^3.9.6";
const TURBO_VERSION = "^2.10.12";
const PACKAGE_MANAGER = "pnpm@10.34.4";

function rootPackageJson(projectName: string): string {
  const pkg = {
    name: projectName,
    private: true,
    version: "0.1.0",
    workspaces: [...APP_DIRS],
    packageManager: PACKAGE_MANAGER,
    scripts: {
      dev: "turbo run dev",
      build: "turbo run build",
      typecheck: "turbo run typecheck",
      lint: "turbo run lint",
      format: "prettier --write .",
      types: "pnpm --filter studio run typegen",
      seed: "pnpm --filter studio run seed",
      turbo: "turbo",
    },
    devDependencies: {
      prettier: PRETTIER_VERSION,
      turbo: TURBO_VERSION,
    },
  };
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

const PNPM_WORKSPACE_YAML = ["packages:", ...APP_DIRS.map((dir) => `  - ${dir}`), ""].join("\n");

function turboJson(): string {
  const turbo = {
    $schema: "https://turbo.build/schema.json",
    tasks: {
      build: { dependsOn: ["^build"], outputs: [".next/**", "dist/**", "!.next/cache/**"] },
      typecheck: { dependsOn: ["^typecheck"] },
      lint: {},
      dev: { cache: false, persistent: true },
    },
  };
  return `${JSON.stringify(turbo, null, 2)}\n`;
}

const GITIGNORE = [
  "# Dependencies",
  "node_modules/",
  "",
  "# Build output",
  "web/.next/",
  "studio/dist/",
  ".turbo/",
  "",
  "# Schema intermediate written by the `types` gate (web/sanity.types.ts is committed)",
  "studio/schema.json",
  "",
  "# Env files",
  "web/.env.local",
  "studio/.env",
  "",
  "# Migration working dirs",
  ".migration/snapshot/",
  ".migration/verification/",
  ".migration/logs/",
  ".migration/.env",
  "",
].join("\n");

export function scaffoldRoot(ctx: ScaffoldCtx): Promise<void> {
  const projectName = basename(ctx.projectPath);
  ctx.draft.emit("package.json", rootPackageJson(projectName));
  ctx.draft.emit("pnpm-workspace.yaml", PNPM_WORKSPACE_YAML);
  ctx.draft.emit("turbo.json", turboJson());
  ctx.draft.emit(".gitignore", GITIGNORE);
  return Promise.resolve();
}
