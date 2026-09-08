import { type PageTreeNode, resolvePaths, routablePaths } from "#generate/deliverable/page-tree.ts";

const TREE: readonly PageTreeNode[] = [
  { _id: "root", slug: { current: "work" }, parentId: null, isContainer: true },
  { _id: "child", slug: { current: "atlas" }, parentId: "root", isContainer: false },
];

const SITE: readonly PageTreeNode[] = [
  { _id: "page.home", slug: { current: "home" }, parentId: null, isContainer: false },
  { _id: "page.solutions", slug: { current: "solutions" }, parentId: null, isContainer: true },
  { _id: "page.devops", slug: { current: "devops" }, parentId: "page.solutions", isContainer: false },
];

describe("resolvePaths", () => {
  it("nests a child path under its parent, with no leading slash", () => {
    expect(resolvePaths(TREE).get("child")).toBe("work/atlas");
  });

  it("resolves a root node's path to its own slug", () => {
    expect(resolvePaths(SITE).get("page.home")).toBe("home");
  });

  it("resolves a container's own path too", () => {
    expect(resolvePaths(SITE).get("page.solutions")).toBe("solutions");
  });

  it("resolves a slugless node to the empty path", () => {
    const paths = resolvePaths([{ _id: "blank", slug: null, parentId: null, isContainer: null }]);
    expect(paths.get("blank")).toBe("");
  });

  it("skips an empty segment rather than emitting a doubled slash", () => {
    const paths = resolvePaths([
      { _id: "root", slug: {}, parentId: null, isContainer: true },
      { _id: "child", slug: { current: "atlas" }, parentId: "root", isContainer: false },
    ]);
    expect(paths.get("child")).toBe("atlas");
  });

  it("drops a node whose parent chain is broken instead of resolving a partial path", () => {
    expect(resolvePaths([{ _id: "a", slug: { current: "a" }, parentId: "missing", isContainer: false }]).size).toBe(0);
  });

  it("drops every node in a cyclic parent chain instead of looping forever", () => {
    const paths = resolvePaths([
      { _id: "a", slug: { current: "a" }, parentId: "b", isContainer: false },
      { _id: "b", slug: { current: "b" }, parentId: "a", isContainer: false },
    ]);
    expect(paths.size).toBe(0);
  });
});

describe("routablePaths", () => {
  it("keys on the resolved path and omits a container that only nests its children", () => {
    const routable = routablePaths(TREE);
    expect([...routable.keys()]).toEqual(["work/atlas"]);
    expect(routable.get("work/atlas")).toBe("child");
  });

  it("maps each routable path to the node id that renders it", () => {
    const routable = routablePaths(SITE);
    expect([...routable.keys()].sort()).toEqual(["", "solutions/devops"]);
    expect(routable.get("solutions/devops")).toBe("page.devops");
  });

  it("resolves the site root to the home document rather than keying it at its own slug", () => {
    const routable = routablePaths(SITE);
    expect(routable.get("")).toBe("page.home");
    expect(routable.has("home")).toBe(false);
  });

  it("keeps a nested page whose own slug is home at its full path", () => {
    const routable = routablePaths([
      { _id: "page.root", slug: { current: "home" }, parentId: null, isContainer: false },
      { _id: "page.docs", slug: { current: "docs" }, parentId: null, isContainer: true },
      { _id: "page.docs.home", slug: { current: "home" }, parentId: "page.docs", isContainer: false },
    ]);
    expect(routable.get("docs/home")).toBe("page.docs.home");
    expect(routable.get("")).toBe("page.root");
  });

  it("does not let a slugless root node claim the site root", () => {
    const routable = routablePaths([
      { _id: "page.home", slug: { current: "home" }, parentId: null, isContainer: false },
      { _id: "page.blank", slug: {}, parentId: null, isContainer: false },
    ]);
    expect(routable.get("")).toBe("page.home");
    expect([...routable.values()]).not.toContain("page.blank");
  });

  it("drops a slugless root node even when there is no home document at all", () => {
    expect(routablePaths([{ _id: "page.blank", slug: null, parentId: null, isContainer: false }]).size).toBe(0);
  });

  it("treats a null isContainer as a routable page", () => {
    const routable = routablePaths([{ _id: "page.a", slug: { current: "a" }, parentId: null, isContainer: null }]);
    expect(routable.get("a")).toBe("page.a");
  });

  it("is the inverse of resolvePaths for every routable node", () => {
    const paths = resolvePaths(SITE);
    for (const [path, id] of routablePaths(SITE)) {
      if (path !== "") expect(paths.get(id)).toBe(path);
    }
  });
});
