"use client";

import React, { useState } from "react";
import { useRoadmap } from "@/hooks/use-roadmap";
import { ResizableLayout } from "@/components/roadmap/ResizableLayout";
import { MasterPanel } from "@/components/roadmap/MasterPanel";
import { DetailPanel } from "@/components/roadmap/DetailPanel";
import { CreateLayerModal } from "@/components/roadmap/CreateLayerModal";
import { CreateItemModal } from "@/components/roadmap/CreateItemModal";
import { GlobalPageLoader } from "@/components/roadmap/GlobalPageLoader";
import { RoadmapLevel } from "@/lib/roadmap/types";

export default function Home() {
  const {
    layers,
    filteredLayers,
    activeItemId,
    activeItem,
    selectedLayerId,
    stats,
    isLoaded,
    setSelectedLayerId,
    addLayer,
    editLayer,
    deleteLayer,
    addGroup,
    addItem,
    editItem,
    deleteItem,
    updateNote,
    selectActiveItem,
    updateGroupItems,
    resetToInitialData,
  } = useRoadmap();

  // Modal states
  const [isCreateLayerOpen, setIsCreateLayerOpen] = useState(false);
  const [isCreateItemOpen, setIsCreateItemOpen] = useState(false);
  const [targetLayerId, setTargetLayerId] = useState<string>("");
  const [targetLevel, setTargetLevel] = useState<RoadmapLevel>("core");

  const handleOpenCreateItem = (layerId: string, level: RoadmapLevel) => {
    setTargetLayerId(layerId);
    setTargetLevel(level);
    setIsCreateItemOpen(true);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
      {/* Global loading overlay — shows on initial load / F5, fades after hydration */}
      <GlobalPageLoader />

      {/* Main Split-Pane Workspace (Full Screen, No bulky header) */}
      <main className="flex-1 w-full h-full overflow-hidden relative">
        <ResizableLayout
          defaultRatio={0.38}
          minLeftWidth={320}
          maxLeftWidthRatio={0.6}
          leftContent={
            <MasterPanel
              layers={filteredLayers}
              allLayers={layers}
              activeItemId={activeItemId}
              selectedLayerId={selectedLayerId}
              stats={stats}
              isLoading={!isLoaded}
              onLayerChange={setSelectedLayerId}
              onSelectItem={selectActiveItem}
              onReorderGroupItems={updateGroupItems}
              onOpenCreateLayer={() => setIsCreateLayerOpen(true)}
              onOpenCreateItem={handleOpenCreateItem}
              onAddGroup={addGroup}
              onEditLayer={editLayer}
              onDeleteLayer={deleteLayer}
              onDeleteItem={deleteItem}
            />
          }
          rightContent={
            <DetailPanel
              item={activeItem}
              onUpdateNote={updateNote}
              onEditItem={editItem}
              onDeleteItem={deleteItem}
            />
          }
        />
      </main>

      {/* Modals for Dynamic Data Creation */}
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
