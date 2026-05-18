import { $createLinkNode, $isAutoLinkNode, $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $findMatchingParent, mergeRegister } from '@lexical/utils';
import {
  $getSelection,
  $isLineBreakNode,
  $isNodeSelection,
  $isRangeSelection,
  BaseSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  getDOMSelection,
  KEY_ESCAPE_COMMAND,
  LexicalEditor,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';
import * as React from 'react';
import { Dispatch, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Check, Copy, ExternalLink, Pencil, Trash, X } from 'lucide-react';
import { getSelectedNode } from '../../utils/getSelectedNode';
import { setFloatingElemPositionForLinkEditor } from '../../utils/setFloatingElemPositionForLinkEditor';
import { sanitizeUrl } from '../../utils/url';

function preventDefault(event: React.KeyboardEvent<HTMLInputElement> | React.MouseEvent<HTMLElement>): void {
  event.preventDefault();
}

function getUrlFromSelection(selection: BaseSelection | null): string | null {
  if ($isRangeSelection(selection)) {
    const node = getSelectedNode(selection);
    const linkParent = $findMatchingParent(node, $isLinkNode);
    if (linkParent) return linkParent.getURL();
    if ($isLinkNode(node)) return node.getURL();
    return '';
  }

  if ($isNodeSelection(selection)) {
    const nodes = selection.getNodes();
    if (nodes.length === 0) return '';

    const node = nodes[0];
    const parent = node.getParent();
    if ($isLinkNode(parent)) return parent.getURL();
    if ($isLinkNode(node)) return node.getURL();
    return '';
  }

  return null;
}

function getDomRectForSelection(
  selection: BaseSelection | null,
  editor: LexicalEditor,
  rootElement: HTMLElement | null,
  nativeSelection: Selection | null,
): DOMRect | undefined {
  if (!selection || !rootElement) return undefined;

  if ($isNodeSelection(selection)) {
    const [node] = selection.getNodes();
    const element = node ? editor.getElementByKey(node.getKey()) : null;
    return element?.getBoundingClientRect();
  }

  if (nativeSelection !== null && rootElement.contains(nativeSelection.anchorNode)) {
    return nativeSelection.focusNode?.parentElement?.getBoundingClientRect();
  }

  return undefined;
}

function isLinkInputActive(activeElement: Element | null) {
  return activeElement?.className === 'link-input';
}

function FloatingLinkEditor({
  editor,
  isLink,
  setIsLink,
  anchorElem,
  isLinkEditMode,
  setIsLinkEditMode,
}: Readonly<{
  editor: LexicalEditor;
  isLink: boolean;
  setIsLink: Dispatch<boolean>;
  anchorElem: HTMLElement;
  isLinkEditMode: boolean;
  setIsLinkEditMode: Dispatch<boolean>;
}>) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [editedLinkUrl, setEditedLinkUrl] = useState('https://');
  const [lastSelection, setLastSelection] = useState<BaseSelection | null>(null);
  const [copied, setCopied] = useState(false);

  const $updateLinkEditor = useCallback(() => {
    const selection = $getSelection();
    const nextUrl = getUrlFromSelection(selection);
    if (nextUrl !== null) {
      setLinkUrl(nextUrl);
      if (isLinkEditMode) setEditedLinkUrl(nextUrl);
    }

    const editorElem = editorRef.current;
    const rootElement = editor.getRootElement();
    if (!editorElem || !rootElement) return;

    const nativeSelection = getDOMSelection(editor._window);
    if (selection && editor.isEditable()) {
      const domRect = getDomRectForSelection(selection, editor, rootElement, nativeSelection);
      if (domRect) {
        domRect.y += 32;
        setFloatingElemPositionForLinkEditor(domRect, editorElem, anchorElem);
      }
      setLastSelection(selection);
      return;
    }

    if (isLinkInputActive(document.activeElement)) return;

    setFloatingElemPositionForLinkEditor(null, editorElem, anchorElem);
    setLastSelection(null);
    setIsLinkEditMode(false);
    setLinkUrl('');
  }, [anchorElem, editor, isLinkEditMode, setIsLinkEditMode]);

  useEffect(() => {
    const scrollerElem = anchorElem.parentElement;

    const update = () => {
      editor.getEditorState().read(() => {
        $updateLinkEditor();
      });
    };

    window.addEventListener('resize', update);

    if (scrollerElem) {
      scrollerElem.addEventListener('scroll', update);
    }

    return () => {
      window.removeEventListener('resize', update);

      if (scrollerElem) {
        scrollerElem.removeEventListener('scroll', update);
      }
    };
  }, [anchorElem.parentElement, editor, $updateLinkEditor]);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          $updateLinkEditor();
        });
      }),

      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          $updateLinkEditor();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          if (isLink) {
            setIsLink(false);
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor, $updateLinkEditor, setIsLink, isLink]);

  useEffect(() => {
    editor.getEditorState().read(() => {
      $updateLinkEditor();
    });
  }, [editor, $updateLinkEditor]);

  useEffect(() => {
    if (isLinkEditMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLinkEditMode, isLink]);

  useEffect(() => {
    const editorElement = editorRef.current;
    if (editorElement === null) {
      return;
    }
    const handleBlur = (event: FocusEvent) => {
      if (!editorElement.contains(event.relatedTarget as Element) && isLink) {
        setIsLink(false);
        setIsLinkEditMode(false);
      }
    };
    editorElement.addEventListener('focusout', handleBlur);
    return () => {
      editorElement.removeEventListener('focusout', handleBlur);
    };
  }, [editorRef, setIsLink, setIsLinkEditMode, isLink]);

  const monitorInputInteraction = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleLinkSubmission(event);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setIsLinkEditMode(false);
    }
  };

  const handleLinkSubmission = (event: React.KeyboardEvent<HTMLInputElement> | React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    if (lastSelection !== null) {
      if (linkUrl !== '') {
        editor.update(() => {
          editor.dispatchCommand(TOGGLE_LINK_COMMAND, sanitizeUrl(editedLinkUrl));
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const parent = getSelectedNode(selection).getParent();
            if ($isAutoLinkNode(parent)) {
              const linkNode = $createLinkNode(parent.getURL(), {
                rel: parent.__rel,
                target: parent.__target,
                title: parent.__title,
              });
              parent.replace(linkNode, true);
            }
          }
        });
      }
      setEditedLinkUrl('https://');
      setIsLinkEditMode(false);
    }
  };

  const renderContent = () => {
    if (!isLink) return null;
    if (isLinkEditMode) {
      return (
        <div className='editor-link-popover'>
          <div className='editor-link-edit-row'>
          <input
            ref={inputRef}
            className='editor-link-input'
            value={editedLinkUrl}
            onChange={event => {
              setEditedLinkUrl(event.target.value);
            }}
            onKeyDown={event => {
              monitorInputInteraction(event);
            }}
          />
          <button
            type='button'
            className='editor-link-action editor-link-action-primary'
            onMouseDown={preventDefault}
            onClick={handleLinkSubmission}
            title='Save'
          >
            <Check size={12} />
          </button>

          <button
            type='button'
            className='editor-link-action'
            onMouseDown={preventDefault}
            onClick={() => {
              setIsLinkEditMode(false);
            }}
            title='Cancel'
          >
            <X size={12} />
          </button>
          </div>
        </div>
      );
    }

    return (
      <div className='editor-link-popover'>
        <a href={sanitizeUrl(linkUrl)} target='_blank' rel='noopener noreferrer' className='editor-link-url' title={linkUrl}>
          {linkUrl}
        </a>
        <div className='editor-link-actions'>
          <button
            type='button'
            className='editor-link-action'
            onMouseDown={preventDefault}
            onClick={() => window.open(sanitizeUrl(linkUrl), '_blank', 'noopener,noreferrer')}
            title='Open link'
          >
            <ExternalLink size={12} />
          </button>
          <button
            type='button'
            className='editor-link-action'
            onMouseDown={preventDefault}
            onClick={() => {
              navigator.clipboard?.writeText(linkUrl);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            }}
            title='Copy link'
          >
            <Copy size={12} />
          </button>
        <button
          type='button'
          className='editor-link-action'
          onMouseDown={preventDefault}
          onClick={event => {
            event.preventDefault();
            setEditedLinkUrl(linkUrl);
            setIsLinkEditMode(true);
          }}
          title='Edit link'
        >
          <Pencil size={12} />
        </button>
        <button
          type='button'
          className='editor-link-action editor-link-action-danger'
          onMouseDown={preventDefault}
          onClick={() => {
            editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
          }}
          title='Unlink'
        >
          <Trash size={12} />
        </button>
        {copied && <span className='editor-link-copied'>Copied!</span>}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={editorRef}
      className='editor-link-floating-panel'
    >
      {renderContent()}
    </div>
  );
}

