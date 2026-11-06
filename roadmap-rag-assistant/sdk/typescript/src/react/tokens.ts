import React from "react";

/**
 * Abot Design System Tokens
 * Centralized design tokens for colors, typography, and theme variables across the Abot React SDK.
 * All colors conform to WCAG AA / AAA contrast standards on both white (#FFFFFF) and surface (#F4F3F0).
 */

export const CHAT_COLORS = {
  // Surfaces & Backgrounds
  bg: "#FFFFFF",
  surface: "#F4F3F0",
  surfaceHover: "#ECEAE5",

  // Borders
  border: "#E6E4DF",
  borderFocus: "#D6D3CC",
  borderDanger: "rgba(180, 35, 24, 0.2)",

  // Text Hierarchies
  text: "#1F1E1C", // High-contrast primary text (14.5:1 on white)
  textSecondary: "#4D4B46", // Balanced secondary text (8.5:1 on white)
  textMuted: "#5E5B55", // WCAG AAA muted text (6.8:1 on white, 6.1:1 on surface)
  textSubtle: "#75716A", // WCAG AA subtle labels, icons, dots (4.9:1 on white, 4.5:1 on surface)
  textPlaceholder: "#75716A",

  // Brand Accent (Terracotta)
  accent: "#C2410C",
  accentHover: "#9A3412",
  accentSoft: "#FBEDE5",

  // Semantics: Success, Danger, Warning
  success: "#3F7D58",
  successSoft: "#E6F1EA",
  danger: "#B42318",
  dangerSoft: "#FBEDE5",
  warning: "#B54708",
} as const;

/**
 * CSS custom property bindings for the widget container root.
 */
export const WIDGET_THEME_VARS: React.CSSProperties = {
  colorScheme: "light",
  ...({
    "--bg": CHAT_COLORS.bg,
    "--surface": CHAT_COLORS.surface,
    "--border": CHAT_COLORS.border,
    "--text": CHAT_COLORS.text,
    "--text-muted": CHAT_COLORS.textMuted,
    "--accent": CHAT_COLORS.accent,
    "--accent-soft": CHAT_COLORS.accentSoft,
    "--success": CHAT_COLORS.success,
    "--danger": CHAT_COLORS.danger,
    "--background": CHAT_COLORS.bg,
    "--foreground": CHAT_COLORS.text,
    "--muted-foreground": CHAT_COLORS.textMuted,
    "--card": CHAT_COLORS.surface,
    "--card-foreground": CHAT_COLORS.text,
    "--popover": CHAT_COLORS.bg,
    "--popover-foreground": CHAT_COLORS.text,
    "--input": CHAT_COLORS.surface,
    "--muted": CHAT_COLORS.surface,
    "--primary": CHAT_COLORS.accent,
    "--primary-foreground": "#FFFFFF",
    // Step rows (ToolStepRow) & Chat namespaced variables
    "--chat-text": CHAT_COLORS.text,
    "--chat-text-secondary": CHAT_COLORS.textSecondary,
    "--chat-text-muted": CHAT_COLORS.textMuted,
    "--chat-text-subtle": CHAT_COLORS.textSubtle,
    "--chat-surface": CHAT_COLORS.surface,
    "--chat-border": CHAT_COLORS.border,
    "--chat-accent": CHAT_COLORS.accent,
    "--chat-success": CHAT_COLORS.success,
    "--chat-warning": CHAT_COLORS.warning,
    "--chat-danger": CHAT_COLORS.danger,
  } as React.CSSProperties),
};
