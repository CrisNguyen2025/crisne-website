export type ActionChipType = "project" | "roadmap" | "contact" | "link";

export interface ChatActionChip {
  type: ActionChipType;
  id: string;
  label: string;
  data?: Record<string, unknown>;
}

export interface ParsedMessageResult {
  cleanContent: string;
  actionChips: ChatActionChip[];
}

export interface AuthoritativeProject {
  id: "kamala-commerce-tour" | "zelene-spa-booking" | "smartbit-saas-platform" | "javis-3d-tile-simulation";
  title: string;
  defaultLabel: string;
  url?: string;
  triggers: string[];
}

export interface AuthoritativeLayer {
  id: "layer-01" | "layer-02" | "layer-03" | "layer-04" | "layer-05";
  code: string;
  title: string;
  defaultLabel: string;
  triggers: string[];
}

export interface AuthoritativeContact {
  id: "zalo" | "github" | "cv" | "contact";
  label: string;
  defaultLabel: string;
  path?: string;
  href?: string;
  triggers: string[];
}

export const AUTHORITATIVE_PROJECTS: AuthoritativeProject[] = [
  {
    id: "kamala-commerce-tour",
    title: "Kamala Jewelry & Tour Platform",
    defaultLabel: "Khám phá Kamala",
    url: "https://kamala.vn/",
    triggers: ["kamala", "kamala jewelry", "tour kamala", "kamala.vn"],
  },
  {
    id: "zelene-spa-booking",
    title: "Zelene Head Spa Booking Platform",
    defaultLabel: "Xem Zelene Spa",
    url: "https://zelenespa.com/",
    triggers: ["zelene", "zelene spa", "zelene head spa", "head spa", "zelenespa.com"],
  },
  {
    id: "smartbit-saas-platform",
    title: "Smartbit Multi-Tenant SaaS Platform",
    defaultLabel: "Xem Smartbit SaaS",
    triggers: ["smartbit", "smartbit technology", "smartbit saas", "multi-tenant saas"],
  },
  {
    id: "javis-3d-tile-simulation",
    title: "JAVIS 3D Tile Pattern Simulation",
    defaultLabel: "Xem JAVIS 3D",
    triggers: ["javis", "javis 3d", "tile pattern simulation"],
  },
];

export const AUTHORITATIVE_LAYERS: AuthoritativeLayer[] = [
  {
    id: "layer-01",
    code: "01-DB",
    title: "Tầng Dữ liệu & Tri thức",
    defaultLabel: "Tầng 01: Knowledge Base",
    triggers: ["layer-01", "layer 01", "layer 1", "tầng 01", "tầng 1", "knowledge base"],
  },
  {
    id: "layer-02",
    code: "02-LLM",
    title: "Tầng LLM Application Layer",
    defaultLabel: "Tầng 02: LLM Application",
    triggers: ["layer-02", "layer 02", "layer 2", "tầng 02", "tầng 2", "llm application"],
  },
  {
    id: "layer-03",
    code: "03-RAG",
    title: "Tầng RAG + Agent Layer",
    defaultLabel: "Tầng 03: RAG + Agent",
    triggers: ["layer-03", "layer 03", "layer 3", "tầng 03", "tầng 3", "rag + agent", "rag agent"],
  },
  {
    id: "layer-04",
    code: "04-OPS",
    title: "Tầng Ops & Đánh giá (LLMOps)",
    defaultLabel: "Tầng 04: LLMOps",
    triggers: ["layer-04", "layer 04", "layer 4", "tầng 04", "tầng 4", "llmops"],
  },
  {
    id: "layer-05",
    code: "05-PROD",
    title: "Tầng Sản phẩm Production",
    defaultLabel: "Tầng 05: Production Deployment",
    triggers: ["layer-05", "layer 05", "layer 5", "tầng 05", "tầng 5", "production deployment"],
  },
];

export const AUTHORITATIVE_CONTACTS: AuthoritativeContact[] = [
  {
    id: "zalo",
    label: "Zalo",
    defaultLabel: "Kết nối Zalo",
    href: "https://zalo.me",
    triggers: ["zalo", "nhắn zalo", "kết nối zalo"],
  },
  {
    id: "github",
    label: "GitHub",
    defaultLabel: "GitHub @crisne",
    href: "https://github.com/crisne",
    triggers: ["github", "github @crisne"],
  },
  {
    id: "cv",
    label: "Tải CV",
    defaultLabel: "Tải CV Cris Nguyen",
    path: "/cris-nguyen-cv.pdf",
    triggers: ["tải cv", "xem cv", "download cv", "cv cris", "resume cris", "tải resume"],
  },
  {
    id: "contact",
    label: "Liên hệ",
    defaultLabel: "Mục Liên hệ",
    href: "#contact",
    triggers: ["liên hệ trực tiếp", "mục liên hệ", "form liên hệ", "#contact"],
  },
];

export const ACTION_TAG_REGEX = /\[\[action:(project|roadmap|contact|link)\|([^|]+)\|([^\]]+)\]\]/g;

export function formatActionChip(type: ActionChipType, id: string, label: string): string {
  return `[[action:${type}|${id}|${label}]]`;
}

export function parseMessageContentAndActions(
  rawText: string,
  options?: { autoScan?: boolean }
): ParsedMessageResult {
  const chips: ChatActionChip[] = [];
  const cleanContent = rawText.replace(
    /\[\[action:(project|roadmap|contact|link)\|([^|]+)\|([^\]]+)\]\]/g,
    (_, type, id, label) => {
      chips.push({
        type: type as ActionChipType,
        id,
        label,
      });
      return "";
    }
  );

  if (options?.autoScan) {
    const extraChips = scanEntityMentions(cleanContent, chips);
    chips.push(...extraChips);
  }

  return { cleanContent, actionChips: chips };
}

export function scanEntityMentions(text: string, existingChips: ChatActionChip[] = []): ChatActionChip[] {
  const lowerText = text.toLowerCase();
  const detectedChips: ChatActionChip[] = [];
  const existingIds = new Set(existingChips.map((c) => c.id));

  for (const project of AUTHORITATIVE_PROJECTS) {
    if (!existingIds.has(project.id)) {
      const matched = project.triggers.some((trigger) => lowerText.includes(trigger));
      if (matched) {
        detectedChips.push({
          type: "project",
          id: project.id,
          label: project.defaultLabel,
        });
        existingIds.add(project.id);
      }
    }
  }

  for (const layer of AUTHORITATIVE_LAYERS) {
    if (!existingIds.has(layer.id)) {
      const matched = layer.triggers.some((trigger) => lowerText.includes(trigger));
      if (matched) {
        detectedChips.push({
          type: "roadmap",
          id: layer.id,
          label: layer.defaultLabel,
        });
        existingIds.add(layer.id);
      }
    }
  }

  for (const contact of AUTHORITATIVE_CONTACTS) {
    if (!existingIds.has(contact.id)) {
      const matched = contact.triggers.some((trigger) => lowerText.includes(trigger));
      if (matched) {
        detectedChips.push({
          type: "contact",
          id: contact.id,
          label: contact.defaultLabel,
        });
        existingIds.add(contact.id);
      }
    }
  }

  return detectedChips;
}

export function appendEntityActionChips(rawText: string): string {
  const { cleanContent, actionChips } = parseMessageContentAndActions(rawText);
  const extraChips = scanEntityMentions(cleanContent, actionChips);

  if (extraChips.length === 0) {
    return rawText;
  }

  const tags = extraChips.map((chip) => formatActionChip(chip.type, chip.id, chip.label)).join(" ");
  return `${rawText.trimEnd()} ${tags}`.trim();
}
