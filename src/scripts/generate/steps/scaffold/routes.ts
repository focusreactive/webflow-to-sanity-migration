import { pascalCase } from "#blocks/codegen/names.ts";
import type { PageBinding, SectionBinding } from "#ir/collections.ts";

import { detailQueryConstName, slugsQueryConstName } from "./queries.ts";

export function emitCatchAllRoute(): string {
  return `import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RenderBlocks } from "@/components/render-blocks";
import { client } from "@/sanity/client";
import { sanityFetch } from "@/sanity/live";
import { routablePaths, type PageTreeNode } from "@/sanity/page-tree";
import { PAGE_BY_ID_QUERY, PAGE_TREE_QUERY } from "@/sanity/queries";

interface Args {
  params: Promise<{ slug?: string[] }>;
}

async function loadTreeLive(): Promise<PageTreeNode[]> {
  const { data } = await sanityFetch({ query: PAGE_TREE_QUERY });
  return data;
}

async function resolveNodeId(slug: string[] | undefined): Promise<string | undefined> {
  const tree = await loadTreeLive();
  const path = (slug ?? []).join("/");
  return routablePaths(tree).get(path);
}

async function loadPage(id: string) {
  const { data } = await sanityFetch({ query: PAGE_BY_ID_QUERY, params: { id } });
  return data;
}

export async function generateStaticParams(): Promise<{ slug: string[] }[]> {
  const tree: PageTreeNode[] = await client.fetch(PAGE_TREE_QUERY);
  return [...routablePaths(tree).keys()].map((path) => ({ slug: path === "" ? [] : path.split("/") }));
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug } = await params;
  const id = await resolveNodeId(slug);
  if (id === undefined) notFound();
  const page = await loadPage(id);
  if (!page) notFound();
  return {
    title: page.seo?.metaTitle,
    description: page.seo?.metaDescription,
  };
}

export default async function Page({ params }: Args) {
  const { slug } = await params;
  const id = await resolveNodeId(slug);
  if (id === undefined) notFound();
  const page = await loadPage(id);
  if (!page) notFound();
  return <RenderBlocks blocks={page.content ?? []} />;
}
`;
}

export interface DetailRouteEntry {
  key: string;
  template: readonly SectionBinding[];
  pageBinding: PageBinding;
}

export interface DetailRouteCtx {
  documentTypeFor: (collectionKey: string) => string;
}

function metaLine(varName: "doc", fieldName: string | undefined): string | undefined {
  return fieldName === undefined ? undefined : `${varName}?.[${JSON.stringify(fieldName)}]`;
}

export function emitDetailRoute(entry: DetailRouteEntry, ctx: DetailRouteCtx): string {
  const typeName = ctx.documentTypeFor(entry.key);
  const byslugConst = detailQueryConstName(typeName);
  const slugsConst = slugsQueryConstName(typeName);

  const imports = entry.template
    .map(
      (binding) =>
        `import ${pascalCase(binding.sectionId)} from "@/components/collections/${entry.key}/sections/${pascalCase(binding.sectionId)}";`,
    )
    .join("\n");

  const sections = entry.template
    .map(
      (binding) =>
        `      <${pascalCase(binding.sectionId)} {...(doc as unknown as PropsOf<typeof ${pascalCase(binding.sectionId)}>)} />`,
    )
    .join("\n");

  const titleLine = metaLine("doc", entry.pageBinding.meta.title);
  const descriptionLine = metaLine("doc", entry.pageBinding.meta.description);

  return `import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { client } from "@/sanity/client";
import { sanityFetch } from "@/sanity/live";
import { ${byslugConst}, ${slugsConst} } from "@/sanity/queries";

${imports}

type PropsOf<F> =
  F extends (...args: infer A) => unknown ?
    A extends [infer P, ...unknown[]] ?
      P
    : Record<string, never>
  : Record<string, never>;

interface Args {
  params: Promise<{ slug: string }>;
}

async function loadDoc(slug: string) {
  const { data } = await sanityFetch({ query: ${byslugConst}, params: { slug } });
  return data;
}

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const rows = await client.fetch(${slugsConst});
  const params: { slug: string }[] = [];
  for (const row of rows) if (typeof row.slug === "string") params.push({ slug: row.slug });
  return params;
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug } = await params;
  const doc = await loadDoc(slug);
  if (!doc) notFound();
  return {
    title: ${titleLine ?? "undefined"},
    description: ${descriptionLine ?? "undefined"},
  };
}

export default async function DetailPage({ params }: Args) {
  const { slug } = await params;
  const doc = await loadDoc(slug);
  if (!doc) notFound();

  return (
    <main>
${sections}
    </main>
  );
}
`;
}
