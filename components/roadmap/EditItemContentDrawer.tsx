"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  X,
  Check,
  FileText,
  Maximize2,
  Minimize2,
  Keyboard,
  Clock,
} from "lucide-react";
import { ChecklistItem, RoadmapLevel } from "@/lib/roadmap/types";
import { cn } from "@/lib/utils";

// Load Editor dynamically to optimize bundle and avoid SSR mismatches
const Editor = dynamic(() => import("@/components/ui/editor/Editor"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-3 bg-muted/10 p-8">
      <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      <p className="text-xs font-medium animate-pulse">
        Loading Notion editor...
      </p>
    </div>
  ),
});

interface EditItemContentDrawerProps {
  isOpen: boolean;
  item: (ChecklistItem & { layerTitle?: string; groupTitle?: string }) | null;
  onClose: () => void;
  onSubmit: (
    id: string,
    title: string,
    description: string,
    level?: RoadmapLevel,
    content?: string
  ) => void;
}

export function EditItemContentDrawer({
  isOpen,
  item,
  onClose,
  onSubmit,
}: EditItemContentDrawerProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [isExpandedWidth, setIsExpandedWidth] = useState(false);
  const [content, setContent] = useState("");

  // Smooth open / close lifecycle transitions
  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
      // Delay mounting heavy editor slightly to let slide animation complete at 60fps
      const timer = setTimeout(() => {
        setIsEditorReady(true);
      }, 160);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      };
    } else {
      setIsVisible(false);
      setIsEditorReady(false);
      const timer = setTimeout(() => {
        setIsMounted(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && item) {
      setContent(item.content || "");
    }
  }, [isOpen, item]);

  const handleSave = useCallback(() => {
    if (!item) return;
    onSubmit(item.id, item.title, item.description, item.level, content);
    onClose();
  }, [item, content, onSubmit, onClose]);

  // Handle ESC and Cmd+S / Ctrl+S shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        onClose();
      }

      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "Enter")) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, handleSave]);

  // Calculate text statistics
  const stats = useMemo(() => {
    if (!content) return { words: 0, characters: 0, readTimeMinutes: 0 };
    const plainText = content
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!plainText) return { words: 0, characters: 0, readTimeMinutes: 0 };
    const words = plainText.split(" ").filter(Boolean).length;
    const characters = plainText.length;
    const readTimeMinutes = Math.max(1, Math.ceil(words / 200));
    return { words, characters, readTimeMinutes };
  }, [content]);

  if (!isMounted || !item) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 bg-black/45 transition-opacity duration-300 ease-out",
          isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full">
        {/* Drawer Panel slide-in from right with GPU hardware acceleration */}
        <div
          className={cn(
            "w-screen bg-card border-l border-border shadow-2xl flex flex-col justify-between transform-gpu will-change-transform transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            isExpandedWidth
              ? "max-w-5xl xl:max-w-6xl 2xl:max-w-7xl"
              : "max-w-2xl lg:max-w-3xl xl:max-w-4xl",
            isVisible ? "translate-x-0" : "translate-x-full"
          )}
        >
          {/* Header */}
          <div className="px-5 md:px-7 py-3.5 border-b border-border/50 shrink-0 bg-muted/15 flex items-center justify-between gap-4">
            <div className="min-w-0 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0 shadow-2xs">
                <FileText className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-sm md:text-base text-foreground truncate">
                {item.title}
              </h3>
            </div>

            {/* Header Actions: Toggle Width & Close */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setIsExpandedWidth(!isExpandedWidth)}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer hidden md:flex items-center justify-center"
                title={isExpandedWidth ? "Collapse width" : "Expand width"}
                aria-label="Toggle width"
              >
                {isExpandedWidth ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer flex items-center justify-center"
                title="Close (Esc)"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body: Full-height Notion Editor */}
          <div className="flex-1 flex flex-col min-h-0 bg-background overflow-y-auto">
            <div className="flex-1 flex flex-col p-4 md:p-5 min-h-0">
              {isEditorReady ? (
                <Editor
                  value={content}
                  onChange={(val) => setContent(val)}
                  namespace="RoadmapItemContentDrawerEditor"
                  showTopbar={false}
                  fillHeight={true}
                  placeholder="Write document content here (supports Headings, Code, Callout, Tables, Lists)..."
                  contentEditableClassName="py-2 transition-all duration-200 outline-none min-h-[480px]  max-w-full px-3"
                />
              ) : (
                <div className="flex-1 w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-3 bg-muted/5 p-8 rounded-xl border border-border/50">
                  <div className="w-7 h-7 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                  <p className="text-xs font-medium text-muted-foreground animate-pulse">
                    Loading Notion editor...
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions & Stats */}
          <div className="flex items-center justify-between px-5 md:px-7 py-3 border-t border-border/50 bg-muted/15 shrink-0">
            {/* Left: Document stats & Shortcut hints */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground min-w-0">
              <div className="flex items-center gap-1.5 font-medium">
                <span>{stats.words} words</span>
                <span className="text-muted-foreground/30">•</span>
                <span>{stats.characters} chars</span>
              </div>

              {stats.words > 0 && (
                <div className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground/80">
                  <Clock className="w-3 h-3 text-muted-foreground/60" />
                  <span>~{stats.readTimeMinutes} min read</span>
                </div>
              )}

              <div className="hidden md:flex items-center gap-1 text-[11px] text-muted-foreground/60 pl-2 border-l border-border/40">
                <Keyboard className="w-3 h-3" />
                <span>
                  <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[10px] font-mono">
                    ⌘/Ctrl
                  </kbd>{" "}
                  +{" "}
                  <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[10px] font-mono">
                    S
                  </kbd>{" "}
                  to save
                </span>
              </div>
            </div>

            {/* Right: Action buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-98"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" /> Save content
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
