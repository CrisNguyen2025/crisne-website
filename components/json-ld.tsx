import type { ReactNode } from "react";

const SITE_URL = "https://crisne.blog";

// WebSite schema for search box in SERP
const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Cris Nguyen Portfolio",
  url: SITE_URL,
  description:
    "Portfolio of Cris Nguyen featuring scalable, high-performance web solutions built with React, Next.js, and TypeScript for SaaS products, CMS, CRM, HRM, and booking systems.",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE_URL}/?search={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

// Person schema for author/individual
const personSchema = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Cris Nguyen",
  url: SITE_URL,
  jobTitle: "Frontend Developer",
  description:
    "Building scalable, high-performance web solutions with React, Next.js, and TypeScript for SaaS products, enterprise CMS, CRM, HRM, and booking systems.",
  knowsAbout: [
    "React",
    "Next.js",
    "TypeScript",
    "SaaS Development",
    "CMS Development",
    "CRM Development",
    "HRM Development",
    "Booking Systems",
    "JavaScript",
    "Tailwind CSS",
    "Frontend Development",
    "UI/UX Design",
    "Web Performance",
    "Responsive Design",
    "Accessibility (a11y)",
  ],
  sameAs: [
    "https://github.com/crisne",
    "https://linkedin.com/in/crisnguyen",
    "https://twitter.com/crisne",
  ],
  worksFor: {
    "@type": "Organization",
    name: "Freelance / Open to opportunities",
  },
  address: {
    "@type": "PostalAddress",
    addressLocality: "Ho Chi Minh City",
    addressCountry: "VN",
  },
};

// ProfessionalService schema for freelance work
const professionalServiceSchema = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "Cris Nguyen Frontend Development Services",
  url: SITE_URL,
  description:
    "Professional frontend development services for scalable, high-performance SaaS products, CMS, CRM, HRM, and booking systems.",
  provider: {
    "@type": "Person",
    name: "Cris Nguyen",
  },
  areaServed: {
    "@type": "Place",
    name: "Global - Remote work available",
  },
  serviceType: [
    "Frontend Development",
    "React Development",
    "Next.js Development",
    "SaaS Development",
    "CMS Development",
    "CRM Development",
    "HRM Development",
    "Booking Systems Development",
    "UI/UX Implementation",
    "Web Performance Optimization",
  ],
};

interface JsonLdProps {
  readonly schemas?: Array<"website" | "person" | "professionalService">;
}

export function JsonLd({
  schemas = ["website", "person", "professionalService"],
}: JsonLdProps): ReactNode {
  const selectedSchemas: Record<string, unknown>[] = [];

  if (schemas.includes("website")) {
    selectedSchemas.push(websiteSchema);
  }
  if (schemas.includes("person")) {
    selectedSchemas.push(personSchema);
  }
  if (schemas.includes("professionalService")) {
    selectedSchemas.push(professionalServiceSchema);
  }

  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(selectedSchemas) }}
    />
  );
}
