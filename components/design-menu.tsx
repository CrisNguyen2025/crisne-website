"use client";

import { Circle, CircleCheck } from "lucide-react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { setDesign, useDesign, type Design } from "@/hooks/use-design";

const DESIGN_OPTIONS: Array<{ value: Design; label: string }> = [
  { value: "default", label: "Theme: Default" },
  { value: "apple", label: "Theme: Apple" },
  { value: "railway", label: "Theme: Railway" },
  { value: "posthog", label: "Theme: PostHog" },
];

interface DesignMenuProps {
  triggerClassName?: string;
}

/** "⋯" options menu that switches the roadmap/news visual theme */
export function DesignMenu({ triggerClassName }: DesignMenuProps) {
  const design = useDesign();

  const items: ActionMenuItem[] = DESIGN_OPTIONS.map((option) => ({
    label: option.label,
    icon: option.value === design ? CircleCheck : Circle,
    onSelect: () => setDesign(option.value),
  }));

  return <ActionMenu items={items} label="Tùy chọn" triggerClassName={triggerClassName} />;
}
