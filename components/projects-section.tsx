"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { ProjectCard, type ProjectData } from "@/components/project-card";
import { ProjectDetailModal } from "@/components/project-detail-modal";

const projects: ProjectData[] = [
  {
    id: "project-1",
    title: "Project Name 1",
    description:
      "A brief description of the project goes here. This should summarize the key purpose.",
    longDescription:
      "A more detailed description of the project. Explain the problem it solves, the approach taken, and the outcome achieved. This is the full story behind the project that users will see when they click on the detail modal.",
    category: "Web App",
    year: "2025",
    emoji: "🚀",
    gradient: ["#4A7A9B", "#6B9AC4"],
    techStack: ["React", "Next.js", "TypeScript", "Tailwind CSS", "Prisma"],
    images: [
      "https://picsum.photos/seed/p1a/800/450",
      "https://picsum.photos/seed/p1b/800/450",
      "https://picsum.photos/seed/p1c/800/450",
    ],
    highlights: [
      "Highlight feature or achievement #1",
      "Highlight feature or achievement #2",
      "Highlight feature or achievement #3",
      "Highlight feature or achievement #4",
    ],
    liveUrl: "#",
    repoUrl: "#",
  },
  {
    id: "project-2",
    title: "Project Name 2",
    description:
      "Another project description that captures the essence of what was built.",
    longDescription:
      "A comprehensive overview of the second project. Describe the challenges, solutions, and the impact it had. Include any notable metrics or feedback received.",
    category: "Mobile App",
    year: "2024",
    emoji: "📱",
    gradient: ["#f43f5e", "#ec4899"],
    techStack: ["React Native", "Expo", "TypeScript", "Firebase"],
    images: [
      "https://picsum.photos/seed/p2a/800/450",
      "https://picsum.photos/seed/p2b/800/450",
    ],
    highlights: [
      "Highlight feature or achievement #1",
      "Highlight feature or achievement #2",
      "Highlight feature or achievement #3",
    ],
    liveUrl: "#",
    repoUrl: "#",
  },
  {
    id: "project-3",
    title: "Project Name 3",
    description:
      "A creative project description showcasing design and technical skills.",
    longDescription:
      "The full story behind this creative project. Discuss the design process, technical decisions, and the tools used to bring the vision to life.",
    category: "Design System",
    year: "2024",
    emoji: "🎨",
    gradient: ["#06b6d4", "#3b82f6"],
    techStack: [
      "Figma",
      "Storybook",
      "React",
      "Styled Components",
      "Chromatic",
    ],
    images: ["https://picsum.photos/seed/p3a/800/450"],
    highlights: [
      "Highlight feature or achievement #1",
      "Highlight feature or achievement #2",
      "Highlight feature or achievement #3",
    ],
    liveUrl: "#",
  },
  {
    id: "project-4",
    title: "Project Name 4",
    description:
      "An innovative solution built to solve a real-world problem efficiently.",
    longDescription:
      "A deep dive into this innovative solution. Cover the technology choices, architecture patterns, and how the project evolved from concept to production.",
    category: "SaaS",
    year: "2023",
    emoji: "⚡",
    gradient: ["#f59e0b", "#ef4444"],
    techStack: ["Next.js", "tRPC", "PostgreSQL", "Redis", "Docker"],
    images: [
      "https://picsum.photos/seed/p4a/800/450",
      "https://picsum.photos/seed/p4b/800/450",
      "https://picsum.photos/seed/p4c/800/450",
      "https://picsum.photos/seed/p4d/800/450",
    ],
    highlights: [
      "Highlight feature or achievement #1",
      "Highlight feature or achievement #2",
      "Highlight feature or achievement #3",
      "Highlight feature or achievement #4",
      "Highlight feature or achievement #5",
    ],
    liveUrl: "#",
    repoUrl: "#",
  },
  {
    id: "project-5",
    title: "Project Name 5",
    description:
      "A full-stack application with a focus on performance and scalability.",
    longDescription:
      "Explore how this full-stack application was built with performance and scalability in mind. Discuss the backend architecture, database design, and frontend optimizations.",
    category: "E-Commerce",
    year: "2023",
    emoji: "🛍️",
    gradient: ["#10b981", "#059669"],
    techStack: ["Next.js", "Stripe", "Supabase", "Tailwind CSS", "Vercel"],
    images: [
      "https://picsum.photos/seed/p5a/800/450",
      "https://picsum.photos/seed/p5b/800/450",
    ],
    highlights: [
      "Highlight feature or achievement #1",
      "Highlight feature or achievement #2",
      "Highlight feature or achievement #3",
    ],
    liveUrl: "#",
    repoUrl: "#",
  },
  {
    id: "project-6",
    title: "Project Name 6",
    description:
      "An open-source contribution that makes developers' lives easier.",
    longDescription:
      "The story behind this open-source project. Explain the motivation, how the community responded, and the ongoing maintenance and evolution of the project.",
    category: "Open Source",
    year: "2023",
    emoji: "🔧",
    gradient: ["#4A7A9B", "#3A6A8B"],
    techStack: ["TypeScript", "Node.js", "CLI", "npm"],
    images: [],
    highlights: [
      "Highlight feature or achievement #1",
      "Highlight feature or achievement #2",
      "Highlight feature or achievement #3",
    ],
    repoUrl: "#",
  },
];

const sectionVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.3,
    },
  },
};

export function ProjectsSection() {
  const [selectedProject, setSelectedProject] = useState<ProjectData | null>(
    null,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleViewDetail = (project: ProjectData) => {
    setSelectedProject(project);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setTimeout(() => setSelectedProject(null), 300);
  };

  return (
    <>
      <section id="projects" className="relative section-padding">
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
              Featured Work
            </motion.span>
            <h2 className="heading-2 mb-4">
              Projects &{" "}
              <span className="heading-display-italic bg-linear-to-r from-steel to-steel-light bg-clip-text font-semibold text-transparent">
                Creations
              </span>
            </h2>
            <p className="text-muted-foreground body-lg max-w-2xl mx-auto">
              A selection of projects I&apos;ve worked on. Each one represents a
              unique challenge and a chance to grow.
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={sectionVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
          >
            {projects.map((project, index) => (
              <ProjectCard
                key={project.id}
                project={project}
                index={index}
                onViewDetail={handleViewDetail}
              />
            ))}
          </motion.div>
        </div>
      </section>

      <ProjectDetailModal
        project={selectedProject}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </>
  );
}
