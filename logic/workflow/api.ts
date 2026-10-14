import type { WorkflowGraph, WorkflowUi } from "@/lib/workflow/dsl-types";
import type { RunDetail, RunSummary } from "@/lib/workflow/run-service";
import type { ValidationError } from "@/lib/workflow/dsl-validator";

export interface SaveDraftResponse {
  draftGraphHash: string;
  errors: ValidationError[];
}

export interface RunWorkflowResponse {
  run?: RunDetail;
  errors?: ValidationError[];
  error?: string;
}

export async function saveWorkflowDraftApi(
  workflowId: string,
  graph: WorkflowGraph,
  ui: WorkflowUi,
  name?: string
): Promise<SaveDraftResponse> {
  const res = await fetch(`/api/workflows/${workflowId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ graph, ui, name }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to save draft (${res.status})`);
  }

  return res.json();
}

export async function executeRunApi(
  workflowId: string,
  input: { query: string },
  dryRun: boolean,
  versionId?: string
): Promise<RunWorkflowResponse> {
  const res = await fetch(`/api/workflows/${workflowId}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, dryRun, versionId }),
  });

  const data = await res.json().catch(() => ({}));
  if (res.status === 422) {
    return { errors: data.errors };
  }
  if (!res.ok) {
    return { error: data.error || `Run failed with status ${res.status}` };
  }

  return data;
}

export async function fetchRunsHistoryApi(workflowId: string): Promise<RunSummary[]> {
  const res = await fetch(`/api/workflows/${workflowId}/runs?limit=20`);
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({ runs: [] }));
  return data.runs ?? [];
}

export async function fetchRunDetailApi(workflowId: string, runId: string): Promise<RunDetail | null> {
  const res = await fetch(`/api/workflows/${workflowId}/runs/${runId}`);
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({ run: null }));
  return data.run ?? null;
}

export interface ProjectDocumentItem {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: "PENDING" | "READY" | "FAILED";
  error: string | null;
  chunksCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function fetchProjectDocumentsApi(projectId: string): Promise<ProjectDocumentItem[]> {
  const res = await fetch(`/api/workflows/projects/${projectId}/documents`);
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({ documents: [] }));
  return data.documents ?? [];
}

export async function uploadProjectDocumentApi(
  projectId: string,
  file: File
): Promise<{ document?: ProjectDocumentItem; skipped?: boolean; error?: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`/api/workflows/projects/${projectId}/documents`, {
    method: "POST",
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: data.error || `Upload failed with status ${res.status}` };
  }
  return data;
}

export async function deleteProjectDocumentApi(
  projectId: string,
  documentId: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/workflows/projects/${projectId}/documents/${documentId}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error || `Delete failed with status ${res.status}` };
  }
  return { ok: true };
}

export interface WorkflowVersionItem {
  id: string;
  versionNumber: number;
  graphHash: string;
  createdAt: string;
}

export async function fetchWorkflowVersionsApi(workflowId: string): Promise<WorkflowVersionItem[]> {
  const res = await fetch(`/api/workflows/${workflowId}/versions`);
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({ versions: [] }));
  return data.versions ?? [];
}

export async function publishWorkflowVersionApi(
  workflowId: string
): Promise<{ version?: WorkflowVersionItem; errors?: ValidationError[]; error?: string }> {
  const res = await fetch(`/api/workflows/${workflowId}/versions`, {
    method: "POST",
  });

  const data = await res.json().catch(() => ({}));
  if (res.status === 422) {
    return { errors: data.errors };
  }
  if (!res.ok) {
    return { error: data.error || `Publish failed with status ${res.status}` };
  }
  return data;
}
