/** Read-only page for Visitors; everything else in the workspace stays Owner-only. */
export const PUBLIC_NEWS_PATH = "/news";

/** Pages a signed-out Visitor may open. Matches whole path segments, so `/newsx` stays private. */
export function isPublicPagePath(pathname: string): boolean {
  return pathname === PUBLIC_NEWS_PATH || pathname.startsWith(`${PUBLIC_NEWS_PATH}/`);
}
