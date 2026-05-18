import { cn } from '@/lib/utils';
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { $isListNode, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createHeadingNode, $createQuoteNode, HeadingTagType } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import { Select } from 'antd';
import {
  $createParagraphNode,
  $findMatchingParent,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  ElementFormatType,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  KEY_ENTER_COMMAND,
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
  Redo,
  Strikethrough,
  Underline,
  Undo,
} from 'lucide-react';

import React, { Dispatch, useCallback, useEffect, useState } from 'react';
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
  activeFormats: ToolbarState;
  onChange: (value: Partial<ToolbarState>) => void;
  setIsLinkEditMode: Dispatch<boolean>;
  disabled?: boolean;
  renderImagePicker?: ImagePickerRenderer;
};

export const ToolbarPlugin = ({ activeFormats, onChange, setIsLinkEditMode, disabled, renderImagePicker }: Props) => {
  const [editor] = useLexicalComposerContext();

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
    // lowercase: selection.hasFormat('lowercase'),
    // uppercase: selection.hasFormat('uppercase'),
    // capitalize: selection.hasFormat('capitalize'),

    onChange({
      ...activeFormats,
      bold: selection.hasFormat('bold'),
      italic: selection.hasFormat('italic'),
      underline: selection.hasFormat('underline'),
      strikethrough: selection.hasFormat('strikethrough'),
      code: selection.hasFormat('code'),
      link: isLink,
      elementFormat,
    });
  }, [activeFormats, onChange]);

  useEffect(() => {
    if (disabled) return;

    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(updateToolbar);
    });
  }, [editor, disabled, updateToolbar]);

  useEffect(() => {
    if (disabled) return;

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
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        onChange({ ...activeFormats, blockType: value });
        switch (value) {
          case 'paragraph':
            $setBlocksType(selection, () => $createParagraphNode());
            break;
          case 'quote':
            $setBlocksType(selection, () => $createQuoteNode());
            break;
          default:
            $setBlocksType(selection, () => $createHeadingNode(value as HeadingTagType));
        }
      }
    });
  };

  const formatText = (format: TextFormatType): void => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  };

  const formatAlignment = (alignment: ElementFormatType): void => {
    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, alignment);
  };

  const insertLink = () => {
    if (activeFormats.link) {
      setIsLinkEditMode(false);
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    } else {
      setIsLinkEditMode(true);
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, sanitizeUrl('https://'));
    }
  };

  const [visibleImageModal, setVisibleImageModal] = useState<boolean>(false);

  const clearContent = () => {
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      root.selectEnd();
    });
  };

  return (
    <div className='editor-toolbar'>
        <InsertImageDialog
          activeEditor={editor}
          onClose={() => setVisibleImageModal(false)}
          open={visibleImageModal}
          renderImagePicker={renderImagePicker}
        />
      <Select
        size='small'
        onChange={formatBlockType}
        defaultValue={'paragraph'}
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
          active={activeFormats.code}
          onClick={() => formatText('code')}
          title='Inline Code'
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
