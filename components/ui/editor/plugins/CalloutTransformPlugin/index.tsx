import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $isQuoteNode, QuoteNode } from '@lexical/rich-text';
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
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
      const markerMatch = textContent.match(/^\s*\[!(success|info|warning|error)\]\s*/);

      if (markerMatch) {
        const type = markerMatch[1] as CalloutType;
        const calloutNode = $createCalloutNode(type);

        const quoteChildren = node.getChildren();
        for (let i = 0; i < quoteChildren.length; i++) {
          const child = quoteChildren[i];
          if (i === 0 && $isTextNode(child)) {
            const newText = child.getTextContent().replace(/^\s*\[!(success|info|warning|error)\]\s*/, '');
            child.setTextContent(newText);
          }
          calloutNode.append(child);
        }

        node.replace(calloutNode);
      }
    });

    return removeTransform;
  }, [editor]);

  // Handle Enter: exit callout block
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

        if (callout === null) return false;

        // Shift+Enter: do nothing special, let default Lexical behavior
        // (which inserts a LineBreakNode inside the element)
        if (event.shiftKey) {
          return false;
        }

        // Enter: create paragraph after callout and move cursor there
        event.preventDefault();
        const paragraph = $createParagraphNode();
        callout.insertAfter(paragraph);
        paragraph.selectEnd();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor]);

  return null;
}

export default CalloutTransformPlugin;
