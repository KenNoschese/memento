import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Groq } from "groq-sdk";
import { getErrorMessage } from "@/app/lib/errors";
import { normalizeVoiceNoteAnalysis } from "@/app/lib/voice-note-analysis";
import type { PageMemoryRecord, VoiceNoteRecord } from "@/app/lib/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const CHAT_MODEL = "llama-3.1-8b-instant";

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
    const { query, memento_user_id } = await req.json();

    if (!query?.trim()) {
      return NextResponse.json({ error: "Missing query" }, { status: 400, headers: corsHeaders });
    }

    if (!memento_user_id?.trim()) {
      return NextResponse.json({ error: "memento_user_id is required" }, { status: 400, headers: corsHeaders });
    }

    const resolvedUserId = memento_user_id.trim();

    // 1. Generate embedding for the query
    let embedding: number[];
    try {
      const result = await embeddingModel.embedContent(query);
      embedding = result.embedding.values;
    } catch (geminiError: unknown) {
      console.error("Chat API: Gemini Embedding Error:", getErrorMessage(geminiError));
      throw new Error(`Gemini failed: ${getErrorMessage(geminiError)}`);
    }

    // 2. Query Supabase for relevant memories
    console.log("Chat API: Querying match_memories with params:", {
      query_embedding_length: embedding.length,
      match_threshold: 0.2,
      match_count: 10,
      p_user_id: resolvedUserId,
    });
    const { data: matches, error: dbError } = await supabase.rpc("match_memories", {
      query_embedding: embedding,
      match_threshold: 0.2, // Lowered threshold for better recall
      match_count: 10,      // Increased count for more context
      p_user_id: resolvedUserId,
    });

    if (dbError) {
      console.error("Chat API: Supabase RPC Error:", dbError.message);
      throw dbError;
    }

    // 3. Format context for Groq
    const sources: PageMemoryRecord[] = matches || [];
    
    // We need to fetch attached voice notes for these sources to provide better context
    const sourceIds = sources.map(s => s.id);
    const { data: voiceNotesData } = await supabase
      .from("memories")
      .select("*")
      .in("parent_memory_id", sourceIds)
      .eq("type", "voice_note")
      .eq("user_id", resolvedUserId);

    const voiceNotesMap = new Map<string, VoiceNoteRecord[]>();
    (voiceNotesData || []).forEach(vn => {
      const parentId = vn.parent_memory_id;
      if (!voiceNotesMap.has(parentId)) voiceNotesMap.set(parentId, []);
      voiceNotesMap.get(parentId)!.push(vn as VoiceNoteRecord);
    });

    const contextParts = sources.map((source, idx) => {
      const notes = voiceNotesMap.get(source.id) || [];
      const notesContext = notes.map(n => {
        const analysis = normalizeVoiceNoteAnalysis(n.analysis);
        return `- Voice Note: "${n.content}"\n  Summary: ${n.summary}\n  Key insights: ${analysis.summary}`;
      }).join("\n");

      return `[Source ${idx + 1}]
Title: ${source.title}
URL: ${source.url}
Summary: ${source.summary}
Content: ${source.content?.substring(0, 1000)}...
${notesContext ? "Attached Notes:\n" + notesContext : ""}`;
    }).join("\n\n---\n\n");

    // 4. Call Groq for synthesized answer
    const prompt = `You are Memento, an AI assistant that answers questions based ONLY on the user's browsing history and voice notes.
      
CONTEXT:
${contextParts || "No relevant memories found."}

USER QUESTION: ${query}

INSTRUCTIONS:
1. Answer the user's question using ONLY the information in the CONTEXT above.
2. If the answer is not in the context, say "I couldn't find that in your recent browsing history." Do not guess.
3. Be concise and conversational.
4. If there are voice notes, mention "you left a voice note saying..."
5. Always cite your sources at the end of your answer using the provided URLs.`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: CHAT_MODEL,
      temperature: 0.1,
    });

    const answer = chatCompletion.choices[0]?.message?.content || "I'm sorry, I couldn't generate an answer.";

    // 5. Final response
    return NextResponse.json({
      answer,
      sources: sources.map(s => ({
        ...s,
        voiceNotes: voiceNotesMap.get(s.id) || []
      }))
    }, { headers: corsHeaders });

  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error("Chat API Error:", message);
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
