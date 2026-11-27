import { z } from "zod";

export const GMAIL_PROVIDER = "gmail";

export const GmailConfigSchema = z
  .object({
    allowedLabelIds: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
    defaultQuery: z.string().trim().max(200).optional(),
    maxEmails: z.number().int().min(1).max(5).optional(),
    excludeSensitiveSubjects: z.boolean().optional(),
  })
  .strict();

export type GmailConnectorConfig = {
  allowedLabelIds: string[];
  defaultQuery: string;
  maxEmails: number;
  excludeSensitiveSubjects: boolean;
};

export const GmailQuerySchema = z
  .object({
    query: z.string().trim().max(300).optional(),
    maxResults: z.number().int().min(1).max(5).optional(),
  })
  .strict();

export const DEFAULT_GMAIL_CONFIG: GmailConnectorConfig = {
  allowedLabelIds: [],
  defaultQuery: "newer_than:14d",
  maxEmails: 5,
  excludeSensitiveSubjects: true,
};

export function parseGmailConfigJson(raw: string | null | undefined): GmailConnectorConfig {
  if (!raw) return { ...DEFAULT_GMAIL_CONFIG };
  try {
    const parsed = GmailConfigSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { ...DEFAULT_GMAIL_CONFIG };
    return {
      allowedLabelIds: parsed.data.allowedLabelIds ?? [],
      defaultQuery: parsed.data.defaultQuery ?? DEFAULT_GMAIL_CONFIG.defaultQuery,
      maxEmails: parsed.data.maxEmails ?? DEFAULT_GMAIL_CONFIG.maxEmails,
      excludeSensitiveSubjects:
        parsed.data.excludeSensitiveSubjects ?? DEFAULT_GMAIL_CONFIG.excludeSensitiveSubjects,
    };
  } catch {
    return { ...DEFAULT_GMAIL_CONFIG };
  }
}

export function mergeGmailConfig(
  current: GmailConnectorConfig,
  patch: z.infer<typeof GmailConfigSchema>
): GmailConnectorConfig {
  return {
    allowedLabelIds: patch.allowedLabelIds ?? current.allowedLabelIds,
    defaultQuery: patch.defaultQuery ?? current.defaultQuery,
    maxEmails: patch.maxEmails ?? current.maxEmails,
    excludeSensitiveSubjects: patch.excludeSensitiveSubjects ?? current.excludeSensitiveSubjects,
  };
}

export interface GmailLabelOption {
  id: string;
  name: string;
}

export interface GmailConnectorStatusPayload {
  connected: boolean;
  status: "disconnected" | "connected" | "expired" | "error";
  accountEmail: string | null;
  config: GmailConnectorConfig;
  labels?: GmailLabelOption[];
  lastSyncedAt?: string | null;
  lastError?: string | null;
}

export interface SanitizedGmailMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body: string;
}
