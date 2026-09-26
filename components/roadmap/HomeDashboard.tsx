"use client";

import React, { useState } from "react";
import { Compass, ArrowRight, BookOpen, Sparkles, Plus } from "lucide-react";
import { RoadmapMeta, CreateRoadmapDto } from "@/lib/roadmap/types";
import { CreateTopicModal } from "./CreateTopicModal";

interface HomeDashboardProps {
  roadmaps: RoadmapMeta[];
  onSelectRoadmap: (slug: string) => void;
  onCreateRoadmap: (payload: CreateRoadmapDto) => Promise<void>;
  isCreateModalOpen?: boolean;
  onOpenCreateModal?: () => void;
  onCloseCreateModal?: () => void;
}

export function HomeDashboard({
  roadmaps,
  onSelectRoadmap,
  onCreateRoadmap,
  isCreateModalOpen: controlledIsOpen,
  onOpenCreateModal: controlledOnOpen,
  onCloseCreateModal: controlledOnClose,
}: HomeDashboardProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);

  const isModalOpen =
    controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const openModal = controlledOnOpen || (() => setInternalIsOpen(true));
  const closeModal = controlledOnClose || (() => setInternalIsOpen(false));

  return (
    <div className="flex-1 w-full h-full overflow-y-auto bg-background p-6 md:p-12 space-y-10 select-none">
      {/* ── Top Hero Banner centered ─────────────── */}
      <div className="w-full flex flex-col items-center text-center space-y-3 pb-8 border-b border-border/50">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Knowledge & Architecture Hub</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground max-w-3xl">
          Architecture Roadmaps & Topics
        </h1>
        <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-2xl">
          Structured system blueprints, engineering patterns, and comprehensive
          production guides across domains.
        </p>
      </div>

      {/* ── Available Topics Grid (Full Width) ───────────────────────────────────── */}
      <div className="w-full space-y-4">
        {/* Header row: Active Roadmaps on the left, Create Topic button on the right */}
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Compass className="w-4 h-4 text-primary" />
            <span>Active Roadmaps ({roadmaps.length})</span>
          </h2>

          <button
            type="button"
            onClick={openModal}
            className="px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Create Topic</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roadmaps.map((r) => {
            const code = (r.shortCode || r.slug.substring(0, 2)).toUpperCase();

            return (
              <div
                key={r.slug}
                onClick={() => onSelectRoadmap(r.slug)}
                className="group relative p-6 rounded-2xl border border-border/70 bg-card hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span
                      className={`w-10 h-10 rounded-xl bg-primary/10 text-primary font-black flex items-center justify-center p-1 border border-primary/20 shrink-0 text-center truncate ${
                        code.length <= 2
                          ? "text-sm"
                          : code.length === 3
                            ? "text-xs"
                            : "text-[10px]"
                      }`}
                      title={code}
                    >
                      {code}
                    </span>
                    <span className="text-[11px] font-semibold text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                      Open workspace
                      <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-foreground tracking-tight group-hover:text-primary transition-colors">
                    {r.title}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {r.description ||
                      "Explore architecture patterns, core foundations, and checklist items."}
                  </p>
                </div>

                <div className="pt-3 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="w-3 h-3 text-muted-foreground/70" />
                    Interactive View
                  </span>
                  <span className="font-semibold text-foreground/80 uppercase tracking-wider text-[10px]">
                    {r.slug}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Modal for Creating New Topic ────────────────────────────── */}
      <CreateTopicModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSubmit={onCreateRoadmap}
      />
    </div>
  );
}
