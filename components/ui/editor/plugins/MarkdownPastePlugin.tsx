import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { 
  $createParagraphNode, 
  $createTextNode, 
  $getSelection, 
  $isRangeSelection, 
  COMMAND_PRIORITY_HIGH, 
  PASTE_COMMAND,
  LexicalNode
} from 'lexical';
import { $createHeadingNode } from '@lexical/rich-text';
import { $createCodeNode } from '@lexical/code';
import { useEffect } from 'react';

export function MarkdownPastePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        const text = clipboardData.getData('text/plain');
        if (!text) return false;

        // Check if the pasted text has markdown-like or code-like contents
        const hasMarkdownOrCode = /^(#+ |interface |type |enum |function |curl |{)/m.test(text);
        if (!hasMarkdownOrCode) return false;

        event.preventDefault();
        event.stopPropagation();

        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;

          const lines = text.split(/\r?\n/);
          const nodesToInsert: LexicalNode[] = [];
          
          let i = 0;
          while (i < lines.length) {
            const line = lines[i];
            const trimmed = line.trim();

            // 1. Heading 2 (## Header)
            if (line.startsWith('## ')) {
              const headingNode = $createHeadingNode('h2');
              headingNode.append($createTextNode(line.substring(3).trim()));
              nodesToInsert.push(headingNode);
              i++;
              continue;
            }
            
            // 2. Heading 1 (# Header)
            if (line.startsWith('# ')) {
              const headingNode = $createHeadingNode('h1');
              headingNode.append($createTextNode(line.substring(2).trim()));
              nodesToInsert.push(headingNode);
              i++;
              continue;
            }

            // 3. Code block with explicit markdown fence (```)
            if (trimmed.startsWith('```')) {
              const codeLines: string[] = [];
              i++; // skip fence line
              while (i < lines.length && !lines[i].trim().startsWith('```')) {
                codeLines.push(lines[i]);
                i++;
              }
              if (i < lines.length) i++; // skip ending fence line
              
              const codeNode = $createCodeNode();
              codeNode.append($createTextNode(codeLines.join('\n')));
              nodesToInsert.push(codeNode);
              continue;
            }

            // 4. Implicit code block detection (e.g. interface, type, enum, function, JSON, curl block)
            const isCodeStart = 
              trimmed.startsWith('interface ') || 
              trimmed.startsWith('type ') || 
              trimmed.startsWith('enum ') || 
              trimmed.startsWith('function ') || 
              trimmed.startsWith('curl ') ||
              trimmed.startsWith('Example curl:') ||
              trimmed.startsWith('Example:') ||
              (trimmed.startsWith('{') && lines[i+1]?.trim().includes(':')); // JSON start

            if (isCodeStart) {
              const codeLines: string[] = [];
              
              if (trimmed === 'Example:' || trimmed === 'Example curl:') {
                const labelNode = $createParagraphNode();
                labelNode.append($createTextNode(line));
                nodesToInsert.push(labelNode);
                i++;
                continue;
              }

              let bracesCount = 0;
              let hasBraces = false;

              while (i < lines.length) {
                const currentLine = lines[i];
                const currentTrimmed = currentLine.trim();

                // Stop conditions for code blocks
                if (currentLine.startsWith('## ') || currentLine.startsWith('# ')) {
                  break;
                }
                
                // Track curly braces to make sure we include the entire interface/class/JSON block
                if (currentTrimmed.includes('{')) {
                  bracesCount += (currentTrimmed.match(/{/g) || []).length;
                  hasBraces = true;
                }
                if (currentTrimmed.includes('}')) {
                  bracesCount -= (currentTrimmed.match(/}/g) || []).length;
                }

                codeLines.push(currentLine);
                i++;

                // If we started with braces and closed all of them, the block is finished
                if (hasBraces && bracesCount <= 0) {
                  break;
                }

                // If it is a curl command block (usually continued with \ at the end of line)
                const isCurl = codeLines[0]?.trim().startsWith('curl');
                if (isCurl && !currentTrimmed.endsWith('\\') && !currentTrimmed.includes('curl ')) {
                  const nextLine = lines[i]?.trim() || '';
                  if (!nextLine.startsWith('-H') && !nextLine.startsWith('-X') && !nextLine.startsWith('--')) {
                    break;
                  }
                }

                // If it's a plain block without braces, stop at empty line
                if (!hasBraces && currentTrimmed === '') {
                  break;
                }
              }

              // Remove trailing empty lines from code block
              while (codeLines.length > 0 && codeLines[codeLines.length - 1].trim() === '') {
                codeLines.pop();
              }

              if (codeLines.length > 0) {
                const codeNode = $createCodeNode();
                codeNode.append($createTextNode(codeLines.join('\n')));
                nodesToInsert.push(codeNode);
              }
              continue;
            }

            // 5. Default: paragraph
            if (trimmed !== '') {
              const paragraph = $createParagraphNode();
              paragraph.append($createTextNode(line));
              nodesToInsert.push(paragraph);
            }
            i++;
          }

          if (nodesToInsert.length > 0) {
            selection.insertNodes(nodesToInsert);
          }
        });
        return true;
      },
      COMMAND_PRIORITY_HIGH
    );
  }, [editor]);

  return null;
}
