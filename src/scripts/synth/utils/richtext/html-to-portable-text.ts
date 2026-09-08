import { createHash } from "node:crypto";

import type { PortableTextBlock } from "@portabletext/types";
import { htmlToBlocks, type DeserializerRule } from "@sanity/block-tools";
import { JSDOM } from "jsdom";

import { PT_DECORATORS, PT_LINK_ANNOTATION, PT_LISTS, PT_STYLES } from "./portable-text.ts";

export interface HtmlToPortableTextOptions {
  resolveImage: (url: string) => string | undefined;
}

function titledList(entries: readonly { value: string; title: string }[]): { title: string; value: string }[] {
  return entries.map((entry) => ({ title: entry.title, value: entry.value }));
}

function buildBlockContentType(): Parameters<typeof htmlToBlocks>[1] {
  const spanType = {
    name: "span",
    jsonType: "object",
    annotations: [
      {
        name: PT_LINK_ANNOTATION.name,
        title: PT_LINK_ANNOTATION.title,
        jsonType: "object",
        fields: [{ name: "href", type: { jsonType: "string" } }],
      },
    ],
    decorators: titledList(PT_DECORATORS),
  };

  const blockType = {
    name: "block",
    jsonType: "object",
    fields: [
      { name: "style", type: { jsonType: "string", options: { list: titledList(PT_STYLES) } } },
      { name: "listItem", type: { jsonType: "string", options: { list: titledList(PT_LISTS) } } },
      { name: "children", type: { jsonType: "array", of: [spanType] } },
    ],
  };

  const imageType = { name: "image", jsonType: "object" };

  return { of: [blockType, imageType] } as unknown as Parameters<typeof htmlToBlocks>[1];
}

const BLOCK_CONTENT_TYPE = buildBlockContentType();

function isElement(node: unknown): node is { tagName: string; getAttribute: (name: string) => string | null } {
  return typeof node === "object" && node !== null && (node as { nodeType?: number }).nodeType === 1;
}

function imageRule(resolveImage: (url: string) => string | undefined): DeserializerRule {
  return {
    deserialize(el, _next, createBlock) {
      if (!isElement(el) || el.tagName.toLowerCase() !== "img") return undefined;
      const src = el.getAttribute("src");
      if (src === null) return undefined;
      const ref = resolveImage(src);
      if (ref === undefined) return undefined;
      return createBlock({ _type: "image", asset: { _type: "reference", _ref: ref } });
    },
  };
}

function keyFor(index: number, text: string): string {
  return createHash("sha256").update(`${String(index)}:${text}`).digest("hex").slice(0, 8);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function blockText(block: Record<string, unknown>): string {
  if (block["_type"] === "image") {
    const asset = block["asset"];
    return isRecord(asset) && typeof asset["_ref"] === "string" ? asset["_ref"] : "";
  }
  const children = Array.isArray(block["children"]) ? block["children"] : [];
  return children.map((child) => (isRecord(child) && typeof child["text"] === "string" ? child["text"] : "")).join("");
}

function withDeterministicKeys(blocks: Record<string, unknown>[]): Record<string, unknown>[] {
  return blocks.map((block, index) => {
    const keyed = { ...block, _key: keyFor(index, blockText(block)) };
    if (block["_type"] !== "block") return keyed;

    const markDefs = Array.isArray(block["markDefs"]) ? (block["markDefs"] as Record<string, unknown>[]) : [];
    const keyRemap = new Map<string, string>();
    const newMarkDefs = markDefs.map((def, defIndex) => {
      const oldKey = typeof def["_key"] === "string" ? def["_key"] : "";
      const identity =
        typeof def["href"] === "string" ? def["href"]
        : typeof def["_type"] === "string" ? def["_type"]
        : "";
      const newKey = keyFor(defIndex, identity);
      if (oldKey) keyRemap.set(oldKey, newKey);
      return { ...def, _key: newKey };
    });

    const children = Array.isArray(block["children"]) ? (block["children"] as Record<string, unknown>[]) : [];
    const newChildren = children.map((child, childIndex) => {
      const text = typeof child["text"] === "string" ? child["text"] : "";
      const marks = Array.isArray(child["marks"]) ? (child["marks"] as string[]) : [];
      return { ...child, _key: keyFor(childIndex, text), marks: marks.map((mark) => keyRemap.get(mark) ?? mark) };
    });

    return { ...keyed, children: newChildren, markDefs: newMarkDefs };
  });
}

export function htmlToPortableText(html: string, opts: HtmlToPortableTextOptions): PortableTextBlock[] {
  const blocks = htmlToBlocks(html, BLOCK_CONTENT_TYPE, {
    rules: [imageRule(opts.resolveImage)],
    parseHtml: (source) => new JSDOM(source).window.document,
  });
  return withDeterministicKeys(blocks as unknown as Record<string, unknown>[]) as unknown as PortableTextBlock[];
}
