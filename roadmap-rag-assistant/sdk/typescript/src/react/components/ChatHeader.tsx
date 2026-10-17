import React from "react";
import { CheckIcon, CloseIcon, CopyIcon, MoreVerticalIcon, NewChatIcon, SparklesIcon } from "../icons";

export interface ChatHeaderProps {
  canWrite: boolean;
  clearMessages: () => void;
  copiedConvId: boolean;
  handleCopyConversationId: (e: React.MouseEvent) => void;
  isOptionsOpen: boolean;
  optionsRef: React.RefObject<HTMLDivElement | null>;
  setIsOpen: (open: boolean) => void;
  setIsOptionsOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  status: string;
  title: string;
}

export function ChatHeader({ canWrite, clearMessages, copiedConvId, handleCopyConversationId, isOptionsOpen, optionsRef, setIsOpen, setIsOptionsOpen, status, title }: ChatHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#E6E4DF] bg-[#FFFFFF] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F4F3F0] border border-[#E6E4DF] text-[#6B6862]">
          <SparklesIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-tight text-[#1F1E1C]">
            {title}
          </div>
          <div className="truncate text-xs leading-tight text-[#6B6862]">
            {status}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <div className="relative" ref={optionsRef}>
          <button
            type="button"
            onClick={() => setIsOptionsOpen((prev) => !prev)}
            title="Tùy chọn"
            aria-label="Tùy chọn"
            aria-expanded={isOptionsOpen}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6B6862] transition-colors hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer"
          >
            <MoreVerticalIcon className="h-4 w-4" />
          </button>

          {isOptionsOpen && (
            <div className="absolute right-0 top-full mt-1.5 z-40 min-w-[220px] whitespace-nowrap rounded-xl border border-[#E6E4DF] bg-[#FFFFFF] p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.08)] animate-in fade-in zoom-in-95 duration-150">
              <button
                type="button"
                onClick={() => {
                  setIsOptionsOpen(false);
                  clearMessages();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-[#1F1E1C] transition-colors cursor-pointer hover:bg-[#F4F3F0]"
              >
                <NewChatIcon className="h-4 w-4 text-[#6B6862] shrink-0" />
                <span>Cuộc trò chuyện mới</span>
              </button>
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
                      <CopyIcon className="h-4 w-4 text-[#6B6862] shrink-0" />
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
          onClick={() => setIsOpen(false)}
          title="Thu gọn"
          aria-label="Thu gọn"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6B6862] transition-colors hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
