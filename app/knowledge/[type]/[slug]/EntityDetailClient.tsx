"use client";

import { useState } from "react";
import Link from "next/link";
import { KnowledgeEntity } from "@/types/knowledge";
import {
  Copy,
  Check,
  Code2,
  UserCheck,
  ExternalLink,
  BookOpen,
  Sparkles,
  Cpu,
  Bot,
  Layers,
  Briefcase,
  Clock,
  Calendar,
  Gauge,
  Tag as TagIcon,
  Terminal,
  Share2,
  FileCheck,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EntityDetailClientProps {
  entity: KnowledgeEntity;
  relatedSkills: KnowledgeEntity[];
  relatedMcps: KnowledgeEntity[];
  relatedAgents: KnowledgeEntity[];
  relatedTopics: KnowledgeEntity[];
  relatedProjects: KnowledgeEntity[];
  relatedArchitectures: KnowledgeEntity[];
}

export function EntityDetailClient({
  entity,
  relatedSkills,
  relatedMcps,
  relatedAgents,
  relatedTopics,
  relatedProjects,
  relatedArchitectures,
}: EntityDetailClientProps) {
  const [activeTab, setActiveTab] = useState<"human" | "agent">("human");
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Format Machine-Readable Agent JSON Payload
  const agentJsonPayload = {
    "@context": "https://crisne.blog/schemas/knowledge-entity.jsonld",
    "@type": "KnowledgeEntity",
    id: entity.id,
    slug: entity.slug,
    entityType: entity.type,
    title: entity.title,
    summary: entity.summary,
    description: entity.description,
    category: entity.category,
    difficulty: entity.difficulty,
    tags: entity.tags,
    readingTimeMin: entity.readingTimeMin,
    timestamps: {
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    },
    links: {
      officialDocs: entity.officialDocs || [],
      githubLinks: entity.githubLinks || [],
    },
    relationships: {
      relatedTopics: relatedTopics.map((t) => ({ id: t.id, title: t.title, slug: t.slug })),
      requiredSkills: relatedSkills.map((s) => ({ id: s.id, title: s.title, slug: s.slug })),
      recommendedMcps: relatedMcps.map((m) => ({ id: m.id, title: m.title, slug: m.slug })),
      associatedAgents: relatedAgents.map((a) => ({ id: a.id, title: a.title, slug: a.slug })),
      architectureBlueprints: relatedArchitectures.map((arch) => ({ id: arch.id, title: arch.title, slug: arch.slug })),
      referenceProjects: relatedProjects.map((p) => ({ id: p.id, title: p.title, slug: p.slug })),
    },
  };

  const jsonString = JSON.stringify(agentJsonPayload, null, 2);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(jsonString);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleCopyPrompt = () => {
    const promptText = `System Context Injection for AI Agent:
Target Entity: ${entity.title} (${entity.type})
Category: ${entity.category} | Difficulty: ${entity.difficulty}
Summary: ${entity.summary}
Tags: ${entity.tags.join(", ")}
Full Specification: ${jsonString}`;

    navigator.clipboard.writeText(promptText);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const typeIconMap: Record<string, any> = {
    topic: BookOpen,
    skill: Sparkles,
    mcp: Cpu,
    agent: Bot,
    architecture: Layers,
    project: Briefcase,
  };

  const Icon = typeIconMap[entity.type] || BookOpen;

  return (
    <div className="space-y-8">
      {/* Top Header Card */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/80 space-y-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-2.5 py-1 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold uppercase">
                <Icon className="h-3.5 w-3.5" />
                <span>{entity.type}</span>
              </span>

              <span className="rounded-md bg-zinc-100 px-2.5 py-1 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 font-medium">
                {entity.category}
              </span>

              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2.5 py-1 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-500/20">
                <Gauge className="h-3.5 w-3.5" />
                <span className="capitalize">{entity.difficulty}</span>
              </span>
            </div>

            <h1 className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {entity.title}
            </h1>

            <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed font-sans">
              {entity.summary}
            </p>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5 pt-2">
              {entity.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          {/* View Switcher Tabs (Human vs AI Agent) */}
          <div className="inline-flex items-center rounded-xl border border-zinc-200 bg-zinc-50 p-1 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-950 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab("human")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3.5 py-2 font-medium transition-colors cursor-pointer",
                activeTab === "human"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              )}
            >
              <UserCheck className="h-4 w-4" />
              <span>Human UI</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("agent")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3.5 py-2 font-medium transition-colors cursor-pointer",
                activeTab === "agent"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              )}
            >
              <Code2 className="h-4 w-4" />
              <span>AI Agent Spec</span>
            </button>
          </div>
        </div>

        {/* Metadata Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 font-mono text-xs text-zinc-500 dark:text-zinc-400">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-zinc-400" />
              <span>{entity.readingTimeMin} min read</span>
            </span>

            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-zinc-400" />
              <span>Updated: {new Date(entity.updatedAt).toLocaleDateString()}</span>
            </span>
          </div>

          {/* Docs Links */}
          <div className="flex items-center gap-3">
            {entity.officialDocs && entity.officialDocs.length > 0 && (
              <a
                href={entity.officialDocs[0]}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 font-medium"
              >
                <span>Official Docs</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}

            {entity.githubLinks && entity.githubLinks.length > 0 && (
              <a
                href={entity.githubLinks[0]}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 font-medium"
              >
                <span>GitHub</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Main Tab Content */}
      {activeTab === "human" ? (
        <div className="space-y-8">
          {/* Detailed Description */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/80 space-y-4">
            <h2 className="font-mono text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Overview & Technical Specification
            </h2>
            <div className="text-sm sm:text-base text-zinc-700 dark:text-zinc-300 leading-relaxed font-sans space-y-4">
              <p>{entity.description}</p>
            </div>
          </section>

          {/* Graph Relationships Grid */}
          <section className="space-y-6">
            <h2 className="font-mono text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Layers className="h-5 w-5 text-sky-500" />
              <span>Knowledge Graph Relationships</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Required / Related Skills */}
              {relatedSkills.length > 0 && (
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/80 space-y-3">
                  <h3 className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Required Skills ({relatedSkills.length})</span>
                  </h3>
                  <div className="space-y-2">
                    {relatedSkills.map((s) => (
                      <Link
                        key={s.id}
                        href={`/knowledge/skill/${s.slug}`}
                        className="block rounded-xl border border-zinc-100 bg-zinc-50 p-3 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-500/40"
                      >
                        <div className="flex items-center justify-between font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          <span>{s.title}</span>
                          <ArrowUpRight className="h-3.5 w-3.5 text-zinc-400" />
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-1 font-sans">
                          {s.summary}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommended MCPs */}
              {relatedMcps.length > 0 && (
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/80 space-y-3">
                  <h3 className="font-mono text-xs font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5" />
                    <span>Model Context Protocol (MCP) ({relatedMcps.length})</span>
                  </h3>
                  <div className="space-y-2">
                    {relatedMcps.map((m) => (
                      <Link
                        key={m.id}
                        href={`/knowledge/mcp/${m.slug}`}
                        className="block rounded-xl border border-zinc-100 bg-zinc-50 p-3 hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-all dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-cyan-500/40"
                      >
                        <div className="flex items-center justify-between font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          <span>{m.title}</span>
                          <ArrowUpRight className="h-3.5 w-3.5 text-zinc-400" />
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-1 font-sans">
                          {m.summary}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Associated Agents */}
              {relatedAgents.length > 0 && (
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/80 space-y-3">
                  <h3 className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Bot className="h-3.5 w-3.5" />
                    <span>Autonomous AI Agents ({relatedAgents.length})</span>
                  </h3>
                  <div className="space-y-2">
                    {relatedAgents.map((a) => (
                      <Link
                        key={a.id}
                        href={`/knowledge/agent/${a.slug}`}
                        className="block rounded-xl border border-zinc-100 bg-zinc-50 p-3 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-amber-500/40"
                      >
                        <div className="flex items-center justify-between font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          <span>{a.title}</span>
                          <ArrowUpRight className="h-3.5 w-3.5 text-zinc-400" />
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-1 font-sans">
                          {a.summary}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Architecture & Projects */}
              {(relatedArchitectures.length > 0 || relatedProjects.length > 0) && (
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/80 space-y-3">
                  <h3 className="font-mono text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5" />
                    <span>Architecture & Real-world Implementations</span>
                  </h3>
                  <div className="space-y-2">
                    {relatedArchitectures.map((arch) => (
                      <Link
                        key={arch.id}
                        href={`/knowledge/architecture/${arch.slug}`}
                        className="block rounded-xl border border-zinc-100 bg-zinc-50 p-3 hover:border-rose-500/40 hover:bg-rose-500/5 transition-all dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-rose-500/40"
                      >
                        <div className="flex items-center justify-between font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          <span>{arch.title}</span>
                          <ArrowUpRight className="h-3.5 w-3.5 text-zinc-400" />
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-1 font-sans">
                          {arch.summary}
                        </p>
                      </Link>
                    ))}

                    {relatedProjects.map((p) => (
                      <Link
                        key={p.id}
                        href={`/knowledge/project/${p.slug}`}
                        className="block rounded-xl border border-zinc-100 bg-zinc-50 p-3 hover:border-blue-500/40 hover:bg-blue-500/5 transition-all dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-blue-500/40"
                      >
                        <div className="flex items-center justify-between font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          <span>{p.title}</span>
                          <ArrowUpRight className="h-3.5 w-3.5 text-zinc-400" />
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-1 font-sans">
                          {p.summary}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : (
        /* AI Agent Machine Context & JSON Preview Tab */
        <div className="space-y-6">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-900 p-6 text-zinc-100 dark:border-zinc-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-3 font-mono text-xs">
                <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-semibold text-emerald-400">JSON-LD / Agent Context Standard</span>
                <span className="text-zinc-500">|</span>
                <span className="text-zinc-400">ID: {entity.id}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 font-mono text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  {copiedPrompt ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Terminal className="h-3.5 w-3.5 text-amber-400" />}
                  <span>{copiedPrompt ? "Prompt Copied!" : "Copy LLM Prompt"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 font-mono text-xs font-semibold text-zinc-950 hover:bg-emerald-400 transition-colors cursor-pointer"
                >
                  {copiedJson ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedJson ? "Copied JSON!" : "Copy Raw JSON"}</span>
                </button>
              </div>
            </div>

            {/* Code View Area */}
            <div className="relative overflow-x-auto rounded-xl bg-zinc-950 p-4 border border-zinc-800 font-mono text-xs text-emerald-400 leading-relaxed max-h-[500px] scrollbar-thin">
              <pre>{jsonString}</pre>
            </div>

            <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-400 pt-2">
              <FileCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>
                This schema conforms to Model Context Protocol (MCP) and LLM System Prompt Injection specs.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
