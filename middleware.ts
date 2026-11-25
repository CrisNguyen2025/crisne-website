import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { hasValidAdminKey, isOwnerEmail } from "@/lib/auth/owner-access";

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

  const isApiRoute = pathname.startsWith("/api/");
  const isCronRoute = pathname === "/api/news/cron";

  if (
    (isApiRoute && hasValidAdminKey(req)) ||
    (isCronRoute &&
      (req.headers.get("x-cron-secret") ||
        req.headers.get("authorization")?.startsWith("Bearer ")))
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
    // manifest.webmanifest and sw.js must stay public: Chrome fetches them without cookies, and a
    // redirect to /login makes the site installable only as a shortcut (no share target on Android)
    "/((?!api/auth|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
