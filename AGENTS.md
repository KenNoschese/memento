# Memento Engineering Runbook

## Purpose
Memento is a browser extension plus web dashboard for turning browsing activity and voice notes into searchable memories.

This file is the repo-wide runbook for AI agents and contributors. It should be treated as the authoritative guide for:
- repo structure
- active tools and libraries
- runtime architecture
- environment expectations
- change rules and review priorities

If product docs, README text, or old planning notes disagree with the code, prefer the code and update this file.

---

## Product Snapshot
- **Goal:** solve "tab amnesia" by capturing page content and voice context, then making it searchable and resumable.
- **Primary surfaces:**
  - browser extension for capture
  - web dashboard for search, briefing, and inspection
- **Current dashboard shape:** two-pane memory browser, not a graph UI.
- **Future graph work:** `reactflow` remains installed and can be reused later, but it is not the current primary interface.

---

## Monorepo Layout
```text
/memento
├── /apps
│   ├── /web         # Next.js dashboard and API routes
│   └── /extension   # Plasmo browser extension
├── /supabase        # Supabase helpers and SQL assets
├── AGENTS.md        # Repo-wide runbook
└── package.json     # Workspace root
```

### Ownership Boundaries
- `apps/web`
  - owns all server-side AI calls
  - owns dashboard UI
  - owns API routes used by the extension
- `apps/extension`
  - owns page capture
  - owns shortcut handling
  - owns microphone recording via offscreen document
- `supabase`
  - owns SQL artifacts and Supabase-specific utilities

Do not move secrets or direct model calls into the extension.

---

## Active Stack

### Web App
- **Framework:** Next.js 16 App Router
- **UI:** React 18, Tailwind CSS 4, `lucide-react`
- **Data/API:** `@supabase/supabase-js`
- **AI:** `@google/generative-ai`, `groq-sdk`
- **Optional/future UI lib:** `reactflow`

### Extension
- **Framework:** Plasmo MV3
- **Runtime:** Chrome extension APIs, background worker, offscreen document
- **Content extraction:** `@mozilla/readability`
- **UI:** React 18

### Data Layer
- **Database:** Supabase Postgres
- **Vector search:** `pgvector`
- **Semantic search RPC:** `supabase/rpc_match_memories.sql`

### Current Model Usage
- **Embeddings:** Gemini `gemini-embedding-001`
- **Voice transcription:** Groq `whisper-large-v3-turbo`
- **Briefing/summarization:** Groq, defaulted in code via `GROQ_BRIEFING_MODEL` and currently using `llama-3.3-70b-versatile`

---

## Commands and Tooling

### Workspace Root
- `npm run dev:web`
  - starts the web app workspace
- `npm run dev:ext`
  - starts the extension workspace

### Web App (`apps/web`)
- `npm run dev`
  - starts Next.js locally
- `npm run lint`
  - runs ESLint
- `npm run build`
  - production build using webpack
- `npm run start`
  - starts the production server

### Extension (`apps/extension`)
- `npm run dev`
  - starts Plasmo dev build
- `npm run build`
  - production extension build
- `npm run package`
  - build/package for store-style output

### Practical Development Notes
- The extension currently expects the web app API to be reachable while developing.
- The extension currently talks to `http://localhost:3000` directly in runtime code. Treat that as a current limitation, not a desired final design.
- If you change commands, build assumptions, or toolchain versions, update this file.

---

## Environment and Secrets

### Web App Environment
Expected variables include:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `GROQ_BRIEFING_MODEL` (optional override)

### Rules
- All model calls must stay server-side in `apps/web/app/api/*`.
- The extension should only send page/audio data to the web app API.
- Never add raw model secrets to extension code, extension env exposed to users, or dashboard client components.

---

## Current Runtime Architecture

### Page Capture Flow
1. The extension content script runs on page load.
2. It waits before extracting content using `Readability`.
3. It posts `{ url, title, content }` to `apps/web/app/api/index/route.ts`.
4. The web app generates a Gemini embedding and stores the memory in Supabase.

Main files:
- `apps/extension/contents/indexer.ts`
- `apps/web/app/api/index/route.ts`

### Voice Note Flow
1. The extension background worker listens for the voice shortcut and popup actions.
2. It creates or reuses an offscreen document.
3. The offscreen page records microphone audio.
4. The offscreen page uploads the recording plus active tab URL to `apps/web/app/api/voice/route.ts`.
5. The web app transcribes with Groq Whisper, embeds with Gemini, and stores the result in Supabase.

Main files:
- `apps/extension/background/index.ts`
- `apps/extension/tabs/offscreen.tsx`
- `apps/web/app/api/voice/route.ts`

### Search Flow
1. The dashboard sends a natural-language query to `/api/search`.
2. The server embeds the query with Gemini.
3. The server calls `match_memories` via Supabase RPC.
4. Matching memories are returned to the dashboard.

Main files:
- `apps/web/app/api/search/route.ts`
- `supabase/rpc_match_memories.sql`

