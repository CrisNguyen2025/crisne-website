import React, { useState } from "react";
import type { ContextLastTurn, ConversationContext } from "../../types";
import type { ConversationContextState } from "../useRoadmapAssistantChat";
import { formatPercent, formatTokenCount, formatTokenDelta } from "../utils/formatters";
import type { PageContextRef } from "../utils/pageContextRef";
import { BookOpenIcon, ChevronDownIcon, CloseIcon, ContextIcon, FileTextIcon } from "../icons";
import { AbotDialog, useAbotDialogClose } from "./AbotDialog";

// One class per part: Tailwind needs the full class names to be present in the source
const PART_COLORS: Record<string, string> = {
  system: "bg-[#C2410C]",
  owner_memory: "bg-[#3F7D58]",
  messages: "bg-[#2563EB]",
};
const FALLBACK_COLOR = "bg-[#8A8780]";
const RESERVED_COLOR = "bg-[#B9B6AF]";

export interface ContextUsageSheetProps {
  context: ConversationContextState;
  contextRef?: PageContextRef | null;
  zIndex?: number;
  onRetry: () => void;
  onClose: () => void;
}

function ContextUsageContent({
  context,
  contextRef,
  onRetry,
  onClose,
}: Omit<ContextUsageSheetProps, "zIndex">) {
  const { data, deltaTokens, isLoading, error } = context;
  const requestClose = useAbotDialogClose(onClose);

  return (
    <>
      <div className="flex shrink-0 items-center justify-between border-b border-[#E6E4DF]/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <ContextIcon className="h-4 w-4 text-[#5E5B55]" />
          <span className="text-xs font-semibold text-[#1F1E1C] sm:text-[13px]">Context</span>
        </div>
        <button
          type="button"
          onClick={requestClose}
          title="Đóng"
          aria-label="Đóng bảng context"
          autoFocus
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[#5E5B55] hover:bg-[#F4F3F0] hover:text-[#1F1E1C] md:h-7 md:w-7"
        >
          <CloseIcon className="h-4 w-4 md:h-3.5 md:w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3.5">
        {contextRef && (
          <div
            data-testid="context-sheet-page-ref"
            title={contextRef.tooltip}
            className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-[#E6E4DF] bg-[#F4F3F0]/75 px-2.5 py-1.5 text-xs"
          >
            <span className="flex min-w-0 items-center gap-1.5 text-[#1F1E1C]">
              {contextRef.kind === "lesson" ? (
                <FileTextIcon className="h-3.5 w-3.5 shrink-0 text-[#C2410C]" />
              ) : (
                <BookOpenIcon className="h-3.5 w-3.5 shrink-0 text-[#C2410C]" />
              )}
              <span className="truncate font-medium">{contextRef.label}</span>
            </span>
            <span className="max-w-[45%] shrink-0 truncate font-mono text-[11px] text-[#5E5B55]">
              {contextRef.path}
            </span>
          </div>
        )}

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
    </>
  );
}

export function ContextUsageSheet({
  context,
  contextRef,
  zIndex,
  onRetry,
  onClose,
}: ContextUsageSheetProps) {
  return (
    <AbotDialog label="Context" size="sm" zIndex={zIndex} onClose={onClose}>
      <ContextUsageContent
        context={context}
        contextRef={contextRef}
        onRetry={onRetry}
        onClose={onClose}
      />
    </AbotDialog>
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
    <div>
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
          <React.Fragment key={p.key}>
            <Row
              color={PART_COLORS[p.key] ?? FALLBACK_COLOR}
              label={p.limit ? `${p.label} · ${p.count ?? 0} / ${p.limit}` : p.label}
              value={formatTokenCount(p.tokens)}
              share={formatPercent(p.tokens, budget)}
            />
            {p.key === "owner_memory" &&
              p.breakdown &&
              (p.breakdown.explicit.count > 0 || p.breakdown.observation.count > 0) && (
                <>
                  {p.breakdown.explicit.count > 0 && (
                    <Row
                      color="bg-[#5E8C6F]"
                      label={`↳ Chia sẻ trực tiếp · ${p.breakdown.explicit.count} mục`}
                      value={formatTokenCount(p.breakdown.explicit.tokens)}
                      share={formatPercent(p.breakdown.explicit.tokens, budget)}
                      muted
                    />
                  )}
                  {p.breakdown.observation.count > 0 && (
                    <Row
                      color="bg-[#D97706]/70"
                      label={`↳ Abot quan sát · ${p.breakdown.observation.count} mục`}
                      value={formatTokenCount(p.breakdown.observation.tokens)}
                      share={formatPercent(p.breakdown.observation.tokens, budget)}
                      muted
                    />
                  )}
                </>
              )}
          </React.Fragment>
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
