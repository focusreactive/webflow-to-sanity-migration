import { GATE_NAMES } from "#generate/constants/ids.ts";
import { gateCommands } from "#generate/steps/gate/utils/execute-gate.ts";

describe("gateCommands", () => {
  it("runs every gate through pnpm, never through bun or turbo", () => {
    for (const gate of GATE_NAMES) {
      for (const command of gateCommands(gate)) {
        expect(command[0]).not.toBe("bun");
        expect(command).not.toContain("turbo");
      }
    }
  });

  it("installs, then runs each remaining gate as its own pnpm script", () => {
    expect(gateCommands("install")).toEqual([["install", "--ignore-workspace"]]);
    expect(gateCommands("typecheck")).toEqual([["run", "typecheck"]]);
    expect(gateCommands("build")).toEqual([["run", "build"]]);
    expect(gateCommands("lint")).toEqual([["run", "lint"]]);
  });
});
