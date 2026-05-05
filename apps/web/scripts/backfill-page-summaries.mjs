import { createClient } from "@supabase/supabase-js"
import { Groq } from "groq-sdk"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const groqApiKey = process.env.GROQ_API_KEY
const summaryModel =
  process.env.GROQ_BRIEFING_MODEL || "llama-3.3-70b-versatile"

if (!supabaseUrl || !supabaseKey || !groqApiKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or GROQ_API_KEY",
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)
const groq = new Groq({ apiKey: groqApiKey })

async function generateSummary(memory) {
  const title = memory.title?.trim() || "Untitled"
  const content = memory.content?.trim().slice(0, 12000) || ""

  if (!content) {
    return null
  }

  const completion = await groq.chat.completions.create({
    model: summaryModel,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You write concise page-memory summaries for a browsing memory app. Write 2 to 4 short sentences that help a user instantly remember why this page mattered. Focus on the main subject, likely task, and the most useful takeaways. Do not use markdown, bullet points, or filler like 'This page discusses'.",
      },
      {
        role: "user",
        content: `Title: ${title}\nURL: ${memory.url}\n\nPage text:\n${content}`,
      },
    ],
  })

  return completion.choices[0]?.message?.content?.trim() || null
}

async function main() {
  const { data: memories, error } = await supabase
    .from("memories")
    .select("id, title, url, content")
    .eq("type", "page")
    .or("summary.is.null,summary.eq.")
    .not("content", "is", null)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) {
    throw error
  }

  for (const memory of memories ?? []) {
    try {
      const summary = await generateSummary(memory)
      if (!summary) {
        console.log(`Skipping ${memory.id}: empty summary`)
        continue
      }

      const { error: updateError } = await supabase
        .from("memories")
        .update({ summary })
        .eq("id", memory.id)

      if (updateError) {
        throw updateError
      }

      console.log(`Updated summary for ${memory.id}`)
    } catch (summaryError) {
      console.error(`Failed to backfill ${memory.id}:`, summaryError)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
