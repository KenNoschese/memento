import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { Groq } from "groq-sdk";
import { getErrorMessage } from "@/app/lib/errors";
import type { BriefingResponse } from "@/app/lib/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const briefingModel =
  process.env.GROQ_BRIEFING_MODEL || "llama-3.3-70b-versatile";

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

export async function GET() {
  try {
    if (!process.env.GROQ_API_KEY) {
      console.error("Briefing API: GROQ_API_KEY is missing");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500, headers: corsHeaders });
    }

    console.log("Briefing API: Fetching recent memories...");
    // 1. Fetch last 10 page memories
    const { data: memories, error: dbError } = await supabase
      .from("memories")
      .select("id, title, content, url, created_at")
      .eq("type", "page")
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

    console.log("Briefing API: Calling Groq Llama-3...");
    // 2. Prepare context for Groq
    const context = (memories ?? [])
      .map((memory, index) => {
        const title = memory.title?.trim() || "Untitled";
        const contentSnippet = memory.content?.trim().slice(0, 500) || "No content captured.";
        return `[${index + 1}] Title: ${title}\nContent snippet: ${contentSnippet}`;
      })
      .join("\n\n");

    // 3. Call Groq Llama-3
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant providing a 'Morning Briefing' for a user based on their recent web history and voice notes. Summarize their current intent or workflow in 2-3 concise sentences. Focus on what they are trying to achieve. Do not mention the numbers [1], [2], etc., just provide the narrative summary.",
        },
        {
          role: "user",
          content: `Here is my recent history:\n\n${context}`,
        },
      ],
      model: briefingModel,
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
