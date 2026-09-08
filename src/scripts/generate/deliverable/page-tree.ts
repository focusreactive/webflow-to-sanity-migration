export interface PageTreeNode {
  _id: string;
  slug: { current?: string } | null;
  parentId: string | null;
  isContainer: boolean | null;
}

const HOME_PATH = "home";

export function resolvePaths(nodes: readonly PageTreeNode[]): Map<string, string> {
  const byId = new Map(nodes.map((node) => [node._id, node]));
  const paths = new Map<string, string>();

  function resolve(id: string, seen: Set<string>): string | undefined {
    const cached = paths.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return undefined;
    seen.add(id);

    const node = byId.get(id);
    if (node === undefined) return undefined;
    const ownSlug = node.slug?.current ?? "";

    if (node.parentId === null) {
      paths.set(id, ownSlug);
      return ownSlug;
    }

    const parentPath = resolve(node.parentId, seen);
    if (parentPath === undefined) return undefined;

    const path = [parentPath, ownSlug].filter((segment) => segment !== "").join("/");
    paths.set(id, path);
    return path;
  }

  for (const node of nodes) resolve(node._id, new Set());
  return paths;
}

export function routablePaths(nodes: readonly PageTreeNode[]): Map<string, string> {
  const byId = new Map(nodes.map((node) => [node._id, node]));
  const paths = resolvePaths(nodes);

  const routable = new Map<string, string>();
  for (const [id, path] of paths) {
    const node = byId.get(id);
    if (node === undefined || node.isContainer === true) continue;
    if (path === "") continue;
    routable.set(path === HOME_PATH && node.parentId === null ? "" : path, id);
  }
  return routable;
}
