"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface CloudItem {
  el: HTMLElement;
  x: number;
  y: number;
  z: number;
  cx: number;
  cy: number;
  cz: number;
}

interface IconCloudProps {
  readonly icons: React.ReactNode[];
  readonly className?: string;
  readonly radius?: number;
  readonly speed?: number;
}

function getSpherePositions(count: number): { x: number; y: number; z: number }[] {
  const positions: { x: number; y: number; z: number }[] = [];
  const phi = Math.acos(-1 + (2 * 0) / count);
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
  void phi;
  return positions;
}

export function IconCloud({ icons, className, radius = 220, speed = 0.4 }: IconCloudProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<CloudItem[]>([]);
  const rafRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0, y: 0, isOver: false });
  const rotRef = useRef({ ax: 0.012, ay: 0.018 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const applyPositions = useCallback((items: CloudItem[], r: number) => {
    items.forEach(item => {
      const scale = (item.z + r) / (2 * r);
      const opacity = scale * 0.7 + 0.3;
      const x = item.x * (r / r) + r;
      const y = item.y * (r / r) + r;
      item.el.style.transform = `translate3d(${x - item.el.offsetWidth / 2}px, ${y - item.el.offsetHeight / 2}px, 0) scale(${0.65 + scale * 0.55})`;
      item.el.style.opacity = String(opacity.toFixed(2));
      item.el.style.zIndex = String(Math.round(scale * 100));
      item.el.style.filter = scale > 0.6 ? "none" : `blur(${(0.6 - scale) * 2}px)`;
    });
  }, []);

  const rotateAll = useCallback(
    (items: CloudItem[], ax: number, ay: number) => {
      const cosX = Math.cos(ax);
      const sinX = Math.sin(ax);
      const cosY = Math.cos(ay);
      const sinY = Math.sin(ay);

      items.forEach(item => {
        let { x, y, z } = item;
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
    [applyPositions, radius],
  );

  useEffect(() => {
    if (!mounted || !containerRef.current) return;
    const container = containerRef.current;
    const els = Array.from(container.querySelectorAll<HTMLElement>("[data-cloud-item]"));
    if (els.length === 0) return;

    const positions = getSpherePositions(els.length);
    itemsRef.current = els.map((el, i) => ({
      el,
      x: positions[i].x * radius,
      y: positions[i].y * radius,
      z: positions[i].z * radius,
      cx: positions[i].x * radius,
      cy: positions[i].y * radius,
      cz: positions[i].z * radius,
    }));

    applyPositions(itemsRef.current, radius);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      mouseRef.current.x = (e.clientX - cx) / rect.width;
      mouseRef.current.y = (e.clientY - cy) / rect.height;
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseenter", () => {
      mouseRef.current.isOver = true;
    });
    container.addEventListener("mouseleave", () => {
      mouseRef.current.isOver = false;
      mouseRef.current.x = 0;
      mouseRef.current.y = 0;
    });

    const animate = () => {
      const { isOver, x, y } = mouseRef.current;
      const ax = isOver ? y * speed * 0.08 : rotRef.current.ax * speed;
      const ay = isOver ? -x * speed * 0.08 : rotRef.current.ay * speed;
      rotateAll(itemsRef.current, ax, ay);
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      container.removeEventListener("mousemove", handleMouseMove);
    };
  }, [mounted, radius, speed, applyPositions, rotateAll]);

  return (
    <div
      ref={containerRef}
      className={cn("relative select-none mx-auto max-w-full", className)}
      style={{ width: radius * 2, height: radius * 2 }}
    >
      {icons.map((icon, i) => (
        <div
          key={i}
          data-cloud-item=""
          className="absolute top-0 left-0 flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-card/70 backdrop-blur-sm border border-border/40 transition-none shadow-sm hover:border-border/70 hover:bg-card/90 cursor-default"
          style={{ willChange: "transform, opacity" }}
        >
          {icon}
        </div>
      ))}
    </div>
  );
}
