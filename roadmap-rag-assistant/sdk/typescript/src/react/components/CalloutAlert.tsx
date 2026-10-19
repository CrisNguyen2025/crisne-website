"use client";

import React from "react";

export type CalloutType = "note" | "tip" | "important" | "warning" | "caution";

export interface CalloutAlertProps {
  type: CalloutType;
  title?: string;
  lines: string[];
  renderInline: (text: string) => React.ReactNode[];
  trailing?: React.ReactNode;
}

function NoteIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function TipIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2v1" />
      <path d="M12 21v1" />
      <path d="M4.22 4.22l.71.71" />
      <path d="M19.07 19.07l.71.71" />
      <path d="M1 12h1" />
      <path d="M22 12h1" />
      <path d="M4.22 19.78l.71-.71" />
      <path d="M19.07 4.93l.71-.71" />
      <circle cx="12" cy="12" r="5" />
    </svg>
  );
}

function ImportantIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2L9.5 8.5 2 9.27l5.5 4.87L6 21l6-3.5 6 3.5-1.5-6.86L22 9.27l-7.5-.77z" />
    </svg>
  );
}

function WarningIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function CautionIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

interface AlertStyleConfig {
  defaultTitle: string;
  containerClass: string;
  iconClass: string;
  titleClass: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const ALERT_CONFIGS: Record<CalloutType, AlertStyleConfig> = {
  note: {
    defaultTitle: "Note",
    containerClass:
      "border-sky-500/30 bg-sky-500/10 text-sky-950 dark:text-sky-200 border-l-4 border-l-sky-500",
    iconClass: "text-sky-600 dark:text-sky-400",
    titleClass: "text-sky-700 dark:text-sky-300",
    Icon: NoteIcon,
  },
  tip: {
    defaultTitle: "Tip",
    containerClass:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 border-l-4 border-l-emerald-500",
    iconClass: "text-emerald-600 dark:text-emerald-400",
    titleClass: "text-emerald-700 dark:text-emerald-300",
    Icon: TipIcon,
  },
  important: {
    defaultTitle: "Important",
    containerClass:
      "border-purple-500/30 bg-purple-500/10 text-purple-950 dark:text-purple-200 border-l-4 border-l-purple-500",
    iconClass: "text-purple-600 dark:text-purple-400",
    titleClass: "text-purple-700 dark:text-purple-300",
    Icon: ImportantIcon,
  },
  warning: {
    defaultTitle: "Warning",
    containerClass:
      "border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-200 border-l-4 border-l-amber-500",
    iconClass: "text-amber-600 dark:text-amber-400",
    titleClass: "text-amber-700 dark:text-amber-300",
    Icon: WarningIcon,
  },
  caution: {
    defaultTitle: "Caution",
    containerClass:
      "border-rose-500/30 bg-rose-500/10 text-rose-950 dark:text-rose-200 border-l-4 border-l-rose-500",
    iconClass: "text-rose-600 dark:text-rose-400",
    titleClass: "text-rose-700 dark:text-rose-300",
    Icon: CautionIcon,
  },
};

export function CalloutAlert({
  type,
  title,
  lines,
  renderInline,
  trailing,
}: CalloutAlertProps) {
  const config = ALERT_CONFIGS[type] || ALERT_CONFIGS.note;
  const displayTitle = title?.trim() || config.defaultTitle;
  const IconComponent = config.Icon;

  return (
    <div
      className={`my-3 rounded-lg border p-3.5 text-xs leading-relaxed shadow-xs ${config.containerClass}`}
      role="alert"
    >
      <div className="flex items-center gap-2 mb-1.5 font-medium">
        <IconComponent className={`h-4 w-4 shrink-0 ${config.iconClass}`} />
        <span className={`font-semibold tracking-wide ${config.titleClass}`}>
          {displayTitle}
        </span>
      </div>
      <div className="space-y-1 text-foreground/90 pl-6">
        {lines.map((line, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <br />}
            {renderInline(line)}
          </React.Fragment>
        ))}
        {trailing}
      </div>
    </div>
  );
}
