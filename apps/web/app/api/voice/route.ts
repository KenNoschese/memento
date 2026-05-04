import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Groq } from "groq-sdk";
import { getErrorMessage } from "@/app/lib/errors";

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

    console.log("API Voice: Received request for URL:", url);
    if (!audioFile) console.error("API Voice: No audio file in request");

    if (!audioFile || !url)
      return NextResponse.json(
        { error: "Missing data" },
        { status: 400, headers: corsHeaders },
      );

    console.log("API Voice: Sending to Groq Whisper...");
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3-turbo",
    });

    const text = transcription.text;
    console.log("API Voice: Transcribed text:", text);
    if (!text)
      return NextResponse.json(
        { message: "Empty transcript" },
        { status: 200, headers: corsHeaders },
      );

    console.log("API Voice: Generating embedding...");
    const embeddingResult = await embeddingModel.embedContent(text);
    const embedding = embeddingResult.embedding.values;
    console.log("API Voice: Embedding generated (dims:", embedding.length, ")");

    console.log("API Voice: Saving to Supabase...");
    const { error: dbError } = await supabase.from("memories").insert([
      {
        url,
        title: "Voice Note",
        content: text,
        embedding,
      },
    ]);

    if (dbError) {
      console.error(
        "API Voice: Supabase primary insert error:",
        dbError.message,
        "(Code:",
        dbError.code,
        ")",
      );
      // PGRST204 means column not found in schema cache
      if (
        dbError.code === "PGRST204" ||
        dbError.message.includes('column "type" does not exist')
      ) {
        console.log("API Voice: Retrying insert without 'type' column...");
        const { error: retryError } = await supabase.from("memories").insert([
          {
            url,
            title: "Voice Note",
            content: text,
            embedding,
          },
        ]);
        if (retryError) {
          console.error(
            "API Voice: Supabase retry insert error:",
            retryError.message,
          );
          throw retryError;
        }
      } else {
        throw dbError;
      }
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
