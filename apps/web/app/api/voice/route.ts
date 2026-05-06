import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Groq } from "groq-sdk";
import { getErrorMessage } from "@/app/lib/errors";
import { buildMemoryDedupeKey, canonicalizeUrl, isUniqueViolation } from "@/app/lib/memories";
import { ensurePageMemoryAttachment } from "@/app/lib/page-memories";
import { generateVoiceNoteAnalysis } from "@/app/lib/voice-note-analysis";

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
    console.log("API Voice: Request received");
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;
    const url = formData.get("url") as string;
    const title = formData.get("title") as string | null;

    if (!audioFile || !url) {
      console.error("API Voice: Missing audio or URL");
      return NextResponse.json(
        { error: "Missing data" },
        { status: 400, headers: corsHeaders },
      );
    }

    if (audioFile.size < 2000) {
      console.log(`API Voice: Audio file too small (${audioFile.size} bytes), likely silence. Skipping.`);
      return NextResponse.json(
        { message: "Audio too short or silent", transcript: "" },
        { status: 200, headers: corsHeaders },
      );
    }

    // Convert audio to Base64 for storage
    console.log("API Voice: Converting audio to Base64...");
    const bytes = await audioFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const audioB64 = `data:${audioFile.type};base64,${buffer.toString("base64")}`;

    console.log(`API Voice: Transcribing audio (${audioFile.size} bytes)...`);
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3-turbo",
      temperature: 0,
      prompt: "Voice note.",
    });

    const text = transcription.text?.trim() || "";
    console.log("API Voice: Transcript received:", text);

    // Filter Whisper hallucinations
    if (/^(thank you\.?|thanks for watching\.?|thanks\.?|you\.?|th\.?)$/i.test(text)) {
      console.log("API Voice: Hallucination detected and filtered.");
      return NextResponse.json(
        { message: "Empty transcript", transcript: "" },
        { status: 200, headers: corsHeaders },
      );
    }
    
    if (!text) {
      console.log("API Voice: Text is empty, skipping save.");
      return NextResponse.json(
        { message: "Empty transcript" },
        { status: 200, headers: corsHeaders },
      );
    }

    const canonicalUrl = canonicalizeUrl(url);
    const pageMemory = await ensurePageMemoryAttachment(supabase, { url, title });

    const dedupeKey = buildMemoryDedupeKey({
      type: "voice_note",
      url,
      canonicalUrl,
      parentMemoryId: pageMemory.id,
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
      console.log("API Voice: Duplicate found, skipping save.");
      return NextResponse.json(
        { message: "Duplicate content skipped", transcript: text },
        { status: 200, headers: corsHeaders },
      );
    }

    console.log("API Voice: Generating 3072-dim embedding...");
    const embeddingResult = await embeddingModel.embedContent(text);
    const embedding = embeddingResult.embedding.values;
    console.log("API Voice: Embedding size:", embedding.length);

    let summary: string | null = null;
    let tags: string[] = [];
    let analysis = null;
    try {
      const analysisResult = await generateVoiceNoteAnalysis({
        url,
        title,
        transcript: text,
      });
      summary = analysisResult.summary;
      tags = analysisResult.tags;
      analysis = analysisResult.analysis;
    } catch (tagError: unknown) {
      console.warn("API Voice: Transcript analysis failed:", getErrorMessage(tagError));
    }

    console.log("API Voice: Inserting into Supabase...");
    const { error: dbError } = await supabase.from("memories").insert([
      {
        url,
        canonical_url: canonicalUrl,
        title: "Voice Note",
        content: text,
        summary,
        audio: audioB64,
        embedding,
        type: "voice_note",
        parent_memory_id: pageMemory.id,
        is_placeholder: false,
        dedupe_key: dedupeKey,
        tags,
        analysis,
      },
    ]);

    if (dbError) {
      console.error("API Voice: Supabase Error:", dbError.message, dbError.code);
      if (isUniqueViolation(dbError)) {
        return NextResponse.json(
          { message: "Duplicate content skipped", transcript: text },
          { status: 200, headers: corsHeaders },
        );
      }

      throw dbError;
    }

    console.log("API Voice: Successfully saved!");
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
