import {
  buildDocumentTypeMap,
  RESERVED_DOCUMENT_TYPES,
} from "#generate/steps/scaffold/document-type.ts";

describe("RESERVED_DOCUMENT_TYPES", () => {
  it("covers this target's own emitted types and sanity's built-in asset types", () => {
    expect([...RESERVED_DOCUMENT_TYPES].sort()).toEqual(
      [
        "footer",
        "header",
        "media",
        "page",
        "pageBuilder",
        "portableText",
        "sanity.fileAsset",
        "sanity.imageAsset",
      ].sort(),
    );
  });
});

describe("buildDocumentTypeMap", () => {
  it("camel-cases a collection key into its document type", () => {
    const assignment = buildDocumentTypeMap([{ key: "blog-posts" }]);
    expect(assignment.map.get("blog-posts")).toBe("blogPosts");
    expect(assignment.warnings).toEqual([]);
  });

  it("never assigns a reserved sanity document type to a collection", () => {
    for (const reserved of RESERVED_DOCUMENT_TYPES) {
      const assignment = buildDocumentTypeMap([{ key: reserved }]);
      expect([...assignment.map.values()]).not.toContain(reserved);
    }
  });

  it("renames a reserved collision with a numeric suffix and warns about it", () => {
    const assignment = buildDocumentTypeMap([{ key: "page" }]);
    expect(assignment.map.get("page")).toBe("page2");
    expect(assignment.warnings).toEqual([
      'collection "page": document type "page" collides with a reserved Sanity type; renamed to "page2"',
    ]);
  });

  it("distinguishes a collision with another migrated collection in its warning", () => {
    const assignment = buildDocumentTypeMap([{ key: "blog-post" }, { key: "blogPost" }]);
    expect(assignment.map.get("blog-post")).toBe("blogPost");
    expect(assignment.map.get("blogPost")).toBe("blogPost2");
    expect(assignment.warnings).toEqual([
      'collection "blogPost": document type "blogPost" collides with another migrated collection; renamed to "blogPost2"',
    ]);
  });

  it("walks the suffix chain until it finds a free type name", () => {
    const assignment = buildDocumentTypeMap([{ key: "blog-post" }, { key: "blogPost" }, { key: "blog_post" }]);
    expect([...assignment.map.values()]).toEqual(["blogPost", "blogPost2", "blogPost3"]);
    expect(assignment.warnings).toHaveLength(2);
  });

  it("leaves keys that do not collide untouched", () => {
    const assignment = buildDocumentTypeMap([{ key: "post" }, { key: "posts" }]);
    expect([...assignment.map.values()]).toEqual(["post", "posts"]);
    expect(assignment.warnings).toEqual([]);
  });

  it("keeps only the last assignment when the same key appears twice", () => {
    const assignment = buildDocumentTypeMap([{ key: "post" }, { key: "post" }]);
    expect(assignment.map.size).toBe(1);
    expect(assignment.map.get("post")).toBe("post2");
    expect(assignment.warnings).toEqual([
      'collection "post": document type "post" collides with another migrated collection; renamed to "post2"',
    ]);
  });

  it("returns an empty map and no warnings for no collections", () => {
    const assignment = buildDocumentTypeMap([]);
    expect(assignment.map.size).toBe(0);
    expect(assignment.warnings).toEqual([]);
  });
});
