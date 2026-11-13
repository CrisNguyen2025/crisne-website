import React, { useEffect, useState } from "react";
import type { ContextLastTurn, ConversationContext } from "../../types";
import type { ConversationContextState } from "../useRoadmapAssistantChat";
import { formatPercent, formatTokenCount, formatTokenDelta } from "../utils/formatters";
import { ChevronDownIcon, CloseIcon } from "../icons";

// One class per part: Tailwind needs the full class names to be present in the source
const PART_COLORS: Record<string, string> = {
  system: "bg-[#C2410C]",
  messages: "bg-[#2563EB]",
};
const FALLBACK_COLOR = "bg-[#8A8780]";
const RESERVED_COLOR = "bg-[#B9B6AF]";

export interface ContextUsageSheetProps {
  context: ConversationContextState;
  onRetry: () => void;
  onClose: () => void;
}

export function ContextUsageSheet({ context, onRetry, onClose }: ContextUsageSheetProps) {
  const { data, deltaTokens, isLoading, error } = context;

  // Captured first and stopped, so Escape closes this sheet and not the chat around it
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/20" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Context"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85%] w-full flex-col overflow-y-auto rounded-t-2xl border-t border-[#E6E4DF] bg-[#FFFFFF] p-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] animate-in slide-in-from-bottom-2 duration-200"
      >
        <div className="flex items-center justify-between border-b border-[#E6E4DF]/60 pb-2">
          <span className="text-xs font-semibold text-[#1F1E1C]">Context</span>
          <button
            type="button"
            onClick={onClose}
            title="Đóng"
            aria-label="Đóng bảng context"
            autoFocus
            className="flex h-8 w-8 min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded text-[#5E5B55] hover:bg-[#F4F3F0] hover:text-[#1F1E1C] md:h-5 md:w-5 md:min-h-0 md:min-w-0"
          >
            <CloseIcon className="h-4 w-4 md:h-3.5 md:w-3.5" />
          </button>
        </div>

        {data ? (
          <ContextBody data={data} deltaTokens={deltaTokens} />
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-6 text-xs text-[#5E5B55]">
            <span>{error}</span>
            <button type="button" onClick={onRetry} className="cursor-pointer rounded-lg px-2.5 py-1.5 font-medium text-[#1F1E1C] hover:bg-[#F4F3F0]">
              Thử lại
            </button>
          </div>
        ) : (
          <p className="py-6 text-center text-xs text-[#5E5B55]" aria-busy={isLoading}>
            Đang tải context…
          </p>
        )}
      </div>
    </div>
  );
}

