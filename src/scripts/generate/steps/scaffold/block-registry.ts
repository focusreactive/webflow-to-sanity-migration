import { blockComponentName, componentDirName, propsInterfaceName, schemaTypeName } from "#blocks/codegen/names.ts";
import type { BlockTypeId } from "#ir/common.ts";

export function emitBlockRenderer(blockIds: readonly BlockTypeId[]): string {
  const componentImports = blockIds
    .map((id) => `import ${blockComponentName(id)} from "@/components/blocks/${componentDirName(id)}";`)
    .join("\n");
  const propsImports = blockIds
    .map((id) => `import type { ${propsInterfaceName(id)} } from "@/components/blocks/${componentDirName(id)}/props";`)
    .join("\n");

  const cases = blockIds
    .map(
      (id) =>
        `        case "${schemaTypeName(id)}":\n`
        + `          return <${blockComponentName(id)} key={block._key} {...(block as unknown as ${propsInterfaceName(id)})} />;`,
    )
    .join("\n");

  const imports = [componentImports, propsImports].filter((section) => section !== "").join("\n");

  return `${imports}${imports === "" ? "" : "\n\n"}interface BlockNode {
  _type: string;
  _key: string;
}

export function RenderBlocks({ blocks }: { blocks: BlockNode[] }) {
  return (
    <>
      {blocks.map((block) => {
        switch (block._type) {
${cases}
          default:
            return null;
        }
      })}
    </>
  );
}
`;
}
