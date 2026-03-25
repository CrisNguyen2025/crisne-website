import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cris Nguyen — Frontend Developer",
    short_name: "Cris Nguyen",
    description:
      "I craft modern, performant web experiences with React, Next.js, and TypeScript.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#6B9AC4",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
