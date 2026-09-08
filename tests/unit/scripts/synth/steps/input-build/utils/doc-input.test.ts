import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CollectionId } from "#ir/common.ts";
import { synthEntryDir } from "#lib/synth-store/paths.ts";
import { buildDocIndex, docResolver } from "#synth/steps/input-build/utils/doc-input.ts";

import { synthProject } from "../../../fixtures/synth.ts";

const teamKey = "team-key" as CollectionId;
const postKey = "post-key" as CollectionId;

async function writeContent(projectPath: string, collectionKey: string, items: Record<string, unknown>[]) {
  const dir = synthEntryDir(projectPath, "collections", collectionKey);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "content.json"), JSON.stringify({ items }), "utf8");
}

describe("buildDocIndex / docResolver", () => {
  it("indexes only the collections a reference/multiReference field names", async () => {
    const root = await synthProject("doc-input");
    await writeContent(root, teamKey, [{ id: "wilson-tomales", _provenance: "ai", name: "Wilson Tomales" }]);
    await writeContent(root, postKey, [{ id: "post-a", _provenance: "ai", title: "Post A" }]);

    const index = await buildDocIndex(root, [
      { type: { type: "reference", collectionKey: teamKey } },
      { type: { type: "text" } },
    ]);

    expect(index.has(teamKey)).toBe(true);
    expect(index.has(postKey)).toBe(false);
    expect(docResolver(index)(teamKey, "wilson-tomales")).toEqual({
      id: "wilson-tomales",
      _provenance: "ai",
      name: "Wilson Tomales",
    });
  });

  it("indexes a collection referenced from inside an array of groups", async () => {
    const root = await synthProject("doc-input");
    await writeContent(root, postKey, [{ id: "post-a", _provenance: "ai", title: "Post A" }]);

    const index = await buildDocIndex(root, [
      {
        type: {
          type: "array",
          element: {
            type: "group",
            fields: [{ name: "post", type: { type: "reference", collectionKey: postKey }, required: true }],
          },
        },
      },
    ]);

    expect(index.has(postKey)).toBe(true);
  });

  it("throws a descriptive error, not a raw ENOENT, when the referenced collection has no content.json yet", async () => {
    const root = await synthProject("doc-input");
    const missingKey = "unstarted-collection" as CollectionId;

    await expect(buildDocIndex(root, [{ type: { type: "reference", collectionKey: missingKey } }])).rejects.toThrow(
      new RegExp(`reference points at collection "${missingKey}".*--content-accept --collection ${missingKey}`),
    );
  });

  it("names the id and the collection when a reference points at a document that is not there", async () => {
    const root = await synthProject("doc-input");
    await writeContent(root, postKey, [{ id: "post-a", _provenance: "ai" }]);

    const index = await buildDocIndex(root, [{ type: { type: "reference", collectionKey: postKey } }]);

    expect(() => docResolver(index)(postKey, "missing-slug")).toThrow(
      `reference points at unknown id "missing-slug" in collection "${postKey}" `
        + `— not found in collections/${postKey}/content.json`,
    );
  });

  it("holds the collection's documents for the lifetime of one index, so a later on-disk change is not seen", async () => {
    const root = await synthProject("doc-input");
    await writeContent(root, postKey, [{ id: "post-a", _provenance: "ai", title: "Original" }]);

    const index = await buildDocIndex(root, [{ type: { type: "reference", collectionKey: postKey } }]);
    await writeContent(root, postKey, [{ id: "post-a", _provenance: "ai", title: "Changed" }]);

    expect(docResolver(index)(postKey, "post-a")["title"]).toBe("Original");
  });
});
