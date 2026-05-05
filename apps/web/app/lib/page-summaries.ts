import { Groq } from "groq-sdk";

const groqApiKey = process.env.GROQ_API_KEY;
const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null;

export interface PageSummaryResult {
  summary: string | null;
  tags: string[];
}

export async function generatePageSummary(input: {
  title?: string | null;
  url: string;
  content: string;
}): Promise<PageSummaryResult> {
  if (!groq || !input.content.trim()) {
    return { summary: null, tags: [] };
  }

  const title = input.title?.trim() || "Untitled";
  const content = input.content.trim().slice(0, 8000);

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content:
            "You analyze webpage content for a browsing memory app. Return a JSON object with two fields: 'summary' (a string, 2-4 sentences describing why this page mattered) and 'tags' (an array of 1-3 broad strings like 'Programming', 'News', 'Shopping'). Do not use markdown or extra text.",
        },
        {
          role: "user",
          content: `Title: ${title}\nURL: ${input.url}\n\nPage text:\n${content}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const data = JSON.parse(completion.choices[0]?.message?.content || "{}");
    return {
      summary: data.summary?.trim() || null,
      tags: Array.isArray(data.tags) ? data.tags : [],
    };
  } catch (e) {
    console.error("Groq summary generation failed", e);
    return { summary: null, tags: [] };
  }
}
