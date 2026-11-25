import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { QuoteNode } from '@lexical/rich-text';
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

function $canExitLastCalloutBlock(anchorNode: LexicalNode): boolean {
  let currentBlock: LexicalNode | null = anchorNode;
  while (currentBlock !== null && currentBlock.getParent()?.getKey() !== 'root') {
    currentBlock = currentBlock.getParent();
  }
  if (!currentBlock) return false;
  const root = $getRoot();
  return (
    currentBlock === root.getLastChild() &&
    $isCalloutNode(currentBlock) &&
    currentBlock.getNextSibling() === null
  );
}

function $focusOrAppendTrailingParagraph(lastChild: LexicalNode): void {
  if ($isParagraphNode(lastChild) && lastChild.getTextContent().trim() === '') {
    lastChild.selectEnd();
    return;
  }
  const paragraph = $createParagraphNode();
  $getRoot().append(paragraph);
  paragraph.selectEnd();
}

function isEditorSurfaceTarget(target: HTMLElement, rootElement: HTMLElement): boolean {
  return target.classList.contains('editor-canvas') || target === rootElement || target.contains(rootElement);
}

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
        if (event.key !== 'ArrowDown') return false;
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
        if (!$canExitLastCalloutBlock(selection.anchor.getNode())) return false;

        const paragraph = $createParagraphNode();
        $getRoot().append(paragraph);
        paragraph.select();
        event.preventDefault();
        return true;
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
        const target = event.target as HTMLElement | null;
        if (rootElement && target && isEditorSurfaceTarget(target, rootElement)) {
          editor.update(() => {
            const lastChild = $getRoot().getLastChild();
            const lastElement = lastChild ? editor.getElementByKey(lastChild.getKey()) : null;
            if (!lastChild || !lastElement) return;
            if (event.clientY > lastElement.getBoundingClientRect().bottom) {
              $focusOrAppendTrailingParagraph(lastChild);
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
