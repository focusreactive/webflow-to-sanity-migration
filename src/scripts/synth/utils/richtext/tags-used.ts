import { PT_DECORATORS, PT_LINK_ANNOTATION, PT_LISTS, PT_STYLES } from "#generate/deliverable/shared/portable-text.ts";

const TAG_BY_STYLE = new Map(PT_STYLES.map((entry) => [entry.value, entry.tag]));
const CONTAINER_TAG_BY_LIST_VALUE = new Map(PT_LISTS.map((entry) => [entry.value, entry.containerTag]));
const LIST_ITEM_TAG = PT_LISTS[0]?.itemTag ?? "li";
const TAG_BY_DECORATOR = new Map(PT_DECORATORS.map((entry) => [entry.value, entry.tag]));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function linkKeysOf(block: Record<string, unknown>): Set<string> {
  const markDefs = Array.isArray(block["markDefs"]) ? block["markDefs"] : [];
  const keys = new Set<string>();
  for (const def of markDefs) {
    if (isRecord(def) && def["_type"] === PT_LINK_ANNOTATION.name && typeof def["_key"] === "string") {
      keys.add(def["_key"]);
    }
  }
  return keys;
}

function collectBlockTags(block: Record<string, unknown>, tags: Set<string>): void {
  const listItem = block["listItem"];
  const isListItem = typeof listItem === "string";

  const style = block["style"];
  if (!isListItem && typeof style === "string") {
    const tag = TAG_BY_STYLE.get(style);
    if (tag !== undefined) tags.add(tag);
  }

  if (isListItem) {
    const containerTag = CONTAINER_TAG_BY_LIST_VALUE.get(listItem);
    if (containerTag !== undefined) tags.add(containerTag);
    tags.add(LIST_ITEM_TAG);
  }

  const linkKeys = linkKeysOf(block);
  const children = Array.isArray(block["children"]) ? block["children"] : [];
  for (const child of children) {
    if (!isRecord(child)) continue;
    const marks = Array.isArray(child["marks"]) ? child["marks"] : [];
    for (const mark of marks) {
      if (typeof mark !== "string") continue;
      if (linkKeys.has(mark)) {
        tags.add(PT_LINK_ANNOTATION.tag);
        continue;
      }
      const decoratorTag = TAG_BY_DECORATOR.get(mark);
      if (decoratorTag !== undefined) tags.add(decoratorTag);
    }
  }
}

export function richTextTagsUsed(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const tags = new Set<string>();
  for (const node of value) {
    if (!isRecord(node)) continue;
    if (node["_type"] === "image") {
      tags.add("img");
      continue;
    }
    if (node["_type"] === "block") collectBlockTags(node, tags);
  }
  return [...tags].sort();
}
