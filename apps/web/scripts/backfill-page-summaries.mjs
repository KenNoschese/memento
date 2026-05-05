import { createClient } from "@supabase/supabase-js"
import { GoogleGenerativeAI } from "@google/generative-ai"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const geminiApiKey = process.env.GEMINI_API_KEY

if (!supabaseUrl || !supabaseKey || !geminiApiKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or GEMINI_API_KEY",
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)
const genAI = new GoogleGenerativeAI(geminiApiKey)
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" })

async function generateSummary(memory) {
  const title = memory.title?.trim() || "Untitled"
  const content = memory.content?.trim().slice(0, 30000) || ""

  if (!content) {
    return null
  }

  const prompt = `You write concise page-memory summaries for a browsing memory app.
Analyze the following content and write 2 to 4 short sentences that help a user instantly remember why this page mattered.
Focus on the main subject, likely task, and the most useful takeaways.
Do not use markdown, bullet points, or filler like 'This page discusses'.

Title: ${title}
URL: ${memory.url}

Page text:
${content}`

  try {
    const result = await model.generateContent(prompt)
    return result.response.text()?.trim() || null
  } catch (e) {
    console.error(`Gemini failed for ${memory.id}`, e)
    return null
  }
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
