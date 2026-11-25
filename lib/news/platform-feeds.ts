export type FeedFormat = "rss" | "atom" | "json";

export interface PlatformFeedCandidate {
  url: string;
  title?: string;
  format: FeedFormat;
}

const GITHUB_RESERVED_ROOTS = new Set([
  "about",
  "account",
  "codespaces",
  "collections",
  "contact",
  "customer-stories",
  "enterprise",
  "events",
  "explore",
  "features",
  "gist",
  "issues",
  "login",
  "marketplace",
  "new",
  "notifications",
  "orgs",
  "organizations",
  "pricing",
  "pulls",
  "readme",
  "search",
  "security",
  "settings",
  "signup",
  "sponsors",
  "team",
  "topics",
  "trending",
]);

const DEVTO_RESERVED_ROOTS = new Set([
  "about",
  "api",
  "code-of-conduct",
  "contact",
  "enter",
  "feed",
  "latest",
  " listings",
  "listings",
  "notifications",
  "podcasts",
  "privacy",
  "readinglist",
  "search",
  "settings",
  "signout_confirm",
  "t",
  "tags",
  "terms",
  "top",
  "videos",
]);

const MEDIUM_RESERVED_ROOTS = new Set([
  "about",
  "creators",
  "explore-topics",
  "feed",
  "jobs-at-medium",
  "m",
  "membership",
  "me",
  "new-story",
  "p",
  "plans",
  "policy",
  "search",
  "tag",
  "uet",
]);

const NON_MASTODON_AT_HOSTS = new Set([
  "substack.com",
  "medium.com",
  "youtube.com",
  "m.youtube.com",
  "tiktok.com",
  "m.tiktok.com",
  "x.com",
  "twitter.com",
  "threads.net",
]);

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

