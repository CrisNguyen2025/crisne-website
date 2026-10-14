import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isOwnerEmail, hasValidAdminKey } from "@/lib/auth/owner-access";

// Next.js 16 renamed middleware to proxy; it runs on the Node.js runtime.
// Guards the owner-only workflow builder. Existing API routes check access in their handlers.
export default auth((req) => {
  if (isOwnerEmail(req.auth?.user?.email) || hasValidAdminKey(req)) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const signInUrl = new URL("/api/auth/signin", req.nextUrl.origin);
  signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(signInUrl);
});

export const config = {
  matcher: ["/workflows/:path*", "/api/workflows/:path*"],
};
