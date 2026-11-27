import "../setup/isolated-test-db";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const writeAccess = vi.hoisted(() => ({
  requireWriteAccess: vi.fn(),
  hasWriteAccess: vi.fn(async () => true),
}));
vi.mock("@/lib/auth/write-access", () => writeAccess);

import { prisma } from "@/lib/prisma";
import { GET as GET_AUTH } from "@/app/api/v1/connectors/gmail/auth/route";
import { GET as GET_CALLBACK } from "@/app/api/v1/connectors/gmail/callback/route";
import { GET as GET_STATUS } from "@/app/api/v1/connectors/gmail/status/route";
import { PATCH as PATCH_CONFIG } from "@/app/api/v1/connectors/gmail/config/route";
import { POST as POST_DISCONNECT } from "@/app/api/v1/connectors/gmail/disconnect/route";
import { POST as POST_QUERY } from "@/app/api/v1/connectors/gmail/query/route";
import { POST as POST_THREAD, GET as GET_THREAD } from "@/app/api/v1/threads/[threadId]/route";
import { GET as GET_LATEST_THREAD } from "@/app/api/roadmap-assistant/thread/route";

const TEST_HEX_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

async function cleanUp() {
  await prisma.ownerConnector.deleteMany();
  await prisma.threadMessage.deleteMany({ where: { threadId: { startsWith: "owner:test-ctx-" } } });
  await prisma.threadState.deleteMany({ where: { threadId: { startsWith: "owner:test-ctx-" } } });
}

