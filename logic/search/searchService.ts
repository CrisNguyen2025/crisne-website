import type { GlobalSearchResponseDto, SearchScope } from "@/lib/search/global-search";

export type { GlobalSearchResponseDto, SearchScope } from "@/lib/search/global-search";
export type { SearchSnippet } from "@/lib/search/text-match";

export async function fetchGlobalSearch(params: {
  q: string;
  scope: SearchScope;
  signal?: AbortSignal;
}): Promise<GlobalSearchResponseDto> {
  const searchParams = new URLSearchParams();
  if (params.q.trim()) {
    searchParams.set("q", params.q.trim());
  }
  if (params.scope !== "all") {
    searchParams.set("scope", params.scope);
  }
  const qs = searchParams.toString();
  const url = qs ? `/api/v1/search?${qs}` : "/api/v1/search";
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: params.signal,
  });

  if (!res.ok) {
    throw new Error(`Không thể tìm kiếm (HTTP ${res.status}).`);
  }

  return (await res.json()) as GlobalSearchResponseDto;
}
