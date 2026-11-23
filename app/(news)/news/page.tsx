import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isOwnerEmail } from "@/lib/auth/owner-access";
import { queryNewsFeed } from "@/lib/news/queries";
import {
  NewsContentTypeTagSchema,
  NewsFeedSortSchema,
  NewsFeedViewSchema,
  NewsOriginSchema,
  ReadStateSchema,
} from "@/lib/news/schemas";
import { listNewsSources } from "@/lib/news/sources";
import { NewsFeedClient } from "@/components/news/NewsFeedClient";

export const dynamic = "force-dynamic";

function isDevOwnerBypass(): boolean {
  return process.env.NODE_ENV === "development" && process.env.DEV_OWNER_BYPASS === "true";
}

interface NewsPageProps {
  searchParams: Promise<{
    view?: string;
    origin?: string;
    tag?: string;
    contentType?: string;
    readState?: string;
    q?: string;
    sort?: string;
  }>;
}

export default async function NewsPage({ searchParams }: NewsPageProps) {
  if (!isDevOwnerBypass()) {
    const session = await auth();
    if (!session?.user?.email || !isOwnerEmail(session.user.email)) {
      redirect("/login?callbackUrl=%2Fnews");
    }
  }

  const sp = await searchParams;
  const viewParsed = NewsFeedViewSchema.safeParse(sp.view);
  const originParsed = NewsOriginSchema.safeParse(sp.origin);
  const contentTypeParsed = NewsContentTypeTagSchema.safeParse(sp.contentType);
  const readStateParsed = ReadStateSchema.safeParse(sp.readState);
  const sortParsed = NewsFeedSortSchema.safeParse(sp.sort);

  const initialParams = {
    view: viewParsed.success ? viewParsed.data : ("inbox" as const),
    origin: originParsed.success ? originParsed.data : undefined,
    tag: sp.tag?.trim().toLowerCase() || undefined,
    contentType: contentTypeParsed.success ? contentTypeParsed.data : undefined,
    readState: readStateParsed.success ? readStateParsed.data : undefined,
    q: sp.q?.trim() || undefined,
    sort: sortParsed.success ? sortParsed.data : ("latest" as const),
  };

  const [initialData, initialSources] = await Promise.all([
    queryNewsFeed({
      ...initialParams,
      limit: 60,
    }),
    listNewsSources(),
  ]);

  return (
    <Suspense fallback={null}>
      <NewsFeedClient
        initialData={initialData}
        initialParams={initialParams}
        initialSources={initialSources}
        workerConfigured={Boolean(process.env.NEWS_WORKER_URL?.trim())}
      />
    </Suspense>
  );
}
