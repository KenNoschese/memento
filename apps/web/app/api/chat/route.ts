import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getErrorMessage } from "@/app/lib/errors";
import { normalizeVoiceNoteAnalysis } from "@/app/lib/voice-note-analysis";
import type { PageMemoryRecord, VoiceNoteRecord } from "@/app/lib/types";

type MemoryTagsRow = {
  tags: string[] | null;
};

type ChatAnswerPayload = {
  answer: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
const primaryChatModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const fallbackChatModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

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

function isGeminiRateLimitError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("429") ||
    message.includes("quota") ||
    message.includes("rate limit") ||
    message.includes("resource exhausted") ||
    message.includes("resource_exhausted")
  );
}

async function generateChatText(
  prompt: string,
  {
    systemInstruction,
    temperature = 0,
  }: {
    systemInstruction?: string;
    temperature?: number;
  } = {},
) {
  const attempts = [
    { label: "gemini-2.5-flash", model: primaryChatModel },
    { label: "gemini-2.5-flash-lite", model: fallbackChatModel },
  ];

  let lastError: unknown;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];

    try {
      const result = await attempt.model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature },
        ...(systemInstruction
          ? {
              systemInstruction: {
                role: "system",
                parts: [{ text: systemInstruction }],
              },
            }
          : {}),
      });

      const text = result.response.text().trim();
      if (!text) {
        throw new Error(`Gemini ${attempt.label} returned an empty response`);
      }

      return { text, model: attempt.label };
    } catch (error: unknown) {
      lastError = error;

      if (index === attempts.length - 1 || !isGeminiRateLimitError(error)) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("Gemini chat generation failed");
}

