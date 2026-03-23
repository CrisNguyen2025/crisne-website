import Script from "next/script";

const structuredData = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Cris Nguyen",
  url: "https://crisne.blog",
  jobTitle: "Frontend Developer",
  description: "I craft modern, performant web experiences with React, Next.js, and TypeScript.",
  knowsAbout: ["React", "Next.js", "TypeScript", "JavaScript", "Tailwind CSS", "Frontend Development", "UI/UX Design"],
  sameAs: ["https://github.com/crisne"],
};

export function JsonLd() {
  return (
    <Script
      id="json-ld-person"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      strategy="afterInteractive"
    />
  );
}
