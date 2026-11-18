import React from 'react';
import { EditorialHeader } from '@/components/roadmap/EditorialHeader';

export default function LessonsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="roadmap-theme min-h-dvh bg-background text-foreground flex flex-col">
      <EditorialHeader />
      {children}
    </div>
  );
}
