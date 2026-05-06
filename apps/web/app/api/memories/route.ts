import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getErrorMessage } from "@/app/lib/errors";
import type {
  PageMemoryRecord,
  ThreadSummary,
  VoiceNoteRecord,
} from "@/app/lib/types";
import { normalizeVoiceNoteAnalysis } from "@/app/lib/voice-note-analysis";
import { buildThreadMetadata } from "@/app/lib/workflow";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, DELETE, OPTIONS",
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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("memento_user_id")?.trim();

    let pageQuery = supabase
      .from("memories")
      .select("id, url, canonical_url, title, content, summary, tags, folder_id, created_at, embedding, type, audio, parent_memory_id, is_placeholder, analysis")
      .eq("type", "page")
      .order("created_at", { ascending: false })
      .limit(100);

    if (userId) {
      pageQuery = pageQuery.eq("user_id", userId);
    }

    const { data: pageData, error: pageError } = await pageQuery;

    if (pageError) {
      throw pageError;
    }

    const pageIds = (pageData ?? []).map((memory) => memory.id);

    const voiceResult = pageIds.length
      ? userId
        ? await supabase
            .from("memories")
            .select("id, url, canonical_url, title, content, summary, tags, folder_id, created_at, embedding, type, audio, parent_memory_id, is_placeholder, analysis")
            .eq("type", "voice_note")
            .in("parent_memory_id", pageIds)
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
        : await supabase
            .from("memories")
            .select("id, url, canonical_url, title, content, summary, tags, folder_id, created_at, embedding, type, audio, parent_memory_id, is_placeholder, analysis")
            .eq("type", "voice_note")
            .in("parent_memory_id", pageIds)
            .order("created_at", { ascending: false })
      : { data: [], error: null };

    const voiceData = voiceResult.data ?? [];
    const voiceError = voiceResult.error;

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
        analysis: normalizeVoiceNoteAnalysis(memory.analysis),
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
      analysis: normalizeVoiceNoteAnalysis(memory.analysis),
      type: "page",
      parent_memory_id: null,
      is_placeholder: Boolean(memory.is_placeholder),
      voiceNotes: voiceNotesByPageId.get(memory.id) ?? [],
    }));

    const folderNamesById = new Map<string, string>();
    if (userId) {
      const { data: folderData, error: folderError } = await supabase
        .from("folders")
        .select("id, name")
        .eq("user_id", userId);

      if (folderError) {
        throw folderError;
      }

      for (const folder of folderData ?? []) {
        folderNamesById.set(folder.id, folder.name);
      }
    }

    const threaded = buildThreadMetadata(memories, folderNamesById);

    return NextResponse.json(
      {
        memories: threaded.memories,
        threads: threaded.threads satisfies ThreadSummary[],
      },
      { headers: corsHeaders },
    );
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, folder_id } = await req.json();

    if (!id) {
      return NextResponse.json(
        { error: "Memory id is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const { error } = await supabase
      .from("memories")
      .update({ folder_id: folder_id || null })
      .eq("id", id);

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
