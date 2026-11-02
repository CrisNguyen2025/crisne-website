// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchRoadmapBySlug = vi.hoisted(() => vi.fn());
vi.mock("@/logic/roadmap/roadmapService", () => ({ fetchRoadmapBySlug }));

import { useRoadmap } from "@/hooks/use-roadmap";

const notFound = () => Object.assign(new Error("Roadmap not found"), { status: 404 });
const topic = (slug: string) => ({ roadmap: { id: slug, slug, title: slug }, layers: [] });

/** A request the test resolves or rejects when it chooses, to put responses out of order. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

beforeEach(() => fetchRoadmapBySlug.mockReset());

describe("useRoadmap: a missing topic is reported for that topic only", () => {
  it("loads nothing while no topic is open (Home)", () => {
    const { result } = renderHook(() => useRoadmap(""));
    expect(fetchRoadmapBySlug).not.toHaveBeenCalled();
    expect(result.current.isNotFound).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("opening an existing topic right after a 404 does not report it missing", async () => {
    fetchRoadmapBySlug.mockRejectedValueOnce(notFound()).mockResolvedValueOnce(topic("ai-engineering"));
    // What app/page.tsx's effect sees on each render: one render with the new topic and the old 404 sent
    // the user back to Home with "This topic no longer exists."
    const seen: { slug: string; isNotFound: boolean }[] = [];
    const { result, rerender } = renderHook(
      ({ slug }) => {
        const roadmap = useRoadmap(slug);
        seen.push({ slug, isNotFound: roadmap.isNotFound });
        return roadmap;
      },
      { initialProps: { slug: "gone" } }
    );
    await waitFor(() => expect(result.current.isNotFound).toBe(true));

    rerender({ slug: "ai-engineering" });
    await waitFor(() => expect(result.current.roadmapMeta?.slug).toBe("ai-engineering"));
    expect(seen.filter((r) => r.slug === "ai-engineering" && r.isNotFound)).toEqual([]);
  });

  it("a late 404 for the topic just left neither flags nor replaces the one now open", async () => {
    const old = deferred<never>();
    fetchRoadmapBySlug.mockReturnValueOnce(old.promise).mockResolvedValueOnce(topic("ai-engineering"));
    const { result, rerender } = renderHook(({ slug }) => useRoadmap(slug), { initialProps: { slug: "gone" } });

    rerender({ slug: "ai-engineering" });
    await waitFor(() => expect(result.current.roadmapMeta?.slug).toBe("ai-engineering"));
    old.reject(notFound());
    await new Promise((r) => setTimeout(r, 0));

    expect(result.current.isNotFound).toBe(false);
    expect(result.current.roadmapMeta?.slug).toBe("ai-engineering");
  });

  it("a topic deleted while open is still reported", async () => {
    fetchRoadmapBySlug.mockRejectedValueOnce(notFound());
    const { result } = renderHook(() => useRoadmap("deleted"));
    await waitFor(() => expect(result.current.isNotFound).toBe(true));
  });
});
