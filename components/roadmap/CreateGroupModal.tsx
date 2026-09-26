'use client';

import React, { useState } from 'react';
import { X, FolderPlus } from 'lucide-react';
import { RoadmapLayer } from '@/lib/roadmap/types';

interface CreateGroupModalProps {
  isOpen: boolean;
  layer: RoadmapLayer | null;
  onClose: () => void;
  onSubmit: (layerId: string, title: string) => void;
}

export function CreateGroupModal({
  isOpen,
  layer,
  onClose,
  onSubmit,
}: CreateGroupModalProps) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  if (!isOpen || !layer) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Vui lòng nhập tên Nhóm cấp độ.');
      return;
    }

    onSubmit(layer.id, title.trim());
    setTitle('');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-card border border-border/80 rounded-2xl shadow-xl overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-foreground">Tạo Nhóm cấp độ mới (Group)</h3>
              <p className="text-[11px] text-muted-foreground">
                Tạo nhóm nằm ngang cấp với Core / Trung cấp trong tầng{' '}
                <span className="font-semibold text-foreground">{layer.shortTag}</span>
              </p>
            </div>
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

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <FolderPlus className="w-3.5 h-3.5 text-primary" /> Tên Nhóm (Group Title) *
            </label>
            <input
              type="text"
              autoFocus
              placeholder="VD: ⚡ Thực hành & Lab, 🛠️ Hệ thống Cache, 📚 Tài liệu..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-background border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
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
              Tạo nhóm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
