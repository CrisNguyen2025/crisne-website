import React from "react";

export default function LessonsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="roadmap-theme min-h-dvh bg-background text-foreground flex flex-col">
      {children}
    </div>
  );
}
