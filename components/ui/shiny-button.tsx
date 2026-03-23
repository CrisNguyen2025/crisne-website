"use client";

import { type ComponentProps } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ShinyButtonProps extends ComponentProps<"a"> {
  readonly children: React.ReactNode;
  readonly className?: string;
}

export function ShinyButton({ children, className, ...props }: Readonly<ShinyButtonProps>) {
  return (
    <a
      className={cn(
        "group relative inline-flex items-center justify-center gap-2",
        "rounded-2xl px-6 py-3",
        "font-semibold text-sm text-white",
        "overflow-hidden",
        "cursor-pointer select-none",
        "transition-all duration-500 ease-out",
        "border border-white/10",
        "bg-linear-to-br from-indigo-500 via-purple-600 to-purple-800",
        "shadow-[0_0_0_1px_rgba(255,255,255,0.05),inset_0_1px_0_rgba(255,255,255,0.15)]",
        "hover:shadow-[0_0_28px_rgba(139,92,246,0.45),0_0_8px_rgba(99,102,241,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]",
        "hover:border-purple-400/30",
        "hover:scale-[1.02]",
        "active:scale-[0.98]",
        className,
      )}
      {...props}
    >
      <motion.span
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          background:
            "linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.08) 45%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.08) 55%, transparent 75%)",
          backgroundSize: "250% 100%",
        }}
        animate={{ backgroundPosition: ["200% center", "-200% center"] }}
        transition={{
          duration: 3.5,
          ease: "linear",
          repeat: Infinity,
          repeatDelay: 0.8,
        }}
      />

      <span className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.12) 0%, transparent 65%)",
        }}
      />

      <span className="relative z-10 inline-flex items-center gap-2.5">
        {children}
      </span>
    </a>
  );
}