function ContextBody({ data, deltaTokens }: { data: ConversationContext; deltaTokens?: number }) {
  const { budget, used, parts, reserved, omitted } = data;
  const reservedTotal = reserved.reduce((sum, r) => sum + r.tokens, 0);
  const free = Math.max(budget - used - reservedTotal, 0);
  const width = (tokens: number) => `${(tokens / budget) * 100}%`;
  const messages = parts.find((p) => p.key === "messages");
  const isWindowFull = !!messages?.limit && (messages.count ?? 0) >= messages.limit;

  return (
    <div className="pt-2.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-[#1F1E1C]">{formatPercent(used, budget)} đã dùng</span>
        <span className="text-[#5E5B55]">
          {formatTokenCount(used)} / {formatTokenCount(budget)}
        </span>
      </div>

      {/* Used parts from the left, the reserved slots at the right end, free space between */}
      <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-[#F4F3F0]" role="img" aria-label="Phân bổ context">
        {parts.map((p) => (
          <div key={p.key} className={PART_COLORS[p.key] ?? FALLBACK_COLOR} style={{ width: width(p.tokens), minWidth: p.tokens > 0 ? 2 : 0 }} />
        ))}
        <div className="flex-1" />
        <div className={RESERVED_COLOR} style={{ width: width(reservedTotal) }} />
      </div>

      <ul className="mt-3 space-y-1.5">
        {parts.map((p) => (
          <Row
            key={p.key}
            color={PART_COLORS[p.key] ?? FALLBACK_COLOR}
            label={p.limit ? `${p.label} · ${p.count ?? 0} / ${p.limit}` : p.label}
            value={formatTokenCount(p.tokens)}
            share={formatPercent(p.tokens, budget)}
          />
        ))}
        {deltaTokens !== undefined && <Row color="bg-[#E6E4DF]" label="Thay đổi từ lần xem trước" value={formatTokenDelta(deltaTokens)} />}
        {reserved.map((r) => (
          <Row
            key={r.key}
            color={RESERVED_COLOR}
            label={r.count ? `Giữ chỗ: ${r.label} · tối đa ${r.count}` : `Giữ chỗ: ${r.label}`}
            value={formatTokenCount(r.tokens)}
            share={formatPercent(r.tokens, budget)}
            muted
          />
        ))}
        <Row color="bg-[#F4F3F0]" label="Còn trống" value={formatTokenCount(free)} share={formatPercent(free, budget)} />
      </ul>

      {omitted.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-[#E6E4DF]/60 pt-2.5" aria-label="Không nằm trong context">
          {omitted.map((o) => (
            <Row key={o.key} color="bg-[#F4F3F0]" label={o.label} value={String(o.count)} share="—" muted />
          ))}
        </ul>
      )}

      {data.last_turn && <LastTurn turn={data.last_turn} />}

      <p className="mt-3 text-[11px] leading-4 text-[#5E5B55]">
        {isWindowFull
          ? "Cửa sổ tin nhắn đã đầy: mỗi lượt mới đẩy tin cũ nhất ra khỏi context."
          : "Khi cửa sổ tin nhắn đầy, tin cũ nhất sẽ rơi ra khỏi context."}{" "}
        Ngân sách là giới hạn của Abot; model {data.model} có window {formatTokenCount(data.window)}. Số liệu ước lượng
        theo ký tự, chưa tính bước định tuyến.
      </p>
    </div>
  );
}

function LastTurn({ turn }: { turn: ContextLastTurn }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasDocuments = turn.documents.length > 0;

  return (
    <div className="mt-3 border-t border-[#E6E4DF]/60 pt-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#5E5B55]">Lượt trả lời gần nhất</div>
      <ul className="mt-1.5 space-y-1.5">
        <Row
          color="bg-[#E6E4DF]"
          label={turn.measured ? "Đầu vào (provider đo)" : "Đầu vào (ước lượng)"}
          value={formatTokenCount(turn.input_tokens)}
        />
        <li>
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            disabled={!hasDocuments}
            aria-expanded={isExpanded}
            className="w-full rounded enabled:cursor-pointer enabled:hover:bg-[#F4F3F0]"
          >
            <Line color="bg-[#E6E4DF]" value={formatTokenCount(turn.retrieved_tokens)}>
              Tài liệu truy xuất · {turn.documents.length}
              {hasDocuments && (
                <ChevronDownIcon className={`ml-1 inline h-3 w-3 text-[#5E5B55] transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              )}
            </Line>
          </button>
          {isExpanded && (
            <ul className="mt-1 space-y-1 pl-[18px]">
              {turn.documents.map((d, i) => (
                <li key={`${d.label}-${i}`} className="flex items-center gap-2 text-[11px] text-[#5E5B55]">
                  <span className="min-w-0 flex-1 truncate">{d.label}</span>
                  <span className="tabular-nums">{formatTokenCount(d.tokens)}</span>
                  <span className="w-11" />
                </li>
              ))}
            </ul>
          )}
        </li>
        <Row color="bg-[#E6E4DF]" label="Câu trả lời" value={formatTokenCount(turn.output_tokens)} />
      </ul>
    </div>
  );
}

interface RowProps {
  color: string;
  label: string;
  value: string;
  share?: string;
  muted?: boolean;
}

function Row({ color, label, value, share, muted }: RowProps) {
  return (
    <li>
      <Line color={color} value={value} share={share} muted={muted}>
        {label}
      </Line>
    </li>
  );
}

function Line({ color, value, share, muted, children }: Omit<RowProps, "label"> & { children: React.ReactNode }) {
  return (
    <span className={`flex items-center gap-2 text-left text-xs ${muted ? "text-[#5E5B55]" : "text-[#1F1E1C]"}`}>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${color}`} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <span className="tabular-nums text-[#5E5B55]">{value}</span>
      <span className="w-11 text-right tabular-nums text-[#5E5B55]">{share ?? ""}</span>
    </span>
  );
}
