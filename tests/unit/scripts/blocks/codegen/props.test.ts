import { emitProps } from "#blocks/codegen/props.ts";
import type { SurfaceShard } from "#generate/types.ts";
import { blockTypeSchema } from "#ir/blocks.ts";

const block = blockTypeSchema.parse({
  id: "feature-grid",
  name: "Feature Grid",
  content: {},
  fields: [
    { name: "heading", type: { type: "text" }, required: true },
    { name: "cover", type: { type: "image" }, required: false },
    { name: "clip", type: { type: "video" }, required: false },
    { name: "align", type: { type: "option", values: ["left", "center"] }, required: true },
    { name: "related", type: { type: "multiReference", collectionKey: "posts" }, required: false },
    {
      name: "items",
      type: {
        type: "array",
        element: { type: "group", fields: [{ name: "label", type: { type: "text" }, required: true }] },
      },
      required: true,
    },
  ],
});

const surface: SurfaceShard = { key: block.id, name: block.name, fields: block.fields };

describe("emitProps", () => {
  it("emits a TS props interface over the Sanity value shapes", () => {
    const out = emitProps(surface);
    expect(out).toContain("export interface FeatureGridProps {");
    expect(out).toContain("heading: string;");
    expect(out).toContain("cover?: SanityImage;");
    expect(out).toContain("clip?: SanityFile;");
    expect(out).toContain('align: "left" | "center";');
    expect(out).toContain("related?: ({ _id: string } & Record<string, unknown>)[];");
    expect(out).toContain("items: { label: string }[];");
    expect(out).toMatchInlineSnapshot(`
      "type SanityAssetRef = { _type: "reference"; _ref: string };

      type SanityAssetDoc = {
        _id: string;
        url: string;
        metadata?: { dimensions?: { width: number; height: number }; lqip?: string };
      };

      interface SanityImage {
        _type: "image";
        asset: SanityAssetRef | SanityAssetDoc;
        alt?: string;
        hotspot?: { x: number; y: number; width: number; height: number };
      }

      interface SanityFile {
        _type: "file";
        asset: (SanityAssetRef & { url: string }) | SanityAssetDoc;
      }

      export interface FeatureGridProps {
        heading: string;
        cover?: SanityImage;
        clip?: SanityFile;
        align: "left" | "center";
        related?: ({ _id: string } & Record<string, unknown>)[];
        items: { label: string }[];
      }
      "
    `);
  });

  describe("richText", () => {
    const richBlock = blockTypeSchema.parse({
      id: "hero",
      name: "Hero",
      content: {},
      fields: [{ name: "body", type: { type: "richText" }, required: true }],
    });
    const src = emitProps({ key: richBlock.id, name: richBlock.name, fields: richBlock.fields });

    it("types richText props as a Portable Text array", () => {
      expect(src).toContain("body: PortableTextBlock[];");
    });
    it("imports the Portable Text block type from @portabletext/types", () => {
      expect(src).toContain('import type { PortableTextBlock } from "@portabletext/types";');
    });
    it("omits the import when no field uses richText", () => {
      expect(emitProps(surface)).not.toContain("PortableTextBlock");
    });
    it("omits the asset interfaces when no field uses media", () => {
      expect(src).not.toContain("SanityImage");
      expect(src).not.toContain("SanityFile");
      expect(src).not.toContain("SanityAssetRef");
    });
  });

  it("collapses an array of richText into a single Portable Text array", () => {
    const arrayRich = blockTypeSchema.parse({
      id: "notes",
      name: "Notes",
      content: {},
      fields: [{ name: "body", type: { type: "array", element: { type: "richText" } }, required: true }],
    });
    expect(emitProps({ key: arrayRich.id, name: arrayRich.name, fields: arrayRich.fields })).toContain(
      "body: PortableTextBlock[];",
    );
  });

  it("types a reference field as the resolved document, not a bare id string", () => {
    const refBlock = blockTypeSchema.parse({
      id: "profile-card",
      name: "Profile Card",
      content: {},
      fields: [{ name: "author", type: { type: "reference", collectionKey: "people" }, required: true }],
    });
    expect(emitProps({ key: refBlock.id, name: refBlock.name, fields: refBlock.fields })).toContain(
      "author: { _id: string } & Record<string, unknown>;",
    );
  });

  it("quotes a property key that is not a valid identifier", () => {
    expect(
      emitProps({
        key: "odd",
        name: "Odd",
        fields: [{ name: "data-x", type: { type: "text" }, required: true }],
      }),
    ).toContain('"data-x": string;');
  });
});
