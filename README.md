# Memento:

**Memento** transforms your passive browser history into an active, searchable knowledge base. Built for the **CodeKada**, it uses AI to index what you've read, watched, and thought—allowing you to search your digital life by *meaning*, not just keywords.

---

## The Vision
Traditional browser history is just a list of URLs. **Memento** is a "Knowledge Graph" extension that:
*   **Indexes Context:** Uses NLP to understand the content of the pages you visit.
*   **Captures Thoughts:** Allows instant voice-to-text notes via Whisper, linked directly to the URL.
*   **Resumes Focus:** Provides a "Morning Briefing" to help you pick up where you left off.

## Tech Stack
- **Frontend/Dashboard:** Next.js 14 (App Router), Tailwind CSS, shadcn/ui.
- **Extension Framework:** Plasmo (React-based Browser Extension Framework).
- **Database:** Supabase (Postgres + `pgvector` for vector similarity).
- **AI Layer:** 
  - **Transcription:** Groq-powered Whisper (Sub-500ms inference).
  - **Embeddings:** OpenAI `text-embedding-3-small`.
  - **Reasoning/Summarization:** GPT-4o mini.

## Repository Structure
This is a monorepo managed with workspaces:
```text
/memento
├── /apps
│   ├── /web         # Next.js Dashboard (The UI for searching & briefings)
│   └── /extension   # Plasmo Extension (The capture engine & voice layer)
└── README.md
