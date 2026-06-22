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
import './editor.css';
import { CalloutNode } from './nodes/CalloutNode';
import { ImageNode } from './nodes/ImageNode';
import { KeywordNode } from './nodes/KeywordNode';
import { MentionNode } from './nodes/MentionNode';
import {
  AutoLinkPlugin,
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
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  skipValidateUrl?: boolean;
  mentionData?: string[];
  namespace?: string;
  renderImagePicker?: ImagePickerRenderer;
  minContentHeight?: number;
  showTopbar?: boolean;
}>;

export default function Editor({
  id = '',
  value,
  onChange,
  className,
  disabled,
  autoFocus,
  skipValidateUrl,
  mentionData = [],
  namespace = 'BaseLexicalEditor',
  renderImagePicker,
  minContentHeight = 280,
  showTopbar = true,
}: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeFormats, setActiveFormats] = useState(InitialToolbarState);
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
    <div id={id} className='editor-container'>
      <div
        className={cn(
          'editor-shell',
          'relative flex flex-col overflow-hidden',
          isFullscreen ? 'h-dvh rounded-none' : 'rounded-3xl',
          disabled && 'editor-shell-disabled',
        )}
        ref={containerRef}
      >
        <LexicalComposer initialConfig={config}>
          <ImagesPlugin />
          <PasteImagePlugin />
          <PasteTablePlugin />
          <SetContentPlugin value={value} />
          <CalloutTransformPlugin />
          <OnChangePlugin
            onChange={(_, editor) => {
              editor.update(() => {
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

          <ToolbarPlugin
            activeFormats={activeFormats}
            onChange={value => setActiveFormats(prev => ({ ...prev, ...value }))}
            setIsLinkEditMode={setIsLinkEditMode}
            disabled={disabled}
            renderImagePicker={renderImagePicker}
          />
          <div
            className={cn(
              'editor-canvas relative w-full overflow-auto',
              isFullscreen ? 'flex-1' : 'max-h-[520px]',
              className,
            )}
            style={{ minHeight: isFullscreen ? undefined : minContentHeight }}
            aria-disabled={disabled}
          >
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className={cn(
                    'min-h-full w-full px-4! py-3! outline-none focus:outline-none',
                    disabled && 'pointer-events-none',
                  )}
                />
              }
              placeholder={<Placeholder title='Type your content here' />}
              ErrorBoundary={LexicalErrorBoundary}
            />
          </div>
          <HistoryPlugin />
          <NewMentionsPlugin data={mentionData} />
          <LinkPlugin skipValidateUrl={skipValidateUrl} />
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
        </LexicalComposer>
      </div>
    </div>
  );
}

function Placeholder({ title }: Readonly<{ title: string }>) {
  return <p className='text-disabled-foreground pointer-events-none absolute top-3 left-4 text-sm'>{title}</p>;
}
