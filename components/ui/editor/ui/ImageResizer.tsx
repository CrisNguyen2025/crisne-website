import type { LexicalEditor } from 'lexical';
import type { JSX } from 'react';

import { calculateZoomLevel } from '@lexical/utils';
import React, { useRef } from 'react';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function ImageResizer({
  onResizeStart,
  onResizeEnd,
  imageRef,
  maxWidth,
  editor,
  isFocused = false,
}: Readonly<{
  editor: LexicalEditor;
  imageRef: { current: null | HTMLElement };
  maxWidth?: number;
  onResizeEnd: (width: 'inherit' | number, height: 'inherit' | number) => void;
  onResizeStart: () => void;
  isFocused?: boolean;
}>): JSX.Element {
  const positioningRef = useRef<{
    currentHeight: number;
    currentWidth: number;
    isResizing: boolean;
    ratio: number;
    startHeight: number;
    startWidth: number;
    startX: number;
    startY: number;
  }>({
    currentHeight: 0,
    currentWidth: 0,
    isResizing: false,
    ratio: 1,
    startHeight: 0,
    startWidth: 0,
    startX: 0,
    startY: 0,
  });

  const editorRootElement = editor.getRootElement();
  const maxWidthContainer =
    maxWidth ||
    (editorRootElement === null
      ? 800
      : Math.max(100, editorRootElement.getBoundingClientRect().width - 32));

  const minWidth = 80;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editor.isEditable()) return;

    const image = imageRef.current;
    if (!image) return;

    event.preventDefault();
    event.stopPropagation();

    const rect = image.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const zoom = calculateZoomLevel(image) || 1;
    const positioning = positioningRef.current;

    positioning.startWidth = width;
    positioning.startHeight = height;
    positioning.ratio = width > 0 && height > 0 ? width / height : 16 / 9;
    positioning.currentWidth = width;
    positioning.currentHeight = height;
    positioning.startX = event.clientX / zoom;
    positioning.startY = event.clientY / zoom;
    positioning.isResizing = true;

    if (editorRootElement !== null) {
      editorRootElement.style.setProperty('cursor', 'nwse-resize', 'important');
    }
    if (document.body !== null) {
      document.body.style.setProperty('cursor', 'nwse-resize', 'important');
      document.body.style.setProperty('-webkit-user-select', 'none', 'important');
    }

    onResizeStart();

    image.style.width = `${width}px`;
    image.style.height = `${height}px`;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!positioning.isResizing || !image) return;

      const currentZoom = calculateZoomLevel(image) || 1;
      const currentX = moveEvent.clientX / currentZoom;

      // Positive diffX means mouse moved right (scaling up), negative means scaling down
      const diffX = Math.round(currentX - positioning.startX);
      const newWidth = clamp(positioning.startWidth + diffX, minWidth, maxWidthContainer);
      const newHeight = Math.round(newWidth / positioning.ratio);

      image.style.width = `${newWidth}px`;
      image.style.height = `${newHeight}px`;
      positioning.currentWidth = newWidth;
      positioning.currentHeight = newHeight;
    };

    const handlePointerUp = () => {
      if (!positioning.isResizing) return;

      const finalWidth = positioning.currentWidth;
      const finalHeight = positioning.currentHeight;

      positioning.isResizing = false;

      if (editorRootElement !== null) {
        editorRootElement.style.removeProperty('cursor');
      }
      if (document.body !== null) {
        document.body.style.removeProperty('cursor');
        document.body.style.removeProperty('-webkit-user-select');
      }

      onResizeEnd(finalWidth, finalHeight);

      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      className={`absolute -bottom-2 -right-2 z-30 w-5 h-5 rounded-md bg-primary text-primary-foreground shadow-md border-2 border-background cursor-nwse-resize flex items-center justify-center select-none transition-all duration-150 touch-none hover:scale-110 active:scale-95 ${
        isFocused ? 'opacity-100 scale-100' : 'opacity-0 group-hover/image-resizer:opacity-100 scale-90'
      }`}
      title="Drag to resize image proportionally"
      aria-label="Resize image handle"
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-primary-foreground pointer-events-none"
      >
        <path
          d="M8.5 1.5L1.5 8.5M8.5 5.5L5.5 8.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
