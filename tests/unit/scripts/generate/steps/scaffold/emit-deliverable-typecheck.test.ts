import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { emitDeliverable } from "#generate/steps/scaffold/emit-deliverable.ts";
import { blockTypeSchema } from "#ir/blocks.ts";
import { emitRichTextWrapper } from "#synth/utils/richtext/emit-wrapper.ts";

import { buildMinimalScaffoldFixture, stageBlockComponent } from "../../fixtures/minimal-scaffold.ts";

const execFileAsync = promisify(execFile);

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "..");
const tscBin = join(repoRoot, "node_modules/typescript/bin/tsc");

const STUDIO_STUBS = `declare module "sanity" {
  export interface RuleBuilder {
    required: () => RuleBuilder;
    min: (value: number) => RuleBuilder;
    max: (value: number) => RuleBuilder;
    email: () => RuleBuilder;
    uri: (options?: Record<string, unknown>) => RuleBuilder;
  }

  export interface SchemaDefinition {
    name?: string;
    title?: string;
    type: string;
    fields?: SchemaDefinition[];
    of?: SchemaDefinition[];
    to?: { type: string }[];
    options?: Record<string, unknown>;
    validation?: (rule: RuleBuilder) => RuleBuilder | RuleBuilder[];
    preview?: {
      select?: Record<string, string>;
      prepare?: (selection: Record<string, unknown>) => { title?: string; subtitle?: string; media?: unknown };
    };
    [key: string]: unknown;
  }

  export function defineType<T extends SchemaDefinition>(definition: T): T;
  export function defineField<T extends SchemaDefinition>(definition: T): T;
  export function defineArrayMember<T extends SchemaDefinition>(definition: T): T;
  export function defineConfig(config: Record<string, unknown>): unknown;
}

declare module "sanity/cli" {
  export function defineCliConfig(config: Record<string, unknown>): unknown;
}

declare module "sanity/structure" {
  export interface StructureNode {
    title: (value: string) => StructureNode;
    child: (value: unknown) => StructureNode;
    items: (values: unknown[]) => StructureNode;
  }

  export interface StructureBuilder {
    list: () => StructureNode;
    listItem: () => StructureNode;
    documentTypeList: (type: string) => StructureNode;
    documentTypeListItem: (type: string) => StructureNode;
    divider: () => StructureNode;
  }

  export type StructureResolver = (S: StructureBuilder) => unknown;
  export function structureTool(options: Record<string, unknown>): unknown;
}

declare module "sanity/presentation" {
  export interface LocationDocument {
    _id?: string;
    title?: string;
    slug?: string;
  }

  export interface LocationContext {
    getClient: (options: { apiVersion: string }) => { fetch: <T>(query: string) => Promise<T> };
  }

  export interface LocationResolution {
    locations: { title: string; href: string }[];
  }

  export function defineLocations(options: {
    select: Record<string, string>;
    resolve: (
      document: LocationDocument | null,
      context: LocationContext,
    ) => LocationResolution | Promise<LocationResolution>;
  }): unknown;

  export interface PresentationPluginOptions {
    resolve?: { locations?: Record<string, unknown> };
  }

  export function presentationTool(options: Record<string, unknown>): unknown;
}

declare module "@sanity/vision" {
  export function visionTool(options?: Record<string, unknown>): unknown;
}

declare module "@sanity/color-input" {
  export function colorInput(options?: Record<string, unknown>): unknown;
}

declare module "@sanity/client" {
  export interface SanityAssetDocument {
    _id: string;
    url: string;
  }

  export interface SanityTransaction {
    createOrReplace: (document: Record<string, unknown>) => SanityTransaction;
    commit: () => Promise<unknown>;
  }

  export interface SanityClient {
    assets: {
      upload: (
        type: "image" | "file",
        body: Uint8Array,
        options?: { filename?: string; contentType?: string },
      ) => Promise<SanityAssetDocument>;
    };
    transaction: () => SanityTransaction;
    fetch: <T = unknown>(query: string, params?: Record<string, unknown>) => Promise<T>;
  }

  export function createClient(config: Record<string, unknown>): SanityClient;
}
`;

