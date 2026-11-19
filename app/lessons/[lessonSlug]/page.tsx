import { notFound, permanentRedirect } from 'next/navigation';
import { findLessonPath } from '@/lib/roadmap/resolveRoadmap';

interface LegacyLessonPageProps {
  params: Promise<{ lessonSlug: string }>;
}

/** Old Lesson URL /lessons/[lessonSlug] (ADR-0013): 308 to /[topicSlug]/[lessonSlug] (ADR-0014). */
export default async function LegacyLessonRedirectPage({ params }: LegacyLessonPageProps) {
  const { lessonSlug } = await params;
  const path = await findLessonPath(lessonSlug);
  if (!path) notFound();
  permanentRedirect(path);
}
