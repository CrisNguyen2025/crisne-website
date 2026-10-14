import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getWorkflow } from "@/lib/workflow/repository";
import { WorkflowEditor } from "@/components/workflow-canvas/WorkflowEditor";
import type { WorkflowGraph, WorkflowUi } from "@/lib/workflow/dsl-types";

export const dynamic = "force-dynamic";

interface WorkflowCanvasPageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkflowCanvasPage({ params }: WorkflowCanvasPageProps) {
  const session = await auth();
  const ownerEmail = session?.user?.email?.toLowerCase().trim();

  if (!ownerEmail) {
    redirect("/api/auth/signin?callbackUrl=/workflows");
  }

  const { id } = await params;
  if (!id) notFound();

  const data = await getWorkflow(ownerEmail, id);
  if (!data) notFound();

  const rawDocs = await prisma.projectDocument.findMany({
    where: { projectId: data.workflow.projectId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { chunks: true } },
    },
  });

  const initialDocuments = rawDocs.map((d) => ({
    id: d.id,
    filename: d.filename,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    status: d.status as "PENDING" | "READY" | "FAILED",
    error: d.error,
    chunksCount: d._count.chunks,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }));

  const rawVersions = await prisma.workflowVersion.findMany({
    where: { workflowId: data.workflow.id },
    orderBy: { versionNumber: "desc" },
    select: {
      id: true,
      versionNumber: true,
      graphHash: true,
      createdAt: true,
    },
  });

  const initialVersions = rawVersions.map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    graphHash: v.graphHash,
    createdAt: v.createdAt.toISOString(),
  }));

  return (
    <WorkflowEditor
      workflow={{
        id: data.workflow.id,
        name: data.workflow.name,
        projectId: data.workflow.projectId,
        graph: data.workflow.graph as WorkflowGraph,
        ui: data.workflow.ui as WorkflowUi,
        draftGraphHash: data.workflow.draftGraphHash,
      }}
      initialErrors={data.errors}
      initialDocuments={initialDocuments}
      initialVersions={initialVersions}
    />
  );
}
