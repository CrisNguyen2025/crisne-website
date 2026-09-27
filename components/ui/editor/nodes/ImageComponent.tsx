import type { LexicalCommand, LexicalEditor, NodeKey } from 'lexical';
import type { JSX } from 'react';

import './ImageNode.css';

import { getMediaUrl } from '@/lib/utils';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useLexicalEditable } from '@lexical/react/useLexicalEditable';
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection';
import { mergeRegister } from '@lexical/utils';
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $setSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  createCommand,
  DRAGSTART_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ImageResizer from '../ui/ImageResizer';
import { Image as AntImage } from 'antd';
import { $isImageNode } from './ImageNode';
type ImageStatus = { error: true } | { error: false; width: number; height: number };
const imageCache = new Map<string, Promise<ImageStatus> | ImageStatus>();

export const RIGHT_CLICK_IMAGE_COMMAND: LexicalCommand<MouseEvent> = createCommand('RIGHT_CLICK_IMAGE_COMMAND');

function useSuspenseImage(src: string): ImageStatus {
  let cached = imageCache.get(src);
  if (cached && 'error' in cached && typeof cached.error === 'boolean') {
    return cached;
  } else if (!cached) {
    cached = new Promise<ImageStatus>(resolve => {
      const img = new Image();
      img.src = src;
      img.onload = () =>
        resolve({
          error: false,
          height: img.naturalHeight,
          width: img.naturalWidth,
        });
      img.onerror = () => resolve({ error: true });
    }).then(rval => {
      imageCache.set(src, rval);
      return rval;
    });
    imageCache.set(src, cached);
    throw cached;
  }
  throw cached;
}

function isSVG(src: string): boolean {
  return src.toLowerCase().endsWith('.svg');
}

function LazyImage({
  altText,
  className,
  imageRef,
  src,
  width,
  height,
  maxWidth,
  onError,
}: Readonly<{
  altText: string;
  className: string | null;
  height: 'inherit' | number;
  imageRef: { current: null | HTMLImageElement };
  maxWidth: number;
  src: string;
  width: 'inherit' | number;
  onError: () => void;
}>): JSX.Element {
  const isSVGImage = isSVG(src);
  const status = useSuspenseImage(src);

  useEffect(() => {
    if (status.error) {
      onError();
    }
  }, [status.error, onError]);

  if (status.error) {
    return <BrokenImage />;
  }

  // Calculate proportional auto-fit dimensions without any cropping or rounded borders
  const calculateDimensions = () => {
    // If specific non-zero numeric dimensions are set by manual resizer
    const hasCustomWidth = typeof width === 'number' && width > 0;
    const hasCustomHeight = typeof height === 'number' && height > 0;

    if (hasCustomWidth || hasCustomHeight) {
      return {
        width: hasCustomWidth ? width : undefined,
        height: hasCustomHeight ? height : undefined,
        maxWidth: maxWidth ? `${maxWidth}px` : '100%',
        objectFit: 'contain' as const,
        borderRadius: 0,
      };
    }

    const naturalWidth = status.width || 800;
    const naturalHeight = status.height || 450;
    const maxBoundWidth = typeof maxWidth === 'number' && maxWidth > 0 ? maxWidth : 420;
    const maxBoundHeight = 320;

    let finalWidth = naturalWidth;
    let finalHeight = naturalHeight;

    // Scale down proportionally to fit max width
    if (finalWidth > maxBoundWidth) {
      const scale = maxBoundWidth / finalWidth;
      finalWidth = maxBoundWidth;
      finalHeight = Math.round(finalHeight * scale);
    }

    // Scale down proportionally to fit max height
    if (finalHeight > maxBoundHeight) {
      const scale = maxBoundHeight / finalHeight;
      finalHeight = maxBoundHeight;
      finalWidth = Math.round(finalWidth * scale);
    }

    return {
      width: finalWidth ? `${finalWidth}px` : 'auto',
      height: finalHeight ? `${finalHeight}px` : 'auto',
      maxWidth: '100%',
      maxHeight: `${maxBoundHeight}px`,
      objectFit: 'contain' as const,
      borderRadius: 0,
      display: 'block',
    };
  };

  const imageStyle = calculateDimensions();

  return (
    <img
      className={className || undefined}
      src={src}
      alt={altText}
      ref={imageRef}
      style={imageStyle}
      onError={onError}
      draggable='false'
    />
  );
}

