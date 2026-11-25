'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, RefreshCw, X } from 'lucide-react';
import { lessonPath } from '@/lib/roadmap/paths';
import { sectionSpelling } from '@/lib/roadmap/sections';
import { normalizeTitle } from '@/lib/roadmap/titles';
import { ChecklistItem, RoadmapMeta } from '@/lib/roadmap/types';
import { getScrollBehavior, slugify } from '@/lib/utils';
import { Sheet } from '@/components/ui/sheet';
import { useMediaQuery, MOBILE_VIEWPORT_QUERY } from '@/hooks/use-media-query';
import {
  ROADMAP_GHOST_BTN_CLASS,
  ROADMAP_INPUT_CLASS,
  ROADMAP_MODAL_TITLE_CLASS,
  ROADMAP_PRIMARY_BTN_CLASS,
  ROADMAP_TEXTAREA_CLASS,
  RoadmapFieldLabel,
  RoadmapFormError,
} from './RoadmapFormPrimitives';
import { SectionField } from './SectionField';

export interface EditItemInfoSubmitOptions {
  roadmapSlug?: string;
  slug?: string;
}

interface EditItemInfoDrawerProps {
  isOpen: boolean;
  item: ChecklistItem | null;
  sections: string[];
  topics?: RoadmapMeta[];
  currentTopicSlug?: string;
  onClose: () => void;
  onSubmit: (
    id: string,
    title: string,
    description: string,
    section?: string | null,
    options?: EditItemInfoSubmitOptions
  ) => void | Promise<void>;
}

function resolveTopicSections(
  topics: RoadmapMeta[] | undefined,
  topicSlug: string,
  initialTopicSlug: string,
  fallbackSections: string[]
): string[] {
  const found = topics?.find((t) => t.slug === topicSlug);
  if (found?.sectionNames) return found.sectionNames;
  return topicSlug === initialTopicSlug ? fallbackSections : [];
}

function resolveSectionOnTopicSwitch(
  currentSection: string,
  nextTopicSections: string[],
  nextTopicSlug: string,
  initialTopicSlug: string,
  originalSection: string | null | undefined
): string {
  const matchedInTarget = currentSection.trim()
    ? nextTopicSections.find((s) => normalizeTitle(s) === normalizeTitle(currentSection))
    : undefined;
  if (matchedInTarget) return matchedInTarget;
  return nextTopicSlug === initialTopicSlug ? (originalSection ?? '') : '';
}

function validateEditItemInfo(
  title: string,
  rawSlug: string,
  normalizedSlug: string
): string | null {
  if (!title.trim()) return 'Nhập tiêu đề bài học.';
  if (!rawSlug) {
    return 'Slug URL không được để trống. Nhập slug hoặc bấm "Đồng bộ từ tiêu đề".';
  }
  if (!normalizedSlug) return 'Slug URL không hợp lệ.';
  return null;
}

function buildEditItemOptions(
  topicChanged: boolean,
  slugChanged: boolean,
  topicSlug: string,
  normalizedSlug: string
): EditItemInfoSubmitOptions | undefined {
  if (!topicChanged && !slugChanged) return undefined;
  return {
    ...(topicChanged ? { roadmapSlug: topicSlug } : {}),
    ...(slugChanged ? { slug: normalizedSlug } : {}),
  };
}

function SlugStatusHint({
  rawSlug,
  normalizedSlug,
  hasPathChanged,
  topicSlug,
  initialTopicSlug,
  originalSlug,
}: {
  rawSlug: string;
  normalizedSlug: string;
  hasPathChanged: boolean;
  topicSlug: string;
  initialTopicSlug: string;
  originalSlug: string;
}) {
  if (!rawSlug) {
    return (
      <p className="text-[0.6875rem] leading-relaxed text-destructive">
        Slug URL đang để trống — nhập slug hoặc bấm &ldquo;Đồng bộ từ tiêu đề&rdquo;.
      </p>
    );
  }
  if (!normalizedSlug) {
    return (
      <p className="text-[0.6875rem] leading-relaxed text-destructive">
        Slug URL không hợp lệ (cần chứa chữ cái hoặc chữ số).
      </p>
    );
  }
  if (hasPathChanged) {
    return (
      <div className="space-y-0.5 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-[0.6875rem] leading-relaxed">
        <p className="break-all font-mono text-foreground/90">
          {lessonPath(topicSlug, normalizedSlug)}
        </p>
        <p className="text-muted-foreground">
          Tự động chuyển hướng 308 từ {lessonPath(initialTopicSlug, originalSlug)}.
        </p>
      </div>
    );
  }
  return (
    <p className="break-all font-mono text-[0.6875rem] text-muted-foreground">
      {lessonPath(topicSlug, normalizedSlug)}
    </p>
  );
}

function normalizeSaveErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Không lưu được thay đổi. Vui lòng thử lại.';
}

