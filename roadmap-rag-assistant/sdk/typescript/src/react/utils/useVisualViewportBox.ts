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
    const update = () => setBox({ height: vv.height, top: vv.offsetTop });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return box;
}
