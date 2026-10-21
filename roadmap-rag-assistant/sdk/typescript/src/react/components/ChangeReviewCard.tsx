import React, { useId, useState } from "react";
import { ChevronDownIcon } from "../icons";
import type { ChangeReview } from "../../types";

const LEVEL_LABEL: Record<string, string> = {
  topic: "Topic",
  layer: "Layer",
  group: "Nhóm",
  item: "Bài học",
};

function levelLabel(level: string): string {
  return LEVEL_LABEL[level] ?? level;
}

export interface ChangeReviewCardProps {
  /** Every change review of one reply, in the order the actions ran. */
  changes: ChangeReview[];
}

/**
 * "N thay đổi +x −y" summary of the data a reply's actions wrote; expands to the rows
 * created (+) and deleted (−), with what a delete removed along with each row.
 */
export function ChangeReviewCard({ changes }: ChangeReviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const entries = changes.flatMap((c) => c.entries.map((e) => ({ ...e, key: `${c.id}-${e.id ?? e.title}` })));
  if (entries.length === 0) return null;

  const added = changes.reduce((sum, c) => sum + c.added, 0);
  const removed = changes.reduce((sum, c) => sum + c.removed, 0);
  const skipped = changes.flatMap((c) => c.skipped ?? []);
  const truncated = changes.some((c) => c.truncated);

  return (
    <div className="overflow-hidden rounded-lg border border-[#E6E4DF] bg-[#FFFFFF] text-xs">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[#F4F3F0] cursor-pointer"
      >
        <span className="font-medium text-[#1F1E1C]">{entries.length} thay đổi</span>
        <span className="font-mono text-[#3F7D58]">+{added}</span>
        <span className="font-mono text-[#B42318]">−{removed}</span>
        <ChevronDownIcon
          className={`h-3.5 w-3.5 text-[#6B6862] transition-transform duration-200 ${expanded ? "rotate-0" : "-rotate-90"}`}
        />
        <span className="ml-auto rounded-md border border-[#E6E4DF] bg-[#F4F3F0] px-2 py-0.5 font-medium text-[#4D4B46]">
          Xem lại
        </span>
      </button>

      {expanded && (
        <ul id={panelId} className="border-t border-[#E6E4DF] py-1 font-mono">
          {entries.map((e) => {
            const isCreate = e.op === "create";
            return (
              <li key={e.key}>
                <div
                  className={`flex items-baseline gap-2 px-3 py-1 ${isCreate ? "bg-[#E6F1EA] text-[#3F7D58]" : "bg-[#FBEDE5] text-[#B42318]"}`}
                >
                  <span aria-hidden="true">{isCreate ? "+" : "−"}</span>
                  <span className="sr-only">{isCreate ? "Đã tạo" : "Đã xóa"}</span>
                  <span className="shrink-0 text-[#6B6862]">{levelLabel(e.level)}</span>
                  <span className="min-w-0 break-words font-sans font-medium text-[#1F1E1C]">{e.title}</span>
                  {e.code && <span className="shrink-0 text-[#8C8983]">{e.code}</span>}
                </div>
                {!!e.children?.length && (
                  <ul className="text-[#B42318]">
                    {e.children.map((child, i) => (
                      <li key={`${e.key}-${i}`} className="flex items-baseline gap-2 py-0.5 pl-7 pr-3">
                        <span aria-hidden="true">−</span>
                        <span className="shrink-0 text-[#6B6862]">{levelLabel(child.level)}</span>
                        <span className="min-w-0 break-words font-sans text-[#4D4B46]">{child.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
          {truncated && (
            <li className="px-3 py-1 font-sans italic text-[#6B6862]">Danh sách mục con đã được rút gọn.</li>
          )}
          {skipped.length > 0 && (
            <li className="px-3 py-1 font-sans text-[#6B6862]">Đã có sẵn, không tạo lại: {skipped.join(", ")}</li>
          )}
        </ul>
      )}
    </div>
  );
}