### Briefing Flow
1. The dashboard requests `/api/briefing`.
2. The server fetches recent memories from Supabase.
3. It summarizes recent activity with Groq.
4. The dashboard displays the summary and recent URLs.

Main files:
- `apps/web/app/api/briefing/route.ts`
- `apps/web/app/page.tsx`

### Memory Browser Flow
- The dashboard fetches `/api/memories`.
- The current UI is a two-pane layout:
  - left pane: briefing, search, memory list
  - right pane: selected memory details

Main files:
- `apps/web/app/api/memories/route.ts`
- `apps/web/app/page.tsx`

---

## Database Notes

### Current Working Assumptions
- The active search RPC expects **768-dimensional embeddings**.
- Memory records persist a real `type` enum with values `page` and `voice_note`.
- Memory writes persist a dedupe key and are expected to be idempotent for exact retries.
- The repo contains `supabase/rpc_match_memories.sql` as the current semantic search function.
- Memory records currently rely on:
  - `url`
  - `title`
  - `content`
  - `embedding`
  - `type`
  - `dedupe_key`
  - `created_at`

### Important Guidance
- When changing schema, RPCs, or policies, provide exact SQL.
- Be explicit about PostgreSQL and `pgvector` behavior.
- Do not assume MySQL-style syntax or semantics.
- If a schema change affects extension behavior, web API behavior, and dashboard rendering, document the full path in the change.

---

## Known Constraints and Active Problems
These are current repo realities and should influence design decisions:

- **Voice-to-page attachment is weak**
  - voice notes are stored with a URL, but the relationship is not modeled strongly enough for reliable organization

- **Localhost coupling**
  - extension network calls are still pinned to local dev URLs

- **Shortcut/product mismatch risk**
  - shortcut behavior and documented shortcut expectations must stay aligned

If you fix one of these, update this section.

---

## Near-Term Priorities
Current recommended build order:

1. Explicit voice-to-page attachment
2. Sessions/folders
3. Relation-based organization and richer grouping

Reasoning:
- data relationships come second
- organization layers come after the capture model is stable

---

## Working Rules for Agents

### General
- Read the current code before trusting older docs.
- Prefer narrow changes that improve the active flow instead of speculative refactors.
- Keep extension logic and web logic separate.
- Treat this file as the repo-wide source of truth for workflow and architecture.

### API and Secret Boundaries
- All AI API calls stay in Next.js route handlers.
- The extension should never hold provider secrets.
- The dashboard client should never call provider SDKs directly.

### Database and SQL
- When altering Supabase schema or RPC behavior, include exact SQL.
- Call out embedding dimensionality when it matters.
- If RPC behavior changes, verify the web route contracts that depend on it.

### UI Direction
- The current dashboard direction is a work-focused list/detail memory browser.
- Do not reintroduce graph-first UI unless the user explicitly asks for it.
- `reactflow` may be reused later, but not as the default current direction.

### Extension Changes
- Be careful with content script scope, duplicate capture, unsupported URLs, and long-lived background state.
- Any change to permissions, command shortcuts, host matching, or offscreen behavior should be called out explicitly in the final summary.

### Documentation Hygiene
- Update this root `AGENTS.md` when repo-wide behavior changes.
- Keep app-local guidance in sub-app files only when it is genuinely app-specific.
- Remove or correct stale architecture notes instead of letting multiple conflicting truths accumulate.

---

## Review Priorities
When reviewing changes in this repo, prioritize:

1. Broken core flows
   - page indexing
   - voice recording/upload
   - search
   - briefing

2. Data correctness
   - duplicate memories
   - bad URL relationships
   - missing embeddings
   - schema drift

3. Trust and safety of extension behavior
   - unsupported pages
   - site exclusions
   - user control modes
   - background/offscreen state bugs

4. Build/runtime stability
   - web lint/build
   - extension build
   - local development assumptions

5. UI quality after the above are stable

---

## File Map for Common Tasks
- **Page indexing:** `apps/extension/contents/indexer.ts`, `apps/web/app/api/index/route.ts`
- **Voice capture:** `apps/extension/background/index.ts`, `apps/extension/tabs/offscreen.tsx`, `apps/web/app/api/voice/route.ts`
- **Dashboard memory browser:** `apps/web/app/page.tsx`, `apps/web/app/api/memories/route.ts`
- **Briefing:** `apps/web/app/api/briefing/route.ts`
- **Semantic search:** `apps/web/app/api/search/route.ts`, `supabase/rpc_match_memories.sql`
- **Shared web types/helpers:** `apps/web/app/lib/*`

---

## When Updating This File
Update `AGENTS.md` if you change:
- runtime architecture
- environment requirements
- build or dev commands
- current UI direction
- primary model/provider choices
- core repo priorities
- extension permission/scope assumptions

This file should stay concise enough to use during implementation, but complete enough that another engineer or agent can make correct repo-wide decisions from it.
