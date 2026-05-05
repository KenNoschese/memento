import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMemoryDedupeKey, canonicalizeUrl } from "@/app/lib/memories";

export type PageMemoryRow = {
  id: string;
  url: string;
  canonical_url: string;
  title: string | null;
  dedupe_key: string | null;
  is_placeholder: boolean;
};

export function buildPageMemoryDedupeKey(input: {
  url: string;
  canonicalUrl?: string;
  title?: string | null;
  content?: string | null;
}): string {
  return buildMemoryDedupeKey({
    type: "page",
    url: input.url,
    canonicalUrl: input.canonicalUrl,
    title: input.title,
    content: input.content,
  });
}

export async function findPageMemoryByCanonicalUrl(
  supabase: SupabaseClient,
  canonicalUrl: string,
): Promise<PageMemoryRow | null> {
  const query = supabase
    .from("memories")
    .select("id, url, canonical_url, title, dedupe_key, is_placeholder")
    .eq("type", "page")
    .eq("canonical_url", canonicalUrl);
  const { data, error } = await query.maybeSingle<PageMemoryRow>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function ensurePageMemoryAttachment(
  supabase: SupabaseClient,
  input: {
    url: string;
    title?: string | null;
  },
): Promise<PageMemoryRow> {
  const canonicalUrl = canonicalizeUrl(input.url);
  const existing = await findPageMemoryByCanonicalUrl(supabase, canonicalUrl);

  if (existing) {
    return existing;
  }

  const dedupeKey = buildPageMemoryDedupeKey({
    url: input.url,
    canonicalUrl,
    title: input.title,
    content: null,
  });

  const insertQuery = supabase
    .from("memories")
    .insert([
      {
        url: input.url,
        canonical_url: canonicalUrl,
        title: input.title?.trim() || "Untitled Page",
        content: null,
        embedding: null,
        type: "page",
        dedupe_key: dedupeKey,
        is_placeholder: true,
      },
    ])
    .select("id, url, canonical_url, title, dedupe_key, is_placeholder");
  const { data, error } = await insertQuery.single<PageMemoryRow>();

  if (!error) {
    return data;
  }

  const fallback = await findPageMemoryByCanonicalUrl(supabase, canonicalUrl);
  if (fallback) {
    return fallback;
  }

  throw error;
}
