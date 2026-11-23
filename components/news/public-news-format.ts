import type { PublicNewsItemDto } from "@/lib/news/public-queries";
import { dayjs } from "@/lib/roadmap/date-utils";

/** "nextjs.org · Tác giả · 06/10/2026" — the source line shown above a public post's title. */
export function formatPublicNewsMeta(item: Pick<PublicNewsItemDto, "domain" | "author" | "publishedAt" | "publicAt">): string {
  const date = item.publishedAt ?? item.publicAt;
  return [item.domain, item.author, date ? dayjs(date).format("DD/MM/YYYY") : null]
    .filter(Boolean)
    .join(" · ");
}
