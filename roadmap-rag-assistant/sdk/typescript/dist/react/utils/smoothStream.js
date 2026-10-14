"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSmoothStream = createSmoothStream;
/** ms per word when the backlog is small: ~35 words/s, a calm reading pace. */
const BASE_DELAY_MS = 28;
/** Never wait longer than one frame's worth of time per word when far behind. */
const MIN_DELAY_MS = 4;
const WORD = /^\s*\S+\s+/;
const schedule = (cb) => typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(cb)
    : setTimeout(() => cb(Date.now()), 16);
const unschedule = (id) => typeof cancelAnimationFrame === "function" ? cancelAnimationFrame(id) : clearTimeout(id);
const countWords = (text) => (text.match(/\S+/g) || []).length;
function createSmoothStream(emit) {
    let buffer = "";
    let frame = null;
    let lastTime = null;
    let carry = 0;
    let finishing = false;
    let onDrained = null;
    /** Next whole word; while finishing, also the trailing partial one. */
    const nextWord = () => {
        const m = buffer.match(WORD);
        if (m)
            return m[0];
        return finishing && buffer ? buffer : null;
    };
    const tick = (now) => {
        frame = null;
        // Hidden tabs throttle timers; pacing there only delays text nobody is watching.
        if (typeof document !== "undefined" && document.hidden)
            carry = Infinity;
        carry += lastTime === null ? BASE_DELAY_MS : now - lastTime;
        lastTime = now;
        // Aim to clear the current backlog in about one second.
        const backlog = countWords(buffer) || 1;
        const delay = Math.max(MIN_DELAY_MS, Math.min(BASE_DELAY_MS, 1000 / backlog));
        let out = "";
        while (carry >= delay) {
            const word = nextWord();
            if (!word)
                break;
            out += word;
            buffer = buffer.slice(word.length);
            carry -= delay;
        }
        if (out)
            emit(out);
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
        if (frame === null)
            frame = schedule(tick);
    };
    const stop = () => {
        if (frame !== null)
            unschedule(frame);
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
            if (buffer)
                emit(buffer);
            buffer = "";
        },
        cancel() {
            stop();
            buffer = "";
        },
    };
}
