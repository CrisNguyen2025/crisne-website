'use client';

import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import {
  ROADMAP_DESTRUCTIVE_BTN_CLASS,
  ROADMAP_GHOST_BTN_CLASS,
  ROADMAP_MODAL_TITLE_CLASS,
  RoadmapDangerIcon,
} from './RoadmapFormPrimitives';

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
      titleClassName={ROADMAP_MODAL_TITLE_CLASS}
      className="roadmap-theme"
      icon={
        <RoadmapDangerIcon>
          <AlertTriangle className="size-4" />
        </RoadmapDangerIcon>
      }
      footer={
        <>
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className={ROADMAP_GHOST_BTN_CLASS}
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className={ROADMAP_DESTRUCTIVE_BTN_CLASS}
          >
            {isLoading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                <span>Đang xử lý…</span>
              </>
            ) : (
              confirmText
            )}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </Dialog>
  );
}
