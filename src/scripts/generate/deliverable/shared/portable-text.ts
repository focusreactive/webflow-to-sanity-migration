import { helpersImportLine } from "./define-wrap.ts";
import { raw, renderSource, type SourceValue } from "./source.ts";

export interface PtStyleEntry {
  tag: string;
  value: string;
  title: string;
}

export interface PtListEntry {
  containerTag: string;
  itemTag: string;
  value: string;
  title: string;
}

export interface PtDecoratorEntry {
  tag: string;
  value: string;
  title: string;
}

export const PT_STYLES: readonly PtStyleEntry[] = [
  { tag: "p", value: "normal", title: "Normal" },
  { tag: "h1", value: "h1", title: "H1" },
  { tag: "h2", value: "h2", title: "H2" },
  { tag: "h3", value: "h3", title: "H3" },
  { tag: "h4", value: "h4", title: "H4" },
  { tag: "h5", value: "h5", title: "H5" },
  { tag: "h6", value: "h6", title: "H6" },
  { tag: "blockquote", value: "blockquote", title: "Quote" },
];

export const PT_LISTS: readonly PtListEntry[] = [
  { containerTag: "ul", itemTag: "li", value: "bullet", title: "Bullet" },
  { containerTag: "ol", itemTag: "li", value: "number", title: "Number" },
];

export const PT_DECORATORS: readonly PtDecoratorEntry[] = [
  { tag: "strong", value: "strong", title: "Strong" },
  { tag: "em", value: "em", title: "Emphasis" },
  { tag: "u", value: "underline", title: "Underline" },
  { tag: "s", value: "strike-through", title: "Strike" },
  { tag: "code", value: "code", title: "Code" },
];

export const PT_LINK_ANNOTATION = { name: "link", title: "Link", tag: "a" } as const;

export type PtSlot =
  | { kind: "block"; style: string }
  | { kind: "list"; listItem: string }
  | { kind: "mark"; mark: string }
  | { kind: "type"; name: string };

const STYLE_BY_TAG = new Map(PT_STYLES.map((entry) => [entry.tag, entry.value]));
const LIST_VALUE_BY_CONTAINER_TAG = new Map(PT_LISTS.map((entry) => [entry.containerTag, entry.value]));
const DECORATOR_VALUE_BY_TAG = new Map(PT_DECORATORS.map((entry) => [entry.tag, entry.value]));

export function slotForTag(tag: string): PtSlot | undefined {
  if (tag === "li") return { kind: "list", listItem: "bullet" };

  const listValue = LIST_VALUE_BY_CONTAINER_TAG.get(tag);
  if (listValue !== undefined) return { kind: "list", listItem: listValue };

  const styleValue = STYLE_BY_TAG.get(tag);
  if (styleValue !== undefined) return { kind: "block", style: styleValue };

  if (tag === PT_LINK_ANNOTATION.tag) return { kind: "mark", mark: PT_LINK_ANNOTATION.name };

  const decoratorValue = DECORATOR_VALUE_BY_TAG.get(tag);
  if (decoratorValue !== undefined) return { kind: "mark", mark: decoratorValue };

  if (tag === "img") return { kind: "type", name: "image" };

  return undefined;
}

function titledList(entries: readonly { value: string; title: string }[]): SourceValue {
  return entries.map((entry) => ({ title: entry.title, value: entry.value }));
}

function linkAnnotationMember(): SourceValue {
  const body: SourceValue = {
    name: PT_LINK_ANNOTATION.name,
    type: "object",
    title: PT_LINK_ANNOTATION.title,
    fields: [raw(`defineField(${renderSource({ name: "href", title: "Href", type: "url" })})`)],
  };
  return raw(`defineArrayMember(${renderSource(body)})`);
}

function blockMember(): SourceValue {
  const body: SourceValue = {
    type: "block",
    styles: titledList(PT_STYLES),
    lists: titledList(PT_LISTS),
    marks: {
      decorators: titledList(PT_DECORATORS),
      annotations: [linkAnnotationMember()],
    },
  };
  return raw(`defineArrayMember(${renderSource(body)})`);
}

function imageMember(): SourceValue {
  return raw(`defineArrayMember(${renderSource({ type: "image" })})`);
}

export function emitPortableTextType(): string {
  const used = new Set(["defineType", "defineField", "defineArrayMember"]);
  const body: SourceValue = {
    name: "portableText",
    title: "Portable text",
    type: "array",
    of: [blockMember(), imageMember()],
  };
  return `${helpersImportLine(used)}\n\nexport const portableText = defineType(${renderSource(body)});\n`;
}
