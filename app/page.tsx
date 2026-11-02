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
import { CreateLayerModal } from "@/components/roadmap/CreateLayerModal";
import { CreateItemModal } from "@/components/roadmap/CreateItemModal";
import { CreateTopicModal } from "@/components/roadmap/CreateTopicModal";
import { CompactSidebar } from "@/components/roadmap/CompactSidebar";
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
  const [layerParam, setLayerParam] = useQueryState("layer", parseAsString);
  const [item, setItem] = useQueryState(
    "item",
    parseAsString.withOptions({
      shallow: true,
      limitUrlUpdates: debounce(200),
    })
  );

  const [availableRoadmaps, setAvailableRoadmaps] = useState<RoadmapMeta[]>([]);
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
  const activeSlug: string = topic || "ai-architecture";

  const {
    roadmapMeta,
    layers,
    filteredLayers,
    activeItemId,
    activeItem,
    selectedLayerId,
    stats,
    isLoading,
    isError,
    isNotFound,
    setSelectedLayerId,
    addLayer,
    editLayer,
    deleteLayer,
    editRoadmap,
    toggleRoadmapLock,
    addGroup,
    editGroup,
    deleteGroup,
    addItem,
    editItem,
    deleteItem,
    updateNote,
    selectActiveItem,
    updateGroupItems,
  } = useRoadmap(activeSlug, item || undefined);

  // A topic deleted through the assistant (or an old link) is gone, not a connection error: back to Home
  useEffect(() => {
    if (!topic || !isNotFound) return;
    toast("This topic no longer exists.", "error");
    setTopic(null);
    setItem(null);
  }, [topic, isNotFound, toast, setTopic, setItem]);

  // Mirror the selected layer into ?layer= so the assistant knows which layer is open
  useEffect(() => {
    const next = selectedLayerId === "all" ? null : selectedLayerId;
    if (next !== layerParam) setLayerParam(next);
  }, [selectedLayerId, layerParam, setLayerParam]);

  // Modal states
  const [isCreateTopicOpen, setIsCreateTopicOpen] = useState(false);
  const [isCreateLayerOpen, setIsCreateLayerOpen] = useState(false);
  const [isCreateItemOpen, setIsCreateItemOpen] = useState(false);
  const [isTriageDrawerOpen, setIsTriageDrawerOpen] = useState(false);
  const [triageBadgeCount, setTriageBadgeCount] = useState<number>(0);
  const [targetLayerId, setTargetLayerId] = useState<string>("");
  const [targetGroupId, setTargetGroupId] = useState<string>("");

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

  const handleOpenCreateItem = (layerId: string, groupId?: string) => {
    setTargetLayerId(layerId);
    setTargetGroupId(groupId ?? "");
    setIsCreateItemOpen(true);
  };

  const handleSelectRoadmap = (slug: string) => {
    setSelectedLayerId("all");
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
    for (const layer of layers) {
      for (const group of layer.groups) {
        const found = group.items.find((i) => i.id === id);
        if (found) {
          setItem(found.slug || slugify(found.title));
          return;
        }
      }
    }
    setItem(id);
  };

  const handleCreateRoadmap = async (payload: CreateRoadmapDto) => {
    const { roadmap: created } = await roadmapService.createRoadmap(payload);
    refreshRoadmaps();
    if (created?.slug) {
      setSelectedLayerId("all");
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
        setSelectedLayerId("all");
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

  // Compute flattened lessons list to provide prev and next
  const flatLessons = useMemo(() => {
    const list: Array<{ id: string; title: string }> = [];
    for (const layer of layers) {
      for (const group of layer.groups) {
        for (const it of group.items) {
          list.push({ id: it.id, title: it.title });
        }
      }
    }
    return list;
  }, [layers]);

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

      {/* Desktop 80px Compact Sidebar on the Left */}
      <CompactSidebar
        className="hidden md:flex"
        currentView={currentView}
        currentSlug={activeSlug}
        roadmaps={availableRoadmaps}
        isLoading={isRoadmapsLoading}
        onSelectHome={handleSelectHome}
        onSelectRoadmap={handleSelectRoadmap}
        onOpenCreateRoadmap={canWrite ? () => setIsCreateTopicOpen(true) : undefined}
        onOpenTriage={canWrite ? () => setIsTriageDrawerOpen(true) : undefined}
        triageBadgeCount={triageBadgeCount}
      />

      {/* Main Content Area */}
      <div className="flex-1 h-full overflow-hidden flex flex-col">
        {currentView === "home" ? (
          <div
            key="view-home"
            className="w-full h-full flex-1 overflow-hidden animate-in fade-in-50 duration-200"
          >
            <HomeDashboard
              roadmaps={availableRoadmaps}
              isLoading={isRoadmapsLoading}
              onSelectRoadmap={handleSelectRoadmap}
              onOpenCreateModal={() => setIsCreateTopicOpen(true)}
            />
          </div>
        ) : view === "map" ? (
          <div className="flex-1 w-full h-full overflow-hidden">
            <RoadmapMap
              layers={filteredLayers}
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
                layers={filteredLayers}
                allLayers={layers}
                activeItemId={activeItemId}
                selectedLayerId={selectedLayerId}
                stats={stats}
                currentRoadmap={roadmapMeta}
                canWrite={canWrite}
                view={view}
                onViewChange={handleViewChange}
                onEditRoadmap={async (title, shortCode, description) => {
                  await editRoadmap(title, shortCode, description);
                  setAvailableRoadmaps((prev) =>
                    prev.map((r) =>
                      r.slug === activeSlug
                        ? { ...r, title, shortCode, description }
                        : r
                    )
                  );
                }}
                onDeleteRoadmap={handleDeleteRoadmap}
                isLoading={isLoading}
                isError={isError}
                onLayerChange={setSelectedLayerId}
                onSelectItem={(id) => {
                  handleSelectItem(id);
                  setIsReaderOpen(true);
                }}
                onReorderGroupItems={updateGroupItems}
                onOpenCreateLayer={() => setIsCreateLayerOpen(true)}
                onOpenCreateItem={handleOpenCreateItem}
                onAddGroup={addGroup}
                onEditGroup={editGroup}
                onDeleteGroup={deleteGroup}
                onEditLayer={editLayer}
                onDeleteLayer={deleteLayer}
                onToggleLock={toggleRoadmapLock}
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
                onDeleteItem={deleteItem}
              />
            </div>
          </main>
        )}
      </div>

      {/* Mobile Bottom Navigation (Hidden when reading lesson to maximize viewport) */}
      <nav
        className={cn(
          "shrink-0 flex items-center justify-around border-t border-border bg-card/90 backdrop-blur-md px-2 py-2 md:hidden z-20 pb-[max(0.5rem,env(safe-area-inset-bottom))] transition-all duration-200",
          isReaderOpen && "hidden"
        )}
      >
        <button
          type="button"
          onClick={handleSelectHome}
          className={cn(
            "flex flex-col items-center gap-1 px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
            currentView === "home" ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <HomeIcon className="size-4" />
          <span>Home</span>
        </button>

        <button
          type="button"
          onClick={() => setIsTopicsSheetOpen(true)}
          className={cn(
            "flex flex-col items-center gap-1 px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
            currentView === "roadmap" ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Layers className="size-4" />
          <span>Topics</span>
        </button>

        {canWrite && (
          <button
            type="button"
            onClick={() => setIsTriageDrawerOpen(true)}
            className="relative flex flex-col items-center gap-1 px-3 py-1 text-xs font-medium text-muted-foreground hover:text-[#C2410C] transition-colors cursor-pointer"
          >
            <div className="relative">
              <Sparkles className="size-4" />
              {triageBadgeCount > 0 && (
                <span className="absolute -top-1 -right-2 flex size-3.5 items-center justify-center rounded-full bg-[#C2410C] text-[0.5625rem] font-bold text-white">
                  {triageBadgeCount}
                </span>
              )}
            </div>
            <span>Triage</span>
          </button>
        )}

        <Link
          href="/portfolio"
          className="flex flex-col items-center gap-1 px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <UserRound className="size-4" />
          <span>Portfolio</span>
        </Link>
      </nav>

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
                  {r.shortCode || r.slug.slice(0, 2)}
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

      <CreateLayerModal
        isOpen={isCreateLayerOpen}
        onClose={() => setIsCreateLayerOpen(false)}
        onSubmit={addLayer}
      />

      <CreateItemModal
        isOpen={isCreateItemOpen}
        layers={layers}
        targetLayerId={targetLayerId}
        targetGroupId={targetGroupId}
        onClose={() => setIsCreateItemOpen(false)}
        onSubmit={addItem}
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
