// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalSearchPalette } from "@/components/search/GlobalSearchPalette";
import { clearGlobalSearchCache, closeGlobalSearch, openGlobalSearch } from "@/lib/search/search-controller";
import type { GlobalSearchResponseDto } from "@/logic/search/searchService";
import { expectNoA11yViolations } from "../setup/a11y";

const mockPush = vi.fn();
const mockPathname = vi.fn(() => "/");
const mockUseCanWrite = vi.fn(() => true);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname(),
}));

vi.mock("@/hooks/use-can-write", () => ({
  useCanWrite: () => mockUseCanWrite(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const ZERO_QUERY_RESPONSE: GlobalSearchResponseDto = {
  query: "",
  scope: "all",
  isZeroQuery: true,
  topics: [
    {
      id: "t-1",
      slug: "ai-architecture",
      title: "AI & LLM Architecture",
      description: "Lộ trình kiến trúc hệ thống LLM",
      lessonCount: 12,
      href: "/ai-architecture",
      snippet: { text: "Lộ trình kiến trúc hệ thống LLM", highlightStart: 0, highlightEnd: 0 },
    },
  ],
  lessons: [
    {
      id: "l-1",
      slug: "rag-hybrid",
      title: "Hybrid RAG Retrieval",
      topicSlug: "ai-architecture",
      topicTitle: "AI & LLM Architecture",
      section: "Retrieval",
      status: "learning",
      href: "/ai-architecture/rag-hybrid",
      matchedHeading: null,
      snippet: null,
    },
  ],
  news: [],
};

const QUERY_RESPONSE: GlobalSearchResponseDto = {
  query: "kien truc",
  scope: "all",
  isZeroQuery: false,
  topics: [],
  lessons: [
    {
      id: "l-2",
      slug: "context-window",
      title: "Context Window & Memory",
      topicSlug: "ai-architecture",
      topicTitle: "AI & LLM Architecture",
      section: "Ngữ cảnh",
      status: "target",
      href: "/ai-architecture/context-window#kien-truc",
      matchedHeading: "Kiến trúc",
      snippet: {
        text: "Thiết kế kiến trúc bộ nhớ ngắn hạn",
        highlightStart: 9,
        highlightEnd: 18,
      },
    },
  ],
  news: [
    {
      id: "n-1",
      title: "Anthropic Context Engineering",
      domain: "anthropic.com",
      platform: "article",
      isSaved: true,
      tags: ["context"],
      href: "/news?view=all&item=n-1",
      snippet: null,
    },
  ],
};

describe("GlobalSearchPalette", () => {
  beforeEach(() => {
    clearGlobalSearchCache();
    closeGlobalSearch();
    mockPush.mockReset();
    mockPathname.mockReturnValue("/");
    mockUseCanWrite.mockReturnValue(true);
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("stays disabled for Visitors and on /portfolio", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    mockUseCanWrite.mockReturnValue(false);
    render(<GlobalSearchPalette />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    cleanup();
    mockUseCanWrite.mockReturnValue(true);
    mockPathname.mockReturnValue("/portfolio");
    render(<GlobalSearchPalette />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens on Cmd+K, supports keyboard navigation, highlights snippets, and passes axe-core a11y", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("q=kien+truc") || url.includes("q=kien%20truc")) {
        return new Response(JSON.stringify(QUERY_RESPONSE), { status: 200 });
      }
      return new Response(JSON.stringify(ZERO_QUERY_RESPONSE), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GlobalSearchPalette />);

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Hybrid RAG Retrieval")).toBeTruthy());

    await expectNoA11yViolations(document.body);

    const input = screen.getByLabelText("Tìm kiếm Topic, Bài học và News");
    fireEvent.change(input, { target: { value: "kien truc" } });

    await waitFor(() => expect(screen.getByText("Context Window & Memory")).toBeTruthy(), {
      timeout: 1500,
    });
    expect(screen.getByText("kiến trúc", { selector: "mark" })).toBeTruthy();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockPush).toHaveBeenCalledWith("/news?view=all&item=n-1");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("can be opened programmatically via openGlobalSearch and dismissed with Escape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(ZERO_QUERY_RESPONSE), { status: 200 }))
    );

    render(<GlobalSearchPalette />);
    act(() => openGlobalSearch());

    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
