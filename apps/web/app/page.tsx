"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Brain,
  ExternalLink,
  Loader2,
  Mic,
  Play,
  Search,
} from "lucide-react";
import type {
  BriefingResponse,
  MemoryRecord,
  SearchResponse,
} from "@/app/lib/types";

type MemoriesResponse = {
  memories: MemoryRecord[];
};

function isVoiceNote(memory: MemoryRecord): boolean {
  return memory.type === "voice_note" || memory.title === "Voice Note";
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

export default function Dashboard() {
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [briefing, setBriefing] = useState<BriefingResponse>({
    summary: "",
    recentUrls: [],
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingBriefing, setIsLoadingBriefing] = useState(true);
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);

  const selectedMemory = useMemo(
    () => memories.find((memory) => memory.id === selectedMemoryId) ?? null,
    [memories, selectedMemoryId],
  );

  const fetchBriefing = useCallback(async () => {
    try {
      const response = await fetch("/api/briefing");
      const data = (await response.json()) as
        | BriefingResponse
        | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error(
          "error" in data ? data.error : "Failed to fetch briefing",
        );
      }

      setBriefing(data);
    } catch (error) {
      console.error("Failed to fetch briefing:", error);
      setBriefing({
        summary: "Briefing is unavailable right now.",
        recentUrls: [],
      });
    } finally {
      setIsLoadingBriefing(false);
    }
  }, []);

  const fetchMemories = useCallback(async () => {
    try {
      const response = await fetch("/api/memories");
      const data = (await response.json()) as
        | MemoriesResponse
        | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error(
          "error" in data ? data.error : "Failed to fetch memories",
        );
      }

      const records = data.memories ?? [];
      setMemories(records);
      setSelectedMemoryId((currentId) => currentId ?? records[0]?.id ?? null);
    } catch (error) {
      console.error("Failed to fetch memories:", error);
      setMemories([]);
      setSelectedMemoryId(null);
    }
  }, []);

  const handleSearch = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const normalizedQuery = searchQuery.trim();
      if (!normalizedQuery) {
        setHighlightedIds([]);
        return;
      }

      setIsSearching(true);
      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: normalizedQuery }),
        });
        const data = (await response.json()) as
          | SearchResponse
          | { error: string };

        if (!response.ok || "error" in data) {
          throw new Error("error" in data ? data.error : "Search failed");
        }

        const matchIds = data.matches.map((match) => match.id);
        setHighlightedIds(matchIds);
        if (matchIds[0]) {
          setSelectedMemoryId(matchIds[0]);
        }
      } catch (error) {
        console.error("Search failed:", error);
      } finally {
        setIsSearching(false);
      }
    },
    [searchQuery],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchBriefing();
      void fetchMemories();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchBriefing, fetchMemories]);

  return (
    <div className="flex h-screen min-h-screen w-full bg-white text-zinc-900">
      <aside className="flex w-[360px] shrink-0 flex-col border-r border-zinc-200 bg-zinc-50">
        <div className="border-b border-zinc-200 bg-white px-5 py-5">
          <div className="mb-2 flex items-center gap-2">
            <Brain size={18} />
            <h1 className="text-sm font-semibold uppercase tracking-[0.16em]">
              Memento
            </h1>
          </div>

          {isLoadingBriefing ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 size={16} className="animate-spin" />
              <span>Generating your briefing...</span>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-zinc-600">
                {briefing.summary}
              </p>
              {briefing.recentUrls.length > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    briefing.recentUrls.forEach((url) =>
                      window.open(url, "_blank", "noopener,noreferrer"),
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  <ExternalLink size={15} />
                  Resume Work
                </button>
              ) : null}
            </div>
          )}
        </div>

        <div className="border-b border-zinc-200 bg-white px-5 py-4">
          <form onSubmit={handleSearch} className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-3.5 text-zinc-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search your history"
              className="w-full rounded-md border border-zinc-200 bg-zinc-50 py-3 pl-10 pr-10 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
              value={searchQuery}
              onChange={(event) => {
                const value = event.target.value;
                setSearchQuery(value);
                if (!value.trim()) {
                  setHighlightedIds([]);
                }
              }}
            />
            {isSearching ? (
              <Loader2
                className="absolute right-3 top-3.5 animate-spin text-zinc-500"
                size={18}
              />
            ) : null}
          </form>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <div className="mb-3 px-2 text-xs uppercase tracking-[0.14em] text-zinc-500">
            {highlightedIds.length > 0
              ? `${highlightedIds.length} search matches`
              : `${memories.length} memories`}
          </div>

          <div className="space-y-1">
            {memories.map((memory) => {
              const selected = memory.id === selectedMemoryId;
              const highlighted =
                highlightedIds.length === 0 || highlightedIds.includes(memory.id);

              return (
                <button
                  key={memory.id}
                  type="button"
                  onClick={() => setSelectedMemoryId(memory.id)}
                  className={`flex w-full flex-col items-start gap-2 rounded-md px-3 py-3 text-left transition ${
                    selected
                      ? "bg-zinc-900 text-white"
                      : "bg-transparent hover:bg-zinc-100"
                  } ${highlighted ? "opacity-100" : "opacity-45"}`}
                >
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium">
                      {memory.title?.trim() || "Untitled"}
                    </span>
                    {isVoiceNote(memory) ? <Mic size={14} /> : null}
                  </div>

                  <span
                    className={`line-clamp-2 text-xs leading-5 ${
                      selected ? "text-zinc-300" : "text-zinc-500"
                    }`}
                  >
                    {memory.content?.trim() || memory.url}
                  </span>

                  <span
                    className={`text-[11px] ${
                      selected ? "text-zinc-400" : "text-zinc-400"
                    }`}
                  >
                    {formatTimestamp(memory.created_at)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto bg-white">
        {selectedMemory ? (
          <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-8 py-8">
            <div className="mb-6 flex items-start justify-between gap-6 border-b border-zinc-200 pb-6">
              <div className="min-w-0">
                <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-zinc-500">
                  {isVoiceNote(selectedMemory) ? (
                    <>
                      <Mic size={14} />
                      <span>Voice Note</span>
                    </>
                  ) : (
                    <span>Page Memory</span>
                  )}
                </div>

                <h2 className="text-2xl font-semibold text-zinc-950">
                  {selectedMemory.title?.trim() || "Untitled"}
                </h2>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-500">
                  <span>{formatTimestamp(selectedMemory.created_at)}</span>
                  <a
                    href={selectedMemory.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-w-0 items-center gap-2 text-blue-600 hover:text-blue-700"
                  >
                    <ExternalLink size={15} />
                    <span className="truncate">{selectedMemory.url}</span>
                  </a>
                </div>
              </div>

              {isVoiceNote(selectedMemory) ? (
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                >
                  <Play size={15} fill="currentColor" />
                  Transcript
                </button>
              ) : null}
            </div>

            <article className="prose prose-zinc max-w-none">
              <div className="whitespace-pre-wrap text-sm leading-7 text-zinc-700">
                {selectedMemory.content?.trim() || "No content available."}
              </div>
            </article>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-sm text-zinc-500">
            No memories available yet.
          </div>
        )}
      </main>
    </div>
  );
}
