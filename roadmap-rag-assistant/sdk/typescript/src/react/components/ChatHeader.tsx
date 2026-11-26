import React from "react";
import {
  CheckIcon,
  CloseIcon,
  ContextIcon,
  CopyIcon,
  FloatingModeIcon,
  HistoryIcon,
  MemoryIcon,
  MoreHorizontalIcon,
  NewChatIcon,
  SidebarModeIcon,
} from "../icons";
import type { ChatbotViewMode } from "../types";
import { AbotMascot, type MascotState } from "./AbotMascot";

const VIEW_MODE_OPTIONS: {
  value: ChatbotViewMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "floating", label: "Floating", icon: FloatingModeIcon },
  { value: "sidebar", label: "Sidebar", icon: SidebarModeIcon },
];

export interface ChatHeaderProps {
  activityState?: MascotState;
  canNewChat: boolean;
  canWrite: boolean;
  viewMode: ChatbotViewMode;
  onViewModeChange: (mode: ChatbotViewMode) => void;
  clearMessages: () => void;
  copiedConvId: boolean;
  hideBrand?: boolean;
  mascotRef?: React.RefObject<HTMLDivElement | null>;
  textRef?: React.RefObject<HTMLDivElement | null>;
  openContext: () => void;
  openMemory?: () => void;
  openHistory?: () => void;
  pendingMemoryCount?: number;
  handleCopyConversationId: (e: React.MouseEvent) => void;
  isOptionsOpen: boolean;
  isSwitchMenuOpen: boolean;
  optionsRef: React.RefObject<HTMLDivElement | null>;
  switchMenuRef: React.RefObject<HTMLDivElement | null>;
  setIsOpen: (open: boolean) => void;
  setIsOptionsOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setIsSwitchMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  status: string;
  title: string;
}

