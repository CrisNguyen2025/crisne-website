"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ExternalLink,
  Calendar,
  Layers,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useCallback, useState, useMemo } from "react";
import useEmblaCarousel from "embla-carousel-react";
import type { ProjectData } from "@/components/project-card";
import { Lens } from "@/components/ui/lens";
import { cn } from "@/lib/utils";

interface ProjectDetailModalProps {
  readonly project: ProjectData | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.25, ease: "easeIn" as const },
  },
};

const modalVariants = {
  hidden: { opacity: 0, y: "4%" },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
      staggerChildren: 0.08,
      delayChildren: 0.15,
    },
  },
  exit: {
    opacity: 0,
    y: "4%",
    transition: {
      duration: 0.25,
      ease: [0.4, 0, 1, 1] as [number, number, number, number],
    },
  },
};

const contentVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
    },
  },
};

function CoverCarousel({
  images,
  gradient,
  emoji,
}: {
  readonly images: string[];
  readonly gradient: [string, string];
  readonly emoji: string;
}) {
  const hasImages = images.length > 0;
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, duration: 25 });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const scrollSnaps = useMemo(
    () => (emblaApi ? emblaApi.scrollSnapList() : []),
    [emblaApi],
  );

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback(
    (index: number) => emblaApi?.scrollTo(index),
    [emblaApi],
  );

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    onSelect();
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  if (!hasImages) {
    return (
      <div
        className="relative aspect-video shrink-0 overflow-hidden sm:rounded-t-3xl"
        style={{
          background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
        }}
      >
        <div className="absolute inset-0 bg-black/20" />
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            className="text-5xl sm:text-6xl"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              duration: 0.5,
              delay: 0.2,
              ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
            }}
          >
            {emoji}
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative shrink-0 overflow-hidden sm:rounded-t-3xl">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {images.map((src) => (
            <div key={src} className="flex-[0_0_100%] min-w-0">
              <div
                className="relative aspect-video overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
                }}
              >
                <Lens
                  zoomFactor={1.8}
                  lensSize={180}
                  ariaLabel="Zoom into project image"
                  className="rounded-none h-full"
                >
                  <Image
                    src={src}
                    alt={`Project slide`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 768px"
                    unoptimized
                  />
                </Lens>
              </div>
            </div>
          ))}
        </div>
      </div>

      {images.length > 1 && (
        <>
          <button
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 backdrop-blur-md text-white/90 hover:bg-black/50 hover:text-white transition-colors cursor-pointer"
            onClick={scrollPrev}
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 backdrop-blur-md text-white/90 hover:bg-black/50 hover:text-white transition-colors cursor-pointer"
            onClick={scrollNext}
            aria-label="Next slide"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
            {scrollSnaps.map((snap, i) => (
              <button
                key={`dot-${snap}`}
                className={cn(
                  "w-2 h-2 rounded-full transition-all duration-300 cursor-pointer",
                  i === selectedIndex
                    ? "bg-white w-5"
                    : "bg-white/50 hover:bg-white/70",
                )}
                onClick={() => scrollTo(i)}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ProjectDetailModal({
  project,
  isOpen,
  onClose,
}: ProjectDetailModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  return (
    <AnimatePresence>
      {isOpen && project && (
        <motion.div
          className="fixed inset-0 z-100 flex items-stretch justify-center"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            className={cn(
              "relative z-10 w-full flex flex-col",
              "sm:m-4 sm:rounded-3xl lg:m-8 lg:max-w-4xl lg:mx-auto lg:my-8",
              "border-0 sm:border sm:border-border/50",
              "bg-card/98 backdrop-blur-2xl",
              "shadow-none sm:shadow-2xl sm:shadow-black/20 dark:sm:shadow-black/50",
              "overflow-hidden",
            )}
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <CoverCarousel
                images={project.images}
                gradient={project.gradient}
                emoji={project.emoji}
              />

              <motion.button
                className="absolute top-4 right-4 z-10 p-2.5 rounded-full bg-black/30 backdrop-blur-md text-white/90 hover:bg-black/50 hover:text-white transition-colors cursor-pointer"
                onClick={onClose}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </motion.button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-8 pb-8 sm:pb-8">
              <motion.div variants={contentVariants}>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span
                    className="px-3 py-1 text-xs font-semibold rounded-full text-white"
                    style={{
                      background: `linear-gradient(135deg, ${project.gradient[0]}, ${project.gradient[1]})`,
                    }}
                  >
                    {project.category}
                  </span>
                  <span className="flex items-center gap-1.5 px-3 py-1 text-xs font-mono text-muted-foreground bg-muted/60 rounded-full">
                    <Calendar className="w-3 h-3" />
                    {project.year}
                  </span>
                </div>

                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
                  {project.title}
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  {project.longDescription}
                </p>
              </motion.div>

              <motion.div variants={contentVariants} className="mb-6">
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  <Layers className="w-4 h-4" />
                  Tech Stack
                </h3>
                <div className="flex flex-wrap gap-2">
                  {project.techStack.map((tech: string) => (
                    <span
                      key={tech}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg bg-muted/70 border border-border/50 text-foreground/80 hover:text-foreground hover:border-border transition-colors"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </motion.div>

              {project.highlights && project.highlights.length > 0 && (
                <motion.div variants={contentVariants} className="mb-6">
                  <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                    Highlights
                  </h3>
                  <ul className="space-y-2">
                    {project.highlights.map((highlight: string) => (
                      <li
                        key={highlight}
                        className="flex items-start gap-2.5 text-sm text-foreground/80 leading-relaxed"
                      >
                        <span
                          className="mt-2 w-1.5 h-1.5 rounded-full shrink-0"
                          style={{
                            background: `linear-gradient(135deg, ${project.gradient[0]}, ${project.gradient[1]})`,
                          }}
                        />
                        {highlight}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}

              <motion.div
                variants={contentVariants}
                className="flex flex-wrap gap-3 pt-4 border-t border-border/50"
              >
                {project.liveUrl && (
                  <motion.a
                    href={project.liveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-full text-white no-underline shadow-lg transition-shadow hover:shadow-xl"
                    style={{
                      background: `linear-gradient(135deg, ${project.gradient[0]}, ${project.gradient[1]})`,
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <ExternalLink className="w-4 h-4" />
                    Live Demo
                  </motion.a>
                )}
                {project.repoUrl && (
                  <motion.a
                    href={project.repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-full border border-border/50 bg-muted/50 text-foreground hover:bg-muted/80 no-underline transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4"
                    >
                      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                      <path d="M9 18c-4.51 2-5-2-7-2" />
                    </svg>
                    Source Code
                  </motion.a>
                )}
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
