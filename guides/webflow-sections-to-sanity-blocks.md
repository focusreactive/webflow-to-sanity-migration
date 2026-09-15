# Webflow sections to Sanity blocks

Webflow has no block model. A page in Webflow is one flat tree of divs, and the "sections" an editor
perceives are a visual convention, not a structure you can read out of the markup. Sanity's content
model is the opposite: a document has an array field whose members are typed objects, each rendered
by its own component. So migrating page structure is not a translation — the block model does not
exist on the source side and has to be **discovered** from the rendered page, then made explicit as
schema and code on the target side.

## Where does a block type come from?

Section boundaries are computed from the frozen DOM (the same capture the
[freezing guide](freeze-a-published-site-for-verifiable-migration.md) describes), not from the live
site — every judgement in this phase reads a stitched screenshot and rendered HTML that were captured
once and will not change under it. The discovery phase runs this as three folded stages:

1. **Globals first.** The header and footer are found on one route and subtracted from every other
   route, so the section segmentation that follows only ever sees page content.
2. **Sections per route.** Each route still standing is segmented into its own sections — an id, a
   role, a summary, the node ids it spans, and a boundary rect.
3. **Dedup across routes.** The per-route sections are folded into site-wide block types: a hero used
   on six pages becomes one block type with six instances, not six near-identical definitions. A
   block type carries an id, a name, a role, and an **exemplar** — one route plus the node ids that
   best show what the type looks like; the exemplar is what its React component is authored against.

## What does a discovered block type become in the studio?

Each block type becomes a `defineType` object among the studio's `schemaTypes`, and an entry in the
page builder array field every `page` document carries:

```ts
// src/scripts/generate/steps/scaffold/page-schema.ts
export function emitPageBuilder(blockIds: string[]): string {
  const of = blockIds.map((id) => raw(`defineArrayMember({ type: "${schemaTypeName(id)}" })`));
  // …
  return `${helpersImportLine(used)}\n\nexport const pageBuilder = defineType(${renderSource(body)});\n`;
}
```

Its React component is authored against the exemplar's measured styles — the same computed-style
records the freezing guide describes — so the rebuilt block matches the frozen reference rather than
an approximation of it. Header and footer are not blocks: they are discovered as a closed set of
exactly two names and generated as their own chrome documents, referenced from every page and
rendered by the app shell.

## Why Portable Text instead of HTML?

Rich text fields do not carry raw HTML into Sanity — Webflow's rich-text markup is converted into
Portable Text, block by block, so the studio can offer a real rich-text editor and a frontend can
render it as data rather than dangerously-set markup. The tag mapping is a fixed table
(`src/scripts/generate/deliverable/shared/portable-text.ts`):

| HTML tag                         | Portable Text                                                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `p`                              | style `normal`                                                                                                                         |
| `h1`…`h6`                        | style `h1`…`h6`                                                                                                                        |
| `blockquote`                     | style `blockquote`                                                                                                                     |
| `ul` / `ol` (with `li`)          | list `bullet` / `number`                                                                                                               |
| `strong`, `em`, `u`, `s`, `code` | decorators                                                                                                                             |
| `a`                              | the `link` mark annotation, carrying `href`                                                                                            |
| `img`                            | an inline `image` block, resolved to a synthetic asset reference (see the [asset guide](webflow-asset-urls-to-sanity-image-assets.md)) |

A link becomes a **mark definition** rather than an inline element: the anchor's `href` is stored once
in the block's `markDefs`, and the span it wraps carries a mark key pointing at it — Portable Text's
way of letting one annotation apply to a run of text without duplicating its data per character.

## Why must block keys be deterministic?

Every Portable Text block, span and mark definition needs a `_key`. This pipeline derives each one
from a SHA-256 hash of the node's position and its own content — not `crypto.randomUUID()` — and
remaps mark references to match:

```ts
// src/scripts/generate/deliverable/shared/html-to-portable-text.ts
function keyFor(index: number, text: string): string {
  return createHash("sha256")
    .update(`${String(index)}:${text}`)
    .digest("hex")
    .slice(0, 8);
}
```

A random key would still produce valid Portable Text, but it would change on every run of `generate`
over the same source content, turning an idempotent step into one that manufactures a diff each time
it re-executes. A key derived from the content itself is stable for as long as the content is.

## Why does every query go through `defineQuery`?

Every GROQ query this pipeline emits — the page tree, a page by id, a collection detail query, a
collection's slugs, a chrome document — is wrapped in `next-sanity`'s `defineQuery`:

```ts
// src/scripts/generate/steps/scaffold/queries.ts
export const PAGE_BY_ID_QUERY = defineQuery(`*[_id == $id][0]{ … }`);
```

`defineQuery` is what lets Sanity's typegen see the query text at build time and generate a matching
TypeScript type for its result. Skipping it would leave every query's result typed as `any`, and the
`typecheck` gate the `generate` phase runs would have nothing to enforce.

## Source in this repository

- [`src/ir/discovery.ts`](../src/ir/discovery.ts) — block types, instances, globals, collection
  sections
- [`src/ir/layout.ts`](../src/ir/layout.ts) — the per-route composition record
- [`src/scripts/generate/steps/scaffold/page-schema.ts`](../src/scripts/generate/steps/scaffold/page-schema.ts)
  — the `page` document and its page builder field
- [`src/scripts/generate/deliverable/shared/portable-text.ts`](../src/scripts/generate/deliverable/shared/portable-text.ts)
  — the tag-to-style/list/decorator table and the link annotation
- [`src/scripts/generate/deliverable/shared/html-to-portable-text.ts`](../src/scripts/generate/deliverable/shared/html-to-portable-text.ts)
  — the HTML-to-Portable-Text conversion and deterministic keys
- [`src/scripts/generate/steps/scaffold/queries.ts`](../src/scripts/generate/steps/scaffold/queries.ts)
  — every emitted query, each wrapped in `defineQuery`

## Related

- [Reading a Webflow content model from a published site](read-webflow-content-model-from-published-site.md)
  — where the routes and collections come from
- [Freezing a published site so the migration is verifiable](freeze-a-published-site-for-verifiable-migration.md)
  — what a block's component is authored against
- [Webflow asset URLs to Sanity image assets](webflow-asset-urls-to-sanity-image-assets.md) — how an
  `<img>` inside rich text resolves to an asset reference