export function ChatHeader({
  activityState = "idle",
  canNewChat,
  canWrite,
  viewMode,
  onViewModeChange,
  clearMessages,
  copiedConvId,
  hideBrand = false,
  mascotRef,
  textRef,
  openContext,
  openMemory,
  openHistory,
  pendingMemoryCount = 0,
  handleCopyConversationId,
  isOptionsOpen,
  isSwitchMenuOpen,
  optionsRef,
  switchMenuRef,
  setIsOpen,
  setIsOptionsOpen,
  setIsSwitchMenuOpen,
  status,
  title,
}: ChatHeaderProps) {
  const closeMenus = () => {
    setIsOptionsOpen(false);
    setIsSwitchMenuOpen(false);
  };

  return (
    // Like Claude: no divider; messages fade out under the header instead of meeting a line.
    <div
      className={`relative z-20 flex shrink-0 items-center justify-between gap-2 px-3 py-1.5 pt-[max(0.5rem,env(safe-area-inset-top))] md:py-2 ${
        hideBrand ? "bg-transparent" : "bg-[#FFFFFF]"
      }`}
    >
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-full z-0 h-4 bg-gradient-to-b from-[#FFFFFF] to-transparent transition-opacity ${
          hideBrand ? "opacity-0 duration-0" : "opacity-100 delay-300 duration-200"
        }`}
      />

      <div
        aria-hidden={hideBrand || undefined}
        className={`relative z-10 min-w-0 flex items-center gap-2 ${
          hideBrand ? "pointer-events-none opacity-[0.001]" : "opacity-100"
        }`}
      >
        <div
          ref={mascotRef}
          className="shrink-0 flex items-center justify-center will-change-transform"
        >
          <AbotMascot size={28} state={activityState} enablePoke />
        </div>
        <div ref={textRef} className="min-w-0 text-left will-change-transform">
          <div className="truncate text-[15px] font-semibold leading-[18px] tracking-tight text-[#1F1E1C]">
            {title}
          </div>
          <div className="truncate text-xs leading-4 text-[#5E5B55]">{status}</div>
        </div>
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-0.5">
        {canWrite && openHistory && (
          <button
            type="button"
            onClick={() => {
              closeMenus();
              openHistory();
            }}
            title="Lịch sử chat"
            aria-label="Lịch sử chat"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#4D4B46] transition-colors hover:bg-[#F4F3F0] hover:text-[#1F1E1C] active:scale-95 cursor-pointer"
          >
            <HistoryIcon className="h-[18px] w-[18px]" />
          </button>
        )}

        <button
          type="button"
          disabled={!canNewChat}
          onClick={() => {
            closeMenus();
            clearMessages();
          }}
          title="Cuộc trò chuyện mới"
          aria-label="Cuộc trò chuyện mới"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#4D4B46] transition-colors hover:bg-[#F4F3F0] hover:text-[#1F1E1C] active:scale-95 cursor-pointer disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[#4D4B46] disabled:active:scale-100"
        >
          <NewChatIcon className="h-[18px] w-[18px]" />
        </button>

        <div className="relative hidden md:block" ref={switchMenuRef}>
          <button
            type="button"
            onClick={() => {
              setIsOptionsOpen(false);
              setIsSwitchMenuOpen((prev) => !prev);
            }}
            title="Switch to"
            aria-label="Switch to"
            aria-haspopup="menu"
            aria-expanded={isSwitchMenuOpen}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors active:scale-95 cursor-pointer ${
              isSwitchMenuOpen
                ? "bg-[#F4F3F0] text-[#1F1E1C]"
                : "text-[#4D4B46] hover:bg-[#F4F3F0] hover:text-[#1F1E1C]"
            }`}
          >
            {viewMode === "sidebar" ? (
              <SidebarModeIcon className="h-[18px] w-[18px]" />
            ) : (
              <FloatingModeIcon className="h-[18px] w-[18px]" />
            )}
          </button>

          {isSwitchMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 z-40 min-w-[180px] whitespace-nowrap rounded-xl border border-[#E6E4DF] bg-[#FFFFFF] p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.08)] animate-in fade-in zoom-in-95 duration-150">
              <div className="px-2.5 py-1 text-[11px] font-medium text-[#5E5B55]">
                Switch to
              </div>
              {VIEW_MODE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = viewMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => {
                      setIsSwitchMenuOpen(false);
                      onViewModeChange(opt.value);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      isActive
                        ? "bg-[#F4F3F0] text-[#1F1E1C]"
                        : "text-[#1F1E1C] hover:bg-[#F4F3F0]"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-[#5E5B55] shrink-0" />
                      <span>{opt.label}</span>
                    </span>
                    {isActive && (
                      <CheckIcon className="h-3.5 w-3.5 text-[#C2410C] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="relative" ref={optionsRef}>
          <button
            type="button"
            onClick={() => {
              setIsSwitchMenuOpen(false);
              setIsOptionsOpen((prev) => !prev);
            }}
            title="Tùy chọn"
            aria-label="Tùy chọn"
            aria-haspopup="menu"
            aria-expanded={isOptionsOpen}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors active:scale-95 cursor-pointer ${
              isOptionsOpen
                ? "bg-[#F4F3F0] text-[#1F1E1C]"
                : "text-[#4D4B46] hover:bg-[#F4F3F0] hover:text-[#1F1E1C]"
            }`}
          >
            <MoreHorizontalIcon className="h-[18px] w-[18px]" />
          </button>

          {isOptionsOpen && (
            <div className="absolute right-0 top-full mt-1.5 z-40 min-w-[200px] whitespace-nowrap rounded-xl border border-[#E6E4DF] bg-[#FFFFFF] p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.08)] animate-in fade-in zoom-in-95 duration-150">
              <button
                type="button"
                onClick={() => {
                  setIsOptionsOpen(false);
                  openContext();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-[#1F1E1C] transition-colors cursor-pointer hover:bg-[#F4F3F0]"
              >
                <ContextIcon className="h-4 w-4 text-[#5E5B55] shrink-0" />
                <span>Context</span>
              </button>
              {canWrite && openMemory && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOptionsOpen(false);
                    openMemory();
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-[#1F1E1C] transition-colors cursor-pointer hover:bg-[#F4F3F0]"
                >
                  <span className="flex items-center gap-2">
                    <MemoryIcon className="h-4 w-4 text-[#5E5B55] shrink-0" />
                    <span>Bộ nhớ</span>
                  </span>
                  {pendingMemoryCount > 0 && (
                    <span className="rounded-full bg-[#C2410C]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#C2410C]">
                      {pendingMemoryCount}
                    </span>
                  )}
                </button>
              )}
              {canWrite && (
                <button
                  type="button"
                  onClick={handleCopyConversationId}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
                    copiedConvId
                      ? "bg-[#3F7D58]/10 text-[#3F7D58]"
                      : "text-[#1F1E1C] hover:bg-[#F4F3F0]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {copiedConvId ? (
                      <CheckIcon className="h-4 w-4 text-[#3F7D58] shrink-0" />
                    ) : (
                      <CopyIcon className="h-4 w-4 text-[#5E5B55] shrink-0" />
                    )}
                    <span>Mã hội thoại</span>
                  </span>
                  {copiedConvId && (
                    <span className="rounded-full bg-[#3F7D58]/15 px-2 py-0.5 text-[11px] font-semibold text-[#3F7D58]">
                      Đã copy
                    </span>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            closeMenus();
            setIsOpen(false);
          }}
          title="Thu gọn"
          aria-label="Đóng Abot"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#4D4B46] transition-colors hover:bg-[#F4F3F0] hover:text-[#1F1E1C] active:scale-95 cursor-pointer"
        >
          <CloseIcon className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
}
