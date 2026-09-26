'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (layer) {
      setTitle(layer.title);
      setShortTag(layer.shortTag);
      setSubtitle(layer.subtitle || '');
      setError('');
    }
  }, [layer]);

  if (!isOpen || !layer || !mounted) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a layer title.');
      return;
    }
    if (!shortTag.trim()) {
      setError('Please enter a short tag (e.g. 01-DB, 02-LLM).');
      return;
    }
    onSubmit(layer.id, title.trim(), shortTag.trim(), subtitle.trim());
    setError('');
    onClose();
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="fixed inset-0 -z-10" onClick={onClose} />
      <div className="w-full max-w-md bg-card border border-border/80 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Layers className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-foreground">Edit Layer</h3>
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

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="space-y-1">
            <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-primary" /> Layer title *
            </label>
            <input
              type="text"
              placeholder="e.g. 01. Data & Knowledge Base"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-primary" /> Short tag (used for filter tabs) *
            </label>
            <input
              type="text"
              placeholder="e.g. 01-DB"
              value={shortTag}
              onChange={(e) => setShortTag(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground uppercase"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <AlignLeft className="w-3.5 h-3.5 text-primary" /> Subtitle (optional)
            </label>
            <textarea
              placeholder="e.g. Vector storage solutions, databases, retrieval pipelines…"
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
              className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-xs transition-colors cursor-pointer"
            >
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
