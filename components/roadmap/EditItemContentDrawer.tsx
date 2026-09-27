"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  X,
  Check,
  FileText,
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
  onSubmit: (id: string, content: string) => Promise<void> | void;
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
  const [isSaving, setIsSaving] = useState(false);
  const [content, setContent] = useState("");
  const contentRef = React.useRef("");

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
      setIsSaving(false);
      const timer = setTimeout(() => {
        setIsMounted(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Synchronize initial content ONLY once when drawer opens for a given item
  const itemId = item?.id;
  useEffect(() => {
    if (isOpen && item) {
      const initialContent = item.content || "";
      setContent(initialContent);
      contentRef.current = initialContent;
    }
  }, [isOpen, itemId]);

  const handleContentChange = useCallback((val: string) => {
    contentRef.current = val;
    setContent(val);
  }, []);

  const handleSave = useCallback(async () => {
    if (!item || isSaving) return;
    try {
      setIsSaving(true);
      await onSubmit(item.id, contentRef.current);
      onClose();
    } catch (err) {
      console.error("Failed to save content in drawer:", err);
    } finally {
      setIsSaving(false);
    }
  }, [item, isSaving, onSubmit, onClose]);

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
      {/* Global Backdrop that dims and blurs the entire screen (including left panel) */}
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-300 ease-out",
          isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      />

      {/* Drawer Sheet: width 60% on desktop, sliding right-to-left */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 w-full md:w-[60%] bg-card border-l border-border shadow-2xl flex flex-col justify-between overflow-hidden transform-gpu will-change-transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-10",
          isVisible ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="px-5 md:px-7 py-3.5 border-b border-border/50 shrink-0 bg-muted/15 flex items-center justify-between gap-4 min-h-[57px]">
          <div className="min-w-0 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0 shadow-2xs">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex flex-col">
              <h3 className="font-bold text-sm md:text-base text-foreground truncate">
                {item.title}
              </h3>
              <span className="text-[11px] text-muted-foreground truncate">
                Editing content
              </span>
            </div>
          </div>

          {/* Header Actions: Close */}
          <div className="flex items-center gap-1 shrink-0">
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
                onChange={handleContentChange}
                namespace="RoadmapItemContentDrawerEditor"
                showTopbar={false}
                fillHeight={true}
                placeholder="Write document content here (supports Headings, Code, Callout, Tables, Lists)..."
                contentEditableClassName="py-2 transition-all duration-200 outline-none min-h-[480px] max-w-full px-3"
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
          {/* Left: Save button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-98 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Save content</span>
                </>
              )}
            </button>
          </div>

          {/* Right: Document stats & Shortcut hints */}
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
        </div>
      </div>
    </div>
  );
}
