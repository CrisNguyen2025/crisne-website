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
  layerId?: string | null;
  layerTag?: string | null;
  level?: string | null;
  draftTitle?: string | null;
  draftContent?: string | null;
  verifyScore?: number | null;
  verifyNote?: string | null;
  createdAt: string;
  updatedAt: string;
}

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY ?? "";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const defaultHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (ADMIN_KEY) {
    defaultHeaders["x-admin-key"] = ADMIN_KEY;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    cache: "no-store",
    headers: { ...defaultHeaders, ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const errorJson = await res.json();
      errorDetail = errorJson.error || JSON.stringify(errorJson);
    } catch {
      const text = await res.text().catch(() => "");
      if (text) errorDetail = text;
    }
    throw new Error(errorDetail || `Request failed with status ${res.status}`);
  }

  if (res.status === 204) {
    return {} as T;
  }

  return res.json() as Promise<T>;
}

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
  id: string
): Promise<{ success: boolean; createdItem: unknown; triage: TriageItem }> {
  return apiFetch<{ success: boolean; createdItem: unknown; triage: TriageItem }>(
    `/api/v1/roadmaps/triage/${id}/approve`,
    { method: "POST" }
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

export interface CreateTriagePayload {
  query: string;
  assistantMsg?: string | null;
  reason?: string | null;
  comment?: string | null;
  traceId?: string | null;
  roadmapSlug?: string | null;
}

/** Create a new knowledge triage record from negative feedback */
export async function createTriageItem(payload: CreateTriagePayload): Promise<TriageItem> {
  const res = await apiFetch<{ item: TriageItem }>("/api/v1/roadmaps/triage", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.item;
}

/** Submit chat feedback to analytics and triage system */
export async function submitChatFeedback(payload: {
  traceId: string;
  value: 0 | 1;
  reason?: string;
  comment?: string;
  query?: string;
  assistantMsg?: string;
  roadmapSlug?: string;
}): Promise<void> {
  await apiFetch<void>("/api/chat/feedback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

