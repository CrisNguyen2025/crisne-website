"use client";

import React from "react";
import { ExternalLink } from "lucide-react";
import type { GoldenSetStatus } from "@/logic/roadmap/knowledgeTriageService";
import { formatExactDate, formatFriendlyTime } from "@/lib/roadmap/date-utils";

const SYNC_COMMAND = "python -m evals sync-dataset";

/**
 * Golden set at a glance: what is committed (synced from Langfuse) next to what waits in Langfuse.
 * Review and labeling happen in Langfuse; this card only links there.
 */
export function GoldenSetStatusCard({ status }: { status: GoldenSetStatus }) {
  const synced = status.sync?.samples ?? 0;
  const behind = status.datasetItems !== undefined && status.datasetItems > synced;

  return (
    <section
      aria-label="Golden set"
      className="flex flex-col gap-1.5 border-b border-[#E6E4DF] bg-[#F4F3F0] px-5 py-3 text-xs text-[#1F1E1C]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">Golden set</span>
        {status.queueUrl && (
          <a
            href={status.queueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-md px-2 py-1 font-medium text-[#C2410C] hover:bg-[#FBEDE5]"
          >
            Mở hàng đợi duyệt trên Langfuse
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <p className="text-[#6B6862]">
        Trong Git: <span className="font-medium text-[#1F1E1C]">{synced}</span> mẫu từ Langfuse
        {status.sync ? (
          <span title={formatExactDate(status.sync.synced_at)}> · sync {formatFriendlyTime(status.sync.synced_at)}</span>
        ) : (
          " · chưa sync lần nào"
        )}
      </p>
      {status.error ? (
        <p className="text-[#B42318]">Không đọc được Langfuse: {status.error}</p>
      ) : (
        <p className="text-[#6B6862]">
          Langfuse: <span className="font-medium text-[#1F1E1C]">{status.datasetItems ?? 0}</span> item trong dataset
          {typeof status.queuePending === "number" && (
            <>
              {" · "}
              <span className="font-medium text-[#1F1E1C]">{status.queuePending}</span> 👎 chờ duyệt
            </>
          )}
          {behind && (
            <>
              {" · "}
              <span className="text-[#C2410C]">cần chạy</span> <code className="text-[11px]">{SYNC_COMMAND}</code>
            </>
          )}
        </p>
      )}
    </section>
  );
}
