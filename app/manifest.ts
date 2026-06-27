import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cris Nguyen — Frontend Developer Portfolio",
    short_name: "Cris Nguyen",
    description:
      "Portfolio of Cris Nguyen featuring scalable, high-performance web solutions built with React, Next.js, and TypeScript for SaaS products, enterprise CMS, CRM, HRM, and booking systems.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#6B9AC4",
    orientation: "portrait",
    scope: "/",
    lang: "en",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
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
        name: "View Projects",
        short_name: "Projects",
        description: "View my portfolio projects",
        url: "/#projects",
        icons: [{ src: "/icon.png", sizes: "192x192" }],
      },
      {
        name: "Contact Me",
        short_name: "Contact",
        description: "Get in touch with me",
        url: "/#contact",
        icons: [{ src: "/icon.png", sizes: "192x192" }],
      },
      {
        name: "Download CV",
        short_name: "CV",
        description: "Download my resume",
        url: "/cris-nguyen-cv.pdf",
        icons: [{ src: "/icon.png", sizes: "192x192" }],
      },
    ],
    related_applications: [],
    prefer_related_applications: false,
  };
}
