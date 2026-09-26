'use client';

import { useState, useEffect, useRef, ReactNode, useCallback } from 'react';

interface ResizableLayoutProps {
  leftContent: ReactNode;
  rightContent: ReactNode;
  defaultRatio?: number; // 0.35 to 0.5
  minLeftWidth?: number; // in pixels
  maxLeftWidthRatio?: number; // 0.65
}

export function ResizableLayout({
  leftContent,
  rightContent,
  defaultRatio = 0.4,
  minLeftWidth = 320,
  maxLeftWidthRatio = 0.65,
}: ResizableLayoutProps) {
  const [leftWidthPercent, setLeftWidthPercent] = useState<number>(defaultRatio * 100);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Restore saved splitter position
  useEffect(() => {
    try {
      const saved = localStorage.getItem('roadmap_split_ratio_v1');
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 25 && parsed <= 75) {
          setLeftWidthPercent(parsed);
        }
      }
    } catch {}
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const totalWidth = rect.width;
      const currentX = e.clientX - rect.left;

      let newPercent = (currentX / totalWidth) * 100;
      const minPercent = (minLeftWidth / totalWidth) * 100;
      const maxPercent = maxLeftWidthRatio * 100;

      if (newPercent < minPercent) newPercent = minPercent;
      if (newPercent > maxPercent) newPercent = maxPercent;

      setLeftWidthPercent(newPercent);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      try {
        localStorage.setItem('roadmap_split_ratio_v1', leftWidthPercent.toString());
      } catch {}
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, leftWidthPercent, minLeftWidth, maxLeftWidthRatio]);

  const handleDoubleClick = () => {
    const reset = defaultRatio * 100;
    setLeftWidthPercent(reset);
    try {
      localStorage.setItem('roadmap_split_ratio_v1', reset.toString());
    } catch {}
  };

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-1 w-full h-full overflow-hidden select-none ${
        isDragging ? 'cursor-col-resize select-none' : ''
      }`}
    >
      {/* Cột trái (Master Panel) */}
      <div
        style={{ width: `${leftWidthPercent}%` }}
        className="h-full overflow-hidden flex flex-col border-r border-border/60 bg-background/50 backdrop-blur-sm"
      >
        {leftContent}
      </div>

      {/* Thanh Splitter Drag Handle */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        title="Kéo sang hai bên để chỉnh kích thước | Nhấp đúp để đặt lại"
        className={`relative z-10 w-2.5 -mx-1.5 flex items-center justify-center cursor-col-resize transition-colors group hover:bg-primary/20 ${
          isDragging ? 'bg-primary/30' : 'bg-transparent'
        }`}
      >
        <div
          className={`w-[2px] h-12 rounded-full transition-all group-hover:h-20 group-hover:bg-primary group-hover:w-[3px] ${
            isDragging ? 'bg-primary h-24 w-[3px]' : 'bg-border/80'
          }`}
        />
      </div>

      {/* Cột phải (Detail Panel) */}
      <div
        style={{ width: `${100 - leftWidthPercent}%` }}
        className="h-full overflow-hidden flex flex-col bg-card/30"
      >
        {rightContent}
      </div>
    </div>
  );
}
