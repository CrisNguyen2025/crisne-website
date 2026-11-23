"use client";

import React, { useState } from "react";
import Link from "next/link";
import { BookPlus, Loader2 } from "lucide-react";
import type { NewsItemDto } from "@/lib/news/schemas";
import { splitEmphasis } from "@/lib/news/emphasis";
import type { IntegrateRequest } from "@/lib/provenance/schemas";
import { lessonPath } from "@/lib/roadmap/paths";
import { LESSON_STATUSES, type LessonStatus } from "@/lib/roadmap/status";
import type { ChecklistItem, RoadmapMeta } from "@/lib/roadmap/types";
import { Sheet } from "@/components/ui/sheet";
import { SectionField } from "@/components/roadmap/SectionField";
import * as newsService from "@/logic/news/newsService";
import * as roadmapService from "@/logic/roadmap/roadmapService";

const MAX_STATEMENTS = 10;

const STATUS_LABEL: Record<LessonStatus, string> = {
  target: "Mục tiêu",
  learning: "Đang học",
  known: "Đã nắm",
};

const FIELD_CLASS =
  "h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const SECTION_LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";

type Mode = IntegrateRequest["mode"];

interface StatementDraft {
  /** The takeaway as the AI wrote it, without `**` markers: kept as the excerpt */
  original: string;
  text: string;
  isSelected: boolean;
}

function plainTakeaway(text: string): string {
  return splitEmphasis(text)
    .map((segment) => segment.text)
    .join("")
    .trim();
}

function toDrafts(takeaways: string[]): StatementDraft[] {
  return takeaways
    .map(plainTakeaway)
    .filter(Boolean)
    .slice(0, MAX_STATEMENTS)
    .map((text) => ({ original: text, text, isSelected: true }));
}

interface AddToLessonSheetProps {
  item: NewsItemDto;
  isDisabled?: boolean;
}

/**
 * "Đưa vào Lesson" (ADR-0017): the Owner picks which takeaways to keep, edits them, picks a new or existing
 * Lesson, checks a preview, then saves. Each saved sentence keeps where it came from. Data loads on the
 * Owner's actions (open, pick a Topic), not in an effect.
 */
