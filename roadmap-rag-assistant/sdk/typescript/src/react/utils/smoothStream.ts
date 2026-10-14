/**
 * Reveals streamed text word by word at a steady, time-based pace instead of in the bursty
 * chunks the server sends (Groq can deliver a whole answer in ~0.3s).
 *
 * - Unit is a whole word plus its trailing whitespace, so words (and Vietnamese diacritics)
 *   never appear half-typed. A trailing partial word waits until more text or `finish`.
 * - Pace is driven by elapsed time, not frame count, so 60Hz and 120Hz screens look the same.
 * - The delay per word shrinks as the backlog grows, so long answers still keep up.
 *
 * Same idea as the AI SDK's `smoothStream` (word chunking, per-chunk delay, no delay while
 * the document is hidden), done client-side with an adaptive delay instead of a fixed one.
 * Splitting on whitespace gives Vietnamese syllables, which is the right unit for display.
 */
export interface SmoothStream {
  push: (delta: string) => void;
  /** Drain what is left (including a trailing partial word), then call `onDrained`. */
  finish: (onDrained: () => void) => void;
  /** Emit everything still buffered right away and stop. */
  flush: () => void;
  /** Drop the buffer and stop without emitting. */
  cancel: () => void;
}

/** ms per word when the backlog is small: ~35 words/s, a calm reading pace. */
const BASE_DELAY_MS = 28;
/** Never wait longer than one frame's worth of time per word when far behind. */
const MIN_DELAY_MS = 4;

const WORD = /^\s*\S+\s+/;

const schedule = (cb: (now: number) => void): number =>
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(cb)
    : (setTimeout(() => cb(Date.now()), 16) as unknown as number);

const unschedule = (id: number) =>
  typeof cancelAnimationFrame === "function" ? cancelAnimationFrame(id) : clearTimeout(id);

const countWords = (text: string) => (text.match(/\S+/g) || []).length;

export function createSmoothStream(emit: (chunk: string) => void): SmoothStream {
  let buffer = "";
  let frame: number | null = null;
  let lastTime: number | null = null;
  let carry = 0;
  let finishing = false;
  let onDrained: (() => void) | null = null;

  /** Next whole word; while finishing, also the trailing partial one. */
  const nextWord = (): string | null => {
    const m = buffer.match(WORD);
    if (m) return m[0];
    return finishing && buffer ? buffer : null;
  };

  const tick = (now: number) => {
    frame = null;
    // Hidden tabs throttle timers; pacing there only delays text nobody is watching.
    if (typeof document !== "undefined" && document.hidden) carry = Infinity;
    carry += lastTime === null ? BASE_DELAY_MS : now - lastTime;
    lastTime = now;

    // Aim to clear the current backlog in about one second.
    const backlog = countWords(buffer) || 1;
    const delay = Math.max(MIN_DELAY_MS, Math.min(BASE_DELAY_MS, 1000 / backlog));

    let out = "";
    while (carry >= delay) {
      const word = nextWord();
      if (!word) break;
      out += word;
      buffer = buffer.slice(word.length);
      carry -= delay;
    }
    if (out) emit(out);

    if (nextWord()) {
      frame = schedule(tick);
      return;
    }
    // Idle: waiting for more text (or done). Reset timing so the next burst starts fresh.
    lastTime = null;
    carry = 0;
    if (finishing && !buffer && onDrained) {
      const done = onDrained;
      onDrained = null;
      done();
    }
  };

  const start = () => {
    if (frame === null) frame = schedule(tick);
  };

  const stop = () => {
    if (frame !== null) unschedule(frame);
    frame = null;
    onDrained = null;
  };

  return {
    push(delta) {
      buffer += delta;
      start();
    },
    finish(cb) {
      finishing = true;
      onDrained = cb;
      start();
    },
    flush() {
      stop();
      if (buffer) emit(buffer);
      buffer = "";
    },
    cancel() {
      stop();
      buffer = "";
    },
  };
}
