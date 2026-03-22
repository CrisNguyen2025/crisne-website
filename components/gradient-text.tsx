"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface GradientTextProps {
  children: React.ReactNode;
  className?: string;
  gradient?: string;
}

export function GradientText({
  children,
  className,
  gradient = "from-indigo-500 via-purple-500 to-pink-500",
}: Readonly<GradientTextProps>) {
  return (
    <motion.span
      className={cn(
        "bg-linear-to-r bg-clip-text text-transparent pb-4 box-decoration-clone",
        gradient,
        className,
      )}
      initial={{ backgroundPosition: "0% 50%" }}
      animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
      transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
      style={{ backgroundSize: "200% 200%" }}
    >
      {children}
    </motion.span>
  );
}
