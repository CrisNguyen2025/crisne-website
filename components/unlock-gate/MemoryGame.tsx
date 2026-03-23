"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback, useRef, useEffect } from "react";

const COLORS = [
  { id: 0, bg: "bg-indigo-500", glow: "#6366f1", label: "indigo" },
  { id: 1, bg: "bg-rose-500", glow: "#f43f5e", label: "rose" },
  { id: 2, bg: "bg-cyan-400", glow: "#22d3ee", label: "cyan" },
  { id: 3, bg: "bg-amber-400", glow: "#fbbf24", label: "amber" },
] as const;

const SEQUENCE_LENGTH = 4;
const DOT_KEYS = ["dot-0", "dot-1", "dot-2", "dot-3"] as const;

function randomSequence(): number[] {
  return Array.from({ length: SEQUENCE_LENGTH }, () => Math.floor(Math.random() * 4));
}

interface MemoryGameProps {
  readonly onPass: () => void;
}

type Phase = "showing" | "input" | "error" | "done";

function phaseLabel(phase: Phase, progress: number): string {
  if (phase === "showing") return "👀 Ghi nhớ thứ tự...";
  if (phase === "input") return `🖱️ Lặp lại thứ tự (${progress}/${SEQUENCE_LENGTH})`;
  if (phase === "error") return "❌ Sai rồi! Thử lại...";
  return "✅ Hoàn thành!";
}

function buttonOpacity(isActive: boolean, isInput: boolean): number {
  if (isActive) return 1;
  return isInput ? 0.85 : 0.65;
}

function buttonStyle(glow: string, isActive: boolean, phase: Phase) {
  return {
    borderColor: isActive ? "white" : "transparent",
    boxShadow: isActive ? `0 0 24px 4px ${glow}80` : `0 2px 12px ${glow}20`,
    opacity: buttonOpacity(isActive, phase === "input"),
  };
}

function playSequence(
  seq: number[],
  setActive: (v: number | null) => void,
  onFinish: () => void,
) {
  let step = 0;
  const next = () => {
    if (step >= seq.length) { onFinish(); return; }
    setActive(seq[step]);
    setTimeout(() => {
      setActive(null);
      step++;
      setTimeout(next, 250);
    }, 600);
  };
  setTimeout(next, 600);
}

export function MemoryGame({ onPass }: MemoryGameProps) {
  const [seq, setSeq] = useState<number[]>(() => randomSequence());
  const [userInput, setUserInput] = useState<number[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("showing");
  const [shakeKey, setShakeKey] = useState(0);
  const roundRef = useRef(0);

  const runRound = useCallback((sequence: number[]) => {
    roundRef.current += 1;
    const round = roundRef.current;
    playSequence(sequence, setActiveId, () => {
      if (round === roundRef.current) setPhase("input");
    });
  }, []);

  useEffect(() => {
    runRound(seq);
  }, [runRound, seq]);

  const restart = () => {
    const next = randomSequence();
    setSeq(next);
    setUserInput([]);
    setPhase("showing");
  };

  const handleClick = (id: number) => {
    if (phase !== "input") return;

    setActiveId(id);
    setTimeout(() => setActiveId(null), 200);

    const next = [...userInput, id];
    const pos = next.length - 1;

    if (next[pos] !== seq[pos]) {
      setPhase("error");
      setShakeKey(k => k + 1);
      setTimeout(restart, 900);
      return;
    }

    if (next.length === seq.length) {
      setPhase("done");
      setTimeout(onPass, 350);
      return;
    }

    setUserInput(next);
  };

  const progress = phase === "input" ? userInput.length : 0;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-1">{phaseLabel(phase, progress)}</p>
        <div className="flex gap-1.5 justify-center mt-2">
          {DOT_KEYS.map((key, i) => (
            <div
              key={key}
              className={`h-1.5 w-6 rounded-full transition-all duration-300 ${i < progress ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>
      </div>

      <motion.div
        key={shakeKey}
        animate={phase === "error" ? { x: [-6, 6, -6, 6, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        className="grid grid-cols-2 gap-3"
      >
        {COLORS.map(color => (
          <motion.button
            key={color.label}
            className={`relative w-24 h-24 rounded-2xl ${color.bg} border-2 transition-all duration-150 ${
              phase === "input" ? "cursor-pointer hover:scale-105 active:scale-95" : "cursor-default"
            }`}
            style={buttonStyle(color.glow, activeId === color.id, phase)}
            animate={{ scale: activeId === color.id ? 1.08 : 1 }}
            transition={{ duration: 0.12 }}
            onClick={() => handleClick(color.id)}
            disabled={phase !== "input"}
            aria-label={color.label}
          />
        ))}
      </motion.div>

      <AnimatePresence>
        {phase === "showing" && (
          <motion.p
            key="hint"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs text-muted-foreground"
          >
            Đừng click trong lúc xem nhé...
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
