'use client';

import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDeleteModal({
  isOpen,
  title,
  description,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  isLoading = false,
  onClose,
  onConfirm,
}: ConfirmDeleteModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={isLoading ? undefined : onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-200 animate-in fade-in"
      />

      {/* Modal Card */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md bg-card border border-border/80 rounded-2xl shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header with red warning badge */}
        <div className="p-5 pb-4 flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center shrink-0 shadow-2xs">
            <AlertTriangle className="w-5 h-5 stroke-[2.2]" />
          </div>

          <div className="flex-1 min-w-0 pr-4">
            <h3 className="font-bold text-sm md:text-base text-foreground tracking-tight leading-snug">
              {title}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {description}
            </p>
          </div>

          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-muted/20 border-t border-border/50 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
          >
            {cancelText}
          </button>

          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-98 text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>{confirmText}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
