"use client";

import { createClient } from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type MemoryRow = {
  id: string;
  title: string | null;
  summary: string | null;
  url: string;
  created_at: string;
  user_id: string | null;
};

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const rawUserId = searchParams.get("memento_user_id");
  const userId = rawUserId?.trim() || null;

  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      return null;
    }

    return createClient(url, anonKey);
  }, []);

  useEffect(() => {
    if (!userId || !supabase) {
      return;
    }

    let isMounted = true;

    const fetchMemories = async () => {
      setIsLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from("memories")
        .select("id, title, summary, url, created_at, user_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (queryError) {
        setError(queryError.message);
        setMemories([]);
      } else {
        setMemories((data ?? []) as MemoryRow[]);
      }

      setIsLoading(false);
    };

    void fetchMemories();

    return () => {
      isMounted = false;
    };
  }, [supabase, userId]);

  if (!userId) {
    return (
      <div className="min-h-screen bg-background px-6 py-16 text-foreground">
        <div className="mx-auto max-w-2xl rounded-2xl border border-(--line) bg-(--surface) p-6 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="mt-3 text-sm text-(--muted)">
            Please open the dashboard via the Memento extension.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-6 py-8 text-foreground">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-semibold">Memento Dashboard</h1>
        <p className="mt-2 text-sm text-(--muted)">Active user: {userId}</p>

        {isLoading ? (
          <p className="mt-6 text-sm text-(--muted)">Loading memories...</p>
        ) : null}

        {error ? (
          <p className="mt-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {!isLoading && !error ? (
          <div className="mt-6 space-y-3">
            {memories.length === 0 ? (
              <div className="rounded-xl border border-dashed border-(--line) bg-(--surface-soft) px-4 py-6 text-sm text-(--muted)">
                No memories found for this user.
              </div>
            ) : (
              memories.map((memory) => (
                <article
                  key={memory.id}
                  className="rounded-xl border border-(--line) bg-(--surface) p-4"
                >
                  <h2 className="font-medium">
                    {memory.title?.trim() || "Untitled"}
                  </h2>
                  <p className="mt-1 text-sm text-(--muted)">
                    {memory.summary?.trim() || memory.url}
                  </p>
                </article>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
