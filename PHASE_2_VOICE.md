## Next step: Voice Context (Groq Whisper)

Goal: Capture 5s audio via shortcut nscribe -> Embed -> Save.

## 1. Extension Config
File: apps/extension/package.json
- Register custom command toggle-voice-record.
- Shortcut: Ctrl+Shift+V (Mac: Command+Shift+V).

## 2. Audio Pipeline
Logic: apps/extension/background/index.ts
1. Listener for shortcut.
2. Initialize MediaRecorder (5-second limit).
3. POST multipart/form-data to localhost:3000/api/voice.
   - Payload: { audio: Blob, url: string }.

## 3. Backend Implementation
File: apps/web/app/api/voice/route.ts
 ## Groq SDK: Use distil-whisper-large-v3-en.
- Flow:
  1. Receive .webm audio.
  2. Groq Whisper -> Transcribed Text.
  3. Gemini -> 3072d Embedding.
  4. Supabase -> Update memories where url = current_url OR Insert new.

## Implementation Tasklist
- Config: Add commands manifest to extension.
- Client: Implement MediaRecorder in background script.
- Packages: npm install groq-sdk -w web.
- API: Build /api/voice route.
- DB: Ensure memories table supports optional transcript column.
