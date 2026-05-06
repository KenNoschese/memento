import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getErrorMessage } from "@/app/lib/errors";
import { normalizeVoiceNoteAnalysis } from "@/app/lib/voice-note-analysis";
import type {
  PageMemoryRecord,
  SearchRequest,
  VoiceNoteRecord,
} from "@/app/lib/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Private-Network": "true",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(req: Request) {
  try {
    const { query, memento_user_id } = (await req.json()) as SearchRequest & { memento_user_id?: string };

    if (!query?.trim()) {
      return NextResponse.json(
        { error: "Missing query" },
        { status: 400, headers: corsHeaders },
      );
    }

    if (!memento_user_id?.trim()) {
      return NextResponse.json(
        { error: "memento_user_id is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const resolvedUserId = memento_user_id.trim();
    console.log("Search API: Generating 3072-dim embedding for query:", query);

    // 1. Generate embedding for the search query
    let embedding: number[];
    try {
      const result = await model.embedContent(query);
      embedding = result.embedding.values;
      console.log("Search API: Embedding generated. Size:", embedding.length);
    } catch (geminiError: unknown) {
      const message = getErrorMessage(geminiError);
      console.error("Search API: Gemini Embedding Error:", message);
      throw new Error(`Gemini failed: ${message}`);
    }

    // 2. Query Supabase using RPC
    console.log("Search API: Querying Supabase match_memories for user:", resolvedUserId);
    const { data: matches, error: dbError } = await supabase.rpc("match_memories", {
      query_embedding: embedding,
      match_threshold: 0.3, // Lower threshold for better demo results
      match_count: 10,
      p_user_id: resolvedUserId,
    });

    if (dbError) {
      console.error("Search API: Supabase RPC Error:", dbError.message);
      throw dbError;
    }

    console.log(`Search API: Found ${matches?.length || 0} matches.`);

    type RpcMatch = {
      id: string;
      parent_memory_id: string | null;
      url: string;
      canonical_url: string;
      title: string | null;
      content: string | null;
      summary?: string | null;
      tags?: string[] | null;
      folder_id?: string | null;
      audio: string | null;
      embedding: number[] | string | null;
      type: "page" | "voice_note";
      is_placeholder: boolean;
      analysis?: unknown;
      similarity: number;
    };

    const groupedMatchIds = new Set<string>();
    const matchedVoiceNoteIdsByPage = new Map<string, string[]>();

    for (const match of (matches ?? []) as RpcMatch[]) {
      const pageId = match.parent_memory_id ?? match.id;
      groupedMatchIds.add(pageId);

      if (match.type === "voice_note" && match.parent_memory_id) {
        const existing = matchedVoiceNoteIdsByPage.get(match.parent_memory_id) ?? [];
        existing.push(match.id);
        matchedVoiceNoteIdsByPage.set(match.parent_memory_id, existing);
      }
    }

    const pageIds = [...groupedMatchIds];
    if (pageIds.length === 0) {
      return NextResponse.json({ matches: [] }, { headers: corsHeaders });
    }

    const { data: pages, error: pageError } = await supabase
      .from("memories")
      .select("id, url, canonical_url, title, content, summary, tags, folder_id, created_at, embedding, type, audio, parent_memory_id, is_placeholder, analysis")
      .eq("type", "page")
      .eq("user_id", resolvedUserId)
      .in("id", pageIds);

    if (pageError) {
      throw pageError;
    }

    const { data: voiceNotes, error: voiceError } = await supabase
      .from("memories")
      .select("id, url, canonical_url, title, content, summary, tags, folder_id, created_at, embedding, type, audio, parent_memory_id, is_placeholder, analysis")
      .eq("type", "voice_note")
      .eq("user_id", resolvedUserId)
      .in("parent_memory_id", pageIds)
      .order("created_at", { ascending: false });

    if (voiceError) {
      throw voiceError;
    }

    const voiceNotesByPageId = new Map<string, VoiceNoteRecord[]>();
    for (const note of voiceNotes ?? []) {
      if (!note.parent_memory_id) {
        continue;
      }

      const record: VoiceNoteRecord = {
        ...note,
        type: "voice_note",
        parent_memory_id: note.parent_memory_id,
        analysis: normalizeVoiceNoteAnalysis(note.analysis),
        matched_in_search: (matchedVoiceNoteIdsByPage.get(note.parent_memory_id) ?? []).includes(note.id),
      };

      const existing = voiceNotesByPageId.get(note.parent_memory_id) ?? [];
      existing.push(record);
      voiceNotesByPageId.set(note.parent_memory_id, existing);
    }

    const pageOrder = new Map<string, number>();
    pageIds.forEach((id, index) => pageOrder.set(id, index));

    const pageMatches: PageMemoryRecord[] = (pages ?? [])
      .map((page) => ({
        ...page,
        type: "page" as const,
        parent_memory_id: null,
        is_placeholder: Boolean(page.is_placeholder),
        analysis: normalizeVoiceNoteAnalysis(page.analysis),
        voiceNotes: voiceNotesByPageId.get(page.id) ?? [],
        matchedVoiceNoteIds: matchedVoiceNoteIdsByPage.get(page.id) ?? [],
      }))
      .sort((a, b) => (pageOrder.get(a.id) ?? 0) - (pageOrder.get(b.id) ?? 0));

    return NextResponse.json({ matches: pageMatches }, { headers: corsHeaders });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error("Search API: Final Catch Error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}
