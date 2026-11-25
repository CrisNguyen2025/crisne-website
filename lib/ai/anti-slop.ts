const POLITE_PREFIX = /^(?:dạ|xin)\s+/i;

export const THROAT_CLEARING_OPENERS: RegExp[] = [
  /^chào mừng[^\n.!?]*[.!?\n]*\s*/i,
  /^(?:dạ )?(?:xin )?chào (?:bạn|anh|chị|em)[\s,.!-]*/i,
  /^(?:dạ )?(?:xin )?chào (?:quý khách|mọi người)[\s,.!-]*/i,
  /^(?:nhé|nha|ạ)(?:[,!.-]+|\s*$)/i,
  /^chào(?:\s+(?:nhé|nha|ạ))?[,!.\n-]\s*/i,
  /^rất vui được (?:gặp|hỗ trợ|chia sẻ với|làm quen với)(?:\s+(?:bạn|anh|chị))?[\s,.!-]*/i,
  /^rất vui (?:gặp|hỗ trợ|chia sẻ với|làm quen với)(?:\s+(?:bạn|anh|chị))?[\s,.!-]*/i,
  /^cảm ơn (?:bạn )?đã (?:đặt )?câu hỏi[\s,.!-]*/i,
  /^cảm ơn bạn[\s,.!-]*/i,
  /^về (?:câu hỏi|thắc mắc|yêu cầu) của bạn[\s,.!-]*/i,
  /^(?:để )?trả lời câu hỏi (?:này|của bạn)[\s,.!-]*/i,
  /^dưới đây là [^\n.!?:]*[:.!?\n]*\s*/i,
  /^(?:hello|hi|hey|greetings)(?: there)?[\s,.!-]*/i,
  /^great question[\s,.!-]*/i,
  /^thanks for (?:asking|reaching out)[\s,.!-]*/i,
  /^i(?:'d| would) be happy to help[\s,.!-]*/i,
  /^regarding your question[\s,.!-]*/i,
  /^to answer your question[\s,.!-]*/i,
];

export const SYCOPHANTIC_PRAISE: RegExp[] = [
  /^(?:thật |rất )?tuyệt vời(?: quá)?[\s,.!-]*/i,
  /^câu hỏi (?:rất )?(?:hay|thú vị|tuyệt vời)[\s,.!-]*/i,
  /^bạn hỏi (?:rất )?đúng trọng tâm[\s,.!-]*/i,
  /^(?:awesome|great|excellent|good) question[\s,.!-]*/i,
];

export const ROBOTIC_META_DISCOURSE: RegExp[] = [
  /^(?:dựa vào|theo) (?:tài liệu|thông tin|dữ liệu)(?: được cung cấp)?[\s,.:!-]*/i,
  /^ở trên[\s,.:!-]*/i,
  /^trong ngữ cảnh (?:trên|này)[\s,.!-]*/i,
  /^như đã nêu ở trên[\s,.!-]*/i,
  /^based on the provided (?:context|documents)[\s,.!-]*/i,
  /^according to the information[\s,.!-]*/i,
];

export const ALL_OPENER_PATTERNS: RegExp[] = [
  ...THROAT_CLEARING_OPENERS,
  ...SYCOPHANTIC_PRAISE,
  ...ROBOTIC_META_DISCOURSE,
];

export const SUMMARY_RECAP_KICKERS: RegExp[] = [
  /^(?:tóm lại|nói tóm lại|tổng kết lại|nhìn chung)[\s:,]/i,
  /^hy vọng (?:những )?(?:thông tin|câu trả lời)(?: trên| này)? (?:sẽ )?(?:hữu ích|giúp ích)/i,
  /^(?:nếu )?(?:bạn )?(?:có thêm câu hỏi|cần thêm thông tin|muốn tìm hiểu thêm)[^\n.]*đừng ngần ngại/i,
  /^(?:đừng ngần ngại liên hệ|hãy liên hệ với Cris)/i,
  /^chúc bạn một ngày/i,
  /^(?:in conclusion|in summary|to sum up|overall|ultimately)[\s:,]/i,
  /^hope this helps/i,
  /^(?:feel free to|don't hesitate to) (?:ask|reach out)/i,
];

export const BANNED_BUZZWORDS: string[] = [
  "delve",
  "leverage",
  "foster",
  "streamline",
  "robust",
  "cutting-edge",
  "paradigm shift",
  "game changer",
  "tapestry",
  "realm",
  "beacon",
  "multifaceted",
  "tận dụng tối đa",
  "đột phá",
  "tiên tiến nhất",
  "toàn diện",
  "đóng vai trò then chốt",
];

export const KICKER_TRIGGERS: string[] = [
  "tóm lại",
  "nói tóm lại",
  "tổng kết lại",
  "nhìn chung",
  "hy vọng",
  "hi vọng",
  "nếu bạn",
  "đừng ngần ngại",
  "hãy liên hệ",
  "chúc bạn",
  "in conclusion",
  "in summary",
  "to sum up",
  "overall",
  "ultimately",
  "hope this",
  "feel free",
  "don't hesitate",
];

const OPENER_FIRST_WORDS: string[] = [
  "chào",
  "xin",
  "dạ",
  "rất",
  "cảm",
  "về",
  "để",
  "dưới",
  "thật",
  "tuyệt",
  "câu",
  "bạn",
  "dựa",
  "theo",
  "trong",
  "như",
  "hello",
  "hi",
  "hey",
  "greetings",
  "great",
  "thanks",
  "i",
  "regarding",
  "to",
  "awesome",
  "excellent",
  "good",
  "based",
  "according",
];

function couldBeOpener(text: string): boolean {
  const trimmed = text.trimStart().toLowerCase();
  if (!trimmed) return true;
  const firstWordMatch = trimmed.match(/^([a-zA-ZÀ-ỹ]+)/);
  if (!firstWordMatch) return true;
  const word = firstWordMatch[1];
  if (trimmed.length > word.length && /\s/.test(trimmed[word.length])) {
    return OPENER_FIRST_WORDS.includes(word);
  }
  return OPENER_FIRST_WORDS.some((w) => w.startsWith(word));
}

function isWhitespaceChar(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\r" || ch === "\n";
}

function endsWithSentenceBoundary(text: string, endIndex: number): boolean {
  let cursor = endIndex;
  while (cursor > 0 && isWhitespaceChar(text[cursor - 1])) {
    cursor--;
  }
  if (cursor === 0) return true;
  const ch = text[cursor - 1];
  return ch === "." || ch === "!" || ch === "?" || ch === "\n" || ch === "\r";
}

function findTriggerStartIndex(text: string, lower: string, trigger: string): number {
  let searchFrom = 0;
  while (searchFrom < lower.length) {
    const idx = lower.indexOf(trigger, searchFrom);
    if (idx === -1) return -1;
    if (endsWithSentenceBoundary(text, idx)) {
      let startIdx = idx;
      while (startIdx > 0 && isWhitespaceChar(text[startIdx - 1])) {
        startIdx--;
      }
      return startIdx;
    }
    searchFrom = idx + 1;
  }
  return -1;
}

function findPartialTriggerTail(text: string, lower: string): number {
  const maxPrefixLen = Math.min(25, lower.length);
  for (let len = maxPrefixLen; len >= 1; len--) {
    const splitPoint = text.length - len;
    if (!endsWithSentenceBoundary(text, splitPoint)) continue;
    const tail = lower.slice(splitPoint).trimStart();
    if (!tail) continue;
    if (KICKER_TRIGGERS.some((trigger) => trigger.startsWith(tail))) {
      return splitPoint;
    }
  }
  return -1;
}

function findKickerSplitIndex(text: string): number {
  const lower = text.toLowerCase();
  let earliestIndex = -1;

  for (const trigger of KICKER_TRIGGERS) {
    const startIdx = findTriggerStartIndex(text, lower, trigger);
    if (startIdx !== -1 && (earliestIndex === -1 || startIdx < earliestIndex)) {
      earliestIndex = startIdx;
    }
  }

  return earliestIndex !== -1 ? earliestIndex : findPartialTriggerTail(text, lower);
}

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function getFirstSentence(text: string): string {
  const trimmed = text.trimStart();
  const match = /^([^.!?\n]+[.!?])(?:\s|$)/.exec(trimmed);
  if (match) return match[1].trim();
  const dotMatch = /^([\s\S]{1,400}?[.!?])(?:\s|$)/.exec(trimmed);
  return dotMatch ? dotMatch[1].trim() : trimmed.trim();
}

function normalizeCollapsedSpaces(text: string): string {
  return text.replace(/[ \t]+/g, " ");
}

function stripLeadingOpeners(rawText: string): string {
  let text = rawText;
  let changed = true;
  while (changed) {
    changed = false;
    const trimmed = text.trimStart();
    for (const pattern of ALL_OPENER_PATTERNS) {
      if (pattern.test(trimmed)) {
        text = trimmed.replace(pattern, "");
        changed = true;
        break;
      }
    }
    if (!changed && POLITE_PREFIX.test(trimmed)) {
      const stripped = trimmed.replace(POLITE_PREFIX, "");
      if (ALL_OPENER_PATTERNS.some((p) => p.test(stripped))) {
        text = stripped;
        changed = true;
      }
    }
  }
  text = text.trimStart();
  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }
  return text;
}

function splitTrailingActionTags(text: string): { body: string; trailingTags: string } {
  let cursor = text.length;
  while (cursor > 0) {
    const beforeSpace = text.slice(0, cursor).trimEnd();
    if (!beforeSpace.endsWith("]]")) break;
    const start = beforeSpace.lastIndexOf("[[action:");
    if (start === -1) break;
    cursor = start;
  }
  if (cursor === text.length) return { body: text, trailingTags: "" };
  return {
    body: text.slice(0, cursor),
    trailingTags: text.slice(cursor).trim(),
  };
}

function collectSentenceStarts(text: string): number[] {
  const starts: number[] = [];
  let i = 0;
  while (i < text.length && isWhitespaceChar(text[i])) i++;
  if (i < text.length) starts.push(i);

  for (let idx = 0; idx < text.length; idx++) {
    const ch = text[idx];
    if (ch !== "\n" && ch !== "\r" && ch !== "." && ch !== "!" && ch !== "?") continue;
    let next = idx + 1;
    while (next < text.length && isWhitespaceChar(text[next])) next++;
    if (next < text.length) starts.push(next);
  }
  return starts;
}

function stripTrailingKickers(rawText: string): string {
  const { body, trailingTags } = splitTrailingActionTags(rawText);
  let text = body;
  const starts = collectSentenceStarts(text);
  for (const start of starts) {
    const slice = normalizeCollapsedSpaces(text.slice(start));
    if (SUMMARY_RECAP_KICKERS.some((pattern) => pattern.test(slice))) {
      text = text.slice(0, start);
      break;
    }
  }
  text = text.trimEnd();
  if (!trailingTags) return text;
  return text + (text.length > 0 ? " " : "") + trailingTags;
}

export function cleanAntiSlopText(rawText: string): string {
  return stripTrailingKickers(stripLeadingOpeners(rawText));
}

const TRAILING_PUNCTUATION = new Set([".", ",", "!", "?", ";", ":"]);

function stripTrailingPunctuation(word: string): string {
  let end = word.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(word[end - 1])) end--;
  return end === word.length ? word : word.slice(0, end);
}

