"use client";

import { Suspense } from "react";
import { NotesClient } from "./NotesClient";

export default function NotesPage() {
  return (
    <>
      {/* Grid background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-background" />
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.03] dark:opacity-[0.05]"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <pattern
              id="notes-grid"
              x="0"
              y="0"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#notes-grid)" />
        </svg>
        <div
          className="absolute top-[-10%] right-[-5%] w-[35rem] h-[35rem] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(107, 154, 196, 0.12), transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-[-15%] left-[-5%] w-[30rem] h-[30rem] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(107, 154, 196, 0.08), transparent 70%)",
          }}
        />
      </div>

      <Suspense
        fallback={
          <div className="max-w-4xl mx-auto px-6 py-24 text-center">
            <p className="text-sm font-mono text-muted-foreground">
              Loading...
            </p>
          </div>
        }
      >
        <NotesClient />
      </Suspense>
    </>
  );
}
