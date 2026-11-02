'use client';

import React, { useState } from 'react';
import { Layers, Tag, AlignLeft } from 'lucide-react';
import { RoadmapLayer } from '@/lib/roadmap/types';
import { Dialog } from '@/components/ui/dialog';

interface EditLayerModalProps {
  isOpen: boolean;
  layer: RoadmapLayer | null;
  onClose: () => void;
  onSubmit: (layerId: string, title: string, shortTag: string, subtitle?: string) => void;
}

function EditLayerForm({
  layer,
  onClose,
  onSubmit,
}: {
  layer: RoadmapLayer;
  onClose: () => void;
  onSubmit: (layerId: string, title: string, shortTag: string, subtitle?: string) => void;
}) {
  const [title, setTitle] = useState(layer.title);
  const [shortTag, setShortTag] = useState(layer.shortTag);
  const [subtitle, setSubtitle] = useState(layer.subtitle || '');
  const [error, setError] = useState('');

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

  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit Layer"
      description="Update layer details and short tag"
      icon={<Layers className="size-4 text-primary" />}
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
            form="edit-layer-form"
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs transition-colors cursor-pointer"
          >
            Save changes
          </button>
        </>
      }
    >
      <form id="edit-layer-form" onSubmit={handleSubmit} className="space-y-3.5 text-xs">
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
            placeholder="e.g. 01. Data & Knowledge Base"
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
            placeholder="e.g. 01-DB"
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
            placeholder="e.g. Vector storage solutions, databases, retrieval pipelines…"
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

export function EditLayerModal({ isOpen, layer, onClose, onSubmit }: EditLayerModalProps) {
  if (!isOpen || !layer) return null;
  return <EditLayerForm key={layer.id} layer={layer} onClose={onClose} onSubmit={onSubmit} />;
}
