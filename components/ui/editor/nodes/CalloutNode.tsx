import {
  $applyNodeReplacement,
  $createParagraphNode,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  ElementNode,
  LexicalNode,
  NodeKey,
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
  success: { border: '#22c55e', bg: 'rgba(34, 197, 94, 0.08)' },
  info: { border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.08)' },
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
      margin: 0.5rem 0;
      padding: 0.75rem 1rem 0.75rem 1.25rem;
      border: 1.5px solid ${colors.border};
      border-left: 4px solid ${colors.border};
      border-radius: 10px;
      background: ${colors.bg};
    `;
    return dom;
  }

  updateDOM(prevNode: CalloutNode): boolean {
    return prevNode.__calloutType !== this.__calloutType;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('blockquote');
    element.setAttribute('data-callout-type', this.__calloutType);
    // Prepend [!type] marker for rendering in detail view
    const marker = document.createTextNode(`[!${this.__calloutType}] `);
    element.prepend(marker);
    return { element };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      blockquote: (node: Node) => {
        const element = node as HTMLElement;
        const calloutType = element.getAttribute('data-callout-type') as CalloutType | null;
        if (calloutType && ['success', 'info', 'warning', 'error'].includes(calloutType)) {
          return {
            conversion: convertCalloutElement,
            priority: 1,
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

  // Enter at end of callout → handled by CalloutTransformPlugin
  insertNewAfter(): null {
    // Return null - we handle Enter via KEY_ENTER_COMMAND in plugin
    return null;
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
  const calloutType = (element.getAttribute('data-callout-type') as CalloutType) || 'info';
  const node = $createCalloutNode(calloutType);
  return { node };
}

export function $createCalloutNode(calloutType: CalloutType = 'info'): CalloutNode {
  return $applyNodeReplacement(new CalloutNode(calloutType));
}

export function $isCalloutNode(node: LexicalNode | null | undefined): node is CalloutNode {
  return node instanceof CalloutNode;
}
