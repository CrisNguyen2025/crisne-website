"use client";

import React, { useState, useEffect } from "react";
import {
  Edit3,
  Clock,
  History,
  Trash2,
  ChevronRight,
  Folder,
  ChevronUp,
  Pencil,
} from "lucide-react";
import { ChecklistItem, RoadmapLevel } from "@/lib/roadmap/types";
import { formatFriendlyTime, formatExactDate } from "@/lib/roadmap/date-utils";
import { contentToHtml } from "@/lib/roadmap/content-utils";
import { useToast } from "@/components/ui/toast";
import { EditItemContentDrawer } from "./EditItemContentDrawer";
import { EditItemInfoDrawer } from "./EditItemInfoDrawer";

interface DetailPanelProps {
  item: (ChecklistItem & { layerTitle?: string; groupTitle?: string }) | null;
  onUpdateNote?: (id: string, text: string) => void;
  onEditItem?: (
    id: string,
    title: string,
    description: string,
    level?: RoadmapLevel,
    content?: string
  ) => void;
  onDeleteItem?: (id: string) => void;
}

export function DetailPanel({
  item,
  onEditItem,
  onDeleteItem,
}: DetailPanelProps) {
  const { toast } = useToast();
  const [isContentModalOpen, setIsContentModalOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (item) {
      setIsContentModalOpen(false);
      setIsInfoModalOpen(false);
      containerRef.current?.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [item?.id]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollTop = e.currentTarget.scrollTop;
    setShowScrollTop(currentScrollTop > 240);
  };

  const scrollToTop = () => {
    containerRef.current?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  if (!item) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground h-full">
        <div className="w-12 h-12 rounded-2xl bg-muted/50 border border-border/40 flex items-center justify-center mb-3">
          <Folder className="w-6 h-6 text-muted-foreground/60" />
        </div>
        <h3 className="font-semibold text-sm text-foreground mb-1">
          No item selected
        </h3>
        <p className="text-xs max-w-xs text-muted-foreground">
          Please select an item from the left panel to view or edit its details.
        </p>
      </div>
    );
  }

  const handleSaveItem = (
    id: string,
    title: string,
    description: string,
    level?: RoadmapLevel,
    content?: string
  ) => {
    try {
      if (onEditItem) {
        onEditItem(id, title, description, level, content);
        toast("Updated successfully!", "success");
      }
    } catch {
      toast("Update failed, please try again!", "error");
    }
  };

  return (
    <div className="flex-1 relative h-full flex flex-col overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 flex flex-col h-full overflow-y-auto scrollbar-thin"
      >
        {/* Header Toolbar */}
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border/50 bg-background/80 backdrop-blur-md shrink-0 min-h-[57px]">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium truncate h-7">
            <div className="flex items-center gap-1.5 text-foreground/80 hover:text-foreground shrink-0">
              <Folder className="w-3.5 h-3.5 text-primary" />
              <span className="truncate max-w-[8.75rem] md:max-w-[13.75rem]">
                {item.layerTitle || "Architecture Layer"}
              </span>
            </div>

            <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />

            <div className="text-muted-foreground hover:text-foreground shrink-0">
              <span className="truncate max-w-[7.5rem] md:max-w-[11.25rem] font-medium">
                {item.groupTitle ||
                  (item.level === "core"
                    ? "Core"
                    : item.level === "intermediate"
                      ? "Intermediate"
                      : item.level === "advanced"
                        ? "Advanced"
                        : item.level)}
              </span>
            </div>

            <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />

            <span className="text-foreground font-semibold truncate max-w-[10rem] md:max-w-[15rem]">
              {item.title}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onDeleteItem && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Are you sure you want to delete "${item.title}"?`)) {
                    onDeleteItem(item.id);
                  }
                }}
                className="p-1.5 rounded-lg border border-rose-500/20 hover:bg-rose-500/10 text-rose-500 text-xs font-medium transition-colors cursor-pointer"
                title="Delete this item"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Content Container */}
        <div className="pb-6 pt-2 md:pb-8 space-y-6 max-w-[90%] md:max-w-[85%] w-full mx-auto">
          <article className="space-y-4">
            {/* Header: Click to edit Title / Description */}
            <header
              onClick={() => setIsInfoModalOpen(true)}
              className="group/header relative px-3 py-2.5 -mx-3 rounded-2xl transition-all duration-150 hover:bg-muted/30 cursor-pointer border border-transparent hover:border-border/50"
              title="Click to edit title & description"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground leading-snug group-hover/header:text-primary transition-colors">
                    {item.title}
                  </h1>

                  {/* Action badge on hover */}
                  <div className="opacity-0 group-hover/header:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 rounded-lg bg-background border border-border/60 text-muted-foreground hover:text-foreground text-[11px] font-medium shrink-0 shadow-2xs">
                    <Pencil className="w-3 h-3 text-primary" />
                    <span>Edit info</span>
                  </div>
                </div>

                {item.description && (
                  <p className="text-xs md:text-sm leading-relaxed text-muted-foreground font-normal">
                    {item.description}
                  </p>
                )}

                <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70 pt-1">
                  <span
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                    title={`Created: ${formatExactDate(item.createdAt)}`}
                  >
                    <Clock className="w-3 h-3 text-primary/80" />
                    Created {formatFriendlyTime(item.createdAt)}
                  </span>
                  <span className="text-muted-foreground/30">•</span>
                  <span
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                    title={`Last updated: ${formatExactDate(item.updatedAt)}`}
                  >
                    <History className="w-3 h-3 text-emerald-500/80" />
                    Updated {formatFriendlyTime(item.updatedAt)}
                  </span>
                </div>
              </div>
            </header>

            {/* Divider */}
            <div className="w-full border-t border-border/60 my-2" />

            {/* Content Header */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-1.5">
                Content
              </span>
              <button
                type="button"
                onClick={() => setIsContentModalOpen(true)}
                className="px-2.5 py-1 rounded-lg border border-border/70 hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                title="Edit item detailed notes"
              >
                <Edit3 className="w-3.5 h-3.5 text-primary" />
                <span>{item.content ? "Edit content" : "Add content"}</span>
              </button>
            </div>

            {/* Article Content or Empty State */}
            {item.content ? (
              <div className="relative group">
                <div
                  className="post-content-view prose prose-sm dark:prose-invert max-w-none text-foreground/90 select-text leading-relaxed tracking-normal"
                  dangerouslySetInnerHTML={{
                    __html: contentToHtml(item.content),
                  }}
                />
              </div>
            ) : (
              <div className="py-10 px-4 rounded-xl border border-dashed border-border/70 flex flex-col items-center justify-center text-center bg-muted/10">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Edit3 className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground mb-1">
                  No detailed notes yet
                </p>
                <p className="text-xs text-muted-foreground max-w-xs mb-4">
                  Add comprehensive documentation, code examples, callouts, and links using the Notion-like rich editor.
                </p>
                <button
                  type="button"
                  onClick={() => setIsContentModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Start writing</span>
                </button>
              </div>
            )}
          </article>
        </div>
      </div>

      {/* Drawer: Notion Editor */}
      <EditItemContentDrawer
        isOpen={isContentModalOpen}
        item={item}
        onClose={() => setIsContentModalOpen(false)}
        onSubmit={handleSaveItem}
      />

      {/* Drawer: Title / Description / Level */}
      <EditItemInfoDrawer
        isOpen={isInfoModalOpen}
        item={item}
        onClose={() => setIsInfoModalOpen(false)}
        onSubmit={handleSaveItem}
      />

      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="absolute bottom-5 right-5 z-30 p-2.5 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all duration-200 border border-border/20 flex items-center justify-center animate-in fade-in zoom-in-75 cursor-pointer"
          title="Scroll to top"
          aria-label="Scroll to top"
        >
          <ChevronUp className="w-4 h-4 stroke-[2.5]" />
        </button>
      )}
    </div>
  );
}
