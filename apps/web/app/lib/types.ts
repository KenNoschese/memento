export type MemoryType = "page" | "voice_note";

export type MemoryRecord = {
  id: string;
  url: string;
  title: string | null;
  content: string | null;
  created_at: string;
  embedding?: number[] | string | null;
  similarity?: number | null;
  type: MemoryType;
  audio?: string | null;
};

export type SearchRequest = {
  query: string;
};

export type SearchResponse = {
  matches: MemoryRecord[];
};

export type BriefingResponse = {
  summary: string;
  recentUrls: string[];
};
