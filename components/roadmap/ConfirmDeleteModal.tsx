'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';

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
  return (
    <Dialog
      open={isOpen}
      onClose={isLoading ? () => {} : onClose}
      title={title}
      description={description}
      icon={<AlertTriangle className="size-5 text-rose-500" />}
      footer={
        <>
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
            className="px-4 py-2 rounded-xl bg-destructive hover:bg-destructive/90 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <div className="size-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              confirmText
            )}
          </button>
        </>
      }
    >
      <div className="text-xs text-muted-foreground">
        This action cannot be undone. Please confirm before proceeding.
      </div>
    </Dialog>
  );
}
