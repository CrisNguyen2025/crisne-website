"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { GradientText } from "@/components/gradient-text";
import { cn } from "@/lib/utils";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  icon: string;
}

const faqs: FaqItem[] = [
  {
    id: "tech-stack",
    question: "What technologies do you specialize in?",
    answer:
      "I specialize in modern frontend development with React, Next.js, and TypeScript as my core stack. I also work extensively with Tailwind CSS, Framer Motion for animations, and state management solutions like Zustand and TanStack Query. On the backend side, I'm proficient with Node.js, NestJS, and various database technologies.",
    icon: "🛠️",
  },
  {
    id: "availability",
    question: "Are you available for freelance or contract work?",
    answer:
      "Yes! I'm open to freelance projects, contract work, and consulting engagements. Whether you need a full website build, a specific feature implementation, or technical consulting on frontend architecture, I'd love to discuss your project. Feel free to reach out via email or through the contact section.",
    icon: "📅",
  },
  {
    id: "timeline",
    question: "What's your typical project timeline?",
    answer:
      "Timelines vary based on project scope and complexity. A landing page typically takes 1–2 weeks, while a full web application can range from 4–12 weeks. I always provide a detailed estimate after our initial discussion, and I prioritize transparent communication throughout the development process.",
    icon: "⏱️",
  },
  {
    id: "process",
    question: "What does your development process look like?",
    answer:
      "My process follows an iterative approach: Discovery & Planning → Design Review → Development Sprints → Testing & QA → Deployment & Handoff. I use Git for version control, provide regular progress updates, and ensure thorough documentation. I also set up CI/CD pipelines for smooth deployments.",
    icon: "🔄",
  },
  {
    id: "collab",
    question: "Do you work with design teams or provide design as well?",
    answer:
      "I collaborate seamlessly with design teams and can work from Figma, Sketch, or Adobe XD files to deliver pixel-perfect implementations. While I'm primarily a developer, I have a strong eye for UI/UX and can provide design suggestions. For projects without a designer, I can create clean, modern interfaces based on best practices.",
    icon: "🎨",
  },
  {
    id: "support",
    question: "Do you offer post-launch support & maintenance?",
    answer:
      "Absolutely. I offer ongoing maintenance packages that include bug fixes, security updates, performance monitoring, and feature enhancements. I believe in building long-term relationships with my clients, and I'm always available for support after a project goes live.",
    icon: "🛡️",
  },
];

interface FaqAccordionItemProps {
  readonly item: FaqItem;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly index: number;
}

function FaqAccordionItem({
  item,
  isOpen,
  onToggle,
  index,
}: FaqAccordionItemProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{
        duration: 0.5,
        delay: index * 0.08,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <div
        className={cn(
          "group rounded-2xl border transition-all duration-300 overflow-hidden",
          isOpen
            ? "border-indigo-500/30 bg-indigo-500/3 shadow-[0_0_24px_-6px_rgba(99,102,241,0.12)]"
            : "border-border/50 bg-background/60 backdrop-blur-md hover:border-border/80 hover:bg-muted/30",
        )}
      >
        <button
          onClick={onToggle}
          className="flex items-center gap-4 w-full p-5 sm:p-6 text-left cursor-pointer"
          aria-expanded={isOpen}
        >
          <span
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-xl text-lg shrink-0 transition-all duration-300",
              isOpen
                ? "bg-indigo-500/10 scale-110"
                : "bg-muted/60 group-hover:bg-muted",
            )}
          >
            {item.icon}
          </span>

          <span
            className={cn(
              "flex-1 text-sm sm:text-base font-semibold transition-colors duration-200",
              isOpen ? "text-foreground" : "text-foreground/80",
            )}
          >
            {item.question}
          </span>

          <motion.span
            className="shrink-0 text-muted-foreground"
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <ChevronDown className="w-5 h-5" />
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                height: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
                opacity: { duration: 0.25, delay: 0.1 },
              }}
            >
              <div className="px-5 sm:px-6 pb-5 sm:pb-6 pl-17 sm:pl-19">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.answer}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export function FaqSection() {
  const [openId, setOpenId] = useState<string | null>("tech-stack");

  const handleToggle = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <section id="faq" className="relative section-padding overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/3 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/3 rounded-full blur-3xl" />
      </div>

      <div className="max-w-3xl mx-auto px-6 relative z-10">
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
            Common Questions
          </motion.span>
          <h2 className="heading-2 mb-4">
            <GradientText>FAQ</GradientText>
          </h2>
          <p className="text-muted-foreground body-lg max-w-2xl mx-auto">
            Got questions? Here are some answers to the most common ones
            I&apos;ve received.
          </p>
        </motion.div>

        <div className="flex flex-col gap-3">
          {faqs.map((faq, index) => (
            <FaqAccordionItem
              key={faq.id}
              item={faq}
              isOpen={openId === faq.id}
              onToggle={() => handleToggle(faq.id)}
              index={index}
            />
          ))}
        </div>

        <motion.div
          className="mt-12 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
        >
          <p className="text-sm text-muted-foreground">
            <HelpCircle className="inline-block w-4 h-4 mr-1.5 -mt-0.5" />
            Still have questions?{" "}
            <a
              href="mailto:hello@crisne.dev"
              className="text-indigo-500 hover:text-indigo-400 font-medium underline underline-offset-4 decoration-indigo-500/30 hover:decoration-indigo-400/50 transition-colors"
            >
              Send me an email
            </a>
          </p>
        </motion.div>
      </div>
    </section>
  );
}
