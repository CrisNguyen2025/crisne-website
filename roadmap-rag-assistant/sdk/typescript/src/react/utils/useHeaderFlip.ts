import { useCallback, useLayoutEffect, useRef } from "react";

interface Snapshot {
  from: "hero" | "header";
  mascot: DOMRect;
  text: DOMRect;
}

const SYNC_TIMING: KeyframeAnimationOptions = {
  duration: 320,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};

function canAnimate(el: HTMLElement | null): el is HTMLElement {
  if (!el || typeof el.animate !== "function") return false;
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return false;
  }
  return true;
}

export function useHeaderFlip(
  isInitStage: boolean,
  scrollRef: React.RefObject<HTMLDivElement | null>
) {
  const headerMascotRef = useRef<HTMLDivElement | null>(null);
  const headerTextRef = useRef<HTMLDivElement | null>(null);
  const heroMascotRef = useRef<HTMLDivElement | null>(null);
  const heroTextRef = useRef<HTMLDivElement | null>(null);
  const heroChipsRef = useRef<HTMLDivElement | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);

  const captureBeforeSend = useCallback(() => {
    if (!isInitStage) return;
    const m = heroMascotRef.current;
    const t = heroTextRef.current;
    if (!m || !t) return;
    const mascot = m.getBoundingClientRect();
    const text = t.getBoundingClientRect();
    if (mascot.width > 0 && text.width > 0) {
      snapshotRef.current = { from: "hero", mascot, text };
    }
  }, [isInitStage]);

  const captureBeforeReset = useCallback(() => {
    if (isInitStage) return;
    const m = headerMascotRef.current;
    const t = headerTextRef.current;
    if (!m || !t) return;
    const mascot = m.getBoundingClientRect();
    const text = t.getBoundingClientRect();
    if (mascot.width > 0 && text.width > 0) {
      snapshotRef.current = { from: "header", mascot, text };
    }
  }, [isInitStage]);

  useLayoutEffect(() => {
    const snap = snapshotRef.current;
    if (!snap) return;
    snapshotRef.current = null;

    if (snap.from === "hero" && !isInitStage) {
      const hm = headerMascotRef.current;
      const ht = headerTextRef.current;
      if (!canAnimate(hm) || !canAnimate(ht)) return;

      const lastM = hm.getBoundingClientRect();
      const lastT = ht.getBoundingClientRect();
      if (lastM.width <= 0 || lastT.width <= 0) return;

      const dxM =
        snap.mascot.left +
        snap.mascot.width / 2 -
        (lastM.left + lastM.width / 2);
      const dyM =
        snap.mascot.top +
        snap.mascot.height / 2 -
        (lastM.top + lastM.height / 2);
      const scaleM = snap.mascot.width / lastM.width;

      const dxT =
        snap.text.left + snap.text.width / 2 - (lastT.left + lastT.width / 2);
      const dyT =
        snap.text.top + snap.text.height / 2 - (lastT.top + lastT.height / 2);

      hm.animate(
        [
          { transform: `translate(${dxM}px, ${dyM}px) scale(${scaleM})` },
          { transform: "translate(0, 0) scale(1)" },
        ],
        SYNC_TIMING
      );

      ht.animate(
        [
          {
            transform: `translate(${dxT}px, ${dyT * 0.72}px) scale(1.18)`,
            opacity: 0.9,
          },
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
        ],
        SYNC_TIMING
      );

      const firstItem = scrollRef.current?.firstElementChild as HTMLElement | null;
      if (canAnimate(firstItem)) {
        firstItem.animate(
          [
            { transform: "translateY(10px)", opacity: 0.45 },
            { transform: "translateY(0)", opacity: 1 },
          ],
          SYNC_TIMING
        );
      }
      return;
    }

    if (snap.from === "header" && isInitStage) {
      const gm = heroMascotRef.current;
      const gt = heroTextRef.current;
      if (!canAnimate(gm) || !canAnimate(gt)) return;

      const lastM = gm.getBoundingClientRect();
      const lastT = gt.getBoundingClientRect();
      if (lastM.width <= 0 || lastT.width <= 0) return;

      const dxM =
        snap.mascot.left +
        snap.mascot.width / 2 -
        (lastM.left + lastM.width / 2);
      const dyM =
        snap.mascot.top +
        snap.mascot.height / 2 -
        (lastM.top + lastM.height / 2);
      const scaleM = snap.mascot.width / lastM.width;

      const dxT =
        snap.text.left + snap.text.width / 2 - (lastT.left + lastT.width / 2);
      const dyT =
        snap.text.top + snap.text.height / 2 - (lastT.top + lastT.height / 2);

      gm.animate(
        [
          { transform: `translate(${dxM}px, ${dyM}px) scale(${scaleM})` },
          { transform: "translate(0, 0) scale(1)" },
        ],
        SYNC_TIMING
      );

      gt.animate(
        [
          {
            transform: `translate(${dxT}px, ${dyT * 0.72}px) scale(0.84)`,
            opacity: 0.9,
          },
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
        ],
        SYNC_TIMING
      );

      if (canAnimate(heroChipsRef.current)) {
        heroChipsRef.current.animate(
          [
            { transform: "translateY(8px)", opacity: 0.35 },
            { transform: "translateY(0)", opacity: 1 },
          ],
          SYNC_TIMING
        );
      }
    }
  }, [isInitStage, scrollRef]);

  return {
    headerMascotRef,
    headerTextRef,
    heroMascotRef,
    heroTextRef,
    heroChipsRef,
    captureBeforeSend,
    captureBeforeReset,
  };
}
