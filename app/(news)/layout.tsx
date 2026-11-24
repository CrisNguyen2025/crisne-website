import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "News",
  robots: {
    index: false,
    follow: false,
  },
};

export default function NewsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="roadmap-theme min-h-dvh bg-background text-foreground">
      {children}
    </div>
  );
}
