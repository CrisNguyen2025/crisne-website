export const THROAT_CLEARING_OPENERS: RegExp[] = [
  /^chào\s+mừng[^.!?\n]*[.!?\n]*\s*/i,
  /^(?:dạ\s+)?(?:xin\s+)?chào\s+(?:bạn|anh|chị|em|quý\s+khách|mọi\s+người)(?:\s+nhé|\s+nha|\s+ạ)?[\s,!\.-]*/i,
  /^(?:dạ\s+)?(?:xin\s+)?chào(?:\s+nhé|\s+nha|\s+ạ)?(?:[,!\.-]+|\s*[\n$])\s*/i,
  /^rất\s+vui\s+(?:được\s+)?(?:gặp|hỗ\s+trợ|chia\s+sẻ\s+với|làm\s+quen\s+với)(?:\s+(?:bạn|anh|chị))?[\s,!\.-]*/i,
  /^cảm\s+ơn\s+(?:bạn\s+)?đã\s+(?:đặt\s+)?câu\s+hỏi[\s,!\.-]*/i,
  /^cảm\s+ơn\s+bạn[\s,!\.-]*/i,
  /^về\s+(?:câu\s+hỏi|thắc\s+mắc|yêu\s+cầu)\s+của\s+bạn[\s,!\.-]*/i,
  /^(?:để\s+)?trả\s+lời\s+câu\s+hỏi\s+(?:này|của\s+bạn)[\s,!\.-]*/i,
  /^dưới\s+đây\s+là\s+[^.!?\n:]*[:.!?\n]*\s*/i,
  /^(?:hello|hi|hey|greetings)(?:\s+there)?[\s,!\.-]*/i,
  /^great\s+question[\s,!\.-]*/i,
  /^thanks\s+for\s+(?:asking|reaching\s+out)[\s,!\.-]*/i,
  /^i(?:'d|\s+would)\s+be\s+happy\s+to\s+help[\s,!\.-]*/i,
  /^regarding\s+your\s+question[\s,!\.-]*/i,
  /^to\s+answer\s+your\s+question[\s,!\.-]*/i,
];

export const SYCOPHANTIC_PRAISE: RegExp[] = [
  /^(?:thật\s+|rất\s+)?tuyệt\s+vời(?:\s+quá)?[\s,!\.-]*/i,
  /^câu\s+hỏi\s+(?:rất\s+)?(?:hay|thú\s+vị|tuyệt\s+vời)[\s,!\.-]*/i,
  /^bạn\s+hỏi\s+(?:rất\s+)?đúng\s+trọng\s+tâm[\s,!\.-]*/i,
  /^(?:awesome|great|excellent|good)\s+question[\s,!\.-]*/i,
];

export const ROBOTIC_META_DISCOURSE: RegExp[] = [
  /^(?:dựa\s+vào|theo)\s+(?:tài\s+liệu|thông\s+tin|dữ\s+liệu)(?:\s+được\s+cung\s+cấp)?(?:\s+ở\s+trên)?[\s,!:\.-]*/i,
  /^trong\s+ngữ\s+cảnh\s+(?:trên|này)[\s,!\.-]*/i,
  /^như\s+đã\s+nêu\s+ở\s+trên[\s,!\.-]*/i,
  /^based\s+on\s+the\s+provided\s+(?:context|documents)[\s,!\.-]*/i,
  /^according\s+to\s+the\s+information[\s,!\.-]*/i,
];

export const ALL_OPENER_PATTERNS: RegExp[] = [
  ...THROAT_CLEARING_OPENERS,
  ...SYCOPHANTIC_PRAISE,
  ...ROBOTIC_META_DISCOURSE,
];

export const SUMMARY_RECAP_KICKERS: RegExp[] = [
  /(?<=^|[\r\n]+|[.!?]\s*)\s*(?:tóm\s+lại|nói\s+tóm\s+lại|tổng\s+kết\s+lại|nhìn\s+chung)[\s:,][\s\S]*$/i,
  /(?<=^|[\r\n]+|[.!?]\s*)\s*hy\s+vọng\s+(?:những\s+)?(?:thông\s+tin|câu\s+trả\s+lời)\s+(?:trên|này)?\s+(?:sẽ\s+)?(?:hữu\s+ích|giúp\s+ích)[\s\S]*$/i,
  /(?<=^|[\r\n]+|[.!?]\s*)\s*(?:nếu\s+)?(?:bạn\s+)?(?:có\s+thêm\s+câu\s+hỏi|cần\s+thêm\s+thông\s+tin|muốn\s+tìm\s+hiểu\s+thêm)[^.\n]*đừng\s+ngần\s+ngại[\s\S]*$/i,
  /(?<=^|[\r\n]+|[.!?]\s*)\s*(?:đừng\s+ngần\s+ngại\s+liên\s+hệ|hãy\s+liên\s+hệ\s+với\s+Cris)[\s\S]*$/i,
  /(?<=^|[\r\n]+|[.!?]\s*)\s*chúc\s+bạn\s+một\s+ngày[\s\S]*$/i,
  /(?<=^|[\r\n]+|[.!?]\s*)\s*(?:in\s+conclusion|in\s+summary|to\s+sum\s+up|overall|ultimately)[\s:,][\s\S]*$/i,
  /(?<=^|[\r\n]+|[.!?]\s*)\s*hope\s+this\s+helps[\s\S]*$/i,
  /(?<=^|[\r\n]+|[.!?]\s*)\s*(?:feel\s+free\s+to|don't\s+hesitate\s+to)\s+(?:ask|reach\s+out)[\s\S]*$/i,
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

function findKickerSplitIndex(text: string): number {
  const lower = text.toLowerCase();
  let earliestIndex = -1;

  for (const trigger of KICKER_TRIGGERS) {
    let searchFrom = 0;
    while (searchFrom < lower.length) {
      const idx = lower.indexOf(trigger, searchFrom);
      if (idx === -1) break;

      const prefix = text.slice(0, idx);
      if (/(?:^|[\r\n]+|[.!?])\s*$/.test(prefix)) {
        let startIdx = idx;
        while (startIdx > 0 && /[\s\n]/.test(text[startIdx - 1])) {
          startIdx--;
        }
        if (earliestIndex === -1 || startIdx < earliestIndex) {
          earliestIndex = startIdx;
        }
        break;
      }
      searchFrom = idx + 1;
    }
  }

  if (earliestIndex !== -1) {
    return earliestIndex;
  }

  const maxPrefixLen = Math.min(25, lower.length);
  for (let len = maxPrefixLen; len >= 1; len--) {
    const splitPoint = text.length - len;
    const prefix = text.slice(0, splitPoint);
    if (!/(?:^|[\r\n]+|[.!?])\s*$/.test(prefix)) {
      continue;
    }
    const tail = lower.slice(splitPoint).trimStart();
    if (!tail) continue;
    for (const trigger of KICKER_TRIGGERS) {
      if (trigger.startsWith(tail)) {
        return splitPoint;
      }
    }
  }

  return -1;
}

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function getFirstSentence(text: string): string {
  const match = text.match(/^([\s\S]+?[.!?])(?:\s+|$)/);
  return match ? match[1].trim() : text.trim();
}

export function cleanAntiSlopText(rawText: string): string {
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
  }
  text = text.trimStart();
  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  const trailingTagsMatch = text.match(/(?:\s*\[\[action:[^\]]+\]\])+$/);
  const trailingTags = trailingTagsMatch ? trailingTagsMatch[0] : "";
  if (trailingTags) {
    text = text.slice(0, -trailingTags.length);
  }

  for (const pattern of SUMMARY_RECAP_KICKERS) {
    text = text.replace(pattern, "");
  }
  text = text.trimEnd();

  if (trailingTags) {
    text = text + (text.length > 0 ? " " : "") + trailingTags.trim();
  }

  return text;
}

export function isDirectAnswerCompliant(text: string, maxWords = 20): boolean {
  const cleaned = cleanAntiSlopText(text);
  const firstSentence = getFirstSentence(cleaned);
  const sentenceWithoutActionTags = firstSentence
    .replace(/\[\[action:[^\]]+\]\]/g, "")
    .replace(/[.,!?;:]+(?=\s|$)/g, "")
    .trim();
  const words = countWords(sentenceWithoutActionTags);
  return words > 0 && words <= maxWords;
}

