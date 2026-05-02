"use client";

import { ChevronDown } from "lucide-react";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type AccordionType = "single";

type AccordionContextValue = {
  type: AccordionType;
  value?: string;
  setValue: (next?: string) => void;
  collapsible: boolean;
};

const AccordionContext = createContext<AccordionContextValue | null>(null);

type AccordionProps = {
  children: ReactNode;
  type?: AccordionType;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value?: string) => void;
  collapsible?: boolean;
  className?: string;
};

export function Accordion({
  children,
  type = "single",
  value,
  defaultValue,
  onValueChange,
  collapsible = false,
  className,
}: AccordionProps) {
  const [internalValue, setInternalValue] = useState<string | undefined>(defaultValue);
  const currentValue = value ?? internalValue;

  const context = useMemo<AccordionContextValue>(
    () => ({
      type,
      value: currentValue,
      collapsible,
      setValue: (next) => {
        if (onValueChange) {
          onValueChange(next);
          return;
        }
        setInternalValue(next);
      },
    }),
    [type, currentValue, collapsible, onValueChange],
  );

  return <div className={className}><AccordionContext.Provider value={context}>{children}</AccordionContext.Provider></div>;
}

type ItemContextValue = {
  value: string;
  isOpen: boolean;
  toggle: () => void;
};

const ItemContext = createContext<ItemContextValue | null>(null);

type AccordionItemProps = {
  children: ReactNode;
  value: string;
  className?: string;
};

export function AccordionItem({ children, value, className }: AccordionItemProps) {
  const root = useContext(AccordionContext);
  if (!root) throw new Error("AccordionItem must be used within Accordion");

  const isOpen = root.value === value;
  const toggle = () => {
    if (isOpen && root.collapsible) {
      root.setValue(undefined);
      return;
    }
    root.setValue(value);
  };

  return (
    <ItemContext.Provider value={{ value, isOpen, toggle }}>
      <div className={cn("overflow-hidden rounded-lg border", className)}>{children}</div>
    </ItemContext.Provider>
  );
}

type AccordionTriggerProps = {
  children: ReactNode;
  className?: string;
};

export function AccordionTrigger({ children, className }: AccordionTriggerProps) {
  const item = useContext(ItemContext);
  if (!item) throw new Error("AccordionTrigger must be used within AccordionItem");

  return (
    <button
      type="button"
      onClick={item.toggle}
      className={cn(
        "flex w-full items-center justify-between gap-2 p-3 text-left transition hover:bg-accent/60",
        className,
      )}
    >
      <span>{children}</span>
      <ChevronDown
        className={cn("h-4 w-4 shrink-0 transition-transform duration-300", item.isOpen && "rotate-180")}
      />
    </button>
  );
}

type AccordionContentProps = {
  children: ReactNode;
  className?: string;
};

export function AccordionContent({ children, className }: AccordionContentProps) {
  const item = useContext(ItemContext);
  if (!item) throw new Error("AccordionContent must be used within AccordionItem");

  if (!item.isOpen) return null;

  return (
    <div className="overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
      <div className={cn(className)}>{children}</div>
    </div>
  );
}
