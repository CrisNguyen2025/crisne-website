"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Network, Sparkles, BookOpen, Cpu, Bot, GitFork, FileCode, ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

interface KnowledgeHeaderProps {
  activeType?: string;
  activeView?: string;
  className?: string;
}

export function KnowledgeHeader({ activeType, activeView, className }: KnowledgeHeaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentType = activeType || searchParams?.get("type") || "";
  const currentView = activeView || searchParams?.get("view") || "";

  const navLinks = [
    { label: "Topics", href: "/knowledge?type=topic", type: "topic", icon: BookOpen },
    { label: "Skills", href: "/knowledge?type=skill", type: "skill", icon: Sparkles },
    { label: "MCPs", href: "/knowledge?type=mcp", type: "mcp", icon: Cpu },
    { label: "Agents", href: "/knowledge?type=agent", type: "agent", icon: Bot },
    { label: "Graph", href: "/knowledge?view=graph", view: "graph", icon: GitFork },
    { label: "API Docs", href: "/docs", isExternalPath: true, icon: FileCode },
  ];

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b border-zinc-200 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md transition-colors",
        className
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left Section: Logo & Agent Ready Badge */}
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="group inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors mr-2"
            aria-label="Back to main portfolio"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
            <span className="hidden sm:inline">Portfolio</span>
          </Link>

          <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800" />

          <Link href="/knowledge" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm group-hover:scale-105 transition-transform">
              <Network className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 text-sm font-mono">
                  Knowledge OS
                </span>
                {/* Badge: Agent Ready */}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                  Agent Ready
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono hidden md:inline">
                Cris Nguyen Knowledge Base
              </span>
            </div>
          </Link>
        </div>

        {/* Center / Right Section: Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 font-mono text-xs" aria-label="Knowledge OS Navigation">
          {navLinks.map((link) => {
            const Icon = link.icon;
            let isActive = false;

            if (link.view) {
              isActive = currentView === link.view;
            } else if (link.type) {
              isActive = currentType === link.type && currentView !== "graph";
            } else if (link.isExternalPath) {
              isActive = pathname.startsWith("/docs") || pathname.startsWith("/api/docs");
            }

            return (
              <Link
                key={link.label}
                href={link.href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all",
                  isActive
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", isActive ? "text-zinc-900 dark:text-zinc-100" : "opacity-70")} />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>

      {/* Mobile Nav Bar */}
      <div className="flex md:hidden overflow-x-auto border-t border-zinc-200 dark:border-zinc-800/80 px-4 py-2 gap-1 scrollbar-none font-mono text-xs">
        {navLinks.map((link) => {
          const Icon = link.icon;
          let isActive = false;
          if (link.view) {
            isActive = currentView === link.view;
          } else if (link.type) {
            isActive = currentType === link.type && currentView !== "graph";
          }

          return (
            <Link
              key={link.label}
              href={link.href}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2.5 py-1 whitespace-nowrap font-medium transition-all text-xs",
                isActive
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              )}
            >
              <Icon className="h-3 w-3" />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </div>
    </header>
  );
}
