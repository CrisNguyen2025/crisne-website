import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { findLessonPath, resolveLessonGlobal } from '@/lib/roadmap/resolveRoadmap';
import { lessonPath, topicPath } from '@/lib/roadmap/paths';
import { getLessonPageData } from '@/lib/roadmap/queries';
import { plainTextExcerpt } from '@/lib/roadmap/content-utils';
import { LessonEditorialReader } from '@/components/roadmap/LessonEditorialReader';

const SITE_URL = 'https://crisne.blog';

export const revalidate = 60;

interface LessonPageProps {
  params: Promise<{ topicSlug: string; lessonSlug: string }>;
}

export async function generateMetadata({ params }: LessonPageProps): Promise<Metadata> {
  const { lessonSlug } = await params;
  const resolved = await resolveLessonGlobal(lessonSlug);
  if (resolved.kind !== 'found') {
    return { title: 'Bài học không tồn tại' };
  }

  const { item, topic } = resolved;
  const url = `${SITE_URL}${lessonPath(topic.slug, item.slug)}`;
  const description =
    item.description?.trim() ||
    plainTextExcerpt(item.content) ||
    `${item.title} — bài học thuộc topic ${topic.title} trên Crisne.`;

  return {
    title: `${item.title} — ${topic.title}`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: `${item.title} — ${topic.title}`,
      description,
      publishedTime: item.createdAt.toISOString(),
      modifiedTime: item.updatedAt.toISOString(),
      section: item.section || topic.title,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${item.title} — ${topic.title}`,
      description,
    },
  };
}

export default async function LessonPage({ params }: LessonPageProps) {
  const { topicSlug, lessonSlug } = await params;
  const resolved = await resolveLessonGlobal(lessonSlug);

  if (resolved.kind === 'missing') {
    notFound();
  }
  if (resolved.kind === 'redirect') {
    const path = await findLessonPath(lessonSlug);
    if (!path) notFound();
    permanentRedirect(path);
  }
  // The Lesson is found by its global slug; a URL naming another Topic goes to the right one
  if (resolved.topic.slug !== topicSlug) {
    permanentRedirect(lessonPath(resolved.topic.slug, resolved.item.slug));
  }

  const data = await getLessonPageData(resolved.item.id);
  if (!data) {
    notFound();
  }

  const canonicalUrl = `${SITE_URL}${lessonPath(data.topic.slug, data.lesson.slug)}`;
  const topicUrl = `${SITE_URL}${topicPath(data.topic.slug)}`;
  const description =
    data.lesson.description ||
    plainTextExcerpt(data.lesson.content) ||
    `${data.lesson.title} — ${data.topic.title}`;

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: data.lesson.title,
      description,
      url: canonicalUrl,
      datePublished: data.lesson.createdAt,
      dateModified: data.lesson.updatedAt,
      author: {
        '@type': 'Person',
        name: 'Cris Nguyen',
        url: SITE_URL,
      },
      isPartOf: {
        '@type': 'CollectionPage',
        name: data.topic.title,
        url: topicUrl,
      },
      articleSection: data.lesson.section || data.topic.title,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: data.topic.title, item: topicUrl },
        { '@type': 'ListItem', position: 3, name: data.lesson.title, item: canonicalUrl },
      ],
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LessonEditorialReader
        lesson={data.lesson}
        processedHtml={data.processedHtml}
        headings={data.headings}
        topic={data.topic}
        siblingGroups={data.siblingGroups}
        prevLesson={data.prevLesson}
        nextLesson={data.nextLesson}
        allTopics={data.allTopics}
      />
    </>
  );
}
