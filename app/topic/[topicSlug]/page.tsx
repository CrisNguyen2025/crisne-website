import { notFound } from "next/navigation";
import { Suspense } from "react";
import { findTopic } from "@/lib/roadmap/resolveRoadmap";
import { RoadmapWorkspace } from "@/components/roadmap/RoadmapWorkspace";
import { GlobalPageLoader } from "@/components/roadmap/GlobalPageLoader";

interface TopicPageProps {
  params: Promise<{
    topicSlug: string;
  }>;
}

export default async function TopicPage({ params }: TopicPageProps) {
  const { topicSlug } = await params;
  const topic = await findTopic(topicSlug);

  if (!topic) {
    notFound();
  }

  return (
    <Suspense fallback={<GlobalPageLoader />}>
      <RoadmapWorkspace initialTopic={topic.slug} />
    </Suspense>
  );
}
