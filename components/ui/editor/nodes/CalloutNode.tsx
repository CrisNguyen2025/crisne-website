import {
  $applyNodeReplacement,
  $createLineBreakNode,
  $createParagraphNode,
  $isElementNode,
  $isLineBreakNode,
  $isParagraphNode,
  $isTextNode,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  ElementNode,
  LexicalNode,
  NodeKey,
  ParagraphNode,
  RangeSelection,
  SerializedElementNode,
  Spread,
  TextNode,
} from 'lexical';

export type CalloutType = 'success' | 'info' | 'warning' | 'error';

export type SerializedCalloutNode = Spread<
  {
    calloutType: CalloutType;
  },
  SerializedElementNode
>;

const VALID_CALLOUT_TYPES: ReadonlyArray<CalloutType> = ['success', 'info', 'warning', 'error'];

function extractCalloutType(element: HTMLElement): CalloutType | null {
  const attrType = element.getAttribute('data-callout-type')?.toLowerCase();
  if (attrType && VALID_CALLOUT_TYPES.includes(attrType as CalloutType)) {
    return attrType as CalloutType;
  }

  const classMatch = element.className?.match(/\b(?:editor-)?callout-(success|info|warning|error)\b/i);
  if (classMatch) {
    return classMatch[1].toLowerCase() as CalloutType;
  }

  if (element.tagName === 'BLOCKQUOTE') {
    const markerMatch = (element.textContent || '').match(/^\s*\[!(success|info|warning|error)\]/i);
    if (markerMatch) {
      return markerMatch[1].toLowerCase() as CalloutType;
    }
  }

  return null;
}

function getCalloutClassName(type: CalloutType): string {
  return `callout callout-${type} editor-callout editor-callout-${type}`;
}

export class CalloutNode extends ElementNode {
  __calloutType: CalloutType;

  static getType(): string {
    return 'callout';
  }

  static clone(node: CalloutNode): CalloutNode {
    return new CalloutNode(node.__calloutType, node.__key);
  }

  constructor(calloutType: CalloutType = 'info', key?: NodeKey) {
    super(key);
    this.__calloutType = calloutType;
  }

  getCalloutType(): CalloutType {
    return this.__calloutType;
  }

  setCalloutType(type: CalloutType): void {
    const writable = this.getWritable();
    writable.__calloutType = type;
  }

  createDOM(): HTMLElement {
    const dom = document.createElement('div');
    dom.className = getCalloutClassName(this.__calloutType);
    return dom;
  }

  updateDOM(prevNode: CalloutNode, dom: HTMLElement): boolean {
    if (prevNode.__calloutType !== this.__calloutType) {
      dom.className = getCalloutClassName(this.__calloutType);
    }
    return false;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('blockquote');
    element.setAttribute('data-callout-type', this.__calloutType);
    element.className = `callout callout-${this.__calloutType}`;
    return { element };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      blockquote: (node: Node) => {
        const element = node as HTMLElement;
        if (extractCalloutType(element)) {
          return {
            conversion: convertCalloutElement,
            priority: 2,
          };
        }
        return null;
      },
      div: (node: Node) => {
        const element = node as HTMLElement;
        if (element.classList.contains('callout-content') && element.closest('.callout')) {
          return {
            conversion: () => ({ node: null }),
            priority: 2,
          };
        }
        if (extractCalloutType(element)) {
          return {
            conversion: convertCalloutElement,
            priority: 2,
          };
        }
        return null;
      },
    };
  }

  static importJSON(serializedNode: SerializedCalloutNode): CalloutNode {
    const node = $createCalloutNode(serializedNode.calloutType);
    return node;
  }

  exportJSON(): SerializedCalloutNode {
    return {
      ...super.exportJSON(),
      calloutType: this.__calloutType,
      type: 'callout',
      version: 1,
    };
  }

  // Enter at end of callout → create new paragraph after callout
  insertNewAfter(_selection?: RangeSelection, restoreSelection = true): ParagraphNode {
    const paragraph = $createParagraphNode();
    const direction = this.getDirection();
    paragraph.setDirection(direction);
    this.insertAfter(paragraph, restoreSelection);
    return paragraph;
  }

  // Backspace at start → convert callout to paragraph
  collapseAtStart(): boolean {
    const paragraph = $createParagraphNode();
    const children = this.getChildren();
    children.forEach((child) => paragraph.append(child));
    this.replace(paragraph);
    return true;
  }
}

function findFirstTextNode(nodes: LexicalNode[]): TextNode | null {
  for (const node of nodes) {
    if ($isTextNode(node)) {
      return node;
    }
    if ($isElementNode(node)) {
      const nested = findFirstTextNode(node.getChildren());
      if (nested) return nested;
    }
  }
  return null;
}

function flattenToInlineNodes(nodes: LexicalNode[]): LexicalNode[] {
  const flattened: LexicalNode[] = [];
  for (const child of nodes) {
    if ($isParagraphNode(child) || ($isElementNode(child) && !child.isInline())) {
      const nested = flattenToInlineNodes(child.getChildren());
      if (flattened.length > 0 && nested.length > 0) {
        flattened.push($createLineBreakNode());
      }
      flattened.push(...nested);
    } else {
      flattened.push(child);
    }
  }
  return flattened;
}

function convertCalloutElement(domNode: Node): DOMConversionOutput {
  const element = domNode as HTMLElement;
  const calloutType = extractCalloutType(element) || 'info';
  const node = $createCalloutNode(calloutType);
  return {
    node,
    after: (childLexicalNodes) => {
      const flattened = flattenToInlineNodes(childLexicalNodes);

      const firstText = findFirstTextNode(flattened);
      if (firstText) {
        const text = firstText.getTextContent();
        const clean = text.replace(/^\s*(?:\[!(?:success|info|warning|error)\]\s*)+/gi, '');
        if (clean !== text) {
          if (clean === '' && flattened[0] === firstText) {
            flattened.shift();
            if ($isLineBreakNode(flattened[0])) {
              flattened.shift();
            }
          } else {
            firstText.setTextContent(clean);
          }
        }
      }
      return flattened;
    },
  };
}

export function $createCalloutNode(calloutType: CalloutType = 'info'): CalloutNode {
  return $applyNodeReplacement(new CalloutNode(calloutType));
}

export function $isCalloutNode(node: LexicalNode | null | undefined): node is CalloutNode {
  return node instanceof CalloutNode;
}
