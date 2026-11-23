import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cris Nguyen — Frontend Developer Portfolio",
    short_name: "Crisne News",
    description:
      "Portfolio of Cris Nguyen featuring scalable, high-performance web solutions built with React, Next.js, and TypeScript for SaaS products, enterprise CMS, CRM, HRM, and booking systems.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#6B9AC4",
    orientation: "portrait",
    scope: "/",
    lang: "en",
    // Real PNGs at the declared sizes; /icon.png is a 640px JPEG and Chrome may reject it
    icons: [
      {
        src: "/pwa-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    categories: ["portfolio", "developer", "technology"],
    screenshots: [
      {
        src: "/og-image.png",
        sizes: "1200x630",
        type: "image/png",
        form_factor: "wide",
        label: "Cris Nguyen Portfolio Homepage",
      },
    ],
    shortcuts: [
      {
        name: "Feed Ingestion",
        short_name: "Ingest",
        description: "Open private feed ingestion inbox",
        url: "/feed-ingestion",
        icons: [{ src: "/pwa-icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "RSS Sources",
        short_name: "Sources",
        description: "Manage RSS & Atom news sources",
        url: "/feed-ingestion/sources",
        icons: [{ src: "/pwa-icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "View Projects",
        short_name: "Projects",
        description: "View my portfolio projects",
        url: "/#projects",
        icons: [{ src: "/pwa-icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Contact Me",
        short_name: "Contact",
        description: "Get in touch with me",
        url: "/#contact",
        icons: [{ src: "/pwa-icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Download CV",
        short_name: "CV",
        description: "Download my resume",
        url: "/cris-nguyen-cv.pdf",
        icons: [{ src: "/pwa-icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    related_applications: [],
    prefer_related_applications: false,
    // Android PWA Share Target — receives URLs shared from Chrome/YouTube/TikTok
    share_target: {
      action: "/share",
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: {
        url: "url",
        title: "title",
        text: "text",
      },
    },
  };
}
