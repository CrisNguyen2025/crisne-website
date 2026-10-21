import { useEffect, useState } from 'react';
import { loadFeedback, saveFeedback } from './storage';

/** 1 = 👍, 0 = 👎, null = no rating (taken back). */
export type Vote = 0 | 1 | null;

export interface VoteDetail {
  reason?: string;
  comment?: string;
}

export type SendVote = (messageId: string, value: Vote, detail?: VoteDetail) => Promise<void> | void;

export interface FeedbackQueue {
  /** Shows the vote at once; sends it after `delayMs` unless another click comes first. `defer` waits for `commit`. */
  vote(messageId: string, value: Vote, options?: { defer?: boolean }): void;
  /** Sends the message's vote now, with the 👎 reason when given. */
  commit(messageId: string, detail?: VoteDetail): Promise<void>;
  /** Sends every vote not sent yet (page hidden, widget unmounted). */
  flushAll(): void;
  /** Replaces the sender and the failure handler (the host's callbacks can change between renders). */
  setHandlers(handlers: { send: SendVote; onFailed?: (messageId: string) => void }): void;
}

interface QueueOptions {
  initial: Record<string, 0 | 1>;
  send: SendVote;
  /** A vote was not saved; the accepted one is back on screen */
  onFailed?: (messageId: string) => void;
  onChange: (votes: Record<string, Vote>) => void;
  onCommitted: (votes: Record<string, 0 | 1>) => void;
  delayMs: number;
}

/**
 * Votes change on screen at once, but the service only gets the last one: clicks within `delayMs`
 * collapse into one request, a vote back to what the service already has sends nothing, requests of a
 * message run one at a time (an older one never lands after a newer one), and a failed request puts the
 * accepted vote back on screen.
 */
export function createFeedbackQueue({ initial, send, onFailed, onChange, onCommitted, delayMs }: QueueOptions): FeedbackQueue {
  const committed: Record<string, Vote> = { ...initial };
  const latest: Record<string, Vote> = { ...initial };
  const details: Record<string, VoteDetail | undefined> = {};
  const timers: Record<string, ReturnType<typeof setTimeout>> = {};
  const inFlight: Record<string, Promise<void> | undefined> = {};
  let sendVote = send;
  let reportFailure = onFailed;

  const accepted = () =>
    Object.fromEntries(Object.entries(committed).filter((entry): entry is [string, 0 | 1] => entry[1] !== null));

  const flush = (messageId: string): Promise<void> => {
    clearTimeout(timers[messageId]);
    delete timers[messageId];
    const previous = inFlight[messageId];
    const run = (async () => {
      await previous;
      const target = latest[messageId] ?? null;
      const detail = details[messageId];
      delete details[messageId];
      if (target === (committed[messageId] ?? null) && !detail) return;
      try {
        await sendVote(messageId, target, detail);
        committed[messageId] = target;
        onCommitted(accepted());
      } catch {
        // Only roll back when no newer click is waiting: that one is sent next
        if ((latest[messageId] ?? null) === target) {
          latest[messageId] = committed[messageId] ?? null;
          onChange({ ...latest });
          reportFailure?.(messageId);
        }
      }
    })();
    inFlight[messageId] = run;
    return run;
  };

  return {
    vote(messageId, value, { defer = false } = {}) {
      latest[messageId] = value;
      onChange({ ...latest });
      clearTimeout(timers[messageId]);
      delete timers[messageId];
      if (!defer) timers[messageId] = setTimeout(() => void flush(messageId), delayMs);
    },
    commit(messageId, detail) {
      if (detail?.reason || detail?.comment) details[messageId] = detail;
      return flush(messageId);
    },
    flushAll() {
      for (const messageId of Object.keys(latest)) {
        if ((latest[messageId] ?? null) !== (committed[messageId] ?? null) || messageId in timers) void flush(messageId);
      }
    },
    setHandlers(handlers) {
      sendVote = handlers.send;
      reportFailure = handlers.onFailed;
    },
  };
}

/** 👍/👎 state of a conversation's replies, sent through `send` as described in createFeedbackQueue. */
export function useFeedback({
  storageKey,
  send,
  onFailed,
  delayMs = 800,
}: {
  storageKey: string;
  send: SendVote;
  onFailed?: (messageId: string) => void;
  delayMs?: number;
}): { votes: Record<string, Vote> } & Pick<FeedbackQueue, 'vote' | 'commit'> {
  const [votes, setVotes] = useState<Record<string, Vote>>(() => loadFeedback(storageKey));
  const [queue] = useState(() =>
    createFeedbackQueue({
      initial: loadFeedback(storageKey),
      send,
      onFailed,
      onChange: setVotes,
      onCommitted: (accepted) => saveFeedback(storageKey, accepted),
      delayMs,
    })
  );

  useEffect(() => {
    queue.setHandlers({ send, onFailed });
  });

  useEffect(() => {
    // The last vote is not lost when the tab closes or the widget goes away (requests use keepalive)
    const onPageHide = () => queue.flushAll();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      queue.flushAll();
    };
  }, [queue]);

  return { votes, vote: queue.vote, commit: queue.commit };
}
