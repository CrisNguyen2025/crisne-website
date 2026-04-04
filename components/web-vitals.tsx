"use client";

import { useReportWebVitals } from "next/web-vitals";

export function WebVitals() {
  useReportWebVitals((metric) => {
    // Send to Google Analytics
    if (
      typeof window !== "undefined" &&
      (window as Window & { gtag?: (...args: unknown[]) => void }).gtag
    ) {
      (window as Window & { gtag?: (...args: unknown[]) => void }).gtag?.(
        "event",
        metric.name,
        {
          event_category: "Web Vitals",
          value: Math.round(
            metric.name === "CLS" ? metric.value * 1000 : metric.value,
          ),
          event_label: metric.id,
          non_interaction: true,
        },
      );
    }

    // Log to console in development
    if (process.env.NODE_ENV === "development") {
      console.log("[Web Vitals]", metric.name, metric.value, metric.rating);
    }
  });

  return null;
}
