import { cn } from '@/lib/utils';
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { $isListNode, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createHeadingNode, $createQuoteNode, $isHeadingNode, $isQuoteNode, HeadingTagType } from '@lexical/rich-text';
import { $createCodeNode, $isCodeNode } from '@lexical/code';
import { $setBlocksType } from '@lexical/selection';
import { Select } from 'antd';
import {
  $createParagraphNode,
  $createTextNode,
  $findMatchingParent,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  ElementFormatType,
  ElementNode,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  KEY_ENTER_COMMAND,
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
  Code,
  Eraser,
  Image,
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
import { $createCalloutNode, CalloutType } from '../../nodes/CalloutNode';
import { getSelectedNode } from '../../utils/getSelectedNode';
import { sanitizeUrl } from '../../utils/url';
import { ImagePickerRenderer, InsertImageDialog } from '../ImagesPlugin';

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
};

type ToolbarState = typeof InitialToolbarState;

type Props = {
  editor?: LexicalEditor | null;
  disabled?: boolean;
  renderImagePicker?: ImagePickerRenderer;
};

export const ToolbarPlugin = ({ editor, disabled, renderImagePicker }: Props) => {
  const [activeFormats, setActiveFormats] = useState<ToolbarState>(InitialToolbarState);
  const [isLinkEditMode, setIsLinkEditMode] = useState<boolean>(false);

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

    setActiveFormats({
      blockType,
      bold: selection.hasFormat('bold'),
      italic: selection.hasFormat('italic'),
      underline: selection.hasFormat('underline'),
      strikethrough: selection.hasFormat('strikethrough'),
      code: selection.hasFormat('code'),
      link: isLink,
      elementFormat,
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

  const insertLink = () => {
    if (!editor) return;
    if (activeFormats.link) {
      setIsLinkEditMode(false);
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    } else {
      setIsLinkEditMode(true);
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, sanitizeUrl('https://'));
    }
  };

  const [visibleImageModal, setVisibleImageModal] = useState<boolean>(false);
  const [showCalloutMenu, setShowCalloutMenu] = useState(false);

  const insertCallout = (type: CalloutType) => {
    if (!editor) return;
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        // Get selected text before converting
        const selectedText = selection.getTextContent();
        // Convert block to CalloutNode
        $setBlocksType(selection, () => $createCalloutNode(type));
        // Insert the selected text into the callout
        if (selectedText) {
          const newSelection = $getSelection();
          if ($isRangeSelection(newSelection)) {
            newSelection.insertText(selectedText);
          }
        }
      }
    });
    setShowCalloutMenu(false);
  };

  const clearContent = () => {
    if (!editor) return;
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      root.selectEnd();
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
        <InsertImageDialog
          activeEditor={editor}
          onClose={() => setVisibleImageModal(false)}
          open={visibleImageModal}
          renderImagePicker={renderImagePicker}
        />
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

      <ToolbarButtonGroup>
        <ToolbarButton disabled={disabled} onClick={() => formatText('bold')} active={activeFormats.bold} title='Bold'>
          <Bold size={18} />
        </ToolbarButton>

        <ToolbarButton
          disabled={disabled}
          active={activeFormats.italic}
          onClick={() => formatText('italic')}
          title='Italic'
        >
          <Italic size={18} />
        </ToolbarButton>

        <ToolbarButton
          disabled={disabled}
          active={activeFormats.underline}
          onClick={() => formatText('underline')}
          title='Underline'
        >
          <Underline size={18} />
        </ToolbarButton>

        <ToolbarButton
          disabled={disabled}
          active={activeFormats.strikethrough}
          onClick={() => formatText('strikethrough')}
          title='Strikethrough'
        >
          <Strikethrough size={18} />
        </ToolbarButton>

        <ToolbarButton
          disabled={disabled}
          active={activeFormats.blockType === 'code'}
          onClick={() => formatBlockType(activeFormats.blockType === 'code' ? 'paragraph' : 'code')}
          title='Code Block'
        >
          <Code size={18} />
        </ToolbarButton>

        <ToolbarButton disabled={disabled} active={activeFormats.link} onClick={insertLink} title='Insert link'>
          <Link size={16} />
        </ToolbarButton>
      </ToolbarButtonGroup>

      <ToolbarButtonGroup>
        <ToolbarButton
          disabled={disabled}
          onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}
          title='Bullet List'
        >
          <List size={18} />
        </ToolbarButton>
        <ToolbarButton
          disabled={disabled}
          onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}
          title='Numbered List'
        >
          <ListOrdered size={18} />
        </ToolbarButton>
      </ToolbarButtonGroup>

      <ToolbarButtonGroup>
        <ToolbarButton disabled={disabled} onClick={() => setVisibleImageModal(true)} title='Image'>
          <Image size={18} />
        </ToolbarButton>
        <div className='relative'>
          <ToolbarButton
            disabled={disabled}
            onClick={() => setShowCalloutMenu(!showCalloutMenu)}
            title='Insert Callout (success/info/warning/error)'
          >
            <MessageSquare size={18} />
          </ToolbarButton>
          {showCalloutMenu && (
            <>
              <div className='fixed inset-0' style={{ zIndex: 9998 }} onClick={() => setShowCalloutMenu(false)} />
              <div
                className='absolute left-0 mt-1 rounded-xl shadow-2xl p-1.5 flex flex-col gap-0.5 min-w-[140px]'
                style={{
                  top: '100%',
                  zIndex: 9999,
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                }}
              >
                {(['success', 'info', 'warning', 'error'] as CalloutType[]).map((type) => (
                  <button
                    key={type}
                    type='button'
                    onClick={() => insertCallout(type)}
                    className='flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors text-left cursor-pointer'
                    style={{ color: 'var(--foreground)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--muted)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span
                      className='w-2.5 h-2.5 rounded-full shrink-0'
                      style={{
                        background:
                          type === 'success' ? '#22c55e' :
                          type === 'info' ? '#3b82f6' :
                          type === 'warning' ? '#f59e0b' :
                          '#ef4444',
                      }}
                    />
                    <span className='capitalize'>{type}</span>
                  </button>
                ))}
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

      <div>
        <ToolbarButton disabled={disabled} onClick={clearContent} title='Clear Content'>
          <Eraser size={18} />
        </ToolbarButton>

        <ToolbarButton disabled={disabled} onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)} title='Undo'>
          <Undo size={18} />
        </ToolbarButton>

        <ToolbarButton disabled={disabled} onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)} title='Redo'>
          <Redo size={18} />
        </ToolbarButton>
      </div>
    </div>
  );
};

interface ToolbarButtonProps {
  onClick?: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
  className?: string;
  disabled?: boolean;
}

export function ToolbarButton({ onClick, title, active, children, className, disabled }: Readonly<ToolbarButtonProps>) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'editor-toolbar-button',
        active && 'editor-toolbar-button-active',
        disabled && 'editor-toolbar-button-disabled',
        className,
      )}
      title={title}
      type='button'
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function ToolbarButtonGroup({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className='editor-toolbar-group'>{children}</div>;
}
