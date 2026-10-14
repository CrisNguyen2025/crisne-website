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
export declare function createSmoothStream(emit: (chunk: string) => void): SmoothStream;
