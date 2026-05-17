"use client";

import { Suspense } from "react";
import { NotesClient } from "./NotesClient";

export default function NotesPage() {
  return (
    <Suspense fallback={
      <div className="max-w-4xl mx-auto px-6 py-24 text-center">
        <p className="text-sm font-mono text-muted-foreground">Loading...</p>
      </div>
    }>
      <NotesClient />
    </Suspense>
  );
}
