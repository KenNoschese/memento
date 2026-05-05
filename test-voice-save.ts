import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";
import path from "path";
import { createHash } from "crypto";

dotenv.config({ path: path.resolve(process.cwd(), "apps/web/.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function buildMemoryDedupeKey(input: any): string {
  const canonical = [
    input.type,
    (input.url || "").trim(),
    (input.title || "").trim(),
    (input.content || "").trim(),
  ].join("\n");
  return createHash("md5").update(canonical).digest("hex");
}

async function testVoiceInsert() {
  const apiKey = process.env.GEMINI_API_KEY!;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

  const text = "Testing voice note save at " + new Date().toISOString();
  const url = "http://localhost:3000/test-voice";
  
  console.log("Generating embedding...");
  const res = await model.embedContent(text);
  const embedding = res.embedding.values;
  console.log("Embedding size:", embedding.length);

  const dedupeKey = buildMemoryDedupeKey({
    type: "voice_note",
    url,
    title: "Voice Note",
    content: text
  });

  console.log("Inserting into Supabase...");
  const { data, error } = await supabase.from("memories").insert([
    {
      url,
      title: "Voice Note",
      content: text,
      embedding,
      type: "voice_note",
      dedupe_key: dedupeKey
    }
  ]);

  if (error) {
    console.error("Insert failed:", error);
  } else {
    console.log("Insert succeeded!");
  }
}

testVoiceInsert();
