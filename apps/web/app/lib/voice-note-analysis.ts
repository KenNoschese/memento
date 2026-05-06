import { Groq } from "groq-sdk";
import type { VoiceNoteAnalysis } from "@/app/lib/types";

const groqApiKey = process.env.GROQ_API_KEY;
const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null;

export const DEFAULT_VOICE_ANALYSIS_MODEL =
  process.env.GROQ_VOICE_ANALYSIS_MODEL || "llama-3.1-8b-instant";

export type VoiceNoteAnalysisResult = {
  summary: string | null;
  tags: string[];
  analysis: VoiceNoteAnalysis | null;
};

function sanitizeStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

export function normalizeVoiceNoteAnalysis(
  value: unknown,
): VoiceNoteAnalysis | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const model =
    typeof record.model === "string" ? record.model.trim() : "";
  const generatedAt =
    typeof record.generated_at === "string" ? record.generated_at.trim() : "";

  if (!model || !generatedAt) {
    return null;
  }

  return {
    action_items: sanitizeStringList(record.action_items, 5),
    decisions: sanitizeStringList(record.decisions, 3),
    page_context:
      typeof record.page_context === "string" && record.page_context.trim()
        ? record.page_context.trim()
        : null,
    model,
    generated_at: generatedAt,
  };
}

function normalizeTags(value: unknown): string[] {
  return sanitizeStringList(value, 5);
}

export async function generateVoiceNoteAnalysis(input: {
  title?: string | null;
  url: string;
  transcript: string;
}): Promise<VoiceNoteAnalysisResult> {
  if (!groq || !input.transcript.trim()) {
    return { summary: null, tags: [], analysis: null };
  }

  const title = input.title?.trim() || "Untitled";
  const transcript = input.transcript.trim().slice(0, 12000);

  const prompt = `You analyze voice notes for a browsing memory app.
Return JSON only with these fields:
- summary: string | null
- tags: string[]
- action_items: string[]
- decisions: string[]
- page_context: string | null

Rules:
- Base everything strictly on the transcript. Do not invent tasks or decisions.
- summary should be 1 to 3 short sentences about the main point of the note.
- action_items should contain at most 5 short concrete follow-ups.
- decisions should contain at most 3 short resolved choices or conclusions.
- page_context should be 1 short sentence explaining how the note relates to the current page, or null if unclear.
- tags should be 0 to 5 broad labels useful for filtering.
- Use empty arrays when there are no action items, decisions, or tags.
- Return valid JSON with no markdown or extra text.

Page title: ${title}
Page URL: ${input.url}

Transcript:
${transcript}`;

  try {
    const completion = await groq.chat.completions.create({
      model: DEFAULT_VOICE_ANALYSIS_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You analyze voice notes for a browsing memory app. Return JSON only. Do not use markdown or extra text.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });
    const raw = completion.choices[0]?.message?.content?.trim() || "{}";
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const analysis = normalizeVoiceNoteAnalysis({
      action_items: parsed.action_items,
      decisions: parsed.decisions,
      page_context: parsed.page_context,
      model: DEFAULT_VOICE_ANALYSIS_MODEL,
      generated_at: new Date().toISOString(),
    });

    return {
      summary:
        typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim()
          : null,
      tags: normalizeTags(parsed.tags),
      analysis,
    };
  } catch (error) {
    console.error("Groq voice-note analysis failed", error);
    return { summary: null, tags: [], analysis: null };
  }
}
