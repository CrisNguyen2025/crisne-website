'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, FolderPlus } from 'lucide-react';
import { RoadmapLayer, RoadmapLevel } from '@/lib/roadmap/types';

const LEVEL_OPTIONS: RoadmapLevel[] = ['core', 'intermediate', 'advanced'];

interface CreateGroupModalProps {
  isOpen: boolean;
  layer: RoadmapLayer | null;
  onClose: () => void;
  onSubmit: (layerId: string, title: string, level: RoadmapLevel) => void;
}

export function CreateGroupModal({
  isOpen,
  layer,
  onClose,
  onSubmit,
}: CreateGroupModalProps) {
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState<RoadmapLevel | ''>('');
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !layer || !mounted) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a group title.');
      return;
    }
    if (!level) {
      setError('Chọn level: core, intermediate hoặc advanced.');
      return;
    }
    onSubmit(layer.id, title.trim(), level);
    setTitle('');
    setLevel('');
    setError('');
    onClose();
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="fixed inset-0 -z-10"
        onClick={onClose}
      />
      <div className="w-full max-w-md bg-card border border-border/80 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-foreground">Create level group</h3>
              <p className="text-[11px] text-muted-foreground">
                Adds a group alongside Core / Intermediate in layer{' '}
                <span className="font-semibold text-foreground">{layer.shortTag}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
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
            <label className="font-semibold text-muted-foreground">Level *</label>
            <div className="flex gap-2">
              {LEVEL_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setLevel(opt)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${
                    level === opt ? 'border-primary bg-primary/10 text-primary' : 'border-border/70 text-foreground'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <FolderPlus className="w-3.5 h-3.5 text-primary" /> Group title *
            </label>
            <input
              type="text"
              autoFocus
              placeholder="e.g. ⚡ Hands-on Labs, 🛠️ Cache Systems, 📚 References…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-background border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-xs transition-colors cursor-pointer"
            >
              Create group
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
