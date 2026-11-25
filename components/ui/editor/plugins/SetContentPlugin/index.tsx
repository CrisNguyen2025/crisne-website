import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $createParagraphNode } from 'lexical';
import { useEffect, useRef } from 'react';
import { checkEmptyHtml } from '../../utils/checkEmptyHtml';

function unwrapSingleCodeOrPreChild(pre: HTMLPreElement): boolean {
  const meaningfulChildren = Array.from(pre.childNodes).filter(
    (node) => !(node.nodeType === 3 && !(node.textContent || '').trim()),
  );
  if (meaningfulChildren.length !== 1 || meaningfulChildren[0].nodeType !== 1) {
    return false;
  }
  const inner = meaningfulChildren[0] as HTMLElement;
  const tag = inner.tagName.toUpperCase();
  if (tag !== 'CODE' && tag !== 'PRE') {
    return false;
  }

  const lang =
    inner.getAttribute('data-language') ||
    inner.getAttribute('data-highlight-language') ||
    inner.getAttribute('class')?.match(/language-([\w-]+)/i)?.[1];
  if (lang && !pre.getAttribute('data-language')) {
    pre.setAttribute('data-language', lang);
    pre.setAttribute('data-highlight-language', lang);
  }

  for (const sibling of Array.from(pre.childNodes)) {
    if (sibling !== inner) {
      pre.removeChild(sibling);
    }
  }
  while (inner.firstChild) {
    pre.insertBefore(inner.firstChild, inner);
  }
  inner.remove();
  return true;
}

export function normalizeImportedDom(dom: Document): void {
  const preElements = Array.from(dom.querySelectorAll('pre'));
  for (const pre of preElements) {
    while (unwrapSingleCodeOrPreChild(pre)) {
      // Unwrap nested <code> / <pre> wrappers until normalized
    }
  }
}

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
        normalizeImportedDom(dom);
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
