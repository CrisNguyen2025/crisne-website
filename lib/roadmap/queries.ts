import { prisma } from '@/lib/prisma';
import {
  contentToHtml,
  readingMinutes,
  withHeadingIds,
  type ContentHeading,
} from '@/lib/roadmap/content-utils';
import { sectionsInOrder } from '@/lib/roadmap/sections';
import type { ChecklistItem, RoadmapMeta, SectionGroup } from '@/lib/roadmap/types';

export interface PublicationTopicSummary extends RoadmapMeta {
  lessonCount: number;
  sectionNames: string[];
  updatedAt: string;
}

export interface RecentLessonSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  section: string | null;
  readingMinutes: number;
  hasContent: boolean;
  updatedAt: string;
  topicTitle: string;
  topicSlug: string;
}

export interface PublicationHomeData {
  topics: PublicationTopicSummary[];
  recentLessons: RecentLessonSummary[];
  totalLessons: number;
}

export interface TopicPageData {
  topic: RoadmapMeta & { updatedAt: string };
  items: ChecklistItem[];
  sections: (string | null)[];
}

export interface LessonPageData {
  lesson: ChecklistItem;
  processedHtml: string;
  headings: ContentHeading[];
  topic: RoadmapMeta;
  siblingGroups: SectionGroup[];
  prevLesson?: { id: string; slug: string; title: string };
  nextLesson?: { id: string; slug: string; title: string };
  allTopics: RoadmapMeta[];
}

function groupBySection(items: ChecklistItem[], sections: (string | null)[]): SectionGroup[] {
  return sections.map((section) => ({
    section,
    items: items.filter((item) => (item.section ?? null) === section),
  }));
}

export async function getAllTopicsMeta(): Promise<RoadmapMeta[]> {
  const rows = await prisma.roadmap.findMany({
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      icon: true,
      order: true,
      isLocked: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    icon: r.icon,
    order: r.order,
    isLocked: Boolean(r.isLocked),
  }));
}

export async function getPublicationHomeData(): Promise<PublicationHomeData> {
  const [roadmaps, recent] = await Promise.all([
    prisma.roadmap.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        icon: true,
        order: true,
        isLocked: true,
        updatedAt: true,
        items: {
          orderBy: { order: 'asc' },
          select: { section: true },
        },
      },
    }),
    prisma.roadmapItem.findMany({
      where: { roadmap: { isLocked: false } },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        section: true,
        content: true,
        updatedAt: true,
        roadmap: {
          select: {
            title: true,
            slug: true,
          },
        },
      },
    }),
  ]);

  let totalLessons = 0;
  const topics: PublicationTopicSummary[] = roadmaps.map((r) => {
    totalLessons += r.items.length;
    const sectionNames = sectionsInOrder(r.items).filter((s): s is string => s !== null);
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      description: r.description,
      icon: r.icon,
      order: r.order,
      isLocked: Boolean(r.isLocked),
      lessonCount: r.items.length,
      sectionNames,
      updatedAt: r.updatedAt.toISOString(),
    };
  });

  const recentLessons: RecentLessonSummary[] = recent
    .filter((item) => Boolean(item.slug))
    .map((item) => ({
      id: item.id,
      slug: item.slug,
      title: item.title,
      description: item.description || '',
      section: item.section,
      readingMinutes: readingMinutes(item.content),
      hasContent: Boolean(item.content?.trim()),
      updatedAt: item.updatedAt.toISOString(),
      topicTitle: item.roadmap.title,
      topicSlug: item.roadmap.slug,
    }));

  return { topics, recentLessons, totalLessons };
}

export async function getTopicPageData(topicId: string): Promise<TopicPageData | null> {
  const roadmap = await prisma.roadmap.findUnique({
    where: { id: topicId },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      icon: true,
      order: true,
      isLocked: true,
      updatedAt: true,
      items: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          section: true,
          order: true,
          content: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!roadmap) return null;

  const items: ChecklistItem[] = roadmap.items.map((item) => ({
    id: item.id,
    slug: item.slug || item.id,
    title: item.title,
    description: item.description || '',
    section: item.section,
    order: item.order,
    readingMinutes: readingMinutes(item.content),
    hasContent: Boolean(item.content?.trim()),
    roadmapSlug: roadmap.slug,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }));

  return {
    topic: {
      id: roadmap.id,
      slug: roadmap.slug,
      title: roadmap.title,
      description: roadmap.description,
      icon: roadmap.icon,
      order: roadmap.order,
      isLocked: Boolean(roadmap.isLocked),
      updatedAt: roadmap.updatedAt.toISOString(),
    },
    items,
    sections: sectionsInOrder(items),
  };
}

export async function getLessonPageData(itemId: string): Promise<LessonPageData | null> {
  const [item, allTopics] = await Promise.all([
    prisma.roadmapItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        roadmapId: true,
        slug: true,
        title: true,
        description: true,
        section: true,
        order: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        roadmap: {
          select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            icon: true,
            order: true,
            isLocked: true,
          },
        },
      },
    }),
    getAllTopicsMeta(),
  ]);

  if (!item) return null;

  const siblingsRaw = await prisma.roadmapItem.findMany({
    where: { roadmapId: item.roadmapId },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      section: true,
      order: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const siblingItems: ChecklistItem[] = siblingsRaw.map((sib) => ({
    id: sib.id,
    slug: sib.slug || sib.id,
    title: sib.title,
    description: sib.description || '',
    section: sib.section,
    order: sib.order,
    roadmapSlug: item.roadmap.slug,
    createdAt: sib.createdAt.toISOString(),
    updatedAt: sib.updatedAt.toISOString(),
  }));

  const orderedSections = sectionsInOrder(siblingItems);
  const siblingGroups = groupBySection(siblingItems, orderedSections);
  const flatLessons = siblingGroups.flatMap((group) => group.items);
  const currentIndex = flatLessons.findIndex((l) => l.id === item.id);
  const prevItem = currentIndex > 0 ? flatLessons[currentIndex - 1] : undefined;
  const nextItem =
    currentIndex >= 0 && currentIndex < flatLessons.length - 1
      ? flatLessons[currentIndex + 1]
      : undefined;

  const rawHtml = item.content ? contentToHtml(item.content) : '';
  const { html: processedHtml, headings } = withHeadingIds(rawHtml);

  const lesson: ChecklistItem = {
    id: item.id,
    slug: item.slug || item.id,
    title: item.title,
    description: item.description || '',
    section: item.section,
    order: item.order,
    content: item.content || undefined,
    readingMinutes: readingMinutes(item.content),
    hasContent: Boolean(item.content?.trim()),
    roadmapSlug: item.roadmap.slug,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };

  return {
    lesson,
    processedHtml,
    headings,
    topic: {
      id: item.roadmap.id,
      slug: item.roadmap.slug,
      title: item.roadmap.title,
      description: item.roadmap.description,
      icon: item.roadmap.icon,
      order: item.roadmap.order,
      isLocked: Boolean(item.roadmap.isLocked),
    },
    siblingGroups,
    prevLesson: prevItem ? { id: prevItem.id, slug: prevItem.slug, title: prevItem.title } : undefined,
    nextLesson: nextItem ? { id: nextItem.id, slug: nextItem.slug, title: nextItem.title } : undefined,
    allTopics,
  };
}
