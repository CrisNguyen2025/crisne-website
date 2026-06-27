import type { Metadata } from "next";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "Notes — Cris.dev",
  description: "Thoughts, links, and things worth saving.",
};

export default function NotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen relative">
      {/* Grid background + gradient blobs */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
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
          style={{
            background: "radial-gradient(circle, #6b9ac4 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-[30rem] h-[25rem] rounded-full blur-[6rem] opacity-[0.04] dark:opacity-[0.06]"
          style={{
            background: "radial-gradient(circle, #8bb5d9 0%, transparent 70%)",
          }}
        />
      </div>

      <main className="relative">
        <ToastProvider>{children}</ToastProvider>
      </main>
    </div>
  );
}
