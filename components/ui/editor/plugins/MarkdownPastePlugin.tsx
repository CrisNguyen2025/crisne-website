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

function $tryCreateHeadingNode(line: string): LexicalNode | null {
  const prefixes: Array<{ prefix: string; tag: 'h1' | 'h2' | 'h3' }> = [
    { prefix: '### ', tag: 'h3' },
    { prefix: '## ', tag: 'h2' },
    { prefix: '# ', tag: 'h1' },
  ];
  for (const { prefix, tag } of prefixes) {
    if (line.startsWith(prefix)) {
      const headingNode = $createHeadingNode(tag);
      headingNode.append($createTextNode(line.substring(prefix.length).trim()));
      return headingNode;
    }
  }
  return null;
}

function consumeFencedCodeBlock(lines: string[], startIndex: number): { code: string; nextIndex: number } {
  const codeLines: string[] = [];
  let i = startIndex + 1;
  while (i < lines.length && !lines[i].trim().startsWith('```')) {
    codeLines.push(lines[i]);
    i++;
  }
  if (i < lines.length) i++;
  return { code: codeLines.join('\n'), nextIndex: i };
}

function isImplicitCodeBlockStart(trimmed: string, nextLine?: string): boolean {
  const prefixes = ['interface ', 'type ', 'enum ', 'function ', 'curl ', 'Example curl:', 'Example:'];
  if (prefixes.some(prefix => trimmed.startsWith(prefix))) return true;
  return trimmed.startsWith('{') && Boolean(nextLine?.trim().includes(':'));
}

function shouldStopImplicitCodeBlock(
  currentLine: string,
  currentTrimmed: string,
  firstCodeLine: string | undefined,
  nextLineTrimmed: string,
  hasBraces: boolean,
  bracesCount: number,
): boolean {
  if (currentLine.startsWith('### ') || currentLine.startsWith('## ') || currentLine.startsWith('# ')) {
    return true;
  }
  if (hasBraces && bracesCount <= 0) return true;
  const isCurl = firstCodeLine?.trim().startsWith('curl');
  if (isCurl && !currentTrimmed.endsWith('\\') && !currentTrimmed.includes('curl ')) {
    if (!nextLineTrimmed.startsWith('-H') && !nextLineTrimmed.startsWith('-X') && !nextLineTrimmed.startsWith('--')) {
      return true;
    }
  }
  return !hasBraces && currentTrimmed === '';
}

function consumeImplicitCodeBlock(lines: string[], startIndex: number): { node: LexicalNode | null; nextIndex: number } {
  const codeLines: string[] = [];
  let i = startIndex;
  let bracesCount = 0;
  let hasBraces = false;

  while (i < lines.length) {
    const currentLine = lines[i];
    const currentTrimmed = currentLine.trim();
    if (currentLine.startsWith('### ') || currentLine.startsWith('## ') || currentLine.startsWith('# ')) {
      break;
    }
    if (currentTrimmed.includes('{')) {
      bracesCount += (currentTrimmed.match(/{/g) || []).length;
      hasBraces = true;
    }
    if (currentTrimmed.includes('}')) {
      bracesCount -= (currentTrimmed.match(/}/g) || []).length;
    }

    codeLines.push(currentLine);
    i++;

    const nextTrimmed = lines[i]?.trim() || '';
    if (shouldStopImplicitCodeBlock(currentLine, currentTrimmed, codeLines[0], nextTrimmed, hasBraces, bracesCount)) {
      break;
    }
  }

  while (codeLines.length > 0 && codeLines[codeLines.length - 1].trim() === '') {
    codeLines.pop();
  }

  if (codeLines.length === 0) return { node: null, nextIndex: i };
  const codeNode = $createCodeNode();
  codeNode.append($createTextNode(codeLines.join('\n')));
  return { node: codeNode, nextIndex: i };
}

function $parseMarkdownPasteToNodes(text: string): LexicalNode[] {
  const lines = text.split(/\r?\n/);
  const nodesToInsert: LexicalNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    const headingNode = $tryCreateHeadingNode(line);
    if (headingNode) {
      nodesToInsert.push(headingNode);
      i++;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const fenced = consumeFencedCodeBlock(lines, i);
      const codeNode = $createCodeNode();
      codeNode.append($createTextNode(fenced.code));
      nodesToInsert.push(codeNode);
      i = fenced.nextIndex;
      continue;
    }

    if (trimmed === 'Example:' || trimmed === 'Example curl:') {
      const labelNode = $createParagraphNode();
      labelNode.append($createTextNode(line));
      nodesToInsert.push(labelNode);
      i++;
      continue;
    }

    if (isImplicitCodeBlockStart(trimmed, lines[i + 1])) {
      const block = consumeImplicitCodeBlock(lines, i);
      if (block.node) nodesToInsert.push(block.node);
      i = block.nextIndex;
      continue;
    }

    if (trimmed !== '') {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode(line));
      nodesToInsert.push(paragraph);
    }
    i++;
  }

  return nodesToInsert;
}

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

          const nodesToInsert = $parseMarkdownPasteToNodes(text);
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
