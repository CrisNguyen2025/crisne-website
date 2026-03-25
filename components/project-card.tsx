"use client";

import { motion } from "framer-motion";
import { ExternalLink, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProjectData {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly longDescription: string;
  readonly category: string;
  readonly year: string;
  readonly emoji: string;
  readonly gradient: [string, string];
  readonly techStack: string[];
  readonly images: string[];
  readonly highlights?: string[];
  readonly liveUrl?: string;
  readonly repoUrl?: string;
}

interface ProjectCardProps {
  readonly project: ProjectData;
  readonly index: number;
  readonly onViewDetail: (project: ProjectData) => void;
}

const cardVariants = {
  hidden: { opacity: 0, y: 50 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      delay: i * 0.1,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  }),
};

export function ProjectCard({
  project,
  index,
  onViewDetail,
}: ProjectCardProps) {
  return (
    <motion.div
      custom={index}
      variants={cardVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      className="flex"
    >
      <motion.div
        className={cn(
          "group relative flex flex-col w-full rounded-2xl border border-border/50 overflow-hidden",
          "bg-card/50 backdrop-blur-md",
          "hover:border-border/80 hover:shadow-2xl hover:shadow-black/8 dark:hover:shadow-black/30",
          "transition-all duration-500 ease-out cursor-pointer",
        )}
        whileHover={{ y: -8 }}
        transition={{
          type: "spring",
          stiffness: 200,
          damping: 24,
          mass: 0.8,
        }}
        onClick={() => onViewDetail(project)}
      >
        <div
          className="relative aspect-16/10 overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${project.gradient[0]}, ${project.gradient[1]})`,
          }}
        >
          <div className="absolute inset-0 bg-black/10 group-hover:bg-black/5 transition-colors duration-500" />

          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              className="text-5xl sm:text-6xl"
              whileHover={{ scale: 1.15, rotate: [0, -5, 5, 0] }}
              transition={{ duration: 0.6 }}
            >
              {project.emoji}
            </motion.div>
          </div>

          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-linear-to-t from-black/30 to-transparent" />

          <motion.div
            className="absolute top-3 right-3 p-2 rounded-full bg-white/20 backdrop-blur-md text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            whileHover={{ scale: 1.1 }}
          >
            <ArrowUpRight className="w-4 h-4" />
          </motion.div>
        </div>

        <div className="flex flex-col flex-1 p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <span
              className="px-2.5 py-0.5 text-[0.65rem] font-semibold rounded-full text-white uppercase tracking-wider"
              style={{
                background: `linear-gradient(135deg, ${project.gradient[0]}, ${project.gradient[1]})`,
              }}
            >
              {project.category}
            </span>
            <span className="text-xs font-mono text-muted-foreground">
              {project.year}
            </span>
          </div>

          <h3 className="text-lg font-bold mb-2 tracking-tight group-hover:text-foreground transition-colors duration-300">
            {project.title}
          </h3>

          <p className="text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-2 flex-1">
            {project.description}
          </p>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {project.techStack.slice(0, 4).map((tech) => (
              <span
                key={tech}
                className="px-2 py-0.5 text-[0.65rem] font-medium rounded-md bg-muted/60 border border-border/30 text-muted-foreground"
              >
                {tech}
              </span>
            ))}
            {project.techStack.length > 4 && (
              <span className="px-2 py-0.5 text-[0.65rem] font-medium rounded-md bg-muted/60 border border-border/30 text-muted-foreground">
                +{project.techStack.length - 4}
              </span>
            )}
          </div>

          <div className="flex items-center text-sm font-medium text-primary group-hover:gap-2 gap-1.5 transition-all duration-300 mt-auto">
            <span>View Details</span>
            <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-300" />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
