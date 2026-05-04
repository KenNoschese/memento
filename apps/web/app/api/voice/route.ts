import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Groq } from "groq-sdk";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
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

    if (!audioFile || !url) return NextResponse.json({ error: "Missing data" }, { status: 400, headers: corsHeaders });

    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "distil-whisper-large-v3-en",
    });

    const text = transcription.text;
    if (!text) return NextResponse.json({ message: "Empty transcript" }, { status: 200, headers: corsHeaders });

    const embeddingResult = await embeddingModel.embedContent(text);
    const embedding = embeddingResult.embedding.values;

    const { error: dbError } = await supabase.from("memories").insert([{ 
      url, title: "Voice Note", content: text, embedding, type: "voice_note" 
    }]);

    if (dbError?.message.includes("column \"type\" does not exist")) {
      await supabase.from("memories").insert([{ url, title: "Voice Note", content: text, embedding }]);
    } else if (dbError) throw dbError;

    return NextResponse.json({ message: "Saved!", transcript: text }, { headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
}
