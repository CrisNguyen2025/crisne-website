"use client";

import { useState, useRef, useCallback } from "react";
import { useScroll, useMotionValueEvent } from "framer-motion";

interface UseScrollSpyOptions {
  sectionIds: string[];
  offset?: number;
  triggerPadding?: number;
  scrollLockDuration?: number;
}

interface UseScrollSpyReturn {
  activeSection: string | null;
  scrolled: boolean;
  scrollToSection: (href: string) => void;
  scrollToSectionDelayed: (href: string, delayMs: number) => void;
  handleNavClick: (e: React.MouseEvent<HTMLAnchorElement>, href: string) => void;
  isActive: (href: string) => boolean;
}

export function useScrollSpy({
  sectionIds,
  offset = 64,
  triggerPadding = 60,
  scrollLockDuration = 1000,
}: UseScrollSpyOptions): UseScrollSpyReturn {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const isProgrammaticScroll = useRef(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);
  const { scrollY } = useScroll();

  const lockScrollSpy = useCallback(() => {
    isProgrammaticScroll.current = true;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, scrollLockDuration);
  }, [scrollLockDuration]);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 50);

    if (isProgrammaticScroll.current) return;

    const triggerY = latest + offset + triggerPadding;
    let current: string | null = null;

    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el) {
        const absoluteTop = el.getBoundingClientRect().top + latest;
        if (absoluteTop <= triggerY) {
          current = id;
        }
      }
    }

    const isAtBottom =
      latest + globalThis.innerHeight >= document.body.offsetHeight - 10;
    if (isAtBottom && sectionIds.length > 0) {
      current = sectionIds.at(-1) ?? null;
    }

    setActiveSection(current);
  });

  const scrollToSection = useCallback(
    (href: string) => {
      lockScrollSpy();

      if (href === "#" || href === "") {
        globalThis.scrollTo({ top: 0, behavior: "smooth" });
        setActiveSection(null);
        return;
      }

      if (href.startsWith("mailto:")) {
        isProgrammaticScroll.current = false;
        globalThis.location.href = href;
        return;
      }

      const targetId = href.replace("#", "");
      const targetEl = document.getElementById(targetId);

      if (targetEl) {
        setActiveSection(targetId);

        const top =
          targetEl.getBoundingClientRect().top + globalThis.scrollY - offset;
        globalThis.scrollTo({ top, behavior: "smooth" });
      }
    },
    [offset, lockScrollSpy],
  );

  const scrollToSectionDelayed = useCallback(
    (href: string, delayMs: number) => {
      lockScrollSpy();

      if (href.startsWith("mailto:")) {
        isProgrammaticScroll.current = false;
        globalThis.location.href = href;
        return;
      }

      const targetId = href.replace("#", "");
      setActiveSection(href === "#" || href === "" ? null : targetId);

      setTimeout(() => {
        if (href === "#" || href === "") {
          globalThis.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }

        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          const top =
            targetEl.getBoundingClientRect().top + globalThis.scrollY - offset;
          globalThis.scrollTo({ top, behavior: "smooth" });
        }
      }, delayMs);
    },
    [offset, lockScrollSpy],
  );

  const handleNavClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      e.preventDefault();
      scrollToSection(href);
      return true;
    },
    [scrollToSection],
  );

  const isActive = useCallback(
    (href: string) => {
      if (href.startsWith("mailto:")) return false;
      const id = href.replace("#", "");
      return activeSection === id;
    },
    [activeSection],
  );

  return {
    activeSection,
    scrolled,
    scrollToSection,
    scrollToSectionDelayed,
    handleNavClick,
    isActive,
  };
}
