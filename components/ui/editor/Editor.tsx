import { cn } from '@/lib/utils';
import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { $generateHtmlFromNodes } from '@lexical/html';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { ListItemNode, ListNode } from '@lexical/list';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { TablePlugin } from '@lexical/react/LexicalTablePlugin';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { Expand, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { COMMAND_PRIORITY_LOW, FOCUS_COMMAND, LexicalEditor } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import './editor.css';
import { CalloutNode } from './nodes/CalloutNode';
import { ImageNode } from './nodes/ImageNode';
import { KeywordNode } from './nodes/KeywordNode';
import { MentionNode } from './nodes/MentionNode';
import {
  AutoLinkPlugin,
  CodeActionPlugin,
  MarkdownPastePlugin,
  ImagesPlugin,
  InitialToolbarState,
  PasteImagePlugin,
  PasteTablePlugin,
  SetContentPlugin,
  ToolbarButton,
  ToolbarPlugin,
  type ImagePickerRenderer,
} from './plugins';
import CalloutTransformPlugin from './plugins/CalloutTransformPlugin';
import FloatingLinkEditorPlugin from './plugins/FloatingLinkEditorPlugin';
import LinkPlugin from './plugins/LinkPlugin';
import NewMentionsPlugin from './plugins/MentionPlugin';
import { defaultTheme } from './themes';
import { checkEmptyHtml } from './utils/checkEmptyHtml';

const initialConfig = {
  namespace: 'MyEditor',
  theme: defaultTheme,
  onError: (error: Error) => {
    console.error(error);
  },
  nodes: [
    HeadingNode,
    ListNode,
    ListItemNode,
    QuoteNode,
    CodeNode,
    CodeHighlightNode,
    TableNode,
    TableCellNode,
    TableRowNode,
    AutoLinkNode,
    LinkNode,
    ImageNode,
    KeywordNode,
    MentionNode,
    CalloutNode,
  ],
};

type Props = Readonly<{
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
  onFocus?: (editor: LexicalEditor) => void;
  onEditorInit?: (editor: LexicalEditor) => void;
  className?: string;
  shellClassName?: string;
  placeholder?: string;
  contentEditableClassName?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  skipValidateUrl?: boolean;
  mentionData?: string[];
  namespace?: string;
  renderImagePicker?: ImagePickerRenderer;
  minContentHeight?: number;
  showTopbar?: boolean;
  fillHeight?: boolean;
}>;

function EditorInitPlugin({
  onInit,
  onFocus,
}: {
  onInit?: (editor: LexicalEditor) => void;
  onFocus?: (editor: LexicalEditor) => void;
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    onInit?.(editor);
  }, [editor, onInit]);

  useEffect(() => {
    if (!onFocus) return;
    return editor.registerCommand(
      FOCUS_COMMAND,
      () => {
        onFocus(editor);
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, onFocus]);

  return null;
}

export default function Editor({
  id = '',
  value,
  onChange,
  onFocus,
  onEditorInit,
  className,
  shellClassName,
  placeholder,
  contentEditableClassName,
  disabled,
  autoFocus,
  skipValidateUrl,
  mentionData = [],
  namespace = 'BaseLexicalEditor',
  renderImagePicker,
  minContentHeight = 280,
  showTopbar = true,
  fillHeight = false,
}: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLinkEditMode, setIsLinkEditMode] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        await containerRef.current?.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const config = {
    ...initialConfig,
    namespace,
    editable: !disabled,
  };

  return (
    <div id={id} className={cn('editor-container', fillHeight && 'h-full flex flex-col flex-1')}>
      <div
        className={cn(
          'editor-shell',
          'relative flex flex-col overflow-hidden',
          isFullscreen ? 'h-dvh rounded-none' : fillHeight ? 'h-full flex-1 rounded-none border-0 shadow-none' : 'rounded-3xl',
          disabled && 'editor-shell-disabled',
          shellClassName,
        )}
        ref={containerRef}
      >
        <LexicalComposer initialConfig={config}>
          <EditorInitPlugin onInit={onEditorInit} onFocus={onFocus} />
          <ImagesPlugin />
          <PasteImagePlugin />
          <PasteTablePlugin />
          <SetContentPlugin value={value} />
          <CalloutTransformPlugin />
          <OnChangePlugin
            ignoreSelectionChange={true}
            onChange={(editorState, editor) => {
              editorState.read(() => {
                const html = $generateHtmlFromNodes(editor);
                onChange?.(checkEmptyHtml(html) ? '' : html); // Detect if HTML is "empty"
              });
            }}
          />
          {showTopbar && (
            <div className='editor-topbar'>
              <div className='editor-topbar-meta'>
                <span className='editor-topbar-icon'>
                  <Sparkles size={15} />
                </span>
                <p className='editor-topbar-title heading-2 text-2xl'>Rich content editor</p>
              </div>
              <ToolbarButton onClick={toggleFullscreen} title='Fullscreen' className='editor-fullscreen-button'>
                <Expand size={16} />
              </ToolbarButton>
            </div>
          )}

          <ToolbarPlugin disabled={disabled} renderImagePicker={renderImagePicker} />

          <div
            className={cn(
              'editor-canvas relative w-full overflow-auto',
              isFullscreen || fillHeight ? 'flex-1 max-h-none' : 'max-h-[520px]',
              className,
            )}
            style={{ minHeight: isFullscreen || fillHeight ? undefined : minContentHeight }}
            aria-disabled={disabled}
          >
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className={cn(
                    'min-h-full w-full outline-none focus:outline-none',
                    contentEditableClassName || 'px-4! py-3!',
                    disabled && 'pointer-events-none',
                  )}
                />
              }
              placeholder={
                <Placeholder
                  title={placeholder || 'Type your content here'}
                  className={contentEditableClassName}
                />
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
          </div>
          <HistoryPlugin />
          <NewMentionsPlugin data={mentionData} />
          <LinkPlugin hasLinkAttributes={true} skipValidateUrl={skipValidateUrl} />
          <FloatingLinkEditorPlugin
            // eslint-disable-next-line react-hooks/refs
            anchorElem={containerRef?.current || undefined}
            isLinkEditMode={isLinkEditMode}
            setIsLinkEditMode={setIsLinkEditMode}
          />
          {autoFocus && <AutoFocusPlugin defaultSelection='rootEnd' />}
          <ListPlugin />
          <TablePlugin hasCellMerge={false} hasHorizontalScroll />
          <AutoLinkPlugin />
          <CodeActionPlugin />
          <MarkdownPastePlugin />
        </LexicalComposer>
      </div>
    </div>
  );
}

function Placeholder({ title, className }: Readonly<{ title: string; className?: string }>) {
  if (className) {
    return (
      <div className={cn('pointer-events-none absolute inset-0 select-none', className)}>
        <p className='text-muted-foreground/50 text-sm italic'>{title}</p>
      </div>
    );
  }
  return <p className='text-disabled-foreground pointer-events-none absolute top-3 left-4 text-sm'>{title}</p>;
}
