"use client";

import { motion } from "framer-motion";
import { useEffect, useState, useCallback, useRef } from "react";
import { Download } from "lucide-react";
import { SparklesText } from "@/components/ui/sparkles-text";
import { trackDownloadCV } from "@/lib/analytics";

const titles = [
  "Frontend Developer",
  "UI/UX Enthusiast",
  "React Specialist",
  "Next.js Developer",
  "Creative Coder",
];

function useTypingEffect(
  texts: string[],
  typingSpeed = 80,
  deletingSpeed = 50,
  pauseTime = 2000,
) {
  const [displayText, setDisplayText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  const tick = useCallback(() => {
    const currentText = texts[currentIndex];

    if (isDeleting) {
      setDisplayText(currentText.substring(0, displayText.length - 1));
      if (displayText.length === 0) {
        setIsDeleting(false);
        setCurrentIndex((prev) => (prev + 1) % texts.length);
        return;
      }
    } else {
      setDisplayText(currentText.substring(0, displayText.length + 1));
      if (displayText.length === currentText.length) {
        setTimeout(() => setIsDeleting(true), pauseTime);
        return;
      }
    }
  }, [displayText, currentIndex, isDeleting, texts, pauseTime]);

  useEffect(() => {
    const speed = isDeleting ? deletingSpeed : typingSpeed;
    const timer = setTimeout(tick, speed);
    return () => clearTimeout(timer);
  }, [tick, isDeleting, deletingSpeed, typingSpeed]);

  return displayText;
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
  { end: 20, suffix: "+", label: "Projects Delivered" },
  { end: 10, suffix: "+", label: "Technologies" },
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
      { threshold: 0.5 },
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
  const typedText = useTypingEffect(titles);

  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden">
      <motion.div
        className="max-w-4xl mx-auto text-center z-10"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants} className="mb-6">
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/60 backdrop-blur-md border border-border/50 text-sm text-muted-foreground"
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
          className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.2] mb-6"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <span
            className="block font-light italic"
            style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}
          >
            Hi, I&apos;m
          </span>
          <SparklesText
            className="inline-block text-6xl sm:text-7xl md:text-8xl lg:text-9xl"
            sparklesCount={6}
            delayMs={0}
            colors={{ first: "#6B9AC4", second: "#8BB5D9" }}
          >
            Cris
          </SparklesText>{" "}
          <SparklesText
            className="inline-block text-6xl sm:text-7xl md:text-8xl lg:text-9xl"
            sparklesCount={6}
            delayMs={350}
            colors={{ first: "#6B9AC4", second: "#8BB5D9" }}
          >
            Nguyen
          </SparklesText>
        </motion.h1>

        <motion.div
          variants={itemVariants}
          className="text-xl sm:text-2xl md:text-3xl text-muted-foreground mb-8 h-10 flex items-center justify-center"
        >
          <span className="font-mono">
            {typedText}
            <motion.span
              className="inline-block w-[3px] h-[1.2em] bg-foreground ml-1 align-middle"
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
          </span>
        </motion.div>

        <motion.p
          variants={itemVariants}
          className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed"
        >
          I craft modern, performant web experiences with{" "}
          <span className="text-foreground font-medium">React</span>,{" "}
          <span className="text-foreground font-medium">Next.js</span>, and{" "}
          <span className="text-foreground font-medium">TypeScript</span>.
          Passionate about clean code, beautiful interfaces, and seamless user
          experiences.
        </motion.p>

        <motion.div
          variants={itemVariants}
          className="flex justify-center mb-12"
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
          className="flex items-center justify-center gap-8 sm:gap-12"
        >
          {stats.map(({ end, suffix, label }) => (
            <CountUpStat key={label} end={end} suffix={suffix} label={label} />
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}
