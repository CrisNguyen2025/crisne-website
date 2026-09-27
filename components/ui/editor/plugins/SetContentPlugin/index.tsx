import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $createParagraphNode } from 'lexical';
import { useEffect, useRef } from 'react';
import { checkEmptyHtml } from '../../utils/checkEmptyHtml';

export function SetContentPlugin({ value }: { value?: string }) {
  const [editor] = useLexicalComposerContext();
  const isInternalChangeRef = useRef<boolean>(false);
  const lastHtmlRef = useRef<string | undefined>(undefined);

  // Synchronize external value changes only when NOT triggered from internal typing
  useEffect(() => {
    // If this update was emitted from editor's internal change, do not re-parse DOM
    if (isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      return;
    }

    // Normalize value for comparison
    const normalizedIncoming = checkEmptyHtml(value || '') ? '' : value || '';
    const normalizedLast = checkEmptyHtml(lastHtmlRef.current || '') ? '' : lastHtmlRef.current || '';

    if (normalizedIncoming === normalizedLast) {
      return;
    }

    lastHtmlRef.current = value;

    editor.update(() => {
      const currentHtml = $generateHtmlFromNodes(editor);
      const normalizedCurrent = checkEmptyHtml(currentHtml) ? '' : currentHtml;

      // If editor already displays this exact HTML, avoid clearing & resetting cursor
      if (normalizedIncoming === normalizedCurrent) {
        return;
      }

      const parser = new DOMParser();
      const dom = parser.parseFromString(value || '', 'text/html');
      const nodes = $generateNodesFromDOM(editor, dom);

      const root = $getRoot();
      root.clear();
      if (nodes.length === 0) {
        root.append($createParagraphNode());
      } else {
        root.append(...nodes);
      }
    });
  }, [editor, value]);

  // Listen to internal editor changes so SetContentPlugin knows not to overwrite cursor
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      // If user typed/modified editor elements, mark as internal change and record HTML
      if (dirtyElements.size > 0 || dirtyLeaves.size > 0) {
        isInternalChangeRef.current = true;
        editorState.read(() => {
          const html = $generateHtmlFromNodes(editor);
          const normalized = checkEmptyHtml(html) ? '' : html;
          lastHtmlRef.current = normalized;
        });
      }
    });
  }, [editor]);

  return null;
}
