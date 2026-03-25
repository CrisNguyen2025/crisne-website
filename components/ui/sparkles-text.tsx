"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface Sparkle {
  id: string;
  x: string;
  y: string;
  size: number;
  delay: number;
  duration: number;
  rotation: number;
  color: string;
}

interface SparklesTextProps {
  readonly children: string;
  readonly className?: string;
  readonly sparklesCount?: number;
  readonly delayMs?: number;
  readonly colors?: {
    readonly first: string;
    readonly second: string;
  };
}

const DEFAULT_COLORS = { first: "#A07CFE", second: "#FE8FB5" };

function generateSparkle(colors: { readonly first: string; readonly second: string }): Sparkle {
  return {
    id: Math.random().toString(36).slice(2),
    x: `${Math.random() * 100}%`,
    y: `${Math.random() * 100}%`,
    size: Math.random() * 16 + 14,
    delay: Math.random() * 2,
    duration: Math.random() * 1.3 + 1.5,
    rotation: Math.random() * 360,
    color: Math.random() > 0.5 ? colors.first : colors.second,
  };
}

function StarSvg({
  size,
  color,
  rotation,
}: {
  readonly size: number;
  readonly color: string;
  readonly rotation: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <path
        d="M80 0C80 0 84.2846 41.2925 101.496 58.504C118.707 75.7154 160 80 160 80C160 80 118.707 84.2846 101.496 101.496C84.2846 118.707 80 160 80 160C80 160 75.7154 118.707 58.504 101.496C41.2925 84.2846 0 80 0 80C0 80 41.2925 75.7154 58.504 58.504C75.7154 41.2925 80 0 80 0Z"
        fill={color}
      />
    </svg>
  );
}

export function SparklesText({
  children,
  className,
  sparklesCount = 10,
  delayMs = 0,
  colors = DEFAULT_COLORS,
}: SparklesTextProps) {
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setSparkles(Array.from({ length: sparklesCount }, () => generateSparkle(colors)));

      intervalRef.current = setInterval(() => {
        setSparkles(prev => {
          const next = [...prev];
          const idx = Math.floor(Math.random() * next.length);
          next[idx] = generateSparkle(colors);
          return next;
        });
      }, 700);
    }, delayMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sparklesCount, colors, delayMs]);

  return (
    <span className={cn("relative inline-block", className)}>
      <AnimatePresence>
        {sparkles.map(sparkle => (
          <motion.span
            key={sparkle.id}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 z-10"
            style={{ left: sparkle.x, top: sparkle.y }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0], scale: [0, 1, 0], rotate: sparkle.rotation }}
            transition={{ duration: sparkle.duration, delay: sparkle.delay, ease: "easeInOut" }}
          >
            <StarSvg size={sparkle.size} color={sparkle.color} rotation={sparkle.rotation} />
          </motion.span>
        ))}
      </AnimatePresence>
      <span className="relative z-0 bg-linear-to-r from-steel to-steel-light bg-clip-text text-transparent">
        {children}
      </span>
    </span>
  );
}
