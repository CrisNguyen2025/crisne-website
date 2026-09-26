'use client';

import React, { useState } from 'react';
import { X, Sparkles, FileText, AlignLeft, Folder } from 'lucide-react';
import { RoadmapLayer, RoadmapLevel } from '@/lib/roadmap/types';

interface CreateItemModalProps {
  isOpen: boolean;
  layers: RoadmapLayer[];
  targetLayerId: string;
  targetLevel: RoadmapLevel;
  onClose: () => void;
  onSubmit: (layerId: string, level: RoadmapLevel, title: string, description: string) => void;
}

export function CreateItemModal({
  isOpen,
  layers,
  targetLayerId,
  targetLevel,
  onClose,
  onSubmit,
}: CreateItemModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const currentLayer = layers.find((l) => l.id === targetLayerId);
  const currentGroup = currentLayer?.groups.find((g) => g.level === targetLevel);

  React.useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getGroupDisplayName = () => {
    if (currentGroup?.title) return currentGroup.title;
    switch (targetLevel) {
      case 'core':
        return '🟢 Core';
      case 'intermediate':
        return '🟡 Intermediate';
      case 'advanced':
        return '🔴 Advanced';
      default:
        return targetLevel;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter an item title.');
      return;
    }
    if (!description.trim()) {
      setError('Please enter a brief description for this item.');
      return;
    }
    onSubmit(targetLayerId, targetLevel, title.trim(), description.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-card border border-border/80 rounded-2xl shadow-xl overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-foreground">Add new item</h3>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5 truncate">
                <Folder className="w-3 h-3 text-primary shrink-0" />
                <span className="font-medium text-foreground truncate max-w-[9.375rem]">
                  {currentLayer?.shortTag || currentLayer?.title || 'Layer'}
                </span>
                <span className="text-muted-foreground/40 shrink-0">›</span>
                <span className="font-semibold text-primary truncate max-w-[8.75rem]">
                  {getGroupDisplayName()}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
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
              <FileText className="w-3.5 h-3.5 text-primary" /> Item title *
            </label>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Speculative Decoding, GraphRAG..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-background border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <AlignLeft className="w-3.5 h-3.5 text-primary" /> Description *
            </label>
            <textarea
              placeholder="Brief explanation of what this concept is and how it's used…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-3 py-2.5 rounded-xl bg-background border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground resize-none leading-relaxed text-xs font-mono"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-xs transition-colors"
            >
              Create item
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
