export interface EmphasisSegment {
  text: string;
  isEmphasis: boolean;
}

const EMPHASIS_PATTERN = /\*\*([^*\n]+?)\*\*/g;

/**
 * Splits text that marks keywords with `**...**` into plain and emphasized segments.
 * Unpaired `**` markers are dropped so stray markdown never shows up as literal asterisks.
 */
export function splitEmphasis(text: string): EmphasisSegment[] {
  const segments: EmphasisSegment[] = [];
  const pushPlain = (value: string) => {
    const plain = value.replaceAll("**", "");
    if (plain) segments.push({ text: plain, isEmphasis: false });
  };

  let lastIndex = 0;
  for (const match of text.matchAll(EMPHASIS_PATTERN)) {
    pushPlain(text.slice(lastIndex, match.index));
    const keyword = match[1].trim();
    if (keyword) segments.push({ text: keyword, isEmphasis: true });
    lastIndex = match.index + match[0].length;
  }
  pushPlain(text.slice(lastIndex));

  return segments;
}
