import React, { useEffect, useState, useRef } from "react";

/**
 * Typewriter animation. Renders `text` character-by-character.
 * Resets when the `text` prop changes.
 */
export default function TypewriterText({
  text,
  speedMs = 28,
  startDelayMs = 200,
  cursor = true,
  onComplete,
  className = "",
}) {
  const [shown, setShown] = useState("");
  const [done, setDone] = useState(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!text) {
      setShown("");
      setDone(false);
      return undefined;
    }
    setShown("");
    setDone(false);

    let cancelled = false;
    let i = 0;
    const tick = () => {
      if (cancelled) return;
      i += 1;
      setShown(text.slice(0, i));
      if (i < text.length) {
        setTimeout(tick, speedMs);
      } else {
        setDone(true);
        if (onCompleteRef.current) onCompleteRef.current();
      }
    };
    const start = setTimeout(tick, startDelayMs);
    return () => {
      cancelled = true;
      clearTimeout(start);
    };
  }, [text, speedMs, startDelayMs]);

  return (
    <span className={className}>
      {shown}
      {cursor && !done && (
        <span
          aria-hidden="true"
          className="inline-block w-[2px] h-[1em] align-middle ml-[2px] bg-current animate-pulse"
        />
      )}
    </span>
  );
}