const WEB_STUBS = `declare module "*.css";

declare module "next" {
  export type Metadata = Record<string, unknown>;
  export type NextConfig = Record<string, unknown>;
}

declare module "next/navigation" {
  export function notFound(): never;
}

declare module "next/headers" {
  export function draftMode(): Promise<{ isEnabled: boolean }>;
}

declare module "next-sanity" {
  export type TypegenQueryResult = any;

  export interface StubClient {
    fetch: <T = TypegenQueryResult>(query: string, params?: Record<string, unknown>) => Promise<T>;
    withConfig: (config: Record<string, unknown>) => StubClient;
  }

  export function createClient(config: Record<string, unknown>): StubClient;
  export function defineQuery(query: string): string;
}

declare module "next-sanity/live" {
  import type { ComponentType } from "react";
  import type { TypegenQueryResult } from "next-sanity";

  export function defineLive(config: Record<string, unknown>): {
    sanityFetch: (args: {
      query: string;
      params?: Record<string, unknown>;
    }) => Promise<{ data: TypegenQueryResult }>;
    SanityLive: ComponentType;
  };
}

declare module "next-sanity/visual-editing" {
  import type { ComponentType } from "react";

  export const VisualEditing: ComponentType;
}

declare module "next-sanity/draft-mode" {
  export function defineEnableDraftMode(options: Record<string, unknown>): {
    GET: (request: Request) => Promise<Response>;
  };
}

declare module "@sanity/image-url" {
  export type SanityImageSource = unknown;

  export interface StubImageUrlBuilder {
    url: () => string;
    width: (value: number) => StubImageUrlBuilder;
    height: (value: number) => StubImageUrlBuilder;
  }

  export function createImageUrlBuilder(client: unknown): { image: (source: SanityImageSource) => StubImageUrlBuilder };
}
`;

function capturedOutput(error: unknown, key: "stdout" | "stderr"): string {
  if (typeof error !== "object" || error === null || !(key in error)) return "";
  const value: unknown = Reflect.get(error, key);
  return typeof value === "string" ? value : "";
}

async function typecheck(workspacePath: string): Promise<void> {
  try {
    await execFileAsync(process.execPath, [tscBin, "--noEmit", "--types", "node,react", "-p", workspacePath], {
      cwd: workspacePath,
    });
  } catch (error) {
    const diagnostics = `${capturedOutput(error, "stdout")}\n${capturedOutput(error, "stderr")}`.trim();
    throw new Error(`tsc rejected ${workspacePath}:\n${diagnostics === "" ? String(error) : diagnostics}`, {
      cause: error,
    });
  }
}

describe("the emitted deliverable typechecks under each workspace's own tsconfig", () => {
  let projectPath = "";

  beforeAll(async () => {
    projectPath = await mkdtemp(join(repoRoot, ".tmp-deliverable-typecheck-"));
    const hero = blockTypeSchema.parse({
      id: "hero",
      name: "Hero",
      content: {},
      fields: [
        { name: "heading", type: { type: "text" }, required: true },
        { name: "body", type: { type: "richText" }, required: false },
        { name: "image", type: { type: "image" }, required: false },
      ],
    });
    await buildMinimalScaffoldFixture(projectPath, { blocks: { blocks: [hero] } });
    await stageBlockComponent(
      projectPath,
      "hero",
      'import type { HeroProps } from "./props.ts";\n\n'
        + 'import RichTextBody from "./richtext/body.tsx";\n\n'
        + "export default function Hero(props: HeroProps) {\n"
        + "  return (\n"
        + "    <div>\n"
        + "      {props.heading}\n"
        + "      {props.body === undefined ? null : <RichTextBody value={props.body} />}\n"
        + "    </div>\n"
        + "  );\n}\n",
      { body: emitRichTextWrapper("body", {}) },
    );

    await emitDeliverable({ projectPath });

    await writeFile(join(projectPath, "studio/src/stubs.d.ts"), STUDIO_STUBS);
    await writeFile(join(projectPath, "web/src/stubs.d.ts"), WEB_STUBS);
  }, 60_000);

  afterAll(async () => {
    if (projectPath !== "") await rm(projectPath, { recursive: true, force: true });
  });

  it("compiles the emitted studio: schema types, structure, presentation and the seed script", async () => {
    await typecheck(join(projectPath, "studio"));
  }, 120_000);

  it("compiles the emitted web app: block registry, chrome, queries and both route kinds", async () => {
    await typecheck(join(projectPath, "web"));
  }, 120_000);
});
