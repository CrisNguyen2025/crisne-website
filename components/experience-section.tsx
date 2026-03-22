"use client";

import { motion } from "framer-motion";
import { Briefcase, MapPin, Calendar, ExternalLink, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Experience {
  id: string;
  company: string;
  role: string;
  location: string;
  startDate: string;
  endDate: string | null;
  duration: string;
  isCurrent: boolean;
  description: string;
  technologies: string[];
  color: string;
  gradient: [string, string];
  emoji: string;
  companyUrl?: string;
}

const experiences: Experience[] = [
  {
    id: "exp-3",
    company: "TechVision Solutions",
    role: "Senior Frontend Developer",
    location: "Ho Chi Minh City, Vietnam",
    startDate: "Mar 2024",
    endDate: null,
    duration: "1 yr+",
    isCurrent: true,
    description:
      "Leading frontend architecture for enterprise SaaS platform. Building scalable design systems, mentoring junior developers, and driving technical decisions across multiple product teams.",
    technologies: ["React", "Next.js", "TypeScript", "Tailwind CSS", "GraphQL", "Storybook"],
    color: "#818cf8",
    gradient: ["#6366f1", "#a855f7"],
    emoji: "🚀",
    companyUrl: "#",
  },
  {
    id: "exp-2",
    company: "DigitalCraft Agency",
    role: "Frontend Developer",
    location: "Ho Chi Minh City, Vietnam",
    startDate: "Aug 2022",
    endDate: "Feb 2024",
    duration: "1 yr 7 mos",
    isCurrent: false,
    description:
      "Developed high-performance web applications for diverse clients. Implemented pixel-perfect UI from Figma designs, optimized Core Web Vitals, and collaborated closely with design and backend teams.",
    technologies: ["React", "Next.js", "TypeScript", "Styled Components", "Redux", "Jest"],
    color: "#fb7185",
    gradient: ["#f43f5e", "#ec4899"],
    emoji: "💼",
    companyUrl: "#",
  },
  {
    id: "exp-1",
    company: "StartupHub Inc.",
    role: "Junior Frontend Developer",
    location: "Ho Chi Minh City, Vietnam",
    startDate: "Jan 2021",
    endDate: "Jul 2022",
    duration: "1 yr 7 mos",
    isCurrent: false,
    description:
      "Built responsive user interfaces and interactive features for startup products. Learned agile development practices, participated in code reviews, and contributed to component library development.",
    technologies: ["React", "JavaScript", "SCSS", "Material UI", "Firebase"],
    color: "#22d3ee",
    gradient: ["#06b6d4", "#3b82f6"],
    emoji: "🌱",
    companyUrl: "#",
  },
];

const sectionVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.25,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  },
};