export function isDirectAnswerCompliant(text: string, maxWords = 20): boolean {
  const cleaned = cleanAntiSlopText(text);
  const firstSentence = getFirstSentence(cleaned);
  const withoutTags = firstSentence.replace(/\[\[action:[^\]]{1,200}\]\]/g, "");
  const sentenceWithoutActionTags = withoutTags
    .split(/\s+/)
    .map(stripTrailingPunctuation)
    .filter(Boolean)
    .join(" ");
  const words = countWords(sentenceWithoutActionTags);
  return words > 0 && words <= maxWords;
}

export function createAntiSlopTransformStream<T extends Uint8Array | string = Uint8Array>() {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let isBinary: boolean | null = null;
  let isHeadCleaned = false;
  let headBuffer = "";
  let pendingBuffer = "";
  const HEAD_THRESHOLD = 80;

  function processHeadChunk(textChunk: string): string | null {
    headBuffer += textChunk;
    const hasSentenceEnd = /[.!?\n]/.test(headBuffer);
    const reachesThreshold = headBuffer.length >= HEAD_THRESHOLD;

    if (!couldBeOpener(headBuffer)) {
      isHeadCleaned = true;
      const out = headBuffer;
      headBuffer = "";
      return out;
    }
    if (!hasSentenceEnd && !reachesThreshold) {
      return null;
    }
    const cleaned = stripLeadingOpeners(headBuffer);
    headBuffer = "";
    if (!cleaned) return null;
    isHeadCleaned = true;
    return cleaned;
  }

  function enqueueText(controller: TransformStreamDefaultController<T>, outText: string): void {
    if (!outText) return;
    controller.enqueue((isBinary ? encoder.encode(outText) : outText) as T);
  }

  return new TransformStream<T, T>({
    transform(chunk, controller) {
      if (isBinary === null) {
        isBinary = typeof chunk !== "string";
      }

      const textChunk = typeof chunk === "string" ? chunk : decoder.decode(chunk as Uint8Array, { stream: true });
      if (!textChunk) return;

      let textToProcess = textChunk;
      if (!isHeadCleaned) {
        const resolved = processHeadChunk(textToProcess);
        if (resolved === null) return;
        textToProcess = resolved;
      }

      pendingBuffer += textToProcess;
      const splitIdx = findKickerSplitIndex(pendingBuffer);

      if (splitIdx === -1) {
        enqueueText(controller, pendingBuffer);
        pendingBuffer = "";
        return;
      }

      const safePart = pendingBuffer.slice(0, splitIdx);
      pendingBuffer = pendingBuffer.slice(splitIdx);
      enqueueText(controller, safePart);
    },
    flush(controller) {
      if (isBinary === null) {
        isBinary = false;
      }

      if (!isHeadCleaned && headBuffer.length > 0) {
        pendingBuffer += stripLeadingOpeners(headBuffer);
        headBuffer = "";
      }

      enqueueText(controller, stripTrailingKickers(pendingBuffer));
      pendingBuffer = "";
    },
  });
}
