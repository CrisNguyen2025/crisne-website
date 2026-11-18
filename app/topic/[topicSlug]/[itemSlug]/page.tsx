import { notFound, permanentRedirect } from 'next/navigation';
import { findItemBySlug, findTopic, resolveLessonGlobal } from '@/lib/roadmap/resolveRoadmap';

interface ItemPageProps {
  params: Promise<{
    topicSlug: string;
    itemSlug: string;
  }>;
}

export default async function LegacyItemRedirectPage({ params }: ItemPageProps) {
  const { topicSlug, itemSlug } = await params;

  const topic = await findTopic(topicSlug);
  if (topic) {
    const item = await findItemBySlug(topic.id, itemSlug);
    if (item) {
      permanentRedirect(`/lessons/${item.slug || item.id}`);
    }
  }

  const globalResolved = await resolveLessonGlobal(itemSlug);
  if (globalResolved.kind === 'found') {
    permanentRedirect(`/lessons/${globalResolved.item.slug}`);
  }
  if (globalResolved.kind === 'redirect') {
    permanentRedirect(`/lessons/${globalResolved.toSlug}`);
  }

  notFound();
}
