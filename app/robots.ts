import type { MetadataRoute } from "next";

const SITE_URL = "https://crisne.blog";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Disallow common patterns that shouldn't be indexed
        disallow: [
          "/test-robot",
          "/api/", // API routes
          "/_next/", // Next.js internal
          "/static/", // Static files if any
          "/*.json$", // JSON files
          "/*.xml$", // XML files (except sitemap which is handled separately)
        ],
      },
      {
        // Googlebot specific rules
        userAgent: "Googlebot",

        allow: "/",
        disallow: ["/api/", "/_next/", "/test-robot"],
      },
      {
        // Googlebot-Image for image indexing
        userAgent: "Googlebot-Image",
        allow: "/",
        disallow: ["/api/", "/_next/static/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
