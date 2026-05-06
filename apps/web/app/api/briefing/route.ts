import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { Groq } from "groq-sdk";
import { getErrorMessage } from "@/app/lib/errors";
import type { BriefingResponse } from "@/app/lib/types";
import { normalizeVoiceNoteAnalysis } from "@/app/lib/voice-note-analysis";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const BRIEFING_MODEL = "llama-3.1-8b-instant";

// Simple in-memory cache, scoped per user id
let cachedBriefing: Map<string, { data: BriefingResponse; timestamp: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Private-Network": "true",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const memento_user_id = url.searchParams.get("memento_user_id")?.trim();

    if (!memento_user_id) {
      return NextResponse.json(
        { error: "memento_user_id is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const cachedEntry = cachedBriefing.get(memento_user_id);

    // Check cache
    if (cachedEntry && Date.now() - cachedEntry.timestamp < CACHE_TTL) {
      console.log("Briefing API: Returning cached briefing for user:", memento_user_id);
      return NextResponse.json(cachedEntry.data, { headers: corsHeaders });
    }

    if (!process.env.GROQ_API_KEY) {
      console.error("Briefing API: GROQ_API_KEY is missing");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500, headers: corsHeaders });
    }

    console.log("Briefing API: Fetching recent memories for user:", memento_user_id);
    const { data: memories, error: dbError } = await supabase
      .from("memories")
      .select("id, title, content, summary, url, created_at")
      .eq("type", "page")
      .eq("user_id", memento_user_id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (dbError) {
      console.error("Briefing API: Supabase Error:", dbError.message);
      throw dbError;
    }

    if (!memories || memories.length === 0) {
      const emptyResponse: BriefingResponse = {
        summary: "No history found yet. Start browsing to generate a briefing!",
        recentUrls: [],
      };
      return NextResponse.json(emptyResponse, { headers: corsHeaders });
    }

    const { data: voiceNotes, error: voiceError } = await supabase
      .from("memories")
      .select("id, parent_memory_id, content, summary, analysis, created_at")
      .eq("type", "voice_note")
      .eq("user_id", memento_user_id)
      .not("analysis", "is", null)
      .order("created_at", { ascending: false })
      .limit(8);

    if (voiceError) {
      console.error("Briefing API: Voice note fetch error:", voiceError.message);
      throw voiceError;
    }

    console.log(`Briefing API: Calling Groq ${BRIEFING_MODEL}...`);
    const context = (memories ?? [])
      .map((memory, index) => {
        const title = memory.title?.trim() || "Untitled";
        const contentSnippet =
          memory.summary?.trim() ||
          memory.content?.trim().slice(0, 800) ||
          "No content captured.";
        return `[${index + 1}] Title: ${title}\nURL: ${memory.url}\nContent snippet: ${contentSnippet}`;
      })
      .join("\n\n");

    const voiceContext = (voiceNotes ?? [])
      .map((note, index) => {
        const analysis = normalizeVoiceNoteAnalysis(note.analysis);
        if (!analysis) {
          return null;
        }

        const summary = note.summary?.trim() || note.content?.trim() || "No transcript captured.";
        const actionItems = analysis.action_items.length
          ? analysis.action_items.join("; ")
          : "none";
        const decisions = analysis.decisions.length
          ? analysis.decisions.join("; ")
          : "none";
        const pageContext = analysis.page_context?.trim() || "No page link noted.";

        return `[V${index + 1}] Summary: ${summary}\nAction items: ${actionItems}\nDecisions: ${decisions}\nPage context: ${pageContext}`;
      })
      .filter((entry): entry is string => Boolean(entry))
      .join("\n\n");

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant providing a 'Daily Briefing' for a user based on their recent web history and voice notes. Summarize their current intent or workflow in 2-3 concise sentences. Mention pending actions or decisions only when they are clearly supported by the context. Do not mention source labels like [1] or [V1].",
        },
        {
          role: "user",
          content: `Here is my recent page history:\n\n${context}\n\nHere are voice-note insights:\n\n${voiceContext || "No voice-note insights available."}`,
        },
      ],
      model: BRIEFING_MODEL,
    });

    const summary = completion.choices[0]?.message?.content || "Could not generate briefing.";
    console.log("Briefing API: Successfully generated summary.");

    const response: BriefingResponse = {
      summary,
      recentUrls: (memories ?? [])
        .map((memory) => memory.url)
        .filter((url): url is string => Boolean(url))
        .slice(0, 3),
    };

    // Update cache
    cachedBriefing.set(memento_user_id, { data: response, timestamp: Date.now() });

    return NextResponse.json(response, { headers: corsHeaders });

  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error("Briefing API: Fatal Error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}
