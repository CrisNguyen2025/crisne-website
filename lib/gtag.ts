export const GA_ID = "G-XYFE5H3634";

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
  }
}

export function trackEvent(action: string, params?: Record<string, string | number | boolean>) {
  globalThis.window?.gtag?.("event", action, params);
}

export function trackSectionView(sectionId: string) {
  trackEvent("section_view", {
    section_id: sectionId,
    section_name: sectionId.replaceAll("-", " "),
  });
}

export function trackSectionClick(sectionId: string, elementLabel?: string) {
  trackEvent("section_click", {
    section_id: sectionId,
    element_label: elementLabel ?? sectionId,
  });
}

export function trackDownloadCV() {
  trackEvent("file_download", {
    file_name: "Cris_Nguyen_CV.pdf",
    file_extension: "pdf",
    link_url: "/cris-nguyen-cv.pdf",
  });
}
