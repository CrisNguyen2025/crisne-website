"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import { useUnlock } from "@/hooks/use-unlock";
import { UnlockModal } from "./UnlockModal";

interface UnlockGateProps {
  readonly children: React.ReactNode;
  readonly sectionId: string;
}

export function UnlockGate({ children, sectionId }: UnlockGateProps) {
  const { isUnlocked, isHydrated, unlock } = useUnlock();
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!isHydrated) {
    return <div className="relative">{children}</div>;
  }

  return (
    <div className="relative" id={`gate-${sectionId}`}>
      {children}

      <AnimatePresence>
        {!isUnlocked && (
          <motion.div
            key="overlay"
            className="absolute inset-0 z-20 flex items-center justify-center"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              className="absolute inset-0"
              style={{
                backdropFilter: "blur(14px) saturate(0.8)",
                WebkitBackdropFilter: "blur(14px) saturate(0.8)",
                background: "linear-gradient(to bottom, transparent 0%, var(--color-background) 92%)",
              }}
              exit={{ backdropFilter: "blur(0px)", opacity: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            />

            <motion.div
              className="relative z-10 flex flex-col items-center gap-5 text-center px-4"
              initial={{ opacity: 0, scale: 0.9, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.88, y: 8 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="relative">
                <div
                  className="absolute inset-0 rounded-full blur-xl opacity-40 animate-pulse"
                  style={{
                    background: "radial-gradient(circle, oklch(0.623 0.214 259.815 / 0.6), transparent 70%)",
                    transform: "scale(1.8)",
                  }}
                />
                <div className="relative w-16 h-16 rounded-2xl border border-primary/30 bg-primary/10 backdrop-blur-sm flex items-center justify-center shadow-xl">
                  <Lock className="w-7 h-7 text-primary" />
                </div>
              </div>

              <div>
                <h3 className="font-bold text-xl text-foreground mb-1.5">Nội dung riêng tư</h3>
                <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                  Vượt qua thử thách nhỏ để xem{" "}
                  <span className="text-foreground font-medium">
                    {sectionId === "experience" ? "kinh nghiệm làm việc" : "các dự án"}
                  </span>{" "}
                  của mình nhé 🔐
                </p>
              </div>

              <motion.button
                onClick={() => setIsModalOpen(true)}
                className="group relative flex items-center gap-2.5 px-6 py-3 rounded-2xl font-semibold text-sm text-white overflow-hidden shadow-lg"
                style={{
                  background: "linear-gradient(135deg, oklch(0.488 0.243 264.376), oklch(0.623 0.214 259.815))",
                  boxShadow: "0 4px 24px oklch(0.488 0.243 264.376 / 0.35)",
                }}
                whileHover={{ scale: 1.04, boxShadow: "0 6px 32px oklch(0.488 0.243 264.376 / 0.5)" }}
                whileTap={{ scale: 0.97 }}
              >
                <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors duration-300 rounded-2xl" />
                <Sparkles className="relative w-4 h-4" />
                <span className="relative">Mở khoá ngay</span>
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <UnlockModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onUnlock={unlock}
      />
    </div>
  );
}
