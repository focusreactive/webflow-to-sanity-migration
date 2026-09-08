import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  blockComponentName,
  componentDirName,
  duplicateNameWarnings,
  pascalCase,
  richTextWrapperFile,
  schemaTypeName,
} from "#blocks/codegen/names.ts";
import { emitProps } from "#blocks/codegen/props.ts";
import type { BlockType } from "#ir/blocks.ts";
import type { CollectionEntry } from "#ir/collections.ts";
import type { GlobalDef } from "#ir/globals.ts";
import { rewriteFontUrls } from "#lib/snapshot-store/fonts.ts";
import { synthRichTextImportPattern } from "#synth/utils/richtext/names.ts";
import type { DesignTokensData } from "#tokens/schemas/design-tokens.ts";

import { DELIVERABLE_SRC_DIR } from "../../constants/dirs.ts";
import { LOCALE_CODE } from "../../constants/locale.ts";
import { readTemplate } from "../../templates/read-template.ts";
import type { ScaffoldCtx } from "../../types.ts";

import { emitBlockRenderer } from "./block-registry.ts";
import { buildDocumentTypeMap } from "./document-type.ts";
import { emitLayout } from "./layout.ts";
import { emitQueries, type QueryBlock } from "./queries.ts";
import { emitCatchAllRoute, emitDetailRoute } from "./routes.ts";
import { titleFromSourceUrl } from "./studio.ts";
import { emitGlobalsCssFile } from "./theme.ts";
import { emitImageHelper } from "./url-for.ts";

export interface WebBlockEntry {
  block: BlockType;
  component: string;
  richText?: Readonly<Record<string, string>>;
}

