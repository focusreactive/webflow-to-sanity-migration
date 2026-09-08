import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { syntheticAssetRef } from "#generate/steps/scaffold/input-value.ts";
import { startHarness, type HarnessServer } from "#harness/index.ts";
import { urlFor } from "#harness/image-stub.ts";

const PROJECT = join(import.meta.dirname, "../../../fixtures/harness-project");
const SHA = "a4bcd7b80c65e14e3809783fc4c587ce66a995dcc142e25bf61c9337ef6f3443";

const imageValue = (sha: string): unknown => ({
  _type: "image",
  asset: { _type: "reference", _ref: syntheticAssetRef({ sha, ext: "png" }) },
});

let harness: HarnessServer;

beforeAll(async () => {
  harness = await startHarness(PROJECT);
});

afterAll(async () => {
  await harness.close();
});

describe("harness asset route", () => {
  it("serves the snapshot bytes at the url the image stub builds from a synthetic ref", async () => {
    const response = await fetch(`${harness.origin}${urlFor(imageValue(SHA)).url()}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect((await response.bytes()).length).toBeGreaterThan(0);
  });

  it("404s a ref whose sha is not in the media artifact rather than falling back to the spa", async () => {
    const response = await fetch(`${harness.origin}${urlFor(imageValue("f".repeat(64))).url()}`);

    expect(response.status).toBe(404);
  });
});
