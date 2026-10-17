import React from "react";

// Dots that pulse one after another: each grows and brightens, then settles.
// Colour follows `currentColor`. Keyframes live in globals.css (`animate-pulsating-dot`),
// so the SDK keeps no animation dependency; reduced-motion users get a slower pulse.
export function PulsatingDots({ dots = 3, className = "" }: { dots?: number; className?: string }) {
  const count = Number.isFinite(dots) ? Math.max(1, Math.floor(dots)) : 3;

  return (
    <span role="status" className={`inline-flex items-center justify-center ${className}`}>
      <span aria-hidden="true" className="inline-flex w-full gap-[16%]">
        {Array.from({ length: count }, (_, index) => (
          <span
            key={index}
            className="inline-block aspect-square grow rounded-full bg-current animate-pulsating-dot"
            style={{ animationDelay: `${index * 0.3}s` }}
          />
        ))}
      </span>
      <span className="sr-only">Đang xử lý</span>
    </span>
  );
}
