import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { executeGate } from "#generate/steps/gate/execute-gate.ts";
import { gateCommands, type ExecFn, type ExecResult } from "#generate/steps/gate/utils/execute-gate.ts";

async function project(): Promise<string> {
  return mkdtemp(join(tmpdir(), "execute-gate-"));
}

interface Recorded {
  args: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  timeoutMs: number;
}

function recordingExec(result: Partial<ExecResult> = {}): { exec: ExecFn; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const exec: ExecFn = (args, opts) => {
    calls.push({ args, cwd: opts.cwd, env: opts.env, timeoutMs: opts.timeoutMs });
    return Promise.resolve({ code: 0, output: "", ...result });
  };
  return { exec, calls };
}

describe("executeGate", () => {
  it("runs the gate's commands from the project root under the gate's timeout", async () => {
    const projectPath = await project();
    const { exec, calls } = recordingExec();

    const outcome = await executeGate({ projectPath, gate: "typecheck", exec });

    expect(outcome).toEqual({});
    expect(calls.map((call) => call.args)).toEqual(gateCommands("typecheck"));
    expect(calls[0]?.cwd).toBe(projectPath);
    expect(calls[0]?.timeoutMs).toBeGreaterThan(0);
  });

  it("merges the project's .env into the spawned environment", async () => {
    const projectPath = await project();
    await writeFile(join(projectPath, ".env"), "SANITY_STUDIO_DATASET=staging\n");
    const { exec, calls } = recordingExec();

    await executeGate({ projectPath, gate: "build", exec });

    expect(calls[0]?.env["SANITY_STUDIO_DATASET"]).toBe("staging");
  });

  it("fails the gate, quoting the command and its output, on a nonzero exit", async () => {
    const projectPath = await project();
    const { exec } = recordingExec({ code: 1, output: "TS2339: nope" });

    await expect(executeGate({ projectPath, gate: "build", exec })).rejects.toThrow(/gate build.*exited 1/s);
    await expect(executeGate({ projectPath, gate: "build", exec })).rejects.toThrow(/TS2339: nope/);
  });

  it("records lint's output as findings instead of failing the run", async () => {
    const projectPath = await project();
    const { exec } = recordingExec({ code: 1, output: "3 problems" });

    const outcome = await executeGate({ projectPath, gate: "lint", exec });

    expect(outcome.findings).toContain("3 problems");
  });

  it("fails a timed-out types gate when its fallback file is absent", async () => {
    const projectPath = await project();
    const { exec } = recordingExec({ code: null, output: "", timedOut: true });

    await expect(executeGate({ projectPath, gate: "types", exec })).rejects.toThrow(/timed out/);
  });

  it("accepts a timed-out types gate once web/sanity.types.ts exists", async () => {
    const projectPath = await project();
    await mkdir(join(projectPath, "web"), { recursive: true });
    await writeFile(join(projectPath, "web/sanity.types.ts"), "export type Placeholder = never;\n");
    const { exec } = recordingExec({ code: null, output: "", timedOut: true });

    const outcome = await executeGate({ projectPath, gate: "types", exec });

    expect(outcome.note).toContain("web/sanity.types.ts");
    expect(outcome.note).toContain("timed out");
  });
});
