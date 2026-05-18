import type { Metadata } from "next";
import { ThemeToggle } from "@/components/theme-toggle";
import { ToastProvider } from "@/components/ui/toast";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Notes — Cris.dev",
  description: "Thoughts, links, and things worth saving.",
};

export default function NotesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen relative">
      {/* Grid background + gradient blobs */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-background" />
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.04] dark:opacity-[0.06]"
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
          className="absolute top-0 left-1/4 w-[40rem] h-[30rem] rounded-full blur-[8rem] opacity-[0.06] dark:opacity-[0.08]"
          style={{ background: "radial-gradient(circle, #6b9ac4 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-[30rem] h-[25rem] rounded-full blur-[6rem] opacity-[0.04] dark:opacity-[0.06]"
          style={{ background: "radial-gradient(circle, #8bb5d9 0%, transparent 70%)" }}
        />
      </div>

      <header className="fixed top-0 left-0 right-0 z-50">
        <div className="h-px bg-gradient-to-r from-transparent via-[#6b9ac4]/40 to-transparent" />
        <div className="bg-background/75 backdrop-blur-2xl border-b border-border/30">
          <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-xs font-mono group"
              >
                <svg
                  className="w-3 h-3 transition-transform group-hover:-translate-x-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                home
              </Link>
              <span className="text-border/60 select-none">/</span>
              <Link href="/notes" className="text-sm font-medium text-foreground tracking-tight">
                notes
              </Link>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="relative z-10 pt-14">
        <ToastProvider>{children}</ToastProvider>
      </main>
    </div>
  );
}
