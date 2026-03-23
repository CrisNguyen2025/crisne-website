"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Gamepad2, KeyRound, Skull } from "lucide-react";
import { useState } from "react";
import { MemoryGame } from "./MemoryGame";
import { CodeStep } from "./CodeStep";
import { TrollScreen } from "./TrollScreen";

interface UnlockModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onUnlock: () => void;
}

type Step = 1 | 2 | "troll";

const STEP_CONFIG = {
  1: { icon: Gamepad2, label: "Mini-game" },
  2: { icon: KeyRound, label: "Mã khoá" },
  troll: { icon: Skull, label: "💀" },
} as const;

function StepLabel({ current, step, text }: { readonly current: Step; readonly step: 1 | 2; readonly text: string }) {
  const isActive = current === step || (current === "troll" && step <= 2);
  return (
    <span className={`flex items-center gap-1.5 text-xs font-medium transition-all duration-300 ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
        {step}
      </span>
      {text}
    </span>
  );
}

export function UnlockModal({ isOpen, onClose, onUnlock }: UnlockModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [roundCount, setRoundCount] = useState(0);

  const handleGamePass = () => setStep(2);

  const handleCodeFail = () => {
    const next = roundCount + 1;
    setRoundCount(next);
    if (next >= 2) {
      setStep("troll");
    } else {
      setStep(1);
    }
  };

  const handleCodeSuccess = () => {
    onUnlock();
    handleClose();
  };

  const handleRetry = () => {
    setStep(1);
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStep(1);
      setRoundCount(0);
    }, 400);
  };

  const isTroll = step === "troll";

  const stepTitle = (() => {
    if (step === 1) return "Memory Game";
    if (step === 2) return "Nhập mã xác nhận";
    return "Gotcha! 💀";
  })();

  const CurrentIcon = isTroll ? STEP_CONFIG.troll.icon : STEP_CONFIG[step].icon;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-9999 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <motion.div
            className="absolute inset-0 bg-background/60 backdrop-blur-md"
            onClick={handleClose}
          />

          <motion.div
            className="relative w-full max-w-sm rounded-3xl border border-border/60 bg-card/90 backdrop-blur-xl shadow-2xl overflow-hidden"
            initial={{ scale: 0.88, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 16 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: isTroll
                  ? "radial-gradient(ellipse at 50% 0%, oklch(0.704 0.191 22.216 / 0.08), transparent 60%)"
                  : "radial-gradient(ellipse at 50% 0%, oklch(0.623 0.214 259.815 / 0.06), transparent 60%)",
              }}
            />

            <div className="relative px-6 pt-6 pb-5 flex items-start justify-between">
              <div>
                {!isTroll && (
                  <div className="flex items-center gap-2 mb-1">
                    <StepLabel current={step} step={1} text="Mini-game" />
                    <div className="w-8 h-px bg-border" />
                    <StepLabel current={step} step={2} text="Mã khoá" />
                  </div>
                )}
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mt-2">
                  <CurrentIcon className={`w-5 h-5 ${isTroll ? "text-rose-500" : "text-primary"}`} />
                  {stepTitle}
                </h2>
              </div>

              <button
                onClick={handleClose}
                className="rounded-full p-1.5 hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground mt-0.5 shrink-0"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 pb-6">
              <AnimatePresence mode="wait">
                {step === 1 && (
                  <motion.div key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
                    <MemoryGame onPass={handleGamePass} />
                  </motion.div>
                )}
                {step === 2 && (
                  <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.22 }}>
                    <CodeStep onFail={handleCodeFail} onSuccess={handleCodeSuccess} />
                  </motion.div>
                )}
                {step === "troll" && (
                  <motion.div key="troll" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                    <TrollScreen onRetry={handleRetry} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
