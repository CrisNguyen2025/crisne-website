"use client";

import { motion } from "framer-motion";
import { Briefcase, MapPin, Calendar, ExternalLink, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface Experience {
  id: string;
  company: string;
  role: string;
  location: string;
  startDate: string;
  endDate: string | null;
  duration: string;
  teamSize: string;
  isCurrent: boolean;
  description: string;
  technologies: string[];
  phases?: {
    title: string;
    description: string;
    technologies: string[];
  }[];
  color: string;
  gradient: [string, string];
  emoji: string;
  companyUrl?: string;
}

const experiences: Experience[] = [
  {
    id: "exp-4",
    company: "Smartbit Technology",
    role: "Middle Frontend Developer",
    location: "Ho Chi Minh City, Vietnam",
    startDate: "Mar 2024",
    endDate: null,
    duration: "1 yr+",
    teamSize: "10 members",
    isCurrent: true,
    description:
      "• FO: Built SEO-optimized customer-facing pages with Next.js App Router, improving discoverability, landing page performance, and conversion flows. Integrated eKYC, Paystack payment flows, and other product onboarding/payment touchpoints to support seamless user activation.\n• CMS: Developed detailed management modules for business entities, dynamic content, configurable forms, and RBAC-based permission settings so internal teams could control operational data safely and efficiently.\n• BO: Built back-office features for internal operations, including admin configuration, workflow handling, monitoring screens, and data processing tools that supported day-to-day business execution at scale.\n• SaaS / Multi-tenant: Worked on shared-platform capabilities for multiple client organizations, helping implement configurable tenant-specific flows, permission models, and management experiences while keeping the product scalable and maintainable.",
    technologies: [
      "ReactJS",
      "Next.js 13+",
      "TypeScript",
      "Tailwind CSS",
      "React Query",
      "Zustand",
      "Axios",
      "Ant Design",
      "React Hook Form",
      "Yup",
      "eKYC",
      "Paystack",
      "RBAC",
    ],
    color: "#2563eb",
    gradient: ["#1d4ed8", "#06b6d4"],
    emoji: "💼",
    companyUrl: "#",
  },
  {
    id: "exp-javis",
    company: "JAVIS",
    role: "Middle Frontend Developer",
    location: "Remote - Ha Noi, Vietnam",
    startDate: "Jun 2025",
    endDate: "August 2025",
    duration: "August 2025",
    teamSize: "4 members",
    isCurrent: false,
    description:
      "Built a 3D tile simulation web app where users visualize tile patterns on a Unity-powered house model, calculate surface area and tile quantity, and generate quotations directly in the UI.",
    technologies: [
      "Next.js 13+",
      "React Query",
      "Zustand",
      "Axios",
      "Ant Design",
      "Tailwind CSS",
      "TypeScript",
      "Yup",
    ],
    color: "#9333ea",
    gradient: ["#7e22ce", "#d946ef"],
    emoji: "🧩",
    companyUrl: "#",
  },
  {
    id: "exp-bearabyte",
    company: "BearaByte",
    role: "Software Engineer (Frontend & Mobile)",
    location: "Remote - US",
    startDate: "Jul 2024",
    endDate: "May 2025",
    duration: "11 mos",
    teamSize: "4 members",
    isCurrent: false,
    description:
      "Worked across Zelene Spa web, CMS dashboard, BE team, and mobile booking products, covering customer-facing booking flows and internal management experiences.",
    technologies: [
      "ReactJS",
      "Next.js 13+",
      "React Native",
      "Expo",
      "React Query",
      "Zustand",
      "Redux Toolkit",
      "Ant Design",
      "Tailwind CSS",
      "NativeWind",
      "TypeScript",
      "React Hook Form",
      "Yup",
      "NestJS",
      "Strapi CMS",
      "Socket.io",
      "GA4",
      "Clover",
    ],
    phases: [
      {
        title: "Phase 1 — Spa Booking Website + CMS Dashboard",
        description:
          "Developed the frontend booking pages for spa customers and built CMS/dashboard features to help the operations team manage content, bookings, related business workflows, and payment handling with Clover integration.",
        technologies: [
          "ReactJS",
          "Next.js 13+",
          "React Query",
          "Zustand",
          "Ant Design",
          "Tailwind CSS",
          "TypeScript",
          "Yup",
          "NestJS",
          "GA4",
          "Socket.io",
          "Clover",
        ],
      },
      {
        title: "Phase 2 — Mobile Booking App",
        description:
          "Built a React Native Expo mobile application so customers could browse services, complete spa bookings, and continue payment-related flows directly on mobile devices.",
        technologies: [
          "React Native",
          "Expo",
          "React Query",
          "React Hook Form",
          "Zustand",
          "NativeWind",
          "TypeScript",
          "Clover",
        ],
      },
    ],
    color: "#ea580c",
    gradient: ["#c2410c", "#f97316"],
    emoji: "📱",
    companyUrl: "#",
  },
  {
    id: "exp-kamala-v2",
    company: "Kamala",
    role: "Software Engineer (Frontend & Mobile)",
    location: "Ho Chi Minh City, Vietnam",
    startDate: "Jan 2023",
    endDate: "Jun 2024",
    duration: "1 yr 6 mos",
    teamSize: "4-5 members",
    isCurrent: false,
    description:
      "Worked across two Kamala product phases, covering content platform development, mobile sales support, and booking tour website delivery.",
    technologies: [
      "ReactJS",
      "Next.js 12",
      "Next.js 13+",
      "React Native",
      "Expo",
      "Node.js",
      "React Query",
      "Mantine UI",
      "Tailwind CSS",
      "TypeScript",
      "TanStack Table",
      "Strapi CMS",
    ],
    phases: [
      {
        title: "Phase 1 — Kamala News + Sales Support Mobile App",
        description:
          "Built and optimized the Kamala News content platform, and additionally developed a mobile app to support the sales team in searching product information quickly during customer consulting and selling.",
        technologies: [
          "ReactJS",
          "Next.js 12",
          "React Native",
          "Expo",
          "React Query",
          "Axios",
          "Tiptap",
          "Strapi CMS v4",
          "Mantine UI",
          "Dnd-kit",
          "TanStack Table",
          "Node.js",
        ],
      },
      {
        title: "Phase 2 — Booking Tour Website",
        description:
          "Continued with the booking tour website, keeping the focus on responsive UI development, dynamic content workflows, API integration, performance, and SEO improvements.",
        technologies: [
          "Next.js 13+",
          "ReactJS",
          "Node.js",
          "React Query",
          "Zustand",
          "Redux Toolkit",
          "Mantine UI",
          "Tailwind CSS",
          "TypeScript",
          "TanStack Table",
          "Strapi CMS",
        ],
      },
    ],
    color: "#14b8a6",
    gradient: ["#0f766e", "#2dd4bf"],
    emoji: "🗂️",
    companyUrl: "#",
  },

  {
    id: "exp-r2s",
    company: "R2S Academy",
    role: "Software Engineer Intern",
    location: "Ho Chi Minh City, Vietnam",
    startDate: "May 2022",
    endDate: "Dec 2022",
    duration: "8 mos",
    teamSize: "5 members",
    isCurrent: false,
    description:
      "Developed a web-based apartment management system for resident information, event registration, delivery notifications, and internal communication to improve coordination between residents and building management.",
    technologies: [
      "ReactJS",
      "Ant Design",
      "Node.js",
      "PostgreSQL",
      "SourceTree",
      "Postman",
      "Github",
    ],
    color: "#84cc16",
    gradient: ["#65a30d", "#a3e635"],
    emoji: "🧱",
    companyUrl: "#",
  },
  {
    id: "exp-fujinet",
    company: "FUJINET SYSTEMS JSC",
    role: "Backend Developer Intern",
    location: "Ho Chi Minh City, Vietnam",
    startDate: "Jan 2022",
    endDate: "Apr 2022",
    duration: "4 mos",
    teamSize: "4 members",
    isCurrent: false,
    description:
      "Adjusted application templates and database structure to match Japanese client requirements while ensuring compatibility with their standards and future enhancements.",
    technologies: ["VB.NET", "SQL Server", "GitLab"],
    color: "#64748b",
    gradient: ["#475569", "#94a3b8"],
    emoji: "⚙️",
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
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 15,
            delay: 0.2,
          }}
        >
          <span
            className="animate-ping absolute inline-flex h-10 w-10 sm:h-12 sm:w-12 rounded-full opacity-30"
            style={{
              background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
            }}
          />
          <span
            className="absolute inline-flex h-8 w-8 sm:h-10 sm:w-10 rounded-full opacity-15"
            style={{
              background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
            }}
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
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 15,
            delay: 0.3 + index * 0.1,
          }}
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
          transition={{
            duration: 0.8,
            delay: 0.5 + index * 0.2,
            ease: [0.22, 1, 0.36, 1],
          }}
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
              experience.isCurrent
                ? "bg-card/80 backdrop-blur-xl border-primary/45 ring-1 ring-primary/20"
                : "bg-card/45 backdrop-blur-md border-border/45",
              "hover:border-border/80 hover:shadow-2xl"
            )}
            style={{
              boxShadow: experience.isCurrent
                ? `0 18px 60px ${experience.color}28, 0 0 0 1px ${experience.color}30, inset 0 1px 0 ${experience.gradient[1]}22`
                : undefined,
            }}
            whileHover={{
              y: -4,
              transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
            }}
          >
            <div
              className={cn(
                "absolute inset-0 transition-opacity duration-500 pointer-events-none",
                experience.isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
              style={{
                background: experience.isCurrent
                  ? `linear-gradient(135deg, ${experience.color}14, transparent 45%), radial-gradient(700px circle at 10% 0%, ${experience.gradient[1]}18, transparent 55%)`
                  : `radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), ${experience.color}08, transparent 60%)`,
              }}
            />

            <div
              className={cn(
                "absolute top-0 left-0 right-0 rounded-t-2xl",
                experience.isCurrent ? "h-1.5" : "h-1"
              )}
              style={{
                background: experience.isCurrent
                  ? `linear-gradient(90deg, ${experience.gradient[0]}, ${experience.gradient[1]}, ${experience.gradient[0]})`
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
                        animate={{
                          boxShadow: [
                            `0 0 8px ${experience.color}40`,
                            `0 0 16px ${experience.color}60`,
                            `0 0 8px ${experience.color}40`,
                          ],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      >
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                        </span>
                        Current
                      </motion.span>
                    )}
                  </div>
                  <div className="flex items-center flex-wrap gap-1.5 text-sm">
                    {experience.companyUrl ? (
                      <a
                        href={experience.companyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold hover:opacity-80 transition-opacity inline-flex items-center gap-1.5 group/link"
                        style={{ color: experience.color }}
                      >
                        <Briefcase className="w-3.5 h-3.5" />
                        {experience.company}
                        <ExternalLink className="w-3 h-3 opacity-40 group-hover/link:opacity-80 transition-opacity" />
                      </a>
                    ) : (
                      <span
                        className="font-semibold inline-flex items-center gap-1.5"
                        style={{ color: experience.color }}
                      >
                        <Briefcase className="w-3.5 h-3.5" />
                        {experience.company}
                      </span>
                    )}
                    <span className="text-muted-foreground">-</span>
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Users className="w-3.5 h-3.5" />
                      {experience.teamSize}
                    </span>
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
                </div>
              </div>

              <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line mb-5">
                {experience.description}
              </p>

              {experience.phases?.length ? (
                <div className="space-y-4">
                  {experience.phases.map((phase, phaseIndex) => (
                    <div
                      key={phase.title}
                      className="rounded-xl border p-4"
                      style={{
                        borderColor: `${experience.color}20`,
                        backgroundColor: `${experience.color}06`,
                      }}
                    >
                      <h4 className="mb-2 text-sm font-semibold text-foreground">
                        {phase.title}
                      </h4>
                      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
                        {phase.description}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {phase.technologies.map((tech, techIndex) => (
                          <motion.span
                            key={`${phase.title}-${tech}`}
                            className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border backdrop-blur-sm transition-colors"
                            style={{
                              borderColor: `${experience.color}20`,
                              color: experience.color,
                              backgroundColor: `${experience.color}08`,
                            }}
                            initial={{ opacity: 0, scale: 0.8 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{
                              delay: 0.4 + phaseIndex * 0.1 + techIndex * 0.04,
                            }}
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
                  ))}
                </div>
              ) : (
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
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

export function ExperienceSection() {
  return (
    <section
      id="experience"
      className="relative section-padding overflow-hidden"
    >
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-160 h-160 rounded-full opacity-[0.03] pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, oklch(0.78 0.1 72), transparent 70%)",
        }}
      />

      <div className="section-container-sm mx-auto relative">
        <motion.div
          className="text-center section-header-gap"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.span
            className="inline-block section-label mb-4"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
          >
            Career Journey
          </motion.span>
          <h2 className="heading-2 mb-4">
            Work{" "}
            <span className="heading-display-italic font-semibold bg-linear-to-r from-steel to-steel-light bg-clip-text text-transparent">
              Experience
            </span>
          </h2>
          <p className="text-muted-foreground body-lg max-w-2xl mx-auto">
            Fullstack Developer specializing in Frontend craftsmanship.
            Delivering high-performance applications with end-to-end expertise.
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
