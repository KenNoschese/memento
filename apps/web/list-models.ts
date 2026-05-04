import { GoogleGenerativeAI } from "@google/generative-ai";

async function listModels() {
  const apiKey = "AIzaSyA54b0Vpx7_h5DseIa7sFJGgMYT4ndhiwk";
  const genAI = new GoogleGenerativeAI(apiKey);
  // The SDK doesn't have a direct listModels, but we can try common names
  const models = ["text-embedding-004", "embedding-001"];
  
  for (const m of models) {
    try {
      const model = genAI.getGenerativeModel({ model: m });
      await model.embedContent("test");
      console.log(`Model ${m} works!`);
    } catch {
      console.log(`Model ${m} failed.`);
    }
  }
}

listModels();
