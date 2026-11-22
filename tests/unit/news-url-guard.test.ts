import { describe, expect, it, vi } from "vitest";
import {
  assertPublicHostname,
  getAllowedDomains,
  isDomainAllowed,
  isPrivateIp,
  normalizeCanonicalUrl,
  resolveAndValidateUrl,
  UrlGuardError,
} from "@/lib/news/url-guard";

const publicLookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);

describe("news url-guard", () => {
  describe("isDomainAllowed & getAllowedDomains", () => {
    it("allows exact and subdomain matches while ignoring www.", () => {
      const allowed = getAllowedDomains(["custom.dev"]);
      expect(isDomainAllowed("www.youtube.com", allowed)).toBe(true);
      expect(isDomainAllowed("m.youtube.com", allowed)).toBe(true);
      expect(isDomainAllowed("blog.substack.com", allowed)).toBe(true);
      expect(isDomainAllowed("docs.custom.dev", allowed)).toBe(true);
      expect(isDomainAllowed("evil-youtube.com", allowed)).toBe(false);
      expect(isDomainAllowed("unknown-site.xyz", allowed)).toBe(false);
    });

    it("merges NEWS_ALLOWED_DOMAINS from environment", () => {
      vi.stubEnv("NEWS_ALLOWED_DOMAINS", "https://ignored, example.org , www.simonwillison.net ");
      const allowed = getAllowedDomains();
      expect(isDomainAllowed("simonwillison.net", allowed)).toBe(true);
      expect(isDomainAllowed("example.org", allowed)).toBe(true);
      vi.unstubAllEnvs();
    });
  });

  describe("isPrivateIp", () => {
    it("blocks IPv4 loopback, RFC1918, CGNAT, link-local, and multicast", () => {
      for (const ip of [
        "127.0.0.1",
        "10.0.0.5",
        "172.16.10.2",
        "172.31.255.254",
        "192.168.1.1",
        "169.254.169.254",
        "100.64.0.1",
        "0.0.0.0",
        "224.0.0.1",
      ]) {
        expect(isPrivateIp(ip), ip).toBe(true);
      }
    });

    it("blocks IPv6 loopback, ULA, link-local, and IPv4-mapped private addresses", () => {
      for (const ip of [
        "::1",
        "::",
        "fc00::1",
        "fd12:3456:789a::1",
        "fe80::1",
        "::ffff:127.0.0.1",
        "::ffff:7f00:1",
        "::ffff:169.254.169.254",
      ]) {
        expect(isPrivateIp(ip), ip).toBe(true);
      }
    });

    it("allows public IPv4 and IPv6 addresses", () => {
      expect(isPrivateIp("93.184.216.34")).toBe(false);
      expect(isPrivateIp("8.8.8.8")).toBe(false);
      expect(isPrivateIp("172.32.0.1")).toBe(false);
      expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
    });
  });

  describe("assertPublicHostname", () => {
    it("rejects localhost, .internal, and DNS records pointing to private IPs", async () => {
      await expect(assertPublicHostname("localhost", publicLookup)).rejects.toMatchObject({
        code: "SSRF_BLOCKED",
        status: 403,
      });
      await expect(assertPublicHostname("metadata.internal", publicLookup)).rejects.toMatchObject({
        code: "SSRF_BLOCKED",
        status: 403,
      });
      await expect(
        assertPublicHostname("rebind.youtube.com", async () => [{ address: "10.0.0.1", family: 4 }])
      ).rejects.toMatchObject({
        code: "SSRF_BLOCKED",
        status: 403,
      });
    });
  });

  describe("normalizeCanonicalUrl", () => {
    it("canonicalizes YouTube watch, shorts, and youtu.be URLs to a single format", () => {
      const a = normalizeCanonicalUrl("https://youtu.be/dQw4w9WgXcQ?si=tracking123");
      const b = normalizeCanonicalUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share");
      const c = normalizeCanonicalUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ&pp=abc&utm_source=x");

      expect(a.canonicalUrl).toBe("https://youtube.com/watch?v=dQw4w9WgXcQ");
      expect(b.canonicalUrl).toBe(a.canonicalUrl);
      expect(c.canonicalUrl).toBe(a.canonicalUrl);
      expect(a.platform).toBe("youtube");
    });

    it("strips tracking query params and hash from TikTok and article URLs", () => {
      const tiktok = normalizeCanonicalUrl(
        "https://www.tiktok.com/@cris/video/7123456789?is_from_webapp=1&sender_device=pc&_r=1#frag"
      );
      expect(tiktok.canonicalUrl).toBe("https://tiktok.com/@cris/video/7123456789");
      expect(tiktok.platform).toBe("tiktok");

      const article = normalizeCanonicalUrl("https://github.com/vercel/next.js/?utm_source=x&tab=readme#top");
      expect(article.canonicalUrl).toBe("https://github.com/vercel/next.js?tab=readme");
      expect(article.platform).toBe("article");
    });
  });

  describe("resolveAndValidateUrl", () => {
    it("rejects non-http protocols and non-whitelisted domains", async () => {
      await expect(
        resolveAndValidateUrl("ftp://youtube.com/file", { lookupFn: publicLookup })
      ).rejects.toMatchObject({ code: "UNSUPPORTED_PROTOCOL", status: 400 });

      await expect(
        resolveAndValidateUrl("https://not-in-whitelist.example/post", { lookupFn: publicLookup })
      ).rejects.toBeInstanceOf(UrlGuardError);
    });

    it("resolves valid short links and strips tracking parameters", async () => {
      const fakeFetch = vi.fn(async () =>
        new Response(null, {
          status: 302,
          headers: {
            location: "https://www.tiktok.com/@dev/video/987654321?is_from_webapp=1&_r=1",
          },
        })
      );
      // 2nd call returns 200 OK
      fakeFetch.mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            location: "https://www.tiktok.com/@dev/video/987654321?is_from_webapp=1&_r=1",
          },
        })
      );
      fakeFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

      const res = await resolveAndValidateUrl("https://vt.tiktok.com/ZSrABC123/", {
        lookupFn: publicLookup,
        fetchFn: fakeFetch as unknown as typeof fetch,
      });

      expect(res.canonicalUrl).toBe("https://tiktok.com/@dev/video/987654321");
      expect(res.domain).toBe("tiktok.com");
      expect(res.platform).toBe("tiktok");
    });

    it("blocks redirects pointing to disallowed domains or private IPs", async () => {
      const evilDomainFetch = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(null, {
            status: 302,
            headers: { location: "https://evil-phish.example/steal" },
          })
        )
        .mockResolvedValueOnce(new Response(null, { status: 200 }));
      await expect(
        resolveAndValidateUrl("https://vt.tiktok.com/ZSrEvil/", {
          lookupFn: publicLookup,
          fetchFn: evilDomainFetch as unknown as typeof fetch,
        })
      ).rejects.toMatchObject({ code: "DOMAIN_NOT_ALLOWED", status: 403 });
      expect(evilDomainFetch).toHaveBeenCalledTimes(1);

      const ssrfFetch = vi.fn(async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        })
      );
      await expect(
        resolveAndValidateUrl("https://vt.tiktok.com/ZSrSsrf/", {
          lookupFn: publicLookup,
          fetchFn: ssrfFetch as unknown as typeof fetch,
        })
      ).rejects.toMatchObject({ code: "SSRF_BLOCKED", status: 403 });
    });

    it("rejects redirect chains exceeding 5 hops", async () => {
      const loopFetch = vi.fn(async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://vt.tiktok.com/loop" },
        })
      );
      await expect(
        resolveAndValidateUrl("https://vt.tiktok.com/start", {
          lookupFn: publicLookup,
          fetchFn: loopFetch as unknown as typeof fetch,
        })
      ).rejects.toMatchObject({ code: "TOO_MANY_REDIRECTS", status: 400 });
    });

    it("follows t.co and bit.ly short links that are not themselves whitelisted", async () => {
      const chainFetch = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(null, { status: 301, headers: { location: "https://bit.ly/abc" } })
        )
        .mockResolvedValueOnce(
          new Response(null, {
            status: 301,
            headers: { location: "https://github.com/vercel/next.js?utm_source=x" },
          })
        )
        .mockResolvedValueOnce(new Response(null, { status: 200 }));

      const result = await resolveAndValidateUrl("https://t.co/xyz", {
        lookupFn: publicLookup,
        fetchFn: chainFetch as unknown as typeof fetch,
      });

      expect(result.sourceUrl).toBe("https://t.co/xyz");
      expect(result.canonicalUrl).toBe("https://github.com/vercel/next.js");
      expect(result.domain).toBe("github.com");
    });

    it("rejects a short link whose target is outside the whitelist or cannot be resolved", async () => {
      const evilFetch = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(null, { status: 302, headers: { location: "https://evil.example/x" } })
        );
      await expect(
        resolveAndValidateUrl("https://t.co/evil", {
          lookupFn: publicLookup,
          fetchFn: evilFetch as unknown as typeof fetch,
        })
      ).rejects.toMatchObject({ code: "DOMAIN_NOT_ALLOWED", status: 403 });

      const failingFetch = vi.fn(async () => {
        throw new Error("network down");
      });
      await expect(
        resolveAndValidateUrl("https://bit.ly/down", {
          lookupFn: publicLookup,
          fetchFn: failingFetch as unknown as typeof fetch,
        })
      ).rejects.toMatchObject({ code: "DOMAIN_NOT_ALLOWED", status: 403 });
    });
  });
});
