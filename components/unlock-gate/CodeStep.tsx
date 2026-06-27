"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { RefreshCw } from "lucide-react";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(): string {
  return Array.from(
    { length: 6 },
    () => CHARS[Math.floor(Math.random() * CHARS.length)]
  ).join("");
}

const SECRET = "NECRIS";

interface CodeStepProps {
  readonly onFail: () => void;
  readonly onSuccess: () => void;
}

export function CodeStep({ onFail, onSuccess }: CodeStepProps) {
  const [displayCode] = useState(makeCode);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "error" | "success">("idle");
  const [attempts, setAttempts] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (input.length < 1) return;

    if (input.toUpperCase() === SECRET) {
      setStatus("success");
      setTimeout(onSuccess, 600);
      return;
    }

    const next = attempts + 1;
    setAttempts(next);
    setStatus("error");
    setInput("");
    setTimeout(() => setStatus("idle"), 700);
    inputRef.current?.focus();
    setTimeout(onFail, 750);
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-4">
          Nhập lại đúng code bên dưới để mở khoá
        </p>

        <motion.div
          className="relative px-6 py-4 rounded-2xl border border-primary/30 bg-primary/5 backdrop-blur-sm"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
        >
          <div
            className="absolute inset-0 rounded-2xl opacity-20 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at center, oklch(0.623 0.214 259.815 / 0.3), transparent 70%)",
            }}
          />
          <span className="relative font-mono text-3xl font-bold tracking-[0.35em] text-primary select-none">
            {displayCode}
          </span>
        </motion.div>

        {attempts > 0 && status !== "success" && (
          <motion.p
            className="text-xs text-rose-500 mt-2"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Sai rồi! Thử lại xem~
          </motion.p>
        )}
        {status === "success" && (
          <motion.p
            className="text-xs text-emerald-500 mt-2"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
          >
            ✅ Chính xác!
          </motion.p>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col items-center gap-3 w-full max-w-xs"
      >
        <motion.input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nhập code..."
          autoComplete="off"
          spellCheck={false}
          className={`w-full text-center font-mono text-xl tracking-widest px-4 py-3 rounded-xl border bg-background/60 backdrop-blur-sm outline-none transition-all duration-200
            ${status === "error" ? "border-rose-500 text-rose-500" : ""}
            ${status === "success" ? "border-emerald-500 text-emerald-500" : ""}
            ${status === "idle" ? "border-border focus:border-primary" : ""}
          `}
          animate={status === "error" ? { x: [-8, 8, -8, 8, 0] } : { x: 0 }}
          transition={{ duration: 0.35 }}
          disabled={status === "success"}
        />

        <motion.button
          type="submit"
          disabled={input.length < 1 || status === "success"}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
          whileTap={{ scale: 0.97 }}
        >
          <RefreshCw className="w-4 h-4" />
          Xác nhận
        </motion.button>
      </form>
    </div>
  );
}
