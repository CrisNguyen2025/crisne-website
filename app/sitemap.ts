import type { MetadataRoute } from "next";

const SITE_URL = "https://crisne.blog";

// Define all sections with their update frequencies and priorities
const staticRoutes: MetadataRoute.Sitemap = [
  {
    url: SITE_URL,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 1.0,
  },
  // Anchor links to sections (for SEO - Google may use these)
  {
    url: `${SITE_URL}/#hero`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.9,
  },
  {
    url: `${SITE_URL}/#about`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    url: `${SITE_URL}/#experience`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  },
  {
    url: `${SITE_URL}/#skills`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.7,
  },
  {
    url: `${SITE_URL}/#projects`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.9,
  },
  {
    url: `${SITE_URL}/#testimonials`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.6,
  },
  {
    url: `${SITE_URL}/#faq`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.5,
  },
  {
    url: `${SITE_URL}/#contact`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.7,
  },
];

// Future dynamic routes - when projects have individual pages
// This is a placeholder for when you add /projects/[slug] routes
// async function getProjectRoutes(): Promise<MetadataRoute.Sitemap> {
//   const projects = await fetchProjects(); // Your data fetching
//   return projects.map((project) => ({
//     url: `${SITE_URL}/projects/${project.slug}`,
//     lastModified: project.updatedAt,
//     changeFrequency: "monthly",
//     priority: 0.8,
//   }));
// }

export default function sitemap(): MetadataRoute.Sitemap {
  // Combine static and dynamic routes when available
  // const projectRoutes = await getProjectRoutes();
  // return [...staticRoutes, ...projectRoutes];

  return staticRoutes;
}

// For future dynamic sitemap generation with projects
export async function generateSitemap(): Promise<MetadataRoute.Sitemap> {
  const baseRoutes = staticRoutes;

  // Add dynamic project routes when implemented
  // const projects = await getProjects();
  // const projectRoutes = projects.map((project) => ({
  //   url: `${SITE_URL}/projects/${project.slug}`,
  //   lastModified: new Date(project.updatedAt),
  //   changeFrequency: "monthly" as const,
  //   priority: 0.8,
  // }));

  return baseRoutes;
}