function stripCodeFence(text: string) {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseChatAnswerPayload(text: string): ChatAnswerPayload | null {
  try {
    const parsed = JSON.parse(stripCodeFence(text)) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const answer =
      "answer" in parsed && typeof parsed.answer === "string"
        ? parsed.answer.trim()
        : "";

    if (!answer) {
      return null;
    }

    return {
      answer,
    };
  } catch {
    return null;
  }
}

function extractCitedSourceTokens(answer: string) {
  const matches = answer.match(/\[S\d+\]/g) ?? [];
  return Array.from(new Set(matches.map((match) => match.slice(1, -1))));
}

function stripSourceCitations(answer: string) {
  return answer
    .replace(/\s*\[S\d+\]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(req: Request) {
  try {
    const { query, history, memento_user_id } = await req.json();

    if (!query?.trim()) {
      return NextResponse.json({ error: "Missing query" }, { status: 400, headers: corsHeaders });
    }

    if (!memento_user_id?.trim()) {
      return NextResponse.json({ error: "memento_user_id is required" }, { status: 400, headers: corsHeaders });
    }

    const resolvedUserId = memento_user_id.trim();

    // 0. Condense query if history exists for better RAG retrieval
    let standaloneQuery = query.trim();
    if (history && history.length > 0) {
      const condensePrompt = `Given the following conversation and a follow-up question, rephrase the follow-up question to be a standalone search query that contains all necessary context. Do not answer the question, just rephrase it.
      
Chat History:
${history.map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join("\n")}

Follow-up Question: ${query}

Standalone search query:`;

      try {
        const condenseResponse = await generateChatText(condensePrompt, {
          temperature: 0,
        });
        standaloneQuery = condenseResponse.text;
        console.log(
          "Chat API: Condensed query with model:",
          condenseResponse.model,
          standaloneQuery,
        );
      } catch (condenseError: unknown) {
        console.warn(
          "Chat API: Failed to condense query, using raw query:",
          getErrorMessage(condenseError),
        );
      }
    }

    // 1. Generate embedding for the (condensed) query
    let embedding: number[];
    try {
      const result = await embeddingModel.embedContent(standaloneQuery);
      embedding = result.embedding.values;
    } catch (geminiError: unknown) {
      console.error("Chat API: Gemini Embedding Error:", getErrorMessage(geminiError));
      throw new Error(`Gemini failed: ${getErrorMessage(geminiError)}`);
    }

    // 2. Query Supabase for relevant memories
    console.log("Chat API: Querying match_memories with standalone query:", standaloneQuery);
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

    // 3. Format context for Gemini
    
    // Group search hits by parent page for better organization
    const groupedMatchIds = new Set<string>();
    for (const match of (matches || [])) {
      const pageId = match.parent_memory_id ?? match.id;
      groupedMatchIds.add(pageId);
    }
    const pageIds = Array.from(groupedMatchIds);
    const pageOrder = new Map<string, number>();
    pageIds.forEach((id, index) => pageOrder.set(id, index));

    const { data: fullPages, error: pagesError } =
      pageIds.length > 0
        ? await supabase
            .from("memories")
            .select("*")
            .eq("type", "page")
            .eq("user_id", resolvedUserId)
            .in("id", pageIds)
        : { data: [], error: null };

    if (pagesError) {
      console.error("Chat API: Error fetching full pages:", pagesError.message);
      throw pagesError;
    }

    const sources: PageMemoryRecord[] = (fullPages || [])
      .map((page) => ({
        ...page,
        type: "page" as const,
        parent_memory_id: null,
        is_placeholder: Boolean(page.is_placeholder),
        analysis: normalizeVoiceNoteAnalysis(page.analysis),
        voiceNotes: [],
      }))
      .sort((left, right) => {
        return (pageOrder.get(left.id) ?? 0) - (pageOrder.get(right.id) ?? 0);
      });

    // Fetch Workspace Summary: All folders with item counts
    const { data: workspaceFolders } = await supabase
      .from("folders")
      .select("id, name")
      .eq("user_id", resolvedUserId);
    
    const folderCounts: Record<string, number> = {};
    if (workspaceFolders) {
      const { data: allMemoriesWithFolders } = await supabase
        .from("memories")
        .select("folder_id")
        .eq("user_id", resolvedUserId)
        .not("folder_id", "is", null);
      
      (allMemoriesWithFolders || []).forEach(m => {
        if (m.folder_id) folderCounts[m.folder_id] = (folderCounts[m.folder_id] || 0) + 1;
      });
    }

    // Fetch all unique tags across the workspace
    const { data: tagData } = await supabase
      .from("memories")
      .select("tags")
      .eq("user_id", resolvedUserId)
      .not("tags", "is", null);
    
    const allTags = new Set<string>();
    (tagData || []).forEach((memory: MemoryTagsRow) => {
      memory.tags?.forEach((tag) => allTags.add(tag));
    });

    const workspaceSummary = {
      folders: (workspaceFolders || []).map(f => ({
        name: f.name,
        count: folderCounts[f.id] || 0
      })),
      tags: Array.from(allTags)
    };

    const foldersMap = new Map<string, string>();
    (workspaceFolders || []).forEach(f => foldersMap.set(f.id, f.name));

    // Fetch attached voice notes
    const sourceIds = sources.map(s => s.id);
    const { data: voiceNotesData } =
      sourceIds.length > 0
        ? await supabase
            .from("memories")
            .select("*")
            .in("parent_memory_id", sourceIds)
            .eq("type", "voice_note")
            .eq("user_id", resolvedUserId)
        : { data: [] };

    const voiceNotesMap = new Map<string, VoiceNoteRecord[]>();
    (voiceNotesData || []).forEach(vn => {
      const parentId = vn.parent_memory_id;
      if (!voiceNotesMap.has(parentId)) voiceNotesMap.set(parentId, []);
      voiceNotesMap.get(parentId)!.push(vn as VoiceNoteRecord);
    });

    const sourceIdByToken = new Map<string, string>();
    const contextParts = sources.map((source, idx) => {
      const sourceToken = `S${idx + 1}`;
      sourceIdByToken.set(sourceToken, source.id);
      const folderName = source.folder_id ? foldersMap.get(source.folder_id) : "None (Unorganized)";
      const notes = voiceNotesMap.get(source.id) || [];
      const notesContext = notes.map(n => {
        const analysis = normalizeVoiceNoteAnalysis(n.analysis);
        const insights = analysis 
          ? `Action items: ${analysis.action_items.join("; ") || "none"}. Decisions: ${analysis.decisions.join("; ") || "none"}.`
          : "No detailed analysis.";
        return `- Voice Note: "${n.content}"\n  Summary: ${n.summary}\n  Key insights: ${insights}`;
      }).join("\n");

      return `[${sourceToken}]
Title: ${source.title}
URL: ${source.url}
Folder: ${folderName}
Summary: ${source.summary}
Content: ${source.content?.substring(0, 1200)}...
${notesContext ? "Attached Voice Notes for this page:\n" + notesContext : "No voice notes for this page."}`;
    }).join("\n\n---\n\n");

    const currentDate = new Date().toLocaleDateString();

    // 4. Call Gemini for synthesized answer
    const prompt = `Answer the user's question using ONLY the information in the CONTEXT and USER WORKSPACE STRUCTURE below.
      
CURRENT DATE: ${currentDate}

USER WORKSPACE STRUCTURE (Folders & Tags):
- Folders: ${workspaceSummary.folders.map(f => `${f.name} (${f.count} items)`).join(", ") || "No folders created."}
- Tags: ${workspaceSummary.tags.join(", ") || "No tags generated."}

CONTEXT (Relevant Memories from Search):
${contextParts || "No relevant memories found."}

INSTRUCTIONS:
1. Answer using ONLY the information provided.
2. If the user asks about a specific folder or what is "in" it, use the WORKSPACE STRUCTURE to confirm if the folder exists and how many items are in it.
3. If the search results (CONTEXT) don't show the items for a folder the user mentioned, explain that you can see the folder exists in their workspace but the specific items weren't retrieved in the top search results.
4. If the answer is not in the context, say "I couldn't find that in your recent browsing history." Do not guess.
5. Be concise and conversational.
6. Return valid JSON only in this shape: {"answer":"string"}.
7. In the answer string, add inline citations using the exact source token for every claim you make, for example [S1].
8. Cite the minimum number of sources needed. If one source supports the answer, cite only one source.
9. If the answer is not supported by the context, reply exactly "I couldn't find that in your recent browsing history." with no citations.
10. Do not include URLs or a separate source list in the answer text.`;

    const conversationTranscript = (history || [])
      .map(
        (m: { role: "user" | "assistant"; content: string }) =>
          `${m.role}: ${m.content}`,
      )
      .join("\n");

    const chatResponse = await generateChatText(
      `Conversation History:
${conversationTranscript || "No prior conversation."}

USER QUESTION: ${query}

${prompt}`,
      {
        systemInstruction:
          "You are Memento, an AI assistant grounded in the user's browsing history and workspace. Use the conversation history to maintain context.",
        temperature: 0,
      },
    );

    console.log("Chat API: Answer generated with model:", chatResponse.model);

    const parsedAnswer = parseChatAnswerPayload(chatResponse.text);
    const answerWithCitations =
      parsedAnswer?.answer || chatResponse.text || "I'm sorry, I couldn't generate an answer.";
    const answer = stripSourceCitations(answerWithCitations);
    const citedSourceTokens = extractCitedSourceTokens(answerWithCitations);
    const groundedSourceIds = new Set<string>();
    for (const sourceToken of citedSourceTokens) {
      const sourceId = sourceIdByToken.get(sourceToken);
      if (sourceId) {
        groundedSourceIds.add(sourceId);
      }
    }

    if (
      answer === "I couldn't find that in your recent browsing history."
    ) {
      groundedSourceIds.clear();
    }

    const groundedSources = sources
      .filter((source) => groundedSourceIds.has(source.id))
      .map((source) => ({
        ...source,
        voiceNotes: voiceNotesMap.get(source.id) || [],
      }));

    // 5. Final response
    return NextResponse.json(
      {
        answer,
        sources: groundedSources,
      },
      { headers: corsHeaders },
    );

  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error("Chat API Error:", message);
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
