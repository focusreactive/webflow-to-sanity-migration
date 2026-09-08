import {
  parseImageRef,
  SANITY_ASSET_ROUTE_PREFIX,
  URL_FOR_CHAIN,
} from "#generate/steps/scaffold/url-for.ts";

export { URL_FOR_CHAIN };

export interface UrlForBuilder {
  width(value: number): UrlForBuilder;
  height(value: number): UrlForBuilder;
  format(value: string): UrlForBuilder;
  quality(value: number): UrlForBuilder;
  fit(value: string): UrlForBuilder;
  url(): string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function refOf(source: unknown): string | undefined {
  if (!isRecord(source) || !isRecord(source["asset"])) return undefined;
  const ref = source["asset"]["_ref"];
  return typeof ref === "string" ? ref : undefined;
}

export function urlFor(source: unknown): UrlForBuilder {
  const ref = refOf(source);

  const builder: UrlForBuilder = {
    width: () => builder,
    height: () => builder,
    format: () => builder,
    quality: () => builder,
    fit: () => builder,
    url: () => {
      const parsed = ref === undefined ? undefined : parseImageRef(ref);
      return parsed === undefined ? "" : `${SANITY_ASSET_ROUTE_PREFIX}${parsed.sha}.${parsed.ext}`;
    },
  };

  return builder;
}
