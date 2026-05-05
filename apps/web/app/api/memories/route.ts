import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getErrorMessage } from "@/app/lib/errors";
import type {
  PageMemoryRecord,
  VoiceNoteRecord,
} from "@/app/lib/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Private-Network": "true",
};

function normalizeEmbedding(
  embedding: PageMemoryRecord["embedding"],
): number[] | null {
  if (!embedding) {
    return null;
  }

  if (Array.isArray(embedding)) {
    return embedding.filter((value): value is number => typeof value === "number");
  }

  if (typeof embedding !== "string") {
    return null;
  }

  const trimmed = embedding.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed.filter((value): value is number => typeof value === "number");
  } catch {
    return null;
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET() {
  try {
    const { data: pageData, error: pageError } = await supabase
      .from("memories")
      .select("id, url, canonical_url, title, content, summary, created_at, embedding, type, audio, parent_memory_id, is_placeholder")
      .eq("type", "page")
      .order("created_at", { ascending: false })
      .limit(100);

    if (pageError) {
      throw pageError;
    }

    const pageIds = (pageData ?? []).map((memory) => memory.id);

    const { data: voiceData, error: voiceError } = pageIds.length
      ? await supabase
          .from("memories")
          .select("id, url, canonical_url, title, content, summary, created_at, embedding, type, audio, parent_memory_id, is_placeholder")
          .eq("type", "voice_note")
          .in("parent_memory_id", pageIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null };

    if (voiceError) {
      throw voiceError;
    }

    const voiceNotesByPageId = new Map<string, VoiceNoteRecord[]>();
    for (const memory of voiceData ?? []) {
      if (!memory.parent_memory_id) {
        continue;
      }

      const note: VoiceNoteRecord = {
        ...memory,
        embedding: normalizeEmbedding(memory.embedding),
        type: "voice_note",
        parent_memory_id: memory.parent_memory_id,
      };

      const existing = voiceNotesByPageId.get(memory.parent_memory_id) ?? [];
      existing.push(note);
      voiceNotesByPageId.set(memory.parent_memory_id, existing);
    }

    const memories: PageMemoryRecord[] = (pageData ?? []).map((memory) => ({
      ...memory,
      embedding: normalizeEmbedding(memory.embedding),
      type: "page",
      parent_memory_id: null,
      is_placeholder: Boolean(memory.is_placeholder),
      voiceNotes: voiceNotesByPageId.get(memory.id) ?? [],
    }));

    return NextResponse.json({ memories }, { headers: corsHeaders });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = (await req.json()) as { id?: string };

    if (!id) {
      return NextResponse.json(
        { error: "Memory id is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const { error } = await supabase.from("memories").delete().eq("id", id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}
