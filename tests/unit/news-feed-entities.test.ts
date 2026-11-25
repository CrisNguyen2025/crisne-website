import { describe, expect, it } from "vitest";
import { parseFeedDocument } from "@/lib/news/rss-fetcher";

describe("parseFeedDocument entity limits", () => {
  it("parses a feed whose HTML-escaped content has more than 1000 built-in entities", () => {
    // GitHub releases.atom escapes release notes HTML, so &quot; / &lt; easily pass 1000
    const escapedHtml = "&lt;p&gt;&quot;fix&quot;&lt;/p&gt;".repeat(300);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Release notes from next.js</title>
        <entry>
          <title>v16.0.0</title>
          <link rel="alternate" href="https://github.com/vercel/next.js/releases/tag/v16.0.0"/>
          <content type="html">${escapedHtml}</content>
        </entry>
      </feed>`;

    const parsed = parseFeedDocument(xml, "https://github.com/vercel/next.js/releases.atom");
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].url).toBe("https://github.com/vercel/next.js/releases/tag/v16.0.0");
  });

  it("still rejects a DOCTYPE entity expansion bomb", () => {
    const entities = Array.from({ length: 1100 }, (_, i) => `&e${i % 10};`).join("");
    const xml = `<?xml version="1.0"?>
      <!DOCTYPE rss [
        ${Array.from({ length: 10 }, (_, i) => `<!ENTITY e${i} "x">`).join("\n")}
      ]>
      <rss version="2.0"><channel><title>${entities}</title></channel></rss>`;

    expect(() => parseFeedDocument(xml, "https://evil.example.com/feed.xml")).toThrow(
      /Entity expansion count limit exceeded/
    );
  });
});
