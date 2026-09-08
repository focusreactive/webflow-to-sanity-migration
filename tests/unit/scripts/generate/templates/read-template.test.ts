import { readTemplate } from "#generate/templates/read-template.ts";

describe("readTemplate", () => {
  it("refuses to render a template whose slot the call site forgot", async () => {
    await expect(readTemplate("studio/sanity.cli.ts.tpl")).rejects.toThrow(/__PROJECT_ID__|__DATASET__/);
    await expect(readTemplate("studio/sanity.cli.ts.tpl", { PROJECT_ID: "abc123" })).rejects.toThrow(/__DATASET__/);
  });

  it("renders a template once every slot is passed", async () => {
    const rendered = await readTemplate("studio/sanity.cli.ts.tpl", {
      PROJECT_ID: "abc123",
      DATASET: "production",
    });

    expect(rendered).toContain("abc123");
    expect(rendered).toContain("production");
    expect(rendered).not.toMatch(/__[A-Z][A-Z0-9_]*__/);
  });
});
