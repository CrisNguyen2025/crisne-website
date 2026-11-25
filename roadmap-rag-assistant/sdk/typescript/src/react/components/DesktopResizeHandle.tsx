import React from "react";
import type { DesktopHeightSnapshot } from "../utils/useDesktopPanelHeight";

export interface DesktopResizeHandleProps {
  edge?: "top" | "bottom";
  isDragging: boolean;
  snapshot: DesktopHeightSnapshot;
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void;
  onDoubleClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

export function DesktopResizeHandle({
  edge = "top",
  isDragging,
  snapshot,
  onMouseDown,
  onTouchStart,
  onDoubleClick,
  onKeyDown,
}: DesktopResizeHandleProps) {
  return (
    <>
      {isDragging && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-50 hidden cursor-ns-resize md:block"
        />
      )}
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label="Kéo để thay đổi chiều cao Abot"
        aria-valuemin={snapshot.min}
        aria-valuemax={snapshot.max}
        aria-valuenow={snapshot.current}
        data-abot-resize-handle={edge}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        className={`group relative z-30 hidden h-4 w-full shrink-0 cursor-ns-resize select-none touch-none items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]/40 focus-visible:ring-inset md:flex ${
          edge === "bottom" ? "-mt-1 pb-1" : "-mb-1 pt-1"
        }`}
      >
        <span
          aria-hidden="true"
          className={`h-[0.1875rem] rounded-full transition-[width,background-color] duration-150 ${
            isDragging
              ? "w-14 bg-[#8C8880]"
              : "w-10 bg-[#DDDAD3] group-hover:w-12 group-hover:bg-[#B8B4AC] group-focus-visible:w-12 group-focus-visible:bg-[#C2410C]"
          }`}
        />
      </div>
    </>
  );
}
