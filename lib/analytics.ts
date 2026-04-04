// Google Analytics 4 and Tag Manager Integration
// Enhanced with better consent management and event tracking

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "G-XYFE5H3634";
export const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID || "";

// Extend the global Window interface for gtag
declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}

// Consent types for GDPR/CCPA compliance
type ConsentType = "granted" | "denied";

interface ConsentState {
  analytics_storage: ConsentType;
  ad_storage: ConsentType;
  ad_user_data: ConsentType;
  ad_personalization: ConsentType;
  functionality_storage: ConsentType;
  personalization_storage: ConsentType;
  security_storage: ConsentType;
}

// Default consent state - all denied until user consent
export const defaultConsent: ConsentState = {
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  functionality_storage: "denied",
  personalization_storage: "denied",
  security_storage: "granted", // Security is always granted
};

// Update consent based on user choice
export function updateConsent(consent: Partial<ConsentState>) {
  if (typeof window === "undefined") return;

  const gtag = window.gtag;
  if (!gtag) return;

  gtag("consent", "update", {
    ...consent,
  });

  // Store consent in localStorage for persistence
  const currentConsent = getStoredConsent();
  const newConsent = { ...currentConsent, ...consent };
  localStorage.setItem("analytics_consent", JSON.stringify(newConsent));
}

// Get stored consent from localStorage
export function getStoredConsent(): Partial<ConsentState> | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem("analytics_consent");
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

// Check if analytics consent is granted
export function hasAnalyticsConsent(): boolean {
  const stored = getStoredConsent();
  return stored?.analytics_storage === "granted";
}

// Initialize consent from stored preferences
export function initializeStoredConsent() {
  if (typeof window === "undefined") return;

  const stored = getStoredConsent();
  if (stored) {
    updateConsent(stored);
  }
}

// Page view tracking with enhanced parameters
export function trackPageView(
  page_path?: string,
  page_title?: string,
  page_location?: string,
) {
  if (typeof window === "undefined") return;

  const gtag = window.gtag;
  if (!gtag) return;

  gtag("event", "page_view", {
    page_path: page_path || window.location.pathname,
    page_title: page_title || document.title,
    page_location: page_location || window.location.href,
    send_to: GA_ID,
  });
}

// Custom event tracking
export function trackEvent(
  action: string,
  params?: Record<string, string | number | boolean | null>,
) {
  if (typeof window === "undefined") return;

  const gtag = window.gtag;
  if (!gtag) return;

  // Only track if analytics consent is granted
  if (!hasAnalyticsConsent() && action !== "consent_update") {
    return;
  }

  gtag("event", action, {
    ...params,
    send_to: GA_ID,
  });
}

// Section view tracking for scroll depth
export function trackSectionView(sectionId: string) {
  trackEvent("section_view", {
    section_id: sectionId,
    section_name: sectionId.replace(/-/g, " "),
    event_category: "engagement",
    event_label: sectionId,
  });
}

// Section click tracking
export function trackSectionClick(sectionId: string, elementLabel?: string) {
  trackEvent("section_click", {
    section_id: sectionId,
    element_label: elementLabel || sectionId,
    event_category: "engagement",
    event_label: elementLabel || sectionId,
  });
}

// CV download tracking
export function trackDownloadCV() {
  trackEvent("file_download", {
    file_name: "Cris_Nguyen_CV.pdf",
    file_extension: "pdf",
    link_url: "/cris-nguyen-cv.pdf",
    link_text: "Download CV",
    event_category: "conversion",
    event_label: "cv_download",
  });
}

// Contact/CTA click tracking
export function trackCTAClick(ctaType: string, destination?: string) {
  trackEvent("cta_click", {
    cta_type: ctaType,
    destination: destination || "",
    event_category: "conversion",
    event_label: ctaType,
  });
}

// Project interaction tracking
export function trackProjectView(projectName: string) {
  trackEvent("project_view", {
    project_name: projectName,
    event_category: "portfolio",
    event_label: projectName,
  });
}

export function trackProjectClick(
  projectName: string,
  linkType: "demo" | "github" | "details",
) {
  trackEvent("project_click", {
    project_name: projectName,
    link_type: linkType,
    event_category: "portfolio",
    event_label: `${projectName}_${linkType}`,
  });
}

// Skill/technology interest tracking
export function trackSkillInterest(skillName: string) {
  trackEvent("skill_interest", {
    skill_name: skillName,
    event_category: "portfolio",
    event_label: skillName,
  });
}

// Time on page tracking
let pageStartTime: number | null = null;

export function startPageTimer() {
  pageStartTime = Date.now();
}

export function trackTimeOnPage() {
  if (!pageStartTime) return;

  const timeSpent = Math.round((Date.now() - pageStartTime) / 1000);
  trackEvent("time_on_page", {
    time_spent_seconds: timeSpent,
    time_spent_minutes: Math.round((timeSpent / 60) * 10) / 10,
    event_category: "engagement",
    event_label: `${timeSpent}s`,
    non_interaction: true,
  });
}

// Scroll depth tracking
const scrollDepths = [25, 50, 75, 90, 100];
const trackedDepths = new Set<number>();

export function trackScrollDepth() {
  if (typeof window === "undefined") return;

  const scrollPercent = Math.round(
    ((window.scrollY + window.innerHeight) /
      document.documentElement.scrollHeight) *
      100,
  );

  for (const depth of scrollDepths) {
    if (scrollPercent >= depth && !trackedDepths.has(depth)) {
      trackedDepths.add(depth);
      trackEvent("scroll_depth", {
        depth_percent: depth,
        event_category: "engagement",
        event_label: `${depth}%`,
        non_interaction: true,
      });
    }
  }
}

// Error tracking
export function trackError(error: Error, context?: string) {
  trackEvent("exception", {
    description: error.message,
    fatal: false,
    context: context || "",
    stack: error.stack || "",
  });
}

// Performance tracking
export function trackPerformance(
  metricName: string,
  value: number,
  rating: "good" | "needs-improvement" | "poor",
) {
  trackEvent("web_vitals", {
    metric_name: metricName,
    value: Math.round(value),
    rating,
    event_category: "performance",
    event_label: `${metricName}_${rating}`,
    non_interaction: true,
  });
}
