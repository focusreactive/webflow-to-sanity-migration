import { describe, expect, it } from "vitest";

import { emitRichTextWrapper } from "#synth/utils/richtext/emit-wrapper.ts";
import {
  synthRichTextComponentName,
  synthRichTextImportPattern,
  synthRichTextWrapperImport,
  synthRichTextWrapperPath,
} from "#synth/utils/richtext/names.ts";
import type { RichTextStyleTable } from "#synth/utils/richtext/types.ts";

describe("names", () => {
  it("PascalCases the slug", () => {
    expect(synthRichTextComponentName("body")).toBe("RichTextBody");
    expect(synthRichTextComponentName("short-description")).toBe("RichTextShortDescription");
  });
  it("import path is relative and extensionless", () => {
    expect(synthRichTextWrapperImport("body")).toBe("./richtext/body");
  });
  it("writes the wrapper into the synth richtext subdirectory", () => {
    expect(synthRichTextWrapperPath("body")).toBe("richtext/body.tsx");
  });
});

function fieldsMatchedIn(code: string): (string | undefined)[] {
  return [...code.matchAll(synthRichTextImportPattern())].map((match) => match[2]);
}

describe("synthRichTextImportPattern", () => {
  it("matches the specifier synthRichTextWrapperImport itself produces", () => {
    expect(fieldsMatchedIn(`import RichTextBody from "${synthRichTextWrapperImport("body")}";`)).toEqual(["body"]);
  });

  it("matches the same specifier written with the emitted file's extension", () => {
    expect(fieldsMatchedIn(`import RichTextBody from "./${synthRichTextWrapperPath("body")}";`)).toEqual(["body"]);
  });

  it("leaves relative imports outside the richtext directory alone", () => {
    expect(fieldsMatchedIn('import x from "./sibling";\nimport y from "./nested/richtext/body";')).toEqual([]);
  });
});

describe("emitRichTextWrapper", () => {
  const table: RichTextStyleTable = {
    h2: { props: { "font-size": "32px", "font-weight": "700", color: "var(--color-primary)" }, source: "measured" },
    a: { props: { "text-decoration": "underline", color: "var(--color-accent)" }, source: "extrapolated" },
  };
  const src = emitRichTextWrapper("body", table);

  it("imports the Portable Text renderer and its block type, not a Lexical one", () => {
    expect(src).toContain('import { PortableText, type PortableTextComponents } from "@portabletext/react";');
    expect(src).toContain('import type { PortableTextBlock } from "@portabletext/types";');
    expect(src).not.toContain("@payloadcms/richtext-lexical");
    expect(src).toContain("export default function RichTextBody(");
  });

  it("takes its props as a PortableTextBlock array", () => {
    expect(src).toContain("{ value: PortableTextBlock[] }");
    expect(src).toContain("<PortableText value={value} components={components} />");
  });

  it("renders an inline image through the sanctioned urlFor path", () => {
    expect(src).toContain('import { urlFor } from "@/sanity/image";');
    expect(src).toContain("image: ({ value }) => <img src={urlFor(value).url()}");
  });

  it("keeps the auto-generated banner in the emitted output", () => {
    expect(src).toContain("// Auto-generated richText wrapper");
    expect(src).toContain("// Do not edit by hand;");
  });

  it("emits arbitrary-property descendant variants per tag/prop", () => {
    expect(src).toContain("[&_h2]:[font-size:32px]");
    expect(src).toContain("[&_h2]:[font-weight:700]");
    expect(src).toContain("[&_h2]:[color:var(--color-primary)]");
    expect(src).toContain("[&_a]:[text-decoration:underline]");
  });

  it("escapes spaces in multi-value props as underscores, not by deleting them", () => {
    const src2 = emitRichTextWrapper("body", {
      hr: { props: { "border-width": "0px 0px 0px 3px" }, source: "measured" },
      p: { props: { "font-family": "Montserrat, sans-serif" }, source: "measured" },
    });
    expect(src2).toContain("[&_hr]:[border-width:0px_0px_0px_3px]");
    expect(src2).toContain("[&_p]:[font-family:Montserrat,_sans-serif]");
  });

  it("forwards rest props (data-mig-id) onto the wrapper root", () => {
    expect(src).toContain("{...rest}");
  });
});
