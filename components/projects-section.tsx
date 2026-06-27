"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { ProjectCard, type ProjectData } from "@/components/project-card";
import { ProjectDetailModal } from "@/components/project-detail-modal";

const projects: ProjectData[] = [
  {
    id: "kamala-commerce-tour",
    title: "Kamala Jewelry & Tour Platform",
    description:
      "A polished commerce and content platform for natural stone jewelry, product discovery, and Kamala tour experiences.",
    longDescription:
      "Kamala is a premium natural stone jewelry website with product browsing, rich visual merchandising, article-style content, and a Tour Kamala experience. I contributed to the frontend experience and CMS-connected workflows, focusing on responsive UI, product/content presentation, SEO-friendly pages, and maintainable data-driven components for jewelry collections and tour content.",
    category: "Commerce & CMS",
    year: "2024",
    emoji: "💎",
    gradient: ["#0f766e", "#14b8a6"],
    techStack: [
      "Next.js",
      "ReactJS",
      "TypeScript",
      "Mantine UI",
      "Tailwind CSS",
      "React Query",
      "Strapi CMS",
      "TanStack Table",
    ],
    images: [
      "https://kamala.vn/_next/image?url=https%3A%2F%2Fkamala.vn%2Fimage%2Fkamala%2F2026%2F2%2F23%2F1128%2Fbanner-1-large.jpeg&w=3840&q=75",
      "https://kamala.vn/_next/image?url=https%3A%2F%2Fkamala.vn%2Fimage%2Fkamala%2F2026%2F2%2F24%2F1129%2Fbanner-4-large.jpeg&w=3840&q=75",
      "https://kamala.vn/_next/image?url=https%3A%2F%2Fkamala.vn%2Fimage%2Fkamala%2F2026%2F5%2F26%2F1199%2Fbodgaya-5-ngay-4-dem-small.jpeg&w=3840&q=75",
    ],
    highlights: [
      "Built responsive product and content pages for natural stone jewelry collections",
      "Integrated CMS-driven content workflows for flexible product, article, and tour data",
      "Optimized UI presentation for SEO-focused landing pages and visual merchandising",
      "Supported Tour Kamala content and booking-oriented discovery flows",
    ],
    liveUrl: "https://kamala.vn/",
  },
  {
    id: "zelene-spa-booking",
    title: "Zelene Head Spa Booking Platform",
    description:
      "A wellness booking ecosystem for head spa services, combining marketing pages, booking flows, dashboard features, and mobile app support.",
    longDescription:
      "Zelene is an American head spa and scalp wellness platform built around service discovery and booking. I worked across the customer-facing booking pages, CMS/dashboard management experiences, and React Native Expo mobile app support. The implementation covered responsive UI, service browsing, appointment booking, payment-related flows with Clover, analytics, and operational tools for managing spa content and workflows.",
    category: "Booking Platform",
    year: "2025",
    emoji: "🌿",
    gradient: ["#7f1d1d", "#f97316"],
    techStack: [
      "Next.js",
      "React Native",
      "Expo",
      "TypeScript",
      "React Query",
      "Zustand",
      "Ant Design",
      "Tailwind CSS",
      "Clover",
      "GA4",
    ],
    images: [
      "https://zelenespa.com/_next/image?url=%2Fvideos%2Fhome-hero-section%2Fdesktop%2Fannual-membership.webp&w=3840&q=75",
      "https://zelenespa.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fwhy-it-matters-cover.936f99e2.webp&w=3840&q=75",
      "https://zelenespa.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2FHomeChoosen.76526e03.webp&w=3840&q=75",
      "https://zelenespa.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ffounder-model.f3468bfd.webp&w=3840&q=75",
    ],
    highlights: [
      "Developed service discovery and booking pages for head spa customers",
      "Built CMS/dashboard workflows for spa content, bookings, and operations",
      "Supported React Native Expo mobile booking experiences",
      "Integrated analytics and payment-related flows including Clover",
    ],
    liveUrl: "https://zelenespa.com/",
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
