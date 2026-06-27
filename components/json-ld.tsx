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

// BreadcrumbList schema component for navigation
interface BreadcrumbItem {
  name: string;
  path: string;
}

interface BreadcrumbJsonLdProps {
  readonly items: BreadcrumbItem[];
}

export function BreadcrumbJsonLd({ items }: BreadcrumbJsonLdProps): ReactNode {
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.path.startsWith("http")
        ? item.path
        : `${SITE_URL}${item.path}`,
    })),
  };

  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
    />
  );
}

// Article schema for project details or blog posts
interface ArticleJsonLdProps {
  readonly title: string;
  readonly description: string;
  readonly url: string;
  readonly image?: string;
  readonly datePublished?: string;
  readonly dateModified?: string;
  readonly author?: string;
}

export function ArticleJsonLd({
  title,
  description,
  url,
  image,
  datePublished,
  dateModified,
  author = "Cris Nguyen",
}: ArticleJsonLdProps): ReactNode {
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    url,
    image: image
      ? image.startsWith("http")
        ? image
        : `${SITE_URL}${image}`
      : undefined,
    datePublished,
    dateModified: dateModified || datePublished,
    author: {
      "@type": "Person",
      name: author,
      url: SITE_URL,
    },
    publisher: {
      "@type": "Person",
      name: "Cris Nguyen",
      url: SITE_URL,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
  };

  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
    />
  );
}

// SoftwareApplication schema for showcasing projects/tools
interface SoftwareAppJsonLdProps {
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly image?: string;
  readonly applicationCategory?: string;
  readonly operatingSystem?: string;
  readonly softwareVersion?: string;
}

export function SoftwareAppJsonLd({
  name,
  description,
  url,
  image,
  applicationCategory = "WebApplication",
  operatingSystem = "Any",
  softwareVersion,
}: SoftwareAppJsonLdProps): ReactNode {
  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    description,
    url,
    image: image
      ? image.startsWith("http")
        ? image
        : `${SITE_URL}${image}`
      : undefined,
    applicationCategory,
    operatingSystem,
    softwareVersion,
    author: {
      "@type": "Person",
      name: "Cris Nguyen",
      url: SITE_URL,
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };

  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
    />
  );
}