export interface WebCollectionEntry {
  entry: CollectionEntry;
  routePattern?: string;
  sections: Readonly<Record<string, string>>;
  richText?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export interface WebGlobalEntry {
  global: GlobalDef;
  component: string;
  richText?: Readonly<Record<string, string>>;
}

export interface WebFonts {
  css: string;
  assets: ReadonlyMap<string, Buffer>;
}

export interface WebIr {
  blocks: readonly WebBlockEntry[];
  collections: readonly WebCollectionEntry[];
  globals: readonly WebGlobalEntry[];
  sourceUrl: string;
  apiVersion: string;
  tokens: DesignTokensData;
  fonts?: WebFonts;
}

type Emit = (relativePath: string, content: string | Buffer) => void;

function webPath(...segments: string[]): string {
  return ["web", ...segments].join("/");
}

const DIRECTIVE_PROLOGUE = /^\s*(["'])use (?:client|server)\1;?[ \t]*\r?\n?/;

function ensureJsxNamespaceImport(code: string): string {
  if (!/\bJSX\./.test(code)) return code;
  if (/import[^;]*\bJSX\b[^;]*from\s+["']react["']/.test(code)) return code;
  const jsxImport = `import type { JSX } from "react";\n`;
  const directive = DIRECTIVE_PROLOGUE.exec(code)?.[0];
  if (directive === undefined) return `${jsxImport}${code}`;
  return `${directive}${jsxImport}${code.slice(directive.length)}`;
}

function rewriteRichTextImportSpecifiers(code: string): string {
  return code.replace(synthRichTextImportPattern(), (_match, prefix: string, field: string, suffix: string) => {
    const fileName = richTextWrapperFile(field).replace(/\.tsx$/, "");
    return `${prefix}./${fileName}${suffix}`;
  });
}

function rewriteRelativeTsImports(code: string): string {
  const richTextRewritten = rewriteRichTextImportSpecifiers(code);
  const rewritten = richTextRewritten.replace(/(from\s+["'])(\.{1,2}\/[^"']*)\.tsx?(["'])/g, "$1$2$3");
  return ensureJsxNamespaceImport(rewritten);
}

function detailRoutePath(routePattern: string): string {
  const segments = routePattern
    .replace(/^\/+/, "")
    .split("/")
    .filter((segment) => segment !== "" && !segment.startsWith(":"));
  return webPath("src/app/(frontend)", ...segments, "[slug]", "page.tsx");
}

function scaffoldBlocks(emit: Emit, blocks: readonly WebBlockEntry[], warn: (message: string) => void): void {
  const labeled = blocks.map((entry) => ({
    label: `block id "${String(entry.block.id)}"`,
    name: blockComponentName(entry.block.id),
  }));
  for (const warning of duplicateNameWarnings(labeled, "component identifier")) warn(warning);

  emit(webPath("src/components/render-blocks.tsx"), emitBlockRenderer(blocks.map((entry) => entry.block.id)));

  for (const entry of blocks) {
    const id = String(entry.block.id);
    const dir = webPath("src/components/blocks", componentDirName(id));
    emit(`${dir}/index.tsx`, rewriteRelativeTsImports(entry.component));
    emit(
      `${dir}/props.ts`,
      emitProps({
        key: id,
        name: entry.block.name,
        fields: entry.block.fields,
        ...(entry.block.collectionKey !== undefined ? { collectionKey: String(entry.block.collectionKey) } : {}),
      }),
    );
    for (const [field, source] of Object.entries(entry.richText ?? {})) {
      emit(`${dir}/${richTextWrapperFile(field)}`, rewriteRelativeTsImports(source));
    }
  }
}

function scaffoldGlobals(emit: Emit, globals: readonly WebGlobalEntry[], warn: (message: string) => void): void {
  const labeled = globals.map((entry) => ({
    label: `chrome "${entry.global.name}"`,
    name: pascalCase(entry.global.name),
  }));
  for (const warning of duplicateNameWarnings(labeled, "chrome component identifier")) warn(warning);

  for (const entry of globals) {
    const name = entry.global.name;
    const dir = webPath("src/components/chrome", componentDirName(name));
    emit(`${dir}/index.tsx`, rewriteRelativeTsImports(entry.component));
    emit(`${dir}/props.ts`, emitProps({ key: name, name, fields: entry.global.fields }));
    for (const [field, source] of Object.entries(entry.richText ?? {})) {
      emit(`${dir}/${richTextWrapperFile(field)}`, rewriteRelativeTsImports(source));
    }
  }
}

function scaffoldCollections(
  emit: Emit,
  collections: readonly WebCollectionEntry[],
  documentTypeFor: (key: string) => string,
  warn: (message: string) => void,
): void {
  const seenRichText = new Map<string, string>();

  for (const webEntry of collections) {
    const key = String(webEntry.entry.key);

    if (webEntry.routePattern === undefined) {
      warn(`collection "${key}": no route pattern — no detail route generated`);
      continue;
    }
    if (webEntry.entry.template.length === 0) {
      warn(`collection "${key}": empty section template — no detail route generated`);
      continue;
    }

    const missing = webEntry.entry.template.find((binding) => webEntry.sections[binding.sectionId] === undefined);
    if (missing !== undefined) {
      warn(`collection "${key}": staged section "${missing.sectionId}" missing — no detail route generated`);
      continue;
    }

    for (const binding of webEntry.entry.template) {
      const source = webEntry.sections[binding.sectionId];
      if (source === undefined) continue;
      emit(
        webPath("src/components/collections", key, "sections", `${pascalCase(binding.sectionId)}.tsx`),
        rewriteRelativeTsImports(source),
      );
      for (const [field, wrapperSource] of Object.entries(webEntry.richText?.[binding.sectionId] ?? {})) {
        const relativePath = webPath("src/components/collections", key, "sections", richTextWrapperFile(field));
        const content = rewriteRelativeTsImports(wrapperSource);
        const previous = seenRichText.get(relativePath);
        if (previous !== undefined && previous !== content) {
          warn(
            `collection "${key}": section "${binding.sectionId}" overwrites ${relativePath} with a different `
              + `richText wrapper — another section in this collection already staged one for field "${field}"; `
              + "the last one wins",
          );
        }
        seenRichText.set(relativePath, content);
        emit(relativePath, content);
      }
    }

    emit(
      detailRoutePath(webEntry.routePattern),
      emitDetailRoute(
        { key, template: webEntry.entry.template, pageBinding: webEntry.entry.pageBinding },
        { documentTypeFor },
      ),
    );
  }
}

export async function scaffoldWeb(ctx: ScaffoldCtx, ir: WebIr): Promise<void> {
  const { emit } = ctx.draft;

  const { map: documentTypeMap, warnings: documentTypeWarnings } = buildDocumentTypeMap(
    ir.collections.map((entry) => entry.entry),
  );
  for (const warning of documentTypeWarnings) ctx.warn(warning);
  const documentTypeFor = (key: string): string => documentTypeMap.get(key) ?? schemaTypeName(key);

  emit(webPath("tsconfig.json"), await readTemplate("web/tsconfig.json.tpl"));
  emit(webPath("package.json"), await readTemplate("web/package.json.tpl"));
  emit(webPath("next.config.ts"), await readTemplate("web/next.config.ts.tpl"));
  emit(webPath("postcss.config.mjs"), await readTemplate("web/postcss.config.mjs.tpl"));
  emit(webPath("eslint.config.mjs"), await readTemplate("web/eslint.config.mjs.tpl"));
  emit(webPath("src/sanity/client.ts"), await readTemplate("web/client.ts.tpl", { API_VERSION: ir.apiVersion }));
  emit(webPath("src/sanity/live.ts"), await readTemplate("web/live.ts.tpl"));
  emit(webPath("src/sanity/image.ts"), emitImageHelper());
  emit(webPath("src/sanity/page-tree.ts"), await readFile(join(DELIVERABLE_SRC_DIR, "page-tree.ts"), "utf8"));
  emit(
    webPath("src/app/(frontend)/layout.tsx"),
    emitLayout({
      lang: LOCALE_CODE,
      siteTitle: titleFromSourceUrl(ir.sourceUrl),
      globals: ir.globals.map((entry) => ({ name: entry.global.name })),
    }),
  );
  emit(webPath("src/app/(frontend)/not-found.tsx"), await readTemplate("web/not-found.tsx.tpl"));
  emit(webPath("src/app/api/draft-mode/enable/route.ts"), await readTemplate("web/draft-mode-route.ts.tpl"));
  emit(webPath("src/app/(frontend)/globals.css"), emitGlobalsCssFile(ir.tokens));

  if (ir.fonts === undefined) {
    ctx.warn("fonts: no staged fonts.css — app ships without webfonts");
    emit(webPath("src/app/(frontend)/fonts.css"), "");
  } else {
    emit(webPath("src/app/(frontend)/fonts.css"), rewriteFontUrls(ir.fonts.css, "/fonts/"));
    for (const [file, bytes] of ir.fonts.assets) emit(webPath("public/fonts", file), bytes);
  }

  scaffoldBlocks(emit, ir.blocks, ctx.warn);
  scaffoldGlobals(emit, ir.globals, ctx.warn);

  const queryBlocks: QueryBlock[] = ir.blocks.map((entry) => ({
    id: String(entry.block.id),
    fields: entry.block.fields,
    content: entry.block.content,
  }));
  emit(
    webPath("src/sanity/queries.ts"),
    emitQueries({
      blocks: queryBlocks,
      collections: ir.collections.map((entry) => entry.entry),
      globals: ir.globals.map((entry) => ({ name: entry.global.name, fields: entry.global.fields })),
      documentTypeFor,
    }),
  );

  emit(webPath("src/app/(frontend)/[[...slug]]/page.tsx"), emitCatchAllRoute());
  scaffoldCollections(emit, ir.collections, documentTypeFor, ctx.warn);
}
