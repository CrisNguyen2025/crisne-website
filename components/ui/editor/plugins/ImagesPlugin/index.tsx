import type { JSX } from 'react';

import { $isAutoLinkNode, $isLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $findMatchingParent, $wrapNodeInElement, mergeRegister } from '@lexical/utils';
import {
  $createParagraphNode,
  $createRangeSelection,
  $getSelection,
  $insertNodes,
  $isNodeSelection,
  $isRootOrShadowRoot,
  $setSelection,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  createCommand,
  DRAGOVER_COMMAND,
  DRAGSTART_COMMAND,
  DROP_COMMAND,
  PASTE_COMMAND,
  getDOMSelectionFromTarget,
  isHTMLElement,
  LexicalCommand,
  LexicalEditor,
} from 'lexical';
import { useEffect, useRef, useState } from 'react';

import { Button, Input } from 'antd';
import { $createImageNode, $isImageNode, ImageNode, ImagePayload } from '../../nodes/ImageNode';

export type InsertImagePayload = Readonly<ImagePayload>;
export type ImagePickerRenderer = (props: {
  open: boolean;
  onClose: () => void;
  onSelect: (payload: InsertImagePayload) => void;
}) => JSX.Element | null | undefined;

export const INSERT_IMAGE_COMMAND: LexicalCommand<InsertImagePayload> = createCommand('INSERT_IMAGE_COMMAND');

export function InsertImageUriDialogBody({ onClick }: { onClick: (payload: InsertImagePayload) => void }) {
  const [src, setSrc] = useState('');
  const [altText, setAltText] = useState('');

  const isDisabled = src === '';

  return (
    <>
      <Input
        placeholder='i.e. https://source.unsplash.com/random'
        onChange={event => setSrc(event.target.value)}
        value={src}
        data-test-id='image-modal-url-input'
      />
      <Input
        placeholder='Random unsplash image'
        onChange={event => setAltText(event.target.value)}
        value={altText}
        data-test-id='image-modal-alt-text-input'
      />
      <Button data-test-id='image-modal-confirm-btn' disabled={isDisabled} onClick={() => onClick({ altText, src })}>
        Confirm
      </Button>
    </>
  );
}

export function InsertImageUploadedDialogBody({ onClick }: { onClick: (payload: InsertImagePayload) => void }) {
  const [src] = useState('');
  const [altText, setAltText] = useState('');

  const isDisabled = src === '';

  return (
    <>
      <Input
        placeholder='Descriptive alternative text'
        onChange={event => setAltText(event.target.value)}
        value={altText}
        data-test-id='image-modal-alt-text-input'
      />
      <Button
        data-test-id='image-modal-file-upload-btn'
        disabled={isDisabled}
        onClick={() => onClick({ altText, src })}
      >
        Confirm
      </Button>
    </>
  );
}

