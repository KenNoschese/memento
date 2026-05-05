import { createHash } from "crypto";
import type { MemoryType } from "@/app/lib/types";

function normalizeField(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

const TRACKING_PARAM_PATTERN = /^(utm_[^=]*|fbclid|gclid)$/i;

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

export function isUniqueViolation(error: {
  code?: string | null;
  message?: string | null;
}): boolean {
  return error.code === "23505";
}