function BrokenImage(): JSX.Element {
  return (
    <img
      src='/images/empty.svg'
      style={{
        height: 200,
        opacity: 0.2,
        width: 200,
      }}
      draggable='false'
      alt='Broken image'
    />
  );
}

function noop() {}

export default function ImageComponent({
  src,
  altText,
  nodeKey,
  width,
  height,
  maxWidth,
  resizable,
  showCaption,
  caption,
}: Readonly<{
  altText: string;
  caption: LexicalEditor;
  height: 'inherit' | number;
  maxWidth: number;
  nodeKey: NodeKey;
  resizable: boolean;
  showCaption: boolean;
  src: string;
  width: 'inherit' | number;
  captionsEnabled: boolean;
}>): JSX.Element {
  const imageRef = useRef<null | HTMLImageElement>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [showFullscreen, setShowFullscreen] = useState<boolean>(false);
  const [editor] = useLexicalComposerContext();
  const activeEditorRef = useRef<LexicalEditor | null>(null);
  const [isLoadError, setIsLoadError] = useState<boolean>(false);
  const isEditable = useLexicalEditable();
  const lastClickTimeRef = useRef<number>(0);
  const isInNodeSelection = useMemo(
    () =>
      isSelected &&
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        return $isNodeSelection(selection) && selection.has(nodeKey);
      }),
    [editor, isSelected, nodeKey],
  );

  const $onEnter = useCallback(
    (event: KeyboardEvent) => {
      const latestSelection = $getSelection();
      const buttonElem = buttonRef.current;
      if (
        $isNodeSelection(latestSelection) &&
        latestSelection.has(nodeKey) &&
        latestSelection.getNodes().length === 1
      ) {
        if (showCaption) {
          // Move focus into nested editor
          $setSelection(null);
          event.preventDefault();
          caption.focus();
          return true;
        } else if (buttonElem !== null && buttonElem !== document.activeElement) {
          event.preventDefault();
          buttonElem.focus();
          return true;
        }
      }
      return false;
    },
    [caption, nodeKey, showCaption],
  );

  const $onEscape = useCallback(
    (event: KeyboardEvent) => {
      if (activeEditorRef.current === caption || buttonRef.current === event.target) {
        $setSelection(null);
        editor.update(() => {
          setSelected(true);
          const parentRootElement = editor.getRootElement();
          if (parentRootElement !== null) {
            parentRootElement.focus();
          }
        });
        return true;
      }
      return false;
    },
    [caption, editor, setSelected],
  );

  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const clickCountRef = useRef(0);
  const touchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const touchCountRef = useRef(0);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
      if (touchTimeoutRef.current) {
        clearTimeout(touchTimeoutRef.current);
      }
    };
  }, []);

  const onClick = useCallback(
    (payload: MouseEvent) => {
      const event = payload;

      if (isResizing) {
        return true;
      }
      if (event.target === imageRef.current) {
        // Handle double-click for fullscreen
        clickCountRef.current += 1;
        
        if (clickCountRef.current === 1) {
          clickTimeoutRef.current = setTimeout(() => {
            clickCountRef.current = 0;
          }, 300);
        } else if (clickCountRef.current === 2) {
          if (clickTimeoutRef.current) {
            clearTimeout(clickTimeoutRef.current);
          }
          clickCountRef.current = 0;
          setShowFullscreen(true);
          return true;
        }

        if (event.shiftKey) {
          setSelected(!isSelected);
        } else {
          clearSelection();
          setSelected(true);
        }
        return true;
      }

      return false;
    },
    [isResizing, isSelected, setSelected, clearSelection],
  );

  const onRightClick = useCallback(
    (event: MouseEvent): void => {
      editor.getEditorState().read(() => {
        const latestSelection = $getSelection();
        const domElement = event.target as HTMLElement;
        if (
          domElement.tagName === 'IMG' &&
          $isRangeSelection(latestSelection) &&
          latestSelection.getNodes().length === 1
        ) {
          editor.dispatchCommand(RIGHT_CLICK_IMAGE_COMMAND, event);
        }
      });
    },
    [editor],
  );

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        (_, activeEditor) => {
          activeEditorRef.current = activeEditor;
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        DRAGSTART_COMMAND,
        event => {
          if (event.target === imageRef.current) {
            event.preventDefault();
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);
  useEffect(() => {
    let rootCleanup = noop;
    return mergeRegister(
      editor.registerCommand<MouseEvent>(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW),
      editor.registerCommand<MouseEvent>(RIGHT_CLICK_IMAGE_COMMAND, onClick, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_ENTER_COMMAND, $onEnter, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_ESCAPE_COMMAND, $onEscape, COMMAND_PRIORITY_LOW),
      editor.registerRootListener(rootElement => {
        rootCleanup();
        rootCleanup = noop;
        if (rootElement) {
          rootElement.addEventListener('contextmenu', onRightClick);
          rootCleanup = () => rootElement.removeEventListener('contextmenu', onRightClick);
        }
      }),
      () => rootCleanup(),
    );
  }, [editor, $onEnter, $onEscape, onClick, onRightClick]);

  const setShowCaption = (show: boolean) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isImageNode(node)) {
        node.setShowCaption(show);
        if (show) {
          node.__caption.update(() => {
            if (!$getSelection()) {
              $getRoot().selectEnd();
            }
          });
        }
      }
    });
  };

  const onResizeEnd = (nextWidth: 'inherit' | number, nextHeight: 'inherit' | number) => {
    // Delay hiding the resize bars for click case
    setTimeout(() => {
      setIsResizing(false);
    }, 200);

    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isImageNode(node)) {
        node.setWidthAndHeight(nextWidth, nextHeight);
      }
    });
  };

  const onResizeStart = () => {
    setIsResizing(true);
  };

  const draggable = isInNodeSelection && !isResizing;
  const isFocused = (isSelected || isResizing) && isEditable;
  
  // Handle touch events for double-tap
  const handleTouchEnd = useCallback(() => {
    touchCountRef.current += 1;
    
    if (touchCountRef.current === 1) {
      touchTimeoutRef.current = setTimeout(() => {
        touchCountRef.current = 0;
      }, 300);
    } else if (touchCountRef.current === 2) {
      if (touchTimeoutRef.current) {
        clearTimeout(touchTimeoutRef.current);
      }
      touchCountRef.current = 0;
      setShowFullscreen(true);
    }
  }, []);

  return (
    <Suspense fallback={null}>
      <>
        <div draggable={draggable} onTouchEnd={handleTouchEnd}>
          {isLoadError ? (
            <BrokenImage />
          ) : (
            <LazyImage
              className={isFocused ? `focused ${isInNodeSelection ? 'draggable' : ''}` : null}
              src={getMediaUrl({ url: src })}
              altText={altText}
              imageRef={imageRef}
              width={width}
              height={height}
              maxWidth={maxWidth}
              onError={() => setIsLoadError(true)}
            />
          )}
        </div>

        {resizable && isInNodeSelection && isFocused && (
          <ImageResizer
            showCaption={showCaption}
            setShowCaption={setShowCaption}
            editor={editor}
            buttonRef={buttonRef}
            imageRef={imageRef}
            maxWidth={maxWidth}
            onResizeStart={onResizeStart}
            onResizeEnd={onResizeEnd}
            captionsEnabled={false}
          />
        )}

        {/* Fullscreen Ant Design Image Preview */}
        {showFullscreen && (
          <div style={{ display: 'none' }}>
            <AntImage
              src={getMediaUrl({ url: src })}
              alt={altText}
              preview={{
                visible: showFullscreen,
                onVisibleChange: (vis) => setShowFullscreen(vis),
              }}
            />
          </div>
        )}
      </>
    </Suspense>
  );
}
