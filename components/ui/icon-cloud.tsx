"use client";

import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { MOBILE_VIEWPORT_QUERY, useMediaQuery } from "@/hooks/use-media-query";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

interface CloudItem {
  el: HTMLElement;
  x: number;
  y: number;
  z: number;
  cx: number;
  cy: number;
  cz: number;
  width: number;
  height: number;
}

interface IconCloudProps {
  readonly icons: React.ReactNode[];
  readonly className?: string;
  readonly radius?: number;
  readonly speed?: number;
}

function getSpherePositions(
  count: number
): { x: number; y: number; z: number }[] {
  const positions: { x: number; y: number; z: number }[] = [];

  const goldenRatio = (1 + Math.sqrt(5)) / 2;

  for (let i = 0; i < count; i++) {
    const theta = (2 * Math.PI * i) / goldenRatio;
    const phiAngle = Math.acos(1 - (2 * (i + 0.5)) / count);
    positions.push({
      x: Math.sin(phiAngle) * Math.cos(theta),
      y: Math.sin(phiAngle) * Math.sin(theta),
      z: Math.cos(phiAngle),
    });
  }

  return positions;
}

export function IconCloud({
  icons,
  className,
  radius = 220,
  speed = 0.4,
}: IconCloudProps) {
  const isMobile = useMediaQuery(MOBILE_VIEWPORT_QUERY);
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<CloudItem[]>([]);
  const rafRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0, y: 0, isOver: false });
  const rotRef = useRef({ ax: 0.012, ay: 0.018 });
  const applyPositions = useCallback((items: CloudItem[], r: number) => {
    items.forEach((item) => {
      const scale = (item.z + r) / (2 * r);
      const opacity = scale * 0.7 + 0.3;
      const x = item.x + r;
      const y = item.y + r;
      item.el.style.transform = `translate3d(${x - item.width / 2}px, ${y - item.height / 2}px, 0) scale(${0.65 + scale * 0.55})`;
      item.el.style.opacity = String(opacity.toFixed(2));
      item.el.style.zIndex = String(Math.round(scale * 10));
      item.el.style.filter =
        scale > 0.6 ? "none" : `blur(${(0.6 - scale) * 2}px)`;
    });
  }, []);

  const rotateAll = useCallback(
    (items: CloudItem[], ax: number, ay: number) => {
      const cosX = Math.cos(ax);
      const sinX = Math.sin(ax);
      const cosY = Math.cos(ay);
      const sinY = Math.sin(ay);

      items.forEach((item) => {
        const { x, y, z } = item;
        const y1 = y * cosX - z * sinX;
        const z1 = y * sinX + z * cosX;
        const x1 = x * cosY + z1 * sinY;
        const z2 = -x * sinY + z1 * cosY;
        item.x = x1;
        item.y = y1;
        item.z = z2;
      });

      applyPositions(items, radius);
    },
    [applyPositions, radius]
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const els = Array.from(
      container.querySelectorAll<HTMLElement>("[data-cloud-item]")
    );
    if (els.length === 0) return;

    if (isMobile) {
      els.forEach((el) => {
        el.style.removeProperty("transform");
        el.style.removeProperty("opacity");
        el.style.removeProperty("z-index");
        el.style.removeProperty("filter");
      });
      itemsRef.current = [];
      return;
    }

    const positions = getSpherePositions(els.length);
    itemsRef.current = els.map((el, i) => ({
      el,
      x: positions[i].x * radius,
      y: positions[i].y * radius,
      z: positions[i].z * radius,
      cx: positions[i].x * radius,
      cy: positions[i].y * radius,
      cz: positions[i].z * radius,
      width: el.offsetWidth,
      height: el.offsetHeight,
    }));

    applyPositions(itemsRef.current, radius);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      mouseRef.current.x = (e.clientX - cx) / rect.width;
      mouseRef.current.y = (e.clientY - cy) / rect.height;
    };

    const handleMouseEnter = () => {
      mouseRef.current.isOver = true;
    };

    const handleMouseLeave = () => {
      mouseRef.current.isOver = false;
      mouseRef.current.x = 0;
      mouseRef.current.y = 0;
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseenter", handleMouseEnter);
    container.addEventListener("mouseleave", handleMouseLeave);

    let isVisible = false;

    const stopAnimation = () => {
      if (rafRef.current === 0) return;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };

    const animate = () => {
      if (!isVisible || document.hidden) {
        rafRef.current = 0;
        return;
      }

      const { isOver, x, y } = mouseRef.current;
      const ax = isOver ? y * speed * 0.08 : rotRef.current.ax * speed;
      const ay = isOver ? -x * speed * 0.08 : rotRef.current.ay * speed;
      rotateAll(itemsRef.current, ax, ay);
      rafRef.current = requestAnimationFrame(animate);
    };

    const startAnimation = () => {
      if (prefersReducedMotion || rafRef.current !== 0) return;
      rafRef.current = requestAnimationFrame(animate);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible) startAnimation();
        else stopAnimation();
      },
      { rootMargin: "100px" }
    );

    const handleVisibilityChange = () => {
      if (document.hidden) stopAnimation();
      else if (isVisible) startAnimation();
    };

    observer.observe(container);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopAnimation();
      observer.disconnect();
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseenter", handleMouseEnter);
      container.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    isMobile,
    prefersReducedMotion,
    radius,
    speed,
    applyPositions,
    rotateAll,
  ]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "mx-auto max-w-full select-none",
        isMobile ? "grid w-fit grid-cols-6 gap-1.5" : "relative",
        className
      )}
      style={isMobile ? undefined : { width: radius * 2, height: radius * 2 }}
    >
      {icons.map((icon, i) => (
        <div
          key={`cloud-item-${i}`}
          data-cloud-item=""
          className={cn(
            "flex items-center justify-center rounded-xl border border-border/40 bg-card/70 shadow-sm transition-none hover:border-border/70 hover:bg-card/90",
            isMobile ? "relative size-10" : "absolute left-0 top-0 size-12"
          )}
          style={isMobile ? undefined : { willChange: "transform, opacity" }}
        >
          {icon}
        </div>
      ))}
    </div>
  );
}
