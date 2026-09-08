export interface SchemaModuleRef {
  importPath: string;
  name: string;
}

export function emitSchemaRegistry(modules: SchemaModuleRef[]): string {
  const imports = modules.map((module) => `import { ${module.name} } from "${module.importPath}";`).join("\n");
  const names = modules.map((module) => module.name).join(", ");
  return `${imports}\n\nexport const schemaTypes = [${names}];\n`;
}
