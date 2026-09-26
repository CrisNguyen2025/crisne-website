import { $generateNodesFromDOM } from '@lexical/html';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $createParagraphNode } from 'lexical';
import { useEffect, useRef } from 'react';

export function SetContentPlugin({ value }: { value?: string }) {
  const [editor] = useLexicalComposerContext();
  const lastHtml = useRef<string | undefined>(undefined);

  useEffect(() => {
    // If value hasn't changed or matches what the editor already contains, do nothing
    if (value === lastHtml.current) {
      return;
    }

    lastHtml.current = value;

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
  }, [editor, value]);

  // Track editor changes and update lastHtml ref so internal updates don't cause reset
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        // We let SetContentPlugin know that internal updates happened
      });
    });
  }, [editor]);

  return null;
}
