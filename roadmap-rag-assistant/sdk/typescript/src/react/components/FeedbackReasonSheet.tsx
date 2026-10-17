import React, { useState } from "react";
import { CheckCircleIcon, CheckIcon, CloseIcon, ArrowUpIcon } from "../icons";

const UNLIKE_REASONS = [
  "Ảo giác / Sai kiến thức",
  "Lạc đề / Chưa đúng trọng tâm",
  "Lỗi cú pháp / Lộ trình hỏng",
  "Khó hiểu / Quá dài dòng",
] as const;

interface FeedbackReasonSheetProps {
  messageId: string;
  onSubmit: (reason?: string, comment?: string) => void;
  onClose: () => void;
}

export function FeedbackReasonSheet({
  onSubmit,
  onClose,
}: FeedbackReasonSheetProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsSubmitted(true);
    onSubmit(selectedReason || undefined, comment.trim() || undefined);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-t border-[#E6E4DF] bg-[#FFFFFF] p-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] animate-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center justify-between pb-2 border-b border-[#E6E4DF]/60">
        <span className="text-xs font-semibold text-[#1F1E1C]">
          Góp ý câu trả lời chưa tốt
        </span>
        <button
          type="button"
          onClick={onClose}
          title="Đóng"
          aria-label="Đóng bảng góp ý"
          className="flex h-8 w-8 min-h-[44px] min-w-[44px] md:h-5 md:w-5 md:min-h-0 md:min-w-0 items-center justify-center rounded text-[#6B6862] hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer"
        >
          <CloseIcon className="h-4 w-4 md:h-3.5 md:w-3.5" />
        </button>
      </div>

      {isSubmitted ? (
        <div className="flex items-center justify-center gap-1.5 py-6 text-xs font-medium text-[#3F7D58]">
          <CheckIcon className="h-4 w-4" />
          <span>Đã ghi nhận góp ý, cảm ơn bạn!</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 pt-2.5">
          <div className="flex flex-wrap gap-1.5">
            {UNLIKE_REASONS.map((opt) => {
              const isSelected = selectedReason === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setSelectedReason(isSelected ? null : opt)}
                  className={`rounded-md px-3 py-1.5 min-h-[38px] md:min-h-0 text-xs transition-colors cursor-pointer flex items-center justify-center ${
                    isSelected
                      ? "border border-[#C2410C] bg-[#FBEDE5] text-[#C2410C] font-medium"
                      : "border border-[#E6E4DF] bg-[#F4F3F0] text-[#1F1E1C] hover:bg-[#ECEAE5]"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="AI cần cải thiện điểm nào? (tùy chọn)..."
            rows={2}
            maxLength={300}
            className="w-full resize-none rounded-lg border border-[#E6E4DF] bg-[#F4F3F0] p-2.5 text-[16px] md:text-xs text-[#1F1E1C] outline-none placeholder:text-[#6B6862] focus:border-[#C2410C] focus:bg-[#FFFFFF]"
          />

          <div className="flex items-center justify-end gap-2 pt-0.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 min-h-[44px] md:min-h-0 flex items-center justify-center text-xs text-[#6B6862] hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer"
            >
              Bỏ qua
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#C2410C] px-3.5 py-2 min-h-[44px] md:min-h-0 flex items-center justify-center text-xs font-medium text-white transition-opacity hover:opacity-90 cursor-pointer"
            >
              Gửi góp ý
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
