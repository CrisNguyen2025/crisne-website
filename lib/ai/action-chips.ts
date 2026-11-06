export type ActionChipType = "project" | "contact" | "link";

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

export const ACTION_TAG_REGEX = /\[\[action:([a-z]+)\|([^|]+)\|([^\]]+)\]\]/g;

export function formatActionChip(type: ActionChipType, id: string, label: string): string {
  return `[[action:${type}|${id}|${label}]]`;
}

const VALID_ACTION_CHIP_TYPES = new Set<string>(["project", "contact", "link"]);

export function parseMessageContentAndActions(
  rawText: string,
  options?: { autoScan?: boolean }
): ParsedMessageResult {
  const chips: ChatActionChip[] = [];
  const cleanContent = rawText.replace(
    ACTION_TAG_REGEX,
    (_, type, id, label) => {
      if (VALID_ACTION_CHIP_TYPES.has(type)) {
        chips.push({
          type: type as ActionChipType,
          id,
          label,
        });
      }
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

export function chipHref(
  chip: ChatActionChip
): { href: string; external: boolean } | null {
  let href: string | undefined;
  if (chip.type === "project") {
    href =
      AUTHORITATIVE_PROJECTS.find((p) => p.id === chip.id)?.url ?? "#projects";
  } else if (chip.type === "contact") {
    const contact = AUTHORITATIVE_CONTACTS.find((c) => c.id === chip.id);
    href = contact?.href ?? contact?.path;
  } else if (/^(https?:\/\/|\/)/.test(chip.id)) {
    href = chip.id;
  }
  return href ? { href, external: /^https?:\/\//.test(href) } : null;
}
