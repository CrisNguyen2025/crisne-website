import React, { createContext, useContext } from "react";
import {
  isInternalRouteHref,
  isPlainLeftClick,
  type LinkClickLikeEvent,
} from "./links";

export type ChatNavigateHandler = (href: string) => void;

export const ChatNavigationContext = createContext<ChatNavigateHandler | undefined>(
  undefined
);

export function useChatNavigate(): ChatNavigateHandler | undefined {
  return useContext(ChatNavigationContext);
}

/**
 * Intercepts unmodified primary clicks on same-origin routes so host apps (e.g. Next.js)
 * can navigate via SPA routing without reloading the page or losing widget state.
 */
export function handleInternalLinkClick(
  event: LinkClickLikeEvent,
  href: string,
  onNavigate?: ChatNavigateHandler
): boolean {
  if (!onNavigate || !isInternalRouteHref(href) || !isPlainLeftClick(event)) {
    return false;
  }
  event.preventDefault();
  onNavigate(href);
  return true;
}

export interface ChatLinkProps {
  href: string;
  external: boolean;
  className?: string;
  onNavigateComplete?: () => void;
  children: React.ReactNode;
}

export function ChatLink({
  href,
  external,
  className,
  onNavigateComplete,
  children,
}: ChatLinkProps) {
  const onNavigate = useChatNavigate();

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!external && handleInternalLinkClick(event, href, onNavigate)) {
      onNavigateComplete?.();
    }
  };

  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      onClick={external ? undefined : handleClick}
      className={className}
    >
      {children}
    </a>
  );
}
