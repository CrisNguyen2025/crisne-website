import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret, isConnectorEncryptionConfigured } from "./crypto";
import {
  exchangeGmailOAuthCode,
  fetchGmailLabels,
  fetchGmailMessages,
  fetchGmailProfileEmail,
  GmailAuthError,
  isGoogleOAuthConfigured,
  refreshGmailAccessToken,
  revokeGoogleToken,
} from "./gmail-client";
import {
  DEFAULT_GMAIL_CONFIG,
  GMAIL_PROVIDER,
  mergeGmailConfig,
  parseGmailConfigJson,
  type GmailConnectorConfig,
  type GmailConnectorStatusPayload,
  type SanitizedGmailMessage,
} from "./schemas";

const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60_000;

export class GmailConnectorStateError extends Error {
  readonly code: "GMAIL_NOT_CONNECTED" | "GMAIL_TOKEN_EXPIRED" | "GMAIL_CONFIG_MISSING";

  constructor(
    code: "GMAIL_NOT_CONNECTED" | "GMAIL_TOKEN_EXPIRED" | "GMAIL_CONFIG_MISSING",
    message: string
  ) {
    super(message);
    this.code = code;
  }
}

async function resolveValidAccessToken(row: {
  id: string;
  encryptedRefreshToken: string;
  encryptedAccessToken: string | null;
  tokenExpiresAt: Date | null;
}): Promise<string> {
  const now = Date.now();
  if (
    row.encryptedAccessToken &&
    row.tokenExpiresAt &&
    row.tokenExpiresAt.getTime() - ACCESS_TOKEN_REFRESH_BUFFER_MS > now
  ) {
    return decryptSecret(row.encryptedAccessToken);
  }

  const refreshToken = decryptSecret(row.encryptedRefreshToken);
  try {
    const refreshed = await refreshGmailAccessToken(refreshToken);
    const expiresAt = new Date(Date.now() + refreshed.expiresInSeconds * 1000);
    await prisma.ownerConnector.update({
      where: { id: row.id },
      data: {
        status: "connected",
        encryptedAccessToken: encryptSecret(refreshed.accessToken),
        tokenExpiresAt: expiresAt,
        lastError: null,
      },
    });
    return refreshed.accessToken;
  } catch (err) {
    if (err instanceof GmailAuthError && err.code === "GMAIL_TOKEN_EXPIRED") {
      await prisma.ownerConnector.update({
        where: { id: row.id },
        data: { status: "expired", lastError: "GMAIL_TOKEN_EXPIRED" },
      });
      throw new GmailConnectorStateError("GMAIL_TOKEN_EXPIRED", "Gmail authorization expired");
    }
    throw err;
  }
}

export async function getGmailConnectorStatus(options?: {
  includeLabels?: boolean;
}): Promise<GmailConnectorStatusPayload> {
  const row = await prisma.ownerConnector.findUnique({
    where: { provider: GMAIL_PROVIDER },
  });
  if (!row) {
    return {
      connected: false,
      status: "disconnected",
      accountEmail: null,
      config: { ...DEFAULT_GMAIL_CONFIG },
    };
  }

  const config = parseGmailConfigJson(row.configJson);
  const statusValue =
    row.status === "expired" || row.status === "error" ? row.status : "connected";

  let labels: GmailConnectorStatusPayload["labels"];
  let resolvedStatus: GmailConnectorStatusPayload["status"] = statusValue;

  if (
    options?.includeLabels &&
    resolvedStatus === "connected" &&
    isConnectorEncryptionConfigured() &&
    isGoogleOAuthConfigured()
  ) {
    try {
      const accessToken = await resolveValidAccessToken(row);
      labels = await fetchGmailLabels(accessToken);
    } catch (err) {
      if (
        (err instanceof GmailConnectorStateError || err instanceof GmailAuthError) &&
        err.code === "GMAIL_TOKEN_EXPIRED"
      ) {
        resolvedStatus = "expired";
      }
    }
  }

  return {
    connected: resolvedStatus === "connected",
    status: resolvedStatus,
    accountEmail: row.accountEmail,
    config,
    ...(labels ? { labels } : {}),
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    lastError: row.lastError ?? null,
  };
}

