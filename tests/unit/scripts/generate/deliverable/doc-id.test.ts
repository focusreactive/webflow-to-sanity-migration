import { assertNoIdCollisions, documentId } from "#generate/deliverable/seed/doc-id.ts";

describe("documentId", () => {
  it("builds a readable deterministic id", () => {
    expect(documentId("post", "hello-world")).toBe("post.hello-world");
  });

  it("is stable for the same type and slug", () => {
    expect(documentId("post", "hello-world")).toBe(documentId("post", "hello-world"));
  });

  it("differs across types for the same slug", () => {
    expect(documentId("post", "about")).not.toBe(documentId("page", "about"));
  });

  it("replaces path separators, which sanity ids do not allow", () => {
    expect(documentId("page", "solutions/devops")).toBe("page.solutions-devops");
  });

  it("collapses repeated invalid runs and trims the edges", () => {
    expect(documentId("page", "  a///b   c  ")).toBe("page.a-b-c");
  });

  it("sanitizes the type half too, not just the slug", () => {
    expect(documentId("blog post", "hello")).toBe("blog-post.hello");
    expect(documentId("Feature/Grid", "hello")).toBe("Feature-Grid.hello");
  });

  it("falls back to a hash when slugification leaves nothing", () => {
    expect(documentId("post", "———")).toMatch(/^post\.[0-9a-f]{8}$/);
    expect(documentId("post", "———")).toBe(documentId("post", "———"));
  });

  it("does not fold case or underscores the way the upstream slugifyId does", () => {
    const normalized = documentId("post", "about-us");
    const rawText = documentId("post", "About_Us");
    expect(normalized).toBe("post.about-us");
    expect(rawText).not.toBe(normalized);
  });

  it("truncates an id past sanity's 128-character cap, deterministically", () => {
    const longSlug = "solutions/".repeat(20) + "devops";
    const id = documentId("page", longSlug);
    expect(id.length).toBeLessThanOrEqual(128);
    expect(id).toBe(documentId("page", longSlug));
    expect(id.startsWith("page.")).toBe(true);
    expect(id).toMatch(/-[0-9a-f]{8}$/);
  });
});

describe("assertNoIdCollisions", () => {
  it("throws naming both documents when two share an id", () => {
    const id = documentId("post", "dup");
    expect(() =>
      assertNoIdCollisions([
        { id, type: "post", slug: "dup" },
        { id, type: "page", slug: "dup." },
      ]),
    ).toThrow(/post\.dup is claimed by two documents: post\/dup and page\/dup\./);
  });

  it("throws on two documents whose distinct slugs sanitize to the same id", () => {
    expect(() =>
      assertNoIdCollisions([
        { id: documentId("page", "a/b"), type: "page", slug: "a/b" },
        { id: documentId("page", "a b"), type: "page", slug: "a b" },
      ]),
    ).toThrow(/page\.a-b/);
  });

  it("accepts a set with no duplicates", () => {
    expect(() =>
      assertNoIdCollisions([
        { id: documentId("post", "a"), type: "post", slug: "a" },
        { id: documentId("post", "b"), type: "post", slug: "b" },
        { id: documentId("page", "a"), type: "page", slug: "a" },
      ]),
    ).not.toThrow();
  });

  it("accepts an empty set", () => {
    expect(() => assertNoIdCollisions([])).not.toThrow();
  });
});
