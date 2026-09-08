export interface PresentationCollectionEntry {
  documentType: string;
  slugField: string;
  routePattern: string;
}

function staticPrefix(routePattern: string): string {
  const segments = routePattern
    .replace(/^\/+/, "")
    .split("/")
    .filter((segment) => segment !== "" && !segment.startsWith(":"));
  return segments.length > 0 ? `/${segments.join("/")}` : "";
}

function collectionLocation(entry: PresentationCollectionEntry): string {
  const prefix = staticPrefix(entry.routePattern);
  return `    ${JSON.stringify(entry.documentType)}: defineLocations({
      select: { title: "title", slug: "${entry.slugField}.current" },
      resolve: (doc) => ({
        locations: [{ title: doc?.title ?? "Untitled", href: \`${prefix}/\${doc?.slug ?? ""}\` }],
      }),
    }),`;
}

export function emitPresentationResolve(entries: readonly PresentationCollectionEntry[]): string {
  const collectionLocations = entries.map(collectionLocation).join("\n");
  return `import { defineLocations, type PresentationPluginOptions } from "sanity/presentation";

import { routablePaths, type PageTreeNode } from "./page-tree";

const PAGE_TREE_QUERY = \`*[_type == "page"]{ _id, slug, "parentId": parent._ref, isContainer }\`;

async function resolvePageHref(
  getClient: (options: { apiVersion: string }) => { fetch: <T>(query: string) => Promise<T> },
  id: string | undefined,
): Promise<string> {
  if (id === undefined) return "/";
  const client = getClient({ apiVersion: "2024-01-01" });
  const nodes = await client.fetch<PageTreeNode[]>(PAGE_TREE_QUERY);
  const routable = routablePaths(nodes);
  for (const [path, nodeId] of routable) {
    if (nodeId === id) return path === "" ? "/" : \`/\${path}\`;
  }
  return "/";
}

export const resolve: PresentationPluginOptions["resolve"] = {
  locations: {
    page: defineLocations({
      select: { title: "title", slug: "slug.current" },
      resolve: async (doc, { getClient }) => {
        const href = await resolvePageHref(getClient, doc?._id);
        return { locations: [{ title: doc?.title ?? "Untitled", href }] };
      },
    }),
${collectionLocations}
  },
};
`;
}
