/**
 * Knowledge Triage Service
 *
 * Encapsulates all API calls for Missing Knowledge Triage & Agent Admin verification.
 * Follows clean architecture: UI components must use this module instead of raw fetch.
 */

export interface TriageItem {
  id: string;
  traceId?: string | null;
  query: string;
  assistantMsg?: string | null;
  reason?: string | null;
  comment?: string | null;
  status: "PENDING" | "DRAFTED" | "APPROVED" | "DISMISSED";
  roadmapSlug?: string | null;
  /** The topic's section the draft is for (ADR-0009); null = no section */
  section?: string | null;
  draftTitle?: string | null;
  draftContent?: string | null;
  verifyScore?: number | null;
  verifyNote?: string | null;
  createdAt: string;
  updatedAt: string;
}

import { apiFetch } from "@/logic/api-fetch";

/** Fetch all active triage items */
export async function fetchTriageItems(): Promise<TriageItem[]> {
  const res = await apiFetch<{ items: TriageItem[] }>("/api/v1/roadmaps/triage");
  return res.items || [];
}

/** Trigger LLM draft generation and Agent Admin verification for a triage item */
export async function generateTriageDraft(id: string): Promise<TriageItem> {
  const res = await apiFetch<{ item: TriageItem }>(
    `/api/v1/roadmaps/triage/${id}/generate`,
    { method: "POST" }
  );
  return res.item;
}

/** Approve draft and publish directly into Roadmap database & live RAG sync */
export async function approveTriageDraft(
  id: string,
  section?: string
): Promise<{ success: boolean; createdItem: unknown; triage: TriageItem }> {
  return apiFetch<{ success: boolean; createdItem: unknown; triage: TriageItem }>(
    `/api/v1/roadmaps/triage/${id}/approve`,
    { method: "POST", body: JSON.stringify(section ? { section } : {}) }
  );
}

/** Dismiss triage item */
export async function dismissTriageItem(id: string): Promise<TriageItem> {
  const res = await apiFetch<{ success: boolean; item: TriageItem }>(
    `/api/v1/roadmaps/triage/${id}/dismiss`,
    { method: "POST" }
  );
  return res.item;
}

/** Permanently delete a triage item that is still in process (PENDING or DRAFTED) */
export async function deleteTriageItem(id: string): Promise<void> {
  await apiFetch<{ success: boolean; id: string }>(`/api/v1/roadmaps/triage/${id}`, {
    method: "DELETE",
  });
}

/** Records a vote as a Langfuse score on the reply's trace (null takes the vote back) */
export async function submitChatFeedback(payload: {
  traceId: string;
  value: 0 | 1 | null;
  reason?: string;
  comment?: string;
  source?: string;
}): Promise<void> {
  await apiFetch<void>("/api/chat/feedback", {
    method: "POST",
    body: JSON.stringify(payload),
    // Still delivered when the tab closes right after the vote
    keepalive: true,
  });
}

/** Creates triage items from recent 👎 on the roadmap assistant, read from Langfuse */
export async function importTriageFromLangfuse(): Promise<{ imported: number; remaining: number }> {
  return apiFetch<{ imported: number; remaining: number }>("/api/v1/roadmaps/triage/import", {
    method: "POST",
  });
}


export interface GoldenSetStatus {
  dataset: string;
  /** Written by `python -m evals sync-dataset` when it last changed the committed golden set */
  sync: { dataset: string; synced_at: string; samples: number } | null;
  datasetItems?: number;
  queuePending?: number | null;
  queueUrl?: string | null;
  /** Langfuse could not be read: only the committed part is known */
  error?: string;
}

/** Golden set as committed next to Langfuse live (dataset items, 👎 waiting for review) */
export async function fetchGoldenSetStatus(): Promise<GoldenSetStatus> {
  return apiFetch<GoldenSetStatus>("/api/v1/roadmaps/triage/golden-set");
}
