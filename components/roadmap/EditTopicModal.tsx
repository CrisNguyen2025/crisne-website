'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Layers, Tag, AlignLeft, Sparkles } from 'lucide-react';
import { RoadmapMeta } from '@/lib/roadmap/types';

interface EditTopicModalProps {
  isOpen: boolean;
  topic: RoadmapMeta | null;
  onClose: () => void;
  onSubmit: (title: string, shortCode: string, description?: string) => Promise<void>;
}

export function EditTopicModal({
  isOpen,
  topic,
  onClose,
  onSubmit,
}: EditTopicModalProps) {
  const [title, setTitle] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (topic) {
      setTitle(topic.title);
      setShortCode(topic.shortCode || '');
      setDescription(topic.description || '');
      setError('');
    }
  }, [topic]);

  // Handle ESC key press to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !topic || !mounted) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a topic title.');
      return;
    }
    if (!shortCode.trim()) {
      setError('Please enter a short code (e.g. AI, BE, FE).');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      await onSubmit(title.trim(), shortCode.trim().toUpperCase(), description.trim());
      onClose();
    } catch (err: any) {
      console.error('Failed to update topic:', err);
      setError(err?.message || 'Failed to update topic. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-card border border-border/80 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Edit Topic</h2>
              <p className="text-[11px] text-muted-foreground">
                Update topic name, sidebar code, and description
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>Topic Title *</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. AI & LLM Architecture"
              className="w-full px-3 py-2 text-xs bg-muted/40 border border-border/60 rounded-xl focus:outline-none focus:border-primary focus:bg-background transition-colors"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Tag className="w-3.5 h-3.5 text-primary" />
              <span>Sidebar Short Code *</span>
            </label>
            <input
              type="text"
              value={shortCode}
              onChange={(e) => setShortCode(e.target.value)}
              placeholder="e.g. AI, BE, FE, DEV"
              maxLength={6}
              className="w-full px-3 py-2 text-xs font-mono uppercase bg-muted/40 border border-border/60 rounded-xl focus:outline-none focus:border-primary focus:bg-background transition-colors"
            />
            <p className="text-[10px] text-muted-foreground">
              Displayed on the compact left sidebar (max 6 characters).
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <AlignLeft className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Description</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary or purpose of this roadmap topic..."
              rows={3}
              className="w-full px-3 py-2 text-xs bg-muted/40 border border-border/60 rounded-xl focus:outline-none focus:border-primary focus:bg-background transition-colors resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
            >
              {isSubmitting ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
