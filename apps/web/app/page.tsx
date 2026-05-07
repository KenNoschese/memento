"use client";

import Image from "next/image";
import * as Select from "@radix-ui/react-select";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Brain,
  Check,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ExternalLink,
  Folder as FolderIcon,
  Loader2,
  Moon,
  Play,
  Plus,
  Sparkles,
  Sun,
  Tag,
  Trash2,
} from "lucide-react";
import type {
  BriefingResponse,
  Folder,
  PageMemoryRecord,
  ThreadSummary,
  VoiceNoteRecord,
  WorkflowSignal,
} from "@/app/lib/types";
import { normalizeExtractedText } from "@/app/lib/memories";

type MemoriesResponse = {
  memories: PageMemoryRecord[];
  threads?: ThreadSummary[];
};

const SIDEBAR_MAX_WIDTH = 460;
const SIDEBAR_DEFAULT_WIDTH = SIDEBAR_MAX_WIDTH;
const SIDEBAR_COLLAPSED_WIDTH = 84;
const USER_STORAGE_KEY = "memento_user_id";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getMemoryTitle(memory: PageMemoryRecord) {
  return memory.title?.trim() || "Untitled";
}

function getMemorySummary(memory: PageMemoryRecord) {
  return memory.summary?.trim() || memory.content?.trim() || memory.url;
}

function getSourceLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

function getSelectedBrowseLabel(
  folders: Folder[],
  selectedFolderId: string | null,
  selectedTag: string | null,
) {
  if (selectedTag) {
    return `Tag: ${selectedTag}`;
  }

  if (!selectedFolderId) {
    return "All memories";
  }

  return (
    folders.find((folder) => folder.id === selectedFolderId)?.name ||
    "Selected folder"
  );
}

function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });

  const toggleTheme = () => {
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    } else {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    }
    setIsDark(!isDark);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-(--line) bg-(--surface) text-(--muted) transition-all hover:border-(--accent-edge) hover:text-(--accent) active:scale-95"
      aria-label="Toggle theme"
    >
      <div className="relative h-5 w-5">
        <Sun
          size={20}
          className={`absolute inset-0 transition-all duration-500 ${
            isDark
              ? "rotate-90 scale-0 opacity-0"
              : "rotate-0 scale-100 opacity-100"
          }`}
        />
        <Moon
          size={20}
          className={`absolute inset-0 transition-all duration-500 ${
            isDark
              ? "rotate-0 scale-100 opacity-100"
              : "-rotate-90 scale-0 opacity-0"
          }`}
        />
      </div>
    </button>
  );
}

function SectionLabel({
  icon,
  children,
}: {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">
      {icon}
      <span>{children}</span>
    </div>
  );
}

function Logo({ size, className }: { size?: number; className?: string }) {
  const style = size ? { width: size, height: size } : undefined;
  return (
    <div className={`relative flex items-center justify-center ${className || ""}`} style={style}>
      <Image
        src="/logo_dark.png"
        alt="Memento"
        fill
        className="object-contain block [.dark_&]:hidden"
        priority
      />
      <Image
        src="/logo_light.png"
        alt="Memento"
        fill
        className="object-contain hidden [.dark_&]:block"
        priority
      />
    </div>
  );
}

function SidebarFilterButton({
  active,
  onClick,
  onDrop,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  onDrop?: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  const [isOver, setIsOver] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={(e) => {
        if (onDrop) {
          e.preventDefault();
          setIsOver(true);
        }
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        if (onDrop) {
          e.preventDefault();
          setIsOver(false);
          onDrop();
          setShowSuccess(true);
          setTimeout(() => setShowSuccess(false), 2000);
        }
      }}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
        active || isOver || showSuccess
          ? "bg-(--surface) text-foreground ring-1 ring-(--accent-edge)"
          : "text-(--muted) hover:bg-(--surface) hover:text-foreground"
      } ${isOver ? "scale-[1.02] shadow-sm" : ""} ${
        showSuccess ? "ring-(--accent)" : ""
      }`}
    >
      <span
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
          active || showSuccess
            ? "bg-(--accent-soft) text-(--accent)"
            : "bg-(--surface-soft) text-(--muted-strong)"
        }`}
      >
        {showSuccess ? <Check size={16} /> : icon}
      </span>
      <span className="truncate">{children}</span>
    </button>
  );
}

function ConfirmDeleteDialog({
  open,
  title,
  description,
  confirmLabel,
  isWorking,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  isWorking: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-(--line) bg-(--surface) p-6 shadow-2xl">
        <div className="text-lg font-semibold text-foreground">{title}</div>
        <p className="mt-3 text-sm leading-7 text-(--muted)">{description}</p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isWorking}
            className="inline-flex items-center justify-center rounded-full border border-(--line) bg-(--surface) px-4 py-2.5 text-sm text-(--muted) transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isWorking}
            className="inline-flex min-w-28 items-center justify-center gap-2 rounded-full bg-[#a44d3f] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#8d4034] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isWorking ? <Loader2 size={15} className="animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function MemoryListItem({
  memory,
  signal,
  selected,
  highlighted,
  deleting,
  onSelect,
  onDelete,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  memory: PageMemoryRecord;
  signal?: WorkflowSignal;
  selected: boolean;
  highlighted: boolean;
  deleting: boolean;
  isDragging?: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`group rounded-xl border px-4 py-4 text-left transition ${
        selected
          ? "border-(--accent-edge) bg-(--surface) shadow-sm"
          : "border-(--line) bg-(--surface) hover:border-(--accent-edge) hover:bg-(--surface)"
      } ${highlighted ? "opacity-100" : "opacity-45"} ${
        isDragging ? "opacity-25" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {signal?.hasOpenLoop ? (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-(--surface-soft) px-2.5 py-1 text-[10px] font-medium text-(--muted-strong)">
                Resume
              </span>
            </div>
          ) : null}
          <div className="truncate font-medium text-foreground">
            {getMemoryTitle(memory)}
          </div>
          <div className="mt-1 line-clamp-2 text-sm leading-6 text-(--muted)">
            {signal?.resumeReason || getMemorySummary(memory)}
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
              ? "border-(--line) bg-(--surface) text-(--muted) hover:text-foreground"
              : "border-transparent bg-transparent text-(--muted) opacity-0 group-hover:opacity-100 hover:border-(--line) hover:bg-(--surface)"
          } ${deleting ? "pointer-events-none opacity-100" : ""}`}
        >
          {deleting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Trash2 size={14} />
          )}
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-(--muted)">
        <span>{formatTimestamp(memory.created_at)}</span>
        <div className="flex items-center gap-2">
          {signal?.decisionCount ? (
            <span className="rounded-full bg-(--surface-soft) px-2.5 py-1 text-(--muted-strong)">
              {signal.decisionCount} decision
              {signal.decisionCount === 1 ? "" : "s"}
            </span>
          ) : null}
          <span className="rounded-full bg-(--surface-soft) px-2.5 py-1 text-(--muted-strong)">
            {memory.voiceNotes.length} voice note
            {memory.voiceNotes.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </div>
  );
}

