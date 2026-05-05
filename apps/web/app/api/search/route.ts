import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getErrorMessage } from "@/app/lib/errors";
import type { SearchRequest } from "@/app/lib/types";

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
    const { query } = (await req.json()) as SearchRequest;

    if (!query?.trim()) {
      return NextResponse.json(
        { error: "Missing query" },
        { status: 400, headers: corsHeaders },
      );
    }

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
    console.log("Search API: Querying Supabase match_memories...");
    const { data: matches, error: dbError } = await supabase.rpc("match_memories", {
      query_embedding: embedding,
      match_threshold: 0.3, // Lower threshold for better demo results
      match_count: 5,
    });

    if (dbError) {
      console.error("Search API: Supabase RPC Error:", dbError.message);
      throw dbError;
    }

    console.log(`Search API: Found ${matches?.length || 0} matches.`);

    return NextResponse.json({ matches }, { headers: corsHeaders });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error("Search API: Final Catch Error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}
