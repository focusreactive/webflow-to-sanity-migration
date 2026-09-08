import { spawn } from "node:child_process";

import { type GateName } from "../../../constants/ids.ts";

export function timeoutFallbackFile(): string | undefined {
  return undefined;
}

export function parseEnvFile(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

export function gateCommands(gate: GateName): string[][] {
  if (gate === "install") return [["install", "--ignore-workspace"]];
  return [["run", gate]];
}

export interface ExecResult {
  code: number | null;
  output: string;
  timedOut?: boolean;
}

export type ExecFn = (
  args: string[],
  opts: { cwd: string; env: Record<string, string | undefined>; timeoutMs: number },
) => Promise<ExecResult>;

export const defaultExec: ExecFn = (args, opts) =>
  new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, { cwd: opts.cwd, env: opts.env });
    let output = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output, timedOut });
    });
  });

export function tail(output: string, lines = 80): string {
  return output.split("\n").slice(-lines).join("\n");
}
