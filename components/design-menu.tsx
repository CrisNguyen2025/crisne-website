"use client";

import { Circle, CircleCheck } from "lucide-react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { setDesign, useDesign, type Design } from "@/hooks/use-design";
import { setTypography, useTypography, type Typography } from "@/hooks/use-typography";

const DESIGN_OPTIONS: Array<{ value: Design; label: string }> = [
  { value: "default", label: "Theme: Figma (Mặc định)" },
  { value: "perplexity", label: "Theme: Perplexity" },
  { value: "cursor", label: "Theme: Cursor" },
  { value: "anthropic", label: "Theme: Anthropic" },
  { value: "linear", label: "Theme: Linear" },
  { value: "letters", label: "Theme: Letters" },
  { value: "stripe", label: "Theme: Stripe" },
  { value: "discord", label: "Theme: Discord" },
  { value: "apple", label: "Theme: Apple" },
  { value: "railway", label: "Theme: Railway" },
  { value: "posthog", label: "Theme: PostHog" },
];

const TYPOGRAPHY_OPTIONS: Array<{ value: Typography; label: string }> = [
  { value: "default", label: "Chữ: Mặc định" },
  { value: "docs", label: "Chữ: Docs gọn" },
];

interface DesignMenuProps {
  triggerClassName?: string;
}

/** "⋯" options menu that switches the roadmap/news color theme and, separately, its type scale */
export function DesignMenu({ triggerClassName }: DesignMenuProps) {
  const design = useDesign();
  const typography = useTypography();

  const items: ActionMenuItem[] = [
    ...DESIGN_OPTIONS.map((option) => ({
      label: option.label,
      icon: option.value === design ? CircleCheck : Circle,
      onSelect: () => setDesign(option.value),
    })),
    ...TYPOGRAPHY_OPTIONS.map((option) => ({
      label: option.label,
      icon: option.value === typography ? CircleCheck : Circle,
      onSelect: () => setTypography(option.value),
    })),
  ];

  return <ActionMenu items={items} label="Tùy chọn" triggerClassName={triggerClassName} />;
}
