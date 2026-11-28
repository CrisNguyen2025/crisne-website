"use client";

import { Circle, CircleCheck } from "lucide-react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import {
  ENABLE_DESIGN_SWITCHER,
  setDesign,
  useDesign,
  type Design,
} from "@/hooks/use-design";

const DESIGN_OPTIONS: Array<{ value: Design; label: string }> = [
  { value: "default", label: "Theme: Figma" },
  { value: "perplexity", label: "Theme: Perplexity" },
  { value: "cursor", label: "Theme: Cursor" },
  { value: "anthropic", label: "Theme: Anthropic" },
  { value: "linear", label: "Theme: Linear" },
  { value: "letters", label: "Theme: Letters" },
  { value: "stripe", label: "Theme: Stripe" },
  { value: "discord", label: "Theme: Discord" },
  { value: "apple", label: "Theme: Apple (Mặc định)" },
  { value: "railway", label: "Theme: Railway" },
  { value: "posthog", label: "Theme: PostHog" },
];

interface DesignMenuProps {
  triggerClassName?: string;
}

/** "⋯" options menu that switches the roadmap/news visual theme */
export function DesignMenu({ triggerClassName }: DesignMenuProps) {
  const design = useDesign();

  if (!ENABLE_DESIGN_SWITCHER) {
    return null;
  }

  const items: ActionMenuItem[] = DESIGN_OPTIONS.map((option) => ({
    label: option.label,
    icon: option.value === design ? CircleCheck : Circle,
    onSelect: () => setDesign(option.value),
  }));

  return <ActionMenu items={items} label="Tùy chọn" triggerClassName={triggerClassName} />;
}