export function AddToLessonSheet({ item, isDisabled = false }: AddToLessonSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"pick" | "preview" | "done">("pick");
  const [drafts, setDrafts] = useState<StatementDraft[]>([]);
  const [mode, setMode] = useState<Mode>("create_lesson");
  const [topics, setTopics] = useState<RoadmapMeta[]>([]);
  const [topicSlug, setTopicSlug] = useState("");
  const [sections, setSections] = useState<string[]>([]);
  const [lessons, setLessons] = useState<ChecklistItem[]>([]);
  const [section, setSection] = useState("");
  const [title, setTitle] = useState(item.title);
  const [status, setStatus] = useState<LessonStatus>("target");
  const [lessonId, setLessonId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const selected = drafts.filter((d) => d.isSelected && d.text.trim());
  const hasTarget = mode === "create_lesson" ? Boolean(topicSlug && title.trim()) : Boolean(topicSlug && lessonId);
  const canContinue = selected.length > 0 && selected.length <= MAX_STATEMENTS && hasTarget;
  const topicTitle = topics.find((t) => t.slug === topicSlug)?.title ?? topicSlug;
  const lessonTitle = lessons.find((l) => l.id === lessonId)?.title ?? "";

  const handleOpen = () => {
    setIsOpen(true);
    setStep("pick");
    setDrafts(toDrafts(item.takeaways));
    setTitle(item.title);
    setErrorMessage(null);
    setSavedPath(null);
    setIsLoading(true);
    roadmapService
      .fetchAllRoadmaps()
      .then((data) => setTopics(data.roadmaps))
      .catch(() => setErrorMessage("Không tải được danh sách Topic."))
      .finally(() => setIsLoading(false));
  };

  const handleTopicChange = (slug: string) => {
    setErrorMessage(null);
    setTopicSlug(slug);
    setSection("");
    setLessonId("");
    setSections([]);
    setLessons([]);
    if (!slug) return;
    setIsLoading(true);
    roadmapService
      .fetchRoadmapBySlug(slug, { mode: "outline" })
      .then((data) => {
        setSections(data.sections.filter((s): s is string => s !== null));
        setLessons(data.items);
      })
      .catch(() => setErrorMessage("Không tải được bài của Topic này."))
      .finally(() => setIsLoading(false));
  };

  const updateDraft = (index: number, patch: Partial<StatementDraft>) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const buildPayload = (): IntegrateRequest => {
    const statements = selected.map((d) => ({
      text: d.text.trim(),
      excerpt: d.original,
      authorType: d.text.trim() === d.original ? ("ai_generated" as const) : ("ai_assisted" as const),
    }));
    return mode === "create_lesson"
      ? { mode, roadmapSlug: topicSlug, section: section.trim() || null, title: title.trim(), status, statements }
      : { mode, lessonId, statements };
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    const result = await newsService.addNewsItemToLesson(item.id, buildPayload());
    setIsSubmitting(false);
    switch (result.kind) {
      case "created":
        setSavedPath(lessonPath(result.lesson.roadmapSlug, result.lesson.slug));
        setStep("done");
        break;
      case "duplicate":
        setErrorMessage(`Topic này đã có bài "${result.existing.title}". Đổi tiêu đề hoặc chọn "Nối vào bài có sẵn".`);
        setStep("pick");
        break;
      case "already_integrated":
        setErrorMessage("Bài tin này đã được đưa vào bài đó rồi.");
        setStep("pick");
        break;
      case "error":
        setErrorMessage(result.message);
        break;
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={isDisabled}
        onClick={handleOpen}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-accent hover:text-foreground active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
      >
        <BookPlus className="size-4" />
        Đưa vào Lesson
      </button>

      <Sheet open={isOpen} onClose={() => setIsOpen(false)} label="Đưa vào Lesson">
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold text-foreground">Đưa vào Lesson</h2>
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.title}</p>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {errorMessage && (
              <p role="alert" className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errorMessage}
              </p>
            )}

            {step === "pick" && (
              <>
                <section>
                  <h3 className={SECTION_LABEL}>
                    Ý sẽ đưa vào ({selected.length}/{MAX_STATEMENTS})
                  </h3>
                  {drafts.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">Bài tin này chưa có ý chính.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {drafts.map((draft, index) => (
                        <li key={index} className="flex gap-2">
                          <input
                            type="checkbox"
                            checked={draft.isSelected}
                            onChange={(e) => updateDraft(index, { isSelected: e.target.checked })}
                            aria-label={`Chọn ý ${index + 1}`}
                            className="mt-2 size-4 shrink-0"
                          />
                          <textarea
                            value={draft.text}
                            onChange={(e) => updateDraft(index, { text: e.target.value })}
                            aria-label={`Nội dung ý ${index + 1}`}
                            rows={2}
                            className="w-full resize-y rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="mt-5 space-y-3">
                  <div className="flex gap-2" role="radiogroup" aria-label="Cách đưa vào">
                    {(["create_lesson", "append_to_lesson"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={mode === value}
                        onClick={() => {
                          // An error about the previous target no longer applies
                          setErrorMessage(null);
                          setMode(value);
                        }}
                        className={`h-8 rounded-lg border px-3 text-sm transition-colors cursor-pointer ${
                          mode === value
                            ? "border-[var(--editorial-accent)] font-medium text-foreground"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {value === "create_lesson" ? "Tạo bài mới" : "Nối vào bài có sẵn"}
                      </button>
                    ))}
                  </div>

                  <label className="block text-sm">
                    <span className={SECTION_LABEL}>Topic</span>
                    <select
                      value={topicSlug}
                      onChange={(e) => handleTopicChange(e.target.value)}
                      className={`mt-1 ${FIELD_CLASS}`}
                    >
                      <option value="">Chọn Topic…</option>
                      {topics.map((topic) => (
                        <option key={topic.slug} value={topic.slug}>
                          {topic.title}
                        </option>
                      ))}
                    </select>
                  </label>

                  {mode === "create_lesson" ? (
                    <>
                      {/* SectionField has its own "Mục" label */}
                      <SectionField value={section} onChange={setSection} sections={sections} />
                      <label className="block text-sm">
                        <span className={SECTION_LABEL}>Tiêu đề bài</span>
                        <input
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          className={`mt-1 ${FIELD_CLASS}`}
                        />
                      </label>
                      <label className="block text-sm">
                        <span className={SECTION_LABEL}>Lesson Status</span>
                        <select
                          value={status}
                          onChange={(e) => setStatus(e.target.value as LessonStatus)}
                          className={`mt-1 ${FIELD_CLASS}`}
                        >
                          {LESSON_STATUSES.map((value) => (
                            <option key={value} value={value}>
                              {STATUS_LABEL[value]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  ) : (
                    <label className="block text-sm">
                      <span className={SECTION_LABEL}>Bài</span>
                      <select
                        value={lessonId}
                        onChange={(e) => setLessonId(e.target.value)}
                        disabled={!topicSlug}
                        className={`mt-1 ${FIELD_CLASS}`}
                      >
                        <option value="">Chọn bài…</option>
                        {lessons.map((lesson) => (
                          <option key={lesson.id} value={lesson.id}>
                            {lesson.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {isLoading && (
                    <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" /> Đang tải…
                    </p>
                  )}
                </section>
              </>
            )}

            {step === "preview" && (
              <section aria-label="Xem trước">
                <h3 className={SECTION_LABEL}>Xem trước</h3>
                <p className="mt-2 text-sm text-foreground">
                  {mode === "create_lesson"
                    ? `Tạo bài "${title.trim()}" trong ${topicTitle}${section.trim() ? ` › ${section.trim()}` : ""} (${STATUS_LABEL[status]}).`
                    : `Nối vào cuối bài "${lessonTitle}" trong ${topicTitle}.`}
                </p>
                <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-foreground">
                  {selected.map((draft, index) => (
                    <li key={index}>{draft.text.trim()}</li>
                  ))}
                </ol>
                <p className="mt-3 text-xs text-muted-foreground">
                  Mỗi câu giữ nguồn: {item.domain}. Chỉ Owner thấy nguồn trên trang bài.
                </p>
              </section>
            )}

            {step === "done" && savedPath && (
              <section className="text-sm">
                <p className="font-medium text-foreground">Đã đưa {selected.length} ý vào Lesson.</p>
                <Link href={savedPath} className="mt-2 inline-block text-[var(--editorial-accent)] hover:underline">
                  Mở bài
                </Link>
              </section>
            )}
          </div>

          <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
            {step === "pick" && (
              <>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="h-9 rounded-lg px-3 text-sm text-muted-foreground hover:bg-accent cursor-pointer"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  disabled={!canContinue}
                  onClick={() => {
                    setErrorMessage(null);
                    setStep("preview");
                  }}
                  className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
                >
                  Xem trước
                </button>
              </>
            )}
            {step === "preview" && (
              <>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setStep("pick")}
                  className="h-9 rounded-lg px-3 text-sm text-muted-foreground hover:bg-accent cursor-pointer"
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void handleSave()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                  Lưu vào Lesson
                </button>
              </>
            )}
            {step === "done" && (
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="h-9 rounded-lg px-3 text-sm text-muted-foreground hover:bg-accent cursor-pointer"
              >
                Đóng
              </button>
            )}
          </footer>
        </div>
      </Sheet>
    </>
  );
}
