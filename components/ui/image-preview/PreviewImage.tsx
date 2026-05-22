'use client';

import { useState } from 'react';
import { ImagePreview } from './ImagePreview';
import { cn } from '@/lib/utils';

interface PreviewImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  preview?: boolean;
  images?: Array<{ src: string; alt: string }>;
}

/**
 * Image component with preview functionality
 * Similar to Ant Design Image component
 * 
 * @example
 * // Single image
 * <PreviewImage src="/image.jpg" alt="Image" />
 * 
 * // Image gallery with navigation
 * <PreviewImage 
 *   src="/image1.jpg" 
 *   alt="Image 1"
 *   images={[
 *     { src: '/image1.jpg', alt: 'Image 1' },
 *     { src: '/image2.jpg', alt: 'Image 2' },
 *   ]}
 * />
 */
export function PreviewImage({
  src,
  alt,
  className,
  width,
  height,
  preview = true,
  images = [],
}: PreviewImageProps) {
  const [previewVisible, setPreviewVisible] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleClick = () => {
    if (preview) {
      // Find current image index in images array
      if (images.length > 0) {
        const index = images.findIndex((img) => img.src === src);
        setCurrentIndex(index >= 0 ? index : 0);
      }
      setPreviewVisible(true);
    }
  };

  return (
    <>
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={cn(
          preview && 'cursor-pointer transition-opacity hover:opacity-80',
          className
        )}
        onClick={handleClick}
      />
      {preview && (
        <ImagePreview
          src={src}
          alt={alt}
          visible={previewVisible}
          onClose={() => setPreviewVisible(false)}
          images={images.length > 0 ? images : undefined}
          currentIndex={currentIndex}
          onIndexChange={setCurrentIndex}
        />
      )}
    </>
  );
}
