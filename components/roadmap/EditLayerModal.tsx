'use client';

import React, { useState, useEffect } from 'react';
import { X, Layers, Tag, AlignLeft } from 'lucide-react';
import { RoadmapLayer } from '@/lib/roadmap/types';

interface EditLayerModalProps {
  isOpen: boolean;
  layer: RoadmapLayer | null;
  onClose: () => void;
  onSubmit: (layerId: string, title: string, shortTag: string, subtitle?: string) => void;
}

export function EditLayerModal({ isOpen, layer, onClose, onSubmit }: EditLayerModalProps) {
  const [title, setTitle] = useState('');
  const [shortTag, setShortTag] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (layer) {
      setTitle(layer.title);
      setShortTag(layer.shortTag);
      setSubtitle(layer.subtitle || '');
      setError('');
    }
  }, [layer]);

  if (!isOpen || !layer) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Vui lòng nhập tên Tầng kiến trúc.');
      return;
    }
    if (!shortTag.trim()) {
      setError('Vui lòng nhập short-tag.');
      return;
    }

    onSubmit(layer.id, title.trim(), shortTag.trim(), subtitle.trim());
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-card border border-border/80 rounded-2xl shadow-xl overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Layers className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-foreground">Chỉnh sửa Tầng Kiến trúc</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="text-xs text-rose-500 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="space-y-1">
            <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-primary" /> Tên Tầng (Title) *
            </label>
            <input
              type="text"
              placeholder="VD: 01. Tầng dữ liệu & Lưu trữ (Data Layer)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-primary" /> Mã Short-tag (phục vụ filter segment) *
            </label>
            <input
              type="text"
              placeholder="VD: 01-DB"
              value={shortTag}
              onChange={(e) => setShortTag(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground uppercase"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <AlignLeft className="w-3.5 h-3.5 text-primary" /> Mô tả ngắn / Subtitle (Tùy chọn)
            </label>
            <textarea
              placeholder="VD: Các giải pháp lưu trữ vector, cơ sở dữ liệu..."
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-medium transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-xs transition-colors"
            >
              Cập nhật
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
