import React, { useState } from "react";
import { BookOpenIcon, ChevronDownIcon, FileTextIcon } from "../icons";
import { ChatLink } from "../utils/navigation";
import type { PageContextRef } from "../utils/pageContextRef";

export interface CollapsibleReferenceSummaryProps {
  contextRef: PageContextRef;
}

/**
 * Compact collapsible disclosure inside the assistant's steps tree showing the active
 * page reference used for the turn ("Used 1 reference").
 */
export function CollapsibleReferenceSummary({
  contextRef,
}: CollapsibleReferenceSummaryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const subtitle =
    [contextRef.topicLabel, contextRef.section].filter(Boolean).join(" · ") ||
    (contextRef.path !== contextRef.label ? contextRef.path : undefined);

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        data-testid="reference-summary-toggle"
        className="group/row flex w-full cursor-pointer select-none items-center gap-2 rounded px-2 py-1 text-left text-[color:var(--chat-text-secondary,#4D4B46)] transition-colors hover:bg-[color:var(--chat-surface,#F4F3F0)] hover:text-[color:var(--chat-text,#1F1E1C)]"
      >
        <ChevronDownIcon
          className={`h-3 w-3 shrink-0 text-[color:var(--chat-text-subtle,#75716A)] transition-transform duration-150 group-hover/row:text-[color:var(--chat-text,#1F1E1C)] ${
            isOpen ? "rotate-0" : "-rotate-90"
          }`}
        />
        <span className="truncate">Used 1 reference</span>
      </button>

      {isOpen && (
        <div className="mt-1 ml-2 mr-1">
          <ChatLink
            href={contextRef.path}
            external={false}
            className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-[color:var(--chat-border,#E6E4DF)] bg-[color:var(--chat-bg,#FFFFFF)] px-2.5 py-1.5 text-xs leading-4 transition-colors hover:border-[#D6D3CC] hover:bg-[color:var(--chat-surface,#F4F3F0)]"
          >
            {contextRef.kind === "lesson" ? (
              <FileTextIcon className="h-3.5 w-3.5 shrink-0 text-[color:var(--chat-accent,#C2410C)]" />
            ) : (
              <BookOpenIcon className="h-3.5 w-3.5 shrink-0 text-[color:var(--chat-accent,#C2410C)]" />
            )}
            <span
              data-testid="message-context-ref"
              data-context-kind={contextRef.kind}
              data-context-path={contextRef.path}
              title={contextRef.tooltip}
              className="min-w-0 truncate font-medium text-[color:var(--chat-text,#1F1E1C)]"
            >
              {contextRef.label}
            </span>
            {subtitle && (
              <span className="min-w-0 max-w-[45%] shrink-0 truncate text-[11px] text-[color:var(--chat-text-subtle,#75716A)]">
                {subtitle}
              </span>
            )}
          </ChatLink>
        </div>
      )}
    </div>
  );
}