export function InsertImageDialog({
  activeEditor,
  onClose,
  open,
  renderImagePicker,
}: {
  activeEditor: LexicalEditor;
  onClose: () => void;
  open: boolean;
  renderImagePicker?: ImagePickerRenderer;
}): JSX.Element | null {
  const hasModifier = useRef(false);

  useEffect(() => {
    hasModifier.current = false;
    const handler = (e: KeyboardEvent) => {
      hasModifier.current = e.altKey;
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [activeEditor]);

  const handleSelectImage = (payload: InsertImagePayload) => {
    activeEditor.dispatchCommand(INSERT_IMAGE_COMMAND, payload);
    onClose();
  };

  return renderImagePicker?.({ open, onClose, onSelect: handleSelectImage }) ?? null;
}

export function ImagesPlugin({ captionsEnabled }: { captionsEnabled?: boolean }): JSX.Element | null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([ImageNode])) {
      throw new Error('ImagesPlugin: ImageNode not registered on editor');
    }

    return mergeRegister(
      editor.registerCommand<InsertImagePayload>(
        INSERT_IMAGE_COMMAND,
        payload => {
          const imageNode = $createImageNode(payload);
          $insertNodes([imageNode]);
          if ($isRootOrShadowRoot(imageNode.getParentOrThrow())) {
            $wrapNodeInElement(imageNode, $createParagraphNode).selectEnd();
          }

          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand<DragEvent>(
        DRAGSTART_COMMAND,
        event => {
          return $onDragStart(event);
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand<DragEvent>(
        DRAGOVER_COMMAND,
        event => {
          return $onDragover(event);
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand<DragEvent>(
        DROP_COMMAND,
        event => {
          return $onDrop(event, editor);
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand<ClipboardEvent>(
        PASTE_COMMAND,
        event => {
          return $onPaste(event, editor);
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [captionsEnabled, editor]);

  return null;
}

const TRANSPARENT_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const img = document.createElement('img');
img.src = TRANSPARENT_IMAGE;

function $onDragStart(event: DragEvent): boolean {
  const node = $getImageNodeInSelection();
  if (!node) {
    return false;
  }
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) {
    return false;
  }
  dataTransfer.setData('text/plain', '_');
  dataTransfer.setDragImage(img, 0, 0);
  dataTransfer.setData(
    'application/x-lexical-drag',
    JSON.stringify({
      data: {
        altText: node.__altText,
        caption: node.__caption,
        height: node.__height,
        key: node.getKey(),
        maxWidth: node.__maxWidth,
        showCaption: node.__showCaption,
        src: node.__src,
        width: node.__width,
      },
      type: 'image',
    }),
  );

  return true;
}

function $onDragover(event: DragEvent): boolean {
  const node = $getImageNodeInSelection();
  if (!node) {
    return false;
  }
  if (!canDropImage(event)) {
    event.preventDefault();
  }
  return true;
}

function $onDrop(event: DragEvent, editor: LexicalEditor): boolean {
  const node = $getImageNodeInSelection();
  if (!node) {
    return false;
  }
  const data = getDragImageData(event);
  if (!data) {
    return false;
  }
  const existingLink = $findMatchingParent(
    node,
    (parent): parent is LinkNode => !$isAutoLinkNode(parent) && $isLinkNode(parent),
  );
  event.preventDefault();
  if (canDropImage(event)) {
    const range = getDragSelection(event);
    node.remove();
    const rangeSelection = $createRangeSelection();
    if (range !== null && range !== undefined) {
      rangeSelection.applyDOMRange(range);
    }
    $setSelection(rangeSelection);
    editor.dispatchCommand(INSERT_IMAGE_COMMAND, data);
    if (existingLink) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, existingLink.getURL());
    }
  }
  return true;
}

function $getImageNodeInSelection(): ImageNode | null {
  const selection = $getSelection();
  if (!$isNodeSelection(selection)) {
    return null;
  }
  const nodes = selection.getNodes();
  const node = nodes[0];
  return $isImageNode(node) ? node : null;
}

function getDragImageData(event: DragEvent): null | InsertImagePayload {
  const dragData = event.dataTransfer?.getData('application/x-lexical-drag');
  if (!dragData) {
    return null;
  }
  const { type, data } = JSON.parse(dragData);
  if (type !== 'image') {
    return null;
  }

  return data;
}

declare global {
  interface DragEvent {
    rangeOffset?: number;
    rangeParent?: Node;
  }
}

function canDropImage(event: DragEvent): boolean {
  const target = event.target;
  return !!(
    isHTMLElement(target) &&
    !target.closest('code, span.editor-image') &&
    isHTMLElement(target.parentElement) &&
    target.parentElement.closest('div.ContentEditable__root')
  );
}

function getDragSelection(event: DragEvent): Range | null | undefined {
  let range;
  const domSelection = getDOMSelectionFromTarget(event.target);
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(event.clientX, event.clientY);
  } else if (event.rangeParent && domSelection !== null) {
    domSelection.collapse(event.rangeParent, event.rangeOffset || 0);
    range = domSelection.getRangeAt(0);
  } else {
    throw Error(`Cannot get the selection when dragging`);
  }

  return range;
}

function $onPaste(event: ClipboardEvent, editor: LexicalEditor): boolean {
  const clipboardData = event.clipboardData;
  if (!clipboardData) {
    return false;
  }

  const items = clipboardData.items;
  if (!items) {
    return false;
  }

  // Check if there are any image files in the clipboard
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.indexOf('image') !== -1) {
      event.preventDefault();
      const file = item.getAsFile();
      if (file) {
        // Convert file to data URL
        const reader = new FileReader();
        reader.onload = (e) => {
          const src = e.target?.result as string;
          if (src) {
            editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
              altText: file.name || 'Pasted image',
              src,
              maxWidth: 500,
            });
          }
        };
        reader.readAsDataURL(file);
      }
      return true;
    }
  }

  return false;
}
