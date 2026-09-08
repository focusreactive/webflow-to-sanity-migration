import { GATE_NAMES } from "#generate/constants/ids.ts";
import { createOverlayDraft } from "#generate/steps/scaffold/overlay.ts";
import { scaffoldRoot } from "#generate/steps/scaffold/root.ts";

interface RootPackageJson {
  name: string;
  workspaces: string[];
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
}

interface TurboJson {
  tasks: Record<string, unknown>;
}

async function emitRoot(projectPath = "/tmp/nova-x-site"): Promise<Map<string, string | Buffer>> {
  const { draft, emitted } = createOverlayDraft();
  await scaffoldRoot({ projectPath, draft, warn: () => undefined });
  return emitted;
}

function readJson<T>(emitted: ReadonlyMap<string, string | Buffer>, path: string): T {
  const content = emitted.get(path);
  expect(typeof content).toBe("string");
  return JSON.parse(String(content)) as T;
}

describe("scaffoldRoot", () => {
  it("names the root package after the project directory", async () => {
    const pkg = readJson<RootPackageJson>(await emitRoot(), "package.json");
    expect(pkg.name).toBe("nova-x-site");
  });

  it("declares a two-workspace pnpm workspace of studio and web", async () => {
    const emitted = await emitRoot();
    const pkg = readJson<RootPackageJson>(emitted, "package.json");

    expect(pkg.workspaces).toEqual(["studio", "web"]);
    expect(emitted.get("pnpm-workspace.yaml")).toBe("packages:\n  - studio\n  - web\n");
  });

  it("gives every gate but install a root script to run", async () => {
    const pkg = readJson<RootPackageJson>(await emitRoot(), "package.json");

    for (const gate of GATE_NAMES.filter((name) => name !== "install")) {
      expect(pkg.scripts[gate], `root package.json has no "${gate}" script`).toBeTruthy();
    }
    expect(pkg.scripts["format"]).toBe("prettier --write .");
  });

  it("fans typecheck, build and lint out through turbo", async () => {
    const emitted = await emitRoot();
    const pkg = readJson<RootPackageJson>(emitted, "package.json");
    const turbo = readJson<TurboJson>(emitted, "turbo.json");

    for (const task of ["typecheck", "build", "lint"]) {
      expect(pkg.scripts[task]).toBe(`turbo run ${task}`);
      expect(Object.keys(turbo.tasks)).toContain(task);
    }
    expect(Object.keys(turbo.tasks)).toContain("dev");
  });

  it("ignores the env files, the build output and the migration working dirs", async () => {
    const gitignore = String((await emitRoot()).get(".gitignore"));

    for (const line of [
      "node_modules/",
      "web/.next/",
      "studio/dist/",
      "studio/schema.json",
      "web/.env.local",
      "studio/.env",
      ".migration/snapshot/",
    ]) {
      expect(gitignore.split("\n")).toContain(line);
    }
  });

  it("keeps the run config out of the ignore list so it travels into the repository", async () => {
    const gitignore = String((await emitRoot()).get(".gitignore"));

    expect(gitignore).not.toContain(".migration/run-config.json");
    expect(gitignore.split("\n")).not.toContain(".migration/");
  });
});
