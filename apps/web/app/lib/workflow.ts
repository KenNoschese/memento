import type { Folder, PageMemoryRecord, ThreadSummary } from "@/app/lib/types";

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

const GENERIC_FOLDER_NAMES = new Set([
  "captured page",
  "general",
  "notes",
  "recent capture",
  "research",
  "untitled",
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

type ThreadKeyInfo = {
  key: string;
  kind: "topic" | "tag" | "title" | "domain";
};

type ThreadBucket = {
  id: string;
  kind: ThreadKeyInfo["kind"];
  memories: PageMemoryRecord[];
};

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

function getSpecificTags(memory: PageMemoryRecord) {
  return Array.from(
    new Set(
      (memory.tags ?? [])
        .map((tag) => tag.trim())
        .filter((tag) => tag && !GENERIC_THREAD_TAGS.has(tag.toLowerCase()))
        .map((tag) => tag.toLowerCase()),
    ),
  );
}

function getSpecificTag(memory: PageMemoryRecord) {
  return getSpecificTags(memory)[0] ?? null;
}

function getTitleKeywords(memory: PageMemoryRecord) {
  return getMemoryTitle(memory)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((part) => part.length > 2 && !TITLE_STOP_WORDS.has(part))
    .slice(0, 4);
}

function getThreadKeyInfo(memory: PageMemoryRecord): ThreadKeyInfo {
  const titleKeywords = getTitleKeywords(memory);
  if (titleKeywords.length >= 2) {
    return {
      key: `topic:${titleKeywords.slice(0, 3).join("-")}`,
      kind: "topic",
    };
  }

  const specificTag = getSpecificTag(memory);
  if (specificTag) {
    return {
      key: `tag:${specificTag.toLowerCase()}`,
      kind: "tag",
    };
  }

  const title = getMemoryTitle(memory).toLowerCase();
  if (title && title !== "untitled") {
    return {
      key: `title:${title.split(/\s+/).slice(0, 2).join(" ")}`,
      kind: "title",
    };
  }

  return {
    key: `domain:${getHostnameLabel(memory.url).toLowerCase()}`,
    kind: "domain",
  };
}

function normalizeFolderName(rawName: string) {
  return rawName
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72);
}

function getThreadTitle(
  latestMemory: PageMemoryRecord,
  specificTag: string | null,
  titleKeywords: string[],
) {
  return normalizeFolderName(
    specificTag ||
      (titleKeywords.length > 0
        ? titleKeywords
            .slice(0, 3)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ")
        : getMemoryTitle(latestMemory)) ||
      getHostnameLabel(latestMemory.url),
  );
}

function getThreadTimeSpanHours(bucket: PageMemoryRecord[]) {
  const timestamps = bucket
    .map((memory) => new Date(memory.created_at).getTime())
    .filter((value) => Number.isFinite(value));

  if (timestamps.length < 2) {
    return 0;
  }

  return (Math.max(...timestamps) - Math.min(...timestamps)) / (1000 * 60 * 60);
}

function getBucketDomain(bucket: PageMemoryRecord[]) {
  return getHostnameLabel(bucket[0]?.url ?? "").toLowerCase();
}

function getBucketSpecificTags(bucket: PageMemoryRecord[]) {
  return new Set(bucket.flatMap((memory) => getSpecificTags(memory)));
}

function sharedSpecificTagCount(left: Set<string>, right: Set<string>) {
  let count = 0;
  for (const tag of left) {
    if (right.has(tag)) {
      count += 1;
    }
  }
  return count;
}

function buildMergedThreadId(bucket: PageMemoryRecord[], fallbackId: string) {
  const domain = getBucketDomain(bucket);
  const tags = Array.from(getBucketSpecificTags(bucket)).sort().slice(0, 2);

  if (tags.length > 0) {
    return `domain-tag:${domain}:${tags.join("-")}`;
  }

  return fallbackId;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getAutoFolderConfidence({
  bucket,
  kind,
  titleKeywords,
  specificTag,
  voiceNoteCount,
  decisionCount,
  actionItemCount,
  suggestedFolderName,
}: {
  bucket: PageMemoryRecord[];
  kind: ThreadKeyInfo["kind"];
  titleKeywords: string[];
  specificTag: string | null;
  voiceNoteCount: number;
  decisionCount: number;
  actionItemCount: number;
  suggestedFolderName: string;
}) {
  let score = 0;

  if (bucket.length >= 2) {
    score += 0.32;
  }

  if (bucket.length >= 3) {
    score += 0.08;
  }

  if (bucket.length >= 4) {
    score += 0.04;
  }

  if (kind === "topic") {
    score += 0.28;
  } else if (kind === "tag") {
    score += 0.24;
  } else if (kind === "title") {
    score += 0.18;
  } else {
    score += 0.1;
  }

  if (titleKeywords.length >= 2) {
    score += 0.14;
  }

  if (specificTag) {
    score += 0.08;
  }

  if (voiceNoteCount > 0) {
    score += 0.1;
  }

  if (decisionCount > 0 || actionItemCount > 0) {
    score += 0.12;
  }

  const spanHours = getThreadTimeSpanHours(bucket);
  if (bucket.length >= 2 && spanHours <= 12) {
    score += 0.1;
  } else if (bucket.length >= 2 && spanHours <= 48) {
    score += 0.08;
  } else if (bucket.length >= 2 && spanHours <= 120) {
    score += 0.04;
  }

  if (GENERIC_FOLDER_NAMES.has(suggestedFolderName.toLowerCase())) {
    score -= 0.28;
  }

  if (suggestedFolderName.length < 6) {
    score -= 0.12;
  }

  return clamp(Number(score.toFixed(2)), 0, 0.99);
}

export function getAutoFolderKey(threadId: string) {
  return threadId.trim().toLowerCase();
}

export function buildThreadMetadata(
  memories: PageMemoryRecord[],
  foldersById = new Map<string, Folder>(),
) {
  const sortedMemories = [...memories].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const threadBuckets = new Map<string, PageMemoryRecord[]>();
  const threadKeyInfoById = new Map<string, ThreadKeyInfo>();

  for (const memory of sortedMemories) {
    const threadInfo = getThreadKeyInfo(memory);
    const bucket = threadBuckets.get(threadInfo.key) ?? [];
    bucket.push(memory);
    threadBuckets.set(threadInfo.key, bucket);
    threadKeyInfoById.set(threadInfo.key, threadInfo);
  }

  const mergedBuckets: ThreadBucket[] = [];

  for (const [threadId, bucket] of threadBuckets.entries()) {
    const keyInfo = threadKeyInfoById.get(threadId) ?? {
      key: threadId,
      kind: "domain" as const,
    };
    const bucketDomain = getBucketDomain(bucket);
    const bucketTags = getBucketSpecificTags(bucket);

    const mergeTarget = mergedBuckets.find((candidate) => {
      if (getBucketDomain(candidate.memories) !== bucketDomain) {
        return false;
      }

      const candidateTags = getBucketSpecificTags(candidate.memories);
      return sharedSpecificTagCount(candidateTags, bucketTags) > 0;
    });

    if (mergeTarget) {
      mergeTarget.memories.push(...bucket);
      mergeTarget.memories.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      mergeTarget.kind =
        mergeTarget.kind === "tag" || keyInfo.kind === "tag"
          ? "tag"
          : mergeTarget.kind === "topic" || keyInfo.kind === "topic"
            ? "topic"
            : mergeTarget.kind === "title" || keyInfo.kind === "title"
              ? "title"
              : "domain";
      mergeTarget.id = buildMergedThreadId(mergeTarget.memories, mergeTarget.id);
      continue;
    }

    mergedBuckets.push({
      id: buildMergedThreadId(bucket, threadId),
      kind: keyInfo.kind,
      memories: [...bucket],
    });
  }

  const threads: ThreadSummary[] = [];
  const threadMap = new Map<string, ThreadSummary>();

  for (const mergedBucket of mergedBuckets) {
    const threadId = mergedBucket.id;
    const bucket = mergedBucket.memories;
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
    const folder = latestMemory.folder_id
      ? foldersById.get(latestMemory.folder_id) ?? null
      : null;
    const folderName = folder?.name ?? null;
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
    const title = getThreadTitle(latestMemory, specificTag, titleKeywords);
    const keyInfo = { key: threadId, kind: mergedBucket.kind };
    const suggestedFolderName = title;
    const autoFolderConfidence = getAutoFolderConfidence({
      bucket,
      kind: keyInfo.kind,
      titleKeywords,
      specificTag,
      voiceNoteCount,
      decisionCount,
      actionItemCount,
      suggestedFolderName,
    });
    const eligibleForAutoFolder =
      bucket.length >= 2 &&
      !GENERIC_FOLDER_NAMES.has(suggestedFolderName.toLowerCase()) &&
      autoFolderConfidence >= 0.48;

    const thread: ThreadSummary = {
      id: threadId,
      label,
      title,
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
      folderSource: folder?.source ?? null,
      representativeSummary: getMemorySummary(latestMemory),
      suggestedFolderName,
      autoFolderConfidence,
      eligibleForAutoFolder,
    };

    threads.push(thread);
    threadMap.set(threadId, thread);
  }

  const memoriesWithThreads = sortedMemories.map((memory) => {
    const thread =
      threads.find((candidate) => candidate.memoryIds.includes(memory.id)) ?? null;
    const threadId = thread?.id ?? getThreadKeyInfo(memory).key;
    const bucket = mergedBuckets.find((candidate) => candidate.id === threadId)?.memories ?? [
      memory,
    ];

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
