'use client';

import React, { useState } from 'react';
import { Layers, Tag, AlignLeft } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';

interface CreateLayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, shortTag: string, subtitle?: string) => void;
}

export function CreateLayerModal({ isOpen, onClose, onSubmit }: CreateLayerModalProps) {
  const [title, setTitle] = useState('');
  const [shortTag, setShortTag] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a layer title.');
      return;
    }
    if (!shortTag.trim()) {
      setError('Please enter a short tag (e.g. 06-SEC, MLOPS).');
      return;
    }
    onSubmit(title.trim(), shortTag.trim(), subtitle.trim());
    setTitle('');
    setShortTag('');
    setSubtitle('');
    setError('');
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Add new layer"
      description="Create a new knowledge layer for this topic"
      icon={<Layers className="size-4" />}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted text-xs font-medium transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-layer-form"
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs transition-colors cursor-pointer"
          >
            Create layer
          </button>
        </>
      }
    >
      <form id="create-layer-form" onSubmit={handleSubmit} className="space-y-3.5 text-xs">
        {error && (
          <div className="text-xs text-rose-500 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
            {error}
          </div>
        )}

        <div className="space-y-1">
          <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
            <Layers className="size-3.5 text-primary" /> Layer title *
          </label>
          <input
            type="text"
            placeholder="e.g. 06. Security & Compliance (AI Security)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
          />
        </div>

        <div className="space-y-1">
          <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
            <Tag className="size-3.5 text-primary" /> Short tag (used for filter tabs) *
          </label>
          <input
            type="text"
            placeholder="e.g. 06-SEC or SEC"
            value={shortTag}
            onChange={(e) => setShortTag(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground uppercase"
          />
        </div>

        <div className="space-y-1">
          <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
            <AlignLeft className="size-3.5 text-primary" /> Subtitle (optional)
          </label>
          <textarea
            placeholder="e.g. Security standards, data isolation, and AI compliance…"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground resize-none"
          />
        </div>
      </form>
    </Dialog>
  );
}
