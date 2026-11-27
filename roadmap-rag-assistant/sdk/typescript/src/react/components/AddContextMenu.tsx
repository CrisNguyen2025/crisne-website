import React from "react";
import type { GmailConnectorStatus } from "../../types";
import {
  CheckIcon,
  ChevronRightIcon,
  MailIcon,
  SettingsIcon,
  SlashSquareIcon,
} from "../icons";

export interface AddContextMenuProps {
  canWrite: boolean;
  gmailStatus: GmailConnectorStatus | null;
  isGmailAttached: boolean;
  onSelectActions: () => void;
  onToggleGmail: () => void;
  onOpenGmailConfig: () => void;
}

export function AddContextMenu({
  canWrite,
  gmailStatus,
  isGmailAttached,
  onSelectActions,
  onToggleGmail,
  onOpenGmailConfig,
}: AddContextMenuProps) {
  const isConnected = gmailStatus?.connected && gmailStatus.status === "connected";
  const isExpired =
    gmailStatus?.status === "expired" || gmailStatus?.status === "error";

  return (
    <div
      role="menu"
      aria-label="Thêm ngữ cảnh"
      data-testid="add-context-menu"
      onMouseDown={(e) => e.preventDefault()}
      className="absolute bottom-full left-0 z-30 mb-2 w-64 rounded-2xl border border-[#E6E4DF] bg-[#FFFFFF] p-1.5 shadow-[0_12px_32px_-6px_rgba(31,30,28,0.16),0_2px_8px_-1px_rgba(31,30,28,0.06)] animate-in fade-in slide-in-from-bottom-1 duration-150 motion-reduce:animate-none"
    >
      <div className="px-2.5 py-1.5 text-[11px] font-medium text-[#5E5B55]">
        Add Context
      </div>

      <button
        type="button"
        role="menuitem"
        onClick={onSelectActions}
        className="flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm text-[#1F1E1C] transition-colors hover:bg-[#F4F3F0] focus:bg-[#F4F3F0] focus:outline-none"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <SlashSquareIcon className="h-4 w-4 shrink-0 text-[#5E5B55]" />
          <span className="min-w-0">
            <span className="block truncate font-medium leading-tight">
              Actions
            </span>
            <span className="block truncate text-[11px] text-[#5E5B55]">
              Lệnh nhanh (Slash /)
            </span>
          </span>
        </span>
        <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-[#5E5B55]" />
      </button>

      {canWrite && (
        <div className="mt-0.5 flex items-center gap-1">
          <button
            type="button"
            role="menuitem"
            onClick={isConnected ? onToggleGmail : onOpenGmailConfig}
            className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-[#1F1E1C] transition-colors hover:bg-[#F4F3F0] focus:bg-[#F4F3F0] focus:outline-none"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <MailIcon className="h-4 w-4 shrink-0 text-[#5E5B55]" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-medium leading-tight">
                  <span>Gmail</span>
                  {isConnected && isGmailAttached && (
                    <CheckIcon className="h-3.5 w-3.5 shrink-0 text-[#3F7D58]" />
                  )}
                </span>
                {gmailStatus?.accountEmail && (
                  <span className="block truncate text-[11px] text-[#5E5B55]">
                    {gmailStatus.accountEmail}
                  </span>
                )}
              </span>
            </span>

            {isConnected ? (
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                  isGmailAttached
                    ? "bg-[#E6F1EA] text-[#2F6846]"
                    : "bg-[#F4F3F0] text-[#5E5B55]"
                }`}
              >
                {isGmailAttached ? "Đang bật" : "Đã nối"}
              </span>
            ) : isExpired ? (
              <span className="shrink-0 text-xs font-medium text-[#B45309]">
                Hết hạn
              </span>
            ) : (
              <span className="shrink-0 text-xs font-medium text-[#C2410C]">
                Set up
              </span>
            )}
          </button>

          {gmailStatus?.connected && (
            <button
              type="button"
              onClick={onOpenGmailConfig}
              aria-label="Cấu hình Gmail"
              title="Cấu hình Gmail"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-xl text-[#5E5B55] transition-colors hover:bg-[#F4F3F0] hover:text-[#1F1E1C]"
            >
              <SettingsIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