export async function saveGmailOAuthTokens(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<void> {
  const tokens = await exchangeGmailOAuthCode(params);
  const email = await fetchGmailProfileEmail(tokens.accessToken);
  const existing = await prisma.ownerConnector.findUnique({
    where: { provider: GMAIL_PROVIDER },
  });

  const encryptedAccessToken = encryptSecret(tokens.accessToken);
  const encryptedRefreshToken = tokens.refreshToken
    ? encryptSecret(tokens.refreshToken)
    : existing?.encryptedRefreshToken ?? "";

  if (!encryptedRefreshToken) {
    throw new GmailAuthError("GMAIL_OAUTH_FAILED", "Google did not return a refresh token");
  }

  const tokenExpiresAt = new Date(Date.now() + tokens.expiresInSeconds * 1000);
  await prisma.ownerConnector.upsert({
    where: { provider: GMAIL_PROVIDER },
    create: {
      provider: GMAIL_PROVIDER,
      status: "connected",
      accountEmail: email,
      encryptedRefreshToken,
      encryptedAccessToken,
      tokenExpiresAt,
      scopes: tokens.scope,
      configJson: JSON.stringify(DEFAULT_GMAIL_CONFIG),
      lastError: null,
    },
    update: {
      status: "connected",
      accountEmail: email,
      encryptedRefreshToken,
      encryptedAccessToken,
      tokenExpiresAt,
      scopes: tokens.scope,
      lastError: null,
    },
  });
}

export async function updateGmailConnectorConfig(
  patch: Partial<GmailConnectorConfig>
): Promise<GmailConnectorStatusPayload | null> {
  const row = await prisma.ownerConnector.findUnique({
    where: { provider: GMAIL_PROVIDER },
  });
  if (!row) return null;

  const merged = mergeGmailConfig(parseGmailConfigJson(row.configJson), patch);
  await prisma.ownerConnector.update({
    where: { id: row.id },
    data: { configJson: JSON.stringify(merged) },
  });
  return getGmailConnectorStatus({ includeLabels: true });
}

export async function disconnectGmailConnector(): Promise<void> {
  const row = await prisma.ownerConnector.findUnique({
    where: { provider: GMAIL_PROVIDER },
  });
  if (!row) return;

  if (isConnectorEncryptionConfigured()) {
    try {
      const refresh = decryptSecret(row.encryptedRefreshToken);
      await revokeGoogleToken(refresh);
    } catch {
      // Proceed with local removal even if token cannot be decrypted or revoked remotely.
    }
  }
  await prisma.ownerConnector.delete({ where: { id: row.id } });
}

export async function queryConnectedGmail(params: {
  query?: string;
  maxResults?: number;
}): Promise<{ accountEmail: string; messages: SanitizedGmailMessage[] }> {
  if (!isConnectorEncryptionConfigured() || !isGoogleOAuthConfigured()) {
    throw new GmailConnectorStateError(
      "GMAIL_CONFIG_MISSING",
      "Gmail connector environment variables are not configured"
    );
  }
  const row = await prisma.ownerConnector.findUnique({
    where: { provider: GMAIL_PROVIDER },
  });
  if (!row) {
    throw new GmailConnectorStateError("GMAIL_NOT_CONNECTED", "Gmail is not connected");
  }
  if (row.status === "expired") {
    throw new GmailConnectorStateError("GMAIL_TOKEN_EXPIRED", "Gmail connection expired");
  }

  const config = parseGmailConfigJson(row.configJson);
  const accessToken = await resolveValidAccessToken(row);
  const combinedQuery = [params.query?.trim(), config.defaultQuery.trim()]
    .filter(Boolean)
    .join(" ");
  const capped = Math.max(1, Math.min(params.maxResults ?? config.maxEmails, 5));

  try {
    const messages = await fetchGmailMessages({
      accessToken,
      query: combinedQuery,
      allowedLabelIds: config.allowedLabelIds,
      maxResults: capped,
      excludeSensitiveSubjects: config.excludeSensitiveSubjects,
    });
    await prisma.ownerConnector.update({
      where: { id: row.id },
      data: { lastSyncedAt: new Date(), lastError: null },
    });
    return { accountEmail: row.accountEmail, messages };
  } catch (err) {
    if (err instanceof GmailAuthError && err.code === "GMAIL_TOKEN_EXPIRED") {
      await prisma.ownerConnector.update({
        where: { id: row.id },
        data: { status: "expired", lastError: "GMAIL_TOKEN_EXPIRED" },
      });
      throw new GmailConnectorStateError("GMAIL_TOKEN_EXPIRED", "Gmail connection expired");
    }
    throw err;
  }
}
