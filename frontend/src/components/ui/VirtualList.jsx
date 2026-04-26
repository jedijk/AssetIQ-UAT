import React from "react";
import { Virtuoso } from "react-virtuoso";

/**
 * Small wrapper to standardize list virtualization defaults.
 * Keeps DOM light on mobile to improve scroll smoothness.
 */
export function VirtualList({
  data,
  itemContent,
  className = "",
  overscan = 200,
  increaseViewportBy = 400,
  components,
}) {
  return (
    <div className={className}>
      <Virtuoso
        data={data}
        itemContent={itemContent}
        overscan={overscan}
        increaseViewportBy={increaseViewportBy}
        components={components}
      />
    </div>
  );
}

