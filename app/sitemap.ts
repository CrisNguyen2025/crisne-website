import type { MetadataRoute } from "next";
import { getPosts } from "@/lib/notion";
import { prisma } from "@/lib/prisma";

export const revalidate = 3600;

const SITE_URL = "https://crisne.blog";

const staticRoutes: MetadataRoute.Sitemap = [
  {
    url: SITE_URL,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 1.0,
  },
  {
    url: `${SITE_URL}/portfolio`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 1.0,
  },
  {
    url: `${SITE_URL}/notes`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  },
];

async function getNoteRoutes(): Promise<MetadataRoute.Sitemap> {
  try {
    const posts = await getPosts();
    return posts
      .filter((post) => post.published)
      .map((post) => ({
        url: `${SITE_URL}/notes/${post.slug || post.id}`,
        lastModified: new Date(post.updatedAt),
        changeFrequency: "monthly",
        priority: 0.6,
      }));
  } catch (error) {
    console.error("Sitemap: failed to load notes", error);
    return [];
  }
}

async function getRoadmapRoutes(): Promise<MetadataRoute.Sitemap> {
  try {
    const roadmaps = await prisma.roadmap.findMany({
      where: { isLocked: false },
      include: {
        items: {
          select: {
            slug: true,
            updatedAt: true,
          },
        },
      },
    });

    const routes: MetadataRoute.Sitemap = [];
    for (const rm of roadmaps) {
      routes.push({
        url: `${SITE_URL}/topic/${rm.slug}`,
        lastModified: rm.updatedAt,
        changeFrequency: "weekly",
        priority: 0.8,
      });
      for (const item of rm.items) {
        if (item.slug) {
          routes.push({
            url: `${SITE_URL}/topic/${rm.slug}/${item.slug}`,
            lastModified: item.updatedAt,
            changeFrequency: "weekly",
            priority: 0.7,
          });
        }
      }
    }
    return routes;
  } catch (error) {
    console.error("Sitemap: failed to load roadmaps", error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [noteRoutes, roadmapRoutes] = await Promise.all([getNoteRoutes(), getRoadmapRoutes()]);
  return [...staticRoutes, ...noteRoutes, ...roadmapRoutes];
}
