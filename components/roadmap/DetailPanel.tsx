'use client';

import React, { useState } from 'react';
import {
  Edit3,
  Clock,
  History,
  Trash2,
  Check,
  X,
  FileText,
  AlignLeft,
  ChevronRight,
  Folder,
  ChevronUp,
} from 'lucide-react';
import { ChecklistItem, RoadmapLevel } from '@/lib/roadmap/types';
import { formatFriendlyTime, formatExactDate } from '@/lib/roadmap/date-utils';

interface DetailPanelProps {
  item: (ChecklistItem & { layerTitle?: string; groupTitle?: string }) | null;
  onUpdateNote?: (id: string, text: string) => void;
  onEditItem?: (
    id: string,
    title: string,
    description: string,
    level?: RoadmapLevel,
    content?: string
  ) => void;
  onDeleteItem?: (id: string) => void;
}

export function DetailPanel({
  item,
  onEditItem,
  onDeleteItem,
}: DetailPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editLevel, setEditLevel] = useState<RoadmapLevel>('core');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (item) {
      setEditTitle(item.title);
      setEditDescription(item.description);
      setEditContent(item.content || '');
      setEditLevel(item.level);
      setIsEditing(false);
      containerRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [item?.id]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollTop = e.currentTarget.scrollTop;
    setShowScrollTop(currentScrollTop > 240);
  };

  const scrollToTop = () => {
    containerRef.current?.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  if (!item) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground h-full">
        <div className="w-12 h-12 rounded-2xl bg-muted/50 border border-border/40 flex items-center justify-center mb-3">
          <FileText className="w-6 h-6 text-muted-foreground/60" />
        </div>
        <h3 className="font-semibold text-sm text-foreground mb-1">Chưa chọn khái niệm nào</h3>
        <p className="text-xs max-w-xs text-muted-foreground">
          Vui lòng bấm chọn một mục ở danh sách bên trái để xem nội dung hoặc chỉnh sửa.
        </p>
      </div>
    );
  }

  const handleSaveEdit = () => {
    if (onEditItem && editTitle.trim()) {
      onEditItem(item.id, editTitle.trim(), editDescription.trim(), editLevel, editContent);
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditTitle(item.title);
    setEditDescription(item.description);
    setEditContent(item.content || '');
    setEditLevel(item.level);
    setIsEditing(false);
  };

  const getLevelBadge = (level: RoadmapLevel) => {
    switch (level) {
      case 'core':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.6875rem] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Core (Nền tảng)
          </span>
        );
      case 'intermediate':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.6875rem] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Trung cấp
          </span>
        );
      case 'advanced':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.6875rem] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Nâng cao
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.6875rem] font-semibold bg-primary/10 text-primary border border-primary/20">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            {(item as unknown as { groupTitle?: string })?.groupTitle || level}
          </span>
        );
    }
  };

  return (
    <div className="flex-1 relative h-full flex flex-col overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 flex flex-col h-full overflow-y-auto scrollbar-thin"
      >
      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 px-6 py-3.5 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium truncate">
          <div className="flex items-center gap-1.5 text-foreground/80 hover:text-foreground shrink-0">
            <Folder className="w-3.5 h-3.5 text-primary" />
            <span className="truncate max-w-[8.75rem] md:max-w-[13.75rem]">
              {item.layerTitle || 'Architecture Layer'}
            </span>
          </div>

          <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />

          <div className="text-muted-foreground hover:text-foreground shrink-0">
            <span className="truncate max-w-[7.5rem] md:max-w-[11.25rem] font-medium">
              {item.groupTitle || (item.level === 'core' ? 'Core' : item.level === 'intermediate' ? 'Trung cấp' : item.level === 'advanced' ? 'Nâng cao' : item.level)}
            </span>
          </div>

          <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />

          <span className="text-foreground font-semibold truncate max-w-[10rem] md:max-w-[15rem]">
            {item.title}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isEditing ? (
            <>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 rounded-lg border border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-semibold flex items-center gap-1.5 transition-colors"
                title="Chỉnh sửa thông tin khái niệm"
              >
                <Edit3 className="w-3.5 h-3.5 text-primary" />
                <span>Chỉnh sửa</span>
              </button>

              {onDeleteItem && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Bạn có chắc chắn muốn xóa "${item.title}"?`)) {
                      onDeleteItem(item.id);
                    }
                  }}
                  className="p-1.5 rounded-lg border border-rose-500/20 hover:bg-rose-500/10 text-rose-500 text-xs font-medium transition-colors"
                  title="Xóa khái niệm này"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold rounded-lg flex items-center gap-1 shadow-xs transition-colors"
              >
                <Check className="w-3.5 h-3.5" /> Lưu lại
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-medium rounded-lg flex items-center gap-1 transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Hủy
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 md:p-8 space-y-6 max-w-[90%] md:max-w-[85%] w-full mx-auto">
        {isEditing ? (
          <div className="rounded-2xl border border-primary/30 bg-card p-6 shadow-sm space-y-5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-border/40">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <Edit3 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-foreground">Chỉnh sửa Khái niệm</h3>
              </div>
              <span className="text-[0.6875rem] text-muted-foreground font-mono">ID: {item.id}</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Phân loại Cấp độ
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setEditLevel('core')}
                  className={`py-1.5 px-3 rounded-xl border text-xs font-medium transition-all ${
                    editLevel === 'core'
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-bold shadow-xs'
                      : 'bg-background border-border/60 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  🟢 Core (Nền tảng)
                </button>
                <button
                  type="button"
                  onClick={() => setEditLevel('intermediate')}
                  className={`py-1.5 px-3 rounded-xl border text-xs font-medium transition-all ${
                    editLevel === 'intermediate'
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400 font-bold shadow-xs'
                      : 'bg-background border-border/60 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  🟡 Trung cấp
                </button>
                <button
                  type="button"
                  onClick={() => setEditLevel('advanced')}
                  className={`py-1.5 px-3 rounded-xl border text-xs font-medium transition-all ${
                    editLevel === 'advanced'
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-600 dark:text-rose-400 font-bold shadow-xs'
                      : 'bg-background border-border/60 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  🔴 Nâng cao
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-primary" /> Tiêu đề thuật ngữ
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Nhập tiêu đề thuật ngữ..."
                className="w-full text-base font-bold px-4 py-2.5 rounded-xl bg-background border border-border/70 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none text-foreground transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <AlignLeft className="w-3.5 h-3.5 text-primary" /> Mô tả ngắn (Dưới tiêu đề)
              </label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                placeholder="Nhập tóm tắt mô tả ngắn..."
                className="w-full text-xs font-mono px-4 py-2.5 rounded-xl bg-background border border-border/70 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none text-foreground leading-relaxed resize-y transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-primary" /> Nội dung chi tiết (Mặc định ban đầu rỗng)
              </label>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={8}
                placeholder="Nhập nội dung chi tiết, ghi chú, kiến thức thực tế..."
                className="w-full text-xs font-mono px-4 py-3 rounded-xl bg-background border border-border/70 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none text-foreground leading-relaxed resize-y transition-all"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" /> Lưu thay đổi
              </button>
            </div>
          </div>
        ) : (
          <article className="space-y-6">
            <header className="space-y-3 pb-6 border-b border-border/40">
              <div className="flex items-center gap-2">
                {getLevelBadge(item.level)}
              </div>

              <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight text-foreground leading-tight">
                {item.title}
              </h1>

              {item.description && (
                <p className="text-sm md:text-base leading-relaxed text-muted-foreground font-normal">
                  {item.description}
                </p>
              )}

              <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground/75 pt-1">
                <span
                  className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                  title={`Ngày tạo: ${formatExactDate(item.createdAt)}`}
                >
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  Tạo {formatFriendlyTime(item.createdAt)}
                </span>
                <span className="text-muted-foreground/30">•</span>
                <span
                  className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                  title={`Cập nhật lần cuối: ${formatExactDate(item.updatedAt)}`}
                >
                  <History className="w-3.5 h-3.5 text-emerald-500" />
                  Cập nhật {formatFriendlyTime(item.updatedAt)}
                </span>
              </div>
            </header>

            {item.content ? (
              <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none text-foreground/90 whitespace-pre-line leading-relaxed">
                {item.content}
              </div>
            ) : null}
          </article>
        )}
      </div>
    </div>

    {showScrollTop && (
      <button
        type="button"
        onClick={scrollToTop}
        className="absolute bottom-5 right-5 z-30 p-2.5 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all duration-200 border border-border/20 flex items-center justify-center animate-in fade-in zoom-in-75 cursor-pointer"
        title="Cuộn lên đầu trang"
        aria-label="Cuộn lên đầu trang"
      >
        <ChevronUp className="w-4 h-4 stroke-[2.5]" />
      </button>
    )}
  </div>
);
}
