"use client";

import { useMemo, useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { KnowledgeHeader } from "@/components/knowledge/KnowledgeHeader";
import { KnowledgeSearch } from "@/components/knowledge/KnowledgeSearch";
import { KnowledgeGraphView } from "@/components/knowledge/KnowledgeGraphView";
import { KnowledgeRegistry } from "@/lib/knowledge/registry";
import { KnowledgeGraphEngine } from "@/lib/knowledge/graph";
import { KnowledgeEntity, EntityType, DifficultyLevel } from "@/types/knowledge";
import {
  LayoutGrid,
  GitFork,
  BookOpen,
  Sparkles,
  Cpu,
  Bot,
  Layers,
  Briefcase,
  Clock,
  ArrowUpRight,
  Gauge,
  Tag as TagIcon,
  Sparkle,
} from "lucide-react";
import { cn } from "@/lib/utils";

function KnowledgeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Read initial filter values from URL query parameters
  const initialType = searchParams?.get("type") || "";
  const initialView = searchParams?.get("view") || "grid";
  const initialQuery = searchParams?.get("q") || "";
  const initialCategory = searchParams?.get("category") || "";
  const initialTag = searchParams?.get("tag") || "";
  const initialDifficulty = searchParams?.get("difficulty") || "";

  const [viewMode, setViewMode] = useState<"grid" | "graph">(
    initialView === "graph" ? "graph" : "grid"
  );
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedType, setSelectedType] = useState<string>(initialType);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [selectedTag, setSelectedTag] = useState<string>(initialTag);
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>(initialDifficulty);

  // Sync state with URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set("q", searchQuery);
    if (selectedType) params.set("type", selectedType);
    if (selectedCategory) params.set("category", selectedCategory);
    if (selectedTag) params.set("tag", selectedTag);
    if (selectedDifficulty) params.set("difficulty", selectedDifficulty);
    if (viewMode === "graph") params.set("view", "graph");

    const queryString = params.toString();
    const newPath = queryString ? `/knowledge?${queryString}` : "/knowledge";
    router.replace(newPath, { scroll: false });
  }, [searchQuery, selectedType, selectedCategory, selectedTag, selectedDifficulty, viewMode, router]);

  // Extract all categories and tags from initial knowledge base
  const { items: allEntities } = useMemo(() => KnowledgeRegistry.getAllEntities({ limit: 1000 }), []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    allEntities.forEach((e) => set.add(e.category));
    return Array.from(set).sort();
  }, [allEntities]);

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    allEntities.forEach((e) => e.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [allEntities]);

  // Filtered entities matching active criteria
  const filteredEntities = useMemo(() => {
    return KnowledgeRegistry.getAllEntities({
      query: searchQuery,
      type: selectedType ? (selectedType as EntityType) : undefined,
      category: selectedCategory || undefined,
      tag: selectedTag || undefined,
      difficulty: selectedDifficulty ? (selectedDifficulty as DifficultyLevel) : undefined,
      limit: 100,
    }).items;
  }, [searchQuery, selectedType, selectedCategory, selectedTag, selectedDifficulty]);

  // Knowledge Graph data
  const graphData = useMemo(() => KnowledgeGraphEngine.buildGraph(), []);

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedType("");
    setSelectedCategory("");
    setSelectedTag("");
    setSelectedDifficulty("");
  };

  // Helper badge styles for entity types
  const typeBadgeStyles: Record<string, { bg: string; text: string; border: string; icon: any }> = {
    topic: { bg: "bg-purple-500/10 dark:bg-purple-500/20", text: "text-purple-700 dark:text-purple-300", border: "border-purple-500/30", icon: BookOpen },
    skill: { bg: "bg-emerald-500/10 dark:bg-emerald-500/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-500/30", icon: Sparkles },
    mcp: { bg: "bg-cyan-500/10 dark:bg-cyan-500/20", text: "text-cyan-700 dark:text-cyan-300", border: "border-cyan-500/30", icon: Cpu },
    agent: { bg: "bg-amber-500/10 dark:bg-amber-500/20", text: "text-amber-700 dark:text-amber-300", border: "border-amber-500/30", icon: Bot },
    architecture: { bg: "bg-rose-500/10 dark:bg-rose-500/20", text: "text-rose-700 dark:text-rose-300", border: "border-rose-500/30", icon: Layers },
    project: { bg: "bg-blue-500/10 dark:bg-blue-500/20", text: "text-blue-700 dark:text-blue-300", border: "border-blue-500/30", icon: Briefcase },
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans">
      <KnowledgeHeader activeType={selectedType} activeView={viewMode} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Page Hero Header */}
        <section className="space-y-4 border-b border-zinc-200 dark:border-zinc-800 pb-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2 max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-md bg-zinc-200/70 px-2.5 py-1 font-mono text-xs font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300">
                <Sparkle className="h-3.5 w-3.5 text-amber-500" />
                <span>AI-Native Knowledge Graph & Protocol Registry</span>
              </div>

              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 font-mono">
                Knowledge OS
              </h1>

              <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 font-sans leading-relaxed">
                A structured, machine-readable repository of technical knowledge, Model Context Protocol (MCP) servers, autonomous AI agents, architectural blueprints, and core engineering skills.
              </p>
            </div>

            {/* View Mode Toggle Switch (Grid vs Graph) */}
            <div className="inline-flex items-center rounded-xl border border-zinc-200 bg-white p-1 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 self-start md:self-auto font-mono text-xs">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors cursor-pointer",
                  viewMode === "grid"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
                <span>Grid View</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode("graph")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors cursor-pointer",
                  viewMode === "graph"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                )}
              >
                <GitFork className="h-4 w-4" />
                <span>Knowledge Graph</span>
              </button>
            </div>
          </div>
        </section>

        {/* Search & Filter Controls */}
        <KnowledgeSearch
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          selectedTag={selectedTag}
          onTagChange={setSelectedTag}
          selectedDifficulty={selectedDifficulty}
          onDifficultyChange={setSelectedDifficulty}
          selectedType={selectedType}
          onTypeChange={setSelectedType}
          categories={categories}
          availableTags={availableTags}
          totalResults={filteredEntities.length}
          onReset={resetFilters}
        />

        {/* View Mode Switcher Content */}
        {viewMode === "graph" ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between font-mono text-xs text-zinc-500">
              <span>Interactive Knowledge OS Graph View</span>
              <span>Showing nodes and relationship edges</span>
            </div>
            <KnowledgeGraphView graphData={graphData} />
          </section>
        ) : (
          <section className="space-y-6">
            {filteredEntities.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900/40 space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400">
                  <BookOpen className="h-6 w-6" />
                </div>
                <h3 className="font-mono text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  No knowledge entities found
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
                  Try adjusting your search keywords, clearing tag filters, or selecting a different category.
                </p>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2 font-mono text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white transition-colors"
                >
                  Reset all filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredEntities.map((entity: KnowledgeEntity) => {
                  const badge = typeBadgeStyles[entity.type] || typeBadgeStyles.topic;
                  const Icon = badge.icon;
                  const relationshipCount =
                    (entity.relatedSkills?.length || 0) +
                    (entity.relatedMcps?.length || 0) +
                    (entity.relatedAgents?.length || 0) +
                    (entity.relatedTopics?.length || 0) +
                    (entity.relatedProjects?.length || 0);

                  return (
                    <article
                      key={entity.id}
                      className="group relative flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xs transition-all hover:border-zinc-400 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/80 dark:hover:border-zinc-700"
                    >
                      <div className="space-y-3">
                        {/* Header: Entity Type Badge & Category */}
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 font-mono text-[11px] font-medium border",
                              badge.bg,
                              badge.text,
                              badge.border
                            )}
                          >
                            <Icon className="h-3 w-3" />
                            <span>{entity.type.toUpperCase()}</span>
                          </span>

                          <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
                            {entity.readingTimeMin} min read
                          </span>
                        </div>

                        {/* Title & Link */}
                        <h2 className="font-mono text-base font-bold text-zinc-900 group-hover:text-sky-600 dark:text-zinc-100 dark:group-hover:text-sky-400 transition-colors line-clamp-2">
                          <Link href={`/knowledge/${entity.type}/${entity.slug}`} className="focus:outline-none">
                            <span className="absolute inset-0" aria-hidden="true" />
                            {entity.title}
                          </Link>
                        </h2>

                        <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-3 leading-relaxed">
                          {entity.summary}
                        </p>
                      </div>

                      {/* Footer Metadata */}
                      <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 space-y-3">
                        {/* Tags */}
                        <div className="flex flex-wrap gap-1">
                          {entity.tags.slice(0, 4).map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                            >
                              #{tag}
                            </span>
                          ))}
                          {entity.tags.length > 4 && (
                            <span className="font-mono text-[10px] text-zinc-400">
                              +{entity.tags.length - 4}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between font-mono text-[11px] text-zinc-500 dark:text-zinc-400 pt-1">
                          <span className="capitalize flex items-center gap-1">
                            <Gauge className="h-3 w-3 text-zinc-400" />
                            {entity.difficulty}
                          </span>

                          <span className="inline-flex items-center gap-1 text-zinc-700 dark:text-zinc-300 font-semibold group-hover:translate-x-0.5 transition-transform">
                            <span>{relationshipCount} links</span>
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default function KnowledgePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center font-mono text-sm">
        Loading Knowledge OS...
      </div>
    }>
      <KnowledgeContent />
    </Suspense>
  );
}
