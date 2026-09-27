import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $createParagraphNode } from 'lexical';
import { useEffect, useRef } from 'react';
import { checkEmptyHtml } from '../../utils/checkEmptyHtml';

export function SetContentPlugin({ value }: { value?: string }) {
  const [editor] = useLexicalComposerContext();
  const isInitializedRef = useRef<boolean>(false);
  const lastHtmlRef = useRef<string | undefined>(undefined);

  // Synchronize external value changes only when NOT actively focused or when content genuinely changed externally
  useEffect(() => {
    const normalizedIncoming = checkEmptyHtml(value || '') ? '' : value || '';

    // If editor has already initialized with this exact value, skip
    if (isInitializedRef.current && normalizedIncoming === (lastHtmlRef.current || '')) {
      return;
    }

    // If user is currently focused/typing in the editor, do NOT overwrite content
    const isFocused =
      typeof document !== 'undefined' &&
      !!(
        editor.getRootElement() === document.activeElement ||
        editor.getRootElement()?.contains(document.activeElement)
      );

    if (isInitializedRef.current && isFocused) {
      return;
    }

    editor.getEditorState().read(() => {
      const currentHtml = $generateHtmlFromNodes(editor);
      const normalizedCurrent = checkEmptyHtml(currentHtml) ? '' : currentHtml;

      if (normalizedIncoming === normalizedCurrent && isInitializedRef.current) {
        lastHtmlRef.current = normalizedIncoming;
        return;
      }

      isInitializedRef.current = true;
      lastHtmlRef.current = normalizedIncoming;

      editor.update(() => {
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
    });
  }, [editor, value]);

  // Keep lastHtmlRef in sync whenever user updates content internally
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size > 0 || dirtyLeaves.size > 0) {
        editorState.read(() => {
          const html = $generateHtmlFromNodes(editor);
          lastHtmlRef.current = checkEmptyHtml(html) ? '' : html;
        });
      }
    });
  }, [editor]);

  return null;
}
