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
import { Image as AntImage } from "antd";
import { EditItemContentDrawer } from "./EditItemContentDrawer";
import { EditItemInfoDrawer } from "./EditItemInfoDrawer";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";

interface DetailPanelProps {
  item: (ChecklistItem & { layerTitle?: string; groupTitle?: string }) | null;
  isLoading?: boolean;
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
  isLoading = false,
  onUpdateNote,
  onEditItem,
  onDeleteItem,
}: DetailPanelProps) {
  const { toast } = useToast();
  const [isContentModalOpen, setIsContentModalOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [allImages, setAllImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (item) {
      setIsContentModalOpen(false);
      setIsInfoModalOpen(false);
      setIsDeleteModalOpen(false);
      setPreviewVisible(false);
      containerRef.current?.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [item?.id]);

  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const img = target.closest("img");
    if (img && img.src) {
      e.preventDefault();
      const container = e.currentTarget;
      const imgs = Array.from(container.querySelectorAll("img"))
        .map((el) => el.src)
        .filter(Boolean);
      const clickedIndex = imgs.indexOf(img.src);

      setAllImages(imgs.length > 0 ? imgs : [img.src]);
      setCurrentImageIndex(clickedIndex >= 0 ? clickedIndex : 0);
      setPreviewVisible(true);
    }
  };

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

  if (isLoading) {
    return (
      <div className="flex-1 relative h-full flex flex-col overflow-hidden bg-background">
        {/* Skeleton Toolbar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border/50 bg-background/80 shrink-0 min-h-[57px]">
          <div className="flex items-center gap-2 w-1/3">
            <div className="w-4 h-4 rounded bg-muted/60" />
            <div className="h-3.5 w-24 rounded bg-muted/60" />
            <div className="h-3.5 w-16 rounded bg-muted/40" />
          </div>
        </div>
        {/* Skeleton Content */}
        <div className="p-6 md:p-8 space-y-6 max-w-[90%] md:max-w-[85%] w-full mx-auto">
          <div className="space-y-3">
            <div className="h-8 w-2/3 rounded-xl bg-muted/60 relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent" />
            <div className="h-4 w-5/6 rounded-lg bg-muted/40 relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent" />
            <div className="h-4 w-1/2 rounded-lg bg-muted/30 relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent" />
          </div>
          <div className="w-full border-t border-border/40 my-4" />
          <div className="space-y-3 pt-2">
            <div className="h-4 w-28 rounded-md bg-muted/50" />
            <div className="h-36 w-full rounded-2xl border border-border/40 bg-muted/20 relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent" />
          </div>
        </div>
      </div>
    );
  }

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

  const handleSaveInfo = async (
    id: string,
    title: string,
    description: string,
    level?: RoadmapLevel
  ) => {
    try {
      if (onEditItem) {
        await onEditItem(id, title, description, level);
      }
      toast("Info updated successfully!", "success");
    } catch {
      toast("Failed to update info, please try again!", "error");
      throw new Error("Failed to update info");
    }
  };

  const handleSaveContent = async (id: string, newContent: string) => {
    try {
      if (onUpdateNote) {
        await onUpdateNote(id, newContent);
      }
      toast("Content saved successfully!", "success");
    } catch {
      toast("Failed to save content, please try again!", "error");
      throw new Error("Failed to save content");
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
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium min-w-0 flex-1 h-7 overflow-hidden">
            <div
              className="flex items-center gap-1.5 text-foreground/80 hover:text-foreground shrink-0 max-w-[40%] truncate"
              title={item.layerTitle || "Architecture Layer"}
            >
              <Folder className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="truncate">
                {item.layerTitle || "Architecture Layer"}
              </span>
            </div>

            <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />

            <div
              className="text-muted-foreground hover:text-foreground shrink-0 max-w-[25%] truncate"
              title={
                item.groupTitle ||
                (item.level === "core"
                  ? "Core"
                  : item.level === "intermediate"
                    ? "Intermediate"
                    : item.level === "advanced"
                      ? "Advanced"
                      : item.level)
              }
            >
              <span className="truncate font-medium">
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

            <span
              className="text-foreground font-semibold truncate flex-1 min-w-0"
              title={item.title}
            >
              {item.title}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsInfoModalOpen(true)}
              className="px-2.5 py-1.5 rounded-lg border border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
              title="Edit item title and description"
            >
              <Pencil className="w-3.5 h-3.5 text-primary" />
              <span>Edit</span>
            </button>

            {onDeleteItem && (
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(true)}
                className="px-2.5 py-1.5 rounded-lg border border-rose-500/20 hover:bg-rose-500/10 text-rose-500 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title="Delete this item"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>

        {/* Content Container */}
        <div className="pb-6 pt-2 md:pb-8 space-y-6 max-w-[90%] md:max-w-[85%] w-full mx-auto">
          <article className="space-y-4">
            {/* Header: Title / Description (View Only) */}
            <header className="space-y-2 select-text">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground leading-snug">
                {item.title}
              </h1>

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
            </header>

            {/* Divider */}
            <div className="w-full border-t border-border/60 my-2" />

            {/* Content Header */}
            <div className="grid grid-cols-3 items-center pt-1">
              <div className="flex items-center justify-start">
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

              <div className="flex items-center justify-center">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-1.5">
                  Content
                </span>
              </div>

              <div className="flex items-center justify-end" />
            </div>

            {/* Article Content or Empty State */}
            {item.content ? (
              <div className="relative group">
                <div
                  onClick={handleContentClick}
                  className="post-content-view prose prose-sm dark:prose-invert max-w-none text-foreground/90 select-text leading-relaxed tracking-normal"
                  dangerouslySetInnerHTML={{
                    __html: contentToHtml(item.content),
                  }}
                />
              </div>
            ) : (
              <div className="py-10 rounded-xl border border-dashed border-border/70 flex flex-col items-center justify-center text-center bg-muted/10">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Edit3 className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground mb-1">
                  No detailed notes yet
                </p>
                <p className="text-xs text-muted-foreground max-w-xs mb-4">
                  Add comprehensive documentation, code examples, callouts, and
                  links using the Notion-like rich editor.
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
        onSubmit={handleSaveContent}
      />

      {/* Drawer: Title / Description / Level */}
      <EditItemInfoDrawer
        isOpen={isInfoModalOpen}
        item={item}
        onClose={() => setIsInfoModalOpen(false)}
        onSubmit={handleSaveInfo}
      />

      {/* Delete Item Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={isDeleteModalOpen}
        title={`Delete "${item.title}"?`}
        description="Are you sure you want to delete this checklist item? This action will permanently remove its notes and media."
        confirmText="Delete item"
        cancelText="Cancel"
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={() => {
          setIsDeleteModalOpen(false);
          onDeleteItem?.(item.id);
        }}
      />

      {/* Ant Design Image Preview Group in View Mode */}
      {previewVisible && (
        <div style={{ display: "none" }}>
          <AntImage.PreviewGroup
            preview={{
              visible: previewVisible,
              current: currentImageIndex,
              onVisibleChange: (vis) => setPreviewVisible(vis),
              onChange: (current) => setCurrentImageIndex(current),
            }}
            items={allImages}
          >
            {allImages.map((src, idx) => (
              <AntImage key={idx} src={src} />
            ))}
          </AntImage.PreviewGroup>
        </div>
      )}

      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="absolute bottom-5 left-5 z-30 p-2.5 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all duration-200 border border-border/20 flex items-center justify-center animate-in fade-in zoom-in-75 cursor-pointer"
          title="Scroll to top"
          aria-label="Scroll to top"
        >
          <ChevronUp className="w-4 h-4 stroke-[2.5]" />
        </button>
      )}
    </div>
  );
}
