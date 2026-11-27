"use client";

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isInternalRouteHref, safeHref } from "../utils/links";
import { ChatLink, useChatNavigate } from "../utils/navigation";

const MIN_PANEL_WIDTH = 192;
const MAX_PANEL_WIDTH = 296;
const DEFAULT_PANEL_HEIGHT = 70;
const MAX_PANEL_HEIGHT = 294;
const EDGE_GAP = 12;
const HANDOFF_DWELL_MS = 120;
const HIDE_DELAY_MS = 150;
const EXIT_MS = 140;

let activeChip: { id: string; close: () => void } | null = null;
let pendingSteal: { id: string; cancel: () => void } | null = null;

function nearestVerticalScroller(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll|hidden)/.test(getComputedStyle(node).overflowY)) {
      return node;
    }
  }
  return null;
}

export interface Citation {
  /** The source's id, which claims in the answer cite. */
  id?: string;
  title: string;
  href?: string | null;
}

/** Source label for a roadmap topic link (`/?topic=<slug>`), or null for any other link. */
export function roadmapSourceLabel(href: string): string | null {
  if (!href.startsWith("/?topic=")) return null;
  const topic = new URLSearchParams(href.slice(2)).get("topic");
  return topic ? `Roadmap · ${topic}` : null;
}

/** Source label for a citation: Gmail, the roadmap topic, else the external host. */
export function citationSourceLabel(href?: string | null, id?: string): string {
  if (id && id.startsWith("gmail:")) return "Gmail";
  if (!href) return "Roadmap";
  if (href.startsWith("https://mail.google.com/")) return "Gmail";
  const roadmap = roadmapSourceLabel(href);
  if (roadmap) return roadmap;
  if (/^https?:\/\//i.test(href)) {
    try {
      return new URL(href).hostname;
    } catch {
      return "Roadmap";
    }
  }
  return "Roadmap";
}

function GlobeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3 shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
    </svg>
  );
}

