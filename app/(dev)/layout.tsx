import { notFound } from "next/navigation";
import type { ReactNode } from "react";

// Internal test pages: available in development only, 404 in production
export default function DevOnlyLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
