import { CliUsageError, parseServiceArgs } from "#lib/cli/index.ts";

import { runGate } from "./steps/index.ts";
import { parseGateName } from "./utils/parse-gate-name.ts";

async function main(): Promise<void> {
  const args = parseServiceArgs(process.argv.slice(2), {
    extraFlags: {
      gate: { type: "string" },
    },
  });

  if (typeof args["gate"] === "string") {
    return runGate({ projectPath: args.projectPath, gate: parseGateName(args["gate"]), force: args.force });
  }

  throw new CliUsageError("--gate <name> is required");
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  process.stderr.write(`${message}\n`);
  process.exit(error instanceof CliUsageError ? error.exitCode : 1);
}