function TimelineDot({
  isCurrent,
  color,
  gradient,
  index,
  total,
}: {
  readonly isCurrent: boolean;
  readonly color: string;
  readonly gradient: [string, string];
  readonly index: number;
  readonly total: number;
}) {
  return (
    <div className="relative flex flex-col items-center z-10">
      {isCurrent ? (
        <motion.div
          className="relative flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14"
          initial={{ scale: 0 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
        >
          <span
            className="animate-ping absolute inline-flex h-10 w-10 sm:h-12 sm:w-12 rounded-full opacity-30"
            style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}
          />
          <span
            className="absolute inline-flex h-8 w-8 sm:h-10 sm:w-10 rounded-full opacity-15"
            style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}
          />
          <span
            className="relative inline-flex items-center justify-center rounded-full h-10 w-10 sm:h-12 sm:w-12 border-[3px] border-background shadow-xl text-lg sm:text-xl"
            style={{
              background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
              boxShadow: `0 0 30px ${color}50, 0 4px 20px ${color}30`,
            }}
          >
            {experiences[index].emoji}
          </span>
        </motion.div>
      ) : (
        <motion.div
          className="relative flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11"
          initial={{ scale: 0 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.3 + index * 0.1 }}
        >
          <span
            className="relative inline-flex items-center justify-center rounded-full h-10 w-10 sm:h-11 sm:w-11 border-[3px] border-background shadow-lg text-base sm:text-lg"
            style={{
              background: `linear-gradient(135deg, ${gradient[0]}90, ${gradient[1]}90)`,
              boxShadow: `0 0 15px ${color}20`,
            }}
          >
            {experiences[index].emoji}
          </span>
        </motion.div>
      )}

      {index < total - 1 && (
        <motion.div
          className="w-0.5 flex-1 min-h-16 rounded-full"
          style={{
            background: `linear-gradient(to bottom, ${color}60, ${color}15)`,
          }}
          initial={{ scaleY: 0, originY: 0 }}
          whileInView={{ scaleY: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.5 + index * 0.2, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
    </div>
  );
}

function ExperienceCard({
  experience,
  index,
  total,
}: {
  readonly experience: Experience;
  readonly index: number;
  readonly total: number;
}) {
  return (
    <motion.div variants={itemVariants} className="relative group">
      <div className="flex gap-4 sm:gap-6">
        <TimelineDot
          isCurrent={experience.isCurrent}
          color={experience.color}
          gradient={experience.gradient}
          index={index}
          total={total}
        />

        <div className="flex-1 pb-8 sm:pb-10">
          <motion.div
            className={cn(
              "relative overflow-hidden rounded-2xl border transition-all duration-500",
              "bg-card/40 backdrop-blur-md border-border/40",
              "hover:border-border/80 hover:shadow-2xl",
              experience.isCurrent && "border-border/60",
            )}
            style={{
              boxShadow: experience.isCurrent
                ? `0 8px 40px ${experience.color}15, 0 0 0 1px ${experience.color}10`
                : undefined,
            }}
            whileHover={{
              y: -4,
              transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
            }}
          >
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
              style={{
                background: `radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), ${experience.color}06, transparent 60%)`,
              }}
            />

            <div
              className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
              style={{
                background: experience.isCurrent
                  ? `linear-gradient(90deg, ${experience.gradient[0]}, ${experience.gradient[1]}, transparent)`
                  : `linear-gradient(90deg, ${experience.color}40, transparent 60%)`,
              }}
            />

            <div className="relative p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center flex-wrap gap-2 mb-1.5">
                    <h3 className="text-lg sm:text-xl font-bold text-foreground">
                      {experience.role}
                    </h3>
                    {experience.isCurrent && (
                      <motion.span
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
                        style={{
                          background: `linear-gradient(135deg, ${experience.gradient[0]}, ${experience.gradient[1]})`,
                        }}
                        animate={{ boxShadow: [`0 0 8px ${experience.color}40`, `0 0 16px ${experience.color}60`, `0 0 8px ${experience.color}40`] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                        </span>
                        Current
                      </motion.span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {experience.companyUrl ? (
                      <a
                        href={experience.companyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-sm hover:opacity-80 transition-opacity inline-flex items-center gap-1.5 group/link"
                        style={{ color: experience.color }}
                      >
                        <Briefcase className="w-3.5 h-3.5" />
                        {experience.company}
                        <ExternalLink className="w-3 h-3 opacity-40 group-hover/link:opacity-80 transition-opacity" />
                      </a>
                    ) : (
                      <span
                        className="font-semibold text-sm inline-flex items-center gap-1.5"
                        style={{ color: experience.color }}
                      >
                        <Briefcase className="w-3.5 h-3.5" />
                        {experience.company}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" />
                    {experience.startDate} — {experience.endDate ?? "Present"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5" />
                    {experience.location}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border"
                    style={{
                      color: experience.color,
                      borderColor: `${experience.color}30`,
                      backgroundColor: `${experience.color}08`,
                    }}
                  >
                    <TrendingUp className="w-3 h-3" />
                    {experience.duration}
                  </span>
                </div>
              </div>

              <p className="text-muted-foreground text-sm leading-relaxed mb-5">
                {experience.description}
              </p>

              <div className="flex flex-wrap gap-1.5">
                {experience.technologies.map((tech, i) => (
                  <motion.span
                    key={tech}
                    className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border backdrop-blur-sm transition-colors"
                    style={{
                      borderColor: `${experience.color}20`,
                      color: experience.color,
                      backgroundColor: `${experience.color}08`,
                    }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5 + i * 0.05 }}
                    whileHover={{
                      scale: 1.05,
                      backgroundColor: `${experience.color}15`,
                    }}
                  >
                    {tech}
                  </motion.span>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

export function ExperienceSection() {
  return (
    <section id="experience" className="relative py-7 sm:py-10 px-6 overflow-hidden">
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-160 h-160 rounded-full opacity-[0.03] pointer-events-none"
        style={{
          background: "radial-gradient(circle, oklch(0.623 0.214 259.815), transparent 70%)",
        }}
      />

      <div className="max-w-4xl mx-auto relative">
        <motion.div
          className="text-center mb-16 sm:mb-20"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.span
            className="inline-block text-sm font-mono text-muted-foreground tracking-widest uppercase mb-4"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
          >
            Career Journey
          </motion.span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Work{" "}
            <span className="bg-linear-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              Experience
            </span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            My professional journey as a frontend developer.
            Growing with each role, one project at a time.
          </p>

          <motion.div
            className="flex items-center justify-center gap-3 mt-6 text-sm text-muted-foreground"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
          >
            <span className="px-3 py-1 rounded-full bg-muted/60 border border-border/50 font-mono text-xs">
              Jan 2021
            </span>
            <div className="flex items-center gap-1">
              <span className="w-8 h-px bg-border" />
              <span className="w-2 h-px bg-border" />
              <span className="w-1.5 h-px bg-border" />
            </div>
            <span className="px-3 py-1 rounded-full bg-primary/10 border border-primary/30 font-mono text-xs text-primary font-semibold">
              Present
            </span>
          </motion.div>
        </motion.div>

        <motion.div
          variants={sectionVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {experiences.map((experience, index) => (
            <ExperienceCard
              key={experience.id}
              experience={experience}
              index={index}
              total={experiences.length}
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
