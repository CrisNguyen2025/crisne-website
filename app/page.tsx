import { redirect } from "next/navigation";
import { Suspense } from "react";
import { findTopic, findItemBySlug } from "@/lib/roadmap/resolveRoadmap";
import { RoadmapWorkspace } from "@/components/roadmap/RoadmapWorkspace";
import { GlobalPageLoader } from "@/components/roadmap/GlobalPageLoader";

// Real-time synchronization handled by RoadmapWorkspace via "roadmap:updated"

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
    const resolvedTopic = await findTopic(topic);
    if (resolvedTopic) {
      let targetPath = `/topic/${resolvedTopic.slug}`;
      if (item) {
        const resolvedItem = await findItemBySlug(resolvedTopic.id, item);
        if (resolvedItem) {
          targetPath = `/topic/${resolvedTopic.slug}/${resolvedItem.slug}`;
        } else {
          targetPath = `/topic/${resolvedTopic.slug}/${item}`;
        }
      }
      if (section) {
        targetPath += `?section=${encodeURIComponent(section)}`;
      }
      redirect(targetPath);
    }
  }

  return (
    <Suspense fallback={<GlobalPageLoader />}>
      <RoadmapWorkspace />
    </Suspense>
  );
}
