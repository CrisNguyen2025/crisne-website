"use client";

import { type CSSProperties } from "react";
import { motion, type Transition, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

interface SpinningTextProps {
  readonly children: string;
  readonly style?: CSSProperties;
  readonly duration?: number;
  readonly className?: string;
  readonly reverse?: boolean;
  readonly radius?: number;
  readonly transition?: Transition;
  readonly variants?: {
    container?: Variants;
    item?: Variants;
  };
}

const BASE_TRANSITION: Transition = {
  repeat: Infinity,
  ease: "linear",
};

const BASE_ITEM_VARIANTS: Variants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1 },
};

export function SpinningText({
  children,
  style,
  duration = 10,
  className,
  reverse = false,
  radius = 5,
  transition,
  variants,
}: SpinningTextProps) {
  const text = children;
  const chars = text.split("");
  const total = chars.length;

  return (
    <motion.div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{
        width: `${radius * 2}rem`,
        height: `${radius * 2}rem`,
        ...style,
      }}
      variants={variants?.container}
      initial="hidden"
      animate="visible"
    >
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: reverse ? -360 : 360 }}
        transition={{
          ...BASE_TRANSITION,
          duration,
          ...transition,
        }}
      >
        {chars.map((char, i) => {
          const angle = (360 / total) * i;
          return (
            <motion.span
              key={`${char}-${i}`}
              className="absolute top-0 left-1/2 origin-[0_50%] text-[0.85em] font-medium"
              style={{
                transform: `rotate(${angle}deg) translateY(-${radius}rem)`,
                transformOrigin: "0 50%",
                left: "50%",
                top: "50%",
              }}
              variants={variants?.item ?? BASE_ITEM_VARIANTS}
            >
              {char}
            </motion.span>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
