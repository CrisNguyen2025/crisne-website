'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import { sectionSpelling } from '@/lib/roadmap/sections';
import { normalizeTitle } from '@/lib/roadmap/titles';
import { cn } from '@/lib/utils';

interface SectionFieldProps {
  value: string;
  onChange: (value: string) => void;
  sections: string[];
  className?: string;
}

type SectionOption =
  | { kind: 'none'; label: string; value: string }
  | { kind: 'existing'; label: string; value: string }
  | { kind: 'create'; label: string; value: string };

const GENERAL_LABEL = 'Chung (không thuộc mục riêng)';

export function SectionField({ value, onChange, sections, className }: SectionFieldProps) {
  const fieldId = useId();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [isOpen, setIsOpen] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const cleaned = value.trim().replace(/\s+/g, ' ');
  const exactMatch = useMemo(
    () => (cleaned ? sections.find((s) => normalizeTitle(s) === normalizeTitle(cleaned)) : undefined),
    [cleaned, sections]
  );

  const options = useMemo<SectionOption[]>(() => {
    const query = isFiltering ? normalizeTitle(cleaned) : '';
    const list: SectionOption[] = [];

    if (!query || normalizeTitle(GENERAL_LABEL).includes(query)) {
      list.push({ kind: 'none', label: GENERAL_LABEL, value: '' });
    }

    const matchingSections = query
      ? sections.filter((s) => normalizeTitle(s).includes(query))
      : sections;

    for (const sec of matchingSections) {
      list.push({ kind: 'existing', label: sec, value: sec });
    }

    if (cleaned && !exactMatch) {
      list.push({ kind: 'create', label: cleaned, value: cleaned });
    }

    return list;
  }, [cleaned, exactMatch, isFiltering, sections]);

  const clampedActiveIndex =
    options.length === 0 ? -1 : Math.min(Math.max(activeIndex, 0), options.length - 1);

  const commitCanonicalSpelling = () => {
    const canonical = sectionSpelling(sections, value) ?? '';
    if (canonical !== value) {
      onChange(canonical);
    }
  };

  const closeListbox = (commitSpelling: boolean) => {
    setIsOpen(false);
    setIsFiltering(false);
    if (commitSpelling) {
      commitCanonicalSpelling();
    }
  };

  const openListbox = () => {
    setIsOpen(true);
    setIsFiltering(false);
    const selectedTarget = exactMatch ?? (cleaned ? cleaned : '');
    const idx = options.findIndex((opt) => opt.value === selectedTarget);
    setActiveIndex(idx >= 0 ? idx : 0);
  };

  const selectOption = (opt: SectionOption) => {
    onChange(opt.value);
    setIsOpen(false);
    setIsFiltering(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
        setIsFiltering(false);
        const canonical = sectionSpelling(sections, value) ?? '';
        if (canonical !== value) {
          onChange(canonical);
        }
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen, onChange, sections, value]);

  useEffect(() => {
    if (!isOpen || clampedActiveIndex < 0) return;
    optionRefs.current[clampedActiveIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [clampedActiveIndex, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        openListbox();
      } else if (options.length > 0) {
        setActiveIndex((clampedActiveIndex + 1) % options.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        openListbox();
      } else if (options.length > 0) {
        setActiveIndex((clampedActiveIndex - 1 + options.length) % options.length);
      }
      return;
    }

    if (e.key === 'Enter' && isOpen && clampedActiveIndex >= 0 && options[clampedActiveIndex]) {
      e.preventDefault();
      selectOption(options[clampedActiveIndex]);
      return;
    }

    if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      e.stopPropagation();
      closeListbox(true);
      return;
    }

    if (e.key === 'Tab' && isOpen) {
      closeListbox(true);
    }
  };

  const activeOptionId =
    isOpen && clampedActiveIndex >= 0 ? `${listboxId}-option-${clampedActiveIndex}` : undefined;

  return (
    <div ref={rootRef} className={cn('relative space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={fieldId} className="block text-[0.8125rem] font-medium text-foreground">
          Mục
        </label>
        {cleaned && exactMatch && exactMatch !== cleaned && (
          <span className="max-w-[12rem] truncate text-[0.6875rem] text-muted-foreground">
            Khớp mục: <strong className="font-medium text-foreground">{exactMatch}</strong>
          </span>
        )}
        {cleaned && !exactMatch && (
          <span className="rounded bg-[var(--editorial-accent-soft)] px-1.5 py-0.5 text-[0.6875rem] font-medium text-[var(--editorial-accent)]">
            Mục mới
          </span>
        )}
      </div>

      <div className="relative">
        <input
          ref={inputRef}
          id={fieldId}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          autoComplete="off"
          value={value}
          placeholder={
            sections.length > 0 ? 'Chọn hoặc nhập tên mục…' : 'Nhập tên mục mới…'
          }
          onFocus={() => {
            if (!isOpen) openListbox();
          }}
          onClick={() => {
            if (!isOpen) openListbox();
          }}
          onChange={(e) => {
            const nextVal = e.target.value;
            onChange(nextVal);
            setIsOpen(true);
            setIsFiltering(true);
            const nextCleaned = nextVal.trim().replace(/\s+/g, ' ');
            const nextNorm = normalizeTitle(nextCleaned);
            if (!nextNorm) {
              setActiveIndex(0);
            } else {
              const generalOffset = normalizeTitle(GENERAL_LABEL).includes(nextNorm) ? 1 : 0;
              const matching = sections.filter((s) => normalizeTitle(s).includes(nextNorm));
              const exactIdx = matching.findIndex((s) => normalizeTitle(s) === nextNorm);
              setActiveIndex(exactIdx >= 0 ? generalOffset + exactIdx : 0);
            }
          }}
          onBlur={(e) => {
            if (!rootRef.current?.contains(e.relatedTarget as Node | null)) {
              closeListbox(true);
            }
          }}
          onKeyDown={handleKeyDown}
          className="h-9 w-full rounded-lg border border-input bg-background pl-3 pr-14 text-sm text-foreground placeholder:text-muted-foreground/80 transition-[border-color,box-shadow] duration-150 focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20 focus:outline-none"
        />

        <div className="absolute inset-y-0 right-1.5 flex items-center gap-0.5">
          {value.length > 0 && (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Đặt về mục Chung"
              title="Đặt về mục Chung"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange('');
                setIsFiltering(false);
                setActiveIndex(0);
                inputRef.current?.focus();
              }}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-95 cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            aria-label={isOpen ? 'Đóng danh sách mục' : 'Mở danh sách mục'}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (isOpen) {
                closeListbox(true);
              } else {
                inputRef.current?.focus();
                openListbox();
              }
            }}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-95 cursor-pointer"
          >
            <ChevronDown
              className={cn('size-3.5 transition-transform duration-150 motion-reduce:transition-none', isOpen && 'rotate-180')}
            />
          </button>
        </div>

        {isOpen && (
          <div
            id={listboxId}
            role="listbox"
            aria-label="Danh sách mục"
            onMouseDown={(e) => e.preventDefault()}
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-44 origin-top overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-1 text-xs text-popover-foreground shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-150 ease-out"
          >
            {options.map((opt, idx) => {
              const isSelected =
                (opt.kind === 'none' && !cleaned) ||
                (opt.kind === 'existing' && exactMatch === opt.value);
              const isActive = idx === clampedActiveIndex;

              return (
                <button
                  key={`${opt.kind}:${opt.value || '__none__'}`}
                  ref={(el) => {
                    optionRefs.current[idx] = el;
                  }}
                  id={`${listboxId}-option-${idx}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => selectOption(opt)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors cursor-pointer sm:py-1.5',
                    isActive ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted/70'
                  )}
                >
                  {opt.kind === 'create' ? (
                    <span className="flex min-w-0 items-center gap-1.5 font-medium text-[var(--editorial-accent)]">
                      <Plus className="size-3.5 shrink-0" />
                      <span className="truncate">Tạo mục mới &ldquo;{opt.label}&rdquo;</span>
                    </span>
                  ) : (
                    <span
                      className={cn(
                        'truncate',
                        opt.kind === 'none' && 'text-muted-foreground',
                        isSelected && 'font-medium text-foreground'
                      )}
                    >
                      {opt.label}
                    </span>
                  )}
                  {isSelected && <Check className="size-3.5 shrink-0 text-[var(--editorial-accent)]" />}
                </button>
              );
            })}

            {sections.length === 0 && !cleaned && (
              <p className="px-2.5 py-1.5 text-[0.6875rem] text-muted-foreground">
                Topic chưa có mục riêng — gõ tên ở ô trên để tạo mục mới.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
