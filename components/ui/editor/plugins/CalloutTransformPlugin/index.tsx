import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $isQuoteNode, QuoteNode } from '@lexical/rich-text';
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  CLICK_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  LexicalNode,
} from 'lexical';
import { useEffect } from 'react';
import { $createCalloutNode, $isCalloutNode, CalloutType } from '../../nodes/CalloutNode';

export function CalloutTransformPlugin() {
  const [editor] = useLexicalComposerContext();

  // Transform blockquotes with [!type] markers to CalloutNodes
  useEffect(() => {
    const removeTransform = editor.registerNodeTransform(QuoteNode, (node) => {
      const textContent = node.getTextContent();
      const markerMatch = textContent.match(/^\s*\[!(success|info|warning|error)\]\s*/i);

      if (markerMatch) {
        const type = markerMatch[1].toLowerCase() as CalloutType;
        const calloutNode = $createCalloutNode(type);

        const quoteChildren = node.getChildren();
        for (let i = 0; i < quoteChildren.length; i++) {
          const child = quoteChildren[i];
          if (i === 0 && $isTextNode(child)) {
            const newText = child.getTextContent().replace(/^\s*\[!(success|info|warning|error)\]\s*/i, '');
            child.setTextContent(newText);
          }
          calloutNode.append(child);
        }

        node.replace(calloutNode);
      }
    });

    return removeTransform;
  }, [editor]);

  // Handle Enter key: exit callout block to a new paragraph
  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (event === null) return false;

        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

        const anchor = selection.anchor;
        const anchorNode = anchor.getNode();

        // Walk up to find callout
        let callout: LexicalNode | null = null;
        let node: LexicalNode | null = anchorNode;
        while (node !== null) {
          if ($isCalloutNode(node)) {
            callout = node;
            break;
          }
          node = node.getParent();
        }

        if (callout === null || !$isCalloutNode(callout)) return false;

        // Shift+Enter: soft break inside callout
        if (event.shiftKey) {
          return false;
        }

        // Enter: insert a new paragraph after callout and move cursor there
        event.preventDefault();
        const paragraph = $createParagraphNode();
        callout.insertAfter(paragraph);
        paragraph.select();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor]);

  // Handle ArrowDown key when at the end of a block that has no next sibling
  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        if (event.key === 'ArrowDown') {
          const selection = $getSelection();
          if ($isRangeSelection(selection) && selection.isCollapsed()) {
            const anchor = selection.anchor;
            const anchorNode = anchor.getNode();

            // Find top-level parent block
            let currentBlock: LexicalNode | null = anchorNode;
            while (currentBlock !== null && currentBlock.getParent()?.getKey() !== 'root') {
              currentBlock = currentBlock.getParent();
            }

            if (currentBlock !== null) {
              const root = $getRoot();
              const lastChild = root.getLastChild();

              // If cursor is in the last child block and it's a Callout or special block
              if (currentBlock === lastChild && $isCalloutNode(currentBlock)) {
                // If there is no next block, create one and navigate to it
                if (currentBlock.getNextSibling() === null) {
                  const paragraph = $createParagraphNode();
                  root.append(paragraph);
                  paragraph.select();
                  event.preventDefault();
                  return true;
                }
              }
            }
          }
        }
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  // Handle Click in empty space below blocks to create/focus a new paragraph
  useEffect(() => {
    return editor.registerCommand(
      CLICK_COMMAND,
      (event: MouseEvent) => {
        const rootElement = editor.getRootElement();
        if (!rootElement) return false;

        const target = event.target as HTMLElement | null;
        if (!target) return false;

        // Check if the click happened directly on contenteditable container or canvas
        const isCanvas = target.classList.contains('editor-canvas');
        const isRoot = target === rootElement || target.contains(rootElement);

        if (isCanvas || isRoot) {
          editor.update(() => {
            const root = $getRoot();
            const lastChild = root.getLastChild();
            if (!lastChild) return;

            const lastElement = editor.getElementByKey(lastChild.getKey());
            if (!lastElement) return;

            const lastRect = lastElement.getBoundingClientRect();

            // If clicked below the bottom of the last element
            if (event.clientY > lastRect.bottom) {
              // If the last child is already an empty paragraph, focus it
              if ($isParagraphNode(lastChild) && lastChild.getTextContent().trim() === '') {
                lastChild.selectEnd();
                return;
              }

              // Otherwise append a new paragraph and focus it
              const paragraph = $createParagraphNode();
              root.append(paragraph);
              paragraph.selectEnd();
            }
          });
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  return null;
}

export default CalloutTransformPlugin;