export function createAntiSlopTransformStream<T = Uint8Array | string>() {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let isBinary: boolean | null = null;
  let isHeadCleaned = false;
  let headBuffer = "";
  let pendingBuffer = "";
  const HEAD_THRESHOLD = 80;

  function sanitizeHead(buffer: string): { cleaned: string; done: boolean } {
    let text = buffer;
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
    }
    text = text.trimStart();
    if (text.length > 0) {
      text = text.charAt(0).toUpperCase() + text.slice(1);
      return { cleaned: text, done: true };
    }
    return { cleaned: "", done: false };
  }

  function sanitizeTail(buffer: string): string {
    let text = buffer;
    const trailingTagsMatch = text.match(/(?:\s*\[\[action:[^\]]+\]\])+$/);
    const trailingTags = trailingTagsMatch ? trailingTagsMatch[0] : "";
    if (trailingTags) {
      text = text.slice(0, -trailingTags.length);
    }

    for (const pattern of SUMMARY_RECAP_KICKERS) {
      text = text.replace(pattern, "");
    }
    text = text.trimEnd();

    if (trailingTags) {
      text = text + (text.length > 0 ? " " : "") + trailingTags.trim();
    }
    return text;
  }

  return new TransformStream<T, any>({
    transform(chunk, controller) {
      if (isBinary === null) {
        isBinary = typeof chunk !== "string";
      }

      const textChunk = typeof chunk === "string" ? chunk : decoder.decode(chunk as Uint8Array, { stream: true });
      if (!textChunk) return;

      let textToProcess = textChunk;

      if (!isHeadCleaned) {
        headBuffer += textToProcess;
        const hasSentenceEnd = /[.!?\n]/.test(headBuffer);
        const reachesThreshold = headBuffer.length >= HEAD_THRESHOLD;
        const mightBeOpener = couldBeOpener(headBuffer);

        if (!mightBeOpener) {
          isHeadCleaned = true;
          textToProcess = headBuffer;
          headBuffer = "";
        } else if (hasSentenceEnd || reachesThreshold) {
          const { cleaned, done } = sanitizeHead(headBuffer);
          if (done) {
            isHeadCleaned = true;
            headBuffer = "";
            textToProcess = cleaned;
          } else {
            headBuffer = "";
            return;
          }
        } else {
          return;
        }
      }

      pendingBuffer += textToProcess;
      const splitIdx = findKickerSplitIndex(pendingBuffer);

      if (splitIdx === -1) {
        if (pendingBuffer.length > 0) {
          controller.enqueue(isBinary ? encoder.encode(pendingBuffer) : pendingBuffer);
          pendingBuffer = "";
        }
      } else {
        const safePart = pendingBuffer.slice(0, splitIdx);
        pendingBuffer = pendingBuffer.slice(splitIdx);
        if (safePart.length > 0) {
          controller.enqueue(isBinary ? encoder.encode(safePart) : safePart);
        }
      }
    },
    flush(controller) {
      if (isBinary === null) {
        isBinary = false;
      }

      if (!isHeadCleaned && headBuffer.length > 0) {
        const { cleaned } = sanitizeHead(headBuffer);
        pendingBuffer += cleaned;
        headBuffer = "";
      }

      const finalTail = sanitizeTail(pendingBuffer);
      if (finalTail.length > 0) {
        controller.enqueue(isBinary ? encoder.encode(finalTail) : finalTail);
      }
      pendingBuffer = "";
    },
  });
}
