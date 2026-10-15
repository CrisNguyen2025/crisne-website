"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { SparklesIcon, CloseIcon } from "@/roadmap-rag-assistant/sdk/typescript/src/react/icons";

export type ChatTriggerVariant = "capsule" | "mascot";

export interface ChatTriggerButtonProps {
  /**
   * Kiểu UI hiển thị:
   * - 'capsule': Glassmorphism Capsule bo tròn "Ask AI ✨" (Mặc định - V1)
   * - 'mascot': 3D Robot Avatar Chibi thân thiện (V2)
   */
  variant?: ChatTriggerVariant;
  isOpen: boolean;
  onToggle: () => void;
  unreadCount?: number;
  greetingText?: string;
  className?: string;
}

export function ChatTriggerButton({
  variant = "capsule",
  isOpen,
  onToggle,
  unreadCount = 0,
  greetingText,
  className,
}: ChatTriggerButtonProps) {
  // Spotlight cursor position tracking
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = React.useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div className={cn("relative flex items-center justify-end", className)}>
      {/* ── Greeting Tooltip / Speech Bubble (Khi chưa mở chat) ── */}
      <AnimatePresence>
        {!isOpen && greetingText && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 4 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none absolute bottom-full right-0 mb-3 hidden sm:block whitespace-nowrap rounded-2xl border border-white/20 bg-background/80 px-3.5 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/80"
          >
            {greetingText}
            {/* Arrow indicator */}
            <div className="absolute -bottom-1 right-5 h-2 w-2 rotate-45 border-b border-r border-white/20 bg-background/80 dark:border-white/10 dark:bg-neutral-900/80" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Trigger Button ── */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        onClick={onToggle}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label={isOpen ? "Đóng AI Assistant" : "Mở AI Assistant"}
        className={cn(
          "pointer-events-auto relative flex cursor-pointer items-center justify-center transition-all duration-300 overflow-hidden",
          isOpen ? "hidden sm:flex" : "flex",

          // Khi mở: nút tròn Close tinh gọn
          isOpen &&
            "h-11 w-11 rounded-full border border-border bg-background/90 text-foreground shadow-md backdrop-blur-md hover:bg-muted",

          // Khi đóng - Version 1: Crisp Dark Graphite Capsule (Hiện đại, tương phản tốt, không bị chìm)
          !isOpen &&
            variant === "capsule" &&
            cn(
              "group h-11 px-4 rounded-full select-none",
              // Viền rõ nét, phản xạ ánh sáng trên đỉnh viền (top highlight)
              "border border-white/25",
              // Nền graphite sẫm màu cao cấp, giữ độ tách biệt hoàn hảo trên cả nền trắng và nền tối
              "bg-[#181A20] text-white",
              // Đổ bóng nổi khối 3D nhẹ nhàng giúp nút bật lên khỏi mặt phẳng
              "shadow-[0_10px_25px_-5px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.08),inset_0_1px_0_0_rgba(255,255,255,0.2)]",
              "hover:bg-[#22252D] hover:border-white/40 hover:scale-[1.03] active:scale-[0.97]",
              "transition-all duration-200"
            ),

          // Khi đóng - Version 2: 3D Mascot Avatar
          !isOpen &&
            variant === "mascot" &&
            cn(
              "h-12 w-12 rounded-full p-1",
              "border border-border",
              "bg-muted/80 backdrop-blur-md",
              "shadow-md hover:scale-105"
            )
        )}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <CloseIcon className="h-4 w-4" />
            </motion.div>
          ) : variant === "capsule" ? (
            /* ── Crisp Dark Capsule Content ── */
            <div className="flex items-center gap-2 text-[14px] font-medium tracking-normal text-white">
              {/* Minimal 4-point star icon sáng rõ */}
              <span className="flex items-center justify-center text-white/80 transition-colors group-hover:text-white">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
                </svg>
              </span>

              <span className="text-white/95 transition-colors group-hover:text-white">
                Ask AI
              </span>
            </div>
          ) : (
            /* ── VERSION 2: 3D Mascot Avatar ── */
            <motion.div
              key="mascot-content"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-neutral-900 shadow-inner"
            >
              <svg
                viewBox="0 0 48 48"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="h-9 w-9 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]"
              >
                <rect x="8" y="10" width="32" height="26" rx="10" fill="currentColor" fillOpacity="0.1" />
                <rect x="10" y="12" width="28" height="22" rx="8" fill="#0f172a" />
                <rect x="15" y="18" width="5" height="7" rx="2.5" fill="#38bdf8" />
                <rect x="28" y="18" width="5" height="7" rx="2.5" fill="#38bdf8" />
                <path
                  d="M21 28C22 29.5 26 29.5 27 28"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Unread Badge ── */}
        {!isOpen && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-background">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </motion.button>
    </div>
  );
}
