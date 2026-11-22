import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isOwnerEmail } from "@/lib/auth/owner-access";
import { ShareTargetClient } from "@/components/news/ShareTargetClient";

export const dynamic = "force-dynamic";

function isDevOwnerBypass(): boolean {
  return process.env.NODE_ENV === "development" && process.env.DEV_OWNER_BYPASS === "true";
}

/** Extract the first plausible URL from a string (handles "Check this out: https://...") */
function extractUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  raw = raw.trim();
  try {
    new URL(raw);
    return raw; // already a valid URL
  } catch {
    // Try to find a URL inside the string (e.g. text param from some share sheets)
    const match = raw.match(/https?:\/\/[^\s]+/);
    return match ? match[0] : null;
  }
}

interface SharePageProps {
  searchParams: Promise<{
    url?: string;
    title?: string;
    text?: string;
  }>;
}

export default async function SharePage({ searchParams }: SharePageProps) {
  if (!isDevOwnerBypass()) {
    const session = await auth();
    if (!session?.user?.email || !isOwnerEmail(session.user.email)) {
      const sp = await searchParams;
      // Build callbackUrl with full query string so middleware can redirect back
      const qs = new URLSearchParams();
      if (sp.url) qs.set("url", sp.url);
      if (sp.title) qs.set("title", sp.title);
      if (sp.text) qs.set("text", sp.text);
      const qs_str = qs.toString();
      const callbackUrl = qs_str ? `/share?${qs_str}` : "/share";
      redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    }
  }

  const sp = await searchParams;

  // Resolve URL: prefer explicit `url` param, fall back to `text` (some apps embed URL in text)
  const resolvedUrl = extractUrl(sp.url) ?? extractUrl(sp.text);

  if (!resolvedUrl) {
    // No URL found — show paste fallback
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
        <div className="w-full max-w-sm space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm text-center">
          <p className="font-medium">Không tìm thấy URL</p>
          <p className="text-sm text-muted-foreground">
            Share target không nhận được link hợp lệ. Hãy dán URL thủ công tại trang News.
          </p>
          <Link
            href="/news"
            className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Về News
          </Link>
        </div>
      </div>
    );
  }

  return <ShareTargetClient url={resolvedUrl} />;
}
