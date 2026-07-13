"use client";

import { motion } from "framer-motion";
import { MOBILE_VIEWPORT_QUERY, useMediaQuery } from "@/hooks/use-media-query";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const shapes = [
  {
    type: "circle",
    size: 8,
    x: "10%",
    y: "20%",
    duration: 15,
    delay: 0,
    color: "oklch(0.62 0.09 240 / 0.25)",
  },
  {
    type: "square",
    size: 12,
    x: "80%",
    y: "15%",
    duration: 18,
    delay: 2,
    color: "oklch(0.62 0.06 245 / 0.2)",
  },
  {
    type: "triangle",
    size: 10,
    x: "70%",
    y: "70%",
    duration: 20,
    delay: 4,
    color: "oklch(0.62 0.08 230 / 0.2)",
  },
  {
    type: "circle",
    size: 6,
    x: "20%",
    y: "80%",
    duration: 12,
    delay: 1,
    color: "oklch(0.70 0.06 235 / 0.2)",
  },
  {
    type: "square",
    size: 14,
    x: "50%",
    y: "10%",
    duration: 22,
    delay: 3,
    color: "oklch(0.62 0.06 250 / 0.15)",
  },
  {
    type: "circle",
    size: 10,
    x: "90%",
    y: "50%",
    duration: 16,
    delay: 5,
    color: "oklch(0.62 0.09 240 / 0.18)",
  },
  {
    type: "triangle",
    size: 8,
    x: "35%",
    y: "45%",
    duration: 14,
    delay: 2,
    color: "oklch(0.72 0.08 42 / 0.15)",
  },
  {
    type: "square",
    size: 6,
    x: "5%",
    y: "55%",
    duration: 19,
    delay: 6,
    color: "oklch(0.62 0.08 230 / 0.12)",
  },
];

function Shape({
  type,
  size,
  color,
}: Readonly<{
  type: string;
  size: number;
  color: string;
}>) {
  if (type === "circle") {
    return (
      <svg width={size} height={size} viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="4" fill={color} />
      </svg>
    );
  }
  if (type === "square") {
    return (
      <svg width={size} height={size} viewBox="0 0 10 10">
        <rect x="1" y="1" width="8" height="8" rx="1" fill={color} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 10 10">
      <polygon points="5,1 9,9 1,9" fill={color} />
    </svg>
  );
}

export function FloatingShapes() {
  const isMobile = useMediaQuery(MOBILE_VIEWPORT_QUERY);
  const prefersReducedMotion = useReducedMotion();

  if (isMobile || prefersReducedMotion) return null;

  return (
    <div className="fixed inset-0 -z-5 pointer-events-none overflow-hidden">
      {shapes.map((shape, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ left: shape.x, top: shape.y }}
          animate={{
            y: [0, -30, 10, -20, 0],
            x: [0, 15, -10, 20, 0],
            rotate: [0, 90, 180, 270, 360],
          }}
          transition={{
            duration: shape.duration,
            repeat: Infinity,
            ease: "easeInOut",
            delay: shape.delay,
          }}
        >
          <Shape type={shape.type} size={shape.size} color={shape.color} />
        </motion.div>
      ))}
    </div>
  );
}
