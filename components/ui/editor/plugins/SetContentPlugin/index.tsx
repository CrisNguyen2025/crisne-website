import { $generateNodesFromDOM } from '@lexical/html';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import { useEffect, useRef } from 'react';

export function SetContentPlugin({ value }: { value?: string }) {
  const [editor] = useLexicalComposerContext();
  const isInternalUpdate = useRef(false);

  useEffect(() => {
    // Skip if this update came from the editor itself
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }

    editor.update(() => {
      const parser = new DOMParser();
      const dom = parser.parseFromString(value || '', 'text/html');
      const nodes = $generateNodesFromDOM(editor, dom);

      const root = $getRoot();
      root.clear();
      root.append(...nodes);
    });
  }, [editor, value]);

  // Track internal updates
  useEffect(() => {
    return editor.registerUpdateListener(() => {
      isInternalUpdate.current = true;
    });
  }, [editor]);

  return null;
}
