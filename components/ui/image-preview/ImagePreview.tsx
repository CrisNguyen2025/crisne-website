'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImagePreviewProps {
  src: string;
  alt: string;
  visible: boolean;
  onClose: () => void;
  images?: Array<{ src: string; alt: string }>;
  currentIndex?: number;
  onIndexChange?: (index: number) => void;
}

export function ImagePreview({
  src,
  alt,
  visible,
  onClose,
  images = [],
  currentIndex = 0,
  onIndexChange,
}: ImagePreviewProps) {
  const [scale, setScale] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isAnimating, setIsAnimating] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const hasMultipleImages = images.length > 1;
  const currentSrc = hasMultipleImages ? images[currentIndex]?.src : src;
  const currentAlt = hasMultipleImages ? images[currentIndex]?.alt : alt;

  // Reset state when image changes
  useEffect(() => {
    if (visible) {
      setIsAnimating(true);
      setScale(1);
      setRotate(0);
      setPosition({ x: 0, y: 0 });
      // Remove animating flag after transition
      const timer = setTimeout(() => setIsAnimating(false), 300);
      return () => clearTimeout(timer);
    }
  }, [visible, currentIndex]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if this preview is visible
      if (!visible) return;
      
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
        case '+':
        case '=':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
          e.preventDefault();
          handleZoomOut();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (hasMultipleImages && currentIndex > 0) {
            onIndexChange?.(currentIndex - 1);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (hasMultipleImages && currentIndex < images.length - 1) {
            onIndexChange?.(currentIndex + 1);
          }
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          handleRotate();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [visible, scale, currentIndex, hasMultipleImages, images.length]);

  // Prevent body scroll when preview is open
  useEffect(() => {
    if (visible) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [visible]);

  const handleZoomIn = useCallback(() => {
    setIsAnimating(true);
    setScale((prev) => Math.min(prev + 0.5, 5));
    setTimeout(() => setIsAnimating(false), 300);
  }, []);

  const handleZoomOut = useCallback(() => {
    setIsAnimating(true);
    setScale((prev) => {
      const newScale = Math.max(prev - 0.5, 0.5);
      // Reset position if zooming out to 1x or less
      if (newScale <= 1) {
        setPosition({ x: 0, y: 0 });
      }
      return newScale;
    });
    setTimeout(() => setIsAnimating(false), 300);
  }, []);

  const handleRotate = useCallback(() => {
    setIsAnimating(true);
    setRotate((prev) => (prev + 90) % 360);
    setTimeout(() => setIsAnimating(false), 300);
  }, []);

  const handleDownload = useCallback(async () => {
    try {
      // Check if it's a data URL (base64)
      if (currentSrc.startsWith('data:')) {
        // Direct download for data URLs
        const link = document.createElement('a');
        link.href = currentSrc;
        link.download = currentAlt || 'image.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // For external URLs, try to fetch and download
      try {
        const response = await fetch(currentSrc, {
          mode: 'cors',
          credentials: 'omit',
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch image');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        // Extract filename from URL or use alt text
        const urlPath = new URL(currentSrc, window.location.href).pathname;
        const filename = urlPath.split('/').pop() || currentAlt || 'image';
        link.download = filename;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (fetchError) {
        // If fetch fails (CORS), open in new tab as fallback
        console.warn('Direct download failed, opening in new tab:', fetchError);
        window.open(currentSrc, '_blank');
      }
    } catch (error) {
      console.error('Download failed:', error);
      // Last resort: open in new tab
      window.open(currentSrc, '_blank');
    }
  }, [currentSrc, currentAlt]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (scale > 1) {
        setIsDragging(true);
        setDragStart({
          x: e.clientX - position.x,
          y: e.clientY - position.y,
        });
      }
    },
    [scale, position]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging && scale > 1) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }
    },
    [isDragging, dragStart, scale]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setIsAnimating(true);
    if (e.deltaY < 0) {
      setScale((prev) => Math.min(prev + 0.2, 5));
    } else {
      setScale((prev) => {
        const newScale = Math.max(prev - 0.2, 0.5);
        if (newScale <= 1) {
          setPosition({ x: 0, y: 0 });
        }
        return newScale;
      });
    }
    setTimeout(() => setIsAnimating(false), 300);
  }, []);

  const handlePrevious = useCallback(() => {
    if (hasMultipleImages && currentIndex > 0) {
      onIndexChange?.(currentIndex - 1);
    }
  }, [hasMultipleImages, currentIndex, onIndexChange]);

  const handleNext = useCallback(() => {
    if (hasMultipleImages && currentIndex < images.length - 1) {
      onIndexChange?.(currentIndex + 1);
    }
  }, [hasMultipleImages, currentIndex, images.length, onIndexChange]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center animate-in fade-in duration-200"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      {/* Dark background with blur for focus effect */}
      <div 
        className="absolute inset-0 bg-black/98 backdrop-blur-sm" 
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      
      {/* Vignette effect for better focus */}
      <div 
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.4) 100%)',
        }}
      />

      {/* Toolbar */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 animate-in slide-in-from-top duration-300">
        <div className="flex items-center gap-1 rounded-lg bg-black/50 p-2 backdrop-blur-sm transition-all hover:bg-black/60">
          <ToolbarButton
            icon={<ZoomOut size={18} />}
            onClick={(e) => {
              e.stopPropagation();
              handleZoomOut();
            }}
            title="Zoom Out (-)"
            disabled={scale <= 0.5}
          />
          <span className="mx-2 min-w-[3rem] text-center text-sm text-white">
            {Math.round(scale * 100)}%
          </span>
          <ToolbarButton
            icon={<ZoomIn size={18} />}
            onClick={(e) => {
              e.stopPropagation();
              handleZoomIn();
            }}
            title="Zoom In (+)"
            disabled={scale >= 5}
          />
          <div className="mx-1 h-6 w-px bg-white/20" />
          <ToolbarButton
            icon={<RotateCw size={18} />}
            onClick={(e) => {
              e.stopPropagation();
              handleRotate();
            }}
            title="Rotate (R)"
          />
          <ToolbarButton
            icon={<Download size={18} />}
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
            title="Download"
          />
        </div>
        <ToolbarButton
          icon={<X size={20} />}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          title="Close (ESC)"
          className="rounded-lg bg-black/50 p-2 backdrop-blur-sm"
        />
      </div>

      {/* Image counter */}
      {hasMultipleImages && (
        <div className="absolute top-4 left-4 z-10 rounded-lg bg-black/50 px-3 py-2 text-sm text-white backdrop-blur-sm animate-in slide-in-from-top duration-300">
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* Navigation buttons */}
      {hasMultipleImages && (
        <>
          {currentIndex > 0 && (
            <button
              className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white backdrop-blur-sm transition-all duration-200 hover:bg-black/70 hover:scale-110 active:scale-95 animate-in slide-in-from-left"
              onClick={(e) => {
                e.stopPropagation();
                handlePrevious();
              }}
              title="Previous (←)"
            >
              <ChevronLeft size={24} />
            </button>
          )}
          {currentIndex < images.length - 1 && (
            <button
              className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white backdrop-blur-sm transition-all duration-200 hover:bg-black/70 hover:scale-110 active:scale-95 animate-in slide-in-from-right"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              title="Next (→)"
            >
              <ChevronRight size={24} />
            </button>
          )}
        </>
      )}

      {/* Image container */}
      <div
        ref={containerRef}
        className="relative z-10 flex h-full w-full items-center justify-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{
          cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
        }}
      >
        <img
          ref={imageRef}
          src={currentSrc}
          alt={currentAlt}
          className="max-h-[90vh] max-w-[90vw] select-none object-contain"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotate}deg)`,
            transformOrigin: 'center',
            transition: isAnimating && !isDragging ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
            willChange: isDragging ? 'transform' : 'auto',
          }}
          draggable={false}
        />
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-black/50 px-4 py-2 text-xs text-white/70 backdrop-blur-sm animate-in slide-in-from-bottom duration-300">
        ESC: Close | +/-: Zoom | R: Rotate | ←/→: Navigate
      </div>
    </div>
  );
}

interface ToolbarButtonProps {
  icon: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  disabled?: boolean;
  className?: string;
}

function ToolbarButton({ icon, onClick, title, disabled, className }: ToolbarButtonProps) {
  return (
    <button
      className={cn(
        'rounded p-2 text-white transition-all duration-200 hover:bg-white/10 active:scale-95',
        disabled && 'cursor-not-allowed opacity-30 hover:bg-transparent',
        className
      )}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {icon}
    </button>
  );
}
