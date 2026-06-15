import React from "react";
import { Virtuoso } from "react-virtuoso";
import { isTouchMobileDevice } from "../../lib/deviceUtils";

/**
 * Small wrapper to standardize list virtualization defaults.
 * Keeps DOM light on mobile to improve scroll smoothness.
 * Skips react-virtuoso on touch mobile (iOS/Android) where DOM churn causes removeChild crashes.
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
  const touchMobile = isTouchMobileDevice();
  const shouldVirtualize =
    disableVirtualization === true ? false : !touchMobile && hasResizeObserver();

  const safeData = Array.isArray(data) ? data : [];

  const scrollClassName = className ? `${className} overflow-y-auto` : "overflow-y-auto";

  const fallback = (
    <div className={scrollClassName}>
      {safeData.map((item, idx) => (
        <React.Fragment key={item?.id ?? item?._id ?? idx}>
          {itemContent(idx, item)}
        </React.Fragment>
      ))}
    </div>
  );

  if (!shouldVirtualize) {
    return fallback;
  }

  // react-virtuoso: passing optional props as explicit `undefined` breaks internal state
  // (e.g. accessing components.EmptyPlaceholder). Omit unset props instead.
  // See https://github.com/petyosi/react-virtuoso/issues/777
  const virtuosoProps = {
    data: safeData,
    itemContent,
    overscan,
    increaseViewportBy,
    ...(components != null ? { components } : {}),
  };

  return (
    <VirtuosoErrorBoundary fallback={fallback}>
      <div className={scrollClassName}>
        <Virtuoso {...virtuosoProps} />
      </div>
    </VirtuosoErrorBoundary>
  );
}

