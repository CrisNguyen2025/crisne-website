"use client";

import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Mail, MessageSquare } from "lucide-react";
import { GradientText } from "@/components/gradient-text";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.2,
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
      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
    },
  },
};

const floatingVariants = {
  animate: {
    y: [-8, 8, -8],
    rotate: [-3, 3, -3],
    transition: {
      duration: 6,
      repeat: Infinity,
      ease: "easeInOut" as const,
    },
  },
};

export function CtaSection() {
  return (
    <section id="contact" className="relative py-7 sm:py-10 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/6 w-md h-112 bg-indigo-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/6 w-lg h-128 bg-purple-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-160 h-160 bg-pink-500/3 rounded-full blur-3xl" />
      </div>

      <motion.div
        className="absolute top-16 right-[15%] hidden md:block text-indigo-500/20"
        variants={floatingVariants}
        animate="animate"
      >
        <Sparkles className="w-8 h-8" />
      </motion.div>
      <motion.div
        className="absolute bottom-20 left-[12%] hidden md:block text-purple-500/20"
        variants={floatingVariants}
        animate="animate"
        style={{ animationDelay: "2s" }}
      >
        <MessageSquare className="w-7 h-7" />
      </motion.div>

      <div className="max-w-4xl mx-auto px-6 relative z-10">
        <motion.div
          className="relative rounded-3xl border border-border/50 bg-background/60 backdrop-blur-xl p-10 sm:p-14 md:p-16 overflow-hidden"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
        >
          <div className="absolute inset-0 rounded-3xl bg-linear-to-br from-indigo-500/5 via-transparent to-purple-500/5 pointer-events-none" />
          <div className="absolute -top-px left-8 right-8 h-px bg-linear-to-r from-transparent via-indigo-500/30 to-transparent" />

          <div className="relative z-10 text-center">
            <motion.span
              variants={itemVariants}
              className="inline-block text-sm font-mono text-muted-foreground tracking-widest uppercase mb-4"
            >
              Let&apos;s Connect
            </motion.span>

            <motion.h2
              variants={itemVariants}
              className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-5"
            >
              Have a project in mind?{" "}
              <br className="hidden sm:block" />
              <GradientText>Let&apos;s build it together.</GradientText>
            </motion.h2>

            <motion.p
              variants={itemVariants}
              className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto mb-10 leading-relaxed"
            >
              Whether you need a stunning landing page, a complex web
              application, or a creative partner for your next big idea — I&apos;m
              here to help bring your vision to life.
            </motion.p>

            <motion.div
              variants={itemVariants}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <motion.a
                href="mailto:hello@crisne.dev"
                className="group relative inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl bg-linear-to-r from-indigo-600 to-purple-600 text-white font-semibold text-base shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-shadow duration-300 overflow-hidden"
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
              >
                <span className="absolute inset-0 bg-linear-to-r from-indigo-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <Mail className="w-5 h-5 relative z-10" />
                <span className="relative z-10">Get in Touch</span>
                <motion.span
                  className="relative z-10"
                  initial={{ x: 0 }}
                  whileHover={{ x: 4 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                >
                  <ArrowRight className="w-5 h-5" />
                </motion.span>
              </motion.a>

              <motion.a
                href="https://github.com/crisne"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl border border-border/60 bg-muted/30 backdrop-blur-sm text-foreground font-semibold text-base hover:bg-muted/60 hover:border-border transition-all duration-300"
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-5 h-5"
                >
                  <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                  <path d="M9 18c-4.51 2-5-2-7-2" />
                </svg>
                View My Work
              </motion.a>
            </motion.div>
          </div>

          <motion.div
            variants={itemVariants}
            className="flex items-center justify-center gap-8 sm:gap-12 mt-12 pt-8 border-t border-border/30"
          >
            {[
              { value: "24h", label: "Response Time" },
              { value: "100%", label: "Client Satisfaction" },
              { value: "Free", label: "Initial Consultation" },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <div className="text-lg sm:text-xl font-bold bg-linear-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
                  {value}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {label}
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
