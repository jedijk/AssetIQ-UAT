import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * AutoFitScale
 * ------------
 * Wraps a single child and dynamically scales it (CSS transform) so it
 * always fits inside the available container width/height.
 *
 * - Never scales the child UP (max scale is 1).
 * - Honours a `minScale` floor to avoid the content becoming unreadable.
 * - Reacts to container resize via ResizeObserver and to window resize.
 * - Uses `transform-origin: center` so the child stays visually centered.
 *
 * The wrapper itself is a flex centered container that fills its parent;
 * therefore the parent must give it a deterministic width and height
 * (e.g. `h-full w-full` on a `flex-1 min-h-0` ancestor).
 */
export default function AutoFitScale({
  children,
  minScale = 0.4,
  maxScale = 1,
  className = "",
}) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const [scale, setScale] = useState(1);

  // Use layout effect so the scale is computed before paint when possible.
  useLayoutEffect(() => {
    let cancelled = false;

    const compute = () => {
      if (cancelled) return;
      const container = containerRef.current;
      const content = contentRef.current;
      if (!container || !content) return;

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      // offsetWidth/Height ignore CSS transforms so we always measure the
      // intrinsic (unscaled) size of the content.
      const tw = content.offsetWidth;
      const th = content.offsetHeight;

      if (cw === 0 || ch === 0 || tw === 0 || th === 0) return;

      const next = Math.max(
        minScale,
        Math.min(maxScale, Math.min(cw / tw, ch / th))
      );
      setScale((prev) => (Math.abs(prev - next) > 0.005 ? next : prev));
    };

    compute();

    // Multiple deferred recomputations cover edge cases where children mount
    // sub-elements asynchronously (typewriter, AI badge appearing, etc.).
    const raf = requestAnimationFrame(compute);
    const t1 = setTimeout(compute, 120);
    const t2 = setTimeout(compute, 320);
    const t3 = setTimeout(compute, 720);
    const t4 = setTimeout(compute, 1400);

    const ro = new ResizeObserver(compute);
    if (containerRef.current) ro.observe(containerRef.current);
    if (contentRef.current) ro.observe(contentRef.current);

    const onResize = () => compute();
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [children, minScale, maxScale]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex items-center justify-center ${className}`}
    >
      <div
        ref={contentRef}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          willChange: "transform",
          // inline-block so the wrapper takes the intrinsic size of its
          // children (rather than being stretched by the flex parent).
          // This lets AutoFitScale measure the true unscaled width/height
          // and shrink it via CSS transform when the viewport is small.
          display: "inline-block",
        }}
      >
        {children}
      </div>
    </div>
  );
}
