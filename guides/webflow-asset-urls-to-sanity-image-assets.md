# Webflow asset URLs to Sanity image assets

The same image on a Webflow site appears under many URLs: on four different CDN hostnames, with
cache-busting query strings, and in up to seven generated width variants. Turning those URLs into
Sanity image assets one-for-one would mint a reference for every variant of every photograph.
Collapsing them correctly takes three separate steps — canonicalising the URL, discarding generated
variants, and de-duplicating by content hash — because each catches duplicates the others cannot
see. Only once one URL survives per real image does minting a Sanity reference make sense.

## Which hostnames serve the same asset?

Four hosts serve Webflow asset paths, and they are interchangeable for a given path:

- `cdn.prod.website-files.com` — the current one, used as canonical
- `assets.website-files.com`
- `assets-global.website-files.com`
- `uploads-ssl.webflow.com`

Canonicalising means rewriting any of the aliases to `cdn.prod.website-files.com` and **dropping the
query string entirely**, since it only ever carries cache-busting parameters. One more fix applies
to every URL regardless of host: `%2f` sequences in the path are decoded back to `/`, because they
appear inconsistently and would otherwise split one asset into two.

## Which URLs are generated variants rather than assets?

Webflow generates responsive copies of an uploaded image and names them by appending `-p-<width>`
before the extension:

```
6098…_photo.jpg          ← the original
6098…_photo-p-500.jpeg   ← generated
6098…_photo-p-1600.jpeg  ← generated
```

The widths are drawn from a fixed set: **500, 800, 1080, 1600, 2000, 2600, 3200**. Matching the
`-p-<number>` suffix alone is not enough — a file legitimately named `chart-p-42.png` would be
mistaken for a variant — so the number has to be checked against that set.

Variant references are skipped before anything is fetched. Only the original is downloaded, and any
later reference to a variant URL resolves to the original's id by canonicalising it the same way.
Practically, this means a `srcset` of seven URLs contributes exactly one asset.

## What does the filename carry?

The last path segment of a canonical URL is `<24-hex platform id>_<original file name>` — Webflow's
own asset id, an underscore, then the name the file had before it was uploaded. Both halves are kept:
the 24-hex prefix survives as the asset's `platformId`, and the remainder, sanitised, survives as its
`originalName`. Neither is required for the asset to work, but both make the studio's media browser
readable — a document titled `hero-photo.jpg` beats one titled by its content hash.

## How does a deduplicated asset become a Sanity image reference?

Sanity addresses an uploaded image by an asset id of the shape `image-<sha>-<width>x<height>-<ext>`.
This pipeline mints that same shape itself, from the asset record's content SHA-256 and its file
extension, before any file has actually been uploaded to a dataset. The asset record carries no
measured dimensions, so the width and height slots fall back to `0x0` — the ref is addressed as a
whole, and the real dimensions arrive with the upload that makes the reference real:

```ts
// src/scripts/generate/steps/scaffold/input-value.ts
export function syntheticAssetRef(meta: { sha: string; width?: number; height?: number; ext: string }): string {
  return `image-${meta.sha}-${String(meta.width ?? 0)}x${String(meta.height ?? 0)}-${meta.ext}`;
}
```

That ref has to be **deterministic**: the same source image always produces the same ref, on this run
and on the next one. Every field that points at an image — an image field, a rich-text `<img>` — is
resolved to this same synthetic reference independently, so a real upload step only has to know one
rule to reconcile them: hash the uploaded file and match it back to the ref that was minted for it.
A random or incrementing id would break that link and make every re-run of `generate` non-reproducible.

Before the real dataset exists — while a block's component is still being reviewed against the frozen
reference — that reference has to resolve to real bytes somewhere. A generated component imports
`urlFor()` from `@/sanity/image`, which in the deliverable is Sanity's own image-url builder. The
review harness aliases that import to a stub that parses the synthetic ref back into its SHA and
extension and points at `/__mig-asset/` — the prefix the harness mounts its asset handler on, which
looks the SHA up in the media artifact and streams the downloaded file out of the snapshot store:

```ts
// src/scripts/generate/steps/scaffold/url-for.ts
export const SANITY_ASSET_ROUTE_PREFIX = "/__mig-asset/";
const IMAGE_REF = /^image-([a-f0-9]+)-\d+x\d+-([a-z0-9]+)$/;
```

So a component under review renders the actual migrated image, addressed exactly the way it will be
once the asset is uploaded and the reference becomes real — no placeholder, and no dependency on
Sanity's CDN existing yet.

## Source in this repository

- [`src/adapters/webflow/media-normalize.ts`](../src/adapters/webflow/media-normalize.ts) — host
  aliases, variant widths, the 24-hex prefix
- [`src/scripts/assets/steps/media/utils/build-media-assets.ts`](../src/scripts/assets/steps/media/utils/build-media-assets.ts)
  — grouping, download, content de-duplication
- [`src/ir/assets.ts`](../src/ir/assets.ts) — the asset record and the list of reference sources
- [`src/scripts/generate/steps/scaffold/input-value.ts`](../src/scripts/generate/steps/scaffold/input-value.ts)
  — minting the synthetic image and file references
- [`src/scripts/generate/steps/scaffold/url-for.ts`](../src/scripts/generate/steps/scaffold/url-for.ts)
  — the asset route prefix and parsing a synthetic ref back into its SHA and extension
- [`src/scripts/harness/image-stub.ts`](../src/scripts/harness/image-stub.ts) — the `urlFor()` stand-in
  the harness aliases `@/sanity/image` to
- [`src/scripts/harness/asset-handler.ts`](../src/scripts/harness/asset-handler.ts) — serving the
  snapshot bytes for a SHA, mounted on the prefix in
  [`src/scripts/harness/index.ts`](../src/scripts/harness/index.ts)

## Related

- [Reading a Webflow content model from a published site](read-webflow-content-model-from-published-site.md)
  — how these same canonical URLs are found in the first place
- [Webflow sections to Sanity blocks](webflow-sections-to-sanity-blocks.md) — how fields point at
  image and file assets
