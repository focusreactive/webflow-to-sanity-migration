import { componentDirName, pascalCase, propsInterfaceName, schemaTypeName } from "#blocks/codegen/names.ts";

import { chromeQueryConstName } from "./queries.ts";

const CHROME_POSITION: Record<string, "before" | "after"> = { header: "before", footer: "after" };

export interface LayoutGlobal {
  name: string;
}

export interface LayoutOptions {
  lang: string;
  siteTitle: string;
  globals: readonly LayoutGlobal[];
}

interface ChromeWiring {
  varName: string;
  componentName: string;
  propsName: string;
  importPath: string;
  queryConst: string;
  position: "before" | "after";
}

function wiringFor(global: LayoutGlobal): ChromeWiring {
  const importPath = `@/components/chrome/${componentDirName(global.name)}`;
  return {
    varName: schemaTypeName(global.name),
    componentName: pascalCase(global.name),
    propsName: propsInterfaceName(global.name),
    importPath,
    queryConst: chromeQueryConstName(global.name),
    position: CHROME_POSITION[global.name] ?? "before",
  };
}

export function emitLayout(opts: LayoutOptions): string {
  const wiring = opts.globals.map(wiringFor);
  const before = wiring.filter((entry) => entry.position === "before");
  const after = wiring.filter((entry) => entry.position === "after");
  const hasChrome = wiring.length > 0;

  const importLines = [
    `import type { Metadata } from "next";`,
    `import { VisualEditing } from "next-sanity/visual-editing";`,
    `import { draftMode } from "next/headers";`,
    "",
    ...wiring.map((entry) => `import ${entry.componentName} from "${entry.importPath}";`),
    ...(hasChrome ? [""] : []),
    `import { SanityLive${hasChrome ? ", sanityFetch" : ""} } from "@/sanity/live";`,
    ...(hasChrome ? [`import { ${wiring.map((entry) => entry.queryConst).join(", ")} } from "@/sanity/queries";`] : []),
    ...wiring.map((entry) => `import type { ${entry.propsName} } from "${entry.importPath}/props";`),
    "",
    `import "./globals.css";`,
  ];

  const fetchLines =
    hasChrome ?
      [
        `  const [${wiring.map((entry) => `{ data: ${entry.varName} }`).join(", ")}] = await Promise.all([`,
        ...wiring.map((entry) => `    sanityFetch({ query: ${entry.queryConst} }),`),
        `  ]);`,
      ]
    : [];

  const renderLine = (entry: ChromeWiring): string =>
    `{${entry.varName} && <${entry.componentName} {...(${entry.varName} as unknown as ${entry.propsName})} />}`;

  const bodyLines = [
    ...before.map(renderLine),
    `{children}`,
    ...after.map(renderLine),
    `<SanityLive />`,
    `{isEnabled && <VisualEditing />}`,
  ];

  return [
    importLines.join("\n"),
    "",
    `export const metadata: Metadata = {`,
    `  title: "${opts.siteTitle}",`,
    `};`,
    "",
    `export default async function RootLayout({ children }: { children: React.ReactNode }) {`,
    `  const { isEnabled } = await draftMode();`,
    ...fetchLines,
    `  return (`,
    `    <html lang="${opts.lang}">`,
    `      <body>`,
    ...bodyLines.map((line) => `        ${line}`),
    `      </body>`,
    `    </html>`,
    `  );`,
    `}`,
    "",
  ].join("\n");
}
