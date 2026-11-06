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
    // Like Claude: no divider; messages fade out under the header instead of meeting a line.
    <div className="relative z-20 grid shrink-0 grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2 bg-[#FFFFFF] px-2 py-1 pt-[max(0.25rem,env(safe-area-inset-top))] after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-gradient-to-b after:from-[#FFFFFF] after:to-transparent">
      {/* No close button: "Thu gọn" lives in the ⋮ menu. The empty cell keeps the title centred. */}
      <span aria-hidden="true" />

      <div className="min-w-0 text-center">
        <div className="flex items-center justify-center gap-1.5 truncate text-[15px] font-semibold leading-[18px] tracking-tight text-[#1F1E1C]">
          <SparklesIcon className="h-3.5 w-3.5 shrink-0 text-[#C2410C]" />
          <span className="truncate">{title}</span>
        </div>
        <div className="truncate text-xs leading-4 text-[#5E5B55]">{status}</div>
      </div>

      <div className="flex shrink-0 items-center justify-end">
        <div className="relative" ref={optionsRef}>
          <button
            type="button"
            onClick={() => setIsOptionsOpen((prev) => !prev)}
            title="Tùy chọn"
            aria-label="Tùy chọn"
            aria-expanded={isOptionsOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#4D4B46] transition-colors hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer"
          >
            <MoreVerticalIcon className="h-[18px] w-[18px]" />
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
                <NewChatIcon className="h-4 w-4 text-[#5E5B55] shrink-0" />
                <span>Cuộc trò chuyện mới</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOptionsOpen(false);
                  setIsOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-[#1F1E1C] transition-colors cursor-pointer hover:bg-[#F4F3F0]"
              >
                <CloseIcon className="h-4 w-4 text-[#5E5B55] shrink-0" />
                <span>Thu gọn</span>
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
      </div>
    </div>
  );
}
