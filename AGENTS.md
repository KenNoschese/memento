# Memento: AI Agent Instructions & Architecture Guide

## Project Context
**Target:** CodeKada Hackathon (3 days)
**Tagline:** The Semantic Web History Extension.
**Goal:** Solve "Tab Amnesia." Memento is a browser extension and web dashboard that transforms passive browsing history into an active, searchable knowledge base using vector embeddings and voice-contextualized bookmarks. It acts as a lightweight, DOM-focused alternative to Rewind AI.

## Core Tech Stack
*   **Extension Framework:** Plasmo (React, Tailwind CSS, HMR)
*   **Web Dashboard:** Next.js 14 (App Router), React Flow (for node-based visualization), Tailwind CSS
*   **Database:** Supabase (PostgreSQL with `pgvector` extension)
*   **Language:** TypeScript (Strict mode)
*   **Intelligence APIs:**
    *   **Embeddings:** OpenAI `text-embedding-3-small` (1536 dims)
    *   **Transcription:** Groq API (Whisper-large-v3) - Chosen for sub-500ms latency.
    *   **Summarization:** Groq API (Llama-3 70B) - Chosen for fast "Morning Briefing" generation.

---

## Agent Directives & Coding Guidelines

### 1. Optimize for Speed & Hackathon Demo constraints
*   Prioritize latency in API calls. We are optimizing for a live presentation.
*   Do not over-engineer error handling for edge cases unless it crashes the core user flow. 
*   Use libraries to bypass heavy lifting: use `@mozilla/readability` for DOM parsing and `reactflow` for the dashboard UI.

### 2. Database Knowledge Transfer
*   **Context:** Assume the primary developer has a strong foundational background in Java and MySQL.
*   **Actionable Rule:** When writing Supabase database migrations, RPC functions, or RLS policies, provide exact, complete SQL snippets. Pay special attention to PostgreSQL-specific syntax, especially regarding `pgvector` indexing and the `<=>` (cosine similarity) operator, as these concepts do not map directly 1:1 from standard MySQL.

### 3. Modularity & API Routes
*   Keep extension logic and web dashboard logic separate but sharing the same types.
*   Next.js API routes will act as the bridge. All Groq and OpenAI calls MUST happen server-side in Next.js to protect API keys. The Plasmo extension should only send data to these Next.js routes.

---

## Architecture breakdown & Feature Scope

### Feature 1: The Pipeline (Extraction & Vectorization)
*   **Plasmo Content Script:** Injects into pages, waits for DOM load, and uses `@mozilla/readability` to extract clean article text (removing navbars/ads).
*   **Next.js API (`/api/embed`):** Receives clean text, chunks it if necessary, calls OpenAI `text-embedding-3-small`, and stores the result in Supabase.
*   **Supabase Schema (`memories` table):**
    *   `id` (uuid)
    *   `url` (text)
    *   `title` (text)
    *   `content` (text)
    *   `embedding` (vector 1536)
    *   `type` (enum: 'page', 'voice_note')
    *   `created_at` (timestamp)

### Feature 2: Voice-Contextualized Bookmarks
*   **Plasmo Background Worker:** Listens for the `Cmd+Shift+V` shortcut.
*   **Action:** Captures 5 seconds of microphone audio using `MediaRecorder`.
*   **Next.js API (`/api/voice`):** Receives the audio blob, sends it to Groq (Whisper) for instant transcription, generates a vector of the transcript, and saves it to the `memories` table linked to the current active tab URL.

### Feature 3: The Dashboard ("Obsidian-Style" Mind Map) --- Ignore for now
*   **UI Framework:** React Flow.
*   **Layout:**
    *   **Top Left (Deep Briefing Hero):** Fetches the last 5-10 visited pages from Supabase. Sends the combined text to Groq (Llama-3 70B) to generate a 2-3 sentence summary of the user's intent. Includes a "Resume Work" button opening those tabs.
    *   **Center Canvas (Mind Map):** Displays pages and voice notes as nodes. Edges (connections) are drawn based on vector similarity (nearest neighbors via `pgvector`).
    *   **Top Right (Global Search):** Natural language input. Queries `/api/search` which translates the query to a vector and returns the top 5 closest matches using cosine similarity, highlighting them on the React Flow canvas.
    *   **Right Sidebar (Inspector):** Shows clicked node details (URL, AI metadata, Play button for voice note transcript).

---

## Step-by-Step Build Priority

1.  **Phase 1 (The Brain):** Supabase `pgvector` setup + Plasmo content script extraction + OpenAI embedding API route. (Test: Can we save a page's meaning?)
2.  **Phase 2 (The Senses):** `Cmd+Shift+V` audio capture + Groq Whisper transcription + Semantic Search API route. (Test: Can we query the DB with natural language?)
3.  **Phase 3 (The Interface):** Next.js Dashboard + Groq Llama-3 "Deep Briefing" Header + React Flow node rendering.

*Note for AI: When prompted to begin, always ask which Phase or specific feature we are tackling first. Do not attempt to build the entire stack in one prompt response.*
