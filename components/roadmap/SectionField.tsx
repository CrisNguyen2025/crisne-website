'use client';

import React, { useId, useState } from 'react';
import { cn } from '@/lib/utils';

interface SectionFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Sections the topic already has; picking one reuses its spelling */
  sections: string[];
  className?: string;
}

export function SectionField({ value, onChange, sections, className }: SectionFieldProps) {
  const fieldId = useId();
  const [isCustomMode, setIsCustomMode] = useState<boolean>(
    () => sections.length === 0 || (Boolean(value.trim()) && !sections.includes(value))
  );

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (next === '__create_new__') {
      setIsCustomMode(true);
      onChange('');
      return;
    }
    onChange(next);
  };

  const handleSwitchToSelect = () => {
    setIsCustomMode(false);
    if (value && !sections.includes(value)) {
      onChange(sections[0] ?? '');
    }
  };

  const showSelect = sections.length > 0 && !isCustomMode;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={fieldId} className="block text-xs font-medium text-foreground">
          Mục
        </label>
        {showSelect ? (
          <button
            type="button"
            onClick={() => {
              setIsCustomMode(true);
              onChange('');
            }}
            className="text-[0.6875rem] font-medium text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
          >
            + Tạo mục mới
          </button>
        ) : (
          sections.length > 0 && (
            <button
              type="button"
              onClick={handleSwitchToSelect}
              className="text-[0.6875rem] font-medium text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
            >
              Chọn mục có sẵn
            </button>
          )
        )}
      </div>

      {showSelect ? (
        <select
          id={fieldId}
          value={value}
          onChange={handleSelectChange}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-foreground/50 focus:outline-none cursor-pointer"
        >
          <option value="">Chung (không thuộc mục riêng)</option>
          {sections.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value="__create_new__">+ Tạo mục mới…</option>
        </select>
      ) : (
        <>
          <input
            id={fieldId}
            type="text"
            autoFocus={sections.length > 0}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Nhập tên mục mới (để trống = Chung)…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-foreground/50 focus:outline-none"
          />
          <p className="text-[0.6875rem] text-muted-foreground">
            Để trống nếu không thuộc mục riêng nào.
          </p>
        </>
      )}
    </div>
  );
}
