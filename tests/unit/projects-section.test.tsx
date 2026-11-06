// @vitest-environment jsdom
import { cleanup, render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectsSection } from "@/components/projects-section";

describe("ProjectsSection — project:open-modal listener", () => {
  beforeEach(() => {
    globalThis.IntersectionObserver = class IntersectionObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof globalThis.IntersectionObserver;

    globalThis.ResizeObserver = class ResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof globalThis.ResizeObserver;

    window.matchMedia =
      window.matchMedia ||
      vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
  });

  afterEach(() => {
    cleanup();
  });

  it("opens ProjectDetailModal with the requested project when project:open-modal is dispatched", () => {
    render(<ProjectsSection />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("project:open-modal", {
          detail: { projectId: "kamala-commerce-tour" },
        })
      );
    });

    const modalTitles = screen.getAllByText("Kamala Jewelry & Tour Platform");
    expect(modalTitles.length).toBeGreaterThanOrEqual(1);
  });
});
