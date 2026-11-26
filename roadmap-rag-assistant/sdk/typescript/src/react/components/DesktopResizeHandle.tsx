import React from "react";
import type { DesktopHeightSnapshot } from "../utils/useDesktopPanelHeight";

export interface DesktopResizeHandleProps {
  edge?: "top" | "bottom" | "left";
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
  const isHorizontal = edge === "left";

  return (
    <>
      {isDragging && (
        <div
          aria-hidden="true"
          className={`fixed inset-0 z-50 hidden md:block ${
            isHorizontal ? "cursor-ew-resize" : "cursor-ns-resize"
          }`}
        />
      )}
      <div
        role="separator"
        tabIndex={0}
        aria-orientation={isHorizontal ? "vertical" : "horizontal"}
        aria-label={
          isHorizontal
            ? "Kéo để thay đổi chiều rộng Abot"
            : "Kéo để thay đổi chiều cao Abot"
        }
        title={
          isHorizontal
            ? "Kéo để chỉnh độ rộng · Nhấp đúp để đặt lại"
            : undefined
        }
        aria-valuemin={snapshot.min}
        aria-valuemax={snapshot.max}
        aria-valuenow={snapshot.current}
        data-abot-resize-handle={edge}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        className={
          isHorizontal
            ? "group absolute inset-y-0 left-0 z-50 hidden w-3.5 cursor-ew-resize select-none touch-none items-center justify-start outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]/40 focus-visible:ring-inset md:flex"
            : `group relative z-50 hidden h-4 w-full shrink-0 cursor-ns-resize select-none touch-none items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]/40 focus-visible:ring-inset md:flex ${
                edge === "bottom" ? "-mt-1 pb-1" : "-mb-1 pt-1"
              }`
        }
      >
        {isHorizontal ? (
          <>
            <span
              aria-hidden="true"
              className={`absolute inset-y-0 left-0 w-[2px] transition-colors duration-150 ${
                isDragging
                  ? "bg-[#C2410C]/75"
                  : "bg-transparent group-hover:bg-[#C2410C]/40 group-focus-visible:bg-[#C2410C]/65"
              }`}
            />
            <span
              aria-hidden="true"
              className={`ml-1 w-[0.1875rem] rounded-full transition-[height,opacity,background-color] duration-150 ${
                isDragging
                  ? "h-14 bg-[#C2410C] opacity-100"
                  : "h-9 bg-[#B8B4AC] opacity-0 group-hover:h-12 group-hover:opacity-100 group-focus-visible:h-12 group-focus-visible:bg-[#C2410C] group-focus-visible:opacity-100"
              }`}
            />
          </>
        ) : (
          <span
            aria-hidden="true"
            className={`h-[0.1875rem] rounded-full transition-[width,background-color] duration-150 ${
              isDragging
                ? "w-14 bg-[#8C8880]"
                : "w-10 bg-[#DDDAD3] group-hover:w-12 group-hover:bg-[#B8B4AC] group-focus-visible:w-12 group-focus-visible:bg-[#C2410C]"
            }`}
          />
        )}
      </div>
    </>
  );
}
