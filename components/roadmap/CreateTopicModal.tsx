'use client';

import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Layers,
  Tag,
  AlignLeft,
  FileText,
  Sparkles,
} from 'lucide-react';
import { CreateRoadmapDto } from '@/lib/roadmap/types';
import { Dialog } from '@/components/ui/dialog';
import { ConfirmPopover } from '@/components/ui/confirm-popover';

interface LayerDraft {
  id: string;
  title: string;
  shortTag: string;
  subtitle: string;
}

interface CreateTopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateRoadmapDto) => Promise<void>;
}

export function CreateTopicModal({
  isOpen,
  onClose,
  onSubmit,
}: CreateTopicModalProps) {
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [description, setDescription] = useState('');
  const [layers, setLayers] = useState<LayerDraft[]>([
    {
      id: 'layer-draft-1',
      title: '01. Architecture Foundation',
      shortTag: '01-FND',
      subtitle: 'Core systems and fundamental building blocks',
    },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleAddLayerRow = () => {
    const nextIdx = layers.length + 1;
    const padded = String(nextIdx).padStart(2, '0');
    setLayers((prev) => [
      ...prev,
      {
        id: `layer-draft-${Date.now()}`,
        title: `${padded}. New Section`,
        shortTag: `${padded}-SEC`,
        subtitle: '',
      },
    ]);
  };

  const handleRemoveLayerRow = (id: string) => {
    if (layers.length <= 1) {
      setError('A topic must have at least 1 layer item.');
      return;
    }
    setLayers((prev) => prev.filter((l) => l.id !== id));
  };

  const handleLayerChange = (id: string, field: keyof LayerDraft, val: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: val } : l))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Please provide a Topic Title.');
      return;
    }

    if (layers.length === 0) {
      setError('Please add at least 1 layer for the topic.');
      return;
    }

    for (let i = 0; i < layers.length; i++) {
      const l = layers[i];
      if (!l.title.trim() || !l.shortTag.trim()) {
        setError(`Please fill both Title and Segment tag for Layer #${i + 1}.`);
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const generatedShortCode = shortName.trim() || name.trim().substring(0, 2).toUpperCase();
      await onSubmit({
        title: name.trim(),
        shortCode: generatedShortCode,
        description: description.trim() || undefined,
        layers: layers.map((l) => ({
          title: l.title.trim(),
          shortTag: l.shortTag.trim().toUpperCase(),
          subtitle: l.subtitle.trim() || undefined,
        })),
      });

      // Reset and close
      setName('');
      setShortName('');
      setDescription('');
      setLayers([
        {
          id: 'layer-draft-1',
          title: '01. Architecture Foundation',
          shortTag: '01-FND',
          subtitle: 'Core systems and fundamental building blocks',
        },
      ]);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create topic. Please try again.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Create New Topic"
      description="Add a new domain architecture topic to the roadmap hub"
      icon={<Sparkles className="size-4" />}
      className="sm:max-w-xl"
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
            form="create-topic-form"
            disabled={isSubmitting}
            className="px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <div className="size-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                <span>Creating topic...</span>
              </>
            ) : (
              <>
                <Plus className="size-3.5" />
                <span>Create Topic</span>
              </>
            )}
          </button>
        </>
      }
    >
      <form id="create-topic-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="text-xs text-rose-500 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
            {error}
          </div>
        )}

        {/* Topic Basic Information */}
        <div className="p-3.5 rounded-xl border border-border/70 bg-muted/10 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <FileText className="size-3.5 text-primary" />
                Topic Title *
              </label>
              <input
                type="text"
                placeholder="e.g. Modern Frontend Architecture"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Tag className="size-3.5 text-primary" />
                Short Code
              </label>
              <input
                type="text"
                placeholder="e.g. FE"
                maxLength={5}
                value={shortName}
                onChange={(e) => setShortName(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground text-xs uppercase font-bold"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <AlignLeft className="size-3.5 text-primary" />
              Description
            </label>
            <textarea
              rows={2}
              placeholder="Brief summary of what this architecture topic covers..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground text-xs resize-none"
            />
          </div>
        </div>

        {/* Layer Menu Items */}
        <div className="p-3.5 rounded-xl border border-border/70 bg-muted/10 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Layers className="size-3.5 text-primary" />
                Initial Architecture Layers *
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                At least 1 layer is required for the navigation.
              </p>
            </div>

            <button
              type="button"
              onClick={handleAddLayerRow}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-background hover:bg-muted text-foreground transition-colors flex items-center gap-1 cursor-pointer border border-border/60 shadow-2xs"
            >
              <Plus className="size-3.5" />
              <span>Add Layer</span>
            </button>
          </div>

          <div className="space-y-2">
            {layers.map((layer, idx) => (
              <div
                key={layer.id}
                className="p-2.5 rounded-xl border border-border/60 bg-background flex flex-col sm:flex-row items-start sm:items-center gap-2"
              >
                <span className="size-5 rounded-full bg-primary/10 text-primary text-[0.625rem] font-bold flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>

                <div className="flex-1 w-full sm:w-auto">
                  <input
                    type="text"
                    placeholder="Layer Title (e.g. 01. State Management & Stores)"
                    value={layer.title}
                    onChange={(e) => handleLayerChange(layer.id, 'title', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-card border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground text-xs"
                  />
                </div>

                <div className="w-full sm:w-28 shrink-0">
                  <input
                    type="text"
                    placeholder="Tag (e.g. 01-STATE)"
                    value={layer.shortTag}
                    onChange={(e) => handleLayerChange(layer.id, 'shortTag', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-card border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground text-xs uppercase font-medium"
                  />
                </div>

                <ConfirmPopover
                  title="Remove layer?"
                  description="Remove this row from the draft?"
                  confirmLabel="Remove"
                  onConfirm={() => handleRemoveLayerRow(layer.id)}
                >
                  <button
                    type="button"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
                    title="Remove layer"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </ConfirmPopover>
              </div>
            ))}
          </div>
        </div>
      </form>
    </Dialog>
  );
}
