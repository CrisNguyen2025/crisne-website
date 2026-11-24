import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isOwnerEmail } from "@/lib/auth/owner-access";
import { NEWS_SOURCES_PATH } from "@/lib/news/paths";
import { queryNewsFeed } from "@/lib/news/queries";
import { listNewsSources } from "@/lib/news/sources";
import { checkNewsWorkerHealth } from "@/lib/news/worker-health";
import { NewsFeedClient } from "@/components/news/NewsFeedClient";

export const dynamic = "force-dynamic";

function isDevOwnerBypass(): boolean {
  return process.env.NODE_ENV === "development" && process.env.DEV_OWNER_BYPASS === "true";
}

export default async function FeedIngestionSourcesPage() {
  if (!isDevOwnerBypass()) {
    const session = await auth();
    if (!session?.user?.email || !isOwnerEmail(session.user.email)) {
      redirect(`/login?callbackUrl=${encodeURIComponent(NEWS_SOURCES_PATH)}`);
    }
  }

  const initialParams = {
    view: "inbox" as const,
    sort: "latest" as const,
  };

  const [initialData, initialSources, initialWorkerHealth] = await Promise.all([
    queryNewsFeed({
      ...initialParams,
      limit: 60,
    }),
    listNewsSources(),
    checkNewsWorkerHealth(1_500),
  ]);

  return (
    <Suspense fallback={null}>
      <NewsFeedClient
        initialData={initialData}
        initialParams={initialParams}
        initialSources={initialSources}
        initialSourcesOpen={true}
        initialWorkerHealth={initialWorkerHealth}
        workerConfigured={initialWorkerHealth.configured}
      />
    </Suspense>
  );
}
