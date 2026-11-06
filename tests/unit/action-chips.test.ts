import { describe, it, expect } from "vitest";
import {
  formatActionChip,
  parseMessageContentAndActions,
  scanEntityMentions,
  appendEntityActionChips,
  AUTHORITATIVE_PROJECTS,
  AUTHORITATIVE_CONTACTS,
  ChatActionChip,
} from "@/lib/ai/action-chips";

describe("lib/ai/action-chips — Authoritative Catalogs", () => {
  it("defines exactly the 4 required projects with correct identifiers and triggers", () => {
    expect(AUTHORITATIVE_PROJECTS).toHaveLength(4);
    const projectIds = AUTHORITATIVE_PROJECTS.map((p) => p.id);
    expect(projectIds).toContain("kamala-commerce-tour");
    expect(projectIds).toContain("zelene-spa-booking");
    expect(projectIds).toContain("smartbit-saas-platform");
    expect(projectIds).toContain("javis-3d-tile-simulation");

    for (const project of AUTHORITATIVE_PROJECTS) {
      expect(project.title.length).toBeGreaterThan(0);
      expect(project.defaultLabel.length).toBeGreaterThan(0);
      expect(project.triggers.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("defines exactly the 4 contact channels", () => {
    expect(AUTHORITATIVE_CONTACTS).toHaveLength(4);
    const contactIds = AUTHORITATIVE_CONTACTS.map((c) => c.id);
    expect(contactIds).toContain("zalo");
    expect(contactIds).toContain("github");
    expect(contactIds).toContain("cv");
    expect(contactIds).toContain("contact");
  });
});

describe("lib/ai/action-chips — formatActionChip", () => {
  it("formats standard action chip syntax [[action:type|id|label]]", () => {
    expect(formatActionChip("project", "kamala-commerce-tour", "Khám phá Kamala")).toBe(
      "[[action:project|kamala-commerce-tour|Khám phá Kamala]]"
    );
    expect(formatActionChip("contact", "cv", "Tải CV (PDF)")).toBe(
      "[[action:contact|cv|Tải CV (PDF)]]"
    );
    expect(formatActionChip("link", "https://example.com", "Mở liên kết")).toBe(
      "[[action:link|https://example.com|Mở liên kết]]"
    );
  });
});

describe("lib/ai/action-chips — parseMessageContentAndActions", () => {
  it("extracts action tags and preserves clean text without tags", () => {
    const raw = "Cris phát triển Kamala [[action:project|kamala-commerce-tour|Khám phá Kamala]] cho khách hàng.";
    const result = parseMessageContentAndActions(raw);
    expect(result.cleanContent).toBe("Cris phát triển Kamala  cho khách hàng.");
    expect(result.actionChips).toHaveLength(1);
    expect(result.actionChips[0]).toEqual({
      type: "project",
      id: "kamala-commerce-tour",
      label: "Khám phá Kamala",
    });
  });

  it("extracts multiple chips across multiple categories in one message", () => {
    const raw =
      "Xem dự án [[action:project|zelene-spa-booking|Zelene Spa]] và liên kết [[action:link|https://example.com|Website]]. Hoặc liên hệ [[action:contact|zalo|Nhắn Zalo]].";
    const result = parseMessageContentAndActions(raw);
    expect(result.actionChips).toHaveLength(3);
    expect(result.actionChips[0].type).toBe("project");
    expect(result.actionChips[0].id).toBe("zelene-spa-booking");
    expect(result.actionChips[1].type).toBe("link");
    expect(result.actionChips[1].id).toBe("https://example.com");
    expect(result.actionChips[2].type).toBe("contact");
    expect(result.actionChips[2].id).toBe("zalo");
  });

  it("strips unsupported [[action:roadmap|layer-01|X]] tags from cleanContent without generating chips", () => {
    const raw = "Tham khảo lộ trình [[action:roadmap|layer-01|Tầng 01: Knowledge Base]] tại website.";
    const result = parseMessageContentAndActions(raw);
    expect(result.cleanContent).toBe("Tham khảo lộ trình  tại website.");
    expect(result.actionChips).toEqual([]);
  });

  it("returns clean content with empty chip array when text has no tags", () => {
    const plain = "Cris có hơn 5 năm kinh nghiệm về Next.js và React.";
    const result = parseMessageContentAndActions(plain);
    expect(result.cleanContent).toBe(plain);
    expect(result.actionChips).toEqual([]);
  });

  it("safely ignores malformed action tags without throwing", () => {
    const malformed = "Văn bản chứa [[action:malformed và không đóng ngoặc";
    const result = parseMessageContentAndActions(malformed);
    expect(result.cleanContent).toBe(malformed);
    expect(result.actionChips).toEqual([]);
  });
});

describe("lib/ai/action-chips — scanEntityMentions & appendEntityActionChips", () => {
  it("scans and recognizes un-tagged project and contact mentions", () => {
    const text = "Cris phát triển dự án Kamala và giải pháp Zelene Spa kết nối qua Zalo.";
    const chips = scanEntityMentions(text);

    const ids = chips.map((c) => c.id);
    expect(ids).toContain("kamala-commerce-tour");
    expect(ids).toContain("zelene-spa-booking");
    expect(ids).toContain("zalo");
  });

  it("does not duplicate chips if already tagged or present in existingChips", () => {
    const text = "Cris phát triển Kamala và Zelene.";
    const existing: ChatActionChip[] = [
      {
        type: "project",
        id: "kamala-commerce-tour",
        label: "Khám phá Kamala",
      },
    ];

    const chips = scanEntityMentions(text, existing);
    const ids = chips.map((c) => c.id);
    expect(ids).not.toContain("kamala-commerce-tour");
    expect(ids).toContain("zelene-spa-booking");
  });

  it("appends action chips to text when entities are mentioned without tags", () => {
    const raw = "Cris đã phát triển Smartbit SaaS và JAVIS 3D simulation.";
    const enriched = appendEntityActionChips(raw);

    expect(enriched).toContain("[[action:project|smartbit-saas-platform|Xem Smartbit SaaS]]");
    expect(enriched).toContain("[[action:project|javis-3d-tile-simulation|Xem JAVIS 3D]]");
  });

  it("returns original text unmodified when no un-tagged entities are mentioned", () => {
    const raw = "Cris tối ưu hóa hiệu năng render Next.js và Web Vitals.";
    expect(appendEntityActionChips(raw)).toBe(raw);
  });
});
