import { emitSchemaRegistry } from "#generate/steps/scaffold/registry.ts";

describe("emitSchemaRegistry", () => {
  it("emits one named import per module and lists every name in schemaTypes", () => {
    const source = emitSchemaRegistry([
      { importPath: "./documents/page.ts", name: "page" },
      { importPath: "./objects/page-builder.ts", name: "pageBuilder" },
    ]);
    expect(source).toBe(
      'import { page } from "./documents/page.ts";\n'
        + 'import { pageBuilder } from "./objects/page-builder.ts";\n'
        + "\n"
        + "export const schemaTypes = [page, pageBuilder];\n",
    );
  });

  it("keeps the module order it is given", () => {
    const source = emitSchemaRegistry([
      { importPath: "./b.ts", name: "b" },
      { importPath: "./a.ts", name: "a" },
    ]);
    expect(source).toContain("export const schemaTypes = [b, a];");
  });

  it("emits an empty schemaTypes array when there are no modules", () => {
    expect(emitSchemaRegistry([])).toContain("export const schemaTypes = [];");
  });

  it("does not group by kind — the registry is one flat list", () => {
    const source = emitSchemaRegistry([{ importPath: "./documents/page.ts", name: "page" }]);
    expect(source).not.toContain("documents:");
    expect(source).not.toContain("objects:");
  });
});
