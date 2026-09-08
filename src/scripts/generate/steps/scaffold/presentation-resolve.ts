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

// "page" documents can be nested (see page-tree.ts / the parent/child chain built at build
// time), so the correct href for one generally depends on its ancestors — data this resolver
// cannot fetch, because it must stay synchronous and single-argument (see the note in
// collectionLocation below). This falls back to a flat, top-level href from the page's own
// slug; a nested page's "open in Presentation" location will point at the wrong URL until this
// is rebuilt on the async, documentStore-based top-level resolver form Sanity's Presentation
// tool supports for exactly this case.
export const resolve: PresentationPluginOptions["resolve"] = {
  locations: {
    page: defineLocations({
      select: { title: "title", slug: "slug.current" },
      resolve: (doc) => ({
        locations: [{ title: doc?.title ?? "Untitled", href: \`/\${doc?.slug ?? ""}\` }],
      }),
    }),
${collectionLocations}
  },
};
`;
}
