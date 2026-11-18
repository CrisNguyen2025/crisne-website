import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { findItemBySlug, resolveTopicGlobal } from '@/lib/roadmap/resolveRoadmap';
import { getPublicationHomeData } from '@/lib/roadmap/queries';
import { PublicationHome } from '@/components/roadmap/PublicationHome';

// Real-time synchronization handled by PublicationHome via "roadmap:updated"

const SITE_URL = 'https://crisne.blog';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Crisne — Knowledge Based',
  description:
    'Tổng hợp các Topic và bài học kỹ thuật tại Crisne.',
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    title: 'Crisne — Knowledge Based',
    description:
      'Tổng hợp các Topic và bài học kỹ thuật tại Crisne.',
  },
};

interface PageProps {
  searchParams: Promise<{
    topic?: string;
    item?: string;
    section?: string;
  }>;
}

export default async function Home({ searchParams }: PageProps) {
  const { topic, item, section } = await searchParams;

  if (topic) {
    const topicRes = await resolveTopicGlobal(topic);
    const resolvedSlug =
      topicRes.kind === 'found'
        ? topicRes.topic.slug
        : topicRes.kind === 'redirect'
          ? topicRes.toSlug
          : null;

    if (resolvedSlug) {
      if (item && topicRes.kind === 'found') {
        const resolvedItem = await findItemBySlug(topicRes.topic.id, item);
        if (resolvedItem?.slug) {
          permanentRedirect(`/lessons/${resolvedItem.slug}`);
        }
      }
      const query = section ? `?section=${encodeURIComponent(section)}` : '';
      permanentRedirect(`/topic/${resolvedSlug}${query}`);
    }
  }

  const data = await getPublicationHomeData();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Crisne — Knowledge Based',
    url: SITE_URL,
    description: 'Tổng hợp các Topic và bài học kỹ thuật tại Crisne.',
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: data.topics.map((t, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: t.title,
        url: `${SITE_URL}/topic/${t.slug}`,
      })),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PublicationHome
        topics={data.topics}
        recentLessons={data.recentLessons}
        totalLessons={data.totalLessons}
      />
    </>
  );
}
