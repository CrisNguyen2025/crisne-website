import { notFound } from "next/navigation";
import Link from "next/link";
import { KnowledgeRegistry } from "@/lib/knowledge/registry";
import { KnowledgeHeader } from "@/components/knowledge/KnowledgeHeader";
import { EntityDetailClient } from "./EntityDetailClient";
import { ArrowLeft, BookOpen, ChevronRight } from "lucide-react";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{
    type: string;
    slug: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { type, slug } = await params;
  const entity = KnowledgeRegistry.getEntityByIdOrSlug(slug);

  if (!entity) {
    return {
      title: "Entity Not Found | Knowledge OS",
    };
  }

  return {
    title: `${entity.title} (${type.toUpperCase()}) | Knowledge OS`,
    description: entity.description || entity.summary,
  };
}

export default async function KnowledgeEntityPage({ params }: PageProps) {
  const { type, slug } = await params;
  const entity = KnowledgeRegistry.getEntityByIdOrSlug(slug);

  if (!entity) {
    notFound();
  }

  // Fetch related entities data for human view context
  const relatedSkillEntities = (entity.relatedSkills || [])
    .map((s) => KnowledgeRegistry.getEntityByIdOrSlug(s))
    .filter(Boolean);

  const relatedMcpEntities = (entity.relatedMcps || [])
    .map((m) => KnowledgeRegistry.getEntityByIdOrSlug(m))
    .filter(Boolean);

  const relatedAgentEntities = (entity.relatedAgents || [])
    .map((a) => KnowledgeRegistry.getEntityByIdOrSlug(a))
    .filter(Boolean);

  const relatedTopicEntities = (entity.relatedTopics || [])
    .map((t) => KnowledgeRegistry.getEntityByIdOrSlug(t))
    .filter(Boolean);

  const relatedProjectEntities = (entity.relatedProjects || [])
    .map((p) => KnowledgeRegistry.getEntityByIdOrSlug(p))
    .filter(Boolean);

  const relatedArchitectureEntities = (entity.relatedArchitectures || [])
    .map((arch) => KnowledgeRegistry.getEntityByIdOrSlug(arch))
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans">
      <KnowledgeHeader activeType={entity.type} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-2 font-mono text-xs text-zinc-500 dark:text-zinc-400" aria-label="Breadcrumb">
          <Link href="/knowledge" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
            Knowledge OS
          </Link>
          <ChevronRight className="h-3 w-3 text-zinc-400" />
          <Link
            href={`/knowledge?type=${entity.type}`}
            className="capitalize hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            {entity.type}s
          </Link>
          <ChevronRight className="h-3 w-3 text-zinc-400" />
          <span className="text-zinc-900 dark:text-zinc-100 font-medium truncate max-w-xs sm:max-w-md">
            {entity.title}
          </span>
        </nav>

        {/* Client Interactive Detail Component */}
        <EntityDetailClient
          entity={entity}
          relatedSkills={relatedSkillEntities as any[]}
          relatedMcps={relatedMcpEntities as any[]}
          relatedAgents={relatedAgentEntities as any[]}
          relatedTopics={relatedTopicEntities as any[]}
          relatedProjects={relatedProjectEntities as any[]}
          relatedArchitectures={relatedArchitectureEntities as any[]}
        />
      </main>
    </div>
  );
}
