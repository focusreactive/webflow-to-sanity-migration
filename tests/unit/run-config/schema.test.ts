import { describe, expect, it } from "vitest";

import { runConfigSchema } from "#run-config/schema.ts";

describe("runConfigSchema", () => {
  it("carries exactly the four fields a public run needs", () => {
    const parsed = runConfigSchema.parse({
      sourceUrl: "https://example.com/",
      projectName: "example-com",
      workspacePath: "../migrations",
      target: { projectId: "abc123" },
    });

    expect(Object.keys(parsed).sort()).toEqual(["projectName", "sourceUrl", "target", "workspacePath"]);
  });

  it("rejects the flags the public tool dropped", () => {
    for (const extra of [
      { localOnly: true },
      { headless: true },
      { includeRoutes: ["/"] },
      { forceAdapter: "webflow" },
    ]) {
      expect(() =>
        runConfigSchema.parse({
          sourceUrl: "https://example.com/",
          projectName: "example-com",
          workspacePath: "../migrations",
          target: { projectId: "abc123" },
          ...extra,
        }),
      ).toThrow();
    }
  });

  it("defaults the dataset to production", () => {
    const parsed = runConfigSchema.parse({
      sourceUrl: "https://example.com/",
      projectName: "example-com",
      workspacePath: "../migrations",
      target: { projectId: "abc123" },
    });
    expect(parsed.target.dataset).toBe("production");
  });

  it("rejects a run config with no target", () => {
    expect(() =>
      runConfigSchema.parse({
        sourceUrl: "https://example.com/",
        projectName: "example-com",
        workspacePath: "../migrations",
      }),
    ).toThrow();
  });
});
