# Memento

<p align="center">
  <img src="apps/web/public/logo_light.png" alt="Memento Logo" width="200">
</p>

Memento is a browser extension and web dashboard that turns your browsing activity and voice notes into searchable memories. It solves "tab amnesia" by capturing page content and voice context, making it easy to search, resume, and get briefings on your work.

## Technical Stack

### Core Frameworks
- **Dashboard:** Next.js 16 (App Router) with TypeScript
- **Extension:** Plasmo (Manifest V3) with React 18
- **Styling:** Tailwind CSS 4 & PostCSS

### AI & Machine Learning
- **Embeddings:** Gemini (`gemini-embedding-001`) for 3072-dimensional vector representation
- **Transcription:** Groq Whisper (`whisper-large-v3-turbo`) for high-speed voice-to-text
- **Analysis & Briefing:** Groq Llama 3.1 (`8b-instant`) for transcript insights and memory summarization
- **Natural Language Chat:** Gemini (`2.5 flash`) for fast and detailed responses
- **Search:** Semantic vector search powered by `pgvector` on Supabase

### Data & Infrastructure
- **Database:** Supabase Postgres
- **Vector Search:** Custom Supabase RPC for semantic matching
- **Content Extraction:** `@mozilla/readability` for cleaning web pages
- **Voice Capture:** Chrome Offscreen API for high-fidelity microphone recording

### Key Libraries
- **UI Components:** Radix UI, Lucide React
- **Graph Visualization:** `reactflow` (built-in support for future graph views)
- **Storage:** `@plasmohq/storage` for extension state management

## Installation Guide (v0.1)

1. **Download & Extract:** Download the v0.1 release zip and extract it to your local machine.
2. **Open Chrome Extensions:** Navigate to `chrome://extensions/` in your browser.
3. **Enable Developer Mode:** Toggle the "Developer mode" switch in the top right corner.
4. **Load Extension:** Click "Load unpacked" and select the extracted folder.
5. **Access Dashboard:** The deployed dashboard is available at [https://memento-mjk1.vercel.app/](https://memento-mjk1.vercel.app/).
