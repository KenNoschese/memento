"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Brain,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ExternalLink,
  Folder as FolderIcon,
  Loader2,
  Play,
  Plus,
  Search,
  Sparkles,
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

const SIDEBAR_MIN_WIDTH = 300;
const SIDEBAR_MAX_WIDTH = 460;
const SIDEBAR_DEFAULT_WIDTH = 384;
const SIDEBAR_COLLAPSED_WIDTH = 84;

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
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

function SectionLabel({
  icon,
  children,
}: {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
      {icon}
      <span>{children}</span>
    </div>
  );
}

function SidebarFilterButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
        active
          ? "bg-[var(--surface)] text-[var(--foreground)] ring-1 ring-[var(--accent-edge)]"
          : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
      }`}
    >
      <span
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
          active
            ? "bg-[var(--accent-soft)] text-[var(--accent)]"
            : "bg-[var(--surface-soft)] text-[var(--muted-strong)]"
        }`}
      >
        {icon}
      </span>
      <span className="truncate">{children}</span>
    </button>
  );
}

function MemoryListItem({
  memory,
  selected,
  highlighted,
  deleting,
  onSelect,
  onDelete,
}: {
  memory: PageMemoryRecord;
  selected: boolean;
  highlighted: boolean;
  deleting: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`group rounded-xl border px-4 py-4 text-left transition ${
        selected
          ? "border-[var(--accent-edge)] bg-[var(--surface)] shadow-sm"
          : "border-transparent bg-transparent hover:border-[var(--line)] hover:bg-[var(--surface)]"
      } ${highlighted ? "opacity-100" : "opacity-45"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium text-[var(--foreground)]">
            {memory.title?.trim() || "Untitled"}
          </div>
          <div className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--muted)]">
            {memory.summary?.trim() || memory.content?.trim() || memory.url}
          </div>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete ${memory.title?.trim() || "memory"}`}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${
            selected
              ? "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)]"
              : "border-transparent bg-transparent text-[var(--muted)] opacity-0 group-hover:opacity-100 hover:border-[var(--line)] hover:bg-[var(--surface)]"
          } ${deleting ? "pointer-events-none opacity-100" : ""}`}
        >
          {deleting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Trash2 size={14} />
          )}
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
        <span>{formatTimestamp(memory.created_at)}</span>
        <span className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[var(--muted-strong)]">
          {memory.voiceNotes.length} voice note
          {memory.voiceNotes.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

function VoiceQuoteCard({
  note,
  pageTitle,
  pageId,
  onSelectMemory,
}: {
  note: VoiceNoteRecord;
  pageTitle: string;
  pageId: string;
  onSelectMemory: (id: string) => void;
}) {
  return (
    <article className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
          {formatTimestamp(note.created_at)}
        </span>
        <button
          type="button"
          onClick={() => playVoiceNote(note)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--accent-edge)] bg-[var(--accent-soft)] text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-white"
        >
          <Play size={14} fill="currentColor" />
        </button>
      </div>
      <p className="mt-4 text-base leading-7 text-[var(--foreground)]">
        “{note.content}”
      </p>
      <button
        type="button"
        onClick={() => onSelectMemory(pageId)}
        className="mt-5 inline-flex w-full min-w-0 items-center gap-2 text-sm text-[var(--accent)] transition hover:text-[var(--accent-strong)]"
      >
        <span className="truncate">On {pageTitle}</span>
        <ExternalLink size={14} className="shrink-0" />
      </button>
    </article>
  );
}

function LandingView({
  briefing,
  isLoadingBriefing,
  memories,
  onSelectMemory,
}: {
  briefing: BriefingResponse;
  isLoadingBriefing: boolean;
  memories: PageMemoryRecord[];
  onSelectMemory: (id: string) => void;
}) {
  const recentVoiceNotes = useMemo(() => {
    const allNotes: (VoiceNoteRecord & { pageTitle: string; pageId: string })[] =
      [];

    memories.forEach((memory) => {
      memory.voiceNotes.forEach((note) => {
        allNotes.push({
          ...note,
          pageTitle: memory.title || "Untitled",
          pageId: memory.id,
        });
      });
    });

    return allNotes
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .slice(0, 3);
  }, [memories]);

  const recentPages = useMemo(() => memories.slice(0, 4), [memories]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-5 px-5 py-5 sm:px-8 lg:px-10 lg:py-6">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-6 py-6 shadow-sm sm:px-8 sm:py-7">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <SectionLabel icon={<Sparkles size={14} />}>Daily Briefing</SectionLabel>
          {isLoadingBriefing ? (
            <div className="mt-4 flex items-center gap-3 text-[var(--muted)]">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-base">Synthesizing your recent activity...</span>
            </div>
          ) : (
            <>
              <p className="mt-4 max-w-[44rem] text-balance text-lg leading-7 text-[var(--foreground-soft)] sm:text-[1.1rem]">
                {briefing.summary ||
                  "You haven&apos;t captured any memories yet today."}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {briefing.recentUrls.length > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      briefing.recentUrls.forEach((url) =>
                        window.open(url, "_blank", "noopener,noreferrer"),
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-full bg-[var(--foreground)] px-5 py-3 text-sm font-medium text-white transition hover:bg-[var(--foreground-soft)]"
                  >
                    <ExternalLink size={15} />
                    Resume work
                  </button>
                ) : null}
                <div className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 text-sm text-[var(--muted)]">
                  {memories.length} page memories captured
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <SectionLabel icon={<Brain size={14} />}>Recent Pages</SectionLabel>
            <span className="text-sm text-[var(--muted)]">{recentPages.length} shown</span>
          </div>
          <div className="mt-4 space-y-3">
            {recentPages.length > 0 ? (
              recentPages.map((memory) => (
                <button
                  type="button"
                  key={memory.id}
                  onClick={() => onSelectMemory(memory.id)}
                  className="flex w-full items-start justify-between gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-4 text-left transition hover:bg-[var(--surface)]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-base font-medium text-[var(--foreground)]">
                      {memory.title || "Untitled"}
                    </div>
                    <div className="mt-1 truncate text-sm text-[var(--muted)]">
                      {memory.url}
                    </div>
                  </div>
                  <span className="text-xs text-[var(--muted)]">
                    {formatTimestamp(memory.created_at)}
                  </span>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--line)] px-5 py-8 text-sm text-[var(--muted)]">
                No recent pages captured.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
          <SectionLabel icon={<Play size={14} />}>Voice Context</SectionLabel>
          <div className="mt-4 space-y-3">
            {recentVoiceNotes.length > 0 ? (
              recentVoiceNotes.map((note) => (
                <VoiceQuoteCard
                  key={note.id}
                  note={note}
                  pageId={note.pageId}
                  pageTitle={note.pageTitle}
                  onSelectMemory={onSelectMemory}
                />
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-soft)] px-5 py-8 text-sm text-[var(--muted)]">
                No recent voice notes.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
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
  const [isSignalsExpanded, setIsSignalsExpanded] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

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

    memories.forEach((memory) => {
      memory.tags?.forEach((tag) => tags.add(tag));
    });

    return Array.from(tags).sort();
  }, [memories]);

  const selectedMemory = useMemo(
    () => memories.find((memory) => memory.id === selectedMemoryId) ?? null,
    [memories, selectedMemoryId],
  );

  const resolvedSidebarWidth = isSidebarCollapsed
    ? SIDEBAR_COLLAPSED_WIDTH
    : sidebarWidth;

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
      setSelectedMemoryId((currentId) => currentId);
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
              voiceNotes: page.voiceNotes.filter((note) => note.id !== memoryId),
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

  const handleCreateFolder = async (event: FormEvent) => {
    event.preventDefault();
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
  }, [fetchBriefing, fetchFolders, fetchMemories]);

  useEffect(() => {
    if (!isResizingSidebar) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const nextWidth = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, event.clientX),
      );
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingSidebar]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] lg:h-screen lg:overflow-hidden">
      <div className="flex min-h-screen flex-col lg:h-screen lg:flex-row">
        <aside
          className="relative w-full shrink-0 border-b border-[var(--line)] bg-[var(--surface-soft)] lg:h-screen lg:w-[var(--sidebar-width)] lg:border-b-0 lg:border-r"
          style={{ ["--sidebar-width" as string]: `${resolvedSidebarWidth}px` }}
        >
          <div
            className={`flex h-full flex-col pb-4 pt-5 ${
              isSidebarCollapsed ? "px-3 sm:px-3 lg:px-3" : "px-4 sm:px-5 lg:px-6"
            }`}
          >
            <div
              className={`flex items-center gap-3 ${
                isSidebarCollapsed ? "justify-center" : "justify-between"
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedMemoryId(null)}
                className={`flex items-center text-left ${
                  isSidebarCollapsed ? "justify-center" : "gap-3"
                }`}
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--surface)] text-[var(--accent)] ring-1 ring-[var(--line)]">
                  <Brain size={19} />
                </span>
                {!isSidebarCollapsed ? (
                  <div>
                    <div className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                      Memory Browser
                    </div>
                    <h1 className="font-serif text-2xl text-[var(--foreground)]">
                      Memento
                    </h1>
                  </div>
                ) : null}
              </button>
              {!isSidebarCollapsed ? (
                <div className="flex items-center gap-2">
                  <div className="hidden rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--muted)] lg:block">
                    {filteredMemories.length} pages
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSidebarCollapsed(true)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition hover:text-[var(--foreground)]"
                    aria-label="Collapse sidebar"
                  >
                    <ChevronsLeft size={16} />
                  </button>
                </div>
              ) : null}
            </div>

            {isSidebarCollapsed ? (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition hover:text-[var(--foreground)]"
                  aria-label="Expand sidebar"
                >
                  <ChevronsRight size={16} />
                </button>
              </div>
            ) : null}

            {!isSidebarCollapsed ? (
              <>
                <form onSubmit={handleSearch} className="relative mt-6">
                  <Search
                    className="pointer-events-none absolute left-4 top-3.5 text-[var(--muted)]"
                    size={18}
                  />
                  <input
                    type="text"
                    placeholder="Search your browsing memory"
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] py-3 pl-11 pr-11 text-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
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
                      className="absolute right-4 top-3.5 animate-spin text-[var(--muted)]"
                      size={18}
                    />
                  ) : null}
                </form>
 
                <div className="mt-6 flex min-h-0 flex-1 flex-col gap-6 overflow-hidden">
                  <section>
                    <div className="mb-3 flex items-center justify-between gap-2 px-1">
                      <SectionLabel icon={<FolderIcon size={13} />}>Browse</SectionLabel>
                      <button
                        type="button"
                        onClick={() => setIsCreatingFolder(!isCreatingFolder)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                        title="Create folder"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    {isCreatingFolder ? (
                      <form onSubmit={handleCreateFolder} className="mb-3 px-1">
                        <input
                          autoFocus
                          type="text"
                          placeholder="New folder name"
                          value={newFolderName}
                          onChange={(event) => setNewFolderName(event.target.value)}
                          className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
                          onBlur={() => {
                            if (!newFolderName.trim()) setIsCreatingFolder(false);
                          }}
                        />
                      </form>
                    ) : null}

                    <div className="space-y-2">
                      <SidebarFilterButton
                        active={!selectedFolderId && !selectedTag}
                        onClick={() => {
                          setSelectedFolderId(null);
                          setSelectedTag(null);
                        }}
                        icon={<FolderIcon size={16} />}
                      >
                        All memories
                      </SidebarFilterButton>
                      {folders.map((folder) => (
                        <SidebarFilterButton
                          key={folder.id}
                          active={selectedFolderId === folder.id}
                          onClick={() => {
                            setSelectedFolderId(folder.id);
                            setSelectedTag(null);
                          }}
                          icon={<FolderIcon size={16} />}
                        >
                          {folder.name}
                        </SidebarFilterButton>
                      ))}
                    </div>
                  </section>

                  <section>
                    <button
                      type="button"
                      onClick={() => setIsSignalsExpanded((current) => !current)}
                      className="flex w-full items-center justify-between gap-3 px-1 text-left"
                    >
                      <SectionLabel icon={<Tag size={13} />}>Signals</SectionLabel>
                      <ChevronDown
                        size={15}
                        className={`text-[var(--muted)] transition ${
                          isSignalsExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {isSignalsExpanded ? (
                      <div className="mt-3 px-1">
                        <div className="flex flex-wrap gap-2">
                          {allTags.length > 0 ? (
                            allTags.map((tag) => (
                              <button
                                type="button"
                                key={tag}
                                onClick={() => {
                                  setSelectedTag(selectedTag === tag ? null : tag);
                                  setSelectedFolderId(null);
                                }}
                                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                                  selectedTag === tag
                                    ? "border-[var(--accent-edge)] bg-[var(--accent-soft)] text-[var(--accent)]"
                                    : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent-edge)] hover:text-[var(--foreground)]"
                                }`}
                              >
                                {tag}
                              </button>
                            ))
                          ) : (
                            <span className="px-1 text-sm text-[var(--muted)]">
                              No tags generated yet.
                            </span>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </section>

                  <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="mb-3 flex items-center justify-between gap-3 px-1">
                      <SectionLabel icon={<Brain size={13} />}>
                        {highlightedIds.length > 0 ? "Matches" : "Memory Stream"}
                      </SectionLabel>
                      <span className="text-xs text-[var(--muted)]">
                        {highlightedIds.length > 0
                          ? `${highlightedIds.length} found`
                          : `${filteredMemories.length} total`}
                      </span>
                    </div>
                    <div
                      className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--line)] hover:[&::-webkit-scrollbar-thumb]:bg-[var(--muted)]"
                      style={{ scrollbarColor: "var(--line) transparent" }}
                    >
                      {filteredMemories.map((memory) => {
                        const selected = memory.id === selectedMemoryId;
                        const highlighted =
                          highlightedIds.length === 0 ||
                          highlightedIds.includes(memory.id);

                        return (
                          <MemoryListItem
                            key={memory.id}
                            memory={memory}
                            selected={selected}
                            highlighted={highlighted}
                            deleting={deletingMemoryId === memory.id}
                            onSelect={() => setSelectedMemoryId(memory.id)}
                            onDelete={() =>
                              void handleDeleteMemory(
                                memory.id,
                                memory.title?.trim() || "memory",
                              )
                            }
                          />
                        );
                      })}
                    </div>
                  </section>
                </div>
              </>
            ) : (
              <div className="mt-6 flex flex-1 flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFolderId(null);
                    setSelectedTag(null);
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition hover:text-[var(--foreground)]"
                  aria-label="Show all memories"
                >
                  <FolderIcon size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMemoryId(null)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition hover:text-[var(--foreground)]"
                  aria-label="Open briefing"
                >
                  <Brain size={18} />
                </button>
              </div>
            )}
          </div>

          {!isSidebarCollapsed ? (
            <button
              type="button"
              aria-label="Resize sidebar"
              onMouseDown={() => setIsResizingSidebar(true)}
              className="absolute inset-y-0 right-0 hidden w-2 translate-x-1/2 cursor-col-resize lg:block"
            >
              <span className="absolute inset-y-8 left-1/2 w-px -translate-x-1/2 rounded-full bg-[var(--line)]" />
            </button>
          ) : null}
        </aside>

        <main className="min-w-0 flex-1 lg:h-screen lg:overflow-y-auto">
          {selectedMemory ? (
            <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
              <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <SectionLabel icon={<Brain size={14} />}>
                      Page Memory
                      {selectedMemory.is_placeholder ? " Placeholder" : ""}
                    </SectionLabel>
                    <h2 className="mt-4 max-w-3xl font-serif text-3xl leading-tight text-[var(--foreground)] sm:text-[2.45rem]">
                      {selectedMemory.title?.trim() || "Untitled"}
                    </h2>
                    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
                      <span>{formatTimestamp(selectedMemory.created_at)}</span>
                      <span className="hidden h-1 w-1 rounded-full bg-[var(--line)] sm:inline-block" />
                      <a
                        href={selectedMemory.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-w-0 items-center gap-2 text-[var(--accent)] transition hover:text-[var(--accent-strong)]"
                      >
                        <ExternalLink size={15} />
                        <span className="truncate">{selectedMemory.url}</span>
                      </a>
                    </div>
                    {(selectedMemory.tags?.length ?? 0) > 0 ? (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {selectedMemory.tags?.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs text-[var(--muted-strong)]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
                    <label className="inline-flex items-center gap-3 rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-2.5 text-sm text-[var(--muted)]">
                      <FolderIcon size={15} className="text-[var(--muted-strong)]" />
                      <select
                        value={selectedMemory.folder_id || ""}
                        onChange={(event) =>
                          handleMoveToFolder(
                            selectedMemory.id,
                            event.target.value || null,
                          )
                        }
                        className="bg-transparent pr-6 text-sm text-[var(--foreground)] outline-none"
                      >
                        <option value="">No Folder</option>
                        {folders.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        void handleDeleteMemory(
                          selectedMemory.id,
                          selectedMemory.title?.trim() || "memory",
                        )
                      }
                      disabled={deletingMemoryId === selectedMemory.id}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--muted)] transition hover:border-[#cbd5e1] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingMemoryId === selectedMemory.id ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Trash2 size={15} />
                      )}
                      Delete page
                    </button>
                  </div>
                </div>
              </section>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(18rem,0.88fr)]">
                <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
                  <SectionLabel icon={<Sparkles size={14} />}>Page Summary</SectionLabel>
                  <article className="mt-5 max-w-3xl whitespace-pre-wrap text-[1.02rem] leading-8 text-[var(--foreground-soft)]">
                    {selectedMemory.summary?.trim() ||
                      selectedMemory.content?.trim() ||
                      selectedMemory.url}
                  </article>

                  {selectedMemory.content?.trim() ? (
                    <div className="mt-8 border-t border-[var(--line)] pt-5">
                      <button
                        type="button"
                        onClick={() => toggleRawPageText(selectedMemory.id)}
                        className="inline-flex items-center gap-2 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
                      >
                        <ChevronDown
                          size={16}
                          className={`transition ${
                            showRawPageTextIds.includes(selectedMemory.id)
                              ? "rotate-180"
                              : ""
                          }`}
                        />
                        {showRawPageTextIds.includes(selectedMemory.id)
                          ? "Hide extracted text"
                          : "Show extracted text"}
                      </button>
                      {showRawPageTextIds.includes(selectedMemory.id) ? (
                        <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[var(--muted)]">
                          {normalizeExtractedText(selectedMemory.content)}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                <aside className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <SectionLabel icon={<Play size={14} />}>Voice Notes</SectionLabel>
                    <span className="text-sm text-[var(--muted)]">
                      {selectedMemory.voiceNotes.length} total
                    </span>
                  </div>

                  <div className="mt-5 space-y-3">
                    {selectedMemory.voiceNotes.length > 0 ? (
                      selectedMemory.voiceNotes.map((note) => {
                        const matched =
                          selectedMemory.matchedVoiceNoteIds?.includes(note.id);
                        const expanded = expandedVoiceNoteIds.includes(note.id);

                        return (
                          <article
                            key={note.id}
                            className={`rounded-xl border bg-[var(--surface)] p-4 transition ${
                              matched
                                ? "border-[var(--accent-edge)] bg-[var(--accent-soft)]"
                                : "border-[var(--line)]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => toggleVoiceNote(note.id)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <div className="text-sm font-medium text-[var(--foreground)]">
                                  Voice note
                                </div>
                                <div className="mt-1 text-xs text-[var(--muted)]">
                                  {formatTimestamp(note.created_at)}
                                </div>
                              </button>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => playVoiceNote(note)}
                                  className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-edge)] bg-[var(--accent-soft)] px-3 py-2 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-white"
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
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition hover:text-[var(--foreground)]"
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
                              <div className="mt-4 border-t border-[var(--line)] pt-4">
                                <div className="whitespace-pre-wrap text-sm leading-7 text-[var(--foreground-soft)]">
                                  {note.content?.trim() ||
                                    "No transcript available."}
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleDeleteMemory(note.id, "voice note")
                                  }
                                  disabled={deletingMemoryId === note.id}
                                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)] transition hover:border-[#cbd5e1] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {deletingMemoryId === note.id ? (
                                    <Loader2 size={13} className="animate-spin" />
                                  ) : (
                                    <Trash2 size={13} />
                                  )}
                                  Delete
                                </button>
                              </div>
                            ) : null}
                          </article>
                        );
                      })
                    ) : (
                      <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-soft)] px-5 py-8 text-sm text-[var(--muted)]">
                        No voice notes attached to this page yet.
                      </div>
                    )}
                  </div>
                </aside>
              </div>
            </div>
          ) : (
            <LandingView
              briefing={briefing}
              isLoadingBriefing={isLoadingBriefing}
              memories={memories}
              onSelectMemory={setSelectedMemoryId}
            />
          )}
        </main>
      </div>
    </div>
  );
}
