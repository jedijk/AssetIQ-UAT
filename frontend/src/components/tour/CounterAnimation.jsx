import React, { useEffect, useRef, useState } from "react";

/**
 * Animates an integer counter from `from` to `to` over `durationMs`.
 */
export default function CounterAnimation({
  from = 0,
  to = 100,
  durationMs = 1400,
  delayMs = 0,
  prefix = "",
  suffix = "",
  className = "",
}) {
  const [value, setValue] = useState(from);
  const rafRef = useRef(null);
  const startedRef = useRef(false);

  useEffect(() => {
    startedRef.current = false;
    setValue(from);

    const start = setTimeout(() => {
      startedRef.current = true;
      const t0 = performance.now();
      const tick = (now) => {
        const elapsed = now - t0;
        const progress = Math.min(1, elapsed / Math.max(durationMs, 1));
        // easeOutCubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const next = Math.round(from + (to - from) * eased);
        setValue(next);
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    }, delayMs);

    return () => {
      clearTimeout(start);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [from, to, durationMs, delayMs]);

  return (
    <span className={className}>
      {prefix}
      {value.toLocaleString()}
      {suffix}
    </span>
  );
}