function FolderPicker({
  folders,
  value,
  onChange,
}: {
  folders: Folder[];
  value: string | null;
  onChange: (folderId: string | null) => void;
}) {
  return (
    <Select.Root
      value={value ?? "__none__"}
      onValueChange={(nextValue) =>
        onChange(nextValue === "__none__" ? null : nextValue)
      }
    >
      <Select.Trigger className="inline-flex items-center gap-3 rounded-2xl border border-(--line) bg-(--surface) py-2.5 pl-4 pr-10 text-sm text-(--muted) shadow-sm transition hover:border-(--accent-edge) hover:text-foreground data-[state=open]:border-(--accent-edge)">
        <FolderIcon size={15} className="text-(--muted-strong)" />
        <Select.Value
          placeholder="No Folder"
          className="min-w-34 text-left text-sm font-medium text-foreground"
        />
        <Select.Icon className="absolute right-4 top-1/2 -translate-y-1/2 text-(--muted)">
          <ChevronDown size={15} />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={8}
          align="end"
          className="z-30 min-w-(--radix-select-trigger-width) overflow-hidden rounded-2xl border border-(--line) bg-(--surface) p-1.5 shadow-[0_12px_30px_rgba(38,33,28,0.12)]"
        >
          <Select.Viewport>
            <Select.Item
              value="__none__"
              className="relative flex cursor-default items-center rounded-xl py-2.5 pl-9 pr-3 text-sm text-(--foreground-soft) outline-none transition data-highlighted:bg-(--surface-soft) data-highlighted:text-foreground data-checked:bg-(--accent-soft) data-checked:text-(--accent)"
            >
              <Select.ItemIndicator className="absolute left-3 inline-flex items-center text-(--accent)">
                <Check size={14} />
              </Select.ItemIndicator>
              <Select.ItemText>No Folder</Select.ItemText>
            </Select.Item>

            {folders.map((folder) => (
              <Select.Item
                key={folder.id}
                value={folder.id}
                className="relative mt-1 flex cursor-default items-center rounded-xl py-2.5 pl-9 pr-3 text-sm text-(--foreground-soft) outline-none transition data-highlighted:bg-(--surface-soft) data-highlighted:text-foreground data-checked:bg-(--accent-soft) data-checked:text-(--accent)"
              >
                <Select.ItemIndicator className="absolute left-3 inline-flex items-center text-(--accent)">
                  <Check size={14} />
                </Select.ItemIndicator>
                <Select.ItemText>{folder.name}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function LandingView({
  briefing,
  isLoadingBriefing,
  memories,
  threads,
  chatMessages,
  isSendingChat,
  onSendChat,
  onSelectMemory,
}: {
  briefing: BriefingResponse;
  isLoadingBriefing: boolean;
  memories: PageMemoryRecord[];
  threads: ThreadSummary[];
  chatMessages: {
    role: "user" | "assistant";
    content: string;
    sources?: PageMemoryRecord[];
  }[];
  isSendingChat: boolean;
  onSendChat: (query: string) => void;
  onSelectMemory: (id: string) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [chatMessages]);

  const suggestions = [
    "What was I trying to decide last?",
    "What should I revisit next?",
    "Show me pages with voice notes about product direction.",
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSendChat(inputValue);
      setInputValue("");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-6 sm:px-8">
      <div className="pb-6">
        <section className="mb-8 overflow-hidden rounded-[2rem] border border-(--line) bg-[linear-gradient(135deg,var(--surface)_0%,var(--surface)_58%,var(--accent-soft)_100%)] px-6 py-6 shadow-sm sm:px-8">
          <div className="flex items-center">
            <SectionLabel icon={<Sparkles size={14} />}>
              Resume Desk
            </SectionLabel>
          </div>

          <div className="mt-4">
            <div className="grid gap-6">
              <div className="max-w-3xl">
                <h2 className="font-serif text-3xl leading-tight text-foreground sm:text-[2.6rem]">
                  Pick up the thread, not just the tab.
                </h2>
                <p className="mt-3 max-w-3xl text-base leading-7 text-(--foreground-soft)">
                  {isLoadingBriefing
                    ? "Synthesizing your recent activity..."
                    : briefing.summary ||
                      "Start browsing or recording voice notes and Memento will turn them into resumable work threads."}
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
                <div className="rounded-[1.6rem] border border-(--line) bg-(--surface) p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <SectionLabel icon={<Brain size={14} />}>
                        Continue Thread
                      </SectionLabel>
                      {threads[0] ? (
                        <>
                          <h3 className="mt-4 text-xl font-semibold text-foreground">
                            {threads[0].title}
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-(--foreground-soft)">
                            {threads[0].resumeReason}
                          </p>
                        </>
                      ) : (
                        <p className="mt-4 text-sm leading-6 text-(--muted)">
                          No active thread yet. Capture a few pages and a voice note to make the resume layer useful.
                        </p>
                      )}
                    </div>
                    {threads[0] ? (
                      <button
                        type="button"
                        onClick={() => onSelectMemory(threads[0].latestMemoryId)}
                        className="inline-flex shrink-0 items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:bg-(--foreground-soft)"
                      >
                        Open thread
                        <ExternalLink size={14} />
                      </button>
                    ) : null}
                  </div>
                  {threads[0] ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      <span className="rounded-full bg-(--accent-soft) px-3 py-1.5 text-xs font-medium text-(--accent)">
                        {threads[0].label}
                      </span>
                      <span className="rounded-full border border-(--line) bg-(--surface-soft) px-3 py-1.5 text-xs text-(--muted-strong)">
                        {threads[0].memoryCount} memories
                      </span>
                      <span className="rounded-full border border-(--line) bg-(--surface-soft) px-3 py-1.5 text-xs text-(--muted-strong)">
                        {threads[0].voiceNoteCount} voice notes
                      </span>
                      {threads[0].decisionCount > 0 ? (
                        <span className="rounded-full border border-(--line) bg-(--surface-soft) px-3 py-1.5 text-xs text-(--muted-strong)">
                          {threads[0].decisionCount} decisions
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[1.6rem] border border-(--line) bg-(--surface) p-5 shadow-sm">
                  <SectionLabel icon={<Brain size={14} />}>
                    Snapshot
                  </SectionLabel>
                  <div className="mt-4 space-y-3 text-sm text-(--foreground-soft)">
                    <p>{memories.length} pages captured.</p>
                    <p>{threads.length} active threads detected.</p>
                    {briefing.recentUrls[0] ? (
                      <button
                        type="button"
                        onClick={() =>
                          window.open(
                            briefing.recentUrls[0],
                            "_blank",
                            "noopener,noreferrer",
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-full border border-(--line) bg-(--surface-soft) px-3 py-2 text-xs text-(--muted-strong) transition hover:border-(--accent-edge) hover:text-foreground"
                      >
                        Resume latest page
                        <ExternalLink size={13} />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {chatMessages.length > 0 ? (
          <div className="space-y-6">
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex flex-col ${
                  msg.role === "user" ? "items-end" : "items-start"
                }`}
              >
                {msg.role === "user" ? (
                  <div className="max-w-[85%] rounded-[1.6rem] border border-transparent bg-(--accent-strong) px-5 py-4 text-white shadow-[0_10px_24px_rgba(118,81,54,0.18)] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
                    <p className="whitespace-pre-wrap leading-7">{msg.content}</p>
                  </div>
                ) : (
                  <div className="w-full max-w-[85%] rounded-[1.7rem] border border-(--line) bg-(--surface) p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <SectionLabel icon={<Logo size={16} className="h-4 w-4" />}>
                        Memento
                      </SectionLabel>
                      {msg.sources?.length ? (
                        <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] font-medium text-(--muted)">
                          <span className="rounded-full bg-(--surface-soft) px-2.5 py-1">
                            {msg.sources.length} source
                            {msg.sources.length === 1 ? "" : "s"}
                          </span>
                          <span className="rounded-full bg-(--surface-soft) px-2.5 py-1">
                            {msg.sources.reduce(
                              (count, source) => count + source.voiceNotes.length,
                              0,
                            )}{" "}
                            note
                            {msg.sources.reduce(
                              (count, source) => count + source.voiceNotes.length,
                              0,
                            ) === 1
                              ? ""
                              : "s"}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4">
                      <p className="whitespace-pre-wrap leading-7 text-foreground">
                        {msg.content}
                      </p>
                    </div>

                    {msg.sources && msg.sources.length > 0 ? (
                      <div className="mt-5 border-t border-(--line) pt-4">
                        <div className="mb-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                          Sources
                        </div>
                        <div className="space-y-2.5">
                          {msg.sources.slice(0, 3).map((source) => (
                            <button
                              key={source.id}
                              onClick={() => onSelectMemory(source.id)}
                              className="group flex w-full items-start justify-between gap-3 rounded-[1.1rem] border border-(--line) bg-(--surface-soft) px-4 py-3 text-left transition hover:border-(--accent-edge) hover:bg-(--surface)"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-foreground">
                                  {source.title || "Untitled"}
                                </div>
                                <div className="mt-1 line-clamp-2 text-xs leading-5 text-(--muted)">
                                  {source.summary || source.url}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-(--muted-strong)">
                                  <span>{getSourceLabel(source.url)}</span>
                                  {source.voiceNotes.length > 0 ? (
                                    <>
                                      <span className="h-1 w-1 rounded-full bg-(--line)" />
                                      <span>
                                        {source.voiceNotes.length} note
                                        {source.voiceNotes.length === 1 ? "" : "s"}
                                      </span>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                              <ExternalLink
                                size={14}
                                className="mt-0.5 shrink-0 text-(--muted) transition group-hover:text-(--accent)"
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
            {isSendingChat && (
              <div className="flex items-center gap-3 text-(--muted)">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Memento is thinking...</span>
              </div>
            )}
          </div>
        ) : null}
        <div ref={chatEndRef} />
      </div>

      <div className="sticky bottom-0 mt-2 border-t border-(--line) bg-gradient-to-t from-(--background) via-(--background) to-transparent px-4 pb-8 pt-6 sm:px-8">
        <div className="group/chat mx-auto max-w-3xl">
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-3 transition duration-200 group-hover/chat:-translate-y-2 group-focus-within/chat:-translate-y-2"
          >
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Ask Memento..."
                className="w-full rounded-[1.6rem] border border-(--line) bg-(--surface) py-4 pl-6 pr-14 text-base shadow-[0_12px_34px_rgba(38,33,28,0.08)] outline-none transition focus:border-(--accent) focus:ring-1 focus:ring-(--accent-soft) group-hover/chat:border-(--accent-edge)"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                disabled={isSendingChat}
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isSendingChat}
                className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl bg-(--accent) text-white transition hover:bg-(--accent-strong) disabled:opacity-50"
              >
                {isSendingChat ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Sparkles size={18} />
                )}
              </button>
            </div>
          </form>

          <div className="mt-3 flex flex-wrap justify-center gap-2.5 transition duration-200 group-hover/chat:-translate-y-1 group-focus-within/chat:-translate-y-1">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onSendChat(suggestion)}
                className="rounded-full border border-(--line) bg-(--surface)/92 px-4 py-2.5 text-sm text-(--muted-strong) shadow-sm backdrop-blur transition hover:border-(--accent-edge) hover:bg-(--accent-soft) hover:text-(--accent)"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const searchParams = useSearchParams();
  const urlUserId = (searchParams.get("user") || "").trim();
  const [userId, setUserId] = useState<string | null>(null);
  const [isUserIdReady, setIsUserIdReady] = useState(false);
  const [memories, setMemories] = useState<PageMemoryRecord[]>([]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [briefing, setBriefing] = useState<BriefingResponse>({
    summary: "",
    recentUrls: [],
  });
  const [isLoadingBriefing, setIsLoadingBriefing] = useState(true);
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [confirmDeleteState, setConfirmDeleteState] = useState<
    | {
        kind: "memory" | "folder";
        id: string;
        label: string;
      }
    | null
  >(null);
  const [expandedVoiceNoteIds, setExpandedVoiceNoteIds] = useState<string[]>(
    [],
  );
  const [showRawPageTextIds, setShowRawPageTextIds] = useState<string[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isBrowseExpanded, setIsBrowseExpanded] = useState(true);
  const [isSignalsExpanded, setIsSignalsExpanded] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [chatMessages, setChatMessages] = useState<
    {
      role: "user" | "assistant";
      content: string;
      sources?: PageMemoryRecord[];
    }[]
  >([]);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [draggedMemoryId, setDraggedMemoryId] = useState<string | null>(null);
  const [playingVoiceNoteId, setPlayingVoiceNoteId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else if (savedTheme === "light") {
      document.documentElement.classList.remove("dark");
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.classList.add("dark");
    }
  }, []);

  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const sortedMemories = useMemo(
    () =>
      [...memories].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [memories],
  );

  const filteredMemories = useMemo(() => {
    return sortedMemories.filter((memory) => {
      if (selectedFolderId) {
        return memory.folder_id === selectedFolderId;
      }
      if (selectedTag) {
        return memory.tags?.includes(selectedTag);
      }
      return true;
    });
  }, [selectedFolderId, selectedTag, sortedMemories]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();

    sortedMemories.forEach((memory) => {
      memory.tags?.forEach((tag) => tags.add(tag));
    });

    return Array.from(tags).sort();
  }, [sortedMemories]);

  const selectedBrowseLabel = useMemo(
    () => getSelectedBrowseLabel(folders, selectedFolderId, selectedTag),
    [folders, selectedFolderId, selectedTag],
  );

  const selectedMemory = useMemo(
    () => memories.find((memory) => memory.id === selectedMemoryId) ?? null,
    [memories, selectedMemoryId],
  );

  const selectedSignal = useMemo<WorkflowSignal | null>(
    () =>
      selectedMemory
        ? {
            threadId: selectedMemory.thread_id ?? selectedMemory.id,
            threadLabel: selectedMemory.thread_label ?? "Recent capture",
            resumeReason:
              selectedMemory.resume_reason ?? getMemorySummary(selectedMemory),
            relatedMemoryIds: selectedMemory.related_memory_ids ?? [],
            hasOpenLoop: Boolean(selectedMemory.has_open_loop),
            decisionCount: selectedMemory.decision_count ?? 0,
            actionItemCount: selectedMemory.action_item_count ?? 0,
            voiceNoteCount:
              selectedMemory.voice_note_count ?? selectedMemory.voiceNotes.length,
          }
        : null,
    [selectedMemory],
  );

  const relatedMemories = useMemo(() => {
    if (!selectedSignal) {
      return [];
    }

    return selectedSignal.relatedMemoryIds
      .map((memoryId) => memories.find((memory) => memory.id === memoryId))
      .filter((memory): memory is PageMemoryRecord => Boolean(memory));
  }, [memories, selectedSignal]);

  const resolvedSidebarWidth = isSidebarCollapsed
    ? SIDEBAR_COLLAPSED_WIDTH
    : SIDEBAR_DEFAULT_WIDTH;

  const fetchBriefing = useCallback(async () => {
    try {
      if (!userId) {
        setBriefing({
          summary: "Briefing is unavailable right now.",
          recentUrls: [],
        });
        return;
      }

      const response = await fetch(
        `/api/briefing?memento_user_id=${encodeURIComponent(userId)}`,
      );
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
  }, [userId]);

  const handleChatSubmit = useCallback(
    async (query: string) => {
      if (!query.trim() || !userId || isSendingChat) return;

      const userMessage = { role: "user" as const, content: query.trim() };
      const currentHistory = [...chatMessages];
      setChatMessages((prev) => [...prev, userMessage]);
      setIsSendingChat(true);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: query.trim(),
            history: currentHistory.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            memento_user_id: userId,
          }),
        });

        if (!response.ok) {
          throw new Error("Chat request failed");
        }

        const data = await response.json();
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            sources: data.sources,
          },
        ]);
      } catch (error) {
        console.error("Chat error:", error);
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "I'm sorry, I encountered an error while processing your request.",
          },
        ]);
      } finally {
        setIsSendingChat(false);
      }
    },
    [userId, isSendingChat, chatMessages],
  );

  const fetchMemories = useCallback(async () => {
    if (!userId) {
      setMemories([]);
      setThreads([]);
      setSelectedMemoryId(null);
      return;
    }

    try {
      const response = await fetch(
        `/api/memories?memento_user_id=${encodeURIComponent(userId)}`,
      );
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
      setThreads(data.threads ?? []);
      setSelectedMemoryId((currentId) => currentId);
    } catch (error) {
      console.error("Failed to fetch memories:", error);
      setMemories([]);
      setThreads([]);
      setSelectedMemoryId(null);
    }
  }, [userId]);

  const deleteMemoryById = useCallback(async (memoryId: string) => {
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
    } finally {
      setDeletingMemoryId(null);
    }
  }, []);

  const handleDeleteMemory = useCallback((memoryId: string, label: string) => {
    setConfirmDeleteState({
      kind: "memory",
      id: memoryId,
      label,
    });
  }, []);

  const deleteFolderById = useCallback(async (folderId: string) => {
    setDeletingFolderId(folderId);

    try {
      const response = await fetch("/api/folders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: folderId }),
      });
      const data = (await response.json()) as
        | { success: boolean }
        | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Delete failed");
      }

      setFolders((current) => current.filter((folder) => folder.id !== folderId));
      setMemories((current) =>
        current.map((memory) =>
          memory.folder_id === folderId
            ? {
                ...memory,
                folder_id: null,
              }
            : memory,
        ),
      );
      setSelectedFolderId((current) => (current === folderId ? null : current));
    } catch (error) {
      console.error("Delete folder failed:", error);
    } finally {
      setDeletingFolderId(null);
    }
  }, []);

  const handleDeleteFolder = useCallback((folderId: string, label: string) => {
    setConfirmDeleteState({
      kind: "folder",
      id: folderId,
      label,
    });
  }, []);

  const closeDeleteDialog = useCallback(() => {
    if (deletingMemoryId || deletingFolderId) {
      return;
    }

    setConfirmDeleteState(null);
  }, [deletingFolderId, deletingMemoryId]);

  const confirmDelete = useCallback(async () => {
    if (!confirmDeleteState) {
      return;
    }

    if (confirmDeleteState.kind === "memory") {
      await deleteMemoryById(confirmDeleteState.id);
    } else {
      await deleteFolderById(confirmDeleteState.id);
    }

    setConfirmDeleteState(null);
  }, [confirmDeleteState, deleteFolderById, deleteMemoryById]);

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
    if (!userId) {
      setFolders([]);
      return;
    }

    try {
      const response = await fetch(
        `/api/folders?memento_user_id=${encodeURIComponent(userId)}`,
      );
      const data = (await response.json()) as { folders: Folder[] };
      setFolders(data.folders || []);
    } catch (error) {
      console.error("Failed to fetch folders:", error);
    }
  }, [userId]);

  const handleCreateFolder = async (event: FormEvent) => {
    event.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      const response = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFolderName.trim(),
          memento_user_id: userId,
        }),
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

  const handlePlayVoiceNote = useCallback(
    (note: VoiceNoteRecord) => {
      if (playingVoiceNoteId) {
        return;
      }

      const finishPlayback = () => {
        activeAudioRef.current = null;
        activeUtteranceRef.current = null;
        setPlayingVoiceNoteId(null);
      };

      setPlayingVoiceNoteId(note.id);

      if (note.audio) {
        const audio = new Audio(note.audio);
        activeAudioRef.current = audio;
        audio.onended = finishPlayback;
        audio.onerror = finishPlayback;
        audio.play().catch((err) => {
          console.error("Playback failed:", err);
          activeAudioRef.current = null;

          if (!note.content) {
            finishPlayback();
            return;
          }

          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(note.content);
          activeUtteranceRef.current = utterance;
          utterance.onend = finishPlayback;
          utterance.onerror = finishPlayback;
          window.speechSynthesis.speak(utterance);
        });
        return;
      }

      if (note.content) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(note.content);
        activeUtteranceRef.current = utterance;
        utterance.onend = finishPlayback;
        utterance.onerror = finishPlayback;
        window.speechSynthesis.speak(utterance);
        return;
      }

      finishPlayback();
    },
    [playingVoiceNoteId],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedUserId = window.localStorage.getItem(USER_STORAGE_KEY)?.trim();
    let resolvedUserId = storedUserId || "";

    if (urlUserId) {
      resolvedUserId = urlUserId;
      window.localStorage.setItem(USER_STORAGE_KEY, resolvedUserId);
    } else if (!resolvedUserId) {
      resolvedUserId = `user-${crypto.randomUUID().slice(0, 8)}`;
      window.localStorage.setItem(USER_STORAGE_KEY, resolvedUserId);
    }

    console.log("Dashboard synced to ID:", resolvedUserId);
    setTimeout(() => {
      setUserId(resolvedUserId);
      setIsUserIdReady(true);
    }, 0);
  }, [urlUserId]);

  useEffect(() => {
    if (!isUserIdReady) {
      return;
    }

    if (!userId) {
      setTimeout(() => {
        setIsLoadingBriefing(false);
        setMemories([]);
        setSelectedMemoryId(null);
      }, 0);
      return;
    }

    setTimeout(() => {
      setIsLoadingBriefing(true);
    }, 0);

    const timeoutId = window.setTimeout(() => {
      void fetchBriefing();
      void fetchMemories();
      void fetchFolders();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchBriefing, fetchFolders, fetchMemories, isUserIdReady, userId]);

  useEffect(() => {
    return () => {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current.src = "";
      }
      window.speechSynthesis.cancel();
    };
  }, []);

  if (!isUserIdReady) {
    return (
      <div className="min-h-screen bg-background px-6 py-16 text-foreground">
        <div className="mx-auto max-w-2xl rounded-2xl border border-(--line) bg-(--surface) p-6 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="mt-3 text-sm text-(--muted)">
            Preparing your workspace...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground lg:h-screen lg:overflow-hidden">
      <div className="flex min-h-screen flex-col lg:h-screen lg:flex-row">
        <aside
          className="relative w-full shrink-0 border-b border-(--line) bg-(--surface-soft) lg:h-screen lg:w-(--sidebar-width) lg:border-b-0 lg:border-r"
          style={{ ["--sidebar-width" as string]: `${resolvedSidebarWidth}px` }}
        >
          <div
            className={`flex h-full flex-col pb-4 pt-5 ${
              isSidebarCollapsed
                ? "px-3 sm:px-3 lg:px-3"
                : "px-4 sm:px-5 lg:px-6"
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
                <Logo size={64} className="h-16 w-16 overflow-hidden rounded-2xl" />
                {!isSidebarCollapsed ? (
                  <div>
                    <div className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                      Memory Browser
                    </div>
                    <h1 className="font-serif text-2xl text-foreground">
                      Memento
                    </h1>
                  </div>
                ) : null}
              </button>
              {!isSidebarCollapsed ? (
                <div className="flex items-center gap-2">
                  <div className="hidden rounded-full border border-(--line) bg-(--surface) px-3 py-1.5 text-xs text-(--muted) lg:block">
                    {filteredMemories.length} pages
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSidebarCollapsed(true)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-(--line) bg-(--surface) text-(--muted) transition hover:text-foreground"
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
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-(--line) bg-(--surface) text-(--muted) transition hover:text-foreground"
                  aria-label="Expand sidebar"
                >
                  <ChevronsRight size={16} />
                </button>
              </div>
            ) : null}

            {!isSidebarCollapsed ? (
              <>
                <div className="mt-6 flex min-h-0 flex-1 flex-col gap-6 overflow-hidden">
                  <section className="rounded-[1.25rem] border border-(--line) bg-(--surface)/55 px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setIsBrowseExpanded((current) => !current)}
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <SectionLabel icon={<FolderIcon size={13} />}>
                            Browse
                          </SectionLabel>
                          <span className="rounded-full border border-(--line) bg-(--surface) px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-(--muted)">
                            {folders.length + 1}
                          </span>
                        </div>
                        <ChevronDown
                          size={15}
                          className={`text-(--muted) transition ${
                            isBrowseExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsBrowseExpanded(true);
                          setIsCreatingFolder(!isCreatingFolder);
                        }}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-(--muted) transition hover:bg-(--surface) hover:text-foreground"
                        title="Create folder"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    {isBrowseExpanded ? (
                      <div className="mt-3 space-y-3">
                        {isCreatingFolder ? (
                          <form onSubmit={handleCreateFolder} className="px-1">
                            <input
                              autoFocus
                              type="text"
                              placeholder="New folder name"
                              value={newFolderName}
                              onChange={(event) =>
                                setNewFolderName(event.target.value)
                              }
                              className="w-full rounded-xl border border-(--line) bg-(--surface) px-4 py-3 text-sm outline-none focus:border-(--accent)"
                              onBlur={() => {
                                if (!newFolderName.trim())
                                  setIsCreatingFolder(false);
                              }}
                            />
                          </form>
                        ) : null}

                        <SidebarFilterButton
                          active={!selectedFolderId && !selectedTag}
                          onClick={() => {
                            setSelectedFolderId(null);
                            setSelectedTag(null);
                          }}
                          onDrop={() => {
                            if (draggedMemoryId) {
                              void handleMoveToFolder(draggedMemoryId, null);
                            }
                          }}
                          icon={<FolderIcon size={16} />}
                        >
                          All memories
                        </SidebarFilterButton>

                        <div
                          className="max-h-56 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-(--line) hover:[&::-webkit-scrollbar-thumb]:bg-(--muted)"
                          style={{ scrollbarColor: "var(--line) transparent" }}
                        >
                          {folders.map((folder) => (
                            <div
                              key={folder.id}
                              className="flex items-center gap-2"
                            >
                              <div className="min-w-0 flex-1">
                                <SidebarFilterButton
                                  active={selectedFolderId === folder.id}
                                  onClick={() => {
                                    setSelectedFolderId(folder.id);
                                    setSelectedTag(null);
                                  }}
                                  onDrop={() => {
                                    if (draggedMemoryId) {
                                      void handleMoveToFolder(
                                        draggedMemoryId,
                                        folder.id,
                                      );
                                    }
                                  }}
                                  icon={<FolderIcon size={16} />}
                                >
                                  {folder.name}
                                </SidebarFilterButton>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  handleDeleteFolder(folder.id, folder.name)
                                }
                                disabled={deletingFolderId === folder.id}
                                aria-label={`Delete folder ${folder.name}`}
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-transparent text-(--muted) transition hover:border-(--line) hover:bg-(--surface) hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {deletingFolderId === folder.id ? (
                                  <Loader2
                                    size={14}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <Trash2 size={14} />
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="group/browse relative mt-3 pb-2">
                        <div className="flex cursor-default items-center justify-between gap-3 rounded-xl border border-(--line) bg-(--surface) px-3 py-2.5 text-sm text-(--muted) transition group-hover/browse:border-(--accent-edge) group-hover/browse:text-foreground">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--surface-soft) text-(--muted-strong)">
                              <FolderIcon size={16} />
                            </span>
                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-(--muted)">
                                Browse
                              </div>
                              <div className="truncate text-sm text-foreground/85">
                                {selectedBrowseLabel}
                              </div>
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full border border-(--line) bg-(--surface-soft) px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-(--muted)">
                            {folders.length + 1}
                          </span>
                        </div>

                        <div className="pointer-events-none absolute left-0 right-0 top-[calc(100%-0.35rem)] z-30 origin-top scale-[0.98] rounded-[1.1rem] border border-(--line) bg-(--surface) p-3 opacity-0 shadow-xl transition duration-150 group-hover/browse:pointer-events-auto group-hover/browse:scale-100 group-hover/browse:opacity-100 group-focus-within/browse:pointer-events-auto group-focus-within/browse:scale-100 group-focus-within/browse:opacity-100">
                          {isCreatingFolder ? (
                            <form onSubmit={handleCreateFolder} className="mb-3 px-1">
                              <input
                                autoFocus
                                type="text"
                                placeholder="New folder name"
                                value={newFolderName}
                                onChange={(event) =>
                                  setNewFolderName(event.target.value)
                                }
                                className="w-full rounded-xl border border-(--line) bg-(--surface) px-4 py-3 text-sm outline-none focus:border-(--accent)"
                                onBlur={() => {
                                  if (!newFolderName.trim())
                                    setIsCreatingFolder(false);
                                }}
                              />
                            </form>
                          ) : null}

                          <SidebarFilterButton
                            active={!selectedFolderId && !selectedTag}
                            onClick={() => {
                              setSelectedFolderId(null);
                              setSelectedTag(null);
                            }}
                            onDrop={() => {
                              if (draggedMemoryId) {
                                void handleMoveToFolder(draggedMemoryId, null);
                              }
                            }}
                            icon={<FolderIcon size={16} />}
                          >
                            All memories
                          </SidebarFilterButton>

                          <div
                            className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-(--line) hover:[&::-webkit-scrollbar-thumb]:bg-(--muted)"
                            style={{
                              scrollbarColor: "var(--line) transparent",
                            }}
                          >
                            {folders.map((folder) => (
                              <div
                                key={folder.id}
                                className="flex items-center gap-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <SidebarFilterButton
                                    active={selectedFolderId === folder.id}
                                    onClick={() => {
                                      setSelectedFolderId(folder.id);
                                      setSelectedTag(null);
                                    }}
                                    onDrop={() => {
                                      if (draggedMemoryId) {
                                        void handleMoveToFolder(
                                          draggedMemoryId,
                                          folder.id,
                                        );
                                      }
                                    }}
                                    icon={<FolderIcon size={16} />}
                                  >
                                    {folder.name}
                                  </SidebarFilterButton>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteFolder(folder.id, folder.name)
                                  }
                                  disabled={deletingFolderId === folder.id}
                                  aria-label={`Delete folder ${folder.name}`}
                                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-transparent text-(--muted) transition hover:border-(--line) hover:bg-(--surface-soft) hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {deletingFolderId === folder.id ? (
                                    <Loader2
                                      size={14}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <Trash2 size={14} />
                                  )}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </section>

                  <section>
                    <button
                      type="button"
                      onClick={() =>
                        setIsSignalsExpanded((current) => !current)
                      }
                      className="flex w-full items-center justify-between gap-3 px-1 text-left"
                    >
                      <SectionLabel icon={<Tag size={13} />}>
                        Signals
                      </SectionLabel>
                      <ChevronDown
                        size={15}
                        className={`text-(--muted) transition ${
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
                                  setSelectedTag(
                                    selectedTag === tag ? null : tag,
                                  );
                                  setSelectedFolderId(null);
                                }}
                                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                                  selectedTag === tag
                                    ? "border-(--accent-edge) bg-(--accent-soft) text-(--accent)"
                                    : "border-(--line) bg-(--surface) text-(--muted) hover:border-(--accent-edge) hover:text-foreground"
                                }`}
                              >
                                {tag}
                              </button>
                            ))
                          ) : (
                            <span className="px-1 text-sm text-(--muted)">
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
                        {highlightedIds.length > 0
                          ? "Matches"
                          : "Work Streams"}
                      </SectionLabel>
                      <span className="text-xs text-(--muted)">
                        {highlightedIds.length > 0
                          ? `${highlightedIds.length} found`
                          : `${filteredMemories.length} total`}
                      </span>
                    </div>
                    <div
                      className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-(--line) hover:[&::-webkit-scrollbar-thumb]:bg-(--muted)"
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
                            signal={
                              memory.thread_id
                                ? {
                                    threadId: memory.thread_id,
                                    threadLabel:
                                      memory.thread_label ?? "Recent capture",
                                    resumeReason:
                                      memory.resume_reason ??
                                      getMemorySummary(memory),
                                    relatedMemoryIds:
                                      memory.related_memory_ids ?? [],
                                    hasOpenLoop: Boolean(memory.has_open_loop),
                                    decisionCount:
                                      memory.decision_count ?? 0,
                                    actionItemCount:
                                      memory.action_item_count ?? 0,
                                    voiceNoteCount:
                                      memory.voice_note_count ??
                                      memory.voiceNotes.length,
                                  }
                                : undefined
                            }
                            selected={selected}
                            highlighted={highlighted}
                            deleting={deletingMemoryId === memory.id}
                            isDragging={draggedMemoryId === memory.id}
                            onSelect={() => setSelectedMemoryId(memory.id)}
                            onDelete={() =>
                              void handleDeleteMemory(
                                memory.id,
                                memory.title?.trim() || "memory",
                              )
                            }
                            onDragStart={() => setDraggedMemoryId(memory.id)}
                            onDragEnd={() => setDraggedMemoryId(null)}
                          />
                        );
                      })}
                      {filteredMemories.length === 0 ? (
                        <div className="rounded-[1.4rem] border border-dashed border-(--line) bg-(--surface) px-4 py-8 text-sm text-(--muted)">
                          No memories match the current filters yet.
                        </div>
                      ) : null}
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
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-(--line) bg-(--surface) text-(--muted) transition hover:text-foreground"
                  aria-label="Show all memories"
                >
                  <FolderIcon size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMemoryId(null)}
                  className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl transition hover:opacity-80"
                  aria-label="Open briefing"
                >
                  <Logo className="h-full w-full" />
                </button>
              </div>
            )}
          </div>
        </aside>

        <main
          className="min-w-0 flex-1 lg:h-screen lg:overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-(--muted) hover:[&::-webkit-scrollbar-thumb]:bg-(--muted-strong)"
          style={{ scrollbarColor: "var(--muted) transparent" }}
        >
          <div className="absolute right-6 top-6 z-50">
            <ThemeToggle />
          </div>
          {selectedMemory ? (
            <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
              <section className="rounded-2xl border border-(--line) bg-(--surface) p-6 shadow-sm">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <SectionLabel icon={<Brain size={14} />}>
                      Page Memory
                      {selectedMemory.is_placeholder ? " Placeholder" : ""}
                    </SectionLabel>
                    <h2 className="mt-4 max-w-3xl font-serif text-3xl leading-tight text-foreground sm:text-[2.45rem]">
                      {selectedMemory.title?.trim() || "Untitled"}
                    </h2>
                    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-(--muted)">
                      <span>{formatTimestamp(selectedMemory.created_at)}</span>
                      <span className="hidden h-1 w-1 rounded-full bg-(--line) sm:inline-block" />
                      <a
                        href={selectedMemory.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-w-0 items-center gap-2 text-(--accent) transition hover:text-(--accent-strong)"
                      >
                        <ExternalLink size={15} />
                        <span className="truncate">{selectedMemory.url}</span>
                      </a>
                    </div>
                    {(selectedMemory.tags?.length ?? 0) > 0 || selectedSignal ? (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {selectedSignal ? (
                          <span className="rounded-full bg-(--accent-soft) px-3 py-1.5 text-xs font-medium text-(--accent)">
                            {selectedSignal.threadLabel}
                          </span>
                        ) : null}
                        {selectedMemory.tags?.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-(--line) bg-(--surface-soft) px-3 py-1.5 text-xs text-(--muted-strong)"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
                    <FolderPicker
                      folders={folders}
                      value={selectedMemory.folder_id || null}
                      onChange={(folderId) =>
                        handleMoveToFolder(selectedMemory.id, folderId)
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        void handleDeleteMemory(
                          selectedMemory.id,
                          selectedMemory.title?.trim() || "memory",
                        )
                      }
                      disabled={deletingMemoryId === selectedMemory.id}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-(--line) bg-(--surface) px-4 py-2.5 text-sm text-(--muted) transition hover:border-[#cbd5e1] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
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

              <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(18rem,0.88fr)]">
                <section className="rounded-2xl border border-(--line) bg-(--surface) p-6 shadow-sm">
                  <SectionLabel icon={<Sparkles size={14} />}>
                    Page Summary
                  </SectionLabel>
                  {selectedSignal ? (
                    <p className="mt-3 text-sm leading-6 text-(--muted)">
                      {selectedSignal.resumeReason}
                    </p>
                  ) : null}
                  <article className="mt-5 max-w-3xl whitespace-pre-wrap text-[1.02rem] leading-8 text-(--foreground-soft)">
                    {selectedMemory.summary?.trim() ||
                      selectedMemory.content?.trim() ||
                      selectedMemory.url}
                  </article>

                  {relatedMemories.length > 0 ? (
                    <div className="mt-8 border-t border-(--line) pt-5">
                      <SectionLabel icon={<ExternalLink size={14} />}>
                        Related Memories
                      </SectionLabel>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {relatedMemories.map((memory) => (
                          <button
                            key={memory.id}
                            type="button"
                            onClick={() => setSelectedMemoryId(memory.id)}
                            className="inline-flex max-w-full items-center gap-2 rounded-full border border-(--line) bg-(--surface-soft) px-3 py-2 text-left text-xs text-(--muted-strong) transition hover:border-(--accent-edge) hover:text-foreground"
                          >
                            <span className="truncate">{getMemoryTitle(memory)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedMemory.content?.trim() ? (
                    <div className="mt-8 border-t border-(--line) pt-5">
                      <button
                        type="button"
                        onClick={() => toggleRawPageText(selectedMemory.id)}
                        className="inline-flex items-center gap-2 text-sm text-(--muted) transition hover:text-foreground"
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
                        <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-(--muted)">
                          {normalizeExtractedText(selectedMemory.content)}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                <aside className="self-start rounded-2xl border border-(--line) bg-(--surface) p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <SectionLabel icon={<Play size={14} />}>
                      Voice Notes
                    </SectionLabel>
                    <span className="text-sm text-(--muted)">
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
                            className={`rounded-xl border bg-(--surface) p-4 transition ${
                              matched
                                ? "border-(--accent-edge) bg-(--accent-soft)"
                                : "border-(--line)"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => toggleVoiceNote(note.id)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <div className="text-sm font-medium text-foreground">
                                  Voice note
                                </div>
                                <div className="mt-1 text-xs text-(--muted)">
                                  {formatTimestamp(note.created_at)}
                                </div>
                              </button>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handlePlayVoiceNote(note)}
                                  disabled={playingVoiceNoteId === note.id}
                                  className="inline-flex items-center gap-2 rounded-full border border-(--accent-edge) bg-(--accent-soft) px-3 py-2 text-xs font-medium text-(--accent) transition hover:bg-(--accent) hover:text-white disabled:cursor-not-allowed disabled:opacity-55"
                                >
                                  {playingVoiceNoteId === note.id ? (
                                    <Loader2
                                      size={13}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <Play size={13} fill="currentColor" />
                                  )}
                                  {playingVoiceNoteId === note.id
                                    ? "Playing"
                                    : "Play"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleVoiceNote(note.id)}
                                  aria-label={
                                    expanded
                                      ? "Collapse transcript"
                                      : "Expand transcript"
                                  }
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-(--line) bg-(--surface) text-(--muted) transition hover:text-foreground"
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
                              <div className="mt-4 border-t border-(--line) pt-4">
                                {note.summary?.trim() ? (
                                  <div className="rounded-xl border border-(--line) bg-(--surface-soft) px-4 py-3">
                                    <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                                      Summary
                                    </div>
                                    <p className="mt-2 text-sm leading-7 text-(--foreground-soft)">
                                      {note.summary}
                                    </p>
                                  </div>
                                ) : null}

                                {note.analysis?.action_items.length ? (
                                  <div className="mt-4 rounded-xl border border-(--line) bg-(--surface-soft) px-4 py-3">
                                    <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                                      Action Items
                                    </div>
                                    <ul className="mt-2 space-y-2 text-sm leading-6 text-(--foreground-soft)">
                                      {note.analysis.action_items.map(
                                        (item) => (
                                          <li key={item} className="flex gap-2">
                                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-(--accent)" />
                                            <span>{item}</span>
                                          </li>
                                        ),
                                      )}
                                    </ul>
                                  </div>
                                ) : null}

                                {note.analysis?.decisions.length ? (
                                  <div className="mt-4 rounded-xl border border-(--line) bg-(--surface-soft) px-4 py-3">
                                    <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                                      Decisions
                                    </div>
                                    <ul className="mt-2 space-y-2 text-sm leading-6 text-(--foreground-soft)">
                                      {note.analysis.decisions.map((item) => (
                                        <li key={item} className="flex gap-2">
                                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-(--accent)" />
                                          <span>{item}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}

                                {note.analysis?.page_context ? (
                                  <div className="mt-4 rounded-xl border border-(--line) bg-(--surface-soft) px-4 py-3">
                                    <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                                      Page Context
                                    </div>
                                    <p className="mt-2 text-sm leading-7 text-(--foreground-soft)">
                                      {note.analysis.page_context}
                                    </p>
                                  </div>
                                ) : null}

                                <div className="mt-4">
                                  <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                                    Transcript
                                  </div>
                                  <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-(--foreground-soft)">
                                    {note.content?.trim() ||
                                      "No transcript available."}
                                  </div>
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
                                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-(--line) bg-(--surface) px-3 py-2 text-xs text-(--muted) transition hover:border-[#cbd5e1] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
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
                          </article>
                        );
                      })
                    ) : (
                      <div className="rounded-xl border border-dashed border-(--line) bg-(--surface-soft) px-5 py-8 text-sm text-(--muted)">
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
              threads={threads}
              chatMessages={chatMessages}
              isSendingChat={isSendingChat}
              onSendChat={handleChatSubmit}
              onSelectMemory={setSelectedMemoryId}
            />
          )}
        </main>
      </div>
      <ConfirmDeleteDialog
        open={Boolean(confirmDeleteState)}
        title={
          confirmDeleteState?.kind === "folder"
            ? `Delete "${confirmDeleteState.label}"?`
            : `Delete "${confirmDeleteState?.label}"?`
        }
        description={
          confirmDeleteState?.kind === "folder"
            ? "This removes the folder but keeps its memories. Items inside it will move back to All memories."
            : "This memory will be removed from your workspace."
        }
        confirmLabel={
          confirmDeleteState?.kind === "folder"
            ? "Delete folder"
            : "Delete memory"
        }
        isWorking={Boolean(deletingMemoryId || deletingFolderId)}
        onCancel={closeDeleteDialog}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </div>
  );
}
