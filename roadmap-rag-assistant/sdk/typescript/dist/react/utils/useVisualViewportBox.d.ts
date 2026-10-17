import React from 'react';
/**
 * On phones the on-screen keyboard shrinks the visual viewport but not the layout viewport,
 * so a full-height panel keeps its composer under the keyboard. This follows the visual
 * viewport and returns the box the panel should occupy; undefined means "use the CSS default"
 * (desktop, or browsers without visualViewport).
 */
export declare function useVisualViewportBox(enabled: boolean): React.CSSProperties | undefined;
