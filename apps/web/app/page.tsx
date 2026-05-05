"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Brain,
  ChevronDown,
  ExternalLink,
  Folder as FolderIcon,
  Loader2,
  Plus,
  Play,
  Search,
  Tag,
  Trash2,
} from "lucide-react";
import type {
  BriefingResponse,
  Folder,
  PageMemoryRecord,
  SearchResponse,
  VoiceNoteRecord,
} from "@/app/lib/types";
import { normalizeExtractedText } from "@/app/lib/memories";

type MemoriesResponse = {
  memories: PageMemoryRecord[];
};

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function playVoiceNote(note: VoiceNoteRecord) {
  if (note.audio) {
    const audio = new Audio(note.audio);
    audio.play().catch((err) => {
      console.error("Playback failed:", err);
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(note.content || "");
      window.speechSynthesis.speak(utterance);
    });
    return;
  }

  if (note.content) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(note.content);
    window.speechSynthesis.speak(utterance);
  }
}

export default function Dashboard() {
  const [memories, setMemories] = useState<PageMemoryRecord[]>([]);
  const [briefing, setBriefing] = useState<BriefingResponse>({
    summary: "",
    recentUrls: [],
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingBriefing, setIsLoadingBriefing] = useState(true);
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);
  const [expandedVoiceNoteIds, setExpandedVoiceNoteIds] = useState<string[]>(
    [],
  );
  const [showRawPageTextIds, setShowRawPageTextIds] = useState<string[]>([]);

  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const filteredMemories = useMemo(() => {
    return memories.filter((memory) => {
      if (selectedFolderId) {
        return memory.folder_id === selectedFolderId;
      }
      if (selectedTag) {
        return memory.tags?.includes(selectedTag);
      }
      return true;
    });
  }, [memories, selectedFolderId, selectedTag]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    memories.forEach((m) => {
      m.tags?.forEach((t) => tags.add(t));
    });
    return Array.from(tags).sort();
  }, [memories]);

  const selectedMemory = useMemo(
    () => memories.find((memory) => memory.id === selectedMemoryId) ?? null,
    [memories, selectedMemoryId],
  );

  const fetchBriefing = useCallback(async () => {
    try {
      const response = await fetch("/api/briefing");
      const text = await response.text();
      if (!text) {
        throw new Error("Empty response from briefing API");
      }
      const data = JSON.parse(text) as BriefingResponse | { error: string };

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
    async (event: FormEvent<HTMLFormElement>) => {
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

  const handleDeleteMemory = useCallback(
    async (memoryId: string, label: string) => {
      const confirmed = window.confirm(`Delete "${label}" from your memories?`);

      if (!confirmed) {
        return;
      }

      setDeletingMemoryId(memoryId);

      try {
        const response = await fetch("/api/memories", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: memoryId }),
        });
        const data = (await response.json()) as
          | { success: boolean }
          | { error: string };

        if (!response.ok || "error" in data) {
          throw new Error("error" in data ? data.error : "Delete failed");
        }

        setMemories((current) => {
          const next: PageMemoryRecord[] = [];

          for (const page of current) {
            if (page.id === memoryId) {
              continue;
            }

            next.push({
              ...page,
              voiceNotes: page.voiceNotes.filter(
                (note) => note.id !== memoryId,
              ),
              matchedVoiceNoteIds: page.matchedVoiceNoteIds?.filter(
                (id) => id !== memoryId,
              ),
            });
          }

          setSelectedMemoryId((currentId) => {
            if (currentId !== memoryId) {
              return currentId;
            }

            return next[0]?.id ?? null;
          });

          return next;
        });

        setHighlightedIds((current) => current.filter((id) => id !== memoryId));
      } catch (error) {
        console.error("Delete failed:", error);
        window.alert("Unable to delete this memory right now.");
      } finally {
        setDeletingMemoryId(null);
      }
    },
    [],
  );

  const toggleVoiceNote = useCallback((noteId: string) => {
    setExpandedVoiceNoteIds((current) =>
      current.includes(noteId)
        ? current.filter((id) => id !== noteId)
        : [...current, noteId],
    );
  }, []);

  const toggleRawPageText = useCallback((pageId: string) => {
    setShowRawPageTextIds((current) =>
      current.includes(pageId)
        ? current.filter((id) => id !== pageId)
        : [...current, pageId],
    );
  }, []);

  const fetchFolders = useCallback(async () => {
    try {
      const response = await fetch("/api/folders");
      const data = (await response.json()) as { folders: Folder[] };
      setFolders(data.folders || []);
    } catch (error) {
      console.error("Failed to fetch folders:", error);
    }
  }, []);

  const handleCreateFolder = async (e: FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const response = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      if (response.ok) {
        setNewFolderName("");
        setIsCreatingFolder(false);
        void fetchFolders();
      }
    } catch (error) {
      console.error("Failed to create folder:", error);
    }
  };

  const handleMoveToFolder = async (
    memoryId: string,
    folderId: string | null,
  ) => {
    try {
      const response = await fetch("/api/memories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: memoryId, folder_id: folderId }),
      });
      if (response.ok) {
        void fetchMemories();
      }
    } catch (error) {
      console.error("Failed to move memory to folder:", error);
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchBriefing();
      void fetchMemories();
      void fetchFolders();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchBriefing, fetchMemories, fetchFolders]);

  return (
    <div className="flex h-screen min-h-screen w-full bg-white text-zinc-900">
      <aside className="flex w-90 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50">
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
          {/* Folders Section */}
          <div className="mb-6 px-2">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Folders
              </h3>
              <button
                onClick={() => setIsCreatingFolder(!isCreatingFolder)}
                className="text-zinc-400 hover:text-zinc-600 transition"
                title="Create folder"
              >
                <Plus size={14} />
              </button>
            </div>

            {isCreatingFolder && (
              <form onSubmit={handleCreateFolder} className="mb-3">
                <input
                  autoFocus
                  type="text"
                  placeholder="Folder name..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-400"
                  onBlur={() => {
                    if (!newFolderName.trim()) setIsCreatingFolder(false);
                  }}
                />
              </form>
            )}

            <div className="space-y-0.5">
              <button
                onClick={() => {
                  setSelectedFolderId(null);
                  setSelectedTag(null);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition ${
                  !selectedFolderId && !selectedTag
                    ? "bg-zinc-200 text-zinc-900 font-medium"
                    : "text-zinc-500 hover:bg-zinc-100"
                }`}
              >
                <FolderIcon size={14} />
                All Memories
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => {
                    setSelectedFolderId(folder.id);
                    setSelectedTag(null);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition ${
                    selectedFolderId === folder.id
                      ? "bg-zinc-200 text-zinc-900 font-medium"
                      : "text-zinc-500 hover:bg-zinc-100"
                  }`}
                >
                  <FolderIcon size={14} />
                  <span className="truncate">{folder.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* AI Tags Section */}
          <div className="mb-6 px-2">
            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              AI Tags
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    setSelectedTag(selectedTag === tag ? null : tag);
                    setSelectedFolderId(null);
                  }}
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] transition border ${
                    selectedTag === tag
                      ? "bg-zinc-900 text-white border-zinc-900"
                      : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
                  }`}
                >
                  <Tag size={10} />
                  {tag}
                </button>
              ))}
              {allTags.length === 0 && (
                <span className="text-[10px] italic text-zinc-400">
                  No tags generated yet
                </span>
              )}
            </div>
          </div>

          <div className="mb-3 px-2 text-xs uppercase tracking-[0.14em] text-zinc-500">
            {highlightedIds.length > 0
              ? `${highlightedIds.length} search matches`
              : `${filteredMemories.length} pages`}
          </div>

          <div className="space-y-1">
            {filteredMemories.map((memory) => {
              const selected = memory.id === selectedMemoryId;
              const highlighted =
                highlightedIds.length === 0 ||
                highlightedIds.includes(memory.id);

              return (
                <div
                  key={memory.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedMemoryId(memory.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedMemoryId(memory.id);
                    }
                  }}
                  className={`group flex w-full flex-col items-start gap-2 rounded-md px-3 py-3 text-left transition ${
                    selected
                      ? "bg-zinc-900 text-white"
                      : "bg-transparent hover:bg-zinc-100"
                  } ${highlighted ? "opacity-100" : "opacity-45"}`}
                >
                  <div className="flex w-full items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="truncate text-sm font-medium">
                        {memory.title?.trim() || "Untitled"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteMemory(
                          memory.id,
                          memory.title?.trim() || "memory",
                        );
                      }}
                      aria-label={`Delete ${memory.title?.trim() || "memory"}`}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition ${
                        selected
                          ? "border-white/10 text-zinc-300 hover:border-white/20 hover:bg-white/8 hover:text-white"
                          : "border-transparent text-zinc-400 opacity-0 hover:border-zinc-200 hover:bg-white hover:text-zinc-700 group-hover:opacity-100"
                      } ${
                        deletingMemoryId === memory.id
                          ? "pointer-events-none opacity-100"
                          : ""
                      }`}
                    >
                      {deletingMemoryId === memory.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>

                  <span
                    className={`line-clamp-2 text-xs leading-5 ${
                      selected ? "text-zinc-300" : "text-zinc-500"
                    }`}
                  >
                    {memory.summary?.trim() ||
                      memory.content?.trim() ||
                      memory.url}
                  </span>

                  <div
                    className={`flex w-full items-center justify-between text-[11px] ${
                      selected ? "text-zinc-400" : "text-zinc-400"
                    }`}
                  >
                    <span>{formatTimestamp(memory.created_at)}</span>
                    <span className="text-red-400">
                      {memory.voiceNotes.length} voice note
                      {memory.voiceNotes.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
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
                  <span>Page Memory</span>
                  {selectedMemory.is_placeholder ? (
                    <span>Placeholder</span>
                  ) : null}
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

                  {selectedMemory.tags && selectedMemory.tags.length > 0 && (
                    <div className="flex items-center gap-2">
                      {selectedMemory.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600"
                        >
                          <Tag size={10} />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <FolderIcon size={14} className="text-zinc-400" />
                    <select
                      value={selectedMemory.folder_id || ""}
                      onChange={(e) =>
                        handleMoveToFolder(
                          selectedMemory.id,
                          e.target.value || null,
                        )
                      }
                      className="bg-transparent text-xs text-zinc-500 outline-none hover:text-zinc-900 cursor-pointer"
                    >
                      <option value="">No Folder</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void handleDeleteMemory(
                      selectedMemory.id,
                      selectedMemory.title?.trim() || "memory",
                    )
                  }
                  disabled={deletingMemoryId === selectedMemory.id}
                  className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingMemoryId === selectedMemory.id ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Trash2 size={15} />
                  )}
                  Delete Page
                </button>
              </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
              <section className="min-w-0">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Page Summary
                </h3>
                <article className="rounded-xl border border-zinc-200 bg-white px-5 py-5">
                  <div className="whitespace-pre-wrap text-sm leading-7 text-zinc-700">
                    {selectedMemory.summary?.trim() ||
                      selectedMemory.content?.trim() ||
                      selectedMemory.url}
                  </div>

                  {selectedMemory.content?.trim() ? (
                    <div className="mt-5 border-t border-zinc-200 pt-4">
                      <button
                        type="button"
                        onClick={() => toggleRawPageText(selectedMemory.id)}
                        className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 transition hover:text-zinc-900"
                      >
                        <ChevronDown
                          size={14}
                          className={`transition ${
                            showRawPageTextIds.includes(selectedMemory.id)
                              ? "rotate-180"
                              : ""
                          }`}
                        />
                        {showRawPageTextIds.includes(selectedMemory.id)
                          ? "Hide full extracted text"
                          : "Show full extracted text"}
                      </button>

                      {showRawPageTextIds.includes(selectedMemory.id) ? (
                        <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-zinc-600">
                          {normalizeExtractedText(selectedMemory.content)}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              </section>

              <aside className="order-first lg:order-0">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Attached Voice Notes
                      </h3>
                      <p className="mt-1 text-xs text-zinc-400">
                        {selectedMemory.voiceNotes.length} total
                      </p>
                    </div>
                  </div>

                  {selectedMemory.voiceNotes.length > 0 ? (
                    <div className="space-y-3">
                      {selectedMemory.voiceNotes.map((note) => {
                        const matched =
                          selectedMemory.matchedVoiceNoteIds?.includes(note.id);
                        const expanded = expandedVoiceNoteIds.includes(note.id);

                        return (
                          <div
                            key={note.id}
                            className={`rounded-lg border bg-white ${
                              matched ? "border-blue-200" : "border-zinc-200"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3 px-4 py-3">
                              <button
                                type="button"
                                onClick={() => toggleVoiceNote(note.id)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <div className="text-sm font-medium text-zinc-900">
                                  Voice Note
                                </div>
                                <div className="mt-1 text-xs text-zinc-500">
                                  {formatTimestamp(note.created_at)}
                                </div>
                              </button>

                              <div className="flex shrink-0 items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => playVoiceNote(note)}
                                  className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition hover:border-red-300 hover:bg-red-100"
                                >
                                  <Play size={13} fill="currentColor" />
                                  Play
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleVoiceNote(note.id)}
                                  aria-label={
                                    expanded
                                      ? "Collapse transcript"
                                      : "Expand transcript"
                                  }
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-900"
                                >
                                  <ChevronDown
                                    size={15}
                                    className={`transition ${
                                      expanded ? "rotate-180" : ""
                                    }`}
                                  />
                                </button>
                              </div>
                            </div>

                            {expanded ? (
                              <div className="border-t border-zinc-200 px-4 py-3">
                                <div className="mb-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                                  {note.content?.trim() ||
                                    "No transcript available."}
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleDeleteMemory(
                                      note.id,
                                      "voice note",
                                    )
                                  }
                                  disabled={deletingMemoryId === note.id}
                                  className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {deletingMemoryId === note.id ? (
                                    <Loader2
                                      size={13}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <Trash2 size={13} />
                                  )}
                                  Delete
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-500">
                      No voice notes attached to this page yet.
                    </div>
                  )}
                </div>
              </aside>
            </div>
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
