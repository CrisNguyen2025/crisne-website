import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { 
  $getNearestNodeFromDOMNode, 
  $getSelection, 
  $isRangeSelection, 
  $createParagraphNode,
  $createTextNode,
  $findMatchingParent,
  $isElementNode,
  ElementNode,
  COMMAND_PRIORITY_CRITICAL,
  SELECT_ALL_COMMAND
} from 'lexical';
import { $isCodeNode, $createCodeNode } from '@lexical/code';
import { $setBlocksType } from '@lexical/selection';
import { useEffect } from 'react';

export function CodeActionPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Create floating action container
    const container = document.createElement('div');
    container.className = 'editor-code-action-container';
    container.style.cssText = `
      position: absolute;
      display: none;
      gap: 6px;
      z-index: 9999;
      pointer-events: auto;
      user-select: none;
    `;

    // Copy Button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'editor-code-btn-copy';
    copyBtn.textContent = 'Copy';
    copyBtn.style.cssText = `
      padding: 3px 10px;
      font-size: 11px;
      font-weight: 600;
      font-family: ui-monospace, monospace;
      color: #9ca3af;
      background: #111111;
      border: 1px solid rgba(75,85,99,0.5);
      border-radius: 6px;
      cursor: pointer;
      transition: color 0.15s, background 0.15s, border-color 0.15s;
      line-height: 1.5;
    `;

    container.appendChild(copyBtn);

    let activeCodeBlock: HTMLElement | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const showContainer = (codeEl: HTMLElement) => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      activeCodeBlock = codeEl;

      const canvasEl = codeEl.closest('.editor-canvas') as HTMLElement | null;
      if (!canvasEl) return;

      // Ensure the container is appended inside the scroll canvas rather than body
      if (container.parentElement !== canvasEl) {
        if (container.parentElement) {
          container.parentElement.removeChild(container);
        }
        canvasEl.appendChild(container);
      }

      // Calculate relative coordinates to the canvas (accounting for scrolling)
      const codeRect = codeEl.getBoundingClientRect();
      const canvasRect = canvasEl.getBoundingClientRect();

      const top = codeRect.top - canvasRect.top + canvasEl.scrollTop;
      const right = canvasRect.width - (codeRect.right - canvasRect.left) + 10;

      container.style.top = `${top + 10}px`;
      container.style.right = `${right}px`;
      container.style.left = 'auto';
      container.style.display = 'flex';
    };

    const scheduleHide = () => {
      hideTimer = setTimeout(() => {
        container.style.display = 'none';
        activeCodeBlock = null;
      }, 150);
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const codeEl = target.closest('.editor-canvas code.block') as HTMLElement | null;
      if (codeEl) {
        showContainer(codeEl);
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (related && (related === container || container.contains(related))) return;
      const target = e.target as HTMLElement;
      const codeEl = target.closest('.editor-canvas code.block');
      if (codeEl) scheduleHide();
    };

    container.addEventListener('mouseenter', () => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    });
    container.addEventListener('mouseleave', () => scheduleHide());

    // Copy Action
    copyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!activeCodeBlock) return;
      const text = activeCodeBlock.innerText.trim();
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = 'Copied!';
        copyBtn.style.color = '#fff';
        copyBtn.style.background = '#16a34a';
        copyBtn.style.borderColor = '#16a34a';
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
          copyBtn.style.color = '#9ca3af';
          copyBtn.style.background = '#111111';
          copyBtn.style.borderColor = 'rgba(75,85,99,0.5)';
        }, 2000);
      });
    });

    const unregisterSelectAll = editor.registerCommand(
      SELECT_ALL_COMMAND,
      () => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const anchorNode = selection.anchor.getNode();
          const codeNode = $findMatchingParent(anchorNode, $isCodeNode);
          if (codeNode) {
            codeNode.select();
            return true;
          }
        }
        return false;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const handleKeyDown = (event: KeyboardEvent) => {
      const isCmdOrCtrl = event.metaKey || event.ctrlKey;
      if (isCmdOrCtrl && event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        event.stopPropagation();
        
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            let hasCodeNode = false;
            const selectedNodes = selection.getNodes();
            selectedNodes.forEach(node => {
              const codeParent = $findMatchingParent(node, $isCodeNode);
              if (codeParent) {
                hasCodeNode = true;
              }
            });

            if (hasCodeNode) {
              $setBlocksType(selection, () => $createParagraphNode());
            } else {
              const topLevelElements = new Set<ElementNode>();
              selectedNodes.forEach(node => {
                let parent: any = node;
                while (parent) {
                  const parentNode = parent.getParent();
                  if (parentNode === null || parentNode.getKey() === 'root') {
                    break;
                  }
                  parent = parentNode;
                }
                if (parent && $isElementNode(parent)) {
                  topLevelElements.add(parent as ElementNode);
                }
              });

              const textLines: string[] = [];
              topLevelElements.forEach(el => {
                textLines.push(el.getTextContent());
              });

              const combinedText = textLines.join('\n');
              const codeNode = $createCodeNode();
              const textNode = $createTextNode(combinedText);
              codeNode.append(textNode);

              const elementsArray = Array.from(topLevelElements);
              if (elementsArray.length > 0) {
                const firstElement = elementsArray[0];
                firstElement.replace(codeNode);
                for (let i = 1; i < elementsArray.length; i++) {
                  elementsArray[i].remove();
                }
              }
              codeNode.select();
            }
          }
        });
      }
    };

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      unregisterSelectAll();
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      document.removeEventListener('keydown', handleKeyDown, true);
      if (hideTimer) clearTimeout(hideTimer);
      if (container.parentElement) {
        container.parentElement.removeChild(container);
      }
    };
  }, [editor]);

  return null;
}
