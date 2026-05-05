import { createHash } from "crypto";
import type { MemoryType } from "@/app/lib/types";

function normalizeField(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function buildMemoryDedupeKey(input: {
  type: MemoryType;
  url: string;
  title?: string | null;
  content?: string | null;
}): string {
  const canonical = [
    input.type,
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
