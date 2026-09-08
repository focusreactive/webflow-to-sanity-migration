import { richTextTagsUsed } from "./tags-used.ts";
import type { RichTextField } from "./types.ts";

export function richTextFieldNames(fields: RichTextField[]): string[] {
  return fields.filter((field) => field.type.type === "richText").map((field) => field.name);
}

export interface RichTextPlanEntry {
  field: string;
  tags: string[];
}

export interface PlanRichTextOptions {
  fields: RichTextField[];
  literals: Record<string, unknown>;
}

export function planRichText(opts: PlanRichTextOptions): RichTextPlanEntry[] {
  return richTextFieldNames(opts.fields).map((field) => ({
    field,
    tags: richTextTagsUsed(opts.literals[field]),
  }));
}
