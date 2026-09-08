import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAssetHandler } from "#harness/asset-handler.ts";
import type { AssetFile } from "#synth/steps/input-build/utils/media-input.ts";

let origin = "";
let server: ReturnType<typeof createServer>;

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "asset-handler-"));
  const file = join(dir, "img.png");
  await writeFile(file, "PNGBYTES");

  const pathBySha = new Map<string, AssetFile>([
    ["abc123", { path: file, contentType: "image/png" }],
    ["notype", { path: file }],
    ["gone", { path: join(dir, "missing.png"), contentType: "image/png" }],
  ]);

  server = createServer(createAssetHandler(pathBySha));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${String(address.port)}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("createAssetHandler", () => {
  it("serves the snapshot bytes for a known sha with its content type", async () => {
    const response = await fetch(`${origin}/abc123.png`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(await response.text()).toBe("PNGBYTES");
  });

  it("ignores the extension and any query string when looking up the sha", async () => {
    expect((await fetch(`${origin}/abc123.jpg?w=100`)).status).toBe(200);
    expect((await fetch(`${origin}/abc123`)).status).toBe(200);
  });

  it("omits the content-type header when the record carries none", async () => {
    const response = await fetch(`${origin}/notype.png`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBeNull();
  });

  it("404s an unknown sha", async () => {
    expect((await fetch(`${origin}/unknown.png`)).status).toBe(404);
    expect((await fetch(`${origin}/`)).status).toBe(404);
  });

  it("404s a known sha whose file is gone rather than streaming a missing path", async () => {
    expect((await fetch(`${origin}/gone.png`)).status).toBe(404);
  });
});
