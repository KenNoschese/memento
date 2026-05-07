import { createHash } from "crypto";
import type { MemoryType } from "@/app/lib/types";

/**
 * Normalizes a string field by replacing multiple whitespace characters with a single space
 * and trimming the result.
 * 
 * @param value - The raw string value to normalize.
 * @returns A normalized, trimmed string.
 */
function normalizeField(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

const TRACKING_PARAM_PATTERN = /^(utm_[^=]*|fbclid|gclid)$/i;

/**
 * Produces a canonical version of a URL by stripping tracking parameters and hashes.
 * This ensures that the same page visited with different tracking IDs is treated as a single entity.
 * 
 * @param rawUrl - The raw URL string to canonicalize.
 * @returns A normalized, canonical URL.
 */
export function canonicalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = "";

    const retainedParams = new URLSearchParams();
    for (const [key, value] of url.searchParams.entries()) {
      if (!TRACKING_PARAM_PATTERN.test(key)) {
        retainedParams.append(key, value);
      }
    }

    const search = retainedParams.toString();
    const pathname = url.pathname || "/";
    return `${url.origin}${pathname}${search ? `?${search}` : ""}`;
  } catch {
    return normalizeField(rawUrl);
  }
}

/**
 * Normalizes extracted page text for better processing and embedding.
 * Converts all line endings to \n, trims extra whitespace, and preserves paragraph breaks.
 * 
 * @param value - The raw text content extracted from a page.
 * @returns Cleaned text with consistent paragraph spacing.
 */
export function normalizeExtractedText(
  value: string | null | undefined,
): string {
  const raw = (value ?? "").replace(/\r\n?/g, "\n").trim();
  if (!raw) {
    return "";
  }

  const paragraphs = raw
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return paragraphs.join("\n\n");
}

/**
 * Builds a stable MD5 deduplication key based on the memory type and its primary content.
 * This is used to prevent duplicate entries for the same content in the database.
 * 
 * @param input - The metadata and content used to generate the key.
 * @returns A 32-character hex MD5 hash.
 */
export function buildMemoryDedupeKey(input: {
  type: MemoryType;
  url: string;
  canonicalUrl?: string;
  parentMemoryId?: string | null;
  title?: string | null;
  content?: string | null;
}): string {
  const canonical = [
    input.type,
    normalizeField(input.canonicalUrl ?? canonicalizeUrl(input.url)),
    normalizeField(input.parentMemoryId),
    normalizeField(input.url),
    normalizeField(input.title),
    normalizeField(input.content),
  ].join("\n");

  return createHash("md5").update(canonical).digest("hex");
}

/**
 * Checks if a Supabase/Postgres error is a unique constraint violation (23505).
 * 
 * @param error - The error object returned from a Supabase operation.
 * @returns True if the error is a unique violation.
 */
export function isUniqueViolation(error: {
  code?: string | null;
  message?: string | null;
}): boolean {
  return error.code === "23505";
}
