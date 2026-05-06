import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getErrorMessage } from "@/app/lib/errors";
import {
  canonicalizeUrl,
  isUniqueViolation,
  normalizeExtractedText,
} from "@/app/lib/memories";
import { generatePageSummary } from "@/app/lib/page-summaries";
import {
  buildPageMemoryDedupeKey,
  findPageMemoryByCanonicalUrl,
} from "@/app/lib/page-memories";

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
    const { url, title, content, memento_user_id } = await req.json();

    if (!memento_user_id?.trim()) {
      return NextResponse.json(
        { error: "memento_user_id is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const resolvedUserId = memento_user_id.trim();
    console.log("API received data for user:", resolvedUserId);
    const normalizedContent = normalizeExtractedText(content);
    const canonicalUrl = canonicalizeUrl(url);
    const dedupeKey = buildPageMemoryDedupeKey({
      url,
      canonicalUrl,
      title,
      content: normalizedContent,
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

    if (!normalizedContent) {
      console.warn("API: Received empty content for URL:", url);
      return NextResponse.json(
        { message: "Empty content ignored" },
        { status: 200, headers: corsHeaders },
      );
    }

    const existingPage = await findPageMemoryByCanonicalUrl(supabase, canonicalUrl);
    if (existingPage?.dedupe_key === dedupeKey && !existingPage.is_placeholder) {
      return NextResponse.json(
        { message: "Duplicate content skipped" },
        { status: 200, headers: corsHeaders },
      );
    }

    let embedding: number[];
    try {
      console.log("API: Generating 3072-dim embedding with gemini-embedding-001...");
      const result = await model.embedContent(
        normalizedContent.substring(0, 30000),
      );
      embedding = result.embedding.values;
      console.log("API: Embedding generated. Size:", embedding.length);
    } catch (geminiError: unknown) {
      const message = getErrorMessage(geminiError);
      console.error("API: Gemini Embedding Error:", message);
      throw new Error(`Gemini failed: ${message}`);
    }

    let summary: string | null = null;
    let tags: string[] = [];
    try {
      const summaryResult = await generatePageSummary({
        url,
        title,
        content: normalizedContent,
      });
      summary = summaryResult.summary;
      tags = summaryResult.tags;
    } catch (summaryError: unknown) {
      console.warn(
        "API: Page summary generation failed:",
        getErrorMessage(summaryError),
      );
    }

    // Just-in-time user creation: ensure the user exists before inserting memory
    try {
      console.log("API: Attempting to upsert user:", resolvedUserId);
      await supabase.from("users").upsert({ id: resolvedUserId }).select();
      console.log("API: User upserted successfully");
    } catch (userError: unknown) {
      console.warn(
        "API: User upsert failed (will attempt memory save anyway):",
        getErrorMessage(userError),
      );
    }

    const pageValues = {
      url,
      canonical_url: canonicalUrl,
      title,
      content: normalizedContent,
      summary,
      tags,
      embedding,
      type: "page" as const,
      dedupe_key: dedupeKey,
      is_placeholder: false,
      user_id: resolvedUserId,
    };

    const dbError = existingPage
      ? (
          await supabase
            .from("memories")
            .update(pageValues)
            .eq("id", existingPage.id)
        ).error
      : (await supabase.from("memories").insert([pageValues])).error;

    if (dbError) {
      if (isUniqueViolation(dbError)) {
        const attachedPage = await findPageMemoryByCanonicalUrl(supabase, canonicalUrl);
        if (attachedPage) {
          const { error: updateError } = await supabase
            .from("memories")
            .update(pageValues)
            .eq("id", attachedPage.id);

          if (!updateError) {
            return NextResponse.json({ message: "Saved!" }, { headers: corsHeaders });
          }
        }

        return NextResponse.json({ message: "Duplicate content skipped" }, { status: 200, headers: corsHeaders });
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
