import React from 'react';
import Link from 'next/link';

export function EditorialHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-2.5 px-4 sm:px-6">
        <Link
          href="/"
          prefetch={true}
          className="text-sm font-semibold tracking-tight text-foreground transition-opacity duration-150 hover:opacity-75"
        >
          Crisne
        </Link>
        <span className="rounded-md border border-border/80 bg-muted/60 px-1.5 py-0.5 text-[0.6875rem] font-medium tracking-tight text-muted-foreground">
          Knowledge Based
        </span>
      </div>
    </header>
  );
}
