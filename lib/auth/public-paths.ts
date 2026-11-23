/** Read-only page for Visitors; everything else in the workspace stays Owner-only. */
export const PUBLIC_NEWS_PATH = "/picks";

/** Pages a signed-out Visitor may open. Matches whole path segments, so `/picksx` stays private. */
export function isPublicPagePath(pathname: string): boolean {
  return pathname === PUBLIC_NEWS_PATH || pathname.startsWith(`${PUBLIC_NEWS_PATH}/`);
}
