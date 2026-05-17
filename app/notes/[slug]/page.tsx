import { notFound } from "next/navigation";
import Link from "next/link";
import { getPostBySlug, getPostById, getTags } from "@/lib/notion";
import type { PostWithTags } from "@/lib/notion-types";

interface Props {
  params: Promise<{ slug: string }>;
}

export const revalidate = 60;

export default async function NoteDetailPage({ params }: Props) {
  const { slug } = await params;

  // Try slug first, fall back to ID (for posts without slug)
  const [rawPost, tags] = await Promise.all([
    getPostBySlug(slug).then((p) => p ?? getPostById(slug)),
    getTags(),
  ]);

  if (!rawPost || !rawPost.published) notFound();

  const tagMap = Object.fromEntries(tags.map((t) => [t.id, t]));
  const post: PostWithTags = {
    ...rawPost,
    tags: rawPost.tagIds.flatMap((id) => (tagMap[id] ? [tagMap[id]] : [])),
  };

  const date = new Date(post.createdAt);
  const formatted = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      {/* Back */}
      <Link
        href="/notes"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-12 group"
      >
        <span className="group-hover:-translate-x-0.5 transition-transform duration-200">←</span>
        All notes
      </Link>

      {/* Meta */}
      <div className="mb-8">
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {post.tags.map((tag) => (
              <Link
                key={tag.id}
                href={`/notes?tag=${tag.id}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: tag.color }}
                />
                {tag.name}
              </Link>
            ))}
          </div>
        )}

        <h1 className="text-3xl font-display font-bold tracking-tight text-foreground leading-tight mb-4">
          {post.title}
        </h1>

        <time
          dateTime={post.createdAt}
          className="text-xs font-mono text-muted-foreground tracking-wide"
        >
          {formatted}
        </time>
      </div>

      {/* Divider */}
      <div className="h-px bg-border/40 mb-10" />

      {/* Content */}
      {post.content ? (
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          {post.content.split("\n\n").map((paragraph, i) => (
            <p
              key={i}
              className="text-foreground/90 leading-relaxed text-base mb-5 last:mb-0"
            >
              {paragraph}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground italic text-sm">No content.</p>
      )}

      {/* Footer nav */}
      <div className="mt-16 pt-8 border-t border-border/40">
        <Link
          href="/notes"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to all notes
        </Link>
      </div>
    </div>
  );
}
