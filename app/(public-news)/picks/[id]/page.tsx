import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { PUBLIC_NEWS_PATH } from "@/lib/auth/public-paths";
import { getPublicNewsItem } from "@/lib/news/public-queries";
import { EmphasisText } from "@/components/news/EmphasisText";
import { formatPublicNewsMeta } from "@/components/news/public-news-format";

export const dynamic = "force-dynamic";

interface PublicNewsDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PublicNewsDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const item = await getPublicNewsItem(id);
  return item ? { title: item.title, description: item.tldr ?? undefined } : {};
}

const SECTION_LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";

export default async function PublicNewsDetailPage({ params }: PublicNewsDetailPageProps) {
  const { id } = await params;
  const item = await getPublicNewsItem(id);
  if (!item) notFound();

  return (
    <article>
      <Link
        href={PUBLIC_NEWS_PATH}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Tất cả bài
      </Link>

      <p className="mt-4 text-xs text-muted-foreground">{formatPublicNewsMeta(item)}</p>
      <h1 className="mt-1.5 font-display text-2xl font-semibold leading-tight text-foreground">
        {item.title}
      </h1>

      <a
        href={item.canonicalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm font-medium text-foreground transition-[background-color,transform] duration-150 hover:bg-accent active:scale-[0.98]"
      >
        <ExternalLink className="size-4" aria-hidden="true" />
        Đọc bài gốc trên {item.domain}
      </a>

      {item.tldr && (
        <section className="mt-6 border-l-2 border-[var(--editorial-accent)] pl-4">
          <h2 className={SECTION_LABEL}>TL;DR</h2>
          <p className="mt-1.5 text-[15px] leading-relaxed text-foreground">{item.tldr}</p>
        </section>
      )}

      {item.takeaways.length > 0 && (
        <section className="mt-7">
          <h2 className={SECTION_LABEL}>Ý chính</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground">
            {item.takeaways.map((point, index) => (
              <li key={index}>
                <EmphasisText text={point} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
        Tóm tắt tự động bằng AI từ bài gốc trên {item.domain}; có thể chưa chính xác. Nội dung thuộc về tác
        giả bài gốc.
      </p>
    </article>
  );
}
