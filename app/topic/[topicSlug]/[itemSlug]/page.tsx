import { notFound } from "next/navigation";
import { Suspense } from "react";
import { findTopic, findItemBySlug } from "@/lib/roadmap/resolveRoadmap";
import { RoadmapWorkspace } from "@/components/roadmap/RoadmapWorkspace";
import { GlobalPageLoader } from "@/components/roadmap/GlobalPageLoader";

interface ItemPageProps {
  params: Promise<{
    topicSlug: string;
    itemSlug: string;
  }>;
}

export default async function ItemPage({ params }: ItemPageProps) {
  const { topicSlug, itemSlug } = await params;
  const topic = await findTopic(topicSlug);

  if (!topic) {
    notFound();
  }

  const item = await findItemBySlug(topic.id, itemSlug);
  if (!item) {
    notFound();
  }

  return (
    <Suspense fallback={<GlobalPageLoader />}>
      <RoadmapWorkspace initialTopic={topic.slug} initialItem={item.slug || item.id} />
    </Suspense>
  );
}
