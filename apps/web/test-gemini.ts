import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "../../apps/web/.env.local") });

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No API Key found");
    return;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

  try {
    const result = await model.embedContent("Hello world");
    console.log("Success! Dimension:", result.embedding.values.length);
  } catch (err) {
    console.error("Gemini Error:", err);
  }
}

testGemini();
