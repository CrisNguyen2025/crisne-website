import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { resolveTopicGlobal } from '@/lib/roadmap/resolveRoadmap';
import { getTopicPageData } from '@/lib/roadmap/queries';
import { TopicEditorialPage } from '@/components/roadmap/TopicEditorialPage';
import { lessonPath, topicPath } from '@/lib/roadmap/paths';

const SITE_URL = 'https://crisne.blog';

export const revalidate = 60;

interface TopicPageProps {
  params: Promise<{ topicSlug: string }>;
  searchParams: Promise<{ section?: string }>;
}

export async function generateMetadata({ params }: TopicPageProps): Promise<Metadata> {
  const { topicSlug } = await params;
  const resolved = await resolveTopicGlobal(topicSlug);
  if (resolved.kind !== 'found') {
    return { title: 'Topic không tồn tại' };
  }

  const { topic } = resolved;
  const url = `${SITE_URL}${topicPath(topic.slug)}`;
  const description =
    topic.description ||
    `Lộ trình ${topic.title} tại Crisne.`;

  return {
    title: topic.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      title: `${topic.title} | Crisne`,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${topic.title} | Crisne`,
      description,
    },
  };
}

export default async function TopicPage({ params, searchParams }: TopicPageProps) {
  const [{ topicSlug }, { section: sectionQuery }] = await Promise.all([params, searchParams]);
  const resolved = await resolveTopicGlobal(topicSlug);

  if (resolved.kind === 'missing') {
    notFound();
  }
  if (resolved.kind === 'redirect') {
    permanentRedirect(topicPath(resolved.toSlug));
  }

  const data = await getTopicPageData(resolved.topic.id);
  if (!data) {
    notFound();
  }

  const normalizedQuery = sectionQuery?.trim().toLowerCase();
  const matchedSection = normalizedQuery
    ? data.sections.find(
        (s): s is string => s !== null && s.trim().toLowerCase() === normalizedQuery
      )
    : undefined;

  const canonicalUrl = `${SITE_URL}${topicPath(data.topic.slug)}`;
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: data.topic.title,
      url: canonicalUrl,
      description: data.topic.description || undefined,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: data.items.length,
        itemListElement: data.items.map((item, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: item.title,
          url: `${SITE_URL}${lessonPath(data.topic.slug, item.slug)}`,
        })),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Topics', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: data.topic.title, item: canonicalUrl },
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
      <TopicEditorialPage
        topic={data.topic}
        initialItems={data.items}
        initialSections={data.sections}
        initialSelectedSection={matchedSection ?? 'all'}
      />
    </>
  );
}
