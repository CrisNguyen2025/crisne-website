import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildBaseNewsSlug, pickUniqueNewsSlug } from "@/lib/news/slug";
import {
  isPrivateIp,
  normalizeCanonicalUrl,
  UrlGuardError,
} from "@/lib/news/url-guard";
import { closeOpenInline } from "@/roadmap-rag-assistant/sdk/typescript/src/react/ChatMarkdown";

describe("Property-based invariants (fast-check)", () => {
  it("buildBaseNewsSlug always produces a bounded ASCII slug or fallback", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.option(fc.domain(), { nil: undefined }),
        (title, domain) => {
          const slug = buildBaseNewsSlug(title, domain);
          expect(slug.length).toBeGreaterThan(0);
          expect(slug.length).toBeLessThanOrEqual(90);
          expect(slug).toMatch(/^[a-z0-9-]+$/);
          expect(slug.startsWith("-")).toBe(false);
          expect(slug.endsWith("-")).toBe(false);
        }
      )
    );
  });

  it("pickUniqueNewsSlug never collides with existing slugs and tracks allocated ones", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z0-9]{1,20}(-[a-z0-9]{1,10})?$/),
        fc.array(fc.stringMatching(/^[a-z0-9-]{1,25}$/), { maxLength: 15 }),
        fc.integer({ min: 1, max: 6 }),
        (base, initialUsed, allocations) => {
          const used = new Set(initialUsed);
          for (let i = 0; i < allocations; i++) {
            const sizeBefore = used.size;
            const snapshot = new Set(used);
            const picked = pickUniqueNewsSlug(base, used);
            expect(snapshot.has(picked)).toBe(false);
            expect(used.has(picked)).toBe(true);
            expect(used.size).toBe(sizeBefore + 1);
          }
        }
      )
    );
  });

  it("isPrivateIp always blocks RFC1918, loopback, link-local, and CGNAT IPv4 ranges", () => {
    const octet = fc.integer({ min: 0, max: 255 });
    const privateIpv4Arb = fc.oneof(
      fc.tuple(octet, octet, octet).map(([b, c, d]) => `10.${b}.${c}.${d}`),
      fc.tuple(octet, octet, octet).map(([b, c, d]) => `127.${b}.${c}.${d}`),
      fc
        .tuple(fc.integer({ min: 16, max: 31 }), octet, octet)
        .map(([b, c, d]) => `172.${b}.${c}.${d}`),
      fc.tuple(octet, octet).map(([c, d]) => `192.168.${c}.${d}`),
      fc.tuple(octet, octet).map(([c, d]) => `169.254.${c}.${d}`),
      fc
        .tuple(fc.integer({ min: 64, max: 127 }), octet, octet)
        .map(([b, c, d]) => `100.${b}.${c}.${d}`)
    );

    fc.assert(
      fc.property(privateIpv4Arb, (ip) => {
        expect(isPrivateIp(ip)).toBe(true);
      })
    );
  });

  it("normalizeCanonicalUrl forces https, drops fragments/tracking params, and rejects credentials", () => {
    const trackingKey = fc.constantFrom(
      "utm_source",
      "utm_medium",
      "fbclid",
      "gclid",
      "si"
    );
    const safeDomain = fc.constantFrom(
      "example.com",
      "docs.custom.dev",
      "simonwillison.net"
    );
    const pathSegment = fc.stringMatching(/^[a-z0-9-]{1,12}$/);

    fc.assert(
      fc.property(
        fc.constantFrom("http:", "https:"),
        safeDomain,
        pathSegment,
        trackingKey,
        fc.stringMatching(/^[a-z0-9]{1,8}$/),
        fc.stringMatching(/^[a-z0-9]{0,8}$/),
        (protocol, domain, segment, paramKey, paramVal, hash) => {
          const raw = `${protocol}//${domain}/${segment}/?${paramKey}=${paramVal}&keep=1#${hash}`;
          const normalized = normalizeCanonicalUrl(raw);
          const parsed = new URL(normalized.canonicalUrl);
          expect(parsed.protocol).toBe("https:");
          expect(parsed.hash).toBe("");
          expect(parsed.searchParams.has(paramKey)).toBe(false);
          expect(parsed.searchParams.get("keep")).toBe("1");
        }
      )
    );

    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z0-9]{1,8}$/),
        safeDomain,
        (user, domain) => {
          expect(() =>
            normalizeCanonicalUrl(`https://${user}:secret@${domain}/article`)
          ).toThrow(UrlGuardError);
        }
      )
    );
  });

  it("closeOpenInline never throws and leaves unclosed code fences untouched", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const result = closeOpenInline(text);
        expect(typeof result).toBe("string");
      })
    );

    fc.assert(
      fc.property(
        fc.string({ maxLength: 60 }).filter((s) => !s.includes("```")),
        (inner) => {
          const fenced = "```ts\n" + inner;
          expect(closeOpenInline(fenced)).toBe(fenced);
        }
      )
    );
  });
});
