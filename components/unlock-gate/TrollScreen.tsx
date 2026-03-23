"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface Particle {
  id: number;
  x: number;
  emoji: string;
  delay: number;
  duration: number;
  size: number;
  rotate: number;
}

const CONFETTI_EMOJIS = ["🎉", "🎊", "🥳", "✨", "🎈", "💥", "⭐", "🌟"];

function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: randomBetween(0, 100),
    emoji: CONFETTI_EMOJIS[Math.floor(Math.random() * CONFETTI_EMOJIS.length)],
    delay: randomBetween(0, 0.8),
    duration: randomBetween(1.8, 3.2),
    size: randomBetween(1.2, 2.2),
    rotate: randomBetween(-180, 180),
  }));
}

interface TrollScreenProps {
  readonly onRetry: () => void;
}

export function TrollScreen({ onRetry }: TrollScreenProps) {
  const [particles] = useState<Particle[]>(() => generateParticles(28));
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowContent(true), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative flex flex-col items-center gap-5 py-2 overflow-hidden min-h-52">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {particles.map(p => (
          <motion.span
            key={p.id}
            className="absolute top-0 select-none"
            style={{
              left: `${p.x}%`,
              fontSize: `${p.size}rem`,
            }}
            initial={{ y: -40, opacity: 1, rotate: 0 }}
            animate={{
              y: 340,
              opacity: [1, 1, 0],
              rotate: p.rotate,
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              ease: "easeIn",
              repeat: Infinity,
              repeatDelay: randomBetween(0.2, 1.2),
            }}
          >
            {p.emoji}
          </motion.span>
        ))}
      </div>

      {showContent && (
        <motion.div
          className="relative flex flex-col items-center gap-4 text-center"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
        >
          <motion.div
            className="text-7xl select-none"
            animate={{ rotate: [0, -10, 10, -10, 0] }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            😂
          </motion.div>

          <div>
            <p className="font-bold text-lg text-foreground mb-1">
              Troll mode activated! 💀
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              Nếu bạn muốn xem nội dung thật sự,{" "}
              <span className="text-foreground font-semibold">liên hệ Cris</span>{" "}
              trực tiếp nhé~
            </p>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/30">
            <span className="text-lg">👋</span>
            <span className="text-sm font-medium text-primary">
              Drop me a message!
            </span>
          </div>

          <button
            onClick={onRetry}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors mt-1"
          >
            Thử lại (spoiler: vẫn sẽ thất bại 😈)
          </button>
        </motion.div>
      )}
    </div>
  );
}
