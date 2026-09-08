import { propsInterfaceName } from "#blocks/codegen/names.ts";
import type { SurfaceShard } from "#generate/types.ts";
import { propKey, sanityTsType } from "#generate/utils/ts-type.ts";
import type { FieldType } from "#ir/field-type.ts";

const SANITY_ASSET = `type SanityAssetRef = { _type: "reference"; _ref: string };

type SanityAssetDoc = {
  _id: string;
  url: string;
  metadata?: { dimensions?: { width: number; height: number }; lqip?: string };
};`;

const SANITY_IMAGE = `interface SanityImage {
  _type: "image";
  asset: SanityAssetRef | SanityAssetDoc;
  alt?: string;
  hotspot?: { x: number; y: number; width: number; height: number };
}`;

const SANITY_FILE = `interface SanityFile {
  _type: "file";
  asset: (SanityAssetRef & { url: string }) | SanityAssetDoc;
}`;

interface TypeUsage {
  richText: boolean;
  image: boolean;
  file: boolean;
}

function collectUsage(types: FieldType[]): TypeUsage {
  const usage: TypeUsage = { richText: false, image: false, file: false };
  const walk = (type: FieldType): void => {
    switch (type.type) {
      case "richText":
        usage.richText = true;
        return;
      case "image":
        usage.image = true;
        return;
      case "file":
      case "video":
        usage.file = true;
        return;
      case "array":
        walk(type.element);
        return;
      case "group":
        type.fields.forEach((field) => walk(field.type));
        return;
      default:
        return;
    }
  };
  types.forEach(walk);
  return usage;
}

export function emitProps(surface: SurfaceShard): string {
  const usage = collectUsage(surface.fields.map((field) => field.type));
  const iface = propsInterfaceName(surface.key);
  const lines = surface.fields.map(
    (field) => `  ${propKey(field.name)}${field.required ? "" : "?"}: ${sanityTsType(field.type)};`,
  );

  const sections: string[] = [];
  if (usage.richText) sections.push(`import type { PortableTextBlock } from "@portabletext/types";`);
  if (usage.image || usage.file) sections.push(SANITY_ASSET);
  if (usage.image) sections.push(SANITY_IMAGE);
  if (usage.file) sections.push(SANITY_FILE);
  sections.push(`export interface ${iface} {\n${lines.join("\n")}\n}\n`);

  return sections.join("\n\n");
}
