'use client';

import React, { useId, useState } from 'react';
import { X, Check, Edit3, AlignLeft, Link2, Layers, RefreshCw } from 'lucide-react';
import { sectionSpelling } from '@/lib/roadmap/sections';
import { normalizeTitle } from '@/lib/roadmap/titles';
import { ChecklistItem, RoadmapMeta } from '@/lib/roadmap/types';
import { SectionField } from './SectionField';
import { Sheet } from '@/components/ui/sheet';
import { useMediaQuery, MOBILE_VIEWPORT_QUERY } from '@/hooks/use-media-query';
import { slugify } from '@/lib/utils';
import { lessonPath } from '@/lib/roadmap/paths';

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

function EditItemInfoForm({
  item,
  sections,
  topics,
  currentTopicSlug,
  onClose,
  onSubmit,
}: {
  item: ChecklistItem;
  sections: string[];
  topics?: RoadmapMeta[];
  currentTopicSlug?: string;
  onClose: () => void;
  onSubmit: EditItemInfoDrawerProps['onSubmit'];
}) {
  const isMobile = useMediaQuery(MOBILE_VIEWPORT_QUERY);
  const topicFieldId = useId();
  const titleFieldId = useId();
  const slugFieldId = useId();
  const descriptionFieldId = useId();

  const initialTopicSlug = currentTopicSlug ?? item.roadmapSlug ?? '';
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [section, setSection] = useState(item.section ?? '');
  const [topicSlug, setTopicSlug] = useState(initialTopicSlug);
  const [slug, setSlug] = useState(item.slug);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedTopic = topics?.find((t) => t.slug === topicSlug);
  const activeSections =
    selectedTopic?.sectionNames ?? (topicSlug === initialTopicSlug ? sections : []);

  const rawSlug = slug.trim();
  const normalizedSlug = slugify(rawSlug);
  const titleSuggestedSlug = slugify(title);

  const handleTopicChange = (nextTopicSlug: string) => {
    setTopicSlug(nextTopicSlug);
    const nextTopic = topics?.find((t) => t.slug === nextTopicSlug);
    const nextTopicSections =
      nextTopic?.sectionNames ?? (nextTopicSlug === initialTopicSlug ? sections : []);
    const matchedInTarget = section.trim()
      ? nextTopicSections.find((s) => normalizeTitle(s) === normalizeTitle(section))
      : undefined;

    if (matchedInTarget) {
      setSection(matchedInTarget);
    } else if (nextTopicSlug === initialTopicSlug) {
      setSection(item.section ?? '');
    } else {
      setSection('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Nhập tiêu đề bài học.');
      return;
    }

    if (!rawSlug) {
      setError('Slug URL không được để trống. Nhập slug hoặc bấm "Đồng bộ từ tiêu đề".');
      return;
    }

    if (!normalizedSlug) {
      setError('Slug URL không hợp lệ.');
      return;
    }

    const nextSection = sectionSpelling(activeSections, section);
    const sectionChanged = nextSection !== (item.section ?? null);
    const topicChanged = Boolean(topicSlug && initialTopicSlug && topicSlug !== initialTopicSlug);
    const slugChanged = Boolean(normalizedSlug && normalizedSlug !== item.slug);

    const options: EditItemInfoSubmitOptions | undefined =
      topicChanged || slugChanged
        ? {
            ...(topicChanged ? { roadmapSlug: topicSlug } : {}),
            ...(slugChanged ? { slug: normalizedSlug } : {}),
          }
        : undefined;

    try {
      setIsSaving(true);
      setError('');
      await onSubmit(
        item.id,
        title.trim(),
        description.trim(),
        sectionChanged || topicChanged ? nextSection : undefined,
        options
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được thay đổi. Vui lòng thử lại.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      side={isMobile ? 'bottom' : 'right'}
      label="Edit lesson"
      className={isMobile ? 'roadmap-theme max-h-[90dvh]' : 'roadmap-theme sm:max-w-md md:max-w-[27.5rem]'}
    >
      <div className="px-5 py-3.5 border-b border-border bg-muted/20 flex items-center justify-between shrink-0 min-h-[3.5625rem]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
            <Edit3 className="size-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-foreground truncate">Chỉnh sửa bài học</h3>
            <p className="text-xs text-muted-foreground font-mono truncate">{item.slug}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          title="Đóng (Esc)"
          aria-label="Đóng"
        >
          <X className="size-4" />
        </button>
      </div>

      <form id="edit-item-info-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
        {error && (
          <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl">
            {error}
          </div>
        )}

        {topics && topics.length > 0 && (
          <div className="space-y-1.5">
            <label
              htmlFor={topicFieldId}
              className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"
            >
              <Layers className="size-3.5 text-primary" />
              <span>Topic</span>
            </label>
            <select
              id={topicFieldId}
              value={topicSlug}
              onChange={(e) => handleTopicChange(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-foreground"
            >
              {topics.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <SectionField value={section} onChange={setSection} sections={activeSections} />

        <div className="space-y-1.5">
          <label
            htmlFor={titleFieldId}
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
          >
            Tiêu đề
          </label>
          <input
            id={titleFieldId}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Attention mechanism"
            autoFocus
            className="w-full text-sm font-semibold px-3.5 py-2 rounded-lg bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none text-foreground transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={slugFieldId}
              className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"
            >
              <Link2 className="size-3.5 text-primary" />
              <span>Slug URL</span>
            </label>
            <button
              type="button"
              disabled={!titleSuggestedSlug}
              onClick={() => {
                if (titleSuggestedSlug) {
                  setSlug(titleSuggestedSlug);
                  if (error) setError('');
                }
              }}
              className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
            >
              <RefreshCw className="size-3" />
              <span>Đồng bộ từ tiêu đề</span>
            </button>
          </div>
          <input
            id={slugFieldId}
            type="text"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              if (error) setError('');
            }}
            placeholder="attention-mechanism"
            className="w-full text-xs font-mono px-3.5 py-2 rounded-lg bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none text-foreground transition-colors"
          />
          {!rawSlug ? (
            <p className="text-[0.6875rem] text-destructive leading-relaxed">
              Slug URL đang để trống — nhập slug hoặc bấm &ldquo;Đồng bộ từ tiêu đề&rdquo;.
            </p>
          ) : !normalizedSlug ? (
            <p className="text-[0.6875rem] text-destructive leading-relaxed">
              Slug URL không hợp lệ (cần chứa chữ cái hoặc chữ số).
            </p>
          ) : (
            <div className="space-y-0.5 text-[0.6875rem] leading-relaxed">
              <p className="font-mono text-foreground/85 break-all">{lessonPath(topicSlug, normalizedSlug)}</p>
              <p className="text-muted-foreground">
                {normalizedSlug !== item.slug || topicSlug !== initialTopicSlug
                  ? `Tự động chuyển hướng 308 từ ${lessonPath(initialTopicSlug, item.slug)}.`
                  : 'Giữ nguyên để ổn định link SEO.'}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor={descriptionFieldId}
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"
          >
            <AlignLeft className="size-3.5 text-primary" />
            <span>Mô tả ngắn</span>
          </label>
          <textarea
            id={descriptionFieldId}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Mô tả ngắn gọn về khái niệm trong bài học..."
            className="w-full text-xs px-3.5 py-2.5 rounded-lg bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none text-foreground leading-relaxed resize-y transition-colors"
          />
        </div>
      </form>

      <div className="p-4 px-5 border-t border-border bg-muted/10 shrink-0 flex items-center justify-end gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClose}
          disabled={isSaving}
          className="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
        >
          Hủy
        </button>
        <button
          type="submit"
          form="edit-item-info-form"
          disabled={isSaving}
          className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <Check className="size-3.5" /> {isSaving ? 'Đang lưu…' : 'Lưu thay đổi'}
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
  if (!isOpen || !item) return null;
  return (
    <EditItemInfoForm
      key={item.id}
      item={item}
      sections={sections}
      topics={topics}
      currentTopicSlug={currentTopicSlug}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}
