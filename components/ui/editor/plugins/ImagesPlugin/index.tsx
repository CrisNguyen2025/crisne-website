import type { JSX } from 'react';

import { $isAutoLinkNode, $isLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $findMatchingParent, $wrapNodeInElement, mergeRegister } from '@lexical/utils';
import {
  $createNodeSelection,
  $createParagraphNode,
  $createRangeSelection,
  $getSelection,
  $insertNodes,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $setSelection,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  createCommand,
  DRAGOVER_COMMAND,
  DRAGSTART_COMMAND,
  DROP_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  getDOMSelectionFromTarget,
  isHTMLElement,
  LexicalCommand,
  LexicalEditor,
  LexicalNode,
} from 'lexical';
import { useEffect, useRef, useState } from 'react';

import { Button, Input } from 'antd';
import { $createImageNode, $isImageNode, ImageNode, ImagePayload } from '../../nodes/ImageNode';

function $selectImageNodeWithEvent(imageNode: ImageNode, event: KeyboardEvent): true {
  event.preventDefault();
  const nodeSelection = $createNodeSelection();
  nodeSelection.add(imageNode.getKey());
  $setSelection(nodeSelection);
  return true;
}

function $findEdgeImageInNode(node: LexicalNode | null, edge: 'first' | 'last'): ImageNode | null {
  if (!node) return null;
  if ($isImageNode(node)) return node;
  if (!$isElementNode(node)) return null;
  const child = edge === 'first' ? node.getFirstChild() : node.getLastChild();
  return $isImageNode(child) ? child : null;
}

function $tryDeleteSelectedImage(event: KeyboardEvent): boolean {
  const selection = $getSelection();
  if (!$isNodeSelection(selection)) return false;
  const imageNode = selection.getNodes().find($isImageNode);
  if (!imageNode) return false;
  event.preventDefault();
  imageNode.remove();
  return true;
}

function $handleImageBackspaceKey(event: KeyboardEvent): boolean {
  if ($tryDeleteSelectedImage(event)) return true;

  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

  const { anchor } = selection;
  const anchorNode = anchor.getNode();

  if ($isElementNode(anchorNode)) {
    const childBefore = anchorNode.getChildAtIndex(anchor.offset - 1);
    if ($isImageNode(childBefore)) return $selectImageNodeWithEvent(childBefore, event);
  }

  if (anchor.offset !== 0) return false;

  const prevSibling = anchorNode.getPreviousSibling();
  if ($isImageNode(prevSibling)) return $selectImageNodeWithEvent(prevSibling, event);

  const element = anchorNode.getTopLevelElement();
  const targetImageNode = $findEdgeImageInNode(element?.getPreviousSibling() ?? null, 'last');
  if (!element || !targetImageNode) return false;

  if (element.getTextContent().trim().length === 0 && element.getChildrenSize() <= 1) {
    element.remove();
  }
  return $selectImageNodeWithEvent(targetImageNode, event);
}

function $handleImageDeleteKey(event: KeyboardEvent): boolean {
  if ($tryDeleteSelectedImage(event)) return true;

  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

  const { anchor } = selection;
  const anchorNode = anchor.getNode();
  if (anchor.offset !== anchorNode.getTextContentSize()) return false;

  const element = anchorNode.getTopLevelElement();
  const targetImageNode = $findEdgeImageInNode(element?.getNextSibling() ?? null, 'first');
  if (!element || !targetImageNode) return false;

  if (element.getTextContent().trim().length === 0 && element.getChildrenSize() <= 1) {
    element.remove();
  }
  return $selectImageNodeWithEvent(targetImageNode, event);
}

function $moveOutOfSelectedImage(imageNode: ImageNode, direction: 'prev' | 'next', event: KeyboardEvent): true {
  event.preventDefault();
  const parent = imageNode.getParent();
  const singleChildParent = parent && parent.getChildrenSize() === 1 ? parent : null;
  const targetRef = singleChildParent ?? imageNode;
  const sibling = direction === 'next' ? targetRef.getNextSibling() : targetRef.getPreviousSibling();

  if (sibling) {
    if (direction === 'next') sibling.selectStart();
    else sibling.selectEnd();
    return true;
  }

  const newParagraph = $createParagraphNode();
  if (direction === 'next') targetRef.insertAfter(newParagraph);
  else targetRef.insertBefore(newParagraph);
  newParagraph.select();
  return true;
}

function $handleImageArrowKey(event: KeyboardEvent, direction: 'prev' | 'next'): boolean {
  const selection = $getSelection();
  if ($isNodeSelection(selection)) {
    const imageNode = selection.getNodes().find($isImageNode);
    if (imageNode) return $moveOutOfSelectedImage(imageNode, direction, event);
  }

  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

  const { anchor } = selection;
  const anchorNode = anchor.getNode();
  const atBoundary =
    direction === 'next' ? anchor.offset === anchorNode.getTextContentSize() : anchor.offset === 0;
  if (!atBoundary) return false;

  const topElement = anchorNode.getTopLevelElement();
  if (!topElement) return false;

  const adjacentTop = direction === 'next' ? topElement.getNextSibling() : topElement.getPreviousSibling();
  const edge = direction === 'next' ? 'first' : 'last';
  const targetImageNode = $findEdgeImageInNode(adjacentTop, edge);
  return targetImageNode ? $selectImageNodeWithEvent(targetImageNode, event) : false;
}

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
            $wrapNodeInElement(imageNode, $createParagraphNode);
          }

          // Select the newly inserted image directly so user has full control (can press Enter for newline or Backspace to delete)
          const nodeSelection = $createNodeSelection();
          nodeSelection.add(imageNode.getKey());
          $setSelection(nodeSelection);

          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand<KeyboardEvent>(KEY_BACKSPACE_COMMAND, $handleImageBackspaceKey, COMMAND_PRIORITY_EDITOR),
      editor.registerCommand<KeyboardEvent>(KEY_DELETE_COMMAND, $handleImageDeleteKey, COMMAND_PRIORITY_EDITOR),
      editor.registerCommand<KeyboardEvent>(
        KEY_ARROW_RIGHT_COMMAND,
        event => $handleImageArrowKey(event, 'next'),
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_ARROW_DOWN_COMMAND,
        event => $handleImageArrowKey(event, 'next'),
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_ARROW_LEFT_COMMAND,
        event => $handleImageArrowKey(event, 'prev'),
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_ARROW_UP_COMMAND,
        event => $handleImageArrowKey(event, 'prev'),
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
