"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, SlidersHorizontal, Tag, Layers, Gauge, RotateCcw, Command } from "lucide-react";
import { EntityType, DifficultyLevel } from "@/types/knowledge";
import { cn } from "@/lib/utils";

interface KnowledgeSearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  selectedTag: string;
  onTagChange: (tag: string) => void;
  selectedDifficulty: string;
  onDifficultyChange: (difficulty: string) => void;
  selectedType: string;
  onTypeChange: (type: string) => void;
  categories: string[];
  availableTags: string[];
  totalResults: number;
  onReset: () => void;
  className?: string;
}

export function KnowledgeSearch({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  selectedTag,
  onTagChange,
  selectedDifficulty,
  onDifficultyChange,
  selectedType,
  onTypeChange,
  categories,
  availableTags,
  totalResults,
  onReset,
  className,
}: KnowledgeSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Keyboard shortcut (⌘K or /) to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const hasActiveFilters =
    Boolean(searchQuery) ||
    Boolean(selectedCategory) ||
    Boolean(selectedTag) ||
    Boolean(selectedDifficulty) ||
    Boolean(selectedType);

  const entityTypes: { label: string; value: string }[] = [
    { label: "All Types", value: "" },
    { label: "Topics", value: "topic" },
    { label: "Skills", value: "skill" },
    { label: "MCPs", value: "mcp" },
    { label: "Agents", value: "agent" },
    { label: "Architecture", value: "architecture" },
    { label: "Projects", value: "project" },
  ];

  const difficulties: { label: string; value: string }[] = [
    { label: "All Levels", value: "" },
    { label: "Beginner", value: "beginner" },
    { label: "Intermediate", value: "intermediate" },
    { label: "Advanced", value: "advanced" },
  ];

  return (
    <section className={cn("w-full space-y-4", className)} role="search" aria-label="Knowledge Base Search and Filters">
      {/* Primary Search Bar */}
      <div className="relative flex items-center">
        <div className="pointer-events-none absolute left-4 flex items-center text-zinc-400 dark:text-zinc-500">
          <Search className="h-5 w-5" />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search entities, skills, MCP servers, agents, architecture..."
          aria-label="Search Knowledge OS"
          className="w-full rounded-xl border border-zinc-200 bg-white py-3.5 pl-11 pr-24 font-mono text-sm text-zinc-900 placeholder-zinc-400 shadow-xs transition-all focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
        />

        <div className="absolute right-3 flex items-center gap-2">
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors"
              aria-label="Clear search input"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          <div className="hidden sm:flex items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-400 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-500">
            <Command className="h-3 w-3" />
            <span>K</span>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvancedFilters((prev) => !prev)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-xs font-medium transition-colors",
              showAdvancedFilters || hasActiveFilters
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-400 dark:hover:bg-zinc-800"
            )}
            aria-expanded={showAdvancedFilters}
            aria-label="Toggle filter panel"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Filters</span>
            {hasActiveFilters && (
              <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            )}
          </button>
        </div>
      </div>

      {/* Type Quick Selector Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
          {entityTypes.map((type) => {
            const isSelected = selectedType === type.value;
            return (
              <button
                key={type.value || "all-types"}
                type="button"
                onClick={() => onTypeChange(type.value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 font-medium transition-all cursor-pointer",
                  isSelected
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                )}
              >
                {type.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-zinc-500 dark:text-zinc-400">
          <span>{totalResults} {totalResults === 1 ? "entity" : "entities"} found</span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 underline decoration-dashed underline-offset-4 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Advanced Filters Panel */}
      {showAdvancedFilters && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800/80 dark:bg-zinc-900/40 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Category Filter */}
            <div className="space-y-1.5">
              <label htmlFor="category-select" className="flex items-center gap-1.5 font-mono text-xs font-medium text-zinc-700 dark:text-zinc-300">
                <Layers className="h-3.5 w-3.5 text-zinc-400" />
                <span>Category</span>
              </label>
              <select
                id="category-select"
                value={selectedCategory}
                onChange={(e) => onCategoryChange(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-900 shadow-2xs focus:border-zinc-900 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-100"
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Difficulty Filter */}
            <div className="space-y-1.5">
              <label htmlFor="difficulty-select" className="flex items-center gap-1.5 font-mono text-xs font-medium text-zinc-700 dark:text-zinc-300">
                <Gauge className="h-3.5 w-3.5 text-zinc-400" />
                <span>Difficulty</span>
              </label>
              <select
                id="difficulty-select"
                value={selectedDifficulty}
                onChange={(e) => onDifficultyChange(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-900 shadow-2xs focus:border-zinc-900 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-100"
              >
                {difficulties.map((diff) => (
                  <option key={diff.value || "all-diff"} value={diff.value}>
                    {diff.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Tag Selection Dropdown */}
            <div className="space-y-1.5">
              <label htmlFor="tag-select" className="flex items-center gap-1.5 font-mono text-xs font-medium text-zinc-700 dark:text-zinc-300">
                <Tag className="h-3.5 w-3.5 text-zinc-400" />
                <span>Tag Filter</span>
              </label>
              <select
                id="tag-select"
                value={selectedTag}
                onChange={(e) => onTagChange(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-900 shadow-2xs focus:border-zinc-900 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-100"
              >
                <option value="">All Tags</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    #{tag}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Popular Tag Chips */}
          {availableTags.length > 0 && (
            <div className="pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[11px] text-zinc-400 mr-1">Popular Tags:</span>
                {availableTags.slice(0, 10).map((tag) => {
                  const isSelected = selectedTag === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => onTagChange(isSelected ? "" : tag)}
                      className={cn(
                        "rounded-md px-2 py-0.5 font-mono text-[11px] transition-colors cursor-pointer",
                        isSelected
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                          : "bg-zinc-200/60 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:text-zinc-400 dark:hover:bg-zinc-700"
                      )}
                    >
                      #{tag}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
