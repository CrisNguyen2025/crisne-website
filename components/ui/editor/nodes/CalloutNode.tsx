import {
  $applyNodeReplacement,
  $createParagraphNode,
  $isTextNode,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  ElementNode,
  LexicalNode,
  NodeKey,
  ParagraphNode,
  RangeSelection,
  SerializedElementNode,
  Spread,
} from 'lexical';

export type CalloutType = 'success' | 'info' | 'warning' | 'error';

export type SerializedCalloutNode = Spread<
  {
    calloutType: CalloutType;
  },
  SerializedElementNode
>;

const CALLOUT_COLORS: Record<CalloutType, { border: string; bg: string }> = {
  info: { border: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.08)' },
  success: { border: '#10b981', bg: 'rgba(16, 185, 129, 0.08)' },
  warning: { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.08)' },
  error: { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)' },
};

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

  createDOM(_config: EditorConfig): HTMLElement {
    const dom = document.createElement('div');
    const colors = CALLOUT_COLORS[this.__calloutType];
    dom.className = `editor-callout editor-callout-${this.__calloutType}`;
    dom.style.cssText = `
      position: relative;
      margin: 1rem 0;
      padding: 0.875rem 1.25rem;
      border: none;
      border-left: 4px solid ${colors.border};
      border-radius: 0 8px 8px 0;
      background: ${colors.bg};
      line-height: 1.65;
      font-size: 0.9375rem;
    `;
    return dom;
  }

  updateDOM(prevNode: CalloutNode): boolean {
    return prevNode.__calloutType !== this.__calloutType;
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
        const calloutType = element.getAttribute('data-callout-type') as CalloutType | null;
        const textContent = element.textContent || '';
        const hasMarker = /^\s*\[!(success|info|warning|error)\]/i.test(textContent);

        if ((calloutType && ['success', 'info', 'warning', 'error'].includes(calloutType)) || hasMarker) {
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

function convertCalloutElement(domNode: Node): DOMConversionOutput {
  const element = domNode as HTMLElement;
  let calloutType = element.getAttribute('data-callout-type') as CalloutType | null;
  if (!calloutType) {
    const match = element.textContent?.match(/^\s*\[!(success|info|warning|error)\]/i);
    if (match) {
      calloutType = match[1].toLowerCase() as CalloutType;
    }
  }
  const node = $createCalloutNode(calloutType || 'info');
  return {
    node,
    after: (childLexicalNodes) => {
      // Strip any lingering [!type] marker from the text
      if (childLexicalNodes.length > 0) {
        const first = childLexicalNodes[0];
        if ($isTextNode(first)) {
          const text = first.getTextContent();
          const clean = text.replace(/^\s*(?:\[!(?:success|info|warning|error)\]\s*)+/gi, '');
          if (clean !== text) {
            first.setTextContent(clean);
          }
        }
      }
      return childLexicalNodes;
    },
  };
}

export function $createCalloutNode(calloutType: CalloutType = 'info'): CalloutNode {
  return $applyNodeReplacement(new CalloutNode(calloutType));
}

export function $isCalloutNode(node: LexicalNode | null | undefined): node is CalloutNode {
  return node instanceof CalloutNode;
}
