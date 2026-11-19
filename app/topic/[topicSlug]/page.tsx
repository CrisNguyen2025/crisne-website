import { notFound, permanentRedirect } from 'next/navigation';
import { findTopicPath } from '@/lib/roadmap/resolveRoadmap';

interface LegacyTopicPageProps {
  params: Promise<{ topicSlug: string }>;
  searchParams: Promise<{ section?: string }>;
}

/** Old Topic URL /topic/[topicSlug]: 308 to /[topicSlug] (ADR-0014), keeping ?section=. */
export default async function LegacyTopicRedirectPage({ params, searchParams }: LegacyTopicPageProps) {
  const [{ topicSlug }, { section }] = await Promise.all([params, searchParams]);
  const path = await findTopicPath(topicSlug);
  if (!path) notFound();
  permanentRedirect(section ? `${path}?section=${encodeURIComponent(section)}` : path);
}
