import type { PageMemoryRecord, ThreadSummary } from "@/app/lib/types";

const GENERIC_THREAD_TAGS = new Set([
  "ai",
  "technology",
  "tech",
  "programming",
  "software",
  "coding",
  "development",
  "engineering",
  "web",
  "research",
]);

const TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "how",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

function getMemoryTitle(memory: PageMemoryRecord) {
  return memory.title?.trim() || "Untitled";
}

function getMemorySummary(memory: PageMemoryRecord) {
  return memory.summary?.trim() || memory.content?.trim() || memory.url;
}

function getHostnameLabel(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname || "Captured page";
  } catch {
    return "Captured page";
  }
}

function getSpecificTag(memory: PageMemoryRecord) {
  return (
    memory.tags
      ?.map((tag) => tag.trim())
      .find((tag) => tag && !GENERIC_THREAD_TAGS.has(tag.toLowerCase())) ?? null
  );
}

function getTitleKeywords(memory: PageMemoryRecord) {
  return getMemoryTitle(memory)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((part) => part.length > 2 && !TITLE_STOP_WORDS.has(part))
    .slice(0, 4);
}

function getThreadKey(memory: PageMemoryRecord) {
  const titleKeywords = getTitleKeywords(memory);
  if (titleKeywords.length >= 2) {
    return `topic:${titleKeywords.slice(0, 3).join("-")}`;
  }

  const specificTag = getSpecificTag(memory);
  if (specificTag) {
    return `tag:${specificTag.toLowerCase()}`;
  }

  const title = getMemoryTitle(memory).toLowerCase();
  if (title && title !== "untitled") {
    return `title:${title.split(/\s+/).slice(0, 2).join(" ")}`;
  }

  return `domain:${getHostnameLabel(memory.url).toLowerCase()}`;
}

export function buildThreadMetadata(
  memories: PageMemoryRecord[],
  folderNamesById = new Map<string, string>(),
) {
  const sortedMemories = [...memories].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const threadBuckets = new Map<string, PageMemoryRecord[]>();

  for (const memory of sortedMemories) {
    const threadId = getThreadKey(memory);
    const bucket = threadBuckets.get(threadId) ?? [];
    bucket.push(memory);
    threadBuckets.set(threadId, bucket);
  }

  const threads: ThreadSummary[] = [];
  const threadMap = new Map<string, ThreadSummary>();

  for (const [threadId, bucket] of threadBuckets.entries()) {
    const latestMemory = bucket[0];
    const voiceNoteCount = bucket.reduce(
      (count, memory) => count + memory.voiceNotes.length,
      0,
    );
    const decisionCount = bucket.reduce(
      (count, memory) =>
        count +
        memory.voiceNotes.reduce(
          (total, note) => total + (note.analysis?.decisions.length ?? 0),
          0,
        ),
      0,
    );
    const actionItemCount = bucket.reduce(
      (count, memory) =>
        count +
        memory.voiceNotes.reduce(
          (total, note) => total + (note.analysis?.action_items.length ?? 0),
          0,
        ),
      0,
    );
    const specificTag = getSpecificTag(latestMemory);
    const titleKeywords = getTitleKeywords(latestMemory);
    const label = decisionCount
      ? "Decision thread"
      : actionItemCount
        ? "Open loop"
        : voiceNoteCount
          ? "Page with notes"
          : latestMemory.folder_id
            ? "Organized research"
            : "Recent capture";
    const folderName = latestMemory.folder_id
      ? folderNamesById.get(latestMemory.folder_id) ?? null
      : null;
    const resumeReason = decisionCount
      ? `${decisionCount} decision${
          decisionCount === 1 ? "" : "s"
        } captured here. Reopen this thread before it drifts.`
      : actionItemCount
        ? `${actionItemCount} action item${
            actionItemCount === 1 ? "" : "s"
          } are attached to this page and its notes.`
        : voiceNoteCount
          ? `${voiceNoteCount} voice note${
              voiceNoteCount === 1 ? "" : "s"
            } add context beyond the raw page capture.`
          : folderName
            ? `Latest page in ${folderName}. Good candidate to continue from here.`
            : `Recent capture from ${getHostnameLabel(latestMemory.url)}.`;

    const thread: ThreadSummary = {
      id: threadId,
      label,
      title:
        specificTag ||
        (titleKeywords.length > 0
          ? titleKeywords
              .slice(0, 3)
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ")
          : getMemoryTitle(latestMemory)) ||
        getHostnameLabel(latestMemory.url),
      resumeReason,
      latestMemoryId: latestMemory.id,
      latestAt: latestMemory.created_at,
      memoryIds: bucket.map((memory) => memory.id),
      memoryCount: bucket.length,
      voiceNoteCount,
      decisionCount,
      actionItemCount,
      tags: Array.from(new Set(bucket.flatMap((memory) => memory.tags ?? []))).slice(
        0,
        3,
      ),
      folderName,
      representativeSummary: getMemorySummary(latestMemory),
    };

    threads.push(thread);
    threadMap.set(threadId, thread);
  }

  const memoriesWithThreads = sortedMemories.map((memory) => {
    const threadId = getThreadKey(memory);
    const bucket = threadBuckets.get(threadId) ?? [memory];
    const thread = threadMap.get(threadId);

    return {
      ...memory,
      thread_id: threadId,
      thread_title: thread?.title ?? getMemoryTitle(memory),
      thread_label: thread?.label ?? "Recent capture",
      resume_reason:
        thread?.resumeReason ?? `Recent capture from ${getHostnameLabel(memory.url)}.`,
      related_memory_ids: bucket
        .filter((candidate) => candidate.id !== memory.id)
        .map((candidate) => candidate.id)
        .slice(0, 3),
      has_open_loop:
        (thread?.actionItemCount ?? 0) > 0 ||
        (thread?.decisionCount ?? 0) > 0 ||
        memory.voiceNotes.length > 0,
      decision_count: memory.voiceNotes.reduce(
        (count, note) => count + (note.analysis?.decisions.length ?? 0),
        0,
      ),
      action_item_count: memory.voiceNotes.reduce(
        (count, note) => count + (note.analysis?.action_items.length ?? 0),
        0,
      ),
      voice_note_count: memory.voiceNotes.length,
    };
  });

  return {
    memories: memoriesWithThreads,
    threads: threads.sort(
      (a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime(),
    ),
  };
}
