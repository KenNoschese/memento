import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "apps/web/.env.local") });

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return console.log("No key");
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const models = ["models/text-embedding-004", "models/embedding-001", "models/gemini-embedding-001"];
  
  for (const name of models) {
    try {
      const model = genAI.getGenerativeModel({ model: name });
      const res = await model.embedContent("test");
      console.log(`${name}: ${res.embedding.values.length} dims`);
    } catch (e) {
      console.log(`${name}: failed`);
    }
  }
}

run();
