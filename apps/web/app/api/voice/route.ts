import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Groq } from "groq-sdk";
import { getErrorMessage } from "@/app/lib/errors";
import { buildMemoryDedupeKey, isUniqueViolation } from "@/app/lib/memories";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const embeddingModel = genAI.getGenerativeModel({
  model: "models/gemini-embedding-001",
});
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Private-Network": "true",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;
    const url = formData.get("url") as string;

    if (!audioFile || !url) {
      return NextResponse.json(
        { error: "Missing data" },
        { status: 400, headers: corsHeaders },
      );
    }

    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3-turbo",
    });

    const text = transcription.text;
    if (!text) {
      return NextResponse.json(
        { message: "Empty transcript" },
        { status: 200, headers: corsHeaders },
      );
    }

    const dedupeKey = buildMemoryDedupeKey({
      type: "voice_note",
      url,
      title: "Voice Note",
      content: text,
    });

    const { data: existing, error: checkError } = await supabase
      .from("memories")
      .select("id")
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();

    if (checkError) {
      console.error("API Voice: Duplicate check error:", checkError.message);
    }

    if (existing) {
      return NextResponse.json(
        { message: "Duplicate content skipped", transcript: text },
        { status: 200, headers: corsHeaders },
      );
    }

    const embeddingResult = await embeddingModel.embedContent(text);
    const embedding = embeddingResult.embedding.values;

    const { error: dbError } = await supabase.from("memories").insert([
      {
        url,
        title: "Voice Note",
        content: text,
        embedding,
        type: "voice_note",
        dedupe_key: dedupeKey,
      },
    ]);

    if (dbError) {
      if (isUniqueViolation(dbError)) {
        return NextResponse.json(
          { message: "Duplicate content skipped", transcript: text },
          { status: 200, headers: corsHeaders },
        );
      }

      throw dbError;
    }

    return NextResponse.json(
      { message: "Saved!", transcript: text },
      { headers: corsHeaders },
    );
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error("API Voice: Fatal error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}
