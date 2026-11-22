import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { isOwnerEmail } from "@/lib/auth/owner-access";

function isDevOwnerBypass(): boolean {
  return process.env.NODE_ENV === "development" && process.env.DEV_OWNER_BYPASS === "true";
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthed = isDevOwnerBypass() || (!!req.auth?.user?.email && isOwnerEmail(req.auth.user.email));

  if (pathname === "/login") {
    if (isAuthed) {
      return NextResponse.redirect(new URL("/", req.nextUrl.origin));
    }
    return NextResponse.next();
  }

  if (
    req.headers.get("x-internal-key") ||
    req.headers.get("x-admin-key") ||
    req.headers.get("x-cron-secret") ||
    (pathname === "/api/news/cron" && req.headers.get("authorization")?.startsWith("Bearer "))
  ) {
    return NextResponse.next();
  }

  if (pathname === "/api/roadmap-assistant/health") {
    return NextResponse.next();
  }

  if (!isAuthed) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.nextUrl.origin);
    // Preserve query params (critical for /share?url=... PWA share target)
    const callbackUrl =
      req.nextUrl.search ? `${pathname}${req.nextUrl.search}` : pathname;
    loginUrl.searchParams.set("callbackUrl", callbackUrl);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
