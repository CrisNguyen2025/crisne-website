"use client";

import React, { useState, useEffect } from "react";
import { X, Check, Edit3, AlignLeft, Sparkles } from "lucide-react";
import { ChecklistItem, RoadmapLevel } from "@/lib/roadmap/types";
import { cn } from "@/lib/utils";

interface EditItemInfoDrawerProps {
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

export function EditItemInfoDrawer({
  isOpen,
  item,
  onClose,
  onSubmit,
}: EditItemInfoDrawerProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState<RoadmapLevel>("core");
  const [error, setError] = useState("");

  // Smooth open / close lifecycle transitions
  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => {
        setIsMounted(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && item) {
      setTitle(item.title);
      setDescription(item.description);
      setLevel(item.level);
      setError("");
    }
  }, [isOpen, item]);

  // Handle ESC key to close drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isMounted || !item) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Please enter an item title.");
      return;
    }

    onSubmit(item.id, title.trim(), description.trim(), level, item.content);
    onClose();
  };

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

      {/* Drawer Sheet: width 50% on desktop, sliding top-to-bottom */}
      <div
        className={cn(
          "fixed inset-y-0 md:top-3 md:bottom-3 right-0 md:right-3 w-full md:w-1/2 bg-card border border-border/80 shadow-2xl rounded-none md:rounded-2xl flex flex-col justify-between overflow-hidden transform-gpu will-change-transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-10",
          isVisible ? "translate-y-0" : "-translate-y-full"
        )}
      >
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-border/50 bg-muted/15 flex items-center justify-between shrink-0 min-h-[57px]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0 shadow-2xs">
              <Edit3 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-foreground truncate">
                Edit Item Info
              </h3>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <span>Item</span>
                <span className="text-muted-foreground/40">•</span>
                <span className="font-mono text-[10px]">ID: {item.id}</span>
              </p>
            </div>
          </div>

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

        {/* Body Form */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-5"
        >
          {error && (
            <div className="p-3 text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Level
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setLevel("core")}
                className={`py-2 px-2 text-center rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  level === "core"
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-bold shadow-xs"
                    : "bg-background border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                🟢 Core
              </button>
              <button
                type="button"
                onClick={() => setLevel("intermediate")}
                className={`py-2 px-2 text-center rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  level === "intermediate"
                    ? "bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400 font-bold shadow-xs"
                    : "bg-background border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                🟡 Intermediate
              </button>
              <button
                type="button"
                onClick={() => setLevel("advanced")}
                className={`py-2 px-2 text-center rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  level === "advanced"
                    ? "bg-rose-500/10 border-rose-500/40 text-rose-600 dark:text-rose-400 font-bold shadow-xs"
                    : "bg-background border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                🔴 Advanced
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter item title..."
              autoFocus
              className="w-full text-sm font-semibold px-4 py-2.5 rounded-xl bg-background border border-border/70 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none text-foreground transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <AlignLeft className="w-3.5 h-3.5 text-primary" /> Summary
              description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Enter brief description explaining this concept..."
              className="w-full text-xs font-sans px-4 py-3 rounded-xl bg-background border border-border/70 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none text-foreground leading-relaxed resize-y transition-all"
            />
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-4 px-6 border-t border-border/40 bg-muted/10 shrink-0 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" /> Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
