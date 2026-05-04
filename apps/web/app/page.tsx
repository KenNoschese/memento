"use client";

import { useCallback, useEffect, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  Panel,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "reactflow";
import "reactflow/dist/style.css";
import { Brain, ExternalLink, Loader2, Mic, Play, Search } from "lucide-react";
import type {
  BriefingResponse,
  MemoryRecord,
  SearchResponse,
} from "@/app/lib/types";

type FlowNodeData = MemoryRecord & {
  label: string;
  isVoiceNote: boolean;
};

type MemoriesResponse = {
  memories: MemoryRecord[];
};

const GRID_COLUMNS = 4;
const NODE_WIDTH = 220;
const NODE_HEIGHT = 132;
const NODE_GAP_X = 44;
const NODE_GAP_Y = 36;

function isVoiceNote(memory: MemoryRecord): boolean {
  return memory.type === "voice_note" || memory.title === "Voice Note";
}

function getNodeStyle(
  memory: MemoryRecord,
  isHighlighted: boolean,
  hasSearch: boolean,
) {
  const voiceNote = isVoiceNote(memory);
  const dimmed = hasSearch && !isHighlighted;

  return {
    background: voiceNote ? "#fef2f2" : "#ffffff",
    border: isHighlighted
      ? "2px solid #2563eb"
      : voiceNote
        ? "1px solid #fca5a5"
        : "1px solid #d4d4d8",
    borderRadius: "8px",
    padding: "12px",
    width: `${NODE_WIDTH}px`,
    minHeight: `${NODE_HEIGHT}px`,
    boxShadow: isHighlighted
      ? "0 0 0 3px rgba(59, 130, 246, 0.16)"
      : "0 8px 24px rgba(15, 23, 42, 0.08)",
    opacity: dimmed ? 0.42 : 1,
    color: "#18181b",
  };
}

function buildNodes(
  memories: MemoryRecord[],
  highlightedIds: string[] = [],
): Node<FlowNodeData>[] {
  const highlighted = new Set(highlightedIds);
  const hasSearch = highlighted.size > 0;

  return memories.map((memory, index) => ({
    id: memory.id,
    data: {
      ...memory,
      label: memory.title?.trim() || memory.url,
      isVoiceNote: isVoiceNote(memory),
    },
    position: {
      x: (index % GRID_COLUMNS) * (NODE_WIDTH + NODE_GAP_X),
      y: Math.floor(index / GRID_COLUMNS) * (NODE_HEIGHT + NODE_GAP_Y),
    },
    style: getNodeStyle(memory, highlighted.has(memory.id), hasSearch),
  }));
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) {
    return -1;
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
  return denominator === 0 ? -1 : dotProduct / denominator;
}

function buildEdges(memories: MemoryRecord[]): Edge[] {
  const edges: Edge[] = [];
  const seenPairs = new Set<string>();

  memories.forEach((memory) => {
    const sourceEmbedding = memory.embedding;
    if (!sourceEmbedding?.length) {
      return;
    }

    let bestMatch: MemoryRecord | undefined;
    let bestScore = 0.75;

    memories.forEach((candidate) => {
      const candidateEmbedding = candidate.embedding;
      if (candidate.id === memory.id || !candidateEmbedding?.length) {
        return;
      }

      const similarity = cosineSimilarity(sourceEmbedding, candidateEmbedding);
      if (similarity > bestScore) {
        bestScore = similarity;
        bestMatch = candidate;
      }
    });

    if (!bestMatch) {
      return;
    }

    const resolvedMatch = bestMatch;

    const pairKey = [memory.id, resolvedMatch.id].sort().join(":");
    if (seenPairs.has(pairKey)) {
      return;
    }

    seenPairs.add(pairKey);
    edges.push({
      id: `edge:${pairKey}`,
      source: memory.id,
      target: resolvedMatch.id,
      animated: false,
      style: { stroke: "#94a3b8", strokeWidth: 1.5 },
    });
  });

  return edges;
}

export default function Dashboard() {
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [nodes, setNodes] = useState<Node<FlowNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [briefing, setBriefing] = useState<BriefingResponse>({
    summary: "",
    recentUrls: [],
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingBriefing, setIsLoadingBriefing] = useState(true);
  const [selectedNode, setSelectedNode] = useState<MemoryRecord | null>(null);

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
      setNodes(buildNodes(records));
      setEdges(buildEdges(records));
    } catch (error) {
      console.error("Failed to fetch memories:", error);
      setMemories([]);
      setNodes([]);
      setEdges([]);
    }
  }, []);

  const handleSearch = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const normalizedQuery = searchQuery.trim();
      if (!normalizedQuery) {
        setNodes(buildNodes(memories));
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
        setNodes(buildNodes(memories, matchIds));
      } catch (error) {
        console.error("Search failed:", error);
      } finally {
        setIsSearching(false);
      }
    },
    [memories, searchQuery],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<FlowNodeData>) => {
      setSelectedNode(node.data);
    },
    [],
  );

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((currentNodes) => applyNodeChanges(changes, currentNodes));
  }, []);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges));
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchBriefing();
      void fetchMemories();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchBriefing, fetchMemories]);

  const selectedNodePreview =
    selectedNode?.content?.slice(0, 500) || "No content available.";

  return (
    <ReactFlowProvider>
      <div className="flex h-screen min-h-screen w-full flex-col bg-zinc-50 text-zinc-900">
        <header className="z-10 flex border-b border-zinc-200 bg-white px-6 py-5">
          <div className="flex w-full items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2 text-black-600">
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
                  <p className="max-w-4xl text-base leading-7 text-zinc-700">
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
                      className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                    >
                      <ExternalLink size={16} />
                      Resume Work
                    </button>
                  ) : null}
                </div>
              )}
            </div>

            <div className="w-full max-w-sm shrink-0">
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
                      setNodes(buildNodes(memories));
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
          </div>
        </header>

        <main className="relative flex-1 overflow-hidden">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onNodeClick={handleNodeClick}
            fitView
            minZoom={0.25}
          >
            <Background color="#d4d4d8" gap={20} />
            <Controls />
            <Panel
              position="bottom-left"
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500 shadow-sm"
            >
              {nodes.length} memories loaded
            </Panel>
          </ReactFlow>

          {selectedNode ? (
            <aside className="absolute right-6 top-6 z-20 w-[360px] max-w-[calc(100%-3rem)] rounded-lg border border-zinc-200 bg-white p-5 shadow-xl">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-zinc-950">
                    {selectedNode.title?.trim() || "Untitled"}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {new Date(selectedNode.created_at).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedNode(null)}
                  className="text-sm text-zinc-400 hover:text-zinc-600"
                >
                  Close
                </button>
              </div>

              <div className="space-y-4">
                <a
                  href={selectedNode.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm text-blue-600 hover:text-blue-700 hover:underline"
                >
                  {selectedNode.url}
                </a>

                <div className="max-h-64 overflow-y-auto rounded-md bg-zinc-50 p-3 text-sm leading-6 text-zinc-700">
                  {selectedNodePreview}
                </div>

                {isVoiceNote(selectedNode) ? (
                  <div className="flex items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
                    <Mic size={16} />
                    <span className="font-medium">Voice note transcript</span>
                    <button
                      type="button"
                      className="ml-auto rounded-full bg-red-100 p-2 text-red-700"
                    >
                      <Play size={14} fill="currentColor" />
                    </button>
                  </div>
                ) : (
                  <a
                    href={selectedNode.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    <ExternalLink size={16} />
                    Visit Original Page
                  </a>
                )}
              </div>
            </aside>
          ) : null}
        </main>
      </div>
    </ReactFlowProvider>
  );
}
