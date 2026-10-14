import React, { useState } from "react";
import { ArrowUpIcon } from "./icons";

/** Shown when an item has no target layer: create the default layer or a named one. */
export function LayerChoicePicker({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const [name, setName] = useState("");
  const trimmed = name.trim();

  const submitName = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) return;
    onSend(`tạo layer ${trimmed}`);
  };

  return (
    <div className="flex items-center gap-1.5 pt-1">
      <button
        type="button"
        onClick={() => onSend("tạo layer mặc định")}
        disabled={disabled}
        className="shrink-0 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        Layer mặc định
      </button>
      <form onSubmit={submitName} className="flex min-w-0 flex-1 items-center gap-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Hoặc tên layer mới…"
          disabled={disabled}
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !trimmed}
          aria-label="Tạo layer với tên đã nhập"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <ArrowUpIcon className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
