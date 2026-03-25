"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { useScrollSpy } from "@/hooks/use-scroll-spy";

const navLinks = [
  { label: "Skills", href: "#skills" },
  { label: "Experience", href: "#experience" },
  { label: "Projects", href: "#projects" },
  { label: "Testimonials", href: "#testimonials" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "mailto:hello@crisne.dev" },
];

const sectionIds = ["skills", "experience", "projects", "testimonials", "faq"];

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
    transition: {
      duration: 0.3,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  },
};

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const linkRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const [indicatorStyle, setIndicatorStyle] = useState<{
    left: number;
    width: number;
  } | null>(null);

  const { activeSection, scrolled, scrollToSection, isActive } = useScrollSpy({
    sectionIds,
    offset: 64,
  });

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || !activeSection) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIndicatorStyle(null);
      return;
    }
    const activeLink = linkRefs.current.get(activeSection);
    if (!activeLink) {
      setIndicatorStyle(null);
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    setIndicatorStyle({
      left: linkRect.left - navRect.left + 8,
      width: linkRect.width - 16,
    });
  }, [activeSection]);

  const handleDesktopClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    e.preventDefault();
    scrollToSection(href);
  };

  const handleMobileNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    e.preventDefault();
    setMobileOpen(false);

    if (href.startsWith("mailto:")) {
      window.open(href, "_blank");
      return;
    }

    const targetId = href.replace("#", "");

    setTimeout(() => {
      const el = targetId ? document.getElementById(targetId) : null;
      if (el) {
        el.scrollIntoView({ behavior: "instant", block: "start" });
      } else {
        globalThis.scrollTo({ top: 0, behavior: "instant" });
      }
    }, 400);
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
          <div className="flex items-center gap-3">
            <motion.a
              href="#"
              className="text-xl font-bold tracking-tight"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="bg-linear-to-r from-steel to-steel-light bg-clip-text text-transparent">
                Cris
              </span>
              <span className="text-foreground">.dev</span>
            </motion.a>
          </div>

          {/* Desktop nav */}
          <div
            ref={navRef}
            className="hidden md:flex items-center gap-1 relative"
          >
            {navLinks.map((link) => {
              const sectionId = link.href.startsWith("#")
                ? link.href.slice(1)
                : null;
              const active = sectionId ? activeSection === sectionId : false;
              return (
                <motion.a
                  key={link.label}
                  ref={(el) => {
                    if (sectionId && el) linkRefs.current.set(sectionId, el);
                  }}
                  href={link.href}
                  onClick={(e) => handleDesktopClick(e, link.href)}
                  className={cn(
                    "relative px-4 py-2 text-sm transition-colors duration-200 rounded-lg",
                    active
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  )}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {link.label}
                </motion.a>
              );
            })}

            <motion.span
              className="absolute bottom-0.5 h-0.5 rounded-full bg-linear-to-r from-steel to-steel-light pointer-events-none"
              animate={{
                opacity: indicatorStyle ? 1 : 0,
                scaleX: indicatorStyle ? 1 : 0.5,
                left: indicatorStyle?.left ?? 0,
                width: indicatorStyle?.width ?? 0,
              }}
              transition={{
                left: { type: "spring", stiffness: 400, damping: 32 },
                width: { type: "spring", stiffness: 400, damping: 32 },
                opacity: { duration: 0.15 },
                scaleX: { duration: 0.15 },
              }}
            />

            <div className="ml-2">
              <ThemeToggle />
            </div>
          </div>

          {/* Mobile controls */}
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

        {/* Mobile menu */}
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
                        "relative flex items-center gap-3 px-4 py-3.5 text-base font-medium rounded-xl transition-colors duration-200 overflow-hidden",
                        active
                          ? "text-foreground bg-muted/60"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                      )}
                      onClick={(e) => handleMobileNavClick(e, link.href)}
                      whileTap={{ scale: 0.98 }}
                    >
                      <AnimatePresence>
                        {active && (
                          <motion.span
                            key="mobile-bar"
                            className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-linear-to-b from-steel to-steel-light"
                            initial={{ scaleY: 0, opacity: 0 }}
                            animate={{ scaleY: 1, opacity: 1 }}
                            exit={{ scaleY: 0, opacity: 0 }}
                            transition={{
                              type: "spring",
                              stiffness: 400,
                              damping: 30,
                            }}
                          />
                        )}
                      </AnimatePresence>
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0 transition-transform",
                          active && "scale-150",
                        )}
                        style={{
                          background: active
                            ? "linear-gradient(135deg, #6B9AC4, #8BB5D9)"
                            : `hsl(${30 + i * 15}, 70%, 55%)`,
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

      {/* Mobile backdrop */}
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
