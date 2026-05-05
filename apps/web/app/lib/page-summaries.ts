import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const geminiApiKey = process.env.GEMINI_API_KEY;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

export interface PageSummaryResult {
  summary: string | null;
  tags: string[];
}

export async function generatePageSummary(input: {
  title?: string | null;
  url: string;
  content: string;
}): Promise<PageSummaryResult> {
  if (!genAI || !input.content.trim()) {
    return { summary: null, tags: [] };
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          summary: { type: SchemaType.STRING },
          tags: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
        },
        required: ["summary", "tags"],
      },
    },
  });

  const title = input.title?.trim() || "Untitled";
  const content = input.content.trim().slice(0, 30000); // Gemini handles larger context

  const prompt = `You analyze webpage content for a browsing memory app.
Analyze the following content and return a concise summary (2-4 sentences) and 1-3 broad tags.

Title: ${title}
URL: ${input.url}

Page text:
${content}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    const data = JSON.parse(text);

    return {
      summary: data.summary?.trim() || null,
      tags: Array.isArray(data.tags) ? data.tags : [],
    };
  } catch (e) {
    console.error("Gemini summary generation failed", e);
    return { summary: null, tags: [] };
  }
}
