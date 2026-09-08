import { GATE_NAMES } from "#generate/constants/ids.ts";
import { gateCommands, parseEnvFile, tail, timeoutFallbackFile } from "#generate/steps/gate/utils/execute-gate.ts";

describe("gateCommands", () => {
  it("runs every gate through pnpm, never through bun or npx", () => {
    for (const gate of GATE_NAMES) {
      for (const command of gateCommands(gate)) {
        expect(command[0]).not.toBe("bun");
        expect(command[0]).not.toBe("npx");
        expect(command[0]).not.toBe("pnpm");
      }
    }
  });

  it("installs the whole workspace, never a single package", () => {
    expect(gateCommands("install")).toEqual([["install"]]);
    expect(gateCommands("install").flat()).not.toContain("--ignore-workspace");
  });

  it("generates types and seeds from the studio package, which owns sanity.config.ts", () => {
    expect(gateCommands("types")).toEqual([["--filter", "studio", "run", "typegen"]]);
    expect(gateCommands("seed")).toEqual([["--filter", "studio", "run", "seed"]]);
  });

  it("formats once at the workspace root", () => {
    expect(gateCommands("format")).toEqual([["run", "format"]]);
  });

  it("fans typecheck, build and lint out to both workspaces through turbo", () => {
    expect(gateCommands("typecheck")).toEqual([["run", "turbo", "run", "typecheck"]]);
    expect(gateCommands("build")).toEqual([["run", "turbo", "run", "build"]]);
    expect(gateCommands("lint")).toEqual([["run", "turbo", "run", "lint"]]);
  });

  it("gives every gate at least one command", () => {
    for (const gate of GATE_NAMES) {
      expect(gateCommands(gate).length, `gate "${gate}" has no command`).toBeGreaterThan(0);
    }
  });
});

describe("timeoutFallbackFile", () => {
  it("accepts a timed-out types gate that already wrote web/sanity.types.ts", () => {
    expect(timeoutFallbackFile("types")).toBe("web/sanity.types.ts");
  });

  it("has no fallback for any other gate", () => {
    for (const gate of GATE_NAMES.filter((name) => name !== "types")) {
      expect(timeoutFallbackFile(gate)).toBeUndefined();
    }
  });
});

describe("parseEnvFile", () => {
  it("reads assignments and skips blanks and comments", () => {
    expect(parseEnvFile("# a comment\n\nA=1\nB=two=three\n=broken\n")).toEqual({ A: "1", B: "two=three" });
  });
});

describe("tail", () => {
  it("keeps only the last lines", () => {
    expect(tail("1\n2\n3\n4", 2)).toBe("3\n4");
  });
});
