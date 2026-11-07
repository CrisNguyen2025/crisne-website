"use client";

import React, { useState, useEffect, Suspense, useCallback, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { useQueryState, parseAsString, debounce } from "nuqs";
import { Home as HomeIcon, Layers, Sparkles, UserRound, Plus, X } from "lucide-react";
import { useRoadmap } from "@/hooks/use-roadmap";
import { useCanWrite } from "@/hooks/use-can-write";
import { MasterPanel } from "@/components/roadmap/MasterPanel";
import { DetailPanel } from "@/components/roadmap/DetailPanel";
import { RoadmapMap } from "@/components/roadmap/RoadmapMap";
import { RoadmapView } from "@/components/roadmap/ViewToggle";
import { CreateItemModal } from "@/components/roadmap/CreateItemModal";
import { CreateTopicModal } from "@/components/roadmap/CreateTopicModal";
import { HomeDashboard } from "@/components/roadmap/HomeDashboard";
import { GlobalPageLoader } from "@/components/roadmap/GlobalPageLoader";
import { KnowledgeTriageDrawer } from "@/components/roadmap/KnowledgeTriageDrawer";
import { Sheet } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { fetchTriageItems } from "@/logic/roadmap/knowledgeTriageService";

import {
  RoadmapMeta,
  CreateRoadmapDto,
} from "@/lib/roadmap/types";
import * as roadmapService from "@/logic/roadmap/roadmapService";
import { slugify, cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

const VIEW_STORAGE_KEY = "roadmap:view";

function readSavedView(): RoadmapView | null {
  try {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    return saved === "map" || saved === "list" ? saved : null;
  } catch {
    return null;
  }
}

function subscribeView(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function RoadmapWorkspace() {
  const { toast } = useToast();
  const canWrite = useCanWrite();

  // nuqs query state for ?topic and ?item (clean URL: ?topic=ai-architecture&item=...)
  // If topic is null/empty -> Home view. If topic exists -> Topic Roadmap view.
  const [topic, setTopic] = useQueryState("topic", parseAsString);
  // The section (mục) open in the list; mirrored in the URL so the assistant knows which section is in view
  const [sectionParam, setSectionParam] = useQueryState("section", parseAsString);
  const [item, setItem] = useQueryState(
    "item",
    parseAsString.withOptions({
      shallow: true,
      limitUrlUpdates: debounce(200),
    })
  );

  const [availableRoadmaps, setAvailableRoadmaps] = useState<(RoadmapMeta & { _count?: { items: number } })[]>([]);
  const [isRoadmapsLoading, setIsRoadmapsLoading] = useState<boolean>(true);

  // List or map, remembered per browser. The server renders "list"; the saved view is applied after hydration
  const savedView = useSyncExternalStore(subscribeView, readSavedView, () => null);
  const [pickedView, setPickedView] = useState<RoadmapView | null>(null);
  // A link to a lesson (?item=) opens the reader, whichever view was remembered
  const view: RoadmapView = pickedView ?? (item ? "list" : savedView) ?? "list";

  const handleViewChange = (nextView: RoadmapView) => {
    setPickedView(nextView);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, nextView);
    } catch {}
  };

  // Mobile reader open state
  const [isReaderOpen, setIsReaderOpen] = useState<boolean>(() => Boolean(item));
  const [isTopicsSheetOpen, setIsTopicsSheetOpen] = useState(false);

  const refreshRoadmaps = useCallback(() => {
    roadmapService
      .fetchAllRoadmaps()
      .then((data) => {
        if (data.roadmaps) {
          setAvailableRoadmaps(data.roadmaps);
        }
      })
      .catch((err) => console.error("Failed to load roadmaps list:", err))
      .finally(() => setIsRoadmapsLoading(false));
  }, []);

  // Real-time refresh when Roadmap Assistant executes CUD tools
  useEffect(() => {
    const handleUpdate = () => {
      refreshRoadmaps();
    };
    window.addEventListener("roadmap:updated", handleUpdate);
    return () => window.removeEventListener("roadmap:updated", handleUpdate);
  }, [refreshRoadmaps]);

  // Clean up any stale/legacy ?view param from address bar if present
  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("view")) {
        url.searchParams.delete("view");
        window.history.replaceState(
          {},
          "",
          url.pathname + (url.search ? url.search : "")
        );
      }
    }
  }, []);

  // Fetch list of roadmaps on mount for sidebar & switcher
  useEffect(() => {
    refreshRoadmaps();
  }, [refreshRoadmaps]);

  const currentView: "home" | "roadmap" = topic ? "roadmap" : "home";
  // Home opens no topic: nothing to load, so no request for a slug that may not exist
  const activeSlug: string = topic || "";

  const {
    roadmapMeta,
    items,
    sections,
    sectionGroups,
    activeItemId,
    activeItem,
    selectedSection,
    stats,
    isLoading,
    isError,
    isNotFound,
    setSelectedSection,
    editRoadmap,
    addItem,
    editItem,
    changeItemStatus,
    deleteItem,
    renameSection,
    dissolveSection,
    updateNote,
    reorderItems,
    selectActiveItem,
  } = useRoadmap(activeSlug, item || undefined);

  // A topic deleted through the assistant (or an old link) is gone, not a connection error: back to Home
  useEffect(() => {
    if (!topic || !isNotFound) return;
    toast("This topic no longer exists.", "error");
    setTopic(null);
    setItem(null);
  }, [topic, isNotFound, toast, setTopic, setItem]);

  // Mirror the selected section into ?section= so the assistant knows which section is open
  useEffect(() => {
    const next = selectedSection === "all" || selectedSection === null ? null : selectedSection;
    if (next !== sectionParam) setSectionParam(next);
  }, [selectedSection, sectionParam, setSectionParam]);

  // Modal states
  const [isCreateTopicOpen, setIsCreateTopicOpen] = useState(false);
  const [isCreateItemOpen, setIsCreateItemOpen] = useState(false);
  const [isTriageDrawerOpen, setIsTriageDrawerOpen] = useState(false);
  const [triageBadgeCount, setTriageBadgeCount] = useState<number>(0);
  // The section a new lesson opens in; null is the group of lessons outside any section
  const [targetSection, setTargetSection] = useState<string | null>(null);

  const refreshTriageBadge = useCallback(() => {
    fetchTriageItems()
      .then((items) => {
        const pendingCount = items.filter((i) => i.status === "PENDING").length;
        setTriageBadgeCount(pendingCount);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshTriageBadge();
    const handleTriageUpdate = () => {
      refreshTriageBadge();
    };
    window.addEventListener("roadmap:triage-updated", handleTriageUpdate);
    return () => window.removeEventListener("roadmap:triage-updated", handleTriageUpdate);
  }, [refreshTriageBadge]);

  const handleOpenCreateItem = (section: string | null) => {
    setTargetSection(section);
    setIsCreateItemOpen(true);
  };

  const handleSelectRoadmap = (slug: string) => {
    setSelectedSection("all");
    setTopic(slug);
    setItem(null);
    setIsReaderOpen(false);
  };

  const handleSelectHome = () => {
    setTopic(null);
    setItem(null);
    setIsReaderOpen(false);
  };

  const handleSelectItem = (id: string) => {
    selectActiveItem(id);
    setIsReaderOpen(true);
    const found = items.find((i) => i.id === id);
    setItem(found ? slugify(found.title) : id);
  };

  const handleCreateRoadmap = async (payload: CreateRoadmapDto) => {
    const { roadmap: created } = await roadmapService.createRoadmap(payload);
    refreshRoadmaps();
    if (created?.slug) {
      setSelectedSection("all");
      setTopic(created.slug);
      setItem(null);
      setIsReaderOpen(false);
    }
  };

  const handleDeleteRoadmap = async (slugToDelete: string) => {
    try {
      await roadmapService.deleteRoadmapBySlug(slugToDelete);
      const remaining = availableRoadmaps.filter(
        (r) => r.slug !== slugToDelete
      );
      setAvailableRoadmaps(remaining);
      if (remaining.length > 0) {
        setSelectedSection("all");
        setTopic(remaining[0].slug);
        setItem(null);
      } else {
        setTopic(null);
        setItem(null);
      }
      setIsReaderOpen(false);
    } catch (err) {
      console.error("Failed to delete roadmap:", err);
      toast("Failed to delete topic. Please try again.", "error");
    }
  };

  // The topic's lessons in page order, for prev and next
  const flatLessons = useMemo(() => items.map((it) => ({ id: it.id, title: it.title })), [items]);

  const currentLessonIndex = flatLessons.findIndex((l) => l.id === activeItemId);
  const prevLesson = currentLessonIndex > 0 ? flatLessons[currentLessonIndex - 1] : undefined;
  const nextLesson =
    currentLessonIndex >= 0 && currentLessonIndex < flatLessons.length - 1
      ? flatLessons[currentLessonIndex + 1]
      : undefined;

  return (
    <div className="flex h-dvh flex-col md:flex-row bg-background overflow-hidden">
      {/* Global loading overlay */}
      <GlobalPageLoader />

      {/* Main Content Area */}
      <div className="flex-1 h-full overflow-hidden flex flex-col">
        {/* Desktop top bar: Home, topic switch, and the Owner's actions (replaces the left sidebar, ADR-0009) */}
        <header className="hidden md:flex shrink-0 items-center gap-3 border-b border-border bg-card/80 px-4 py-2.5 backdrop-blur-sm">
          <button
            type="button"
            onClick={handleSelectHome}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              currentView === "home" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <HomeIcon className="size-4" />
            <span>Trang chủ</span>
          </button>

          <select
            aria-label="Chọn topic"
            value={currentView === "roadmap" ? activeSlug : ""}
            onChange={(e) => e.target.value && handleSelectRoadmap(e.target.value)}
            disabled={isRoadmapsLoading}
            className="max-w-[16rem] rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
          >
            <option value="" disabled>
              {isRoadmapsLoading ? "Đang tải…" : "Chọn topic"}
            </option>
            {availableRoadmaps.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.title}
              </option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-1.5">
            {canWrite && (
              <>
                <button
                  type="button"
                  onClick={() => setIsCreateTopicOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <Plus className="size-4" />
                  <span>Tạo topic</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsTriageDrawerOpen(true)}
                  className="relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-[#C2410C] cursor-pointer"
                >
                  <Sparkles className="size-4" />
                  <span>Triage</span>
                  {triageBadgeCount > 0 && (
                    <span className="flex size-4 items-center justify-center rounded-full bg-[#C2410C] text-[0.5625rem] font-bold text-white">
                      {triageBadgeCount}
                    </span>
                  )}
                </button>
              </>
            )}
            <Link
              href="/portfolio"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <UserRound className="size-4" />
              <span>Portfolio</span>
            </Link>
            <ThemeToggle className="size-8 rounded-lg border border-border/60 bg-card hover:bg-muted text-foreground" />
          </div>
        </header>
        {currentView === "home" ? (
          <div
            key="view-home"
            className="w-full h-full flex-1 overflow-hidden animate-in fade-in-50 duration-200"
          >
            <HomeDashboard
              roadmaps={availableRoadmaps}
              isLoading={isRoadmapsLoading}
              onSelectRoadmap={handleSelectRoadmap}
            />
          </div>
        ) : view === "map" ? (
          <div className="flex-1 w-full h-full overflow-hidden">
            <RoadmapMap
              sectionGroups={sectionGroups}
              currentRoadmap={roadmapMeta}
              stats={stats}
              activeItemId={activeItemId}
              isLoading={isLoading}
              view={view}
              onViewChange={handleViewChange}
              onSelectItem={(id) => {
                handleSelectItem(id);
                handleViewChange("list");
                setIsReaderOpen(true);
              }}
            />
          </div>
        ) : (
          <main className="flex-1 w-full h-full overflow-hidden relative flex">
            {/* Master Panel */}
            <div
              className={cn(
                "h-full overflow-hidden flex-col border-r border-border/60 bg-background/50 backdrop-blur-sm shrink-0",
                isReaderOpen ? "hidden lg:flex lg:w-80 xl:w-96" : "flex w-full lg:w-80 xl:w-96"
              )}
            >
              <MasterPanel
                sectionGroups={sectionGroups}
                activeItemId={activeItemId}
                selectedSection={selectedSection}
                onSelectSection={setSelectedSection}
                stats={stats}
                currentRoadmap={roadmapMeta}
                canWrite={canWrite}
                view={view}
                onViewChange={handleViewChange}
                onEditRoadmap={async (title, description) => {
                  await editRoadmap(title, description);
                  setAvailableRoadmaps((prev) =>
                    prev.map((r) => (r.slug === activeSlug ? { ...r, title, description } : r))
                  );
                }}
                onDeleteRoadmap={handleDeleteRoadmap}
                isLoading={isLoading}
                isError={isError}
                onSelectItem={(id) => {
                  handleSelectItem(id);
                  setIsReaderOpen(true);
                }}
                onReorderItems={reorderItems}
                onOpenCreateItem={handleOpenCreateItem}
                onRenameSection={renameSection}
                onDissolveSection={dissolveSection}
              />
            </div>

            {/* Detail Panel (Reader) */}
            <div
              className={cn(
                "min-w-0 h-full overflow-hidden flex-col bg-card",
                isReaderOpen ? "flex flex-1" : "hidden lg:flex lg:flex-1"
              )}
            >
              <DetailPanel
                item={activeItem}
                sections={sections.filter((s): s is string => s !== null)}
                isLoading={isLoading}
                canWrite={canWrite}
                prevLesson={prevLesson}
                nextLesson={nextLesson}
                onSelectPrev={() => prevLesson && handleSelectItem(prevLesson.id)}
                onSelectNext={() => nextLesson && handleSelectItem(nextLesson.id)}
                onBack={() => {
                  setIsReaderOpen(false);
                  setItem(null);
                }}
                onUpdateNote={updateNote}
                onEditItem={editItem}
                onChangeStatus={changeItemStatus}
                onDeleteItem={deleteItem}
              />
            </div>
          </main>
        )}
      </div>


      {/* Mobile Topics Sheet */}
      <Sheet
        open={isTopicsSheetOpen}
        onClose={() => setIsTopicsSheetOpen(false)}
        side="bottom"
        label="Topics list"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Topics</h3>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle className="size-8 rounded-lg border border-border/60 bg-card hover:bg-muted text-foreground" />
            <button
              type="button"
              onClick={() => setIsTopicsSheetOpen(false)}
              className="rounded-lg p-1 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-2">
          {availableRoadmaps.map((r) => {
            const isSelected = currentView === "roadmap" && activeSlug === r.slug;
            return (
              <button
                key={r.slug}
                type="button"
                onClick={() => {
                  handleSelectRoadmap(r.slug);
                  setIsTopicsSheetOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl p-3 text-left border transition-colors cursor-pointer",
                  isSelected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-foreground hover:border-primary/50"
                )}
              >
                <div>
                  <p className="text-sm font-medium">{r.title}</p>
                  {r.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{r.description}</p>
                  )}
                </div>
                <span className="text-xs font-mono font-semibold uppercase text-muted-foreground">
                  {r._count?.items ?? 0} bài
                </span>
              </button>
            );
          })}
          {canWrite && (
            <button
              type="button"
              onClick={() => {
                setIsTopicsSheetOpen(false);
                setIsCreateTopicOpen(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border p-3 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer"
            >
              <Plus className="size-4" />
              <span>Create new topic</span>
            </button>
          )}
        </div>
      </Sheet>

      {/* Modals for Dynamic Data Creation */}
      <CreateTopicModal
        isOpen={isCreateTopicOpen}
        onClose={() => setIsCreateTopicOpen(false)}
        onSubmit={handleCreateRoadmap}
      />

      <CreateItemModal
        isOpen={isCreateItemOpen}
        sections={sections.filter((s): s is string => s !== null)}
        targetSection={targetSection}
        onClose={() => setIsCreateItemOpen(false)}
        onSubmit={(section, title, description) => addItem(section, title, description)}
      />

      {/* Knowledge Triage Drawer */}
      <KnowledgeTriageDrawer
        isOpen={isTriageDrawerOpen}
        onClose={() => {
          setIsTriageDrawerOpen(false);
          refreshTriageBadge();
        }}
        onRoadmapUpdated={() => {
          refreshRoadmaps();
          refreshTriageBadge();
        }}
      />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<GlobalPageLoader />}>
      <RoadmapWorkspace />
    </Suspense>
  );
}
