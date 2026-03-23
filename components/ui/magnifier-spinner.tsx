"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface MagnifierSpinnerProps {
  readonly children: React.ReactNode;
  readonly className?: string;
}

export function MagnifierSpinner({ children, className }: MagnifierSpinnerProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role="img"
      aria-label="Spinning logo — hover to magnify"
      className={cn("relative flex items-center justify-center cursor-pointer select-none", className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.div
        className="relative flex items-center justify-center rounded-full"
        animate={
          hovered
            ? { scale: 2.8 }
            : { scale: 1 }
        }
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        style={{ transformOrigin: "center center" }}
      >
        {children}

        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          animate={
            hovered
              ? {
                  opacity: 1,
                  boxShadow: [
                    "0 0 0 2px oklch(0.623 0.214 259.815 / 0.7), 0 0 0 3.5px oklch(0.623 0.214 259.815 / 0.15), inset 0 0 12px oklch(0.623 0.214 259.815 / 0.08)",
                    "0 0 0 2px oklch(0.627 0.265 303.9 / 0.7), 0 0 0 3.5px oklch(0.627 0.265 303.9 / 0.15), inset 0 0 12px oklch(0.627 0.265 303.9 / 0.08)",
                    "0 0 0 2px oklch(0.623 0.214 259.815 / 0.7), 0 0 0 3.5px oklch(0.623 0.214 259.815 / 0.15), inset 0 0 12px oklch(0.623 0.214 259.815 / 0.08)",
                  ],
                }
              : { opacity: 0, boxShadow: "none" }
          }
          transition={
            hovered
              ? { opacity: { duration: 0.15 }, boxShadow: { duration: 1.8, repeat: Infinity, ease: "easeInOut" } }
              : { opacity: { duration: 0.2 } }
          }
        />

        {hovered && (
          <motion.div
            className="absolute inset-0 rounded-full pointer-events-none overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              background:
                "radial-gradient(circle at 35% 35%, oklch(1 0 0 / 0.12) 0%, transparent 55%), radial-gradient(circle at 70% 70%, oklch(0 0 0 / 0.04) 0%, transparent 50%)",
            }}
          />
        )}
      </motion.div>

      {hovered && (
        <motion.div
          className="absolute pointer-events-none"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            bottom: "-1.4rem",
            left: "50%",
            transform: "translateX(-50%)",
            width: "0.15rem",
            height: "0.8rem",
            background: "linear-gradient(to bottom, oklch(0.623 0.214 259.815 / 0.5), transparent)",
            borderRadius: "9999px",
          }}
        />
      )}
    </div>
  );
}
