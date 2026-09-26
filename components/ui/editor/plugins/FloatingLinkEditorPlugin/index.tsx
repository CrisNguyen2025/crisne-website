import { $createLinkNode, $isAutoLinkNode, $isLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $findMatchingParent, mergeRegister } from '@lexical/utils';
import {
  $createTextNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
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

import { Copy, Trash } from 'lucide-react';
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

interface HoveredLinkState {
  url: string;
  nodeKey: string;
  element: HTMLAnchorElement;
}

function FloatingLinkEditor({
  editor,
  isLink,
  setIsLink,
  anchorElem,
}: Readonly<{
  editor: LexicalEditor;
  isLink: boolean;
  setIsLink: Dispatch<boolean>;
  anchorElem: HTMLElement;
  isLinkEditMode?: boolean;
  setIsLinkEditMode?: Dispatch<boolean>;
}>) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isInputFocusedRef = useRef(false);

  const [linkUrl, setLinkUrl] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [copied, setCopied] = useState(false);
  const [hoveredLink, setHoveredLink] = useState<HoveredLinkState | null>(null);

  const hoverShowTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hoverHideTimerRef = useRef<NodeJS.Timeout | null>(null);

  const activeUrl = hoveredLink ? hoveredLink.url : linkUrl;
  const isVisible = !!hoveredLink || isLink;

  useEffect(() => {
    if (!isInputFocusedRef.current) {
      setInputValue(activeUrl || '');
    }
  }, [activeUrl]);

  const clearHideTimer = () => {
    if (hoverHideTimerRef.current) {
      clearTimeout(hoverHideTimerRef.current);
      hoverHideTimerRef.current = null;
    }
  };

  const startHideTimer = () => {
    clearHideTimer();
    hoverHideTimerRef.current = setTimeout(() => {
      // Don't hide if user is currently focused/typing in the input
      if (isInputFocusedRef.current) return;

      editor.getEditorState().read(() => {
        const selection = $getSelection();
        const selUrl = getUrlFromSelection(selection);
        if (!selUrl) {
          setHoveredLink(null);
          const editorElem = editorRef.current;
          if (editorElem) {
            setFloatingElemPositionForLinkEditor(null, editorElem, anchorElem);
          }
        }
      });
    }, 280);
  };

  // Hover detection on editor root element with debounce
  useEffect(() => {
    const rootElement = editor.getRootElement();
    if (!rootElement) return;

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const linkElem = target?.closest('a') as HTMLAnchorElement | null;

      if (linkElem && rootElement.contains(linkElem)) {
        clearHideTimer();

        // If hovering over the current active hovered link, keep it
        if (hoveredLink?.element === linkElem) return;

        if (hoverShowTimerRef.current) {
          clearTimeout(hoverShowTimerRef.current);
        }

        // Debounce hover (200ms)
        hoverShowTimerRef.current = setTimeout(() => {
          editor.getEditorState().read(() => {
            const node = $getNearestNodeFromDOMNode(linkElem);
            if (!node) return;
            const linkNode = $findMatchingParent(node, $isLinkNode);
            const targetNode = $isLinkNode(linkNode) ? linkNode : ($isLinkNode(node) ? node : null);
            if (targetNode) {
              const url = targetNode.getURL();
              setHoveredLink({
                url,
                nodeKey: targetNode.getKey(),
                element: linkElem,
              });
              if (!isInputFocusedRef.current) {
                setInputValue(url);
              }

              const editorElem = editorRef.current;
              if (editorElem) {
                const rect = linkElem.getBoundingClientRect();
                const targetRect = {
                  top: rect.top + rect.height + 4,
                  left: rect.left,
                  bottom: rect.bottom + 4,
                  right: rect.right,
                  width: rect.width,
                  height: rect.height,
                  x: rect.x,
                  y: rect.y + rect.height + 4,
                  toJSON: () => {},
                } as DOMRect;
                setFloatingElemPositionForLinkEditor(targetRect, editorElem, anchorElem);
              }
            }
          });
        }, 200);
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const linkElem = target?.closest('a') as HTMLAnchorElement | null;
      const related = e.relatedTarget as HTMLElement | null;

      if (linkElem) {
        if (hoverShowTimerRef.current) {
          clearTimeout(hoverShowTimerRef.current);
          hoverShowTimerRef.current = null;
        }

        // If moving directly into the floating popover, or typing, do not hide
        if (isInputFocusedRef.current || (related && editorRef.current?.contains(related))) {
          return;
        }

        startHideTimer();
      }
    };

    rootElement.addEventListener('mouseover', handleMouseOver);
    rootElement.addEventListener('mouseout', handleMouseOut);

    return () => {
      rootElement.removeEventListener('mouseover', handleMouseOver);
      rootElement.removeEventListener('mouseout', handleMouseOut);
      if (hoverShowTimerRef.current) clearTimeout(hoverShowTimerRef.current);
      clearHideTimer();
    };
  }, [editor, anchorElem, hoveredLink]);

  const $updateLinkEditor = useCallback(() => {
    // If hoveredLink is active and still connected, position according to hovered link
    if (hoveredLink && hoveredLink.element.isConnected) {
      const editorElem = editorRef.current;
      if (editorElem) {
        const rect = hoveredLink.element.getBoundingClientRect();
        const targetRect = {
          top: rect.top + rect.height + 4,
          left: rect.left,
          bottom: rect.bottom + 4,
          right: rect.right,
          width: rect.width,
          height: rect.height,
          x: rect.x,
          y: rect.y + rect.height + 4,
          toJSON: () => {},
        } as DOMRect;
        setFloatingElemPositionForLinkEditor(targetRect, editorElem, anchorElem);
      }
      return;
    }

    const selection = $getSelection();
    const nextUrl = getUrlFromSelection(selection);
    if (nextUrl !== null) {
      setLinkUrl(nextUrl);
      if (!isInputFocusedRef.current) {
        setInputValue(nextUrl);
      }
    }

    const editorElem = editorRef.current;
    const rootElement = editor.getRootElement();
    if (!editorElem || !rootElement) return;

    const nativeSelection = getDOMSelection(editor._window);
    if (selection && editor.isEditable() && isLink) {
      const domRect = getDomRectForSelection(selection, editor, rootElement, nativeSelection);
      if (domRect) {
        domRect.y += 32;
        setFloatingElemPositionForLinkEditor(domRect, editorElem, anchorElem);
      }
      return;
    }

    if (!hoveredLink) {
      setFloatingElemPositionForLinkEditor(null, editorElem, anchorElem);
      setLinkUrl('');
    }
  }, [anchorElem, editor, hoveredLink, isLink]);

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
          setHoveredLink(null);
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

  const handleSaveUrl = (newUrl: string) => {
    let formattedUrl = newUrl.trim();
    if (!formattedUrl) {
      handleClear();
      return;
    }

    if (
      !/^https?:\/\//i.test(formattedUrl) &&
      !/^mailto:/i.test(formattedUrl) &&
      !/^tel:/i.test(formattedUrl) &&
      !/^#/i.test(formattedUrl) &&
      !/^\//i.test(formattedUrl)
    ) {
      formattedUrl = 'https://' + formattedUrl;
    }

    editor.update(() => {
      let targetNode: LinkNode | null = null;
      if (hoveredLink) {
        const node = $getNodeByKey(hoveredLink.nodeKey);
        if ($isLinkNode(node)) {
          targetNode = node;
        }
      }
      if (!targetNode) {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const node = getSelectedNode(selection);
          const linkParent = $findMatchingParent(node, $isLinkNode);
          targetNode = $isLinkNode(linkParent) ? linkParent : ($isLinkNode(node) ? node : null);
        }
      }

      if (targetNode) {
        targetNode.setURL(formattedUrl);
        targetNode.setTarget('_blank');
        targetNode.setRel('noopener noreferrer');
      }
    });

    setLinkUrl(formattedUrl);
    setInputValue(formattedUrl);
    if (hoveredLink) {
      setHoveredLink(prev => prev ? { ...prev, url: formattedUrl } : null);
    }
  };

  const handleClear = () => {
    editor.update(() => {
      let targetNode: LinkNode | null = null;
      if (hoveredLink) {
        const node = $getNodeByKey(hoveredLink.nodeKey);
        if ($isLinkNode(node)) {
          targetNode = node;
        }
      }
      if (!targetNode) {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const node = getSelectedNode(selection);
          const linkParent = $findMatchingParent(node, $isLinkNode);
          targetNode = $isLinkNode(linkParent) ? linkParent : ($isLinkNode(node) ? node : null);
        }
      }

      if (targetNode) {
        const textNode = $createTextNode(targetNode.getTextContent());
        targetNode.replace(textNode);
      } else {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
      }
    });

    setHoveredLink(null);
    setIsLink(false);
    setLinkUrl('');
    setInputValue('');
  };

  const handleCopy = (event: React.MouseEvent) => {
    event.preventDefault();
    const urlToCopy = inputValue.trim() || activeUrl;
    if (urlToCopy) {
      navigator.clipboard?.writeText(urlToCopy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };

  const renderContent = () => {
    if (!isVisible || !activeUrl) return null;

    return (
      <div className='editor-link-popover'>
        <input
          ref={inputRef}
          type='text'
          className='editor-link-input text-xs'
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onFocus={() => {
            isInputFocusedRef.current = true;
            clearHideTimer();
          }}
          onBlur={() => {
            isInputFocusedRef.current = false;
            if (inputValue.trim() && inputValue.trim() !== activeUrl) {
              handleSaveUrl(inputValue);
            }
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSaveUrl(inputValue);
              inputRef.current?.blur();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setInputValue(activeUrl);
              inputRef.current?.blur();
            }
          }}
          placeholder='https://...'
          spellCheck={false}
          autoComplete='off'
        />
        <div className='editor-link-actions'>
          <button
            type='button'
            className='editor-link-action'
            onMouseDown={preventDefault}
            onClick={handleCopy}
            title='Copy link'
          >
            <Copy size={13} />
          </button>
          <button
            type='button'
            className='editor-link-action editor-link-action-danger'
            onMouseDown={preventDefault}
            onClick={handleClear}
            title='Clear link'
          >
            <Trash size={13} />
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
      onMouseEnter={() => {
        clearHideTimer();
      }}
      onMouseLeave={() => {
        if (!isInputFocusedRef.current) {
          startHideTimer();
        }
      }}
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
              window.open(linkNode.getURL(), '_blank', 'noopener,noreferrer');
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
