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
      editor.registerCommand<KeyboardEvent>(
        KEY_BACKSPACE_COMMAND,
        event => {
          const selection = $getSelection();

          // 1. If an image is explicitly selected via NodeSelection, delete it
          if ($isNodeSelection(selection)) {
            const nodes = selection.getNodes();
            const imageNode = nodes.find($isImageNode);
            if (imageNode) {
              event.preventDefault();
              imageNode.remove();
              return true;
            }
          }

          // 2. If cursor is a collapsed RangeSelection (text cursor)
          if ($isRangeSelection(selection) && selection.isCollapsed()) {
            const anchor = selection.anchor;
            const anchorNode = anchor.getNode();

            // Case A: Cursor is inside the element containing the ImageNode (e.g. <p><ImageNode/>|</p> where offset >= 1)
            if ($isElementNode(anchorNode)) {
              const childBefore = anchorNode.getChildAtIndex(anchor.offset - 1);
              if ($isImageNode(childBefore)) {
                event.preventDefault();
                const nodeSelection = $createNodeSelection();
                nodeSelection.add(childBefore.getKey());
                $setSelection(nodeSelection);
                return true;
              }
            }

            // Case B: Sibling before text node is an ImageNode
            const prevSibling = anchorNode.getPreviousSibling();
            if ($isImageNode(prevSibling) && anchor.offset === 0) {
              event.preventDefault();
              const nodeSelection = $createNodeSelection();
              nodeSelection.add(prevSibling.getKey());
              $setSelection(nodeSelection);
              return true;
            }

            // Case C: Cursor is at offset 0 of any child node / line below an image block
            if (anchor.offset === 0) {
              const element = anchorNode.getTopLevelElement();
              if (element) {
                const prevElement = element.getPreviousSibling();
                if (prevElement) {
                  let targetImageNode: ImageNode | null = null;
                  if ($isImageNode(prevElement)) {
                    targetImageNode = prevElement;
                  } else if ($isElementNode(prevElement)) {
                    const lastChild = prevElement.getLastChild();
                    if ($isImageNode(lastChild)) {
                      targetImageNode = lastChild;
                    }
                  }

                  if (targetImageNode) {
                    event.preventDefault();
                    // If current line is empty, delete this empty line
                    if (element.getTextContent().trim().length === 0 && element.getChildrenSize() <= 1) {
                      element.remove();
                    }
                    // Select the image instead of deleting it immediately
                    const nodeSelection = $createNodeSelection();
                    nodeSelection.add(targetImageNode.getKey());
                    $setSelection(nodeSelection);
                    return true;
                  }
                }
              }
            }
          }

          return false;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_DELETE_COMMAND,
        event => {
          const selection = $getSelection();

          // 1. If an image is explicitly selected via NodeSelection, delete it
          if ($isNodeSelection(selection)) {
            const nodes = selection.getNodes();
            const imageNode = nodes.find($isImageNode);
            if (imageNode) {
              event.preventDefault();
              imageNode.remove();
              return true;
            }
          }

          // 2. If cursor is at the end of a line right above an image
          if ($isRangeSelection(selection) && selection.isCollapsed()) {
            const anchor = selection.anchor;
            const anchorNode = anchor.getNode();
            if (anchor.offset === anchorNode.getTextContentSize()) {
              const element = anchorNode.getTopLevelElement();
              if (element) {
                const nextSibling = element.getNextSibling();
                if (nextSibling) {
                  let targetImageNode: ImageNode | null = null;
                  if ($isImageNode(nextSibling)) {
                    targetImageNode = nextSibling;
                  } else if ($isElementNode(nextSibling)) {
                    const firstChild = nextSibling.getFirstChild();
                    if ($isImageNode(firstChild)) {
                      targetImageNode = firstChild;
                    }
                  }

                  if (targetImageNode) {
                    event.preventDefault();
                    if (element.getTextContent().trim().length === 0 && element.getChildrenSize() <= 1) {
                      element.remove();
                    }
                    const nodeSelection = $createNodeSelection();
                    nodeSelection.add(targetImageNode.getKey());
                    $setSelection(nodeSelection);
                    return true;
                  }
                }
              }
            }
          }

          return false;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_ARROW_RIGHT_COMMAND,
        event => {
          const selection = $getSelection();

          // 1. If an Image is selected via NodeSelection -> move cursor to after image
          if ($isNodeSelection(selection)) {
            const nodes = selection.getNodes();
            const imageNode = nodes.find($isImageNode);
            if (imageNode) {
              event.preventDefault();
              const parent = imageNode.getParent();
              const nextSibling =
                parent && parent.getChildrenSize() === 1
                  ? parent.getNextSibling()
                  : imageNode.getNextSibling();

              if (nextSibling) {
                nextSibling.selectStart();
              } else {
                const newParagraph = $createParagraphNode();
                if (parent && parent.getChildrenSize() === 1) {
                  parent.insertAfter(newParagraph);
                } else {
                  imageNode.insertAfter(newParagraph);
                }
                newParagraph.select();
              }
              return true;
            }
          }

          // 2. If cursor is at the end of block before an image -> select image
          if ($isRangeSelection(selection) && selection.isCollapsed()) {
            const anchor = selection.anchor;
            const anchorNode = anchor.getNode();
            if (anchor.offset === anchorNode.getTextContentSize()) {
              const topElement = anchorNode.getTopLevelElement();
              if (topElement) {
                const nextTopElement = topElement.getNextSibling();
                if (nextTopElement) {
                  let targetImageNode: ImageNode | null = null;
                  if ($isImageNode(nextTopElement)) {
                    targetImageNode = nextTopElement;
                  } else if ($isElementNode(nextTopElement)) {
                    const firstChild = nextTopElement.getFirstChild();
                    if ($isImageNode(firstChild)) {
                      targetImageNode = firstChild;
                    }
                  }

                  if (targetImageNode) {
                    event.preventDefault();
                    const nodeSelection = $createNodeSelection();
                    nodeSelection.add(targetImageNode.getKey());
                    $setSelection(nodeSelection);
                    return true;
                  }
                }
              }
            }
          }

          return false;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_ARROW_DOWN_COMMAND,
        event => {
          const selection = $getSelection();

          // 1. If an Image is selected via NodeSelection -> move cursor to after image
          if ($isNodeSelection(selection)) {
            const nodes = selection.getNodes();
            const imageNode = nodes.find($isImageNode);
            if (imageNode) {
              event.preventDefault();
              const parent = imageNode.getParent();
              const nextSibling =
                parent && parent.getChildrenSize() === 1
                  ? parent.getNextSibling()
                  : imageNode.getNextSibling();

              if (nextSibling) {
                nextSibling.selectStart();
              } else {
                const newParagraph = $createParagraphNode();
                if (parent && parent.getChildrenSize() === 1) {
                  parent.insertAfter(newParagraph);
                } else {
                  imageNode.insertAfter(newParagraph);
                }
                newParagraph.select();
              }
              return true;
            }
          }

          // 2. If cursor is at the end of block before an image -> select image
          if ($isRangeSelection(selection) && selection.isCollapsed()) {
            const anchor = selection.anchor;
            const anchorNode = anchor.getNode();
            if (anchor.offset === anchorNode.getTextContentSize()) {
              const topElement = anchorNode.getTopLevelElement();
              if (topElement) {
                const nextTopElement = topElement.getNextSibling();
                if (nextTopElement) {
                  let targetImageNode: ImageNode | null = null;
                  if ($isImageNode(nextTopElement)) {
                    targetImageNode = nextTopElement;
                  } else if ($isElementNode(nextTopElement)) {
                    const firstChild = nextTopElement.getFirstChild();
                    if ($isImageNode(firstChild)) {
                      targetImageNode = firstChild;
                    }
                  }

                  if (targetImageNode) {
                    event.preventDefault();
                    const nodeSelection = $createNodeSelection();
                    nodeSelection.add(targetImageNode.getKey());
                    $setSelection(nodeSelection);
                    return true;
                  }
                }
              }
            }
          }

          return false;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_ARROW_LEFT_COMMAND,
        event => {
          const selection = $getSelection();

          // 1. If an Image is selected via NodeSelection -> move cursor to before image
          if ($isNodeSelection(selection)) {
            const nodes = selection.getNodes();
            const imageNode = nodes.find($isImageNode);
            if (imageNode) {
              event.preventDefault();
              const parent = imageNode.getParent();
              const prevSibling =
                parent && parent.getChildrenSize() === 1
                  ? parent.getPreviousSibling()
                  : imageNode.getPreviousSibling();

              if (prevSibling) {
                prevSibling.selectEnd();
              } else {
                const newParagraph = $createParagraphNode();
                if (parent && parent.getChildrenSize() === 1) {
                  parent.insertBefore(newParagraph);
                } else {
                  imageNode.insertBefore(newParagraph);
                }
                newParagraph.select();
              }
              return true;
            }
          }

          // 2. If cursor is at offset 0 of block after an image -> select image
          if ($isRangeSelection(selection) && selection.isCollapsed()) {
            const anchor = selection.anchor;
            if (anchor.offset === 0) {
              const anchorNode = anchor.getNode();
              const topElement = anchorNode.getTopLevelElement();
              if (topElement) {
                const prevTopElement = topElement.getPreviousSibling();
                if (prevTopElement) {
                  let targetImageNode: ImageNode | null = null;
                  if ($isImageNode(prevTopElement)) {
                    targetImageNode = prevTopElement;
                  } else if ($isElementNode(prevTopElement)) {
                    const lastChild = prevTopElement.getLastChild();
                    if ($isImageNode(lastChild)) {
                      targetImageNode = lastChild;
                    }
                  }

                  if (targetImageNode) {
                    event.preventDefault();
                    const nodeSelection = $createNodeSelection();
                    nodeSelection.add(targetImageNode.getKey());
                    $setSelection(nodeSelection);
                    return true;
                  }
                }
              }
            }
          }

          return false;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_ARROW_UP_COMMAND,
        event => {
          const selection = $getSelection();

          // 1. If an Image is selected via NodeSelection -> move cursor to before image
          if ($isNodeSelection(selection)) {
            const nodes = selection.getNodes();
            const imageNode = nodes.find($isImageNode);
            if (imageNode) {
              event.preventDefault();
              const parent = imageNode.getParent();
              const prevSibling =
                parent && parent.getChildrenSize() === 1
                  ? parent.getPreviousSibling()
                  : imageNode.getPreviousSibling();

              if (prevSibling) {
                prevSibling.selectEnd();
              } else {
                const newParagraph = $createParagraphNode();
                if (parent && parent.getChildrenSize() === 1) {
                  parent.insertBefore(newParagraph);
                } else {
                  imageNode.insertBefore(newParagraph);
                }
                newParagraph.select();
              }
              return true;
            }
          }

          // 2. If cursor is at offset 0 of block after an image -> select image
          if ($isRangeSelection(selection) && selection.isCollapsed()) {
            const anchor = selection.anchor;
            if (anchor.offset === 0) {
              const anchorNode = anchor.getNode();
              const topElement = anchorNode.getTopLevelElement();
              if (topElement) {
                const prevTopElement = topElement.getPreviousSibling();
                if (prevTopElement) {
                  let targetImageNode: ImageNode | null = null;
                  if ($isImageNode(prevTopElement)) {
                    targetImageNode = prevTopElement;
                  } else if ($isElementNode(prevTopElement)) {
                    const lastChild = prevTopElement.getLastChild();
                    if ($isImageNode(lastChild)) {
                      targetImageNode = lastChild;
                    }
                  }

                  if (targetImageNode) {
                    event.preventDefault();
                    const nodeSelection = $createNodeSelection();
                    nodeSelection.add(targetImageNode.getKey());
                    $setSelection(nodeSelection);
                    return true;
                  }
                }
              }
            }
          }

          return false;
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
