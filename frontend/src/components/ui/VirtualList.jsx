import React from "react";
import { Virtuoso } from "react-virtuoso";

/**
 * Small wrapper to standardize list virtualization defaults.
 * Keeps DOM light on mobile to improve scroll smoothness.
 */
class VirtuosoErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error) {
    try {
      // eslint-disable-next-line no-console
      console.error("[VirtualList] Virtuoso crashed, falling back.", error);
    } catch (_e) {}
  }
  render() {
    if (this.state.hasError) return this.props.fallback || null;
    return this.props.children;
  }
}

function isIOSLikeDevice() {
  try {
    const ua = typeof navigator !== "undefined" ? (navigator.userAgent || "") : "";
    return /iPhone|iPad|iPod/i.test(ua) || (ua.includes("Mac") && typeof document !== "undefined" && "ontouchend" in document);
  } catch (_e) {
    return false;
  }
}

/** Virtuoso depends on ResizeObserver; many older WebViews lack it or mis-report size → blank list / crashes. */
function hasResizeObserver() {
  return typeof ResizeObserver !== "undefined";
}

export function VirtualList({
  data,
  itemContent,
  className = "",
  overscan = 200,
  increaseViewportBy = 400,
  components,
  disableVirtualization, // optional explicit override
}) {
  const iOSLike = isIOSLikeDevice();
  const shouldVirtualize =
    disableVirtualization === true ? false : !iOSLike && hasResizeObserver();

  const fallback = (
    <div className={className}>
      {(Array.isArray(data) ? data : []).map((item, idx) => (
        <React.Fragment key={item?.id ?? item?._id ?? idx}>
          {itemContent(idx, item)}
        </React.Fragment>
      ))}
    </div>
  );

  if (!shouldVirtualize) {
    return fallback;
  }

  return (
    <VirtuosoErrorBoundary fallback={fallback}>
      <div className={className}>
        <Virtuoso
          data={data}
          itemContent={itemContent}
          overscan={overscan}
          increaseViewportBy={increaseViewportBy}
          components={components}
        />
      </div>
    </VirtuosoErrorBoundary>
  );
}

