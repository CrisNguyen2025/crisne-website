// Re-export from analytics.ts for backward compatibility
// This file is kept for existing imports, use lib/analytics.ts for new code

export {
  GA_ID,
  GTM_ID,
  defaultConsent,
  updateConsent,
  getStoredConsent,
  hasAnalyticsConsent,
  initializeStoredConsent,
  trackPageView,
  trackEvent,
  trackSectionView,
  trackSectionClick,
  trackDownloadCV,
  trackCTAClick,
  trackProjectView,
  trackProjectClick,
  trackSkillInterest,
  startPageTimer,
  trackTimeOnPage,
  trackScrollDepth,
  trackError,
  trackPerformance,
} from "./analytics";
