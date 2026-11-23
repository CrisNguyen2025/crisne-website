import Link from "next/link";
import { PUBLIC_NEWS_PATH } from "@/lib/auth/public-paths";
import { listPublicNewsItems } from "@/lib/news/public-queries";
import { formatPublicNewsMeta } from "@/components/news/public-news-format";

// Unpublishing must take effect on the next request, so nothing is cached
export const dynamic = "force-dynamic";

export default async function PublicNewsListPage() {
  const items = await listPublicNewsItems();

  if (items.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">Chưa có bài nào được chia sẻ.</p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.id} className="py-5">
          <p className="text-xs text-muted-foreground">{formatPublicNewsMeta(item)}</p>
          <h2 className="mt-1.5">
            <Link
              href={`${PUBLIC_NEWS_PATH}/${item.slug}`}
              className="font-display text-[17px] font-semibold leading-snug text-foreground underline-offset-4 hover:underline"
            >
              {item.title}
            </Link>
          </h2>
          {item.tldr && (
            <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{item.tldr}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
