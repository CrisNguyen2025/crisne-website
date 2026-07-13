"use client";

import { motion } from "framer-motion";
import { useEffect, useState, useCallback, useRef } from "react";
import { Download } from "lucide-react";
import { SparklesText } from "@/components/ui/sparkles-text";
import { trackDownloadCV } from "@/lib/analytics";
import { MOBILE_VIEWPORT_QUERY, useMediaQuery } from "@/hooks/use-media-query";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const titles = ["Fullstack Developer(FE Strong)", "React/Next.js Specialist"];
const SPARKLE_COLORS = { first: "#6B9AC4", second: "#8BB5D9" } as const;

function useTypingEffect(
  texts: string[],
  isEnabled: boolean,
  typingSpeed = 80,
  deletingSpeed = 50,
  pauseTime = 2000
) {
  const [displayText, setDisplayText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  const tick = useCallback(() => {
    const currentText = texts[currentIndex];

    if (isDeleting) {
      if (displayText.length === 0) {
        setIsDeleting(false);
        setCurrentIndex((prev) => (prev + 1) % texts.length);
        return;
      }

      setDisplayText(currentText.substring(0, displayText.length - 1));
    } else {
      setDisplayText(currentText.substring(0, displayText.length + 1));
    }
  }, [displayText, currentIndex, isDeleting, texts]);

  useEffect(() => {
    if (!isEnabled) return;

    const currentText = texts[currentIndex];
    const hasFinishedTyping =
      !isDeleting && displayText.length === currentText.length;
    const delay = hasFinishedTyping
      ? pauseTime
      : isDeleting
        ? deletingSpeed
        : typingSpeed;
    const timer = setTimeout(() => {
      if (hasFinishedTyping) {
        setIsDeleting(true);
        return;
      }

      tick();
    }, delay);
    return () => clearTimeout(timer);
  }, [
    currentIndex,
    deletingSpeed,
    displayText.length,
    isDeleting,
    isEnabled,
    pauseTime,
    texts,
    tick,
    typingSpeed,
  ]);

  return isEnabled ? displayText : texts[0];
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.3,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  },
};

const stats = [
  { end: 5, suffix: "+", label: "Years Experience" },
  { end: 10, suffix: "+", label: "Projects Delivered" },
  { end: 20, suffix: "+", label: "Technologies" },
];

function useCountUp(end: number, duration = 1800) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setStarted(true);
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * end));
      if (progress < 1) requestAnimationFrame(step);
      else setCount(end);
    };
    const raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [started, end, duration]);

  return { count, ref };
}

function CountUpStat({
  end,
  suffix,
  label,
}: {
  readonly end: number;
  readonly suffix: string;
  readonly label: string;
}) {
  const { count, ref } = useCountUp(end);
  return (
    <div ref={ref} className="text-center">
      <div className="text-2xl sm:text-3xl font-bold bg-linear-to-r from-steel to-steel-light bg-clip-text text-transparent tabular-nums">
        {count}
        {suffix}
      </div>
      <div className="text-xs sm:text-sm text-muted-foreground mt-1">
        {label}
      </div>
    </div>
  );
}

export function HeroSection() {
  const isMobile = useMediaQuery(MOBILE_VIEWPORT_QUERY);
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimateText = !isMobile && !prefersReducedMotion;
  const typedText = useTypingEffect(titles, shouldAnimateText);

  return (
    <section className="relative flex min-h-svh items-center justify-center overflow-hidden px-4 pb-8 pt-20 sm:min-h-screen sm:px-6 sm:py-16">
      <motion.div
        className="z-10 mx-auto w-full max-w-4xl text-center"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants} className="mb-4 sm:mb-6">
          <motion.div
            className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-md sm:px-4 sm:py-2 sm:text-sm"
            whileHover={{ scale: 1.05 }}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-steel-light opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-steel" />
            </span>
            {"Available for work"}
          </motion.div>
        </motion.div>

        <motion.h1
          variants={itemVariants}
          className="mb-4 text-4xl font-bold leading-tight tracking-tight sm:mb-6 sm:text-6xl md:text-7xl lg:text-8xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <span
            className="block font-light italic"
            style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}
          >
            Hi, I&apos;m
          </span>
          <SparklesText
            className="inline-block text-5xl sm:text-7xl md:text-8xl lg:text-9xl"
            sparklesCount={6}
            delayMs={0}
            colors={SPARKLE_COLORS}
          >
            Cris
          </SparklesText>{" "}
          <SparklesText
            className="inline-block text-5xl sm:text-7xl md:text-8xl lg:text-9xl"
            sparklesCount={6}
            delayMs={350}
            colors={SPARKLE_COLORS}
          >
            Nguyen
          </SparklesText>
        </motion.h1>

        <motion.div
          variants={itemVariants}
          className="mb-5 flex min-h-12 items-center justify-center px-2 text-base leading-snug text-muted-foreground sm:mb-8 sm:h-10 sm:min-h-0 sm:px-0 sm:text-2xl md:text-3xl"
        >
          <span className="font-mono">
            {typedText}
            {shouldAnimateText && (
              <motion.span
                className="ml-1 inline-block h-[1.2em] w-[3px] bg-foreground align-middle"
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
            )}
          </span>
        </motion.div>

        <motion.p
          variants={itemVariants}
          className="mx-auto mb-6 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:mb-8 sm:text-lg"
        >
          Building scalable, high-performance web solutions. Specialized in{" "}
          <span className="text-foreground font-medium">React</span>,{" "}
          <span className="text-foreground font-medium">Next.js</span>, and{" "}
          <span className="text-foreground font-medium">TypeScript</span> with a
          focus on SaaS products, enterprise CMS, CRM, HRM, and booking systems.
        </motion.p>

        <motion.div
          variants={itemVariants}
          className="mb-8 flex justify-center sm:mb-12"
        >
          <motion.a
            href="/cris-nguyen-cv.pdf"
            download="Cris_Nguyen_CV.pdf"
            className="group inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-linear-to-r from-steel to-steel-light text-white font-medium text-sm shadow-lg shadow-steel/25 hover:shadow-xl hover:shadow-steel/30 transition-shadow duration-300"
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              trackDownloadCV();
            }}
          >
            <Download className="w-4 h-4 transition-transform duration-300 group-hover:translate-y-0.5" />
            Download CV
          </motion.a>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="grid w-full grid-cols-3 items-start gap-3 sm:flex sm:items-center sm:justify-center sm:gap-12"
        >
          {stats.map(({ end, suffix, label }) => (
            <CountUpStat key={label} end={end} suffix={suffix} label={label} />
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}
