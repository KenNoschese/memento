import { Groq } from "groq-sdk";

const groqApiKey = process.env.GROQ_API_KEY;
const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null;
const summaryModel =
  process.env.GROQ_BRIEFING_MODEL || "llama-3.3-70b-versatile";

export async function generatePageSummary(input: {
  title?: string | null;
  url: string;
  content: string;
}): Promise<string | null> {
  if (!groq || !input.content.trim()) {
    return null;
  }

  const title = input.title?.trim() || "Untitled";
  const content = input.content.trim().slice(0, 12000);

  const completion = await groq.chat.completions.create({
    model: summaryModel,
    messages: [
      {
        role: "system",
        content:
          "You write concise page-memory summaries for a browsing memory app. Write 2 to 4 short sentences that help a user instantly remember why this page mattered. Focus on the main subject, likely task, and the most useful takeaways. Do not use markdown, bullet points, or filler like 'This page discusses'.",
      },
      {
        role: "user",
        content: `Title: ${title}\nURL: ${input.url}\n\nPage text:\n${content}`,
      },
    ],
    temperature: 0.2,
  });

  const summary = completion.choices[0]?.message?.content?.trim() || "";
  return summary || null;
}
