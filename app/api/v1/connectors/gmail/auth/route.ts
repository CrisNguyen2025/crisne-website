import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { isConnectorEncryptionConfigured } from "@/lib/connectors/crypto";
import {
  buildGoogleGmailAuthUrl,
  createOAuthStateAndPkce,
  isGoogleOAuthConfigured,
} from "@/lib/connectors/gmail-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  if (!isGoogleOAuthConfigured() || !isConnectorEncryptionConfigured()) {
    return NextResponse.json(
      { error: "Gmail OAuth chưa được cấu hình trên máy chủ" },
      { status: 503 }
    );
  }

  const { state, codeVerifier, codeChallenge } = createOAuthStateAndPkce();
  const redirectUri = `${req.nextUrl.origin}/api/v1/connectors/gmail/callback`;
  const authUrl = buildGoogleGmailAuthUrl({ state, codeChallenge, redirectUri });

  const response = NextResponse.redirect(authUrl, 302);
  response.cookies.set(
    "abot_gmail_oauth",
    JSON.stringify({ state, codeVerifier }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/v1/connectors/gmail",
      maxAge: 600,
    }
  );
  return response;
}
