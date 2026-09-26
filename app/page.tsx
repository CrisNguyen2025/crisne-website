"use client";

import React, { useState, useEffect, Suspense, useCallback } from "react";
import { useQueryState, parseAsString, debounce } from "nuqs";
import { useRoadmap } from "@/hooks/use-roadmap";
import { MasterPanel } from "@/components/roadmap/MasterPanel";
import { DetailPanel } from "@/components/roadmap/DetailPanel";
import { CreateLayerModal } from "@/components/roadmap/CreateLayerModal";
import { CreateItemModal } from "@/components/roadmap/CreateItemModal";
import { CreateTopicModal } from "@/components/roadmap/CreateTopicModal";
import { CompactSidebar } from "@/components/roadmap/CompactSidebar";
import { HomeDashboard } from "@/components/roadmap/HomeDashboard";
import { GlobalPageLoader } from "@/components/roadmap/GlobalPageLoader";
import {
  RoadmapLevel,
  RoadmapMeta,
  CreateRoadmapDto,
} from "@/lib/roadmap/types";
import * as roadmapService from "@/logic/roadmap/roadmapService";
import { slugify } from "@/lib/utils";

function RoadmapWorkspace() {
  // nuqs query state for ?topic and ?item (clean URL: ?topic=ai-architecture&item=...)
  // If topic is null/empty -> Home view. If topic exists -> Topic Roadmap view.
  const [topic, setTopic] = useQueryState("topic", parseAsString);
  const [item, setItem] = useQueryState(
    "item",
    parseAsString.withOptions({
      shallow: true,
      limitUrlUpdates: debounce(200),
    })
  );

  const [availableRoadmaps, setAvailableRoadmaps] = useState<RoadmapMeta[]>([]);

  const refreshRoadmaps = useCallback(() => {
    roadmapService
      .fetchAllRoadmaps()
      .then((data) => {
        if (data.roadmaps) {
          setAvailableRoadmaps(data.roadmaps);
        }
      })
      .catch((err) => console.error("Failed to load roadmaps list:", err));
  }, []);

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
    setSelectedLayerId,
    addLayer,
    editLayer,
    deleteLayer,
    editRoadmap,
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

  // Modal states
  const [isCreateTopicOpen, setIsCreateTopicOpen] = useState(false);
  const [isCreateLayerOpen, setIsCreateLayerOpen] = useState(false);
  const [isCreateItemOpen, setIsCreateItemOpen] = useState(false);
  const [targetLayerId, setTargetLayerId] = useState<string>("");
  const [targetLevel, setTargetLevel] = useState<RoadmapLevel>("core");

  const handleOpenCreateItem = (layerId: string, level: RoadmapLevel) => {
    setTargetLayerId(layerId);
    setTargetLevel(level);
    setIsCreateItemOpen(true);
  };

  const handleSelectRoadmap = (slug: string) => {
    setSelectedLayerId("all");
    setTopic(slug);
    setItem(null);
  };

  const handleSelectHome = () => {
    setTopic(null);
    setItem(null);
  };

  const handleSelectItem = (id: string) => {
    selectActiveItem(id);
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
    } catch (err) {
      console.error("Failed to delete roadmap:", err);
      alert("Failed to delete topic. Please try again.");
    }
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Global loading overlay — shows on initial load / F5, fades after hydration */}
      <GlobalPageLoader />

      {/* 80px Compact Sidebar on the Left */}
      <CompactSidebar
        currentView={currentView}
        currentSlug={activeSlug}
        roadmaps={availableRoadmaps}
        onSelectHome={handleSelectHome}
        onSelectRoadmap={handleSelectRoadmap}
        onOpenCreateRoadmap={() => setIsCreateTopicOpen(true)}
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
              onSelectRoadmap={handleSelectRoadmap}
              onCreateRoadmap={handleCreateRoadmap}
              isCreateModalOpen={isCreateTopicOpen}
              onOpenCreateModal={() => setIsCreateTopicOpen(true)}
              onCloseCreateModal={() => setIsCreateTopicOpen(false)}
            />
          </div>
        ) : (
          <main
            className="flex-1 w-full h-full overflow-hidden relative flex"
          >
            {/* Fixed 400px Left column (Master Panel) */}
            <div className="w-[400px] shrink-0 h-full overflow-hidden flex flex-col border-r border-border/60 bg-background/50 backdrop-blur-sm">
              <MasterPanel
                layers={filteredLayers}
                allLayers={layers}
                activeItemId={activeItemId}
                selectedLayerId={selectedLayerId}
                stats={stats}
                currentRoadmap={roadmapMeta}
                roadmaps={availableRoadmaps}
                onRoadmapChange={handleSelectRoadmap}
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
                onSelectItem={handleSelectItem}
                onReorderGroupItems={updateGroupItems}
                onOpenCreateLayer={() => setIsCreateLayerOpen(true)}
                onOpenCreateItem={handleOpenCreateItem}
                onAddGroup={addGroup}
                onEditGroup={editGroup}
                onDeleteGroup={deleteGroup}
                onEditLayer={editLayer}
                onDeleteLayer={deleteLayer}
                onDeleteItem={deleteItem}
              />
            </div>

            {/* Flexible Right column (Detail Panel) */}
            <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col bg-white/80">
              <DetailPanel
                item={activeItem}
                isLoading={isLoading}
                onUpdateNote={updateNote}
                onEditItem={editItem}
                onDeleteItem={deleteItem}
              />
            </div>
          </main>
        )}
      </div>

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
        targetLevel={targetLevel}
        onClose={() => setIsCreateItemOpen(false)}
        onSubmit={addItem}
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
