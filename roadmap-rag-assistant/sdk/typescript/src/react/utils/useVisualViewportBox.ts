import React, { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';

/**
 * On phones the on-screen keyboard shrinks the visual viewport but not the layout viewport,
 * so a full-height panel keeps its composer under the keyboard. This follows the visual
 * viewport and returns the box the panel should occupy; undefined means "use the CSS default"
 * (desktop, or browsers without visualViewport).
 */
export function useVisualViewportBox(enabled: boolean): React.CSSProperties | undefined {
  const [box, setBox] = useState<React.CSSProperties | undefined>(undefined);

  useEffect(() => {
    if (typeof window === 'undefined' || !enabled) {
      setBox(undefined);
      return;
    }
    const vv = window.visualViewport;
    if (!vv || !window.matchMedia(MOBILE_QUERY).matches) {
      setBox(undefined);
      return;
    }
    // Closing the keyboard (Back) fires resize and scroll many times a frame. Coalesce them into one
    // read per frame, and set state only when the box really changed, so the panel does not re-render
    // and jump on every event.
    let frame = 0;
    const apply = () => {
      frame = 0;
      const next = { height: vv.height, top: vv.offsetTop };
      setBox((prev) => (prev && prev.height === next.height && prev.top === next.top ? prev : next));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(apply);
    };
    apply();
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
    };
  }, [enabled]);

  return box;
}
