import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical';
import { $applyNodeReplacement, DecoratorNode } from 'lexical';
import type { JSX } from 'react';
import { PROVENANCE_REF_ATTRIBUTE, isClaimRefKey } from '@/lib/provenance/markers';

export type SerializedProvenanceNode = Spread<{ claimRefKey: string }, SerializedLexicalNode>;

/**
 * Provenance marker at the end of a sentence (ADR-0017). Without this node Lexical drops the empty
 * `<span data-provenance-ref>` on the first save. It holds no text, so excerpts, word counts and the
 * Roadmap Assistant index never see it, and it exports back to exactly the same empty span.
 */
export class ProvenanceNode extends DecoratorNode<JSX.Element> {
  __claimRefKey: string;

  static getType(): string {
    return 'provenance';
  }

  static clone(node: ProvenanceNode): ProvenanceNode {
    return new ProvenanceNode(node.__claimRefKey, node.__key);
  }

  static importJSON(serializedNode: SerializedProvenanceNode): ProvenanceNode {
    return $createProvenanceNode(serializedNode.claimRefKey);
  }

  static importDOM(): DOMConversionMap | null {
    return {
      span: (domNode: HTMLElement) => {
        const key = domNode.getAttribute(PROVENANCE_REF_ATTRIBUTE);
        if (!key || !isClaimRefKey(key)) return null;
        // Above MentionNode (priority 1), which only takes spans marked data-lexical-mention
        return { conversion: convertProvenanceElement, priority: 2 };
      },
    };
  }

  constructor(claimRefKey: string, key?: NodeKey) {
    super(key);
    this.__claimRefKey = claimRefKey;
  }

  exportJSON(): SerializedProvenanceNode {
    return { ...super.exportJSON(), type: 'provenance', version: 1, claimRefKey: this.__claimRefKey };
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('span');
    element.setAttribute(PROVENANCE_REF_ATTRIBUTE, this.__claimRefKey);
    return { element };
  }

  createDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'provenance-marker';
    return span;
  }

  updateDOM(): false {
    return false;
  }

  getClaimRefKey(): string {
    return this.getLatest().__claimRefKey;
  }

  getTextContent(): string {
    return '';
  }

  isInline(): true {
    return true;
  }

  isKeyboardSelectable(): false {
    return false;
  }

  decorate(): JSX.Element {
    // Only inside the editor (Owner): a small mark so the Owner knows the sentence has a source
    return (
      <sup
        className="mx-0.5 select-none text-[0.65em] text-muted-foreground"
        contentEditable={false}
        aria-label="Câu có nguồn"
        title="Câu có nguồn"
      >
        ◆
      </sup>
    );
  }
}

function convertProvenanceElement(domNode: HTMLElement): DOMConversionOutput {
  const key = domNode.getAttribute(PROVENANCE_REF_ATTRIBUTE);
  return { node: key && isClaimRefKey(key) ? $createProvenanceNode(key.toLowerCase()) : null };
}

export function $createProvenanceNode(claimRefKey: string): ProvenanceNode {
  return $applyNodeReplacement(new ProvenanceNode(claimRefKey));
}

export function $isProvenanceNode(node: LexicalNode | null | undefined): node is ProvenanceNode {
  return node instanceof ProvenanceNode;
}
