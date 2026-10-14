import type { MetadataRoute } from "next";
import { getPosts } from "@/lib/notion";
import { INITIAL_KNOWLEDGE_BASE } from "@/lib/knowledge/data";

// Regenerate at most hourly (notes change in Notion)
export const revalidate = 3600;

const SITE_URL = "https://crisne.blog";

// Define all pages with their update frequencies and priorities
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
  {
    url: `${SITE_URL}/knowledge`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  },
  {
    url: `${SITE_URL}/docs`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.6,
  },
];

// Notes come from Notion; a Notion outage must not break the sitemap
async function getNoteRoutes(): Promise<MetadataRoute.Sitemap> {
  try {
    const posts = await getPosts();
    return posts
      .filter((post) => post.published)
      .map((post) => ({
        // Detail page resolves slug first, then falls back to the Notion id
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

function getKnowledgeRoutes(): MetadataRoute.Sitemap {
  return INITIAL_KNOWLEDGE_BASE.map((entity) => ({
    url: `${SITE_URL}/knowledge/${entity.type}/${entity.slug}`,
    lastModified: new Date(entity.updatedAt),
    changeFrequency: "monthly",
    priority: 0.5,
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const noteRoutes = await getNoteRoutes();
  return [...staticRoutes, ...noteRoutes, ...getKnowledgeRoutes()];
}
