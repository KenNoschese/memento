export type MemoryType = "page" | "voice_note";

export type BaseMemoryRecord = {
  id: string;
  url: string;
  canonical_url: string;
  title: string | null;
  content: string | null;
  summary?: string | null;
  tags?: string[] | null;
  folder_id?: string | null;
  created_at: string;
  embedding?: number[] | string | null;
  similarity?: number | null;
  type: MemoryType;
  audio?: string | null;
  parent_memory_id?: string | null;
  is_placeholder?: boolean;
};

export type Folder = {
  id: string;
  name: string;
  created_at: string;
};

export type VoiceNoteRecord = BaseMemoryRecord & {
  type: "voice_note";
  parent_memory_id: string;
  matched_in_search?: boolean;
};

export type PageMemoryRecord = BaseMemoryRecord & {
  type: "page";
  parent_memory_id: null;
  is_placeholder: boolean;
  voiceNotes: VoiceNoteRecord[];
  matchedVoiceNoteIds?: string[];
};

export type MemoryRecord = PageMemoryRecord | VoiceNoteRecord;

export type SearchRequest = {
  query: string;
};

export type SearchResponse = {
  matches: PageMemoryRecord[];
};

export type BriefingResponse = {
  summary: string;
  recentUrls: string[];
};
