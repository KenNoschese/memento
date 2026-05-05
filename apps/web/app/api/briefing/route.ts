import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getErrorMessage } from "@/app/lib/errors";
import type { BriefingResponse } from "@/app/lib/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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
    if (!process.env.GEMINI_API_KEY) {
      console.error("Briefing API: GEMINI_API_KEY is missing");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500, headers: corsHeaders });
    }

    console.log("Briefing API: Fetching recent memories...");
    // 1. Fetch last 10 page memories
    const { data: memories, error: dbError } = await supabase
      .from("memories")
      .select("id, title, content, summary, url, created_at")
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

    console.log("Briefing API: Calling Gemini 1.5 Flash...");
    // 2. Prepare context for Gemini
    const context = (memories ?? [])
      .map((memory, index) => {
        const title = memory.title?.trim() || "Untitled";
        const contentSnippet =
          memory.summary?.trim() ||
          memory.content?.trim().slice(0, 1000) ||
          "No content captured.";
        return `[${index + 1}] Title: ${title}\nURL: ${memory.url}\nContent snippet: ${contentSnippet}`;
      })
      .join("\n\n");

    // 3. Call Gemini 1.5 Flash
    const prompt = `You are a helpful assistant providing a 'Daily Briefing' for a user based on their recent web history. 
Summarize their current intent or workflow in 2-3 concise sentences. Focus on what they are trying to achieve. 
Do not mention specific indices like [1] or [2], just provide the narrative summary.

Here is the recent history:
${context}`;

    const result = await model.generateContent(prompt);
    const summary = result.response.text() || "Could not generate briefing.";
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
