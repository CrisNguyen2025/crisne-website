import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { saveGmailOAuthTokens } from "@/lib/connectors/gmail-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function htmlCallbackPage(ok: boolean, message: string): NextResponse {
  const script = ok
    ? `<script>
try { window.opener && window.opener.postMessage({ type: "abot:gmail-connector-updated" }, window.location.origin); } catch {}
setTimeout(function() { window.close(); }, 300);
</script>`
    : "";
  const html = `<!doctype html>
<html lang="vi">
<head><meta charset="utf-8"><title>Gmail Connector</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem;color:#1F1E1C;background:#FAF9F7">
<p style="font-size:0.95rem">${message}</p>
${script}
</body>
</html>`;
  const resp = new NextResponse(html, {
    status: ok ? 200 : 400,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
  resp.cookies.set("abot_gmail_oauth", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/api/v1/connectors/gmail",
    maxAge: 0,
  });
  return resp;
}

function timingSafeMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export async function GET(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError) {
    return htmlCallbackPage(false, "Bạn đã hủy kết nối Gmail hoặc Google từ chối cấp quyền.");
  }

  const code = req.nextUrl.searchParams.get("code")?.trim() ?? "";
  const state = req.nextUrl.searchParams.get("state")?.trim() ?? "";
  const rawCookie = req.cookies.get("abot_gmail_oauth")?.value ?? "";
  if (!code || !state || !rawCookie) {
    return htmlCallbackPage(false, "Phiên xác thực Gmail không hợp lệ hoặc đã hết hạn.");
  }

  let parsedCookie: { state?: string; codeVerifier?: string } = {};
  try {
    parsedCookie = JSON.parse(rawCookie) as { state?: string; codeVerifier?: string };
  } catch {
    return htmlCallbackPage(false, "Phiên xác thực Gmail không hợp lệ.");
  }

  if (
    !parsedCookie.state ||
    !parsedCookie.codeVerifier ||
    !timingSafeMatch(state, parsedCookie.state)
  ) {
    return htmlCallbackPage(false, "State xác thực không khớp.");
  }

  try {
    const redirectUri = `${req.nextUrl.origin}/api/v1/connectors/gmail/callback`;
    await saveGmailOAuthTokens({
      code,
      codeVerifier: parsedCookie.codeVerifier,
      redirectUri,
    });
    return htmlCallbackPage(true, "Đã kết nối Gmail thành công. Bạn có thể đóng cửa sổ này.");
  } catch (error) {
    console.error("[API GET /api/v1/connectors/gmail/callback] Error:", error);
    return htmlCallbackPage(false, "Chưa hoàn tất kết nối Gmail. Vui lòng thử lại.");
  }
}