describe("/api/v1/connectors/gmail/*", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    writeAccess.requireWriteAccess.mockResolvedValue(null);
    vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", TEST_HEX_KEY);
    vi.stubEnv("AUTH_GOOGLE_ID", "test-google-client-id");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "test-google-client-secret");
    await cleanUp();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await cleanUp();
    await prisma.$disconnect();
  });

  it("blocks anonymous GET callers on auth, callback, and status with 401 before touching DB", async () => {
    writeAccess.requireWriteAccess.mockResolvedValue(new Response("no", { status: 401 }));

    const rAuth = await GET_AUTH(new NextRequest("http://localhost/api/v1/connectors/gmail/auth"));
    const rCb = await GET_CALLBACK(
      new NextRequest("http://localhost/api/v1/connectors/gmail/callback?code=x&state=y")
    );
    const rStatus = await GET_STATUS(
      new NextRequest("http://localhost/api/v1/connectors/gmail/status")
    );

    expect([rAuth.status, rCb.status, rStatus.status]).toEqual([401, 401, 401]);
  });

  it("handles OAuth auth -> callback -> status -> config -> query -> expiry -> disconnect", async () => {
    // 1. Auth redirects to Google OAuth with PKCE & gmail.readonly scope using shared AUTH_GOOGLE_ID
    const authRes = await GET_AUTH(
      new NextRequest("https://crisne.blog/api/v1/connectors/gmail/auth")
    );
    expect(authRes.status).toBe(302);
    const location = new URL(authRes.headers.get("location")!);
    expect(location.hostname).toBe("accounts.google.com");
    expect(location.searchParams.get("client_id")).toBe("test-google-client-id");
    expect(location.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/gmail.readonly"
    );
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://crisne.blog/api/v1/connectors/gmail/callback"
    );
    const state = location.searchParams.get("state")!;
    const setCookie = authRes.headers.get("set-cookie") ?? "";
    const cookieMatch = setCookie.match(/abot_gmail_oauth=([^;]+)/);
    expect(cookieMatch).not.toBeNull();
    const cookieVal = decodeURIComponent(cookieMatch![1]);

    // 2. Callback exchanges code & stores encrypted tokens (never plaintext)
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "plain-access-secret-123",
            refresh_token: "plain-refresh-secret-456",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/gmail.readonly",
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/users/me/profile")) {
        return new Response(JSON.stringify({ emailAddress: "owner@gmail.com" }), {
          status: 200,
        });
      }
      if (url.endsWith("/users/me/labels")) {
        return new Response(
          JSON.stringify({
            labels: [
              { id: "INBOX", name: "INBOX", type: "system" },
              { id: "Label_1", name: "Tech Newsletter", type: "user" },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes("/users/me/messages?")) {
        return new Response(
          JSON.stringify({ messages: [{ id: "m-otp" }, { id: "m-tech" }] }),
          { status: 200 }
        );
      }
      if (url.includes("/users/me/messages/m-otp")) {
        return new Response(
          JSON.stringify({
            id: "m-otp",
            snippet: "Code 999999",
            payload: {
              headers: [
                { name: "Subject", value: "Your OTP verification code" },
                { name: "From", value: "noreply@bank.example" },
              ],
            },
          }),
          { status: 200 }
        );
      }
      if (url.includes("/users/me/messages/m-tech")) {
        return new Response(
          JSON.stringify({
            id: "m-tech",
            snippet: "Next.js 16 updates",
            payload: {
              headers: [
                { name: "Subject", value: "Weekly AI & Next.js Notes" },
                { name: "From", value: "newsletter@vercel.com" },
                { name: "Date", value: "Fri, 27 Nov 2026 09:00:00 +0700" },
              ],
              mimeType: "text/html",
              body: {
                data: Buffer.from("<p>Summary of <b>Next.js 16</b></p>", "utf8").toString(
                  "base64url"
                ),
              },
            },
          }),
          { status: 200 }
        );
      }
      if (url.includes("oauth2.googleapis.com/revoke")) {
        return new Response("", { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const cbReq = new NextRequest(
      `https://crisne.blog/api/v1/connectors/gmail/callback?code=auth-code&state=${encodeURIComponent(state)}`,
      { headers: { cookie: `abot_gmail_oauth=${encodeURIComponent(cookieVal)}` } }
    );
    const cbRes = await GET_CALLBACK(cbReq);
    expect(cbRes.status).toBe(200);
    expect(await cbRes.text()).toContain("abot:gmail-connector-updated");

    const dbRow = await prisma.ownerConnector.findUnique({ where: { provider: "gmail" } });
    expect(dbRow).not.toBeNull();
    expect(dbRow!.accountEmail).toBe("owner@gmail.com");
    expect(dbRow!.encryptedRefreshToken).toMatch(/^v1:/);
    expect(dbRow!.encryptedRefreshToken).not.toContain("plain-refresh-secret-456");
    expect(dbRow!.encryptedAccessToken).not.toContain("plain-access-secret-123");

    // 3. Status returns connected + labels
    const statusRes = await GET_STATUS(
      new NextRequest("https://crisne.blog/api/v1/connectors/gmail/status")
    );
    expect(statusRes.status).toBe(200);
    const statusJson = await statusRes.json();
    expect(statusJson.connected).toBe(true);
    expect(statusJson.accountEmail).toBe("owner@gmail.com");
    expect(statusJson.labels.map((l: { id: string }) => l.id)).toContain("Label_1");

    // 4. Config validation & update
    const badCfg = await PATCH_CONFIG(
      new NextRequest("https://crisne.blog/api/v1/connectors/gmail/config", {
        method: "PATCH",
        body: JSON.stringify({ maxEmails: 99 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(badCfg.status).toBe(400);

    const goodCfg = await PATCH_CONFIG(
      new NextRequest("https://crisne.blog/api/v1/connectors/gmail/config", {
        method: "PATCH",
        body: JSON.stringify({ allowedLabelIds: ["Label_1"], maxEmails: 3 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(goodCfg.status).toBe(200);

    // 5. Query appends spam/trash exclusion, filters OTP email, strips HTML
    const queryRes = await POST_QUERY(
      new NextRequest("https://crisne.blog/api/v1/connectors/gmail/query", {
        method: "POST",
        body: JSON.stringify({ query: "Next.js" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(queryRes.status).toBe(200);
    const queryJson = await queryRes.json();
    expect(queryJson.emails).toHaveLength(1);
    expect(queryJson.emails[0].id).toBe("m-tech");
    expect(queryJson.emails[0].body).toBe("Summary of Next.js 16");

    // 6. Expired refresh token marks status = expired & returns 401 GMAIL_TOKEN_EXPIRED
    await prisma.ownerConnector.update({
      where: { provider: "gmail" },
      data: { tokenExpiresAt: new Date(Date.now() - 120_000) },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }))
    );
    const expiredRes = await POST_QUERY(
      new NextRequest("https://crisne.blog/api/v1/connectors/gmail/query", {
        method: "POST",
        body: JSON.stringify({ query: "test" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(expiredRes.status).toBe(401);
    expect((await expiredRes.json()).code).toBe("GMAIL_TOKEN_EXPIRED");
    expect((await prisma.ownerConnector.findUnique({ where: { provider: "gmail" } }))!.status).toBe(
      "expired"
    );

    // 7. Disconnect removes row cleanly
    vi.stubGlobal("fetch", fetchMock);
    const discRes = await POST_DISCONNECT(
      new NextRequest("https://crisne.blog/api/v1/connectors/gmail/disconnect", { method: "POST" })
    );
    expect(discRes.status).toBe(200);
    expect(await prisma.ownerConnector.findUnique({ where: { provider: "gmail" } })).toBeNull();
  });

  it("persists and restores ThreadMessage.contextJson without changing plain messages", async () => {
    const tid = "owner:test-ctx-1";
    const postCtx = await POST_THREAD(
      new NextRequest(`http://localhost/api/v1/threads/${tid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "user",
          content: "Tìm email Docker",
          contextMeta: { connectors: ["gmail"], slashCommand: "/gmail" },
        }),
      }),
      { params: Promise.resolve({ threadId: tid }) }
    );
    expect(postCtx.status).toBe(201);

    const getRes = await GET_THREAD(
      new NextRequest(`http://localhost/api/v1/threads/${tid}`),
      { params: Promise.resolve({ threadId: tid }) }
    );
    const getJson = await getRes.json();
    expect(getJson.messages).toEqual([
      {
        role: "user",
        content: "Tìm email Docker",
        contextMeta: { connectors: ["gmail"], slashCommand: "/gmail" },
      },
    ]);

    const latestRes = await GET_LATEST_THREAD(
      new NextRequest("http://localhost/api/roadmap-assistant/thread")
    );
    const latestJson = await latestRes.json();
    expect(latestJson.messages[0].contextMeta).toEqual({
      connectors: ["gmail"],
      slashCommand: "/gmail",
    });
  });
});
