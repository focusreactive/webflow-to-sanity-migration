import { createHash } from "node:crypto";

const INVALID_RUN_RE = /[^a-zA-Z0-9._-]+/g;
const REPEATED_HYPHEN_RE = /-{2,}/g;
const EDGE_HYPHEN_RE = /^-+|-+$/g;
const MAX_ID_LENGTH = 128;

function slugifyForId(input: string): string {
  return input.replace(INVALID_RUN_RE, "-").replace(REPEATED_HYPHEN_RE, "-").replace(EDGE_HYPHEN_RE, "");
}

function fallbackSuffix(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 8);
}

function sanitizeIdSegment(input: string): string {
  const sanitized = slugifyForId(input);
  return sanitized === "" ? fallbackSuffix(input) : sanitized;
}

function withLengthGuard(id: string): string {
  if (id.length <= MAX_ID_LENGTH) return id;
  const suffix = `-${fallbackSuffix(id)}`;
  return `${id.slice(0, MAX_ID_LENGTH - suffix.length)}${suffix}`;
}

export function documentId(type: string, slug: string): string {
  return withLengthGuard(`${sanitizeIdSegment(type)}.${sanitizeIdSegment(slug)}`);
}

export interface SeedDocRef {
  id: string;
  type: string;
  slug: string;
}

export function assertNoIdCollisions(ids: readonly SeedDocRef[]): void {
  const seen = new Map<string, SeedDocRef>();
  for (const ref of ids) {
    const existing = seen.get(ref.id);
    if (existing !== undefined) {
      throw new Error(
        `${ref.id} is claimed by two documents: ${existing.type}/${existing.slug} and ${ref.type}/${ref.slug}`,
      );
    }
    seen.set(ref.id, ref);
  }
}
