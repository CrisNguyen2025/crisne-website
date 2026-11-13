import React from "react";
import type { ContextUsage } from "../../types";
import { formatPercent, formatTokenCount } from "../utils/formatters";
import { CloseIcon } from "../icons";

// One class per part: Tailwind needs the full class names to be present in the source
const PART_COLORS: Record<string, string> = {
  system: "bg-[#C2410C]",
  history: "bg-[#3F7D58]",
  retrieved: "bg-[#2563EB]",
  message: "bg-[#B7791F]",
};
const FALLBACK_COLOR = "bg-[#8A8780]";

export interface ContextUsageSheetProps {
  /** Context of the last LLM answer; null before the first one. */
  usage: ContextUsage | null;
  onClose: () => void;
}

export function ContextUsageSheet({ usage, onClose }: ContextUsageSheetProps) {
  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/20" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Context"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full flex-col overflow-y-auto rounded-t-2xl border-t border-[#E6E4DF] bg-[#FFFFFF] p-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] animate-in slide-in-from-bottom-2 duration-200"
      >
        <div className="flex items-center justify-between border-b border-[#E6E4DF]/60 pb-2">
          <span className="text-xs font-semibold text-[#1F1E1C]">Context</span>
          <button
            type="button"
            onClick={onClose}
            title="Đóng"
            aria-label="Đóng bảng context"
            className="flex h-8 w-8 min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded text-[#5E5B55] hover:bg-[#F4F3F0] hover:text-[#1F1E1C] md:h-5 md:w-5 md:min-h-0 md:min-w-0"
          >
            <CloseIcon className="h-4 w-4 md:h-3.5 md:w-3.5" />
          </button>
        </div>

        {usage ? <UsageBody usage={usage} /> : (
          <p className="py-6 text-center text-xs text-[#5E5B55]">
            Gửi một câu hỏi để xem context của lượt trả lời.
          </p>
        )}
      </div>
    </div>
  );
}

function UsageBody({ usage }: { usage: ContextUsage }) {
  const { window, input_tokens: used, parts, measured } = usage;
  const free = Math.max(window - used, 0);
  // The bar spans the window, so parts are drawn at their share of it, scaled to the measured input
  const estimated = parts.reduce((sum, p) => sum + p.tokens, 0) || 1;
  const scaled = (tokens: number) => (tokens / estimated) * used;

  return (
    <div className="pt-2.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-[#1F1E1C]">{formatPercent(used, window)} đã dùng</span>
        <span className="text-[#5E5B55]">
          {formatTokenCount(used)} / {formatTokenCount(window)}
        </span>
      </div>

      <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-[#F4F3F0]" role="img" aria-label="Phân bổ context">
        {parts.map((p) => (
          <div
            key={p.key}
            className={PART_COLORS[p.key] ?? FALLBACK_COLOR}
            style={{ width: `${(scaled(p.tokens) / window) * 100}%`, minWidth: p.tokens > 0 ? 2 : 0 }}
          />
        ))}
      </div>

      <ul className="mt-3 space-y-1.5">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2 text-xs text-[#1F1E1C]">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${PART_COLORS[p.key] ?? FALLBACK_COLOR}`} />
            <span className="min-w-0 flex-1 truncate">
              {p.label}
              {p.count ? <span className="text-[#5E5B55]"> · {p.count}</span> : null}
            </span>
            <span className="tabular-nums text-[#5E5B55]">{formatTokenCount(scaled(p.tokens))}</span>
            <span className="w-11 text-right tabular-nums text-[#5E5B55]">{formatPercent(scaled(p.tokens), window)}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-xs text-[#1F1E1C]">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#E6E4DF]" />
          <span className="min-w-0 flex-1 truncate">Còn trống</span>
          <span className="tabular-nums text-[#5E5B55]">{formatTokenCount(free)}</span>
          <span className="w-11 text-right tabular-nums text-[#5E5B55]">{formatPercent(free, window)}</span>
        </li>
      </ul>

      <p className="mt-3 text-[11px] leading-4 text-[#5E5B55]">
        {usage.model} · trả lời {formatTokenCount(usage.output_tokens)} token
        {measured ? "" : " · số liệu ước lượng"}. Chỉ tính lượt trả lời gần nhất, không gồm bước định tuyến.
      </p>
    </div>
  );
}