export function CitationChip({
  citations,
  onOpenChange,
}: {
  citations: Citation[];
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const [warmOpen, setWarmOpen] = useState(false);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

  const rootRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<number | null>(null);
  const unmountTimer = useRef<number | null>(null);
  const stealTimer = useRef<number | null>(null);
  const pointerInsideRef = useRef(false);
  const touchOpenGuardRef = useRef(false);
  const panelId = useId();
  const [first] = citations;
  const onNavigate = useChatNavigate();

  const clearSteal = useCallback(() => {
    if (stealTimer.current !== null) {
      window.clearTimeout(stealTimer.current);
      stealTimer.current = null;
    }
    if (pendingSteal?.id === panelId) {
      pendingSteal = null;
    }
  }, [panelId]);

  const clearTimers = useCallback(() => {
    clearSteal();
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (unmountTimer.current !== null) {
      window.clearTimeout(unmountTimer.current);
      unmountTimer.current = null;
    }
  }, [clearSteal]);

  const closeImmediate = useCallback(() => {
    clearTimers();
    if (activeChip?.id === panelId) {
      activeChip = null;
    }
    pointerInsideRef.current = false;
    setOpen(false);
    setEntered(false);
    setMounted(false);
  }, [clearTimers, panelId]);

  const closeAnimated = useCallback(() => {
    clearTimers();
    if (activeChip?.id === panelId) {
      activeChip = null;
    }
    setOpen(false);
    setEntered(false);
    unmountTimer.current = window.setTimeout(() => {
      unmountTimer.current = null;
      setMounted(false);
    }, EXIT_MS);
  }, [clearTimers, panelId]);

  const openPanel = useCallback(
    (instant: boolean) => {
      clearTimers();
      const hadActiveSibling = activeChip !== null && activeChip.id !== panelId;
      if (hadActiveSibling) {
        activeChip?.close();
      }
      activeChip = { id: panelId, close: closeImmediate };
      const host =
        rootRef.current?.closest<HTMLElement>("[data-abot-overlay-root]") ??
        null;
      setPortalHost(host);
      setWarmOpen(instant || hadActiveSibling);
      setMounted(true);
      setOpen(true);
    },
    [clearTimers, closeImmediate, panelId]
  );

  const cancelHide = useCallback(() => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimer.current = window.setTimeout(closeAnimated, HIDE_DELAY_MS);
  }, [cancelHide, closeAnimated]);

  const handlePointerEnter = useCallback(() => {
    pointerInsideRef.current = true;
    cancelHide();
    if (activeChip !== null && activeChip.id !== panelId) {
      clearSteal();
      if (pendingSteal && pendingSteal.id !== panelId) {
        pendingSteal.cancel();
      }
      pendingSteal = { id: panelId, cancel: clearSteal };
      stealTimer.current = window.setTimeout(() => {
        stealTimer.current = null;
        if (pendingSteal?.id === panelId) {
          pendingSteal = null;
        }
        openPanel(true);
      }, HANDOFF_DWELL_MS);
      return;
    }
    openPanel(false);
  }, [cancelHide, clearSteal, openPanel, panelId]);

  useEffect(() => {
    return () => {
      clearTimers();
      if (activeChip?.id === panelId) {
        activeChip = null;
      }
    };
  }, [clearTimers, panelId]);

  const onOpenChangeRef = useRef(onOpenChange);
  useLayoutEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });

  useEffect(() => {
    if (!open) return;
    onOpenChangeRef.current?.(true);
    return () => onOpenChangeRef.current?.(false);
  }, [open]);

  useLayoutEffect(() => {
    if (!mounted || !rootRef.current || !panelRef.current) return;

    const updatePosition = () => {
      const chipEl = rootRef.current;
      const panelEl = panelRef.current;
      if (!chipEl || !panelEl) return;

      const chipRect = chipEl.getBoundingClientRect();
      const clusterEl = chipEl.closest<HTMLElement>("[data-source-chips]");
      const clusterRect = clusterEl?.getBoundingClientRect();
      const groupTop =
        clusterRect && clusterRect.height > 0
          ? Math.min(chipRect.top, clusterRect.top)
          : chipRect.top;
      const groupBottom =
        clusterRect && clusterRect.height > 0
          ? Math.max(chipRect.bottom, clusterRect.bottom)
          : chipRect.bottom;
      const scrollBox = chipEl.closest<HTMLElement>("[data-abot-scroll-root]");

      if (scrollBox) {
        const scrollRect = scrollBox.getBoundingClientRect();
        if (
          scrollRect.height > 0 &&
          (chipRect.bottom <= scrollRect.top + 4 ||
            chipRect.top >= scrollRect.bottom - 4)
        ) {
          closeImmediate();
          return;
        }
      }

      panelEl.style.left = "0px";

      if (portalHost) {
        const hostRect = portalHost.getBoundingClientRect();
        const originX = hostRect.left + portalHost.clientLeft;
        const originY = hostRect.top + portalHost.clientTop;
        const hostWidth =
          portalHost.clientWidth || hostRect.width || window.innerWidth;
        const hostHeight =
          portalHost.clientHeight || hostRect.height || window.innerHeight;

        const maxPanelWidth = Math.max(
          MIN_PANEL_WIDTH,
          Math.min(MAX_PANEL_WIDTH, hostWidth - EDGE_GAP * 2)
        );
        panelEl.style.maxWidth = `${Math.round(maxPanelWidth)}px`;

        const panelWidth =
          panelEl.offsetWidth || Math.min(MAX_PANEL_WIDTH, maxPanelWidth);
        const panelHeight =
          panelEl.offsetHeight ||
          Math.min(
            panelEl.scrollHeight || DEFAULT_PANEL_HEIGHT,
            MAX_PANEL_HEIGHT
          );

        const maxLeft = Math.max(EDGE_GAP, hostWidth - panelWidth - EDGE_GAP);
        const left = Math.min(
          Math.max(EDGE_GAP, chipRect.left - originX),
          maxLeft
        );

        const scrollRect = scrollBox?.getBoundingClientRect();
        const scrollInnerHeight = scrollBox
          ? scrollBox.clientHeight || scrollRect?.height || 0
          : 0;
        const safeTop =
          scrollBox && scrollRect && scrollInnerHeight > 0
            ? scrollRect.top + scrollBox.clientTop + EDGE_GAP
            : originY + EDGE_GAP;
        const safeBottom =
          scrollBox && scrollRect && scrollInnerHeight > 0
            ? scrollRect.top +
              scrollBox.clientTop +
              scrollInnerHeight -
              EDGE_GAP
            : originY + hostHeight - EDGE_GAP;

        const fitsBelow = groupBottom + panelHeight <= safeBottom;
        const fitsAbove = groupTop - panelHeight >= safeTop;
        const openUp =
          !fitsBelow &&
          (fitsAbove ||
            groupTop - originY > originY + hostHeight - groupBottom);

        const rawTop = openUp
          ? chipRect.top - originY - panelHeight
          : chipRect.bottom - originY;
        const top = Math.min(
          Math.max(EDGE_GAP, rawTop),
          Math.max(EDGE_GAP, hostHeight - panelHeight - EDGE_GAP)
        );

        panelEl.dataset.side = openUp ? "top" : "bottom";
        panelEl.style.left = `${Math.round(left)}px`;
        panelEl.style.top = `${Math.round(top)}px`;
        return;
      }

      const maxPanelWidth = Math.max(
        MIN_PANEL_WIDTH,
        Math.min(MAX_PANEL_WIDTH, window.innerWidth - EDGE_GAP * 2)
      );
      panelEl.style.maxWidth = `${Math.round(maxPanelWidth)}px`;

      const panelWidth =
        panelEl.offsetWidth || Math.min(MAX_PANEL_WIDTH, maxPanelWidth);
      const panelHeight =
        panelEl.offsetHeight ||
        Math.min(
          panelEl.scrollHeight || DEFAULT_PANEL_HEIGHT,
          MAX_PANEL_HEIGHT
        );

      const targetViewportLeft = Math.min(
        Math.max(EDGE_GAP, chipRect.left),
        Math.max(EDGE_GAP, window.innerWidth - panelWidth - EDGE_GAP)
      );
      const scroller = nearestVerticalScroller(chipEl);
      const scrollerRect = scroller?.getBoundingClientRect();
      const scrollerInnerHeight = scroller
        ? scroller.clientHeight || scrollerRect?.height || 0
        : 0;
      const clipTop =
        scroller && scrollerRect && scrollerInnerHeight > 0
          ? scrollerRect.top + scroller.clientTop + EDGE_GAP
          : EDGE_GAP;
      const clipBot =
        scroller && scrollerRect && scrollerInnerHeight > 0
          ? scrollerRect.top +
            scroller.clientTop +
            scrollerInnerHeight -
            EDGE_GAP
          : window.innerHeight - EDGE_GAP;

      const openUp =
        groupBottom + panelHeight > clipBot && groupTop - panelHeight >= clipTop;

      panelEl.dataset.side = openUp ? "top" : "bottom";
      panelEl.style.left = `${Math.round(targetViewportLeft - chipRect.left)}px`;
      panelEl.style.top = openUp
        ? `${Math.round(-panelHeight)}px`
        : `${Math.round(chipRect.height)}px`;
    };

    updatePosition();

    const scrollTarget =
      rootRef.current.closest<HTMLElement>("[data-abot-scroll-root]") ??
      nearestVerticalScroller(rootRef.current);
    scrollTarget?.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("resize", updatePosition, { passive: true });
    return () => {
      scrollTarget?.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, [mounted, portalHost, citations.length, closeImmediate]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        closeAnimated();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeAnimated();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, closeAnimated]);

  const panelNode = mounted ? (
    <span
      ref={panelRef}
      id={panelId}
      onMouseEnter={() => {
        pointerInsideRef.current = true;
        pendingSteal?.cancel();
        cancelHide();
      }}
      onMouseLeave={() => {
        pointerInsideRef.current = false;
        scheduleHide();
      }}
      onFocus={cancelHide}
      onBlur={() => {
        if (!pointerInsideRef.current) scheduleHide();
      }}
      className={`absolute z-[25] block w-max min-w-48 pt-1.5 data-[side=top]:pt-0 data-[side=top]:pb-1.5 transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
        entered && !warmOpen ? "delay-75" : "delay-0"
      } ${
        entered
          ? "translate-y-0 scale-100 opacity-100"
          : "pointer-events-none -translate-y-1 scale-[0.98] opacity-0 data-[side=top]:translate-y-1"
      }`}
    >
      <span className="block max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-[#E6E4DF] bg-[#FFFFFF] p-1 text-left text-[#1F1E1C] shadow-[0_8px_24px_-4px_rgba(31,30,28,0.12),0_2px_6px_-1px_rgba(31,30,28,0.06)]">
        {citations.map((citation, idx) => {
          const body = (
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-xs text-[#5E5B55]">
                <GlobeIcon />
                <span className="truncate">
                  {citationSourceLabel(citation.href, citation.id)}
                </span>
              </span>
              <span className="mt-0.5 line-clamp-2 block text-sm font-medium leading-snug text-[#1F1E1C]">
                {citation.title}
              </span>
            </span>
          );
          const link = citation.href ? safeHref(citation.href) : null;
          if (!link) {
            return (
              <span
                key={idx}
                className="flex items-start gap-3 rounded-lg px-3 py-2"
              >
                {body}
              </span>
            );
          }
          return (
            <ChatLink
              key={idx}
              href={link.href}
              external={link.external}
              onNavigateComplete={closeImmediate}
              className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-[#F4F3F0]"
            >
              {body}
            </ChatLink>
          );
        })}
      </span>
    </span>
  ) : null;

  return (
    <span
      ref={rootRef}
      className="relative my-0.5 ml-1 inline-block align-baseline"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onTouchStart={() => {
          touchOpenGuardRef.current = !open;
        }}
        onMouseEnter={handlePointerEnter}
        onMouseLeave={() => {
          pointerInsideRef.current = false;
          clearSteal();
          if (open) scheduleHide();
        }}
        onFocus={() => openPanel(true)}
        onBlur={() => {
          if (!pointerInsideRef.current) scheduleHide();
        }}
        onClick={(event) => {
          if (touchOpenGuardRef.current) {
            touchOpenGuardRef.current = false;
            openPanel(true);
            return;
          }
          if (!open) {
            openPanel(true);
            return;
          }
          const singleLink =
            citations.length === 1 && first?.href ? safeHref(first.href) : null;
          if (!singleLink) return;
          if (singleLink.external || event.metaKey || event.ctrlKey) {
            window.open(singleLink.href, "_blank", "noopener,noreferrer");
            return;
          }
          if (
            onNavigate &&
            !event.shiftKey &&
            !event.altKey &&
            isInternalRouteHref(singleLink.href)
          ) {
            closeImmediate();
            onNavigate(singleLink.href);
            return;
          }
          const anchor = panelRef.current?.querySelector<HTMLAnchorElement>("a[href]");
          if (anchor) anchor.click();
          else window.location.assign(singleLink.href);
        }}
        className={`inline-flex max-w-[16rem] cursor-pointer items-center gap-1 rounded-full border px-2 py-px text-xs font-medium transition-colors duration-150 ${
          open
            ? "border-[#D6D3CC] bg-[#ECEAE5] text-[#1F1E1C]"
            : "border-[#E6E4DF] bg-[#F4F3F0]/80 text-[#5E5B55] hover:border-[#D6D3CC] hover:bg-[#ECEAE5] hover:text-[#1F1E1C]"
        }`}
      >
        <GlobeIcon />
        <span className="truncate">
          {first.title || citationSourceLabel(first.href, first.id)}
        </span>
        {citations.length > 1 && <span>+{citations.length - 1}</span>}
      </button>
      {panelNode && (portalHost ? createPortal(panelNode, portalHost) : panelNode)}
    </span>
  );
}
