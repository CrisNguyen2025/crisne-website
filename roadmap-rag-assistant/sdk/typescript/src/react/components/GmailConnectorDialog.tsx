import React, { useEffect, useState } from "react";
import type { RoadmapChatClient } from "../../client";
import type { GmailConnectorConfig, GmailConnectorStatus } from "../../types";
import { CloseIcon, MailIcon, RefreshIcon } from "../icons";
import { AbotDialog, useAbotDialogClose } from "./AbotDialog";

export interface GmailConnectorDialogProps {
  client: RoadmapChatClient;
  initialStatus: GmailConnectorStatus | null;
  isGmailAttached: boolean;
  zIndex?: number;
  onStatusChange: (status: GmailConnectorStatus) => void;
  onToggleAttached: (attached: boolean) => void;
  onClose: () => void;
}

function GmailDialogContent({
  client,
  initialStatus,
  isGmailAttached,
  onStatusChange,
  onToggleAttached,
  onClose,
}: Omit<GmailConnectorDialogProps, "zIndex">) {
  const closeDialog = useAbotDialogClose(onClose);
  const [status, setStatus] = useState<GmailConnectorStatus | null>(initialStatus);
  const [loading, setLoading] = useState(!initialStatus);
  const [saving, setSaving] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selectedLabels, setSelectedLabels] = useState<string[]>(
    initialStatus?.config.allowedLabelIds ?? []
  );
  const [defaultQuery, setDefaultQuery] = useState(
    initialStatus?.config.defaultQuery ?? "newer_than:14d"
  );
  const [maxEmails, setMaxEmails] = useState<number>(
    initialStatus?.config.maxEmails ?? 5
  );
  const [excludeSensitive, setExcludeSensitive] = useState<boolean>(
    initialStatus?.config.excludeSensitiveSubjects ?? true
  );

  const applyStatus = React.useCallback(
    (next: GmailConnectorStatus) => {
      setStatus(next);
      setSelectedLabels(next.config.allowedLabelIds ?? []);
      setDefaultQuery(next.config.defaultQuery ?? "newer_than:14d");
      setMaxEmails(next.config.maxEmails ?? 5);
      setExcludeSensitive(next.config.excludeSensitiveSubjects ?? true);
      onStatusChange(next);
    },
    [onStatusChange]
  );

  const fetchStatus = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await client.getGmailConnectorStatus();
      applyStatus(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Chưa tải được trạng thái Gmail."
      );
    } finally {
      setLoading(false);
    }
  }, [client, applyStatus]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Refresh automatically when popup completes OAuth flow
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (
        event.data &&
        typeof event.data === "object" &&
        (event.data as { type?: string }).type === "abot:gmail-connector-updated"
      ) {
        setNotice("Đã kết nối tài khoản Gmail thành công.");
        onToggleAttached(true);
        void fetchStatus();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [fetchStatus, onToggleAttached]);

  const handleStartOAuth = () => {
    setError(null);
    setNotice(null);
    if (typeof window === "undefined") return;
    const popup = window.open(
      client.getGmailAuthUrl(),
      "abot-gmail-oauth",
      "popup=yes,width=520,height=660"
    );
    if (!popup) {
      setError(
        "Trình duyệt đang chặn cửa sổ bật lên. Vui lòng cho phép popup rồi thử lại."
      );
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload: GmailConnectorConfig = {
        allowedLabelIds: selectedLabels,
        defaultQuery: defaultQuery.trim(),
        maxEmails,
        excludeSensitiveSubjects: excludeSensitive,
      };
      const updated = await client.updateGmailConnectorConfig(payload);
      applyStatus(updated);
      setNotice("Đã lưu cấu hình Gmail.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Chưa lưu được cấu hình Gmail."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await client.disconnectGmail();
      onToggleAttached(false);
      setConfirmDisconnect(false);
      const next: GmailConnectorStatus = {
        connected: false,
        status: "disconnected",
        accountEmail: null,
        config: {
          allowedLabelIds: [],
          defaultQuery: "newer_than:14d",
          maxEmails: 5,
          excludeSensitiveSubjects: true,
        },
      };
      applyStatus(next);
      setNotice("Đã ngắt kết nối Gmail.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Chưa ngắt được kết nối Gmail."
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleLabel = (id: string) => {
    setSelectedLabels((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const isConnected = Boolean(
    status?.connected && status.status === "connected"
  );
  const isExpired =
    status?.status === "expired" || status?.status === "error";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-[#E6E4DF] px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#F4F3F0] text-[#1F1E1C]">
            <MailIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-[#1F1E1C]">
              Gmail Connector
            </h2>
            <p className="truncate text-[11px] text-[#5E5B55]">
              {isConnected
                ? status?.accountEmail ?? "Đã kết nối"
                : isExpired
                  ? "Phiên kết nối đã hết hạn"
                  : "Chưa kết nối tài khoản Google"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={closeDialog}
          aria-label="Đóng hộp thoại Gmail Connector"
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#5E5B55] hover:bg-[#F4F3F0] hover:text-[#1F1E1C]"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 [scrollbar-width:thin]">
        <div className="rounded-xl border border-[#E6E4DF] bg-[#FAF9F7] px-3 py-2 text-xs leading-relaxed text-[#5E5B55]">
          Chỉ cấp quyền đọc (<span className="font-mono">gmail.readonly</span>) cho
          chủ lộ trình. Tự động bỏ qua email OTP/đặt lại mật khẩu và không lưu
          nội dung email vào bộ nhớ dài hạn.
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-[#B42318]/25 bg-[#FBEDE5] px-3 py-2 text-xs text-[#B42318]"
          >
            {error}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="rounded-xl border border-[#3F7D58]/25 bg-[#E6F1EA] px-3 py-2 text-xs text-[#2F6846]"
          >
            {notice}
          </div>
        )}

        {loading ? (
          <div className="py-6 text-center text-xs text-[#5E5B55]">
            Đang kiểm tra trạng thái kết nối…
          </div>
        ) : !isConnected ? (
          <div className="space-y-3 rounded-xl border border-[#E6E4DF] p-3">
            <p className="text-xs leading-relaxed text-[#1F1E1C]">
              {isExpired
                ? `Kết nối trước đó (${status?.accountEmail ?? "Gmail"}) đã hết hạn hoặc bị thu hồi. Kết nối lại để Abot tiếp tục đọc Gmail khi bạn bật ngữ cảnh.`
                : "Kết nối 1 tài khoản Gmail để Abot tham chiếu email học tập, bản tin kỹ thuật hoặc lịch học khi bạn gắn chip Gmail."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleStartOAuth}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#C2410C] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[#9A3412]"
              >
                <MailIcon className="h-3.5 w-3.5" />
                <span>
                  {isExpired ? "Kết nối lại Gmail" : "Kết nối Gmail với Google"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void fetchStatus()}
                aria-label="Làm mới trạng thái Gmail"
                className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[#E6E4DF] bg-white px-2.5 py-2 text-xs font-medium text-[#1F1E1C] hover:bg-[#F4F3F0]"
              >
                <RefreshIcon className="h-3.5 w-3.5" />
                <span>Làm mới</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSaveConfig(e)} className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-[#D7E6DC] bg-[#F1F8F4] px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-[#2F6846]">
                  Đã kết nối: {status?.accountEmail}
                </div>
                <label className="mt-1 inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-[#2F6846]">
                  <input
                    type="checkbox"
                    checked={isGmailAttached}
                    onChange={(e) => onToggleAttached(e.target.checked)}
                    className="accent-[#3F7D58]"
                  />
                  <span>Đang gắn vào thanh soạn tin nhắn</span>
                </label>
              </div>
              {!confirmDisconnect ? (
                <button
                  type="button"
                  onClick={() => setConfirmDisconnect(true)}
                  disabled={saving}
                  className="shrink-0 cursor-pointer rounded-lg border border-[#E6E4DF] bg-white px-2.5 py-1 text-[11px] font-medium text-[#B42318] hover:bg-[#FBEDE5]"
                >
                  Ngắt kết nối
                </button>
              ) : (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void handleDisconnect()}
                    disabled={saving}
                    className="cursor-pointer rounded-lg bg-[#B42318] px-2 py-1 text-[11px] font-medium text-white"
                  >
                    Xác nhận
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDisconnect(false)}
                    disabled={saving}
                    className="cursor-pointer rounded-lg border border-[#E6E4DF] bg-white px-2 py-1 text-[11px] text-[#5E5B55]"
                  >
                    Hủy
                  </button>
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="gmail-default-query"
                className="mb-1 block text-xs font-medium text-[#1F1E1C]"
              >
                Bộ lọc mặc định (Gmail search query)
              </label>
              <input
                id="gmail-default-query"
                type="text"
                value={defaultQuery}
                maxLength={200}
                onChange={(e) => setDefaultQuery(e.target.value)}
                placeholder="VD: newer_than:14d"
                className="w-full rounded-xl border border-[#E6E4DF] bg-white px-3 py-1.5 font-mono text-xs text-[#1F1E1C] outline-none focus:border-[#C2410C]"
              />
            </div>

            {status?.labels && status.labels.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium text-[#1F1E1C]">
                  Nhãn Gmail được phép đọc (bỏ trống = toàn hộp thư)
                </div>
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-[#E6E4DF] p-2">
                  {status.labels.map((label) => {
                    const checked = selectedLabels.includes(label.id);
                    return (
                      <button
                        key={label.id}
                        type="button"
                        onClick={() => toggleLabel(label.id)}
                        className={`cursor-pointer rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                          checked
                            ? "border-[#C2410C] bg-[#FBEAE3] text-[#9A3412]"
                            : "border-[#E6E4DF] bg-[#F4F3F0] text-[#5E5B55] hover:text-[#1F1E1C]"
                        }`}
                      >
                        {label.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-[#1F1E1C]">
                <input
                  type="checkbox"
                  checked={excludeSensitive}
                  onChange={(e) => setExcludeSensitive(e.target.checked)}
                  className="accent-[#C2410C]"
                />
                <span>Chặn email OTP / đặt lại mật khẩu</span>
              </label>

              <label className="inline-flex items-center gap-1.5 text-xs text-[#5E5B55]">
                <span>Tối đa/lượt:</span>
                <select
                  aria-label="Số email tối đa mỗi lượt"
                  value={maxEmails}
                  onChange={(e) => setMaxEmails(Number(e.target.value))}
                  className="rounded-lg border border-[#E6E4DF] bg-white px-2 py-1 text-xs text-[#1F1E1C]"
                >
                  <option value={3}>3 email</option>
                  <option value={5}>5 email</option>
                </select>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="cursor-pointer rounded-xl bg-[#1F1E1C] px-3.5 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Đang lưu…" : "Lưu cấu hình"}
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleAttached(true);
                  closeDialog();
                }}
                className="cursor-pointer rounded-xl bg-[#C2410C] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#9A3412]"
              >
                Dùng ngay
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function GmailConnectorDialog({
  zIndex,
  ...props
}: GmailConnectorDialogProps) {
  return (
    <AbotDialog
      label="Cấu hình Gmail Connector"
      size="sm"
      zIndex={zIndex}
      onClose={props.onClose}
    >
      <GmailDialogContent {...props} />
    </AbotDialog>
  );
}
