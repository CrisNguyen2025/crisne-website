import type { Metadata } from "next";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Notes — Cris.dev",
  description: "Thoughts, links, and things worth saving.",
};

export default function NotesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/notes" className="text-sm font-medium text-foreground">
            notes
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="pt-14">{children}</main>
    </div>
  );
}
