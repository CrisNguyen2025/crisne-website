import { cn } from '@/lib/utils';
import { $createLinkNode, $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createHeadingNode, $createQuoteNode, $isHeadingNode, $isQuoteNode, HeadingTagType } from '@lexical/rich-text';
import { $createCodeNode, $isCodeNode } from '@lexical/code';
import { $setBlocksType } from '@lexical/selection';
import { Button, Input, Modal, Select, Tooltip } from 'antd';
import {
  $createParagraphNode,
  $createTextNode,
  $findMatchingParent,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  createCommand,
  ElementFormatType,
  ElementNode,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_MODIFIER_COMMAND,
  LexicalCommand,
  LexicalEditor,
  REDO_COMMAND,
  TextFormatType,
  UNDO_COMMAND,
} from 'lexical';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  Eraser,
  Italic,
  Link,
  List,
  ListOrdered,
  MessageSquare,
  Redo,
  Strikethrough,
  Underline,
  Undo,
} from 'lucide-react';

import React, { Dispatch, useCallback, useEffect, useState } from 'react';
import { $createCalloutNode, $isCalloutNode, CalloutType } from '../../nodes/CalloutNode';
import { getSelectedNode } from '../../utils/getSelectedNode';
import { sanitizeUrl } from '../../utils/url';
import { ImagePickerRenderer } from '../ImagesPlugin';

export const OPEN_LINK_MODAL_COMMAND: LexicalCommand<void> = createCommand('OPEN_LINK_MODAL_COMMAND');

export const BlockTypeToBlockName = {
  paragraph: 'Normal',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
  h5: 'Heading 5',
  h6: 'Heading 6',
  quote: 'Quote',
  code: 'Code Block',
};

export const TextFormat = {
  lowercase: 'Lowercase',
  uppercase: 'Uppercase',
  capitalize: 'Capitalize',
};

export type BlockTypeKey = keyof typeof BlockTypeToBlockName;

export const InitialToolbarState = {
  blockType: 'paragraph' as keyof typeof BlockTypeToBlockName,
  elementFormat: 'left' as ElementFormatType,
  link: false,
  code: false,
  bold: false,
  italic: false,
  strikethrough: false,
  underline: false,
  bulletList: false,
  numberedList: false,
  calloutType: null as CalloutType | null,
};

type ToolbarState = typeof InitialToolbarState;

type Props = {
  editor?: LexicalEditor | null;
  disabled?: boolean;
  renderImagePicker?: ImagePickerRenderer;
};

