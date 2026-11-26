import { useCallback, useEffect, useRef } from "react";
import type { ChatMessage } from "../types";

export interface UseChatAutoScrollOptions {
  isOpen: boolean;
  isStreaming: boolean;
  activeTool: string | null;
  messages: ChatMessage[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  bottomSentinelRef: React.RefObject<HTMLDivElement | null>;
  isResizingRef: React.RefObject<boolean>;
}

export function useChatAutoScroll({
  isOpen,
  isStreaming,
  activeTool,
  messages,
  scrollRef,
  bottomSentinelRef,
  isResizingRef,
}: UseChatAutoScrollOptions) {
  const isAtBottomRef = useRef(true);
  const autoFollowRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const isStreamingRef = useRef(isStreaming);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = bottomSentinelRef.current;
    if (
      !isOpen ||
      !root ||
      !sentinel ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    const followObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) isAtBottomRef.current = true;
      },
      { root, rootMargin: "0px 0px 80px 0px" }
    );
    followObserver.observe(sentinel);
    return () => followObserver.disconnect();
  }, [isOpen, scrollRef, bottomSentinelRef]);

  const startScrollGlide = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !isAtBottomRef.current) {
      autoFollowRef.current = false;
      return;
    }

    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= el.scrollTop) {
      autoFollowRef.current = isStreamingRef.current;
      return;
    }

    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      el.scrollTop = maxScroll;
      autoFollowRef.current = isStreamingRef.current;
      return;
    }

    if (rafIdRef.current !== null) return;
    autoFollowRef.current = true;

    let lastTime = performance.now();
    const tick = (now: number) => {
      const container = scrollRef.current;
      if (!container || !isAtBottomRef.current) {
        rafIdRef.current = null;
        autoFollowRef.current = false;
        return;
      }
      const target = container.scrollHeight - container.clientHeight;
      const curr = container.scrollTop;
      const dist = target - curr;

      if (dist <= 0.5) {
        container.scrollTop = target;
        rafIdRef.current = null;
        autoFollowRef.current =
          isStreamingRef.current && isAtBottomRef.current;
        return;
      }

      const dt = Math.min(now - lastTime, 100);
      lastTime = now;
      const factor = 1 - Math.exp(-dt / 55);
      const step = Math.max(1, dist * factor);
      container.scrollTop = Math.min(target, curr + step);

      if (container.scrollTop < target && isAtBottomRef.current) {
        rafIdRef.current = requestAnimationFrame(tick);
      } else {
        rafIdRef.current = null;
        autoFollowRef.current =
          isStreamingRef.current && isAtBottomRef.current;
      }
    };

    rafIdRef.current = requestAnimationFrame(tick);
  }, [scrollRef]);

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      isAtBottomRef.current = true;
      autoFollowRef.current = false;
    }
  }, [isOpen, scrollRef]);

  const disengageFollow = useCallback(() => {
    isAtBottomRef.current = false;
    autoFollowRef.current = false;
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!isOpen || !el) return;

    let touchStartY = 0;
    let lastScrollTop = el.scrollTop;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) disengageFollow();
    };
    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0].clientY - touchStartY > 10) disengageFollow();
    };
    const handleScroll = () => {
      const curr = el.scrollTop;
      const nearBottom = curr + el.clientHeight >= el.scrollHeight - 24;
      if (
        !isResizingRef.current &&
        !nearBottom &&
        curr < lastScrollTop - 2 &&
        rafIdRef.current === null
      ) {
        disengageFollow();
      }
      lastScrollTop = curr;
    };

    el.addEventListener("wheel", handleWheel, { passive: true });
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("scroll", handleScroll);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      autoFollowRef.current = false;
    };
  }, [isOpen, scrollRef, isResizingRef, disengageFollow]);

  const scrollToBottom = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    autoFollowRef.current = isStreaming;
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      isAtBottomRef.current = true;
    }
  }, [isStreaming, scrollRef]);

  useEffect(() => {
    if (!isOpen || !scrollRef.current || !isAtBottomRef.current) return;
    startScrollGlide();
  }, [messages, isOpen, isStreaming, activeTool, scrollRef, startScrollGlide]);

  useEffect(() => {
    if (!isOpen || !isAtBottomRef.current) {
      autoFollowRef.current = false;
      return;
    }
    if (isStreaming) {
      autoFollowRef.current = true;
      return;
    }
    autoFollowRef.current = true;
    const frame = requestAnimationFrame(() => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      startScrollGlide();
    });
    return () => cancelAnimationFrame(frame);
  }, [isStreaming, isOpen, messages, startScrollGlide]);

  return { isAtBottomRef, autoFollowRef, scrollToBottom, disengageFollow };
}
