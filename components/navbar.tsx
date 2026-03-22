"use client";

import { motion, useScroll, useMotionValueEvent, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef, useCallback } from "react";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Skills", href: "#skills" },
  { label: "Experience", href: "#experience" },
  { label: "Projects", href: "#projects" },
  { label: "Contact", href: "mailto:hello@crisne.dev" },
];

const sectionIds = ["skills", "experience", "projects"];

const NAVBAR_HEIGHT = 80;

const mobileMenuVariants = {
  closed: {
    opacity: 0,
    height: 0,
    transition: {
      duration: 0.3,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
      when: "afterChildren",
      staggerChildren: 0.03,
      staggerDirection: -1,
    },
  },
  open: {
    opacity: 1,
    height: "auto",
    transition: {
      duration: 0.4,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
      when: "beforeChildren",
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

const mobileItemVariants = {
  closed: { opacity: 0, x: -16 },
  open: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
};

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const pendingScrollTarget = useRef<string | null>(null);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 50);
  });

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveSection(id);
          }
        },
        {
          rootMargin: "-20% 0px -60% 0px",
          threshold: 0,
        },
      );

      observer.observe(el);
      observers.push(observer);
    });

    return () => {
      observers.forEach((obs) => obs.disconnect());
    };
  }, []);

  const scrollToTarget = useCallback((href: string) => {
    if (href === "#" || href === "") {
      globalThis.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (href.startsWith("mailto:")) {
      globalThis.location.href = href;
      return;
    }

    const targetId = href.replace("#", "");
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      const elementTop = targetEl.getBoundingClientRect().top + globalThis.scrollY;
      globalThis.scrollTo({ top: elementTop - NAVBAR_HEIGHT, behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";

      if (pendingScrollTarget.current) {
        const target = pendingScrollTarget.current;
        pendingScrollTarget.current = null;

        setTimeout(() => {
          scrollToTarget(target);
        }, 100);
      }
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen, scrollToTarget]);

  const handleMobileNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    pendingScrollTarget.current = href;
    setMobileOpen(false);
  };

  const isActive = (href: string) => {
    if (href.startsWith("mailto:")) return false;
    const id = href.replace("#", "");
    return activeSection === id;
  };

  return (
    <>
      <motion.header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
          scrolled
            ? "bg-background/70 backdrop-blur-xl border-b border-border/50 shadow-sm"
            : "bg-transparent",
        )}
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <motion.a
            href="#"
            className="text-xl font-bold tracking-tight"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <span className="bg-linear-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
              Cris
            </span>
            <span className="text-foreground">.dev</span>
          </motion.a>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <motion.a
                key={link.label}
                href={link.href}
                className={cn(
                  "relative px-4 py-2 text-sm transition-colors rounded-lg",
                  isActive(link.href)
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.95 }}
              >
                {link.label}
                {isActive(link.href) && (
                  <motion.span
                    layoutId="activeNavIndicator"
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                    transition={{
                      type: "spring",
                      stiffness: 380,
                      damping: 30,
                    }}
                  />
                )}
              </motion.a>
            ))}
            <div className="ml-2">
              <ThemeToggle />
            </div>
          </div>

          <div className="flex md:hidden items-center gap-2">
            <ThemeToggle />
            <motion.button
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
              whileTap={{ scale: 0.9 }}
              aria-label="Toggle menu"
            >
              <AnimatePresence mode="wait" initial={false}>
                {mobileOpen ? (
                  <motion.div
                    key="close"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <X className="w-5 h-5" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="menu"
                    initial={{ rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Menu className="w-5 h-5" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </nav>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              className="md:hidden overflow-hidden border-t border-border/30 bg-background/90 backdrop-blur-2xl"
              variants={mobileMenuVariants}
              initial="closed"
              animate="open"
              exit="closed"
            >
              <div className="px-6 py-4 flex flex-col gap-1">
                {navLinks.map((link, i) => {
                  const active = isActive(link.href);
                  return (
                    <motion.a
                      key={link.label}
                      href={link.href}
                      variants={mobileItemVariants}
                      className={cn(
                        "relative flex items-center gap-3 px-4 py-3.5 text-base font-medium rounded-xl transition-colors overflow-hidden",
                        active
                          ? "text-foreground bg-muted/60"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                      )}
                      onClick={(e) => handleMobileNavClick(e, link.href)}
                      whileTap={{ scale: 0.98 }}
                    >
                      {active && (
                        <motion.span
                          layoutId="activeMobileIndicator"
                          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-gradient-to-b from-indigo-500 to-purple-500"
                          transition={{
                            type: "spring",
                            stiffness: 380,
                            damping: 30,
                          }}
                        />
                      )}
                      <span
                        className={cn("w-1.5 h-1.5 rounded-full shrink-0 transition-transform", active && "scale-150")}
                        style={{
                          background: active
                            ? "linear-gradient(135deg, #6366f1, #a855f7)"
                            : `hsl(${220 + i * 30}, 80%, 60%)`,
                        }}
                      />
                      {link.label}
                    </motion.a>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

