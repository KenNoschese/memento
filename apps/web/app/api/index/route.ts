import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getErrorMessage } from "@/app/lib/errors";
import { buildMemoryDedupeKey, isUniqueViolation } from "@/app/lib/memories";

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
    const { url, title, content } = await req.json();
    const dedupeKey = buildMemoryDedupeKey({
      type: "page",
      url,
      title,
      content,
    });

    if (!process.env.GEMINI_API_KEY) {
      console.error(
        "API: GEMINI_API_KEY is missing from environment variables.",
      );
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500, headers: corsHeaders },
      );
    }

    if (!content) {
      console.warn("API: Received empty content for URL:", url);
      return NextResponse.json(
        { message: "Empty content ignored" },
        { status: 200, headers: corsHeaders },
      );
    }

    const { data: existing, error: checkError } = await supabase
      .from("memories")
      .select("id")
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();

    if (checkError) {
      console.error("API: Duplicate check error:", checkError.message);
    }

    if (existing) {
      return NextResponse.json(
        { message: "Duplicate content skipped" },
        { status: 200, headers: corsHeaders },
      );
    }

    let embedding: number[];
    try {
      console.log("API: Generating 3072-dim embedding with gemini-embedding-001...");
      const result = await model.embedContent(content.substring(0, 30000));
      embedding = result.embedding.values;
      console.log("API: Embedding generated. Size:", embedding.length);
    } catch (geminiError: unknown) {
      const message = getErrorMessage(geminiError);
      console.error("API: Gemini Embedding Error:", message);
      throw new Error(`Gemini failed: ${message}`);
    }

    const { error: dbError } = await supabase.from("memories").insert([
      { url, title, content, embedding, type: "page", dedupe_key: dedupeKey },
    ]);

    if (dbError) {
      if (isUniqueViolation(dbError)) {
        return NextResponse.json(
          { message: "Duplicate content skipped" },
          { status: 200, headers: corsHeaders },
        );
      }

      console.error("API: Supabase Error:", dbError.message);
      throw dbError;
    }

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
