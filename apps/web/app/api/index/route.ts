import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getErrorMessage } from "@/app/lib/errors";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
// Use gemini-embedding-001 which is confirmed to be available for this API key
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
    const { url, title, content } = await req.json();
    
    if (!process.env.GEMINI_API_KEY) {
      console.error("API: GEMINI_API_KEY is missing from environment variables.");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500, headers: corsHeaders });
    }

    if (!content) {
      console.warn("API: Received empty content for URL:", url);
      return NextResponse.json({ message: "Empty content ignored" }, { status: 200, headers: corsHeaders });
    }

    console.log("API: Checking for duplicates for:", url);
    const { data: existing, error: checkError } = await supabase
      .from("memories")
      .select("id, content")
      .eq("url", url)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (checkError) {
      console.error("API: Duplicate check error:", checkError.message);
    }

    if (existing && existing.content === content) {
      console.log("API: Exact content already indexed for this URL. Skipping.");
      return NextResponse.json({ message: "Duplicate content skipped" }, { status: 200, headers: corsHeaders });
    }

    console.log("API: Generating embedding for:", url);

    // Generate embedding using Gemini
    let embedding: number[];
    try {
      const result = await model.embedContent(content.substring(0, 30000)); // Truncate to avoid API limits
      embedding = result.embedding.values;
    } catch (geminiError: unknown) {
      const message = getErrorMessage(geminiError);
      console.error("API: Gemini Embedding Error:", message);
      throw new Error(`Gemini failed: ${message}`);
    }

    console.log("API: Inserting into Supabase...");
    const { error: dbError } = await supabase
      .from("memories")
      .insert([{ url, title, content, embedding, type: "page" }]);

    if (dbError) {
      console.error("API: Supabase Error:", dbError.message);
      throw dbError;
    }

    console.log("API: Successfully saved!");
    return NextResponse.json({ message: "Saved!" }, { headers: corsHeaders });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error("API: Final Catch Error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}