function useFloatingLinkEditorToolbar(
  editor: LexicalEditor,
  anchorElem: HTMLElement,
  isLinkEditMode: boolean,
  setIsLinkEditMode: Dispatch<boolean>,
) {
  const [activeEditor, setActiveEditor] = useState(editor);
  const [isLink, setIsLink] = useState(false);

  useEffect(() => {
    function $updateToolbar() {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const focusNode = getSelectedNode(selection);
        const focusLinkNode = $findMatchingParent(focusNode, $isLinkNode);
        const focusAutoLinkNode = $findMatchingParent(focusNode, $isAutoLinkNode);
        if (!(focusLinkNode || focusAutoLinkNode)) {
          setIsLink(false);
          return;
        }
        const badNode = selection
          .getNodes()
          .filter(node => !$isLineBreakNode(node))
          .find(node => {
            const linkNode = $findMatchingParent(node, $isLinkNode);
            const autoLinkNode = $findMatchingParent(node, $isAutoLinkNode);
            return (
              (focusLinkNode && !focusLinkNode.is(linkNode)) ||
              (linkNode && !linkNode.is(focusLinkNode)) ||
              (focusAutoLinkNode && !focusAutoLinkNode.is(autoLinkNode)) ||
              (autoLinkNode && (!autoLinkNode.is(focusAutoLinkNode) || autoLinkNode.getIsUnlinked()))
            );
          });
        setIsLink(!badNode);
      } else if ($isNodeSelection(selection)) {
        const nodes = selection.getNodes();
        if (nodes.length === 0) {
          setIsLink(false);
          return;
        }
        const node = nodes[0];
        const parent = node.getParent();
        if ($isLinkNode(parent) || $isLinkNode(node)) {
          setIsLink(true);
        } else {
          setIsLink(false);
        }
      }
    }
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          $updateToolbar();
        });
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        (_payload, newEditor) => {
          $updateToolbar();
          setActiveEditor(newEditor);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        CLICK_COMMAND,
        payload => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const node = getSelectedNode(selection);
            const linkNode = $findMatchingParent(node, $isLinkNode);
            if ($isLinkNode(linkNode) && (payload.metaKey || payload.ctrlKey)) {
              window.open(linkNode.getURL(), '_blank');
              return true;
            }
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);

  return createPortal(
    <FloatingLinkEditor
      editor={activeEditor}
      isLink={isLink}
      anchorElem={anchorElem}
      setIsLink={setIsLink}
      isLinkEditMode={isLinkEditMode}
      setIsLinkEditMode={setIsLinkEditMode}
    />,
    anchorElem,
  );
}

export default function FloatingLinkEditorPlugin({
  anchorElem = document.body,
  isLinkEditMode,
  setIsLinkEditMode,
}: Readonly<{
  anchorElem?: HTMLElement;
  isLinkEditMode: boolean;
  setIsLinkEditMode: Dispatch<boolean>;
}>) {
  const [editor] = useLexicalComposerContext();
  return useFloatingLinkEditorToolbar(editor, anchorElem, isLinkEditMode, setIsLinkEditMode);
}
