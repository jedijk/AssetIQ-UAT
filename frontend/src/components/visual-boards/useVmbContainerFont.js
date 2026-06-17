import { useEffect, useState } from "react";

/**
 * Scale chart tick labels from the widget card's rendered size.
 */
export function useVmbContainerFont(containerRef, { min = 8, max = 14, ratio = 0.09 } = {}) {
  const [fontSize, setFontSize] = useState(min);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      const edge = Math.min(width, height);
      setFontSize(Math.max(min, Math.min(max, Math.round(edge * ratio))));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, min, max, ratio]);

  return fontSize;
}
