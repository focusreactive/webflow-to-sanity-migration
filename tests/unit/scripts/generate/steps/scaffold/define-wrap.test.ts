import { helpersImportLine, wrapTopLevelFields } from "#generate/steps/scaffold/define-wrap.ts";
import { renderSource } from "#generate/utils/source.ts";

describe("helpersImportLine", () => {
  it("prints the helpers in a fixed alphabetical order regardless of insertion order", () => {
    expect(helpersImportLine(new Set(["defineType", "defineArrayMember", "defineField"]))).toBe(
      'import { defineArrayMember, defineField, defineType } from "sanity";',
    );
  });

  it("prints only the helpers that were actually used", () => {
    expect(helpersImportLine(new Set(["defineType"]))).toBe('import { defineType } from "sanity";');
  });

  it("ignores names that are not sanity helpers", () => {
    expect(helpersImportLine(new Set(["defineType", "defineNothing"]))).toBe(
      'import { defineType } from "sanity";',
    );
  });

  it("emits an empty specifier list when nothing was used", () => {
    expect(helpersImportLine(new Set())).toBe('import {  } from "sanity";');
  });
});

describe("wrapTopLevelFields", () => {
  it("wraps every top-level field in defineField", () => {
    const result = wrapTopLevelFields([{ name: "title", type: "string" }]);
    expect(result.fields.map(renderSource)).toEqual(['defineField({ name: "title", type: "string" })']);
    expect(result.usesArrayMember).toBe(false);
  });

  it("recurses into nested fields so inline object members are wrapped too", () => {
    const result = wrapTopLevelFields([
      { name: "seo", type: "object", fields: [{ name: "metaTitle", type: "string" }] },
    ]);
    expect(renderSource(result.fields[0] ?? null)).toBe(
      'defineField({ name: "seo", type: "object", fields: [defineField({ name: "metaTitle", type: "string" })] })',
    );
  });

  it("wraps array members in defineArrayMember and reports that it did", () => {
    const result = wrapTopLevelFields([{ name: "tags", type: "array", of: [{ type: "string" }] }]);
    expect(renderSource(result.fields[0] ?? null)).toBe(
      'defineField({ name: "tags", type: "array", of: [defineArrayMember({ type: "string" })] })',
    );
    expect(result.usesArrayMember).toBe(true);
  });

  it("wraps at every depth", () => {
    const result = wrapTopLevelFields([
      {
        name: "rows",
        type: "array",
        of: [{ type: "object", fields: [{ name: "label", type: "string" }] }],
      },
    ]);
    expect(renderSource(result.fields[0] ?? null)).toBe(
      'defineField({ name: "rows", type: "array", of: [defineArrayMember({ type: "object", fields: [defineField({ name: "label", type: "string" })] })] })',
    );
    expect(result.usesArrayMember).toBe(true);
  });

  it("leaves a non-object field value alone apart from the wrapper", () => {
    const result = wrapTopLevelFields(["alreadyRendered"]);
    expect(result.fields.map(renderSource)).toEqual(['defineField("alreadyRendered")']);
  });

  it("returns no fields and no array member for an empty field list", () => {
    expect(wrapTopLevelFields([])).toEqual({ fields: [], usesArrayMember: false });
  });
});
