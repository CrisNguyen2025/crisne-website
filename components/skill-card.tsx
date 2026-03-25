"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface SkillData {
  readonly name: string;
  readonly icon: React.ReactNode;
  readonly level: number;
  readonly color: string;
  readonly description: string;
}

interface SkillCardProps {
  readonly skill: SkillData;
  readonly index: number;
}

const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      delay: i * 0.08,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  }),
};

export function SkillCard({ skill, index }: SkillCardProps) {
  return (
    <motion.div
      custom={index}
      variants={cardVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
    >
      <motion.div
        className={cn(
          "group relative rounded-2xl border border-border/50 p-6",
          "bg-card/50 backdrop-blur-md",
          "hover:border-border/80 hover:shadow-2xl hover:shadow-black/8 dark:hover:shadow-black/30",
          "transition-all duration-500 ease-out cursor-default",
        )}
        whileHover={{ y: -6 }}
        transition={{
          type: "spring",
          stiffness: 200,
          damping: 24,
          mass: 0.8,
        }}
      >
        <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 ease-out bg-linear-to-br from-steel/6 via-transparent to-steel-light/6" />

        <div
          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 ease-out"
          style={{
            boxShadow: `inset 0 1px 0 0 ${skill.color}15, 0 0 0 1px ${skill.color}08`,
          }}
        />

        <div className="relative z-10">
          <div className="flex items-start justify-between mb-4">
            <motion.div
              className="p-3 rounded-xl bg-muted/70 border border-border/30 transition-colors duration-500 group-hover:bg-muted/90 group-hover:border-border/50"
              whileHover={{ rotate: [0, -6, 6, 0], scale: 1.05 }}
              transition={{ duration: 0.6, ease: "easeInOut" }}
            >
              {skill.icon}
            </motion.div>
            <span className="text-xs font-mono text-muted-foreground px-2 py-1 rounded-full bg-muted/50 transition-colors duration-500 group-hover:bg-muted/80">
              {skill.level}%
            </span>
          </div>

          <h3 className="text-lg font-semibold mb-2 transition-colors duration-400 group-hover:text-foreground">
            {skill.name}
          </h3>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            {skill.description}
          </p>

          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: `linear-gradient(90deg, ${skill.color}, ${skill.color}99, ${skill.color}66)`,
                backgroundSize: "200% 100%",
              }}
              initial={{ width: 0 }}
              whileInView={{ width: `${skill.level}%` }}
              viewport={{ once: true }}
              transition={{
                duration: 1.2,
                delay: 0.3 + index * 0.1,
                ease: [0.16, 1, 0.3, 1],
              }}
            />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