export const ToolbarPlugin = ({ editor: propEditor, disabled, renderImagePicker }: Props) => {
  const [contextEditor] = useLexicalComposerContext();
  const editor = propEditor || contextEditor;
  const [activeFormats, setActiveFormats] = useState<ToolbarState>(InitialToolbarState);

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();

    if (!$isRangeSelection(selection)) return;

    const node = getSelectedNode(selection);
    const parent = node.getParent();
    const isLink = $isLinkNode(parent) || $isLinkNode(node);

    let matchingParent;
    if ($isLinkNode(parent)) {
      matchingParent = $findMatchingParent(node, parentNode => $isElementNode(parentNode) && !parentNode.isInline());
    }

    let elementFormat: ElementFormatType = 'left';

    if ($isElementNode(matchingParent)) {
      elementFormat = matchingParent.getFormatType();
    } else if ($isElementNode(node)) {
      elementFormat = node.getFormatType();
    } else if (parent) {
      elementFormat = parent.getFormatType() || 'left';
    }

    // Detect block type from cursor position
    let blockType: BlockTypeKey = 'paragraph';
    const anchorNode = selection.anchor.getNode();
    const element = anchorNode.getKey() === 'root' ? anchorNode : $findMatchingParent(anchorNode, e => {
      const p = e.getParent();
      return p !== null && $isElementNode(p) && p.getKey() === 'root';
    });

    if (element !== null) {
      if ($isCodeNode(element)) {
        blockType = 'code';
      } else if ($isHeadingNode(element)) {
        blockType = element.getTag() as BlockTypeKey;
      } else if ($isQuoteNode(element)) {
        blockType = 'quote';
      } else if ($isListNode(element)) {
        blockType = 'paragraph';
      } else {
        blockType = 'paragraph';
      }
    }

    // Detect list type
    let isBulletList = false;
    let isNumberedList = false;
    const parentList = $findMatchingParent(anchorNode, curr => $isListNode(curr));
    if ($isListNode(parentList)) {
      const listType = parentList.getListType();
      isBulletList = listType === 'bullet';
      isNumberedList = listType === 'number';
    }

    // Detect callout type
    let currentCalloutType: CalloutType | null = null;
    const parentCallout = $findMatchingParent(anchorNode, curr => $isCalloutNode(curr));
    if ($isCalloutNode(parentCallout)) {
      currentCalloutType = parentCallout.getCalloutType();
    }

    setActiveFormats({
      blockType,
      bold: selection.hasFormat('bold'),
      italic: selection.hasFormat('italic'),
      underline: selection.hasFormat('underline'),
      strikethrough: selection.hasFormat('strikethrough'),
      code: selection.hasFormat('code'),
      link: isLink,
      elementFormat,
      bulletList: isBulletList,
      numberedList: isNumberedList,
      calloutType: currentCalloutType,
    });
  }, [setActiveFormats]);

  useEffect(() => {
    if (!editor || disabled) return;

    // Trigger initial updates
    editor.getEditorState().read(updateToolbar);

    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(updateToolbar);
    });
  }, [editor, disabled, updateToolbar]);

  useEffect(() => {
    if (!editor || disabled) return;

    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      () => {
        queueMicrotask(() => {
          editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;

            const currentNode = getSelectedNode(selection);
            const currentParent = currentNode.getParent();
            const inList = $isListNode(currentNode) || $isListNode(currentParent);

            // Keep list behavior, reset inline format on new non-list line
            if (inList) return;

            const inlineFormats: TextFormatType[] = ['bold', 'italic', 'underline', 'strikethrough', 'code'];
            inlineFormats.forEach(format => {
              if (selection.hasFormat(format)) selection.formatText(format);
            });

            const selectedNode = getSelectedNode(selection);
            const selectedParent = selectedNode.getParent();
            if ($isLinkNode(selectedNode) || $isLinkNode(selectedParent)) {
              editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
            }
          });
        });

        return false;
      },
      1,
    );
  }, [disabled, editor]);

  const formatBlockType = (value: BlockTypeKey) => {
    if (!editor) return;
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        setActiveFormats(prev => ({ ...prev, blockType: value }));
        switch (value) {
          case 'paragraph':
            $setBlocksType(selection, () => $createParagraphNode());
            break;
          case 'quote':
            $setBlocksType(selection, () => $createQuoteNode());
            break;
          case 'code': {
            // Find all selected top-level element nodes to avoid splitting
            const topLevelElements = new Set<ElementNode>();
            const selectedNodes = selection.getNodes();
            selectedNodes.forEach(node => {
              let parent: any = node;
              while (parent) {
                const parentNode = parent.getParent();
                if (parentNode === null || parentNode.getKey() === 'root') {
                  break;
                }
                parent = parentNode;
              }
              if (parent && $isElementNode(parent)) {
                topLevelElements.add(parent as ElementNode);
              }
            });

            // Extract text lines
            const textLines: string[] = [];
            topLevelElements.forEach(el => {
              textLines.push(el.getTextContent());
            });

            const combinedText = textLines.join('\n');

            // Create one code block node
            const codeNode = $createCodeNode();
            const textNode = $createTextNode(combinedText);
            codeNode.append(textNode);

            // Replace the first element with the code block, delete the rest
            const elementsArray = Array.from(topLevelElements);
            if (elementsArray.length > 0) {
              const firstElement = elementsArray[0];
              firstElement.replace(codeNode);
              for (let i = 1; i < elementsArray.length; i++) {
                elementsArray[i].remove();
              }
            }
            codeNode.select();
            break;
          }
          default:
            $setBlocksType(selection, () => $createHeadingNode(value as HeadingTagType));
        }
      }
    });
  };

  const formatText = (format: TextFormatType): void => {
    if (!editor) return;
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  };

  const formatAlignment = (alignment: ElementFormatType): void => {
    if (!editor) return;
    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, alignment);
  };

  const [isLinkModalOpen, setIsLinkModalOpen] = useState<boolean>(false);
  const [linkText, setLinkText] = useState<string>('');
  const [linkUrl, setLinkUrl] = useState<string>('');
  const [isEditingLink, setIsEditingLink] = useState<boolean>(false);
  const [targetLinkKey, setTargetLinkKey] = useState<string | null>(null);

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      let text = '';
      let url = '';
      let isExisting = false;
      let key: string | null = null;

      if ($isRangeSelection(selection)) {
        const node = getSelectedNode(selection);
        const linkParent = $findMatchingParent(node, $isLinkNode);
        const targetLink = $isLinkNode(linkParent) ? linkParent : ($isLinkNode(node) ? node : null);
        if (targetLink) {
          isExisting = true;
          url = targetLink.getURL();
          text = targetLink.getTextContent();
          key = targetLink.getKey();
        } else {
          text = selection.getTextContent();
        }
      }

      setLinkText(text);
      setLinkUrl(url);
      setIsEditingLink(isExisting);
      setTargetLinkKey(key);
      setIsLinkModalOpen(true);
    });
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const unregisterModifier = editor.registerCommand(
      KEY_MODIFIER_COMMAND,
      (event) => {
        if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          openLinkDialog();
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const unregisterCustom = editor.registerCommand(
      OPEN_LINK_MODAL_COMMAND,
      () => {
        openLinkDialog();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    return () => {
      unregisterModifier();
      unregisterCustom();
    };
  }, [editor, openLinkDialog]);

  const handleConfirmLink = () => {
    if (!editor) return;
    let formattedUrl = linkUrl.trim();
    if (!formattedUrl) {
      handleRemoveLink();
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

    const displayText = linkText.trim() || formattedUrl;

    editor.update(() => {
      if (targetLinkKey) {
        const existingNode = $getNodeByKey(targetLinkKey);
        if ($isLinkNode(existingNode)) {
          existingNode.setURL(formattedUrl);
          existingNode.setTarget('_blank');
          existingNode.setRel('noopener noreferrer');
          if (displayText !== existingNode.getTextContent()) {
            existingNode.clear();
            existingNode.append($createTextNode(displayText));
          }
          return;
        }
      }

      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        if (selection.isCollapsed()) {
          const linkNode = $createLinkNode(formattedUrl, { target: '_blank', rel: 'noopener noreferrer' });
          linkNode.append($createTextNode(displayText));
          selection.insertNodes([linkNode]);
          const spaceNode = $createTextNode(' ');
          linkNode.insertAfter(spaceNode);
          spaceNode.select();
        } else {
          if (linkText.trim() && linkText.trim() !== selection.getTextContent()) {
            const linkNode = $createLinkNode(formattedUrl, { target: '_blank', rel: 'noopener noreferrer' });
            linkNode.append($createTextNode(displayText));
            selection.insertNodes([linkNode]);
          } else {
            editor.dispatchCommand(TOGGLE_LINK_COMMAND, {
              url: formattedUrl,
              target: '_blank',
              rel: 'noopener noreferrer',
            });
          }
        }
      } else {
        const root = $getRoot();
        const linkNode = $createLinkNode(formattedUrl, { target: '_blank', rel: 'noopener noreferrer' });
        linkNode.append($createTextNode(displayText));
        const lastChild = root.getLastChild();
        if ($isElementNode(lastChild)) {
          lastChild.append(linkNode);
        } else {
          const p = $createParagraphNode();
          p.append(linkNode);
          root.append(p);
        }
      }
    });

    setIsLinkModalOpen(false);
    editor.focus();
  };

  const handleRemoveLink = () => {
    if (!editor) return;
    editor.update(() => {
      if (targetLinkKey) {
        const existingNode = $getNodeByKey(targetLinkKey);
        if ($isLinkNode(existingNode)) {
          const textNode = $createTextNode(existingNode.getTextContent());
          existingNode.replace(textNode);
          return;
        }
      }

      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const node = getSelectedNode(selection);
        const linkParent = $findMatchingParent(node, $isLinkNode);
        const targetLink = $isLinkNode(linkParent) ? linkParent : ($isLinkNode(node) ? node : null);
        if (targetLink) {
          const textNode = $createTextNode(targetLink.getTextContent());
          targetLink.replace(textNode);
        } else {
          editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
        }
      } else {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
      }
    });

    setIsLinkModalOpen(false);
    editor.focus();
  };

  const [showCalloutMenu, setShowCalloutMenu] = useState(false);

  const insertCallout = (type: CalloutType) => {
    if (!editor) return;
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;

      const anchorNode = selection.anchor.getNode();
      const existingCallout = $findMatchingParent(anchorNode, curr => $isCalloutNode(curr));

      if ($isCalloutNode(existingCallout)) {
        if (existingCallout.getCalloutType() === type) {
          // Toggle off back to normal paragraph
          $setBlocksType(selection, () => $createParagraphNode());
        } else {
          // Switch callout type (e.g. error -> warning)
          existingCallout.setCalloutType(type);
        }
      } else {
        // Convert block(s) into CalloutNode
        $setBlocksType(selection, () => $createCalloutNode(type));
      }

      // Clean up any duplicate or lingering markers like [!error] inside callout text
      const updatedCallout = $findMatchingParent(selection.anchor.getNode(), curr => $isCalloutNode(curr));
      if ($isCalloutNode(updatedCallout)) {
        const firstChild = updatedCallout.getFirstChild();
        if ($isTextNode(firstChild)) {
          const text = firstChild.getTextContent();
          const clean = text.replace(/^\s*(?:\[!(?:success|info|warning|error)\]\s*)+/gi, '');
          if (clean !== text) {
            firstChild.setTextContent(clean);
          }
        }
      }
    });
    setShowCalloutMenu(false);
  };

  const toggleBulletList = () => {
    if (!editor) return;
    if (activeFormats.bulletList) {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    }
  };

  const toggleNumberedList = () => {
    if (!editor) return;
    if (activeFormats.numberedList) {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    }
  };

  const clearContent = () => {
    if (!editor) return;
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      const p = $createParagraphNode();
      root.append(p);
      p.select();
    });
  };

  if (!editor) {
    return (
      <div className="editor-toolbar flex items-center justify-center text-xs text-gray-400 select-none py-1.5 px-3 bg-gray-50/50 dark:bg-gray-900/50 italic border-b border-gray-200/50 dark:border-gray-800/50 h-[38px] w-full">
        Click inside any editor to start formatting content
      </div>
    );
  }

  return (
    <div className='editor-toolbar w-full border-0! border-b! border-gray-200/50! dark:border-gray-800/50!'>
      <Tooltip title='Style' mouseEnterDelay={0.3} placement='bottom' arrow={false}>
        <Select
          size='small'
          onChange={formatBlockType}
          value={activeFormats.blockType}
          style={{ width: 110 }}
          disabled={disabled}
        >
          {Object.entries(BlockTypeToBlockName).map(([value, title]) => (
            <Select.Option value={value} key={value}>
              {title}
            </Select.Option>
          ))}
        </Select>
      </Tooltip>

      <ToolbarButtonGroup>
        <ToolbarButton
          disabled={disabled}
          onClick={() => formatText('bold')}
          active={activeFormats.bold}
          title='Bold'
          shortcut='Ctrl+B'
        >
          <Bold size={18} />
        </ToolbarButton>

        <ToolbarButton
          disabled={disabled}
          active={activeFormats.italic}
          onClick={() => formatText('italic')}
          title='Italic'
          shortcut='Ctrl+I'
        >
          <Italic size={18} />
        </ToolbarButton>

        <ToolbarButton
          disabled={disabled}
          active={activeFormats.underline}
          onClick={() => formatText('underline')}
          title='Underline'
          shortcut='Ctrl+U'
        >
          <Underline size={18} />
        </ToolbarButton>

        <ToolbarButton
          disabled={disabled}
          active={activeFormats.strikethrough}
          onClick={() => formatText('strikethrough')}
          title='Strikethrough'
          shortcut='Ctrl+Shift+X'
        >
          <Strikethrough size={18} />
        </ToolbarButton>

        <ToolbarButton
          disabled={disabled}
          active={activeFormats.link}
          onClick={openLinkDialog}
          title={activeFormats.link ? 'Edit Link' : 'Insert Link'}
          shortcut='Ctrl+K'
        >
          <Link size={16} />
        </ToolbarButton>
      </ToolbarButtonGroup>

      <ToolbarButtonGroup>
        <ToolbarButton
          disabled={disabled}
          active={activeFormats.bulletList}
          onClick={toggleBulletList}
          title='Bullet List'
        >
          <List size={18} />
        </ToolbarButton>
        <ToolbarButton
          disabled={disabled}
          active={activeFormats.numberedList}
          onClick={toggleNumberedList}
          title='Numbered List'
        >
          <ListOrdered size={18} />
        </ToolbarButton>
      </ToolbarButtonGroup>

      <ToolbarButtonGroup>
        <div className='relative'>
          <ToolbarButton
            disabled={disabled}
            active={!!activeFormats.calloutType}
            onClick={() => setShowCalloutMenu(!showCalloutMenu)}
            title='Callout Box'
          >
            <MessageSquare size={18} />
          </ToolbarButton>
          {showCalloutMenu && (
            <>
              <div className='fixed inset-0' style={{ zIndex: 9998 }} onClick={() => setShowCalloutMenu(false)} />
              <div
                className='absolute left-0 mt-1 rounded-xl shadow-2xl p-1.5 flex flex-col gap-0.5 min-w-[150px]'
                style={{
                  top: '100%',
                  zIndex: 9999,
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                }}
              >
                {(
                  [
                    { type: 'info', label: 'Info', color: '#0ea5e9' },
                    { type: 'success', label: 'Success', color: '#10b981' },
                    { type: 'warning', label: 'Warning', color: '#f59e0b' },
                    { type: 'error', label: 'Error', color: '#ef4444' },
                  ] as const
                ).map(({ type, label, color }) => {
                  const isActive = activeFormats.calloutType === type;
                  return (
                    <button
                      key={type}
                      type='button'
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertCallout(type)}
                      className={cn(
                        'flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-colors text-left cursor-pointer',
                        isActive
                          ? 'bg-muted text-foreground'
                          : 'text-foreground/80 hover:bg-muted/70 hover:text-foreground',
                      )}
                    >
                      <div className='flex items-center gap-2.5'>
                        <span
                          className='w-2.5 h-2.5 rounded-full shrink-0'
                          style={{ background: color }}
                        />
                        <span>{label}</span>
                      </div>
                      {isActive && <Check size={14} className='text-primary shrink-0 ml-2' />}
                    </button>
                  );
                })}

                {activeFormats.calloutType && (
                  <>
                    <div className='my-1 border-t border-border/50' />
                    <button
                      type='button'
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        if (!editor) return;
                        editor.update(() => {
                          const selection = $getSelection();
                          if ($isRangeSelection(selection)) {
                            $setBlocksType(selection, () => $createParagraphNode());
                          }
                        });
                        setShowCalloutMenu(false);
                      }}
                      className='flex items-center gap-2 px-3 py-1.5 text-xs text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer w-full text-left font-medium'
                    >
                      Remove Callout
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </ToolbarButtonGroup>

      <ToolbarButtonGroup>
        <ToolbarButton
          disabled={disabled}
          active={activeFormats.elementFormat === 'left'}
          onClick={() => formatAlignment('left')}
          title='Align Left'
        >
          <AlignLeft size={18} />
        </ToolbarButton>

        <ToolbarButton
          disabled={disabled}
          active={activeFormats.elementFormat === 'center'}
          onClick={() => formatAlignment('center')}
          title='Align Center'
        >
          <AlignCenter size={18} />
        </ToolbarButton>
        <ToolbarButton
          disabled={disabled}
          active={activeFormats.elementFormat === 'right'}
          onClick={() => formatAlignment('right')}
          title='Align Right'
        >
          <AlignRight size={18} />
        </ToolbarButton>
      </ToolbarButtonGroup>

      <ToolbarButtonGroup>
        <ToolbarButton disabled={disabled} onClick={clearContent} title='Clear Content'>
          <Eraser size={18} />
        </ToolbarButton>

        <ToolbarButton
          disabled={disabled}
          onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
          title='Undo'
          shortcut='Ctrl+Z'
        >
          <Undo size={18} />
        </ToolbarButton>

        <ToolbarButton
          disabled={disabled}
          onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
          title='Redo'
          shortcut='Ctrl+Y'
        >
          <Redo size={18} />
        </ToolbarButton>
      </ToolbarButtonGroup>

      <Modal
        open={isLinkModalOpen}
        onCancel={() => setIsLinkModalOpen(false)}
        footer={null}
        title={
          <div className='flex items-center gap-2 text-base font-semibold'>
            <Link size={18} className='text-primary' />
            <span>{isEditingLink ? 'Edit Link' : 'Insert Link'}</span>
          </div>
        }
        width={420}
        centered
        destroyOnClose
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleConfirmLink();
          }}
          className='flex flex-col gap-4 mt-4'
        >
          <div>
            <label className='block text-xs font-medium text-foreground/80 mb-1.5'>
              Text to display
            </label>
            <Input
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              placeholder='Text to display'
              autoFocus={!linkText}
            />
          </div>

          <div>
            <label className='block text-xs font-medium text-foreground/80 mb-1.5'>
              Link URL <span className='text-rose-500'>*</span>
            </label>
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder='https://example.com'
              autoFocus={!!linkText}
            />
          </div>

          <div className='flex items-center justify-between pt-3 border-t border-border/50'>
            {isEditingLink ? (
              <Button
                danger
                type='text'
                size='small'
                onClick={handleRemoveLink}
                className='text-xs'
              >
                Remove link
              </Button>
            ) : (
              <div />
            )}

            <div className='flex items-center gap-2'>
              <Button size='small' onClick={() => setIsLinkModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type='primary'
                size='small'
                htmlType='submit'
                disabled={!linkUrl.trim()}
              >
                {isEditingLink ? 'Save' : 'Insert'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};

interface ToolbarButtonProps {
  onClick?: () => void;
  title: string;
  shortcut?: string;
  children: React.ReactNode;
  active?: boolean;
  className?: string;
  disabled?: boolean;
}

export function ToolbarButton({
  onClick,
  title,
  shortcut,
  active,
  children,
  className,
  disabled,
}: Readonly<ToolbarButtonProps>) {
  const displayShortcut = React.useMemo(() => {
    if (!shortcut) return null;
    if (typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)) {
      return shortcut.replace(/Ctrl\+/g, '⌘').replace(/Shift\+/g, '⇧');
    }
    return shortcut;
  }, [shortcut]);

  return (
    <Tooltip
      title={
        <span className='flex items-center gap-1.5 text-xs py-0.5 select-none'>
          <span>{title}</span>
          {displayShortcut && (
            <kbd className='px-1 py-0.2 rounded bg-white/20 dark:bg-black/40 text-[10px] font-mono leading-none border border-white/10'>
              {displayShortcut}
            </kbd>
          )}
        </span>
      }
      mouseEnterDelay={0.2}
      placement='bottom'
      arrow={false}
    >
      <button
        onMouseDown={(e) => {
          // Prevent losing selection inside the editor
          e.preventDefault();
        }}
        onClick={onClick}
        className={cn(
          'editor-toolbar-button',
          active && 'editor-toolbar-button-active',
          disabled && 'editor-toolbar-button-disabled',
          className,
        )}
        type='button'
        disabled={disabled}
        aria-label={title}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export function ToolbarButtonGroup({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className='editor-toolbar-group'>{children}</div>;
}
