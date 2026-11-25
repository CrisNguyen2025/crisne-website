import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { findItemBySlug, resolveTopicGlobal } from '@/lib/roadmap/resolveRoadmap';
import { getPublicationHomeData } from '@/lib/roadmap/queries';
import { PublicationHome } from '@/components/roadmap/PublicationHome';
import { lessonPath, topicPath } from '@/lib/roadmap/paths';

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

async function resolveLegacyRedirectUrl(
  topic: string,
  item?: string,
  section?: string,
): Promise<string | null> {
  const topicRes = await resolveTopicGlobal(topic);
  if (topicRes.kind === 'redirect') {
    const query = section ? `?section=${encodeURIComponent(section)}` : '';
    return `${topicPath(topicRes.toSlug)}${query}`;
  }
  if (topicRes.kind !== 'found') return null;

  if (item) {
    const resolvedItem = await findItemBySlug(topicRes.topic.id, item);
    if (resolvedItem?.slug) {
      return lessonPath(topicRes.topic.slug, resolvedItem.slug);
    }
  }
  const query = section ? `?section=${encodeURIComponent(section)}` : '';
  return `${topicPath(topicRes.topic.slug)}${query}`;
}

export default async function Home({ searchParams }: PageProps) {
  const { topic, item, section } = await searchParams;

  if (topic) {
    const redirectUrl = await resolveLegacyRedirectUrl(topic, item, section);
    if (redirectUrl) permanentRedirect(redirectUrl);
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
        url: `${SITE_URL}${topicPath(t.slug)}`,
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