async function runItemInfoSubmit({
  onSubmit,
  item,
  title,
  description,
  nextSection,
  shouldSendSection,
  options,
  onClose,
  setIsSaving,
  setError,
}: {
  onSubmit: EditItemInfoDrawerProps['onSubmit'];
  item: ChecklistItem;
  title: string;
  description: string;
  nextSection: string | null;
  shouldSendSection: boolean;
  options: EditItemInfoSubmitOptions | undefined;
  onClose: () => void;
  setIsSaving: (saving: boolean) => void;
  setError: (msg: string) => void;
}) {
  try {
    setIsSaving(true);
    setError('');
    await onSubmit(
      item.id,
      title.trim(),
      description.trim(),
      shouldSendSection ? nextSection : undefined,
      options
    );
    onClose();
  } catch (err) {
    setError(normalizeSaveErrorMessage(err));
  } finally {
    setIsSaving(false);
  }
}

const NOOP = () => {};

function useDelayedFocusOnOpen(
  inputRef: React.RefObject<HTMLInputElement | null>,
  shouldFocus: boolean
) {
  useEffect(() => {
    if (!shouldFocus) return;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [inputRef, shouldFocus]);
}

function EditItemInfoForm({
  isOpen,
  item,
  sections,
  topics,
  currentTopicSlug,
  onClose,
  onAfterClose,
  onSubmit,
}: {
  isOpen: boolean;
  item: ChecklistItem;
  sections: string[];
  topics?: RoadmapMeta[];
  currentTopicSlug?: string;
  onClose: () => void;
  onAfterClose: () => void;
  onSubmit: EditItemInfoDrawerProps['onSubmit'];
}) {
  const isMobile = useMediaQuery(MOBILE_VIEWPORT_QUERY);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const topicFieldId = useId();
  const titleFieldId = useId();
  const slugFieldId = useId();
  const descriptionFieldId = useId();
  const errorId = useId();

  useDelayedFocusOnOpen(titleInputRef, isOpen && !isMobile);

  const initialTopicSlug = currentTopicSlug ?? item.roadmapSlug ?? '';
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [section, setSection] = useState(item.section ?? '');
  const [topicSlug, setTopicSlug] = useState(initialTopicSlug);
  const [slug, setSlug] = useState(item.slug);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView?.({ behavior: getScrollBehavior(), block: 'nearest' });
    }
  }, [error]);

  const activeSections = resolveTopicSections(topics, topicSlug, initialTopicSlug, sections);

  const rawSlug = slug.trim();
  const normalizedSlug = slugify(rawSlug);
  const titleSuggestedSlug = slugify(title);
  const hasPathChanged = Boolean(
    normalizedSlug && (normalizedSlug !== item.slug || topicSlug !== initialTopicSlug)
  );

  const handleTopicChange = (nextTopicSlug: string) => {
    setTopicSlug(nextTopicSlug);
    const nextTopicSections = resolveTopicSections(
      topics,
      nextTopicSlug,
      initialTopicSlug,
      sections
    );
    setSection(
      resolveSectionOnTopicSwitch(
        section,
        nextTopicSections,
        nextTopicSlug,
        initialTopicSlug,
        item.section
      )
    );
  };

  const submitInfo = async () => {
    if (isSaving) return;
    const validationError = validateEditItemInfo(title, rawSlug, normalizedSlug);
    if (validationError) {
      setError(validationError);
      return;
    }

    const nextSection = sectionSpelling(activeSections, section);
    const sectionChanged = nextSection !== (item.section ?? null);
    const topicChanged = Boolean(topicSlug && initialTopicSlug && topicSlug !== initialTopicSlug);
    const slugChanged = Boolean(normalizedSlug && normalizedSlug !== item.slug);
    const options = buildEditItemOptions(topicChanged, slugChanged, topicSlug, normalizedSlug);

    await runItemInfoSubmit({
      onSubmit,
      item,
      title,
      description,
      nextSection,
      shouldSendSection: sectionChanged || topicChanged,
      options,
      onClose,
      setIsSaving,
      setError,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitInfo();
  };

  return (
    <Sheet
      open={isOpen}
      onClose={isSaving ? NOOP : onClose}
      onAfterClose={onAfterClose}
      side={isMobile ? 'bottom' : 'right'}
      label="Chỉnh sửa bài học"
      className={isMobile ? 'roadmap-theme max-h-[90dvh]' : 'roadmap-theme sm:max-w-md md:max-w-[27.5rem]'}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
        <h2 className={`${ROADMAP_MODAL_TITLE_CLASS} truncate`}>Chỉnh sửa bài học</h2>

        <button
          type="button"
          disabled={isSaving}
          onClick={onClose}
          className="-mr-1 rounded-lg p-1.5 text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
          title="Đóng (Esc)"
          aria-label="Đóng"
        >
          <X className="size-4" />
        </button>
      </div>

      <form
        id="edit-item-info-form"
        noValidate
        onSubmit={handleSubmit}
        className="flex-1 space-y-4 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] p-5 motion-safe:animate-in motion-safe:fade-in duration-200 ease-out"
      >
        <RoadmapFormError id={errorId} ref={errorRef} message={error} />

        {topics && topics.length > 0 && (
          <div className="space-y-1.5">
            <RoadmapFieldLabel htmlFor={topicFieldId}>Topic</RoadmapFieldLabel>
            <div className="relative">
              <select
                id={topicFieldId}
                disabled={isSaving}
                value={topicSlug}
                onChange={(e) => handleTopicChange(e.target.value)}
                className={`${ROADMAP_INPUT_CLASS} appearance-none pr-9 cursor-pointer`}
              >
                {topics.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.title}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          </div>
        )}

        <SectionField value={section} onChange={setSection} sections={activeSections} />

        <div className="space-y-1.5">
          <RoadmapFieldLabel htmlFor={titleFieldId} required>
            Tiêu đề
          </RoadmapFieldLabel>
          <input
            ref={titleInputRef}
            id={titleFieldId}
            type="text"
            required
            aria-invalid={Boolean(error && !title.trim()) || undefined}
            aria-describedby={error && !title.trim() ? errorId : undefined}
            disabled={isSaving}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError('');
            }}
            placeholder="Attention mechanism"
            className={`${ROADMAP_INPUT_CLASS} font-medium`}
          />
        </div>

        <div className="space-y-1.5">
          <RoadmapFieldLabel
            htmlFor={slugFieldId}
            required
            trailing={
              <button
                type="button"
                disabled={isSaving || !titleSuggestedSlug}
                onClick={() => {
                  if (titleSuggestedSlug) {
                    setSlug(titleSuggestedSlug);
                    if (error) setError('');
                  }
                }}
                className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-muted-foreground transition-[color,transform] duration-150 hover:text-foreground active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 cursor-pointer"
              >
                <RefreshCw className="size-3" />
                <span>Đồng bộ từ tiêu đề</span>
              </button>
            }
          >
            Slug URL
          </RoadmapFieldLabel>
          <input
            id={slugFieldId}
            type="text"
            required
            aria-invalid={!rawSlug || !normalizedSlug || undefined}
            aria-describedby={error ? errorId : undefined}
            disabled={isSaving}
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              if (error) setError('');
            }}
            placeholder="attention-mechanism"
            className={`${ROADMAP_INPUT_CLASS} font-mono text-[0.8125rem]`}
          />
          <SlugStatusHint
            rawSlug={rawSlug}
            normalizedSlug={normalizedSlug}
            hasPathChanged={hasPathChanged}
            topicSlug={topicSlug}
            initialTopicSlug={initialTopicSlug}
            originalSlug={item.slug}
          />
        </div>

        <div className="space-y-1.5">
          <RoadmapFieldLabel htmlFor={descriptionFieldId}>Mô tả ngắn</RoadmapFieldLabel>
          <textarea
            id={descriptionFieldId}
            disabled={isSaving}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void submitInfo();
              }
            }}
            rows={4}
            placeholder="Tóm tắt ngắn…"
            className={`${ROADMAP_TEXTAREA_CLASS} resize-y`}
          />
        </div>
      </form>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-muted/10 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClose}
          disabled={isSaving}
          className={ROADMAP_GHOST_BTN_CLASS}
        >
          Hủy
        </button>
        <button
          type="submit"
          form="edit-item-info-form"
          disabled={isSaving}
          className={ROADMAP_PRIMARY_BTN_CLASS}
        >
          {isSaving ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="size-3.5" aria-hidden="true" />
          )}
          <span>{isSaving ? 'Đang lưu…' : 'Lưu thay đổi'}</span>
        </button>
      </div>
    </Sheet>
  );
}

export function EditItemInfoDrawer({
  isOpen,
  item,
  sections,
  topics,
  currentTopicSlug,
  onClose,
  onSubmit,
}: EditItemInfoDrawerProps) {
  const isActive = isOpen && Boolean(item);
  const [renderedItem, setRenderedItem] = useState<ChecklistItem | null>(
    isActive ? item : null
  );
  const [wasActive, setWasActive] = useState(isActive);
  const [sessionId, setSessionId] = useState(0);

  if (isActive !== wasActive) {
    setWasActive(isActive);
    if (isActive && item) {
      setRenderedItem(item);
      setSessionId((prev) => prev + 1);
    }
  } else if (isActive && item && renderedItem !== item) {
    setRenderedItem(item);
  }

  const handleAfterClose = useCallback(() => {
    setRenderedItem(null);
  }, []);

  if (!renderedItem) return null;

  return (
    <EditItemInfoForm
      key={`${renderedItem.id}:${sessionId}`}
      isOpen={isActive}
      item={renderedItem}
      sections={sections}
      topics={topics}
      currentTopicSlug={currentTopicSlug}
      onClose={onClose}
      onAfterClose={handleAfterClose}
      onSubmit={onSubmit}
    />
  );
}
