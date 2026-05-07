import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getErrorMessage } from "@/app/lib/errors";
import type {
  Folder,
  PageMemoryRecord,
  ThreadSummary,
  VoiceNoteRecord,
} from "@/app/lib/types";
import { normalizeVoiceNoteAnalysis } from "@/app/lib/voice-note-analysis";
import { buildThreadMetadata, getAutoFolderKey } from "@/app/lib/workflow";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Private-Network": "true",
};

function normalizeEmbedding(
  embedding: PageMemoryRecord["embedding"],
): number[] | null {
  if (!embedding) {
    return null;
  }

  if (Array.isArray(embedding)) {
    return embedding.filter((value): value is number => typeof value === "number");
  }

  if (typeof embedding !== "string") {
    return null;
  }

  const trimmed = embedding.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed.filter((value): value is number => typeof value === "number");
  } catch {
    return null;
  }
}

function normalizeFolderLookupName(name: string | null | undefined): string {
  return (name ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function applyAutoFolders({
  userId,
  memories,
  foldersById,
}: {
  userId: string;
  memories: PageMemoryRecord[];
  foldersById: Map<string, Folder>;
}) {
  const foldersByAutoKey = new Map<string, Folder>();
  const foldersByNormalizedAutoName = new Map<string, Folder>();

  const sortedFolders = Array.from(foldersById.values()).sort((left, right) => {
    const createdAtDelta =
      new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    return createdAtDelta !== 0 ? createdAtDelta : left.id.localeCompare(right.id);
  });

  for (const folder of sortedFolders) {
    if (folder.source !== "auto") {
      continue;
    }

    const normalizedName = normalizeFolderLookupName(folder.name);
    if (!normalizedName) {
      continue;
    }

    const canonicalFolder = foldersByNormalizedAutoName.get(normalizedName);
    if (!canonicalFolder) {
      foldersByNormalizedAutoName.set(normalizedName, folder);
      continue;
    }

    if (canonicalFolder.id === folder.id) {
      continue;
    }

    const { error: mergeMemoriesError } = await supabase
      .from("memories")
      .update({ folder_id: canonicalFolder.id })
      .eq("user_id", userId)
      .eq("folder_id", folder.id);

    if (mergeMemoriesError) {
      throw mergeMemoriesError;
    }

    const { error: deleteFolderError } = await supabase
      .from("folders")
      .delete()
      .eq("id", folder.id)
      .eq("user_id", userId);

    if (deleteFolderError) {
      throw deleteFolderError;
    }

    foldersById.delete(folder.id);
    for (const memory of memories) {
      if (memory.folder_id === folder.id) {
        memory.folder_id = canonicalFolder.id;
      }
    }
  }

  for (const folder of foldersById.values()) {
    if (folder.source === "auto" && folder.auto_key) {
      foldersByAutoKey.set(folder.auto_key, folder);
    }
    if (folder.source === "auto") {
      const normalizedName = normalizeFolderLookupName(folder.name);
      if (normalizedName && !foldersByNormalizedAutoName.has(normalizedName)) {
        foldersByNormalizedAutoName.set(normalizedName, folder);
      }
    }
  }

  const threaded = buildThreadMetadata(memories, foldersById);

  for (const thread of threaded.threads) {
    const bucket = memories.filter((memory) => thread.memoryIds.includes(memory.id));
    const unassignedIds = bucket
      .filter((memory) => !memory.folder_id)
      .map((memory) => memory.id);

    if (unassignedIds.length === 0) {
      continue;
    }

    const assignedFolderIds = Array.from(
      new Set(
        bucket
          .map((memory) => memory.folder_id)
          .filter((folderId): folderId is string => Boolean(folderId)),
      ),
    );

    let targetFolder: Folder | null = null;

    if (assignedFolderIds.length === 1) {
      targetFolder = foldersById.get(assignedFolderIds[0]) ?? null;
    } else if (
      assignedFolderIds.length === 0 &&
      thread.eligibleForAutoFolder &&
      thread.suggestedFolderName
    ) {
      const autoKey = getAutoFolderKey(thread.id);
      const normalizedSuggestedName = normalizeFolderLookupName(
        thread.suggestedFolderName,
      );
      targetFolder = foldersByAutoKey.get(autoKey) ?? null;
      if (!targetFolder && normalizedSuggestedName) {
        targetFolder =
          foldersByNormalizedAutoName.get(normalizedSuggestedName) ?? null;
      }

      if (!targetFolder) {
        const { data, error } = await supabase
          .from("folders")
          .insert([
            {
              name: thread.suggestedFolderName,
              user_id: userId,
              source: "auto",
              auto_key: autoKey,
            },
          ])
          .select("id, name, created_at, source, auto_key")
          .single();

        if (error) {
          throw error;
        }

        targetFolder = data as Folder;
        foldersByAutoKey.set(autoKey, targetFolder);
        if (normalizedSuggestedName) {
          foldersByNormalizedAutoName.set(normalizedSuggestedName, targetFolder);
        }
        foldersById.set(targetFolder.id, targetFolder);
      } else if (
        targetFolder.auto_key !== autoKey &&
        targetFolder.source === "auto"
      ) {
        const { error: syncFolderError } = await supabase
          .from("folders")
          .update({ auto_key: autoKey })
          .eq("id", targetFolder.id)
          .eq("user_id", userId);

        if (syncFolderError) {
          throw syncFolderError;
        }

        targetFolder = {
          ...targetFolder,
          auto_key: autoKey,
        };
        foldersById.set(targetFolder.id, targetFolder);
        foldersByAutoKey.set(autoKey, targetFolder);
      }
    }

    if (!targetFolder) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("memories")
      .update({ folder_id: targetFolder.id })
      .in("id", unassignedIds)
      .eq("user_id", userId)
      .is("folder_id", null);

    if (updateError) {
      throw updateError;
    }

    for (const memory of memories) {
      if (unassignedIds.includes(memory.id)) {
        memory.folder_id = targetFolder.id;
      }
    }
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("memento_user_id")?.trim();

    let pageQuery = supabase
      .from("memories")
      .select("id, url, canonical_url, title, content, summary, tags, folder_id, created_at, embedding, type, audio, parent_memory_id, is_placeholder, analysis")
      .eq("type", "page")
      .order("created_at", { ascending: false })
      .limit(100);

    if (userId) {
      pageQuery = pageQuery.eq("user_id", userId);
    }

    const { data: pageData, error: pageError } = await pageQuery;

    if (pageError) {
      throw pageError;
    }

    const pageIds = (pageData ?? []).map((memory) => memory.id);

    const voiceResult = pageIds.length
      ? userId
        ? await supabase
            .from("memories")
            .select("id, url, canonical_url, title, content, summary, tags, folder_id, created_at, embedding, type, audio, parent_memory_id, is_placeholder, analysis")
            .eq("type", "voice_note")
            .in("parent_memory_id", pageIds)
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
        : await supabase
            .from("memories")
            .select("id, url, canonical_url, title, content, summary, tags, folder_id, created_at, embedding, type, audio, parent_memory_id, is_placeholder, analysis")
            .eq("type", "voice_note")
            .in("parent_memory_id", pageIds)
            .order("created_at", { ascending: false })
      : { data: [], error: null };

    const voiceData = voiceResult.data ?? [];
    const voiceError = voiceResult.error;

    if (voiceError) {
      throw voiceError;
    }

    const voiceNotesByPageId = new Map<string, VoiceNoteRecord[]>();
    for (const memory of voiceData ?? []) {
      if (!memory.parent_memory_id) {
        continue;
      }

      const note: VoiceNoteRecord = {
        ...memory,
        embedding: normalizeEmbedding(memory.embedding),
        analysis: normalizeVoiceNoteAnalysis(memory.analysis),
        type: "voice_note",
        parent_memory_id: memory.parent_memory_id,
      };

      const existing = voiceNotesByPageId.get(memory.parent_memory_id) ?? [];
      existing.push(note);
      voiceNotesByPageId.set(memory.parent_memory_id, existing);
    }

    const memories: PageMemoryRecord[] = (pageData ?? []).map((memory) => ({
      ...memory,
      embedding: normalizeEmbedding(memory.embedding),
      analysis: normalizeVoiceNoteAnalysis(memory.analysis),
      type: "page",
      parent_memory_id: null,
      is_placeholder: Boolean(memory.is_placeholder),
      voiceNotes: voiceNotesByPageId.get(memory.id) ?? [],
    }));

    const foldersById = new Map<string, Folder>();
    if (userId) {
      const { data: folderData, error: folderError } = await supabase
        .from("folders")
        .select("id, name, created_at, source, auto_key")
        .eq("user_id", userId);

      if (folderError) {
        throw folderError;
      }

      for (const folder of folderData ?? []) {
        foldersById.set(folder.id, folder as Folder);
      }

      await applyAutoFolders({ userId, memories, foldersById });
    }

    const threaded = buildThreadMetadata(memories, foldersById);

    return NextResponse.json(
      {
        memories: threaded.memories,
        threads: threaded.threads satisfies ThreadSummary[],
      },
      { headers: corsHeaders },
    );
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, folder_id } = await req.json();

    if (!id) {
      return NextResponse.json(
        { error: "Memory id is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const { error } = await supabase
      .from("memories")
      .update({ folder_id: folder_id || null })
      .eq("id", id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = (await req.json()) as { id?: string };

    if (!id) {
      return NextResponse.json(
        { error: "Memory id is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const { error } = await supabase.from("memories").delete().eq("id", id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}
