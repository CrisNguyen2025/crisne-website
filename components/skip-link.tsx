"use client";

export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 
                 focus:z-50 focus:px-4 focus:py-2 focus:bg-background focus:text-foreground 
                 focus:rounded-md focus:ring-2 focus:ring-primary focus:outline-none
                 transition-all"
    >
      Skip to main content
    </a>
  );
}
