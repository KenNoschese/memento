# Memento

Memento is a browser extension plus web dashboard for turning browsing activity and voice notes into searchable memories.

Instead of treating history as a flat list of URLs, Memento captures page content, links voice context to the active page, and makes that information queryable through semantic search and a briefing-style dashboard.

## What It Does
- extracts readable page content from the active site
- embeds captured content for semantic retrieval
- records short voice notes linked to the current tab URL
- generates a recent-activity briefing
- lets users browse and search memories from a web dashboard

## Current Product Shape
Today, the dashboard is a two-pane memory browser:
- **left panel:** briefing, search, memory list
- **right panel:** selected memory details

The repo still includes `reactflow` for future graph-style exploration, but the current primary UI is list/detail.

## Repository Layout
```text
/memento
├── /apps
│   ├── /web         # Next.js dashboard + API routes
│   └── /extension   # Plasmo browser extension
├── /supabase        # SQL assets and Supabase-related helpers
├── AGENTS.md        # Repo-wide engineering runbook
└── README.md
```

## Stack

### Web
- Next.js 16
- React 18
- Tailwind CSS 4
- `@supabase/supabase-js`
- `@google/generative-ai`
- `groq-sdk`
- `lucide-react`

### Extension
- Plasmo
- React 18
- Chrome MV3 APIs
- `@mozilla/readability`
- offscreen document for microphone recording

### Data and AI
- Supabase Postgres
- `pgvector`
- Gemini `gemini-embedding-001` for embeddings
- Groq `whisper-large-v3-turbo` for transcription
- Groq `llama-3.3-70b-versatile` for briefing by default

## How It Works

### Page Capture
1. The extension content script loads on a page.
2. It waits, extracts readable content with `Readability`, and sends it to the web app.
3. The web API embeds the content and stores it in Supabase.

### Voice Notes
1. The extension background worker handles the voice shortcut and popup actions.
2. An offscreen document records audio from the microphone.
3. The recording is uploaded to the web API with the active tab URL.
4. The server transcribes, embeds, and stores the voice note.

### Search and Briefing
1. The dashboard sends natural-language search queries to `/api/search`.
2. The server embeds the query and runs semantic matching through Supabase RPC.
3. `/api/briefing` summarizes recent memories into a short work-resumption briefing.

## Local Development

### Prerequisites
- Node.js
- npm workspaces enabled through the repo root
- a Supabase project with the expected `memories` table
- API keys for Gemini and Groq

### Environment
The web app expects these environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
GEMINI_API_KEY=...
GROQ_API_KEY=...
GROQ_BRIEFING_MODEL=llama-3.3-70b-versatile
```

Place them in the web app environment file used by Next.js.

### Install
From the repo root:

```bash
npm install
```

### Run the Web App
From the repo root:

```bash
npm run dev:web
```

Or directly:

```bash
cd apps/web
npm run dev
```

### Run the Extension
From the repo root:

```bash
npm run dev:ext
```

Or directly:

```bash
cd apps/extension
npm run dev
```

Load the generated Plasmo development build into Chrome from:

```text
apps/extension/build/chrome-mv3-dev
```

### Production Checks

Web:

```bash
cd apps/web
npm run lint
npm run build
```

Extension:

```bash
cd apps/extension
npm run build
```

## API Surface
Current web routes include:
- `/api/index` - store a page memory
- `/api/voice` - transcribe and store a voice note
- `/api/search` - semantic search
- `/api/briefing` - summarize recent memories
- `/api/memories` - dashboard memory list

