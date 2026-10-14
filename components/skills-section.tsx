"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconCloud } from "@/components/ui/icon-cloud";
import { cn } from "@/lib/utils";

import { skills } from "./skills-data";

type ViewMode = "cloud" | "list";

const skillIconSizeClass =
  "[&_svg]:w-6 [&_svg]:h-6 sm:[&_svg]:w-7 sm:[&_svg]:h-7 [&_svg]:max-w-full [&_svg]:max-h-full";

function useResponsiveRadius() {
  const [radius, setRadius] = useState(210);

  useEffect(() => {
    function update() {
      const w = window.innerWidth;
      if (w < 480) setRadius(140);
      else if (w < 640) setRadius(160);
      else if (w < 768) setRadius(180);
      else if (w < 1024) setRadius(195);
      else setRadius(210);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return radius;
}

const tabVariants = {
  inactive: { scale: 1 },
  active: { scale: 1 },
};

const contentVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: { duration: 0.3 },
  },
};

const listItemVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.3,
      delay: i * 0.03,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
};

export function SkillsSection() {
  const [viewMode, setViewMode] = useState<ViewMode>("cloud");
  const cloudRadius = useResponsiveRadius();

  return (
    <section id="skills" className="relative section-padding">
      <div className="section-container">
        <motion.div
          className="text-center section-header-gap"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.span
            className="inline-block section-label mb-4"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            What I Work With
          </motion.span>
          <h2 className="heading-2 mb-4">
            Skills &{" "}
            <span className="heading-display-italic font-semibold bg-linear-to-r from-steel to-steel-light bg-clip-text text-transparent">
              Technologies
            </span>
          </h2>
          <p className="text-muted-foreground body-lg max-w-2xl mx-auto">
            Modern tools, scalable solutions. I combine a strong frontend focus
            with backend precision to build seamless, high-performance digital
            experiences.
          </p>
        </motion.div>

        <div className="flex items-center justify-center mb-6">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted/60 backdrop-blur-sm border border-border/40">
            {(["cloud", "list"] as const).map((mode) => (
              <motion.button
                key={mode}
                variants={tabVariants}
                animate={viewMode === mode ? "active" : "inactive"}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setViewMode(mode)}
                className={cn(
                  "relative px-5 py-2 rounded-lg text-sm font-medium transition-colors duration-300 cursor-pointer",
                  viewMode === mode
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground/80"
                )}
              >
                {viewMode === mode && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-background rounded-lg shadow-sm border border-border/50"
                    transition={{
                      type: "spring",
                      stiffness: 380,
                      damping: 30,
                    }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  {mode === "cloud" ? (
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-4 h-4"
                    >
                      <path d="M5.5 16a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 16h-8z" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-4 h-4"
                    >
                      <path
                        fillRule="evenodd"
                        d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                  {mode === "cloud" ? "Cloud" : "List"}
                </span>
              </motion.button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {viewMode === "cloud" ? (
            <motion.div
              key="cloud"
              variants={contentVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="flex items-center justify-center py-4 sm:py-6"
            >
              <IconCloud
                icons={skills.map((skill) => (
                  <div key={skill.name} className="relative group">
                    <div
                      className={cn(
                        "transition-transform duration-300 group-hover:scale-110",
                        skillIconSizeClass
                      )}
                      title={skill.name}
                    >
                      {skill.icon}
                    </div>
                  </div>
                ))}
                className="mx-auto"
                radius={cloudRadius}
                speed={0.3}
              />
            </motion.div>
          ) : (
            <motion.div
              key="list"
              variants={contentVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
            >
              {skills.map((skill, index) => (
                <motion.div
                  key={skill.name}
                  custom={index}
                  variants={listItemVariants}
                  initial="hidden"
                  animate="visible"
                  className={cn(
                    "group flex items-center gap-3 px-4 py-3 rounded-xl",
                    "bg-card/50 backdrop-blur-sm border border-border/40",
                    "hover:border-border/70 hover:bg-card/80 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20",
                    "transition-all duration-300 cursor-default"
                  )}
                  whileHover={{ y: -2, scale: 1.02 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 24,
                  }}
                >
                  <div
                    className="shrink-0 p-2 rounded-lg bg-muted/50 border border-border/30 transition-all duration-300 group-hover:bg-muted/80 group-hover:border-border/50"
                  >
                    <div className={cn("size-6 sm:size-7", skillIconSizeClass)}>
                      {skill.icon}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors duration-300 truncate">
                    {skill.name}
                  </span>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
