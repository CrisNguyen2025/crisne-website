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
  confirmText = 'Xoá',
  cancelText = 'Hủy',
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
      className="roadmap-theme"
      icon={<AlertTriangle className="size-4 text-destructive" />}
      footer={
        <>
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className="flex items-center gap-1.5 rounded-lg bg-destructive px-3.5 py-1.5 text-xs font-medium text-white transition-[background-color,transform] duration-150 hover:bg-destructive/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 cursor-pointer"
          >
            {isLoading ? (
              <>
                <span className="size-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>Đang xử lý…</span>
              </>
            ) : (
              confirmText
            )}
          </button>
        </>
      }
    >
      <p className="text-xs text-muted-foreground">Hành động này không thể hoàn tác.</p>
    </Dialog>
  );
}