export function resolvePlatformFeedCandidates(rawUrl: string): PlatformFeedCandidate[] {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return [];
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return [];
  }

  const canonicalInput = parsed.toString();
  const host = normalizeHost(parsed.hostname);
  const segments = parsed.pathname.split("/").filter(Boolean);
  const rawCandidates: PlatformFeedCandidate[] = [];

  // A GitHub feed already (releases.atom, tags.atom, commits/<branch>.atom) is fetched as is:
  // mapping it would drop the pasted feed and leave only commits.atom
  if (host === "github.com" && !parsed.pathname.toLowerCase().endsWith(".atom")) {
    if (
      segments.length >= 2 &&
      !GITHUB_RESERVED_ROOTS.has(segments[0].toLowerCase()) &&
      !segments[1].endsWith(".atom")
    ) {
      const owner = segments[0];
      const repo = segments[1].replace(/\.git$/i, "");
      rawCandidates.push(
        {
          url: `https://github.com/${owner}/${repo}/releases.atom`,
          title: `${owner}/${repo} Releases`,
          format: "atom",
        },
        {
          url: `https://github.com/${owner}/${repo}/commits.atom`,
          title: `${owner}/${repo} Commits`,
          format: "atom",
        }
      );
    } else if (
      segments.length === 1 &&
      !GITHUB_RESERVED_ROOTS.has(segments[0].toLowerCase()) &&
      !segments[0].endsWith(".atom")
    ) {
      const user = segments[0];
      rawCandidates.push({
        url: `https://github.com/${user}.atom`,
        title: `${user} Activity`,
        format: "atom",
      });
    }
  } else if (host === "youtube.com" || host === "m.youtube.com") {
    const listId = parsed.searchParams.get("list");
    if (parsed.pathname === "/playlist" && listId && /^[a-zA-Z0-9_-]{10,}$/.test(listId)) {
      rawCandidates.push({
        url: `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(listId)}`,
        title: "YouTube Playlist Feed",
        format: "atom",
      });
    } else if (
      segments[0] === "channel" &&
      segments[1] &&
      /^UC[a-zA-Z0-9_-]{16,}$/.test(segments[1])
    ) {
      rawCandidates.push({
        url: `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(segments[1])}`,
        title: "YouTube Channel Feed",
        format: "atom",
      });
    }
  } else if (host === "medium.com") {
    if (segments[0]?.startsWith("@") && segments[0].length > 1) {
      rawCandidates.push({
        url: `https://medium.com/feed/${segments[0]}`,
        title: `Medium ${segments[0]}`,
        format: "rss",
      });
    } else if (segments[0] && !MEDIUM_RESERVED_ROOTS.has(segments[0].toLowerCase())) {
      rawCandidates.push({
        url: `https://medium.com/feed/${segments[0]}`,
        title: `Medium ${segments[0]}`,
        format: "rss",
      });
    }
  } else if (host.endsWith(".medium.com")) {
    const sub = host.slice(0, -".medium.com".length);
    if (sub && sub !== "www" && parsed.pathname !== "/feed") {
      rawCandidates.push({
        url: `https://${sub}.medium.com/feed`,
        title: `${sub} Medium`,
        format: "rss",
      });
    }
  } else if (host === "dev.to") {
    if (segments[0] === "t" && segments[1]) {
      rawCandidates.push({
        url: `https://dev.to/feed/tag/${segments[1]}`,
        title: `DEV #${segments[1]}`,
        format: "rss",
      });
    } else if (segments[0] && !DEVTO_RESERVED_ROOTS.has(segments[0].toLowerCase())) {
      rawCandidates.push({
        url: `https://dev.to/feed/${segments[0]}`,
        title: `DEV @${segments[0]}`,
        format: "rss",
      });
    }
  } else if (host.endsWith(".substack.com")) {
    const pub = host.slice(0, -".substack.com".length);
    if (pub && pub !== "www" && pub !== "api" && pub !== "open") {
      rawCandidates.push({
        url: `https://${pub}.substack.com/feed`,
        title: `${pub} Substack`,
        format: "rss",
      });
    }
  } else if (host.endsWith(".hashnode.dev")) {
    rawCandidates.push({
      url: `${parsed.origin}/rss.xml`,
      title: `${host} RSS`,
      format: "rss",
    });
  } else if (host === "bsky.app") {
    if (segments[0] === "profile" && segments[1] && segments[2] !== "rss") {
      rawCandidates.push({
        url: `https://bsky.app/profile/${segments[1]}/rss`,
        title: `Bluesky @${segments[1]}`,
        format: "rss",
      });
    }
  } else if (host === "reddit.com" || host === "old.reddit.com") {
    if (segments[0] === "r" && segments[1] && !segments[1].endsWith(".rss")) {
      rawCandidates.push({
        url: `https://www.reddit.com/r/${segments[1]}/.rss`,
        title: `r/${segments[1]}`,
        format: "atom",
      });
    }
  } else if (
    !NON_MASTODON_AT_HOSTS.has(host) &&
    segments.length === 1 &&
    /^@[a-zA-Z0-9_.-]+$/.test(segments[0]) &&
    !segments[0].endsWith(".rss")
  ) {
    rawCandidates.push({
      url: `${parsed.origin}/${segments[0]}.rss`,
      title: `${segments[0]}@${host}`,
      format: "rss",
    });
  }

  return rawCandidates.filter((candidate) => candidate.url !== canonicalInput);
}

export function extractYouTubeChannelFeedFromHtml(html: string): string | null {
  const slice = html.slice(0, 524_288);
  const canonicalMatch = slice.match(
    /https?:\/\/(?:www\.)?youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{20,})/i
  );
  if (canonicalMatch?.[1]) {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${canonicalMatch[1]}`;
  }

  const jsonIdMatch = slice.match(/"(?:channelId|externalId)"\s*:\s*"(UC[a-zA-Z0-9_-]{20,})"/);
  if (jsonIdMatch?.[1]) {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${jsonIdMatch[1]}`;
  }

  return null;
}
