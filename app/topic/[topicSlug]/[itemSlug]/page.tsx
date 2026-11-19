import { notFound, permanentRedirect } from 'next/navigation';
import { findItemBySlug, findLessonPath, findTopic } from '@/lib/roadmap/resolveRoadmap';
import { lessonPath } from '@/lib/roadmap/paths';

interface ItemPageProps {
  params: Promise<{
    topicSlug: string;
    itemSlug: string;
  }>;
}

/** Old Lesson URL /topic/[topicSlug]/[itemSlug]: 308 to /[topicSlug]/[lessonSlug] (ADR-0014). */
export default async function LegacyItemRedirectPage({ params }: ItemPageProps) {
  const { topicSlug, itemSlug } = await params;

  const topic = await findTopic(topicSlug);
  if (topic) {
    const item = await findItemBySlug(topic.id, itemSlug);
    if (item?.slug) {
      permanentRedirect(lessonPath(topic.slug, item.slug));
    }
  }

  const path = await findLessonPath(itemSlug);
  if (!path) notFound();
  permanentRedirect(path);
}
